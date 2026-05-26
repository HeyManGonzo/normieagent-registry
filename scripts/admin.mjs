#!/usr/bin/env node
/**
 * Manual registry admin CLI.
 *
 *   node scripts/admin.mjs add  --name uxje --normie-id 2359 \
 *                               --owner 0xabc... --target https://bannerite.com \
 *                               --email owner@example.com
 *   node scripts/admin.mjs list
 *   node scripts/admin.mjs remove --name uxje
 *   node scripts/admin.mjs hide   --name uxje                  # exclude from /directory
 *   node scripts/admin.mjs show   --name uxje                  # re-include in /directory
 *   node scripts/admin.mjs resend-verification --name uxje     # send a fresh verify link
 *
 * Add `--hidden` to `add` to register a row that does not appear in the
 * public /directory listing (e.g. operator-owned synthetics).
 *
 * Add `--no-send` to `add` to upsert the row without (re)sending a
 * verification email — useful when you're only changing target_url etc.
 *
 * Add `--remote` to operate against the deployed D1 + KV instead of the
 * local `.wrangler/state` SQLite + KV used by `wrangler dev`. Verification
 * emails are dispatched via the Resend HTTP API regardless of --remote;
 * RESEND_API_KEY is read from workers/api/.dev.vars or process.env.
 *
 * Wraps `wrangler d1 execute` and `wrangler kv key …` so the SQL and KV
 * shape stay in one place. All wrangler invocations run from `workers/api`
 * so they pick up that worker's bindings.
 */
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(REPO_ROOT, "workers", "api");
const PERSIST_TO = path.join("..", "..", ".wrangler", "state");
const IS_WIN = process.platform === "win32";

// Sender address. The domain registered at Resend is the apex
// `normieagent.com`; Resend places SPF + bounce MX on the `send.` subdomain
// (envelope/MAIL FROM) and DKIM on `resend._domainkey.normieagent.com`, but
// the From header itself can be any address on the apex.
const RESEND_FROM = "Normieagent Registry <noreply@normieagent.com>";
const REGISTRY_BASE_URL = "https://registry.normieagent.com";

/** Canonical subdomain label. Mirrors packages/shared/src/agent-name.ts. */
function normaliseAgentName(raw) {
  if (typeof raw !== "string") return null;
  const out = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out.length === 0 || out.length > 63 ? null : out;
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/**
 * Wrap an argument so it survives cmd.exe parsing intact. cmd.exe treats
 * `&`, `|`, `<`, `>`, `^`, spaces and `;` specially unless inside double
 * quotes — and double quotes are escaped by doubling them.
 */
function quoteWin(arg) {
  return `"${String(arg).replace(/"/g, '""')}"`;
}

function wrangler(args) {
  let result;
  if (IS_WIN) {
    // shell:true is required to invoke pnpm.cmd. Build the command line
    // ourselves so each arg is double-quoted and special chars survive.
    const cmdline = ["pnpm", "exec", "wrangler", ...args].map(quoteWin).join(" ");
    result = spawnSync(cmdline, [], { cwd: API_DIR, stdio: "inherit", shell: true });
  } else {
    result = spawnSync("pnpm", ["exec", "wrangler", ...args], { cwd: API_DIR, stdio: "inherit" });
  }
  if (result.status !== 0) {
    die(`wrangler ${args.join(" ")} exited with code ${result.status}`);
  }
}

function d1Execute(sql, remote) {
  const scope = remote ? ["--remote"] : ["--local", `--persist-to=${PERSIST_TO}`];
  // Write SQL to a temp file so the command line stays free of quoting hazards.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "normieagent-admin-"));
  const sqlFile = path.join(tmpDir, "stmt.sql");
  writeFileSync(sqlFile, sql, "utf8");
  try {
    wrangler(["d1", "execute", "normieagent", ...scope, "--yes", `--file=${sqlFile}`]);
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function kvPut(key, value, remote) {
  const scope = remote ? ["--remote"] : ["--local", `--persist-to=${PERSIST_TO}`];
  wrangler(["kv", "key", "put", "--binding=AGENT_ROUTES_KV", ...scope, key, value]);
}

function kvDelete(key, remote) {
  const scope = remote ? ["--remote"] : ["--local", `--persist-to=${PERSIST_TO}`];
  wrangler(["kv", "key", "delete", "--binding=AGENT_ROUTES_KV", ...scope, key]);
}

/**
 * Lightweight loader for workers/api/.dev.vars (KEY=value, one per line,
 * blank lines and `#` comments allowed). Avoids pulling in a dotenv dep.
 */
function loadDevVars() {
  const file = path.join(API_DIR, ".dev.vars");
  if (!existsSync(file)) return {};
  const out = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY ?? loadDevVars().RESEND_API_KEY;
  if (!key) die("RESEND_API_KEY is not set (workers/api/.dev.vars or env)");
  return key;
}

/** Practical email shape check — not RFC-perfect, but rejects obvious typos. */
function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

/**
 * Run a `wrangler d1 execute --json` and parse the first result set.
 * Returns an array of row objects (possibly empty). Bypasses stdio:inherit
 * by capturing stdout so we can read SELECTs from the CLI.
 */
function d1Query(sql, remote) {
  const scope = remote ? ["--remote"] : ["--local", `--persist-to=${PERSIST_TO}`];
  // IMPORTANT: must use --command (not --file). Wrangler's --file path runs
  // the SQL as an *import* and returns upload statistics
  // (`Total queries executed`, `Rows read`, …) instead of the row data —
  // SELECTs silently produce no usable output. --command runs it as a query
  // and returns the actual row set under `results`.
  const args = ["pnpm", "exec", "wrangler", "d1", "execute", "normieagent",
                ...scope, "--yes", "--json", "--command", sql];
  let result;
  if (IS_WIN) {
    const cmdline = args.map(quoteWin).join(" ");
    result = spawnSync(cmdline, [], { cwd: API_DIR, shell: true, encoding: "utf8" });
  } else {
    result = spawnSync(args[0], args.slice(1), { cwd: API_DIR, encoding: "utf8" });
  }
  if (result.status !== 0) {
    die(`d1 query failed: ${result.stderr || result.stdout}`);
  }
  // wrangler may print a small banner ("⛅️ wrangler …", "Resource location: …")
  // before the JSON array on stdout. Locate the first line that is exactly
  // "[" (the start of the pretty-printed JSON) and parse from there. This is
  // unambiguous because `[WARNING]` style banners never appear on their own.
  const text = result.stdout ?? "";
  const lines = text.split(/\r?\n/);
  const startLine = lines.findIndex((l) => l.trim() === "[");
  if (startLine < 0) return [];
  const json = lines.slice(startLine).join("\n");
  try {
    const parsed = JSON.parse(json);
    return parsed[0]?.results ?? [];
  } catch {
    return [];
  }
}

async function sendVerificationEmail({ to, agentName, token }) {
  const subdomain = `${agentName}.normieagent.com`;
  const verifyUrl = `${REGISTRY_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = `Verify your email for ${subdomain}`;
  const text = [
    `Hi,`,
    ``,
    `You're listed as the contact for ${subdomain} on the Normieagent`,
    `Subdomain Registry. Please confirm this email address so we can reach`,
    `you if anything happens with your subdomain.`,
    ``,
    `Verify your email:`,
    `${verifyUrl}`,
    ``,
    `This link is single-use and expires in 7 days. If you didn't expect this`,
    `email, you can ignore it — nothing will change.`,
    ``,
    `— Normieagent Registry`,
    `   ${REGISTRY_BASE_URL}`,
  ].join("\n");
  const html = renderVerificationHtml({ subdomain, verifyUrl });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getResendApiKey()}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text }),
  });
  const body = await res.text();
  if (!res.ok) die(`Resend send failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  let id = "";
  try { id = (JSON.parse(body).id ?? ""); } catch {}
  return id;
}

function renderVerificationHtml({ subdomain, verifyUrl }) {
  const safeSub = String(subdomain).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const safeUrl = String(verifyUrl).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0e0e10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7e7ea;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e10;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#16161a;border:1px solid #26262c;"><tr><td style="padding:32px 32px 16px 32px;"><div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.18em;color:#8a8a93;">NORMIEAGENT · REGISTRY</div><h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#fafafa;">Verify your email for <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;color:#fafafa;">${safeSub}</code></h1></td></tr><tr><td style="padding:0 32px 8px 32px;font-size:15px;line-height:1.6;color:#c5c5cc;"><p style="margin:0 0 16px 0;">You're listed as the contact for <strong style="color:#fafafa;">${safeSub}</strong> on the Normieagent Subdomain Registry. Confirm this email so we can reach you if anything happens with your subdomain.</p></td></tr><tr><td align="center" style="padding:16px 32px 8px 32px;"><a href="${safeUrl}" style="display:inline-block;background:#fafafa;color:#0e0e10;padding:12px 24px;font-weight:600;text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;letter-spacing:0.02em;">VERIFY EMAIL &rarr;</a></td></tr><tr><td style="padding:8px 32px 24px 32px;font-size:13px;line-height:1.6;color:#8a8a93;"><p style="margin:0 0 8px 0;">Or paste this URL into your browser:</p><p style="margin:0;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#c5c5cc;">${safeUrl}</p></td></tr><tr><td style="padding:16px 32px 32px 32px;border-top:1px solid #26262c;font-size:12px;line-height:1.6;color:#6e6e76;">Single-use link, expires in 7 days. If you didn't expect this email, you can safely ignore it &mdash; nothing will change.</td></tr></table></td></tr></table></body></html>`;
}

async function cmdAdd(args) {
  const { values } = parseArgs({
    args, options: {
      name:          { type: "string" },
      "normie-id":   { type: "string" },
      owner:         { type: "string" },
      target:        { type: "string" },
      email:         { type: "string" },
      description:   { type: "string" },
      hidden:        { type: "boolean", default: false },
      "no-send":     { type: "boolean", default: false },
      remote:        { type: "boolean", default: false },
    }, strict: true,
  });
  const name = normaliseAgentName(values.name ?? "");
  const normieId = Number.parseInt(values["normie-id"] ?? "", 10);
  const owner = (values.owner ?? "").toLowerCase();
  const target = values.target ?? "";
  const email = (values.email ?? "").trim();
  const listed = values.hidden ? 0 : 1;
  const description = (values.description ?? "").trim().slice(0, 200) || null;

  if (!name) die("--name is required and must produce a valid DNS label");
  if (!Number.isFinite(normieId) || normieId <= 0) die("--normie-id must be a positive integer");
  if (!/^0x[0-9a-f]{40}$/.test(owner)) die("--owner must be a 0x-prefixed 40-hex address");
  if (!/^https?:\/\/\S+$/i.test(target)) die("--target must be an http(s) URL");
  if (!isValidEmail(email)) die("--email is required and must be a valid email address");

  // Inspect existing row so we know whether to (re)send a verification link
  // and whether to keep an existing verification intact.
  const existing = d1Query(
    `SELECT contact_email, email_verified_at FROM agent_routes WHERE agent_name = '${name}' LIMIT 1;`,
    values.remote,
  )[0];
  const emailChanged = !existing || (existing.contact_email ?? "") !== email;
  const alreadyVerified = !emailChanged && existing && existing.email_verified_at != null;
  const willSend = !values["no-send"] && !alreadyVerified;

  const token = willSend ? randomBytes(32).toString("hex") : null;
  const now = Math.floor(Date.now() / 1000);
  const esc = (v) => String(v).replace(/'/g, "''");

  // When the email is unchanged and already verified we leave verification
  // fields alone; otherwise reset them. Tokens are written here pre-send so a
  // failed Resend call leaves a recoverable row (re-running add retries).
  const verifiedAtSql = emailChanged ? "NULL" : "email_verified_at";
  const tokenSql      = token ? `'${token}'` : "NULL";
  const sentAtSql     = token ? `${now}`     : (emailChanged ? "NULL" : "email_verification_sent_at");

  const descriptionSql = description ? `'${esc(description)}'` : "NULL";
  const sql = `
    INSERT INTO agent_routes (
      agent_name, normie_id, owner_wallet, target_url, description, active, directory_listed,
      contact_email, email_verified_at, email_verification_token, email_verification_sent_at,
      registered_at, updated_at
    )
    VALUES (
      '${name}', ${normieId}, '${owner}', '${esc(target)}', ${descriptionSql}, 1, ${listed},
      '${esc(email)}', NULL, ${token ? `'${token}'` : "NULL"}, ${token ? `${now}` : "NULL"},
      ${now}, ${now}
    )
    ON CONFLICT(agent_name) DO UPDATE SET
      normie_id                  = excluded.normie_id,
      owner_wallet               = excluded.owner_wallet,
      target_url                 = excluded.target_url,
      description                = excluded.description,
      active                     = 1,
      contact_email              = excluded.contact_email,
      email_verified_at          = ${verifiedAtSql},
      email_verification_token   = ${tokenSql},
      email_verification_sent_at = ${sentAtSql},
      updated_at                 = ${now};
  `.replace(/\s+/g, " ").trim();

  console.log(`→ Upserting ${name} (#${normieId}) → ${target}${values.hidden ? " [hidden from /directory]" : ""}`);
  d1Execute(sql, values.remote);
  console.log(`→ Warming KV cache at agent:${name}`);
  kvPut(`agent:${name}`, target, values.remote);

  if (token) {
    console.log(`→ Sending verification email to ${email}`);
    const id = await sendVerificationEmail({ to: email, agentName: name, token });
    console.log(`✓ Email queued (Resend id: ${id || "<none>"})`);
  } else if (alreadyVerified) {
    console.log(`✓ Email ${email} already verified — skipping send`);
  } else {
    console.log(`✓ --no-send: skipped verification email`);
  }
  console.log(`✓ Done. ${name}.normieagent.com now routes to ${target}`);
}

/**
 * Claim verification email — links to /verify-claim (not /verify-email).
 * Mirrors the HTML template in workers/api/src/email.ts exactly.
 */
async function sendClaimVerificationEmail({ to, agentName, token }) {
  const subdomain = `${agentName}.normieagent.com`;
  const verifyUrl = `${REGISTRY_BASE_URL}/verify-claim?token=${encodeURIComponent(token)}`;
  const subject = `Verify your email to claim ${subdomain}`;
  const text = [
    "Hi,",
    "",
    `You just submitted a claim for ${subdomain} on the Normieagent`,
    "Subdomain Registry. Confirm this email address to unlock the payment",
    "instructions and finish your registration.",
    "",
    "Verify your email:",
    verifyUrl,
    "",
    "This link is single-use and expires in 24 hours. If you didn't expect",
    "this email, you can ignore it — no payment instructions are issued and",
    "no record will be kept.",
    "",
    "— Normieagent Registry",
    `   ${REGISTRY_BASE_URL}`,
  ].join("\n");
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const safeSub = esc(subdomain);
  const safeUrl = esc(verifyUrl);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0e0e10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7e7ea;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e10;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#16161a;border:1px solid #26262c;"><tr><td style="padding:32px 32px 16px 32px;"><div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.18em;color:#8a8a93;">NORMIEAGENT · REGISTRY</div><h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#fafafa;">Verify your email to claim <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;color:#fafafa;">${safeSub}</code></h1></td></tr><tr><td style="padding:0 32px 8px 32px;font-size:15px;line-height:1.6;color:#c5c5cc;"><p style="margin:0 0 16px 0;">You just submitted a claim for <strong style="color:#fafafa;">${safeSub}</strong>. Confirm this email to unlock the payment instructions and finish your registration.</p></td></tr><tr><td align="center" style="padding:16px 32px 8px 32px;"><a href="${safeUrl}" style="display:inline-block;background:#fafafa;color:#0e0e10;padding:12px 24px;font-weight:600;text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;letter-spacing:0.02em;">VERIFY EMAIL &rarr;</a></td></tr><tr><td style="padding:8px 32px 24px 32px;font-size:13px;line-height:1.6;color:#8a8a93;"><p style="margin:0 0 8px 0;">Or paste this URL into your browser:</p><p style="margin:0;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#c5c5cc;">${safeUrl}</p></td></tr><tr><td style="padding:16px 32px 32px 32px;border-top:1px solid #26262c;font-size:12px;line-height:1.6;color:#6e6e76;">Single-use link, expires in 24 hours. If you didn't expect this email, you can safely ignore it — no payment instructions will be issued and no record will be kept.</td></tr></table></td></tr></table></body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getResendApiKey()}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text }),
  });
  const body = await res.text();
  if (!res.ok) die(`Resend send failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  let id = "";
  try { id = (JSON.parse(body).id ?? ""); } catch {}
  return id;
}

/**
 * list-claims — show pending_claims rows, defaulting to non-terminal only.
 */
function cmdListClaims(args) {
  const { values } = parseArgs({
    args, options: {
      all:    { type: "boolean", default: false },
      remote: { type: "boolean", default: false },
    }, strict: true,
  });
  const where = values.all
    ? ""
    : `WHERE status IN ('awaiting_email', 'awaiting_payment')`;
  d1Execute(
    `SELECT id, agent_name, normie_id, from_wallet, contact_email, status,
            amount_wei, tx_hash, expires_at, created_at, updated_at
       FROM pending_claims
       ${where}
       ORDER BY created_at DESC;`,
    values.remote,
  );
}

/**
 * resend-claim-verification --id <claimId>
 *
 * Generates a fresh token and re-sends the claim verification email. Only
 * valid for claims in 'awaiting_email' status — if the email is already
 * verified there is nothing to resend (the cron is watching for the payment).
 */
async function cmdResendClaimVerification(args) {
  const { values } = parseArgs({
    args, options: {
      id:     { type: "string" },
      remote: { type: "boolean", default: false },
    }, strict: true,
  });
  const id = Number.parseInt(values.id ?? "", 10);
  if (!Number.isFinite(id) || id <= 0) die("--id must be a positive integer (use list-claims to find it)");

  const rows = d1Query(
    `SELECT id, agent_name, contact_email, status, expires_at
       FROM pending_claims
      WHERE id = ${id}
      LIMIT 1;`,
    values.remote,
  );
  const row = rows[0];
  if (!row) die(`No pending claim with id=${id}`);

  if (row.status !== "awaiting_email") {
    if (row.status === "awaiting_payment") {
      die(`Claim ${id} is already in 'awaiting_payment' — email is verified. The cron is watching for the ETH deposit.`);
    }
    die(`Claim ${id} has terminal status '${row.status}' — nothing to resend.`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at <= now) {
    die(`Claim ${id} has expired (at ${new Date(row.expires_at * 1000).toISOString()}). Ask the user to submit a new claim.`);
  }

  const token = randomBytes(32).toString("hex");
  d1Execute(
    `UPDATE pending_claims
        SET email_verification_token   = '${token}',
            email_verification_sent_at = ${now},
            updated_at                 = ${now}
      WHERE id = ${id};`.replace(/\s+/g, " ").trim(),
    values.remote,
  );
  console.log(`→ Sending claim verification email to ${row.contact_email}`);
  const emailId = await sendClaimVerificationEmail({
    to: row.contact_email,
    agentName: row.agent_name,
    token,
  });
  console.log(`✓ Email queued (Resend id: ${emailId || "<none>"})`);
  console.log(`✓ Claim ${id} (${row.agent_name}) — fresh verify link sent. Expires at ${new Date(row.expires_at * 1000).toISOString()}.`);
}

async function cmdResendVerification(args) {
  const { values } = parseArgs({
    args, options: {
      name:   { type: "string" },
      remote: { type: "boolean", default: false },
    }, strict: true,
  });
  const name = normaliseAgentName(values.name ?? "");
  if (!name) die("--name is required");

  const row = d1Query(
    `SELECT contact_email, email_verified_at FROM agent_routes WHERE agent_name = '${name}' LIMIT 1;`,
    values.remote,
  )[0];
  if (!row) die(`No row for ${name} — run 'add' first`);
  if (!row.contact_email) die(`No contact_email on ${name} — re-run 'add' with --email`);
  if (row.email_verified_at != null) {
    die(`${name} is already verified (at ${new Date(row.email_verified_at * 1000).toISOString()}). ` +
        `Use 'add --email <new>' to change the address.`);
  }

  const token = randomBytes(32).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  d1Execute(
    `UPDATE agent_routes
        SET email_verification_token   = '${token}',
            email_verification_sent_at = ${now},
            updated_at                 = ${now}
      WHERE agent_name                 = '${name}';`.replace(/\s+/g, " ").trim(),
    values.remote,
  );
  console.log(`→ Sending verification email to ${row.contact_email}`);
  const id = await sendVerificationEmail({ to: row.contact_email, agentName: name, token });
  console.log(`✓ Email queued (Resend id: ${id || "<none>"})`);
}

function cmdSetListed(args, listed) {
  const { values } = parseArgs({
    args, options: {
      name:   { type: "string" },
      remote: { type: "boolean", default: false },
    }, strict: true,
  });
  const name = normaliseAgentName(values.name ?? "");
  if (!name) die("--name is required");
  const now = Math.floor(Date.now() / 1000);
  d1Execute(
    `UPDATE agent_routes SET directory_listed = ${listed}, updated_at = ${now} WHERE agent_name = '${name}';`,
    values.remote,
  );
  console.log(`✓ ${name}.normieagent.com is now ${listed === 1 ? "listed in" : "hidden from"} /directory`);
}

function cmdList(args) {
  const { values } = parseArgs({
    args, options: { remote: { type: "boolean", default: false } }, strict: true,
  });
  d1Execute(
    "SELECT agent_name, normie_id, owner_wallet, target_url, active, directory_listed, contact_email, email_verified_at, updated_at FROM agent_routes ORDER BY updated_at DESC;",
    values.remote,
  );
}

function cmdRemove(args) {
  const { values } = parseArgs({
    args, options: {
      name:   { type: "string" },
      remote: { type: "boolean", default: false },
    }, strict: true,
  });
  const name = normaliseAgentName(values.name ?? "");
  if (!name) die("--name is required");
  const now = Math.floor(Date.now() / 1000);
  d1Execute(
    `UPDATE agent_routes SET active = 0, updated_at = ${now} WHERE agent_name = '${name}';`,
    values.remote,
  );
  kvDelete(`agent:${name}`, values.remote);
  console.log(`✓ Deactivated ${name}.normieagent.com`);
}

/**
 * update-description --name <agentName> --description <text>
 *
 * Sets or clears the public description for an existing agent_routes row.
 * Pass --description "" to clear it.
 */
function cmdUpdateDescription(args) {
  const { values } = parseArgs({
    args, options: {
      name:        { type: "string" },
      description: { type: "string" },
      remote:      { type: "boolean", default: false },
    }, strict: true,
  });
  const name = normaliseAgentName(values.name ?? "");
  if (!name) die("--name is required");
  if (values.description === undefined) die("--description is required (pass empty string to clear)");

  const desc = values.description.trim().slice(0, 200);
  const esc = (v) => String(v).replace(/'/g, "''");
  const descSql = desc ? `'${esc(desc)}'` : "NULL";
  const now = Math.floor(Date.now() / 1000);

  d1Execute(
    `UPDATE agent_routes
        SET description = ${descSql}, updated_at = ${now}
      WHERE agent_name = '${name}';`,
    values.remote,
  );
  console.log(desc
    ? `✓ Description set for ${name}.normieagent.com`
    : `✓ Description cleared for ${name}.normieagent.com`);
}

const [, , sub, ...rest] = process.argv;
const run = async () => {
  switch (sub) {
    case "add":                        await cmdAdd(rest); break;
    case "list":                       cmdList(rest); break;
    case "remove":                     cmdRemove(rest); break;
    case "hide":                       cmdSetListed(rest, 0); break;
    case "show":                       cmdSetListed(rest, 1); break;
    case "update-description":         cmdUpdateDescription(rest); break;
    case "resend-verification":        await cmdResendVerification(rest); break;
    case "list-claims":                cmdListClaims(rest); break;
    case "resend-claim-verification":  await cmdResendClaimVerification(rest); break;
    default:
      console.log("Usage: pnpm admin <command> [options] [--remote]");
      console.log("");
      console.log("agent_routes commands:");
      console.log("  add    --name <s> --normie-id <n> --owner <0x…> --target <url> --email <e> [--hidden] [--no-send] [--description <s>]");
      console.log("  list");
      console.log("  remove --name <s>");
      console.log("  hide   --name <s>         (exclude from public /directory)");
      console.log("  show   --name <s>         (re-include in public /directory)");
      console.log("  update-description --name <s> --description <text>   (set or clear agent blurb)");
      console.log("  resend-verification --name <s>   (send a fresh verify-email link)");
      console.log("");
      console.log("pending_claims commands:");
      console.log("  list-claims [--all]    (show active claims; --all includes terminal rows)");
      console.log("  resend-claim-verification --id <n>   (re-send a claim verify email)");
      process.exit(sub ? 1 : 0);
  }
};

run().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});

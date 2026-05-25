#!/usr/bin/env node
/**
 * Manual registry admin CLI.
 *
 *   node scripts/admin.mjs add  --name uxje --normie-id 2359 \
 *                               --owner 0xabc... --target https://bannerite.com
 *   node scripts/admin.mjs list
 *   node scripts/admin.mjs remove --name uxje
 *   node scripts/admin.mjs hide   --name uxje   # exclude from /directory
 *   node scripts/admin.mjs show   --name uxje   # re-include in /directory
 *
 * Add `--hidden` to `add` to register a row that does not appear in the
 * public /directory listing (e.g. operator-owned synthetics).
 *
 * Add `--remote` to operate against the deployed D1 + KV instead of the
 * local `.wrangler/state` SQLite + KV used by `wrangler dev`.
 *
 * Wraps `wrangler d1 execute` and `wrangler kv key …` so the SQL and KV
 * shape stay in one place. All wrangler invocations run from `workers/api`
 * so they pick up that worker's bindings.
 */
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(REPO_ROOT, "workers", "api");
const PERSIST_TO = path.join("..", "..", ".wrangler", "state");
const IS_WIN = process.platform === "win32";

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

function cmdAdd(args) {
  const { values } = parseArgs({
    args, options: {
      name:        { type: "string" },
      "normie-id": { type: "string" },
      owner:       { type: "string" },
      target:      { type: "string" },
      hidden:      { type: "boolean", default: false },
      remote:      { type: "boolean", default: false },
    }, strict: true,
  });
  const name = normaliseAgentName(values.name ?? "");
  const normieId = Number.parseInt(values["normie-id"] ?? "", 10);
  const owner = (values.owner ?? "").toLowerCase();
  const target = values.target ?? "";
  const listed = values.hidden ? 0 : 1;

  if (!name) die("--name is required and must produce a valid DNS label");
  if (!Number.isFinite(normieId) || normieId <= 0) die("--normie-id must be a positive integer");
  if (!/^0x[0-9a-f]{40}$/.test(owner)) die("--owner must be a 0x-prefixed 40-hex address");
  if (!/^https?:\/\/\S+$/i.test(target)) die("--target must be an http(s) URL");

  const now = Math.floor(Date.now() / 1000);
  // Upsert: insert, or replace target_url + owner_wallet + updated_at on conflict.
  // directory_listed is only touched on insert; existing rows keep their flag
  // unless explicitly toggled via `hide` / `show`.
  const sql = `
    INSERT INTO agent_routes (agent_name, normie_id, owner_wallet, target_url, active, directory_listed, registered_at, updated_at)
    VALUES ('${name}', ${normieId}, '${owner}', '${target.replace(/'/g, "''")}', 1, ${listed}, ${now}, ${now})
    ON CONFLICT(agent_name) DO UPDATE SET
      normie_id    = excluded.normie_id,
      owner_wallet = excluded.owner_wallet,
      target_url   = excluded.target_url,
      active       = 1,
      updated_at   = ${now};
  `.replace(/\s+/g, " ").trim();

  console.log(`→ Upserting ${name} (#${normieId}) → ${target}${values.hidden ? " [hidden from /directory]" : ""}`);
  d1Execute(sql, values.remote);
  console.log(`→ Warming KV cache at agent:${name}`);
  kvPut(`agent:${name}`, target, values.remote);
  console.log(`✓ Done. ${name}.normieagent.com now routes to ${target}`);
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
    "SELECT agent_name, normie_id, owner_wallet, target_url, active, directory_listed, updated_at FROM agent_routes ORDER BY updated_at DESC;",
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

const [, , sub, ...rest] = process.argv;
switch (sub) {
  case "add":    cmdAdd(rest); break;
  case "list":   cmdList(rest); break;
  case "remove": cmdRemove(rest); break;
  case "hide":   cmdSetListed(rest, 0); break;
  case "show":   cmdSetListed(rest, 1); break;
  default:
    console.log("Usage: pnpm admin <add|list|remove|hide|show> [options] [--remote]");
    console.log("  add    --name <s> --normie-id <n> --owner <0x…> --target <url> [--hidden]");
    console.log("  list");
    console.log("  remove --name <s>");
    console.log("  hide   --name <s>   (exclude from public /directory)");
    console.log("  show   --name <s>   (re-include in public /directory)");
    process.exit(sub ? 1 : 0);
}

# Operations runbook

Day-2 procedures for the live `normieagent.com` registry. Companion to
`README.md` (what / how to dev) and `normieagent-architecture.md` (design).

## Quick reference

Every command below assumes the repo root as the working directory and
`--remote` to operate against production. Drop `--remote` to hit the local
`.wrangler/state` SQLite/KV used by `wrangler dev`.

| I want to… | Command |
|---|---|
| Add a new agent | `pnpm admin add --name <s> --normie-id <n> --owner 0x<…> --target https://<…> --email <e> --remote` |
| Change an existing agent's target URL | same `add` command with the new `--target`, plus `--no-send` (same email = no re-verification needed) |
| Change an agent's contact email | same `add` command with the new `--email` (this *does* trigger a fresh verification send) |
| Take an agent offline | `pnpm admin remove --name <s> --remote` |
| Re-activate an offline agent | re-run the original `add` command |
| Hide an agent from `/directory` | `pnpm admin hide --name <s> --remote` |
| Show a hidden agent on `/directory` | `pnpm admin show --name <s> --remote` |
| Register pre-hidden | add the `--hidden` flag to `add` |
| Re-send a verification email | `pnpm admin resend-verification --name <s> --remote` |
| List every row in D1 | `pnpm admin list --remote` |
| Smoke-test a live route | `curl.exe -sSI https://<s>.normieagent.com/` |

### Worked examples

These are the real commands run during the initial bring-up — adapt the
values, not the structure.

```bash
# Add a new agent (Bash / Git Bash — note the trailing backslashes)
pnpm admin add \
  --name gemel \
  --normie-id 6832 \
  --owner 0xa654eb70d2f33dadbb026371996b03f37af92f78 \
  --target https://normieagent.com \
  --email ramona@normieagent.com \
  --remote

# Re-target an existing, already-verified agent without re-sending an email
pnpm admin add \
  --name seil \
  --normie-id 2601 \
  --owner 0x699c08DbC2D24666449D231A2B7aE77337c00F45 \
  --target https://bannerite.com \
  --email gonzo@me.com \
  --hidden --no-send --remote
```

PowerShell equivalent uses backtick (`` ` ``) for line continuation instead
of backslash:

```powershell
pnpm admin add `
  --name gemel `
  --normie-id 6832 `
  --owner 0xa654eb70d2f33dadbb026371996b03f37af92f78 `
  --target https://normieagent.com `
  --email ramona@normieagent.com `
  --remote
```

If you mix the two, the shell will try to execute `--name` as a command —
that's the symptom of a backslash in PowerShell or a backtick in Bash.

### When does `add` actually email?

| Existing row state | What `add` does about verification |
|---|---|
| No row yet | Generates token, sends email, writes `email_verification_*` to D1. |
| Row exists, *same* email, *unverified* | Generates a fresh token, sends a new email, supersedes the old token. |
| Row exists, *same* email, *already verified* | Skips Resend entirely. `verified_at` is preserved. |
| Row exists, *different* email | Resets `email_verified_at` to NULL, generates token, sends email. |
| Any of the above, with `--no-send` | Never calls Resend, never mutates the verification fields. |

In short: use `--no-send` for cosmetic changes (target URL, normie id typo),
omit it for ownership/identity changes (new contact email).

## Prerequisites

- A local clone with `pnpm install` done.
- Logged in to the Cloudflare account that owns the `normieagent.com` zone:
  ```powershell
  pnpm --filter @normieagent/api exec wrangler whoami
  ```
- `--remote` on every `pnpm admin` call below. Without it the changes hit the
  local `.wrangler/state` SQLite and KV — invisible to production.

## Registration management

All three operations route through `scripts/admin.mjs`, which wraps
`wrangler d1 execute` and `wrangler kv key …` so the SQL/KV shape stays in
one place. The script also writes the KV cache key on `add`, so changes are
live within ~1s globally — no cache-purge step required.

### Add or update a registration

```powershell
pnpm admin add `
  --name <agentname> `
  --normie-id <tokenId> `
  --owner 0x<wallet> `
  --target https://<their-url> `
  --email owner@example.com `
  --remote
```

- `--name` is normalised to a DNS label (lowercase, `[a-z0-9-]`, no leading/
  trailing dash, ≤63 chars). The same input twice is idempotent — the row is
  upserted and the KV cache overwritten.
- `--normie-id` must be a positive integer. Not validated against the
  on-chain owner in manual mode; treat it as a label.
- `--owner` must be `0x` + 40 hex chars. Case-insensitive, stored lowercased.
- `--target` must be `http://` or `https://`. Path/query are taken from the
  incoming request, only the origin is used here.
- `--email` is required. The CLI generates a single-use verification token
  (32 random bytes, hex), persists it to D1, and sends a verification email
  via Resend. Re-running `add` with the same email is idempotent — it skips
  the send if the address is already verified. Re-running with a *different*
  email resets verification and triggers a fresh send.
- Add `--no-send` to upsert a row without (re)sending the verification email
  — useful when you're only fixing a typo in `target_url` or `normie-id`.

### List all registrations

```powershell
pnpm admin list --remote
```

Prints a table from D1 sorted by `updated_at` DESC. `active = 0` rows are
deactivated registrations kept for audit; the dispatch worker ignores them.

### Remove (soft-deactivate) a registration

```powershell
pnpm admin remove --name <agentname> --remote
```

Sets `active = 0` in D1 and deletes the KV key. The next request to
`<agentname>.normieagent.com` returns the friendly fallback page from
`workers/dispatch/src/fallback.ts` (HTTP 404, `Cache-Control: max-age=60`).

To re-activate, just re-run `pnpm admin add` with the same name.

### Public directory listing (`/directory`)

Active rows are listed on `https://registry.normieagent.com/directory` by
default. The page is fed by `GET /api/directory` which only returns
`active = 1 AND directory_listed = 1` rows; owner wallet, contact email,
and `target_url` are never exposed in the API response. Each entry
renders as a card with the agent's Normie portrait
(`https://api.normies.art/normie/<id>/image.svg`), the subdomain, and the
Normie #. Clicking the card opens the agent in a new tab — that is the
only way a visitor learns where it points.

Opt a row out (e.g. operator-owned synthetic monitor targets, or on owner
request):

```powershell
pnpm admin hide --name <agentname> --remote
pnpm admin show --name <agentname> --remote
```

Or register a row pre-hidden:

```powershell
pnpm admin add --name <agentname> ... --hidden --remote
```

Edge cache TTL on `/api/directory` is 60s, so toggles propagate within ~1
minute.

### Contact email + verification

Every active registration carries a contact email so the operator has an
out-of-band channel for incident notifications and ownership changes. The
holder confirms the address via a tokenised link delivered through
[Resend](https://resend.com).

Resend API key — set both places (the worker doesn't currently send,
`scripts/admin.mjs` does, but the secret is kept beside the worker's other
secrets so there's a single source):

```powershell
pnpm --filter @normieagent/api exec wrangler secret put RESEND_API_KEY
# and, in workers/api/.dev.vars (gitignored):
#   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
```

Sender domain must be verified at Resend (SPF + DKIM + DMARC on
`normieagent.com`). Without those DNS records, sends from
`noreply@normieagent.com` will hard-fail; fall back to `onboarding@resend.dev`
only for one-off tests.

Resend the verification email (for example, the holder lost the original):

```powershell
pnpm admin resend-verification --name <agentname> --remote
```

This generates a new token, stores it on the row, sends a fresh email, and
invalidates the previous link. Already-verified rows are rejected with an
error — change the email by re-running `add --email <new>` instead.

Token TTL is 7 days from `email_verification_sent_at`. After that, the
worker returns `410 Gone` and the verify page shows an "expired" state with
instructions to ask the operator for a resend.

### Smoke-test after any change

```powershell
curl.exe -sSI https://<agentname>.normieagent.com/
```

Active → `200 OK` with the target's headers. Deactivated → `404 Not Found`
with `Content-Type: text/html; charset=utf-8` and the fallback HTML.

## Monitoring

Observability is already enabled on all three workers via
`[observability] enabled = true` in each `wrangler.toml`. This gives, in the
Cloudflare dashboard under each worker:

- **Logs** — real-time tail of `console.*` output and unhandled exceptions.
  Useful for triaging a specific failed request by `cf-ray`.
- **Metrics** — requests/s, error rate, CPU time, wall-clock duration p50/p99.
- **Invocation breakdown** — per-handler success/error counts.

For ad-hoc tailing from the CLI:

```powershell
pnpm --filter @normieagent/dispatch exec wrangler tail
pnpm --filter @normieagent/api      exec wrangler tail
pnpm --filter @normieagent/cron     exec wrangler tail
```

D1 has its own dashboard view (Workers & Pages → D1 → `normieagent`)
showing query count, latency, and storage. KV is under Workers KV →
`AGENT_ROUTES_KV` with read/write/list metrics.

## Alerting

Cloudflare sends emails on worker / cron / health events when you create
**Notification policies**. None are configured yet — set these up once via
the dashboard at **Manage Account → Notifications → Add**:

| Alert type | Recommended config | Why |
|---|---|---|
| Workers — **Errors** | Scope: all three workers. Threshold: ≥10 errors in 5 min. | Catches dispatch proxy failures, API 5xx spikes, cron crashes. |
| Workers — **CPU time exceeded** | Scope: all workers. | Surfaces accidental hot loops or oversized proxy bodies. |
| Workers — **Scheduled trigger failure** | Scope: `normieagent-cron`. | Cron is the only thing that silently fails — no user traffic surfaces it. |
| D1 — **Database alarm** | Scope: `normieagent`. | Storage / query-limit headroom. |
| Health Checks — **HTTP** | Target: `https://registry.normieagent.com/`. Expect: 200, contains `Normieagent`. Interval: 1 min. | End-to-end synthetic for the SPA + Custom Domain binding. |

Optional second health check on `https://www.normieagent.com/` if you want
the Vercel concierge passthrough monitored from Cloudflare's side too.

## Recovery procedures

**A registration is serving the wrong target.** Re-run `pnpm admin add`
with the correct `--target`. KV is overwritten in the same call, so
propagation is ≤1s globally. No purge needed.

**A registration's target origin is down.** Customer-facing — point it at a
holding page or remove it: `pnpm admin remove --name <n> --remote`.

**The dispatch worker is returning 5xx for a known-good subdomain.** Tail
the worker (`wrangler tail`) and inspect the failing `cf-ray`. Most common
cause is an unreachable `target_url` (returns 502 from `proxyRequest`) —
verify with `curl -I <target_url>` directly.

**Cron stopped invalidating routes after a Normie transfer.** Check the
cursor: `pnpm --filter @normieagent/cron exec wrangler kv key get --binding=AGENT_ROUTES_KV --remote cron:lastBlock`. If it's stuck more than a few hundred blocks behind mainnet, tail the cron worker for RPC errors and confirm `INFURA_API_KEY` is still valid.

**Full D1 restore.** Cloudflare retains automatic D1 backups; restore via
the dashboard (D1 → `normieagent` → Backups → Restore). After restore, run
`pnpm admin list --remote` and re-warm any hot KV keys by re-adding the
top entries (KV isn't restored from the D1 backup).

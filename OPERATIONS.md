# Operations runbook

Day-2 procedures for the live `normieagent.com` registry. Companion to
`README.md` (what / how to dev) and `normieagent-architecture.md` (design).

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

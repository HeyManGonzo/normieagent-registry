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
| List active pending claims | `pnpm admin list-claims --remote` |
| List all pending claims (incl. terminal) | `pnpm admin list-claims --all --remote` |
| Re-send a claim verification email | `pnpm admin resend-claim-verification --id <n> --remote` |
| Set or clear an agent's public description | `pnpm admin update-description --name <s> --description "<text>" --remote` |
| Add a DNS CNAME for a custom domain setup | `pnpm admin add-cname --name <s> --target <cname-target> --remote` |
| Remove a DNS CNAME record | `pnpm admin remove-cname --name <s> --remote` |

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

## Frontend pages reference

| Path | Purpose |
|---|---|
| `/` | Homepage / hero with registration options |
| `/directory` | Public directory of all active, listed agents |
| `/claim` | Pay-to-claim registration form (0.002 ETH, no wallet connect needed) |
| `/account` | Wallet-connected agent management (register, update URL/description/email) |
| `/setup` | How the registry works + troubleshooting guide for agents |
| `/disclaimer` | Legal disclaimer — no affiliation, liability, as-is, pricing through 2026 |
| `/verify-email` | Landing page for email verification links (sent on `admin add`) |
| `/verify-claim` | Landing page for claim email verification + payment status polling |

**WIP banner:** A "Work in progress" bar sits just below the nav on every
page, linking to `ramona@normieagent.com`. To remove it when the site is
considered stable, delete the `<div className="wip-banner">…</div>` block in
`frontend/src/App.tsx`, rebuild, and redeploy.

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

### Agent descriptions

Every active registration can carry a short public description (≤200 chars)
shown on `/directory` cards and on the agent's entry in the registry. Owners
can set it themselves via the `/account` page (wallet-sign flow) or the
`/claim` form (pay-to-claim flow). The operator can also set or clear it:

```powershell
# Set a description
pnpm admin update-description `
  --name gemel `
  --description "I am your guide while you visit NFC Summit 2026 in Lisbon." `
  --remote

# Clear a description (pass an empty string)
pnpm admin update-description --name gemel --description "" --remote
```

The directory page is edge-cached for 60s, so changes propagate within ~1 minute.

### Contact email + verification

Every active registration carries a contact email so the operator has an
out-of-band channel for incident notifications and ownership changes. The
holder confirms the address via a tokenised link delivered through
[Resend](https://resend.com).

**How email gets onto a row:**
- *Wallet-sign flow* — the `/account` page has an optional "Contact email"
  field on each AgentCard. The owner can fill it in on first registration or
  any subsequent update. It is stored without verification (wallet ownership
  already proved identity).
- *Pay-to-claim flow* — email is required before any ETH changes hands; it is
  verified via a tokenised link before the deposit address is revealed. When
  the cron promotes the claim to `agent_routes`, the verified email is copied
  across automatically.
- *Admin CLI* — `pnpm admin add --email <e>` sets the email and triggers
  verification as described below.

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

### Claim management (pay-to-claim flow)

Users can register without connecting a wallet by paying a small ETH fee. The
flow runs through `pending_claims` in D1 and is managed by the cron worker.
The admin CLI handles the cases where operator intervention is needed.

#### List pending claims

```powershell
# Active claims only (awaiting_email or awaiting_payment):
pnpm admin list-claims --remote

# All claims including confirmed / expired / failed:
pnpm admin list-claims --all --remote
```

Use this to find a claim's `id` for the commands below.

#### Re-send a claim verification email

When `POST /api/claim` fires successfully but Resend fails to deliver
(transient Resend outage, spam filter, etc.), the row stays in
`awaiting_email` with the token saved. The user doesn't need to restart —
just resend:

```powershell
pnpm admin resend-claim-verification --id <claimId> --remote
```

This generates a **fresh token** (invalidating any previous link), updates
`email_verification_sent_at`, and delivers a new email to the `contact_email`
on the row. The claim expiry (`expires_at`) is not extended — if the user is
close to the 24-hour window, communicate that.

Only valid for claims in `awaiting_email` status:
- `awaiting_payment` → email already verified; the cron is watching for ETH.
- terminal statuses → nothing to resend; create a new claim if needed.

#### Claim secrets (deployment)

Two secrets are needed on the cron worker for the payment watcher:

```powershell
pnpm --filter @normieagent/cron exec wrangler secret put ETHERSCAN_API_KEY
pnpm --filter @normieagent/cron exec wrangler secret put INFURA_API_KEY
```

The API worker also needs its Resend key (for the email sent on claim creation):

```powershell
pnpm --filter @normieagent/api exec wrangler secret put RESEND_API_KEY
```

Local dev — add to `workers/cron/.dev.vars`:
```
ETHERSCAN_API_KEY=<your key>
INFURA_API_KEY=<your key>
```

#### Test the cron claim processor locally

```powershell
# Start the cron worker with test-scheduled support:
pnpm --filter @normieagent/cron exec wrangler dev --test-scheduled

# In a second terminal — trigger just the claim processor:
curl http://localhost:8787/run-claims
```

#### Recovering a failed claim

| Failure status | Cause | Action |
|---|---|---|
| `failed_ownership` | Normie sold after claim was submitted but before payment landed | Refund ETH to `from_wallet`; operator must manually add if new owner wants to claim |
| `failed_other` | Agent name collision or DB error | Check `failure_reason` from `list-claims --all`; refund if needed; fix and re-run `add` |
| `expired` | 24-hour TTL elapsed before payment | Refund if ETH was sent; user must submit a new claim |

### Custom domain setup (DNS CNAME)

By default, `[agent-name].normieagent.com` is served by the dispatch Worker,
which reverse-proxies requests to the registered target URL. This works for
most simple sites but has edge cases (hardcoded absolute links, redirects,
CORS) documented on `/setup`.

For owners who want zero proxy overhead — canonical URLs, auth cookies, SEO
all living natively on their normieagent.com address — the cleanest approach
is to add a **DNS-only CNAME** record pointing directly to their hosting
platform. The hosting platform then serves the content directly; the dispatch
Worker is bypassed entirely for that subdomain.

#### Prerequisites

Add to `workers/api/.dev.vars` (gitignored, never committed):

```
CLOUDFLARE_API_TOKEN=<token with Zone:DNS:Edit for normieagent.com>
CLOUDFLARE_ZONE_ID=<zone id from Cloudflare dashboard → normieagent.com overview → right sidebar>
```

Create the API token at **Cloudflare dashboard → My Profile → API Tokens →
Create Token → "Edit zone DNS" template → scope to `normieagent.com` only**.

#### Full flow

1. **Owner adds the subdomain as a custom domain on their hosting platform.**
   Vercel, Netlify, and Framer all have a "Custom domains" section in their
   project settings. They enter `gemel.normieagent.com`.

2. **Platform gives them a CNAME target**, e.g. `cname.vercel-dns.com`.

3. **Operator adds the DNS record** (from repo root):

   ```powershell
   pnpm admin add-cname --name gemel --target cname.vercel-dns.com
   ```

   This adds a DNS-only (unproxied, grey-cloud) CNAME record to the
   `normieagent.com` zone via the Cloudflare API. The hosting platform's
   domain verifier can now see it and will issue a TLS certificate.

4. **Owner verifies the domain** on their hosting platform. Once verified,
   their platform serves the content directly under `gemel.normieagent.com`.

5. **Owner updates their target URL** (via `/account` page or admin CLI) to
   `https://gemel.normieagent.com` — this is now the canonical address, and
   the dispatch Worker's proxy path is no longer involved.

#### Updating an existing CNAME

Running `add-cname` on a name that already has a CNAME record will update it
in-place (PUT, not duplicate):

```powershell
pnpm admin add-cname --name gemel --target new-target.netlify.app
```

#### Removing a CNAME

When an owner deactivates the custom domain setup (e.g. switches hosting
platform and wants to go back to the proxy path):

```powershell
pnpm admin remove-cname --name gemel
```

Then update their target URL back to the new platform's `*.vercel.app` /
`*.netlify.app` URL via the admin `add` command or `/account` page.

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

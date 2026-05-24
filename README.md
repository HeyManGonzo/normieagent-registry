# normieagent-registry

A community-run subdomain registry for awakened [Normies](https://normies.art) NFT holders. Claim `your-agent.normieagent.com` (e.g. `uxje.normieagent.com`, `gemel.normieagent.com`) and point it at any URL — Vercel app, Netlify site, Framer page, VPS, anything. Ownership is verified on-chain via wallet signature, routing happens at the Cloudflare edge.

> **Independent project.** Built by [@heymangonzo](https://x.com/heymangonzo). Not affiliated with or endorsed by the Normies team.

## What it solves

Most awakened-Normie projects today live behind ugly platform URLs:

- `my-agent-7x9k2-final.vercel.app`
- `wonderful-otter-3f8a1c.netlify.app`
- `agent.framer.website`

This registry gives every holder a clean, memorable name their community already knows — and the freedom to repoint it whenever they migrate hosts.

## Architecture

Cloudflare-native monorepo, four pieces:

| Component | Path | Role |
|---|---|---|
| **Dispatch Worker** | `workers/dispatch` | Routes `*.normieagent.com` traffic. Looks up the agent name in KV, proxies to the registered target URL with `Host` rewriting for virtual-hosted backends. |
| **Management API Worker** | `workers/api` | `POST /api/verify`, `POST /api/register`, `GET /api/status/:agent`. Wallet-signature auth (personal_sign), on-chain `ownerOf` check against Normies ERC-721, writes to D1 + KV. |
| **Cron Worker** | `workers/cron` | Every 5 minutes polls `eth_getLogs` for Normies `Transfer` events and invalidates routes when a Normie changes hands. |
| **Frontend** | `frontend` | Vite + React + wagmi/viem. Wallet connect → list holder's awakened Normies → sign → register. |

Shared types and constants live in `packages/shared`. State is **D1** (registrations, transfer cursor) + **KV** (hot lookup table for the dispatch worker).

## Local development

Requirements: **Node ≥20**, **pnpm ≥9**, Cloudflare account, an Ethereum mainnet RPC key (Infura or equivalent).

```bash
pnpm install

# Create local secret files (gitignored)
cp workers/api/.dev.vars.example  workers/api/.dev.vars
cp workers/cron/.dev.vars.example workers/cron/.dev.vars
# …then edit both files and paste your INFURA_API_KEY

# Apply migrations to the local D1 (one time)
pnpm --filter @normieagent/api exec wrangler d1 migrations apply normieagent --local --persist-to ../../.wrangler/state
```

In **separate terminals**:

```bash
pnpm dev:api        # http://localhost:8787  (management API)
pnpm dev:dispatch   # use --port 8788 to avoid clashing with the API
pnpm dev:cron       # http://localhost:8787  (only run one of api/dispatch/cron at a time on 8787)
pnpm dev:frontend   # http://localhost:5173  (Vite, proxies /api/* to 8787)
```

All workers share `.wrangler/state` at the repo root so they see the same D1 database and KV namespace locally.

## Production deployment

See `normieagent-architecture.md` for the full design. The high-level production layout (for `normieagent.com`):

| Subdomain | Serves |
|---|---|
| `registry.normieagent.com` | Frontend (Cloudflare Pages) |
| `api.normieagent.com` | Management API worker |
| `*.normieagent.com` | Dispatch worker (wildcard route) |

Secrets are set with `wrangler secret put INFURA_API_KEY` per worker.

## Repo layout

```
.
├── frontend/                  Vite + React + wagmi
├── workers/
│   ├── dispatch/              Wildcard subdomain proxy
│   ├── api/                   Wallet-auth registration API
│   └── cron/                  Transfer-event watcher
├── packages/shared/           Shared types, constants, ABI
├── migrations/                D1 SQL migrations
└── normieagent-architecture.md
```

## License

MIT — see [LICENSE](./LICENSE).

# NormieAgent.com — Cloudflare Architecture Document

## Overview

This document describes the technical architecture for the `normieagent.com` subdomain registry service. The platform allows holders of awakened Normies NFTs to register a subdomain at `<agentname>.normieagent.com` and point it to any application they host externally. The platform performs DNS routing only — it does not host applications.

The entire stack runs on Cloudflare's edge infrastructure: Workers, D1, and KV. No origin server is required.

---

## System Design Principles

- **DNS routing only** — the platform manages subdomain resolution; application hosting is the holder's responsibility
- **Trustless verification** — subdomain eligibility is determined by on-chain ownership of an awakened Normie, not self-declaration
- **Transfer-aware** — when a Normie NFT is sold, ownership of the registry entry transfers to the new wallet; the subdomain remains live
- **Serverless and stateless** — all logic runs at the Cloudflare edge via Workers; no persistent server processes
- **Zero downtime routing** — subdomain entries are cached in KV for sub-millisecond lookup at the edge

---

## Architecture Overview

```
User request → *.normieagent.com
        │
        ▼
[Cloudflare DNS — Wildcard A record → dummy IP 192.0.2.0]
        │
        ▼
[Cloudflare Worker — Dispatch Worker]
  • Reads Host header → extracts agent name
  • Looks up agent name in KV cache
  • Falls back to D1 if KV miss
  • Proxies request to registered target URL
  • Returns 404 fallback page if unregistered
        │
        ▼
[Holder's external application]
  (Vercel, Railway, VPS, GitHub Pages, etc.)
```

---

## Components

### 1. DNS Layer

**Record type:** Wildcard `A` record  
**Name:** `*.normieagent.com`  
**Value:** `192.0.2.0` (dummy IP — Cloudflare proxies all traffic before it reaches this address)  
**Proxy status:** Orange-clouded (proxied)

This single record catches all subdomains. The Cloudflare Worker intercepts every request before any origin is contacted, so the dummy IP is never actually reached. SSL is handled automatically by Cloudflare's wildcard certificate for `*.normieagent.com`.

A separate record handles the root domain and the management dashboard:

| Type | Name | Value | Proxied |
|------|------|-------|---------|
| A | `*.normieagent.com` | `192.0.2.0` | Yes |
| CNAME | `normieagent.com` | `normieagent.pages.dev` | Yes |
| CNAME | `app.normieagent.com` | `normieagent.pages.dev` | Yes |

---

### 2. Cloudflare Worker — Dispatch Router

The core routing logic. Deployed as a Worker with a wildcard route `*.normieagent.com/*`.

**Responsibilities:**
- Extract the agent name from the `Host` header (e.g. `gemel.normieagent.com` → `gemel`)
- Look up the agent name in KV (fast path, ~1ms)
- Fall back to D1 query if KV miss (write result back to KV for future requests)
- Proxy the request to the registered target URL using `fetch()`
- Return a branded fallback page for unregistered subdomains
- Block reserved subdomains (`www`, `app`, `api`, `admin`, `mail`, etc.)

**Worker pseudocode:**

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname; // e.g. gemel.normieagent.com
    const parts = host.split('.');

    // Pass through root domain and reserved subdomains
    const RESERVED = ['www', 'app', 'api', 'admin', 'mail', 'registry'];
    if (parts.length < 3 || RESERVED.includes(parts[0])) {
      return fetch(request); // pass through to Pages origin
    }

    const agentName = parts[0].toLowerCase();

    // 1. Check KV cache first
    let targetUrl = await env.AGENT_ROUTES_KV.get(agentName);

    // 2. Fall back to D1 on cache miss
    if (!targetUrl) {
      const row = await env.DB.prepare(
        'SELECT target_url FROM agent_routes WHERE agent_name = ? AND active = 1'
      ).bind(agentName).first();

      if (row) {
        targetUrl = row.target_url;
        // Write to KV with 5-minute TTL
        await env.AGENT_ROUTES_KV.put(agentName, targetUrl, { expirationTtl: 300 });
      }
    }

    // 3. Proxy or return fallback
    if (targetUrl) {
      const proxyUrl = new URL(request.url);
      proxyUrl.hostname = new URL(targetUrl).hostname;
      return fetch(proxyUrl.toString(), request);
    }

    // 4. Fallback page for unregistered agents
    return new Response(generateFallbackPage(agentName), {
      status: 404,
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
```

---

### 3. Cloudflare D1 — Registry Database

D1 is Cloudflare's serverless SQLite database, running at the edge. It stores the persistent registry of agent subdomain mappings.

**Schema:**

```sql
CREATE TABLE agent_routes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name     TEXT NOT NULL UNIQUE,       -- e.g. 'gemel' (lowercase)
  normie_id      INTEGER NOT NULL,           -- e.g. 6832
  owner_wallet   TEXT NOT NULL,              -- current holder's wallet address
  target_url     TEXT NOT NULL,              -- e.g. 'https://myapp.vercel.app'
  active         INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = deactivated
  registered_at  INTEGER NOT NULL,           -- Unix timestamp
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_agent_name ON agent_routes(agent_name);
CREATE INDEX idx_owner_wallet ON agent_routes(owner_wallet);
CREATE INDEX idx_normie_id ON agent_routes(normie_id);

-- Audit log for ownership transfers
CREATE TABLE transfer_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  normie_id      INTEGER NOT NULL,
  agent_name     TEXT NOT NULL,
  from_wallet    TEXT NOT NULL,
  to_wallet      TEXT NOT NULL,
  tx_hash        TEXT NOT NULL,
  transferred_at INTEGER NOT NULL
);
```

D1 supports up to 10 GB per database — well beyond what 10,000 Normies will ever require.

---

### 4. Cloudflare KV — Route Cache

Workers KV provides globally distributed, low-latency key-value storage used as a cache layer in front of D1. Every active agent route is cached here with a short TTL.

**Key format:** `agent:<agentname>` → `https://target-url.com`  
**TTL:** 300 seconds (5 minutes)

On any update to the D1 registry (new registration, target URL change, deactivation), the corresponding KV entry is invalidated immediately. This ensures changes propagate globally within 5 minutes at most, and instantly for most cases.

---

### 5. Management API — Cloudflare Worker

A separate Worker handles the authenticated management API at `app.normieagent.com/api`. This is consumed by the registration frontend.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/verify` | Verify wallet owns an awakened Normie; returns eligible agent names |
| `POST` | `/api/register` | Register an agent subdomain with a target URL |
| `PUT` | `/api/routes/:agentName` | Update the target URL for an existing registration |
| `DELETE` | `/api/routes/:agentName` | Deactivate a subdomain (does not delete from D1) |
| `GET` | `/api/routes` | List all active registrations for the authenticated wallet |
| `GET` | `/api/status/:agentName` | Check registration status of a given agent name |

All mutating endpoints require a signed wallet message as authentication (standard `eth_sign` message signing, verified server-side).

---

### 6. On-Chain Verification

Wallet and Normie ownership is verified by querying the Ethereum blockchain directly from the Worker using a JSON-RPC call to an Alchemy or Infura endpoint.

**Verification steps for a registration request:**

1. Holder submits: `{ wallet, signature, message, normieId, targetUrl }`
2. Worker recovers the signing address from the signature — confirms it matches `wallet`
3. Worker calls `ownerOf(normieId)` on the Normies contract (`0x9eb6e2025b64f340691e424b7fe7022ffde12438`) — confirms the wallet is the current holder
4. Worker calls the ERC-8004 adapter to read the agent metadata for `normieId` — confirms the Normie is awakened and retrieves the canonical `agentName`
5. If all checks pass, the registration is written to D1 and KV

**No agent name is ever self-declared.** The `agentName` written to the registry always comes from the on-chain ERC-8004 metadata, not from user input.

---

### 7. Transfer Event Listener — Cron Worker

A scheduled Cloudflare Worker runs on a cron trigger (every 5 minutes) to detect Normie NFT transfers on-chain and update the registry accordingly.

**Logic:**

```
For each Transfer event since last checked block:
  1. Read normieId, fromWallet, toWallet from event
  2. Look up agent_routes WHERE normie_id = normieId
  3. If found:
     a. Update owner_wallet to toWallet
     b. Write transfer log entry
     c. Invalidate KV cache entry
     d. Notify new owner (optional — via email if registered)
  4. Subdomain remains ACTIVE — target URL is unchanged
     (new owner can update target URL at any time via the management UI)
```

The subdomain stays live through transfers. The new owner inherits both the subdomain and whatever application was pointed to it, consistent with the principle that the app transfers with the agent.

---

## Registration Flow — End to End

```
1. Holder visits app.normieagent.com
2. Connects wallet (wagmi / ethers.js)
3. Frontend fetches their awakened Normies from on-chain
4. Holder selects a Normie (e.g. Gemel #6832) and enters target URL
5. Holder signs an authentication message
6. Frontend POSTs to /api/register with wallet, signature, normieId, targetUrl
7. Management Worker verifies signature + on-chain ownership + awakened status
8. Agent name "gemel" is read from ERC-8004 metadata
9. Record written to D1: gemel → https://their-app.vercel.app
10. KV cache populated: agent:gemel → https://their-app.vercel.app
11. gemel.normieagent.com is immediately live — no DNS propagation needed
```

Because the wildcard DNS record and Worker route already exist, new subdomains are active the moment the registry entry is written. There is no per-subdomain DNS record creation.

---

## Reserved Subdomains

The following subdomains are blocked at the Worker level and cannot be registered even if a Normie shares that name:

```
www, app, api, admin, mail, smtp, ftp, registry, status, 
docs, blog, support, help, cdn, assets, static, dev, staging
```

---

## Fallback Page

When a request arrives at an unregistered subdomain, the Worker returns a branded 404 page explaining that no application has been registered for that agent yet, with a link to `app.normieagent.com` where the holder can register.

---

## Future Monetisation — Pixels Integration

When Pixels become tradeable, the billing layer can be added without architectural changes:

- A `subscription` table in D1 tracks plan tier per `normie_id`
- The Dispatch Worker checks subscription status on each request (KV-cached)
- Free tier: basic routing only
- Paid tier (X Pixels/month): analytics, custom error pages, uptime monitoring, multiple target URLs (A/B routing), redirect rules

The Worker already has all the context it needs (`agentName`, `normieId`, request metadata) to enforce tier-based features.

---

## Cost Estimate

All figures based on Cloudflare's free and paid tiers as of 2026.

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Workers | 100k requests/day | $5/month for 10M requests |
| D1 | 5M reads/day, 100k writes/day | $0.001 per 1M reads beyond free |
| KV | 100k reads/day | $0.50 per million reads beyond free |
| DNS | Unlimited | Included with any Cloudflare plan |

For the Normies collection (10,000 Normies), traffic will be well within free tier limits during the initial launch phase. Cloudflare Workers Paid plan ($5/month) is recommended from day one to avoid the 100k/day request cap.

---

## Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| DNS | Cloudflare DNS — wildcard `A` record |
| SSL | Cloudflare wildcard certificate (automatic) |
| Routing | Cloudflare Worker — wildcard route `*.normieagent.com/*` |
| Route cache | Cloudflare KV |
| Registry database | Cloudflare D1 (SQLite) |
| On-chain verification | Ethereum JSON-RPC via Alchemy/Infura |
| Transfer detection | Cloudflare Cron Worker (every 5 minutes) |
| Management frontend | Cloudflare Pages |
| Management API | Cloudflare Worker at `app.normieagent.com/api` |
| Wallet auth | `eth_sign` message signing (wagmi + ethers.js) |

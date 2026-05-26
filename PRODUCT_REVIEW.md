# Product Review — NormieAgent Registry

*Written May 2026. A candid assessment of the current state, gaps, and
opportunities — intended as a living reference for prioritisation decisions.*

---

## What we built is technically solid

The foundation is genuinely professional-grade for a community side project.
Cloudflare Workers + D1 + KV is the right stack. Two registration paths with
proper on-chain ownership verification, auto-transfer detection via cron, a
working admin CLI, good secrets hygiene, and deployment automation. Most
community NFT projects never get this far. That is worth acknowledging before
getting into what is missing.

---

## The central problem: it has no soul

Normies is a **fully on-chain, pixel-art, creatively charged** collection of
10,000 characters — 40×40 bitmaps compressed to 200 bytes each, artwork and
traits living entirely in the smart contract, holders burning NFTs to edit
pixels on-chain, 50+ community apps and games built on top. The collection
pulses with creative energy.

The registry looks and feels like a developer utility. Monospace text, muted
colours, minimal chrome. Technically appropriate, but tonally wrong for the
audience. Someone who just paid to awaken their Normie and bind an agent to it
is excited — the registry does not match that energy at all.

---

## What the API offers that we are not using

`api.normies.art` exposes significantly more than what the registry currently
touches:

| Endpoint | What it gives you | Currently used? |
|---|---|---|
| `/agents/identity/:id` | Name, type, traits | ✓ name only |
| `/agents/binding/:id` | ERC-8004 binding data incl. `agentId` | ✓ existence check only |
| `/agents/image/:id` | Agent portrait SVG | ✓ directory thumbnails |
| `/pixels/:id` | Raw 40×40 bitmap (1,600-char binary string) | ✗ |
| `/traits/:id` | Raw byte8 trait data (hex) | ✗ |
| `/metadata/:id` | Full tokenURI incl. **canvas animation URL** | ✗ |

The **canvas animation URL** and **raw pixel data** are the most significant
gaps. Normies can be animated. They can be rendered pixel-by-pixel in a way
that celebrates what they are. The registry currently shows them as 56×56 px
thumbnails in a list — which wastes the art entirely.

---

## ERC-8004 is underused

The registry verifies that an ERC-8004 binding exists before allowing
registration — which is correct. But it does nothing with the binding itself.
The standard defines three on-chain registries:

- **Identity** — portable agent identifiers. The `agentId` field in the
  binding response is this identifier. It is currently discarded after the
  existence check.
- **Reputation** — on-chain feedback scores for agents. Completely unused.
- **Validation** — hooks for verifying agent job completion. Unused.

At minimum, displaying the `agentId` on individual agent pages would connect
the registry to the broader ERC-8004 ecosystem. The Reputation registry, once
there are scores to show, could make the directory genuinely useful for
discovering trustworthy agents rather than just listing them.

---

## The directory is a list, not a discovery tool

Current state: small image, subdomain, Normie #, optional description.

What is missing:

- **No search** — with 100+ agents, how does a visitor find what they need?
- **No filtering** — agents have types (human, cat, alien, agent) derived from
  on-chain traits that are not exposed anywhere in the UI.
- **No live signal** — is this agent actually running something useful, or is
  it a placeholder pointing at a parked URL?
- **No categories or tags** — chatbot, tool, game, and art project are all
  equally invisible in the current grid.
- **No individual agent page** — clicking a card opens the external site
  directly. There is no `registry.normieagent.com/agent/gemel` page that tells
  the full story of that agent, shows the artwork at a proper size, surfaces
  on-chain data, and provides a share-worthy URL.

---

## What to add — prioritised

### 1. Individual agent pages `/agent/:name` *(highest impact)*

A dedicated page per agent showing:
- Normie portrait rendered large (320×320 px, pixel-perfect via CSS scaling)
- Agent name (pretty-printed), Normie #, and subdomain
- Traits from `/agents/identity/:id` (type, attributes)
- ERC-8004 `agentId` linked to the binding transaction on Etherscan
- Owner description
- "Visit agent →" button linking to their live site
- OG/Twitter meta tags for social sharing so the URL previews correctly when
  shared on X or Discord

This is the single biggest missing piece. Every registered agent should have a
URL they are proud to share, not just a listing in a table.

### 2. Rich directory *(medium impact)*

- Show Normie character type (human / cat / alien / agent) as a filter badge
- Indicate whether the registered target URL returns a live response vs. a
  placeholder or error
- Add a search/filter bar once there are enough agents to warrant it
- Sort options: recently registered, recently updated, alphabetical

### 3. Pixel art rendering *(medium impact, high visual payoff)*

Use `/pixels/:id` to render the 40×40 grid at 320×320 px with CSS
`image-rendering: pixelated`. This is a completely different visual experience
from the SVG thumbnail — it makes each Normie feel like a distinct, crafted
character rather than a small icon. Use it on agent pages and as the OG image.

### 4. Embed / verification widget *(medium impact)*

A small copy-paste `<script>` or `<iframe>` snippet that agents can drop into
their own site showing a "Verified Normie #6832 — gemel.normieagent.com"
badge, linked back to their registry page. This makes the registry valuable to
the agents themselves — not just to visitors discovering the directory — and
creates inbound links from every registered agent site.

### 5. Social links on agent profiles *(low effort, good community signal)*

One or two optional fields on the `/account` page — X handle, GitHub, Discord
— stored in the `agent_routes` table and displayed on the agent page. Small
addition, meaningful for community building.

### 6. Agent type / category tags *(low effort)*

Let owners self-label their agent as one of a short fixed list: AI chatbot,
tool, game, art, data, other. Store as a column in `agent_routes`, expose in
the directory as a filter. Normalises the chaos of 50+ different agent types
into something a visitor can navigate.

---

## What to reconsider

### The pay-to-claim flow

This is the highest-complexity feature in the codebase — a multi-step email
verification + ETH payment + on-chain detection pipeline with its own cron
processor, pending claims table, and failure-recovery procedures.

The paid path exists for a specific reason: **some Normies holders will not
connect a wallet to a third-party site**, and the ETH payment *is* the
ownership proof. Only the wallet holding the Normie can send from it — so
the transaction proves ownership without requiring a wallet connection or
signature. The fee is not primarily a spam gate; it is an alternative
verification mechanism for privacy-conscious holders.

This is a legitimate and intentional design decision. The complexity is
justified by the audience it serves.

What to reconsider instead:
- The UX of the paid path could be smoother — the gap between "ETH sent"
  and "agent live" (waiting for cron) is opaque to the user. A status page
  or email confirmation on cron pickup would help.
- The two paths should be presented with clearer framing: wallet-sign as
  the fast path, pay-to-claim as the privacy-preserving alternative.

### The WIP banner

Remove it once the individual agent pages are shipped. It signals caution to
exactly the people the project is trying to impress — developers and Normies
holders who are deciding whether to register and promote their agent here.

---

## What to keep as-is

Everything currently built earns its place. The on-chain verification logic,
the cron transfer detection, the admin CLI, the ops documentation, the
Cloudflare infrastructure — these are all correct decisions. The question is
not what to tear down but where to invest the next layer of effort.

The answer is clearly the **product experience**: agent pages, richer
directory, pixel art rendering. More infrastructure at this stage would be
premature optimisation.

---

## Summary

We built a solid DNS utility. The opportunity now is to turn it into a
**community showcase** — a place where Normies holders send people to discover
what the awakened agents are doing, where the pixel art is celebrated at the
size it deserves, and where the ERC-8004 identity layer is surfaced rather than
hidden inside verification logic. The raw materials are all available in the
API. The registry just needs to surface them.

The north star: a Normies holder should be able to share
`registry.normieagent.com/agent/gemel` on X and feel proud of what opens.
Right now that URL does not exist. It should.

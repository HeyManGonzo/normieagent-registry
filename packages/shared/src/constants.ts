/**
 * Normies ERC-721 contract on Ethereum mainnet.
 * Used for trustless ownerOf() calls and Transfer event polling.
 */
export const NORMIES_CONTRACT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as const;

/**
 * Ethereum mainnet chain id.
 */
export const CHAIN_ID = 1 as const;

/**
 * Public base URL for the Normies API. Used to:
 *  - resolve a tokenId to its canonical agent name (derived from on-chain traits)
 *  - check if a Normie is awakened (ERC-8004 binding present)
 *  - look up holdings by wallet address
 */
export const NORMIES_API_BASE = "https://api.normies.art" as const;

/**
 * Subdomains that cannot be claimed even if a Normie's derived name collides.
 * Checked at the Dispatch Worker before any KV/D1 lookup.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "smtp",
  "ftp",
  "registry",
  "status",
  "docs",
  "blog",
  "support",
  "help",
  "cdn",
  "assets",
  "static",
  "dev",
  "staging",
  "test",
  "preview",
]);

/**
 * KV TTL for cached agent routes, in seconds.
 * Matches the architecture doc — short enough to propagate registry updates
 * globally within 5 minutes, with explicit invalidation on writes.
 */
export const ROUTE_CACHE_TTL_SECONDS = 300 as const;

/**
 * Sentinel stored in KV when a subdomain lookup returns no result from D1.
 * Prevents repeat bot probes from hitting D1 on every request.
 * Value can never be confused with a real target URL (those always start with https://).
 */
export const NOT_FOUND_SENTINEL = "~" as const;

/**
 * KV TTL for not-found cache entries, in seconds.
 * Short so a newly registered subdomain goes live within 60 seconds.
 */
export const NOT_FOUND_CACHE_TTL_SECONDS = 60 as const;

/**
 * The apex domain. Used to extract the agent name from the Host header
 * and to recognise root / `app` traffic that should pass through.
 */
export const APEX_DOMAIN = "normieagent.com" as const;

/**
 * ERC-721 Transfer event topic (keccak256 of "Transfer(address,address,uint256)").
 * Used by the cron worker to filter logs via eth_getLogs.
 */
export const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

/**
 * Confirmation depth used when polling Transfer events.
 * The cron worker reads up to (latestBlock - this) so we never react to
 * very-recent blocks that might be reorged.
 */
export const TRANSFER_CONFIRMATIONS = 5 as const;

/**
 * Cron cursor key in KV. Stores the last block scanned for Transfer events.
 */
export const CRON_CURSOR_KEY = "cron:lastBlock" as const;

/**
 * KV key prefix for cached agent routes. Full key: `agent:<name>`.
 */
export const AGENT_ROUTE_KEY_PREFIX = "agent:" as const;

export function agentRouteKey(agentName: string): string {
  return `${AGENT_ROUTE_KEY_PREFIX}${agentName.toLowerCase()}`;
}

/**
 * Default deposit amount for hybrid (pay-to-claim) registrations, in wei.
 * 0.002 ETH. Overridable per-environment via the CLAIM_AMOUNT_WEI var on the
 * API + cron workers so the price can be tuned without a redeploy.
 */
export const DEFAULT_CLAIM_AMOUNT_WEI = "2000000000000000" as const;

/**
 * Default TTL for a pending claim, in seconds. Counted from row creation and
 * spans the whole flow (email verification + payment). 24 hours so users have
 * time to find the verification email and fund/send a tx without rushing.
 * After this elapses the cron worker flips the row to `expired`.
 */
export const DEFAULT_CLAIM_TTL_SECONDS = 86400 as const;

/**
 * Cron cursor key in KV for the claim-payment watcher. Stores the last block
 * scanned via Etherscan for incoming transfers to the operator wallet.
 */
export const CLAIM_CURSOR_KEY = "cron:lastClaimBlock" as const;

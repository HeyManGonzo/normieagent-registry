/**
 * Bindings exposed to the Management API worker.
 * Mirrors workers/api/wrangler.toml.
 */
export interface Env {
  DB: D1Database;
  AGENT_ROUTES_KV: KVNamespace;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  /** Set with `wrangler secret put INFURA_API_KEY` (or .dev.vars locally). */
  INFURA_API_KEY: string;
  /** Operator wallet that receives ETH payments for hybrid (pay-to-claim) registrations. */
  OPERATOR_WALLET: string;
  /** Required deposit per claim, in wei (decimal string). Defaults to 0.002 ETH. */
  CLAIM_AMOUNT_WEI: string;
  /** TTL for a pending claim, in seconds (string var). Defaults to 86400. */
  CLAIM_TTL_SECONDS: string;
  /** Public base URL of the registry SPA — used to build verification links. */
  REGISTRY_BASE_URL: string;
  /** Set with `wrangler secret put RESEND_API_KEY` (or .dev.vars locally). */
  RESEND_API_KEY: string;
}

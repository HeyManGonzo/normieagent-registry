/**
 * Bindings exposed to the Cron worker. Mirrors workers/cron/wrangler.toml.
 */
export interface Env {
  DB: D1Database;
  AGENT_ROUTES_KV: KVNamespace;
  ENVIRONMENT: string;
  /** Per-run block-range cap, parsed from the string var as an integer. */
  MAX_BLOCKS_PER_RUN: string;
  /** Set via `wrangler secret put INFURA_API_KEY` (or .dev.vars locally). */
  INFURA_API_KEY: string;
}

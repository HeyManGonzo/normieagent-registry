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
}

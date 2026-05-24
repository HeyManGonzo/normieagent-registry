/**
 * Bindings exposed to the Dispatch Worker.
 * Mirrors the wrangler.toml configuration.
 */
export interface Env {
  DB: D1Database;
  AGENT_ROUTES_KV: KVNamespace;
  ENVIRONMENT: string;
}

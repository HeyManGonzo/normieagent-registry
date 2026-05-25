import type { Env } from "./env.js";
import { processTransfers } from "./process-transfers.js";
import { processClaims } from "./claim-processor.js";

/**
 * Cron worker. Two entry points:
 *
 *   scheduled(): invoked by Cloudflare's cron trigger (every 5 minutes per
 *     wrangler.toml). Reconciles Transfer events for registered Normies.
 *
 *   fetch(): a small surface for manual testing during local dev. Wrangler
 *     also exposes `/__scheduled` automatically when started with
 *     `--test-scheduled` — that path triggers scheduled() with a fake event
 *     and is the preferred way to test locally.
 */
export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runWithLogging(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, env: env.ENVIRONMENT }),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/run" && env.ENVIRONMENT === "development") {
      const result = await processTransfers(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/run-claims" && env.ENVIRONMENT === "development") {
      const result = await processClaims(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function runWithLogging(env: Env): Promise<void> {
  const started = Date.now();
  try {
    const [transfers, claims] = await Promise.all([
      processTransfers(env),
      processClaims(env),
    ]);
    console.log(
      JSON.stringify({
        event: "cron.tick",
        durationMs: Date.now() - started,
        transfers,
        claims,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.error",
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }
}

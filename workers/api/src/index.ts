import type { Env } from "./env.js";
import {
  errorResponse,
  handlePreflight,
  json,
  resolveAllowedOrigin,
} from "./http.js";
import { handleVerify } from "./handlers/verify.js";
import { handleRegister } from "./handlers/register.js";
import {
  handleDeactivateRoute,
  handleListRoutes,
  handleUpdateRoute,
} from "./handlers/routes.js";
import { handleStatus } from "./handlers/status.js";
import { handleRegisterSigned } from "./handlers/register-signed.js";
import { handleDirectory } from "./handlers/directory.js";
import { handleVerifyEmail } from "./handlers/verify-email.js";
import {
  handleCreateClaim,
  handleGetClaim,
  handleVerifyClaimEmail,
} from "./handlers/claim.js";

/**
 * Match `/api/routes/:agentName` and return the captured name.
 * Returns null on a non-match.
 */
function matchRouteParam(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (rest.length === 0 || rest.includes("/")) return null;
  return decodeURIComponent(rest);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    let origin: string | null = null;

    try {
      origin = resolveAllowedOrigin(env, request.headers.get("origin"));

      const preflight = handlePreflight(request, origin);
      if (preflight) return preflight;
      // Health check.
      if (path === "/api/health" && request.method === "GET") {
        return json({ ok: true, env: env.ENVIRONMENT }, {}, origin);
      }

      // POST /api/verify
      if (path === "/api/verify" && request.method === "POST") {
        return handleVerify(request, env, origin);
      }

      // POST /api/register
      if (path === "/api/register" && request.method === "POST") {
        return handleRegister(request, env, origin);
      }

      // POST /api/register-signed — wallet-connection-free path (Etherscan / sign-anywhere)
      if (path === "/api/register-signed" && request.method === "POST") {
        return handleRegisterSigned(request, env, origin);
      }

      // GET /api/routes?wallet=0x...
      if (path === "/api/routes" && request.method === "GET") {
        return handleListRoutes(request, env, origin);
      }

      // GET /api/directory — public listing of opted-in active routes.
      if (path === "/api/directory" && request.method === "GET") {
        return handleDirectory(env, origin);
      }

      // POST /api/verify-email — consume a verification token.
      if (path === "/api/verify-email" && request.method === "POST") {
        return handleVerifyEmail(request, env, origin);
      }

      // POST /api/claim — create a hybrid (pay-to-claim) pending registration.
      if (path === "/api/claim" && request.method === "POST") {
        return handleCreateClaim(request, env, origin);
      }

      // POST /api/claim/verify-email — consume the claim email-verify token.
      if (path === "/api/claim/verify-email" && request.method === "POST") {
        return handleVerifyClaimEmail(request, env, origin);
      }

      // GET /api/claim/:id — poll claim status from the deposit screen.
      const claimParam = matchRouteParam(path, "/api/claim/");
      if (claimParam !== null && request.method === "GET") {
        return handleGetClaim(env, claimParam, origin);
      }

      // PUT/DELETE /api/routes/:agentName
      const agentParam = matchRouteParam(path, "/api/routes/");
      if (agentParam !== null) {
        if (request.method === "PUT") {
          return handleUpdateRoute(request, env, agentParam, origin);
        }
        if (request.method === "DELETE") {
          return handleDeactivateRoute(request, env, agentParam, origin);
        }
        return errorResponse("Method not allowed", 405, origin);
      }

      // GET /api/status/:agentName
      const statusParam = matchRouteParam(path, "/api/status/");
      if (statusParam !== null && request.method === "GET") {
        return handleStatus(env, statusParam, origin);
      }

      return errorResponse("Not found", 404, origin);
    } catch (err) {
      console.error("Unhandled error", err);
      return errorResponse("Internal server error", 500, origin);
    }
  },
} satisfies ExportedHandler<Env>;

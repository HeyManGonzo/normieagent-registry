import { getAddress } from "viem";
import { agentRouteKey, ROUTE_CACHE_TTL_SECONDS } from "@normieagent/shared";
import {
  isMessageFresh,
  parseAuthMessage,
  verifyAuthSignature,
} from "../auth.js";
import type { Env } from "../env.js";
import { errorResponse, json } from "../http.js";

/**
 * GET /api/routes?wallet=0x...
 * Public read. Lists all active agent routes registered to the given wallet.
 */
export async function handleListRoutes(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const walletParam = url.searchParams.get("wallet");
  if (!walletParam) {
    return errorResponse("`wallet` query parameter is required", 400, origin);
  }

  let wallet: string;
  try {
    wallet = getAddress(walletParam);
  } catch {
    return errorResponse("Invalid wallet address", 400, origin);
  }

  const { results } = await env.DB.prepare(
    `SELECT agent_name, normie_id, target_url, active, registered_at, updated_at
       FROM agent_routes
      WHERE owner_wallet = ?1 AND active = 1
      ORDER BY registered_at DESC`,
  )
    .bind(wallet.toLowerCase())
    .all();

  return json({ wallet, routes: results }, {}, origin);
}

/**
 * PUT /api/routes/:agentName
 * Body: { wallet, signature, message, targetUrl }
 *
 * Updates the target URL for an existing registration. The signed message
 * must specify Action: update, Agent: <agentName>, Target: <targetUrl>.
 * Only the current owner_wallet may update the route.
 */
export async function handleUpdateRoute(
  request: Request,
  env: Env,
  agentName: string,
  origin: string | null,
): Promise<Response> {
  let body: {
    wallet?: string;
    signature?: string;
    message?: string;
    targetUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }
  const { wallet, signature, message, targetUrl } = body;
  if (!wallet || !signature || !message || !targetUrl) {
    return errorResponse("Missing required fields", 400, origin);
  }

  const recovered = await verifyAuthSignature(wallet, message, signature);
  if (!recovered) return errorResponse("Invalid signature", 401, origin);

  const parsed = parseAuthMessage(message);
  if (
    !parsed ||
    parsed.wallet !== recovered ||
    parsed.action !== "update" ||
    parsed.agentName !== agentName ||
    parsed.target !== targetUrl
  ) {
    return errorResponse("Auth message does not match request", 401, origin);
  }
  if (!isMessageFresh(parsed)) {
    return errorResponse("Auth message expired", 401, origin);
  }

  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return errorResponse("targetUrl is not a valid URL", 400, origin);
  }
  if (target.protocol !== "https:") {
    return errorResponse("targetUrl must use https", 400, origin);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `UPDATE agent_routes
        SET target_url = ?1, updated_at = ?2
      WHERE agent_name = ?3
        AND owner_wallet = ?4
        AND active = 1`,
  )
    .bind(targetUrl, now, agentName, recovered.toLowerCase())
    .run();

  if (result.meta.changes === 0) {
    return errorResponse("No matching route for this wallet", 404, origin);
  }

  await env.AGENT_ROUTES_KV.put(agentRouteKey(agentName), targetUrl, {
    expirationTtl: ROUTE_CACHE_TTL_SECONDS,
  });

  return json({ agentName, targetUrl }, {}, origin);
}

/**
 * DELETE /api/routes/:agentName
 * Body: { wallet, signature, message }
 *
 * Soft-deactivates the route. The row is preserved for audit; the dispatch
 * worker will fall through to the 404 page on subsequent requests.
 */
export async function handleDeactivateRoute(
  request: Request,
  env: Env,
  agentName: string,
  origin: string | null,
): Promise<Response> {
  let body: { wallet?: string; signature?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }
  const { wallet, signature, message } = body;
  if (!wallet || !signature || !message) {
    return errorResponse("Missing required fields", 400, origin);
  }

  const recovered = await verifyAuthSignature(wallet, message, signature);
  if (!recovered) return errorResponse("Invalid signature", 401, origin);

  const parsed = parseAuthMessage(message);
  if (
    !parsed ||
    parsed.wallet !== recovered ||
    parsed.action !== "deactivate" ||
    parsed.agentName !== agentName
  ) {
    return errorResponse("Auth message does not match request", 401, origin);
  }
  if (!isMessageFresh(parsed)) {
    return errorResponse("Auth message expired", 401, origin);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `UPDATE agent_routes
        SET active = 0, updated_at = ?1
      WHERE agent_name = ?2
        AND owner_wallet = ?3
        AND active = 1`,
  )
    .bind(now, agentName, recovered.toLowerCase())
    .run();

  if (result.meta.changes === 0) {
    return errorResponse("No matching route for this wallet", 404, origin);
  }

  await env.AGENT_ROUTES_KV.delete(agentRouteKey(agentName));

  return json({ agentName, active: false }, {}, origin);
}

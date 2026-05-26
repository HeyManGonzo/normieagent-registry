import {
  agentRouteKey,
  normaliseAgentName,
  RESERVED_SUBDOMAINS,
  ROUTE_CACHE_TTL_SECONDS,
  type RegisterRequestBody,
} from "@normieagent/shared";
import {
  isMessageFresh,
  parseAuthMessage,
  verifyAuthSignature,
} from "../auth.js";
import {
  createInfuraClient,
  fetchAgentBinding,
  fetchAgentIdentity,
  fetchOnChainOwner,
} from "../chain.js";
import type { Env } from "../env.js";
import { errorResponse, json } from "../http.js";

/**
 * POST /api/register
 * Body: RegisterRequestBody
 *
 * Trustless registration of an agent subdomain. Steps:
 *  1. Verify signature recovers to `wallet`.
 *  2. Parse the signed message and cross-check fields against the body.
 *  3. Confirm the message is fresh (<= 5 min old).
 *  4. Validate targetUrl is https.
 *  5. Trustlessly confirm on-chain ownership via Infura `ownerOf`.
 *  6. Confirm the Normie is awakened via api.normies.art binding.
 *  7. Resolve the canonical agent name from on-chain traits.
 *  8. Reject reserved names; upsert the registry row; warm KV.
 */
export async function handleRegister(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: RegisterRequestBody;
  try {
    body = (await request.json()) as RegisterRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  const { wallet, signature, message, normieId, targetUrl } = body ?? {};
  if (
    typeof wallet !== "string" ||
    typeof signature !== "string" ||
    typeof message !== "string" ||
    typeof normieId !== "number" ||
    typeof targetUrl !== "string"
  ) {
    return errorResponse("Missing required fields", 400, origin);
  }

  const rawDescription = typeof body.description === "string" ? body.description.trim() : null;
  if (rawDescription && rawDescription.length > 200) {
    return errorResponse("description must be 200 characters or fewer", 400, origin);
  }
  const description = rawDescription || null;

  const recovered = await verifyAuthSignature(wallet, message, signature);
  if (!recovered) return errorResponse("Invalid signature", 401, origin);

  const parsed = parseAuthMessage(message);
  if (!parsed) return errorResponse("Malformed auth message", 400, origin);
  if (parsed.wallet !== recovered) {
    return errorResponse("Signer / wallet mismatch", 401, origin);
  }
  if (parsed.action !== "register") {
    return errorResponse("Auth message action must be 'register'", 400, origin);
  }
  if (parsed.normieId !== normieId) {
    return errorResponse("normieId mismatch with signed message", 400, origin);
  }
  if (parsed.target !== targetUrl) {
    return errorResponse("targetUrl mismatch with signed message", 400, origin);
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

  const client = createInfuraClient(env.INFURA_API_KEY);
  const onChainOwner = await fetchOnChainOwner(client, normieId);
  if (!onChainOwner) {
    return errorResponse("Normie does not exist on chain", 404, origin);
  }
  if (onChainOwner.toLowerCase() !== recovered.toLowerCase()) {
    return errorResponse("Wallet is not the on-chain owner of this Normie", 403, origin);
  }

  const binding = await fetchAgentBinding(normieId);
  if (!binding) {
    return errorResponse("Normie is not awakened (no ERC-8004 binding)", 400, origin);
  }

  const identity = await fetchAgentIdentity(normieId);
  if (!identity) {
    return errorResponse("Could not resolve agent identity", 502, origin);
  }
  const agentName = normaliseAgentName(identity.name);
  if (!agentName) {
    return errorResponse("Agent name could not be normalised to a DNS label", 400, origin);
  }
  if (RESERVED_SUBDOMAINS.has(agentName)) {
    return errorResponse(`Agent name '${agentName}' is reserved`, 409, origin);
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      `INSERT INTO agent_routes
         (agent_name, normie_id, owner_wallet, target_url, description, active, registered_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
       ON CONFLICT(normie_id) DO UPDATE SET
         target_url   = excluded.target_url,
         owner_wallet = excluded.owner_wallet,
         description  = excluded.description,
         active       = 1,
         updated_at   = excluded.updated_at`,
    )
      .bind(agentName, normieId, recovered.toLowerCase(), targetUrl, description, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return errorResponse(
        `Agent name '${agentName}' is already registered to another Normie`,
        409,
        origin,
      );
    }
    return errorResponse("Database error", 500, origin);
  }

  await env.AGENT_ROUTES_KV.put(agentRouteKey(agentName), targetUrl, {
    expirationTtl: ROUTE_CACHE_TTL_SECONDS,
  });

  return json(
    { agentName, normieId, targetUrl, subdomain: `${agentName}.normieagent.com` },
    { status: 201 },
    origin,
  );
}

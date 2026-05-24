import { getAddress } from "viem";
import {
  agentRouteKey,
  normaliseAgentName,
  RESERVED_SUBDOMAINS,
} from "@normieagent/shared";
import type { Env } from "../env.js";
import { errorResponse, json } from "../http.js";
import {
  fetchAgentIdentity,
  fetchAwakenedSet,
  fetchHolderTokens,
} from "../chain.js";

interface VerifyResultEntry {
  normieId: number;
  agentName: string;
  agentNamePretty: string;
  reserved: boolean;
  alreadyRegistered: boolean;
  currentTargetUrl: string | null;
}

/**
 * POST /api/verify
 * Body: { wallet: string }
 *
 * Returns every awakened Normie held by `wallet`, with its canonical agent
 * name, whether the name is reserved, and whether the subdomain is already
 * registered (and to what target).
 *
 * No signature required — this is a public lookup; the same data could be
 * derived by any third party from api.normies.art directly.
 */
export async function handleVerify(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  const wallet =
    typeof body === "object" && body !== null && "wallet" in body
      ? (body as { wallet: unknown }).wallet
      : null;
  if (typeof wallet !== "string") {
    return errorResponse("`wallet` is required", 400, origin);
  }

  let checksummed: string;
  try {
    checksummed = getAddress(wallet);
  } catch {
    return errorResponse("Invalid wallet address", 400, origin);
  }

  const tokenIds = await fetchHolderTokens(checksummed);
  if (tokenIds.length === 0) {
    return json({ wallet: checksummed, agents: [] }, {}, origin);
  }

  const awakened = await fetchAwakenedSet(tokenIds);
  const awakenedIds = tokenIds.filter((id) => awakened.has(id));

  // Resolve identities + registration status in parallel.
  const results = await Promise.all(
    awakenedIds.map((id) => buildEntry(id, env)),
  );

  return json(
    { wallet: checksummed, agents: results.filter((r) => r !== null) },
    {},
    origin,
  );
}

async function buildEntry(
  normieId: number,
  env: Env,
): Promise<VerifyResultEntry | null> {
  const identity = await fetchAgentIdentity(normieId);
  if (!identity) return null;

  const agentName = normaliseAgentName(identity.name);
  if (!agentName) return null;

  const reserved = RESERVED_SUBDOMAINS.has(agentName);

  // Use KV first; fall back to D1 so the response is correct even when KV
  // hasn't been warmed yet.
  let currentTargetUrl = await env.AGENT_ROUTES_KV.get(agentRouteKey(agentName));
  if (!currentTargetUrl) {
    const row = await env.DB.prepare(
      "SELECT target_url FROM agent_routes WHERE agent_name = ?1 AND active = 1",
    )
      .bind(agentName)
      .first<{ target_url: string }>();
    currentTargetUrl = row?.target_url ?? null;
  }

  return {
    normieId,
    agentName,
    agentNamePretty: identity.name,
    reserved,
    alreadyRegistered: currentTargetUrl !== null,
    currentTargetUrl,
  };
}

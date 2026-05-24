import { normaliseAgentName } from "@normieagent/shared";
import type { Env } from "../env.js";
import { errorResponse, json } from "../http.js";

/**
 * GET /api/status/:agentName
 * Public read. Returns whether the subdomain is registered, active, and
 * (if so) its current target URL and ownership info.
 */
export async function handleStatus(
  env: Env,
  agentNameRaw: string,
  origin: string | null,
): Promise<Response> {
  const agentName = normaliseAgentName(agentNameRaw);
  if (!agentName) {
    return errorResponse("Invalid agent name", 400, origin);
  }

  const row = await env.DB.prepare(
    `SELECT agent_name, normie_id, owner_wallet, target_url, active,
            registered_at, updated_at
       FROM agent_routes
      WHERE agent_name = ?1`,
  )
    .bind(agentName)
    .first();

  if (!row) {
    return json({ agentName, registered: false }, {}, origin);
  }

  return json({ agentName, registered: true, route: row }, {}, origin);
}

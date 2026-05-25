import type { Env } from "../env.js";
import { json } from "../http.js";

interface DirectoryRow {
  agent_name: string;
  normie_id: number;
  target_url: string;
}

interface DirectoryEntry {
  agentName: string;
  normieId: number;
  targetUrl: string;
  subdomain: string;
}

/**
 * GET /api/directory
 * Public read. Lists active registrations that have opted in to the public
 * listing, alphabetised by agent name. Owner wallet and contact email are
 * intentionally excluded.
 *
 * Edge-cached for 60s via Cache-Control so the SPA's /directory page doesn't
 * round-trip D1 on every load.
 */
export async function handleDirectory(
  env: Env,
  origin: string | null,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT agent_name, normie_id, target_url
       FROM agent_routes
      WHERE active = 1 AND directory_listed = 1
      ORDER BY agent_name ASC`,
  ).all<DirectoryRow>();

  const entries: DirectoryEntry[] = (results ?? []).map((row) => ({
    agentName: row.agent_name,
    normieId: row.normie_id,
    targetUrl: row.target_url,
    subdomain: `${row.agent_name}.normieagent.com`,
  }));

  return json(
    { count: entries.length, entries },
    { headers: { "cache-control": "public, max-age=60" } },
    origin,
  );
}

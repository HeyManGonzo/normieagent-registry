import {
  APEX_DOMAIN,
  RESERVED_SUBDOMAINS,
  ROUTE_CACHE_TTL_SECONDS,
  agentRouteKey,
} from "@normieagent/shared";
import type { Env } from "./env.js";
import { renderFallbackPage } from "./fallback.js";

/**
 * Hostnames that are caught by the `*.normieagent.com/*` wildcard route but
 * are actually owned by other Workers / origins via their own Custom Domain
 * bindings. The dispatch worker re-issues these via fetch(request) so
 * Cloudflare's loop suppression routes them back through the edge to the
 * correct owner (the wildcard route is skipped on the second hop).
 */
const PASSTHROUGH_HOSTS: ReadonlySet<string> = new Set([
  `www.${APEX_DOMAIN}`,
  `registry.${APEX_DOMAIN}`,
]);

/**
 * Extract the leftmost label from a host header, but only when the host
 * is a true subdomain of normieagent.com. Returns null for the apex,
 * `www.normieagent.com`, or any unrelated host (e.g. preview deployments).
 */
function extractAgentName(host: string): string | null {
  const lower = host.toLowerCase();
  if (lower === APEX_DOMAIN || lower === `www.${APEX_DOMAIN}`) return null;
  if (!lower.endsWith(`.${APEX_DOMAIN}`)) return null;
  const label = lower.slice(0, lower.length - APEX_DOMAIN.length - 1);
  // Reject multi-level subdomains like `foo.bar.normieagent.com` — only
  // single-label agent names are supported.
  if (label.length === 0 || label.includes(".")) return null;
  return label;
}

async function resolveTargetUrl(
  agentName: string,
  env: Env,
): Promise<string | null> {
  const key = agentRouteKey(agentName);

  // Fast path — KV cache.
  const cached = await env.AGENT_ROUTES_KV.get(key);
  if (cached) return cached;

  // Cache miss — query D1.
  const row = await env.DB.prepare(
    "SELECT target_url FROM agent_routes WHERE agent_name = ?1 AND active = 1",
  )
    .bind(agentName)
    .first<{ target_url: string }>();

  if (!row) return null;

  // Backfill cache. Fire-and-forget would be nicer with waitUntil but the
  // result of put() is small and we already have the row in hand.
  await env.AGENT_ROUTES_KV.put(key, row.target_url, {
    expirationTtl: ROUTE_CACHE_TTL_SECONDS,
  });

  return row.target_url;
}

/**
 * Proxy `request` to `targetUrl`, preserving method, headers, and body
 * while rewriting the Host header to match the target origin.
 */
async function proxyRequest(
  request: Request,
  targetUrl: string,
): Promise<Response> {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return new Response("Misconfigured target URL", { status: 502 });
  }

  const incoming = new URL(request.url);
  const outgoing = new URL(target.toString());
  outgoing.pathname = incoming.pathname;
  outgoing.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.set("host", target.host);
  headers.set("x-forwarded-host", incoming.hostname);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

  const init: RequestInit = {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  };

  return fetch(outgoing.toString(), init);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // The wildcard worker route `*.normieagent.com/*` also captures hosts
    // owned by other origins / workers (the www Vercel site, the registry
    // SPA worker, etc). Re-issuing the request via fetch() bypasses this
    // worker route — Cloudflare suppresses same-URL loops by sending the
    // refetch to the configured origin / Custom Domain owner, with the
    // original Host header intact.
    if (PASSTHROUGH_HOSTS.has(host)) {
      return fetch(request);
    }

    const agentName = extractAgentName(host);

    // Apex or unrelated host — should never actually hit this worker in
    // production because the wildcard route doesn't match the apex.
    if (agentName === null) {
      return new Response("Not found", { status: 404 });
    }

    if (RESERVED_SUBDOMAINS.has(agentName)) {
      return new Response("Reserved", { status: 404 });
    }

    const targetUrl = await resolveTargetUrl(agentName, env);

    if (targetUrl) {
      return proxyRequest(request, targetUrl);
    }

    return new Response(renderFallbackPage(agentName), {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  },
} satisfies ExportedHandler<Env>;

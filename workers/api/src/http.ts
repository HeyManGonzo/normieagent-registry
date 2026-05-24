import type { Env } from "./env.js";

/**
 * Standard JSON response with consistent headers.
 */
export function json(
  data: unknown,
  init: ResponseInit = {},
  origin?: string | null,
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  applyCorsHeaders(headers, origin);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(
  message: string,
  status: number,
  origin?: string | null,
): Response {
  return json({ error: message }, { status }, origin);
}

/**
 * Resolve whether the given Origin header is allowed, and return the value
 * to echo back (or null to omit the header).
 */
export function resolveAllowedOrigin(
  env: Env,
  requestOrigin: string | null,
): string | null {
  if (!requestOrigin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

function applyCorsHeaders(headers: Headers, origin: string | null | undefined) {
  if (!origin) return;
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-credentials", "false");
}

/**
 * Handle CORS preflight. Returns null if this isn't a preflight request.
 */
export function handlePreflight(
  request: Request,
  origin: string | null,
): Response | null {
  if (request.method !== "OPTIONS") return null;
  const headers = new Headers();
  applyCorsHeaders(headers, origin);
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "content-type, authorization",
  );
  headers.set("access-control-max-age", "86400");
  return new Response(null, { status: 204, headers });
}

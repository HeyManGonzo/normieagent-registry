/**
 * Tiny typed client for the NormieAgent management API.
 * In dev, calls go through Vite's proxy at /api/*. In production, set
 * VITE_API_BASE to the deployed API worker origin.
 */

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

function url(path: string): string {
  return `${BASE}${path}`;
}

export interface VerifyAgent {
  normieId: number;
  agentName: string;
  agentNamePretty: string;
  reserved: boolean;
  alreadyRegistered: boolean;
  currentTargetUrl: string | null;
}

export interface VerifyResponse {
  wallet: string;
  agents: VerifyAgent[];
}

export interface RegisterRequestBody {
  wallet: string;
  signature: string;
  message: string;
  normieId: number;
  targetUrl: string;
}

export interface RegisterResponse {
  agentName: string;
  normieId: number;
  targetUrl: string;
  subdomain: string;
}

export interface ApiError {
  error: string;
  status: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON body — fall through.
    }
  }
  if (!res.ok) {
    const err: ApiError = {
      error:
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : null) ??
        text ??
        `HTTP ${res.status}`,
      status: res.status,
    };
    throw err;
  }
  return parsed as T;
}

export function verify(wallet: string): Promise<VerifyResponse> {
  return request<VerifyResponse>("/api/verify", {
    method: "POST",
    body: JSON.stringify({ wallet }),
  });
}

export function register(body: RegisterRequestBody): Promise<RegisterResponse> {
  return request<RegisterResponse>("/api/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface DirectoryEntry {
  agentName: string;
  normieId: number;
  targetUrl: string;
  subdomain: string;
}

export interface DirectoryResponse {
  count: number;
  entries: DirectoryEntry[];
}

export function getDirectory(): Promise<DirectoryResponse> {
  return request<DirectoryResponse>("/api/directory", { method: "GET" });
}

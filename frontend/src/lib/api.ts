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
  currentDescription: string | null;
  currentContactEmail: string | null;
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
  description?: string | null;
  contactEmail?: string | null;
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
  subdomain: string;
  description: string | null;
}

export interface DirectoryResponse {
  count: number;
  entries: DirectoryEntry[];
}

export function getDirectory(): Promise<DirectoryResponse> {
  return request<DirectoryResponse>("/api/directory", { method: "GET" });
}

export interface VerifyEmailResponse {
  ok: true;
  alreadyVerified: boolean;
  agentName: string;
  subdomain: string;
  verifiedAt?: number;
}

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return request<VerifyEmailResponse>("/api/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export type ClaimStatus =
  | "awaiting_email"
  | "awaiting_payment"
  | "confirmed"
  | "expired"
  | "failed_ownership"
  | "failed_other";

export interface VerifyClaimEmailResponse {
  claimId: number;
  status: ClaimStatus;
  agentName: string;
  alreadyVerified: boolean;
}

export interface ClaimStatusResponse {
  id: number;
  status: ClaimStatus;
  agentName: string;
  normieId: number;
  targetUrl: string;
  contactEmail: string;
  depositAddress: string | null;
  amountWei: string | null;
  amountEth: string | null;
  expiresAt: number;
  emailVerifiedAt: number | null;
  txHash: string | null;
  failureReason: string | null;
}

export interface CreateClaimBody {
  normieId: number;
  targetUrl: string;
  contactEmail: string;
  fromWallet: string;
  description?: string | null;
}

export interface CreateClaimResponse {
  claimId: number;
  agentName: string;
  normieId: number;
  contactEmail: string;
  status: ClaimStatus;
  expiresAt: number;
}

export function createClaim(body: CreateClaimBody): Promise<CreateClaimResponse> {
  return request<CreateClaimResponse>("/api/claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function verifyClaimEmail(token: string): Promise<VerifyClaimEmailResponse> {
  return request<VerifyClaimEmailResponse>("/api/claim/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getClaim(id: number): Promise<ClaimStatusResponse> {
  return request<ClaimStatusResponse>(`/api/claim/${id}`, { method: "GET" });
}

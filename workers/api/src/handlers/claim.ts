import { formatEther, getAddress, isAddress } from "viem";
import {
  normaliseAgentName,
  RESERVED_SUBDOMAINS,
  type ClaimCreatedResponse,
  type ClaimRequestBody,
  type ClaimStatus,
  type ClaimStatusResponse,
  type VerifyClaimEmailBody,
  type VerifyClaimEmailResponse,
} from "@normieagent/shared";
import {
  createInfuraClient,
  fetchAgentBinding,
  fetchAgentIdentity,
  fetchOnChainOwner,
} from "../chain.js";
import { sendClaimVerificationEmail } from "../email.js";
import type { Env } from "../env.js";
import { errorResponse, json } from "../http.js";

/** Lightweight RFC-5322-ish email guard; full validation happens at delivery. */
function isPlausibleEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/** 32 random bytes hex-encoded — same shape as the existing verify-email token. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

interface ClaimRow {
  id: number;
  agent_name: string;
  normie_id: number;
  from_wallet: string;
  target_url: string;
  contact_email: string;
  amount_wei: string;
  deposit_address: string;
  status: ClaimStatus;
  email_verified_at: number | null;
  tx_hash: string | null;
  paid_at: number | null;
  failure_reason: string | null;
  expires_at: number;
}

/**
 * POST /api/claim
 * Body: ClaimRequestBody
 *
 * Pay-to-claim entry point. Validates inputs, resolves the canonical agent
 * name from ERC-8004 metadata, confirms on-chain ownership of `normieId` by
 * `fromWallet`, records the claim in 'awaiting_email' status, and emails a
 * verification token. Payment instructions (deposit address + amount) are
 * NOT returned here — they're unlocked once the user clicks the link in the
 * email and `/api/claim/verify-email` flips the row to 'awaiting_payment'.
 */
export async function handleCreateClaim(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: ClaimRequestBody;
  try {
    body = (await request.json()) as ClaimRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  const { normieId, targetUrl, contactEmail, fromWallet } = body ?? {};
  if (
    !Number.isInteger(normieId) ||
    (normieId as number) < 0 ||
    typeof targetUrl !== "string" ||
    typeof fromWallet !== "string"
  ) {
    return errorResponse("Missing or invalid fields", 400, origin);
  }
  if (!isPlausibleEmail(contactEmail)) {
    return errorResponse("Invalid contact email", 400, origin);
  }
  if (!isAddress(fromWallet)) {
    return errorResponse("Invalid fromWallet address", 400, origin);
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

  // Resolve canonical agent name from on-chain ERC-8004 metadata. The user
  // never gets to pick this — it's strictly derived from the Normie.
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

  // Fail-fast ownership preflight. Re-checked at payment time by the cron
  // worker (in case the Normie is sold between claim and payment).
  const client = createInfuraClient(env.INFURA_API_KEY);
  const onChainOwner = await fetchOnChainOwner(client, normieId);
  if (!onChainOwner) {
    return errorResponse("Normie does not exist on chain", 404, origin);
  }
  const fromChecksum = getAddress(fromWallet);
  if (onChainOwner.toLowerCase() !== fromChecksum.toLowerCase()) {
    return errorResponse(
      "fromWallet is not the on-chain owner of this Normie",
      403,
      origin,
    );
  }

  // Reject if the subdomain is already live, or if another pending claim is
  // in flight for the same Normie (avoids two users racing to pay).
  const existing = await env.DB.prepare(
    `SELECT 1 FROM agent_routes WHERE normie_id = ?1 AND active = 1 LIMIT 1`,
  )
    .bind(normieId)
    .first();
  if (existing) {
    return errorResponse(
      `Normie #${normieId} already has an active registration`,
      409,
      origin,
    );
  }
  const inFlight = await env.DB.prepare(
    `SELECT 1 FROM pending_claims
       WHERE normie_id = ?1
         AND status IN ('awaiting_email', 'awaiting_payment')
         AND expires_at > ?2
       LIMIT 1`,
  )
    .bind(normieId, Math.floor(Date.now() / 1000))
    .first();
  if (inFlight) {
    return errorResponse(
      `A pending claim is already in flight for Normie #${normieId}`,
      409,
      origin,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = Number.parseInt(env.CLAIM_TTL_SECONDS, 10) || 86400;
  const expiresAt = now + ttl;
  const fromWalletLower = fromChecksum.toLowerCase();
  const depositAddress = getAddress(env.OPERATOR_WALLET).toLowerCase();
  const amountWei = env.CLAIM_AMOUNT_WEI;
  const token = generateToken();

  const inserted = await env.DB.prepare(
    `INSERT INTO pending_claims
       (agent_name, normie_id, from_wallet, target_url, contact_email,
        amount_wei, deposit_address, status,
        email_verification_token, email_verification_sent_at,
        expires_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'awaiting_email',
             ?8, ?9, ?10, ?9, ?9)
     RETURNING id`,
  )
    .bind(
      agentName,
      normieId,
      fromWalletLower,
      targetUrl,
      contactEmail,
      amountWei,
      depositAddress,
      token,
      now,
      expiresAt,
    )
    .first<{ id: number }>();
  if (!inserted) {
    return errorResponse("Database error creating claim", 500, origin);
  }

  // Send the verification email synchronously. On Resend failure the row stays
  // in 'awaiting_email' with the token saved — the operator can re-trigger via
  // the admin CLI (Phase 6) without the user needing to re-submit.
  try {
    await sendClaimVerificationEmail({
      to: contactEmail,
      agentName,
      token,
      registryBaseUrl: env.REGISTRY_BASE_URL,
      resendApiKey: env.RESEND_API_KEY,
    });
  } catch (err) {
    console.error("Resend send failed for claim", inserted.id, err);
    return errorResponse(
      "Claim created but verification email could not be sent — contact the operator",
      502,
      origin,
    );
  }

  const response: ClaimCreatedResponse = {
    claimId: inserted.id,
    agentName,
    normieId,
    contactEmail,
    status: "awaiting_email",
    expiresAt,
  };
  return json(response, { status: 201 }, origin);
}

/** Whether deposit details should be revealed for a given status. */
function isDepositVisible(status: ClaimStatus): boolean {
  return status !== "awaiting_email";
}

/**
 * GET /api/claim/:id
 * Polled by the frontend until the claim reaches a terminal status. Deposit
 * details are gated by status so a curious user can't skip the email step by
 * reading the response in devtools.
 */
export async function handleGetClaim(
  env: Env,
  rawId: string,
  origin: string | null,
): Promise<Response> {
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return errorResponse("Invalid claim id", 400, origin);
  }

  const row = await env.DB.prepare(
    `SELECT id, agent_name, normie_id, from_wallet, target_url, contact_email,
            amount_wei, deposit_address, status, email_verified_at,
            tx_hash, paid_at, failure_reason, expires_at
       FROM pending_claims
      WHERE id = ?1`,
  )
    .bind(id)
    .first<ClaimRow>();
  if (!row) {
    return errorResponse("Claim not found", 404, origin);
  }

  const reveal = isDepositVisible(row.status);
  const response: ClaimStatusResponse = {
    id: row.id,
    status: row.status,
    agentName: row.agent_name,
    normieId: row.normie_id,
    targetUrl: row.target_url,
    contactEmail: row.contact_email,
    depositAddress: reveal ? row.deposit_address : null,
    amountWei: reveal ? row.amount_wei : null,
    amountEth: reveal ? formatEther(BigInt(row.amount_wei)) : null,
    expiresAt: row.expires_at,
    emailVerifiedAt: row.email_verified_at,
    txHash: row.tx_hash,
    failureReason: row.failure_reason,
  };
  return json(response, { headers: { "cache-control": "no-store" } }, origin);
}

/**
 * POST /api/claim/verify-email
 * Body: { token: string }
 *
 * Consumes the single-use verification token. Flips status from
 * 'awaiting_email' to 'awaiting_payment' (unlocking the deposit address in the
 * GET /api/claim/:id response) and clears the token. Idempotent on already-
 * verified rows so users who click the link twice get a sensible response.
 */
export async function handleVerifyClaimEmail(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: VerifyClaimEmailBody;
  try {
    body = (await request.json()) as VerifyClaimEmailBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  const token = body?.token;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return errorResponse("Invalid token", 400, origin);
  }

  const row = await env.DB.prepare(
    `SELECT id, agent_name, status, email_verified_at, expires_at
       FROM pending_claims
      WHERE email_verification_token = ?1
      LIMIT 1`,
  )
    .bind(token)
    .first<{
      id: number;
      agent_name: string;
      status: ClaimStatus;
      email_verified_at: number | null;
      expires_at: number;
    }>();

  if (!row) {
    // Could be: token never existed, already consumed, or row was cleaned up.
    // 404 covers all three without leaking which.
    return errorResponse("Token not found or already used", 404, origin);
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > row.expires_at) {
    // Mark the row expired so the operator can refund / inform the user.
    await env.DB.prepare(
      `UPDATE pending_claims
          SET status = 'expired', updated_at = ?1
        WHERE id = ?2 AND status = 'awaiting_email'`,
    )
      .bind(now, row.id)
      .run();
    return errorResponse("Claim expired — please start a new claim", 410, origin);
  }

  // Idempotent path — shouldn't normally hit because consumption nulls the
  // token, but guard for races.
  if (row.email_verified_at !== null) {
    const response: VerifyClaimEmailResponse = {
      claimId: row.id,
      status: row.status,
      agentName: row.agent_name,
      alreadyVerified: true,
    };
    return json(response, {}, origin);
  }

  await env.DB.prepare(
    `UPDATE pending_claims
        SET status                     = 'awaiting_payment',
            email_verified_at          = ?1,
            email_verification_token   = NULL,
            updated_at                 = ?1
      WHERE id = ?2 AND status = 'awaiting_email'`,
  )
    .bind(now, row.id)
    .run();

  const response: VerifyClaimEmailResponse = {
    claimId: row.id,
    status: "awaiting_payment",
    agentName: row.agent_name,
    alreadyVerified: false,
  };
  return json(response, {}, origin);
}

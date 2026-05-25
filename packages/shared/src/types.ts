/**
 * A row in the `agent_routes` D1 table.
 * `agent_name` is always lowercase; `owner_wallet` is checksummed lowercase.
 */
export interface AgentRoute {
  id: number;
  agent_name: string;
  normie_id: number;
  owner_wallet: string;
  target_url: string;
  active: 0 | 1;
  registered_at: number;
  updated_at: number;
}

/**
 * Insert/update payload used by the management API.
 */
export interface AgentRouteWrite {
  agent_name: string;
  normie_id: number;
  owner_wallet: string;
  target_url: string;
}

/**
 * A row in the `transfer_log` D1 table.
 * Written by the cron worker on every detected Transfer event for a
 * registered Normie.
 */
export interface TransferLogEntry {
  id: number;
  normie_id: number;
  agent_name: string;
  from_wallet: string;
  to_wallet: string;
  tx_hash: string;
  transferred_at: number;
}

/**
 * Shape returned by `GET https://api.normies.art/agents/identity/:tokenId`.
 * The `name` field is the canonical agent name we use as the subdomain.
 */
export interface NormiesIdentityResponse {
  tokenId: number;
  name: string;
  type: string;
  traits: Record<string, string>;
}

/**
 * Shape returned by `GET https://api.normies.art/agents/binding/:tokenId`.
 * `binding` is null when the Normie has not been awakened.
 */
export interface NormiesBindingResponse {
  binding: {
    id: string;
    agentId: string;
    standard: number;
    tokenContract: string;
    tokenId: string;
    registeredBy: string;
    blockNumber: string;
    timestamp: string;
    txHash: string;
  } | null;
}

/**
 * Authenticated registration request payload from the frontend.
 * The signature is over `message`; the recovered address must equal `wallet`.
 */
export interface RegisterRequestBody {
  wallet: string;
  signature: string;
  message: string;
  normieId: number;
  targetUrl: string;
}

/**
 * Status enum for `pending_claims` rows.
 * Mirrors the comment in migrations/0005_pending_claims.sql.
 */
export type ClaimStatus =
  | "awaiting_email"
  | "awaiting_payment"
  | "confirmed"
  | "expired"
  | "failed_ownership"
  | "failed_other";

/**
 * A row in the `pending_claims` D1 table.
 * `agent_name` is lowercase, `from_wallet` and `deposit_address` are lowercase
 * hex, `amount_wei` is a decimal string to preserve precision across SQLite.
 */
export interface PendingClaim {
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
  email_verification_token: string | null;
  email_verification_sent_at: number | null;
  tx_hash: string | null;
  paid_at: number | null;
  failure_reason: string | null;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

/**
 * Request body for `POST /api/claim`. The user supplies their Normie token id,
 * the URL they want the subdomain to point at, a contact email, and the wallet
 * they will pay from (which must equal the on-chain owner of the Normie at
 * payment time). The agent name is derived server-side from ERC-8004, never
 * accepted as input.
 */
export interface ClaimRequestBody {
  normieId: number;
  targetUrl: string;
  contactEmail: string;
  fromWallet: string;
}

/**
 * Response from `POST /api/claim`. Deposit details are intentionally NOT
 * returned here — they're gated behind email verification (see
 * GET /api/claim/:id once status flips to 'awaiting_payment').
 */
export interface ClaimCreatedResponse {
  claimId: number;
  agentName: string;
  normieId: number;
  contactEmail: string;
  status: ClaimStatus;
  expiresAt: number;
}

/**
 * Response from `GET /api/claim/:id` — polled by the frontend every ~10s
 * until terminal status. `depositAddress` and `amountWei`/`amountEth` are
 * null while status is 'awaiting_email' so a user can't skip the email step
 * by reading the response in devtools.
 */
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

/**
 * Request body for `POST /api/claim/verify-email`. The token is a 64-char
 * lowercase hex string (32 random bytes), single-use.
 */
export interface VerifyClaimEmailBody {
  token: string;
}

/**
 * Response from `POST /api/claim/verify-email`. Returns the claim id so the
 * landing page can redirect into the polling view, plus the new status (which
 * is normally 'awaiting_payment' but may be 'expired' if the user clicked an
 * aged-out link).
 */
export interface VerifyClaimEmailResponse {
  claimId: number;
  status: ClaimStatus;
  agentName: string;
  alreadyVerified: boolean;
}

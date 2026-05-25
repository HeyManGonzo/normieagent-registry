-- Hybrid registration flow: pending claims table.
--
-- Users who don't want to connect a wallet can claim a subdomain by sending a
-- small ETH payment to the operator wallet. The flow is two-stage:
--   1. POST /api/claim records a row with status='awaiting_email' and emails
--      a verification token to `contact_email`. The payment instructions are
--      gated server-side until the email is verified, so we always have a
--      working contact channel before any ETH changes hands.
--   2. POST /api/claim/verify-email consumes the token and flips the row to
--      status='awaiting_payment'. The cron worker then watches the operator
--      wallet for an incoming ETH transfer from `from_wallet` matching
--      `amount_wei` and, on landing, re-verifies on-chain ownership and
--      promotes the row into `agent_routes`.
--
-- Apply remotely with:
--   wrangler d1 execute normieagent --file=./migrations/0005_pending_claims.sql --remote
-- Local dev:
--   wrangler d1 execute normieagent --file=./migrations/0005_pending_claims.sql --local

CREATE TABLE IF NOT EXISTS pending_claims (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name                 TEXT    NOT NULL,
  normie_id                  INTEGER NOT NULL,
  from_wallet                TEXT    NOT NULL,
  target_url                 TEXT    NOT NULL,
  contact_email              TEXT    NOT NULL,
  amount_wei                 TEXT    NOT NULL,
  deposit_address            TEXT    NOT NULL,
  -- Status enum (enforced in application code, not by SQLite):
  --   'awaiting_email'    — verification email sent, waiting for click
  --   'awaiting_payment'  — email verified, waiting for matching ETH transfer
  --   'confirmed'         — payment landed, route created, claim closed
  --   'expired'           — TTL elapsed at any stage; manual refund if paid
  --   'failed_ownership'  — payment landed but sender no longer owns the Normie
  --   'failed_other'      — late payment / wrong amount / other operator triage
  status                     TEXT    NOT NULL DEFAULT 'awaiting_email',
  email_verified_at          INTEGER,
  email_verification_token   TEXT,
  email_verification_sent_at INTEGER,
  tx_hash                    TEXT,
  paid_at                    INTEGER,
  failure_reason             TEXT,
  expires_at                 INTEGER NOT NULL,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL
);

-- Cron lookup: find awaiting_payment rows matching an incoming tx by sender.
CREATE INDEX IF NOT EXISTS idx_pending_claims_from_status
  ON pending_claims(from_wallet, status);

-- Duplicate-tx guard: a given tx_hash should only ever match one claim.
CREATE INDEX IF NOT EXISTS idx_pending_claims_tx_hash
  ON pending_claims(tx_hash)
  WHERE tx_hash IS NOT NULL;

-- Expiry sweep: find non-terminal rows that have aged out.
CREATE INDEX IF NOT EXISTS idx_pending_claims_expires
  ON pending_claims(expires_at)
  WHERE status IN ('awaiting_email', 'awaiting_payment');

-- Email-verify endpoint: point-query on token. Partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_pending_claims_email_token
  ON pending_claims(email_verification_token)
  WHERE email_verification_token IS NOT NULL;

-- Status polling from the frontend hits the PK; no extra index needed.

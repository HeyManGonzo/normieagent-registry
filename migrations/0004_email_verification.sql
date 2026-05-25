-- Adds contact-email + verification columns to agent_routes so the operator
-- has an out-of-band channel to reach the owner (incident notifications,
-- ownership change confirmations, etc.). Emails are written by the admin CLI
-- and verified by the holder via a tokenised link emailed through Resend.
--
-- Apply remotely with:
--   wrangler d1 execute normieagent --file=./migrations/0004_email_verification.sql --remote
-- Local dev (against .wrangler/state):
--   wrangler d1 execute normieagent --file=./migrations/0004_email_verification.sql --local
--
-- All four columns are nullable so existing rows survive without backfill.
-- New registrations are required to supply --email by the admin CLI, not by
-- the schema, so historical rows stay queryable.

ALTER TABLE agent_routes ADD COLUMN contact_email              TEXT;
ALTER TABLE agent_routes ADD COLUMN email_verified_at          INTEGER;
ALTER TABLE agent_routes ADD COLUMN email_verification_token   TEXT;
ALTER TABLE agent_routes ADD COLUMN email_verification_sent_at INTEGER;

-- Token lookups are point queries on a single column. Partial index keeps it
-- tiny — only rows with a pending token take up space.
CREATE INDEX IF NOT EXISTS idx_agent_routes_email_token
  ON agent_routes(email_verification_token)
  WHERE email_verification_token IS NOT NULL;

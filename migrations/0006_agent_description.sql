-- Agent description field.
--
-- Owners can add a short public blurb (max 200 chars) to their agent entry
-- so visitors browsing /directory know what to expect before clicking through.
-- NULL means no description set; empty string is treated as NULL by the API.
--
-- Apply remotely:
--   wrangler d1 execute normieagent --file=./migrations/0006_agent_description.sql --remote
-- Local dev:
--   wrangler d1 execute normieagent --local --persist-to=../../.wrangler/state --file=./migrations/0006_agent_description.sql

ALTER TABLE agent_routes ADD COLUMN description TEXT;
ALTER TABLE pending_claims ADD COLUMN description TEXT;

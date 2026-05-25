-- Adds per-row opt-out for the public /directory listing on
-- registry.normieagent.com. Default 1 keeps all existing rows visible.
--
-- Apply remotely with:
--   wrangler d1 execute normieagent --file=./migrations/0003_directory_listing.sql --remote
-- Local dev (against .wrangler/state):
--   wrangler d1 execute normieagent --file=./migrations/0003_directory_listing.sql --local
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`; the column is added unconditionally
-- and the migration is idempotent only by virtue of being run once. Re-running
-- will fail with "duplicate column name", which is the expected signal that the
-- migration has already been applied.

ALTER TABLE agent_routes ADD COLUMN directory_listed INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_agent_routes_directory
  ON agent_routes(active, directory_listed, agent_name);

-- NormieAgent registry schema (D1 / SQLite).
-- Apply with:
--   wrangler d1 execute normieagent --file=./migrations/0001_init.sql --remote
-- Or against local dev D1 (omit --remote).

CREATE TABLE IF NOT EXISTS agent_routes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name     TEXT    NOT NULL UNIQUE,
  normie_id      INTEGER NOT NULL UNIQUE,
  owner_wallet   TEXT    NOT NULL,
  target_url     TEXT    NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  registered_at  INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_routes_agent_name   ON agent_routes(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_routes_owner_wallet ON agent_routes(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_agent_routes_normie_id    ON agent_routes(normie_id);

CREATE TABLE IF NOT EXISTS transfer_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  normie_id      INTEGER NOT NULL,
  agent_name     TEXT    NOT NULL,
  from_wallet    TEXT    NOT NULL,
  to_wallet      TEXT    NOT NULL,
  tx_hash        TEXT    NOT NULL,
  transferred_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfer_log_normie_id ON transfer_log(normie_id);
CREATE INDEX IF NOT EXISTS idx_transfer_log_tx_hash   ON transfer_log(tx_hash);

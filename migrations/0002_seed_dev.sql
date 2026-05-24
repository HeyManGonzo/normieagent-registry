-- Dev-only seed for the local D1 instance.
-- One test row so the Dispatch Worker can be exercised end-to-end.
-- Apply with:
--   wrangler d1 execute normieagent --file=./migrations/0002_seed_dev.sql
-- Do NOT apply this against the remote database.

INSERT OR IGNORE INTO agent_routes (
  agent_name, normie_id, owner_wallet, target_url,
  active, registered_at, updated_at
) VALUES (
  'devtest',
  1,
  '0x0000000000000000000000000000000000000000',
  'https://example.com',
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now')
);

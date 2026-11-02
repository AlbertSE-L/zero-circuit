CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  at_utc TEXT NOT NULL,
  event TEXT NOT NULL,
  game TEXT NOT NULL,
  browser_id TEXT,
  room TEXT,
  nickname TEXT,
  is_test INTEGER NOT NULL DEFAULT 0
);

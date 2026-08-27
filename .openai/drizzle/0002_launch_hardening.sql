CREATE TABLE IF NOT EXISTS game_event_details (
  event_id INTEGER PRIMARY KEY,
  metadata TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES game_events(id)
);
CREATE TABLE IF NOT EXISTS request_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_limits_expiry ON request_limits(expires_at);
PRAGMA optimize;

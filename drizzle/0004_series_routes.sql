CREATE TABLE IF NOT EXISTS series_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  week_id TEXT NOT NULL,
  best_time_ms INTEGER NOT NULL CHECK(best_time_ms BETWEEN 10000 AND 900000),
  lights INTEGER NOT NULL DEFAULT 0 CHECK(lights BETWEEN 0 AND 120),
  completed_at INTEGER NOT NULL,
  UNIQUE(player_id, week_id)
);
CREATE INDEX IF NOT EXISTS idx_series_completions_series_week
  ON series_completions(series_id, week_id, completed_at);
PRAGMA optimize;

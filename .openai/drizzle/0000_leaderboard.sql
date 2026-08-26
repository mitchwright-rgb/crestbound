CREATE TABLE IF NOT EXISTS game_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 12),
  score_ms INTEGER NOT NULL CHECK(score_ms BETWEEN 10000 AND 900000),
  sparks INTEGER NOT NULL DEFAULT 0 CHECK(sparks BETWEEN 0 AND 24),
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(run_id) REFERENCES game_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_scores_day_time ON scores(day_key, score_ms);
CREATE INDEX IF NOT EXISTS idx_scores_week_time ON scores(week_key, score_ms);
CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(score_ms);
PRAGMA optimize;

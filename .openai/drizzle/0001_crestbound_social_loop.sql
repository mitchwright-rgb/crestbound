CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS run_context (
  run_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES game_runs(id)
);
CREATE TABLE IF NOT EXISTS crest_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 12),
  score_ms INTEGER NOT NULL CHECK(score_ms BETWEEN 10000 AND 900000),
  sparks INTEGER NOT NULL DEFAULT 0 CHECK(sparks BETWEEN 0 AND 64),
  course_id TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(run_id) REFERENCES game_runs(id)
);
CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  event_name TEXT NOT NULL,
  course_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO crest_scores (run_id, player_id, player_name, score_ms, sparks, course_id, modifier_id, day_key, week_key, created_at)
SELECT run_id, 'legacy:' || lower(player_name), player_name, score_ms, sparks, 'goldline', 'clear', day_key, week_key, created_at FROM scores;
CREATE INDEX IF NOT EXISTS idx_crest_scores_day_course ON crest_scores(day_key, course_id, score_ms);
CREATE INDEX IF NOT EXISTS idx_crest_scores_week ON crest_scores(week_key, player_id, day_key);
CREATE INDEX IF NOT EXISTS idx_crest_scores_player ON crest_scores(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_day ON game_events(day_key, event_name);
PRAGMA optimize;

-- Daily generated routes can contain more than the launch-era limit of 64
-- Light. The server already verifies the exact route total, so the database
-- should reject negative values without imposing a second, stale ceiling.
CREATE TABLE crest_scores_expanded_light (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 12),
  score_ms INTEGER NOT NULL CHECK(score_ms BETWEEN 10000 AND 900000),
  sparks INTEGER NOT NULL DEFAULT 0 CHECK(sparks >= 0),
  course_id TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  challenge_id TEXT NOT NULL DEFAULT 'legacy',
  crest_score INTEGER NOT NULL DEFAULT 0,
  light_total INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(run_id) REFERENCES game_runs(id)
);

INSERT INTO crest_scores_expanded_light (
  id, run_id, player_id, player_name, score_ms, sparks, course_id,
  modifier_id, day_key, week_key, created_at, challenge_id, crest_score,
  light_total, hits
)
SELECT id, run_id, player_id, player_name, score_ms, sparks, course_id,
  modifier_id, day_key, week_key, created_at, challenge_id, crest_score,
  light_total, hits
FROM crest_scores;

DROP TABLE crest_scores;
ALTER TABLE crest_scores_expanded_light RENAME TO crest_scores;

CREATE INDEX idx_crest_scores_day_course ON crest_scores(day_key, course_id, score_ms);
CREATE INDEX idx_crest_scores_week ON crest_scores(week_key, player_id, day_key);
CREATE INDEX idx_crest_scores_player ON crest_scores(player_id, created_at);
CREATE INDEX idx_crest_scores_daily_challenge ON crest_scores(day_key, course_id, challenge_id, score_ms);
CREATE INDEX idx_crest_scores_score ON crest_scores(day_key, course_id, challenge_id, crest_score DESC);
PRAGMA optimize;

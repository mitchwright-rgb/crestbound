ALTER TABLE run_context ADD COLUMN challenge_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE crest_scores ADD COLUMN challenge_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS idx_crest_scores_daily_challenge
  ON crest_scores(day_key, course_id, challenge_id, score_ms);
PRAGMA optimize;

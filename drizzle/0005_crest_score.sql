ALTER TABLE crest_scores ADD COLUMN crest_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crest_scores ADD COLUMN light_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crest_scores ADD COLUMN hits INTEGER NOT NULL DEFAULT 0;

ALTER TABLE series_completions ADD COLUMN best_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE series_completions ADD COLUMN light_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE series_completions ADD COLUMN signature_count INTEGER NOT NULL DEFAULT 0;

-- Preserve useful launch-era history while the exact normalized Light total
-- was not yet stored. New finishes always use the authoritative formula.
UPDATE crest_scores SET crest_score = 500 + MAX(0, 1200 - CAST(score_ms / 100 AS INTEGER)) + MIN(800, sparks * 10)
  WHERE crest_score = 0;
UPDATE series_completions SET best_score = 500 + MAX(0, 1200 - CAST(best_time_ms / 100 AS INTEGER)) + MIN(800, lights * 10)
  WHERE best_score = 0;

CREATE TABLE IF NOT EXISTS community_light_contributions (
  contribution_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('daily', 'series')),
  source_id TEXT NOT NULL,
  lights INTEGER NOT NULL CHECK(lights BETWEEN 0 AND 120),
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_light_week ON community_light_contributions(week_key, created_at);
CREATE INDEX IF NOT EXISTS idx_crest_scores_score ON crest_scores(day_key, course_id, challenge_id, crest_score DESC);
CREATE INDEX IF NOT EXISTS idx_series_score ON series_completions(series_id, week_id, best_score DESC);

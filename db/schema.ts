export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS game_runs (
    id TEXT PRIMARY KEY,
    started_at BIGINT NOT NULL,
    completed_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 12),
    score_ms INTEGER NOT NULL CHECK(score_ms BETWEEN 10000 AND 900000),
    sparks INTEGER NOT NULL DEFAULT 0 CHECK(sparks BETWEEN 0 AND 24),
    day_key TEXT NOT NULL,
    week_key TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY(run_id) REFERENCES game_runs(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_day_time ON scores(day_key, score_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_week_time ON scores(week_key, score_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(score_ms)`,
  `CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS run_context (
    run_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    modifier_id TEXT NOT NULL,
    FOREIGN KEY(run_id) REFERENCES game_runs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS crest_scores (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 12),
    score_ms INTEGER NOT NULL CHECK(score_ms BETWEEN 10000 AND 900000),
    sparks INTEGER NOT NULL DEFAULT 0 CHECK(sparks >= 0),
    course_id TEXT NOT NULL,
    modifier_id TEXT NOT NULL,
    crest_score INTEGER NOT NULL DEFAULT 0,
    light_total INTEGER NOT NULL DEFAULT 0,
    hits INTEGER NOT NULL DEFAULT 0,
    day_key TEXT NOT NULL,
    week_key TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    challenge_id TEXT NOT NULL DEFAULT 'legacy',
    FOREIGN KEY(run_id) REFERENCES game_runs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS game_events (
    id BIGSERIAL PRIMARY KEY,
    player_id TEXT,
    event_name TEXT NOT NULL,
    course_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS game_event_details (
    event_id BIGINT PRIMARY KEY,
    metadata TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES game_events(id)
  )`,
  `CREATE TABLE IF NOT EXISTS request_limits (
    bucket_key TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL,
    expires_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_crest_scores_day_course ON crest_scores(day_key, course_id, score_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_crest_scores_week ON crest_scores(week_key, player_id, day_key)`,
  `CREATE INDEX IF NOT EXISTS idx_crest_scores_player ON crest_scores(player_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_day ON game_events(day_key, event_name)`,
  `CREATE INDEX IF NOT EXISTS idx_request_limits_expiry ON request_limits(expires_at)`,
  `CREATE TABLE IF NOT EXISTS series_completions (
    id BIGSERIAL PRIMARY KEY,
    player_id TEXT NOT NULL,
    series_id TEXT NOT NULL,
    week_id TEXT NOT NULL,
    best_time_ms INTEGER NOT NULL CHECK(best_time_ms BETWEEN 10000 AND 900000),
    lights INTEGER NOT NULL DEFAULT 0 CHECK(lights BETWEEN 0 AND 120),
    best_score INTEGER NOT NULL DEFAULT 0,
    light_total INTEGER NOT NULL DEFAULT 0,
    signature_count INTEGER NOT NULL DEFAULT 0,
    completed_at BIGINT NOT NULL,
    UNIQUE(player_id, week_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_series_completions_series_week ON series_completions(series_id, week_id, completed_at)`,
  `CREATE TABLE IF NOT EXISTS community_light_contributions (
    contribution_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('daily', 'series')),
    source_id TEXT NOT NULL,
    lights INTEGER NOT NULL CHECK(lights BETWEEN 0 AND 120),
    day_key TEXT NOT NULL,
    week_key TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_community_light_week ON community_light_contributions(week_key, created_at)`,
];

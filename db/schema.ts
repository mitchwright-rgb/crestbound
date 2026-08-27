export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS game_runs (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 12),
    score_ms INTEGER NOT NULL CHECK(score_ms BETWEEN 10000 AND 900000),
    sparks INTEGER NOT NULL DEFAULT 0 CHECK(sparks BETWEEN 0 AND 24),
    day_key TEXT NOT NULL,
    week_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(run_id) REFERENCES game_runs(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_day_time ON scores(day_key, score_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_week_time ON scores(week_key, score_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(score_ms)`,
  `CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS run_context (
    run_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    modifier_id TEXT NOT NULL,
    FOREIGN KEY(run_id) REFERENCES game_runs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS crest_scores (
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
  )`,
  `CREATE TABLE IF NOT EXISTS game_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT,
    event_name TEXT NOT NULL,
    course_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS game_event_details (
    event_id INTEGER PRIMARY KEY,
    metadata TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES game_events(id)
  )`,
  `CREATE TABLE IF NOT EXISTS request_limits (
    bucket_key TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_crest_scores_day_course ON crest_scores(day_key, course_id, score_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_crest_scores_week ON crest_scores(week_key, player_id, day_key)`,
  `CREATE INDEX IF NOT EXISTS idx_crest_scores_player ON crest_scores(player_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_day ON game_events(day_key, event_name)`,
  `CREATE INDEX IF NOT EXISTS idx_request_limits_expiry ON request_limits(expires_at)`,
];

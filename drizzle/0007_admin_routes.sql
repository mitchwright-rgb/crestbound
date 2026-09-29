CREATE TABLE IF NOT EXISTS daily_route_overrides (
  day_key TEXT PRIMARY KEY,
  course_id TEXT NOT NULL CHECK(course_id IN ('goldline', 'crosswind', 'nightshift')),
  modifier_id TEXT NOT NULL CHECK(modifier_id IN ('clear', 'tailwind', 'moonstep', 'sparkstorm')),
  objective_id TEXT NOT NULL CHECK(objective_id IN ('sprint', 'light_hunt', 'clean_run', 'skyline_mastery')),
  condition_id TEXT NOT NULL CHECK(condition_id IN ('standard', 'light_rush', 'rooftop_rumble', 'checkpoint_charge')),
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

ALTER TABLE run_context ADD COLUMN IF NOT EXISTS objective_id TEXT NOT NULL DEFAULT 'skyline_mastery';
ALTER TABLE run_context ADD COLUMN IF NOT EXISTS condition_id TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE run_context ADD COLUMN IF NOT EXISTS route_seed INTEGER NOT NULL DEFAULT 0;

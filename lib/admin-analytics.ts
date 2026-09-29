import { database } from './db.ts';
export { difficultyStatus } from './difficulty.ts';

export type PerformanceRow = {
  course_id: string;
  modifier_id: string;
  condition_id: string;
  starts: number;
  finishes: number;
  avg_time_ms: number | null;
  avg_hits: number | null;
  avg_light_percent: number | null;
  avg_score: number | null;
};

export type AnalyticsSnapshot = {
  days: number;
  starts: number;
  finishes: number;
  abandoned: number;
  active: number;
  completionRate: number;
  avgTimeMs: number;
  avgHits: number;
  avgLightPercent: number;
  seriesStarts: number;
  seriesFinishes: number;
  devices: Array<{ device: string; starts: number }>;
  performance: PerformanceRow[];
};

export async function loadAdminAnalytics(days = 14): Promise<AnalyticsSnapshot> {
  const db = database();
  const now = Date.now();
  const since = now - days * 86_400_000;
  const staleBefore = now - 10 * 60_000;
  const [runs, scores, series, devices, performance] = await Promise.all([
    db.prepare(`SELECT
      COUNT(*) starts,
      COUNT(*) FILTER (WHERE completed_at IS NOT NULL) finishes,
      COUNT(*) FILTER (WHERE completed_at IS NULL AND started_at < ?) abandoned,
      COUNT(*) FILTER (WHERE completed_at IS NULL AND started_at >= ?) active
      FROM game_runs WHERE started_at >= ?`).bind(staleBefore, staleBefore, since).first<{ starts: number; finishes: number; abandoned: number; active: number }>(),
    db.prepare(`SELECT COALESCE(AVG(score_ms), 0) avg_time_ms, COALESCE(AVG(hits), 0) avg_hits,
      COALESCE(AVG((sparks::DOUBLE PRECISION / NULLIF(light_total, 0)) * 100), 0) avg_light_percent
      FROM crest_scores WHERE created_at >= ?`).bind(since).first<{ avg_time_ms: number; avg_hits: number; avg_light_percent: number }>(),
    db.prepare(`SELECT
      COUNT(*) FILTER (WHERE r.started_at >= ?) starts,
      COUNT(*) FILTER (WHERE r.started_at >= ? AND r.completed_at IS NOT NULL) finishes
      FROM game_runs r JOIN run_context c ON c.run_id = r.id
      WHERE c.course_id LIKE '%-2026'`).bind(since, since).first<{ starts: number; finishes: number }>(),
    db.prepare(`SELECT COALESCE(details.metadata::jsonb->>'device', 'unknown') device, COUNT(*) starts
      FROM game_events events JOIN game_event_details details ON details.event_id = events.id
      WHERE events.created_at >= ? AND events.event_name IN ('run_start', 'series_start')
      GROUP BY 1 ORDER BY starts DESC`).bind(since).all<{ device: string; starts: number }>(),
    db.prepare(`SELECT c.course_id, c.modifier_id, c.condition_id, COUNT(*) starts,
      COUNT(r.completed_at) finishes,
      AVG(scores.score_ms) avg_time_ms,
      AVG(scores.hits) avg_hits,
      AVG((scores.sparks::DOUBLE PRECISION / NULLIF(scores.light_total, 0)) * 100) avg_light_percent,
      AVG(scores.crest_score) avg_score
      FROM run_context c JOIN game_runs r ON r.id = c.run_id
      LEFT JOIN crest_scores scores ON scores.run_id = r.id
      WHERE r.started_at >= ? AND c.course_id IN ('goldline', 'crosswind', 'nightshift')
      GROUP BY c.course_id, c.modifier_id, c.condition_id
      ORDER BY starts DESC, c.course_id, c.modifier_id, c.condition_id`).bind(since).all<PerformanceRow>(),
  ]);
  const starts = runs?.starts ?? 0;
  const finishes = runs?.finishes ?? 0;
  const abandoned = runs?.abandoned ?? 0;
  const eligible = finishes + abandoned;
  return {
    days,
    starts,
    finishes,
    abandoned,
    active: runs?.active ?? 0,
    completionRate: eligible ? finishes / eligible * 100 : 0,
    avgTimeMs: scores?.avg_time_ms ?? 0,
    avgHits: scores?.avg_hits ?? 0,
    avgLightPercent: scores?.avg_light_percent ?? 0,
    seriesStarts: series?.starts ?? 0,
    seriesFinishes: series?.finishes ?? 0,
    devices: devices.results,
    performance: performance.results,
  };
}

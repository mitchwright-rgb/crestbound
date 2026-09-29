import { NextResponse } from 'next/server';
import { chicagoKeys, database, weeklyCommunityLight } from '@/lib/db';
import { checkNickname, publicNickname } from '@/lib/nickname';
import { rateLimit } from '@/lib/rate-limit';
import { seriesWeekSeed } from '@/app/series-routes';
import { effectiveActiveSeriesForDay } from '@/lib/series-route-data';
import { crestScoreBreakdown } from '@/app/game-rules';
import { buildSeriesCourse } from '@/app/series-course-generator';

const validId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value ?? ''));

function localDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

async function seriesLeaderboard(db: ReturnType<typeof database>, seriesId: string, weekId: string, playerId: string) {
  const leaderboard = await db.prepare(`SELECT sc.player_id,
      COALESCE(players.nickname, 'SUNCRESTER') player_name,
      sc.best_time_ms, sc.lights, sc.best_score
    FROM series_completions sc
    LEFT JOIN players ON players.player_id = sc.player_id
    WHERE sc.series_id = ? AND sc.week_id = ?
    ORDER BY sc.best_score DESC, sc.best_time_ms ASC, sc.completed_at ASC
    LIMIT 10`).bind(seriesId, weekId)
    .all<{ player_id: string; player_name: string; best_time_ms: number; lights: number; best_score: number }>();
  return leaderboard.results.map((row, index) => ({
    rank: index + 1,
    name: publicNickname(row.player_name),
    timeMs: row.best_time_ms,
    lights: row.lights,
    score: row.best_score,
    isPlayer: row.player_id === playerId,
  }));
}

export async function GET(request: Request) {
  const active = await effectiveActiveSeriesForDay(localDay());
  if (!active) return NextResponse.json({ active: false, completions: 0, completedWeeks: [] });
  const params = new URL(request.url).searchParams;
  const playerId = params.get('playerId') ?? '';
  const requestedWeekId = params.get('weekId');
  const requestedIndex = requestedWeekId ? active.series.weeks.findIndex((week) => week.id === requestedWeekId) : active.weekIndex;
  if (requestedIndex < 0 || requestedIndex > active.weekIndex) return NextResponse.json({ error: 'That Series Route is not available yet.' }, { status: 404 });
  const selectedWeek = active.series.weeks[requestedIndex];
  const db = database();
  const summary = await db.prepare('SELECT COUNT(*) completions FROM series_completions WHERE series_id = ? AND week_id = ?')
    .bind(active.series.id, selectedWeek.id).first<{ completions: number }>();
  const entries = await seriesLeaderboard(db, active.series.id, selectedWeek.id, playerId);
  const completed = validId(playerId)
    ? await db.prepare('SELECT week_id FROM series_completions WHERE series_id = ? AND player_id = ? ORDER BY completed_at')
      .bind(active.series.id, playerId).all<{ week_id: string }>()
    : { results: [] as Array<{ week_id: string }> };
  return NextResponse.json({
    active: true,
    completions: summary?.completions ?? 0,
    completedWeeks: completed.results.map((row) => row.week_id),
    entries,
  });
}

export async function POST(request: Request) {
  const active = await effectiveActiveSeriesForDay(localDay());
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const playerId = String(body?.playerId ?? '');
  const seriesId = String(body?.seriesId ?? '');
  const weekId = String(body?.weekId ?? '');
  const timeMs = Math.round(Number(body?.timeMs));
  const lights = Math.round(Number(body?.lights));
  const lightTotal = Math.round(Number(body?.lightTotal));
  const signatureCount = Math.round(Number(body?.signatureCount));
  const runId = String(body?.runId ?? '');
  const suppliedNickname = String(body?.name ?? '').trim();
  const nickname = suppliedNickname ? checkNickname(suppliedNickname) : null;
  const weekIndex = active?.series.weeks.findIndex((week) => week.id === weekId) ?? -1;
  const expectedTotal = active && weekIndex >= 0 ? buildSeriesCourse(weekIndex, seriesWeekSeed(active.series.weeks[weekIndex].sunday)).sparkSeed.length : -1;
  if (!active || weekIndex < 0 || weekIndex > active.weekIndex || !validId(playerId) || !validId(runId) || seriesId !== active.series.id || !Number.isFinite(timeMs) || timeMs < 10000 || timeMs > 900000 || !Number.isInteger(lights) || lights < 0 || lights > expectedTotal || lightTotal !== expectedTotal || !Number.isInteger(signatureCount) || signatureCount < 0 || signatureCount > 3) {
    return NextResponse.json({ error: 'That Series Route could not be verified.' }, { status: 400 });
  }
  const allowance = await rateLimit(request, 'series-finish', playerId, 12, 10 * 60_000);
  if (!allowance.allowed) return NextResponse.json({ error: 'Too many completion attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(allowance.retryAfter) } });
  const now = Date.now();
  const db = database();
  const run = await db.prepare(`SELECT r.started_at, r.completed_at, c.player_id, c.course_id, c.modifier_id, c.challenge_id
    FROM game_runs r JOIN run_context c ON c.run_id = r.id WHERE r.id = ?`).bind(runId)
    .first<{ started_at: number; completed_at: number | null; player_id: string; course_id: string; modifier_id: string; challenge_id: string }>();
  const wallTime = run ? now - run.started_at : 0;
  if (!run || run.completed_at || run.player_id !== playerId || run.course_id !== active.series.id || run.modifier_id !== 'clear' || run.challenge_id !== weekId || wallTime < 10000 || timeMs > wallTime + 3000) {
    return NextResponse.json({ error: 'That Series Route could not be verified.' }, { status: 409 });
  }
  const breakdown = crestScoreBreakdown({ time: timeMs / 1000, sparks: lights, total: lightTotal, signatureCount });
  const keys = chicagoKeys(new Date(now));
  const writes = [db.prepare('UPDATE game_runs SET completed_at = ? WHERE id = ? AND completed_at IS NULL').bind(now, runId),
  db.prepare(`INSERT INTO series_completions (player_id, series_id, week_id, best_time_ms, lights, best_score, light_total, signature_count, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, week_id) DO UPDATE SET
      best_time_ms = CASE WHEN excluded.best_score > series_completions.best_score OR (excluded.best_score = series_completions.best_score AND excluded.best_time_ms < series_completions.best_time_ms) THEN excluded.best_time_ms ELSE series_completions.best_time_ms END,
      lights = CASE WHEN excluded.best_score > series_completions.best_score OR (excluded.best_score = series_completions.best_score AND excluded.best_time_ms < series_completions.best_time_ms) THEN excluded.lights ELSE series_completions.lights END,
      best_score = GREATEST(series_completions.best_score, excluded.best_score),
      light_total = CASE WHEN excluded.best_score >= series_completions.best_score THEN excluded.light_total ELSE series_completions.light_total END,
      signature_count = CASE WHEN excluded.best_score >= series_completions.best_score THEN excluded.signature_count ELSE series_completions.signature_count END,
      completed_at = excluded.completed_at`
  ).bind(playerId, seriesId, weekId, timeMs, lights, breakdown.total, lightTotal, signatureCount, now),
  db.prepare(`INSERT INTO community_light_contributions (contribution_id, player_id, source, source_id, lights, day_key, week_key, created_at)
    VALUES (?, ?, 'series', ?, ?, ?, ?, ?) ON CONFLICT(contribution_id) DO NOTHING`).bind(runId, playerId, weekId, lights, keys.day, keys.week, now)];
  if (nickname?.ok) writes.push(db.prepare(`INSERT INTO players (player_id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET nickname = excluded.nickname, last_seen_at = excluded.last_seen_at`
  ).bind(playerId, nickname.name, now, now));
  await db.batch(writes);
  const summary = await db.prepare('SELECT COUNT(*) completions FROM series_completions WHERE series_id = ? AND week_id = ?')
    .bind(seriesId, weekId).first<{ completions: number }>();
  const entries = await seriesLeaderboard(db, seriesId, weekId, playerId);
  const community = await weeklyCommunityLight(db, keys.week);
  return NextResponse.json({ ok: true, score: breakdown.total, breakdown, completions: summary?.completions ?? 1, entries, community: { lights: community?.lights ?? lights, players: community?.players ?? 1, goal: 2500, contribution: lights } });
}

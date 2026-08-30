import { NextResponse } from 'next/server';
import { chicagoKeys, database } from '@/lib/db';
import { checkNickname } from '@/lib/nickname';
import { rateLimit } from '@/lib/rate-limit';
import { dailyChallengeIdForDay } from '@/lib/daily-challenge';
import { buildSeededCourse } from '@/app/course-generator';
import { challengeMedal, crestScoreBreakdown, dailyObjectiveForSerial } from '@/app/game-rules';
import { activeSeriesForDay } from '@/app/series-routes';

const courses = new Set(['goldline', 'crosswind', 'nightshift', 'declarations']);
const modifiers = new Set(['clear', 'tailwind', 'moonstep', 'sparkstorm']);
const validId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value ?? ''));

function scheduledRun() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const serial = Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 86400000);
  const courseIndex = ((serial % 3) + 3) % 3;
  return {
    serial,
    courseIndex,
    challengeId: dailyChallengeIdForDay(day),
    courseId: ['goldline', 'crosswind', 'nightshift'][courseIndex],
    modifierId: ['clear', 'tailwind', 'moonstep', 'sparkstorm'][((serial + courseIndex) % 4 + 4) % 4],
  };
}

export async function POST(request: Request) {
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const playerId = String(body.playerId ?? '');
  const courseId = String(body.courseId ?? '');
  const modifierId = String(body.modifierId ?? '');
  const challengeId = String(body.challengeId ?? '');
  const scheduled = scheduledRun();

  if (body.action === 'start') {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    const activeSeries = activeSeriesForDay(today);
    const seriesWeekIndex = activeSeries?.series.weeks.findIndex((week) => week.id === challengeId) ?? -1;
    const validSeries = courseId === 'declarations' && modifierId === 'clear' && Boolean(activeSeries) && seriesWeekIndex >= 0 && seriesWeekIndex <= activeSeries!.weekIndex;
    const validDaily = courseId === scheduled.courseId && modifierId === scheduled.modifierId && challengeId === scheduled.challengeId;
    if (!validId(playerId) || !courses.has(courseId) || !modifiers.has(modifierId) || (!validDaily && !validSeries)) return NextResponse.json({ error: 'That route is not currently available.' }, { status: 400 });
    const allowance = await rateLimit(request, 'run-start', playerId, 20, 10 * 60_000);
    if (!allowance.allowed) return NextResponse.json({ error: 'Too many run starts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(allowance.retryAfter) } });
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    await db.batch([
      db.prepare('INSERT INTO game_runs (id, started_at) VALUES (?, ?)').bind(id, startedAt),
      db.prepare('INSERT INTO run_context (run_id, player_id, course_id, modifier_id, challenge_id) VALUES (?, ?, ?, ?, ?)').bind(id, playerId, courseId, modifierId, challengeId),
    ]);
    return NextResponse.json({ runId: id });
  }

  if (body.action !== 'finish') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const runId = String(body.runId ?? '');
  const nickname = checkNickname(body.name);
  const scoreMs = Math.round(Number(body.scoreMs));
  const sparks = Math.round(Number(body.sparks));
  const lightTotal = Math.round(Number(body.lightTotal));
  const hits = Math.round(Number(body.hits));
  if (!nickname.ok) return NextResponse.json({ error: nickname.message }, { status: 400 });
  const name = nickname.name;
  const routeTotal = buildSeededCourse(scheduled.courseIndex, modifierId as 'clear' | 'tailwind' | 'moonstep' | 'sparkstorm', scheduled.serial).sparkSeed.length;
  if (!validId(runId) || !validId(playerId) || !courses.has(courseId) || !modifiers.has(modifierId) || courseId !== scheduled.courseId || modifierId !== scheduled.modifierId || challengeId !== scheduled.challengeId || !Number.isFinite(scoreMs) || scoreMs < 10000 || scoreMs > 900000 || !Number.isInteger(sparks) || sparks < 0 || sparks > routeTotal || lightTotal !== routeTotal || !Number.isInteger(hits) || hits < 0 || hits > 99) return NextResponse.json({ error: 'That run could not be verified.' }, { status: 400 });
  const allowance = await rateLimit(request, 'run-finish', playerId, 20, 10 * 60_000);
  if (!allowance.allowed) return NextResponse.json({ error: 'Too many score attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(allowance.retryAfter) } });

  const run = await db.prepare(`SELECT r.started_at, r.completed_at, c.player_id, c.course_id, c.modifier_id, c.challenge_id
    FROM game_runs r JOIN run_context c ON c.run_id = r.id WHERE r.id = ?`).bind(runId).first<{ started_at: number; completed_at: number | null; player_id: string; course_id: string; modifier_id: string; challenge_id: string }>();
  const wallTime = run ? Date.now() - run.started_at : 0;
  if (!run || run.completed_at || run.player_id !== playerId || run.course_id !== courseId || run.modifier_id !== modifierId || run.challenge_id !== challengeId || wallTime < 10000 || scoreMs > wallTime + 3000) return NextResponse.json({ error: 'That run could not be verified.' }, { status: 409 });

  const now = Date.now();
  const keys = chicagoKeys(new Date(now));
  const objective = dailyObjectiveForSerial(scheduled.serial, scheduled.courseIndex);
  const medal = challengeMedal(objective, { time: scoreMs / 1000, sparks, total: routeTotal, lives: Math.max(0, 3 - hits), hits });
  const breakdown = crestScoreBreakdown({ time: scoreMs / 1000, sparks, total: routeTotal, medal });
  await db.batch([
    db.prepare('UPDATE game_runs SET completed_at = ? WHERE id = ? AND completed_at IS NULL').bind(now, runId),
    db.prepare(`INSERT INTO players (player_id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET nickname = excluded.nickname, last_seen_at = excluded.last_seen_at`).bind(playerId, name, now, now),
    db.prepare(`INSERT INTO crest_scores (run_id, player_id, player_name, score_ms, sparks, course_id, modifier_id, challenge_id, crest_score, light_total, hits, day_key, week_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(runId, playerId, name, scoreMs, sparks, courseId, modifierId, challengeId, breakdown.total, routeTotal, hits, keys.day, keys.week, now),
    db.prepare(`INSERT INTO community_light_contributions (contribution_id, player_id, source, source_id, lights, day_key, week_key, created_at)
      VALUES (?, ?, 'daily', ?, ?, ?, ?, ?) ON CONFLICT(contribution_id) DO NOTHING`).bind(runId, playerId, challengeId, sparks, keys.day, keys.week, now),
    db.prepare('INSERT INTO game_events (player_id, event_name, course_id, day_key, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, 'run_finish', courseId, keys.day, now),
  ]);
  const rank = await db.prepare(`WITH player_runs AS (
    SELECT player_id, score_ms, sparks, crest_score, ROW_NUMBER() OVER (
      PARTITION BY player_id
    ORDER BY crest_score DESC, score_ms ASC, created_at DESC, id DESC
    ) player_run_rank
    FROM crest_scores WHERE day_key = ? AND course_id = ? AND challenge_id = ?
  ) SELECT COUNT(*) + 1 AS rank FROM player_runs
    WHERE player_run_rank = 1 AND (crest_score > ? OR (crest_score = ? AND score_ms < ?))`
  ).bind(keys.day, courseId, challengeId, breakdown.total, breakdown.total, scoreMs).first<{ rank: number }>();
  const community = await db.prepare(`SELECT COALESCE(SUM(lights), 0) lights, COUNT(DISTINCT player_id) players
    FROM community_light_contributions WHERE week_key = ?`).bind(keys.week).first<{ lights: number; players: number }>();
  return NextResponse.json({ ok: true, rank: rank?.rank ?? 1, score: breakdown.total, breakdown, medal, community: { lights: community?.lights ?? sparks, players: community?.players ?? 1, goal: 2500, contribution: sparks } });
}

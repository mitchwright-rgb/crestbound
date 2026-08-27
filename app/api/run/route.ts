import { NextResponse } from 'next/server';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';
import { checkNickname } from '@/lib/nickname';

const courses = new Set(['goldline', 'crosswind', 'nightshift']);
const modifiers = new Set(['clear', 'tailwind', 'moonstep', 'sparkstorm']);
const validId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value ?? ''));

function scheduledRun() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const serial = Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 86400000);
  const courseIndex = ((serial % 3) + 3) % 3;
  return {
    courseId: ['goldline', 'crosswind', 'nightshift'][courseIndex],
    modifierId: ['clear', 'tailwind', 'moonstep', 'sparkstorm'][((serial + courseIndex) % 4 + 4) % 4],
  };
}

export async function POST(request: Request) {
  await ensureSchema();
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const playerId = String(body.playerId ?? '');
  const courseId = String(body.courseId ?? '');
  const modifierId = String(body.modifierId ?? '');
  const scheduled = scheduledRun();

  if (body.action === 'start') {
    if (!validId(playerId) || !courses.has(courseId) || !modifiers.has(modifierId) || courseId !== scheduled.courseId || modifierId !== scheduled.modifierId) return NextResponse.json({ error: 'That is not today\'s ranked course.' }, { status: 400 });
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    await db.batch([
      db.prepare('INSERT INTO game_runs (id, started_at) VALUES (?, ?)').bind(id, startedAt),
      db.prepare('INSERT INTO run_context (run_id, player_id, course_id, modifier_id) VALUES (?, ?, ?, ?)').bind(id, playerId, courseId, modifierId),
    ]);
    return NextResponse.json({ runId: id });
  }

  if (body.action !== 'finish') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const runId = String(body.runId ?? '');
  const nickname = checkNickname(body.name);
  const scoreMs = Math.round(Number(body.scoreMs));
  const sparks = Math.round(Number(body.sparks));
  if (!nickname.ok) return NextResponse.json({ error: nickname.message }, { status: 400 });
  const name = nickname.name;
  if (!validId(runId) || !validId(playerId) || !courses.has(courseId) || !modifiers.has(modifierId) || courseId !== scheduled.courseId || modifierId !== scheduled.modifierId || !Number.isFinite(scoreMs) || scoreMs < 10000 || scoreMs > 900000 || !Number.isInteger(sparks) || sparks < 0 || sparks > 64) return NextResponse.json({ error: 'That run could not be verified.' }, { status: 400 });

  const run = await db.prepare(`SELECT r.started_at, r.completed_at, c.player_id, c.course_id, c.modifier_id
    FROM game_runs r JOIN run_context c ON c.run_id = r.id WHERE r.id = ?`).bind(runId).first<{ started_at: number; completed_at: number | null; player_id: string; course_id: string; modifier_id: string }>();
  const wallTime = run ? Date.now() - run.started_at : 0;
  if (!run || run.completed_at || run.player_id !== playerId || run.course_id !== courseId || run.modifier_id !== modifierId || wallTime < 10000 || scoreMs > wallTime + 3000) return NextResponse.json({ error: 'That run could not be verified.' }, { status: 409 });

  const now = Date.now();
  const keys = chicagoKeys(new Date(now));
  await db.batch([
    db.prepare('UPDATE game_runs SET completed_at = ? WHERE id = ? AND completed_at IS NULL').bind(now, runId),
    db.prepare(`INSERT INTO players (player_id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET nickname = excluded.nickname, last_seen_at = excluded.last_seen_at`).bind(playerId, name, now, now),
    db.prepare(`INSERT INTO crest_scores (run_id, player_id, player_name, score_ms, sparks, course_id, modifier_id, day_key, week_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(runId, playerId, name, scoreMs, sparks, courseId, modifierId, keys.day, keys.week, now),
    db.prepare('INSERT INTO game_events (player_id, event_name, course_id, day_key, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, 'run_finish', courseId, keys.day, now),
  ]);
  const rank = await db.prepare(`SELECT COUNT(*) + 1 AS rank FROM (
    SELECT player_id, MIN(score_ms) AS best_time FROM crest_scores
    WHERE day_key = ? AND course_id = ? GROUP BY player_id HAVING best_time < ?
  )`).bind(keys.day, courseId, scoreMs).first<{ rank: number }>();
  return NextResponse.json({ ok: true, rank: rank?.rank ?? 1 });
}

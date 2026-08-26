import { NextResponse } from 'next/server';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';

const banned = ['FUCK', 'SHIT', 'BITCH', 'ASSHOLE', 'NIGGER', 'FAGGOT'];

export async function POST(request: Request) {
  await ensureSchema();
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  if (body.action === 'start') {
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    await db.prepare('INSERT INTO game_runs (id, started_at) VALUES (?, ?)').bind(id, startedAt).run();
    return NextResponse.json({ runId: id });
  }

  if (body.action !== 'finish') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const runId = String(body.runId ?? '');
  const name = String(body.name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const scoreMs = Math.round(Number(body.scoreMs));
  const sparks = Math.round(Number(body.sparks));
  if (!/^[A-Z0-9 _-]{2,12}$/.test(name) || banned.some((word) => name.includes(word))) {
    return NextResponse.json({ error: 'Choose a 2–12 character nickname.' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isFinite(scoreMs) || scoreMs < 10000 || scoreMs > 900000 || !Number.isInteger(sparks) || sparks < 0 || sparks > 24) {
    return NextResponse.json({ error: 'That run could not be verified.' }, { status: 400 });
  }
  const run = await db.prepare('SELECT started_at, completed_at FROM game_runs WHERE id = ?').bind(runId).first<{ started_at: number; completed_at: number | null }>();
  const wallTime = run ? Date.now() - run.started_at : 0;
  if (!run || run.completed_at || wallTime < 10000 || scoreMs > wallTime + 3000) {
    return NextResponse.json({ error: 'That run could not be verified.' }, { status: 409 });
  }
  const now = Date.now();
  const keys = chicagoKeys(new Date(now));
  await db.batch([
    db.prepare('UPDATE game_runs SET completed_at = ? WHERE id = ? AND completed_at IS NULL').bind(now, runId),
    db.prepare('INSERT INTO scores (run_id, player_name, score_ms, sparks, day_key, week_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(runId, name, scoreMs, sparks, keys.day, keys.week, now),
  ]);
  const rank = await db.prepare(`SELECT COUNT(*) + 1 AS rank FROM (
    SELECT player_name, MIN(score_ms) AS best_time FROM scores
    WHERE day_key = ? GROUP BY player_name HAVING best_time < ?
  )`).bind(keys.day, scoreMs).first<{ rank: number }>();
  return NextResponse.json({ ok: true, rank: rank?.rank ?? 1 });
}

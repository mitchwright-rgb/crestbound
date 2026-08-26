import { NextResponse } from 'next/server';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';

const events = new Set(['home_view', 'run_start', 'dash_learned', 'checkpoint', 'run_finish', 'replay', 'leaderboard_open']);
const courses = new Set(['goldline', 'crosswind', 'nightshift']);

export async function POST(request: Request) {
  await ensureSchema();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const playerId = String(body?.playerId ?? '');
  const eventName = String(body?.eventName ?? '');
  const courseId = String(body?.courseId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !events.has(eventName) || !courses.has(courseId)) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  const now = Date.now();
  await database().prepare('INSERT INTO game_events (player_id, event_name, course_id, day_key, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, eventName, courseId, chicagoKeys().day, now).run();
  return NextResponse.json({ ok: true });
}

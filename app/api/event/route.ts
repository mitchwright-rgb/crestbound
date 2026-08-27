import { NextResponse } from 'next/server';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeEventMetadata } from '@/lib/telemetry';

const events = new Set(['home_view', 'run_start', 'practice_start', 'dash_learned', 'modifier_learned', 'checkpoint', 'life_lost', 'run_over', 'practice_finish', 'run_finish', 'replay', 'pause', 'quit', 'orientation_wait', 'leaderboard_open']);
const courses = new Set(['goldline', 'crosswind', 'nightshift']);

export async function POST(request: Request) {
  await ensureSchema();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const playerId = String(body?.playerId ?? '');
  const eventName = String(body?.eventName ?? '');
  const courseId = String(body?.courseId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !events.has(eventName) || !courses.has(courseId)) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  const allowance = await rateLimit(request, 'event', playerId, 120, 60_000);
  if (!allowance.allowed) return NextResponse.json({ error: 'Too many events.' }, { status: 429, headers: { 'Retry-After': String(allowance.retryAfter) } });
  const now = Date.now();
  const metadata = normalizeEventMetadata(body?.metadata);
  const db = database();
  const result = await db.prepare('INSERT INTO game_events (player_id, event_name, course_id, day_key, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, eventName, courseId, chicagoKeys().day, now).run();
  const eventId = Number(result.meta.last_row_id);
  if (metadata && Number.isInteger(eventId) && eventId > 0) await db.prepare('INSERT INTO game_event_details (event_id, metadata) VALUES (?, ?)').bind(eventId, metadata).run();
  return NextResponse.json({ ok: true });
}

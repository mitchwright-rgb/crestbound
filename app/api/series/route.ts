import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { activeSeriesForDay } from '@/app/series-routes';

const validId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value ?? ''));

function localDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}
export async function GET(request: Request) {
  const active = activeSeriesForDay(localDay());
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
  const completed = validId(playerId)
    ? await db.prepare('SELECT week_id FROM series_completions WHERE series_id = ? AND player_id = ? ORDER BY completed_at')
      .bind(active.series.id, playerId).all<{ week_id: string }>()
    : { results: [] as Array<{ week_id: string }> };
  return NextResponse.json({ active: true, completions: summary?.completions ?? 0, completedWeeks: completed.results.map((row) => row.week_id) });
}

export async function POST(request: Request) {
  const active = activeSeriesForDay(localDay());
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const playerId = String(body?.playerId ?? '');
  const seriesId = String(body?.seriesId ?? '');
  const weekId = String(body?.weekId ?? '');
  const timeMs = Math.round(Number(body?.timeMs));
  const lights = Math.round(Number(body?.lights));
  const weekIndex = active?.series.weeks.findIndex((week) => week.id === weekId) ?? -1;
  if (!active || weekIndex < 0 || weekIndex > active.weekIndex || !validId(playerId) || seriesId !== active.series.id || !Number.isFinite(timeMs) || timeMs < 10000 || timeMs > 900000 || !Number.isInteger(lights) || lights < 0 || lights > 120) {
    return NextResponse.json({ error: 'That Series Route could not be verified.' }, { status: 400 });
  }
  const allowance = await rateLimit(request, 'series-finish', playerId, 12, 10 * 60_000);
  if (!allowance.allowed) return NextResponse.json({ error: 'Too many completion attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(allowance.retryAfter) } });
  const now = Date.now();
  const db = database();
  await db.prepare(`INSERT INTO series_completions (player_id, series_id, week_id, best_time_ms, lights, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, week_id) DO UPDATE SET
      best_time_ms = MIN(series_completions.best_time_ms, excluded.best_time_ms),
      lights = MAX(series_completions.lights, excluded.lights),
      completed_at = excluded.completed_at`
  ).bind(playerId, seriesId, weekId, timeMs, lights, now).run();
  const summary = await db.prepare('SELECT COUNT(*) completions FROM series_completions WHERE series_id = ? AND week_id = ?')
    .bind(seriesId, weekId).first<{ completions: number }>();
  return NextResponse.json({ ok: true, completions: summary?.completions ?? 1 });
}

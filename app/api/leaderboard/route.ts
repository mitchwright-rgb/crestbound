import { NextResponse } from 'next/server';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';

export async function GET(request: Request) {
  await ensureSchema();
  const db = database();
  const url = new URL(request.url);
  const board = ['daily', 'weekly', 'all'].includes(url.searchParams.get('board') ?? '') ? url.searchParams.get('board')! : 'daily';
  const keys = chicagoKeys();
  const filter = board === 'daily' ? { sql: 'WHERE day_key = ?', value: keys.day } : board === 'weekly' ? { sql: 'WHERE week_key = ?', value: keys.week } : null;
  const statement = `SELECT player_name, MIN(score_ms) AS score_ms, MAX(sparks) AS sparks
    FROM scores ${filter?.sql ?? ''}
    GROUP BY player_name ORDER BY score_ms ASC, sparks DESC LIMIT 10`;
  const query = filter ? db.prepare(statement).bind(filter.value) : db.prepare(statement);
  const result = await query.all<{ player_name: string; score_ms: number; sparks: number }>();
  return NextResponse.json({ board, entries: result.results.map((entry, index) => ({ rank: index + 1, name: entry.player_name, timeMs: entry.score_ms, sparks: entry.sparks })) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

import { NextResponse } from 'next/server';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';
import { publicNickname } from '@/lib/nickname';

type Row = { player_id: string; player_name: string; score_ms: number; sparks: number; points?: number; runs?: number; rank?: number };

export async function GET(request: Request) {
  await ensureSchema();
  const db = database();
  const url = new URL(request.url);
  const board = ['daily', 'weekly', 'all'].includes(url.searchParams.get('board') ?? '') ? url.searchParams.get('board')! : 'daily';
  const playerId = url.searchParams.get('playerId') ?? '';
  const courseId = ['goldline', 'crosswind', 'nightshift'].includes(url.searchParams.get('courseId') ?? '') ? url.searchParams.get('courseId')! : 'goldline';
  const keys = chicagoKeys();
  let rows: Row[] = [];

  if (board === 'weekly') {
    const result = await db.prepare(`WITH daily AS (
      SELECT player_id, MAX(player_name) player_name, day_key, MIN(score_ms) score_ms, MAX(sparks) sparks
      FROM crest_scores WHERE week_key = ? GROUP BY player_id, day_key
    ) SELECT player_id, MAX(player_name) player_name, MIN(score_ms) score_ms, MAX(sparks) sparks,
      SUM(CASE WHEN score_ms < 60000 THEN 120 WHEN score_ms < 85000 THEN 90 WHEN score_ms < 120000 THEN 65 ELSE 40 END + sparks) points,
      COUNT(*) runs FROM daily GROUP BY player_id ORDER BY points DESC, score_ms ASC LIMIT 10`).bind(keys.week).all<Row>();
    rows = result.results;
  } else {
    const where = board === 'daily' ? 'WHERE day_key = ? AND course_id = ?' : '';
    const query = db.prepare(`SELECT player_id, MAX(player_name) player_name, MIN(score_ms) score_ms, MAX(sparks) sparks, COUNT(*) runs
      FROM crest_scores ${where} GROUP BY player_id ORDER BY score_ms ASC, sparks DESC LIMIT 10`);
    const result = board === 'daily' ? await query.bind(keys.day, courseId).all<Row>() : await query.all<Row>();
    rows = result.results;
  }

  const dailyRanked = await db.prepare(`WITH best AS (
    SELECT player_id, MAX(player_name) player_name, MIN(score_ms) score_ms, MAX(sparks) sparks
    FROM crest_scores WHERE day_key = ? AND course_id = ? GROUP BY player_id
  ), ranked AS (SELECT *, ROW_NUMBER() OVER (ORDER BY score_ms ASC, sparks DESC) rank FROM best)
  SELECT * FROM ranked ORDER BY rank`).bind(keys.day, courseId).all<Row>();
  const ranked = dailyRanked.results;
  const player = ranked.find((entry) => entry.player_id === playerId);
  const nearby = player ? ranked.filter((entry) => Math.abs(Number(entry.rank) - Number(player.rank)) <= 2) : [];
  const summary = await db.prepare(`WITH best AS (
    SELECT player_id, MAX(sparks) sparks FROM crest_scores WHERE day_key = ? AND course_id = ? GROUP BY player_id
  ) SELECT COUNT(*) players, COALESCE(SUM(sparks), 0) lights FROM best`).bind(keys.day, courseId).first<{ players: number; lights: number }>();
  const recent = await db.prepare(`SELECT player_name FROM crest_scores WHERE day_key = ? AND course_id = ? ORDER BY created_at DESC LIMIT 5`).bind(keys.day, courseId).all<{ player_name: string }>();

  return NextResponse.json({
    board,
    entries: rows.map((entry, index) => ({ rank: index + 1, name: publicNickname(entry.player_name), timeMs: entry.score_ms, sparks: entry.sparks, points: entry.points, runs: entry.runs })),
    players: summary?.players ?? 0, lights: summary?.lights ?? 0, goal: 2500,
    playerRank: player?.rank ?? null,
    nearby: nearby.map((entry) => ({ rank: entry.rank, name: publicNickname(entry.player_name), timeMs: entry.score_ms, sparks: entry.sparks })),
    recent: recent.results.map((entry) => publicNickname(entry.player_name)),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

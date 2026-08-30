import { NextResponse } from 'next/server';
import { chicagoKeys, database, weeklyCommunityLight } from '@/lib/db';
import { publicNickname } from '@/lib/nickname';
import { dailyChallengeIdForDay } from '@/lib/daily-challenge';

type Row = { player_id: string; player_name: string; score_ms: number; sparks: number; crest_score: number; points?: number; runs?: number; rank?: number };

export async function GET(request: Request) {
  const db = database();
  const url = new URL(request.url);
  const board = ['daily', 'weekly', 'all'].includes(url.searchParams.get('board') ?? '') ? url.searchParams.get('board')! : 'daily';
  const playerId = url.searchParams.get('playerId') ?? '';
  const courseId = ['goldline', 'crosswind', 'nightshift'].includes(url.searchParams.get('courseId') ?? '') ? url.searchParams.get('courseId')! : 'goldline';
  const keys = chicagoKeys();
  const challengeId = dailyChallengeIdForDay(keys.day);
  let rows: Row[] = [];

  if (board === 'weekly') {
    const result = await db.prepare(`WITH ranked_runs AS (
      SELECT cs.*, ROW_NUMBER() OVER (
        PARTITION BY cs.player_id, cs.day_key
        ORDER BY cs.crest_score DESC, cs.score_ms ASC, cs.created_at DESC, cs.id DESC
      ) daily_run_rank
      FROM crest_scores cs WHERE cs.week_key = ?
    ), daily AS (
      SELECT * FROM ranked_runs WHERE daily_run_rank = 1
    ), totals AS (
      SELECT player_id, MIN(score_ms) score_ms, MAX(sparks) sparks, SUM(crest_score) crest_score,
        SUM(crest_score) points,
        COUNT(*) runs
      FROM daily GROUP BY player_id
    ) SELECT totals.player_id, COALESCE(players.nickname, 'SUNCRESTER') player_name,
      totals.score_ms, totals.sparks, totals.crest_score, totals.points, totals.runs
      FROM totals LEFT JOIN players ON players.player_id = totals.player_id
      ORDER BY totals.crest_score DESC, totals.score_ms ASC LIMIT 10`).bind(keys.week).all<Row>();
    rows = result.results;
  } else {
    const where = board === 'daily' ? 'WHERE cs.day_key = ? AND cs.course_id = ? AND cs.challenge_id = ?' : '';
    const query = db.prepare(`WITH ranked_runs AS (
      SELECT cs.*, COUNT(*) OVER (PARTITION BY cs.player_id) runs,
        ROW_NUMBER() OVER (
          PARTITION BY cs.player_id
          ORDER BY cs.crest_score DESC, cs.score_ms ASC, cs.created_at DESC, cs.id DESC
        ) player_run_rank
      FROM crest_scores cs ${where}
    ) SELECT ranked_runs.player_id, COALESCE(players.nickname, ranked_runs.player_name) player_name,
      ranked_runs.score_ms, ranked_runs.sparks, ranked_runs.crest_score, ranked_runs.runs
      FROM ranked_runs LEFT JOIN players ON players.player_id = ranked_runs.player_id
      WHERE ranked_runs.player_run_rank = 1
      ORDER BY ranked_runs.crest_score DESC, ranked_runs.score_ms ASC LIMIT 10`);
    const result = board === 'daily' ? await query.bind(keys.day, courseId, challengeId).all<Row>() : await query.all<Row>();
    rows = result.results;
  }

  const dailyRanked = await db.prepare(`WITH player_runs AS (
    SELECT cs.*, ROW_NUMBER() OVER (
      PARTITION BY cs.player_id
      ORDER BY cs.crest_score DESC, cs.score_ms ASC, cs.created_at DESC, cs.id DESC
    ) player_run_rank
    FROM crest_scores cs WHERE cs.day_key = ? AND cs.course_id = ? AND cs.challenge_id = ?
  ), best AS (
    SELECT player_runs.player_id, COALESCE(players.nickname, player_runs.player_name) player_name,
      player_runs.score_ms, player_runs.sparks, player_runs.crest_score
    FROM player_runs LEFT JOIN players ON players.player_id = player_runs.player_id
    WHERE player_runs.player_run_rank = 1
  ), ranked AS (SELECT *, ROW_NUMBER() OVER (ORDER BY crest_score DESC, score_ms ASC) rank FROM best)
  SELECT * FROM ranked ORDER BY rank`).bind(keys.day, courseId, challengeId).all<Row>();
  const ranked = dailyRanked.results;
  const player = ranked.find((entry) => entry.player_id === playerId);
  const nearby = player ? ranked.filter((entry) => Math.abs(Number(entry.rank) - Number(player.rank)) <= 2) : [];
  const summary = await weeklyCommunityLight(db, keys.week);
  const recent = await db.prepare(`SELECT COALESCE(players.nickname, crest_scores.player_name) player_name
    FROM crest_scores LEFT JOIN players ON players.player_id = crest_scores.player_id
    WHERE crest_scores.day_key = ? AND crest_scores.course_id = ? AND crest_scores.challenge_id = ?
    ORDER BY crest_scores.created_at DESC LIMIT 5`).bind(keys.day, courseId, challengeId).all<{ player_name: string }>();

  return NextResponse.json({
    board,
    entries: rows.map((entry, index) => ({ rank: index + 1, name: publicNickname(entry.player_name), score: entry.crest_score, timeMs: entry.score_ms, sparks: entry.sparks, points: entry.points, runs: entry.runs })),
    players: summary?.players ?? 0, lights: summary?.lights ?? 0, goal: 2500,
    playerRank: player?.rank ?? null,
    nearby: nearby.map((entry) => ({ rank: entry.rank, name: publicNickname(entry.player_name), score: entry.crest_score, timeMs: entry.score_ms, sparks: entry.sparks })),
    recent: recent.results.map((entry) => publicNickname(entry.player_name)),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

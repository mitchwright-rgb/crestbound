import { env } from 'cloudflare:workers';
import { schemaStatements } from '@/db/schema';

export function database() {
  return (env as unknown as { DB: D1Database }).DB;
}

let initialized: Promise<void> | null = null;

export function ensureSchema() {
  initialized ??= (async () => {
    const db = database();
    await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  })();
  return initialized;
}

export function chicagoKeys(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = `${value.year}-${value.month}-${value.day}`;
  const local = new Date(`${day}T12:00:00Z`);
  const sunday = new Date(local);
  sunday.setUTCDate(local.getUTCDate() - local.getUTCDay());
  return { day, week: sunday.toISOString().slice(0, 10) };
}

export async function weeklyCommunityLight(db: D1Database, weekKey: string) {
  return db.prepare(`WITH earned_light AS (
    SELECT player_id, lights
    FROM community_light_contributions
    WHERE week_key = ?
    UNION ALL
    SELECT legacy.player_id, legacy.sparks lights
    FROM crest_scores legacy
    WHERE legacy.week_key = ?
      AND NOT EXISTS (
        SELECT 1 FROM community_light_contributions contribution
        WHERE contribution.source = 'daily' AND contribution.source_id = legacy.run_id
      )
  )
  SELECT COUNT(DISTINCT player_id) players, COALESCE(SUM(lights), 0) lights
  FROM earned_light`).bind(weekKey, weekKey).first<{ players: number; lights: number }>();
}

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { schemaStatements } from '@/db/schema';

type QueryRow = Record<string, unknown>;
type QueryResult<T> = { results: T[] };
type RunResult = { success: boolean; meta: { changes: number; last_row_id: number } };

const numericColumns = new Set([
  'id', 'started_at', 'completed_at', 'score_ms', 'sparks', 'crest_score', 'light_total',
  'hits', 'created_at', 'best_time_ms', 'lights', 'best_score', 'signature_count',
  'request_count', 'expires_at', 'completions', 'players', 'rank', 'runs', 'points',
  'route_seed',
]);

function normalizeRow<T>(row: QueryRow): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === 'string' && numericColumns.has(key) && /^-?\d+$/.test(value) ? Number(value) : value,
  ])) as T;
}

function postgresQuery(query: string) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

let sqlClient: NeonQueryFunction<false, false> | null = null;
function sql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured. Connect a Neon database before running the API.');
    sqlClient = neon(url);
  }
  return sqlClient;
}

export class PreparedStatement {
  constructor(readonly query: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) { return new PreparedStatement(this.query, params); }
  async all<T>(): Promise<QueryResult<T>> {
    const rows = await sql().query(postgresQuery(this.query), this.params);
    return { results: rows.map((row) => normalizeRow<T>(row as QueryRow)) };
  }
  async first<T>(): Promise<T | null> {
    const result = await this.all<T>();
    return result.results[0] ?? null;
  }
  async run(): Promise<RunResult> {
    const statement = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(this.query) && !/\bRETURNING\b/i.test(this.query)
      ? `${this.query} RETURNING *`
      : this.query;
    const rows = await sql().query(postgresQuery(statement), this.params);
    const first = rows[0] as QueryRow | undefined;
    return { success: true, meta: { changes: rows.length, last_row_id: Number(first?.id ?? 0) } };
  }
}

export type CrestboundDatabase = ReturnType<typeof database>;

export function database() {
  return {
    prepare(query: string) { return new PreparedStatement(query); },
    async batch(statements: PreparedStatement[]) {
      const results = await sql().transaction((transaction) => statements.map((statement) => transaction.query(postgresQuery(statement.query), statement.params)));
      return results.map((rows) => ({ results: rows.map((row) => normalizeRow(row as QueryRow)) }));
    },
  };
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

export async function weeklyCommunityLight(db: CrestboundDatabase, weekKey: string) {
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

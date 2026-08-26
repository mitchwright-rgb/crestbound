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
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((local.getTime() - yearStart.getTime()) / 86400000) + yearStart.getUTCDay() + 1) / 7);
  return { day, week: `${value.year}-W${String(week).padStart(2, '0')}` };
}

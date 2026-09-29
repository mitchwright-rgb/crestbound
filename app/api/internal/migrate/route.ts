import { createHash, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const expectedTokenHash = 'd299102f287d3e325978818afb84bcbb8a1ee37256a1d71aa96464bc09812f3a';

function authorized(token: string | null) {
  if (!token) return false;
  const actual = Buffer.from(createHash('sha256').update(token).digest('hex'));
  const expected = Buffer.from(expectedTokenHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (process.env.CRESTBOUND_MIGRATION_PREVIEW !== '1' || !authorized(request.headers.get('x-migration-token'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

  const payload = await request.json() as { statements?: unknown };
  if (!Array.isArray(payload.statements) || payload.statements.length === 0 || payload.statements.length > 40
    || payload.statements.some((statement: unknown) => typeof statement !== 'string' || statement.length > 100_000)) {
    return NextResponse.json({ error: 'Invalid migration payload' }, { status: 400 });
  }
  const statements = payload.statements as string[];

  const sql = neon(databaseUrl);
  await sql.transaction((transaction) => statements.map((statement) => transaction.query(statement)));
  return NextResponse.json({ ok: true, statements: statements.length });
}

import { neon } from '@neondatabase/serverless';
import { schemaStatements } from '../db/schema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const sql = neon(databaseUrl);
for (const statement of schemaStatements) await sql.query(statement);

console.log(`Applied ${schemaStatements.length} Crestbound schema statements.`);

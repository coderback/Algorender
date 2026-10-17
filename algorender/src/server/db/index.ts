// The database connection, server-only. Two drivers, one schema:
// - DATABASE_URL set: any Postgres (Neon, Supabase's Postgres, a local
//   server) through node-postgres. Apply migrations first with
//   `npm run db:migrate`; this module never migrates a real database.
// - Otherwise: PGlite, Postgres compiled to WebAssembly, in-process. It keeps
//   its files in PGLITE_DIR (default .data/pglite) and migrates itself on
//   start, so development and the e2e suite need no setup. Vercel's functions
//   have no lasting disk, so there DATABASE_URL is required.
// Tests make their own in-memory PGlite with `createTestDatabase()`.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { schema } from './schema';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS = path.join(process.cwd(), 'drizzle');

let opened: Promise<Database> | null = null;

/** The app's database, opened (and for PGlite, migrated) on first use. */
export function getDatabase(): Promise<Database> {
  opened ??= open().catch((e) => {
    opened = null; // let the next request try again
    throw e;
  });
  return opened;
}

async function open(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) return drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema }) as unknown as Database;
  if (process.env.VERCEL) throw new Error('Accounts need a database: set DATABASE_URL.');
  // A local directory, never deployed (Vercel needs DATABASE_URL): don't let the bundler trace it.
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite'));
  // PGlite makes its own folder, but not the ones above it (.data on a fresh checkout).
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Database;
}

/** A fresh, migrated, in-memory database for tests. */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Database, close: () => client.close() };
}

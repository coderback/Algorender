// Applies the migrations in drizzle/ to the Postgres in DATABASE_URL (Neon,
// or any Postgres). Run it before deploying a schema change: the app never
// migrates the production database itself. Local development uses PGlite,
// which migrates on start (src/server/db/index.ts).
//
// `--on-build` (run by prebuild) migrates only a Vercel preview build with
// MIGRATE_ON_BUILD=1, which is set on the Preview environment alone, once it
// has its own database (a Neon branch per preview). Anywhere else, including
// production and CI, it does nothing.

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

if (process.argv.includes('--on-build')) {
  if (process.env.MIGRATE_ON_BUILD !== '1') process.exit(0);
  if (process.env.VERCEL_ENV !== 'preview') {
    console.error(`MIGRATE_ON_BUILD is for preview builds only (this is ${process.env.VERCEL_ENV ?? 'not Vercel'}): migrate production by hand.`);
    process.exit(1);
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the database to migrate.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}

// Applies the migrations in drizzle/ to the Postgres in DATABASE_URL (Neon,
// or any Postgres). Run it before deploying a schema change: the app never
// migrates a real database itself. Local development uses PGlite, which
// migrates on start (src/server/db/index.ts).

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

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

import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes a migration into drizzle/ from src/server/db/schema.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
});

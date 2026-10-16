// Accounts, with Better Auth inside the Next.js app (REVAMP_PLAN.md §6.7):
// email and password always; GitHub and Google sign-in when their keys are
// set. Sessions live in the database (src/server/db/schema.ts) behind an
// httpOnly cookie.
//
// Environment:
//   BETTER_AUTH_SECRET     signs cookies and tokens; required on Vercel (any
//                          long random string). Local runs fall back to a
//                          development secret.
//   BETTER_AUTH_URL        the site's public URL, when it can't be told from
//                          the request (behind some proxies).
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID /
//   GOOGLE_CLIENT_SECRET   turn on those sign-in buttons.
//   BETTER_AUTH_RATE_LIMIT=off   turns off rate limiting, for the local e2e
//                          server, whose tests sign up many learners from one
//                          address. Ignored on Vercel.
//
// Sign-in, sign-up and the rest are rate limited per address in production
// (Better Auth's defaults), with the counters in the database.
//
// Requests from another origin, including the code sandbox's opaque `null`
// origin, are refused: Better Auth checks the Origin of every state-changing
// request against the site and `trustedOrigins`.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDatabase, type Database } from './db';
import { schema } from './db/schema';

const DEV_SECRET = 'algorender-development-secret-not-for-production-use';

export function createAuth(db: Database, { rateLimit }: { rateLimit?: boolean } = {}) {
  const secret = process.env.BETTER_AUTH_SECRET ?? (process.env.VERCEL ? undefined : DEV_SECRET);
  if (!secret) throw new Error('Accounts need BETTER_AUTH_SECRET.');
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  return betterAuth({
    appName: 'Algorender',
    secret,
    ...(process.env.BETTER_AUTH_URL && { baseURL: process.env.BETTER_AUTH_URL }),
    // Local servers (next dev on 3000, the e2e server on 3100) are trusted only off Vercel.
    trustedOrigins: process.env.VERCEL ? [] : ['http://localhost:3000', 'http://localhost:3100'],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit },
    }),
    rateLimit: {
      storage: 'database',
      enabled: rateLimit ?? (process.env.NODE_ENV === 'production' && (process.env.VERCEL != null || process.env.BETTER_AUTH_RATE_LIMIT !== 'off')),
    },
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
    socialProviders: {
      ...(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && { github: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET } }),
      ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } }),
    },
    // Better Auth checks Origin on state-changing requests except under a test
    // runner; check it there too, so the tests prove what production does.
    advanced: { disableOriginCheck: false },
    // Deleting an account deletes its progress too (the tables cascade).
    user: { deleteUser: { enabled: true } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Promise<Auth> | null = null;

/** The app's Better Auth instance, made once the database is open. */
export function getAuth(): Promise<Auth> {
  auth ??= getDatabase()
    .then(createAuth)
    .catch((e) => {
      auth = null;
      throw e;
    });
  return auth;
}

// The database: Better Auth's four tables (user, session, account,
// verification, in the shape its Drizzle adapter expects) and the learner's
// progress as an append-only event log.
//
// Progress is event-sourced: every lesson finished, problem submitted and
// review rated is an event made on the learner's device (a UUIDv7 id, so ids
// sort by time) and pushed here when they're signed in. Everything else
// (solved problems, review cards and their schedules) is worked out from the
// events, on the device (src/progress/), so it works offline and two devices
// merge by taking the union of their events.
//
// Change a table here, then `npm run db:generate` writes the migration into
// drizzle/; PGlite applies it on start, Postgres with `npm run db:migrate`.

import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/**
 * Better Auth's rate-limit counters (sign-in attempts per address), kept in
 * the database so every server instance shares them.
 */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

/**
 * A learner's progress events. The id is made on the device (UUIDv7), so a
 * push can be retried safely: the pair (user, id) is stored once. `seq` is
 * the server's own order, which devices use as a cursor to pull what other
 * devices pushed.
 */
export const progressEvent = pgTable(
  'progress_event',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    id: uuid('id').notNull(),
    seq: bigserial('seq', { mode: 'number' }).notNull().unique(),
    kind: text('kind').notNull(),
    /** When it happened, on the device's clock. */
    at: timestamp('at', { withTimezone: true, mode: 'string' }).notNull(),
    data: jsonb('data').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('progress_event_user_seq_idx').on(t.userId, t.seq)],
);

/**
 * Every run of the server judge (Java, C++, Go), and every expected answer to
 * a learner's own test (kind 'expected'): what was judged and how it
 * went. Quotas count these rows, and a row still 'running' stops a learner
 * from starting a second run at once.
 */
export const judgeRun = pgTable(
  'judge_run',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    problem: text('problem').notNull(),
    language: text('language').notNull(),
    /** 'run' (the examples), 'submit' (every test), 'custom' (the learner's own test) or 'expected' (the reference solution's answer to it, expected.ts). */
    kind: text('kind').notNull(),
    /** 'running', 'done', or 'failed' (the sandbox broke, not the learner's code). */
    status: text('status').notNull(),
    tests: integer('tests').notNull(),
    failed: integer('failed'),
    /** Seconds the sandbox took, compiling included. */
    seconds: real('seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('judge_run_user_created_idx').on(t.userId, t.createdAt)],
);

/**
 * Every AI tutor turn: who asked about what, at which hint level, and what
 * the model calls cost. Daily turn limits, the hint ladder (one level at a
 * time per item) and the global daily spend cap all count these rows.
 */
export const tutorTurn = pgTable(
  'tutor_turn',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** What the help was about, e.g. 'problem:two-sum', 'exercise:bubble-sort' or 'lesson:binary-search:why-sorted'. */
    item: text('item').notNull(),
    /** 'hint' (the ladder), 'review' (find the bug, don't fix it), 'ask' (a follow-up question) or 'explain' (scoring an explanation; level 0). */
    action: text('action').notNull(),
    /** The hint level answered at: 1 concept, 2 where to look, 3 pseudo-code, 4 a partial fix. */
    level: integer('level').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
    /** The reply gave too much away and was replaced. */
    leakBlocked: boolean('leak_blocked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tutor_turn_user_created_idx').on(t.userId, t.createdAt), index('tutor_turn_created_idx').on(t.createdAt)],
);

/**
 * A mock interview round (src/server/interview/). The server is its clock and
 * its state machine: phase changes are stamped here, so the time a round
 * took can't be edited on a device. Its model calls are `tutor_turn` rows
 * (actions 'interview' and 'debrief', item 'interview:<id>'), so the tutor's
 * daily spend cap covers them too.
 */
export const interviewRound = pgTable(
  'interview_round',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** 'coding' (a practice problem) or 'design' (a case study's interview variant). */
    format: text('format').notNull(),
    /** The problem's slug, or the case study's. */
    item: text('item').notNull(),
    /** A design round's interview variant (src/content/designs/interviews/). */
    variant: text('variant'),
    /** A coding round's language; none for a design round. */
    language: text('language'),
    /** Minutes the round is set for. */
    limitMin: integer('limit_min').notNull(),
    /** 'clarify', 'approach', 'code', 'test' or 'debrief'. */
    phase: text('phase').notNull(),
    /** When each phase started (ISO times by phase). */
    phases: jsonb('phases').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** The highest hint level used (0–3). */
    hints: integer('hints').notNull().default(0),
    /** Interviewer replies from the model so far (capped per round). */
    replies: integer('replies').notNull().default(0),
    /** The conversation: who said what, in which phase, and when. */
    transcript: jsonb('transcript').notNull(),
    /** The approach as stated: text, time and space complexity (a design round: the design explained, text only). */
    approach: jsonb('approach'),
    /** A design round's estimates as typed and read: id, text, value. */
    estimates: jsonb('estimates'),
    /** A design round's design as it stood at the last check or action. */
    design: jsonb('design'),
    /** The cases the learner said they'd test. */
    edgeCases: text('edge_cases'),
    /** The code as it stood at the last submission or the end. */
    code: text('code'),
    /** Each submission: tests run and failed, and whether the server judged it. A design round's checks: targets as tests, missed as failed. */
    submissions: jsonb('submissions').notNull(),
    /** The debrief: a score, evidence and feedback per dimension, and what to work on. */
    debrief: jsonb('debrief'),
    /** The round was solved by the end: its last submission passed every test. */
    passed: boolean('passed'),
    /** Who scored the model's dimensions: 'model', 'self', or 'pending' (the model couldn't; the learner scores them). */
    scoredBy: text('scored_by'),
    /** The problem was solved before the round started. */
    repeat: boolean('repeat').notNull().default(false),
    /** The `interview.finished` event written for it. */
    eventId: uuid('event_id'),
    /** Dollars the round's model calls cost. */
    costUsd: real('cost_usd').notNull().default(0),
  },
  (t) => [index('interview_round_user_started_idx').on(t.userId, t.startedAt)],
);

export const schema = { user, session, account, verification, rateLimit, progressEvent, judgeRun, tutorTurn, interviewRound };

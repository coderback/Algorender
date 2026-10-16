// Accounts and progress sync against a real (in-memory) Postgres: PGlite with
// the app's migrations applied.

import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProgressEvent } from '@/progress/events';
import { createAuth, type Auth } from './auth';
import { createTestDatabase, type Database } from './db';
import { progressEvent, rateLimit, user } from './db/schema';
import { sameOrigin } from './http';
import { MAX_PULL, MAX_PUSH, parseSyncRequest, sync, SyncError } from './progress';

let db: Database;
let close: () => Promise<void>;
let auth: Auth;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  auth = createAuth(db);
}, 60_000);

afterAll(async () => {
  await close();
});

/** Signs up a new learner and returns their id and session cookie. */
async function signUp(email: string): Promise<{ id: string; cookie: string }> {
  const res = await auth.api.signUpEmail({ body: { email, password: 'correct horse battery', name: 'Ada' }, asResponse: true });
  expect(res.status).toBe(200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, cookie };
}

const event = (kind: ProgressEvent['kind'], data: ProgressEvent['data'], at = new Date().toISOString()): ProgressEvent =>
  ({ id: uuidv7(), kind, at, data }) as ProgressEvent;

const solved = (problem: string) => event('problem.submitted', { problem, language: 'python', passed: true, tests: 10, failed: 0 });

describe('accounts', () => {
  it('signs up, keeps a session in a cookie, and signs in again with the password', async () => {
    const { id, cookie } = await signUp('ada@example.com');
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ id, email: 'ada@example.com', name: 'Ada' });

    const again = await auth.api.signInEmail({ body: { email: 'ada@example.com', password: 'correct horse battery' } });
    expect(again.user.id).toBe(id);
    await expect(auth.api.signInEmail({ body: { email: 'ada@example.com', password: 'wrong password!' } })).rejects.toThrow();
  });

  it('refuses a second account with the same email, and short passwords', async () => {
    await signUp('grace@example.com');
    await expect(auth.api.signUpEmail({ body: { email: 'grace@example.com', password: 'another password', name: 'G' } })).rejects.toThrow();
    await expect(auth.api.signUpEmail({ body: { email: 'short@example.com', password: 'short', name: 'S' } })).rejects.toThrow();
  });

  it('rate limits repeated sign-in attempts from one address, counting in the database', async () => {
    const limited = createAuth(db, { rateLimit: true });
    const attempt = () =>
      limited.handler(
        new Request('http://localhost:3000/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.7' },
          body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong password!' }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    expect((await db.select().from(rateLimit)).length).toBeGreaterThan(0);
  });

  it('refuses a sign-in posted from another site', async () => {
    const res = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: 'x=1' },
        body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('has no session without a cookie', async () => {
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});

describe('progress sync', () => {
  it('stores pushed events once, however often they are pushed', async () => {
    const { id } = await signUp('push@example.com');
    const events = [solved('two-sum'), event('lesson.completed', { lesson: 'recursion', done: true })];
    const first = await sync(db, id, { events, cursor: 0 });
    expect(first.accepted).toEqual(events.map((e) => e.id));
    expect(first.events.map((e) => e.id)).toEqual(events.map((e) => e.id));
    const again = await sync(db, id, { events, cursor: 0 });
    expect(again.events).toHaveLength(2);
    expect(again.cursor).toBe(first.cursor);
    // Nothing new after the cursor.
    expect((await sync(db, id, { events: [], cursor: first.cursor })).events).toEqual([]);
  });

  it('gives each learner only their own events, even with a reused id', async () => {
    const a = await signUp('a@example.com');
    const b = await sync(db, (await signUp('b@example.com')).id, { events: [], cursor: 0 });
    expect(b.events).toEqual([]);
    const e = solved('three-sum');
    await sync(db, a.id, { events: [e], cursor: 0 });
    const c = await signUp('c@example.com');
    // Another learner pushing the same id stores their own copy, and never sees a's.
    const res = await sync(db, c.id, { events: [{ ...e, data: { ...e.data, problem: 'two-sum' } }], cursor: 0 });
    expect(res.events).toHaveLength(1);
    expect((res.events[0].data as { problem: string }).problem).toBe('two-sum');
  });

  it('round-trips an event exactly, with its time in UTC', async () => {
    const { id } = await signUp('exact@example.com');
    const e = event('review.rated', { card: 'problem:two-sum', rating: 3 }, '2026-10-16T09:30:00.000+01:00');
    const res = await sync(db, id, { events: [e], cursor: 0 });
    expect(res.events[0]).toEqual({ ...e, at: '2026-10-16T08:30:00.000Z' });
  });

  it('refuses malformed events, keeping the rest, and keeps times from a fast clock', async () => {
    const { id } = await signUp('bad@example.com');
    const good = solved('two-sum');
    const future = event('lesson.completed', { lesson: 'recursion', done: true }, new Date(Date.now() + 3 * 86_400_000).toISOString());
    const wrongKind = { ...solved('x'), kind: 'problem.deleted' };
    const badData = { ...solved('x'), data: { problem: 'NOT A SLUG', language: 'cobol' } };
    const res = await sync(db, id, { events: [good, future, wrongKind, badData, 'junk'], cursor: 0 });
    expect(res.accepted).toEqual([good.id, future.id]);
    expect(res.rejected).toEqual([wrongKind.id, badData.id]);
    expect(res.events.map((e) => e.id)).toEqual([good.id, future.id]);
  });

  it('pages a long history through the cursor', async () => {
    const { id } = await signUp('long@example.com');
    const all = Array.from({ length: MAX_PULL + 200 }, (_, i) => event('quiz.answered', { lesson: 'recursion', quiz: 'quiz', question: i % 10, correct: true }));
    for (let i = 0; i < all.length; i += MAX_PUSH) await sync(db, id, { events: all.slice(i, i + MAX_PUSH), cursor: 0 });
    const first = await sync(db, id, { events: [], cursor: 0 });
    expect(first.events).toHaveLength(MAX_PULL);
    expect(first.more).toBe(true);
    const second = await sync(db, id, { events: [], cursor: first.cursor });
    expect(second.events).toHaveLength(200);
    expect(second.more).toBe(false);
    expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(all.length);
  });

  it('deletes a learner’s events with their account', async () => {
    const { id } = await signUp('gone@example.com');
    await sync(db, id, { events: [solved('two-sum')], cursor: 0 });
    await db.delete(user).where(eq(user.id, id));
    expect(await db.select().from(progressEvent).where(eq(progressEvent.userId, id))).toEqual([]);
  });

  it('validates the request body', () => {
    expect(() => parseSyncRequest(null)).toThrow(SyncError);
    expect(() => parseSyncRequest({ events: [], cursor: -1 })).toThrow(SyncError);
    expect(() => parseSyncRequest({ events: 'x', cursor: 0 })).toThrow(SyncError);
    expect(() => parseSyncRequest({ events: Array(MAX_PUSH + 1).fill(null), cursor: 0 })).toThrow(SyncError);
    expect(parseSyncRequest({ events: [], cursor: 5 })).toEqual({ events: [], cursor: 5 });
  });
});

describe('same-origin requests', () => {
  const post = (origin?: string) => new Request('http://localhost:3100/api/progress', { method: 'POST', headers: origin ? { origin } : {} });
  it('accepts the site itself and refuses others, the sandbox and a missing Origin', () => {
    expect(sameOrigin(post('http://localhost:3100'))).toBe(true);
    expect(sameOrigin(post('https://evil.example'))).toBe(false);
    expect(sameOrigin(post('null'))).toBe(false);
    expect(sameOrigin(post())).toBe(false);
  });
});

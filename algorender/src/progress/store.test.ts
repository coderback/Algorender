// The device store end to end: IndexedDB (fake-indexeddb), the real sync
// code (src/server/progress.ts) and an in-memory Postgres standing in for the
// server, with two "devices" (two databases) per learner.

import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type Database } from '@/server/db';
import { user } from '@/server/db/schema';
import { parseSyncRequest, sync } from '@/server/progress';
import { problemProgress } from './projections';
import { ProgressStore, type StoreEnvironment } from './store';

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  await db.insert(user).values([
    { id: 'u1', name: 'Ada', email: 'ada@example.com' },
    { id: 'u2', name: 'Grace', email: 'grace@example.com' },
  ]);
}, 60_000);

afterAll(async () => {
  await close();
});

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key = (i: number) => [...this.map.keys()][i] ?? null;
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, String(v));
  removeItem = (k: string) => void this.map.delete(k);
}

/** A fake network: the sync route's logic, as `session` (a user id, or null when signed out). */
function server(session: { user: string | null }, online = { up: true }): Pick<StoreEnvironment, 'fetch' | 'online'> {
  return {
    online: () => online.up,
    fetch: (async (_url: string, init: RequestInit) => {
      if (!online.up) throw new TypeError('Failed to fetch');
      if (!session.user) return new Response('{}', { status: 401 });
      const body = await sync(db, session.user, parseSyncRequest(JSON.parse(String(init.body))));
      return Response.json(body);
    }) as typeof fetch,
  };
}

let devices = 0;
function device(env: StoreEnvironment = {}) {
  devices += 1;
  return new ProgressStore({ dbName: `device-${devices}`, storage: new MemoryStorage(), syncDelay: 5, ...env });
}

const solve = (s: ProgressStore, problem: string) => s.record('problem.submitted', { problem, language: 'python', passed: true, tests: 3, failed: 0 });

describe('the device store', () => {
  it('keeps events across visits, in the order they happened', async () => {
    const storage = new MemoryStorage();
    const first = new ProgressStore({ dbName: 'visits', storage });
    await first.start();
    const a = solve(first, 'two-sum');
    const b = first.record('lesson.completed', { lesson: 'recursion', done: true });
    expect(first.getSnapshot().events.map((e) => e.id)).toEqual([a.id, b.id]);
    await first.close();
    // Writes happen after record() returns; give them a moment, then open the same database again.
    await new Promise((r) => setTimeout(r, 50));
    const again = new ProgressStore({ dbName: 'visits', storage });
    await again.start();
    expect(again.getSnapshot()).toMatchObject({ ready: true, owner: null, sync: { state: 'local' } });
    expect(again.getSnapshot().events.map((e) => e.id)).toEqual([a.id, b.id]);
    await again.close();
  });

  it('brings over progress saved the old way, once', async () => {
    const storage = new MemoryStorage();
    storage.setItem('algorender.progress.v1', JSON.stringify({ completed: ['recursion'], quizzes: { 'recursion:check': { correct: 2, total: 3 } }, predictions: {} }));
    storage.setItem('algorender:exercise:bubble-sort', JSON.stringify({ parsons: true, fill: 1 }));
    storage.setItem('algorender:problems', JSON.stringify({ 'two-sum': { solved: '2026-10-01T10:00:00.000Z', languages: ['python', 'javascript'], submissions: 3 } }));
    const s = new ProgressStore({ dbName: 'legacy', storage });
    await s.start();
    const kinds = s.getSnapshot().events.map((e) => e.kind).sort();
    expect(kinds).toEqual(['exercise.passed', 'exercise.passed', 'lesson.completed', 'lesson.scored', 'problem.submitted', 'problem.submitted']);
    expect(problemProgress(s.getSnapshot().events)['two-sum']).toMatchObject({ solved: '2026-10-01T10:00:00.000Z', languages: ['python', 'javascript'] });
    await s.close();
    const again = new ProgressStore({ dbName: 'legacy', storage });
    await again.start();
    expect(again.getSnapshot().events).toHaveLength(6);
    await again.close();
  });

  it('claims anonymous work on sign-in, and another device pulls it', async () => {
    const session = { user: null as string | null };
    const laptop = device(server(session));
    await laptop.start();
    solve(laptop, 'two-sum');
    session.user = 'u1';
    await laptop.setOwner('u1');
    await laptop.syncNow();
    expect(laptop.getSnapshot()).toMatchObject({ owner: 'u1', sync: { state: 'idle', pending: 0 } });

    const phone = device(server(session));
    await phone.setOwner('u1');
    await phone.syncNow();
    expect(Object.keys(problemProgress(phone.getSnapshot().events))).toEqual(['two-sum']);

    // Work on the phone reaches the laptop too.
    solve(phone, 'three-sum');
    await phone.syncNow();
    await laptop.syncNow();
    expect(Object.keys(problemProgress(laptop.getSnapshot().events)).sort()).toEqual(['three-sum', 'two-sum']);
    await laptop.close();
    await phone.close();
  });

  it('keeps working offline and pushes once back online', async () => {
    const session = { user: 'u2' };
    const network = { up: false };
    const s = device(server(session, network));
    await s.setOwner('u2');
    solve(s, 'two-sum');
    await s.syncNow();
    expect(s.getSnapshot().sync).toMatchObject({ state: 'offline', pending: 1 });
    network.up = true;
    await s.syncNow();
    expect(s.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 0 });
    await s.close();
  });

  it('forgets the account on sign-out, but keeps unsent work when a session just expires', async () => {
    const session = { user: 'u2' as string | null };
    const network = { up: true };
    const s = device(server(session, network));
    await s.setOwner('u2');
    await s.syncNow();
    const before = s.getSnapshot().events.length;
    expect(before).toBeGreaterThan(0);

    // The session expires while offline work is waiting: it is hidden, not lost.
    network.up = false;
    solve(s, 'valid-anagram');
    await new Promise((r) => setTimeout(r, 30));
    await s.setOwner(null);
    expect(s.getSnapshot()).toMatchObject({ owner: null, events: [] });
    network.up = true;
    await s.setOwner('u2');
    await s.syncNow();
    expect(Object.keys(problemProgress(s.getSnapshot().events))).toContain('valid-anagram');

    // Signing out on purpose syncs first, then removes the account's events here.
    await s.signOut();
    expect(s.getSnapshot()).toMatchObject({ owner: null, events: [], sync: { state: 'local' } });
    await s.setOwner('u2');
    await s.syncNow();
    expect(s.getSnapshot().events.length).toBe(before + 1);
    await s.close();
  });

  it('says so when the server has signed the learner out', async () => {
    const session = { user: 'u1' as string | null };
    const s = device(server(session));
    await s.setOwner('u1');
    session.user = null;
    solve(s, 'two-sum');
    await s.syncNow();
    expect(s.getSnapshot().sync).toMatchObject({ state: 'error', pending: 1 });
    await s.close();
  });
});

// The device store end to end: IndexedDB (fake-indexeddb), the real sync
// code (src/server/progress.ts) and an in-memory Postgres standing in for the
// server, with two "devices" (two databases) per learner.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type Database } from '@/server/db';
import { user } from '@/server/db/schema';
import { parseSyncRequest, sync } from '@/server/progress';
import { parseEvent } from './events';
import { problemProgress } from './projections';
import { HOLD_RETRY_MS, ProgressStore, type StoreEnvironment } from './store';

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  await db.insert(user).values([
    { id: 'u1', name: 'Ada', email: 'ada@example.com' },
    { id: 'u2', name: 'Grace', email: 'grace@example.com' },
    { id: 'u3', name: 'Edsger', email: 'edsger@example.com' },
    { id: 'u4', name: 'Barbara', email: 'barbara@example.com' },
    { id: 'u5', name: 'Frances', email: 'frances@example.com' },
    { id: 'u6', name: 'Kathleen', email: 'kathleen@example.com' },
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

  it('keeps a verdict the server recorded without sending it back', async () => {
    const session = { user: 'u2' };
    const s = device(server(session));
    await s.start();
    await s.setOwner('u2');
    const verdict = { id: uuidv7(), kind: 'problem.submitted', at: new Date().toISOString(), data: { problem: 'lru-cache', language: 'go', passed: true, tests: 12, failed: 0, verified: true } } as const;
    s.receive(verdict);
    expect(problemProgress(s.getSnapshot().events)['lru-cache']).toMatchObject({ languages: ['go'], submissions: 1 });
    await new Promise((r) => setTimeout(r, 20));
    await s.syncNow();
    expect(s.getSnapshot().sync.pending).toBe(0);
    expect(s.getSnapshot().events.filter((e) => e.id === verdict.id)).toHaveLength(1);
    await s.close();
  });
});

describe('devices on different app versions', () => {
  /** An older app's schema: it doesn't know checkpoints yet. */
  const older = (raw: unknown) => ((raw as { kind?: unknown } | null)?.kind === 'checkpoint.answered' ? null : parseEvent(raw));
  const answer = (s: ProgressStore, index: number) =>
    s.record('checkpoint.answered', { stage: 1, concept: 'vectors', item: `quiz:vectors:check:${index}`, correct: true, index, of: 8 });
  const ids = (s: ProgressStore) => s.getSnapshot().events.map((e) => e.id).sort();

  it('keeps pulled events an older app can’t read, and reads them once upgraded', async () => {
    const session = { user: 'u3' };
    const phone = device(server(session));
    await phone.setOwner('u3');
    const a = answer(phone, 0);
    const b = solve(phone, 'two-sum');
    await phone.syncNow();

    // The laptop still runs an app from before checkpoints (a tab left open, a cached bundle).
    const dbName = 'laptop-upgrading';
    const storage = new MemoryStorage();
    const old = new ProgressStore({ dbName, storage, syncDelay: 5, parse: older, ...server(session) });
    await old.setOwner('u3');
    await old.syncNow();
    expect(ids(old)).toEqual([b.id]);
    // More arrives while it runs.
    const c = answer(phone, 1);
    await phone.syncNow();
    await old.syncNow();
    expect(ids(old)).toEqual([b.id]);
    expect(old.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 0 });
    await old.close();

    // The laptop gets the new app: it has every event, once.
    const upgraded = new ProgressStore({ dbName, storage, syncDelay: 5, ...server(session) });
    await upgraded.start();
    await upgraded.syncNow();
    expect(ids(upgraded)).toEqual([a.id, b.id, c.id].sort());
    expect(upgraded.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 0 });
    await upgraded.syncNow();
    expect(ids(upgraded)).toEqual([a.id, b.id, c.id].sort());
    await upgraded.close();
    await phone.close();
  });

  it('pulls everything again, once, on a device an app from before this fix synced', async () => {
    const session = { user: 'u4' };
    const phone = device(server(session));
    await phone.setOwner('u4');
    const a = answer(phone, 0);
    const b = solve(phone, 'two-sum');
    await phone.syncNow();

    // What that app left: the events it could read, and its cursor past the one it dropped.
    const dbName = 'laptop-before-fix';
    const before = new Dexie(dbName);
    before.version(1).stores({ events: 'id, owner, [owner+synced]', meta: 'key' });
    await before.table('events').put({ ...b, owner: 'u4', synced: 1 });
    await before.table('meta').put({ key: 'cursor:u4', value: (await sync(db, 'u4', { events: [], cursor: 0 })).cursor });
    before.close();

    const storage = new MemoryStorage();
    storage.setItem('algorender:owner', 'u4');
    const upgraded = new ProgressStore({ dbName, storage, syncDelay: 5, ...server(session) });
    await upgraded.start();
    await upgraded.syncNow();
    expect(ids(upgraded)).toEqual([a.id, b.id].sort());
    expect(upgraded.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 0 });
    await upgraded.close();
    await phone.close();
  });

  /** The server, rolled back (while `rolledBack.on`) to a version from before checkpoints: it refuses them as malformed. */
  function olderServer(session: { user: string }, rolledBack: { on: boolean }): Pick<StoreEnvironment, 'fetch' | 'online'> {
    return {
      online: () => true,
      fetch: (async (_url: string, init: RequestInit) => {
        const request = parseSyncRequest(JSON.parse(String(init.body)));
        const unknown = rolledBack.on ? request.events.filter((e) => (e as { kind: string }).kind === 'checkpoint.answered') : [];
        const body = await sync(db, session.user, { ...request, events: request.events.filter((e) => !unknown.includes(e)) });
        return Response.json({ ...body, rejected: [...body.rejected, ...unknown.map((e) => (e as { id: string }).id)] });
      }) as typeof fetch,
    };
  }
  const onServer = async (userId: string) => (await sync(db, userId, { events: [], cursor: 0 })).events.map((e) => e.id).sort();

  it('holds events an older server refuses, and sends them once the newer one is back', async () => {
    const session = { user: 'u5' };
    const rolledBack = { on: true };
    let now = new Date('2026-11-18T09:00:00.000Z');
    const dbName = 'phone-during-rollback';
    const storage = new MemoryStorage();
    const env = { dbName, storage, syncDelay: 5, now: () => now, ...olderServer(session, rolledBack) };
    const phone = new ProgressStore(env);
    await phone.setOwner('u5');
    const a = answer(phone, 0);
    const b = solve(phone, 'two-sum');
    await phone.syncNow();
    // The old server took what it knows; the checkpoint stays on the device, waiting.
    expect(await onServer('u5')).toEqual([b.id]);
    expect(ids(phone)).toEqual([a.id, b.id].sort());
    expect(phone.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 1 });
    await phone.close();

    // The newer deployment is back. Within the hour, a new visit doesn't offer the held event again yet.
    rolledBack.on = false;
    now = new Date(now.getTime() + HOLD_RETRY_MS / 2);
    const later = new ProgressStore(env);
    await later.start();
    await later.syncNow();
    expect(await onServer('u5')).toEqual([b.id]);
    expect(later.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 1 });

    // An hour after the refusal, it goes.
    now = new Date(now.getTime() + HOLD_RETRY_MS / 2);
    await later.syncNow();
    expect(await onServer('u5')).toEqual([a.id, b.id].sort());
    expect(later.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 0 });
    expect(ids(later)).toEqual([a.id, b.id].sort());
    await later.close();
  });

  it('still drops a refused event this app can’t read either', async () => {
    const dbName = 'phone-malformed';
    const malformed = { id: uuidv7(), kind: 'problem.submitted', at: '2026-11-18T09:00:00.000Z', data: { problem: 'two-sum' } };
    const seeded = new Dexie(dbName);
    seeded.version(1).stores({ events: 'id, owner, [owner+synced]', meta: 'key' });
    await seeded.table('events').put({ ...malformed, owner: 'u6', synced: 0 });
    seeded.close();

    const storage = new MemoryStorage();
    storage.setItem('algorender:owner', 'u6');
    const phone = new ProgressStore({ dbName, storage, syncDelay: 5, ...server({ user: 'u6' }) });
    await phone.start();
    await phone.syncNow();
    expect(phone.getSnapshot().events).toEqual([]);
    expect(phone.getSnapshot().sync).toMatchObject({ state: 'idle', pending: 0 });
    expect(await onServer('u6')).toEqual([]);
    await phone.close();
  });
});

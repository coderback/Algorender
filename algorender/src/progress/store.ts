// The learner's progress on this device: their events in IndexedDB (Dexie),
// held in memory for the pages to read, and synced with the server while
// they're signed in.
//
// Local first: recording an event never waits for the network. Each event
// belongs to an owner: 'anon' before sign-in, else the user's id. Signing in
// claims the device's anonymous events for the account and pushes them, so
// work done before signing up isn't lost; pulling brings the account's events
// from other devices. Signing out (after a last sync) removes the account's
// events from the device. A session that simply expires keeps them, hidden,
// until the same learner signs in again: nothing unsynced is lost.
//
// Without IndexedDB (some private windows), events live in memory for the
// visit. Other tabs hear about changes over a BroadcastChannel.

import Dexie, { type Table } from 'dexie';
import { uuidv7 } from 'uuidv7';
import { byTime, parseEvent, type EventData, type EventKind, type ProgressEvent } from './events';
import { importLegacy } from './legacy';

const ANON = 'anon';
const OWNER_KEY = 'algorender:owner';

type Stored = ProgressEvent & { owner: string; synced: 0 | 1 };

class ProgressDatabase extends Dexie {
  events!: Table<Stored, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ events: 'id, owner, [owner+synced]', meta: 'key' });
  }
}

export type SyncState = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

export type SyncStatus = {
  /** local: not signed in, so nothing syncs. */
  state: SyncState;
  /** Events not yet on the server. */
  pending: number;
  lastSynced: string | null;
  message?: string;
};

export type Snapshot = {
  /** False until the events have been read from storage. */
  ready: boolean;
  /** The signed-in user's id, or null. */
  owner: string | null;
  /** The owner's events, in the order they happened. */
  events: readonly ProgressEvent[];
  sync: SyncStatus;
};

/** What the store needs from the browser; tests pass their own. */
export type StoreEnvironment = {
  dbName?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> | null;
  fetch?: typeof fetch;
  online?: () => boolean;
  channel?: { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null } | null;
  now?: () => Date;
  /** Delay before a sync after an event is recorded, in ms. */
  syncDelay?: number;
};

const EMPTY_STATUS: SyncStatus = { state: 'local', pending: 0, lastSynced: null };

export class ProgressStore {
  private db: ProgressDatabase | null = null;
  /** Events kept in memory only, when IndexedDB isn't available. */
  private memory: Stored[] | null = null;
  private snapshot: Snapshot = { ready: false, owner: null, events: [], sync: EMPTY_STATUS };
  private readonly listeners = new Set<() => void>();
  private started: Promise<void> | null = null;
  private syncing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly env: Required<Omit<StoreEnvironment, 'channel' | 'storage'>> & Pick<StoreEnvironment, 'channel' | 'storage'>;

  constructor(env: StoreEnvironment = {}) {
    this.env = {
      dbName: env.dbName ?? 'algorender-progress',
      storage: env.storage,
      fetch: env.fetch ?? ((...args) => fetch(...args)),
      online: env.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false),
      channel: env.channel,
      now: env.now ?? (() => new Date()),
      syncDelay: env.syncDelay ?? 1_500,
    };
    if (this.env.channel) this.env.channel.onmessage = () => void this.reload();
  }

  // Reading -----------------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    void this.start();
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /** Opens storage, imports progress kept the old way (localStorage), and reads the owner's events. Safe to call often. */
  start(): Promise<void> {
    this.started ??= (async () => {
      try {
        const db = new ProgressDatabase(this.env.dbName);
        await db.open();
        this.db = db;
      } catch {
        this.memory = [];
      }
      const owner = this.read(OWNER_KEY);
      const legacy = this.env.storage ? importLegacy(this.env.storage, () => this.make) : [];
      if (legacy.length > 0) await this.put(legacy.map((e) => ({ ...e, owner: owner ?? ANON, synced: 0 as const })));
      await this.load(owner);
      if (owner) this.scheduleSync(0);
    })();
    return this.started;
  }

  // Writing -----------------------------------------------------------------------

  /** Records something the learner did, now. Returns the event. */
  record<K extends EventKind>(kind: K, data: EventData<K>): ProgressEvent {
    const event = this.make(kind, data);
    // The server would refuse it, so don't keep it (a slug outside a lesson, say).
    if (!parseEvent(event)) {
      console.warn('Progress event not recorded: it is malformed.', event);
      return event;
    }
    void this.start().then(async () => {
      await this.put([{ ...event, owner: this.snapshot.owner ?? ANON, synced: 0 }]);
      this.notifyOthers();
      if (this.snapshot.owner) this.scheduleSync();
    });
    // Seen at once, before storage answers.
    this.set({ events: insert(this.snapshot.events, event), sync: this.snapshot.owner ? { ...this.snapshot.sync, pending: this.snapshot.sync.pending + 1 } : this.snapshot.sync });
    return event;
  }

  private make = <K extends EventKind>(kind: K, data: EventData<K>, at?: string): ProgressEvent =>
    ({ id: uuidv7(), kind, at: at ?? this.env.now().toISOString(), data }) as ProgressEvent;

  // Accounts ----------------------------------------------------------------------

  /**
   * The signed-in user changed: an id after signing in (or on every page load
   * while signed in), null when the session is gone. `explicit` is a sign-out
   * the learner asked for, which removes their events from the device.
   */
  async setOwner(userId: string | null, { explicit = false } = {}): Promise<void> {
    await this.start();
    const current = this.snapshot.owner;
    if (userId === current) {
      if (userId) this.scheduleSync(0);
      return;
    }
    if (userId) {
      // This device's anonymous work joins the account.
      await this.claim(userId);
    } else if (current && explicit) {
      await this.removeOwner(current);
    }
    this.write(OWNER_KEY, userId);
    await this.load(userId);
    this.notifyOthers();
    if (userId) this.scheduleSync(0);
  }

  /** Syncs, then forgets this device's copy of the account: call before signing out. */
  async signOut(): Promise<void> {
    await this.syncNow();
    await this.setOwner(null, { explicit: true });
  }

  // Sync --------------------------------------------------------------------------

  private scheduleSync(delay = this.env.syncDelay) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  /** Pushes unsent events and pulls new ones until both are done. Resolves when finished (or failed). */
  syncNow(): Promise<void> {
    this.syncing ??= this.runSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async runSync(): Promise<void> {
    await this.start();
    const owner = this.snapshot.owner;
    if (!owner) return;
    if (!this.env.online()) {
      this.setStatus({ state: 'offline' });
      return;
    }
    this.setStatus({ state: 'syncing' });
    try {
      for (let round = 0; round < 50; round++) {
        if (this.snapshot.owner !== owner) return;
        const outgoing = (await this.unsynced(owner)).slice(0, 500);
        const cursor = Number((await this.getMeta(`cursor:${owner}`)) ?? 0);
        const res = await this.env.fetch('/api/progress', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ events: outgoing.map(strip), cursor }),
        });
        if (res.status === 401) {
          this.setStatus({ state: 'error', message: 'Your session has ended: sign in again to sync.' });
          return;
        }
        if (!res.ok) throw new Error(`The server answered ${res.status}.`);
        const body = (await res.json()) as { accepted: string[]; rejected: string[]; events: unknown[]; cursor: number; more: boolean };
        if (this.snapshot.owner !== owner) return;
        await this.markSynced(owner, body.accepted, body.rejected);
        const pulled = body.events.map(parseEvent).filter((e): e is ProgressEvent => e !== null);
        await this.put(pulled.map((e) => ({ ...e, owner, synced: 1 as const })), { keepUnsynced: true });
        await this.setMeta(`cursor:${owner}`, body.cursor);
        if (!body.more && outgoing.length < 500) break;
      }
      const at = this.env.now().toISOString();
      await this.setMeta(`synced-at:${owner}`, at);
      await this.load(owner);
      this.setStatus({ state: 'idle', lastSynced: at, message: undefined });
      this.notifyOthers();
    } catch (e) {
      this.setStatus({ state: this.env.online() ? 'error' : 'offline', message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Storage -----------------------------------------------------------------------

  private async put(events: Stored[], { keepUnsynced = false } = {}) {
    if (events.length === 0) return;
    if (this.memory) {
      for (const e of events) {
        const i = this.memory.findIndex((m) => m.id === e.id && m.owner === e.owner);
        if (i < 0) this.memory.push(e);
        else if (!keepUnsynced) this.memory[i] = e;
      }
      return;
    }
    if (!keepUnsynced) {
      await this.db!.events.bulkPut(events);
      return;
    }
    // Pulled events: never overwrite a local copy (it may be unsent).
    const existing = new Set((await this.db!.events.bulkGet(events.map((e) => e.id))).filter(Boolean).map((e) => e!.id));
    await this.db!.events.bulkPut(events.filter((e) => !existing.has(e.id)));
  }

  private async unsynced(owner: string): Promise<Stored[]> {
    const rows = this.memory ? this.memory.filter((e) => e.owner === owner && e.synced === 0) : await this.db!.events.where('[owner+synced]').equals([owner, 0]).toArray();
    return rows.sort(byTime);
  }

  private async markSynced(owner: string, accepted: string[], rejected: string[]) {
    if (this.memory) {
      for (const e of this.memory) if (e.owner === owner && accepted.includes(e.id)) e.synced = 1;
      this.memory = this.memory.filter((e) => !(e.owner === owner && rejected.includes(e.id)));
      return;
    }
    await this.db!.events.where('id').anyOf(accepted).modify({ synced: 1 });
    if (rejected.length > 0) await this.db!.events.bulkDelete(rejected);
  }

  private async claim(userId: string) {
    if (this.memory) {
      for (const e of this.memory) if (e.owner === ANON) Object.assign(e, { owner: userId, synced: 0 });
      return;
    }
    await this.db!.events.where('owner').equals(ANON).modify({ owner: userId, synced: 0 });
  }

  private async removeOwner(owner: string) {
    if (this.memory) this.memory = this.memory.filter((e) => e.owner !== owner);
    else await this.db!.events.where('owner').equals(owner).delete();
    await this.setMeta(`cursor:${owner}`, 0);
    await this.setMeta(`synced-at:${owner}`, null);
  }

  /** Reads the owner's events (and sync status) from storage into the snapshot. */
  private async load(owner: string | null) {
    const key = owner ?? ANON;
    const rows = this.memory ? this.memory.filter((e) => e.owner === key) : await this.db!.events.where('owner').equals(key).toArray();
    const events = rows.map(strip).sort(byTime);
    const pending = owner ? rows.filter((e) => e.synced === 0).length : 0;
    const lastSynced = owner ? ((await this.getMeta(`synced-at:${owner}`)) as string | null) : null;
    const state: SyncState = !owner ? 'local' : this.snapshot.sync.state === 'local' ? 'idle' : this.snapshot.sync.state;
    this.set({ ready: true, owner, events, sync: { ...this.snapshot.sync, state, pending, lastSynced: lastSynced ?? null } });
  }

  /** Another tab changed the events: read them again. */
  private async reload() {
    await this.start();
    await this.load(this.read(OWNER_KEY));
  }

  private async getMeta(key: string): Promise<unknown> {
    if (this.memory) return this.read(`algorender:meta:${key}`);
    return (await this.db!.meta.get(key))?.value ?? null;
  }

  private async setMeta(key: string, value: unknown) {
    if (this.memory) this.write(`algorender:meta:${key}`, value == null ? null : String(value));
    else await this.db!.meta.put({ key, value });
  }

  private read(key: string): string | null {
    try {
      return this.env.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string | null) {
    try {
      if (value == null) this.env.storage?.removeItem(key);
      else this.env.storage?.setItem(key, value);
    } catch {
      // Not remembered.
    }
  }

  private notifyOthers() {
    try {
      this.env.channel?.postMessage('changed');
    } catch {
      // A closed channel: other tabs catch up on their next load.
    }
  }

  private setStatus(change: Partial<SyncStatus>) {
    this.set({ sync: { ...this.snapshot.sync, ...change } });
    if (change.state === 'idle' || change.state === 'error' || change.state === 'offline') void this.refreshPending();
  }

  private async refreshPending() {
    const owner = this.snapshot.owner;
    if (!owner) return;
    const pending = (await this.unsynced(owner)).length;
    if (pending !== this.snapshot.sync.pending) this.set({ sync: { ...this.snapshot.sync, pending } });
  }

  private set(change: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((l) => l());
  }

  /** Closes storage (tests). */
  async close() {
    if (this.timer) clearTimeout(this.timer);
    await this.syncing;
    this.db?.close();
  }
}

/** An event as stored and sent: without the device's bookkeeping. */
function strip(e: Stored | ProgressEvent): ProgressEvent {
  return { id: e.id, kind: e.kind, at: e.at, data: e.data } as ProgressEvent;
}

/** Adds an event to a time-ordered list, keeping the order. */
function insert(events: readonly ProgressEvent[], event: ProgressEvent): ProgressEvent[] {
  const out = [...events, event];
  return out.length > 1 && byTime(out[out.length - 2], event) > 0 ? out.sort(byTime) : out;
}

let shared: ProgressStore | null = null;

/** An idle store for server rendering, which only ever reads the empty snapshot. */
let inert: ProgressStore | null = null;

/** The page's store, made on first use in the browser. */
export function progressStore(): ProgressStore {
  if (typeof window === 'undefined') return (inert ??= new ProgressStore({ storage: null, channel: null }));
  if (!shared) {
    let storage: StoreEnvironment['storage'] = null;
    try {
      storage = window.localStorage;
    } catch {
      // Blocked: no owner memory or legacy import.
    }
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('algorender-progress');
    shared = new ProgressStore({ storage, channel });
    window.addEventListener('online', () => void shared!.syncNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void shared!.syncNow();
    });
  }
  return shared;
}

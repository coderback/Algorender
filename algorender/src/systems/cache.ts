// A key-value cache with a fixed capacity and an eviction policy: LRU (evict
// the entry used longest ago) or LFU (evict the entry used fewest times,
// breaking ties by least recent use).
//
// This is the cache component the system-design canvas (phase 6d) reuses, so
// its API is small and general: create a cache, `cacheGet`/`cachePut` (or
// `cacheAccess` for a read-through cache in front of a slower store), and read
// hits, misses, evictions and the hit rate. Every function returns a new
// state and never changes the one it was given.
//
// The work itself is the classic O(1) design: a hash map from key to a node
// in a doubly linked list kept in recency order (LRU), or in one such list per
// use count with the lowest count tracked (LFU). The plain state stores the
// entries in eviction order (the next to go first); a call rebuilds the linked
// structure from it, does its O(1) work, and writes it back. `cacheRun` keeps
// the linked structure for a whole stream of requests, so long simulations
// stay O(1) per request.

export type Policy = 'lru' | 'lfu';

export type CacheEntry<V = number> = {
  key: string;
  value: V;
  /** How many times it has been used: put, then each hit (and each put that updates it). */
  uses: number;
  /** The logical time of its last use. */
  lastUsed: number;
};

export type CacheState<V = number> = {
  policy: Policy;
  capacity: number;
  /** Every cached entry, in eviction order: the first is the next to go. */
  entries: readonly CacheEntry<V>[];
  /** Logical clock, one tick per call. */
  time: number;
  hits: number;
  misses: number;
  evictions: number;
};

export function createCache<V = number>(policy: Policy, capacity: number): CacheState<V> {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('A cache needs a capacity of at least 1');
  return { policy, capacity, entries: [], time: 0, hits: 0, misses: 0, evictions: 0 };
}

/** Hits as a share of all lookups (0 before the first lookup). */
export const hitRate = (s: CacheState<unknown>) => (s.hits + s.misses === 0 ? 0 : s.hits / (s.hits + s.misses));

/** The entry the next insertion into a full cache would evict, or null when empty. */
export const nextVictim = <V>(s: CacheState<V>): CacheEntry<V> | null => s.entries[0] ?? null;

export const has = (s: CacheState<unknown>, key: string) => s.entries.some((e) => e.key === key);
export const isFull = (s: CacheState<unknown>) => s.entries.length >= s.capacity;

// ── The O(1) engine ──────────────────────────────────────────────────────────

type Node<V> = { entry: CacheEntry<V>; prev: Node<V> | null; next: Node<V> | null };

/** A doubly linked list, oldest at the head (next to evict), newest at the tail. */
class List<V> {
  head: Node<V> | null = null;
  tail: Node<V> | null = null;
  size = 0;

  push(node: Node<V>) {
    node.prev = this.tail;
    node.next = null;
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.size++;
  }

  unlink(node: Node<V>) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = node.next = null;
    this.size--;
  }
}

/** The linked form of a cache: a hash map to nodes, and the recency list (LRU) or one list per use count (LFU). */
class Engine<V> {
  readonly map = new Map<string, Node<V>>();
  /** LRU: the single list. LFU: the list for each use count. */
  readonly lists = new Map<number, List<V>>();
  minUses = 0;
  time: number;
  hits: number;
  misses: number;
  evictions: number;

  constructor(readonly policy: Policy, readonly capacity: number, state: CacheState<V>) {
    this.time = state.time;
    this.hits = state.hits;
    this.misses = state.misses;
    this.evictions = state.evictions;
    for (const entry of state.entries) this.attach({ entry: { ...entry }, prev: null, next: null });
    this.minUses = this.lowestUses();
  }

  private bucket(node: Node<V>) {
    return this.policy === 'lru' ? 0 : node.entry.uses;
  }

  private list(n: number) {
    let l = this.lists.get(n);
    if (!l) {
      l = new List<V>();
      this.lists.set(n, l);
    }
    return l;
  }

  private attach(node: Node<V>) {
    this.map.set(node.entry.key, node);
    this.list(this.bucket(node)).push(node);
  }

  private detach(node: Node<V>) {
    const n = this.bucket(node);
    const l = this.lists.get(n)!;
    l.unlink(node);
    if (l.size === 0) this.lists.delete(n);
    this.map.delete(node.entry.key);
  }

  private lowestUses() {
    if (this.policy === 'lru' || this.lists.size === 0) return 0;
    return Math.min(...this.lists.keys());
  }

  /** A use: O(1). LRU moves the node to the newest end; LFU moves it to the next count's list. */
  private touch(node: Node<V>) {
    if (this.policy === 'lru') {
      // One list and the map entry stays put: just move the node to the newest end.
      const l = this.lists.get(0)!;
      l.unlink(node);
      node.entry = { ...node.entry, uses: node.entry.uses + 1, lastUsed: this.time };
      l.push(node);
      return;
    }
    const before = this.bucket(node);
    this.detach(node);
    node.entry = { ...node.entry, uses: node.entry.uses + 1, lastUsed: this.time };
    this.attach(node);
    if (this.policy === 'lfu' && before === this.minUses && !this.lists.has(before)) this.minUses = before + 1;
  }

  /** The node to evict: the head of the recency list (LRU), or of the lowest count's list (LFU). */
  victim(): Node<V> | null {
    return this.lists.get(this.policy === 'lru' ? 0 : this.minUses)?.head ?? null;
  }

  get(key: string): { hit: boolean; value: V | undefined } {
    this.time++;
    const node = this.map.get(key);
    if (!node) {
      this.misses++;
      return { hit: false, value: undefined };
    }
    this.hits++;
    this.touch(node);
    return { hit: true, value: node.entry.value };
  }

  put(key: string, value: V): { evicted: CacheEntry<V> | null; updated: boolean } {
    this.time++;
    const node = this.map.get(key);
    if (node) {
      node.entry = { ...node.entry, value };
      this.touch(node);
      return { evicted: null, updated: true };
    }
    let evicted: CacheEntry<V> | null = null;
    if (this.map.size >= this.capacity) {
      const v = this.victim()!;
      evicted = v.entry;
      this.detach(v);
      this.evictions++;
    }
    this.attach({ entry: { key, value, uses: 1, lastUsed: this.time }, prev: null, next: null });
    this.minUses = this.policy === 'lfu' ? 1 : 0;
    return { evicted, updated: false };
  }

  /** Drops a key without counting a use (a cache invalidation). */
  remove(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.detach(node);
    if (this.policy === 'lfu' && !this.lists.has(this.minUses)) this.minUses = this.lowestUses();
    return true;
  }

  /** Back to the plain state: entries in eviction order (lowest count first for LFU, oldest first within a list). */
  toState(): CacheState<V> {
    const entries: CacheEntry<V>[] = [];
    for (const n of [...this.lists.keys()].sort((a, b) => a - b)) {
      for (let node = this.lists.get(n)!.head; node; node = node.next) entries.push(node.entry);
    }
    return { policy: this.policy, capacity: this.capacity, entries, time: this.time, hits: this.hits, misses: this.misses, evictions: this.evictions };
  }
}

const engine = <V>(s: CacheState<V>) => new Engine<V>(s.policy, s.capacity, s);

// ── The API ──────────────────────────────────────────────────────────────────

/** Looks a key up. A hit counts as a use of it. */
export function cacheGet<V>(s: CacheState<V>, key: string): { state: CacheState<V>; hit: boolean; value: V | undefined } {
  const e = engine(s);
  const r = e.get(key);
  return { state: e.toState(), ...r };
}

/** Stores a value: updates (and uses) an existing key, or inserts a new one, evicting first if the cache is full. */
export function cachePut<V>(s: CacheState<V>, key: string, value: V): { state: CacheState<V>; evicted: CacheEntry<V> | null; updated: boolean } {
  const e = engine(s);
  const r = e.put(key, value);
  return { state: e.toState(), ...r };
}

/**
 * A read-through access, as a cache in front of a slower store sees it: a
 * get, and on a miss a put of the value loaded from the store.
 */
export function cacheAccess<V>(s: CacheState<V>, key: string, load: (key: string) => V): { state: CacheState<V>; hit: boolean; evicted: CacheEntry<V> | null } {
  const e = engine(s);
  const { hit } = e.get(key);
  const evicted = hit ? null : e.put(key, load(key)).evicted;
  return { state: e.toState(), hit, evicted };
}

/**
 * A cache kept in its linked form for a long stream of calls, as a
 * simulation drives it (the system-design canvas): O(1) per call, with no
 * plain state rebuilt in between. `state()` reads the plain state back.
 */
export type LiveCache<V> = {
  get(key: string): { hit: boolean; value: V | undefined };
  put(key: string, value: V): { evicted: CacheEntry<V> | null; updated: boolean };
  /** Drops a key (an invalidation); false when it wasn't cached. */
  remove(key: string): boolean;
  readonly size: number;
  state(): CacheState<V>;
};

export function openCache<V>(s: CacheState<V>): LiveCache<V> {
  const e = engine(s);
  return {
    get: (key) => e.get(key),
    put: (key, value) => e.put(key, value),
    remove: (key) => e.remove(key),
    get size() {
      return e.map.size;
    },
    state: () => e.toState(),
  };
}

/** Read-through accesses for a whole stream of keys, O(1) each. `hits[i]` says whether request i hit. */
export function cacheRun<V>(s: CacheState<V>, keys: readonly string[], load: (key: string) => V): { state: CacheState<V>; hits: boolean[] } {
  const e = engine(s);
  const hits = keys.map((key) => {
    const { hit } = e.get(key);
    if (!hit) e.put(key, load(key));
    return hit;
  });
  return { state: e.toState(), hits };
}

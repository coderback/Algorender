// The system-design simulator: seeded traffic run through a design, request by
// request, as a discrete-event simulation.
//
// - Clients send Poisson arrivals at the workload's rate (times the spike's
//   factor during the spike); each request is a read or a write of one key,
//   picked by a Zipf law over the key space (a few keys are hot).
// - Every server-like part is a pool of workers with one first-come-first-
//   served line per machine, and exponential service times around the
//   configured means, like src/systems/queueing.ts: app instances, cache nodes
//   (CACHE_SLOTS each), database nodes (`workers` connections) and a queue's
//   consumers.
// - An app request holds its worker for its own work *and* while it waits on
//   the cache, database or queue behind it (a thread per request), so a slow
//   database backs up into the app tier, as it does in practice.
// - Caches are src/systems/cache.ts caches (LRU or LFU), one per node; keys go
//   to cache nodes and database shards by consistent hashing
//   (src/systems/ring.ts); the rate limiter is src/systems/token-bucket.ts.
// - Writes carry a version per key. A read is stale when it returns an older
//   version than the latest write already acknowledged when the read began:
//   a cached copy a write didn't update or delete, a replica that hasn't
//   caught up, or a queued write not applied yet.
// - Faults crash a machine for good: its queued and in-progress requests fail,
//   load balancers skip it, a crashed cache node's keys move to the other
//   nodes (cold), and a crashed primary fails its shard's writes until a
//   replica is promoted (with failover) after `failoverMs`.
// - Arrivals stop after `seconds`; the run then drains for up to `timeoutMs`,
//   and whatever is still unfinished counts as timed out.
//
// Times inside are seconds; the design's service times and the results'
// latencies are milliseconds.

import { createRng } from '@/engine/random';
import { createCache, openCache, type LiveCache } from '@/systems/cache';
import { createRing, removeServer, serverFor, type Ring } from '@/systems/ring';
import { createBucket, request as takeToken, type BucketState } from '@/systems/token-bucket';
import { KIND_INFO } from './build';
import { costPerMonth } from './cost';
import type { App, Bucket, Cache, Clients, Component, ComponentStats, Database, Design, LoadBalancer, Outcome, Percentiles, Queue, RateLimiter, Ref, RunOptions, SimResult, Workload } from './types';
import { validateDesign } from './validate';

/** Requests a cache node works on at once. */
export const CACHE_SLOTS = 64;
/** What a load balancer adds to each request (ms). */
export const LB_MS = 0.5;
/** How long storing a write in a queue takes before it is acknowledged (ms). */
export const ENQUEUE_MS = 2;
/** How long a queue waits before retrying a write its target refused (ms). */
export const RETRY_MS = 250;
export const DEFAULT_TIMEOUT_MS = 1000;
/** Virtual nodes per cache node or shard on the hash ring. */
const VNODES = 64;

// ── An event queue: a binary heap on parallel arrays ────────────────────────

const NOOP = () => {};

class Events {
  private time: number[] = [];
  private seq: number[] = [];
  private fn: (() => void)[] = [];
  private n = 0;
  private counter = 0;

  get size() {
    return this.n;
  }

  peekTime() {
    return this.time[0];
  }

  push(t: number, f: () => void) {
    let i = this.n++;
    const s = this.counter++;
    const { time, seq, fn } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (time[p] < t || (time[p] === t && seq[p] < s)) break;
      time[i] = time[p];
      seq[i] = seq[p];
      fn[i] = fn[p];
      i = p;
    }
    time[i] = t;
    seq[i] = s;
    fn[i] = f;
  }

  /** Removes the earliest event and returns its action. */
  pop(): () => void {
    const { time, seq, fn } = this;
    const top = fn[0];
    const last = --this.n;
    const t = time[last];
    const s = seq[last];
    const f = fn[last];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= last) break;
      if (c + 1 < last && (time[c + 1] < time[c] || (time[c + 1] === time[c] && seq[c + 1] < seq[c]))) c++;
      if (t < time[c] || (t === time[c] && s < seq[c])) break;
      time[i] = time[c];
      seq[i] = seq[c];
      fn[i] = fn[c];
      i = c;
    }
    time[i] = t;
    seq[i] = s;
    fn[i] = f;
    // Keep the arrays' length (shrinking them costs more than it saves); just let the action go.
    fn[last] = NOOP;
    return top;
  }
}

// ── Runtime state ────────────────────────────────────────────────────────────

type Req = {
  start: number;
  read: boolean;
  key: number;
  /** For reads: the latest acknowledged version of the key when the read began. */
  ack: number;
  bucket: number;
  done: boolean;
  stale: boolean;
  /** For writes: [key, version, key, version, …] written. */
  writes: number[] | null;
};

/** Work on a pool. `slot` is its place in the pool's running list while it runs. */
type Task = { begin: () => void; fail: () => void; started: number; dead: boolean; pool: Pool | null; slot?: number };

/** One machine: `slots` workers and a first-come-first-served line. */
class Pool {
  busy = 0;
  waiting: Task[] = [];
  head = 0;
  alive = true;
  busyTime = 0;
  served = 0;
  /** Tasks being worked on, in no order (removed by swapping with the last). */
  running: Task[] = [];
  constructor(
    readonly owner: Runtime,
    readonly slots: number,
  ) {}
  get queued() {
    return this.waiting.length - this.head;
  }
}

type Runtime = {
  c: Component;
  pools: Pool[];
  queued: number;
  peak: number;
  dropped: number;
  served: number;
  /** Round-robin position, for whatever this component picks between. */
  rr: number;
  // Rate limiter
  bucket?: BucketState;
  // Cache
  stores?: (LiveCache<number> | null)[];
  ring?: Ring;
  nodeOf?: Int16Array;
  lookups?: number;
  hits?: number;
  // Database
  primary?: number[];
  replicas?: number[][];
  shardRing?: Ring;
  shardOf?: Int16Array;
  committed?: Int32Array;
  log?: Map<number, number[]>;
  // Queue
  applied?: number;
  delaySum?: number;
};

// ── Zipf keys ────────────────────────────────────────────────────────────────

const cdfMemo = new Map<string, Float64Array>();

/** The cumulative distribution of a Zipf law over `keys` ranks with exponent `s` (memoised: the big arrays are reused across runs). */
function zipfCdf(keys: number, s: number): Float64Array {
  const id = `${keys}:${s}`;
  let cdf = cdfMemo.get(id);
  if (!cdf) {
    cdf = new Float64Array(keys);
    let sum = 0;
    for (let i = 0; i < keys; i++) cdf[i] = sum += 1 / Math.pow(i + 1, s);
    for (let i = 0; i < keys; i++) cdf[i] /= sum;
    if (cdfMemo.size >= 4) cdfMemo.delete(cdfMemo.keys().next().value!);
    cdfMemo.set(id, cdf);
  }
  return cdf;
}

function pickKey(u: number, w: Workload, cdf: Float64Array | null): number {
  if (!cdf) return Math.min(w.keys - 1, Math.floor(u * w.keys));
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── Percentiles ──────────────────────────────────────────────────────────────

const NO_LATENCY: Percentiles = { p50: NaN, p95: NaN, p99: NaN, mean: NaN };

/** Nearest-rank percentiles, as src/systems/queueing.ts's `percentile`. */
function percentiles(values: readonly number[]): Percentiles {
  const n = values.length;
  if (n === 0) return NO_LATENCY;
  const sorted = Float64Array.from(values).sort();
  const at = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), mean: sum / n };
}

// ── The simulation ───────────────────────────────────────────────────────────

class Sim {
  now = 0;
  readonly events = new Events();
  readonly rng: () => number;
  readonly byId = new Map<Ref, Runtime>();
  readonly timeout: number;
  readonly keys: number;
  readonly issued: Int32Array;
  readonly acked: Int32Array;

  offered = 0;
  readonly counts: Record<Outcome, number> = { ok: 0, rejected: 0, failed: 0, timeout: 0 };
  staleReads = 0;
  readonly all: number[] = [];
  readonly readLat: number[] = [];
  readonly writeLat: number[] = [];
  readonly buckets: { offered: number; ok: number; errors: number; lat: number[] }[] = [];
  /** Every request sent, so the unfinished can be counted as timed out at the end. */
  readonly requests: Req[] = [];
  /** Where the clients send requests. */
  readonly entry: Ref;

  constructor(
    readonly design: Design,
    readonly workload: Workload,
    readonly options: RunOptions,
    readonly bucketSeconds: number,
  ) {
    this.entry = design.components.find((c): c is Clients => c.kind === 'clients')!.to;
    this.rng = createRng(options.seed);
    this.timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.keys = workload.keys;
    this.issued = new Int32Array(this.keys);
    this.acked = new Int32Array(this.keys);
    for (const c of design.components) this.byId.set(c.id, this.runtime(c));
  }

  private runtime(c: Component): Runtime {
    const r: Runtime = { c, pools: [], queued: 0, peak: 0, dropped: 0, served: 0, rr: 0 };
    switch (c.kind) {
      case 'rate-limiter':
        r.bucket = createBucket({ capacity: c.burst, refillRate: c.perSecond });
        break;
      case 'app':
        for (let i = 0; i < c.instances; i++) r.pools.push(new Pool(r, c.workers));
        break;
      case 'cache':
        for (let i = 0; i < c.nodes; i++) r.pools.push(new Pool(r, CACHE_SLOTS));
        r.stores = r.pools.map(() => openCache(createCache<number>(c.policy, c.capacity)));
        r.ring = createRing(
          r.pools.map((_, i) => String(i)),
          VNODES,
        );
        r.nodeOf = new Int16Array(this.keys).fill(-2);
        r.lookups = 0;
        r.hits = 0;
        break;
      case 'database': {
        const per = 1 + c.replicas;
        for (let i = 0; i < c.shards * per; i++) r.pools.push(new Pool(r, c.workers));
        r.primary = Array.from({ length: c.shards }, (_, s) => s * per);
        r.replicas = Array.from({ length: c.shards }, (_, s) => Array.from({ length: c.replicas }, (_, k) => s * per + 1 + k));
        r.shardRing = createRing(
          Array.from({ length: c.shards }, (_, s) => String(s)),
          VNODES,
        );
        r.shardOf = new Int16Array(this.keys).fill(-1);
        r.committed = new Int32Array(this.keys);
        if (c.replicas > 0 && c.replicaLagMs > 0) r.log = new Map();
        break;
      }
      case 'queue':
        r.pools.push(new Pool(r, c.consumers));
        r.applied = 0;
        r.delaySum = 0;
        break;
      default:
        break;
    }
    return r;
  }

  at(t: number, f: () => void) {
    this.events.push(t, f);
  }

  /** An exponential duration with this mean, from milliseconds to seconds. */
  exp(meanMs: number) {
    return (-Math.log(1 - this.rng()) * meanMs) / 1000;
  }

  keyName(k: number) {
    return String(k);
  }

  get(ref: Ref) {
    return this.byId.get(ref);
  }

  // ── Pools ──

  submit(pool: Pool, task: Task) {
    if (!pool.alive) {
      pool.owner.dropped++;
      task.fail();
      return;
    }
    if (pool.busy < pool.slots) this.begin(pool, task);
    else {
      pool.waiting.push(task);
      const o = pool.owner;
      if (++o.queued > o.peak) o.peak = o.queued;
    }
  }

  private begin(pool: Pool, task: Task) {
    pool.busy++;
    task.started = this.now;
    task.pool = pool;
    task.slot = pool.running.length;
    pool.running.push(task);
    task.begin();
  }

  /** Frees the task's worker; false when the task was already lost to a crash. */
  release(task: Task): boolean {
    if (task.dead) return false;
    const pool = task.pool!;
    pool.busy--;
    const last = pool.running.pop()!;
    if (last !== task) {
      pool.running[task.slot!] = last;
      last.slot = task.slot;
    }
    pool.busyTime += this.now - task.started;
    pool.served++;
    pool.owner.served++;
    while (pool.busy < pool.slots && pool.head < pool.waiting.length) {
      const next = pool.waiting[pool.head++];
      pool.owner.queued--;
      this.begin(pool, next);
    }
    if (pool.head > 1024 && pool.head * 2 > pool.waiting.length) {
      pool.waiting = pool.waiting.slice(pool.head);
      pool.head = 0;
    }
    return true;
  }

  crash(pool: Pool) {
    if (!pool.alive) return;
    pool.alive = false;
    const lost = [...pool.running, ...pool.waiting.slice(pool.head)];
    for (const t of pool.running) pool.busyTime += this.now - t.started;
    pool.owner.queued -= pool.queued;
    pool.running = [];
    pool.waiting = [];
    pool.head = 0;
    pool.busy = 0;
    pool.owner.dropped += lost.length;
    for (const t of lost) {
      t.dead = true;
      t.fail();
    }
  }

  /** `meanMs` of work on `pool`, then `done(true)`; `done(false)` if the machine is or goes down. */
  serve(pool: Pool, meanMs: number, done: (ok: boolean) => void) {
    const task: Task = {
      started: 0,
      dead: false,
      pool: null,
      begin: () => this.at(this.now + this.exp(meanMs), () => this.release(task) && done(true)),
      fail: () => done(false),
    };
    this.submit(pool, task);
  }

  // ── Requests ──

  arrive(read: boolean, key: number) {
    const bucket = Math.min(this.buckets.length - 1, Math.floor(this.now / this.bucketSeconds));
    const req: Req = { start: this.now, read, key, ack: read ? this.acked[key] : 0, bucket, done: false, stale: false, writes: null };
    this.offered++;
    this.buckets[bucket].offered++;
    this.requests.push(req);
    this.enter(this.entry, req);
  }

  finish(req: Req, outcome: Outcome) {
    if (req.done) return;
    req.done = true;
    const ms = (this.now - req.start) * 1000;
    if (outcome === 'ok' && ms > this.timeout) outcome = 'timeout';
    this.counts[outcome]++;
    const b = this.buckets[req.bucket];
    if (outcome !== 'ok') {
      b.errors++;
      return;
    }
    b.ok++;
    b.lat.push(ms);
    this.all.push(ms);
    if (req.read) {
      this.readLat.push(ms);
      if (req.stale) this.staleReads++;
    } else {
      this.writeLat.push(ms);
      const w = req.writes;
      if (w) for (let i = 0; i < w.length; i += 2) if (w[i + 1] > this.acked[w[i]]) this.acked[w[i]] = w[i + 1];
    }
  }

  enter(ref: Ref, req: Req) {
    const r = this.get(ref)!;
    const c = r.c;
    if (c.kind === 'rate-limiter') {
      const lim = c as RateLimiter;
      const t = takeToken(r.bucket!, { capacity: lim.burst, refillRate: lim.perSecond }, this.now);
      r.bucket = t.state;
      if (!t.decision.accepted) {
        r.dropped++;
        this.finish(req, 'rejected');
        return;
      }
      r.served++;
      this.enter(lim.to, req);
    } else if (c.kind === 'load-balancer') {
      const app = this.get((c as LoadBalancer).to)!;
      const i = this.pick(r, app, (c as LoadBalancer).policy);
      if (i < 0) {
        r.dropped++;
        this.finish(req, 'failed');
        return;
      }
      r.served++;
      this.at(this.now + LB_MS / 1000, () => this.runApp(app, i, req));
    } else if (c.kind === 'app') {
      const i = this.pick(r, r, 'round-robin');
      if (i < 0) {
        r.dropped++;
        this.finish(req, 'failed');
        return;
      }
      this.runApp(r, i, req);
    }
  }

  /** A live instance of `app`, by policy; -1 when none is up. `picker` keeps the round-robin position. */
  pick(picker: Runtime, app: Runtime, policy: LoadBalancer['policy']): number {
    const pools = app.pools;
    const n = pools.length;
    if (policy === 'least-connections') {
      let best = -1;
      for (let i = 0; i < n; i++) {
        const p = pools[i];
        if (p.alive && (best < 0 || p.busy + p.queued < pools[best].busy + pools[best].queued)) best = i;
      }
      return best;
    }
    if (policy === 'random') {
      const live = pools.flatMap((p, i) => (p.alive ? [i] : []));
      return live.length ? live[Math.floor(this.rng() * live.length)] : -1;
    }
    for (let k = 0; k < n; k++) {
      const i = picker.rr++ % n;
      if (pools[i].alive) return i;
    }
    return -1;
  }

  runApp(app: Runtime, i: number, req: Req) {
    const a = app.c as App;
    const task: Task = {
      started: 0,
      dead: false,
      pool: null,
      begin: () =>
        this.at(this.now + this.exp(a.serviceMs), () => {
          if (task.dead) return;
          this.afterApp(a, req, (ok) => this.release(task) && this.finish(req, ok ? 'ok' : 'failed'));
        }),
      fail: () => this.finish(req, 'failed'),
    };
    this.submit(app.pools[i], task);
  }

  afterApp(a: App, req: Req, done: (ok: boolean) => void) {
    if (req.read) {
      this.read(a.reads, req.key, (ok, v) => {
        if (ok && v < req.ack) req.stale = true;
        done(ok);
      });
      return;
    }
    const writes: number[] = [];
    for (let j = 0; j < a.fanout; j++) {
      const k = j === 0 ? req.key : (req.key * 7919 + j * 104_729) % this.keys;
      writes.push(k, ++this.issued[k]);
    }
    req.writes = writes;
    let left = a.fanout;
    let failed = false;
    for (let i = 0; i < writes.length; i += 2) {
      this.write(a.writes, writes[i], writes[i + 1], (ok) => {
        if (!ok) failed = true;
        if (--left === 0) done(!failed);
      });
    }
  }

  // ── Reads and writes ──

  /** Reads `key` from `ref`: `done(ok, version)`; an app with nothing behind it answers itself (version +∞, never stale). */
  read(ref: Ref, key: number, done: (ok: boolean, version: number) => void) {
    if (ref === '') {
      done(true, Infinity);
      return;
    }
    const r = this.get(ref)!;
    if (r.c.kind === 'cache') {
      const cache = r.c as Cache;
      const node = this.cacheNode(r, key);
      if (node < 0) {
        this.read(cache.to, key, done);
        return;
      }
      this.serve(r.pools[node], cache.serviceMs, (ok) => {
        if (!ok) return done(false, 0);
        r.lookups!++;
        const got = r.stores![node]!.get(this.keyName(key));
        if (got.hit) {
          r.hits!++;
          done(true, got.value!);
          return;
        }
        this.read(cache.to, key, (ok2, v) => {
          const store = r.stores![node];
          // Fills are guarded, like memcache's leases: a value older than the
          // database's latest (a write landed while this read was out) is
          // returned but not cached, so it can't outlive the write.
          if (ok2 && store && r.pools[node].alive && v >= this.latest(cache.to, key)) store.put(this.keyName(key), v);
          done(ok2, v);
        });
      });
      return;
    }
    // A database.
    const db = r.c as Database;
    const shard = this.shard(r, key);
    const node = this.readNode(r, shard);
    if (node < 0) {
      r.dropped++;
      done(false, 0);
      return;
    }
    this.serve(r.pools[node], db.readMs, (ok) => done(ok, ok ? this.versionAt(r, shard, node, key) : 0));
  }

  write(ref: Ref, key: number, version: number, done: (ok: boolean) => void) {
    if (ref === '') {
      done(true);
      return;
    }
    const r = this.get(ref)!;
    const c = r.c;
    if (c.kind === 'cache') {
      const cache = c as Cache;
      this.write(cache.to, key, version, (ok) => {
        if (!ok) return done(false);
        const node = this.cacheNode(r, key);
        if (node < 0) return done(true);
        this.serve(r.pools[node], cache.serviceMs, (ok2) => {
          const store = r.stores![node];
          if (ok2 && store) {
            // A write-through update is versioned too: if a newer write has
            // already landed, this older one deletes the copy rather than
            // overwrite the newer value.
            if (cache.writes === 'write-through' && version >= this.latest(cache.to, key)) store.put(this.keyName(key), version);
            else store.remove(this.keyName(key));
          }
          // The write is safe in the database either way.
          done(true);
        });
      });
    } else if (c.kind === 'database') {
      const db = c as Database;
      const shard = this.shard(r, key);
      const p = r.primary![shard];
      if (p < 0 || !r.pools[p].alive) {
        r.dropped++;
        done(false);
        return;
      }
      this.serve(r.pools[p], db.writeMs, (ok) => {
        if (ok) this.commit(r, db, key, version);
        done(ok);
      });
    } else if (c.kind === 'queue') {
      this.at(this.now + ENQUEUE_MS / 1000, () => {
        const pool = r.pools[0];
        if (!pool.alive) {
          r.dropped++;
          done(false);
          return;
        }
        this.enqueue(r, key, version, this.now);
        done(true);
      });
    }
  }

  private enqueue(r: Runtime, key: number, version: number, at: number) {
    const q = r.c as Queue;
    const task: Task = {
      started: 0,
      dead: false,
      pool: null,
      // Deferred to its own event: a refused write fails at once, and the
      // next consumer start would otherwise recurse through the backlog.
      begin: () =>
        this.at(this.now, () =>
          this.write(q.to, key, version, (ok) => {
            if (!this.release(task)) return;
            if (ok) {
              r.applied!++;
              r.delaySum! += this.now - at;
            } else this.at(this.now + RETRY_MS / 1000, () => r.pools[0].alive && this.enqueue(r, key, version, at));
          }),
        ),
      fail: () => {},
    };
    this.submit(r.pools[0], task);
  }

  // ── Caches ──

  /** The newest version of `key` a database has committed (0 for anything else). */
  latest(ref: Ref, key: number): number {
    const r = this.get(ref);
    return r?.committed ? r.committed[key] : 0;
  }

  /** The live cache node that holds `key`, or -1 when every node is down. */
  cacheNode(r: Runtime, key: number): number {
    let n = r.nodeOf![key];
    if (n === -2) {
      const s = serverFor(r.ring!, this.keyName(key));
      n = s === null ? -1 : Number(s);
      r.nodeOf![key] = n;
    }
    return n;
  }

  // ── Databases ──

  shard(r: Runtime, key: number): number {
    let s = r.shardOf![key];
    if (s < 0) {
      s = Number(serverFor(r.shardRing!, this.keyName(key)));
      r.shardOf![key] = s;
    }
    return s;
  }

  /** Where a read of the shard goes: a live replica in turn, else the primary; -1 when none is up. */
  readNode(r: Runtime, shard: number): number {
    const reps = r.replicas![shard];
    for (let k = 0; k < reps.length; k++) {
      const i = reps[r.rr++ % reps.length];
      if (r.pools[i].alive) return i;
    }
    const p = r.primary![shard];
    return p >= 0 && r.pools[p].alive ? p : -1;
  }

  commit(r: Runtime, db: Database, key: number, version: number) {
    const committed = r.committed!;
    if (version > committed[key]) committed[key] = version;
    const log = r.log;
    if (!log) return;
    let entries = log.get(key);
    if (!entries) log.set(key, (entries = []));
    entries.push(committed[key], this.now);
    // Keep only what a replica can still need: the last entry it has caught up to, and anything newer.
    const cutoff = this.now - db.replicaLagMs / 1000;
    let last = -1;
    for (let i = 0; i < entries.length; i += 2) if (entries[i + 1] <= cutoff) last = i;
    if (last > 0) entries.splice(0, last);
  }

  /** The version of `key` a database node returns: the primary's latest, or what a replica has applied by now. */
  versionAt(r: Runtime, shard: number, node: number, key: number): number {
    if (node === r.primary![shard] || !r.log) return r.committed![key];
    const entries = r.log.get(key);
    if (!entries) return r.committed![key];
    const cutoff = this.now - (r.c as Database).replicaLagMs / 1000;
    let v = 0;
    for (let i = 0; i < entries.length; i += 2) if (entries[i + 1] <= cutoff) v = entries[i];
    return v;
  }

  // ── Faults ──

  fault(ref: Ref, instance: number) {
    const r = this.get(ref);
    if (!r || !(instance >= 0 && instance < r.pools.length)) return;
    const pool = r.pools[instance];
    if (!pool.alive) return;
    this.crash(pool);
    if (r.c.kind === 'cache') {
      r.stores![instance] = null;
      r.ring = removeServer(r.ring!, String(instance));
      r.nodeOf!.fill(-2);
    } else if (r.c.kind === 'database') {
      const db = r.c as Database;
      const shard = Math.floor(instance / (1 + db.replicas));
      if (r.primary![shard] === instance) {
        r.primary![shard] = -1;
        if (db.failover)
          this.at(this.now + db.failoverMs / 1000, () => {
            const next = r.replicas![shard].find((i) => r.pools[i].alive);
            if (next === undefined) return;
            r.primary![shard] = next;
            r.replicas![shard] = r.replicas![shard].filter((i) => i !== next);
          });
      }
    }
  }
}

// ── Running it ───────────────────────────────────────────────────────────────

/** Runs seeded traffic through a runnable design (see `validateDesign`; a design with problems throws). */
export function simulate(design: Design, options: RunOptions): SimResult {
  const problems = validateDesign(design);
  if (problems.length > 0) throw new Error(`The design can't run: ${problems.join(' ')}`);
  const w = design.components.find((c): c is Clients => c.kind === 'clients')!.workload;
  const seconds = options.seconds;
  const bucketSeconds = seconds <= 20 ? 0.5 : seconds / 40;
  const sim = new Sim(design, w, options, bucketSeconds);
  const nBuckets = Math.max(1, Math.ceil(seconds / bucketSeconds - 1e-9));
  for (let i = 0; i < nBuckets; i++) sim.buckets.push({ offered: 0, ok: 0, errors: 0, lat: [] });

  // Arrivals: a Poisson process whose rate steps up during the spike. The
  // exponential is memoryless, so redrawing at each rate change is exact.
  const cdf = w.skew > 0 && w.keys > 1 ? zipfCdf(w.keys, w.skew) : null;
  const spike = w.spike;
  const rateAt = (t: number) => (spike && t >= spike.at && t < spike.at + spike.seconds ? w.rps * spike.factor : w.rps);
  const nextChange = (t: number) => (spike ? (t < spike.at ? spike.at : t < spike.at + spike.seconds ? spike.at + spike.seconds : Infinity) : Infinity);
  const scheduleArrival = (from: number) => {
    let t = from;
    for (;;) {
      const dt = -Math.log(1 - sim.rng()) / rateAt(t);
      const change = nextChange(t);
      if (t + dt < change) {
        t += dt;
        break;
      }
      t = change;
    }
    if (t >= seconds) return;
    sim.at(t, () => {
      const read = sim.rng() < w.readShare;
      sim.arrive(read, pickKey(sim.rng(), w, cdf));
      scheduleArrival(t);
    });
  };
  scheduleArrival(0);
  for (const f of options.faults ?? []) sim.at(f.at, () => sim.fault(f.component, f.instance));

  const horizon = seconds + sim.timeout / 1000;
  while (sim.events.size > 0 && sim.events.peekTime() <= horizon) {
    const t = sim.events.peekTime();
    const f = sim.events.pop();
    sim.now = t;
    f();
  }
  const end = Math.max(seconds, sim.now);
  sim.now = end;
  // Whatever hasn't finished by the end gave up waiting.
  for (const req of sim.requests) if (!req.done) sim.finish(req, 'timeout');

  return results(sim, design, end, bucketSeconds);
}

function results(sim: Sim, design: Design, end: number, bucketSeconds: number): SimResult {
  const components: Record<Ref, ComponentStats> = {};
  for (const r of sim.byId.values()) {
    const share = (p: Pool) => {
      let busy = p.busyTime;
      for (const t of p.running) busy += end - t.started;
      return end > 0 ? Math.min(1, busy / (p.slots * end)) : 0;
    };
    const perInstance = r.pools.map(share);
    const totalSlots = r.pools.reduce((s, p) => s + p.slots, 0);
    const utilisation = totalSlots ? r.pools.reduce((s, p, i) => s + perInstance[i] * p.slots, 0) / totalSlots : 0;
    const stats: ComponentStats = {
      utilisation,
      perInstance,
      served: r.c.kind === 'clients' ? sim.offered : r.served,
      peakQueue: r.peak,
      dropped: r.dropped,
    };
    if (r.c.kind === 'cache') stats.hitRate = r.lookups ? r.hits! / r.lookups : 0;
    if (r.c.kind === 'queue') {
      const p = r.pools[0];
      stats.backlog = p.queued + p.busy;
      stats.applyDelayMs = r.applied ? (r.delaySum! / r.applied) * 1000 : 0;
      stats.served = r.applied!;
    }
    components[r.c.id] = stats;
  }

  const series: Bucket[] = sim.buckets.map((b, i) => {
    const p = percentiles(b.lat);
    return { t: i * bucketSeconds, offered: b.offered, ok: b.ok, errors: b.errors, p50: p.p50, p99: p.p99 };
  });
  const { ok, rejected, failed, timeout } = sim.counts;
  const seconds = sim.options.seconds;
  const result: SimResult = {
    seconds,
    offered: sim.offered,
    ok,
    rejected,
    failed,
    timedOut: timeout,
    latency: percentiles(sim.all),
    reads: percentiles(sim.readLat),
    writes: percentiles(sim.writeLat),
    throughput: ok / seconds,
    errorRate: sim.offered ? (rejected + failed + timeout) / sim.offered : 0,
    staleReads: sim.staleReads,
    okReads: sim.readLat.length,
    bucketSeconds,
    series,
    components,
    costPerMonth: costPerMonth(design),
    findings: [],
  };
  return { ...result, findings: findings(design, result, sim.options) };
}

// ── Findings ─────────────────────────────────────────────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}%`;
const name = (c: Component) => `“${c.label || KIND_INFO[c.kind].name}”`;

/** Two to five plain sentences: what limits the design, and what to try. */
export function findings(design: Design, r: SimResult, options: RunOptions): string[] {
  const out: string[] = [];
  const busyKinds = new Set(['app', 'cache', 'database', 'queue']);
  const ranked = design.components
    .filter((c) => busyKinds.has(c.kind))
    .map((c) => ({ c, s: r.components[c.id], peak: Math.max(0, ...r.components[c.id].perInstance) }))
    .sort((a, b) => b.peak - a.peak);

  const advice: Record<string, string> = {
    app: 'add instances or workers, or make each request cheaper',
    cache: 'add cache nodes',
    database: 'add read replicas for reads, or shards for writes, or put a cache in front',
    queue: 'add consumers',
  };
  const top = ranked[0];
  if (top && top.peak >= 0.9) {
    const db = top.c.kind === 'database' ? (top.c as Database) : null;
    const where = db && top.s.perInstance.length > 1 ? ` (its busiest node is ${pct(top.peak)} busy)` : '';
    out.push(`${name(top.c)} is the bottleneck: ${pct(top.s.utilisation)} busy${where}, so requests queue there; ${advice[top.c.kind]}.`);
  } else if (top) {
    out.push(`Nothing is saturated: the busiest part is ${name(top.c)} at ${pct(top.peak)}, so there is headroom for more traffic.`);
  }
  // An app waiting on a busy database shows as a busy app too: say so.
  const app = ranked.find((x) => x.c.kind === 'app');
  const dbs = ranked.filter((x) => x.c.kind === 'database');
  if (app && app.peak >= 0.9 && dbs.some((d) => d.peak >= 0.8) && top?.c.kind === 'app')
    out.push(`The app servers spend much of their time waiting on the database, which is ${pct(Math.max(...dbs.map((d) => d.peak)))} busy: speeding up the database frees the app servers too.`);

  for (const c of design.components) {
    const s = r.components[c.id];
    if (c.kind === 'cache' && s.hitRate !== undefined && s.hitRate < 0.5 && s.served > 0)
      out.push(`${name(c)} hits only ${pct(s.hitRate)} of lookups: give it more capacity, or check the hot set fits (skew helps; a uniform key spread barely caches).`);
    if (c.kind === 'queue' && s.backlog !== undefined && s.backlog > 100)
      out.push(`${name(c)} ends with ${s.backlog.toLocaleString('en-GB')} writes still waiting (applied ${Math.round(s.applyDelayMs ?? 0)} ms after they were acknowledged, on average): its consumers can’t keep up.`);
    if (c.kind === 'rate-limiter' && s.dropped > 0) out.push(`${name(c)} turned away ${s.dropped.toLocaleString('en-GB')} requests (${pct(s.dropped / Math.max(1, r.offered))} of all) to protect what is behind it.`);
  }

  if (r.staleReads > 0) {
    const readCount = Math.max(1, r.okReads ?? r.ok);
    const skipsCache = design.components.some((c) => c.kind === 'app' && design.components.find((x) => x.id === c.reads)?.kind === 'cache' && c.writes !== c.reads);
    const why = skipsCache
      ? 'reads go through a cache but writes don’t, so cached copies go out of date; send writes through the cache (write-through or invalidate)'
      : 'replicas or queued writes lag behind the latest write';
    out.push(`${r.staleReads.toLocaleString('en-GB')} reads (${pct(r.staleReads / readCount)}) returned an older value than one already written: ${why}.`);
  }

  if (options.faults && options.faults.length > 0 && r.failed > 0) {
    const f = options.faults[0];
    const c = design.components.find((x) => x.id === f.component);
    out.push(`After ${c ? name(c) : f.component} lost a machine at ${f.at} s, ${r.failed.toLocaleString('en-GB')} requests failed${c?.kind === 'database' && !(c as Database).failover ? '; with failover, a replica would take over' : ''}.`);
  }
  if (r.timedOut > 0 && r.timedOut / Math.max(1, r.offered) > 0.01) out.push(`${pct(r.timedOut / r.offered)} of requests took longer than ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms and timed out.`);
  return out.slice(0, 5);
}

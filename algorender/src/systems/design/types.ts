// The system-design canvas (phase 6d): a design is a small set of components
// wired together, and a simulation runs seeded traffic through it, request by
// request, using the 6b/6c models as the components' insides (the cache is
// src/systems/cache.ts, shards are placed on src/systems/ring.ts, the rate
// limiter is src/systems/token-bucket.ts, and every server is a queue with
// workers like src/systems/queueing.ts). This file is the contract shared by
// the simulator, the canvas and the case studies.

import type { Policy } from '@/systems/cache';

/** A component's id, unique within a design (e.g. "api", "db"). Wiring refers to components by id. */
export type Ref = string;

/** The traffic a group of clients sends. */
export type Workload = {
  /** Requests a second at steady state. */
  rps: number;
  /** Share of requests that are reads (0–1); the rest are writes. */
  readShare: number;
  /** How many distinct keys requests touch. */
  keys: number;
  /** Zipf exponent for which key a request touches: 0 is uniform, about 1 is typical web traffic (a few keys are hot). */
  skew: number;
  /** A burst of extra traffic: from `at` seconds for `seconds`, the rate is multiplied by `factor`. */
  spike?: { at: number; seconds: number; factor: number };
};

type Base = { id: Ref; label: string };

/** Where traffic starts. Exactly one per design. */
export type Clients = Base & { kind: 'clients'; workload: Workload; to: Ref };

/** A token bucket in front of everything: requests over the limit are rejected at once (HTTP 429). */
export type RateLimiter = Base & { kind: 'rate-limiter'; burst: number; perSecond: number; to: Ref };

/** Spreads requests over an app tier's instances, skipping crashed ones. `to` must be an app. */
export type LoadBalancer = Base & { kind: 'load-balancer'; policy: 'round-robin' | 'least-connections' | 'random'; to: Ref };

/**
 * Stateless application servers: `instances` machines with `workers` requests
 * in progress each; a request waits in that instance's queue when all its
 * workers are busy. Each request costs `serviceMs` of work, then reads go to
 * `reads` and writes to `writes` (a cache, a database or a queue). A write
 * with `fanout` > 1 makes that many writes downstream (a post copied into
 * every follower's feed).
 */
export type App = Base & { kind: 'app'; instances: number; workers: number; serviceMs: number; reads: Ref; writes: Ref; fanout: number };

/**
 * A cache cluster of `nodes`, keys spread over them by consistent hashing,
 * each node holding `capacity` keys under LRU or LFU. A read that misses goes
 * on to `to` and fills the cache on the way back. Writes that reach the cache
 * go on to `to` and either update the cached copy (write-through) or delete it
 * (invalidate). Writes that skip the cache leave stale copies behind.
 */
export type Cache = Base & { kind: 'cache'; nodes: number; capacity: number; policy: Policy; serviceMs: number; writes: 'write-through' | 'invalidate'; to: Ref };

/**
 * A database: `shards` partitions by key (consistent hashing), each with one
 * primary and `replicas` read replicas, every node with `workers` connections.
 * Writes go to the shard's primary; reads go to its replicas when there are
 * any (round robin), otherwise to the primary. Replicas apply writes
 * `replicaLagMs` later, so a read there can be stale. With `failover`, a
 * crashed primary's first live replica takes over after `failoverMs`.
 */
export type Database = Base & {
  kind: 'database';
  shards: number;
  replicas: number;
  workers: number;
  readMs: number;
  writeMs: number;
  replicaLagMs: number;
  failover: boolean;
  failoverMs: number;
};

/**
 * A durable queue in front of slower work: a write is acknowledged once it is
 * enqueued (fast), and `consumers` workers apply it to `to` later. The backlog
 * and how long writes wait to be applied are what it costs.
 */
export type Queue = Base & { kind: 'queue'; consumers: number; to: Ref };

export type Component = Clients | RateLimiter | LoadBalancer | App | Cache | Database | Queue;
export type ComponentKind = Component['kind'];

/** A design: its components, in any order. */
export type Design = { components: readonly Component[] };

/**
 * A machine crashing at `at` seconds into the run (and staying down).
 * `instance` counts within the component: an app's or cache's nodes from 0;
 * a database's nodes shard by shard, each shard's primary first, then its
 * replicas (shard 0 primary = 0, its first replica = 1, …).
 */
export type Fault = { at: number; component: Ref; instance: number };

export type RunOptions = {
  /** Simulated seconds of traffic. */
  seconds: number;
  seed: number;
  faults?: readonly Fault[];
  /** A request that takes longer than this counts as timed out (default 1000 ms). */
  timeoutMs?: number;
};

/** What happened to one request. */
export type Outcome = 'ok' | 'rejected' | 'failed' | 'timeout';

export type Percentiles = { p50: number; p95: number; p99: number; mean: number };

/** Per-component numbers from a run. */
export type ComponentStats = {
  /** Busy share of all workers over the run (0–1); for a queue, of its consumers. */
  utilisation: number;
  /** Busy share per instance / node, in instance order (a crashed instance counts from its crash as idle). */
  perInstance: readonly number[];
  /** Requests (or writes) it handled. */
  served: number;
  /** Most requests waiting at once, over all its instances. */
  peakQueue: number;
  /** Requests it turned away or lost: over the limit, no live instance, crashed mid-request. */
  dropped: number;
  /** Caches: hits / lookups. */
  hitRate?: number;
  /** Queues: items still waiting at the end, and the mean time from enqueue to applied (ms). */
  backlog?: number;
  applyDelayMs?: number;
};

/** One time bucket of the run, for charts. */
export type Bucket = { t: number; offered: number; ok: number; errors: number; p50: number; p99: number };

export type SimResult = {
  seconds: number;
  /** Requests the clients sent. */
  offered: number;
  ok: number;
  rejected: number;
  failed: number;
  timedOut: number;
  /** Latency of successful requests (ms), all, and split by reads and writes. */
  latency: Percentiles;
  reads: Percentiles;
  writes: Percentiles;
  /** Successful requests a second. */
  throughput: number;
  /** (rejected + failed + timedOut) / offered. */
  errorRate: number;
  /** Reads that returned an older version of a key than the latest acknowledged write. */
  staleReads: number;
  /** Successful reads: the stale share is staleReads / okReads. */
  okReads?: number;
  bucketSeconds: number;
  series: readonly Bucket[];
  components: Readonly<Record<Ref, ComponentStats>>;
  costPerMonth: number;
  /** Plain-language findings worth reading first: the bottleneck, saturation, a cold cache, stale reads. */
  findings: readonly string[];
};

/** What a case study asks for. Every field is optional; a check is made for each one given. */
export type Targets = {
  /** At least this many successful requests a second. */
  throughput?: number;
  /** p99 latency of successful requests at most this (ms). */
  p99Ms?: number;
  /** At most this share of requests fail, time out or are rejected. */
  maxErrorRate?: number;
  /**
   * At most this share of requests fail or time out. Rejections (HTTP 429)
   * don't count: shedding load on purpose is allowed, losing it isn't.
   */
  maxFailureRate?: number;
  /** p99 latency of successful writes at most this (ms): how long a write keeps its user waiting. */
  writeP99Ms?: number;
  /** At most this many dollars a month. */
  maxCost?: number;
  /** At most this share of reads are stale. */
  maxStaleRate?: number;
  /** Also run with these faults; the error rate must stay at most `maxErrorRate` there. */
  survive?: { faults: readonly Fault[]; maxErrorRate: number; label: string };
};

export type Check = { id: string; label: string; ok: boolean; want: string; actual: string };

export type CaseStudy = {
  slug: string;
  title: string;
  /** One sentence for the list. */
  summary: string;
  /** The problem in a few short paragraphs (Markdown). */
  brief: string;
  /** Bullet points: the functional and non-functional requirements. */
  requirements: readonly string[];
  /** The clients' traffic; fixed for the case (the learner can't edit it). */
  workload: Workload;
  /**
   * Settings the case fixes whatever the design says, because they are part of
   * the problem rather than a choice: every app's write fan-out (followers per
   * post), and the least replica lag (replicas in another data centre).
   */
  fixed?: { fanout?: number; minReplicaLagMs?: number };
  targets: Targets;
  /** Where the learner starts (usually too small or missing a piece). */
  start: Design;
  /** One design that meets every target, for tests and the "show a solution" reveal. */
  reference: Design;
  /** Graded hints, gentlest first. */
  hints: readonly string[];
  /** The trade-off the case is about, shown after it passes. */
  lesson: string;
  /** Concept in src/content/concepts.yaml that a pass counts towards. */
  concept: string;
  /** Simulated seconds per check run. */
  seconds: number;
};

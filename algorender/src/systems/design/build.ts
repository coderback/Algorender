// Building blocks for designs: what each kind of component is, its defaults,
// and the bounds every number must stay inside (the canvas's inputs and
// validation both read LIMITS).

import type { Component, ComponentKind, Design, Ref, Workload } from './types';

export const KIND_INFO: Record<ComponentKind, { name: string; blurb: string }> = {
  clients: { name: 'Clients', blurb: 'Where requests come from: a rate, a read/write mix and how often each key is asked for.' },
  'rate-limiter': { name: 'Rate limiter', blurb: 'A token bucket that turns away requests over the limit at once, so a spike can’t swamp what is behind it.' },
  'load-balancer': { name: 'Load balancer', blurb: 'Spreads requests over an app tier’s instances and stops sending to ones that have crashed.' },
  app: { name: 'App servers', blurb: 'Stateless servers that do the request’s work, then read or write through a cache, a database or a queue.' },
  cache: { name: 'Cache', blurb: 'Keeps hot keys in memory, spread over nodes by consistent hashing; a miss goes on to the database.' },
  database: { name: 'Database', blurb: 'The system of record: shards split the keys, replicas take reads, and writes go to each shard’s primary.' },
  queue: { name: 'Queue', blurb: 'Acknowledges a write as soon as it is stored, then consumers apply it later: fast replies, delayed effects.' },
};

/**
 * Bounds for every number in a design, keyed `${kind}.${field}`; a workload's
 * fields are `workload.${field}` (`workload.spike.at` for the spike's).
 * `run.seconds` bounds a run's length.
 */
export const LIMITS: Record<string, { min: number; max: number; step?: number; unit?: string }> = {
  'workload.rps': { min: 1, max: 50_000, unit: 'req/s' },
  'workload.readShare': { min: 0, max: 1, step: 0.01 },
  'workload.keys': { min: 1, max: 1_000_000, unit: 'keys' },
  'workload.skew': { min: 0, max: 2, step: 0.1 },
  'workload.spike.at': { min: 0, max: 60, step: 0.5, unit: 's' },
  'workload.spike.seconds': { min: 0.5, max: 60, step: 0.5, unit: 's' },
  'workload.spike.factor': { min: 1, max: 10, step: 0.5, unit: '×' },
  'rate-limiter.burst': { min: 1, max: 100_000, unit: 'requests' },
  'rate-limiter.perSecond': { min: 1, max: 50_000, unit: 'req/s' },
  'app.instances': { min: 1, max: 50 },
  'app.workers': { min: 1, max: 64, unit: 'per instance' },
  'app.serviceMs': { min: 0.1, max: 1000, step: 0.1, unit: 'ms' },
  'app.fanout': { min: 1, max: 100, unit: 'writes' },
  'cache.nodes': { min: 1, max: 16 },
  'cache.capacity': { min: 1, max: 1_000_000, unit: 'keys per node' },
  'cache.serviceMs': { min: 0.1, max: 100, step: 0.1, unit: 'ms' },
  'database.shards': { min: 1, max: 16 },
  'database.replicas': { min: 0, max: 5, unit: 'per shard' },
  // One machine only goes so big: past 64 connections a database has to shard.
  'database.workers': { min: 1, max: 64, unit: 'connections per node' },
  'database.readMs': { min: 0.1, max: 1000, step: 0.1, unit: 'ms' },
  'database.writeMs': { min: 0.1, max: 1000, step: 0.1, unit: 'ms' },
  'database.replicaLagMs': { min: 0, max: 10_000, unit: 'ms' },
  'database.failoverMs': { min: 0, max: 60_000, unit: 'ms' },
  'queue.consumers': { min: 1, max: 64 },
  'run.seconds': { min: 1, max: 60, unit: 's' },
};

export const DEFAULT_WORKLOAD: Workload = { rps: 1000, readShare: 0.9, keys: 100_000, skew: 1 };

/** A component of `kind` with sensible defaults and nothing wired yet (`''`). */
export function newComponent(kind: ComponentKind, id: Ref): Component {
  const label = KIND_INFO[kind].name;
  switch (kind) {
    case 'clients':
      return { id, label, kind, workload: { ...DEFAULT_WORKLOAD }, to: '' };
    case 'rate-limiter':
      return { id, label, kind, burst: 500, perSecond: 2000, to: '' };
    case 'load-balancer':
      return { id, label, kind, policy: 'round-robin', to: '' };
    case 'app':
      return { id, label, kind, instances: 2, workers: 8, serviceMs: 5, reads: '', writes: '', fanout: 1 };
    case 'cache':
      return { id, label, kind, nodes: 1, capacity: 10_000, policy: 'lru', serviceMs: 1, writes: 'invalidate', to: '' };
    case 'database':
      return { id, label, kind, shards: 1, replicas: 0, workers: 16, readMs: 5, writeMs: 10, replicaLagMs: 100, failover: false, failoverMs: 5000 };
    case 'queue':
      return { id, label, kind, consumers: 4, to: '' };
  }
}

/**
 * Clients → load balancer → two app servers → one database. At the default
 * 1,000 req/s the app tier is about 70% busy (each request holds an app
 * worker while it waits on the database), so it saturates at around 1,500.
 */
export function starterDesign(): Design {
  return {
    components: [
      { id: 'clients', label: 'Clients', kind: 'clients', workload: { ...DEFAULT_WORKLOAD }, to: 'lb' },
      { id: 'lb', label: 'Load balancer', kind: 'load-balancer', policy: 'round-robin', to: 'app' },
      { id: 'app', label: 'App servers', kind: 'app', instances: 2, workers: 8, serviceMs: 5, reads: 'db', writes: 'db', fanout: 1 },
      { id: 'db', label: 'Database', kind: 'database', shards: 1, replicas: 0, workers: 16, readMs: 5, writeMs: 10, replicaLagMs: 100, failover: false, failoverMs: 5000 },
    ],
  };
}

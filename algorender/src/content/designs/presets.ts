import type { App, Cache, Clients, Component, Database, Design, LoadBalancer, Workload } from '@/systems/design/types';

// Starting designs for the system-design lesson's labs (<DesignLab preset="…" />).
// Each sets up one trade-off; the lesson's captions say what to change and
// what to watch, and their numbers come from simulating these exact designs.

export type DesignPreset = { design: Design; seconds: number; note?: string };

const clients = (workload: Workload, to = 'lb'): Clients => ({ id: 'clients', label: 'Clients', kind: 'clients', workload, to });
const lb: LoadBalancer = { id: 'lb', label: 'Load balancer', kind: 'load-balancer', policy: 'round-robin', to: 'app' };
const app = (over: Partial<App> = {}): App => ({ id: 'app', label: 'App servers', kind: 'app', instances: 2, workers: 8, serviceMs: 5, reads: 'db', writes: 'db', fanout: 1, ...over });
const db = (over: Partial<Database> = {}): Database => ({
  id: 'db',
  label: 'Database',
  kind: 'database',
  shards: 1,
  replicas: 0,
  workers: 16,
  readMs: 5,
  writeMs: 10,
  replicaLagMs: 100,
  failover: false,
  failoverMs: 5000,
  ...over,
});
const cache = (over: Partial<Cache> = {}): Cache => ({ id: 'cache', label: 'Cache', kind: 'cache', nodes: 1, capacity: 10_000, policy: 'lru', serviceMs: 1, writes: 'invalidate', to: 'db', ...over });
const design = (...components: Component[]): Design => ({ components });

export const designPresets: Record<string, DesignPreset> = {
  /** Too much traffic for two app servers; add instances until the database becomes the bottleneck. */
  'scale-out': {
    seconds: 10,
    design: design(clients({ rps: 3000, readShare: 0.9, keys: 100_000, skew: 1 }), lb, app(), db()),
  },
  /** A cache in front of the database, with writes that skip it: fast reads, many of them stale. */
  'cache-aside': {
    seconds: 10,
    design: design(clients({ rps: 3000, readShare: 0.9, keys: 10_000, skew: 1 }), lb, app({ instances: 4, reads: 'cache', writes: 'db' }), cache({ capacity: 2000 }), db()),
  },
  /** A read-heavy load on one primary; add replicas and watch staleness against their lag. */
  replicas: {
    seconds: 10,
    design: design(clients({ rps: 3500, readShare: 0.95, keys: 100_000, skew: 1 }), lb, app({ instances: 6 }), db({ replicaLagMs: 1000 })),
  },
  /** Writes alone swamp one primary; shard the keys. */
  sharding: {
    seconds: 10,
    design: design(clients({ rps: 2500, readShare: 0.2, keys: 100_000, skew: 0.5 }), lb, app({ instances: 6 }), db()),
  },
  /** Slow writes held in line; the learner adds a queue and sends the writes to it. */
  'queue-writes': {
    seconds: 10,
    design: design(clients({ rps: 1000, readShare: 0.5, keys: 100_000, skew: 0.5 }), lb, app({ instances: 6 }), db({ workers: 32, writeMs: 40 })),
  },
  /** A primary with a replica; crash the primary, with and without failover. */
  failover: {
    seconds: 10,
    design: design(clients({ rps: 1000, readShare: 0.9, keys: 100_000, skew: 1 }), lb, app({ instances: 3 }), db({ replicas: 1, failoverMs: 2000 })),
  },
};

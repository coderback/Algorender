import type { CaseStudy, Workload } from '@/systems/design/types';
import { app, clients, db, lb } from './parts';

const workload: Workload = { rps: 5000, readShare: 0.8, keys: 100_000, skew: 0.6 };

export const keyValueStore: CaseStudy = {
  slug: 'key-value-store',
  title: 'A replicated key-value store',
  summary: 'Store keys on shards with replicas, keep serving when a primary dies, and keep stale reads rare.',
  brief: `A key-value store behind an API: \`get(key)\` and \`put(key, value)\`, 5,000 requests a second, four in five of them reads.

The data is already split over two shards, each with a primary and a read replica. Replicas copy the primary's writes **asynchronously**: a write is acknowledged once the primary has it, and the replica catches up a little later. Until it does, a read from the replica returns the old value.

Machines fail. The check runs the traffic twice: once normally, and once with **shard 0's primary crashing three seconds in**. Writes to that shard have nowhere to go unless something takes the primary's place.

The replicas are in a distant data centre and lag a full second behind. Bring them closer (lower the lag, though no closer than 100 ms: they stay in another building for safety) and make the store survive losing a primary.`,
  requirements: [
    'get(key) and put(key, value): 5,000 requests a second, 80% reads.',
    'Survive a primary crashing: keep serving reads and writes.',
    'Few reads may return an out-of-date value.',
    'Fast for everyone.',
  ],
  workload,
  fixed: { minReplicaLagMs: 100 },
  targets: {
    throughput: 4950,
    p99Ms: 50,
    maxErrorRate: 0.01,
    maxStaleRate: 0.02,
    maxCost: 2000,
    survive: { faults: [{ at: 3, component: 'db', instance: 0 }], maxErrorRate: 0.02, label: 'Shard 0’s primary crashes at 3 s' },
  },
  start: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 10, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 2, replicas: 1, workers: 32, readMs: 5, writeMs: 10, replicaLagMs: 1000, failover: false, failoverMs: 5000 }),
    ],
  },
  reference: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 10, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 2, replicas: 1, workers: 32, readMs: 5, writeMs: 10, replicaLagMs: 100, failover: true, failoverMs: 1000 }),
    ],
  },
  hints: [
    'Run the starting design and look at both results: the normal run’s stale reads, and the errors in the run where a primary crashes.',
    'Two separate problems: replicas a second behind serve old values, and a crashed primary leaves its shard with nowhere to send writes. The replica already holds nearly all of the primary’s data.',
    'Lower the replication lag, and turn on failover so a replica is promoted when its primary dies. A shorter failover time means fewer writes fail while the shard has no primary; check the error rate in the crash run.',
  ],
  lesson:
    'Asynchronous replication makes writes fast (they wait only for the primary) and keeps reads available when a primary dies, but a replica serves whatever it has, so reads can be stale, and writes the primary acknowledged but hadn’t yet shipped can be lost on failover. Synchronous replication closes both gaps by making every write wait for a replica, which costs write latency and fails writes when the replica is unreachable: the consistency-versus-availability choice in miniature. Failover itself needs care: deciding that a primary is dead, and making sure only one node believes it is primary, is exactly what consensus protocols like Raft are for.',
  concept: 'system-design',
  seconds: 10,
};

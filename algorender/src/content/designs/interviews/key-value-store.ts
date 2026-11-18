import type { InterviewVariant } from '@/interview/design';
import type { Workload } from '@/systems/design/types';
import { keyValueStore } from '../key-value-store';
import { app, clients, db, lb } from '../parts';
import { peakFromDay, rateOf, totalSize } from './estimates';

// Interview variants of the replicated key-value store (replicas that lag
// serve stale reads, and a crashed primary needs a replacement): new stories,
// new numbers, same lesson.

const sessionPeak = peakFromDay(259_200_000, 2, 'requests');
const sessionWorkload: Workload = { rps: rateOf(sessionPeak), readShare: 0.9, keys: 200_000, skew: 0.7 };

export const sessionStore: InterviewVariant = {
  ...keyValueStore,
  case: keyValueStore.slug,
  slug: 'session-store',
  title: 'A store for login sessions',
  summary: 'Every page view checks a login session. Keep checks fast and correct, and keep going when a machine dies.',
  brief: `A website keeps its **25 million** users' login sessions in a key-value store: \`get(session)\` on every page view, \`put(session)\` when someone logs in, out or changes a setting. Each session is **2 KB**.

The store gets **259.2 million requests a day**, and the evening peak is **twice the average**; nine in ten are reads.

The data is split over two parts, each with a primary and a copy that serves reads. The copies take each write **asynchronously** and sit in a distant data centre, almost a second behind; until a copy catches up, it returns the old session (a user who just logged out still looks logged in). Copies can come closer, but no closer than 100 ms: they stay in another building for safety.

Machines fail. The check also runs the traffic with **part 0's primary crashing three seconds in**: its writes have nowhere to go unless something takes its place.`,
  requirements: [
    'get(session) and put(session): 90% reads.',
    'Keep serving reads and writes when a primary crashes.',
    'Few reads may return an out-of-date session.',
    'Fast for every page view.',
  ],
  workload: sessionWorkload,
  fixed: { minReplicaLagMs: 100 },
  targets: {
    throughput: 5950,
    p99Ms: 50,
    maxErrorRate: 0.01,
    maxStaleRate: 0.02,
    maxCost: 2000,
    survive: { faults: [{ at: 3, component: 'db', instance: 0 }], maxErrorRate: 0.02, label: 'Part 0’s primary crashes at 3 s' },
  },
  start: {
    components: [
      clients('lb', sessionWorkload),
      lb('app'),
      app({ instances: 12, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 2, replicas: 1, workers: 32, readMs: 5, writeMs: 10, replicaLagMs: 800, failover: false, failoverMs: 5000 }),
    ],
  },
  reference: {
    components: [
      clients('lb', sessionWorkload),
      lb('app'),
      app({ instances: 12, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 2, replicas: 1, workers: 32, readMs: 5, writeMs: 10, replicaLagMs: 100, failover: true, failoverMs: 1000 }),
    ],
  },
  hints: [
    'Check the starting design and read both runs: the stale reads in the normal one, and the errors in the one where a primary crashes.',
    'Two problems: copies far behind hand out old sessions, and a crashed primary leaves its part with nowhere to write. The copy already holds nearly all the primary’s data.',
    'Bring the copies as close as allowed, and let a copy take over when its primary dies; the sooner it takes over, the fewer writes fail.',
  ],
  estimates: [sessionPeak, totalSize(25_000_000, 2_000, 'sessions')],
  deepDive: {
    label: 'Part 1’s primary also crashes at 5 s',
    say: 'Let’s dig in. A bad night: besides part 0’s primary, part 1’s primary crashes too, five seconds in. Check your design with that, then tell me what users notice while it happens, and what happens to writes in flight.',
    faults: [
      { at: 3, kind: 'database', shard: 0 },
      { at: 5, kind: 'database', shard: 1 },
    ],
    targets: { maxErrorRate: 0.03 },
  },
};

const cartPeak = peakFromDay(172_800_000, 2, 'requests');
const cartWorkload: Workload = { rps: rateOf(cartPeak), readShare: 0.7, keys: 100_000, skew: 0.6 };

export const shoppingCarts: InterviewVariant = {
  ...keyValueStore,
  case: keyValueStore.slug,
  slug: 'shopping-carts',
  title: 'Shopping carts that survive a crash',
  summary: 'Carts are read and changed constantly. An item that vanishes, or comes back after being removed, loses a sale.',
  brief: `An online shop keeps every shopper's cart in a key-value store: \`get(cart)\` whenever a page shows the cart, \`put(cart)\` when an item is added or removed. There are **10 million** active carts of about **4 KB** each.

The store gets **172.8 million requests a day**, and the evening peak is **twice the average**; seven in ten are reads.

The data is split over two parts, each with a primary and a copy that serves reads. Copies take each write **asynchronously**, and these sit far away, most of a second behind: a shopper who just removed an item may still see it. Copies can come closer, but no closer than 100 ms.

Machines fail. The check also runs the traffic with **part 0's primary crashing three seconds in**.`,
  requirements: [
    'get(cart) and put(cart): 70% reads.',
    'Keep serving carts when a primary crashes.',
    'Few shoppers may see an out-of-date cart.',
    'Fast on every page.',
  ],
  workload: cartWorkload,
  fixed: { minReplicaLagMs: 100 },
  targets: {
    throughput: 3950,
    p99Ms: 50,
    maxErrorRate: 0.01,
    maxStaleRate: 0.03,
    maxCost: 2000,
    survive: { faults: [{ at: 3, component: 'db', instance: 0 }], maxErrorRate: 0.02, label: 'Part 0’s primary crashes at 3 s' },
  },
  start: {
    components: [
      clients('lb', cartWorkload),
      lb('app'),
      app({ instances: 8, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 2, replicas: 1, workers: 32, readMs: 5, writeMs: 10, replicaLagMs: 700, failover: false, failoverMs: 5000 }),
    ],
  },
  reference: {
    components: [
      clients('lb', cartWorkload),
      lb('app'),
      app({ instances: 8, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 2, replicas: 1, workers: 32, readMs: 5, writeMs: 10, replicaLagMs: 100, failover: true, failoverMs: 1000 }),
    ],
  },
  hints: [
    'Check the starting design and compare its two runs: what goes wrong normally, and what goes wrong when a primary crashes?',
    'Copies far behind show old carts; a crashed primary leaves half the carts unwritable. The copy has almost everything the primary had.',
    'Bring the copies closer, and let a copy take over from a dead primary quickly; then check the crash run’s errors.',
  ],
  estimates: [cartPeak, totalSize(10_000_000, 4_000, 'carts')],
  deepDive: {
    label: 'A copy crashes at 4 s',
    say: 'Let’s dig in. Four seconds in, the copy in part 0 that serves reads crashes. Check your design with that, then tell me where those reads go now, and what it costs.',
    faults: [{ at: 4, kind: 'database', shard: 0, replica: 1 }],
    targets: { p99Ms: 80, maxErrorRate: 0.01 },
  },
};

import type { InterviewVariant } from '@/interview/design';
import type { Workload } from '@/systems/design/types';
import { newsFeed } from '../news-feed';
import { app, cache, clients, db, lb, queue } from '../parts';
import { peakFromDay, rateOf, storage } from './estimates';

// Interview variants of the news feed (fan-out on write: a write becomes many,
// so take the copies off the writer's critical path): new stories, new
// numbers, same lesson.

const fitnessPeak = peakFromDay(130_000_000, 2, 'requests');
const fitnessWorkload: Workload = { rps: rateOf(fitnessPeak), readShare: 0.88, keys: 40_000, skew: 1 };

export const workoutFeed: InterviewVariant = {
  ...newsFeed,
  case: newsFeed.slug,
  slug: 'workout-feed',
  title: 'A fitness app’s activity feed',
  summary: 'Every finished workout is copied into eight friends’ feeds. Logging a workout must feel instant.',
  brief: `A fitness app shows each user a feed of their friends' workouts. When someone finishes a workout, it is copied into each of their friends' feeds, so opening a feed is one quick read.

Every workout goes to **eight** friends. The app gets **130 million requests a day**, and the after-work peak is **twice the average**; about 12 requests in 100 log a workout, the rest open a feed. Each feed entry is **300 bytes**, and feeds are kept for a year.

Right now the app servers write all eight copies before telling the user their workout was saved, so saving is slow, and the copies crowd out feed reads at the database.

Make saving a workout feel instant and feeds load fast. A friend seeing a workout a few moments late is fine; losing it is not. Every friend must still get every workout.`,
  requirements: [
    'Open a feed (a read): 88% of requests.',
    'Log a workout (a write), copied into 8 friends’ feeds.',
    'The user waits only until the workout is safely stored, not for every copy.',
    'Feeds may lag briefly (a few stale reads are fine), but no workout may be lost.',
  ],
  workload: fitnessWorkload,
  fixed: { fanout: 8 },
  targets: { throughput: 2950, p99Ms: 50, writeP99Ms: 25, maxErrorRate: 0.01, maxStaleRate: 0.05, maxCost: 1100 },
  start: {
    components: [
      clients('lb', fitnessWorkload),
      lb('app'),
      app({ instances: 3, workers: 8, serviceMs: 2, reads: 'db', writes: 'db', fanout: 8 }),
      db({ workers: 32, readMs: 5, writeMs: 4 }),
    ],
  },
  reference: {
    components: [
      clients('lb', fitnessWorkload),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 2, reads: 'cache', writes: 'queue', fanout: 8 }),
      cache({ nodes: 2, capacity: 10_000, writes: 'invalidate', to: 'db' }),
      queue({ consumers: 20, to: 'cache' }),
      db({ workers: 32, readMs: 5, writeMs: 4 }),
    ],
  },
  hints: [
    'Check the starting design and compare read and write latency. What is a saved workout waiting for before it returns?',
    'The user needs the workout stored safely, not the eight copies made. Something durable could take the copies and have workers make them afterwards.',
    'Hand the app’s writes to something durable whose workers apply them through a fast layer in front of the database, and send reads through that layer; give it enough workers that nothing piles up, and check the stale reads.',
  ],
  estimates: [fitnessPeak, storage(15_600_000 * 8, 300, 365, 'a year of feed entries', 'a year')],
  deepDive: {
    label: 'Twice the traffic for 3 s',
    say: 'Let’s dig in. New Year’s Day: from three seconds in, twice the usual traffic for three seconds, and everyone is logging workouts. Check your design under that, then tell me where the extra work goes, and what a friend sees.',
    spike: { at: 3, seconds: 3, factor: 2 },
    targets: { writeP99Ms: 40, maxErrorRate: 0.01 },
  },
};

const orderPeak = peakFromDay(108_000_000, 2, 'requests');
const orderWorkload: Workload = { rps: rateOf(orderPeak), readShare: 0.8, keys: 30_000, skew: 0.9 };

export const orderUpdates: InterviewVariant = {
  ...newsFeed,
  case: newsFeed.slug,
  slug: 'order-updates',
  title: 'Order updates on a marketplace',
  summary: 'Each change to an order is copied to six dashboards. The seller must not wait for all six.',
  brief: `On a marketplace, every change to an order (paid, packed, shipped) appears on **six** dashboards: the buyer's, the seller's, the courier's, support's and two internal ones. Each dashboard keeps its own ready-made copy, so viewing one is a single quick read.

The service gets **108 million requests a day**, and the lunchtime peak is **twice the average**. One request in five changes an order; the rest view a dashboard.

Right now the app servers update all six copies before answering the seller, so marking an order shipped is slow, and the copies crowd out dashboard views at the database.

Make updating an order feel instant and dashboards load fast. A dashboard a moment behind is acceptable; an update that never arrives is not. Every dashboard must get every change.`,
  requirements: [
    'View a dashboard (a read): 80% of requests.',
    'Change an order (a write), copied to 6 dashboards.',
    'The seller waits only for the change to be safely stored.',
    'A dashboard may lag briefly, but no change may be lost.',
  ],
  workload: orderWorkload,
  fixed: { fanout: 6 },
  targets: { throughput: 2450, p99Ms: 50, writeP99Ms: 25, maxErrorRate: 0.01, maxStaleRate: 0.08, maxCost: 1100 },
  start: {
    components: [
      clients('lb', orderWorkload),
      lb('app'),
      app({ instances: 3, workers: 8, serviceMs: 2, reads: 'db', writes: 'db', fanout: 6 }),
      db({ workers: 32, readMs: 5, writeMs: 4 }),
    ],
  },
  reference: {
    components: [
      clients('lb', orderWorkload),
      lb('app'),
      app({ instances: 3, workers: 8, serviceMs: 2, reads: 'cache', writes: 'queue', fanout: 6 }),
      cache({ nodes: 2, capacity: 10_000, writes: 'invalidate', to: 'db' }),
      queue({ consumers: 20, to: 'cache' }),
      db({ workers: 32, readMs: 5, writeMs: 4 }),
    ],
  },
  hints: [
    'Check the starting design: how long does a change take compared with a view, and why?',
    'The seller only needs to know the change is stored. The six copies could be made a moment later, by something else.',
    'Hand the writes to something durable whose workers apply them through a fast layer in front of the database, and read through that layer; size the workers so nothing piles up.',
  ],
  estimates: [orderPeak, storage(21_600_000 * 6, 200, 365, 'a year of dashboard copies at 200 bytes each', 'a year')],
  deepDive: {
    label: 'An app server crashes at 3 s',
    say: 'Let’s dig into a failure. At lunchtime, three seconds in, one of your app servers crashes and stays down. Check your design with that happening, then tell me what sellers and buyers notice, and why.',
    faults: [{ at: 3, kind: 'app', instance: 0 }],
    targets: { p99Ms: 100, writeP99Ms: 40, maxErrorRate: 0.01 },
  },
};

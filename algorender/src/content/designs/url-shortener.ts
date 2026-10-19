import type { CaseStudy, Workload } from '@/systems/design/types';
import { app, cache, clients, db, lb } from './parts';

const workload: Workload = { rps: 6000, readShare: 0.9, keys: 20_000, skew: 1.2 };

export const urlShortener: CaseStudy = {
  slug: 'url-shortener',
  title: 'A URL shortener',
  summary: 'Turn long links into short ones and redirect millions of clicks a day: a read-heavy service where a cache does most of the work.',
  brief: `People paste a long link and get back a short one like \`ar.dr/x7Kq2\`. Every click on the short link asks the service where it points, then redirects.

Creating links is rare; following them is not. Nine requests in ten are redirects, and a few links (the ones in a viral post) get most of the clicks: the traffic is **skewed**.

You start with two app servers in front of one database. At 6,000 requests a second they are swamped. Make it fast and reliable without spending more than you need to.`,
  requirements: [
    'Create a short link for a long URL (a write).',
    'Redirect a short link to its URL (a read): 90% of traffic.',
    '6,000 requests a second, with a few popular links taking most of the clicks.',
    'Redirects must feel instant, and the service must not drop requests.',
  ],
  workload,
  targets: { throughput: 5900, p99Ms: 50, maxErrorRate: 0.01, maxCost: 800 },
  start: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 2, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  reference: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 5, workers: 8, serviceMs: 2, reads: 'cache', writes: 'cache' }),
      cache({ nodes: 2, capacity: 10_000, writes: 'invalidate', to: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Run the starting design and read the findings: which tier is the bottleneck, and what is each request waiting on?',
    'Nine requests in ten read a link that rarely changes, and a few links are read far more than the rest. Something in memory could answer most of them without touching the database.',
    'Add a cache between the app servers and the database, and send both reads and writes through it (so a changed link is invalidated). Then add app servers until they are no longer the bottleneck, and check the cost.',
  ],
  lesson:
    'A cache in front of a read-heavy, skewed workload turns most reads into memory lookups. Here about three reads in four hit it, so the database sees a quarter of the reads, and each app server finishes its requests sooner, so fewer servers do the same work. Scaling the app servers and the database alone also meets the latency target, but at about twice the cost. Cache memory is cheap next to servers, yet a bigger cache earns less and less: the last keys it holds are the ones asked for least, and every write that invalidates a hot link costs a miss.',
  concept: 'system-design',
  seconds: 10,
};

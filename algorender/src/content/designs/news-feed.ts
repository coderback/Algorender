import type { CaseStudy, Workload } from '@/systems/design/types';
import { app, cache, clients, db, lb, queue } from './parts';

const workload: Workload = { rps: 4000, readShare: 0.9, keys: 50_000, skew: 1 };

export const newsFeed: CaseStudy = {
  slug: 'news-feed',
  title: 'A news feed',
  summary: 'Every post is copied into ten followers’ feeds. Keep posting fast and feeds quick to load, and decide how stale a feed may be.',
  brief: `A social app shows each user a **feed** of posts from the people they follow. This design keeps a ready-made feed per user: when someone posts, the post is copied into each follower's feed (**fan-out on write**), so loading a feed is one quick read.

Here every post goes to ten followers, so one post is ten writes. Nine requests in ten load a feed; one in ten is a new post.

Right now the app servers make all ten writes before telling the poster it worked, so posting is slow, and those writes crowd out feed reads at the database.

Make posting feel instant and feeds load fast. A follower seeing a post a moment late is fine; losing it is not. Keep the app's fan-out at 10: the product needs every follower to get the post.`,
  requirements: [
    'Load a user’s feed (a read): 90% of 4,000 requests a second.',
    'Post (a write), copied into 10 followers’ feeds.',
    'The poster waits only for the post to be safely stored, not for every copy.',
    'A feed may lag a new post briefly (a small share of stale reads is fine), but no post may be lost.',
  ],
  workload,
  fixed: { fanout: 10 },
  targets: { throughput: 3950, p99Ms: 50, writeP99Ms: 25, maxErrorRate: 0.01, maxStaleRate: 0.05, maxCost: 1200 },
  start: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 2, reads: 'db', writes: 'db', fanout: 10 }),
      db({ workers: 32, readMs: 5, writeMs: 4 }),
    ],
  },
  reference: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 2, reads: 'cache', writes: 'queue', fanout: 10 }),
      cache({ nodes: 2, capacity: 10_000, writes: 'invalidate', to: 'db' }),
      queue({ consumers: 28, to: 'cache' }),
      db({ workers: 32, readMs: 5, writeMs: 4 }),
    ],
  },
  hints: [
    'Run the starting design and compare read and write latency in the results. What is a post waiting for before it returns?',
    'The poster doesn’t need the ten copies made before getting an answer, only for the post to be stored safely. Something durable could take the copies and let workers make them in the background.',
    'Send the app’s writes to a queue whose consumers apply them through a cache to the database, and send reads through that cache. Give the queue enough consumers that its backlog doesn’t grow, and check the stale-read rate.',
  ],
  lesson:
    'Fan-out on write makes reads cheap (a feed is one lookup) and writes expensive: every post becomes ten writes, a celebrity’s post millions. A queue decouples the two: the post is acknowledged once it is durably queued, and consumers make the copies at their own pace, so a burst of posts becomes a backlog instead of slow requests. The price is eventual consistency: for a moment, some followers don’t see the post yet. The alternative, fan-out on read, stores each post once and assembles a feed when it is loaded, which makes posting cheap and reading expensive; real systems mix the two, fanning out for most users and reading celebrities’ posts at load time.',
  concept: 'system-design',
  seconds: 10,
};

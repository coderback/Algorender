import type { CaseStudy, Workload } from '@/systems/design/types';
import { app, clients, db, lb } from './parts';

const workload: Workload = { rps: 10_000, readShare: 0.3, keys: 100_000, skew: 0.8 };

export const chat: CaseStudy = {
  slug: 'chat',
  title: 'A chat service',
  summary: 'Seven requests in ten send a message. Writes can’t be spread over read replicas, so the database has to be split by conversation.',
  brief: `A chat app stores every message in the conversation it belongs to. Sending a message is a write; opening a conversation reads its recent messages.

Chat is unusual: most traffic is **writes**. Seven requests in ten send a message, and there are 10,000 requests a second at peak.

Read replicas don't help with writes: every write still goes to the one primary. Neither does a bigger machine, past a point: the largest database node takes 64 connections. To go further, split the data. Give each conversation a home on one of several **shards**, so each primary takes only its share of the writes.

Some conversations are much busier than others (a big group chat), so watch how evenly the load spreads.`,
  requirements: [
    'Send a message (a write): 70% of 10,000 requests a second.',
    'Open a conversation and read its recent messages (a read): 30%.',
    'Messages are stored by conversation; one conversation’s messages live together.',
    'Fast for everyone, with nothing dropped.',
  ],
  workload,
  targets: { throughput: 9900, p99Ms: 60, maxErrorRate: 0.01, maxCost: 3000 },
  start: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 20, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 1, replicas: 1, workers: 64, readMs: 5, writeMs: 10 }),
    ],
  },
  reference: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 20, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 4, replicas: 0, workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Run the starting design. Which database node is busy, and which is idle? What does each one do?',
    'A replica only takes reads, and here most requests are writes, which all land on one primary, already at its 64-connection limit. The writes need more than one primary.',
    'Shard the database: each shard has its own primary, so the writes split between them. Drop the replica and pick a number of shards that leaves each primary comfortably below full, then check the per-node load in the results.',
  ],
  lesson:
    'Replicas scale reads; only partitioning scales writes. Sharding by conversation keeps each conversation’s messages together, so a read touches one shard, and consistent hashing lets you add shards later while moving only a share of the keys. The catch is the shard key: traffic follows it, so a few very busy conversations make some shards hotter than others (look at the per-node load), and anything that spans shards, such as searching every conversation, gets harder. Hot keys are usually handled apart: split a giant conversation further, or cache it.',
  concept: 'system-design',
  seconds: 10,
};

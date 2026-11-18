import type { InterviewVariant } from '@/interview/design';
import type { Workload } from '@/systems/design/types';
import { chat } from '../chat';
import { app, clients, db, lb } from '../parts';
import { peakFromPopulation, rateOf, storage } from './estimates';

// Interview variants of the chat service (most traffic is writes, which one
// primary can't take: split the data): new stories, new numbers, same lesson.

const sensorPeak = peakFromPopulation(45_000, 5, 'sensors');
const sensorWorkload: Workload = { rps: rateOf(sensorPeak), readShare: 0.1, keys: 45_000, skew: 0.3 };

export const sensorReadings: InterviewVariant = {
  ...chat,
  case: chat.slug,
  slug: 'sensor-readings',
  title: 'Readings from a sensor fleet',
  summary: 'Tens of thousands of sensors report every few seconds. Nine requests in ten are writes.',
  brief: `A company monitors its buildings with **45,000 sensors**. Each sends one request **every five seconds**: nine times in ten a new reading, otherwise a dashboard asking for that sensor's recent readings. Readings are stored by sensor, and each one is **200 bytes**, kept for a year.

The traffic is steady day and night, and spread fairly evenly over the sensors.

Today every reading goes to one database primary with a read replica, already at its connection limit; the largest database node takes 64 connections. A bigger machine won't help past that.

Store every reading quickly and keep the dashboards fast.`,
  requirements: [
    'Store a sensor’s reading (a write): 90% of requests.',
    'Read a sensor’s recent readings (a read): 10%.',
    'Readings are stored by sensor; one sensor’s readings live together.',
    'Fast, with nothing dropped.',
  ],
  workload: sensorWorkload,
  targets: { throughput: 8900, p99Ms: 60, maxErrorRate: 0.01, maxCost: 2800 },
  start: {
    components: [
      clients('lb', sensorWorkload),
      lb('app'),
      app({ instances: 18, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 1, replicas: 1, workers: 64, readMs: 5, writeMs: 10 }),
    ],
  },
  reference: {
    components: [
      clients('lb', sensorWorkload),
      lb('app'),
      app({ instances: 18, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 5, replicas: 0, workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Check the starting design. Which database node is busy, and which one sits idle? What does each do?',
    'The replica only helps reads, and here nearly everything is a write, all landing on one primary. The writes need more than one place to go.',
    'Split the data by sensor over several databases, each with its own primary; drop the replica, and pick a number that leaves each primary comfortably below full.',
  ],
  estimates: [sensorPeak, storage(8_100 * 86_400, 200, 365, 'a year of readings', 'a year')],
  deepDive: {
    label: 'Traffic rises by 30% for 3 s',
    say: 'Let’s dig in. A heatwave: every sensor reports faster, and from three seconds in, traffic is 30% higher for three seconds. Check your design under that, then tell me which part runs out first, and why.',
    spike: { at: 3, seconds: 3, factor: 1.3 },
    targets: { p99Ms: 120, maxErrorRate: 0.01 },
  },
};

const gamePeak = peakFromPopulation(3_000_000, 250, 'games in play');
const gameWorkload: Workload = { rps: rateOf(gamePeak), readShare: 0.25, keys: 150_000, skew: 0.7 };

export const gameMoves: InterviewVariant = {
  ...chat,
  case: chat.slug,
  slug: 'game-moves',
  title: 'Moves in a turn-based game',
  summary: 'Millions of games in play, a move every few minutes each. Three requests in four store a move.',
  brief: `A turn-based strategy game stores every move. At the evening peak, **3 million games** are in play, and each sends one request about **every 250 seconds**: three times in four a move, otherwise a player opening the board to see the latest moves.

Moves are stored by game, so one game's moves live together. Some games (tournaments with spectators) are much busier than others. There are about **300 million moves a day**, each **100 bytes**, kept for a year.

Today one database primary with a read replica takes every move, and it is at its connection limit; the largest database node takes 64 connections.

Make storing a move and opening a board fast for everyone.`,
  requirements: [
    'Store a move (a write): 75% of requests.',
    'Open a game’s board with its latest moves (a read): 25%.',
    'A game’s moves are stored together.',
    'Fast for every game, with nothing dropped.',
  ],
  workload: gameWorkload,
  targets: { throughput: 11_900, p99Ms: 60, maxErrorRate: 0.01, maxCost: 3500 },
  start: {
    components: [
      clients('lb', gameWorkload),
      lb('app'),
      app({ instances: 24, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 1, replicas: 1, workers: 64, readMs: 5, writeMs: 10 }),
    ],
  },
  reference: {
    components: [
      clients('lb', gameWorkload),
      lb('app'),
      app({ instances: 24, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }),
      db({ shards: 6, replicas: 0, workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Check the starting design and look at each database node’s load. What is the replica doing?',
    'Three requests in four are writes, and every write goes to the same primary. Copies of the data don’t spread writes; something else has to.',
    'Split the games over several databases by game, each with its own primary; drop the replica, and choose how many from each primary’s load in the results.',
  ],
  estimates: [gamePeak, storage(300_000_000, 100, 365, 'a year of moves', 'a year')],
  deepDive: {
    label: 'Traffic rises by 40% for 3 s',
    say: 'Let’s dig in. A big tournament starts: from three seconds in, traffic is 40% higher for three seconds. Check your design under that, then tell me where the extra load lands, and whether it lands evenly.',
    spike: { at: 3, seconds: 3, factor: 1.4 },
    targets: { p99Ms: 120, maxErrorRate: 0.01 },
  },
};

import type { InterviewVariant } from '@/interview/design';
import type { Workload } from '@/systems/design/types';
import { urlShortener } from '../url-shortener';
import { app, cache, clients, db, lb } from '../parts';
import { bandwidth, peakFromDay, rateOf, storage } from './estimates';

// Interview variants of the URL shortener (a read-heavy, skewed workload that
// something in memory should answer): new stories, new numbers, same lesson.

const menuPeak = peakFromDay(216_000_000, 2, 'requests');
const menuWorkload: Workload = { rps: rateOf(menuPeak), readShare: 0.95, keys: 30_000, skew: 1.1 };

export const qrMenus: InterviewVariant = {
  ...urlShortener,
  case: urlShortener.slug,
  slug: 'qr-menus',
  title: 'Menus behind QR codes',
  summary: 'Every table has a QR code; scanning it fetches the restaurant’s menu. A few chains get most of the scans.',
  brief: `Restaurants print a QR code on every table. Scanning it asks this service for the restaurant's current menu, by the code's id.

There are **216 million scans a day** across 30,000 restaurants, and the evening rush is **twice the day's average**. A big chain's menu is scanned far more often than a corner café's.

Staff edit menus during the day (specials, dishes that sell out): about one request in twenty is an edit; the rest are scans. Each scan returns a **20 KB** menu.

Today two app servers read every menu from one database. Make scanning feel instant at the evening rush, without paying for more than you need.`,
  requirements: [
    'Return a restaurant’s current menu for a scanned code (a read): 95% of requests.',
    'Let staff edit a menu (a write): an edit shows up on the next scan.',
    'Fast at the evening rush, when a few big chains get most of the scans.',
    'No dropped requests, and a modest monthly budget.',
  ],
  workload: menuWorkload,
  targets: { throughput: 4900, p99Ms: 50, maxErrorRate: 0.01, maxCost: 700 },
  start: {
    components: [clients('lb', menuWorkload), lb('app'), app({ instances: 2, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }), db({ workers: 32, readMs: 5, writeMs: 10 })],
  },
  reference: {
    components: [
      clients('lb', menuWorkload),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 2, reads: 'cache', writes: 'cache' }),
      cache({ nodes: 2, capacity: 10_000, writes: 'invalidate', to: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Check the starting design and read the findings: which tier is waiting, and on what?',
    'Most requests read a menu that changed hours ago, and a few menus are read far more than the rest. Does every scan need the database?',
    'Answer the popular menus from memory in front of the database, with edits passing through it so a changed menu is dropped; then size the app servers to the load that is left.',
  ],
  estimates: [menuPeak, bandwidth(menuPeak.answer, 20_000, 'menus')],
  deepDive: {
    label: 'An app server crashes at 3 s',
    say: 'Let’s dig into a failure. At the height of the rush, three seconds in, one of your app servers crashes and stays down. Check your design with that happening, then tell me what the rest of the system feels, and why.',
    faults: [{ at: 3, kind: 'app', instance: 0 }],
    targets: { p99Ms: 100, maxErrorRate: 0.01 },
  },
};

const albumPeak = peakFromDay(432_000_000, 2, 'requests');
const albumWorkload: Workload = { rps: rateOf(albumPeak), readShare: 0.97, keys: 50_000, skew: 1.3 };

export const albumLinks: InterviewVariant = {
  ...urlShortener,
  case: urlShortener.slug,
  slug: 'album-links',
  title: 'Short links to photo albums',
  summary: 'Short links to shared photo albums, opened hundreds of millions of times a day, mostly a few viral ones.',
  brief: `A photo app lets people share an album with a short link. Opening the link asks this service which album it points to; the app then loads the photos from elsewhere.

Links are opened **432 million times a day**, and the busiest hour runs at **twice the average**. Most albums are seen by a few friends, but an album that goes viral is opened by millions.

About 3 requests in 100 create a new link; each link record is **500 bytes**, and links are kept for five years. Nobody edits a link after it is made.

Today a few app servers look every link up in one database. Make opening links fast and reliable.`,
  requirements: [
    'Open a short link: find the album it points to (a read), 97% of requests.',
    'Create a short link for an album (a write).',
    'Fast for everyone, even when one album is opened by millions.',
    'Nothing dropped, at a sensible cost.',
  ],
  workload: albumWorkload,
  targets: { throughput: 9800, p99Ms: 50, maxErrorRate: 0.01, maxCost: 1200 },
  start: {
    components: [clients('lb', albumWorkload), lb('app'), app({ instances: 4, workers: 8, serviceMs: 2, reads: 'db', writes: 'db' }), db({ workers: 32, readMs: 5, writeMs: 10 })],
  },
  reference: {
    components: [
      clients('lb', albumWorkload),
      lb('app'),
      app({ instances: 8, workers: 8, serviceMs: 2, reads: 'cache', writes: 'cache' }),
      cache({ nodes: 2, capacity: 10_000, writes: 'invalidate', to: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Check the starting design: where does a request spend its time, and which tier is full?',
    'Almost every request reads a link that never changes, and a handful of albums take most of the opens. The database answers the same question over and over.',
    'Keep the popular links in memory in front of the database, send link creation through the same path, and then add app servers until they stop being the bottleneck.',
  ],
  estimates: [albumPeak, storage(13_000_000, 500, 5 * 365, 'the link records', 'five years')],
  deepDive: {
    label: 'Traffic rises by half for 3 s',
    say: 'Let’s dig in. An album goes viral: from three seconds in, traffic is half as much again for three seconds. Check your design under that surge, then walk me through which part feels it first, and why.',
    spike: { at: 3, seconds: 3, factor: 1.5 },
    targets: { p99Ms: 150, maxErrorRate: 0.02 },
  },
};

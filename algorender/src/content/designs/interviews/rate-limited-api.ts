import type { Estimate, InterviewVariant } from '@/interview/design';
import { formatCount } from '@/systems/design/estimation';
import type { Workload } from '@/systems/design/types';
import { rateLimitedApi } from '../rate-limited-api';
import { app, clients, db, lb, limiter } from '../parts';
import { bandwidth, rateOf } from './estimates';

// Interview variants of the API that survives a spike (shed the excess at the
// door rather than queue it): new stories, new numbers, same lesson.

/** A steady rate from a count per hour: the rate the simulator runs. */
function perHour(count: number): Estimate {
  const answer = count / 3600;
  return {
    id: 'normal',
    question: 'On an ordinary day, how many requests a second does the service get?',
    unit: 'count',
    unitLabel: 'requests a second',
    answer,
    rate: true,
    working: [`${formatCount(count)} an hour ÷ 3,600 seconds ≈ ${formatCount(answer)} a second.`],
  };
}

/** The rate during a surge of `factor` times the normal one. */
function surge(normal: Estimate, factor: number, when: string): Estimate {
  const answer = normal.answer * factor;
  return {
    id: 'surge',
    question: `${when}, how many requests a second arrive?`,
    unit: 'count',
    unitLabel: 'requests a second',
    answer,
    working: [`${factor}× the normal ${formatCount(normal.answer)} a second ≈ ${formatCount(answer)} a second.`],
  };
}

const ticketNormal = perHour(5_400_000);
const ticketWorkload: Workload = { rps: rateOf(ticketNormal), readShare: 0.85, keys: 20_000, skew: 1, spike: { at: 3, seconds: 3, factor: 5 } };

export const ticketSale: InterviewVariant = {
  ...rateLimitedApi,
  case: rateLimitedApi.slug,
  slug: 'ticket-sale',
  title: 'A ticket shop when sales open',
  summary: 'A ticket shop runs calmly until a big concert goes on sale and five times the usual traffic arrives at once.',
  brief: `A ticket shop's API answers **5.4 million requests an hour** on an ordinary day: people browsing events, and some buying.

When a big concert goes on sale, **five times** the usual traffic arrives for a few seconds (in the check: from three seconds in, for three seconds). Fans refresh, and everyone wants in at once.

The servers cope with a little more than the ordinary rate, not five times it, and the budget won't pay for machines that sit idle the rest of the month.

A request that waits too long times out, and a fan who sees an error is angry. A fan told at once to try again in a moment is disappointed, but can retry.`,
  requirements: [
    'Serve the ordinary traffic in full, and as much of the rush as the servers can handle.',
    'Requests that are served must stay fast, even during the rush.',
    'Telling some fans at once to try again is acceptable; timing out or failing is not.',
    'Don’t provision for five times the ordinary load.',
  ],
  workload: ticketWorkload,
  targets: { throughput: 1450, p99Ms: 100, maxFailureRate: 0.01, maxCost: 600 },
  start: {
    components: [clients('lb', ticketWorkload), lb('app'), app({ instances: 3, workers: 8, serviceMs: 5, reads: 'db', writes: 'db' }), db({ workers: 32, readMs: 5, writeMs: 10 })],
  },
  reference: {
    components: [
      clients('limiter', ticketWorkload),
      limiter({ burst: 150, perSecond: 1700, to: 'lb' }),
      lb('app'),
      app({ instances: 3, workers: 8, serviceMs: 5, reads: 'db', writes: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Check the starting design and look at the latency chart: what happens during the rush, and how long until it recovers?',
    'The servers can only do so much work. When more arrives, it waits, and everyone behind it waits too. What if some requests were answered at once instead of waiting?',
    'Turn away the requests over what the servers can sustain, at the front door, before they reach the load balancer; set that rate from the servers’ ordinary utilisation, a little above the ordinary traffic.',
  ],
  estimates: [ticketNormal, surge(ticketNormal, 5, 'When sales open')],
  deepDive: {
    label: 'An app server crashes at 4 s',
    say: 'Let’s dig into a failure. In the middle of the rush, four seconds in, one of your app servers crashes. Check your design with that happening, then tell me what the fans see, and why.',
    faults: [{ at: 4, kind: 'app', instance: 0 }],
    targets: { maxFailureRate: 0.02 },
  },
};

const weatherNormal = perHour(8_640_000);
const weatherWorkload: Workload = { rps: rateOf(weatherNormal), readShare: 0.95, keys: 30_000, skew: 0.9, spike: { at: 2, seconds: 4, factor: 3 } };

export const weatherApi: InterviewVariant = {
  ...rateLimitedApi,
  case: rateLimitedApi.slug,
  slug: 'weather-api',
  title: 'A weather API in a storm',
  summary: 'A public weather API with steady traffic, until a storm warning makes every app ask at once.',
  brief: `A public weather API serves forecasts to apps and websites: **8.64 million requests an hour**, steady through the day. Each answer is a **2 KB** forecast.

When a storm warning goes out, every app refreshes at once: **three times** the usual traffic for a few seconds (in the check: from two seconds in, for four seconds).

The servers have some headroom over the ordinary rate, not three times it, and the API's budget is fixed.

The apps calling the API are well behaved: told to come back in a moment, they wait and retry. A request that hangs until it times out is worse than one answered "not now" at once.`,
  requirements: [
    'Serve the ordinary traffic in full, and as much of the storm surge as the servers can.',
    'Forecasts that are served stay fast during the surge.',
    'Asking some callers to retry is acceptable; failing or timing out is not.',
    'Stay within the fixed budget.',
  ],
  workload: weatherWorkload,
  targets: { throughput: 2350, p99Ms: 100, maxFailureRate: 0.01, maxCost: 700 },
  start: {
    components: [clients('lb', weatherWorkload), lb('app'), app({ instances: 4, workers: 8, serviceMs: 5, reads: 'db', writes: 'db' }), db({ workers: 32, readMs: 5, writeMs: 10 })],
  },
  reference: {
    components: [
      clients('limiter', weatherWorkload),
      limiter({ burst: 200, perSecond: 2700, to: 'lb' }),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 5, reads: 'db', writes: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Check the starting design and compare the latency before, during and after the surge.',
    'Work that can’t be done right away doesn’t go away; it waits, and makes everything behind it slower. Some requests could be told “not now” instead.',
    'Put something at the front that admits only as many requests a second as the servers sustain, with a small burst, and answers the rest at once.',
  ],
  estimates: [weatherNormal, bandwidth(weatherNormal.answer * 3, 2_000, 'forecasts during the storm')],
  deepDive: {
    label: 'A storm six times the traffic',
    say: 'Let’s dig in. A bigger storm: six times the usual traffic for three seconds, from two seconds in. Check your design under that, then tell me what changes compared with the smaller storm, and why.',
    spike: { at: 2, seconds: 3, factor: 6 },
    targets: { p99Ms: 100, maxFailureRate: 0.01 },
  },
};

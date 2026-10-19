import type { CaseStudy, Workload } from '@/systems/design/types';
import { app, clients, db, lb, limiter } from './parts';

const workload: Workload = { rps: 2000, readShare: 0.8, keys: 20_000, skew: 1, spike: { at: 3, seconds: 3, factor: 4 } };

export const rateLimitedApi: CaseStudy = {
  slug: 'rate-limited-api',
  title: 'An API that survives a spike',
  summary: 'A public API normally handles 2,000 requests a second, until a launch quadruples it for a few seconds. Serve what you can, fast, instead of serving everyone slowly.',
  brief: `A public API runs comfortably at 2,000 requests a second. Three seconds in, a product launch sends **four times** that for three seconds.

The current servers can handle a little under 3,000 a second. Provisioning for the peak would mean paying for four times the machines all month for a few seconds of traffic, and the budget doesn't allow it.

When more work arrives than a server can do, it doesn't do less work: it queues it. Every request waits behind the ones before it, so latency climbs for everyone, requests start timing out, and the queue takes seconds to drain after the spike ends.

The alternative is to turn some requests away at once with **HTTP 429 Too Many Requests**, so the ones you accept stay fast. A well-behaved client backs off and retries. Rejecting on purpose is allowed here; timing out is not.`,
  requirements: [
    'Serve 2,000 requests a second normally, and as many as the servers can handle during the spike.',
    'Requests that are accepted must stay fast, even during the spike.',
    'Turning requests away with a 429 is acceptable; failing or timing out is not.',
    'Stay within the budget: no provisioning for four times the normal load.',
  ],
  workload,
  targets: { throughput: 1900, p99Ms: 100, maxFailureRate: 0.01, maxCost: 700 },
  start: {
    components: [
      clients('lb', workload),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 5, reads: 'db', writes: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  reference: {
    components: [
      clients('limiter', workload),
      limiter({ burst: 200, perSecond: 2300, to: 'lb' }),
      lb('app'),
      app({ instances: 4, workers: 8, serviceMs: 5, reads: 'db', writes: 'db' }),
      db({ workers: 32, readMs: 5, writeMs: 10 }),
    ],
  },
  hints: [
    'Run the starting design and look at the latency chart: what happens during the spike, and how long after it ends do things recover?',
    'The servers can’t do more work than they can, so the question is what to do with the excess. A request that is turned away at once costs almost nothing; one that waits in a queue slows down everyone behind it.',
    'Put a rate limiter between the clients and the load balancer. Set its rate a little below what the servers can sustain (find that from the normal-load utilisation), with a burst that absorbs short bumps.',
  ],
  lesson:
    'Under overload, a queue doesn’t make work disappear: it turns it into waiting, until every request is slow and many time out (and a timed-out request still used the server’s time). A rate limiter sheds the excess at the door, so the accepted requests keep their normal latency and the service recovers the moment the spike ends. The cost is that some users are told to retry. The limit has to sit just below real capacity: too high and the queue builds anyway, too low and you reject traffic you could have served.',
  concept: 'system-design',
  seconds: 10,
};

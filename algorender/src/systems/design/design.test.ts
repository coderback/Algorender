import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/random';
import { cacheRun, createCache } from '@/systems/cache';
import { latencyQuantile, meanLatency } from '@/systems/queueing';
import {
  componentCost,
  costPerMonth,
  evaluate,
  KIND_INFO,
  newComponent,
  simulate,
  starterDesign,
  validateDesign,
  type App,
  type CaseStudy,
  type Component,
  type ComponentKind,
  type Database,
  type Design,
  type Workload,
} from '.';

const clients = (workload: Partial<Workload>, to = 'app'): Component => ({
  id: 'clients',
  label: 'Clients',
  kind: 'clients',
  workload: { rps: 1000, readShare: 0.9, keys: 10_000, skew: 1, ...workload },
  to,
});
const app = (over: Partial<App> = {}): App => ({ id: 'app', label: 'App', kind: 'app', instances: 1, workers: 8, serviceMs: 2, reads: '', writes: '', fanout: 1, ...over });
const db = (over: Partial<Database> = {}): Database => ({
  id: 'db',
  label: 'DB',
  kind: 'database',
  shards: 1,
  replicas: 0,
  workers: 32,
  readMs: 2,
  writeMs: 4,
  replicaLagMs: 100,
  failover: false,
  failoverMs: 1000,
  ...over,
});
const design = (...components: Component[]): Design => ({ components });

/** Zipf keys as the simulator draws them (rank i has weight 1/(i+1)^s). */
function zipfKeys(n: number, keys: number, s: number, seed: number): string[] {
  const cdf = new Float64Array(keys);
  let sum = 0;
  for (let i = 0; i < keys; i++) cdf[i] = sum += 1 / Math.pow(i + 1, s);
  const u = createRng(seed);
  return Array.from({ length: n }, () => {
    const x = u() * sum;
    let lo = 0;
    let hi = keys - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return String(lo);
  });
}

describe('one app instance is an M/M/c queue', () => {
  // c = 4 workers, 10 ms of work each (μ = 100/s), λ = 200 and 320/s: ρ = 0.5 and 0.8.
  for (const rps of [200, 320]) {
    it(`matches Erlang C at λ = ${rps}`, () => {
      const r = simulate(design(clients({ rps, readShare: 1 }), app({ workers: 4, serviceMs: 10 })), { seconds: 120, seed: 3 });
      const config = { arrivalRate: rps, serviceRate: 100, servers: 4 };
      expect(r.errorRate).toBe(0);
      expect(r.latency.mean / (meanLatency(config) * 1000)).toBeCloseTo(1, 1);
      expect(Math.abs(r.latency.p99 / (latencyQuantile(config, 0.99) * 1000) - 1)).toBeLessThan(0.12);
      // Little's law on the workers: busy workers on average = λ × service time.
      expect(r.components.app.utilisation).toBeCloseTo((rps * 0.01) / 4, 1);
      expect(r.throughput).toBeCloseTo(rps, -1);
    });
  }
});

describe('caches', () => {
  const cached = (skew: number, capacity: number) =>
    design(
      clients({ rps: 2000, readShare: 1, keys: 5000, skew }),
      app({ instances: 2, workers: 32, reads: 'cache', writes: 'cache' }),
      { id: 'cache', label: 'Cache', kind: 'cache', nodes: 1, capacity, policy: 'lru', serviceMs: 0.5, writes: 'invalidate', to: 'db' },
      db(),
    );

  it('hit as often as the cache model on the same kind of key stream', () => {
    const r = simulate(cached(1, 500), { seconds: 10, seed: 5 });
    const keys = zipfKeys(20_000, 5000, 1, 9);
    const model = cacheRun(createCache<number>('lru', 500), keys, () => 0).hits;
    const modelRate = model.filter(Boolean).length / model.length;
    expect(Math.abs(r.components.cache.hitRate! - modelRate)).toBeLessThan(0.03);
  });

  it('hit more when traffic is skewed towards a few keys', () => {
    const uniform = simulate(cached(0, 500), { seconds: 5, seed: 5 }).components.cache.hitRate!;
    const skewed = simulate(cached(1.2, 500), { seconds: 5, seed: 5 }).components.cache.hitRate!;
    expect(uniform).toBeLessThan(0.15);
    expect(skewed).toBeGreaterThan(uniform + 0.4);
  });

  it('serve stale copies when writes skip them, and not when writes go through them', () => {
    const base = (writes: string, policy: 'write-through' | 'invalidate') =>
      design(
        clients({ rps: 2000, readShare: 0.8, keys: 2000, skew: 1 }),
        app({ instances: 2, workers: 32, reads: 'cache', writes }),
        { id: 'cache', label: 'Cache', kind: 'cache', nodes: 1, capacity: 2000, policy: 'lru', serviceMs: 0.5, writes: policy, to: 'db' },
        db(),
      );
    const skip = simulate(base('db', 'invalidate'), { seconds: 5, seed: 2 });
    const invalidate = simulate(base('cache', 'invalidate'), { seconds: 5, seed: 2 });
    const through = simulate(base('cache', 'write-through'), { seconds: 5, seed: 2 });
    expect(skip.staleReads / skip.okReads!).toBeGreaterThan(0.1);
    expect(invalidate.staleReads / invalidate.okReads!).toBeLessThan(0.01);
    expect(through.staleReads / through.okReads!).toBeLessThan(0.01);
    expect(skip.findings.join(' ')).toMatch(/writes don’t/);
  });

  it('move a crashed node’s keys to the others, which start cold', () => {
    const d = cached(1, 3000);
    const three = { ...d, components: d.components.map((c) => (c.kind === 'cache' ? { ...c, nodes: 3 } : c)) };
    const r = simulate(three, { seconds: 6, seed: 4, faults: [{ at: 3, component: 'cache', instance: 1 }] });
    expect(r.components.cache.perInstance).toHaveLength(3);
    expect(r.components.cache.perInstance[1]).toBeLessThan(r.components.cache.perInstance[0]);
    expect(r.errorRate).toBeLessThan(0.01);
    expect(r.components.cache.hitRate).toBeGreaterThan(0.5);
  });
});

describe('the rate limiter, load balancer and database', () => {
  it('caps throughput at the limiter’s rate', () => {
    const d = design(
      clients({ rps: 2000 }, 'limit'),
      { id: 'limit', label: 'Limit', kind: 'rate-limiter', burst: 100, perSecond: 500, to: 'app' },
      app({ instances: 2, workers: 32 }),
    );
    const r = simulate(d, { seconds: 10, seed: 1 });
    expect(r.throughput).toBeLessThanOrEqual(500 + 100 / 10 + 1);
    expect(r.throughput).toBeGreaterThan(480);
    expect(r.rejected / r.offered).toBeCloseTo(0.75, 1);
    expect(r.findings.join(' ')).toMatch(/turned away/);
  });

  it('spreads writes evenly-ish over shards', () => {
    const d = design(clients({ rps: 3000, readShare: 0, keys: 50_000, skew: 0 }), app({ instances: 4, workers: 32, writes: 'db' }), db({ shards: 4 }));
    const per = simulate(d, { seconds: 5, seed: 1 }).components.db.perInstance;
    const mean = per.reduce((a, b) => a + b, 0) / per.length;
    for (const u of per) expect(Math.abs(u - mean) / mean).toBeLessThan(0.35);
  });

  it('takes reads off the primary with replicas', () => {
    const d = (replicas: number) => design(clients({ rps: 3000, readShare: 0.95 }), app({ instances: 4, workers: 32, reads: 'db', writes: 'db' }), db({ replicas }));
    const alone = simulate(d(0), { seconds: 5, seed: 1 }).components.db.perInstance[0];
    const withReplicas = simulate(d(2), { seconds: 5, seed: 1 }).components.db.perInstance;
    expect(withReplicas).toHaveLength(3);
    expect(withReplicas[0]).toBeLessThan(alone / 2);
  });

  it('fails writes after the primary crashes, until failover promotes a replica', () => {
    const d = (failover: boolean) => design(clients({ rps: 1000, readShare: 0.5 }), app({ instances: 2, workers: 32, reads: 'db', writes: 'db' }), db({ replicas: 1, failover, failoverMs: 500 }));
    const fault = [{ at: 2, component: 'db', instance: 0 }];
    const without = simulate(d(false), { seconds: 6, seed: 1, faults: fault });
    const withFailover = simulate(d(true), { seconds: 6, seed: 1, faults: fault });
    // Without failover about half the requests after the crash (the writes) fail.
    expect(without.failed / without.offered).toBeGreaterThan(0.25);
    expect(withFailover.failed).toBeLessThan(without.failed / 4);
    expect(without.findings.join(' ')).toMatch(/failover/);
  });

  it('routes around a crashed app instance', () => {
    const d = design(clients({ rps: 1000 }, 'lb'), { id: 'lb', label: 'LB', kind: 'load-balancer', policy: 'least-connections', to: 'app' }, app({ instances: 3, workers: 16 }));
    const r = simulate(d, { seconds: 6, seed: 2, faults: [{ at: 2, component: 'app', instance: 0 }] });
    expect(r.errorRate).toBeLessThan(0.01);
    expect(r.components.app.perInstance[0]).toBeLessThan(r.components.app.perInstance[1] / 2);
  });
});

describe('queues and spikes', () => {
  it('acknowledges queued writes fast and applies them later; a backlog builds when consumers are too few', () => {
    const d = (consumers: number) =>
      design(
        clients({ rps: 1000, readShare: 0 }),
        app({ instances: 2, workers: 32, writes: 'queue' }),
        { id: 'queue', label: 'Queue', kind: 'queue', consumers, to: 'db' },
        db({ workers: 64, writeMs: 20 }),
      );
    const enough = simulate(d(32), { seconds: 5, seed: 1 });
    expect(enough.writes.p50).toBeLessThan(10);
    expect(enough.components.queue.applyDelayMs).toBeGreaterThan(15);
    expect(enough.components.queue.backlog).toBeLessThan(100);
    const few = simulate(d(4), { seconds: 5, seed: 1 });
    expect(few.writes.p99).toBeLessThan(30);
    expect(few.components.queue.backlog).toBeGreaterThan(1000);
    expect(few.findings.join(' ')).toMatch(/can’t keep up/);
  });

  it('sends more traffic during a spike, and an overloaded design times out', () => {
    const d = design(clients({ rps: 500, readShare: 1, spike: { at: 2, seconds: 1, factor: 6 } }), app({ instances: 1, workers: 8, serviceMs: 10 }));
    const r = simulate(d, { seconds: 5, seed: 1, timeoutMs: 300 });
    const at = (t: number) => r.series.find((b) => b.t === t)!;
    expect(at(2).offered).toBeGreaterThan(4 * at(1).offered);
    expect(r.timedOut).toBeGreaterThan(0);
    expect(r.series).toHaveLength(10);
    expect(r.ok + r.rejected + r.failed + r.timedOut).toBe(r.offered);
  });
});

describe('runs', () => {
  it('are deterministic per seed', () => {
    const a = simulate(starterDesign(), { seconds: 3, seed: 7 });
    expect(simulate(starterDesign(), { seconds: 3, seed: 7 })).toEqual(a);
    expect(simulate(starterDesign(), { seconds: 3, seed: 8 }).latency).not.toEqual(a.latency);
  });

  it('report the starter design sensibly', () => {
    const r = simulate(starterDesign(), { seconds: 10, seed: 1 });
    expect(r.errorRate).toBe(0);
    expect(r.components.app.utilisation).toBeGreaterThan(0.5);
    expect(r.components.app.utilisation).toBeLessThan(0.85);
    expect(r.costPerMonth).toBe(410);
    expect(r.findings.length).toBeGreaterThanOrEqual(1);
    // Twice the traffic saturates the app tier.
    const busy = starterDesign();
    const doubled = { components: busy.components.map((c) => (c.kind === 'clients' ? { ...c, workload: { ...c.workload, rps: 2000 } } : c)) };
    const r2 = simulate(doubled, { seconds: 5, seed: 1 });
    expect(r2.findings[0]).toMatch(/“App servers” is the bottleneck/);
  });

  it('simulate 10,000 requests a second for 10 seconds in well under two seconds', () => {
    const d = design(
      clients({ rps: 10_000, readShare: 0.9, keys: 100_000, skew: 1 }, 'lb'),
      { id: 'lb', label: 'LB', kind: 'load-balancer', policy: 'round-robin', to: 'app' },
      app({ instances: 20, workers: 16, serviceMs: 5, reads: 'cache', writes: 'cache' }),
      { id: 'cache', label: 'Cache', kind: 'cache', nodes: 2, capacity: 20_000, policy: 'lru', serviceMs: 1, writes: 'invalidate', to: 'db' },
      db({ shards: 2, replicas: 2 }),
    );
    simulate(d, { seconds: 1, seed: 1 });
    const t = performance.now();
    const r = simulate(d, { seconds: 10, seed: 1 });
    expect(performance.now() - t).toBeLessThan(2000);
    expect(r.offered).toBeGreaterThan(95_000);
  });

  it('refuse to run a broken design', () => {
    expect(() => simulate(design(app()), { seconds: 1, seed: 1 })).toThrow(/no clients/);
  });
});

describe('validation', () => {
  it('accepts the starter and every kind’s defaults', () => {
    expect(validateDesign(starterDesign())).toEqual([]);
    for (const kind of Object.keys(KIND_INFO) as ComponentKind[]) {
      const c = newComponent(kind, 'x');
      expect(c.kind).toBe(kind);
      expect(validateDesign({ components: [c] }).filter((p) => /between|whole/.test(p))).toEqual([]);
    }
  });

  it('explains what is wrong', () => {
    expect(validateDesign(design(app()))).toContain('There are no clients: add where the traffic comes from.');
    const p = validateDesign(
      design(
        clients({}, 'lb'),
        { id: 'lb', label: 'Front', kind: 'load-balancer', policy: 'random', to: 'db' },
        db(),
        app({ id: 'app', instances: 0, reads: 'nope' }),
        { id: 'q', label: 'Q', kind: 'queue', consumers: 2, to: '' },
      ),
    ).join('\n');
    expect(p).toMatch(/“Front” sends to “DB”, a database; it can only send to a app servers/);
    expect(p).toMatch(/“App” sends reads to “nope”, which isn’t in the design/);
    expect(p).toMatch(/“App”: instances must be between 1 and 50/);
    expect(p).toMatch(/“Q” doesn’t send anywhere yet/);
    expect(p).toMatch(/“App” isn’t connected/);
    expect(validateDesign(design(clients({}), clients({})))).toContain('Two components share the id “clients”.');
  });
});

describe('cost', () => {
  it('prices each part', () => {
    expect(costPerMonth(starterDesign())).toBe(20 + 2 * 70 + 250);
    expect(componentCost(db({ shards: 2, replicas: 2 }))).toBe(2 * 3 * 250);
    expect(componentCost({ id: 'q', label: 'Q', kind: 'queue', consumers: 4, to: 'db' })).toBe(40 + 4 * 15);
  });

  it('charges for workers and connections, so turning them up is not free', () => {
    expect(componentCost(app({ instances: 3, workers: 8 }))).toBe(3 * 70);
    expect(componentCost(app({ instances: 3, workers: 9 }))).toBe(3 * 2 * 70);
    expect(componentCost(app({ instances: 1, workers: 64 }))).toBe(8 * 70);
    expect(componentCost(db({ shards: 1, replicas: 0, workers: 32 }))).toBe(250);
    expect(componentCost(db({ shards: 1, replicas: 0, workers: 64 }))).toBe(2 * 250);
    expect(componentCost(db({ shards: 2, replicas: 1, workers: 33 }))).toBe(2 * 2 * 2 * 250);
  });
});

describe('evaluate', () => {
  const study = (targets: CaseStudy['targets']): CaseStudy => ({
    slug: 't',
    title: 'T',
    summary: '',
    brief: '',
    requirements: [],
    workload: { rps: 800, readShare: 0.9, keys: 10_000, skew: 1 },
    targets,
    start: starterDesign(),
    reference: starterDesign(),
    hints: [],
    lesson: '',
    concept: 'system-design',
    seconds: 5,
  });

  it('makes one check per target, with the study’s traffic', () => {
    const e = evaluate(starterDesign(), study({ throughput: 700, p99Ms: 200, maxErrorRate: 0.01, maxCost: 500, maxStaleRate: 0.01, survive: { faults: [{ at: 1, component: 'db', instance: 0 }], maxErrorRate: 0.01, label: 'Survives losing the database' } }));
    expect(e.checks.map((c) => c.id)).toEqual(['throughput', 'p99', 'errors', 'cost', 'stale', 'survive']);
    expect(e.result.offered).toBeLessThan(5 * 800 * 1.1);
    expect(e.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['survive']);
    expect(e.passed).toBe(false);
    expect(e.faultResult!.failed).toBeGreaterThan(0);
  });

  it('fails tight targets and passes loose ones', () => {
    expect(evaluate(starterDesign(), study({ p99Ms: 1, maxCost: 100 })).checks.every((c) => !c.ok)).toBe(true);
    const ok = evaluate(starterDesign(), study({ throughput: 700, maxErrorRate: 0.01 }));
    expect(ok.passed).toBe(true);
    expect(ok.faultResult).toBeNull();
  });

  it('checks write latency, and failures without counting rejections', () => {
    const e = evaluate(starterDesign(), study({ writeP99Ms: 1, maxFailureRate: 0.01 }));
    expect(e.checks.map((c) => [c.id, c.ok])).toEqual([
      ['write-p99', false],
      ['failures', true],
    ]);
    // A limiter far below the offered rate rejects most requests: that breaks
    // the error rate, but not the failure rate, which leaves rejections out.
    const limited = {
      components: [
        { id: 'clients', label: 'Clients', kind: 'clients' as const, workload: { rps: 800, readShare: 0.9, keys: 10_000, skew: 1 }, to: 'limiter' },
        { id: 'limiter', label: 'Limiter', kind: 'rate-limiter' as const, burst: 10, perSecond: 100, to: 'lb' },
        ...starterDesign().components.filter((c) => c.kind !== 'clients'),
      ],
    };
    const shed = evaluate(limited, study({ maxErrorRate: 0.01, maxFailureRate: 0.01 }));
    expect(shed.result.rejected).toBeGreaterThan(0);
    expect(shed.checks.map((c) => [c.id, c.ok])).toEqual([
      ['errors', false],
      ['failures', true],
    ]);
  });
});

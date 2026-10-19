import type { Component, Targets } from '@/systems/design/types';

// Plain-text summaries of components and numbers, shared by the diagram, the
// accessible node list and the results.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The settings that matter most, in a few words: "4 × app, 8 workers". */
export function configSummary(c: Component): string {
  switch (c.kind) {
    case 'clients':
      return `${compact(c.workload.rps)} req/s, ${Math.round(c.workload.readShare * 100)}% reads`;
    case 'rate-limiter':
      return `${compact(c.perSecond)}/s, burst ${compact(c.burst)}`;
    case 'load-balancer':
      return c.policy.replace(/-/g, ' ');
    case 'app':
      return `${c.instances} × app, ${plural(c.workers, 'worker')}`;
    case 'cache':
      return `${plural(c.nodes, 'node')} × ${compact(c.capacity)} keys, ${c.policy.toUpperCase()}`;
    case 'database': {
      const shards = c.shards > 1 ? `${c.shards} shards, ` : '';
      return `${shards}${c.replicas > 0 ? `primary + ${plural(c.replicas, 'replica')}` : 'primary only'}`;
    }
    case 'queue':
      return plural(c.consumers, 'consumer');
  }
}

/** 12 → "12", 1500 → "1.5K", 2_000_000 → "2M". */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${+(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${+(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return `${+n.toFixed(abs < 10 && n % 1 !== 0 ? 1 : 0)}`;
}

export const ms = (v: number) => (!Number.isFinite(v) ? '–' : v >= 1000 ? `${+(v / 1000).toFixed(2)} s` : `${v >= 10 ? Math.round(v) : +v.toFixed(1)} ms`);
export const pct = (v: number) => (v === 0 ? '0%' : v < 0.001 ? '<0.1%' : `${+(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
export const dollars = (v: number) => `$${Math.round(v).toLocaleString('en-GB')}`;

/** Each target in words, for the brief: "p99 under 100 ms". */
export function targetList(t: Targets): string[] {
  const out: string[] = [];
  if (t.throughput != null) out.push(`At least ${compact(t.throughput)} successful requests a second`);
  if (t.p99Ms != null) out.push(`p99 latency at most ${ms(t.p99Ms)}`);
  if (t.writeP99Ms != null) out.push(`Write p99 latency at most ${ms(t.writeP99Ms)}`);
  if (t.maxErrorRate != null) out.push(`At most ${pct(t.maxErrorRate)} of requests fail, time out or are rejected`);
  if (t.maxFailureRate != null) out.push(`At most ${pct(t.maxFailureRate)} of requests fail or time out (turning requests away with a 429 is allowed)`);
  if (t.maxStaleRate != null) out.push(`At most ${pct(t.maxStaleRate)} of reads are stale`);
  if (t.maxCost != null) out.push(`Costs at most ${dollars(t.maxCost)} a month`);
  if (t.survive) out.push(`${t.survive.label}: still at most ${pct(t.survive.maxErrorRate)} errors`);
  return out;
}

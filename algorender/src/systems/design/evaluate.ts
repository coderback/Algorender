// Checking a design against a case study's targets: run the study's traffic
// through it (and again with the study's faults, if it asks to survive them),
// then make one check per target.

import { simulate } from './simulate';
import type { CaseStudy, Check, Design, SimResult } from './types';
import { validateDesign } from './validate';

/** The design with its clients sending the study's traffic. */
/** The design as the case runs it: the case's traffic, and the settings it fixes. */
export function withWorkload(design: Design, study: Pick<CaseStudy, 'workload' | 'fixed'>): Design {
  const { fanout, minReplicaLagMs } = study.fixed ?? {};
  return {
    components: design.components.map((c) => {
      if (c.kind === 'clients') return { ...c, workload: { ...study.workload } };
      if (c.kind === 'app' && fanout != null && c.fanout !== fanout) return { ...c, fanout };
      if (c.kind === 'database' && minReplicaLagMs != null && c.replicaLagMs < minReplicaLagMs) return { ...c, replicaLagMs: minReplicaLagMs };
      return c;
    }),
  };
}

const ms = (x: number) => (Number.isFinite(x) ? `${x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString('en-GB')} ms` : 'none succeeded');
const percent = (x: number) => `${x < 0.001 && x > 0 ? (x * 100).toFixed(2) : (x * 100).toFixed(1).replace(/\.0$/, '')}%`;
const dollars = (x: number) => `$${Math.round(x).toLocaleString('en-GB')}`;

/** The seed every check runs with, so a result can be reproduced on the canvas. */
export const EVALUATION_SEED = 1;

export function evaluate(design: Design, study: CaseStudy): { result: SimResult; faultResult: SimResult | null; checks: Check[]; passed: boolean } {
  const problems = validateDesign(design);
  if (problems.length > 0) throw new Error(`The design can't run: ${problems.join(' ')}`);
  const d = withWorkload(design, study);
  const result = simulate(d, { seconds: study.seconds, seed: EVALUATION_SEED });
  const t = study.targets;
  const checks: Check[] = [];
  if (t.throughput !== undefined)
    checks.push({ id: 'throughput', label: 'Throughput', ok: result.throughput >= t.throughput, want: `at least ${t.throughput.toLocaleString('en-GB')} req/s`, actual: `${Math.round(result.throughput).toLocaleString('en-GB')} req/s` });
  if (t.p99Ms !== undefined)
    checks.push({ id: 'p99', label: 'p99 latency', ok: Number.isFinite(result.latency.p99) && result.latency.p99 <= t.p99Ms, want: `at most ${ms(t.p99Ms)}`, actual: ms(result.latency.p99) });
  if (t.writeP99Ms !== undefined)
    checks.push({
      id: 'write-p99',
      label: 'Write p99 latency',
      ok: Number.isFinite(result.writes.p99) && result.writes.p99 <= t.writeP99Ms,
      want: `at most ${ms(t.writeP99Ms)}`,
      actual: ms(result.writes.p99),
    });
  if (t.maxErrorRate !== undefined)
    checks.push({ id: 'errors', label: 'Errors', ok: result.errorRate <= t.maxErrorRate, want: `at most ${percent(t.maxErrorRate)} of requests`, actual: percent(result.errorRate) });
  if (t.maxFailureRate !== undefined) {
    const rate = result.offered ? (result.failed + result.timedOut) / result.offered : 0;
    checks.push({
      id: 'failures',
      label: 'Failed or timed out (rejections allowed)',
      ok: rate <= t.maxFailureRate,
      want: `at most ${percent(t.maxFailureRate)} of requests`,
      actual: percent(rate),
    });
  }
  if (t.maxCost !== undefined) checks.push({ id: 'cost', label: 'Cost', ok: result.costPerMonth <= t.maxCost, want: `at most ${dollars(t.maxCost)} a month`, actual: `${dollars(result.costPerMonth)} a month` });
  if (t.maxStaleRate !== undefined) {
    const rate = result.staleReads / Math.max(1, result.okReads ?? 0);
    checks.push({ id: 'stale', label: 'Stale reads', ok: rate <= t.maxStaleRate, want: `at most ${percent(t.maxStaleRate)} of reads`, actual: percent(rate) });
  }
  let faultResult: SimResult | null = null;
  if (t.survive) {
    faultResult = simulate(d, { seconds: study.seconds, seed: EVALUATION_SEED, faults: t.survive.faults });
    checks.push({
      id: 'survive',
      label: t.survive.label,
      ok: faultResult.errorRate <= t.survive.maxErrorRate,
      want: `errors at most ${percent(t.survive.maxErrorRate)}`,
      actual: `${percent(faultResult.errorRate)} errors`,
    });
  }
  return { result, faultResult, checks, passed: checks.every((c) => c.ok) };
}

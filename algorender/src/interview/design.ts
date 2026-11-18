// What only a system-design round needs (REVAMP_PLAN.md 6f-2), pure like
// ./rules.ts: the shape of a case study's interview variants, the deep dive
// (a fault or a surge from content, run on whatever the learner built), the
// three dimensions code scores (targets, estimation, cost), and the parts of
// a reference design the interviewer may not name before the learner does.

import { judge, type UnitKind, type Verdict } from '@/systems/design/estimation';
import { costPerMonth, EVALUATION_SEED, evaluate, simulate, targetChecks, withWorkload } from '@/systems/design';
import type { CaseStudy, Check, Component, Design, Fault, SimResult, Targets, Workload } from '@/systems/design/types';
import type { Score } from './rules';

// ── Variants ────────────────────────────────────────────────────────────────

/**
 * An estimate the learner makes in the Estimate phase. Its facts are in the
 * variant's brief; `answer` is computed from them in the content file, never
 * typed, and `working` shows how, in the debrief.
 */
export type Estimate = {
  id: string;
  question: string;
  unit: UnitKind;
  /** What the number counts, e.g. "requests a second". */
  unitLabel: string;
  answer: number;
  working: readonly string[];
  /** This estimate is the rate the simulator runs (the variant's workload rps, rounded). */
  rate?: true;
};

/** A machine to crash in the deep dive, named by kind so it applies to whatever the learner built: the first component of that kind. */
export type DeepFault = { at: number } & ({ kind: 'app' | 'cache'; instance: number } | { kind: 'database'; shard: number; replica?: number });

/**
 * The deep dive: what goes wrong (a crash, a surge or both), what the
 * interviewer says when it starts, and the targets that must hold through it.
 */
export type DeepDive = {
  /** Short, for the checks: "A cache node crashes at 3 s". */
  label: string;
  /** What the interviewer says to open the phase. */
  say: string;
  faults?: readonly DeepFault[];
  /** A surge in place of the variant's own traffic pattern. */
  spike?: NonNullable<Workload['spike']>;
  targets: Pick<Targets, 'p99Ms' | 'writeP99Ms' | 'maxErrorRate' | 'maxFailureRate'>;
};

/**
 * A case study retold for an interview: a different story with the same
 * trade-off, its own traffic, targets, start and reference (so it runs
 * through `evaluate()` like the case), plus estimates and a deep dive. The
 * brief gives the facts the estimates need, never the simulated rate.
 */
export type InterviewVariant = CaseStudy & {
  /** The case study it varies: its concept, lesson and page. */
  case: string;
  estimates: readonly Estimate[];
  deepDive: DeepDive;
};

/** What the round's page may know of a variant: no reference, hints or deep dive. */
export type PublicVariant = Omit<InterviewVariant, 'reference' | 'hints' | 'deepDive' | 'estimates'> & {
  estimates: readonly Pick<Estimate, 'id' | 'question' | 'unit' | 'unitLabel'>[];
};

export function publicVariant(v: InterviewVariant): PublicVariant {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reference, hints, deepDive, estimates, ...rest } = v;
  return { ...rest, estimates: estimates.map(({ id, question, unit, unitLabel }) => ({ id, question, unit, unitLabel })) };
}

// ── Checks ──────────────────────────────────────────────────────────────────

/** Checks a round allows: every one runs on the server. */
export const MAX_CHECKS = 8;
/** Every target met within this many checks is strong. */
export const STRONG_CHECKS = 4;

/** The deep dive's crashes, on the learner's own components (none when they have nothing of that kind). */
export function deepFaults(design: Design, deep: DeepDive): Fault[] {
  return (deep.faults ?? []).flatMap((f): Fault[] => {
    const c = design.components.find((x) => x.kind === f.kind);
    if (!c) return [];
    if (f.kind === 'database') {
      if (c.kind !== 'database' || f.shard >= c.shards || (f.replica ?? 0) > c.replicas) return [];
      return [{ at: f.at, component: c.id, instance: f.shard * (c.replicas + 1) + (f.replica ?? 0) }];
    }
    return [{ at: f.at, component: c.id, instance: f.instance }];
  });
}

export type RoundCheck = {
  result: SimResult;
  /** The case's own fault run, when it has one. */
  faultResult: SimResult | null;
  /** The deep dive's run, once that phase has begun. */
  deepResult: SimResult | null;
  checks: Check[];
  passed: boolean;
};

/**
 * Checks a design against a variant's targets, and with `deep` also through
 * its deep dive (checks with ids `deep-…`). Throws when the design can't run.
 */
export function checkRound(design: Design, variant: InterviewVariant, deep: boolean): RoundCheck {
  const out = evaluate(design, variant);
  if (!deep) return { ...out, deepResult: null };
  const d = variant.deepDive;
  const run = withWorkload(design, d.spike ? { ...variant, workload: { ...variant.workload, spike: d.spike } } : variant);
  const deepResult = simulate(run, { seconds: variant.seconds, seed: EVALUATION_SEED, faults: deepFaults(design, d) });
  const extra = targetChecks(deepResult, d.targets).map((c) => ({ ...c, id: `deep-${c.id}`, label: `${d.label}: ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}` }));
  const checks = [...out.checks, ...extra];
  return { ...out, deepResult, checks, passed: checks.every((c) => c.ok) };
}

// ── Scores code gives ───────────────────────────────────────────────────────

/** Targets, from the final run: all met within STRONG_CHECKS checks is 4, after more 3; at least half met 2. */
export function targetsScore(checks: readonly Pick<Check, 'ok'>[], used: number): Score {
  if (checks.length === 0) return 1;
  const met = checks.filter((c) => c.ok).length;
  if (met === checks.length) return used <= STRONG_CHECKS ? 4 : 3;
  return met / checks.length >= 0.5 ? 2 : 1;
}

/** One estimate as typed, read and judged. */
export type EstimateAnswer = { id: string; text: string; value: number };

/** How each estimate was judged (unanswered is off). */
export function estimateVerdicts(estimates: readonly Pick<Estimate, 'id' | 'answer'>[], answers: readonly EstimateAnswer[]): { id: string; verdict: Verdict; factor: number }[] {
  return estimates.map((e) => {
    const a = answers.find((x) => x.id === e.id);
    const j = a ? judge(a.value, e.answer) : { verdict: 'off' as const, factor: Infinity };
    return { id: e.id, verdict: j.verdict, factor: j.factor };
  });
}

/** Estimation: spot on is two points, the right order one; every point is 4, three quarters 3, half 2. */
export function estimationScore(verdicts: readonly { verdict: Verdict }[]): Score {
  if (verdicts.length === 0) return 1;
  const share = verdicts.reduce((n, v) => n + (v.verdict === 'spot-on' ? 2 : v.verdict === 'close' ? 1 : 0), 0) / (2 * verdicts.length);
  return share >= 1 ? 4 : share >= 0.75 ? 3 : share >= 0.5 ? 2 : 1;
}

/** How much leaner than the reference still counts as "close to a lean design". */
export const LEAN = 1.1;

/** Cost: within 10% of the reference's (or cheaper) is 4, within the budget 3, within half as much again 2. */
export function costScore(cost: number, reference: number, budget: number | undefined): Score {
  if (cost <= reference * LEAN) return 4;
  const cap = budget ?? reference * 2;
  if (cost <= cap) return 3;
  return cost <= cap * 1.5 ? 2 : 1;
}

/** The monthly cost of a design as the variant runs it. */
export const designCost = (design: Design, variant: InterviewVariant) => costPerMonth(withWorkload(design, variant));

// ── Giveaways ───────────────────────────────────────────────────────────────

/** Parts of a design an interviewer could name: the components and the database's shape. */
export type Feature = 'cache' | 'queue' | 'rate-limiter' | 'shards' | 'replicas' | 'failover';

/** Words that name each part. The interviewer may not say one before the learner (or the brief) does. */
export const DESIGN_TERMS: Record<Feature, readonly string[]> = {
  cache: ['cache', 'caches', 'caching', 'cached', 'redis', 'memcached', 'in memory'],
  queue: ['queue', 'queues', 'queued', 'queueing', 'message queue', 'kafka', 'asynchronous', 'asynchronously', 'async', 'background worker', 'background workers'],
  'rate-limiter': ['rate limiter', 'rate limit', 'rate limits', 'rate limiting', 'token bucket', 'throttle', 'throttling', '429', 'load shedding', 'shed load', 'shedding'],
  shards: ['shard', 'shards', 'sharded', 'sharding', 'partition', 'partitions', 'partitioned', 'partitioning'],
  replicas: ['replica', 'replicas', 'replication', 'replicated', 'read replica'],
  failover: ['failover', 'fail over', 'promote', 'promoted', 'promotion', 'leader election'],
};

const has = (design: Design, kind: Component['kind']) => design.components.some((c) => c.kind === kind);
const db = (design: Design) => design.components.find((c) => c.kind === 'database');

/** The parts a design has. */
export function featuresOf(design: Design): Set<Feature> {
  const out = new Set<Feature>();
  if (has(design, 'cache')) out.add('cache');
  if (has(design, 'queue')) out.add('queue');
  if (has(design, 'rate-limiter')) out.add('rate-limiter');
  const d = db(design);
  if (d?.kind === 'database') {
    if (d.shards > 1) out.add('shards');
    if (d.replicas > 0) out.add('replicas');
    if (d.failover && d.replicas > 0) out.add('failover');
  }
  return out;
}

/** What the reference has and the learner's design lacks: the parts the interviewer mustn't name first. */
export function missingFeatures(reference: Design, design: Design): Feature[] {
  const mine = featuresOf(design);
  return [...featuresOf(reference)].filter((f) => !mine.has(f));
}

/** The words for those parts. */
export const missingTerms = (reference: Design, design: Design) => missingFeatures(reference, design).flatMap((f) => DESIGN_TERMS[f]);

/** A design in words, one component a line: what the interviewer reads, and what the leak check compares a reply with. */
export function describeDesign(design: Design): string {
  return design.components
    .map((c) => {
      switch (c.kind) {
        case 'clients':
          return `Clients send traffic to ${c.to}.`;
        case 'rate-limiter':
          return `Rate limiter ${c.id}: ${c.perSecond} requests a second with a burst of ${c.burst}, then ${c.to}.`;
        case 'load-balancer':
          return `Load balancer ${c.id} (${c.policy}) in front of ${c.to}.`;
        case 'app':
          return `App servers ${c.id}: ${c.instances} instances of ${c.workers} workers, ${c.serviceMs} ms a request; reads go to ${c.reads}, writes to ${c.writes}${c.fanout > 1 ? `, each write fanned out ${c.fanout} times` : ''}.`;
        case 'cache':
          return `Cache ${c.id}: ${c.nodes} nodes of ${c.capacity} keys, ${c.policy.toUpperCase()}, writes ${c.writes}, in front of ${c.to}.`;
        case 'queue':
          return `Queue ${c.id}: ${c.consumers} consumers applying writes to ${c.to}.`;
        case 'database':
          return `Database ${c.id}: ${c.shards} shard${c.shards === 1 ? '' : 's'} of a primary and ${c.replicas} replica${c.replicas === 1 ? '' : 's'}, ${c.workers} connections each, reads ${c.readMs} ms, writes ${c.writeMs} ms, replica lag ${c.replicaLagMs} ms, failover ${c.failover ? `on after ${c.failoverMs} ms` : 'off'}.`;
      }
    })
    .join('\n');
}

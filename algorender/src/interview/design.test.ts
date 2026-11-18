// A system-design round's rules (REVAMP_PLAN.md 6f-2): its phases, the scores
// code gives (targets, estimation, cost), the deep dive's faults on whatever
// the learner built, the giveaway words, and what a design round's
// `interview.finished` event does to the projections.

import { describe, expect, it } from 'vitest';
import { getVariant } from '@/content/designs/interviews';
import { parseEvent, type EventData, type ProgressEvent } from '@/progress/events';
import { finishedRounds } from '@/progress/interviews';
import { mastery, observations, type MasteryGraph } from '@/progress/mastery';
import { badges, conceptLevels, XP, xpLedger } from '@/progress/play';
import { reviewCards } from '@/progress/review';
import type { Design } from '@/systems/design/types';
import {
  checkRound,
  costScore,
  deepFaults,
  describeDesign,
  DESIGN_TERMS,
  estimateVerdicts,
  estimationScore,
  featuresOf,
  missingFeatures,
  missingTerms,
  publicVariant,
  STRONG_CHECKS,
  targetsScore,
} from './design';
import { cappedDimension, DESIGN_PHASES, dimensionLabel, firstUnsaid, meetsBar, modelDimensionsOf, nextPhase, phasesOf, suggestedMinutes, unsaidOf } from './rules';

const variant = getVariant('qr-menus')!;
const carts = getVariant('shopping-carts')!;

describe('a design round’s rules', () => {
  it('has its own phases and times, and moves on one phase at a time', () => {
    expect(phasesOf('design')).toBe(DESIGN_PHASES);
    expect(suggestedMinutes(45, 'design')).toEqual({ requirements: 5, estimate: 5, design: 20, deepdive: 10 });
    for (const limit of [30, 45, 60]) expect(Object.values(suggestedMinutes(limit, 'design')).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(limit);
    expect(['requirements', 'estimate', 'design', 'deepdive'].map((p) => nextPhase(p as 'design'))).toEqual(['estimate', 'design', 'deepdive', 'debrief']);
    expect(nextPhase('clarify')).toBe('approach');
    expect(nextPhase('debrief')).toBeNull();
    expect(modelDimensionsOf('design')).toEqual(['tradeoffs', 'communication']);
    expect(cappedDimension('design')).toBe('tradeoffs');
    expect(dimensionLabel('tradeoffs')).toBe('Trade-offs');
    expect(dimensionLabel('correctness')).toBe('Correctness');
  });

  it('scores the targets from the final run and the checks used', () => {
    const ok = { ok: true };
    const no = { ok: false };
    expect(targetsScore([ok, ok, ok], 1)).toBe(4);
    expect(targetsScore([ok, ok, ok], STRONG_CHECKS)).toBe(4);
    expect(targetsScore([ok, ok, ok], STRONG_CHECKS + 1)).toBe(3);
    expect(targetsScore([ok, ok, no, no], 1)).toBe(2);
    expect(targetsScore([ok, no, no], 1)).toBe(1);
    expect(targetsScore([], 0)).toBe(1);
  });

  it('judges estimates on a log scale: spot on within ×2, the right order within ×10', () => {
    const estimates = [
      { id: 'a', answer: 5000 },
      { id: 'b', answer: 1e8 },
    ];
    const verdicts = estimateVerdicts(estimates, [
      { id: 'a', text: '6k', value: 6000 },
      { id: 'b', text: '500M', value: 5e8 },
    ]);
    expect(verdicts.map((v) => v.verdict)).toEqual(['spot-on', 'close']);
    expect(estimationScore(verdicts)).toBe(3);
    expect(estimationScore(estimateVerdicts(estimates, [{ id: 'a', text: '5000', value: 5000 }]))).toBe(2);
    expect(estimationScore([{ verdict: 'spot-on' }, { verdict: 'spot-on' }])).toBe(4);
    expect(estimationScore([{ verdict: 'close' }, { verdict: 'close' }])).toBe(2);
    expect(estimationScore([{ verdict: 'off' }, { verdict: 'close' }])).toBe(1);
  });

  it('scores cost against a lean design that passes and the budget', () => {
    expect(costScore(600, 600, 700)).toBe(4);
    expect(costScore(650, 600, 700)).toBe(4);
    expect(costScore(700, 600, 700)).toBe(3);
    expect(costScore(1000, 600, 700)).toBe(2);
    expect(costScore(1100, 600, 700)).toBe(1);
  });

  it('crashes the deep dive’s machines on whatever the learner built, by kind', () => {
    const mine: Design = { components: variant.reference.components.map((c) => (c.kind === 'app' ? { ...c, id: 'web' } : c)) };
    expect(deepFaults(mine, variant.deepDive)).toEqual([{ at: 3, component: 'web', instance: 0 }]);
    expect(deepFaults(variant.reference, carts.deepDive)).toEqual([]);
    // Shard 0's first replica: its primary is node 0.
    expect(deepFaults(carts.reference, carts.deepDive)).toEqual([{ at: 4, component: 'db', instance: 1 }]);
    const session = getVariant('session-store')!;
    expect(deepFaults(session.reference, session.deepDive)).toEqual([
      { at: 3, component: 'db', instance: 0 },
      { at: 5, component: 'db', instance: 2 },
    ]);
  });

  it('adds the deep dive’s checks only when asked', () => {
    expect(checkRound(variant.reference, variant, false).checks.some((c) => c.id.startsWith('deep-'))).toBe(false);
    const deep = checkRound(variant.reference, variant, true);
    expect(deep.deepResult).not.toBeNull();
    expect(deep.checks.filter((c) => c.id.startsWith('deep-')).map((c) => c.label)).toEqual(['An app server crashes at 3 s: p99 latency', 'An app server crashes at 3 s: errors']);
  });

  it('knows the parts the reference has and the learner’s design lacks, and keeps them unnamed until the learner names them', () => {
    expect([...featuresOf(variant.reference)]).toEqual(['cache']);
    expect(missingFeatures(variant.reference, variant.start)).toEqual(['cache']);
    expect(missingFeatures(variant.reference, variant.reference)).toEqual([]);
    expect(missingFeatures(carts.reference, carts.start)).toEqual(['failover']);
    const terms = missingTerms(variant.reference, variant.start);
    expect(terms).toEqual(DESIGN_TERMS.cache);
    expect(firstUnsaid('Have you thought about caching the menus?', terms, 'I would add more app servers')).toBe('caching');
    expect(firstUnsaid('Where would the Redis go?', terms, 'I would add more app servers')).toBe('redis');
    expect(firstUnsaid('Why a cache there?', terms, 'I’d put a cache in front of the database')).toBeNull();
    expect(firstUnsaid('What happens when a server crashes?', terms, '')).toBeNull();
    expect(unsaidOf(terms, 'a cache of menus')).not.toContain('cache');
  });

  it('describes a design in words, and gives the page a variant without its answers', () => {
    expect(describeDesign(variant.reference)).toContain('Cache cache: 2 nodes of 10000 keys, LRU, writes invalidate, in front of db.');
    const shown = publicVariant(variant) as Record<string, unknown>;
    for (const key of ['reference', 'hints', 'deepDive']) expect(shown[key]).toBeUndefined();
    expect((shown.estimates as { answer?: number }[]).every((e) => e.answer === undefined)).toBe(true);
  });
});

// ── A design round's event and the projections ─────────────────────────────

let n = 0;
const at = (day: number) => new Date(Date.UTC(2026, 10, 1 + day, 10, n % 60)).toISOString();
const ev = (kind: ProgressEvent['kind'], data: unknown, when: string): ProgressEvent => {
  n++;
  return { id: `0190b000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
};

const graph: MasteryGraph = {
  concepts: [{ id: 'system-design', title: 'System design', track: 'systems', prereqs: [], visualisers: [], planned: false, depth: 0 }],
  lessons: {},
  exercises: {},
  problems: {},
  designs: { 'url-shortener': 'system-design' },
};

const scores = (tradeoffs = 3, rest = 3) => [
  { dimension: 'targets', score: rest },
  { dimension: 'estimation', score: rest },
  { dimension: 'cost', score: rest },
  { dimension: 'tradeoffs', score: tradeoffs },
  { dimension: 'communication', score: rest },
];
const round = (over: Partial<EventData<'interview.finished'>>, when: string) =>
  ev('interview.finished', { format: 'design', item: 'url-shortener', variant: 'qr-menus', minutes: 40, limit: 45, hints: 0, passed: true, scores: scores(), by: 'model', verified: true, ...over }, when);
const passCase = (when: string) => ev('design.checked', { study: 'url-shortener', passed: true, throughput: 6000, p99: 20, errorRate: 0, cost: 600 }, when);

describe('a design round’s interview.finished event', () => {
  it('is a valid event without a language', () => {
    expect(parseEvent(round({}, at(0)))).not.toBeNull();
    expect(meetsBar(scores(), 0, true)).toBe(true);
  });

  it('is one observation of the case’s concept under the case’s own item, right when it meets the bar', () => {
    const obs = observations([passCase(at(0)), round({}, at(2)), round({ passed: false }, at(3)), round({ verified: undefined }, at(4))], graph);
    expect(obs.map((o) => [o.item, o.correct, o.source])).toEqual([
      ['design:url-shortener', true, 'design'],
      ['design:url-shortener', true, 'interview'],
      ['design:url-shortener', false, 'interview'],
    ]);
    expect(mastery([passCase(at(0)), round({}, at(2))], graph).get('system-design')!.items).toBe(1);
  });

  it('makes no review card, and isn’t a coding round on Today or in the plan', () => {
    expect(reviewCards([round({ passed: false }, at(0))]).size).toBe(0);
    expect(finishedRounds([round({}, at(0))])).toEqual([]);
  });

  it('earns XP once per case, the analyse level for trade-offs at the bar, and the badge', () => {
    const xp = (events: ProgressEvent[]) => xpLedger(events).filter((x) => x.why.includes('mock interview')).map((x) => x.xp);
    expect(xp([round({}, at(0)), round({ variant: 'album-links' }, at(1))])).toEqual([XP.interview.clean]);
    expect(xp([round({ hints: 1 }, at(0))])).toEqual([XP.interview.oneHint]);
    expect(xp([round({ verified: undefined }, at(0)), round({ passed: false }, at(1))])).toEqual([]);
    const m = mastery([], graph);
    expect(conceptLevels([round({}, at(0))], graph, m).get('system-design')).toEqual(new Set(['analyze']));
    expect(conceptLevels([round({ scores: scores(2) }, at(0))], graph, m).get('system-design')).toBeUndefined();
    expect(badges([round({}, at(0))]).has('interview-ready')).toBe(true);
    expect(badges([round({ hints: 1 }, at(0))]).has('interview-ready')).toBe(false);
  });
});

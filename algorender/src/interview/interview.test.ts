// Mock interviews' rules, and what an `interview.finished` event does to the
// projections: mastery, review, XP, levels and the badge. Only rounds the
// server wrote (verified) count.

import { describe, expect, it } from 'vitest';
import { loadProblems } from '@/problems/load';
import { PATTERN_IDS } from '@/problems/patterns';
import type { EventData, ProgressEvent } from '@/progress/events';
import { parseEvent } from '@/progress/events';
import { mastery, observations, type MasteryGraph } from '@/progress/mastery';
import { badges, conceptLevels, XP, xpLedger } from '@/progress/play';
import { reviewCards } from '@/progress/review';
import {
  COMPLEXITIES,
  complexityRank,
  correctnessScore,
  edgeCaseList,
  endedPassing,
  giveaway,
  GIVEAWAY_TERMS,
  hintCap,
  meetsBar,
  nextPhase,
  slowerThanReference,
  suggestedMinutes,
  unsaidTerms,
} from './rules';

describe('the rules', () => {
  it('suggests phase times that fit the round and move on one phase at a time', () => {
    expect(suggestedMinutes(45)).toEqual({ clarify: 5, approach: 10, code: 20, test: 5 });
    for (const limit of [30, 45, 60]) expect(Object.values(suggestedMinutes(limit)).reduce((a, b) => a + b)).toBeLessThanOrEqual(limit);
    expect(nextPhase('clarify')).toBe('approach');
    expect(nextPhase('test')).toBe('debrief');
    expect(nextPhase('debrief')).toBeNull();
  });

  it('caps the approach by hints, scores correctness from the submissions, and says when a round meets the bar', () => {
    expect([0, 1, 2, 3].map(hintCap)).toEqual([4, 3, 2, 1]);
    expect(correctnessScore([])).toBe(1);
    expect(correctnessScore([{ tests: 10, failed: 0 }])).toBe(4);
    expect(correctnessScore([{ tests: 10, failed: 4 }, { tests: 10, failed: 0 }])).toBe(4);
    expect(correctnessScore([{ tests: 10, failed: 4 }, { tests: 10, failed: 1 }, { tests: 10, failed: 0 }])).toBe(3);
    expect(correctnessScore([{ tests: 10, failed: 5 }])).toBe(2);
    expect(correctnessScore([{ tests: 10, failed: 6 }])).toBe(1);
    expect(endedPassing([{ tests: 10, failed: 0 }, { tests: 10, failed: 1 }])).toBe(false);
    const threes = ['correctness', 'approach', 'analysis', 'testing', 'communication'].map((dimension) => ({ dimension, score: 3 }));
    expect(meetsBar(threes, 0, true)).toBe(true);
    expect(meetsBar(threes, 2, true)).toBe(true);
    expect(meetsBar(threes, 3, true)).toBe(false);
    expect(meetsBar(threes, 0, false)).toBe(false);
    expect(meetsBar([...threes.slice(1), { dimension: 'correctness', score: 2 }], 0, true)).toBe(false);
  });

  it('reads the cases one per line', () => {
    expect(edgeCaseList('- empty\n\n2. one item\n  * duplicates  \n•')).toEqual(['empty', 'one item', 'duplicates']);
  });

  it('places every problem’s time complexity it can among the options, and knows when a stated one is slower', () => {
    expect(complexityRank('O(n log k) to start, O(log k) per add')).toBe(4);
    expect(complexityRank('O(log(m · n))')).toBe(1);
    expect(complexityRank('O(n · 2ⁿ)')).toBe(7);
    expect(complexityRank('O(m × n)')).toBeNull();
    expect(slowerThanReference('O(n²)', 'O(n)')).toBe(true);
    expect(slowerThanReference('O(n)', 'O(n)')).toBe(false);
    expect(slowerThanReference('other', 'O(n)')).toBe(false);
    expect(slowerThanReference('O(n²)', 'O(V + E)')).toBe(false);
    // Most problems can be compared.
    const ranked = loadProblems().filter((p) => complexityRank(p.complexity.time) != null);
    expect(ranked.length / loadProblems().length).toBeGreaterThan(0.6);
    expect(COMPLEXITIES.at(-1)?.id).toBe('other');
  });

  it('catches a pattern named before the learner names it, in any spelling', () => {
    expect(giveaway('Have you thought about a Hash-Map?', ['hashing'], 'I would loop twice', 'Given an array')).toBe('hash map');
    expect(giveaway('Could two pointers help?', ['two-pointers'], 'what about Two-Pointer tricks', '')).toBe('two pointers');
    expect(giveaway('Why use a hash map there?', ['hashing'], 'I’d keep a hash map of what I’ve seen', '')).toBeNull();
    expect(giveaway('How does your stack grow?', ['stack'], '', 'Design a stack that also returns its minimum.')).toBeNull();
    // Whole words only: "dp" isn't in "adapt", "window" is a giveaway on its own.
    expect(giveaway('Can you adapt it?', ['dp-1d'], '', '')).toBeNull();
    expect(giveaway('What would the window hold?', ['sliding-window'], '', '')).toBe('window');
    expect(unsaidTerms(['hashing'], 'my hash map idea')).not.toContain('hash map');
    for (const p of PATTERN_IDS) expect(GIVEAWAY_TERMS[p]).toBeDefined();
  });
});

// ── Projections ─────────────────────────────────────────────────────────────

let n = 0;
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 9, 1 + day, hour, n % 60)).toISOString();
const ev = (kind: ProgressEvent['kind'], data: unknown, when: string): ProgressEvent => {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
};

const graph: MasteryGraph = {
  concepts: [{ id: 'hash-tables', title: 'Hash tables', track: 'structures', prereqs: [], visualisers: [], planned: false, depth: 0 }],
  lessons: {},
  exercises: {},
  problems: { 'two-sum': ['hash-tables'] },
};

const scores = (approach = 3, analysis = 3, rest = 3) => [
  { dimension: 'correctness', score: rest },
  { dimension: 'approach', score: approach },
  { dimension: 'analysis', score: analysis },
  { dimension: 'testing', score: rest },
  { dimension: 'communication', score: rest },
];
const round = (over: Partial<EventData<'interview.finished'>>, when: string) =>
  ev('interview.finished', { format: 'coding', item: 'two-sum', language: 'python', minutes: 40, limit: 45, hints: 0, passed: true, scores: scores(), by: 'model', verified: true, ...over }, when);
const solve = (when: string) => ev('problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 20, failed: 0 }, when);

describe('an interview.finished event', () => {
  it('is a valid event, with a score per dimension from 1 to 4', () => {
    expect(parseEvent(round({}, at(0)))).not.toBeNull();
    expect(parseEvent(round({ scores: [{ dimension: 'approach', score: 5 }] }, at(0)))).toBeNull();
    expect(parseEvent(round({ hints: 4 }, at(0)))).toBeNull();
  });

  it('is one observation of the problem’s concepts under the problem’s own item, right when it meets the bar', () => {
    const obs = observations([solve(at(0)), round({}, at(2)), round({ hints: 3 }, at(3)), round({ verified: undefined }, at(4))], graph);
    expect(obs.map((o) => [o.item, o.correct, o.source])).toEqual([
      ['problem:two-sum', true, 'problem'],
      ['problem:two-sum', true, 'interview'],
      ['problem:two-sum', false, 'interview'],
    ]);
    const m = mastery([solve(at(0)), round({}, at(2))], graph).get('hash-tables')!;
    expect(m.items).toBe(1);
    expect(m.delayed).toBe(true);
  });

  it('makes the problem’s card due tomorrow when it falls below the bar or used a level-2 hint', () => {
    const due = (events: ProgressEvent[]) => reviewCards(events).get('problem:two-sum')?.card.due.toISOString().slice(0, 10);
    expect(due([round({ passed: false }, at(0))])).toBe(at(1).slice(0, 10));
    expect(due([solve(at(0)), round({ hints: 2 }, at(5))])).toBe(at(6).slice(0, 10));
    const good = reviewCards([solve(at(0)), round({ hints: 1 }, at(1))]).get('problem:two-sum')!;
    expect(good.card.due.toISOString() > at(2)).toBe(true);
    expect(reviewCards([round({ passed: false, verified: undefined }, at(0))]).size).toBe(0);
  });

  it('earns XP once per problem for the first round that meets the bar with at most one level-1 hint', () => {
    const xp = (events: ProgressEvent[]) => xpLedger(events).filter((x) => x.why.includes('mock interview')).map((x) => x.xp);
    expect(xp([round({}, at(0)), round({}, at(1))])).toEqual([XP.interview.clean]);
    expect(xp([round({ hints: 1 }, at(0))])).toEqual([XP.interview.oneHint]);
    expect(xp([round({ hints: 2 }, at(0)), round({ passed: false }, at(1)), round({ verified: undefined }, at(2))])).toEqual([]);
    expect(xp([round({ hints: 2 }, at(0)), round({}, at(1))])).toEqual([XP.interview.clean]);
  });

  it('gives the analyse level for approach and analysis at the bar, and the badge for a round without hints', () => {
    const m = mastery([], graph);
    expect(conceptLevels([round({}, at(0))], graph, m).get('hash-tables')).toEqual(new Set(['analyze']));
    expect(conceptLevels([round({ scores: scores(3, 2) }, at(0))], graph, m).get('hash-tables')).toBeUndefined();
    expect(badges([round({}, at(0))]).has('interview-ready')).toBe(true);
    expect(badges([round({ hints: 1 }, at(0)), round({ passed: false }, at(1))]).has('interview-ready')).toBe(false);
    expect(badges([round({ verified: undefined }, at(0))]).has('interview-ready')).toBe(false);
  });
});

// Mock interviews on Today and in the plan (6f-3): the rounds a learner has
// finished, the pattern Today offers a round on, and the plan's weekly round.

import { describe, expect, it } from 'vitest';
import { goals, type Goal } from '@/content/goals';
import { masteryGraph, planCatalog } from '@/content/mastery';
import { loadProblems } from '@/problems/load';
import type { PatternId } from '@/problems/patterns';
import type { EventData, EventKind, ProgressEvent } from './events';
import { finishedRounds, interviewPick, lastRound, roundsBetween } from './interviews';
import type { MasteryGraph } from './mastery';
import { isConcept, isInterview, leftIn, planView, REVIEW_SHARE, ROUND_MINUTES, WEEK_MS } from './plan';

let n = 0;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 5, 9);
const at = (days: number) => new Date(T0 + days * DAY + (n % 1000)).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}

const scores = (s = 3) => ['correctness', 'approach', 'analysis', 'testing', 'communication'].map((dimension) => ({ dimension, score: s }));
const round = (item: string, when: string, over: Partial<EventData<'interview.finished'>> = {}) =>
  ev('interview.finished', { format: 'coding', item, language: 'python', minutes: 40, limit: 45, hints: 0, passed: true, scores: scores(), by: 'model', verified: true, ...over }, when);
const solve = (problem: string, when: string, passed = true) => ev('problem.submitted', { problem, language: 'python', passed, tests: 10, failed: passed ? 0 : 3 }, when);

const PATTERNS: Record<string, PatternId[]> = {
  'two-sum': ['hashing'],
  'contains-duplicate': ['hashing'],
  'valid-palindrome': ['two-pointers'],
  'longest-substring': ['sliding-window', 'hashing'],
  'climbing-stairs': ['dp-1d'],
};

describe('finished rounds', () => {
  it('counts only the coding rounds the server wrote, and judges each by the bar', () => {
    const events = [round('two-sum', at(0)), round('two-sum', at(1), { verified: undefined }), round('two-sum', at(2), { format: 'design' }), round('climbing-stairs', at(3), { hints: 3 })];
    expect(finishedRounds(events).map((r) => [r.item, r.meetsBar])).toEqual([
      ['two-sum', true],
      ['climbing-stairs', false],
    ]);
    expect(lastRound(events)).toMatchObject({ item: 'climbing-stairs', meetsBar: false, hints: 3 });
    expect(lastRound([])).toBeNull();
    expect(lastRound([round('two-sum', at(0), { passed: false })])!.meetsBar).toBe(false);
    expect(lastRound([round('two-sum', at(0), { scores: scores(2) })])!.meetsBar).toBe(false);
  });

  it('counts the rounds inside a window, its start in and its end out', () => {
    const day = (d: number) => new Date(T0 + d * DAY).toISOString();
    const events = [round('two-sum', day(0)), round('two-sum', day(7)), round('two-sum', day(8), { verified: undefined })];
    expect(roundsBetween(events, day(0), day(7))).toBe(1);
    expect(roundsBetween(events, day(7), day(14))).toBe(1);
    expect(roundsBetween(events, day(14), day(21))).toBe(0);
  });
});

describe('the pattern Today offers a round on', () => {
  it('is none before the learner has solved anything', () => {
    expect(interviewPick([], PATTERNS)).toBeNull();
    expect(interviewPick([solve('two-sum', at(0), false)], PATTERNS)).toBeNull();
  });

  it('is the most recently practised pattern with no round on it that meets the bar', () => {
    const practised = [solve('two-sum', at(0)), solve('contains-duplicate', at(1)), solve('valid-palindrome', at(2))];
    expect(interviewPick(practised, PATTERNS)).toEqual({ pattern: 'two-pointers', solved: 1 });
    // A round that meets the bar on a two-pointers problem settles it; hashing is next, with both its problems counted.
    expect(interviewPick([...practised, round('valid-palindrome', at(3))], PATTERNS)).toEqual({ pattern: 'hashing', solved: 2 });
    // A round below the bar, or one the server didn't write, settles nothing.
    expect(interviewPick([...practised, round('valid-palindrome', at(3), { passed: false })], PATTERNS)?.pattern).toBe('two-pointers');
    expect(interviewPick([...practised, round('valid-palindrome', at(3), { verified: undefined })], PATTERNS)?.pattern).toBe('two-pointers');
    // Practising hashing again brings it to the front.
    expect(interviewPick([...practised, solve('two-sum', at(4))], PATTERNS)?.pattern).toBe('hashing');
  });

  it('counts a problem for every pattern it has, on both sides', () => {
    // Longest substring is sliding window and hashing: solving it practises both, and a round on it that meets the bar settles both.
    expect(interviewPick([solve('valid-palindrome', at(0)), solve('longest-substring', at(1))], PATTERNS)?.pattern).toBe('sliding-window');
    expect(interviewPick([solve('two-sum', at(0)), solve('valid-palindrome', at(1)), round('longest-substring', at(2))], PATTERNS)?.pattern).toBe('two-pointers');
    expect(interviewPick([solve('two-sum', at(0)), round('longest-substring', at(2))], PATTERNS)).toBeNull();
  });

  it('is none once every practised pattern has a round that meets the bar', () => {
    expect(interviewPick([solve('two-sum', at(0)), round('contains-duplicate', at(1))], PATTERNS)).toBeNull();
  });

  it('ignores problems it doesn’t know', () => {
    expect(interviewPick([solve('no-such-problem', at(0))], PATTERNS)).toBeNull();
  });

  it('works on the real problems', () => {
    const patternsOf = Object.fromEntries(loadProblems().map((p) => [p.slug, p.patterns]));
    expect(interviewPick([solve('two-sum', at(0))], patternsOf)?.pattern).toBe('hashing');
  });
});

// a → b → c, a → d; each concept takes an hour.
const tiny: MasteryGraph = {
  concepts: [
    { id: 'a', title: 'A', track: 'foundations', prereqs: [], visualisers: [], planned: false, depth: 0 },
    { id: 'b', title: 'B', track: 'foundations', prereqs: ['a'], visualisers: [], planned: false, depth: 1 },
    { id: 'c', title: 'C', track: 'foundations', prereqs: ['b'], visualisers: [], planned: false, depth: 2 },
    { id: 'd', title: 'D', track: 'foundations', prereqs: ['a'], visualisers: [], planned: false, depth: 1 },
  ],
  lessons: {},
  exercises: {},
  problems: {},
};
const interviewGoal: Goal = { id: 'g', title: 'G', summary: 'g', concepts: ['c', 'd'], interviews: true };
const otherGoal: Goal = { id: 'h', title: 'H', summary: 'h', concepts: ['c', 'd'] };
const hour = { a: 60, b: 60, c: 60, d: 60 };
const setPlan = (goal: string, hours: number, when: string, target?: string) => ev('plan.set', { goal, hours, ...(target && { target }) }, when);
const mark = (concept: string, when: string) => ev('concept.marked', { concept, known: true }, when);
const view = (events: ProgressEvent[], now: string, interviews = true) => planView(events, tiny, [interviewGoal, otherGoal], hour, new Date(now), [], { interviews })!;
const shape = (v: NonNullable<ReturnType<typeof planView>>) => v.weeks.map((w) => w.items.map((i) => (isConcept(i) ? i.concept : isInterview(i) ? (i.done ? 'R✓' : 'R') : `m${i.milestone}`)));

describe('the plan’s weekly mock interview', () => {
  it('keeps a round in every week of a goal that aims at interviews, counted in the hours', () => {
    // 3 hours a week leave 153 minutes after reviews: two concepts a week without rounds, one with.
    expect(3 * 60 * (1 - REVIEW_SHARE) - ROUND_MINUTES).toBeLessThan(120);
    const events = [setPlan('g', 3, at(0))];
    expect(shape(view(events, at(1), false))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const v = view(events, at(1));
    expect(v.rounds).toBe(true);
    expect(shape(v)).toEqual([
      ['a', 'R'],
      ['b', 'R'],
      ['c', 'R'],
      ['d', 'R'],
    ]);
    expect(v.weeks.map((w) => w.minutes)).toEqual([60 + ROUND_MINUTES, 60 + ROUND_MINUTES, 60 + ROUND_MINUTES, 60 + ROUND_MINUTES]);
    expect(leftIn(v.weeks[0])).toBe(2);
  });

  it('holds no round for other goals, or with interviews off', () => {
    expect(view([setPlan('h', 3, at(0))], at(1)).rounds).toBe(false);
    expect(shape(view([setPlan('h', 3, at(0))], at(1))).flat()).not.toContain('R');
    expect(view([setPlan('g', 3, at(0))], at(1), false).rounds).toBe(false);
    // Plans made before 6f-3 (no options) are unchanged.
    expect(planView([setPlan('g', 3, at(0))], tiny, [interviewGoal], hour, new Date(at(1)))!.rounds).toBe(false);
  });

  it('marks a week’s round done once a round finishes inside it, and only that week', () => {
    const events = [setPlan('g', 3, at(0)), round('two-sum', at(2))];
    const v = view(events, at(3));
    expect(shape(v).map((w) => w.at(-1))).toEqual(['R✓', 'R', 'R', 'R']);
    expect(leftIn(v.weeks[0])).toBe(1);
    // A round the server didn't write doesn't count.
    expect(shape(view([setPlan('g', 3, at(0)), round('two-sum', at(2), { verified: undefined })], at(3)))[0]).toEqual(['a', 'R']);
    // Next week, last week's round is gone with its window, and the new week's is still to do.
    const later = view([...events, mark('a', at(6))], at(8));
    expect(later.week).toBe(1);
    expect(shape(later)[0]).toEqual(['b', 'R']);
  });

  it('never counts a missed round as behind', () => {
    // A week in, nothing done: only week 0's concept is behind, not its round.
    const v = view([setPlan('g', 3, at(0))], at(8));
    expect(v.due).toBe(1);
    expect(v.behind).toBe(1);
  });

  it('asks for the hours a target date needs with the round still kept', () => {
    // Four concepts in the two windows before the target: two a week plus the round is 180 minutes, which takes 4 hours less the review share (3 without the round).
    const target = new Date(T0 + 2 * WEEK_MS).toISOString().slice(0, 10);
    expect(view([setPlan('g', 2, at(0), target)], at(0)).hoursNeeded).toBe(4);
    expect(view([setPlan('g', 2, at(0), target)], at(0), false).hoursNeeded).toBe(3);
  });

  it('is part of the real Coding interviews goal, and of no other', () => {
    const graph = masteryGraph();
    const minutes = Object.fromEntries(Object.entries(planCatalog()).map(([id, c]) => [id, c.minutes]));
    for (const goal of goals) {
      const v = planView([ev('plan.set', { goal: goal.id, hours: 5 }, at(0))], graph, goals, minutes, new Date(at(1)), [], { interviews: true })!;
      expect(v.rounds, goal.id).toBe(goal.id === 'interviews');
      if (v.rounds) for (const w of v.weeks) expect(w.items.filter(isInterview), `week ${w.index}`).toHaveLength(1);
    }
  });
});

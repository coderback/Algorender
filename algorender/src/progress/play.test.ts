import { describe, expect, it } from 'vitest';
import type { EventData, EventKind, ProgressEvent } from './events';
import { parseEvent } from './events';
import { mastery, type MasteryGraph } from './mastery';
import { badges, conceptLevels, didToday, XP, xpLedger, xpTotals } from './play';

let n = 0;
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 9, 1 + day, hour, n % 60)).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}

const graph: MasteryGraph = {
  concepts: [
    { id: 'sorting', title: 'Sorting', track: 'foundations', prereqs: [], lesson: 'ls', visualisers: ['bubble-sort'], planned: false, depth: 0 },
    { id: 'bayes', title: 'Bayes', track: 'math', prereqs: [], lesson: 'lb', visualisers: ['bayes'], planned: false, depth: 0 },
  ],
  lessons: { ls: 'sorting', lb: 'bayes' },
  exercises: { 'bubble-ex': ['sorting'] },
  problems: { 'sort-colors': ['sorting'] },
};

const quiz = (question: number, correct: boolean, when: string, lesson = 'ls') => ev('quiz.answered', { lesson, quiz: 'quiz', question, correct }, when);
const game = (g: EventData<'game.played'>['game'], item: string, score: number, max: number, won: boolean, when: string) => ev('game.played', { game: g, item, score, max, won }, when);
const total = (events: ProgressEvent[]) => xpLedger(events).reduce((s, x) => s + x.xp, 0);

describe('mastery XP', () => {
  it('pays for right first answers, never for watching, marking done or repeating an answer', () => {
    expect(total([ev('lesson.completed', { lesson: 'ls', done: true }, at(0)), ev('plan.set', { goal: 'interviews', hours: 5 }, at(0)), ev('concept.marked', { concept: 'sorting', known: true }, at(0))])).toBe(0);
    expect(total([quiz(0, true, at(0)), quiz(0, true, at(1)), quiz(1, false, at(0))])).toBe(XP.quizFirstTry);
  });

  it('pays for recall a day, a week and a month after a card was made, once each', () => {
    const rate = (rating: number, day: number) => ev('review.rated', { card: 'quiz:ls:quiz:0', rating }, at(day));
    const events = [quiz(0, true, at(0)), rate(3, 1), rate(3, 2), rate(1, 8), rate(3, 9), rate(4, 31), rate(4, 40)];
    expect(xpLedger(events).map((x) => x.xp)).toEqual([10, 15, 25, 40]);
  });

  it('pays once for a first solve, each exercise stage, an explanation that covers its rubric, and a cleared mistake', () => {
    const events = [
      ev('problem.submitted', { problem: 'sort-colors', language: 'python', passed: false, tests: 3, failed: 1 }, at(0)),
      ev('problem.submitted', { problem: 'sort-colors', language: 'python', passed: true, tests: 3, failed: 0 }, at(0)),
      ev('problem.submitted', { problem: 'sort-colors', language: 'go', passed: true, tests: 3, failed: 0 }, at(1)),
      ev('exercise.passed', { exercise: 'bubble-ex', stage: 'write' }, at(0)),
      ev('exercise.passed', { exercise: 'bubble-ex', stage: 'write' }, at(1)),
      ev('explanation.scored', { lesson: 'ls', prompt: 'p', covered: 1, partly: 1, total: 4, by: 'self' }, at(0)),
      ev('explanation.scored', { lesson: 'ls', prompt: 'p', covered: 3, partly: 0, total: 4, by: 'model' }, at(0)),
      ev('explanation.scored', { lesson: 'ls', prompt: 'p', covered: 4, partly: 0, total: 4, by: 'model' }, at(1)),
      ev('misconception.picked', { lesson: 'ls', misconception: 'm', from: 'quiz' }, at(0)),
      ev('review.rated', { card: 'misconception:ls:m', rating: 3 }, at(1)),
      ev('review.rated', { card: 'misconception:ls:m', rating: 3 }, at(4)),
    ];
    const why = xpLedger(events).map((x) => `${x.why} ${x.xp}`);
    expect(why).toContain(`A problem solved ${XP.problemSolved}`);
    expect(why).toContain(`An exercise stage passed ${XP.exercise.write}`);
    expect(why).toContain(`An idea explained in your own words ${XP.explanation}`);
    expect(why).toContain(`A common mistake cleared ${XP.mistakeCleared}`);
    expect(why.filter((w) => w.startsWith('A problem solved'))).toHaveLength(1);
    expect(why.filter((w) => w.startsWith('An idea explained'))).toHaveLength(1);
    // The mistake card's recalls also count as recall a day later (and 3 days later is still the 1-day milestone, already paid).
    expect(why.filter((w) => w.startsWith('Remembered'))).toHaveLength(1);
  });

  it('pays less for replaying the same game item on the same day, and a broken challenge once', () => {
    const rounds = [0, 1, 2, 3].map((k) => game('be-the-algorithm', 'bubble-sort', 10, 11, false, at(0, 9 + k)));
    expect(xpLedger(rounds).map((x) => x.xp)).toEqual([20, 10, 5]);
    expect(xpLedger([...rounds, game('be-the-algorithm', 'bubble-sort', 11, 11, true, at(1))]).at(-1)!.xp).toBe(11 * XP.game.perMove + XP.game.flawless);
    expect(xpLedger([game('be-the-algorithm', 'quick-sort', 3, 9, false, at(0, 13))]).map((x) => x.xp)).toEqual([6]);

    expect(total([game('comparison-budget', 'n6', 12, 10, true, at(0))])).toBe(XP.game.budgetWon);
    expect(total([game('comparison-budget', 'n6', 10, 10, true, at(0))])).toBe(XP.game.budgetWon + XP.game.atTheBound);
    expect(total([game('comparison-budget', 'n6', 10, 10, false, at(0))])).toBe(0);

    const broken = [game('break-it', 'hash-flood', 8, 8, true, at(0)), game('break-it', 'hash-flood', 8, 8, true, at(3)), game('break-it', 'greedy-coins', 3, 2, false, at(0))];
    expect(total(broken)).toBe(XP.game.broken);
  });

  it('adds up today’s XP separately', () => {
    const ledger = xpLedger([quiz(0, true, at(0)), quiz(1, true, at(2)), quiz(2, true, at(2))]);
    expect(xpTotals(ledger, new Date(at(2, 20)))).toEqual({ total: 30, today: 20 });
  });
});

describe('levels per concept', () => {
  it('reaches each level from its own kind of evidence', () => {
    const events = [
      quiz(0, true, at(0)),
      game('be-the-algorithm', 'bubble-sort', 9, 9, true, at(0)),
      ev('exercise.passed', { exercise: 'bubble-ex', stage: 'parsons' }, at(0)),
      ev('problem.submitted', { problem: 'sort-colors', language: 'python', passed: true, tests: 3, failed: 0 }, at(0)),
      ev('explanation.scored', { lesson: 'lb', prompt: 'p', covered: 3, partly: 0, total: 4, by: 'self' }, at(0)),
    ];
    const levels = conceptLevels(events, graph, mastery(events, graph));
    expect([...levels.get('sorting')!].sort()).toEqual(['implement', 'predict', 'trace']);
    // A Parsons puzzle alone isn't implementing it; an explanation is analysis even with nothing else.
    expect([...levels.get('bayes')!]).toEqual(['analyze']);
  });

  it('counts a losing round and a wrong answer only as far as they go', () => {
    const events = [quiz(0, false, at(0)), game('be-the-algorithm', 'bubble-sort', 2, 9, false, at(0))];
    expect([...conceptLevels(events, graph, mastery(events, graph)).get('sorting')!]).toEqual(['trace']);
  });
});

describe('badges', () => {
  it('earns each badge from the behaviour it names, once', () => {
    const run = [...Array(9)].map((_, i) => quiz(i, true, at(0)));
    expect(badges([...run, quiz(9, false, at(0)), quiz(10, true, at(0))]).has('sharp-recall')).toBe(false);
    const sharp = badges([...run, quiz(9, true, at(0))]);
    expect(sharp.get('sharp-recall')).toBeDefined();

    const earned = badges([
      quiz(20, true, at(0)),
      ev('review.rated', { card: 'quiz:ls:quiz:20', rating: 3 }, at(29)),
      ev('review.rated', { card: 'quiz:ls:quiz:20', rating: 3 }, at(31)),
      ev('explanation.scored', { lesson: 'ls', prompt: 'p', covered: 4, partly: 0, total: 4, by: 'self' }, at(0)),
      game('be-the-algorithm', 'heap-sort', 12, 12, true, at(0)),
      game('comparison-budget', 'n5', 7, 7, true, at(0)),
      game('break-it', 'greedy-coins', 3, 2, true, at(0)),
      game('break-it', 'quicksort-worst', 45, 45, true, at(0)),
      ev('misconception.picked', { lesson: 'ls', misconception: 'm', from: 'quiz' }, at(0)),
      ev('review.rated', { card: 'misconception:ls:m', rating: 3 }, at(1)),
      ev('review.rated', { card: 'misconception:ls:m', rating: 4 }, at(5)),
    ]);
    expect([...earned.keys()].sort()).toEqual(['at-the-bound', 'counterexample', 'explainer', 'flawless', 'long-memory', 'mistake-cleared', 'worst-case']);
  });

  it('gives nothing for a lost round or a comparison count over the bound', () => {
    expect(badges([game('be-the-algorithm', 'heap-sort', 11, 12, false, at(0)), game('comparison-budget', 'n5', 8, 7, true, at(0))]).size).toBe(0);
  });
});

describe('the daily challenge', () => {
  it('sees what was done today only', () => {
    const events = [ev('review.rated', { card: 'quiz:ls:quiz:0', rating: 3 }, at(0)), game('break-it', 'hash-flood', 3, 8, false, at(1)), quiz(0, true, at(1), 'lb')];
    expect(didToday(events, new Date(at(1, 18)))).toEqual({ reviewed: false, played: true, learned: new Set(['lb']) });
  });

  it('accepts game events from a device, and rejects unknown games', () => {
    const e = game('break-it', 'hash-flood', 8, 8, true, at(0));
    expect(parseEvent(e)).toEqual(e);
    expect(parseEvent({ ...e, data: { ...e.data, game: 'tetris' } })).toBeNull();
  });
});

describe('system-design case studies', () => {
  const designGraph: MasteryGraph = { ...graph, concepts: [...graph.concepts, { id: 'system-design', title: 'System design', track: 'systems', prereqs: [], visualisers: [], planned: false, depth: 0 }], designs: { 'url-shortener': 'system-design' } };
  const check = (passed: boolean, when: string) => ev('design.checked', { study: 'url-shortener', passed, throughput: 9000, p99: 80, errorRate: passed ? 0 : 0.2, cost: 1200 }, when);

  it('pays once for meeting every target, levels the concept up to implement, and earns the architect badge', () => {
    const events = [check(false, at(0)), check(true, at(0)), check(true, at(1))];
    expect(total(events)).toBe(XP.designPassed);
    const levels = conceptLevels(events, designGraph, mastery(events, designGraph));
    expect(levels.get('system-design')?.has('implement')).toBe(true);
    expect(levels.get('system-design')?.has('analyze')).toBe(false);
    expect([...badges(events).keys()]).toEqual(['architect']);
  });

  it('counts only passes as mastery evidence, once a day, and accepts the event from a device', () => {
    const events = [check(false, at(0)), check(false, at(0)), check(true, at(0)), check(true, at(0)), check(true, at(2))];
    expect(mastery(events, designGraph).get('system-design')?.observations).toBe(2);
    expect(parseEvent(events[2])).toEqual(events[2]);
    expect(parseEvent({ ...events[2], data: { ...events[2].data, errorRate: 2 } })).toBeNull();
  });
});

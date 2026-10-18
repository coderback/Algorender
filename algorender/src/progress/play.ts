// Play's on-by-default layer (REVAMP_PLAN.md §7): mastery XP, levels per
// concept and informational badges, all a pure projection of the events like
// mastery and review, so every device agrees and nothing is stored.
//
// XP rewards what makes learning stick, never activity: right first answers,
// recall days and weeks later, first solves, explanations that cover their
// rubric, cleared mistakes, and game rounds with diminishing returns on
// repeats. Watching, marking a lesson done and time spent earn nothing.

import type { ProgressEvent } from './events';
import { EXPLAINED_AT, KNOWN, type ConceptMastery, type MasteryGraph } from './mastery';
import { CLEAR_AFTER } from './misconceptions';

/** XP for each kind of evidence. */
export const XP = {
  quizFirstTry: 10,
  predictionPerRight: 2,
  /** Recalling a card at least this many days after it was made, once per card per milestone. */
  recall: [
    { days: 1, xp: 15 },
    { days: 7, xp: 25 },
    { days: 30, xp: 40 },
  ],
  problemSolved: 30,
  exercise: { parsons: 5, fill: 10, write: 20, bug: 15 },
  explanation: 20,
  mistakeCleared: 25,
  game: {
    perMove: 2,
    flawless: 10,
    budgetWon: 20,
    atTheBound: 20,
    broken: 25,
  },
  /** The share of a game round's XP for the 1st, 2nd, 3rd… round of the same item on one day. */
  repeats: [1, 0.5, 0.25],
} as const;

const DAY_MS = 86_400_000;
const dayOf = (at: string) => at.slice(0, 10);
const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS;

export type XpEntry = { at: string; xp: number; why: string };

/** Every XP award, in event order. Events must be in time order. */
export function xpLedger(events: readonly ProgressEvent[]): XpEntry[] {
  const out: XpEntry[] = [];
  const award = (at: string, xp: number, why: string) => xp > 0 && out.push({ at, xp: Math.round(xp), why });
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  const born = new Map<string, string>();
  const rightInARow = new Map<string, number>();
  const roundsToday = new Map<string, number>();

  for (const e of events) {
    switch (e.kind) {
      case 'quiz.answered': {
        const card = `quiz:${e.data.lesson}:${e.data.quiz}:${e.data.question}`;
        if (!once(card)) break;
        born.set(card, e.at);
        if (e.data.correct) award(e.at, XP.quizFirstTry, 'A quiz question right first time');
        break;
      }
      case 'lesson.scored':
        if (e.data.kind === 'prediction' && once(`prediction:${e.data.lesson}:${e.data.key}`)) {
          award(e.at, XP.predictionPerRight * e.data.correct, 'Predictions in a lesson');
        }
        break;
      case 'problem.submitted':
        if (e.data.passed && once(`problem:${e.data.problem}`)) {
          born.set(`problem:${e.data.problem}`, e.at);
          award(e.at, XP.problemSolved, 'A problem solved');
        }
        break;
      case 'exercise.passed':
        if (once(`exercise:${e.data.exercise}:${e.data.stage}`)) award(e.at, XP.exercise[e.data.stage], 'An exercise stage passed');
        break;
      case 'explanation.scored':
        if (e.data.total > 0 && (e.data.covered + e.data.partly / 2) / e.data.total >= EXPLAINED_AT && once(`explain:${e.data.lesson}:${e.data.prompt}`)) {
          award(e.at, XP.explanation, 'An idea explained in your own words');
        }
        break;
      case 'misconception.picked': {
        const card = `misconception:${e.data.lesson}:${e.data.misconception}`;
        if (!born.has(card)) born.set(card, e.at);
        rightInARow.set(card, 0);
        break;
      }
      case 'review.rated': {
        const card = e.data.card;
        const recalled = e.data.rating >= 2;
        if (card.startsWith('misconception:')) {
          const right = recalled ? (rightInARow.get(card) ?? 0) + 1 : 0;
          rightInARow.set(card, right);
          if (right === CLEAR_AFTER) award(e.at, XP.mistakeCleared, 'A common mistake cleared');
        }
        const from = born.get(card);
        if (!recalled || !from) break;
        const age = daysBetween(from, e.at);
        for (const m of XP.recall) if (age >= m.days && once(`${card}@${m.days}`)) award(e.at, m.xp, `Remembered after ${m.days === 1 ? 'a day' : `${m.days} days`}`);
        break;
      }
      case 'game.played': {
        const { game, item, score, max, won } = e.data;
        const key = `${game}:${item}:${dayOf(e.at)}`;
        const n = roundsToday.get(key) ?? 0;
        roundsToday.set(key, n + 1);
        const share = XP.repeats[n] ?? 0;
        if (game === 'be-the-algorithm') award(e.at, share * (score * XP.game.perMove + (won ? XP.game.flawless : 0)), 'Be the algorithm');
        else if (game === 'comparison-budget' && won) award(e.at, share * (XP.game.budgetWon + (score <= max ? XP.game.atTheBound : 0)), 'Comparison budget');
        else if (game === 'break-it' && won && once(`broken:${item}`)) award(e.at, XP.game.broken, 'Broke it');
        break;
      }
    }
  }
  return out;
}

export function xpTotals(ledger: readonly XpEntry[], now: Date): { total: number; today: number } {
  const today = now.toISOString().slice(0, 10);
  let total = 0;
  let todays = 0;
  for (const x of ledger) {
    total += x.xp;
    if (dayOf(x.at) === today) todays += x.xp;
  }
  return { total, today: todays };
}

// ── Levels per concept ──────────────────────────────────────────────────────

/** The four levels of knowing a concept (§7): see it run, call its moves, build it, explain and analyse it. */
export const LEVELS = [
  { id: 'trace', label: 'Trace', hint: 'Answer a question about it, or play a round of it.' },
  { id: 'predict', label: 'Predict', hint: 'Score 70% on a prediction challenge, win a round of Be the algorithm, or practise it to “practised”.' },
  { id: 'implement', label: 'Implement', hint: 'Write it in an exercise, or solve a problem that uses it.' },
  { id: 'analyze', label: 'Analyse', hint: 'Explain it back covering most of the key points, or master it.' },
] as const;

export type LevelId = (typeof LEVELS)[number]['id'];

/** Which of the four levels each concept has reached (any order: a math concept has nothing to implement). */
export function conceptLevels(events: readonly ProgressEvent[], graph: MasteryGraph, mastery: Map<string, ConceptMastery>): Map<string, Set<LevelId>> {
  const out = new Map<string, Set<LevelId>>();
  const add = (concepts: readonly string[] | string | undefined, level: LevelId) => {
    for (const c of typeof concepts === 'string' ? [concepts] : (concepts ?? [])) {
      const set = out.get(c) ?? new Set<LevelId>();
      set.add(level);
      out.set(c, set);
    }
  };
  const byVisualiser = (slug: string) => graph.concepts.filter((c) => c.visualisers.includes(slug)).map((c) => c.id);
  for (const e of events) {
    switch (e.kind) {
      case 'quiz.answered':
      case 'placement.answered':
        if (e.data.correct) add(graph.lessons[e.data.lesson], 'trace');
        break;
      case 'lesson.scored':
        if (e.data.kind === 'prediction' && e.data.total > 0) {
          add(graph.lessons[e.data.lesson], 'trace');
          if (e.data.correct / e.data.total >= 0.7) add(graph.lessons[e.data.lesson], 'predict');
        }
        break;
      case 'game.played':
        if (e.data.game === 'be-the-algorithm') {
          add(byVisualiser(e.data.item), 'trace');
          if (e.data.won) add(byVisualiser(e.data.item), 'predict');
        }
        break;
      case 'exercise.passed':
        if (e.data.stage === 'write' || e.data.stage === 'bug') add(graph.exercises[e.data.exercise], 'implement');
        break;
      case 'problem.submitted':
        if (e.data.passed) add(graph.problems[e.data.problem], 'implement');
        break;
      case 'explanation.scored':
        if (e.data.total > 0 && (e.data.covered + e.data.partly / 2) / e.data.total >= EXPLAINED_AT) add(graph.lessons[e.data.lesson], 'analyze');
        break;
    }
  }
  for (const m of mastery.values()) {
    if (m.status === 'practised' || m.status === 'mastered') add(m.id, 'predict');
    if (m.status === 'mastered') add(m.id, 'analyze');
    if (KNOWN.has(m.status) && m.observations > 0) add(m.id, 'trace');
  }
  return out;
}

// ── Badges ──────────────────────────────────────────────────────────────────

/** Informational badges for learning behaviours (§7): never required, never lost. */
export const BADGES = [
  { id: 'sharp-recall', title: 'Sharp recall', how: 'Answer 10 lesson questions in a row right first time.' },
  { id: 'long-memory', title: 'Long memory', how: 'Recall a review card 30 days after you first learned it.' },
  { id: 'explainer', title: 'Explainer', how: 'Explain an idea back covering every key point.' },
  { id: 'mistake-cleared', title: 'Unlearned it', how: 'Clear a common mistake in your review.' },
  { id: 'flawless', title: 'Flawless', how: 'Play a round of Be the algorithm without a wrong move.' },
  { id: 'at-the-bound', title: 'At the bound', how: 'Sort in the Comparison budget with no more comparisons than ⌈log₂ n!⌉.' },
  { id: 'counterexample', title: 'Counterexample', how: 'Find an amount where greedy coin change goes wrong.' },
  { id: 'worst-case', title: 'Worst case', how: 'Build quicksort’s worst-case input.' },
] as const;

export type BadgeId = (typeof BADGES)[number]['id'];

/** The badges earned, each with when. Events must be in time order. */
export function badges(events: readonly ProgressEvent[]): Map<BadgeId, string> {
  const out = new Map<BadgeId, string>();
  const earn = (id: BadgeId, at: string) => !out.has(id) && out.set(id, at);
  const firstAnswers = new Set<string>();
  const born = new Map<string, string>();
  const rightInARow = new Map<string, number>();
  let streak = 0;
  for (const e of events) {
    switch (e.kind) {
      case 'quiz.answered': {
        const card = `quiz:${e.data.lesson}:${e.data.quiz}:${e.data.question}`;
        if (firstAnswers.has(card)) break;
        firstAnswers.add(card);
        born.set(card, e.at);
        streak = e.data.correct ? streak + 1 : 0;
        if (streak >= 10) earn('sharp-recall', e.at);
        break;
      }
      case 'problem.submitted':
        if (e.data.passed && !born.has(`problem:${e.data.problem}`)) born.set(`problem:${e.data.problem}`, e.at);
        break;
      case 'misconception.picked': {
        const card = `misconception:${e.data.lesson}:${e.data.misconception}`;
        if (!born.has(card)) born.set(card, e.at);
        rightInARow.set(card, 0);
        break;
      }
      case 'review.rated': {
        const recalled = e.data.rating >= 2;
        if (e.data.card.startsWith('misconception:')) {
          const right = recalled ? (rightInARow.get(e.data.card) ?? 0) + 1 : 0;
          rightInARow.set(e.data.card, right);
          if (right === CLEAR_AFTER) earn('mistake-cleared', e.at);
        }
        const from = born.get(e.data.card);
        if (recalled && from && daysBetween(from, e.at) >= 30) earn('long-memory', e.at);
        break;
      }
      case 'explanation.scored':
        if (e.data.total > 0 && e.data.covered === e.data.total) earn('explainer', e.at);
        break;
      case 'game.played':
        if (!e.data.won) break;
        if (e.data.game === 'be-the-algorithm') earn('flawless', e.at);
        else if (e.data.game === 'comparison-budget' && e.data.score <= e.data.max) earn('at-the-bound', e.at);
        else if (e.data.game === 'break-it' && e.data.item === 'greedy-coins') earn('counterexample', e.at);
        else if (e.data.game === 'break-it' && e.data.item === 'quicksort-worst') earn('worst-case', e.at);
        break;
    }
  }
  return out;
}

/** Whether the learner did something today with each kind of thing the daily challenge asks for. */
export function didToday(events: readonly ProgressEvent[], now: Date): { reviewed: boolean; played: boolean; learned: Set<string> } {
  const today = dayOf(now.toISOString());
  let reviewed = false;
  let played = false;
  const learned = new Set<string>();
  for (const e of events) {
    if (dayOf(e.at) !== today) continue;
    if (e.kind === 'review.rated') reviewed = true;
    else if (e.kind === 'game.played') played = true;
    else if (e.kind === 'quiz.answered' || e.kind === 'lesson.scored' || e.kind === 'explanation.scored') learned.add(e.data.lesson);
  }
  return { reviewed, played, learned };
}

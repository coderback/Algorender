// Mock interviews on Today and in the study plan (REVAMP_PLAN.md 6f-3): pure
// projections of the learner's events, like mastery and the plan. Only the
// rounds the server wrote count (`verified`, as for XP and badges), and only
// coding rounds until design rounds (6f-2) arrive.
//
// - finishedRounds / lastRound: the learner's rounds, and the latest one's
//   result, judged by the same `meetsBar` as the debrief and the projections.
// - roundsBetween: rounds finished in a window (the plan's weekly round).
// - interviewPick: which pattern Today offers a round on: one the learner has
//   solved a problem in, where no round on one of its problems meets the bar
//   yet, the most recently practised first. TODO(redesign): the board has no
//   rule for this; it is the smallest one that follows "practised but not yet
//   met the bar".

import { meetsBar } from '@/interview/rules';
import type { PatternId } from '@/problems/patterns';
import type { EventData, ProgressEvent } from './events';

type Finished = EventData<'interview.finished'>;

export type FinishedRound = {
  at: string;
  item: string;
  hints: number;
  passed: boolean;
  scores: Finished['scores'];
  /** Every dimension at least 3, no level-3 hint, and the last submission passing. */
  meetsBar: boolean;
};

const counts = (e: ProgressEvent): e is Extract<ProgressEvent, { kind: 'interview.finished' }> =>
  e.kind === 'interview.finished' && e.data.verified === true && e.data.format === 'coding';

/** The learner's finished coding rounds, in the order of the events (time order). */
export function finishedRounds(events: readonly ProgressEvent[]): FinishedRound[] {
  return events.filter(counts).map((e) => ({
    at: e.at,
    item: e.data.item,
    hints: e.data.hints,
    passed: e.data.passed,
    scores: e.data.scores,
    meetsBar: meetsBar(e.data.scores, e.data.hints, e.data.passed),
  }));
}

/** The latest finished round, or null. */
export const lastRound = (events: readonly ProgressEvent[]): FinishedRound | null => finishedRounds(events).at(-1) ?? null;

/** How many rounds finished at or after `start` and before `end` (ISO times). */
export const roundsBetween = (events: readonly ProgressEvent[], start: string, end: string) => {
  const from = Date.parse(start);
  const to = Date.parse(end);
  return events.filter((e) => counts(e) && Date.parse(e.at) >= from && Date.parse(e.at) < to).length;
};

export type InterviewPick = {
  pattern: PatternId;
  /** Problems solved in it. */
  solved: number;
};

/**
 * The pattern to offer a round on, or null when there is none (then the round
 * is on any problem). A pattern qualifies once the learner has solved a
 * problem in it, and stops once a round on any of its problems meets the bar;
 * the most recently practised comes first. A problem counts for every pattern
 * it has, as the server's pattern filter does.
 */
export function interviewPick(events: readonly ProgressEvent[], patternsOf: Readonly<Record<string, readonly PatternId[]>>): InterviewPick | null {
  const latest = new Map<PatternId, string>();
  const solved = new Map<PatternId, Set<string>>();
  const met = new Set<PatternId>();
  for (const e of events) {
    if (e.kind === 'problem.submitted' && e.data.passed) {
      for (const p of patternsOf[e.data.problem] ?? []) {
        latest.set(p, e.at);
        solved.set(p, (solved.get(p) ?? new Set()).add(e.data.problem));
      }
    }
  }
  for (const r of finishedRounds(events)) if (r.meetsBar) for (const p of patternsOf[r.item] ?? []) met.add(p);
  const open = [...latest].filter(([p]) => !met.has(p)).sort((a, b) => b[1].localeCompare(a[1]));
  const first = open[0]?.[0];
  return first ? { pattern: first, solved: solved.get(first)!.size } : null;
}

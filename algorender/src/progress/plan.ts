// Study plans (REVAMP_PLAN.md §6.7): a goal and some hours a week become a
// schedule over the concept graph. Like mastery, the plan is a pure function
// of the events, so it re-plans itself: concepts drop out as they become
// known, and the rest are packed into the weeks from now on.
//
// The schedule: the goal's concepts plus everything they build on, minus
// what is already known, in prerequisite order (shallowest first), packed into
// seven-day windows counted from the day the plan was set. Each window keeps
// REVIEW_SHARE of the hours for the daily review queue.
//
// Whether the learner is on track compares the schedule as it was when the
// plan was set with what is known now: concepts scheduled for windows that
// have ended but not yet known are behind.

import type { Goal } from '@/content/goals';
import type { ProgressEvent } from './events';
import { KNOWN, mastery, relatives, type ConceptMastery, type MasteryGraph } from './mastery';

export const REVIEW_SHARE = 0.15;
export const WEEK_MS = 7 * 86_400_000;
export const HOUR_CHOICES = [2, 3, 5, 8, 10, 15] as const;
/** The most hours a week a plan takes (the `plan.set` event's limit). */
export const MAX_HOURS = 40;

export type PlanSettings = { goal: string; hours: number; target?: string; since: string };

/** The plan in force: the latest `plan.set`, unless it cleared the plan. Events must be in time order. */
export function currentPlan(events: readonly ProgressEvent[]): PlanSettings | null {
  let plan: PlanSettings | null = null;
  for (const e of events) {
    if (e.kind !== 'plan.set') continue;
    plan = e.data.goal ? { goal: e.data.goal, hours: e.data.hours, ...(e.data.target && { target: e.data.target }), since: e.at } : null;
  }
  return plan;
}

/** A goal's concepts and everything they build on, leaving out planned ones. */
export function goalConcepts(goal: Goal, graph: MasteryGraph): Set<string> {
  const { ancestors } = relatives(graph);
  const live = new Set(graph.concepts.filter((c) => !c.planned).map((c) => c.id));
  return new Set(goal.concepts.flatMap((id) => [id, ...(ancestors.get(id) ?? [])]).filter((id) => live.has(id)));
}

/**
 * Concepts in prerequisite order: each after everything it builds on. Among
 * those ready, the one serving the earliest goal target comes first (a goal
 * lists its targets in the order to learn them, so each target's
 * prerequisites arrive just before it), then the shallowest, then by title.
 */
export function prerequisiteOrder(ids: ReadonlySet<string>, graph: MasteryGraph, targets: readonly string[] = []): string[] {
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  const { ancestors } = relatives(graph);
  const serves = new Map<string, number>();
  targets.forEach((t, i) => {
    for (const id of [t, ...(ancestors.get(t) ?? [])]) if (!serves.has(id)) serves.set(id, i);
  });
  const waiting = new Map([...ids].map((id) => [id, (byId.get(id)?.prereqs ?? []).filter((p) => ids.has(p)).length]));
  const rank = (id: string) => byId.get(id)!;
  const first = (id: string) => serves.get(id) ?? targets.length;
  const out: string[] = [];
  while (waiting.size) {
    const ready = [...waiting].filter(([, n]) => n === 0).map(([id]) => id);
    ready.sort((a, b) => first(a) - first(b) || rank(a).depth - rank(b).depth || rank(a).title.localeCompare(rank(b).title));
    const next = ready[0];
    if (!next) throw new Error('prerequisite cycle');
    out.push(next);
    waiting.delete(next);
    for (const [id, n] of waiting) if (byId.get(id)?.prereqs.includes(next)) waiting.set(id, n - 1);
  }
  return out;
}

export type PlanItem = { concept: string; minutes: number };
export type PlanWeek = { index: number; start: string; end: string; minutes: number; items: PlanItem[] };

/**
 * Packs items, in order, into windows of `hours` a week (less the review
 * share), starting at window `first` of a plan set at `since`. An item never
 * splits: one too big for an empty window takes the window alone.
 */
export function pack(items: readonly PlanItem[], hours: number, since: Date, first: number): PlanWeek[] {
  const capacity = hours * 60 * (1 - REVIEW_SHARE);
  const weeks: PlanWeek[] = [];
  let week: PlanWeek | null = null;
  for (const item of items) {
    if (!week || (week.items.length > 0 && week.minutes + item.minutes > capacity)) {
      const index = first + weeks.length;
      week = { index, start: new Date(since.getTime() + index * WEEK_MS).toISOString(), end: new Date(since.getTime() + (index + 1) * WEEK_MS).toISOString(), minutes: 0, items: [] };
      weeks.push(week);
    }
    week.items.push(item);
    week.minutes += item.minutes;
  }
  return weeks;
}

export type PlanView = {
  settings: PlanSettings;
  goal: Goal;
  /** Every concept in the goal, in order. */
  concepts: string[];
  /** Concepts in the goal known now. */
  done: string[];
  /** What is left, from the current window on. */
  weeks: PlanWeek[];
  /** The current window (0 is the week the plan was set). */
  week: number;
  /** When the last window ends, or null when nothing is left. */
  finish: string | null;
  /** Concepts the original schedule put in windows that have ended, and how many of those are not yet known. */
  due: number;
  behind: number;
  /** With a target date the finish misses: the fewest hours a week that would make it (null when on time, or when no pace would). */
  hoursNeeded: number | null;
  /** The target date can't be met at any pace up to MAX_HOURS. */
  targetOutOfReach: boolean;
  mastery: Map<string, ConceptMastery>;
};

/** The plan as it stands at `now`, or null without one (or with an unknown goal). Events must be in time order. */
export function planView(
  events: readonly ProgressEvent[],
  graph: MasteryGraph,
  goals: readonly Goal[],
  minutes: Readonly<Record<string, number>>,
  now: Date,
): PlanView | null {
  const settings = currentPlan(events);
  const goal = settings && goals.find((g) => g.id === settings.goal);
  if (!settings || !goal) return null;
  const since = new Date(settings.since);
  const order = prerequisiteOrder(goalConcepts(goal, graph), graph, goal.concepts);
  const itemsLeft = (m: Map<string, ConceptMastery>) =>
    order.filter((id) => !KNOWN.has(m.get(id)?.status ?? 'new')).map((concept) => ({ concept, minutes: minutes[concept] ?? 20 }));

  const m = mastery(events, graph);
  const known = (id: string) => KNOWN.has(m.get(id)?.status ?? 'new');
  const week = Math.max(0, Math.floor((now.getTime() - since.getTime()) / WEEK_MS));
  const weeks = pack(itemsLeft(m), settings.hours, since, week);

  // The schedule as set: everything known at the moment the plan was made drops out, the rest from window 0.
  const before = events.filter((e) => e.at <= settings.since);
  const original = pack(itemsLeft(mastery(before, graph)), settings.hours, since, 0);
  const dueItems = original.filter((w) => w.index < week).flatMap((w) => w.items.map((i) => i.concept));

  let hoursNeeded: number | null = null;
  let targetOutOfReach = false;
  const finish = weeks.at(-1)?.end ?? null;
  if (settings.target && finish) {
    const deadline = new Date(`${settings.target}T23:59:59`).getTime();
    if (new Date(finish).getTime() > deadline) {
      // The fewest whole hours whose schedule (items never split) ends by the target; null when even the most can't.
      const items = weeks.flatMap((w) => w.items);
      for (let h = settings.hours + 1; h <= MAX_HOURS && hoursNeeded === null; h++) {
        const end = pack(items, h, since, week).at(-1)!.end;
        if (new Date(end).getTime() <= deadline) hoursNeeded = h;
      }
      targetOutOfReach = hoursNeeded === null;
    }
  }

  return {
    settings,
    goal,
    concepts: order,
    done: order.filter(known),
    weeks,
    week,
    finish,
    due: dueItems.length,
    behind: dueItems.filter((id) => !known(id)).length,
    hoursNeeded,
    targetOutOfReach,
    mastery: m,
  };
}

/**
 * Minutes a concept is likely to take: its lesson (or a first read), time
 * with up to two of its visualisers, up to two practice problems and one code
 * exercise, and a quarter of an hour to answer again later, which is what
 * makes it known rather than seen.
 */
export function effort(c: { lessonMinutes?: number; visualisers: number; problems: number; exercises: number }): number {
  return (c.lessonMinutes ?? 15) + Math.min(2, c.visualisers) * 10 + Math.min(2, c.problems) * 25 + Math.min(1, c.exercises) * 20 + 15;
}

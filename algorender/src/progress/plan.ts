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
//
// Milestones: a plan that reaches into a stage of the math and ML path
// (src/content/stages.ts) also schedules that stage's milestone, its
// checkpoint and (once written) its project, right after the last of the
// stage's concepts in the plan. The window holding a milestone is filled to
// MILESTONE_FILL of its hours, so there is room to catch up before moving on.
//
// Mock interviews: a goal that aims at interviews (`interviews` on the goal),
// with interviews switched on, keeps ROUND_MINUTES of every window for one
// mock interview, counted in the hours like the review share and listed last
// in the window. It is done once a round finishes inside the window
// (`interview.finished`, src/progress/interviews.ts). Rounds aren't counted as
// behind: a missed week's round doesn't carry over. TODO(redesign): the board
// has no rule for which weeks hold a round; every week does (the design
// proposal suggested only the final weeks).

import type { Goal } from '@/content/goals';
import { DEFAULT_LENGTH } from '@/interview/rules';
import { latestRounds } from './checkpoint';
import type { ProgressEvent } from './events';
import { roundsBetween } from './interviews';
import { KNOWN, mastery, relatives, type ConceptMastery, type MasteryGraph } from './mastery';
import { builtExercises } from './projects';

export const REVIEW_SHARE = 0.15;
/** A window holding a milestone is filled to this share of its hours, leaving the rest to catch up. */
export const MILESTONE_FILL = 0.7;
export const WEEK_MS = 7 * 86_400_000;
export const HOUR_CHOICES = [2, 3, 5, 8, 10, 15] as const;
/** The most hours a week a plan takes (the `plan.set` event's limit). */
export const MAX_HOURS = 40;
/** The time a plan keeps each week for a mock interview: a round of the default length, and reading its debrief. */
export const ROUND_MINUTES = DEFAULT_LENGTH + 15;

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

export type ConceptItem = { concept: string; minutes: number };
/** A stage's milestone: its checkpoint, and its project once there is one. */
export type MilestoneItem = { milestone: number; minutes: number };
/** A week's mock interview: `done` once a round finished inside the window. */
export type InterviewItem = { interview: true; minutes: number; done: boolean };
export type PlanItem = ConceptItem | MilestoneItem | InterviewItem;
export type PlanWeek = { index: number; start: string; end: string; minutes: number; items: PlanItem[] };

export const isMilestone = (item: PlanItem): item is MilestoneItem => 'milestone' in item;
export const isConcept = (item: PlanItem): item is ConceptItem => 'concept' in item;
export const isInterview = (item: PlanItem): item is InterviewItem => 'interview' in item;
/** How much is still to do in a week: its concepts and milestones (known ones have already dropped out), and its round unless done. */
export const leftIn = (week: PlanWeek) => week.items.filter((i) => !isInterview(i) || !i.done).length;

/** A stage's milestone as the server describes it (src/content/checkpoints.ts): what it covers and roughly how long it takes. */
export type PlanMilestone = {
  stage: number;
  title: string;
  /** The stage's concepts: the milestone comes after the last of them in a plan. */
  concepts: readonly string[];
  /** The checkpoint plus the project, if the stage has one. */
  minutes: number;
  /** Whether its checkpoint is open (enough of the stage has lessons). */
  checkpoint: boolean;
  /** The project's parts (exercise slugs), when the stage has one. */
  parts?: readonly string[];
};

/** Whether a milestone is done: its checkpoint (if open) taken, and its project (if any) built. */
export function milestoneDone(m: PlanMilestone, events: readonly ProgressEvent[]): boolean {
  if (m.checkpoint && !latestRounds(events).has(m.stage)) return false;
  const built = builtExercises(events);
  return (m.parts ?? []).every((p) => built.has(p));
}

/**
 * Packs items, in order, into windows of `hours` a week (less the review
 * share), starting at window `first` of a plan set at `since`. An item never
 * splits: one too big for an empty window takes the window alone. A window
 * holding a milestone is filled only to MILESTONE_FILL. `reserve` minutes of
 * every window are kept for something else (the weekly mock interview).
 */
export function pack(items: readonly PlanItem[], hours: number, since: Date, first: number, reserve = 0): PlanWeek[] {
  const capacity = Math.max(0, hours * 60 * (1 - REVIEW_SHARE) - reserve);
  const weeks: PlanWeek[] = [];
  let week: PlanWeek | null = null;
  let cap = capacity;
  for (const item of items) {
    const limit = isMilestone(item) ? Math.min(cap, capacity * MILESTONE_FILL) : cap;
    if (!week || (week.items.length > 0 && week.minutes + item.minutes > limit)) {
      const index = first + weeks.length;
      week = { index, start: new Date(since.getTime() + index * WEEK_MS).toISOString(), end: new Date(since.getTime() + (index + 1) * WEEK_MS).toISOString(), minutes: 0, items: [] };
      weeks.push(week);
      cap = capacity;
    }
    week.items.push(item);
    week.minutes += item.minutes;
    if (isMilestone(item)) cap = capacity * MILESTONE_FILL;
  }
  return weeks;
}

/**
 * Puts each milestone that isn't done right after the last of its stage's
 * concepts still to learn, or first when the plan has none of them left. A
 * milestone joins a plan only when the plan reaches into its stage.
 */
export function withMilestones(left: readonly ConceptItem[], planned: ReadonlySet<string>, milestones: readonly PlanMilestone[], done: (m: PlanMilestone) => boolean): PlanItem[] {
  const out: PlanItem[] = [...left];
  const due = milestones.filter((m) => m.concepts.some((c) => planned.has(c)) && !done(m)).sort((a, b) => a.stage - b.stage);
  let front = 0;
  for (const m of due) {
    const last = out.findLastIndex((i) => isConcept(i) && m.concepts.includes(i.concept));
    out.splice(last < 0 ? front++ : last + 1, 0, { milestone: m.stage, minutes: m.minutes });
  }
  return out;
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
  /** Items (concepts and milestones) the original schedule put in windows that have ended, and how many of those are not yet known (or done). */
  due: number;
  behind: number;
  /** With a target date the finish misses: the fewest hours a week that would make it (null when on time, or when no pace would). */
  hoursNeeded: number | null;
  /** The target date can't be met at any pace up to MAX_HOURS. */
  targetOutOfReach: boolean;
  mastery: Map<string, ConceptMastery>;
  /** The milestones that are in this plan, by stage. */
  milestones: Map<number, PlanMilestone>;
  /** Every window keeps ROUND_MINUTES for a mock interview. */
  rounds: boolean;
};

export type PlanOptions = {
  /** Mock interviews are switched on here, so a goal that aims at interviews keeps a weekly round. */
  interviews?: boolean;
};

/** The plan as it stands at `now`, or null without one (or with an unknown goal). Events must be in time order. */
export function planView(
  events: readonly ProgressEvent[],
  graph: MasteryGraph,
  goals: readonly Goal[],
  minutes: Readonly<Record<string, number>>,
  now: Date,
  milestones: readonly PlanMilestone[] = [],
  options: PlanOptions = {},
): PlanView | null {
  const settings = currentPlan(events);
  const goal = settings && goals.find((g) => g.id === settings.goal);
  if (!settings || !goal) return null;
  const since = new Date(settings.since);
  const rounds = !!options.interviews && !!goal.interviews;
  const reserve = rounds ? ROUND_MINUTES : 0;
  // Each window's round goes last in it, done once a round finished inside the window.
  const withRounds = (packed: PlanWeek[]): PlanWeek[] =>
    rounds
      ? packed.map((w) => ({
          ...w,
          minutes: w.minutes + ROUND_MINUTES,
          items: [...w.items, { interview: true, minutes: ROUND_MINUTES, done: roundsBetween(events, w.start, w.end) > 0 }],
        }))
      : packed;
  const order = prerequisiteOrder(goalConcepts(goal, graph), graph, goal.concepts);
  const planned = new Set(order);
  const itemsLeft = (m: Map<string, ConceptMastery>, upTo: readonly ProgressEvent[]) =>
    withMilestones(
      order.filter((id) => !KNOWN.has(m.get(id)?.status ?? 'new')).map((concept) => ({ concept, minutes: minutes[concept] ?? 20 })),
      planned,
      milestones,
      (ms) => milestoneDone(ms, upTo),
    );

  const m = mastery(events, graph);
  const known = (id: string) => KNOWN.has(m.get(id)?.status ?? 'new');
  const week = Math.max(0, Math.floor((now.getTime() - since.getTime()) / WEEK_MS));
  const left = itemsLeft(m, events);
  const weeks = withRounds(pack(left, settings.hours, since, week, reserve));

  // The schedule as set: everything known at the moment the plan was made drops out, the rest from window 0.
  const before = events.filter((e) => e.at <= settings.since);
  const original = pack(itemsLeft(mastery(before, graph), before), settings.hours, since, 0, reserve);
  const dueItems = original.filter((w) => w.index < week).flatMap((w) => w.items);
  const byStage = new Map(milestones.map((ms) => [ms.stage, ms]));
  const itemDone = (i: PlanItem) => (isConcept(i) ? known(i.concept) : isInterview(i) ? i.done : milestoneDone(byStage.get(i.milestone)!, events));

  let hoursNeeded: number | null = null;
  let targetOutOfReach = false;
  const finish = weeks.at(-1)?.end ?? null;
  if (settings.target && finish) {
    const deadline = new Date(`${settings.target}T23:59:59`).getTime();
    if (new Date(finish).getTime() > deadline) {
      // The fewest whole hours whose schedule (items never split) ends by the target; null when even the most can't.
      for (let h = settings.hours + 1; h <= MAX_HOURS && hoursNeeded === null; h++) {
        const end = pack(left, h, since, week, reserve).at(-1)!.end;
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
    behind: dueItems.filter((i) => !itemDone(i)).length,
    hoursNeeded,
    targetOutOfReach,
    mastery: m,
    milestones: new Map(milestones.filter((ms) => ms.concepts.some((c) => planned.has(c))).map((ms) => [ms.stage, ms])),
    rounds,
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

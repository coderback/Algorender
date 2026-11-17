// Checkpoints: a short mixed round of questions at the end of a stage of the
// math and ML path (src/content/stages.ts, /learn/checkpoint/<stage>).
//
// A round is mostly the stage's common mistakes' probes, which lessons never
// show, so they test whether the idea transfers; probes for mistakes the
// learner hasn't made come first (the ones they have made are already being
// cleared in the review). Then a few quiz questions from earlier stages, for
// the delayed, varied retrieval that mastery needs. When the stage has too few
// probes, its own quiz questions fill the round.
//
// Checkpoints advise; they never block anything. Each answer is a
// `checkpoint.answered` event (mastery counts it like a quiz answer), a round
// is taken once its last question is answered, and a round can be taken again
// a week after the last one.

import { createRng } from '@/engine/random';
import type { ProgressEvent } from './events';

/** Questions in a round, at most. */
export const ROUND_SIZE = 12;
/** Of those, quiz questions from earlier stages, at most. */
export const EARLIER = 3;
/** The fewest questions about the stage itself a checkpoint needs before it opens. */
export const CHECKPOINT_MIN = 6;
/** How long after a round the checkpoint can be taken again. */
export const RETAKE_DAYS = 7;
/** Rough minutes a question takes, for the study plan and the intro. */
export const MINUTES_PER_QUESTION = 1.5;

const DAY_MS = 86_400_000;

/** A question a checkpoint can ask: a mistake's probe or a lesson quiz question, about one concept. */
export type CheckpointQuestion = {
  /** `probe:<lesson>:<misconception>:<n>` or `quiz:<lesson>:<quiz>:<n>`, as the event records it. */
  item: string;
  source: 'probe' | 'quiz';
  concept: string;
  lesson: string;
  q: string;
  choices: string[];
  answer: number;
  why: string;
  /** Wrong choices that come from a common mistake: choice index → the mistake's id and title. */
  traps?: Record<number, { id: string; title: string }>;
};

/** What the page gets from the server for one stage. */
export type CheckpointPools = {
  stage: number;
  /** Probes for the stage's mistakes. */
  probes: CheckpointQuestion[];
  /** The stage's own quiz questions, to fill a round short of probes. */
  quiz: CheckpointQuestion[];
  /** Quiz questions from earlier stages. */
  earlier: CheckpointQuestion[];
};

/** Whether a stage has enough of its own questions for a checkpoint. */
export const canOpen = (pools: Pick<CheckpointPools, 'probes' | 'quiz'>) => pools.probes.length + pools.quiz.length >= CHECKPOINT_MIN;

/** The misconception card a probe or trap belongs to, as misconceptions.ts names it. */
const mistakeKey = (lesson: string, id: string) => `misconception:${lesson}:${id}`;
const probeMistake = (q: CheckpointQuestion) => {
  const [, lesson, id] = q.item.split(':');
  return mistakeKey(lesson, id);
};

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Takes from groups in turn (one from each, then a second from each…), so no group crowds out the rest. */
function roundRobin<T>(groups: readonly T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i++) for (const g of groups) if (i < g.length) out.push(g[i]);
  return out;
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const x of xs) map.set(key(x), [...(map.get(key(x)) ?? []), x]);
  return [...map.values()];
}

/** Orders questions so two in a row are about different concepts wherever that is possible. */
export function interleave(questions: readonly CheckpointQuestion[]): CheckpointQuestion[] {
  const left = groupBy(questions, (q) => q.concept);
  const out: CheckpointQuestion[] = [];
  while (left.some((g) => g.length)) {
    const previous = out.at(-1)?.concept;
    // The concept with the most left that isn't the last one asked (any, if that is all there is).
    const pick = [...left].filter((g) => g.length).sort((a, b) => Number(a[0].concept === previous) - Number(b[0].concept === previous) || b.length - a.length)[0];
    out.push(pick.shift()!);
  }
  return out;
}

/**
 * One round: probes first (for mistakes not yet made, spread across mistakes
 * and concepts), the stage's quiz questions if probes run short, and up to
 * EARLIER questions from earlier stages spread through it. Deterministic for
 * a seed.
 */
export function buildRound(pools: CheckpointPools, made: ReadonlySet<string>, seed: number, size = ROUND_SIZE): CheckpointQuestion[] {
  const rng = createRng(seed);
  const earlierCount = Math.min(EARLIER, pools.earlier.length, Math.max(0, size - CHECKPOINT_MIN));
  const own = size - earlierCount;

  const probes = shuffle(pools.probes, rng);
  const fresh = roundRobin(groupBy(probes.filter((q) => !made.has(probeMistake(q))), probeMistake));
  const again = roundRobin(groupBy(probes.filter((q) => made.has(probeMistake(q))), probeMistake));
  const quiz = roundRobin(groupBy(shuffle(pools.quiz, rng), (q) => q.concept));
  const main = interleave([...fresh, ...again, ...quiz].slice(0, own));

  const earlier = roundRobin(groupBy(shuffle(pools.earlier, rng), (q) => q.concept)).slice(0, earlierCount);
  // Spread the earlier questions evenly through the round, never first.
  const out = [...main];
  const total = main.length + earlier.length;
  earlier.forEach((q, i) => out.splice(Math.max(1, Math.round(((i + 1) * total) / (earlier.length + 1))), 0, q));
  return out;
}

export type CheckpointRound = { stage: number; at: string; right: number; of: number; byConcept: Record<string, { right: number; of: number }> };

/** Every round taken (its last question answered), oldest first. Events must be in time order. */
export function roundsTaken(events: readonly ProgressEvent[]): CheckpointRound[] {
  const out: CheckpointRound[] = [];
  const open = new Map<number, Extract<ProgressEvent, { kind: 'checkpoint.answered' }>[]>();
  for (const e of events) {
    if (e.kind !== 'checkpoint.answered') continue;
    // A first question starts a fresh round; a round left halfway is dropped.
    const answers = e.data.index === 0 ? [e] : [...(open.get(e.data.stage) ?? []), e];
    open.set(e.data.stage, answers);
    if (e.data.index !== e.data.of - 1) continue;
    const byConcept: CheckpointRound['byConcept'] = {};
    for (const a of answers) {
      const c = (byConcept[a.data.concept] ??= { right: 0, of: 0 });
      c.of++;
      if (a.data.correct) c.right++;
    }
    out.push({ stage: e.data.stage, at: e.at, right: answers.filter((a) => a.data.correct).length, of: answers.length, byConcept });
    open.delete(e.data.stage);
  }
  return out;
}

/** The stages with a round taken, each with its latest round. */
export function latestRounds(events: readonly ProgressEvent[]): Map<number, CheckpointRound> {
  return new Map(roundsTaken(events).map((r) => [r.stage, r]));
}

/** When a stage's checkpoint can be taken again: now, or a week after the last round (null: never taken). */
export function retakeFrom(last: CheckpointRound | undefined): Date | null {
  return last ? new Date(Date.parse(last.at) + RETAKE_DAYS * DAY_MS) : null;
}

export const canTake = (last: CheckpointRound | undefined, now: Date) => !last || now.getTime() >= retakeFrom(last)!.getTime();

/** The mistakes the learner has picked, as misconception cards (to put probes for new mistakes first). */
export function mistakesMade(events: readonly ProgressEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.kind === 'misconception.picked') out.add(mistakeKey(e.data.lesson, e.data.misconception));
  return out;
}

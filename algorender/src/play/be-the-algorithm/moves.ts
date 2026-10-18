// "Be the algorithm" (REVAMP_PLAN.md §7): the learner makes each swap the
// algorithm would make next. The moves come from the recorded trace itself:
// every change to the main lane's order between two frames is one swap of two
// items, so the game never needs its own copy of the algorithm.

import type { AnyAlgorithm } from '@/engine/module';
import { recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { MAIN } from '@/viz/array/tracer';
import type { ArrayState, ItemId } from '@/viz/array/types';

/** The visualisers whose main array changes only by swaps, so the game can be played on them. */
export const SUPPORTED = ['bubble-sort', 'selection-sort', 'quick-sort', 'heap-sort'] as const;
export type SupportedSlug = (typeof SUPPORTED)[number];

export const isSupported = (slug: string): slug is SupportedSlug => (SUPPORTED as readonly string[]).includes(slug);

/** One swap: the two items exchanged, and the first frame that shows them exchanged. */
export type Move = { after: number; a: ItemId; b: ItemId };

/** The main lane's order in a frame. */
export function order(state: ArrayState): readonly (ItemId | null)[] {
  const lane = state.lanes.find((l) => l.id === MAIN);
  if (!lane) throw new Error('The state has no main lane');
  return lane.slots;
}

/**
 * Every swap in a trace, in order. Throws if the main lane ever changes by
 * anything but one swap of two items, since such a trace can't be played.
 */
export function movesOf(frames: readonly Frame<ArrayState>[]): Move[] {
  const moves: Move[] = [];
  for (let k = 1; k < frames.length; k++) {
    const before = order(frames[k - 1].state);
    const after = order(frames[k].state);
    if (before.length !== after.length) throw new Error(`Frame ${k}: the array changed length`);
    const changed: number[] = [];
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) changed.push(i);
    if (changed.length === 0) continue;
    const [p, q] = changed;
    if (changed.length !== 2 || before[p] !== after[q] || before[q] !== after[p] || before[p] == null || before[q] == null) {
      throw new Error(`Frame ${k}: the array changed by more than one swap`);
    }
    moves.push({ after: k, a: before[p]!, b: before[q]! });
  }
  return moves;
}

/** The values in order, after swapping the items at positions i and j (no swap when either is null). */
export function valuesAfter(state: ArrayState, swap: readonly [ItemId, ItemId] | null): number[] {
  const slots = [...order(state)];
  if (swap) {
    const i = slots.indexOf(swap[0]);
    const j = slots.indexOf(swap[1]);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots.map((id) => (id == null ? NaN : state.values[id]));
}

/**
 * Whether the learner's swap is the algorithm's next move: it must leave the
 * values in the same order the algorithm's swap does. Swapping a different one
 * of two equal values counts, since nobody could tell them apart.
 */
export function sameSwap(state: ArrayState, mine: readonly [ItemId, ItemId], move: Move): boolean {
  if (mine[0] === mine[1]) return false;
  const a = valuesAfter(state, mine);
  const b = valuesAfter(state, [move.a, move.b]);
  return a.every((v, i) => v === b[i]);
}

export type Round = { input: number[]; frames: Frame<ArrayState>[]; moves: Move[] };

/** A round: the module's random input of this size and seed, its trace and its moves. */
export function makeRound(module: AnyAlgorithm, seed: number, size: number): Round {
  const example = module.input.examples.find((e) => e.id === 'random') ?? module.input.examples[0];
  const input = example.make({ seed, size }) as number[];
  const frames = recordTrace(module.run(input) as Generator<Frame<ArrayState>>).frames;
  return { input, frames, moves: movesOf(frames) };
}

/** Which frame the learner is looking at before making move `turn` (0-based; `moves.length` is "no more swaps"). */
export const frameBefore = (round: Round, turn: number) => (turn === 0 ? 0 : round.moves[turn - 1].after);

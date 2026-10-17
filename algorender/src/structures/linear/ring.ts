import { createRng } from '@/engine/random';
import { LinearTracer, MAIN, slotsSnapshot, type Item } from '@/viz/linear/tracer';
import type { SlotLayout, SlotsState } from '@/viz/linear/types';
import { numberChoices } from './shared';

/**
 * A circular buffer: `count` elements stored from slot `head` onwards, wrapping
 * from the last slot back to slot 0. The next free slot at the back is
 * tail = (head + count) mod capacity.
 */
export type RingModel = { slots: readonly (Item | null)[]; head: number; count: number; nextId: number };

export const RING_CAPACITY = 8;
export const RING_STATS = ['touched', 'wraps'];

export const tailOf = (m: RingModel) => (m.head + m.count) % RING_CAPACITY;
export const wrap = (i: number) => ((i % RING_CAPACITY) + RING_CAPACITY) % RING_CAPACITY;

/** Values from front to back. */
export function ringValues(m: RingModel): number[] {
  return Array.from({ length: m.count }, (_, k) => m.slots[(m.head + k) % RING_CAPACITY]!.value);
}

export function makeRing(values: readonly number[], head = 0): RingModel {
  const slots: (Item | null)[] = Array(RING_CAPACITY).fill(null);
  values.forEach((value, k) => {
    slots[(head + k) % RING_CAPACITY] = { id: `n${k}`, value };
  });
  return { slots, head, count: values.length, nextId: values.length };
}

export function randomRing(seed: number): RingModel {
  const rng = createRng(seed);
  const n = 2 + Math.floor(rng() * 4);
  return makeRing(
    Array.from({ length: n }, () => Math.floor(rng() * 100)),
    Math.floor(rng() * RING_CAPACITY),
  );
}

export const ringSummary = (count: number, head: number) =>
  `circular buffer · ${count} of ${RING_CAPACITY} slots used · head ${head} · tail ${(head + count) % RING_CAPACITY}`;

export const ringLabel = (what: string) => `${what} · ring of ${RING_CAPACITY} slots`;

export function ringTracer(layout: SlotLayout, label: string, m: RingModel, holders: readonly { id: string; label: string }[]) {
  const t = new LinearTracer(layout, { rows: [{ id: MAIN, label, slots: m.slots }], holders, stats: RING_STATS, ring: true });
  t.setSummary(ringSummary(m.count, m.head));
  return t;
}

export function ringSnapshot(layout: SlotLayout, label: string, m: RingModel, holders: readonly { id: string; label: string }[]): SlotsState {
  return slotsSnapshot(layout, [{ id: MAIN, label, slots: m.slots }], {
    holders,
    ring: true,
    summary: ringSummary(m.count, m.head),
    pointers: { head: m.head, tail: tailOf(m) },
  });
}

/** "Where does this index go?" for moving an index one step forward or back around the ring. */
export function indexChoices(from: number, step: 1 | -1) {
  const correct = wrap(from + step);
  return numberChoices(correct, [from + step, from - step, 0, RING_CAPACITY - 1], { allowNegative: true });
}

/** Narration for an index stepping around the ring, explaining a wrap when it happens. */
export function stepNote(name: string, from: number, step: 1 | -1): string {
  const raw = from + step;
  const to = wrap(raw);
  if (raw === to) return `${name} moves ${step > 0 ? 'forward' : 'back'} to ${to}.`;
  return step > 0
    ? `${name} + 1 = ${raw} is past the last slot, so it wraps around to 0: the slots form a ring, and the front slots are reused once their values have left.`
    : `${name} − 1 = −1 is before the first slot, so it wraps around to ${to}: the buffer grows leftwards past slot 0 into the far end.`;
}

export const isEmptyRing = (what: string) => (m: RingModel) => (m.count === 0 ? `The ${what} is empty` : null);
export const isFullRing = (what: string) => (m: RingModel) =>
  m.count >= RING_CAPACITY ? `The ${what} is full: all ${RING_CAPACITY} slots are in use` : null;

/** Replaces one slot, returning a new slots array. */
export const withSlot = (slots: readonly (Item | null)[], index: number, item: Item | null) =>
  slots.map((s, i) => (i === index ? item : s));

import type { MemoryState } from './types';

/**
 * Objects in the order they first appeared, kept across steps so boxes hold
 * their places and keep their spoken names ("list 2") while a run plays, even
 * when an object earlier in the heap is freed. `numbered` leaves out
 * functions, which are named by their own names.
 */
export type SeenOrder = { all: readonly string[]; numbered: readonly string[] };

export const NO_ORDER: SeenOrder = { all: [], numbered: [] };

/** `seen` plus the objects in `heap` it hasn't met, in heap order; `seen` itself when there are none. */
export function extendOrder(seen: SeenOrder, heap: MemoryState['heap']): SeenOrder {
  const known = new Set(seen.all);
  const added = heap.map((h) => h.object).filter((o) => !known.has(o.id));
  if (added.length === 0) return seen;
  return {
    all: [...seen.all, ...added.map((o) => o.id)],
    numbered: [...seen.numbered, ...added.filter((o) => o.kind !== 'function').map((o) => o.id)],
  };
}

/** The heap sorted by first appearance (objects `seen` hasn't met keep their heap order, at the end). */
export function orderHeap(heap: MemoryState['heap'], seen: SeenOrder): MemoryState['heap'] {
  const rank = new Map(seen.all.map((id, i) => [id, i]));
  const last = Number.MAX_SAFE_INTEGER;
  return [...heap].sort((a, b) => (rank.get(a.object.id) ?? last) - (rank.get(b.object.id) ?? last));
}

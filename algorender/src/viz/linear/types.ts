import type { MarkKey } from '@/viz/marks';

/** Stable identity of an element. Elements are keyed by id, never by position, so they can move. */
export type ItemId = string;

/** What an element is doing in this frame; see the shared vocabulary in src/viz/marks.ts. */
export type Mark = MarkKey;

export type SlotLayout = 'array' | 'stack' | 'queue' | 'deque';

/** A block of memory cells. Elements move between slots; null is an empty (spare) slot. */
export type SlotRow = {
  id: string;
  label: string;
  slots: readonly (ItemId | null)[];
  /** Faded copies left behind in empty slots, e.g. the old block while an array grows. */
  stale: readonly (number | null)[] | null;
};

/** A labelled index into a row, e.g. "head", "tail", "top" or "i". */
export type SlotPointer = { label: string; row: string; index: number };

/** A spot outside the structure where a value waits to go in, or lands when it comes out. */
export type Holder = { id: string; label: string; item: ItemId | null };

/** Array-backed layouts: a dynamic array, a stack, and ring-buffer queues and deques. */
export type SlotsState = {
  layout: SlotLayout;
  values: Readonly<Record<ItemId, number>>;
  rows: readonly SlotRow[];
  pointers: readonly SlotPointer[];
  marks: Readonly<Record<ItemId, Mark>>;
  holders: readonly Holder[];
  /** Ring buffer: the slot after the last one is slot 0. */
  ring: boolean;
  /** One-line summary above the structure, e.g. "length 5 · capacity 8". */
  summary: string;
};

export type ListNode = { id: ItemId; value: number; next: ItemId | null };

/** A singly linked list: nodes, their next-pointers, and the named references into them. */
export type ListState = {
  layout: 'list';
  nodes: Readonly<Record<ItemId, ListNode>>;
  /** Nodes in the row, left to right. null is an empty column (a node just lifted out). */
  order: readonly (ItemId | null)[];
  /** Nodes drawn below the row: not linked in yet, or just unlinked. `at` is a column and may be fractional. */
  detached: readonly { id: ItemId; at: number }[];
  /** Named references (head, tail, cur, prev, new). A null target means the reference is null. */
  pointers: readonly { label: string; target: ItemId | null }[];
  marks: Readonly<Record<ItemId, Mark>>;
  /** Next-pointers to emphasise (e.g. just rewired), keyed by the node that owns them. */
  linkMarks: Readonly<Record<ItemId, Mark>>;
  summary: string;
};

export type LinearState = SlotsState | ListState;

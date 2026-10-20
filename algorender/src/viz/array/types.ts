import type { MarkKey } from '@/viz/marks';

/** Stable identity of an array element. Elements are keyed by id, never by index, so they can move. */
export type ItemId = string;

/** What an element is doing in this frame; see the shared vocabulary in src/viz/marks.ts. */
export type Mark = MarkKey;

/** A row of slots. Items move between slots and between lanes; null is an empty slot. */
export type Lane = {
  id: string;
  label: string;
  slots: readonly (ItemId | null)[];
};

export type Pointer = { lane: string; index: number; label: string };

/** A highlighted span of slots, e.g. the unsorted region or a merge half. */
export type Range = { lane: string; from: number; to: number; tone: RangeTone; label?: string };
export type RangeTone = 'active' | 'left' | 'right' | 'done';

/** A row of plain numbers, e.g. counting sort's count array. */
export type Counter = {
  id: string;
  label: string;
  values: readonly number[];
  indexLabels: readonly string[];
  highlight: number | null;
};

/** A short live line under the array: "2 + 11 = 13 > 12 → move R". A mark fills it. */
export type Readout = { id: string; text: string; mark?: Mark };

/** A list beside the array of what has happened so far, e.g. a search's probes: "A[7] = 45", "< 66". */
export type LogEntry = { id: string; text: string; note?: string; mark?: Mark };

export type ArrayState = {
  values: Readonly<Record<ItemId, number>>;
  lanes: readonly Lane[];
  marks: Readonly<Record<ItemId, Mark>>;
  pointers: readonly Pointer[];
  ranges: readonly Range[];
  counters: readonly Counter[];
  /** Radix sort: the place value (1, 10, 100…) whose digit labels should emphasise. */
  digitPlace: number | null;
  /** 'cells' when position matters more than size (searches, patterns): values in square cells, not bars (V1). */
  look?: 'cells';
  readouts?: readonly Readout[];
  log?: { title: string; entries: readonly LogEntry[] };
};

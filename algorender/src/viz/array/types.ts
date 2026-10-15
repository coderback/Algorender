/** Stable identity of an array element. Elements are keyed by id, never by index, so they can move. */
export type ItemId = string;

/** What an element is doing in this frame. Each mark has one colour and one glyph across the app. */
export type Mark = 'compare' | 'swap' | 'write' | 'pivot' | 'min' | 'key' | 'sorted';

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

export type ArrayState = {
  values: Readonly<Record<ItemId, number>>;
  lanes: readonly Lane[];
  marks: Readonly<Record<ItemId, Mark>>;
  pointers: readonly Pointer[];
  ranges: readonly Range[];
  counters: readonly Counter[];
  /** Radix sort: the place value (1, 10, 100…) whose digit labels should emphasise. */
  digitPlace: number | null;
};

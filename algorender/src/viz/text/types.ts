import type { RangeTone } from '@/viz/array/types';
import type { MarkKey } from '@/viz/marks';

/** Stable identity of a cell. Cells are keyed by id, never by column, so a sliding row animates. */
export type CellId = string;

export type TextCell = {
  id: CellId;
  /** A character, a number, or '' for a table entry not computed yet. */
  text: string;
  /** Drawn quietly, e.g. Manacher's '#' separators. */
  faint?: boolean;
};

/**
 * A row of cells on the shared column grid. `chars` rows hold strings (the
 * text, a pattern sliding under it); `numbers` rows hold tables (LPS, Z, P).
 */
export type TextRow = {
  id: string;
  label: string;
  kind: 'chars' | 'numbers';
  cells: readonly TextCell[];
  /** Column of cells[0]. A pattern's offset is its current shift under the text. */
  offset: number;
  /** Reserve a line for pointer labels (i, j, k…) under the row. */
  pointers: boolean;
  /** Reserve a line for range brackets and labels under the row. */
  rangeLabels: boolean;
};

/** `index` is a cell index within `row`, not a column. */
export type TextPointer = { row: string; index: number; label: string };

/** A span of cells `from`–`to` (inclusive, cell indices) of one row, e.g. a Z-box. */
export type TextRange = { row: string; from: number; to: number; tone: RangeTone; label?: string };

/** A labelled value shown above the rows, e.g. "window hash 37". */
export type Readout = { id: string; label: string; value: string; mark?: MarkKey };

export type TextState = {
  /** Columns of the grid, fixed for a phase so rows don't rescale as a pattern slides. */
  columns: number;
  rows: readonly TextRow[];
  marks: Readonly<Record<CellId, MarkKey>>;
  pointers: readonly TextPointer[];
  ranges: readonly TextRange[];
  readouts: readonly Readout[];
  /** What the algorithm has found so far: match positions, the longest palindrome… */
  results: { label: string; items: readonly string[]; empty: string };
};

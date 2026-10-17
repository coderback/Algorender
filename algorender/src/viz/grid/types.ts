import type { MarkKey } from '@/viz/marks';

// State for the grid view: DP tables, boards (N-Queens, Sudoku, grid paths) and
// timelines (activity selection, intervals), plus small side parts (a call
// stack, the chosen items, a heap, a capacity meter). Everything is keyed by
// stable ids so rows can reorder or appear and pieces can slide without being
// re-created.

/** Stable identity of a table row. Rows are keyed by id, never by position, so they can reorder. */
export type RowId = string;

export type Header = { label: string; sub?: string };
export type Row = Header & { id: RowId };

/** A cell by row id and column index. */
export type CellAt = { row: RowId; col: number };

/**
 * How a cell's content reads, independent of marks: `given` is fixed input
 * (a Sudoku clue), `plain` is filled but untinted (a digit the solver placed),
 * `shade` is a neutral tint (a square under attack), `block` is a solid wall
 * that nothing may enter (an obstacle on a grid of paths).
 */
export type CellStyle = 'given' | 'plain' | 'shade' | 'block';

/**
 * `table`: square cells holding values (DP tables). `board`: a game board,
 * optionally checkered or split into boxes. `timeline`: rows of bars over unit
 * columns, with tick labels on the column boundaries.
 */
export type Look = 'table' | 'board' | 'timeline';

/** A dependency or attack drawn from one cell to another; `bend` curves it (in cell units). */
export type Arrow = { id: string; from: CellAt; to: CellAt; mark: MarkKey; bend: number };

/** A glyph that sits on a cell and slides between cells, e.g. a queen. */
export type Piece = { id: string; at: CellAt; glyph: string; label: string; mark: MarkKey | null };

/** A span [from, to) on a timeline row, in column units. */
export type Bar = { id: string; row: RowId; from: number; to: number; mark: MarkKey | null };

/** A vertical line across a timeline at a column boundary, e.g. "free from t = 4". */
export type Guide = { at: number; label: string; mark: MarkKey };

export type TablePart = {
  kind: 'table';
  id: string;
  label: string;
  look: Look;
  corner: string;
  rows: readonly Row[];
  cols: readonly Header[];
  /** Cell text by row id; '' is an empty (not yet filled) cell. */
  cells: Readonly<Record<RowId, readonly string[]>>;
  /** By cell key `${row}:${col}`. */
  styles: Readonly<Record<string, CellStyle>>;
  marks: Readonly<Record<string, MarkKey>>;
  /** Pale wash over a region, e.g. the row, column and box a Sudoku digit must not clash with. */
  tints: Readonly<Record<string, MarkKey>>;
  rowMarks: Readonly<Record<RowId, MarkKey>>;
  colMarks: Readonly<Record<number, MarkKey>>;
  arrows: readonly Arrow[];
  pieces: readonly Piece[];
  bars: readonly Bar[];
  guides: readonly Guide[];
  /** Draw a heavy line every `box` cells (Sudoku boxes). */
  box: number | null;
  checkered: boolean;
  /**
   * Rows drawn as a small bar chart: each cell's number fills a bar from the
   * bottom, up to this maximum (e.g. the input values of LIS or House Robber).
   */
  scales?: Readonly<Record<RowId, number>>;
  /** Tables in the same group share one row-header width, so timelines over the same axis line up. */
  group?: string;
  /** Shown while the table has no rows (rows can be added later, e.g. rooms as they open). */
  empty?: string;
};

export type ListItem = { id: string; text: string; mark: MarkKey | null };

/** A row of chips, e.g. the call stack or the letters of the LCS. */
export type ListPart = { kind: 'list'; id: string; label: string; empty: string; items: readonly ListItem[] };

export type Segment = { id: string; label: string; amount: number; mark: MarkKey | null };

/** A capacity bar filled by segments, e.g. the knapsack. */
export type MeterPart = { kind: 'meter'; id: string; label: string; total: number; unit: string; segments: readonly Segment[] };

export type GridPart = TablePart | ListPart | MeterPart;

/** Parts render top to bottom in order. */
export type GridState = { parts: readonly GridPart[] };

export const cellKey = (row: RowId, col: number) => `${row}:${col}`;

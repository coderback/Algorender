// The contract between the learner's code and the app.
//
// A runtime (Python in Pyodide, or JS/TS) runs the learner's function against
// "visual collections" and reports what it did as a list of RunEvents, in
// order. The app turns those events into the same Trace the built-in
// visualisers play (see trace.ts), so the learner's code drives the same views.
//
// Both runtimes must produce identical events for equivalent programs; the
// shared cases in contract.ts hold them to that.
//
// Visual collections come from two places: the entry function's arguments
// (Arg kinds 'array' and 'grid'), and two helpers both runtimes put in the
// learner's scope (ordinary globals, so the learner may shadow them):
//   table(rows, cols, fill=0)        a visual grid: a list of lists (Python) or
//                                    an array of arrays (JS/TS), fixed in size;
//                                    fill None/null starts every cell blank.
//   array(values_or_length, fill=0)  an extra visual array: a copy of the
//                                    values, or that many cells of `fill`.
// A collection made by a helper is named after the variable the call is
// assigned to directly (`dp = table(…)`, `const dp = table(…)`), otherwise
// table1, table2… / array1, array2…. Ids are unique within a run but names
// need not be (`row = array(n)` in a loop), so a repeat gets an id like row2.

import type { VarValue } from '@/engine/types';

export type Language = 'python' | 'javascript' | 'typescript';

export const LANGUAGES: Record<Language, { label: string; extension: string }> = {
  python: { label: 'Python', extension: 'py' },
  javascript: { label: 'JavaScript', extension: 'js' },
  typescript: { label: 'TypeScript', extension: 'ts' },
};

/** An argument passed to the learner's entry function. */
export type Arg =
  /** A visual array: the learner sees a list/array; reads, writes and comparisons are tracked. */
  | { kind: 'array'; name: string; values: number[] }
  /** A visual grid: the learner sees a list of lists / array of arrays, fixed in size. Rectangular. */
  | { kind: 'grid'; name: string; values: number[][] }
  /** A plain JSON value (a number, a target, a flag). Not tracked. */
  | { kind: 'value'; name: string; value: Json };

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Limits = {
  /** Visual events (compare, write, …) before the run is stopped. */
  maxEvents: number;
  /** Executed lines before the run is stopped, so an endless loop ends with a message. */
  maxSteps: number;
  /** Wall-clock budget, enforced by the main thread terminating the worker. */
  timeoutMs: number;
};

export const DEFAULT_LIMITS: Limits = { maxEvents: 5_000, maxSteps: 200_000, timeoutMs: 8_000 };

/** The most cells one table() or array() call may make: more can't be shown, and is almost always a bug. */
export const MAX_CELLS = 10_000;

/**
 * The most cells a cellWrite lists in `from` (the first ones read). A
 * statement that reads more, a sum over a whole table say, can't be drawn as
 * arrows anyway.
 */
export const MAX_FROM = 32;

/**
 * The helpers as TypeScript declarations, for an editor that checks types.
 * The runner never checks them: sucrase only strips types.
 */
export const TS_HELPERS = `/** A visual table of rows × cols cells, each starting as fill (null: blank). */
declare function table(rows: number, cols: number, fill?: number | null): number[][];
/** A visual array: a copy of values, or that many cells of fill. */
declare function array(valuesOrLength: number | readonly number[], fill?: number): number[];
`;

export type RunRequest = {
  language: Language;
  /** The learner's source. Defines the entry function; may define helpers. */
  code: string;
  /** Name of the function to call, e.g. `bubble_sort` (Python) or `bubbleSort` (JS/TS). */
  entry: string;
  args: Arg[];
  limits: Limits;
};

/**
 * One side of a comparison: a cell of a visual array, a cell of a visual grid
 * (value null while the cell is blank), or a plain value (a variable such as
 * `key`, a literal, or an expression like `arr[j] + 1`).
 */
export type Operand =
  | { array: string; index: number; value: number }
  | { grid: string; row: number; col: number; value: number | null }
  | { value: VarValue };

/** A cell of a visual grid. */
export type GridCell = { grid: string; row: number; col: number };

export type CompareOp = '<' | '<=' | '>' | '>=' | '==' | '!=';

type At = {
  /** 1-based line in the learner's source that caused the event, or null if unknown. */
  line: number | null;
  /**
   * The learner's local variables at that moment: numbers, booleans, short
   * strings, and short lists rendered as text ("[3, 1, 2]"). Names starting
   * with an underscore and the visual collections themselves (arrays, grids
   * and grid rows) are left out.
   */
  vars: Record<string, VarValue>;
};

export type RunEvent =
  /**
   * A visual array came into existence: an array argument (line null, in
   * argument order), or one made by array() (on its line).
   */
  | ({ kind: 'array'; array: string; name: string; values: number[] } & At)
  /**
   * A visual grid came into existence: a grid argument (line null), or one made
   * by table() (on its line). `values` has `rows` rows of `cols` cells; null is
   * a blank cell.
   */
  | ({ kind: 'grid'; grid: string; name: string; rows: number; cols: number; values: (number | null)[][] } & At)
  /**
   * A comparison in the learner's code where at least one side is a cell of a
   * visual array or grid. `op` is the operator as written (JS === and !==
   * report as == and !=), `result` what it evaluated to.
   */
  | ({ kind: 'compare'; op: CompareOp; a: Operand; b: Operand; result: boolean } & At)
  /**
   * grid[row][col] = value. `from` is the grid cells the writing statement
   * read, in order, each once, at most MAX_FROM: `dp[i][j] = dp[i-1][j] +
   * dp[i][j-1]` gives [(i-1, j), (i, j-1)]. A function the statement called
   * adds the cells read by the statement it returned from, so
   * `dp[i][j] = at(i-1, j) + at(i, j-1)` and memoised recursion list the cells
   * their calls returned. Reads through iteration, slices and copies count;
   * reads of array cells don't.
   */
  | ({ kind: 'cellWrite'; grid: string; row: number; col: number; value: number; from: GridCell[] } & At)
  /** arr[index] = value. A swap arrives as two writes; trace.ts recognises it. */
  | ({ kind: 'write'; array: string; index: number; value: number } & At)
  /** arr.append(value) / arr.push(value). */
  | ({ kind: 'append'; array: string; value: number } & At)
  /** arr.pop() (last element) or arr.pop(i) in Python. */
  | ({ kind: 'pop'; array: string; index: number } & At)
  /** Something the learner printed (print / console.log), as one line of text. */
  | ({ kind: 'print'; text: string } & At);

export type RunError = {
  /**
   * syntax: the code doesn't parse. runtime: it threw. limit: too many events
   * or steps (probably an endless loop). timeout: the worker was stopped.
   * internal: a bug in the runtime itself, not the learner's code.
   */
  kind: 'syntax' | 'runtime' | 'limit' | 'timeout' | 'internal';
  /** One line, learner-facing: "IndexError: list index out of range". */
  message: string;
  line: number | null;
};

export type RunResult = {
  /** Every event up to the end of the run (or up to the error). */
  events: RunEvent[];
  /** Final contents of each visual array, by array id. */
  arrays: Record<string, number[]>;
  /** Final contents of each visual grid, by grid id (null: blank). Missing when the runner failed before running. */
  grids?: Record<string, (number | null)[][]>;
  /** The entry function's return value as JSON (null when it returned nothing). */
  returned: Json;
  error: RunError | null;
  /** Wall-clock time spent running the learner's code, in ms. */
  ms: number;
};

/** A runtime runs requests; the worker-backed ones live in runner.ts. */
export interface Runtime {
  run(request: RunRequest): Promise<RunResult>;
}

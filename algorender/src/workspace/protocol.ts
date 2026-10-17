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
//
// Two more argument kinds hand the learner a structure to explore:
//   graph   a dict (Python) or plain object (JS/TS) from each node to its
//           neighbours, in a fixed order: ['B', 'C'], or [('B', 4), …] /
//           [['B', 4], …] when weighted. Read-only. Reading a node's list
//           (graph[u], graph.get(u), or every list at once through items(),
//           values(), Object.entries or Object.values) is a `neighbours`
//           event; taking an entry from it (iterating or indexing) is an
//           `edge` event. Membership tests (`v in graph[u]`, includes,
//           indexOf) and lengths are not.
//   tree    the root TreeNode of a binary tree (None/null when empty).
//           TreeNode(val, left, right) is in scope too, LeetCode style, for
//           code that builds nodes. A TreeNode returned (or inside what is
//           returned) arrives as its level-order list, [4, 2, 7, null, 3].
//   list    the head ListNode of a singly linked list (None/null when empty).
//           ListNode(val, next) is in scope too. A ListNode returned arrives
//           as the list of its values, [1, 2, 3].
// Graph and tree runs are watched in 'lines' mode: the steps show the
// learner's own sets, queues and stacks, and the trace draws them on the
// graph or tree view (traceGraph.ts, traceTree.ts).
//
// 'judge' mode checks answers (src/content/problems): the code runs as
// written, with no instrumentation and no step limit (only the time budget),
// so a big test runs at full speed. Array and grid arguments arrive as plain
// lists, the only events are prints, and the result also carries every
// argument's final value, for a function that answers in place. A design
// problem (`calls`) constructs the entry class and calls its methods in turn.

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
  /** A graph to explore: each node's neighbours in reading order. Reads are tracked; it can't be changed. */
  | ({ kind: 'graph'; name: string } & GraphSpec)
  /** A binary tree in level order, LeetCode style (null: no node there). The function gets its root. */
  | { kind: 'tree'; name: string; values: (number | null)[] }
  /** A singly linked list, LeetCode style. The function gets its head ListNode (null when empty). */
  | { kind: 'list'; name: string; values: number[] }
  /** A plain JSON value (a number, a target, a flag). Not tracked. */
  | { kind: 'value'; name: string; value: Json };

/** A graph argument as the runtimes build it, and as its `graph` event repeats it for the view. */
export type GraphSpec = {
  directed: boolean;
  /** Weighted: neighbours arrive as (node, weight) pairs. Otherwise as bare nodes. */
  weighted: boolean;
  /** Every node in order, with its neighbours in the order the code reads them. An undirected edge is listed both ways. */
  adjacency: { node: string; neighbours: { to: string; weight: number }[] }[];
  /** Where the view draws each node, in layout units. Runtimes pass it through untouched. */
  layout?: Record<string, [number, number]>;
};

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Limits = {
  /** Events (compare, write, …, and every step in 'lines' mode) before the run is stopped. */
  maxEvents: number;
  /** Executed lines before the run is stopped, so an endless loop ends with a message. */
  maxSteps: number;
  /** Wall-clock budget, enforced by the main thread terminating the worker. */
  timeoutMs: number;
};

export const DEFAULT_LIMITS: Limits = { maxEvents: 5_000, maxSteps: 200_000, timeoutMs: 8_000 };

/**
 * 'lines' mode: every step carries the whole stack and heap, and nobody steps
 * through thousands of lines by hand, so stop sooner.
 */
export const LINE_LIMITS: Limits = { ...DEFAULT_LIMITS, maxEvents: 2_000 };

/** The most cells one table() or array() call may make: more can't be shown, and is almost always a bug. */
export const MAX_CELLS = 10_000;

/**
 * The most cells a cellWrite lists in `from` (the first ones read). A
 * statement that reads more, a sum over a whole table say, can't be drawn as
 * arrows anyway.
 */
export const MAX_FROM = 32;

/** 'lines' mode: the most items, entries or fields a heap object lists; the rest are counted in `more`. */
export const MAX_ITEMS = 20;

/**
 * 'lines' mode: the most objects one step lists. A reference to an object
 * past it shows as the primitive `…` (type 'none'), so a long linked list or
 * a big tree stays drawable.
 */
export const MAX_OBJECTS = 100;

/**
 * 'lines' mode: the deepest the learner's calls may nest. Every step records
 * the whole stack, so a runaway recursion is stopped here (a limit) rather
 * than recording thousands of frames at every line.
 */
export const MAX_DEPTH = 100;

/**
 * The helpers as TypeScript declarations, for an editor that checks types.
 * The runner never checks them: sucrase only strips types.
 */
export const TS_HELPERS = `/** A visual table of rows × cols cells, each starting as fill (null: blank). */
declare function table(rows: number, cols: number, fill?: number | null): number[][];
/** A visual array: a copy of values, or that many cells of fill. */
declare function array(valuesOrLength: number | readonly number[], fill?: number): number[];
/** A binary tree node, as LeetCode defines it. */
declare class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null);
}
/** A linked list node, as LeetCode defines it. */
declare class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val?: number, next?: ListNode | null);
}
`;

/**
 * 'visual' (the default) records what the code does to its visual collections.
 * 'lines' also records memory at every executed line, Python-Tutor style, for
 * reading short programs step by step: each step is a `step` event.
 * 'judge' runs the code as written and records only what it prints, for
 * checking answers on big inputs (see the top of this file).
 */
export type RunMode = 'visual' | 'lines' | 'judge';

/** 'judge' mode: the most lines of printed output kept; one more line says the rest was cut. */
export const MAX_PRINTS = 100;

/** 'judge' mode: the longest printed line kept, in characters. */
export const MAX_PRINT_CHARS = 1_000;

/** One call a design problem makes: the method's name (the class's own name for the constructor) and its arguments. */
export type MethodCall = { method: string; args: Json[] };

export type RunRequest = {
  language: Language;
  /** The learner's source. Defines the entry function; may define helpers. */
  code: string;
  /**
   * Name of the function to call, e.g. `bubble_sort` (Python) or `bubbleSort`
   * (JS/TS). In 'lines' mode it may be '' to run only the top-level code.
   */
  entry: string;
  args: Arg[];
  limits: Limits;
  mode?: RunMode;
  /**
   * A design problem: `entry` names a class, which the run constructs with
   * the first call's arguments (`args` is ignored) and then calls each later
   * method in turn. `returned` is the list of what each call returned, null
   * for the constructor. A thrown error stops the run there.
   */
  calls?: MethodCall[];
};

/**
 * A value as a memory diagram draws it: a primitive inline, written the way the
 * language prints it (Python `'hi'`, `True`, `None`; JS `"hi"`, `true`,
 * `null`, `undefined`), or a reference to a heap object.
 */
export type MemValue = { prim: string; type: 'number' | 'string' | 'boolean' | 'none' } | { ref: string };

/**
 * An object in the memory diagram. Ids are stable for the whole run, so two
 * names for one list show as two arrows to the same box. `type` is the
 * language's own name for it (list, dict, Array, Map, Point…). `more` counts
 * items left out past the display limit.
 */
export type HeapObject =
  | { id: string; kind: 'list' | 'tuple' | 'set'; type: string; items: MemValue[]; more: number }
  | { id: string; kind: 'dict'; type: string; entries: [MemValue, MemValue][]; more: number }
  | { id: string; kind: 'object'; type: string; fields: [string, MemValue][]; more: number }
  | { id: string; kind: 'function'; type: string; name: string };

/** One call on the stack, outermost first in a step's `stack`. */
export type StackFrame = {
  /** Unique per call for the whole run, so a frame keeps its identity while it lives. */
  id: string;
  /** The function's name; the top level is 'Global frame'. */
  fn: string;
  /** The line this frame is on. */
  line: number;
  /** Local names in the order they were first bound; harness names and helpers left out. */
  locals: [string, MemValue][];
  /** On a 'return' step, what the innermost frame is returning. */
  returning?: MemValue;
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
  | ({ kind: 'print'; text: string } & At)
  /** A graph argument, as given (line null). */
  | ({ kind: 'graph'; graph: string; name: string } & GraphSpec & At)
  /** The code fetched `node`'s neighbour list. */
  | ({ kind: 'neighbours'; graph: string; node: string } & At)
  /** The code took one entry from `from`'s neighbour list: the edge from → to (weight 1 when unweighted). */
  | ({ kind: 'edge'; graph: string; from: string; to: string; weight: number } & At)
  /** A tree argument, as given in level order (line null). */
  | ({ kind: 'tree'; name: string; values: (number | null)[] } & At)
  /**
   * 'lines' mode only: memory just before `line` runs ('line'), as a function
   * returns ('return'), or as an exception leaves a frame ('exception'). `heap`
   * holds only objects reachable from the stack. Steps count toward maxEvents.
   *
   * The top level's frame is always first. It has a 'return' step of its own
   * (no `returning`) when the top-level code finishes, so the last line's
   * effect is seen; with an entry function, that function's call then follows
   * on top of it. An exception that nothing catches leaves every frame it
   * passes through, innermost first, one 'exception' step each (the top level
   * too, when it was running); one caught in its own frame leaves none.
   */
  | {
      kind: 'step';
      event: 'line' | 'return' | 'exception';
      line: number;
      stack: StackFrame[];
      heap: HeapObject[];
      /** On an 'exception' step, the error as one line: "ValueError: negative". */
      message?: string;
    };

export type RunError = {
  /**
   * syntax: the code doesn't parse. runtime: it threw. limit: too many events
   * or steps (probably an endless loop). timeout: the worker was stopped.
   * internal: a bug in the runtime itself, not the learner's code. compile:
   * the server judge's compiler refused it (Java, C++, Go).
   */
  kind: 'syntax' | 'compile' | 'runtime' | 'limit' | 'timeout' | 'internal';
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
  /** 'judge' mode: each argument's value once the function returned, as JSON. */
  args?: Json[];
  error: RunError | null;
  /** Wall-clock time spent running the learner's code, in ms. */
  ms: number;
};

/** A runtime runs requests; the worker-backed ones live in runner.ts. */
export interface Runtime {
  run(request: RunRequest): Promise<RunResult>;
}

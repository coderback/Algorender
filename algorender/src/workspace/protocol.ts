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
//
// Programs (the first step towards the language tracks' program mode): a
// request with `stdin`, even '', runs as a program in any mode. input() reads
// its lines (Python also sys.stdin; JS/TS also fs.readFileSync(0) and a small
// readline), prompts and prints write a raw stdout (`end=''` and all; stderr
// apart), and sys.exit / process.exit end the run with an exit code rather
// than an error. Print events are recorded as before. Without `stdin` nothing
// changes: input() explains that a function gets its values as arguments.
// `files` adds the learner's other files beside the main one (`code`):
// Python imports them, and reads data files with open(); JS/TS requires
// them, or imports them once sucrase has turned imports into requires. Only
// the main file is stepped and drawn; code in the other files runs as
// written, except that its lines count toward maxSteps, so an endless loop
// there stops with a message too.
//
// 'program' mode checks programs (the language tracks' tasks): the code runs
// as written, as in 'judge' mode (plain arguments and helpers, no visual
// collections, no events at all, not even prints), but every line of the
// learner's files counts toward maxSteps, so a beginner's endless loop stops
// with a message instead of a timeout that restarts the runtime. It is always
// a program: stdin defaults to '', and the result carries the streams. With
// an entry the function is called after the top level, with plain arguments.
// `tests` adds hidden unit tests, run after the top level (see TestResult).
//
// `clock` makes time deterministic, so a replayed program sees the same
// time: the clock starts there and moves only when the program sleeps
// (Python's time and datetime, JS's Date and performance.now).

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
 * 'program' runs a program as written, counting its lines, for checking it
 * against stdin/stdout cases and unit tests (see the top of this file).
 */
export type RunMode = 'visual' | 'lines' | 'judge' | 'program';

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
  /**
   * Standard input: set it (even to '') to run as a program (see the top of
   * this file). The result then carries stdout, stderr and exitCode.
   */
  stdin?: string;
  /**
   * The replay console: a read past the end of `stdin` stops the run, with
   * `waiting` set, instead of giving the program end of file. The console
   * asks the learner for a line and runs the program again from the start.
   */
  moreInput?: boolean;
  /**
   * The learner's other files, by path: `helpers.py`, `lib/shapes.ts`,
   * `data.csv`. At most one folder deep, MAX_FILES of them, MAX_FILE_CHARS in
   * all (FILE_PATH). `code` is the main file.
   */
  files?: Record<string, string>;
  /**
   * Seeds Python's random and JS's Math.random for the run, so running a
   * program again makes the same choices (the replay console relies on it).
   * The two languages' sequences differ.
   */
  seed?: number;
  /**
   * The program's clock, in ms since 1970: time.time(), datetime.now(),
   * Date.now() and new Date() start here and move only as the program
   * sleeps (time.sleep), so a replay or a check sees the same time.
   */
  clock?: number;
  /**
   * 'program' mode: hidden unit tests, run after the main file's top level,
   * which see its top-level names. Python: every `test_*` function, with
   * plain assert (rewritten to say what each side was) and `raises(Error)`
   * as a context manager. JS/TS: test(name, fn) with a small expect()
   * (toBe, toEqual, toBeCloseTo, toContain, toThrow, toBeTruthy, toBeFalsy,
   * toBeNull, toBeUndefined, and .not). Each test's outcome is a TestResult.
   */
  tests?: string;
};

/**
 * One unit test's outcome. `message` says why it failed, in the language's
 * words; `line` is the learner's line an error came from, when it came from
 * the main file (a failed assert is in the hidden tests, so it has none).
 */
export type TestResult = { name: string; passed: boolean; message?: string; line?: number | null };

/** The most unit tests a run reports; more are an authoring mistake. */
export const MAX_TESTS = 50;

/** The most other files a run takes, and their characters in all. */
export const MAX_FILES = 8;
export const MAX_FILE_CHARS = 64_000;

/** A file's path: a name with an extension, in at most one folder, with no `..` or leading `/`. */
export const FILE_PATH = /^(?:[A-Za-z_][\w-]*\/)?[A-Za-z_][\w-]*\.[a-z]{1,4}$/;

/** A program's stdout and stderr each keep this many characters; past it, one line says the rest was cut. */
export const MAX_OUTPUT = 64_000;
export const OUTPUT_CUT = '\n… (the rest of the output is cut)\n';

/** Python's message when input() finds no more input, which the JS runtime's input() repeats. */
export const EOF_MESSAGE = 'EOFError: EOF when reading a line';

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
  | {
      id: string;
      kind: 'function';
      type: string;
      name: string;
      /**
       * 'lines' mode: the names a function made inside another function uses
       * from it (or from the functions around that), with their values now,
       * in name order: its closure, which outlives the frame that made it.
       * Left out when it captures nothing; top-level names are never captured.
       */
      captured?: [string, MemValue][];
      /**
       * 'lines' mode, Python only: the parameters' default values, in
       * parameter order, made once when `def` ran and kept on the function (so
       * a list default is the same list on every call). JavaScript works a
       * default out again on every call, so it has none to show.
       */
      defaults?: [string, MemValue][];
    };

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
  /**
   * The file the frame's code is in, when it isn't the main one (as
   * RunError.file). Not set yet: other files are stepped from L3, with the
   * multi-file editor.
   */
  file?: string;
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
  /** The file `line` is in, when it isn't the main one. */
  file?: string;
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
  /** A program (a request with `stdin`): everything it wrote to standard output, as written. */
  stdout?: string;
  /** A program: everything it wrote to standard error. */
  stderr?: string;
  /**
   * A program: sys.exit / process.exit's code, 0 when it ran to the end, 1
   * when an error ended it; null when it didn't end (a limit, or `waiting`).
   */
  exitCode?: number | null;
  /**
   * A program: for each line of stdin it read, in order, how long stdout was
   * then. A console writes the line there, as a terminal echoes typing.
   */
  reads?: number[];
  /**
   * A program: where each input() prompt (and readline question) sits in
   * stdout, as [start, end) in UTF-16 units, so a checker can leave prompts
   * out and a console can show them apart.
   */
  prompts?: [number, number][];
  /** `moreInput`: the program asked for a line past the end of stdin, and stopped there. */
  waiting?: boolean;
  /** 'program' mode with `tests`: each test's outcome, in the order they ran. */
  tests?: TestResult[];
};

/** A runtime runs requests; the worker-backed ones live in runner.ts. */
export interface Runtime {
  run(request: RunRequest): Promise<RunResult>;
}

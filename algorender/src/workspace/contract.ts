// Shared cases every runtime must pass, so Python and JS/TS behave the same.
// Each runtime's test file runs these through its own run() and compares.
// The programs are written line-for-line alike, so expected lines match too.
//
// 'lines' mode cases describe each step with Shapes (see below): what both
// languages must agree on (the line, each frame's function and its names in
// order, the values' kinds and contents, and which names share an object),
// spelled per language when compared, plus the few names only one language
// has (JS block scope ends where Python's function scope goes on).

import { MAX_PRINTS, type Arg, type HeapObject, type Json, type Language, type Limits, type MemValue, type MethodCall, type RunError, type RunEvent, type RunMode, type TestResult } from './protocol';

export type ContractCase = {
  name: string;
  /** Source per language; a case may skip a language by leaving it out. */
  code: Partial<Record<Language, string>>;
  entry: { python: string; js: string };
  args: Arg[];
  limits?: Partial<Limits>;
  /** 'lines' cases record memory at every step; 'judge' cases run the code as written. */
  mode?: RunMode;
  /** A design problem's calls (the entry is a class). */
  calls?: MethodCall[];
  /** A program: its standard input, and whether a read past the end waits (the replay console). */
  stdin?: string;
  moreInput?: boolean;
  /** The other files, per language (TypeScript takes JavaScript's unless it has its own). */
  files?: Partial<Record<Language, Record<string, string>>>;
  /** 'program' mode's unit tests, per language (TypeScript takes JavaScript's). */
  tests?: Partial<Record<Language, string>>;
  seed?: number;
  clock?: number;
  expect: {
    /** A program's prompts in stdout, [start, end). */
    prompts?: [number, number][];
    /** Each unit test's outcome; a message per side, since the languages word failures their own way. */
    tests?: { name: string; passed: boolean; message?: Record<Side, string>; line?: number | null }[];
    /** A program's streams, exactly; both languages must write the same. */
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    reads?: number[];
    waiting?: boolean;
    /** 'lines' mode: every step in order (only the first steps.length with `firstSteps`). */
    steps?: StepShape[];
    firstSteps?: boolean;
    /** Everything printed, one entry per print. */
    prints?: string[];
    /** The exact event list, when the case pins it. */
    events?: RunEvent[];
    /** Only the kinds, in order, when exact values don't matter. */
    kinds?: RunEvent['kind'][];
    /** Exactly this many events (every kind counts toward maxEvents). */
    count?: number;
    arrays?: Record<string, number[]>;
    grids?: Record<string, (number | null)[][]>;
    returned?: Json;
    /** 'judge' mode: each argument's final value. */
    args?: Json[];
    /**
     * Error kind and line; `message` must contain this text when given;
     * `hasLine` asks for some learner line without pinning which (a limit
     * stops wherever the loop happens to be).
     */
    error?: Pick<RunError, 'kind'> & { line?: number | null; message?: string; hasLine?: boolean; file?: string };
  };
};

/** The case's other files for a language. */
export function filesFor(c: ContractCase, language: Language): Record<string, string> | undefined {
  return c.files?.[language] ?? (language === 'typescript' ? c.files?.javascript : undefined);
}

/** A file named without its extension, so 'helpers.py' and 'helpers.js' compare alike. */
export const fileStem = (file: string | undefined) => file?.replace(/\.\w+$/, '');

/** The case's unit tests for a language. */
export function testsFor(c: ContractCase, language: Language): string | undefined {
  return c.tests?.[language] ?? (language === 'typescript' ? c.tests?.javascript : undefined);
}

/** A case's unit-test outcomes as a language must report them. */
export function expectedTests(c: ContractCase, language: Language): TestResult[] | undefined {
  const side: Side = language === 'python' ? 'python' : 'js';
  return c.expect.tests?.map((t) => ({
    name: t.name,
    passed: t.passed,
    ...(t.message && { message: t.message[side] }),
    ...(t.line !== undefined && { line: t.line }),
  }));
}

const at = (line: number | null, vars: Record<string, number | string | boolean | null> = {}) => ({ line, vars });
const cell = (index: number, value: number) => ({ array: 'arr', index, value });
/** A cell of grid `grid` as a comparison operand, or (without a value) as a `from` entry. */
const gcell = (grid: string, row: number, col: number, value: number | null) => ({ grid, row, col, value });
const read = (grid: string, row: number, col: number) => ({ grid, row, col });

type GraphArg = Extract<Arg, { kind: 'graph' }>;

/** A triangle: A–B, A–C, B–C, undirected, unweighted. */
const GRAPH: GraphArg = {
  kind: 'graph',
  name: 'graph',
  directed: false,
  weighted: false,
  adjacency: [
    { node: 'A', neighbours: [{ to: 'B', weight: 1 }, { to: 'C', weight: 1 }] },
    { node: 'B', neighbours: [{ to: 'A', weight: 1 }, { to: 'C', weight: 1 }] },
    { node: 'C', neighbours: [{ to: 'A', weight: 1 }, { to: 'B', weight: 1 }] },
  ],
};

/** One-way roads with weights, and a layout the runtimes pass through. */
const WEIGHTED: GraphArg = {
  kind: 'graph',
  name: 'roads',
  directed: true,
  weighted: true,
  adjacency: [
    { node: 'A', neighbours: [{ to: 'B', weight: 4 }, { to: 'C', weight: 1 }] },
    { node: 'B', neighbours: [] },
    { node: 'C', neighbours: [{ to: 'B', weight: 2 }] },
  ],
  layout: { A: [0, 0], B: [100, 0], C: [50, 80] },
};

// ---------------------------------------------------------------------------
// 'lines' mode shapes
// ---------------------------------------------------------------------------

/** None in Python, undefined in JS: what a function without a return gives back. */
export const NOTHING = { nothing: true } as const;

/**
 * A value as both runtimes must draw it. A number, boolean or string is a
 * primitive, spelled per language when compared (True/true, 'hi'/"hi"); null
 * is None/null. An object is a reference with its contents: `ref` labels it,
 * and names with one label must share one object (different labels, different
 * objects) for the whole run. `list` is a Python list / JS Array; `map` a
 * Python dict with string keys / a plain JS object; `fn` a function by name,
 * with what it captured (both languages) and its default values (Python only:
 * JS works a default out on every call).
 */
export type Shape =
  | number
  | boolean
  | string
  | null
  | typeof NOTHING
  | { ref: string; list: Shape[] }
  | { ref: string; map: [string, Shape][] }
  | { ref: string; obj: string; fields: [string, Shape][] }
  | { ref: string; fn: string; captured?: [string, Shape][]; defaults?: [string, Shape][] };

type Side = 'python' | 'js';

/** A name only one language has at this step. */
export type Local = Shape | { only: Side; value: Shape };

export type StepShape = {
  /** 'line' when left out. */
  event?: 'line' | 'return' | 'exception';
  line: number;
  /** Each frame, outermost first: its function ('Global frame' for the top level) and its names, in order. */
  stack: [fn: string, locals: Record<string, Local>][];
  /** What the innermost frame returns, on a function's 'return' step. */
  returning?: Shape;
  /** An exception step's message per language. */
  error?: Record<Side, string>;
};

/** A value as the tests compare it: a primitive as written, or an object in full, labelled by first appearance. */
export type Drawn =
  | { prim: string; type: string }
  | { ref: string; type: string; items: Drawn[] }
  | { ref: string; type: string; entries: [Drawn, Drawn][] }
  | { ref: string; type: string; fields: [string, Drawn][] }
  | { ref: string; type: string; name: string; captured?: [string, Drawn][]; defaults?: [string, Drawn][] }
  | { ref: string; type: string };

export type DrawnStep = {
  event: 'line' | 'return' | 'exception';
  line: number;
  stack: [string, [string, Drawn][]][];
  returning?: Drawn;
  message?: string;
};

const pythonOnly = (value: Shape): Local => ({ only: 'python', value });
const list = (ref: string, ...items: Shape[]): Shape => ({ ref, list: items });
const map = (ref: string, ...entries: [string, Shape][]): Shape => ({ ref, map: entries });
/** An instance of a class both languages name alike (TreeNode), with its fields in order. */
const obj = (ref: string, type: string, ...fields: [string, Shape][]): Shape => ({ ref, obj: type, fields });
const fn = (name: string): Shape => ({ ref: name, fn: name });
/** A function that captured names from the function that made it; `ref` tells two made by one def apart. */
const closure = (ref: string, name: string, ...captured: [string, Shape][]): Shape => ({ ref, fn: name, captured });
/** A function with default values: Python keeps them on the function, JS shows none. */
const withDefaults = (name: string, ...defaults: [string, Shape][]): Shape => ({ ref: name, fn: name, defaults });
const G = 'Global frame';

const UNIQUE_PATHS_PY = `def unique_paths(rows, cols):
    dp = table(rows, cols)
    for i in range(rows):
        for j in range(cols):
            if i == 0 or j == 0:
                dp[i][j] = 1
            else:
                dp[i][j] = dp[i - 1][j] + dp[i][j - 1]
    return dp[rows - 1][cols - 1]
`;
const UNIQUE_PATHS_JS = `function uniquePaths(rows, cols) {
  const dp = table(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (i === 0 || j === 0) {
        dp[i][j] = 1;
      } else {
        dp[i][j] = dp[i - 1][j] + dp[i][j - 1];
      }
    }
  }
  return dp[rows - 1][cols - 1];
}
`;
// The type annotation on dp must not stop the table being named after it.
const UNIQUE_PATHS_TS = UNIQUE_PATHS_JS.replace('function uniquePaths(rows, cols) {', 'function uniquePaths(rows: number, cols: number): number {').replace(
  'const dp = table(rows, cols);',
  'const dp: number[][] = table(rows, cols);',
);
const PATHS_VARS = { rows: 2, cols: 3 };
const pathWrite = (row: number, col: number, value: number, from: ReturnType<typeof read>[], line: number) => ({
  kind: 'cellWrite' as const,
  grid: 'dp',
  row,
  col,
  value,
  from,
  ...at(line, { ...PATHS_VARS, i: row, j: col }),
});

const BUBBLE_PY = `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
`;
const BUBBLE_JS = `function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
}
`;
const BUBBLE_TS = BUBBLE_JS.replace('function bubbleSort(arr) {', 'function bubbleSort(arr: number[]): void {');

const INSERTION_PY = `def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        # Drop the key into the gap (line 9, like the JS after its closing brace).
        arr[j + 1] = key
`;
const INSERTION_JS = `function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j -= 1;
    }
    arr[j + 1] = key;
  }
}
`;

export const CONTRACT: ContractCase[] = [
  {
    name: 'bubble sort: compares and tuple/destructuring swaps',
    code: { python: BUBBLE_PY, javascript: BUBBLE_JS, typescript: BUBBLE_TS },
    entry: { python: 'bubble_sort', js: 'bubbleSort' },
    args: [{ kind: 'array', name: 'arr', values: [3, 1, 2] }],
    expect: {
      events: [
        { kind: 'array', array: 'arr', name: 'arr', values: [3, 1, 2], ...at(null) },
        { kind: 'compare', op: '>', a: cell(0, 3), b: cell(1, 1), result: true, ...at(5, { n: 3, i: 0, j: 0 }) },
        { kind: 'write', array: 'arr', index: 0, value: 1, ...at(6, { n: 3, i: 0, j: 0 }) },
        { kind: 'write', array: 'arr', index: 1, value: 3, ...at(6, { n: 3, i: 0, j: 0 }) },
        { kind: 'compare', op: '>', a: cell(1, 3), b: cell(2, 2), result: true, ...at(5, { n: 3, i: 0, j: 1 }) },
        { kind: 'write', array: 'arr', index: 1, value: 2, ...at(6, { n: 3, i: 0, j: 1 }) },
        { kind: 'write', array: 'arr', index: 2, value: 3, ...at(6, { n: 3, i: 0, j: 1 }) },
        { kind: 'compare', op: '>', a: cell(0, 1), b: cell(1, 2), result: false, ...at(5, { n: 3, i: 1, j: 0 }) },
      ],
      arrays: { arr: [1, 2, 3] },
      returned: null,
    },
  },
  {
    name: 'insertion sort: a cell compared with a variable, shifting writes',
    code: { python: INSERTION_PY, javascript: INSERTION_JS },
    entry: { python: 'insertion_sort', js: 'insertionSort' },
    args: [{ kind: 'array', name: 'arr', values: [2, 1] }],
    expect: {
      events: [
        { kind: 'array', array: 'arr', name: 'arr', values: [2, 1], ...at(null) },
        { kind: 'compare', op: '>', a: cell(0, 2), b: { value: 1 }, result: true, ...at(5, { i: 1, key: 1, j: 0 }) },
        { kind: 'write', array: 'arr', index: 1, value: 2, ...at(6, { i: 1, key: 1, j: 0 }) },
        { kind: 'write', array: 'arr', index: 0, value: 1, ...at(9, { i: 1, key: 1, j: -1 }) },
      ],
      arrays: { arr: [1, 2] },
      returned: null,
    },
  },
  {
    name: 'equality with a literal; JS === reports as ==; comparisons of plain values are not events',
    code: {
      python: `def count_zeros(arr):
    count = 0
    for i in range(len(arr)):
        if arr[i] == 0:
            count += 1
    return count
`,
      javascript: `function countZeros(arr) {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) {
      count += 1;
    }
  }
  return count;
}
`,
    },
    entry: { python: 'count_zeros', js: 'countZeros' },
    args: [{ kind: 'array', name: 'arr', values: [0, 5] }],
    expect: {
      events: [
        { kind: 'array', array: 'arr', name: 'arr', values: [0, 5], ...at(null) },
        { kind: 'compare', op: '==', a: cell(0, 0), b: { value: 0 }, result: true, ...at(4, { count: 0, i: 0 }) },
        { kind: 'compare', op: '==', a: cell(1, 5), b: { value: 0 }, result: false, ...at(4, { count: 1, i: 1 }) },
      ],
      arrays: { arr: [0, 5] },
      returned: 1,
    },
  },
  {
    name: 'append, pop, print and a returned list',
    code: {
      python: `def grow(arr, extra):
    arr.append(extra)
    last = arr.pop()
    print("popped", last)
    return [last, len(arr)]
`,
      javascript: `function grow(arr, extra) {
  arr.push(extra);
  const last = arr.pop();
  console.log("popped", last);
  return [last, arr.length];
}
`,
    },
    entry: { python: 'grow', js: 'grow' },
    args: [
      { kind: 'array', name: 'arr', values: [4] },
      { kind: 'value', name: 'extra', value: 9 },
    ],
    expect: {
      events: [
        { kind: 'array', array: 'arr', name: 'arr', values: [4], ...at(null) },
        { kind: 'append', array: 'arr', value: 9, ...at(2, { extra: 9 }) },
        { kind: 'pop', array: 'arr', index: 1, ...at(3, { extra: 9 }) },
        { kind: 'print', text: 'popped 9', ...at(4, { extra: 9, last: 9 }) },
      ],
      arrays: { arr: [4] },
      returned: [9, 1],
    },
  },
  {
    name: 'reading past the end is a runtime error on the right line, keeping earlier events',
    code: {
      python: `def off_by_one(arr):
    for i in range(len(arr)):
        if arr[i] > arr[i + 1]:
            return i
`,
      javascript: `function offByOne(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > arr[i + 1]) {
      return i;
    }
  }
}
`,
    },
    entry: { python: 'off_by_one', js: 'offByOne' },
    args: [{ kind: 'array', name: 'arr', values: [1, 2] }],
    expect: { kinds: ['array', 'compare'], error: { kind: 'runtime', line: 3, message: 'range' } },
  },
  {
    name: 'a syntax error reports its line and runs nothing',
    code: {
      python: `def broken(arr):
    for i in range(len(arr))
        pass
`,
      javascript: `function broken(arr) {
  for (let i = 0; i < arr.length; i++ {
  }
}
`,
    },
    entry: { python: 'broken', js: 'broken' },
    args: [{ kind: 'array', name: 'arr', values: [1] }],
    expect: { kinds: [], error: { kind: 'syntax', line: 2 } },
  },
  {
    name: 'an endless loop stops at the step limit',
    code: {
      python: `def spin(arr):
    i = 0
    while i < len(arr):
        pass
`,
      javascript: `function spin(arr) {
  let i = 0;
  while (i < arr.length) {
  }
}
`,
    },
    entry: { python: 'spin', js: 'spin' },
    args: [{ kind: 'array', name: 'arr', values: [1] }],
    limits: { maxSteps: 5_000 },
    expect: { kinds: ['array'], error: { kind: 'limit', message: 'step', hasLine: true } },
  },
  {
    name: 'too many visual events stops at the event limit',
    code: {
      python: `def churn(arr):
    while True:
        arr[0] = arr[0] + 1
`,
      javascript: `function churn(arr) {
  while (true) {
    arr[0] = arr[0] + 1;
  }
}
`,
    },
    entry: { python: 'churn', js: 'churn' },
    args: [{ kind: 'array', name: 'arr', values: [0] }],
    limits: { maxEvents: 50 },
    expect: { count: 50, error: { kind: 'limit', message: 'event', hasLine: true } },
  },
  {
    name: 'vars show numbers, booleans and null, and shorten long lists and strings',
    code: {
      python: `def show(arr):
    big = list(range(20))
    word = "x" * 50
    flag = True
    nothing = None
    arr.append(1)
`,
      javascript: `function show(arr) {
  const big = Array.from({ length: 20 }, (_, i) => i);
  const word = "x".repeat(50);
  const flag = true;
  const nothing = null;
  arr.push(1);
}
`,
    },
    entry: { python: 'show', js: 'show' },
    args: [{ kind: 'array', name: 'arr', values: [] }],
    expect: {
      events: [
        { kind: 'array', array: 'arr', name: 'arr', values: [], ...at(null) },
        {
          kind: 'append',
          array: 'arr',
          value: 1,
          ...at(6, {
            // The first 12 items, then the count; strings cut to 40 characters, ellipsis included.
            big: '[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, …] (20 items)',
            word: `${'x'.repeat(39)}…`,
            flag: true,
            nothing: null,
          }),
        },
      ],
      arrays: { arr: [1] },
      returned: null,
    },
  },
  {
    name: 'grids: table() makes a named grid, and each cell write lists the cells read for it',
    code: { python: UNIQUE_PATHS_PY, javascript: UNIQUE_PATHS_JS, typescript: UNIQUE_PATHS_TS },
    entry: { python: 'unique_paths', js: 'uniquePaths' },
    args: [
      { kind: 'value', name: 'rows', value: 2 },
      { kind: 'value', name: 'cols', value: 3 },
    ],
    expect: {
      events: [
        { kind: 'grid', grid: 'dp', name: 'dp', rows: 2, cols: 3, values: [[0, 0, 0], [0, 0, 0]], ...at(2, PATHS_VARS) },
        pathWrite(0, 0, 1, [], 6),
        pathWrite(0, 1, 1, [], 6),
        pathWrite(0, 2, 1, [], 6),
        pathWrite(1, 0, 1, [], 6),
        pathWrite(1, 1, 2, [read('dp', 0, 1), read('dp', 1, 0)], 8),
        pathWrite(1, 2, 3, [read('dp', 0, 2), read('dp', 1, 1)], 8),
      ],
      arrays: {},
      grids: { dp: [[1, 1, 1], [1, 2, 3]] },
      returned: 3,
    },
  },
  {
    name: 'grids: a grid argument, with cells compared to cells',
    code: {
      python: `def rises(grid):
    count = 0
    for i in range(1, len(grid)):
        for j in range(len(grid[i])):
            if grid[i][j] > grid[i - 1][j]:
                count += 1
    return count
`,
      javascript: `function rises(grid) {
  let count = 0;
  for (let i = 1; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      if (grid[i][j] > grid[i - 1][j]) {
        count += 1;
      }
    }
  }
  return count;
}
`,
    },
    entry: { python: 'rises', js: 'rises' },
    args: [{ kind: 'grid', name: 'grid', values: [[1, 5], [3, 2], [4, 4]] }],
    expect: {
      events: [
        { kind: 'grid', grid: 'grid', name: 'grid', rows: 3, cols: 2, values: [[1, 5], [3, 2], [4, 4]], ...at(null) },
        { kind: 'compare', op: '>', a: gcell('grid', 1, 0, 3), b: gcell('grid', 0, 0, 1), result: true, ...at(5, { count: 0, i: 1, j: 0 }) },
        { kind: 'compare', op: '>', a: gcell('grid', 1, 1, 2), b: gcell('grid', 0, 1, 5), result: false, ...at(5, { count: 1, i: 1, j: 1 }) },
        { kind: 'compare', op: '>', a: gcell('grid', 2, 0, 4), b: gcell('grid', 1, 0, 3), result: true, ...at(5, { count: 1, i: 2, j: 0 }) },
        { kind: 'compare', op: '>', a: gcell('grid', 2, 1, 4), b: gcell('grid', 1, 1, 2), result: true, ...at(5, { count: 2, i: 2, j: 1 }) },
      ],
      grids: { grid: [[1, 5], [3, 2], [4, 4]] },
      returned: 3,
    },
  },
  {
    name: 'grids: from lists each cell once, resets when a statement begins, and blank cells are null',
    code: {
      python: `def reads(rows, cols):
    dp = table(rows, cols, None)
    dp[0][0] = 2
    dp[0][1] = dp[0][0] + dp[0][0]
    dp[0][1] += 1
    if dp[1][0] == None:
        dp[1][1] = dp[0][1]
`,
      javascript: `function reads(rows, cols) {
  const dp = table(rows, cols, null);
  dp[0][0] = 2;
  dp[0][1] = dp[0][0] + dp[0][0];
  dp[0][1] += 1;
  if (dp[1][0] === null) {
    dp[1][1] = dp[0][1];
  }
}
`,
    },
    entry: { python: 'reads', js: 'reads' },
    args: [
      { kind: 'value', name: 'rows', value: 2 },
      { kind: 'value', name: 'cols', value: 2 },
    ],
    expect: {
      events: [
        { kind: 'grid', grid: 'dp', name: 'dp', rows: 2, cols: 2, values: [[null, null], [null, null]], ...at(2, { rows: 2, cols: 2 }) },
        { kind: 'cellWrite', grid: 'dp', row: 0, col: 0, value: 2, from: [], ...at(3, { rows: 2, cols: 2 }) },
        { kind: 'cellWrite', grid: 'dp', row: 0, col: 1, value: 4, from: [read('dp', 0, 0)], ...at(4, { rows: 2, cols: 2 }) },
        // += reads the cell it writes.
        { kind: 'cellWrite', grid: 'dp', row: 0, col: 1, value: 5, from: [read('dp', 0, 1)], ...at(5, { rows: 2, cols: 2 }) },
        { kind: 'compare', op: '==', a: gcell('dp', 1, 0, null), b: { value: null }, result: true, ...at(6, { rows: 2, cols: 2 }) },
        // The if's read of dp[1][0] belongs to the if statement, not to the write inside it.
        { kind: 'cellWrite', grid: 'dp', row: 1, col: 1, value: 5, from: [read('dp', 0, 1)], ...at(7, { rows: 2, cols: 2 }) },
      ],
      grids: { dp: [[2, 5], [null, 5]] },
      returned: null,
    },
  },
  {
    name: 'grids: a helper’s returned cell counts as read by the statement that called it',
    code: {
      python: `def at(dp, i, j):
    if i < 0 or j < 0:
        return 0
    # (line 4: the JS closes its if here)
    return dp[i][j]

def fill(rows, cols):
    dp = table(rows, cols, 1)
    dp[1][1] = at(dp, 0, 1) + at(dp, 1, 0) + at(dp, -1, 1)
`,
      javascript: `function at(dp, i, j) {
  if (i < 0 || j < 0) {
    return 0;
  }
  return dp[i][j];
}
function fill(rows, cols) {
  const dp = table(rows, cols, 1);
  dp[1][1] = at(dp, 0, 1) + at(dp, 1, 0) + at(dp, -1, 1);
}
`,
    },
    entry: { python: 'fill', js: 'fill' },
    args: [
      { kind: 'value', name: 'rows', value: 2 },
      { kind: 'value', name: 'cols', value: 2 },
    ],
    expect: {
      events: [
        { kind: 'grid', grid: 'dp', name: 'dp', rows: 2, cols: 2, values: [[1, 1], [1, 1]], ...at(8, { rows: 2, cols: 2 }) },
        { kind: 'cellWrite', grid: 'dp', row: 1, col: 1, value: 2, from: [read('dp', 0, 1), read('dp', 1, 0)], ...at(9, { rows: 2, cols: 2 }) },
      ],
      grids: { dp: [[1, 1], [1, 2]] },
      returned: null,
    },
  },
  {
    name: 'grids: memoised recursion lists the cells its calls returned',
    code: {
      python: `def paths(memo, i, j):
    if i == 0 or j == 0:
        return 1
    # (lines 4 and 7: the JS closes its ifs there)
    if memo[i][j] > 0:
        return memo[i][j]

    memo[i][j] = paths(memo, i - 1, j) + paths(memo, i, j - 1)
    return memo[i][j]

def count(rows, cols):
    memo = table(rows, cols)
    return paths(memo, rows - 1, cols - 1)
`,
      javascript: `function paths(memo, i, j) {
  if (i === 0 || j === 0) {
    return 1;
  }
  if (memo[i][j] > 0) {
    return memo[i][j];
  }
  memo[i][j] = paths(memo, i - 1, j) + paths(memo, i, j - 1);
  return memo[i][j];
}
function count(rows, cols) {
  const memo = table(rows, cols);
  return paths(memo, rows - 1, cols - 1);
}
`,
    },
    entry: { python: 'count', js: 'count' },
    args: [
      { kind: 'value', name: 'rows', value: 3 },
      { kind: 'value', name: 'cols', value: 3 },
    ],
    expect: {
      events: [
        { kind: 'grid', grid: 'memo', name: 'memo', rows: 3, cols: 3, values: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ...at(12, { rows: 3, cols: 3 }) },
        { kind: 'compare', op: '>', a: gcell('memo', 2, 2, 0), b: { value: 0 }, result: false, ...at(5, { i: 2, j: 2 }) },
        { kind: 'compare', op: '>', a: gcell('memo', 1, 2, 0), b: { value: 0 }, result: false, ...at(5, { i: 1, j: 2 }) },
        { kind: 'compare', op: '>', a: gcell('memo', 1, 1, 0), b: { value: 0 }, result: false, ...at(5, { i: 1, j: 1 }) },
        { kind: 'cellWrite', grid: 'memo', row: 1, col: 1, value: 2, from: [], ...at(8, { i: 1, j: 1 }) },
        { kind: 'cellWrite', grid: 'memo', row: 1, col: 2, value: 3, from: [read('memo', 1, 1)], ...at(8, { i: 1, j: 2 }) },
        { kind: 'compare', op: '>', a: gcell('memo', 2, 1, 0), b: { value: 0 }, result: false, ...at(5, { i: 2, j: 1 }) },
        { kind: 'compare', op: '>', a: gcell('memo', 1, 1, 2), b: { value: 0 }, result: true, ...at(5, { i: 1, j: 1 }) },
        { kind: 'cellWrite', grid: 'memo', row: 2, col: 1, value: 3, from: [read('memo', 1, 1)], ...at(8, { i: 2, j: 1 }) },
        { kind: 'cellWrite', grid: 'memo', row: 2, col: 2, value: 6, from: [read('memo', 1, 2), read('memo', 2, 1)], ...at(8, { i: 2, j: 2 }) },
      ],
      grids: { memo: [[0, 0, 0], [0, 2, 3], [0, 3, 6]] },
      returned: 6,
    },
  },
  {
    name: 'grids: reads through iteration and slices count, and a row kept in a variable still writes the grid',
    code: {
      python: `def fold(rows, cols):
    dp = table(rows, cols, 1)
    row = dp[1]
    row[0] = sum(dp[0])
    row[1] = max(dp[0][1:]) + row[0]
`,
      javascript: `function fold(rows, cols) {
  const dp = table(rows, cols, 1);
  const row = dp[1];
  row[0] = dp[0].reduce((a, b) => a + b, 0);
  row[1] = Math.max(...dp[0].slice(1)) + row[0];
}
`,
    },
    entry: { python: 'fold', js: 'fold' },
    args: [
      { kind: 'value', name: 'rows', value: 2 },
      { kind: 'value', name: 'cols', value: 2 },
    ],
    expect: {
      events: [
        { kind: 'grid', grid: 'dp', name: 'dp', rows: 2, cols: 2, values: [[1, 1], [1, 1]], ...at(2, { rows: 2, cols: 2 }) },
        { kind: 'cellWrite', grid: 'dp', row: 1, col: 0, value: 2, from: [read('dp', 0, 0), read('dp', 0, 1)], ...at(4, { rows: 2, cols: 2 }) },
        { kind: 'cellWrite', grid: 'dp', row: 1, col: 1, value: 3, from: [read('dp', 0, 1), read('dp', 1, 0)], ...at(5, { rows: 2, cols: 2 }) },
      ],
      grids: { dp: [[1, 1], [2, 3]] },
      returned: null,
    },
  },
  {
    name: 'grids: array() makes a second visual array named after its variable',
    code: {
      python: `def prefix_sums(arr):
    sums = array(len(arr))
    total = 0
    for i in range(len(arr)):
        total += arr[i]
        sums[i] = total
    return sums
`,
      javascript: `function prefixSums(arr) {
  const sums = array(arr.length);
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
    sums[i] = total;
  }
  return sums;
}
`,
    },
    entry: { python: 'prefix_sums', js: 'prefixSums' },
    args: [{ kind: 'array', name: 'arr', values: [1, 2, 3] }],
    expect: {
      events: [
        { kind: 'array', array: 'arr', name: 'arr', values: [1, 2, 3], ...at(null) },
        { kind: 'array', array: 'sums', name: 'sums', values: [0, 0, 0], ...at(2) },
        { kind: 'write', array: 'sums', index: 0, value: 1, ...at(6, { total: 1, i: 0 }) },
        { kind: 'write', array: 'sums', index: 1, value: 3, ...at(6, { total: 3, i: 1 }) },
        { kind: 'write', array: 'sums', index: 2, value: 6, ...at(6, { total: 6, i: 2 }) },
      ],
      arrays: { arr: [1, 2, 3], sums: [1, 3, 6] },
      grids: {},
      returned: [1, 3, 6],
    },
  },
  {
    name: 'grids: unnamed helpers count up, and a reused name gets a fresh id',
    code: {
      python: `def make(n):
    first = array(n)
    first = array(n + 1)
    print(table(1, 1))
    return len(first)
`,
      javascript: `function make(n) {
  let first = array(n);
  first = array(n + 1);
  console.log(table(1, 1));
  return first.length;
}
`,
    },
    entry: { python: 'make', js: 'make' },
    args: [{ kind: 'value', name: 'n', value: 1 }],
    expect: {
      events: [
        { kind: 'array', array: 'first', name: 'first', values: [0], ...at(2, { n: 1 }) },
        { kind: 'array', array: 'first2', name: 'first', values: [0, 0], ...at(3, { n: 1 }) },
        { kind: 'grid', grid: 'table1', name: 'table1', rows: 1, cols: 1, values: [[0]], ...at(4, { n: 1 }) },
        { kind: 'print', text: '[[0]]', ...at(4, { n: 1 }) },
      ],
      arrays: { first: [0], first2: [0, 0] },
      grids: { table1: [[0]] },
      returned: 2,
    },
  },
  {
    name: 'grids: a row past the end is a runtime error on its line',
    code: {
      python: `def past_the_end(rows, cols):
    dp = table(rows, cols)
    dp[rows][0] = 1
`,
      javascript: `function pastTheEnd(rows, cols) {
  const dp = table(rows, cols);
  dp[rows][0] = 1;
}
`,
    },
    entry: { python: 'past_the_end', js: 'pastTheEnd' },
    args: [
      { kind: 'value', name: 'rows', value: 2 },
      { kind: 'value', name: 'cols', value: 2 },
    ],
    expect: { kinds: ['grid'], grids: { dp: [[0, 0], [0, 0]] }, error: { kind: 'runtime', line: 3, message: '2 is out of range for dp (2 rows)' } },
  },
  {
    name: 'grids: a cell can only hold a number',
    code: {
      python: `def store_text(rows, cols):
    dp = table(rows, cols)
    dp[0][1] = "x"
`,
      javascript: `function storeText(rows, cols) {
  const dp = table(rows, cols);
  dp[0][1] = "x";
}
`,
    },
    entry: { python: 'store_text', js: 'storeText' },
    args: [
      { kind: 'value', name: 'rows', value: 1 },
      { kind: 'value', name: 'cols', value: 2 },
    ],
    expect: { kinds: ['grid'], grids: { dp: [[0, 0]] }, error: { kind: 'runtime', line: 3, message: "TypeError: dp holds numbers, so dp[0][1] can't store" } },
  },
  {
    name: 'graphs: fetching a node’s neighbours and taking each edge are events, on the loop’s line',
    code: {
      python: `def walk(graph, start):
    seen = [start]
    for v in graph[start]:
        seen.append(v)
    return seen
`,
      javascript: `function walk(graph, start) {
  const seen = [start];
  for (const v of graph[start]) {
    seen.push(v);
  }
  return seen;
}
`,
    },
    entry: { python: 'walk', js: 'walk' },
    args: [GRAPH, { kind: 'value', name: 'start', value: 'A' }],
    expect: {
      events: [
        { kind: 'graph', graph: 'graph', name: 'graph', directed: false, weighted: false, adjacency: GRAPH.adjacency, ...at(null) },
        { kind: 'neighbours', graph: 'graph', node: 'A', ...at(3, { start: 'A' }) },
        { kind: 'edge', graph: 'graph', from: 'A', to: 'B', weight: 1, ...at(3, { start: 'A' }) },
        { kind: 'edge', graph: 'graph', from: 'A', to: 'C', weight: 1, ...at(3, { start: 'A', v: 'B' }) },
      ],
      returned: ['A', 'B', 'C'],
    },
  },
  {
    name: 'graphs: indexing and slicing take edges; lengths and membership don’t; values()/Object.values fetch every list',
    code: {
      python: `def look(graph):
    n = len(graph["A"])
    has = "C" in graph["A"]
    first = graph["A"][0]
    rest = graph["A"][1:]
    lists = list(graph.values())
    return [n, has, first, rest, len(lists)]
`,
      javascript: `function look(graph) {
  const n = graph["A"].length;
  const has = graph["A"].includes("C");
  const first = graph["A"][0];
  const rest = graph["A"].slice(1);
  const lists = Object.values(graph);
  return [n, has, first, rest, lists.length];
}
`,
    },
    entry: { python: 'look', js: 'look' },
    args: [GRAPH],
    expect: {
      events: [
        { kind: 'graph', graph: 'graph', name: 'graph', directed: false, weighted: false, adjacency: GRAPH.adjacency, ...at(null) },
        { kind: 'neighbours', graph: 'graph', node: 'A', ...at(2) },
        { kind: 'neighbours', graph: 'graph', node: 'A', ...at(3, { n: 2 }) },
        { kind: 'neighbours', graph: 'graph', node: 'A', ...at(4, { n: 2, has: true }) },
        { kind: 'edge', graph: 'graph', from: 'A', to: 'B', weight: 1, ...at(4, { n: 2, has: true }) },
        { kind: 'neighbours', graph: 'graph', node: 'A', ...at(5, { n: 2, has: true, first: 'B' }) },
        { kind: 'edge', graph: 'graph', from: 'A', to: 'C', weight: 1, ...at(5, { n: 2, has: true, first: 'B' }) },
        ...['A', 'B', 'C'].map((node) => ({ kind: 'neighbours' as const, graph: 'graph', node, ...at(6, { n: 2, has: true, first: 'B' }) })),
      ],
      returned: [2, true, 'B', ['C'], 3],
    },
  },
  {
    name: 'graphs: a weighted graph’s neighbours are (node, weight) pairs, and each edge carries its weight',
    code: {
      python: `def cheapest(graph, start):
    best = None
    for v, w in graph[start]:
        if best is None or w < best:
            best = w
    return best
`,
      javascript: `function cheapest(graph, start) {
  let best = null;
  for (const [v, w] of graph[start]) {
    if (best === null || w < best) {
      best = w;
    }
  }
  return best;
}
`,
    },
    entry: { python: 'cheapest', js: 'cheapest' },
    args: [WEIGHTED, { kind: 'value', name: 'start', value: 'A' }],
    expect: {
      events: [
        { kind: 'graph', graph: 'roads', name: 'roads', directed: true, weighted: true, adjacency: WEIGHTED.adjacency, layout: WEIGHTED.layout, ...at(null) },
        { kind: 'neighbours', graph: 'roads', node: 'A', ...at(3, { start: 'A', best: null }) },
        { kind: 'edge', graph: 'roads', from: 'A', to: 'B', weight: 4, ...at(3, { start: 'A', best: null }) },
        { kind: 'edge', graph: 'roads', from: 'A', to: 'C', weight: 1, ...at(3, { start: 'A', best: 4, v: 'B', w: 4 }) },
      ],
      returned: 1,
    },
  },
  {
    name: 'graphs: the graph can’t be changed',
    code: {
      python: `def grow(graph):
    graph["A"].append("D")
`,
      javascript: `function grow(graph) {
  graph["A"].push("D");
}
`,
    },
    entry: { python: 'grow', js: 'grow' },
    args: [GRAPH],
    expect: { kinds: ['graph', 'neighbours'], error: { kind: 'runtime', line: 2, message: 'is part of the graph you were given' } },
  },
  {
    name: 'trees: a tree argument arrives as TreeNodes, TreeNode makes more, and a returned tree is its level-order list',
    code: {
      python: `def grow(root):
    root.left.left = TreeNode(1)
    print(root.left)
    return root
`,
      javascript: `function grow(root) {
  root.left.left = new TreeNode(1);
  console.log(root.left);
  return root;
}
`,
    },
    entry: { python: 'grow', js: 'grow' },
    args: [{ kind: 'tree', name: 'root', values: [4, 2, 7, null, 3] }],
    expect: {
      events: [
        { kind: 'tree', name: 'root', values: [4, 2, 7, null, 3], ...at(null) },
        { kind: 'print', text: 'TreeNode(2)', ...at(3) },
      ],
      returned: [4, 2, 7, 1, 3],
    },
  },
  {
    name: 'trees: an empty tree is None (Python) or null (JS)',
    code: {
      python: `def is_empty(root):
    return root is None
`,
      javascript: `function isEmpty(root) {
  return root === null;
}
`,
    },
    entry: { python: 'is_empty', js: 'isEmpty' },
    args: [{ kind: 'tree', name: 'root', values: [] }],
    expect: { kinds: ['tree'], returned: true },
  },
  {
    name: 'a missing entry function says what to define',
    code: { python: `def something_else(arr):\n    pass\n`, javascript: `function somethingElse(arr) {}\n` },
    entry: { python: 'bubble_sort', js: 'bubbleSort' },
    args: [{ kind: 'array', name: 'arr', values: [1] }],
    expect: { kinds: [], error: { kind: 'runtime', line: null, message: 'bubble' } },
  },

  // 'lines' mode ----------------------------------------------------------------

  {
    name: 'lines: straight-line top-level code, with no entry function',
    code: {
      python: `x = 5
y = x * 2
x = y - 1
`,
      javascript: `let x = 5;
let y = x * 2;
x = y - 1;
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        // A let in its temporal dead zone isn't shown, as a Python name isn't before it's bound.
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { x: 5 }]] },
        { line: 3, stack: [[G, { x: 5, y: 10 }]] },
        // The top level's end is a step of its own, so the last line's effect is seen.
        { event: 'return', line: 3, stack: [[G, { x: 9, y: 10 }]] },
      ],
      prints: [],
      returned: null,
    },
  },
  {
    name: 'lines: primitives are written as each language prints them',
    code: {
      python: `word = "hi"
ok = True
nothing = None
half = 2.5
`,
      javascript: `const word = "hi";
const ok = true;
const nothing = null;
const half = 2.5;
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { word: 'hi' }]] },
        { line: 3, stack: [[G, { word: 'hi', ok: true }]] },
        { line: 4, stack: [[G, { word: 'hi', ok: true, nothing: null }]] },
        { event: 'return', line: 4, stack: [[G, { word: 'hi', ok: true, nothing: null, half: 2.5 }]] },
      ],
    },
  },
  {
    name: 'lines: a loop comes back to its line after every pass, and once more to finish',
    code: {
      python: `total = 0
for i in range(3):
    total += i
# (line 4: the JS closes its loop here)
print(total)
`,
      javascript: `let total = 0;
for (let i = 0; i < 3; i++) {
  total += i;
}
console.log(total);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { total: 0 }]] },
        { line: 3, stack: [[G, { total: 0, i: 0 }]] },
        { line: 2, stack: [[G, { total: 0, i: 0 }]] },
        { line: 3, stack: [[G, { total: 0, i: 1 }]] },
        { line: 2, stack: [[G, { total: 1, i: 1 }]] },
        { line: 3, stack: [[G, { total: 1, i: 2 }]] },
        { line: 2, stack: [[G, { total: 3, i: 2 }]] },
        // Python's loop variable outlives the loop; JS's let i ends with it.
        { line: 5, stack: [[G, { total: 3, i: pythonOnly(2) }]] },
        { event: 'return', line: 5, stack: [[G, { total: 3, i: pythonOnly(2) }]] },
      ],
      prints: ['3'],
    },
  },
  {
    name: 'lines: a call stacks a frame on top, and its return value goes back to the caller',
    code: {
      python: `def add(a, b):
    total = a + b
    return total
# (line 4: the JS closes add here)
result = add(2, 3)
`,
      javascript: `function add(a, b) {
  const total = a + b;
  return total;
}
const result = add(2, 3);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        // A function's name is bound once its definition has run (JS hoisting aside).
        { line: 1, stack: [[G, {}]] },
        { line: 5, stack: [[G, { add: fn('add') }]] },
        { line: 2, stack: [[G, { add: fn('add') }], ['add', { a: 2, b: 3 }]] },
        { line: 3, stack: [[G, { add: fn('add') }], ['add', { a: 2, b: 3, total: 5 }]] },
        { event: 'return', line: 3, stack: [[G, { add: fn('add') }], ['add', { a: 2, b: 3, total: 5 }]], returning: 5 },
        { event: 'return', line: 5, stack: [[G, { add: fn('add'), result: 5 }]] },
      ],
    },
  },
  {
    name: 'lines: recursion stacks a frame per call and unwinds them in turn',
    code: {
      python: `def fact(n):
    if n <= 1:
        return 1
    # (line 4: the JS closes its if here)
    return n * fact(n - 1)
# (line 6: the JS closes fact here)
answer = fact(3)
`,
      javascript: `function fact(n) {
  if (n <= 1) {
    return 1;
  }
  return n * fact(n - 1);
}
const answer = fact(3);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: ((): StepShape[] => {
        const g = [G, { fact: fn('fact') }] as [string, Record<string, Local>];
        const f = (n: number) => ['fact', { n }] as [string, Record<string, Local>];
        return [
          { line: 1, stack: [[G, {}]] },
          { line: 7, stack: [g] },
          { line: 2, stack: [g, f(3)] },
          { line: 5, stack: [g, f(3)] },
          { line: 2, stack: [g, f(3), f(2)] },
          { line: 5, stack: [g, f(3), f(2)] },
          { line: 2, stack: [g, f(3), f(2), f(1)] },
          { line: 3, stack: [g, f(3), f(2), f(1)] },
          { event: 'return', line: 3, stack: [g, f(3), f(2), f(1)], returning: 1 },
          { event: 'return', line: 5, stack: [g, f(3), f(2)], returning: 2 },
          { event: 'return', line: 5, stack: [g, f(3)], returning: 6 },
          { event: 'return', line: 7, stack: [[G, { fact: fn('fact'), answer: 6 }]] },
        ];
      })(),
    },
  },
  {
    name: 'lines: two names for one list share one object, and a change shows through both',
    code: {
      python: `nums = [1, 2]
other = nums
other.append(3)
nums[0] = 9
`,
      javascript: `const nums = [1, 2];
const other = nums;
other.push(3);
nums[0] = 9;
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { nums: list('L', 1, 2) }]] },
        { line: 3, stack: [[G, { nums: list('L', 1, 2), other: list('L', 1, 2) }]] },
        { line: 4, stack: [[G, { nums: list('L', 1, 2, 3), other: list('L', 1, 2, 3) }]] },
        { event: 'return', line: 4, stack: [[G, { nums: list('L', 9, 2, 3), other: list('L', 9, 2, 3) }]] },
      ],
    },
  },
  {
    name: 'lines: a dict (Python) or object (JS) gains and changes keys',
    code: {
      python: `point = {"x": 1}
point["y"] = 2
point["x"] = 5
`,
      javascript: `const point = { x: 1 };
point.y = 2;
point.x = 5;
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { point: map('P', ['x', 1]) }]] },
        { line: 3, stack: [[G, { point: map('P', ['x', 1], ['y', 2]) }]] },
        { event: 'return', line: 3, stack: [[G, { point: map('P', ['x', 5], ['y', 2]) }]] },
      ],
    },
  },
  {
    name: 'lines: a function changes its caller’s list through its parameter, and prints are kept',
    code: {
      python: `def grow(items):
    items.append(4)
# (line 3: the JS closes grow here)
nums = [1, 2, 3]
grow(nums)
print(nums)
`,
      javascript: `function grow(items) {
  items.push(4);
}
const nums = [1, 2, 3];
grow(nums);
console.log(nums);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 4, stack: [[G, { grow: fn('grow') }]] },
        { line: 5, stack: [[G, { grow: fn('grow'), nums: list('L', 1, 2, 3) }]] },
        { line: 2, stack: [[G, { grow: fn('grow'), nums: list('L', 1, 2, 3) }], ['grow', { items: list('L', 1, 2, 3) }]] },
        {
          event: 'return',
          line: 2,
          stack: [[G, { grow: fn('grow'), nums: list('L', 1, 2, 3, 4) }], ['grow', { items: list('L', 1, 2, 3, 4) }]],
          returning: NOTHING,
        },
        { line: 6, stack: [[G, { grow: fn('grow'), nums: list('L', 1, 2, 3, 4) }]] },
        { event: 'return', line: 6, stack: [[G, { grow: fn('grow'), nums: list('L', 1, 2, 3, 4) }]] },
      ],
      prints: ['[1, 2, 3, 4]'],
    },
  },
  {
    name: 'lines: a closure shows what it captured, which outlives the frame that made it',
    code: {
      python: `def counter():
    count = 0
    def tick():
        nonlocal count
        count += 1
        return count
    # (line 7: the JS closes tick here)
    return tick
# (line 9: the JS closes counter here)
c = counter()
c()
`,
      javascript: `function counter() {
  let count = 0;
  function tick() {
    count; // Python's nonlocal count is a step too
    count += 1;
    return count;
  }
  return tick;
}
const c = counter();
c();
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 10, stack: [[G, { counter: fn('counter') }]] },
        { line: 2, stack: [[G, { counter: fn('counter') }], ['counter', {}]] },
        { line: 3, stack: [[G, { counter: fn('counter') }], ['counter', { count: 0 }]] },
        { line: 8, stack: [[G, { counter: fn('counter') }], ['counter', { count: 0, tick: closure('T', 'tick', ['count', 0]) }]] },
        {
          event: 'return',
          line: 8,
          stack: [[G, { counter: fn('counter') }], ['counter', { count: 0, tick: closure('T', 'tick', ['count', 0]) }]],
          returning: closure('T', 'tick', ['count', 0]),
        },
        // counter's frame is gone, but tick still holds count.
        { line: 11, stack: [[G, { counter: fn('counter'), c: closure('T', 'tick', ['count', 0]) }]] },
        { line: 4, stack: [[G, { counter: fn('counter'), c: closure('T', 'tick', ['count', 0]) }], ['tick', {}]] },
        { line: 5, stack: [[G, { counter: fn('counter'), c: closure('T', 'tick', ['count', 0]) }], ['tick', {}]] },
        { line: 6, stack: [[G, { counter: fn('counter'), c: closure('T', 'tick', ['count', 1]) }], ['tick', {}]] },
        { event: 'return', line: 6, stack: [[G, { counter: fn('counter'), c: closure('T', 'tick', ['count', 1]) }], ['tick', {}]], returning: 1 },
        { event: 'return', line: 11, stack: [[G, { counter: fn('counter'), c: closure('T', 'tick', ['count', 1]) }]] },
      ],
    },
  },
  {
    name: 'lines: closures capture from every function around them, a captured list by reference, and nothing from the top level',
    code: {
      python: `rate = 2
def outer(items):
    total = 0
    def middle():
        def inner(x):
            items.append(x * rate + total)
            return items
        # (line 8: the JS closes inner here)
        return inner
    # (line 10: the JS closes middle here)
    return middle()
# (line 12: the JS closes outer here)
f = outer([])
f(5)
`,
      javascript: `let rate = 2;
function outer(items) {
  let total = 0;
  function middle() {
    function inner(x) {
      items.push(x * rate + total);
      return items;
    }
    return inner;
  }
  return middle();
}
const f = outer([]);
f(5);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      firstSteps: true,
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { rate: 2 }]] },
        { line: 13, stack: [[G, { rate: 2, outer: fn('outer') }]] },
        { line: 3, stack: [[G, { rate: 2, outer: fn('outer') }], ['outer', { items: list('L') }]] },
        { line: 4, stack: [[G, { rate: 2, outer: fn('outer') }], ['outer', { items: list('L'), total: 0 }]] },
        {
          line: 11,
          // middle uses items and total only through inner, which it makes: it captures them too.
          stack: [[G, { rate: 2, outer: fn('outer') }], ['outer', { items: list('L'), total: 0, middle: closure('M', 'middle', ['items', list('L')], ['total', 0]) }]],
        },
        {
          line: 5,
          stack: [
            [G, { rate: 2, outer: fn('outer') }],
            ['outer', { items: list('L'), total: 0, middle: closure('M', 'middle', ['items', list('L')], ['total', 0]) }],
            ['middle', {}],
          ],
        },
        {
          line: 9,
          stack: [
            [G, { rate: 2, outer: fn('outer') }],
            ['outer', { items: list('L'), total: 0, middle: closure('M', 'middle', ['items', list('L')], ['total', 0]) }],
            ['middle', { inner: closure('I', 'inner', ['items', list('L')], ['total', 0]) }],
          ],
        },
      ],
    },
  },
  {
    name: 'lines: a default value is kept on the function in Python; JS works one out on every call',
    code: {
      python: `def greet(name, greeting="Hi"):
    return greeting + " " + name
# (line 3: the JS closes greet here)
s = greet("Ada")
`,
      javascript: `function greet(name, greeting = "Hi") {
  return greeting + " " + name;
}
const s = greet("Ada");
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 4, stack: [[G, { greet: withDefaults('greet', ['greeting', 'Hi']) }]] },
        { line: 2, stack: [[G, { greet: withDefaults('greet', ['greeting', 'Hi']) }], ['greet', { name: 'Ada', greeting: 'Hi' }]] },
        {
          event: 'return',
          line: 2,
          stack: [[G, { greet: withDefaults('greet', ['greeting', 'Hi']) }], ['greet', { name: 'Ada', greeting: 'Hi' }]],
          returning: 'Hi Ada',
        },
        { event: 'return', line: 4, stack: [[G, { greet: withDefaults('greet', ['greeting', 'Hi']), s: 'Hi Ada' }]] },
      ],
    },
  },
  {
    name: 'lines: an uncaught exception leaves each frame it passes through, innermost first',
    code: {
      python: `def check(n):
    if n < 0:
        raise ValueError("negative")
    # (line 4: the JS closes its if here)
    return n
# (line 6: the JS closes check here)
a = check(2)
b = check(-1)
`,
      javascript: `function check(n) {
  if (n < 0) {
    throw new RangeError("negative");
  }
  return n;
}
const a = check(2);
const b = check(-1);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    expect: {
      steps: ((): StepShape[] => {
        const error = { python: 'ValueError: negative', js: 'RangeError: negative' };
        const g = (more: Record<string, Local> = {}) => [G, { check: fn('check'), ...more }] as [string, Record<string, Local>];
        return [
          { line: 1, stack: [[G, {}]] },
          { line: 7, stack: [g()] },
          { line: 2, stack: [g(), ['check', { n: 2 }]] },
          { line: 5, stack: [g(), ['check', { n: 2 }]] },
          { event: 'return', line: 5, stack: [g(), ['check', { n: 2 }]], returning: 2 },
          { line: 8, stack: [g({ a: 2 })] },
          { line: 2, stack: [g({ a: 2 }), ['check', { n: -1 }]] },
          { line: 3, stack: [g({ a: 2 }), ['check', { n: -1 }]] },
          { event: 'exception', line: 3, stack: [g({ a: 2 }), ['check', { n: -1 }]], error },
          { event: 'exception', line: 8, stack: [g({ a: 2 })], error },
        ];
      })(),
      error: { kind: 'runtime', line: 3, message: 'negative' },
    },
  },
  {
    name: 'lines: with an entry function, the top level runs first, then the call with its arguments',
    code: {
      python: `def greet(name):
    print("hi", name)
    return len(name)
`,
      javascript: `function greet(name) {
  console.log("hi", name);
  return name.length;
}
`,
    },
    entry: { python: 'greet', js: 'greet' },
    args: [{ kind: 'value', name: 'name', value: 'Ada' }],
    mode: 'lines',
    expect: {
      steps: [
        { line: 1, stack: [[G, {}]] },
        { event: 'return', line: 1, stack: [[G, { greet: fn('greet') }]] },
        { line: 2, stack: [[G, { greet: fn('greet') }], ['greet', { name: 'Ada' }]] },
        { line: 3, stack: [[G, { greet: fn('greet') }], ['greet', { name: 'Ada' }]] },
        { event: 'return', line: 3, stack: [[G, { greet: fn('greet') }], ['greet', { name: 'Ada' }]], returning: 3 },
      ],
      prints: ['hi Ada'],
      returned: 3,
    },
  },
  {
    name: 'lines: an array argument is a plain list (Python) or Array (JS), and its visual events still come',
    code: {
      python: `def first(arr):
    x = arr[0]
    return x
`,
      javascript: `function first(arr) {
  const x = arr[0];
  return x;
}
`,
    },
    entry: { python: 'first', js: 'first' },
    args: [{ kind: 'array', name: 'arr', values: [4, 5] }],
    mode: 'lines',
    expect: {
      kinds: ['step', 'step', 'array', 'step', 'step', 'step'],
      steps: [
        { line: 1, stack: [[G, {}]] },
        { event: 'return', line: 1, stack: [[G, { first: fn('first') }]] },
        { line: 2, stack: [[G, { first: fn('first') }], ['first', { arr: list('A', 4, 5) }]] },
        { line: 3, stack: [[G, { first: fn('first') }], ['first', { arr: list('A', 4, 5), x: 4 }]] },
        { event: 'return', line: 3, stack: [[G, { first: fn('first') }], ['first', { arr: list('A', 4, 5), x: 4 }]], returning: 4 },
      ],
      returned: 4,
    },
  },
  {
    name: 'lines: a graph is a dict (Python) or object (JS) of lists, a tree is TreeNodes, and reads still come between steps',
    code: {
      python: `def first(graph, root):
    nbrs = graph["A"]
    return root.left
`,
      javascript: `function first(graph, root) {
  const nbrs = graph["A"];
  return root.left;
}
`,
    },
    entry: { python: 'first', js: 'first' },
    args: [
      { kind: 'graph', name: 'graph', directed: false, weighted: false, adjacency: [{ node: 'A', neighbours: [{ to: 'B', weight: 1 }] }, { node: 'B', neighbours: [{ to: 'A', weight: 1 }] }] },
      { kind: 'tree', name: 'root', values: [2, 1] },
    ],
    mode: 'lines',
    expect: {
      kinds: ['step', 'step', 'graph', 'tree', 'step', 'neighbours', 'step', 'step'],
      steps: (() => {
        const graph = map('G', ['A', list('NA', 'B')], ['B', list('NB', 'A')]);
        const leaf = obj('L', 'TreeNode', ['val', 1], ['left', null], ['right', null]);
        const root = obj('R', 'TreeNode', ['val', 2], ['left', leaf], ['right', null]);
        const top = [G, { first: fn('first') }] as [string, Record<string, Local>];
        return [
          { line: 1, stack: [[G, {}]] },
          { event: 'return', line: 1, stack: [top] },
          { line: 2, stack: [top, ['first', { graph, root }]] },
          { line: 3, stack: [top, ['first', { graph, root, nbrs: list('NA', 'B') }]] },
          { event: 'return', line: 3, stack: [top, ['first', { graph, root, nbrs: list('NA', 'B') }]], returning: leaf },
        ];
      })(),
      returned: [1],
    },
  },
  {
    name: 'lines: an endless loop stops at maxEvents, which counts steps',
    code: {
      python: `n = 0
while n >= 0:
    n += 1
`,
      javascript: `let n = 0;
while (n >= 0) {
  n += 1;
}
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    limits: { maxEvents: 20 },
    expect: {
      count: 20,
      firstSteps: true,
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 2, stack: [[G, { n: 0 }]] },
        { line: 3, stack: [[G, { n: 0 }]] },
        { line: 2, stack: [[G, { n: 1 }]] },
        { line: 3, stack: [[G, { n: 1 }]] },
      ],
      error: { kind: 'limit', message: 'Stopped after 20 steps', hasLine: true },
    },
  },
  {
    name: 'judge: plain arguments, an answer in place, and prints',
    code: {
      python: `def f(nums, k):
    print('k is', k)
    nums.sort()
    nums.reverse()
    return len(nums) + k
`,
      javascript: `function f(nums, k) {
  console.log('k is', k);
  nums.sort((a, b) => a - b);
  nums.reverse();
  return nums.length + k;
}
`,
    },
    entry: { python: 'f', js: 'f' },
    args: [
      { kind: 'array', name: 'nums', values: [3, 1, 2] },
      { kind: 'value', name: 'k', value: 10 },
    ],
    mode: 'judge',
    expect: {
      events: [{ kind: 'print', text: 'k is 10', line: null, vars: {} }],
      returned: 13,
      args: [[3, 2, 1], 10],
    },
  },
  {
    name: 'judge: a linked list in, a linked list out',
    code: {
      python: `def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev = head
        head = nxt
    return prev
`,
      javascript: `function reverse(head) {
  let prev = null;
  while (head) {
    const nxt = head.next;
    head.next = prev;
    prev = head;
    head = nxt;
  }
  return prev;
}
`,
    },
    entry: { python: 'reverse', js: 'reverse' },
    args: [{ kind: 'list', name: 'head', values: [1, 2, 3] }],
    mode: 'judge',
    expect: { events: [], returned: [3, 2, 1], args: [[1]] },
  },
  {
    name: 'judge: trees in and out; TreeNode and ListNode are in scope',
    code: {
      python: `def mirror(root):
    if root is None:
        return None
    return TreeNode(root.val, mirror(root.right), mirror(root.left))

def f(root):
    return [mirror(root), ListNode(1, ListNode(2))]
`,
      javascript: `function mirror(root) {
  if (root === null) {
    return null;
  }
  return new TreeNode(root.val, mirror(root.right), mirror(root.left));
}
function f(root) {
  return [mirror(root), new ListNode(1, new ListNode(2))];
}
`,
    },
    entry: { python: 'f', js: 'f' },
    args: [{ kind: 'tree', name: 'root', values: [4, 2, 7, 1, 3] }],
    mode: 'judge',
    expect: { events: [], returned: [[4, 7, 2, null, null, 3, 1], [1, 2]] },
  },
  {
    name: 'judge: a graph argument is a plain dict of neighbour lists',
    code: {
      python: `def f(graph, roads):
    return [graph['A'], roads['A']]
`,
      javascript: `function f(graph, roads) {
  return [graph['A'], roads['A']];
}
`,
    },
    entry: { python: 'f', js: 'f' },
    args: [GRAPH, WEIGHTED],
    mode: 'judge',
    expect: { events: [], returned: [['B', 'C'], [['B', 4], ['C', 1]]] },
  },
  {
    name: 'judge: an error names the innermost line of the learner’s code',
    code: {
      python: `def check(x):
    if x > 2:
        raise ValueError('too big: ' + str(x))
    return x

def f(nums):
    return [check(x) for x in nums]
`,
      javascript: `function check(x) {
  if (x > 2) {
    throw new Error('too big: ' + x);
  }
  return x;
}
function f(nums) {
  return nums.map(check);
}
`,
    },
    entry: { python: 'f', js: 'f' },
    args: [{ kind: 'value', name: 'nums', value: [1, 2, 3] }],
    mode: 'judge',
    expect: { events: [], returned: null, args: [], error: { kind: 'runtime', line: 3, message: 'too big: 3' } },
  },
  {
    name: 'judge: a syntax error',
    code: {
      python: `def f(nums)
    return nums
`,
      javascript: `function f(nums) {
  return nums +;
}
`,
    },
    entry: { python: 'f', js: 'f' },
    args: [{ kind: 'value', name: 'nums', value: [] }],
    mode: 'judge',
    expect: { events: [], error: { kind: 'syntax', hasLine: true } },
  },
  {
    name: 'judge: printing stops after MAX_PRINTS lines',
    code: {
      python: `def f(n):
    for i in range(n):
        print(i)
    return n
`,
      javascript: `function f(n) {
  for (let i = 0; i < n; i++) {
    console.log(i);
  }
  return n;
}
`,
    },
    entry: { python: 'f', js: 'f' },
    args: [{ kind: 'value', name: 'n', value: MAX_PRINTS + 50 }],
    mode: 'judge',
    expect: {
      prints: [...Array.from({ length: MAX_PRINTS }, (_, i) => String(i)), '… (the rest of the output is cut)'],
      returned: MAX_PRINTS + 50,
    },
  },
  {
    name: 'judge: a design problem calls its methods in turn',
    code: {
      python: `class Counter:
    def __init__(self, start):
        self.n = start
        self.seen = [start]

    def add(self, k):
        self.n += k
        self.seen.append(self.n)

    def get(self):
        return self.n

    def history(self):
        return self.seen
`,
      javascript: `class Counter {
  constructor(start) {
    this.n = start;
    this.seen = [start];
  }
  add(k) {
    this.n += k;
    this.seen.push(this.n);
  }
  get() {
    return this.n;
  }
  history() {
    return this.seen;
  }
}
`,
    },
    entry: { python: 'Counter', js: 'Counter' },
    args: [],
    calls: [
      { method: 'Counter', args: [5] },
      { method: 'add', args: [2] },
      { method: 'history', args: [] },
      { method: 'add', args: [-10] },
      { method: 'get', args: [] },
    ],
    mode: 'judge',
    // history() is copied when it returns, so the later add doesn't change it.
    expect: { events: [], returned: [null, null, [5, 7], null, -3] },
  },
  {
    name: 'judge: a missing method stops a design problem, keeping the answers before it',
    code: {
      python: `class Counter:
    def __init__(self):
        self.n = 0

    def get(self):
        return self.n
`,
      javascript: `class Counter {
  constructor() {
    this.n = 0;
  }
  get() {
    return this.n;
  }
}
`,
    },
    entry: { python: 'Counter', js: 'Counter' },
    args: [],
    calls: [
      { method: 'Counter', args: [] },
      { method: 'get', args: [] },
      { method: 'reset', args: [] },
      { method: 'get', args: [] },
    ],
    mode: 'judge',
    expect: { returned: [null, 0], error: { kind: 'runtime', line: null, message: 'Counter has no method called reset.' } },
  },
  {
    name: 'judge: the entry must exist',
    code: { python: `def g():\n    return 1\n`, javascript: `function g() {\n  return 1;\n}\n` },
    entry: { python: 'f', js: 'f' },
    args: [],
    mode: 'judge',
    expect: { error: { kind: 'runtime', message: 'Define a function called f.' } },
  },
  {
    name: 'lines: a linked list argument, reversed, comes back as its values',
    code: {
      python: `def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev = head
        head = nxt
    return prev
`,
      javascript: `function reverse(head) {
  let prev = null;
  while (head) {
    const nxt = head.next;
    head.next = prev;
    prev = head;
    head = nxt;
  }
  return prev;
}
`,
    },
    entry: { python: 'reverse', js: 'reverse' },
    args: [{ kind: 'list', name: 'head', values: [1, 2] }],
    mode: 'lines',
    expect: { returned: [2, 1] },
  },
  {
    name: 'lines: a design problem’s calls are stepped through',
    code: {
      python: `class Counter:
    def __init__(self):
        self.n = 0

    def add(self, k):
        self.n += k
        return self.n
`,
      javascript: `class Counter {
  constructor() {
    this.n = 0;
  }
  add(k) {
    this.n += k;
    return this.n;
  }
}
`,
    },
    entry: { python: 'Counter', js: 'Counter' },
    args: [],
    calls: [
      { method: 'Counter', args: [] },
      { method: 'add', args: [3] },
      { method: 'add', args: [4] },
    ],
    mode: 'lines',
    expect: { returned: [null, 3, 7] },
  },

  // -------------------------------------------------------------------------
  // Programs: stdin, a raw stdout, exit codes, and other files
  // -------------------------------------------------------------------------

  {
    name: 'program: input() reads a line, its prompt goes to stdout, and output keeps end and sep',
    code: {
      python: `name = input("Name? ")
age = int(input())
print("Hi", name, end="! ")
print(age + 1, "next year", sep=", ")
`,
      javascript: `const name = input("Name? ");
const age = Number(input());
process.stdout.write("Hi " + name + "! ");
console.log(age + 1 + ", next year");
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: 'Ada\n36\n',
    expect: { stdout: 'Name? Hi Ada! 37, next year\n', stderr: '', exitCode: 0, reads: [6, 6], waiting: false },
  },
  {
    name: 'program: a line without a newline at the end is still a line, and \\r\\n counts as one newline',
    code: {
      python: `a = input()
b = input()
print(a + "|" + b + "|")
`,
      javascript: `const a = input();
const b = input();
console.log(a + "|" + b + "|");
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: 'one\r\ntwo',
    expect: { stdout: 'one|two|\n', exitCode: 0, reads: [0, 0] },
  },
  {
    name: 'program: reading past the end of input is EOFError on its line, with exit code 1 and the output so far',
    code: {
      python: `first = input()
print(first)
second = input()
`,
      javascript: `const first = input();
console.log(first);
const second = input();
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: 'only\n',
    expect: { stdout: 'only\n', exitCode: 1, reads: [0], waiting: false, error: { kind: 'runtime', line: 3, message: 'EOFError: EOF when reading a line' } },
  },
  {
    name: 'program: reading all of stdin at once',
    code: {
      python: `import sys
words = sys.stdin.read().split()
print(len(words), words[-1].upper())
`,
      javascript: `const fs = require("fs");
const words = fs.readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);
console.log(words.length, words[words.length - 1].toUpperCase());
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: 'to be\nor not\nto be',
    expect: { stdout: '6 BE\n', exitCode: 0, reads: [0, 0, 0] },
  },
  {
    name: 'program: an exit code ends the run there, with no error',
    code: {
      python: `import sys
print("bye")
sys.exit(3)
print("never")
`,
      javascript: `const fs = require("fs");
console.log("bye");
process.exit(3);
console.log("never");
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    expect: { stdout: 'bye\n', exitCode: 3 },
  },
  {
    name: 'program: errors and warnings go to stderr, apart from stdout',
    code: {
      python: `import sys
print("out")
print("err", file=sys.stderr)
`,
      javascript: `const fs = require("fs");
console.log("out");
console.error("err");
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    expect: { stdout: 'out\n', stderr: 'err\n', exitCode: 0, prints: ['out', 'err'] },
  },
  {
    name: 'program: an error ends the run with exit code 1, keeping what it wrote',
    code: {
      python: `print("start")
n = int(input())
`,
      javascript: `console.log("start");
const n = BigInt(input());
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: 'x\n',
    expect: { stdout: 'start\n', exitCode: 1, error: { kind: 'runtime', line: 2 } },
  },
  {
    name: 'program: the replay console stops at a read past the end, even inside try, and keeps the prompt',
    code: {
      python: `print("Guess a number")
try:
    guess = input("> ")
except Exception:
    print("no input")
`,
      javascript: `console.log("Guess a number");
try {
  const guess = input("> ");
} catch (e) {
  console.log("no input");
}
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    moreInput: true,
    expect: { stdout: 'Guess a number\n> ', exitCode: null, reads: [], waiting: true },
  },
  {
    name: 'program: the replay console reads what it was given before it waits',
    code: {
      python: `total = 0
while True:
    total += int(input("n: "))
    print("total", total)
`,
      javascript: `let total = 0;
while (true) {
  total += Number(input("n: "));
  console.log("total", total);
}
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '2\n5\n',
    moreInput: true,
    expect: { stdout: 'n: total 2\nn: total 7\nn: ', exitCode: null, reads: [3, 14], waiting: true },
  },
  {
    name: 'program: where a read happened counts as a JavaScript string does (an emoji is two)',
    code: {
      python: `print("😀", end="")
x = input()
`,
      javascript: `process.stdout.write("😀");
const x = input();
`,
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: 'a\n',
    expect: { stdout: '😀', reads: [2] },
  },
  {
    name: 'program: stdin in line-by-line mode, so a program can be watched reading it',
    code: {
      python: `x = input()
print(x * 2)
`,
      javascript: `const x = input();
console.log(x.repeat(2));
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    stdin: 'ab\n',
    expect: { stdout: 'abab\n', exitCode: 0, reads: [0] },
  },
  {
    name: 'program: judge mode runs the top level as written',
    code: {
      python: `n = int(input())
print(sum(range(n + 1)))
`,
      javascript: `const n = Number(input());
console.log((n * (n + 1)) / 2);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'judge',
    stdin: '100\n',
    expect: { stdout: '5050\n', exitCode: 0 },
  },
  {
    name: 'files: the main file imports another, and reads a data file beside it',
    code: {
      python: `from shapes import area
print(area(3, 4))
print(open("note.txt").read())
`,
      javascript: `const { area } = require("./shapes");
console.log(area(3, 4));
console.log(require("fs").readFileSync("note.txt", "utf8"));
`,
    },
    files: {
      python: { 'shapes.py': 'def area(w, h):\n    return w * h\n', 'note.txt': 'hello' },
      javascript: { 'shapes.js': 'exports.area = (w, h) => w * h;\n', 'note.txt': 'hello' },
      typescript: { 'shapes.ts': 'export function area(w: number, h: number): number {\n  return w * h;\n}\n', 'note.txt': 'hello' },
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    expect: { stdout: '12\nhello\n', exitCode: 0, prints: ['12', 'hello'] },
  },
  {
    name: 'files: a file in a folder, importing its neighbour',
    code: {
      python: `from geo import square
print(square.area(5))
`,
      javascript: `const square = require("./geo/square");
console.log(square.area(5));
`,
    },
    files: {
      python: { 'geo/square.py': 'from geo.rect import area as rect\n\ndef area(s):\n    return rect(s, s)\n', 'geo/rect.py': 'def area(w, h):\n    return w * h\n' },
      javascript: { 'geo/square.js': 'const rect = require("./rect").area;\n\nexports.area = (s) => rect(s, s);\n', 'geo/rect.js': 'exports.area = (w, h) => w * h;\n' },
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    expect: { stdout: '25\n', exitCode: 0 },
  },
  {
    name: 'files: a function in the main file can use another file, in function mode too',
    code: {
      python: `from helpers import double

def run(arr):
    return [double(x) for x in arr]
`,
      javascript: `const { double } = require("./helpers");

function run(arr) {
  return arr.map((x) => double(x));
}
`,
    },
    files: {
      python: { 'helpers.py': 'def double(x):\n    return 2 * x\n' },
      javascript: { 'helpers.js': 'exports.double = (x) => 2 * x;\n' },
    },
    entry: { python: 'run', js: 'run' },
    args: [{ kind: 'value', name: 'arr', value: [1, 2, 3] }],
    expect: { returned: [2, 4, 6] },
  },
  {
    name: 'files: an error in another file names that file and its line',
    code: {
      python: `from helpers import check
check(-1)
`,
      javascript: `const { check } = require("./helpers");
check(-1);
`,
    },
    files: {
      python: { 'helpers.py': 'def check(n):\n    if n < 0:\n        raise ValueError("negative")\n    return n\n' },
      javascript: { 'helpers.js': 'exports.check = (n) => {\n  if (n < 0) {\n    throw new RangeError("negative");\n  }\n  return n;\n};\n' },
    },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    expect: { exitCode: 1, error: { kind: 'runtime', line: 3, file: 'helpers', message: 'negative' } },
  },
  {
    name: 'files: a syntax error in another file is a syntax error there',
    code: {
      python: `import helpers
`,
      javascript: `require("./helpers");
`,
    },
    files: {
      python: { 'helpers.py': 'x = 1\ny = (2\n' },
      javascript: { 'helpers.js': 'const x = 1;\nconst y = (2;\n' },
    },
    entry: { python: '', js: '' },
    args: [],
    expect: { error: { kind: 'syntax', line: 2, file: 'helpers' } },
  },
  {
    name: 'files: a module that does not exist is a runtime error on the line asking for it',
    code: {
      python: `x = 1
import nowhere
`,
      javascript: `const x = 1;
require("./nowhere");
`,
    },
    files: {
      python: { 'helpers.py': '' },
      javascript: { 'helpers.js': '' },
    },
    entry: { python: '', js: '' },
    args: [],
    expect: { error: { kind: 'runtime', line: 2, message: 'nowhere' } },
  },
  {
    name: 'files: a path that climbs out of the folder is refused before anything runs',
    code: { python: `print("never")\n`, javascript: `console.log("never");\n` },
    files: { python: { '../secret.py': '' }, javascript: { '../secret.js': '' } },
    entry: { python: '', js: '' },
    args: [],
    stdin: '',
    expect: { stdout: '', exitCode: 1, error: { kind: 'runtime', line: null, message: 'isn’t a file name' } },
  },
  {
    name: 'files: an endless loop in another file stops at the step limit there, in visual mode too',
    code: {
      python: `from spin import forever
forever()
`,
      javascript: `const { forever } = require("./spin");
forever();
`,
    },
    files: {
      python: { 'spin.py': 'def forever():\n    n = 0\n    while True:\n        n += 1\n' },
      javascript: { 'spin.js': 'exports.forever = () => {\n  let n = 0;\n  while (true) {\n    n += 1;\n  }\n};\n' },
    },
    entry: { python: '', js: '' },
    args: [],
    limits: { maxSteps: 1000 },
    expect: { error: { kind: 'limit', file: 'spin', hasLine: true, message: 'Stopped after 1,000 steps' } },
  },
  {
    name: 'program: sys.exit / process.exit in line-by-line mode ends the steps there, with no unwinding',
    code: {
      python: `def stop(code):
    print("bye")
    raise SystemExit(code)


stop(2)
print("never")
`,
      javascript: `function stop(code) {
  console.log("bye");
  process.exit(code);
}

stop(2);
console.log("never");
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'lines',
    stdin: '',
    expect: {
      stdout: 'bye\n',
      exitCode: 2,
      steps: [
        { line: 1, stack: [[G, {}]] },
        { line: 6, stack: [[G, { stop: fn('stop') }]] },
        { line: 2, stack: [[G, { stop: fn('stop') }], ['stop', { code: 2 }]] },
        { line: 3, stack: [[G, { stop: fn('stop') }], ['stop', { code: 2 }]] },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 'program' mode: checking programs (the language tracks' tasks)
  // -------------------------------------------------------------------------

  {
    name: 'program mode: streams only, no events, and where each prompt sits',
    code: {
      python: `name = input("Name? ")
print("Hi", name, end="!\\n")
n = int(input("Age? "))
print(n + 1)
`,
      javascript: `const name = input("Name? ");
process.stdout.write("Hi " + name + "!\\n");
const n = Number(input("Age? "));
console.log(n + 1);
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    stdin: 'Ada\n36\n',
    expect: { events: [], stdout: 'Name? Hi Ada!\nAge? 37\n', stderr: '', exitCode: 0, reads: [6, 19], prompts: [[0, 6], [14, 19]], waiting: false },
  },
  {
    name: 'program mode: no stdin is empty input, so a read is EOFError',
    code: {
      python: `print("ready")
x = input()
`,
      javascript: `console.log("ready");
const x = input();
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    expect: { events: [], stdout: 'ready\n', exitCode: 1, error: { kind: 'runtime', line: 2, message: 'EOFError' } },
  },
  {
    name: 'program mode: an endless loop stops at the step limit, on its line, with no exit code',
    code: {
      python: `n = 0
while n >= 0:
    n += 1
`,
      javascript: `let n = 0;
while (n >= 0) {
  n += 1;
}
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    limits: { maxSteps: 1000 },
    expect: { events: [], stdout: '', exitCode: null, error: { kind: 'limit', hasLine: true, message: 'Stopped after 1,000 steps' } },
  },
  {
    name: 'program mode: an endless loop in another file stops at the limit, naming the file',
    code: {
      python: `from spin import forever
print("start")
forever()
`,
      javascript: `const { forever } = require("./spin");
console.log("start");
forever();
`,
    },
    files: {
      python: { 'spin.py': 'def forever():\n    n = 0\n    while True:\n        n += 1\n' },
      javascript: { 'spin.js': 'exports.forever = () => {\n  let n = 0;\n  while (true) {\n    n += 1;\n  }\n};\n' },
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    limits: { maxSteps: 1000 },
    expect: { stdout: 'start\n', exitCode: null, error: { kind: 'limit', file: 'spin', hasLine: true } },
  },
  {
    name: 'program mode: an entry function gets plain arguments after the top level',
    code: {
      python: `def double_all(xs):
    print("doubling", len(xs))
    return [2 * x for x in xs]
`,
      javascript: `function doubleAll(xs) {
  console.log("doubling", xs.length);
  return xs.map((x) => 2 * x);
}
`,
    },
    entry: { python: 'double_all', js: 'doubleAll' },
    args: [{ kind: 'value', name: 'xs', value: [1, 2, 3] }],
    mode: 'program',
    expect: { events: [], stdout: 'doubling 3\n', exitCode: 0, returned: [2, 4, 6] },
  },
  {
    name: 'program mode: the clock stands where the request puts it',
    code: {
      python: `import time
from datetime import datetime, timezone
print(int(time.time()))
print(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"))
`,
      javascript: `console.log(Math.floor(Date.now() / 1000));
console.log(new Date().toISOString().slice(0, 16).replace("T", " "));
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    clock: 1_700_000_000_000,
    expect: { stdout: '1700000000\n2023-11-14 22:13\n', exitCode: 0 },
  },
  {
    name: 'program mode: unit tests run after the top level, each with its outcome',
    code: {
      python: `def add(a, b):
    if a > 5:
        return a + b + 1
    return a + b


# the first item's name
def first(items):
    return items[0]['name']
`,
      javascript: `function add(a, b) {
  if (a > 5) {
    return a + b + 1;
  }
  return a + b;
}

function first(items) {
  return items[0].name;
}
`,
    },
    tests: {
      python: `def test_small():
    assert add(2, 3) == 5


def test_big():
    assert add(10, 1) == 11


def test_first():
    assert first([]) == 'x'


def test_raises():
    with raises(IndexError):
        first([])


def test_message():
    assert add(1, 1) != 2, 'one and one'
`,
      javascript: `test("test_small", () => {
  expect(add(2, 3)).toBe(5);
});
test("test_big", () => {
  expect(add(10, 1)).toBe(11);
});
test("test_first", () => {
  expect(first([])).toBe("x");
});
test("test_raises", () => {
  expect(() => first([])).toThrow(TypeError);
});
test("test_message", () => {
  expect(add(1, 1)).not.toBe(2);
});
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    expect: {
      stdout: '',
      exitCode: 0,
      tests: [
        { name: 'test_small', passed: true },
        { name: 'test_big', passed: false, message: { python: 'Expected add(10, 1) == 11, but add(10, 1) is 12', js: 'Expected 11, but got 12' }, line: null },
        {
          name: 'test_first',
          passed: false,
          message: { python: 'IndexError: list index out of range', js: "TypeError: Cannot read properties of undefined (reading 'name')" },
          line: 9,
        },
        { name: 'test_raises', passed: true },
        { name: 'test_message', passed: false, message: { python: 'one and one', js: 'Expected anything but 2' }, line: null },
      ],
    },
  },
  {
    name: 'program mode: a top level that fails runs no tests',
    code: {
      python: `x = 1 / 0
`,
      javascript: `const x = null.y;
`,
    },
    tests: {
      python: `def test_x():
    assert x == 1
`,
      javascript: `test("test_x", () => {
  expect(x).toBe(1);
});
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    expect: { exitCode: 1, tests: [], error: { kind: 'runtime', line: 1 } },
  },
  {
    name: 'program mode: an endless loop inside a test stops the run there',
    code: {
      python: `def spin():
    while True:
        pass
`,
      javascript: `function spin() {
  while (true) {}
}
`,
    },
    tests: {
      python: `def test_one():
    assert True


def test_spin():
    spin()
`,
      javascript: `test("test_one", () => {
  expect(true).toBe(true);
});
test("test_spin", () => {
  spin();
});
`,
    },
    entry: { python: '', js: '' },
    args: [],
    mode: 'program',
    limits: { maxSteps: 1000 },
    expect: { exitCode: null, tests: [{ name: 'test_one', passed: true }], error: { kind: 'limit', hasLine: true } },
  },
];

/** The entry name for a language. */
export const entryFor = (c: ContractCase, language: Language) => (language === 'python' ? c.entry.python : c.entry.js);

type Step = Extract<RunEvent, { kind: 'step' }>;

const isStep = (e: RunEvent): e is Step => e.kind === 'step';

/** Labels in order of first appearance, so two runs compare by which names share objects, not by their ids. */
function labeller() {
  const labels = new Map<string, string>();
  return (key: string) => {
    let label = labels.get(key);
    if (label === undefined) labels.set(key, (label = `#${labels.size + 1}`));
    return label;
  };
}

/** A case's steps as a language must draw them. */
export function expectedSteps(steps: readonly StepShape[], language: Language): DrawnStep[] {
  const side: Side = language === 'python' ? 'python' : 'js';
  const py = side === 'python';
  const label = labeller();
  const draw = (s: Shape): Drawn => {
    if (s === null) return { prim: py ? 'None' : 'null', type: 'none' };
    if (typeof s === 'number') return { prim: String(s), type: 'number' };
    if (typeof s === 'boolean') return { prim: py ? (s ? 'True' : 'False') : String(s), type: 'boolean' };
    if (typeof s === 'string') return { prim: py ? `'${s}'` : JSON.stringify(s), type: 'string' };
    if ('nothing' in s) return { prim: py ? 'None' : 'undefined', type: 'none' };
    const ref = label(s.ref);
    if ('list' in s) return { ref, type: py ? 'list' : 'Array', items: s.list.map(draw) };
    if ('map' in s) {
      return py
        ? { ref, type: 'dict', entries: s.map.map(([k, v]): [Drawn, Drawn] => [draw(k), draw(v)]) }
        : { ref, type: 'Object', fields: s.map.map(([k, v]): [string, Drawn] => [k, draw(v)]) };
    }
    if ('obj' in s) return { ref, type: s.obj, fields: s.fields.map(([k, v]): [string, Drawn] => [k, draw(v)]) };
    const f: Drawn = { ref, type: 'function', name: s.fn };
    if (s.captured?.length) f.captured = s.captured.map(([k, v]): [string, Drawn] => [k, draw(v)]);
    if (py && s.defaults?.length) f.defaults = s.defaults.map(([k, v]): [string, Drawn] => [k, draw(v)]);
    return f;
  };
  return steps.map((step) => {
    const stack = step.stack.map(([name, locals]): [string, [string, Drawn][]] => [
      name,
      Object.entries(locals).flatMap(([local, v]): [string, Drawn][] => {
        if (v !== null && typeof v === 'object' && 'only' in v) return v.only === side ? [[local, draw(v.value)]] : [];
        return [[local, draw(v)]];
      }),
    ]);
    const out: DrawnStep = { event: step.event ?? 'line', line: step.line, stack };
    if (step.returning !== undefined) out.returning = draw(step.returning);
    if (step.error) out.message = step.error[side];
    return out;
  });
}

/** A run's steps as the tests compare them: each value drawn in full from its step's heap. */
export function drawnSteps(events: readonly RunEvent[]): DrawnStep[] {
  const label = labeller();
  return events.filter(isStep).map((e) => {
    const heap = new Map(e.heap.map((o) => [o.id, o]));
    const draw = (v: MemValue, path: readonly string[] = []): Drawn => {
      if ('prim' in v) return { prim: v.prim, type: v.type };
      const ref = label(v.ref);
      const o = heap.get(v.ref);
      if (!o) return { ref, type: 'missing' };
      if (path.includes(v.ref)) return { ref, type: o.type };
      const inner = [...path, v.ref];
      switch (o.kind) {
        case 'list':
        case 'tuple':
        case 'set':
          return { ref, type: o.type, items: o.items.map((x) => draw(x, inner)) };
        case 'dict':
          return { ref, type: o.type, entries: o.entries.map(([k, x]): [Drawn, Drawn] => [draw(k, inner), draw(x, inner)]) };
        case 'object':
          return { ref, type: o.type, fields: o.fields.map(([k, x]): [string, Drawn] => [k, draw(x, inner)]) };
        case 'function': {
          const f: Drawn = { ref, type: o.type, name: o.name };
          if (o.captured) f.captured = o.captured.map(([k, x]): [string, Drawn] => [k, draw(x, inner)]);
          if (o.defaults) f.defaults = o.defaults.map(([k, x]): [string, Drawn] => [k, draw(x, inner)]);
          return f;
        }
      }
    };
    const stack = e.stack.map((f): [string, [string, Drawn][]] => [f.fn, f.locals.map(([name, v]): [string, Drawn] => [name, draw(v)])]);
    const out: DrawnStep = { event: e.event, line: e.line, stack };
    const returning = e.stack.at(-1)?.returning;
    if (returning) out.returning = draw(returning);
    if (e.message !== undefined) out.message = e.message;
    return out;
  });
}

/**
 * What every run's steps must satisfy, whatever the program: the Global frame
 * first and always the same; frame ids unique, each keeping its function and,
 * once gone, never back; the step's line the innermost frame's; `returning`
 * only on a function's 'return' step and a message on every 'exception' step;
 * a heap of exactly the objects the stack reaches, each once, each id keeping
 * its kind. Returns the problems found.
 */
export function stepProblems(events: readonly RunEvent[]): string[] {
  const problems: string[] = [];
  const fns = new Map<string, string>();
  const gone = new Set<string>();
  const kinds = new Map<string, HeapObject['kind']>();
  let live: string[] = [];
  let globalId: string | null = null;
  events.filter(isStep).forEach((e, k) => {
    const at = `step ${k} (line ${e.line})`;
    const ids = e.stack.map((f) => f.id);
    if (e.stack.length === 0 || e.stack[0].fn !== 'Global frame') problems.push(`${at}: doesn't start with the Global frame`);
    globalId ??= ids[0];
    if (ids[0] !== globalId) problems.push(`${at}: the Global frame's id changed`);
    if (new Set(ids).size !== ids.length) problems.push(`${at}: repeats a frame id`);
    for (const f of e.stack) {
      if (gone.has(f.id)) problems.push(`${at}: frame ${f.id} came back`);
      if ((fns.get(f.id) ?? f.fn) !== f.fn) problems.push(`${at}: frame ${f.id} changed function`);
      fns.set(f.id, f.fn);
    }
    for (const id of live) if (!ids.includes(id)) gone.add(id);
    live = ids;
    const top = e.stack.at(-1)!;
    if (e.line !== top.line) problems.push(`${at}: the line isn't the innermost frame's`);
    e.stack.forEach((f, i) => {
      const allowed = e.event === 'return' && i === e.stack.length - 1 && e.stack.length > 1;
      if (allowed !== (f.returning !== undefined)) problems.push(`${at}: ${f.fn} ${allowed ? 'has no' : 'has a'} returning value`);
    });
    if ((e.event === 'exception') !== (e.message !== undefined)) problems.push(`${at}: message on the wrong kind of step`);
    // The heap: each object once, and exactly those the stack reaches.
    const heap = new Map<string, HeapObject>();
    for (const o of e.heap) {
      if (heap.has(o.id)) problems.push(`${at}: object ${o.id} listed twice`);
      heap.set(o.id, o);
      if ((kinds.get(o.id) ?? o.kind) !== o.kind) problems.push(`${at}: object ${o.id} changed kind`);
      kinds.set(o.id, o.kind);
    }
    const reached = new Set<string>();
    const reach = (v: MemValue) => {
      if ('prim' in v || reached.has(v.ref)) return;
      reached.add(v.ref);
      const o = heap.get(v.ref);
      if (!o) return void problems.push(`${at}: ${v.ref} isn't in the heap`);
      if (o.kind === 'dict') o.entries.forEach(([a, b]) => (reach(a), reach(b)));
      else if (o.kind === 'object') o.fields.forEach(([, b]) => reach(b));
      else if (o.kind === 'function') [...(o.captured ?? []), ...(o.defaults ?? [])].forEach(([, b]) => reach(b));
      else o.items.forEach(reach);
    };
    for (const f of e.stack) {
      f.locals.forEach(([, v]) => reach(v));
      if (f.returning) reach(f.returning);
    }
    if (reached.size !== heap.size) problems.push(`${at}: the heap holds objects nothing reaches`);
  });
  return problems;
}

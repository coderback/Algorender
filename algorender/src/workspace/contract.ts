// Shared cases every runtime must pass, so Python and JS/TS behave the same.
// Each runtime's test file runs these through its own run() and compares.
// The programs are written line-for-line alike, so expected lines match too.

import type { Arg, Json, Language, Limits, RunError, RunEvent } from './protocol';

export type ContractCase = {
  name: string;
  /** Source per language; a case may skip a language by leaving it out. */
  code: Partial<Record<Language, string>>;
  entry: { python: string; js: string };
  args: Arg[];
  limits?: Partial<Limits>;
  expect: {
    /** The exact event list, when the case pins it. */
    events?: RunEvent[];
    /** Only the kinds, in order, when exact values don't matter. */
    kinds?: RunEvent['kind'][];
    /** Exactly this many events (every kind counts toward maxEvents). */
    count?: number;
    arrays?: Record<string, number[]>;
    grids?: Record<string, (number | null)[][]>;
    returned?: Json;
    /**
     * Error kind and line; `message` must contain this text when given;
     * `hasLine` asks for some learner line without pinning which (a limit
     * stops wherever the loop happens to be).
     */
    error?: Pick<RunError, 'kind'> & { line?: number | null; message?: string; hasLine?: boolean };
  };
};

const at = (line: number | null, vars: Record<string, number | string | boolean | null> = {}) => ({ line, vars });
const cell = (index: number, value: number) => ({ array: 'arr', index, value });
/** A cell of grid `grid` as a comparison operand, or (without a value) as a `from` entry. */
const gcell = (grid: string, row: number, col: number, value: number | null) => ({ grid, row, col, value });
const read = (grid: string, row: number, col: number) => ({ grid, row, col });

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
    name: 'a missing entry function says what to define',
    code: { python: `def something_else(arr):\n    pass\n`, javascript: `function somethingElse(arr) {}\n` },
    entry: { python: 'bubble_sort', js: 'bubbleSort' },
    args: [{ kind: 'array', name: 'arr', values: [1] }],
    expect: { kinds: [], error: { kind: 'runtime', line: null, message: 'bubble' } },
  },
];

/** The entry name for a language. */
export const entryFor = (c: ContractCase, language: Language) => (language === 'python' ? c.entry.python : c.entry.js);

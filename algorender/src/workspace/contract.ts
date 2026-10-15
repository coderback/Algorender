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
    name: 'a missing entry function says what to define',
    code: { python: `def something_else(arr):\n    pass\n`, javascript: `function somethingElse(arr) {}\n` },
    entry: { python: 'bubble_sort', js: 'bubbleSort' },
    args: [{ kind: 'array', name: 'arr', values: [1] }],
    expect: { kinds: [], error: { kind: 'runtime', line: null, message: 'bubble' } },
  },
];

/** The entry name for a language. */
export const entryFor = (c: ContractCase, language: Language) => (language === 'python' ? c.entry.python : c.entry.js);

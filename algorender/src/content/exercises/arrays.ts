// Exercises on a visual array: the classic sorts and binary search.

import type { LegendEntry } from '@/engine/module';
import type { Arg, Language, RunResult } from '@/workspace/protocol';
import { comparisons, crashed, listText as list, type Exercise, type Verdict } from './shared';

export type ArrayInput = { values: number[]; target?: number };

/** The entry function's arguments: the array, plus the target when there is one. */
export function arrayArgs(input: ArrayInput): Arg[] {
  const args: Arg[] = [{ kind: 'array', name: 'arr', values: input.values }];
  if (input.target != null) args.push({ kind: 'value', name: 'target', value: input.target });
  return args;
}

/** Sorted in place, smallest first, by code that actually compares elements. */
function checkSorted(input: ArrayInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const expected = [...input.values].sort((a, b) => a - b);
  const got = result.arrays.arr ?? [];
  if (got.join() !== expected.join()) return { pass: false, message: `Expected ${list(expected)}, but arr ended as ${list(got)}.` };
  if (input.values.length > 1 && comparisons(result) === 0) {
    return { pass: false, message: 'The array is sorted, but your code never compared two elements, so it can’t have sorted them itself.' };
  }
  return { pass: true, message: `Sorted ${list(input.values)} into ${list(got)}.` };
}

const SORT_LEGEND: LegendEntry[] = [{ neutral: 'Element' }, 'compare', 'swap', 'write', 'sorted'];

const SORT_TESTS: Exercise<ArrayInput>['tests'] = [
  { name: 'empty array', input: { values: [] } },
  { name: 'one element', input: { values: [7] } },
  { name: 'two out of order', input: { values: [2, 1] } },
  { name: 'already sorted', input: { values: [1, 2, 3, 4, 5] } },
  { name: 'reversed', input: { values: [9, 7, 5, 3, 1] } },
  { name: 'duplicates', input: { values: [4, 1, 4, 2, 1, 3] } },
  { name: 'all equal', input: { values: [6, 6, 6] } },
];

const SORT_EXAMPLES: Exercise<ArrayInput>['examples'] = [
  { id: 'random', label: 'Mixed', input: { values: [5, 2, 9, 1, 6, 3] } },
  { id: 'reversed', label: 'Reversed', input: { values: [6, 5, 4, 3, 2, 1] } },
  { id: 'nearly', label: 'Nearly sorted', input: { values: [1, 2, 4, 3, 5, 6] } },
];

const sortStarter = (python: string, js: string, comment: string[]): Record<Language, string> => {
  const py = comment.map((c) => `    # ${c}`).join('\n');
  const jsc = comment.map((c) => `  // ${c}`).join('\n');
  return {
    python: `def ${python}(arr):\n${py}\n    pass\n`,
    javascript: `function ${js}(arr) {\n${jsc}\n}\n`,
    typescript: `function ${js}(arr: number[]): void {\n${jsc}\n}\n`,
  };
};

const ts = (js: string, signature: string, typed: string) => js.replace(signature, typed);

const BUBBLE_JS = `function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
}
`;

const INSERTION_JS = `function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}
`;

const SELECTION_JS = `function selectionSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let smallest = i;
    for (let j = i + 1; j < n; j++) {
      if (arr[j] < arr[smallest]) {
        smallest = j;
      }
    }
    if (smallest !== i) {
      [arr[i], arr[smallest]] = [arr[smallest], arr[i]];
    }
  }
}
`;

const BINARY_JS = `function binarySearch(arr, target) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) {
      return mid;
    }
    if (arr[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}
`;


// Fill-in blanks: each solution with spans marked «n:text». Fades blank the
// decision first, then the action, then the bounds, so each level asks for a
// little more of the algorithm.

const BUBBLE_PY_BLANKS = `def bubble_sort(arr):
    n = len(arr)
    for i in range(«3:n - 1»):
        for j in range(«2:n - 1 - i»):
            if «1:arr[j] > arr[j + 1]»:
                «4:arr[j], arr[j + 1] = arr[j + 1], arr[j]»
`;
const BUBBLE_JS_BLANKS = `function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < «3:n - 1»; i++) {
    for (let j = 0; j < «2:n - 1 - i»; j++) {
      if («1:arr[j] > arr[j + 1]») {
        «4:[arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];»
      }
    }
  }
}
`;

const INSERTION_PY_BLANKS = `def insertion_sort(arr):
    for i in range(«3:1», len(arr)):
        key = «1:arr[i]»
        j = i - 1
        while j >= 0 and «2:arr[j] > key»:
            «4:arr[j + 1] = arr[j]»
            j -= 1
        «5:arr[j + 1] = key»
`;
const INSERTION_JS_BLANKS = `function insertionSort(arr) {
  for (let i = «3:1»; i < arr.length; i++) {
    const key = «1:arr[i]»;
    let j = i - 1;
    while (j >= 0 && «2:arr[j] > key») {
      «4:arr[j + 1] = arr[j];»
      j--;
    }
    «5:arr[j + 1] = key;»
  }
}
`;

const SELECTION_PY_BLANKS = `def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        smallest = «3:i»
        for j in range(«2:i + 1», n):
            if «1:arr[j] < arr[smallest]»:
                smallest = «4:j»
        if smallest != i:
            «5:arr[i], arr[smallest] = arr[smallest], arr[i]»
`;
const SELECTION_JS_BLANKS = `function selectionSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let smallest = «3:i»;
    for (let j = «2:i + 1»; j < n; j++) {
      if («1:arr[j] < arr[smallest]») {
        smallest = «4:j»;
      }
    }
    if (smallest !== i) {
      «5:[arr[i], arr[smallest]] = [arr[smallest], arr[i]];»
    }
  }
}
`;

const BINARY_PY_BLANKS = `def binary_search(arr, target):
    lo = 0
    hi = «4:len(arr) - 1»
    while «3:lo <= hi»:
        mid = «1:(lo + hi) // 2»
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = «2:mid + 1»
        else:
            hi = «5:mid - 1»
    return -1
`;
const BINARY_JS_BLANKS = `function binarySearch(arr, target) {
  let lo = 0;
  let hi = «4:arr.length - 1»;
  while («3:lo <= hi») {
    const mid = «1:Math.floor((lo + hi) / 2)»;
    if (arr[mid] === target) {
      return mid;
    }
    if (arr[mid] < target) {
      lo = «2:mid + 1»;
    } else {
      hi = «5:mid - 1»;
    }
  }
  return -1;
}
`;

/** The same distractors for JavaScript and TypeScript. */
const jsAndTs = (python: string[], js: string[]) => ({ python, javascript: js, typescript: js });

export const arrayExercises: Exercise<ArrayInput>[] = [
  {
    slug: 'bubble-sort',
    title: 'Write bubble sort',
    kind: 'write',
    visualiser: 'bubble-sort',
    summary: 'Sort an array by swapping neighbours that are out of order, and watch your own code do it.',
    task: [
      'Write `bubble_sort(arr)` (Python) or `bubbleSort(arr)` (JavaScript/TypeScript). It sorts `arr` in place, smallest first, and returns nothing.',
      'Walk through the array comparing each pair of neighbours, and swap a pair when the left one is bigger. One full pass moves the biggest value to the end; repeat until a pass needs no swaps, or until every element has had its turn.',
    ],
    entry: { python: 'bubble_sort', js: 'bubbleSort' },
    args: arrayArgs,
    starter: sortStarter('bubble_sort', 'bubbleSort', ['Sort arr in place, smallest first.', 'Compare neighbours and swap them when they are out of order.']),
    solution: {
      python: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
`,
      javascript: BUBBLE_JS,
      typescript: ts(BUBBLE_JS, 'function bubbleSort(arr) {', 'function bubbleSort(arr: number[]): void {'),
    },
    blanks: {
      python: BUBBLE_PY_BLANKS,
      javascript: BUBBLE_JS_BLANKS,
      typescript: ts(BUBBLE_JS_BLANKS, 'function bubbleSort(arr) {', 'function bubbleSort(arr: number[]): void {'),
    },
    fades: [[1], [1, 4], [1, 2, 4], [1, 2, 3, 4]],
    distractors: jsAndTs(['if arr[j] < arr[j + 1]:', 'arr[j] = arr[j + 1]'], ['if (arr[j] < arr[j + 1]) {', 'arr[j] = arr[j + 1];']),
    examples: SORT_EXAMPLES,
    tests: SORT_TESTS,
    check: checkSorted,
    markSortedAtEnd: true,
    pointers: ['j'],
    hints: [
      'You need two loops: an outer one for the passes, and an inner one that walks over neighbouring pairs `arr[j]` and `arr[j + 1]`.',
      'After pass `i`, the last `i + 1` elements are in their final places, so the inner loop can stop earlier each time.',
      'Swap with `arr[j], arr[j + 1] = arr[j + 1], arr[j]` in Python, or `[arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]` in JavaScript.',
    ],
    legend: SORT_LEGEND,
  },
  {
    slug: 'insertion-sort',
    title: 'Write insertion sort',
    kind: 'write',
    visualiser: 'insertion-sort',
    summary: 'Grow a sorted prefix by sliding each new element left into place.',
    task: [
      'Write `insertion_sort(arr)` (Python) or `insertionSort(arr)` (JavaScript/TypeScript). It sorts `arr` in place, smallest first.',
      'Keep the left part of the array sorted. Take the next element as the `key`, shift every bigger element in the sorted part one step right, then drop the key into the gap.',
    ],
    entry: { python: 'insertion_sort', js: 'insertionSort' },
    args: arrayArgs,
    starter: sortStarter('insertion_sort', 'insertionSort', ['Sort arr in place, smallest first.', 'Slide each element left past the bigger ones before it.']),
    solution: {
      python: `def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
`,
      javascript: INSERTION_JS,
      typescript: ts(INSERTION_JS, 'function insertionSort(arr) {', 'function insertionSort(arr: number[]): void {'),
    },
    blanks: {
      python: INSERTION_PY_BLANKS,
      javascript: INSERTION_JS_BLANKS,
      typescript: ts(INSERTION_JS_BLANKS, 'function insertionSort(arr) {', 'function insertionSort(arr: number[]): void {'),
    },
    fades: [[2], [2, 4], [1, 2, 4, 5], [1, 2, 3, 4, 5]],
    distractors: jsAndTs(['arr[j] = key', 'while j >= 0 and arr[j] < key:'], ['arr[j] = key;', 'while (j >= 0 && arr[j] < key) {']),
    examples: SORT_EXAMPLES,
    tests: SORT_TESTS,
    check: checkSorted,
    markSortedAtEnd: true,
    pointers: ['i', 'j'],
    hints: [
      'Start at index 1: a one-element prefix is already sorted.',
      'Save `arr[i]` in a variable before you start shifting, or the shifts will overwrite it.',
      'The shifting loop stops at the start of the array or at the first element that is not bigger than the key, so check `j >= 0` first.',
    ],
    legend: SORT_LEGEND,
  },
  {
    slug: 'selection-sort',
    title: 'Write selection sort',
    kind: 'write',
    visualiser: 'selection-sort',
    summary: 'Find the smallest remaining element and swap it into the next place.',
    task: [
      'Write `selection_sort(arr)` (Python) or `selectionSort(arr)` (JavaScript/TypeScript). It sorts `arr` in place, smallest first.',
      'For each position `i`, scan the rest of the array for the smallest element, then swap it into position `i`. That makes exactly one swap per position, however mixed up the array is.',
    ],
    entry: { python: 'selection_sort', js: 'selectionSort' },
    args: arrayArgs,
    starter: sortStarter('selection_sort', 'selectionSort', ['Sort arr in place, smallest first.', 'Find the smallest remaining element and swap it into place.']),
    solution: {
      python: `def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        smallest = i
        for j in range(i + 1, n):
            if arr[j] < arr[smallest]:
                smallest = j
        if smallest != i:
            arr[i], arr[smallest] = arr[smallest], arr[i]
`,
      javascript: SELECTION_JS,
      typescript: ts(SELECTION_JS, 'function selectionSort(arr) {', 'function selectionSort(arr: number[]): void {'),
    },
    blanks: {
      python: SELECTION_PY_BLANKS,
      javascript: SELECTION_JS_BLANKS,
      typescript: ts(SELECTION_JS_BLANKS, 'function selectionSort(arr) {', 'function selectionSort(arr: number[]): void {'),
    },
    fades: [[1], [1, 4], [1, 2, 4, 5], [1, 2, 3, 4, 5]],
    distractors: jsAndTs(['if arr[j] > arr[smallest]:', 'smallest = i + 1'], ['if (arr[j] > arr[smallest]) {', 'smallest = i + 1;']),
    examples: SORT_EXAMPLES,
    tests: SORT_TESTS,
    check: checkSorted,
    markSortedAtEnd: true,
    pointers: ['i', 'smallest', 'j'],
    hints: [
      'Remember the index of the smallest element seen so far, not its value, so you know where to swap from.',
      'The scan for position `i` starts at `i + 1`: everything before `i` is already in place.',
    ],
    legend: SORT_LEGEND,
  },
  {
    slug: 'binary-search',
    title: 'Write binary search',
    kind: 'write',
    visualiser: 'binary-search',
    summary: 'Find a value in a sorted array by halving the search window each time.',
    task: [
      'Write `binary_search(arr, target)` (Python) or `binarySearch(arr, target)` (JavaScript/TypeScript). `arr` is sorted, smallest first. Return an index where `arr[index]` equals `target`, or `-1` if it isn’t there.',
      'Keep a window `lo..hi` that must contain the target if it is anywhere. Look at the middle: if it is the target you are done; otherwise throw away the half that can’t hold it.',
    ],
    entry: { python: 'binary_search', js: 'binarySearch' },
    args: arrayArgs,
    starter: {
      python: `def binary_search(arr, target):\n    # arr is sorted. Return the index of target, or -1.\n    # Halve the window lo..hi until you find it or it is empty.\n    return -1\n`,
      javascript: `function binarySearch(arr, target) {\n  // arr is sorted. Return the index of target, or -1.\n  // Halve the window lo..hi until you find it or it is empty.\n  return -1;\n}\n`,
      typescript: `function binarySearch(arr: number[], target: number): number {\n  // arr is sorted. Return the index of target, or -1.\n  // Halve the window lo..hi until you find it or it is empty.\n  return -1;\n}\n`,
    },
    solution: {
      python: `def binary_search(arr, target):
    lo = 0
    hi = len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
      javascript: BINARY_JS,
      typescript: ts(BINARY_JS, 'function binarySearch(arr, target) {', 'function binarySearch(arr: number[], target: number): number {'),
    },
    blanks: {
      python: BINARY_PY_BLANKS,
      javascript: BINARY_JS_BLANKS,
      typescript: ts(BINARY_JS_BLANKS, 'function binarySearch(arr, target) {', 'function binarySearch(arr: number[], target: number): number {'),
    },
    fades: [[1], [1, 2, 5], [1, 2, 3, 5], [1, 2, 3, 4, 5]],
    distractors: jsAndTs(['lo = mid', 'while lo < hi:'], ['lo = mid;', 'while (lo < hi) {']),
    examples: [
      { id: 'found', label: 'Find 23', input: { values: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 } },
      { id: 'missing', label: 'Look for 40', input: { values: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 40 } },
      { id: 'first', label: 'Find the first', input: { values: [3, 6, 9, 12, 15, 18, 21], target: 3 } },
    ],
    tests: [
      { name: 'in the middle', input: { values: [1, 3, 5, 7, 9, 11, 13], target: 7 } },
      { name: 'first element', input: { values: [1, 3, 5, 7, 9, 11, 13], target: 1 } },
      { name: 'last element', input: { values: [1, 3, 5, 7, 9, 11, 13], target: 13 } },
      { name: 'missing, between values', input: { values: [1, 3, 5, 7, 9, 11, 13], target: 8 } },
      { name: 'missing, past the end', input: { values: [1, 3, 5, 7, 9, 11, 13], target: 99 } },
      { name: 'empty array', input: { values: [], target: 4 } },
      { name: 'one element, found', input: { values: [4], target: 4 } },
      { name: 'long array', input: { values: Array.from({ length: 64 }, (_, i) => i * 3), target: 141 } },
    ],
    check: (input, result) => {
      const failed = crashed(result);
      if (failed) return failed;
      const target = input.target!;
      const got = result.returned;
      const present = input.values.includes(target);
      if (typeof got !== 'number' || !Number.isInteger(got)) return { pass: false, message: `Return an index (a whole number), not ${JSON.stringify(got)}.` };
      if (present && input.values[got] !== target) {
        return { pass: false, message: `${target} is in the array, but you returned ${got}${got >= 0 && got < input.values.length ? `, where arr holds ${input.values[got]}` : ''}.` };
      }
      if (!present && got !== -1) return { pass: false, message: `${target} isn’t in the array, so return -1 (you returned ${got}).` };
      // A halving search probes at most ⌊log₂ n⌋ + 1 cells, with up to two comparisons per probe.
      const budget = 2 * (Math.floor(Math.log2(Math.max(1, input.values.length))) + 1);
      const used = comparisons(result);
      if (used > budget) {
        return {
          pass: false,
          message: `Right answer, but it took ${used} comparisons. Binary search needs at most ${budget} for ${input.values.length} elements: are you halving the window each time?`,
        };
      }
      return { pass: true, message: present ? `Found ${target} at index ${got} in ${used} comparisons.` : `Reported -1 for ${target} after ${used} comparisons.` };
    },
    markSortedAtEnd: false,
    pointers: ['lo', 'mid', 'hi'],
    hints: [
      'Start with `lo = 0` and `hi = len(arr) - 1` (or `arr.length - 1`), and loop while `lo <= hi`.',
      'The middle is `(lo + hi) // 2` in Python, `Math.floor((lo + hi) / 2)` in JavaScript.',
      'If `arr[mid]` is too small, the target can only be to its right, so move `lo` past `mid`, not onto it, or the loop may never end.',
    ],
    legend: [{ neutral: 'Element' }, { mark: 'compare', label: 'Probed' }],
  },
];

/** A bug hunt: the write-it exercise's solution and tests, starting from code with one bug. */
function bugHunt(
  base: Exercise<ArrayInput>,
  bug: { slug: string; title: string; summary: string; starter: Record<Language, string>; symptom: string; explanation: string; hints: string[] },
): Exercise<ArrayInput> {
  return {
    ...base,
    slug: bug.slug,
    title: bug.title,
    kind: 'bug',
    summary: bug.summary,
    task: [bug.symptom, 'Run it, watch what it really does on the array, and fix it. One small change is enough.'],
    starter: bug.starter,
    bug: { symptom: bug.symptom, explanation: bug.explanation },
    hints: bug.hints,
    blanks: undefined,
    fades: undefined,
    distractors: undefined,
  };
}

const writeIt = (slug: string) => arrayExercises.find((e) => e.slug === slug)!;

const INSERTION_BUG_PY = `def insertion_sort(arr):
    for i in range(1, len(arr)):
        j = i - 1
        while j >= 0 and arr[j] > arr[i]:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = arr[i]
`;
const INSERTION_BUG_JS = `function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let j = i - 1;
    while (j >= 0 && arr[j] > arr[i]) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = arr[i];
  }
}
`;

export const bugHunts: Exercise<ArrayInput>[] = [
  bugHunt(writeIt('bubble-sort'), {
    slug: 'bubble-sort-bug',
    title: 'Fix the crashing bubble sort',
    summary: 'This bubble sort crashes on its first pass. Watch where, and fix it.',
    starter: {
      python: writeIt('bubble-sort').solution.python.replace('range(n - 1 - i)', 'range(n - i)'),
      javascript: BUBBLE_JS.replace('j < n - 1 - i', 'j < n - i'),
      typescript: ts(BUBBLE_JS.replace('j < n - 1 - i', 'j < n - i'), 'function bubbleSort(arr) {', 'function bubbleSort(arr: number[]): void {'),
    },
    symptom: 'It crashes with an index error on its very first pass.',
    explanation:
      'The inner loop let `j` reach the last index, so `arr[j + 1]` read one past the end. A pass compares neighbours, so `j` must stop one short: `n - 1 - i`.',
    hints: ['Step to the last comparison of the first pass. Which two cells is it trying to compare?', 'How many neighbouring pairs does an array of n elements have?'],
  }),
  bugHunt(writeIt('binary-search'), {
    slug: 'binary-search-bug',
    title: 'Fix the binary search that never finishes',
    summary: 'Searching for some values never ends. Find the window that stops shrinking.',
    starter: {
      python: writeIt('binary-search').solution.python.replace('lo = mid + 1', 'lo = mid'),
      javascript: BINARY_JS.replace('lo = mid + 1;', 'lo = mid;'),
      typescript: ts(BINARY_JS.replace('lo = mid + 1;', 'lo = mid;'), 'function binarySearch(arr, target) {', 'function binarySearch(arr: number[], target: number): number {'),
    },
    symptom: 'Searching for a value bigger than everything in the array never finishes.',
    explanation:
      'When `arr[mid]` is too small, `mid` itself is ruled out, so the window must move past it: `lo = mid + 1`. With `lo = mid`, a window of two cells never gets smaller.',
    hints: ['Watch lo, mid and hi on the array near the end of the run. Which one stops moving?', 'Once `arr[mid]` is too small, can the answer still be at `mid`?'],
  }),
  bugHunt(writeIt('insertion-sort'), {
    slug: 'insertion-sort-bug',
    title: 'Fix the insertion sort that loses values',
    summary: 'Values vanish and others appear twice. Catch the moment one is overwritten.',
    starter: {
      python: INSERTION_BUG_PY,
      javascript: INSERTION_BUG_JS,
      typescript: ts(INSERTION_BUG_JS, 'function insertionSort(arr) {', 'function insertionSort(arr: number[]): void {'),
    },
    symptom: 'After it runs, some values have vanished and others appear twice.',
    explanation:
      'The first shift writes over `arr[i]`, so the value being inserted is lost before it is placed. Save it first (`key = arr[i]`), then compare with and insert `key`.',
    hints: ['Step to the first write of each pass. Which value disappears from the array?', 'The value you are inserting needs to survive the shifts: where could you keep it?'],
  }),
];

/** Sorted in place, largest first, by code that compares elements. */
function checkSortedDescending(input: ArrayInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const expected = [...input.values].sort((a, b) => b - a);
  const got = result.arrays.arr ?? [];
  if (got.join() !== expected.join()) return { pass: false, message: `Expected ${list(expected)}, largest first, but arr ended as ${list(got)}.` };
  if (input.values.length > 1 && comparisons(result) === 0) {
    return { pass: false, message: 'The array is in order, but your code never compared two elements.' };
  }
  return { pass: true, message: `Sorted ${list(input.values)} into ${list(got)}, largest first.` };
}

const descending = (code: string) => code.replace('arr[j] > arr[j + 1]', 'arr[j] < arr[j + 1]');

/** PRIMM's Modify step: working code to change, not a blank page. */
export const modifyExercises: Exercise<ArrayInput>[] = [
  {
    ...writeIt('bubble-sort'),
    slug: 'bubble-sort-descending',
    title: 'Make bubble sort put the largest first',
    kind: 'modify',
    summary: 'The same algorithm, the other way round: change it to sort from largest to smallest.',
    task: [
      'This bubble sort works: it sorts `arr` smallest first. Change it so it sorts **largest first** instead.',
      'Before you edit, predict: how many characters need to change? Then run it and watch the big values sink to the front.',
    ],
    starter: writeIt('bubble-sort').solution,
    solution: {
      python: descending(writeIt('bubble-sort').solution.python),
      javascript: descending(writeIt('bubble-sort').solution.javascript),
      typescript: descending(writeIt('bubble-sort').solution.typescript),
    },
    blanks: undefined,
    fades: undefined,
    distractors: undefined,
    check: checkSortedDescending,
    markSortedAtEnd: false,
    hints: [
      'Which line decides whether two neighbours are in the wrong order?',
      'For largest first, a pair is out of order when the left one is smaller.',
    ],
  },
];

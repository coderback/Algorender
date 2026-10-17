import { ArrayTracer } from '@/viz/array/tracer';
import { arrayInput } from '@/engine/inputs';
import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { COMPARISONS, WRITES, sortTraits } from './shared';

const pseudocode = [
  'mergeSort(lo, hi):',
  '  if lo ≥ hi: return',
  '  mid ← ⌊(lo + hi) / 2⌋',
  '  mergeSort(lo, mid)',
  '  mergeSort(mid + 1, hi)',
  '  merge(lo, mid, hi)',
  '',
  'merge(lo, mid, hi):',
  '  while both halves have elements:',
  '    if A[i] ≤ A[j]: B[k++] ← A[i++]',
  '    else: B[k++] ← A[j++]',
  '  move leftovers of either half into B',
  '  copy B[lo..hi] back into A[lo..hi]',
];

const BUFFER = 'buffer';

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'writes']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }
  t.addLane(BUFFER, 'merge buffer B', n);

  const halves = (lo: number, mid: number, hi: number) => [
    { from: lo, to: mid, tone: 'left' as const, label: 'left half' },
    { from: mid + 1, to: hi, tone: 'right' as const, label: 'right half' },
  ];

  function* merge(lo: number, mid: number, hi: number, depth: number): Generator<ReturnType<typeof t.frame>> {
    let i = lo;
    let j = mid + 1;
    let k = lo;
    yield t.frame({
      line: 7,
      note: `Both halves are sorted. Merge ${lo}–${mid} and ${mid + 1}–${hi} by repeatedly taking the smaller front value.`,
      pointers: { i, j, k: [BUFFER, k] },
      ranges: halves(lo, mid, hi),
      vars: { lo, mid, hi, depth },
    });

    while (i <= mid && j <= hi) {
      const a = t.value(i);
      const b = t.value(j);
      t.count('comparisons');
      const takeLeft = a <= b;
      yield t.frame({
        line: 9,
        note: `Compare the front of each half: ${a} and ${b}.`,
        marks: { compare: [i, j] },
        pointers: { i, j, k: [BUFFER, k] },
        ranges: halves(lo, mid, hi),
        vars: { lo, mid, hi, i, j, k, depth },
        checkpoint: {
          question: 'Which value goes into the buffer next?',
          choices: [`${a}, from the left half`, `${b}, from the right half`],
          answer: takeLeft ? 0 : 1,
        },
      });
      t.move(takeLeft ? i : j, [BUFFER, k]);
      yield t.frame({
        line: takeLeft ? 9 : 10,
        note: takeLeft
          ? `${a} ≤ ${b}: take ${a} from the left half. (Taking the left on ties keeps the sort stable.)`
          : `${b} < ${a}: take ${b} from the right half.`,
        marks: { write: [[BUFFER, k]] },
        // Hide a pointer once its half is used up rather than let it stray into the next range.
        pointers: {
          i: takeLeft ? (i + 1 <= mid ? i + 1 : null) : i,
          j: takeLeft ? j : j + 1 <= hi ? j + 1 : null,
          k: k + 1 <= hi ? [BUFFER, k + 1] : null,
        },
        ranges: halves(lo, mid, hi),
        vars: { lo, mid, hi, i, j, k, depth },
      });
      if (takeLeft) i++;
      else j++;
      k++;
    }

    if (i <= mid || j <= hi) {
      const side = i <= mid ? 'left' : 'right';
      const written: [string, number][] = [];
      while (i <= mid) {
        t.move(i++, [BUFFER, k]);
        written.push([BUFFER, k++]);
      }
      while (j <= hi) {
        t.move(j++, [BUFFER, k]);
        written.push([BUFFER, k++]);
      }
      yield t.frame({
        line: 11,
        note: `The ${side === 'left' ? 'right' : 'left'} half is used up, so the rest of the ${side} half follows in order.`,
        marks: { write: written },
        ranges: halves(lo, mid, hi),
        vars: { lo, mid, hi, depth },
      });
    }

    for (let x = lo; x <= hi; x++) t.move([BUFFER, x], x);
    yield t.frame({
      line: 12,
      note: `Copy the merged run back. Positions ${lo}–${hi} are now sorted.`,
      ranges: [{ from: lo, to: hi, tone: 'done', label: 'merged' }],
      vars: { lo, mid, hi, depth },
    });
  }

  function* sort(lo: number, hi: number, depth: number): Generator<ReturnType<typeof t.frame>> {
    if (lo >= hi) return;
    const mid = Math.floor((lo + hi) / 2);
    yield t.frame({
      line: 2,
      note: `Split positions ${lo}–${hi} into ${lo}–${mid} and ${mid + 1}–${hi}, and sort each half first.`,
      ranges: halves(lo, mid, hi),
      vars: { lo, mid, hi, depth },
    });
    yield* sort(lo, mid, depth + 1);
    yield* sort(mid + 1, hi, depth + 1);
    yield* merge(lo, mid, hi, depth);
  }

  yield t.frame({
    note: 'Merge sort splits the array in half, sorts each half recursively, then merges the two sorted halves. A single element is already sorted, so the splitting stops there.',
  });
  yield* sort(0, n - 1, 0);
  t.markAllSorted();
  yield t.frame({ note: 'Sorted: the final merge combined two sorted halves of the whole array.' });
}

export const mergeSort = defineAlgorithm<number[], ArrayState>({
  kind: 'algorithm',
  slug: 'merge-sort',
  view: 'array',
  input: arrayInput({ min: 5, max: 99, defaultSize: 10, maxSize: 32 }),
  pseudocode,
  stats: [COMPARISONS, WRITES],
  legend: [{ neutral: 'Not yet placed' }, 'compare', 'write', 'sorted'],
  run,
  content: {
    idea: 'Split the array in half, sort each half recursively, then merge the two sorted halves by repeatedly taking the smaller front value. The work happens on the way back up: merging two sorted lists is easy.',
    invariant: 'When merge(lo, mid, hi) runs, both halves are already sorted, and the buffer always holds the smallest remaining values in order.',
    whenToUse: 'When you need a guaranteed O(n log n) and a stable sort, such as sorting linked lists or data too big for memory (external sorting). The price is O(n) extra space for the buffer.',
    traits: sortTraits({ stable: true, inPlace: false, comparisonBased: true }),
    experiments: [
      { example: 'sorted', prompt: 'The work barely changes: merge sort does O(n log n) whatever the order.' },
      { example: 'reversed', prompt: 'Each merge empties one half before touching the other. Watch the leftovers step.' },
    ],
  },
});

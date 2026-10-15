import { ArrayTracer } from '@/viz/array/tracer';
import { COMPARISONS, SWAPS, type ArrayAlgorithm } from '../types';

const pseudocode = [
  'for i from 0 to n − 2:',
  '  min ← i',
  '  for j from i + 1 to n − 1:',
  '    if A[j] < A[min]:',
  '      min ← j',
  '  swap A[i] and A[min]',
];

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'swaps']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }

  yield t.frame({
    note: 'Selection sort repeatedly finds the smallest value in the unsorted part and swaps it to the front of that part.',
  });

  for (let i = 0; i < n - 1; i++) {
    const unsorted = [{ from: i, to: n - 1, tone: 'active' as const, label: 'unsorted' }];
    let min = i;
    yield t.frame({
      line: 1,
      note: `Find the smallest value in positions ${i}–${n - 1}. Start by assuming it is ${t.value(i)} at position ${i}.`,
      marks: { min: [i] },
      pointers: { i, min },
      ranges: unsorted,
      vars: { i, min },
    });

    for (let j = i + 1; j < n; j++) {
      const v = t.value(j);
      const best = t.value(min);
      t.count('comparisons');
      const smaller = v < best;
      yield t.frame({
        line: 3,
        note: smaller ? `${v} < ${best}: a new smallest value.` : `${v} ≥ ${best}: not smaller, keep looking.`,
        marks: { compare: [j], min: [min] },
        pointers: { i, j, min },
        ranges: unsorted,
        vars: { i, j, min },
      });
      if (smaller) {
        min = j;
        yield t.frame({
          line: 4,
          note: `Remember position ${j} (value ${v}) as the smallest so far.`,
          marks: { min: [min] },
          pointers: { i, j, min },
          ranges: unsorted,
          vars: { i, j, min },
        });
      }
    }

    const smallest = t.value(min);
    if (min !== i) {
      t.swap(i, min);
      t.markSorted(i);
      yield t.frame({
        line: 5,
        note: `Swap the smallest value, ${smallest}, into position ${i}. Positions 0–${i} are now final.`,
        marks: { swap: [i, min] },
        pointers: { i, min },
        vars: { i, min },
      });
    } else {
      t.markSorted(i);
      yield t.frame({
        line: 5,
        note: `${smallest} is already at position ${i}, so no swap is needed. Positions 0–${i} are now final.`,
        pointers: { i },
        vars: { i, min },
      });
    }
  }

  t.markAllSorted();
  yield t.frame({ note: 'Sorted: the last element is the largest, so it is already in place.' });
}

export const selectionSort: ArrayAlgorithm = {
  slug: 'selection-sort',
  view: 'array',
  input: { min: 5, max: 99, defaultSize: 10, maxSize: 40 },
  pseudocode,
  stats: [COMPARISONS, SWAPS],
  legend: ['compare', 'min', 'swap', 'sorted'],
  run,
  content: {
    idea: 'Scan the unsorted part for its smallest value and swap it to the front of that part. The sorted part grows from the left by one element per pass.',
    invariant: 'Positions 0 to i − 1 hold the i smallest values, already in their final order.',
    whenToUse: 'When writes are expensive: it makes at most n − 1 swaps. It still makes about n²/2 comparisons whatever the input, so it is rarely the fastest choice.',
    properties: { stable: false, inPlace: true, comparisonBased: true },
    experiments: [
      { preset: 'sorted', prompt: 'The comparison count does not drop: selection sort always scans the whole unsorted part.' },
      { preset: 'reversed', prompt: 'Count the swaps: still at most n − 1, unlike bubble sort.' },
    ],
  },
};

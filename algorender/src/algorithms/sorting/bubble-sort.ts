import { arrayInput } from '@/engine/inputs';
import { defineAlgorithm } from '@/engine/module';
import { ArrayTracer } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { COMPARISONS, SWAPS, sortTraits } from './shared';

const pseudocode = [
  'for i from 0 to n − 2:',
  '  swapped ← false',
  '  for j from 0 to n − i − 2:',
  '    if A[j] > A[j + 1]:',
  '      swap A[j] and A[j + 1]',
  '      swapped ← true',
  '  if not swapped: stop',
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
    note: 'Bubble sort compares neighbours and swaps any pair that is out of order. Each pass carries the largest unsorted value to the end.',
  });

  for (let i = 0; i < n - 1; i++) {
    const end = n - 1 - i;
    const unsorted = [{ from: 0, to: end, tone: 'active' as const, label: 'unsorted' }];
    let swapped = false;
    yield t.frame({
      line: 1,
      note: `Pass ${i + 1}: positions 0–${end} are still unsorted.`,
      ranges: unsorted,
      vars: { i, swapped },
    });

    for (let j = 0; j < end; j++) {
      const a = t.value(j);
      const b = t.value(j + 1);
      t.count('comparisons');
      const outOfOrder = a > b;
      const view = { pointers: { j, 'j+1': j + 1 }, ranges: unsorted };
      yield t.frame({
        ...view,
        line: 3,
        note: `Compare neighbours ${a} and ${b}.`,
        marks: { compare: [j, j + 1] },
        vars: { i, j, swapped },
        checkpoint: {
          question: `Are ${a} and ${b} out of order?`,
          choices: ['Yes: swap them', 'No: leave them'],
          answer: outOfOrder ? 0 : 1,
        },
      });
      if (outOfOrder) {
        t.swap(j, j + 1);
        swapped = true;
        yield t.frame({
          ...view,
          line: 4,
          note: `${a} > ${b}, so swap them: ${a} moves one place right.`,
          marks: { swap: [j, j + 1] },
          vars: { i, j, swapped },
        });
      } else {
        yield t.frame({
          ...view,
          line: 3,
          note: `${a} ≤ ${b}: already in order, so leave them.`,
          marks: { compare: [j, j + 1] },
          vars: { i, j, swapped },
        });
      }
    }

    t.markSorted(end);
    if (!swapped) {
      t.markAllSorted();
      yield t.frame({
        line: 6,
        note: 'No swaps in this whole pass, so every neighbour is in order: the array is sorted.',
        vars: { i, swapped },
      });
      return;
    }
    yield t.frame({
      note: `${t.value(end)} has bubbled to position ${end}, its final place.`,
      vars: { i, swapped },
    });
  }

  t.markAllSorted();
  yield t.frame({ note: 'Sorted: every value has bubbled into place.' });
}

export const bubbleSort = defineAlgorithm<number[], ArrayState>({
  kind: 'algorithm',
  slug: 'bubble-sort',
  view: 'array',
  input: arrayInput({ min: 5, max: 99, defaultSize: 10, maxSize: 40 }),
  pseudocode,
  stats: [COMPARISONS, SWAPS],
  legend: [{ neutral: 'Not yet placed' }, 'compare', 'swap', 'sorted'],
  run,
  content: {
    idea: 'Walk through the array comparing each pair of neighbours, swapping any pair that is out of order. After one pass the largest value has "bubbled" to the end. Repeat on the shrinking unsorted part.',
    invariant: 'After k passes, the last k positions hold the k largest values in their final order.',
    whenToUse: 'Almost never in production: it makes O(n²) comparisons. It is the simplest sort to reason about, and with the early-exit check it finishes after one pass on input that is already sorted.',
    traits: sortTraits({ stable: true, inPlace: true, comparisonBased: true }),
    experiments: [
      { example: 'sorted', prompt: 'One pass, no swaps, and it stops: the O(n) best case.' },
      { example: 'reversed', prompt: 'Every comparison is a swap: the O(n²) worst case.' },
      { example: 'nearly-sorted', prompt: 'Count the passes. How does it compare with reversed input?' },
    ],
  },
});

import { arrayInput } from '@/engine/inputs';
import { defineAlgorithm } from '@/engine/module';
import { ArrayTracer } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { COMPARISONS, WRITES, YES_NO, sortTraits } from './shared';

const pseudocode = [
  'for i from 1 to n − 1:',
  '  key ← A[i]',
  '  j ← i − 1',
  '  while j ≥ 0 and A[j] > key:',
  '    A[j + 1] ← A[j]',
  '    j ← j − 1',
  '  A[j + 1] ← key',
];

const KEY = 'key';

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'writes']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }
  // The key floats in its own lane above the gap it will drop into.
  t.addLane(KEY, 'key', n, 'above');

  yield t.frame({
    note: 'Insertion sort grows a sorted part on the left. It lifts out the next value, slides larger values right to open a gap, then drops the value into the gap.',
    ranges: [{ from: 0, to: 0, tone: 'left', label: 'sorted part' }],
  });

  for (let i = 1; i < n; i++) {
    const key = t.value(i);
    t.move(i, [KEY, i], { count: false });
    let gap = i;
    yield t.frame({
      line: 1,
      note: `Lift out ${key}. Positions 0–${i - 1} to its left are already sorted among themselves.`,
      marks: { key: [[KEY, gap]] },
      pointers: { i },
      ranges: [{ from: 0, to: i - 1, tone: 'left', label: 'sorted part' }],
      vars: { i, key },
    });

    let j = i - 1;
    while (j >= 0) {
      const v = t.value(j);
      t.count('comparisons');
      const sorted = [{ from: 0, to: i, tone: 'left' as const, label: 'sorted part' }];
      yield t.frame({
        line: 3,
        note: `Compare ${v} with the key, ${key}.`,
        marks: { compare: [j], key: [[KEY, gap]] },
        pointers: { j },
        ranges: sorted,
        vars: { i, j, key },
        checkpoint: { question: `Does ${v} need to shift right to make room for ${key}?`, choices: YES_NO, answer: v > key ? 0 : 1 },
      });
      if (v <= key) {
        yield t.frame({
          line: 3,
          note: `${v} ≤ ${key}, so ${key} belongs just after it.`,
          marks: { compare: [j], key: [[KEY, gap]] },
          pointers: { j },
          ranges: sorted,
          vars: { i, j, key },
        });
        break;
      }
      t.move(j, j + 1);
      t.move([KEY, gap], [KEY, j], { count: false });
      gap = j;
      yield t.frame({
        line: 4,
        note: `${v} > ${key}: shift ${v} one place right. The gap moves left to position ${j}.`,
        marks: { write: [j + 1], key: [[KEY, gap]] },
        pointers: { j },
        ranges: sorted,
        vars: { i, j, key },
      });
      j--;
    }
    if (j < 0) {
      yield t.frame({
        line: 3,
        note: `Reached the front: ${key} is the smallest value so far.`,
        marks: { key: [[KEY, gap]] },
        ranges: [{ from: 0, to: i, tone: 'left', label: 'sorted part' }],
        vars: { i, j, key },
      });
    }

    t.move([KEY, gap], gap);
    yield t.frame({
      line: 6,
      note: `Drop ${key} into the gap at position ${gap}. Positions 0–${i} are now sorted.`,
      marks: { write: [gap] },
      ranges: [{ from: 0, to: i, tone: 'left', label: 'sorted part' }],
      vars: { i, j, key },
    });
  }

  t.markAllSorted();
  yield t.frame({ note: 'Sorted: the sorted part now covers the whole array.' });
}

export const insertionSort = defineAlgorithm<number[], ArrayState>({
  kind: 'algorithm',
  slug: 'insertion-sort',
  view: 'array',
  input: arrayInput({ min: 5, max: 99, defaultSize: 10, maxSize: 40 }),
  pseudocode,
  stats: [COMPARISONS, WRITES],
  legend: [{ neutral: 'Not yet placed' }, { mark: 'key', label: 'Key being inserted' }, 'compare', 'write', 'sorted'],
  run,
  content: {
    idea: 'Like sorting a hand of cards: take the next card, slide the larger cards in your hand one place right, and drop the card into the gap.',
    invariant: 'Positions 0 to i − 1 are sorted among themselves (but not necessarily final: a smaller value may still arrive).',
    whenToUse: 'Small or nearly sorted arrays. It runs in O(n + d) time, where d is the number of out-of-order pairs, which is why fast library sorts such as Timsort switch to it for short runs.',
    traits: sortTraits({ stable: true, inPlace: true, comparisonBased: true }),
    experiments: [
      { example: 'nearly-sorted', prompt: 'Most values shift zero or one place: close to linear time.' },
      { example: 'reversed', prompt: 'Every value slides all the way to the front: the O(n²) worst case.' },
    ],
  },
});

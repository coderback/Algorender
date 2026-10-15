import { ArrayTracer } from '@/viz/array/tracer';
import { COMPARISONS, SWAPS, type ArrayAlgorithm } from '../types';

const pseudocode = [
  'quickSort(lo, hi):',
  '  if lo ≥ hi: return',
  '  p ← partition(lo, hi)',
  '  quickSort(lo, p − 1)',
  '  quickSort(p + 1, hi)',
  '',
  'partition(lo, hi):',
  '  pivot ← A[hi]',
  '  i ← lo',
  '  for j from lo to hi − 1:',
  '    if A[j] < pivot:',
  '      swap A[i] and A[j];  i ← i + 1',
  '  swap A[i] and A[hi]',
  '  return i',
];

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'swaps']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }

  const sides = (lo: number, i: number, j: number) => [
    { from: lo, to: i - 1, tone: 'left' as const, label: '< pivot' },
    { from: i, to: j - 1, tone: 'right' as const, label: '≥ pivot' },
  ];

  function* partition(lo: number, hi: number, depth: number): Generator<ReturnType<typeof t.frame>, number> {
    const pivot = t.value(hi);
    let i = lo;
    yield t.frame({
      line: 7,
      note: `Partition positions ${lo}–${hi} around the pivot ${pivot}, the last element. Smaller values go left of it, the rest go right.`,
      marks: { pivot: [hi] },
      pointers: { pivot: hi },
      ranges: [{ from: lo, to: hi, tone: 'active', label: 'partitioning' }],
      vars: { lo, hi, pivot, depth },
    });

    for (let j = lo; j < hi; j++) {
      const v = t.value(j);
      t.count('comparisons');
      const goesLeft = v < pivot;
      yield t.frame({
        line: 10,
        note: goesLeft ? `${v} < ${pivot}: it belongs on the left side.` : `${v} ≥ ${pivot}: it stays on the right side.`,
        marks: { compare: [j], pivot: [hi] },
        pointers: { i, j },
        ranges: sides(lo, i, j),
        vars: { lo, hi, pivot, i, j, depth },
      });
      if (goesLeft) {
        const displaced = t.value(i);
        t.swap(i, j);
        yield t.frame({
          line: 11,
          note:
            i === j
              ? `It is already at the boundary, so just grow the left side.`
              : `Swap it with ${displaced}, the first value of the right side, and grow the left side.`,
          marks: { swap: i === j ? [] : [i, j], pivot: [hi] },
          pointers: { i: i + 1, j },
          ranges: sides(lo, i + 1, j + 1),
          vars: { lo, hi, pivot, i: i + 1, j, depth },
        });
        i++;
      }
    }

    t.swap(i, hi);
    t.markSorted(i);
    yield t.frame({
      line: 12,
      note: `Swap the pivot into position ${i}, between the two sides. ${pivot} is now in its final place: everything left is smaller, everything right is at least as large.`,
      marks: i === hi ? {} : { swap: [hi] },
      pointers: { p: i },
      ranges: [
        { from: lo, to: i - 1, tone: 'left', label: '< pivot' },
        { from: i + 1, to: hi, tone: 'right', label: '≥ pivot' },
      ],
      vars: { lo, hi, pivot, p: i, depth },
    });
    return i;
  }

  function* sort(lo: number, hi: number, depth: number): Generator<ReturnType<typeof t.frame>> {
    if (lo > hi) return;
    if (lo === hi) {
      t.markSorted(lo);
      yield t.frame({
        line: 1,
        note: `The part at position ${lo} holds a single value (${t.value(lo)}), so it is already in place.`,
        vars: { lo, hi, depth },
      });
      return;
    }
    const p = yield* partition(lo, hi, depth);
    yield* sort(lo, p - 1, depth + 1);
    yield* sort(p + 1, hi, depth + 1);
  }

  yield t.frame({
    note: 'Quick sort picks a pivot, moves smaller values to its left and larger ones to its right, so the pivot lands in its final place. Then it sorts each side the same way.',
  });
  yield* sort(0, n - 1, 0);
  t.markAllSorted();
  yield t.frame({ note: 'Sorted: every element has been a pivot or a one-element part.' });
}

export const quickSort: ArrayAlgorithm = {
  slug: 'quick-sort',
  view: 'array',
  input: { min: 5, max: 99, defaultSize: 10, maxSize: 40 },
  pseudocode,
  stats: [COMPARISONS, SWAPS],
  legend: ['pivot', 'compare', 'swap', 'sorted'],
  run,
  content: {
    idea: 'Pick a pivot and partition the array so smaller values sit to its left and the rest to its right. The pivot is then in its final place, and each side is sorted the same way. This version (Lomuto partition) uses the last element as the pivot.',
    invariant: 'During partition: positions lo to i − 1 are smaller than the pivot, i to j − 1 are at least the pivot, and j onward are not yet examined.',
    whenToUse: 'The fastest general-purpose comparison sort in practice: in place with good cache behaviour. Real implementations pick the pivot at random or by median-of-three to avoid the O(n²) worst case.',
    properties: { stable: false, inPlace: true, comparisonBased: true },
    experiments: [
      { preset: 'sorted', prompt: 'With the last element as pivot, every partition is maximally lopsided: the O(n²) worst case. Pivot choice matters.' },
      { preset: 'random', prompt: 'Partitions are roughly balanced, so the work is about n log n.' },
      { preset: 'few-unique', prompt: 'Many equal values all land on one side. How does that affect the partitions?' },
    ],
  },
};

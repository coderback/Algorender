import { ArrayTracer } from '@/viz/array/tracer';
import { arrayInput } from '@/engine/inputs';
import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { COMPARISONS, SWAPS, YES_NO, sortTraits } from './shared';

const pseudocode = [
  'for i from ⌊n / 2⌋ − 1 down to 0:',
  '  siftDown(i, n)',
  'for end from n − 1 down to 1:',
  '  swap A[0] and A[end]',
  '  siftDown(0, end)',
  '',
  'siftDown(i, size):',
  '  while i has a child (2i + 1 < size):',
  '    c ← the larger child of i',
  '    if A[c] ≤ A[i]: stop',
  '    swap A[i] and A[c];  i ← c',
];

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'swaps']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }

  const regions = (size: number) => [
    { from: 0, to: size - 1, tone: 'active' as const, label: 'heap' },
    { from: size, to: n - 1, tone: 'done' as const, label: 'sorted' },
  ];

  function* siftDown(start: number, size: number, phase: string): Generator<ReturnType<typeof t.frame>> {
    let i = start;
    while (2 * i + 1 < size) {
      const l = 2 * i + 1;
      const r = l + 1;
      let c = l;
      if (r < size) {
        t.count('comparisons');
        if (t.value(r) > t.value(l)) c = r;
      }
      const parent = t.value(i);
      const child = t.value(c);
      yield t.frame({
        line: 8,
        note:
          r < size
            ? `The children of ${parent} are ${t.value(l)} and ${t.value(r)}; the larger is ${child}.`
            : `${parent} has one child, ${child}.`,
        marks: { key: [i], compare: r < size ? [l, r] : [l] },
        pointers: { i, c },
        ranges: regions(size),
        vars: { phase, i, c, size },
        checkpoint: { question: `Does ${parent} need to swap with ${child}?`, choices: YES_NO, answer: child > parent ? 0 : 1 },
      });
      t.count('comparisons');
      if (child <= parent) {
        yield t.frame({
          line: 9,
          note: `${child} ≤ ${parent}: the parent is at least as large as its children, so this subtree is a heap. Stop.`,
          marks: { key: [i], compare: [c] },
          pointers: { i, c },
          ranges: regions(size),
          vars: { phase, i, c, size },
        });
        return;
      }
      t.swap(i, c);
      yield t.frame({
        line: 10,
        note: `${child} > ${parent}: swap them, then keep sifting ${parent} down from position ${c}.`,
        marks: { swap: [i, c] },
        pointers: { i, c },
        ranges: regions(size),
        vars: { phase, i, c, size },
      });
      i = c;
    }
  }

  yield t.frame({
    note: 'Heap sort reads the array as a binary tree: the children of position i sit at 2i + 1 and 2i + 2. First it rearranges the array into a max-heap, where every parent is at least as large as its children.',
  });

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    yield t.frame({
      line: 1,
      note: `Sift down ${t.value(i)} at position ${i}, so the subtree rooted there becomes a heap.`,
      marks: { key: [i] },
      pointers: { i },
      ranges: regions(n),
      vars: { phase: 'build heap', i, size: n },
    });
    yield* siftDown(i, n, 'build heap');
  }

  yield t.frame({
    line: 2,
    note: `The array is now a max-heap, so its largest value, ${t.value(0)}, is at the root (position 0).`,
    marks: { key: [0] },
    ranges: regions(n),
    vars: { phase: 'sort', size: n },
  });

  for (let end = n - 1; end >= 1; end--) {
    const max = t.value(0);
    t.swap(0, end);
    t.markSorted(end);
    yield t.frame({
      line: 3,
      note: `Swap the root ${max}, the largest value in the heap, to position ${end}. It is now final, and the heap shrinks by one.`,
      marks: { swap: [0] },
      pointers: { end },
      ranges: regions(end),
      vars: { phase: 'sort', end, size: end },
    });
    yield* siftDown(0, end, 'sort');
  }

  t.markAllSorted();
  yield t.frame({ note: 'Sorted: the heap has shrunk to one element, the smallest.' });
}

export const heapSort = defineAlgorithm<number[], ArrayState>({
  kind: 'algorithm',
  slug: 'heap-sort',
  view: 'array',
  input: arrayInput({ min: 5, max: 99, defaultSize: 10, maxSize: 40 }),
  pseudocode,
  stats: [COMPARISONS, SWAPS],
  legend: [{ neutral: 'Not yet placed' }, 'key', 'compare', 'swap', 'sorted'],
  run,
  content: {
    idea: 'Treat the array as a binary tree and rearrange it into a max-heap, where every parent is at least as large as its children. The root is then the maximum: swap it to the end, shrink the heap by one, and sift the new root down to restore the heap.',
    invariant: 'Positions 0 to size − 1 form a max-heap; positions size to n − 1 hold the largest values in sorted order.',
    whenToUse: 'A guaranteed O(n log n) with O(1) extra space. In practice it is slower than quick sort because of poor cache locality, so it is mostly used as a fallback (as in introsort).',
    traits: sortTraits({ stable: false, inPlace: true, comparisonBased: true }),
    experiments: [
      { example: 'sorted', prompt: 'Sorted input does not help: building the heap still moves many values.' },
      { example: 'reversed', prompt: 'A reversed array is already a max-heap. Watch the build phase do almost nothing.' },
    ],
  },
});

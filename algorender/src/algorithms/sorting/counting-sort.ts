import { ArrayTracer } from '@/viz/array/tracer';
import { COMPARISONS, WRITES, type ArrayAlgorithm } from '../types';

const pseudocode = [
  'count ← zeros, one per value 0..max',
  'for each x in A:',
  '  count[x] ← count[x] + 1',
  'for v from 1 to max:',
  '  count[v] ← count[v] + count[v − 1]',
  'for i from n − 1 down to 0:',
  '  count[A[i]] ← count[A[i]] − 1',
  '  B[count[A[i]]] ← A[i]',
  'copy B back into A',
];

const OUTPUT = 'output';
const COUNT = 'count';

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'writes']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }
  const max = Math.max(...input);
  t.addCounter(COUNT, 'count', Array.from({ length: max + 1 }, (_, v) => String(v)));
  t.addLane(OUTPUT, 'output B', n);

  yield t.frame({
    line: 0,
    note: `Counting sort never compares two elements. It counts how often each value 0–${max} appears, then uses the counts to work out where every element goes.`,
  });

  for (let i = 0; i < n; i++) {
    const x = t.value(i);
    t.setCounter(COUNT, x, t.counter(COUNT, x) + 1);
    yield t.frame({
      line: 2,
      note: `Count ${x}: count[${x}] is now ${t.counter(COUNT, x)}.`,
      marks: { key: [i] },
      pointers: { i },
      counterHighlight: { [COUNT]: x },
      vars: { i, x },
    });
  }

  yield t.frame({
    line: 3,
    note: 'Turn counts into positions with running totals: afterwards count[v] says how many elements are ≤ v.',
    vars: {},
  });
  for (let v = 1; v <= max; v++) {
    const before = t.counter(COUNT, v);
    const prev = t.counter(COUNT, v - 1);
    t.setCounter(COUNT, v, before + prev);
    yield t.frame({
      line: 4,
      note: `count[${v}] = ${before} + ${prev} = ${before + prev}: ${before + prev} element${before + prev === 1 ? ' is' : 's are'} ≤ ${v}.`,
      counterHighlight: { [COUNT]: v },
      vars: { v },
    });
  }

  for (let i = n - 1; i >= 0; i--) {
    const x = t.value(i);
    const pos = t.counter(COUNT, x) - 1;
    t.setCounter(COUNT, x, pos);
    t.move(i, [OUTPUT, pos]);
    yield t.frame({
      line: 7,
      note: `${x} goes to output position ${pos} (count[${x}] − 1). Walking from the right keeps equal values in their original order.`,
      marks: { write: [[OUTPUT, pos]] },
      pointers: { i },
      counterHighlight: { [COUNT]: x },
      vars: { i, x, pos },
    });
  }

  for (let k = 0; k < n; k++) t.move([OUTPUT, k], k);
  t.markAllSorted();
  yield t.frame({
    line: 8,
    note: 'Copy the output back into A. Sorted, with zero comparisons.',
    counterHighlight: { [COUNT]: null },
  });
}

export const countingSort: ArrayAlgorithm = {
  slug: 'counting-sort',
  view: 'array',
  input: { min: 0, max: 9, defaultSize: 12, maxSize: 30 },
  pseudocode,
  stats: [COMPARISONS, WRITES],
  legend: ['key', 'write', 'sorted'],
  run,
  content: {
    idea: 'Instead of comparing elements, count how many times each value occurs. Running totals of those counts tell you exactly where each value belongs in the output.',
    invariant: 'After the running totals, count[v] is the number of elements ≤ v, which is one past the last output position for value v.',
    whenToUse: 'Integer keys in a small range k: O(n + k) time beats any comparison sort. It is useless when k is huge compared with n, and it is the inner step of radix sort.',
    properties: { stable: true, inPlace: false, comparisonBased: false },
    experiments: [
      { preset: 'few-unique', prompt: 'Only a few distinct values: most of the count array stays zero.' },
      { preset: 'reversed', prompt: 'Order makes no difference to the work: always one pass to count and one to place.' },
    ],
  },
};

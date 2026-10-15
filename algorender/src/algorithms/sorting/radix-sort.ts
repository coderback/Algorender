import { ArrayTracer } from '@/viz/array/tracer';
import { COMPARISONS, WRITES, type ArrayAlgorithm } from '../types';

const pseudocode = [
  'for place = 1, 10, 100, … ≤ max:',
  '  count ← zeros for digits 0–9',
  '  for x in A: count[digit(x)] += 1',
  '  for d in 1..9: count[d] += count[d−1]',
  '  for i from n − 1 down to 0:',
  '    d ← digit(A[i]);  count[d] −= 1',
  '    B[count[d]] ← A[i]',
  '  copy B back into A',
];

const OUTPUT = 'output';
const COUNT = 'count';
const PLACE_NAMES = ['ones', 'tens', 'hundreds', 'thousands'];
const DIGITS = Array.from({ length: 10 }, (_, d) => String(d));

const digitOf = (x: number, place: number) => Math.floor(x / place) % 10;

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'writes']);
  const n = t.length;
  if (n < 2) {
    t.markAllSorted();
    yield t.frame({ note: n === 0 ? 'Nothing to sort.' : 'A single element is already sorted.' });
    return;
  }
  const max = Math.max(...input);
  t.addCounter(COUNT, 'count by digit', DIGITS);
  t.addLane(OUTPUT, 'output B', n);

  yield t.frame({
    note: 'Radix sort sorts by one digit at a time, starting with the ones digit. Each pass is a stable counting sort, so ties keep the order from earlier passes.',
  });

  for (let place = 1, pass = 0; place <= max; place *= 10, pass++) {
    const name = PLACE_NAMES[pass] ?? `10^${pass}`;
    t.setDigitPlace(place);
    t.clearCounter(COUNT);
    yield t.frame({
      line: 0,
      note: `Pass ${pass + 1}: sort by the ${name} digit.`,
      vars: { place },
    });

    for (let i = 0; i < n; i++) {
      const x = t.value(i);
      const d = digitOf(x, place);
      t.setCounter(COUNT, d, t.counter(COUNT, d) + 1);
      yield t.frame({
        line: 2,
        note: `${x} has ${name} digit ${d}.`,
        marks: { key: [i] },
        pointers: { i },
        counterHighlight: { [COUNT]: d },
        vars: { place, i, x, d },
      });
    }

    for (let d = 1; d <= 9; d++) t.setCounter(COUNT, d, t.counter(COUNT, d) + t.counter(COUNT, d - 1));
    yield t.frame({
      line: 3,
      note: `Running totals: count[d] is now how many numbers have a ${name} digit ≤ d.`,
      counterHighlight: { [COUNT]: null },
      vars: { place },
    });

    for (let i = n - 1; i >= 0; i--) {
      const x = t.value(i);
      const d = digitOf(x, place);
      const pos = t.counter(COUNT, d) - 1;
      t.setCounter(COUNT, d, pos);
      t.move(i, [OUTPUT, pos]);
      yield t.frame({
        line: 6,
        note: `${x} (digit ${d}) goes to output position ${pos}.`,
        marks: { write: [[OUTPUT, pos]] },
        pointers: { i },
        counterHighlight: { [COUNT]: d },
        vars: { place, i, x, d, pos },
      });
    }

    for (let k = 0; k < n; k++) t.move([OUTPUT, k], k);
    yield t.frame({
      line: 7,
      note: `Copy back. The array is now sorted by its last ${pass + 1} digit${pass === 0 ? '' : 's'}.`,
      counterHighlight: { [COUNT]: null },
      vars: { place },
    });
  }

  t.setDigitPlace(null);
  t.markAllSorted();
  yield t.frame({ note: 'Sorted: every digit has had its pass, from least to most significant.' });
}

export const radixSort: ArrayAlgorithm = {
  slug: 'radix-sort',
  view: 'array',
  input: { min: 1, max: 999, defaultSize: 10, maxSize: 24 },
  pseudocode,
  stats: [COMPARISONS, WRITES],
  legend: ['key', 'write', 'sorted'],
  run,
  content: {
    idea: 'Sort numbers one digit at a time, from the least significant digit to the most, using a stable counting sort for each digit. Because every pass is stable, the order from earlier digits survives as the tie-breaker.',
    invariant: 'After the pass for a given digit, the array is sorted by that digit and every digit to its right.',
    whenToUse: 'Fixed-width integer or string keys: O(d · (n + b)) time for d digits in base b, with no comparisons at all. Common for large integer datasets.',
    properties: { stable: true, inPlace: false, comparisonBased: false },
    experiments: [
      { preset: 'random', prompt: 'In the tens pass, numbers with the same tens digit stay in ones-digit order: that is stability at work.' },
      { preset: 'few-unique', prompt: 'Equal numbers always move together. Does the number of passes change?' },
    ],
  },
};

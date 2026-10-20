import { defineAlgorithm } from '@/engine/module';
import { ArrayTracer } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { randomInts, valuesWithParam } from './inputs';

type Input = { values: number[]; k: number };

const pseudocode = [
  'sum ← A[0] + … + A[k − 1]',
  'best ← sum',
  'for i from k to n − 1:',
  '  sum ← sum + A[i] − A[i − k]',
  '  if sum > best: best ← sum',
  'return best',
];

function* run({ values, k }: Input) {
  const t = new ArrayTracer(values, ['additions']);
  // Position matters here, not size: values sit in cells (V1).
  t.setLook('cells');
  const n = t.length;
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += t.value(i);
    t.count('additions');
  }
  let best = sum;
  let bestAt = 0;
  const ranges = (start: number) => [
    { from: start, to: start + k - 1, tone: 'active' as const, label: `window (sum ${sum})` },
    ...(bestAt !== start ? [{ from: bestAt, to: bestAt + k - 1, tone: 'done' as const, label: `best (${best})` }] : []),
  ];

  yield t.frame({
    line: 0,
    note: `Find the ${k} consecutive values with the largest sum. Start with the first window: positions 0–${k - 1} add up to ${sum}.`,
    marks: { compare: Array.from({ length: k }, (_, i) => i) },
    ranges: ranges(0),
    vars: { k, sum, best },
  });

  for (let i = k; i < n; i++) {
    const start = i - k + 1;
    const incoming = t.value(i);
    const outgoing = t.value(i - k);
    const next = sum + incoming - outgoing;
    yield t.frame({
      line: 3,
      note: `Slide right: ${incoming} enters the window and ${outgoing} leaves it. Only those two values change, so there is no need to re-add the others.`,
      marks: { write: [i], reject: [i - k] },
      pointers: { in: i, out: i - k },
      ranges: ranges(start - 1),
      vars: { i, k, sum, best },
      checkpoint: {
        question: `The window sum was ${sum}. Is the new window better than the best so far (${best})?`,
        choices: ['Yes: a new best', 'No: keep the old best'],
        answer: next > best ? 0 : 1,
      },
    });
    sum = next;
    t.count('additions', 2);
    if (sum > best) {
      best = sum;
      bestAt = start;
      yield t.frame({
        line: 4,
        note: `${sum} = previous sum + ${incoming} − ${outgoing}, and it beats the old best: positions ${start}–${i} are the new best window.`,
        marks: { found: Array.from({ length: k }, (_, j) => start + j) },
        ranges: ranges(start),
        vars: { i, k, sum, best },
      });
    } else {
      yield t.frame({
        line: 4,
        note: `${sum} = previous sum + ${incoming} − ${outgoing}: not more than the best, ${best}.`,
        ranges: ranges(start),
        vars: { i, k, sum, best },
      });
    }
  }

  yield t.frame({
    line: 5,
    note: `Done: the best window is positions ${bestAt}–${bestAt + k - 1} with sum ${best}, found with about 2 additions per slide instead of ${k}.`,
    marks: { found: Array.from({ length: k }, (_, j) => bestAt + j) },
    vars: { k, best },
  });
}

export const slidingWindow = defineAlgorithm<Input, ArrayState>({
  kind: 'algorithm',
  slug: 'sliding-window',
  view: 'array',
  input: valuesWithParam({
    param: 'k',
    range: { min: 1, max: 30, maxSize: 24 },
    paramRange: (values) => ({ min: 1, max: values.length }),
    size: { min: 4, max: 24, default: 12 },
    placeholder: '4, 2, 12, 3, 8, 1, 9 | k=3',
    examples: [
      { id: 'random', label: 'Random', make: ({ seed, size }) => ({ values: randomInts(seed, size, 1, 30), k: Math.min(3, size) }) },
      {
        id: 'wide',
        label: 'Wide window',
        make: ({ seed, size }) => ({ values: randomInts(seed, size, 1, 30), k: Math.max(2, Math.floor(size / 2)) }),
      },
      {
        id: 'late-peak',
        label: 'Best at the end',
        make: ({ seed, size }) => ({ values: randomInts(seed, size, 1, 10).map((v, i) => (i >= size - 3 ? v + 20 : v)), k: Math.min(3, size) }),
      },
    ],
  }),
  pseudocode,
  stats: [{ key: 'additions', label: 'Additions' }],
  legend: [
    { neutral: 'Outside the window' },
    { mark: 'write', label: 'Entering the window' },
    { mark: 'reject', label: 'Leaving the window' },
    { mark: 'compare', label: 'First window' },
    { mark: 'found', label: 'Best window' },
  ],
  run,
  content: {
    idea: 'Instead of re-adding every window from scratch, keep one running sum and slide: add the value that enters on the right, subtract the one that leaves on the left. Each slide costs two operations no matter how wide the window is.',
    invariant: 'sum always equals the total of the k values currently inside the window, and best is the largest window sum seen so far.',
    whenToUse: 'Any question about contiguous runs: best or worst window of size k, longest substring without repeats, smallest subarray with sum ≥ S (with a window that grows and shrinks). It turns O(n·k) into O(n).',
    traits: [
      { label: 'O(n) time', good: true },
      { label: 'O(1) extra space', good: true },
      { label: 'Contiguous ranges only', good: null },
    ],
    experiments: [
      { example: 'wide', prompt: 'A wide window: the additions per slide stay at 2. Re-adding each window would cost k.' },
      { example: 'late-peak', prompt: 'The best window is the last one. Predict when the best changes.' },
    ],
  },
});

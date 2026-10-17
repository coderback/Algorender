import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import { ArrayTracer } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { sortedDistinct, valuesWithParam } from './inputs';

type Input = { values: number[]; target: number };

const pseudocode = [
  'L ← 0;  R ← n − 1',
  'while L < R:',
  '  s ← A[L] + A[R]',
  '  if s = target: return (L, R)',
  '  if s < target: L ← L + 1',
  '  else: R ← R − 1',
  'return "no pair"',
];

const MOVE_L = 'Move L right: the sum is too small';
const MOVE_R = 'Move R left: the sum is too big';
const FOUND = 'Stop: this pair hits the target';

function* run({ values, target }: Input) {
  const t = new ArrayTracer(values, ['comparisons']);
  const n = t.length;
  let L = 0;
  let R = n - 1;
  const window = () => [{ from: L, to: R, tone: 'active' as const, label: 'still possible' }];

  yield t.frame({
    line: 0,
    note: `Find two values that add up to ${target}. Because the array is sorted, start with the smallest (left) and the largest (right) and move inward.`,
    pointers: { L, R },
    ranges: window(),
    vars: { target },
  });

  while (L < R) {
    const a = t.value(L);
    const b = t.value(R);
    const s = a + b;
    t.count('comparisons');
    const outcome = s === target ? FOUND : s < target ? MOVE_L : MOVE_R;
    yield t.frame({
      line: 2,
      note: `A[L] + A[R] = ${a} + ${b} = ${s}. Compare it with the target, ${target}.`,
      marks: { compare: [L, R] },
      pointers: { L, R },
      ranges: window(),
      vars: { L, R, s, target },
      checkpoint: { question: 'What happens next?', choices: [MOVE_L, MOVE_R, FOUND], answer: [MOVE_L, MOVE_R, FOUND].indexOf(outcome) },
    });
    if (s === target) {
      yield t.frame({
        line: 3,
        note: `${a} + ${b} = ${target}: found the pair at positions ${L} and ${R}.`,
        marks: { found: [L, R] },
        pointers: { L, R },
        vars: { L, R, s, target },
      });
      return;
    }
    if (s < target) {
      yield t.frame({
        line: 4,
        note: `${s} < ${target}. ${a} can't be in any pair: even with the largest remaining value, ${b}, it falls short. Move L right.`,
        marks: { reject: [L] },
        pointers: { L, R },
        ranges: window(),
        vars: { L, R, s, target },
      });
      L++;
    } else {
      yield t.frame({
        line: 5,
        note: `${s} > ${target}. ${b} can't be in any pair: even with the smallest remaining value, ${a}, it overshoots. Move R left.`,
        marks: { reject: [R] },
        pointers: { L, R },
        ranges: window(),
        vars: { L, R, s, target },
      });
      R--;
    }
  }

  yield t.frame({
    line: 6,
    note: `L and R have met, so every value has been ruled out: no two values add up to ${target}.`,
    vars: { target },
  });
}

/** A target that some pair hits, or (absent) one that none does. */
function make(seed: number, size: number, present: boolean): Input {
  const values = sortedDistinct(seed, size, 1, 4);
  const rng = createRng(seed + 1);
  const sums = new Set<number>();
  for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) sums.add(values[i] + values[j]);
  if (present) {
    const i = Math.floor(rng() * (size - 1));
    const j = i + 1 + Math.floor(rng() * (size - 1 - i));
    return { values, target: values[i] + values[j] };
  }
  let target = values[0] + values[1] + 1 + Math.floor(rng() * 10);
  while (sums.has(target)) target++;
  return { values, target };
}

export const twoPointers = defineAlgorithm<Input, ArrayState>({
  kind: 'algorithm',
  slug: 'two-pointers',
  view: 'array',
  input: valuesWithParam({
    param: 'target',
    sorted: true,
    range: { min: 1, max: 99, maxSize: 24 },
    paramRange: () => ({ min: 2, max: 198 }),
    size: { min: 4, max: 20, default: 10 },
    placeholder: '1, 3, 4, 6, 8, 11 | target=10',
    examples: [
      { id: 'present', label: 'Pair exists', make: ({ seed, size }) => make(seed, size, true) },
      { id: 'absent', label: 'No pair', make: ({ seed, size }) => make(seed, size, false) },
      {
        id: 'ends',
        label: 'Pair at the ends',
        make: ({ seed, size }) => {
          const values = sortedDistinct(seed, size, 1, 4);
          return { values, target: values[0] + values[size - 1] };
        },
      },
    ],
  }),
  pseudocode,
  stats: [{ key: 'comparisons', label: 'Sums checked' }],
  legend: [{ neutral: 'Not checked' }, { mark: 'compare', label: 'Current pair' }, { mark: 'reject', label: 'Ruled out' }, 'found'],
  run,
  content: {
    idea: 'In a sorted array, put one pointer at each end. If their sum is too small, the left value is too small for any partner, so move left inward; if too big, move right inward. Each step rules out one value, so it finishes in at most n − 1 steps instead of checking all n² pairs.',
    invariant: 'Any pair that adds up to the target lies entirely inside [L, R]: every value outside it has been ruled out.',
    whenToUse: 'Sorted arrays (or ones you can sort) with a pair or triple condition on sums or differences: two-sum on sorted input, 3Sum, container with most water, removing duplicates in place. It turns O(n²) pair checks into O(n).',
    traits: [
      { label: 'O(n) time', good: true },
      { label: 'O(1) extra space', good: true },
      { label: 'Needs sorted input', good: false },
    ],
    experiments: [
      { example: 'absent', prompt: 'Watch L and R meet: n − 1 checks prove that no pair exists.' },
      { example: 'ends', prompt: 'The answer is the very first pair. How many of the n² pairs did it check?' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { PROBES, SIDES, SearchTracer, absentNote, foundNote, num, searchInput, side, type SearchInput } from './shared';

const pseudocode = [
  'binarySearch(A, x):',
  '  lo ← 0;  hi ← n − 1',
  '  while lo ≤ hi:',
  '    mid ← ⌊(lo + hi) / 2⌋',
  '    if A[mid] = x: return mid',
  '    if A[mid] < x: lo ← mid + 1',
  '    else: hi ← mid − 1',
  '  return −1   (not found)',
];

function* run(input: SearchInput) {
  const s = new SearchTracer(input, ['probes'], 'Sorted array');
  const { n, x } = s;
  if (n === 0) {
    yield s.frame({ line: 7, note: `The array is empty, so ${x} can't be in it.` });
    return;
  }
  s.hover(Math.floor((n - 1) / 2));
  yield s.frame({
    note: `Binary search looks for ${x} in a sorted array. Each probe checks the middle of the window that could still hold ${x}, then throws away the half that can't.`,
    window: [0, n - 1],
  });

  let lo = 0;
  let hi = n - 1;
  yield s.frame({
    line: 1,
    note: `Before any probe, every position could hold ${x}: the window is the whole array, lo = 0 to hi = ${hi}.`,
    window: [lo, hi],
    pointers: { lo, hi },
    vars: { x, lo, hi },
  });

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const v = s.probe(mid);
    const vars = { x, lo, hi, mid, 'A[mid]': v };
    yield s.frame({
      line: 3,
      note: `Probe the middle of the window ${lo}–${hi}: mid = ⌊(${lo} + ${hi}) / 2⌋ = ${mid}. Compare A[${mid}] = ${v} with ${x}.`,
      window: [lo, hi],
      probe: mid,
      pointers: { lo, mid, hi },
      vars,
      checkpoint: { question: `Where can ${x} still be, compared with position ${mid}?`, choices: SIDES, answer: side(v, x) },
    });

    if (v === x) {
      yield s.frame({ line: 4, note: `A[${mid}] = ${x}. ${foundNote(s, mid)}`, found: mid, pointers: { mid }, vars });
      return;
    }
    if (v < x) {
      const was = lo;
      lo = mid + 1;
      yield s.frame({
        line: 5,
        note: `${v} < ${x}, and the array is sorted, so positions ${was}–${mid} all hold ${v} or less: ${x} can't be there. Move lo past mid, to ${lo}.`,
        window: lo <= hi ? [lo, hi] : null,
        pointers: { lo, mid, hi },
        vars: { ...vars, lo },
      });
    } else {
      const was = hi;
      hi = mid - 1;
      yield s.frame({
        line: 6,
        note: `${v} > ${x}, and the array is sorted, so positions ${mid}–${was} all hold ${v} or more: ${x} can't be there. Move hi below mid, to ${num(hi)}.`,
        window: lo <= hi ? [lo, hi] : null,
        pointers: { lo, mid, hi },
        vars: { ...vars, hi },
      });
    }
  }

  yield s.frame({
    line: 7,
    note: absentNote(s, `lo = ${lo} has passed hi = ${num(hi)}, so the window is empty.`),
    pointers: { lo, hi },
    vars: { x, lo, hi },
  });
}

export const binarySearch = defineAlgorithm<SearchInput, ArrayState>({
  kind: 'algorithm',
  slug: 'binary-search',
  view: 'array',
  input: searchInput({ sorted: true, examples: ['present', 'absent', 'first', 'last'], defaultSize: 15 }),
  pseudocode,
  stats: [PROBES],
  legend: [
    { neutral: 'Ruled out' },
    { mark: 'frontier', label: 'Could still hold the target' },
    { mark: 'compare', label: 'Probed' },
    { mark: 'key', label: 'Target' },
    'found',
  ],
  run,
  content: {
    idea: 'Look at the middle of a sorted array. If the target is bigger, it can only be in the right half; if smaller, only in the left half. Each probe halves what is left to search, so even a million items need only about 20 probes.',
    invariant: 'If the target is in the array at all, it lies between lo and hi. Every probe keeps that true while cutting the window roughly in half.',
    whenToUse: 'Any sorted array with random access: lookups in sorted tables, finding where to insert a value, and "binary search on the answer" for any yes/no question that flips once. If the data changes often, a balanced search tree or a hash table may suit better.',
    traits: [
      { label: 'Needs sorted input', good: null },
      { label: 'O(log n) probes', good: true },
      { label: 'Needs random access', good: null },
    ],
    experiments: [
      { example: 'absent', prompt: 'Watch lo and hi cross. How many probes does it take to be sure the target is missing?' },
      { example: 'first', prompt: 'The target is at the very front, yet binary search still walks there in halving steps. When does a plain scan win?' },
      { example: 'present', prompt: 'Double the size with the slider. How many extra probes does that cost?' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { PROBES, SIDES, SearchTracer, absentNote, foundNote, num, searchInput, side, type SearchInput } from './shared';

const pseudocode = [
  'interpolationSearch(A, x):',
  '  lo ← 0;  hi ← n − 1',
  '  while lo ≤ hi and A[lo] ≤ x ≤ A[hi]:',
  '    if A[lo] = A[hi]: pos ← lo',
  '    else:',
  '      f ← (x−A[lo]) / (A[hi]−A[lo])',
  '      pos ← lo + ⌊f · (hi − lo)⌋',
  '    if A[pos] = x: return pos',
  '    if A[pos] < x: lo ← pos + 1',
  '    else: hi ← pos − 1',
  '  return −1   (not found)',
];

const THIRDS = ['In the first third', 'In the middle third', 'In the last third'] as const;

function* run(input: SearchInput) {
  const s = new SearchTracer(input, ['probes'], 'Sorted array');
  const { n, x } = s;
  if (n === 0) {
    yield s.frame({ line: 10, note: `The array is empty, so ${x} can't be in it.` });
    return;
  }
  yield s.frame({
    note: `Interpolation search guesses where ${x} should be from its value, the way you open a dictionary near the back for a word starting with "w". On evenly spread values the guess lands close.`,
    window: [0, n - 1],
  });

  let lo = 0;
  let hi = n - 1;
  yield s.frame({
    line: 1,
    note: `Before any probe, every position could hold ${x}: the window is lo = 0 to hi = ${hi}.`,
    window: [lo, hi],
    pointers: { lo, hi },
    vars: { x, lo, hi },
  });

  while (lo <= hi) {
    const a = s.value(lo);
    const b = s.value(hi);
    if (x < a || x > b) {
      yield s.frame({
        line: 2,
        note: absentNote(
          s,
          `${x} is ${x < a ? `below A[lo] = ${a}` : `above A[hi] = ${b}`}, the ${x < a ? 'smallest' : 'largest'} value left in the window, so no position in ${lo}–${hi} can hold it.`,
        ),
        pointers: { lo, hi },
        vars: { x, lo, hi, 'A[lo]': a, 'A[hi]': b },
      });
      return;
    }

    let pos: number;
    let how: string;
    let line: number;
    if (a === b) {
      pos = lo;
      line = 3;
      how = `A[lo] = A[hi] = ${a}, so (the array being sorted) every value in ${lo}–${hi} is ${a}: no estimate is needed, probe pos = lo = ${lo}.`;
    } else {
      // Integer arithmetic for the position; the fraction is only for the narration.
      pos = lo + Math.floor(((x - a) * (hi - lo)) / (b - a));
      line = 6;
      const f = (x - a) / (b - a);
      const where = (pos - lo) / (hi - lo);
      yield s.frame({
        line: 5,
        note: `${x} lies between A[lo] = ${a} and A[hi] = ${b}. If the values in ${lo}–${hi} are spread evenly, how far along the window should ${x} sit?`,
        window: [lo, hi],
        pointers: { lo, hi },
        vars: { x, lo, hi, 'A[lo]': a, 'A[hi]': b },
        ...(hi - lo >= 2 && {
          checkpoint: {
            question: `Where in positions ${lo}–${hi} will the probe land?`,
            choices: THIRDS,
            answer: where < 1 / 3 ? 0 : where < 2 / 3 ? 1 : 2,
          },
        }),
      });
      how = `${x} is ${Math.round(f * 100)}% of the way from ${a} to ${b}, so probe that far along: pos = ${lo} + ⌊${f.toFixed(2)} × ${hi - lo}⌋ = ${pos}.`;
    }

    const v = s.probe(pos);
    const vars = { x, lo, hi, pos, 'A[pos]': v };
    yield s.frame({
      line,
      note: `${how} Compare A[${pos}] = ${v} with ${x}.`,
      window: [lo, hi],
      probe: pos,
      pointers: { lo, pos, hi },
      vars,
      checkpoint: { question: `Where can ${x} still be, compared with position ${pos}?`, choices: SIDES, answer: side(v, x) },
    });

    if (v === x) {
      yield s.frame({ line: 7, note: `A[${pos}] = ${x}. ${foundNote(s, pos)}`, found: pos, pointers: { pos }, vars });
      return;
    }
    if (v < x) {
      lo = pos + 1;
      yield s.frame({
        line: 8,
        note: `${v} < ${x}, so ${x} can't be at or left of position ${pos}. Move lo to ${lo}.`,
        window: lo <= hi ? [lo, hi] : null,
        pointers: { lo, pos, hi },
        vars: { ...vars, lo },
      });
    } else {
      hi = pos - 1;
      yield s.frame({
        line: 9,
        note: `${v} > ${x}, so ${x} can't be at or right of position ${pos}. Move hi to ${num(hi)}.`,
        window: lo <= hi ? [lo, hi] : null,
        pointers: { lo, pos, hi },
        vars: { ...vars, hi },
      });
    }
  }

  yield s.frame({
    line: 10,
    note: absentNote(s, `lo = ${lo} has passed hi = ${num(hi)}, so the window is empty.`),
    pointers: { lo, hi },
    vars: { x, lo, hi },
  });
}

export const interpolationSearch = defineAlgorithm<SearchInput, ArrayState>({
  kind: 'algorithm',
  slug: 'interpolation-search',
  view: 'array',
  input: searchInput({ sorted: true, examples: ['present', 'uneven', 'absent', 'first', 'last'], defaultSize: 16 }),
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
    idea: 'Instead of always probing the middle, estimate where the target should be from its value: if it is 80% of the way from the smallest to the largest value, look 80% of the way along. On evenly spread values the guesses close in very fast.',
    invariant: 'While the loop runs, the target, if present, lies between lo and hi, and A[lo] ≤ target ≤ A[hi]. That second fact is what makes the estimate land inside the window.',
    whenToUse: 'Large sorted arrays whose values are spread fairly evenly, such as sequential IDs or timestamps, where it needs about log log n probes. On skewed values it can slow to a linear scan, so many libraries stick with binary search.',
    traits: [
      { label: 'Needs sorted input', good: null },
      { label: 'O(log log n) on evenly spread values', good: true },
      { label: 'O(n) on skewed values', good: false },
    ],
    experiments: [
      { example: 'uneven', prompt: 'One huge value at the end drags every estimate to the left, so the probes creep forward a step at a time. How many probes would binary search need?' },
      { example: 'present', prompt: 'On random values the first guess often lands within a few places of the target.' },
      { example: 'absent', prompt: 'The search can stop early once the target falls outside A[lo]..A[hi]. Watch for it.' },
    ],
  },
});

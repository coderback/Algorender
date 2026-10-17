import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { PROBES, SearchTracer, absentNote, foundNote, searchInput, type SearchInput } from './shared';

const pseudocode = [
  'jumpSearch(A, x):',
  '  m ← ⌊√n⌋;  lo ← 0;  hi ← m − 1',
  '  while A[hi] < x:',
  '    if hi = n − 1: return −1',
  '    lo ← hi + 1',
  '    hi ← min(hi + m, n − 1)',
  '  i ← lo',
  '  while A[i] < x: i ← i + 1',
  '  return i if A[i] = x, else −1',
];

function* run(input: SearchInput) {
  const s = new SearchTracer(input, ['probes', 'jumps'], 'Sorted array');
  const { n, x } = s;
  if (n === 0) {
    yield s.frame({ line: 3, note: `The array is empty, so ${x} can't be in it.` });
    return;
  }
  const m = Math.floor(Math.sqrt(n));
  let lo = 0;
  let hi = m - 1;
  let block = 1;
  const blockRange = () => [{ from: lo, to: hi, tone: 'left' as const, label: `block ${block}` }];

  s.hover(hi);
  yield s.frame({
    note: `Jump search looks for ${x} in a sorted array by checking only the last value of each block, then scanning the one block that can hold ${x}.`,
    window: [0, n - 1],
  });
  yield s.frame({
    line: 1,
    note: `Use blocks of m = ⌊√${n}⌋ = ${m} positions, so there are about as many blocks as positions per block. The first block is ${lo}–${hi}.`,
    window: [0, n - 1],
    ranges: blockRange(),
    pointers: { lo, hi },
    vars: { x, m, lo, hi },
  });

  for (;;) {
    const v = s.probe(hi);
    const vars = { x, m, lo, hi, 'A[hi]': v };
    yield s.frame({
      line: 2,
      note: `Check the last value of block ${block} (positions ${lo}–${hi}): compare A[${hi}] = ${v} with ${x}.`,
      window: [lo, n - 1],
      probe: hi,
      ranges: blockRange(),
      pointers: { lo, hi },
      vars,
      checkpoint: {
        question: `Could ${x} be in block ${block}?`,
        choices: ['Yes, it can only be in this block', 'No, it must be further right'],
        answer: v >= x ? 0 : 1,
      },
    });
    if (v >= x) break;

    if (hi === n - 1) {
      yield s.frame({
        line: 3,
        note: absentNote(s, `${v} < ${x}, and that was the last block: every value in the array is smaller than ${x}.`),
        pointers: { hi },
        vars,
      });
      return;
    }
    const [oldLo, oldHi] = [lo, hi];
    lo = hi + 1;
    hi = Math.min(hi + m, n - 1);
    block++;
    s.t.count('jumps');
    s.hover(hi);
    yield s.frame({
      line: 4,
      note: `${v} < ${x}, and the block is sorted, so all of ${oldLo}–${oldHi} is below ${x}. Jump over it: the next block is ${lo}–${hi}.`,
      window: [lo, n - 1],
      ranges: blockRange(),
      pointers: { lo, hi },
      vars: { x, m, lo, hi },
    });
  }

  const blockEnd = s.t.value(hi);
  yield s.frame({
    line: 6,
    note: `${blockEnd} ≥ ${x}. Every earlier block ends below ${x}, and every later value is at least ${blockEnd}, so if ${x} is anywhere it is in block ${block}. Scan it from position ${lo}.`,
    window: [lo, hi],
    ranges: blockRange(),
    pointers: { i: lo, hi },
    vars: { x, m, lo, hi, i: lo },
  });

  for (let i = lo; ; i++) {
    const v = s.probe(i);
    const vars = { x, lo, hi, i, 'A[i]': v };
    yield s.frame({
      line: 7,
      note: `${i > lo ? `A[${i - 1}] < ${x}, so step right. ` : ''}Compare A[${i}] = ${v} with ${x}.`,
      window: [i, hi],
      probe: i,
      ranges: blockRange(),
      pointers: { i, hi },
      vars,
      checkpoint: {
        question: `How does A[${i}] compare with ${x}?`,
        choices: [`Smaller: step right`, `Equal: found it`, `Larger: ${x} is not here`],
        answer: v < x ? 0 : v === x ? 1 : 2,
      },
    });
    if (v === x) {
      yield s.frame({ line: 8, note: `A[${i}] = ${x}. ${foundNote(s, i)}`, found: i, pointers: { i }, vars });
      return;
    }
    if (v > x) {
      yield s.frame({
        line: 8,
        note: absentNote(s, `A[${i}] = ${v} > ${x}: the scan has passed the place where ${x} would sit.`),
        pointers: { i },
        vars,
      });
      return;
    }
  }
}

export const jumpSearch = defineAlgorithm<SearchInput, ArrayState>({
  kind: 'algorithm',
  slug: 'jump-search',
  view: 'array',
  input: searchInput({ sorted: true, examples: ['present', 'absent', 'last', 'first'], defaultSize: 16 }),
  pseudocode,
  stats: [PROBES, { key: 'jumps', label: 'Jumps' }],
  legend: [
    { neutral: 'Ruled out' },
    { mark: 'frontier', label: 'Could still hold the target' },
    { mark: 'compare', label: 'Probed' },
    { mark: 'key', label: 'Target' },
    'found',
  ],
  run,
  content: {
    idea: 'Jump ahead √n elements at a time, looking only at the last value of each block, until a block ends at or above the target. Then scan that one block from its start.',
    invariant: 'Every block jumped over ends below the target, so if the target is present it lies at or after lo; once a block ends at or above it, the target can only be inside that block.',
    whenToUse: 'Sorted data where jumping forward is cheap but stepping back is costly, such as sequential media or lists with skip pointers. It takes about 2√n probes: more than binary search, far fewer than a scan.',
    traits: [
      { label: 'Needs sorted input', good: null },
      { label: 'About 2√n probes', good: null },
      { label: 'Steps back at most one block', good: true },
    ],
    experiments: [
      { example: 'last', prompt: 'The target sits in the final block: count the jumps, then the scan. Why does a block size of √n balance the two?' },
      { example: 'first', prompt: 'The very first block-end check stops the jumping. How many probes does the scan add?' },
      { example: 'absent', prompt: 'The scan stops as soon as it passes the place where the target would be. Where does that happen?' },
    ],
  },
});

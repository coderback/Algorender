import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { PROBES, SIDES, SearchTracer, absentNote, foundNote, num, searchInput, side, type SearchInput } from './shared';

const pseudocode = [
  'exponentialSearch(A, x):',
  '  if A[0] = x: return 0',
  '  b ← 1',
  '  while b < n and A[b] < x:',
  '    b ← 2b',
  '  lo ← ⌊b/2⌋ + 1;  hi ← min(b, n − 1)',
  '  while lo ≤ hi:   (binary search)',
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
    yield s.frame({ line: 11, note: `The array is empty, so ${x} can't be in it.` });
    return;
  }
  yield s.frame({
    note: `Exponential search needs no idea of where the array ends: it checks positions 1, 2, 4, 8… until one reaches ${x}, then binary searches the last gap.`,
    window: [0, n - 1],
  });

  const first = s.probe(0);
  yield s.frame({
    line: 1,
    note: `Check the front first: compare A[0] = ${first} with ${x}.`,
    window: [0, n - 1],
    probe: 0,
    vars: { x, 'A[0]': first },
    checkpoint: { question: `Is ${x} at position 0?`, choices: ['Yes, found at the front', 'No, start doubling'], answer: first === x ? 0 : 1 },
  });
  if (first === x) {
    yield s.frame({ line: 1, note: `A[0] = ${x}. ${foundNote(s, 0)}`, found: 0, vars: { x } });
    return;
  }

  let b = 1;
  yield s.frame({
    line: 2,
    note: `A[0] is not ${x}. Start the bound at b = 1 and double it until it reaches or passes ${x}.`,
    window: n > 1 ? [1, n - 1] : null,
    pointers: { b },
    vars: { x, b },
  });

  for (;;) {
    if (b >= n) {
      yield s.frame({
        line: 3,
        note: `b = ${b} is past the end of the array (the last position is ${n - 1}), so stop doubling.`,
        window: (b >> 1) + 1 <= n - 1 ? [(b >> 1) + 1, n - 1] : null,
        vars: { x, b },
      });
      break;
    }
    const v = s.probe(b);
    yield s.frame({
      line: 3,
      note: `Compare A[${b}] = ${v} with ${x}.`,
      window: [(b >> 1) + 1, n - 1],
      probe: b,
      pointers: { b },
      vars: { x, b, 'A[b]': v },
      checkpoint: {
        question: `Keep doubling b?`,
        choices: [`Yes: ${x} is further right`, `No: ${x} can't be past position ${b}`],
        answer: v < x ? 0 : 1,
      },
    });
    if (v >= x) break;
    const old = b;
    b *= 2;
    yield s.frame({
      line: 4,
      note: `${v} < ${x}, so everything up to position ${old} is below ${x}. Double the bound: b = ${b}.`,
      window: old + 1 <= n - 1 ? [old + 1, n - 1] : null,
      pointers: { b },
      vars: { x, b },
    });
  }

  const half = b >> 1;
  let lo = half + 1;
  let hi = Math.min(b, n - 1);
  const left = half === 0 ? 'A[0] was already ruled out' : `A[${half}] < ${x}`;
  const right = b < n ? `A[${b}] ≥ ${x}` : 'the array ends there';
  yield s.frame({
    line: 5,
    note:
      lo <= hi
        ? `${left} and ${right}, so ${x} can only be in positions ${lo}–${hi}. That range is at most as long as the distance already covered: binary search it.`
        : `${left}, and it is the last position, so nothing is left that could hold ${x}.`,
    window: lo <= hi ? [lo, hi] : null,
    pointers: { lo, hi },
    vars: { x, b, lo, hi },
  });

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const v = s.probe(mid);
    const vars = { x, lo, hi, mid, 'A[mid]': v };
    yield s.frame({
      line: 7,
      note: `Probe the middle of ${lo}–${hi}: mid = ${mid}. Compare A[${mid}] = ${v} with ${x}.`,
      window: [lo, hi],
      probe: mid,
      pointers: { lo, mid, hi },
      vars,
      checkpoint: { question: `Where can ${x} still be, compared with position ${mid}?`, choices: SIDES, answer: side(v, x) },
    });
    if (v === x) {
      yield s.frame({ line: 8, note: `A[${mid}] = ${x}. ${foundNote(s, mid)}`, found: mid, pointers: { mid }, vars });
      return;
    }
    if (v < x) lo = mid + 1;
    else hi = mid - 1;
    yield s.frame({
      line: v < x ? 9 : 10,
      note:
        v < x
          ? `${v} < ${x}, so ${x} can't be at or left of mid. Move lo to ${lo}.`
          : `${v} > ${x}, so ${x} can't be at or right of mid. Move hi to ${num(hi)}.`,
      window: lo <= hi ? [lo, hi] : null,
      pointers: { lo, mid, hi },
      vars: { ...vars, lo, hi },
    });
  }

  yield s.frame({
    line: 11,
    note: absentNote(s, 'The window is empty.'),
    pointers: { lo, hi },
    vars: { x, lo, hi },
  });
}

export const exponentialSearch = defineAlgorithm<SearchInput, ArrayState>({
  kind: 'algorithm',
  slug: 'exponential-search',
  view: 'array',
  input: searchInput({ sorted: true, examples: ['present', 'first', 'last', 'absent'], defaultSize: 20 }),
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
    idea: 'Find a range that must contain the target by checking positions 1, 2, 4, 8, … until one holds a value at least as big as the target, then binary search that range. The cost depends on where the target is, not on how long the array is.',
    invariant: 'Before each doubling, every position up to b holds a value below the target, so the target can only be beyond b. When the doubling stops, it is between b/2 and b.',
    whenToUse: 'Sorted data of unknown or unbounded length, such as streams or huge files, and lookups where the target is likely near the front. A target at position i costs O(log i) probes.',
    traits: [
      { label: 'Needs sorted input', good: null },
      { label: 'Works without knowing n', good: true },
      { label: 'O(log i) for a target at position i', good: true },
    ],
    experiments: [
      { example: 'first', prompt: 'A target near the front is found in a handful of probes, however long the array is.' },
      { example: 'last', prompt: 'The bound doubles until it runs off the end. Compare the doubling probes with the binary-search probes.' },
      { example: 'absent', prompt: 'Which phase rules out most of the array: the doubling or the binary search?' },
    ],
  },
});

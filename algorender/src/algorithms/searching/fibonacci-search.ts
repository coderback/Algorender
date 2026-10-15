import { defineAlgorithm } from '@/engine/module';
import type { ArrayState } from '@/viz/array/types';
import { PROBES, SIDES, SearchTracer, absentNote, foundNote, num, searchInput, side, type SearchInput } from './shared';

const pseudocode = [
  'fibonacciSearch(A, x):',
  '  k ← smallest k with F(k) > n',
  '  off ← −1',
  '  while F(k) > 1:',
  '    i ← off + F(k − 2)',
  '    v ← A[i] if i < n, else +∞',
  '    if v = x: return i',
  '    if v < x: off ← i;  k ← k − 1',
  '    else: k ← k − 2',
  '  return −1   (not found)',
];

const FIB = 'fib';

function* run(input: SearchInput) {
  const s = new SearchTracer(input, ['probes'], 'Sorted array');
  const { n, x } = s;

  const F = [0, 1];
  while (F.at(-1)! <= n) F.push(F.at(-1)! + F.at(-2)!);
  let k = F.length - 1;
  s.t.addCounter(FIB, 'Fibonacci numbers F(k)', F.map((_, j) => `F(${j})`));
  F.forEach((f, j) => s.t.setCounter(FIB, j, f));

  // The window is positions off + 1 … off + F(k) − 1; the part past the array is imaginary padding.
  let off = -1;
  const window = (): [number, number] | null => {
    const hi = Math.min(off + F[k] - 1, n - 1);
    return off + 1 <= hi ? [off + 1, hi] : null;
  };

  s.hover(Math.min(n - 1, Math.max(0, F[Math.max(0, k - 2)] - 1)));
  yield s.frame({
    note: `Fibonacci search is binary search that cuts the window at Fibonacci sizes instead of in half. Finding the next window takes only subtraction, which once mattered on machines where division was slow.`,
    window: window(),
    counterHighlight: { [FIB]: null },
  });

  const pad = F[k] - 1 - n;
  yield s.frame({
    line: 1,
    note: `A window of F(k) − 1 positions splits neatly into F(k − 2) − 1 and F(k − 1) − 1 around one probe. The smallest Fibonacci number above n = ${n} is F(${k}) = ${F[k]}, so start with ${F[k] - 1} slots${pad === 1 ? '; the last one lies past the array and counts as +∞' : pad > 1 ? `; the last ${pad} lie past the array and count as +∞` : ''}.`,
    window: window(),
    counterHighlight: { [FIB]: k },
    vars: { x, k, 'F(k)': F[k] },
  });
  yield s.frame({
    line: 2,
    note: `off = −1 marks the position just before the window, which is positions 0 to ${F[k] - 2}.`,
    window: window(),
    counterHighlight: { [FIB]: k },
    vars: { x, k, 'F(k)': F[k], off },
  });

  while (F[k] > 1) {
    const i = off + F[k - 2];
    const split = `positions ${off + 1}–${off + F[k] - 1} split at i = ${num(off)} + F(${k - 2}) = ${i}: ${F[k - 2] - 1} to its left, ${F[k - 1] - 1} to its right`;
    const baseVars = { x, k, 'F(k)': F[k], off, i };
    let v: number;
    if (i < n) {
      v = s.probe(i);
      yield s.frame({
        line: 5,
        note: `The window's ${split}. Compare A[${i}] = ${v} with ${x}.`,
        window: window(),
        probe: i,
        pointers: { i },
        counterHighlight: { [FIB]: k },
        vars: { ...baseVars, v },
        checkpoint: { question: `Where can ${x} still be, compared with position ${i}?`, choices: SIDES, answer: side(v, x) },
      });
    } else {
      v = Infinity;
      yield s.frame({
        line: 5,
        note: `The window's ${split}. Position ${i} is past the end of the array, so treat it as +∞, which is larger than ${x}.`,
        window: window(),
        counterHighlight: { [FIB]: k },
        vars: { ...baseVars, v: '+∞' },
      });
    }

    if (v === x) {
      yield s.frame({ line: 6, note: `A[${i}] = ${x}. ${foundNote(s, i)}`, found: i, pointers: { i }, counterHighlight: { [FIB]: k }, vars: baseVars });
      return;
    }
    if (v < x) {
      off = i;
      k -= 1;
      yield s.frame({
        line: 7,
        note: `${v} < ${x}, so ${x} can only be right of position ${i}. Set off = ${i} and k = ${k}: the new window is the F(${k}) − 1 = ${F[k] - 1} positions after it.`,
        window: window(),
        pointers: { i },
        counterHighlight: { [FIB]: k },
        vars: { ...baseVars, k, 'F(k)': F[k], off },
      });
    } else {
      k -= 2;
      yield s.frame({
        line: 8,
        note: `${v === Infinity ? '+∞' : v} > ${x}, so ${x} can only be left of position ${i}. Set k = ${k}: the new window is the F(${k}) − 1 = ${F[k] - 1} positions before it.`,
        window: window(),
        pointers: { i },
        counterHighlight: { [FIB]: k },
        vars: { ...baseVars, k, 'F(k)': F[k] },
      });
    }
  }

  yield s.frame({
    line: 9,
    note: absentNote(s, `F(${k}) = ${F[k]}, so the window holds F(${k}) − 1 = 0 positions.`),
    counterHighlight: { [FIB]: k },
    vars: { x, k, 'F(k)': F[k], off },
  });
}

export const fibonacciSearch = defineAlgorithm<SearchInput, ArrayState>({
  kind: 'algorithm',
  slug: 'fibonacci-search',
  view: 'array',
  input: searchInput({ sorted: true, examples: ['present', 'absent', 'first', 'last'], defaultSize: 12 }),
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
    idea: 'Like binary search, but the window is cut at Fibonacci sizes instead of in half: a window of F(k) − 1 positions splits around one probe into windows of F(k − 2) − 1 and F(k − 1) − 1. Moving to the next window needs only subtraction.',
    invariant: 'The target, if present, lies in positions off + 1 to off + F(k) − 1. Each probe keeps that true and lowers k by one (going right) or two (going left).',
    whenToUse: 'Mostly of historical and teaching interest: it suited machines where division was slow, and its probes sit closer together than binary search’s, which can help on slow sequential storage. Today binary search is usually the better choice.',
    traits: [
      { label: 'Needs sorted input', good: null },
      { label: 'Only adds and subtracts', good: true },
      { label: 'A few more probes than binary search', good: false },
    ],
    experiments: [
      { example: 'last', prompt: 'Each probe below the target lowers k by one. Watch the highlighted Fibonacci number step down.' },
      { example: 'first', prompt: 'Each probe above the target lowers k by two, so going left shrinks the window faster.' },
      { example: 'absent', prompt: 'The search ends when F(k) − 1 = 0: an empty window, so the target is absent.' },
    ],
  },
});

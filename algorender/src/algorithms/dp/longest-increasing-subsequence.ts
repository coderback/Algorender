import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng, parseArrayInput } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { arcBend, CELLS, clampSize, joinWords, numberChoices, randomInts } from './shared';

/** dp: compare with every earlier value, O(n²). fast: binary search on the smallest tail of each length, O(n log n). */
export type LisMode = 'dp' | 'fast';
export type LisInput = { values: number[]; mode: LisMode };

export const MAX_LIS = 12;

const pseudocode = [
  'for i from 0 to n − 1:',
  '  dp[i] ← 1;  prev[i] ← none',
  '  for j from 0 to i − 1:',
  '    if v[j] < v[i]:   (v[i] can follow)',
  '      if dp[j] + 1 > dp[i]:',
  '        dp[i] ← dp[j] + 1;  prev[i] ← j',
  '',
  'i ← an index with the largest dp[i]',
  'while i ≠ none: take v[i]; i ← prev[i]',
  '',
  'faster: for i from 0 to n − 1:',
  '  k ← first k with tails[k] ≥ v[i]',
  '  (binary search; none: k ← len + 1)',
  '  tails[k] ← v[i];  idx[k] ← i',
  '  dp[i] ← k;  prev[i] ← idx[k − 1]',
];

const V = 0;
const DP = 1;
const PREV = 2;
const TAILS = 'tails';
const LIST = 'lis';
const NONE = '–';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the fill phase leaves behind: dp and prev for every index, and where a longest run ends. */
type Filled = { dp: number[]; prev: (number | null)[]; end: number };

function* run({ values, mode }: LisInput): Generator<Frame<GridState>> {
  const n = values.length;
  const t = new GridTracer(['cells', 'comparisons']);
  t.addTable({
    label: 'dp[i]: longest increasing run that ends at v[i]',
    corner: 'i',
    rows: [
      { id: 'v', label: 'v', scale: Math.max(1, ...values) },
      { id: 'dp', label: 'dp' },
      { id: 'prev', label: 'prev' },
    ],
    cols: values.map((_, i) => ({ label: String(i) })),
  });
  values.forEach((v, i) => t.set([V, i], v));
  t.addList({ id: LIST, label: 'Longest increasing subsequence', empty: 'Read off during the traceback' });

  const { dp, prev, end } = mode === 'fast' ? yield* fillFast(t, values) : yield* fillQuadratic(t, values);
  const longest = dp[end];

  yield t.frame({
    line: 7,
    note:
      mode === 'fast'
        ? 'Every value is placed: tails has one entry for each length that some increasing run reaches.'
        : 'Every dp[i] is filled in, and the longest increasing subsequence has to end at one of these positions, not necessarily the last one.',
    marks: { compare: values.map((_, i) => [DP, i] as const) },
    vars: { n },
    // Tempting wrong answers: the last entry, the whole array, one more than the truth.
    checkpoint: {
      question: 'How long is the longest increasing subsequence?',
      ...numberChoices(longest, [dp[n - 1], n, longest + 1, Math.max(1, longest - 1), longest + 2]),
    },
  });

  t.mark([DP, end], 'path');
  t.mark([V, end], 'path');
  t.addItem(LIST, { id: `v${end}`, text: String(values[end]), mark: 'path' });
  yield t.frame({
    line: 7,
    note: `The largest entry is dp[${end}] = ${longest}, so the longest increasing subsequence has ${plural(longest, 'value')} and ends at v[${end}] = ${values[end]}${
      dp[n - 1] < longest ? `, even though dp[${n - 1}] is only ${dp[n - 1]}` : ''
    }.`,
    vars: { i: end, 'dp[i]': longest },
  });

  const seq = [values[end]];
  for (let i = end; prev[i] != null; ) {
    const p = prev[i]!;
    t.addArrow({ from: [DP, i], to: [DP, p], mark: 'path', bend: -arcBend(i - p) });
    t.mark([DP, p], 'path');
    t.mark([V, p], 'path');
    t.mark([PREV, i], 'path');
    t.addItem(LIST, { id: `v${p}`, text: String(values[p]), mark: 'path' }, 'start');
    seq.unshift(values[p]);
    yield t.frame({
      line: 8,
      note:
        prev[p] == null
          ? `prev[${i}] = ${p}: before ${values[i]} comes v[${p}] = ${values[p]}, which has no prev, so the subsequence is complete.`
          : `prev[${i}] = ${p}: before ${values[i]} comes v[${p}] = ${values[p]}, the end of a best run of length ${dp[p]}.`,
      vars: { i: p, 'v[i]': values[p] },
    });
    i = p;
  }

  const work =
    mode === 'fast' ? ` It took ${t.stats.comparisons} comparisons, where checking every earlier value takes ${(n * (n - 1)) / 2}.` : '';
  yield t.frame({
    note:
      (longest === 1
        ? `The longest increasing subsequence is just ${values[end]}: no value is larger than any value before it, so no two values can rise.`
        : `The longest increasing subsequence is ${seq.join(', ')} (length ${longest}): read back through prev, it skips the values in between, which a subsequence may do.`) + work,
    vars: { length: longest },
  });
}

/** O(n²): dp[i] looks at every earlier, smaller value. */
function* fillQuadratic(t: GridTracer, values: readonly number[]): Generator<Frame<GridState>, Filled> {
  const n = values.length;
  const dp: number[] = [];
  const prev: (number | null)[] = [];

  yield t.frame({
    note: 'dp[i] will be the length of the longest strictly increasing subsequence that ends exactly at v[i], and prev[i] the index of the value before it, so the best run can be read back at the end.',
    vars: { n },
  });

  for (let i = 0; i < n; i++) {
    const vi = values[i];
    const here: CellRef = [DP, i];
    const own: CellRef[] = [[V, i], here, [PREV, i]];
    const earlier = Array.from({ length: i }, (_, j) => j);
    const smaller = earlier.filter((j) => values[j] < vi);
    const notSmaller = earlier.filter((j) => values[j] >= vi);
    t.count('comparisons', i);

    if (smaller.length === 0) {
      dp[i] = 1;
      prev[i] = null;
      t.set(here, 1);
      t.set([PREV, i], NONE);
      t.count('cells');
      yield t.frame({
        line: i === 0 ? 1 : 3,
        note:
          i === 0
            ? `v[0] = ${vi} has nothing before it, so the only run ending there is ${vi} on its own: dp[0] = 1.`
            : `No earlier value is smaller than v[${i}] = ${vi}, so nothing can come before it in an increasing run: dp[${i}] = 1.`,
        marks: { key: own, reject: notSmaller.map((j) => [V, j] as const) },
        vars: { i, 'v[i]': vi, 'dp[i]': 1 },
      });
      continue;
    }

    // The first j with the largest dp among the smaller values (later ties do not replace it: the test is "> dp[i]").
    const j = smaller.reduce((b, k) => (dp[k] > dp[b] ? k : b), smaller[0]);
    const best = dp[j] + 1;
    const ties = smaller.filter((k) => dp[k] === dp[j]).length - 1;
    const listed = smaller.map((k) => `${values[k]} (dp ${dp[k]})`);
    const others = notSmaller.map((k) => String(values[k]));
    yield t.frame({
      line: 3,
      note: `v[${i}] = ${vi} can extend a run that ends at any earlier, smaller value: ${joinWords(listed)}${
        others.length > 0 ? `; ${joinWords(others)} ${others.length === 1 ? 'is' : 'are'} not smaller` : ''
      }.`,
      marks: {
        key: [[V, i], here],
        compare: smaller.flatMap((k) => [[V, k] as const, [DP, k] as const]),
        reject: notSmaller.map((k) => [V, k] as const),
      },
      arrows: smaller.map((k) => ({ from: [DP, k] as const, to: here, mark: 'compare' as const, bend: arcBend(i - k) })),
      vars: { i, 'v[i]': vi },
      // Wrong answers from real slips: counting every smaller value, extending the longest run whatever its end, forgetting the + 1.
      checkpoint: { question: `What is dp[${i}]?`, ...numberChoices(best, [smaller.length + 1, Math.max(...dp) + 1, best - 1, 1]) },
    });

    dp[i] = best;
    prev[i] = j;
    t.set(here, best);
    t.set([PREV, i], j);
    t.count('cells');
    yield t.frame({
      line: 5,
      note: `The longest run it can extend ends at v[${j}] = ${values[j]} with length ${dp[j]}${
        ties > 0 ? ` (the first of ${ties + 1} that tie)` : ''
      }, so dp[${i}] = ${dp[j]} + 1 = ${best} and prev[${i}] = ${j}.`,
      marks: { key: own, compare: [[V, j], [DP, j]] },
      arrows: [{ from: [DP, j], to: here, mark: 'compare', bend: arcBend(i - j) }],
      vars: { i, j, 'v[i]': vi, 'dp[i]': best },
    });
  }

  const longest = Math.max(...dp);
  return { dp, prev, end: dp.indexOf(longest) };
}

/**
 * O(n log n): tails[k] is the smallest value that ends an increasing run of
 * length k. Tails only ever rise from left to right, so each value finds its
 * length by binary search; dp and prev come out the same shape as before.
 */
function* fillFast(t: GridTracer, values: readonly number[]): Generator<Frame<GridState>, Filled> {
  const n = values.length;
  t.addTable({
    id: TAILS,
    label: 'tails[k]: smallest value that ends an increasing run of length k',
    corner: 'k',
    rows: [
      { id: 'tails', label: 'tails' },
      { id: 'idx', label: 'idx' },
    ],
    cols: values.map((_, k) => ({ label: String(k + 1) })),
  });
  const tails: number[] = []; // 0-based here; length k lives at tails[k − 1]
  const idx: number[] = [];
  const dp: number[] = [];
  const prev: (number | null)[] = [];
  const tailCell = (k: number): CellRef => [TAILS, 0, k];

  yield t.frame({
    line: 10,
    note: 'Instead of looking back at every earlier value, keep tails[k], the smallest value that ends an increasing run of length k: a smaller end leaves more room for later values, and tails always rises, so each value can find its length by binary search.',
    vars: { n },
  });

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const len = tails.length;
    const probes: number[] = [];
    let lo = 0;
    for (let hi = len; lo < hi; ) {
      const mid = (lo + hi) >> 1;
      probes.push(mid);
      if (tails[mid] >= v) hi = mid;
      else lo = mid + 1;
    }
    const k = lo; // v becomes the end of a run of length k + 1
    const before = [...tails];
    const p = k > 0 ? idx[k - 1] : null;

    if (len > 0) {
      const options = [...new Set([k, k - 1, k + 1, len].filter((x) => x >= 0 && x <= len))].sort((a, b) => a - b);
      const label = (x: number) => (x < len ? `Replace tails[${x + 1}] = ${tails[x]}` : `Append it as tails[${len + 1}]`);
      yield t.frame({
        line: 11,
        note: `tails = ${tails.join(', ')}${len > 1 ? ' rises from left to right, so' : ':'} a binary search finds the first tail ≥ ${v}; if there is none, ${v} extends the longest run so far.`,
        marks: { key: [[V, i], [DP, i], [PREV, i]], compare: tails.map((_, c) => tailCell(c)) },
        vars: { i, 'v[i]': v, len },
        checkpoint: { question: `Where does ${v} go in tails?`, choices: options.map(label), answer: options.indexOf(k) },
      });
    }

    tails[k] = v;
    idx[k] = i;
    dp[i] = k + 1;
    prev[i] = p;
    t.set(tailCell(k), v);
    t.set([TAILS, 1, k], i);
    t.set([DP, i], k + 1);
    t.set([PREV, i], p ?? NONE);
    t.count('cells');
    t.count('comparisons', probes.length);
    const search = probes.map((m) => `${before[m]} ${before[m] >= v ? '≥' : '<'} ${v}`).join(', ');
    const placed =
      k === len
        ? `${v} extends the longest run: tails[${k + 1}] = ${v}`
        : `${v} replaces ${before[k]} as the smallest end of a run of length ${k + 1}`;
    yield t.frame({
      line: 13,
      note:
        len === 0
          ? `tails is empty, so ${v} starts the first run: tails[1] = ${v}, dp[0] = 1 and nothing comes before it.`
          : `Binary search: ${search}, so ${placed}; dp[${i}] = ${k + 1}${p == null ? ' with nothing before it' : `, and prev[${i}] = idx[${k}] = ${p}, the end of a run of length ${k}`}.`,
      marks: {
        key: [[V, i], [DP, i], [PREV, i], tailCell(k), [TAILS, 1, k]],
        compare: [...probes.filter((m) => m !== k).map(tailCell), ...(p == null ? [] : [[V, p] as const, [DP, p] as const])],
      },
      arrows: p == null ? [] : [{ from: [DP, p], to: [DP, i], mark: 'compare', bend: arcBend(i - p) }],
      vars: { i, 'v[i]': v, k: k + 1, 'dp[i]': k + 1 },
    });
  }

  return { dp, prev, end: idx[tails.length - 1] };
}

/** Strictly increasing values with gaps of 1–4. */
function increasing(seed: number, n: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  let v = 1 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    out.push(v);
    v += 1 + Math.floor(rng() * 4);
  }
  return out;
}

/** Values drawn from just three numbers, so many are equal. */
function fewValues(seed: number, n: number): number[] {
  const rng = createRng(seed);
  const pool = new Set<number>();
  while (pool.size < 3) pool.add(2 + Math.floor(rng() * 25));
  const p = [...pool];
  return Array.from({ length: n }, () => p[Math.floor(rng() * p.length)]);
}

const size = (s: number) => clampSize(s, 2, MAX_LIS);
const dpOf = (values: number[]): LisInput => ({ values, mode: 'dp' });

const custom: NonNullable<InputSpec<LisInput>['custom']> = {
  label: `Your own values (1–99, 2 to ${MAX_LIS}); add "| fast" for binary search`,
  placeholder: 'e.g. 10, 9, 2, 5, 3, 7, 21, 18',
  parse: (text) => {
    const [left, right, ...extra] = text.split('|');
    const flag = (right ?? '').trim().toLowerCase();
    if (extra.length > 0 || (right != null && flag !== 'fast' && flag !== '')) return { error: 'After the values, the only option is "| fast".' };
    const parsed = parseArrayInput(left, { min: 1, max: 99, maxSize: MAX_LIS });
    if ('error' in parsed) return parsed;
    if (parsed.values.length < 2) return { error: 'Enter at least two values.' };
    return { value: { values: parsed.values, mode: flag === 'fast' ? 'fast' : 'dp' } };
  },
  format: ({ values, mode }) => `${values.join(', ')}${mode === 'fast' ? ' | fast' : ''}`,
};

export const longestIncreasingSubsequence = defineAlgorithm<LisInput, GridState>({
  kind: 'algorithm',
  slug: 'longest-increasing-subsequence',
  view: 'grid',
  input: {
    examples: [
      { id: 'textbook', label: 'Textbook (10, 9, 2, 5, …)', make: () => dpOf([10, 9, 2, 5, 3, 7, 21, 18]), sized: false },
      { id: 'random', label: 'Random', make: ({ seed, size: s }) => dpOf(randomInts(seed, size(s), 1, 30)) },
      { id: 'increasing', label: 'Already increasing', make: ({ seed, size: s }) => dpOf(increasing(seed, size(s))) },
      { id: 'decreasing', label: 'Decreasing', make: ({ seed, size: s }) => dpOf(increasing(seed, size(s)).reverse()) },
      { id: 'ties', label: 'Many ties', make: ({ seed, size: s }) => dpOf(fewValues(seed, size(s))) },
      { id: 'fast', label: 'Faster: binary search (O(n log n))', make: ({ seed, size: s }) => ({ values: randomInts(seed, size(s), 1, 30), mode: 'fast' }) },
    ],
    size: { label: 'Size', min: 2, max: MAX_LIS, default: 8 },
    custom,
  },
  pseudocode,
  stats: [CELLS, { key: 'comparisons', label: 'Comparisons' }],
  legend: [
    { neutral: 'Value (bar) or computed entry' },
    { mark: 'key', label: 'Position being filled' },
    { mark: 'compare', label: 'Values or tails it is compared with' },
    { mark: 'reject', label: 'Earlier values that are not smaller' },
    { mark: 'path', label: 'The subsequence (traceback)' },
  ],
  run,
  content: {
    idea: 'A subsequence keeps the order but may skip values. For each position i, work out the longest increasing run that ends exactly at v[i]: one more than the best run ending at an earlier, smaller value. The answer is the largest of these, and prev pointers recover the values.',
    invariant: 'dp[i] = 1 + max{ dp[j] : j < i and v[j] < v[i] }, or 1 when no earlier value is smaller. The answer is the largest dp[i], not dp[n − 1], because the best run can end anywhere. In the faster version, tails[k] is the smallest end of a run of length k, and tails always rises.',
    whenToUse: 'Finding the longest ordered chain: rising prices, nesting boxes, stacking by size, and inside diff and patience-sorting tools. The O(n²) scan is the clearest; keeping the smallest tail of each length and binary searching it gives O(n log n).',
    traits: [
      { label: 'Simple O(n²) recurrence', good: true },
      { label: 'O(n log n) with binary search', good: true },
      { label: 'Answer can end anywhere', good: null },
    ],
    experiments: [
      { example: 'textbook', prompt: 'Both 2, 5, 7, 21 and 2, 3, 7, 18 have length 4. Watch dp[5] (the 7): 5 and 3 tie, and the first one found is kept.' },
      { example: 'decreasing', prompt: 'No value is larger than any value before it, so every dp[i] stays 1 and the answer is a single value.' },
      { example: 'ties', prompt: 'Equal values never extend each other: "increasing" means strictly increasing, so ties are marked as not smaller.' },
      { example: 'fast', prompt: 'The same values as Random, placed by binary search on tails. The dp row comes out the same; compare the Comparisons counter with the Random run.' },
    ],
  },
});

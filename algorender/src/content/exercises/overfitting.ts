// Overfitting and validation as code (B7 of the math and ML path): the rows
// [1, x, x², …, x^degree] of a polynomial fit's design matrix, written into a
// table(), and the k folds of k-fold cross-validation, marked in a table() as
// the timeline the visualiser draws. Milestone project M3 calls k_fold(n, k)
// with exactly this signature and behaviour.
//
// The tests' x's are halves and quarters, so every power is exact and Python
// and JavaScript write the same numbers to the last bit.

import { kFold } from '@/algorithms/ml/overfitting';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

type Grid = (number | null)[][];

const TOLERANCE = 1e-9;
const close = (a: number | null, b: number) => a != null && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const fmt = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;
const isInts = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number' && Number.isInteger(v));
const isFolds = (x: unknown): x is number[][] => Array.isArray(x) && x.every(isInts);

/** The learner's table: the one called `name`, else the first one made, with its size. */
function learnerTable(result: RunResult, name: string): { values: Grid; rows: number; cols: number } | null {
  const made = result.events.filter((e) => e.kind === 'grid');
  const event = made.find((e) => e.kind === 'grid' && e.name === name) ?? made[0];
  if (!event || event.kind !== 'grid') return null;
  return { values: result.grids?.[event.grid] ?? event.values, rows: event.rows, cols: event.cols };
}

const sameGrid = (got: Grid, want: readonly (readonly number[])[]) => got.length === want.length && want.every((row, i) => got[i]?.length === row.length && row.every((v, j) => close(got[i][j], v)));

// ───────────────────────────── 1. poly-features ─────────────────────────────

export type FeaturesInput = { xs: number[]; degree: number };

/**
 * The design matrix, and the usual slips as the code that makes them would run:
 * - right: row i is [1, x, …, x^degree], degree + 1 columns.
 * - short: degree columns, powers 0 … degree − 1 (one column short).
 * - no-ones: degree columns, powers 1 … degree (the column of 1s left out).
 * - from-one: degree + 1 columns, powers 1 … degree + 1 (every power one too high).
 * - times: x·j instead of x^j.
 * - unfilled: the loop over j stops before degree, so the last column stays 0.
 * - transposed: a row per power and a column per x.
 */
export type FeatureSlip = 'right' | 'short' | 'no-ones' | 'from-one' | 'times' | 'unfilled' | 'transposed';

export function featureRows({ xs, degree }: FeaturesInput, how: FeatureSlip = 'right'): number[][] {
  const cols = how === 'short' || how === 'no-ones' ? degree : degree + 1;
  const cell = (x: number, j: number) => (how === 'times' ? x * j : how === 'no-ones' || how === 'from-one' ? x ** (j + 1) : how === 'unfilled' && j === degree ? 0 : x ** j);
  const rows = xs.map((x) => Array.from({ length: cols }, (_, j) => cell(x, j)));
  return how === 'transposed' ? Array.from({ length: cols }, (_, j) => rows.map((r) => r[j])) : rows;
}

const SLIP_MESSAGES: { how: FeatureSlip; message: (input: FeaturesInput) => string }[] = [
  {
    how: 'no-ones',
    message: ({ degree }) =>
      `Your rows start at x¹ and leave out the column of 1s. A degree-${degree} curve has ${degree + 1} weights, w₀ to w_${degree}, and w₀ (where the curve crosses x = 0) multiplies x⁰ = 1: column 0 must be all 1s. Make the table degree + 1 wide and start j at 0.`,
  },
  {
    how: 'short',
    message: ({ degree }) =>
      `Your table has ${degree} columns, one short: powers 0 to ${degree} are ${degree + 1} of them, so make it table(len(xs), degree + 1) and run j from 0 to degree, both included.`,
  },
  { how: 'from-one', message: () => 'Every power is one too high: column j should hold x to the power j, so column 0 is x⁰ = 1, column 1 is x itself.' },
  { how: 'times', message: () => 'You wrote x × j, not x to the power j: column 2 should be x² = x × x, not 2x. Python writes the power `x ** j`, and JavaScript too.' },
  { how: 'unfilled', message: ({ degree }) => `The last column, x^${degree}, is still 0: the loop over j stops one short. Run j from 0 to degree, both included (range(degree + 1), or j <= degree).` },
  { how: 'transposed', message: ({ xs }) => `Your table is on its side: a row per power and a column per x. X has one row per point (${xs.length} rows), and row i is [1, x, x², …] for x = xs[i].` },
];

function checkFeatures(input: FeaturesInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { xs, degree } = input;
  const want = featureRows(input);
  const X = learnerTable(result, 'X');
  if (!X) return { pass: false, message: 'Make X with X = table(rows, cols) and fill it: the cells you write there are what the picture shows.' };
  if (sameGrid(X.values, want)) {
    if (!Array.isArray(result.returned)) return { pass: false, message: 'Every cell of X is right: now return X.' };
    return {
      pass: true,
      message: `X is ${xs.length}×${degree + 1}: a row for each of the ${xs.length} points and a column for each power from x⁰ to x^${degree}. Row 1, for x = ${fmt(xs[1] ?? xs[0])}, is ${list(want[1] ?? want[0])}.`,
    };
  }
  for (const { how, message } of SLIP_MESSAGES) if (sameGrid(X.values, featureRows(input, how))) return { pass: false, message: message(input) };
  if (X.rows !== xs.length || X.cols !== degree + 1) return { pass: false, message: `X is ${X.rows}×${X.cols}, but it needs ${xs.length} rows (one per point) and ${degree + 1} columns (powers 0 to ${degree}): table(len(xs), degree + 1).` };
  for (let i = 0; i < xs.length; i++)
    for (let j = 0; j <= degree; j++)
      if (!close(X.values[i][j], want[i][j])) {
        const got = X.values[i][j];
        return { pass: false, message: `X[${i}][${j}] should be xs[${i}] to the power ${j}: ${fmt(xs[i])}^${j} = ${fmt(want[i][j])}, but it holds ${got == null ? 'nothing' : fmt(got)}.` };
      }
  return { pass: false, message: 'Compare your X with the right one cell by cell.' };
}

const FEATURES_BLANKS_PY = `def poly_features(xs, degree):
    X = «1:table(len(xs), degree + 1)»
    for i in range(len(xs)):
        for j in range(«2:degree + 1»):
            X[i][j] = «3:xs[i] ** j»
    return «4:X»
`;
const FEATURES_BLANKS_JS = `function polyFeatures(xs, degree) {
  const X = «1:table(xs.length, degree + 1)»;
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; «2:j <= degree»; j++) {
      X[i][j] = «3:xs[i] ** j»;
    }
  }
  return «4:X»;
}
`;
const FEATURES_STARTER_PY = `def poly_features(xs, degree):
    # Make X = table(rows, cols): one row for each x, and one column for
    # each power of x from x to the 0 (which is 1) up to x to the degree.
    # Then fill it: X[i][j] is xs[i] to the power j. Return X.
    X = table(1, 1)
    return X
`;
const FEATURES_STARTER_JS = `function polyFeatures(xs, degree) {
  // Make X = table(rows, cols): one row for each x, and one column for
  // each power of x from x to the 0 (which is 1) up to x to the degree.
  // Then fill it: X[i][j] is xs[i] to the power j. Return X.
  const X = table(1, 1);
  return X;
}
`;
const featuresTs = (js: string) =>
  js.replace('function polyFeatures(xs, degree) {', 'function polyFeatures(xs: number[], degree: number): number[][] {').replace('const X = ', 'const X: number[][] = ');

const featuresArgs = ({ xs, degree }: FeaturesInput): Arg[] => [
  { kind: 'array', name: 'xs', values: xs },
  { kind: 'value', name: 'degree', value: degree },
];

export const FEATURE_TESTS: { name: string; input: FeaturesInput }[] = [
  { name: 'four points, degree 3', input: { xs: [-1, -0.5, 0.5, 1], degree: 3 } },
  { name: 'a line: degree 1', input: { xs: [0, 1, 2, 3], degree: 1 } },
  { name: 'degree 0: just the column of 1s', input: { xs: [2, -1.5, 0.25], degree: 0 } },
  { name: 'five points, degree 4', input: { xs: [-2, -1, 0, 0.5, 1.5], degree: 4 } },
  { name: 'more columns than points: degree 5 on three', input: { xs: [-0.5, 0.25, 0.75], degree: 5 } },
];

const featuresExercise: Exercise<FeaturesInput> = {
  slug: 'poly-features',
  title: 'The powers of x: a polynomial’s features',
  kind: 'write',
  visualiser: 'overfitting',
  summary: 'Write the rows [1, x, x², …, x^degree] into a table: the design matrix that least squares fits a polynomial with.',
  task: [
    'A polynomial of degree d, y = w₀ + w₁x + w₂x² + … + w_d·x^d, is a weighted sum of the powers of x, so fitting it is fitting a line with more columns. Write `poly_features(xs, degree)` (`polyFeatures` in JavaScript and TypeScript), which returns the table X whose row i is [1, x, x², …, x^degree] for x = xs[i].',
    'Make it with `X = table(len(xs), degree + 1)`: one row per point and one column per power, from x⁰ = 1 up to x^degree, so degree + 1 columns. Fill X[i][j] with xs[i] to the power j (`xs[i] ** j` in Python and JavaScript), then return X. This is the design matrix the least-squares fit of a curve uses.',
  ],
  entry: { python: 'poly_features', js: 'polyFeatures' },
  args: featuresArgs,
  starter: { python: FEATURES_STARTER_PY, javascript: FEATURES_STARTER_JS, typescript: featuresTs(FEATURES_STARTER_JS) },
  solution: { python: stripBlanks(FEATURES_BLANKS_PY), javascript: stripBlanks(FEATURES_BLANKS_JS), typescript: featuresTs(stripBlanks(FEATURES_BLANKS_JS)) },
  blanks: { python: FEATURES_BLANKS_PY, javascript: FEATURES_BLANKS_JS, typescript: featuresTs(FEATURES_BLANKS_JS) },
  fades: [[3], [1, 3], [1, 2, 3, 4]],
  distractors: {
    python: ['            X[i][j] = xs[i] * j', '    X = table(len(xs), degree)'],
    javascript: ['      X[i][j] = xs[i] * j;', '  const X = table(xs.length, degree);'],
    typescript: ['      X[i][j] = xs[i] * j;', '  const X: number[][] = table(xs.length, degree);'],
  },
  examples: [
    { id: 'cubic', label: 'Four points, degree 3', input: FEATURE_TESTS[0].input },
    { id: 'quartic', label: 'Five points, degree 4', input: FEATURE_TESTS[3].input },
  ],
  tests: FEATURE_TESTS,
  check: checkFeatures,
  markSortedAtEnd: false,
  pointers: ['i', 'j'],
  hints: [
    'Two loops: i over the points, j over the powers 0, 1, …, degree. Python’s range(degree + 1) stops before degree + 1, so it includes degree.',
    'X[i][j] = xs[i] ** j. Any number to the power 0 is 1, so column 0 fills with 1s by itself.',
    'The table is len(xs) rows by degree + 1 columns: a degree-3 curve has 4 weights, w₀ to w₃.',
  ],
  legend: [
    { neutral: 'A cell not written yet (0)' },
    { mark: 'write', label: 'The cell just written' },
  ],
};

// ───────────────────────────── 2. k-fold ─────────────────────────────

export type FoldInput = { n: number; k: number };

/**
 * The folds, and the usual slips:
 * - right: consecutive folds, ⌊n/k⌋ each, the first n mod k one more.
 * - drop-remainder: every fold ⌊n/k⌋, so the last n mod k indices are in none.
 * - last-gets-rest: the last fold takes all n mod k extras.
 * - ceil: every fold ⌈n/k⌉ until the indices run out, so the last is short.
 * - remainder-last: the extras go to the last folds instead of the first.
 * - inclusive: each fold runs to start + size included, overlapping the next.
 * - no-advance: start never moves on, so every fold starts at 0.
 * - strided: index i in fold i mod k (folds, but not consecutive).
 * - training: each model's training indices instead of its fold.
 */
export type FoldSlip = 'right' | 'drop-remainder' | 'last-gets-rest' | 'ceil' | 'remainder-last' | 'inclusive' | 'no-advance' | 'strided' | 'training';

export function foldsOf({ n, k }: FoldInput, how: FoldSlip = 'right'): number[][] {
  if (how === 'right') return kFold(n, k);
  if (how === 'strided') return Array.from({ length: k }, (_, f) => Array.from({ length: n }, (_, i) => i).filter((i) => i % k === f));
  if (how === 'training') return kFold(n, k).map((fold) => Array.from({ length: n }, (_, i) => i).filter((i) => !fold.includes(i)));
  const folds: number[][] = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    let size = Math.floor(n / k);
    if (how === 'last-gets-rest' && f === k - 1) size = n - start;
    if (how === 'ceil') size = Math.min(Math.ceil(n / k), n - start);
    if (how === 'remainder-last' && f >= k - (n % k)) size++;
    if ((how === 'inclusive' || how === 'no-advance') && f < n % k) size++;
    const end = how === 'inclusive' ? Math.min(n - 1, start + size) : start + size - 1;
    folds.push(Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i));
    if (how !== 'no-advance') start += size;
  }
  return folds;
}

const sameFolds = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) => JSON.stringify(a) === JSON.stringify(b);
const sizesOf = (folds: readonly (readonly number[])[]) => folds.map((f) => f.length).join(', ');

function checkFolds(input: FoldInput, result: RunResult): Verdict {
  const { n, k } = input;
  const want = kFold(n, k);
  const extra = n % k;
  if (result.error) {
    const past = /out of range/i.test(result.error.message);
    if (past) return { pass: false, message: `${crashed(result)!.message}. An index reached n = ${n} or more, past the last one, n − 1 = ${n - 1}. A fold runs from start up to start + size, not including it (range stops before its end), and the folds together hold exactly ${n} indices.` };
    return crashed(result)!;
  }
  const got = result.returned;
  if (!isFolds(got)) return { pass: false, message: 'Return the folds: a list of k lists, each holding the indices of one fold.' };
  if (got.length === 0) return { pass: false, message: `folds is empty. Make ${k} folds of consecutive indices, ${Math.floor(n / k)} each${extra ? `, and one more in each of the first ${extra}` : ''}, and append each one.` };
  const is = (how: FoldSlip) => sameFolds(got, foldsOf(input, how));
  if (is('right')) {
    const T = learnerTable(result, 'scored');
    const marks = want.map((fold) => Array.from({ length: n }, (_, i) => (fold.includes(i) ? 1 : 0)));
    if (!T || T.values.every((row) => row.every((v) => !v))) return { pass: false, message: 'The folds are right, but scored is still all 0: set scored[f][i] = 1 for every index i you put in fold f, so the run draws which points each model is scored on.' };
    if (!sameGrid(T.values, marks)) {
      const f = marks.findIndex((row, r) => !row.every((v, i) => close(T.values[r]?.[i] ?? null, v)));
      return { pass: false, message: `The folds are right, but row ${f} of scored should have a 1 exactly at fold ${f}’s indices, ${list(want[f])}, and 0 everywhere else.` };
    }
    return {
      pass: true,
      message: `${k} folds of sizes ${sizesOf(want)}, every index from 0 to ${n - 1} in exactly one. Model 1 is scored on ${list(want[0])} and trains on the other ${n - want[0].length}.`,
    };
  }
  if (is('training')) return { pass: false, message: `You returned each model’s training indices, the ${n - want[0].length} outside its fold. Return the folds themselves: fold f holds the indices model f is scored on, ${list(want[0])} for the first.` };
  if (extra && is('drop-remainder')) return { pass: false, message: `${n} ÷ ${k} leaves ${extra} over, and your folds leave out the last ${extra} ${extra === 1 ? 'index' : 'indices'}, so ${extra === 1 ? 'it is' : 'they are'} never scored. Give one extra to each of the first ${extra} folds: size = n // k, plus 1 while f < n % k.` };
  if (extra > 1 && is('last-gets-rest')) return { pass: false, message: `Your folds have sizes ${sizesOf(got)}: the last one took all ${extra} extras. Share them out, one each to the first ${extra} folds, so sizes differ by at most one: ${sizesOf(want)}.` };
  if (is('ceil')) return { pass: false, message: `Your folds have sizes ${sizesOf(got)}: each took ⌈${n}/${k}⌉ = ${Math.ceil(n / k)} until the indices ran out, so the last ${got.at(-1)!.length === 0 ? 'is empty' : 'is short'}. Use n // k, plus 1 for the first n % k folds only: ${sizesOf(want)}.` };
  if (is('remainder-last')) return { pass: false, message: `Your folds have sizes ${sizesOf(got)}: the extras went to the last folds. Give them to the first ${extra} instead (f < n % k), so the sizes run ${sizesOf(want)}.` };
  if (is('inclusive')) return { pass: false, message: 'Neighbouring folds share an index: each fold runs one past its end. A fold of size s starting at start holds start, …, start + s − 1; range(start, start + size) stops before start + size.' };
  if (is('no-advance')) return { pass: false, message: 'Every fold starts at index 0: after making a fold, move start on by its size, so the next fold begins where this one ended.' };
  if (is('strided')) return { pass: false, message: `Those are fair folds, but not consecutive: you dealt the indices out in turn (i mod k). Here each fold is a consecutive stretch, ${list(want[0])} first, so a model is scored on one block of the data, as the timeline draws it.` };
  if (got.length !== k) return { pass: false, message: `There should be ${k} folds, but you returned ${got.length}.` };
  const flat = got.flat();
  const missing = Array.from({ length: n }, (_, i) => i).filter((i) => !flat.includes(i));
  const twice = flat.filter((v, i) => flat.indexOf(v) !== i);
  if (missing.length || twice.length || flat.some((v) => v < 0 || v >= n)) {
    return { pass: false, message: `Every index from 0 to ${n - 1} must be in exactly one fold.${missing.length ? ` Missing: ${list(missing)}.` : ''}${twice.length ? ` More than once: ${list([...new Set(twice)])}.` : ''}` };
  }
  const f = want.findIndex((fold, i) => !sameFolds([fold], [got[i]]));
  return { pass: false, message: `Fold ${f} should be ${list(want[f])}, but yours is ${list(got[f])}. Fold sizes are n // k, plus 1 for the first n % k folds, each starting where the one before ended.` };
}

const FOLDS_BLANKS_PY = `def k_fold(n, k):
    scored = table(k, n)
    folds = []
    start = 0
    for f in range(k):
        size = «1:n // k»
        if «2:f < n % k»:
            size = size + 1
        fold = []
        for i in range(«3:start, start + size»):
            fold.append(i)
            scored[f][i] = 1
        «4:folds.append(fold)»
        «5:start = start + size»
    return folds
`;
const FOLDS_BLANKS_JS = `function kFold(n, k) {
  const scored = table(k, n);
  const folds = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    let size = «1:Math.floor(n / k)»;
    if («2:f < n % k») {
      size = size + 1;
    }
    const fold = [];
    for (let i = start; «3:i < start + size»; i++) {
      fold.push(i);
      scored[f][i] = 1;
    }
    «4:folds.push(fold)»;
    «5:start = start + size»;
  }
  return folds;
}
`;
const FOLDS_STARTER_PY = `def k_fold(n, k):
    scored = table(k, n)
    folds = []
    # Cut the indices 0 to n - 1 into k folds of consecutive indices, in
    # order. Each fold holds n // k of them, and the first n % k folds one
    # more. For each index i you put in fold f, set scored[f][i] = 1, so
    # the run draws the folds. Return the list of folds.
    return folds
`;
const FOLDS_STARTER_JS = `function kFold(n, k) {
  const scored = table(k, n);
  const folds = [];
  // Cut the indices 0 to n - 1 into k folds of consecutive indices, in
  // order. Each fold holds Math.floor(n / k) of them, and the first n % k
  // folds one more. For each index i you put in fold f, set
  // scored[f][i] = 1, so the run draws the folds. Return the list of folds.
  return folds;
}
`;
const foldsTs = (js: string) =>
  js
    .replace('function kFold(n, k) {', 'function kFold(n: number, k: number): number[][] {')
    .replace('const scored = table(k, n);', 'const scored: number[][] = table(k, n);')
    .replace('const folds = [];', 'const folds: number[][] = [];')
    .replace('const fold = [];', 'const fold: number[] = [];');

/** The reference k_fold, for later code (milestone project M3) to carry into its starters. */
export const K_FOLD_CODE = { python: stripBlanks(FOLDS_BLANKS_PY), javascript: stripBlanks(FOLDS_BLANKS_JS), typescript: foldsTs(stripBlanks(FOLDS_BLANKS_JS)) };

const foldArgs = ({ n, k }: FoldInput): Arg[] => [
  { kind: 'value', name: 'n', value: n },
  { kind: 'value', name: 'k', value: k },
];

export const FOLD_TESTS: { name: string; input: FoldInput }[] = [
  { name: '10 points in 4 folds: two extras', input: { n: 10, k: 4 } },
  { name: '20 points in 5 folds: no extras', input: { n: 20, k: 5 } },
  { name: '7 points in 3 folds: one extra', input: { n: 7, k: 3 } },
  { name: '5 points in 5 folds: one point each (leave-one-out)', input: { n: 5, k: 5 } },
  { name: '9 points in 2 folds', input: { n: 9, k: 2 } },
  { name: '23 points in 6 folds: five extras', input: { n: 23, k: 6 } },
];

const foldsExercise: Exercise<FoldInput> = {
  slug: 'k-fold',
  title: 'Cut the data into k folds',
  kind: 'write',
  visualiser: 'overfitting',
  summary: 'Share the indices 0 to n − 1 into k consecutive folds whose sizes differ by at most one, the folds of k-fold cross-validation.',
  task: [
    'k-fold cross-validation cuts n data points into k folds; model f is fitted on every fold but fold f and scored on fold f. Write `k_fold(n, k)` (`kFold` in JavaScript and TypeScript), which returns the k folds as lists of indices: consecutive and in order, so fold 0 starts at index 0 and each fold starts where the one before ended. Folds count from 0 here, so the widget’s fold 1 (scored by model 1) is fold 0.',
    'Every index from 0 to n − 1 is in exactly one fold, and the sizes differ by at most one: each fold holds n // k indices (`Math.floor(n / k)` in JavaScript), and the first n % k folds hold one more. With n = 10 and k = 4 that is sizes 3, 3, 2, 2.',
    'Mark each index as you place it, `scored[f][i] = 1`, so the run draws the folds as a timeline: a row per model, its fold’s cells marked.',
  ],
  entry: { python: 'k_fold', js: 'kFold' },
  args: foldArgs,
  starter: { python: FOLDS_STARTER_PY, javascript: FOLDS_STARTER_JS, typescript: foldsTs(FOLDS_STARTER_JS) },
  solution: K_FOLD_CODE,
  blanks: { python: FOLDS_BLANKS_PY, javascript: FOLDS_BLANKS_JS, typescript: foldsTs(FOLDS_BLANKS_JS) },
  fades: [[2], [1, 2, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['        start = start + size - 1', '        size = n // k + n % k'],
    javascript: ['    start = start + size - 1;', '    let size = Math.ceil(n / k);'],
    typescript: ['    start = start + size - 1;', '    let size = Math.ceil(n / k);'],
  },
  examples: [
    { id: 'ten', label: '10 points in 4 folds', input: FOLD_TESTS[0].input },
    { id: 'twenty', label: '20 points in 5 folds', input: FOLD_TESTS[1].input },
  ],
  tests: FOLD_TESTS,
  check: checkFolds,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Keep start, the first index of the next fold, beginning at 0. For each fold f: work out its size, take the indices start, start + 1, …, start + size − 1, then move start on by size.',
    'size is n // k, plus 1 when f < n % k: with 10 points in 4 folds, n % k = 2, so folds 0 and 1 get 3 and folds 2 and 3 get 2.',
    'range(start, start + size) stops before start + size, so it holds exactly size indices.',
  ],
  legend: [
    { neutral: 'A point the model trains on (0)' },
    { mark: 'write', label: 'A point just placed in the model’s fold' },
  ],
};

export const overfittingExercises: Exercise[] = [featuresExercise, foldsExercise];

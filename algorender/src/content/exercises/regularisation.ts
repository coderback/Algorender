// Regularisation as code (B7 of the math and ML path): ridge regression's
// weights from the equations (XᵀX + λI)w = Xᵀy, built on the least-squares
// project's helpers (src/content/exercises/least-squares.ts), which the
// starter carries written out: transpose, matmul and matvec from part 1 and
// solve, Gaussian elimination with row swaps, from part 2.
//
// The loss is the total of the squared errors plus λ‖w‖², so λ goes on the
// diagonal as it is; defining the loss as a mean puts n·λ there instead,
// which the check names as a slip. Python and JavaScript write the same
// numbers into the tables: the loops do the same operations in the same order.

import { X2, Y2 } from '@/algorithms/ml/regularisation';
import type { Arg, RunResult } from '@/workspace/protocol';
import { applyTo, gauss, MATMUL_JS, MATMUL_PY, MATVEC_JS, MATVEC_PY, productOf, solveJs, solvePy, toTs, transposeOf, TRANSPOSE_JS, TRANSPOSE_PY } from './least-squares';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));
const fmt = (v: number) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;

export type RidgeInput = { X: number[][]; y: number[]; lam: number };

/**
 * Ridge's weights, and the usual slips, each as the equations the slip
 * solves, so a wrong answer can be named:
 * - forgot: λ left out, plain least squares.
 * - every: λ added to every entry of XᵀX, not only the diagonal.
 * - minus: λ subtracted from the diagonal.
 * - to-b: λ added to each entry of Xᵀy instead.
 * - times-n: n·λ on the diagonal, the loss taken as a mean of the squared errors.
 * - over-n: λ/n on the diagonal.
 * - twice: 2λ, the 2s of the derivative not cancelled.
 * - half: λ/2.
 */
export type RidgeSlip = 'right' | 'forgot' | 'every' | 'minus' | 'to-b' | 'times-n' | 'over-n' | 'twice' | 'half';

export function ridgeOf({ X, y, lam }: RidgeInput, how: RidgeSlip = 'right'): number[] {
  const Xt = transposeOf(X);
  const A = productOf(Xt, X).map((row) => [...row]);
  const b = applyTo(Xt, y);
  const n = X.length;
  const onDiagonal: Partial<Record<RidgeSlip, number>> = { right: lam, minus: -lam, 'times-n': n * lam, 'over-n': lam / n, twice: 2 * lam, half: lam / 2 };
  for (let i = 0; i < A.length; i++) {
    if (how === 'every') for (let j = 0; j < A.length; j++) A[i][j] += lam;
    else A[i][i] += onDiagonal[how] ?? 0;
  }
  return gauss(A, how === 'to-b' ? b.map((v) => v + lam) : b);
}

/** XᵀX + λI, the table the learner's code builds. */
export const ridgeMatrix = ({ X, lam }: Pick<RidgeInput, 'X' | 'lam'>): number[][] => productOf(transposeOf(X), X).map((row, i) => row.map((v, j) => (i === j ? v + lam : v)));

const SLIP_HELP: [RidgeSlip, (input: RidgeInput) => string][] = [
  ['forgot', ({ lam }) => `Those are the plain least-squares weights: λ = ${fmt(lam)} never made it into the equations. Add lam to each entry on the diagonal of XᵀX, A[i][i], before you solve.`],
  ['every', () => 'You added λ to every entry of XᵀX. The charge λ(w₁² + w₂² + …) gives each weight its own λ·wᵢ in the equations, so λ goes only on the diagonal, A[i][i]: that is what λI means, λ times the identity.'],
  ['minus', () => 'λ went on the diagonal with a minus sign, which rewards big weights instead of charging for them. Add it: A[i][i] = A[i][i] + lam.'],
  ['to-b', () => 'You added λ to Xᵀy, the right-hand side. The charge belongs with the weights, on the left: (XᵀX + λI)·w = Xᵀy, so add lam to A[i][i].'],
  ['times-n', ({ X }) => `You put ${X.length}·λ on the diagonal, which is ridge for the mean of the squared errors. Here the loss is their total plus λ‖w‖², so λ goes on as it is.`],
  ['over-n', ({ X }) => `You put λ/${X.length} on the diagonal. Here the loss is the total of the squared errors plus λ‖w‖², so λ goes on as it is.`],
  ['twice', () => 'You put 2λ on the diagonal. The slope of the total squared error is 2Xᵀ(Xw − y) and the slope of λ‖w‖² is 2λw: both carry a 2, so setting their sum to 0 and halving leaves (XᵀX + λI)w = Xᵀy.'],
  ['half', () => 'You put λ/2 on the diagonal. The slope of the total squared error is 2Xᵀ(Xw − y) and the slope of λ‖w‖² is 2λw: both carry a 2, so it cancels, leaving λ itself.'],
];

function checkRidge(input: RidgeInput, result: RunResult): Verdict {
  const p = input.X[0].length;
  if (result.error && /zero|NaN|Infinity/i.test(result.error.message)) {
    return { pass: false, message: `The elimination divided by a zero pivot: the system had no single answer. With λ > 0, XᵀX + λI always has one, however alike the columns of X are, so check that lam really went onto every diagonal entry, A[i][i]. (${result.error.message})` };
  }
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  if (!isNumbers(got)) return { pass: false, message: `Return the weights: a list of ${p} numbers, one per column of X.` };
  if (got.length === input.X.length && got.length !== p) return { pass: false, message: `You returned ${got.length} numbers, one per row of X. There is one weight per column: build XᵀX = matmul(Xt, X), a ${p}×${p} table, not matmul(X, Xt).` };
  if (got.length !== p) return { pass: false, message: `Return one weight per column of X: ${p} numbers, but you returned ${got.length}.` };
  const want = ridgeOf(input);
  if (matches(got, want)) {
    const ls = ridgeOf(input, 'forgot');
    const shrink = input.lam > 0 && ls.every(Number.isFinite) ? ` Plain least squares would give ${list(ls)}.` : '';
    return { pass: true, message: `w = ${list(want)} solves (XᵀX + ${fmt(input.lam)}I)·w = Xᵀy.${shrink}` };
  }
  for (const [slip, help] of SLIP_HELP) {
    const theirs = ridgeOf(input, slip);
    if (theirs.every(Number.isFinite) && !matches(theirs, want) && matches(got, theirs)) return { pass: false, message: help(input) };
  }
  return { pass: false, message: `w should be ${list(want)}, but yours is ${list(got)}. Build A = XᵀX with matmul(Xt, X), add lam to each A[i][i], and solve A·w = Xᵀy, with Xᵀy = matvec(Xt, y).` };
}

const NOTE_PY = '# Written out for you: transpose, matmul and matvec (part 1 of the least-squares project) and solve (part 2).\n';
const NOTE_JS = '// Written out for you: transpose, matmul and matvec (part 1 of the least-squares project) and solve (part 2).\n';
const HELPERS_PY = `${NOTE_PY}${TRANSPOSE_PY}

${MATMUL_PY}

${MATVEC_PY}

${solvePy()}

`;
const HELPERS_JS = `${NOTE_JS}${TRANSPOSE_JS}
${MATMUL_JS}
${MATVEC_JS}
${solveJs()}
`;

const RIDGE_BLANKS_PY = `${HELPERS_PY}def ridge(X, y, lam):
    Xt = transpose(X)
    A = «1:matmul(Xt, X)»
    for i in range(«2:len(A)»):
        A[i][i] = «3:A[i][i] + lam»
    return solve(A, «4:matvec(Xt, y)»)
`;
const RIDGE_BLANKS_JS = `${HELPERS_JS}function ridge(X, y, lam) {
  const Xt = transpose(X);
  const A = «1:matmul(Xt, X)»;
  for (let i = 0; i < «2:A.length»; i++) {
    A[i][i] = «3:A[i][i] + lam»;
  }
  return solve(A, «4:matvec(Xt, y)»);
}
`;
const RIDGE_STARTER_PY = `${HELPERS_PY}def ridge(X, y, lam):
    # Ridge's weights solve (XᵀX + λI)·w = Xᵀy: build XᵀX with matmul,
    # add lam to each entry on its diagonal, then solve.
    w = array(len(X[0]))
    return w
`;
const RIDGE_STARTER_JS = `${HELPERS_JS}function ridge(X, y, lam) {
  // Ridge's weights solve (XᵀX + λI)·w = Xᵀy: build XᵀX with matmul,
  // add lam to each entry on its diagonal, then solve.
  const w = array(X[0].length);
  return w;
}
`;
const ridgeTs = (js: string) => toTs(js).replace('function ridge(X, y, lam) {', 'function ridge(X: number[][], y: number[], lam: number): number[] {');

const ridgeArgs = ({ X, y, lam }: RidgeInput): Arg[] => [
  { kind: 'grid', name: 'X', values: X },
  { kind: 'array', name: 'y', values: y },
  { kind: 'value', name: 'lam', value: lam },
];

/** The visualiser's eight points: two features that rise and fall together, every column centred. */
export const EIGHT: Omit<RidgeInput, 'lam'> = { X: X2.map((r) => [...r]), y: [...Y2] };
/** Two identical columns: XᵀX alone has no inverse, and λ shares the weight between the twins. */
export const TWINS: RidgeInput = { X: [[1, 1], [2, 2], [-1, -1], [0, 0], [-2, -2]], y: [1, 3, -2, 0, -2], lam: 1 };

export const RIDGE_TESTS: { name: string; input: RidgeInput }[] = [
  { name: 'the eight points, λ = 16', input: { ...EIGHT, lam: 16 } },
  { name: 'λ = 0: plain least squares', input: { ...EIGHT, lam: 0 } },
  { name: 'λ = 1', input: { ...EIGHT, lam: 1 } },
  { name: 'three features, six points, λ = 2', input: { X: [[1, 2, 0], [-1, 0, 1], [2, 1, -1], [0, -2, 1], [-1, 1, 0], [-1, -2, -1]], y: [4, -1, 3, -3, 1, -4], lam: 2 } },
  { name: 'two identical columns, λ = 1', input: TWINS },
  { name: 'a huge λ: 1000', input: { ...EIGHT, lam: 1000 } },
];

const ridgeExercise: Exercise<RidgeInput> = {
  slug: 'ridge-regression',
  title: 'Ridge regression from the normal equations',
  kind: 'write',
  visualiser: 'regularisation',
  summary: 'Add λ to the diagonal of XᵀX and solve: ridge’s weights in four lines, on the least-squares project’s helpers.',
  task: [
    '`X` holds one row per data point and one column per feature, and `y` the labels. Every column is centred (it averages 0), so there is no column of 1s and every weight is charged. Ridge chooses the weights w with the lowest total squared error plus λ(w₁² + w₂² + …): here the loss is the **total** of the squared errors, not their mean.',
    'Its lowest point is where the slope is 0 in every direction, which says (XᵀX + λI)·w = Xᵀy. XᵀX is the table whose entry [i][j] is column i of X dotted with column j, I is the identity (1s on the diagonal, 0s elsewhere), so λI adds λ to each entry on the diagonal, and Xᵀy is each column of X dotted with y.',
    'Write `ridge(X, y, lam)`, which returns w. `transpose`, `matmul`, `matvec` and `solve` are written out above it, from the least-squares project: build XᵀX with `matmul`, add `lam` to each `A[i][i]`, then solve.',
  ],
  entry: { python: 'ridge', js: 'ridge' },
  args: ridgeArgs,
  starter: { python: RIDGE_STARTER_PY, javascript: RIDGE_STARTER_JS, typescript: ridgeTs(RIDGE_STARTER_JS) },
  solution: { python: stripBlanks(RIDGE_BLANKS_PY), javascript: stripBlanks(RIDGE_BLANKS_JS), typescript: ridgeTs(stripBlanks(RIDGE_BLANKS_JS)) },
  blanks: { python: RIDGE_BLANKS_PY, javascript: RIDGE_BLANKS_JS, typescript: ridgeTs(RIDGE_BLANKS_JS) },
  fades: [[3], [1, 3, 4], [1, 2, 3, 4]],
  distractors: {
    python: ['        A[i][i] = A[i][i] - lam', '    return solve(matmul(Xt, X), matvec(Xt, y))'],
    javascript: ['    A[i][i] = A[i][i] - lam;', '  return solve(matmul(Xt, X), matvec(Xt, y));'],
    typescript: ['    A[i][i] = A[i][i] - lam;', '  return solve(matmul(Xt, X), matvec(Xt, y));'],
  },
  examples: [
    { id: 'eight', label: 'The eight points, λ = 16', input: RIDGE_TESTS[0].input },
    { id: 'twins', label: 'Two identical columns, λ = 1', input: TWINS },
  ],
  tests: RIDGE_TESTS,
  check: checkRidge,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Xt = transpose(X), then A = matmul(Xt, X): a table with one row and one column per feature.',
    'λI only touches the diagonal: one loop over i, and A[i][i] = A[i][i] + lam.',
    'Then w = solve(A, matvec(Xt, y)). With λ > 0 the elimination never meets a zero pivot, even when two columns of X are the same.',
  ],
  legend: [
    { neutral: 'A cell not written yet' },
    { mark: 'compare', label: 'A cell the step reads' },
    { mark: 'write', label: 'A cell your code just wrote' },
  ],
};

export const regularisationExercises: Exercise[] = [ridgeExercise];

// Solving and fitting, as code (B3 of the math and ML path): Gaussian
// elimination with row swaps (and a bug hunt where a zero pivot breaks it),
// the rank by counting pivots, a vector's coordinates in another basis, the
// mean squared error of a line, and the first milestone project, least squares
// from scratch (src/content/projects): transpose and multiply, solve, lstsq,
// then fit a line and a quadratic.
//
// The project's parts run their judged tests in judge mode on the project
// budget, as every part must; their examples are still watched step by step,
// on the tables the code makes. Python and JavaScript must write the same
// numbers (exercises.test.ts): the loops do the same operations in the same
// order, so even the fractions agree to the last bit.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

type Matrix = readonly (readonly number[])[];

const TOLERANCE = 1e-7;
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const isMatrix = (x: unknown): x is number[][] => Array.isArray(x) && x.every(isNumbers);
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => Number.isFinite(got[i]) && close(got[i], w));
const sameMatrix = (got: Matrix, want: Matrix) => got.length === want.length && want.every((row, i) => matches(got[i], row));

const fmt = (v: number) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;
const grid = (rows: Matrix) => `[${rows.map(list).join(', ')}]`;

// ───────────────────────────── the reference maths ─────────────────────────────

export const transposeOf = (A: Matrix): number[][] => A[0].map((_, j) => A.map((row) => row[j]));
export const productOf = (A: Matrix, B: Matrix): number[][] => A.map((row) => B[0].map((_, j) => row.reduce((s, x, k) => s + x * B[k][j], 0)));
export const applyTo = (A: Matrix, v: readonly number[]): number[] => A.map((row) => row.reduce((s, x, k) => s + x * v[k], 0));

/**
 * x with Ax = b, by elimination on [A | b] and back substitution, as the
 * exercises write it. `pivot: false` never swaps rows (the bug hunt's code);
 * `updateB: false` forgets to change b's column (a usual slip).
 */
export function gauss(A: Matrix, b: readonly number[], { pivot = true, updateB = true } = {}): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    if (pivot) {
      let p = k;
      for (let r = k + 1; r < n; r++) if (Math.abs(M[r][k]) > Math.abs(M[p][k])) p = r;
      if (p !== k) [M[k], M[p]] = [M[p], M[k]];
    }
    for (let r = k + 1; r < n; r++) {
      const f = M[r][k] / M[k][k];
      for (let c = k; c <= (updateB ? n : n - 1); c++) M[r][c] = M[r][c] - f * M[k][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s = s - M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** The number of pivots elimination finds, treating |x| ≤ eps as 0. */
export function rankOf(A: Matrix, eps = 1e-9): number {
  const M = A.map((row) => [...row]);
  const m = M.length;
  const n = M[0].length;
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let p = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) <= eps) continue;
    [M[r], M[p]] = [M[p], M[r]];
    for (let i = r + 1; i < m; i++) {
      const f = M[i][c] / M[r][c];
      for (let j = c; j < n; j++) M[i][j] = M[i][j] - f * M[r][j];
    }
    r++;
  }
  return r;
}

/** The best weights: the w that solves (XᵀX)w = Xᵀy. */
export const lstsqOf = (X: Matrix, y: readonly number[]) => {
  const Xt = transposeOf(X);
  return gauss(productOf(Xt, X), applyTo(Xt, y));
};

/** The rows [1, x, x², …, x^degree] of a polynomial fit. */
export const powerRows = (xs: readonly number[], degree: number) => xs.map((x) => Array.from({ length: degree + 1 }, (_, j) => x ** j));

/** Xᵀ(y − Xw): zero in every place exactly when w is the least-squares fit. */
const residualDots = (X: Matrix, y: readonly number[], w: readonly number[]) => {
  const fitted = applyTo(X, w);
  return applyTo(transposeOf(X), y.map((v, i) => v - fitted[i]));
};

const WRITE_LEGEND: Exercise['legend'] = [
  { neutral: 'A cell not written yet' },
  { mark: 'compare', label: 'A cell the step reads' },
  { mark: 'write', label: 'A cell your code just wrote' },
];

// ───────────────────────────── shared code: the project's helpers ─────────────────────────────

const TRANSPOSE_PY = `def transpose(A):
    T = table(len(A[0]), len(A))
    for i in range(len(A)):
        for j in range(len(A[0])):
            T[j][i] = A[i][j]
    return T
`;
const MATMUL_PY = `def matmul(A, B):
    C = table(len(A), len(B[0]))
    for i in range(len(A)):
        for j in range(len(B[0])):
            for k in range(len(B)):
                C[i][j] = C[i][j] + A[i][k] * B[k][j]
    return C
`;
const MATVEC_PY = `def matvec(A, v):
    out = array(len(A))
    for i in range(len(A)):
        for k in range(len(v)):
            out[i] = out[i] + A[i][k] * v[k]
    return out
`;
const TRANSPOSE_JS = `function transpose(A) {
  const T = table(A[0].length, A.length);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[0].length; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}
`;
const MATMUL_JS = `function matmul(A, B) {
  const C = table(A.length, B[0].length);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B[0].length; j++) {
      for (let k = 0; k < B.length; k++) {
        C[i][j] = C[i][j] + A[i][k] * B[k][j];
      }
    }
  }
  return C;
}
`;
const MATVEC_JS = `function matvec(A, v) {
  const out = array(A.length);
  for (let i = 0; i < A.length; i++) {
    for (let k = 0; k < v.length; k++) {
      out[i] = out[i] + A[i][k] * v[k];
    }
  }
  return out;
}
`;

/** Elimination with row swaps, then back substitution. `swaps: false` is the bug hunt's version. */
const solvePy = (swaps = true) => `def solve(A, b):
    n = len(A)
    M = table(n, n + 1)
    for i in range(n):
        for j in range(n):
            M[i][j] = A[i][j]
        M[i][n] = b[i]
    for k in range(n):
${
  swaps
    ? `        p = k
        for r in range(k + 1, n):
            if abs(M[r][k]) > abs(M[p][k]):
                p = r
        if p != k:
            for c in range(n + 1):
                t = M[k][c]
                M[k][c] = M[p][c]
                M[p][c] = t
`
    : ''
}        for r in range(k + 1, n):
            f = M[r][k] / M[k][k]
            for c in range(k, n + 1):
                M[r][c] = M[r][c] - f * M[k][c]
    x = array(n)
    for i in range(n - 1, -1, -1):
        s = M[i][n]
        for j in range(i + 1, n):
            s = s - M[i][j] * x[j]
        x[i] = s / M[i][i]
    return x
`;
const solveJs = (swaps = true) => `function solve(A, b) {
  const n = A.length;
  const M = table(n, n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = A[i][j];
    }
    M[i][n] = b[i];
  }
  for (let k = 0; k < n; k++) {
${
  swaps
    ? `    let p = k;
    for (let r = k + 1; r < n; r++) {
      if (Math.abs(M[r][k]) > Math.abs(M[p][k])) {
        p = r;
      }
    }
    if (p !== k) {
      for (let c = 0; c <= n; c++) {
        const t = M[k][c];
        M[k][c] = M[p][c];
        M[p][c] = t;
      }
    }
`
    : ''
}    for (let r = k + 1; r < n; r++) {
      const f = M[r][k] / M[k][k];
      for (let c = k; c <= n; c++) {
        M[r][c] = M[r][c] - f * M[k][c];
      }
    }
  }
  const x = array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) {
      s = s - M[i][j] * x[j];
    }
    x[i] = s / M[i][i];
  }
  return x;
}
`;

const LSTSQ_PY = `def lstsq(X, y):
    Xt = transpose(X)
    return solve(matmul(Xt, X), matvec(Xt, y))
`;
const LSTSQ_JS = `function lstsq(X, y) {
  const Xt = transpose(X);
  return solve(matmul(Xt, X), matvec(Xt, y));
}
`;

/** TypeScript: the JavaScript with its signatures and tables typed. */
const toTs = (js: string) =>
  js
    .replace('function transpose(A) {', 'function transpose(A: number[][]): number[][] {')
    .replace('function matmul(A, B) {', 'function matmul(A: number[][], B: number[][]): number[][] {')
    .replace('function matvec(A, v) {', 'function matvec(A: number[][], v: number[]): number[] {')
    .replace('function solve(A, b) {', 'function solve(A: number[][], b: number[]): number[] {')
    .replace('function lstsq(X, y) {', 'function lstsq(X: number[][], y: number[]): number[] {')
    .replace('function normalEquations(X, y) {', 'function normalEquations(X: number[][], y: number[]): [number[][], number[]] {')
    .replace('function rank(A) {', 'function rank(A: number[][]): number {')
    .replace('function coords(b1, b2, v) {', 'function coords(b1: number[], b2: number[], v: number[]): number[] {')
    .replace('function mse(w, b, xs, ys) {', 'function mse(w: number, b: number, xs: number[], ys: number[]): number {')
    .replace('function fitPoly(xs, ys, degree) {', 'function fitPoly(xs: number[], ys: number[], degree: number): number[] {')
    .replace(/const (T|C|M|X) = table\(/g, 'const $1: number[][] = table(')
    .replace(/const (out|x|c|sq|w) = array\(/g, 'const $1: number[] = array(');

const HELPERS_NOTE_PY = '# Written out for you: your transpose, matmul and matvec from part 1 and solve from part 2.\n';
const HELPERS_NOTE_JS = '// Written out for you: your transpose, matmul and matvec from part 1 and solve from part 2.\n';

// ───────────────────────────── 1. normal-equations (M1, part 1) ─────────────────────────────

export type FitInput = { X: number[][]; y: number[] };

const fitArgs = ({ X, y }: FitInput): Arg[] => [
  { kind: 'grid', name: 'X', values: X },
  { kind: 'array', name: 'y', values: y },
];

function checkNormal({ X, y }: FitInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  const Xt = transposeOf(X);
  const XtX = productOf(Xt, X);
  const Xty = applyTo(Xt, y);
  const [n, p] = [X.length, X[0].length];
  if (!Array.isArray(got) || got.length !== 2 || !isMatrix(got[0]) || !isNumbers(got[1])) return { pass: false, message: 'Return a list of two things: [XᵀX, Xᵀy], a table and a list.' };
  const [A, v] = got as [number[][], number[]];
  if (A.length === n && n !== p && A.every((r) => r.length === n)) return { pass: false, message: `XᵀX came out ${n}×${n}, the shape of XXᵀ. X is ${n}×${p}, so Xᵀ is ${p}×${n} and XᵀX is ${p}×${p}: transpose first, then multiply by X.` };
  if (A.length !== p || A.some((r) => r.length !== p)) return { pass: false, message: `XᵀX should be ${p}×${p} (one row and column per column of X), but yours is ${A.length}×${A[0]?.length ?? 0}. Check that transpose makes a ${p}×${n} table.` };
  if (!sameMatrix(A, XtX)) {
    if (A.every((r) => r.every((x) => x === 0))) return { pass: false, message: 'XᵀX is all zeros: are transpose and matmul writing into their tables?' };
    const lastOnly = Xt.map((row) => X[0].map((_, j) => row[n - 1] * X[n - 1][j]));
    if (sameMatrix(A, lastOnly)) return { pass: false, message: 'Each cell of XᵀX holds only its last product: add every A[i][k] × B[k][j] into C[i][j], don’t replace it.' };
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        if (!close(A[i][j], XtX[i][j])) return { pass: false, message: `XᵀX[${i}][${j}] should be column ${i} of X dotted with column ${j} of X, ${fmt(XtX[i][j])}, but it is ${fmt(A[i][j])}. XᵀX = ${grid(XtX)}.` };
  }
  if (!matches(v, Xty)) {
    if (v.length !== p) return { pass: false, message: `Xᵀy should have ${p} numbers, one per column of X, but yours has ${v.length}.` };
    return { pass: false, message: `XᵀX is right. Xᵀy should be ${list(Xty)}: entry j is column j of X dotted with y. Yours is ${list(v)}.` };
  }
  return { pass: true, message: `XᵀX = ${grid(XtX)} and Xᵀy = ${list(Xty)}: the normal equations, ready to solve.` };
}

const NORMAL_JS = `${TRANSPOSE_JS}
${MATMUL_JS}
${MATVEC_JS}
function normalEquations(X, y) {
  const Xt = transpose(X);
  return [matmul(Xt, X), matvec(Xt, y)];
}
`;
const NORMAL_PY = `${TRANSPOSE_PY}

${MATMUL_PY}

${MATVEC_PY}

def normal_equations(X, y):
    Xt = transpose(X)
    return [matmul(Xt, X), matvec(Xt, y)]
`;
const NORMAL_STARTER_PY = `def transpose(A):
    T = table(len(A[0]), len(A))
    # T[j][i] = A[i][j]
    return T


def matmul(A, B):
    C = table(len(A), len(B[0]))
    # C[i][j] = row i of A times column j of B
    return C


def matvec(A, v):
    out = array(len(A))
    # out[i] = row i of A times v
    return out


def normal_equations(X, y):
    Xt = transpose(X)
    return [matmul(Xt, X), matvec(Xt, y)]
`;
const NORMAL_STARTER_JS = `function transpose(A) {
  const T = table(A[0].length, A.length);
  // T[j][i] = A[i][j]
  return T;
}

function matmul(A, B) {
  const C = table(A.length, B[0].length);
  // C[i][j] = row i of A times column j of B
  return C;
}

function matvec(A, v) {
  const out = array(A.length);
  // out[i] = row i of A times v
  return out;
}

function normalEquations(X, y) {
  const Xt = transpose(X);
  return [matmul(Xt, X), matvec(Xt, y)];
}
`;

const LINE3: FitInput = { X: [[1, 0], [1, 1], [1, 2]], y: [1, 3, 5] };
const LINE4: FitInput = { X: [[1, 0], [1, 1], [1, 2], [1, 3]], y: [1, 2, 2, 4] };
const PARABOLA: FitInput = { X: [[1, -1, 1], [1, 0, 0], [1, 1, 1], [1, 2, 4]], y: [2, 1, 2, 5] };

const normalExercise: Exercise<FitInput> = {
  slug: 'normal-equations',
  title: 'Least squares, part 1: XᵀX and Xᵀy',
  kind: 'write',
  visualiser: 'least-squares',
  summary: 'Write transpose, matrix times matrix and matrix times vector, then build the normal equations XᵀX and Xᵀy.',
  task: [
    'Part 1 of the project “Least squares from scratch”. `X` holds one row per data point and one column per feature (a column of 1s, then x), and `y` holds the labels. The best weights solve (XᵀX)·w = Xᵀy, and this part builds both sides.',
    'Fill in `transpose(A)` (row i of A becomes column i), `matmul(A, B)` (cell [i][j] is row i of A times column j of B) and `matvec(A, v)` (entry i is row i of A times v). `normal_equations(X, y)` (`normalEquations` in JavaScript and TypeScript) already puts them together and returns `[XᵀX, Xᵀy]`.',
  ],
  entry: { python: 'normal_equations', js: 'normalEquations' },
  args: fitArgs,
  starter: { python: NORMAL_STARTER_PY, javascript: NORMAL_STARTER_JS, typescript: toTs(NORMAL_STARTER_JS) },
  solution: { python: NORMAL_PY, javascript: NORMAL_JS, typescript: toTs(NORMAL_JS) },
  examples: [
    { id: 'line', label: 'Three points on a line', input: LINE3 },
    { id: 'noisy', label: 'Four points, not quite a line', input: LINE4 },
  ],
  tests: [
    { name: 'three points on a line', input: LINE3 },
    { name: 'four points, not quite a line', input: LINE4 },
    { name: 'a parabola’s columns 1, x, x²', input: PARABOLA },
    { name: 'one column, no intercept', input: { X: [[2], [1], [3]], y: [1, 2, 3] } },
    { name: 'three features, five points', input: { X: [[1, 2, 0], [1, -1, 3], [1, 0, 1], [1, 4, -2], [1, 1, 1]], y: [3, 0, 2, 5, -1] } },
  ],
  check: checkNormal,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'transpose: two loops over A, and T[j][i] = A[i][j]. T has as many rows as A has columns.',
    'matmul: three loops, i over the rows of A, j over the columns of B, k along both, adding A[i][k] × B[k][j] into C[i][j].',
    'matvec is matmul with a single column: out[i] adds A[i][k] × v[k] for every k.',
  ],
  legend: WRITE_LEGEND,
  judge: { budget: 'project' },
};

// ───────────────────────────── 2. solve-system (M1, part 2) ─────────────────────────────

export type SolveInput = { A: number[][]; b: number[] };

const solveArgs = ({ A, b }: SolveInput): Arg[] => [
  { kind: 'grid', name: 'A', values: A },
  { kind: 'array', name: 'b', values: b },
];

const PIVOT_HELP = 'A pivot M[k][k] was 0, so dividing by it broke the answer. Before eliminating column k, swap row k with the row at or below it whose entry in column k is biggest (ignoring its sign). Swapping two equations doesn’t change the answer.';

function checkSolve({ A, b }: SolveInput, result: RunResult): Verdict {
  // Python stops at the division; JavaScript makes NaN or ∞, which a table refuses to store, and a judged run returns as text.
  if (result.error && /zero|NaN|Infinity/i.test(result.error.message)) return { pass: false, message: `${PIVOT_HELP} (${result.error.message})` };
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  const n = A.length;
  const broken = (v: unknown) => v === null || v === 'NaN' || v === 'Infinity' || v === '-Infinity' || (typeof v === 'number' && !Number.isFinite(v));
  if (Array.isArray(got) && got.length === n && got.some(broken)) return { pass: false, message: `x came out as ${got.map((v) => (typeof v === 'number' ? fmt(v) : String(v))).join(', ')}. ${PIVOT_HELP}` };
  if (!isNumbers(got) || got.length !== n) return { pass: false, message: `Return x as a list of ${n} numbers, one per unknown.` };
  const want = gauss(A, b);
  if (matches(got, want)) return { pass: true, message: `x = ${list(want)}, and A·x gives back b = ${list(b)}.` };
  if (matches(got, gauss(A, b, { updateB: false }))) {
    return { pass: false, message: 'x solves the system with the old right-hand side: when you subtract f × row k from a row, do it to its last column (b’s column, M[r][n]) as well.' };
  }
  const Ax = applyTo(A, got);
  const row = Ax.findIndex((v, i) => !close(v, b[i]));
  if (row >= 0) return { pass: false, message: `Check with A·x: row ${row} of A times your x is ${fmt(Ax[row])}, but b[${row}] is ${fmt(b[row])}. Back substitution goes from the last row up: x[i] = (M[i][n] − Σ M[i][j]·x[j] for j > i) / M[i][i].` };
  return { pass: false, message: `x should be ${list(want)}, but yours is ${list(got)}.` };
}

const SOLVE_STARTER_PY = `def solve(A, b):
    n = len(A)
    M = table(n, n + 1)
    for i in range(n):
        for j in range(n):
            M[i][j] = A[i][j]
        M[i][n] = b[i]
    # 1. For each column k: swap up the row (at k or below) with the biggest
    #    |M[r][k]|, then subtract f × row k from each row below, f = M[r][k] / M[k][k].
    # 2. Back substitution: from the last row up, x[i] = (M[i][n] − the known terms) / M[i][i].
    x = array(n)
    return x
`;
const SOLVE_STARTER_JS = `function solve(A, b) {
  const n = A.length;
  const M = table(n, n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = A[i][j];
    }
    M[i][n] = b[i];
  }
  // 1. For each column k: swap up the row (at k or below) with the biggest
  //    |M[r][k]|, then subtract f × row k from each row below, f = M[r][k] / M[k][k].
  // 2. Back substitution: from the last row up, x[i] = (M[i][n] − the known terms) / M[i][i].
  const x = array(n);
  return x;
}
`;

const THREE: SolveInput = { A: [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], b: [8, -11, -3] };
const ZERO_PIVOT: SolveInput = { A: [[0, 2, 1], [1, 1, 1], [2, 1, 0]], b: [7, 6, 4] };

const solveExercise: Exercise<SolveInput> = {
  slug: 'solve-system',
  title: 'Least squares, part 2: solve Ax = b',
  kind: 'write',
  visualiser: 'inverse-matrix',
  summary: 'Gaussian elimination with row swaps on the augmented table [A | b], then back substitution.',
  task: [
    'Part 2 of the project “Least squares from scratch”. `solve(A, b)` finds the x with A·x = b, for a square A that can be undone. The starter copies A and b into one table, `M = [A | b]`: each row is an equation, and its last column is the right-hand side.',
    'Rows and columns count from 0 here, so with n unknowns, b sits in column n. Eliminate column by column. For column k, first find the row at or below k whose |M[r][k]| is biggest (biggest in size, ignoring its sign), and swap it with row k, so you never divide by 0. A table won’t let you swap whole rows at once: swap them cell by cell, with a temporary variable. Then for every row r below k, subtract f × row k with f = M[r][k] / M[k][k], which puts a 0 under the pivot. Do the whole row, b’s column too.',
    'Then back substitution, from the last row up: x[i] = (M[i][n] − the sum of M[i][j] × x[j] over every j > i) / M[i][i]. Write each x[i] into `x` and return it.',
  ],
  entry: { python: 'solve', js: 'solve' },
  args: solveArgs,
  starter: { python: SOLVE_STARTER_PY, javascript: SOLVE_STARTER_JS, typescript: toTs(SOLVE_STARTER_JS) },
  solution: { python: solvePy(), javascript: solveJs(), typescript: toTs(solveJs()) },
  examples: [
    { id: 'three', label: 'Three equations', input: THREE },
    { id: 'zero', label: 'A 0 where the first pivot goes', input: ZERO_PIVOT },
  ],
  tests: [
    { name: 'two equations', input: { A: [[2, 1], [1, 3]], b: [3, 5] } },
    { name: 'three equations', input: THREE },
    { name: 'a 0 where the first pivot goes: swap first', input: ZERO_PIVOT },
    { name: 'fractions in the answer', input: { A: [[1, 2], [3, 4]], b: [5, 6] } },
    { name: 'four equations', input: { A: [[1, 2, 0, 1], [0, 1, 3, 1], [2, 0, 1, 0], [1, 1, 1, 4]], b: [-1, 5, 4, 2] } },
  ],
  check: checkSolve,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Three loops for elimination: k over the pivot columns, r over the rows below k, and c along the row from column k to n (the last column is b’s).',
    'Before the r loop, find p, the row from k down with the biggest |M[p][k]|, and swap rows k and p cell by cell with a temporary variable.',
    'Back substitution runs i from n − 1 down to 0, starting from s = M[i][n] and subtracting M[i][j] × x[j] for each j > i, then x[i] = s / M[i][i].',
  ],
  legend: WRITE_LEGEND,
  judge: { budget: 'project' },
};

// ───────────────────────────── 3. zero-pivot (a bug hunt) ─────────────────────────────

const zeroPivotExercise: Exercise<SolveInput> = {
  slug: 'zero-pivot',
  title: 'Fix the elimination that divides by zero',
  kind: 'bug',
  visualiser: 'inverse-matrix',
  summary: 'Elimination works until a 0 lands where a pivot should be. Make it swap rows first.',
  task: [
    '`solve(A, b)` should return the x with A·x = b, by eliminating on the table M = [A | b] and then substituting back.',
    'It solves most systems, but on the second test, whose first equation has no x₀ in it, Python stops with a division by zero and JavaScript makes a NaN (“not a number”) that the table can’t store, although that system has exactly one answer. Run it, watch M, and fix it.',
  ],
  entry: { python: 'solve', js: 'solve' },
  args: solveArgs,
  starter: { python: solvePy(false), javascript: solveJs(false), typescript: toTs(solveJs(false)) },
  solution: { python: solvePy(), javascript: solveJs(), typescript: toTs(solveJs()) },
  bug: {
    symptom: 'Most systems solve; one whose first row starts with 0 divides by zero (a NaN in JavaScript).',
    explanation: 'Each step divides by the pivot M[k][k]. When that is 0 the division fails, although swapping two equations (rows) changes nothing about the answer. So before eliminating column k, swap in the row at or below k whose entry in column k is biggest: partial pivoting. Choosing the biggest, not just any non-zero one, also keeps rounding errors small.',
  },
  examples: [
    { id: 'zero', label: 'A 0 where the first pivot goes', input: ZERO_PIVOT },
    { id: 'three', label: 'Three equations', input: THREE },
  ],
  tests: [
    { name: 'three equations', input: THREE },
    { name: 'a 0 where the first pivot goes', input: ZERO_PIVOT },
    { name: 'a 0 pivot appears later', input: { A: [[1, 1, 1], [1, 1, 2], [2, 3, 1]], b: [6, 9, 11] } },
    { name: 'two equations', input: { A: [[2, 1], [1, 3]], b: [3, 5] } },
  ],
  check: checkSolve,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Step through the zero-pivot example: what is M[0][0] when the first f = M[r][0] / M[0][0] is worked out?',
    'Swapping two rows of M (two whole equations, b’s column too) never changes the answer. Which row would make a good pivot?',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 4. matrix-rank ─────────────────────────────

export type RankInput = { A: number[][] };

const rankArgs = ({ A }: RankInput): Arg[] => [{ kind: 'grid', name: 'A', values: A }];

function checkRank({ A }: RankInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  const want = rankOf(A);
  if (typeof got !== 'number') return { pass: false, message: 'Return the rank: a whole number, the count of pivots.' };
  if (got === want) return { pass: true, message: `rank ${want}: ${want} pivot${want === 1 ? '' : 's'}, so ${want} independent column${want === 1 ? '' : 's'}.` };
  const exact = rankOf(A, 0);
  if (got === exact) return { pass: false, message: `You found ${got} pivots, but one of them is a leftover like 0.0000000000000004 that rounding left where a 0 should be. Treat |x| < 1e-9 as 0: the rank is ${want}.` };
  const nonZeroRows = A.filter((r) => r.some((x) => x !== 0)).length;
  if (got === nonZeroRows && got > want) return { pass: false, message: `${got} is how many rows have a non-zero number, but a row that is a mix of the others adds no new direction. Eliminate first, then count the pivots: the rank is ${want}.` };
  if (got === Math.min(A.length, A[0].length) && got > want) return { pass: false, message: `${got} is as big as a rank can be for a ${A.length}×${A[0].length} matrix, but this one has a dependent column. Count the pivots elimination finds: ${want}.` };
  return { pass: false, message: `The rank is ${want}, but you returned ${got}. Count one pivot for each column where a non-zero entry turns up at or below the next pivot row.` };
}

const RANK_PY = `def rank(A):
    m = len(A)
    n = len(A[0])
    M = table(m, n)
    for i in range(m):
        for j in range(n):
            M[i][j] = A[i][j]
    r = 0
    for c in range(n):
        if r == m:
            break
        p = r
        for i in range(r + 1, m):
            if abs(M[i][c]) > abs(M[p][c]):
                p = i
        if abs(M[p][c]) < 1e-9:
            continue
        if p != r:
            for j in range(n):
                t = M[r][j]
                M[r][j] = M[p][j]
                M[p][j] = t
        for i in range(r + 1, m):
            f = M[i][c] / M[r][c]
            for j in range(c, n):
                M[i][j] = M[i][j] - f * M[r][j]
        r = r + 1
    return r
`;
const RANK_JS = `function rank(A) {
  const m = A.length;
  const n = A[0].length;
  const M = table(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = A[i][j];
    }
  }
  let r = 0;
  for (let c = 0; c < n; c++) {
    if (r === m) {
      break;
    }
    let p = r;
    for (let i = r + 1; i < m; i++) {
      if (Math.abs(M[i][c]) > Math.abs(M[p][c])) {
        p = i;
      }
    }
    if (Math.abs(M[p][c]) < 1e-9) {
      continue;
    }
    if (p !== r) {
      for (let j = 0; j < n; j++) {
        const t = M[r][j];
        M[r][j] = M[p][j];
        M[p][j] = t;
      }
    }
    for (let i = r + 1; i < m; i++) {
      const f = M[i][c] / M[r][c];
      for (let j = c; j < n; j++) {
        M[i][j] = M[i][j] - f * M[r][j];
      }
    }
    r = r + 1;
  }
  return r;
}
`;
const RANK_STARTER_PY = `def rank(A):
    m = len(A)
    n = len(A[0])
    M = table(m, n)
    for i in range(m):
        for j in range(n):
            M[i][j] = A[i][j]
    r = 0  # the row the next pivot goes in, and the pivots found so far
    # For each column c: find the row at or below r with the biggest |M[i][c]|.
    # If it is (nearly) 0, this column has no pivot: move on. Otherwise swap it
    # up to row r, clear the entries below it, and count it: r = r + 1.
    return r
`;
const RANK_STARTER_JS = `function rank(A) {
  const m = A.length;
  const n = A[0].length;
  const M = table(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = A[i][j];
    }
  }
  let r = 0; // the row the next pivot goes in, and the pivots found so far
  // For each column c: find the row at or below r with the biggest |M[i][c]|.
  // If it is (nearly) 0, this column has no pivot: move on. Otherwise swap it
  // up to row r, clear the entries below it, and count it: r = r + 1.
  return r;
}
`;

const NINE: RankInput = { A: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] };
const WIDE: RankInput = { A: [[1, 0, 2, 1], [0, 1, 1, 1], [1, 1, 3, 2]] };

const rankExercise: Exercise<RankInput> = {
  slug: 'matrix-rank',
  title: 'Count the rank',
  kind: 'write',
  visualiser: 'span',
  summary: 'Eliminate and count the pivots: how many independent directions the columns really span.',
  task: [
    '`rank(A)` returns the rank of A: how many independent directions its columns span. The starter copies A into a table `M` to work on.',
    'Eliminate as when solving, but a column may have no pivot. Keep `r`, the row the next pivot goes in. For each column c, find the row at or below r with the biggest |M[i][c]|. If that is 0 (|x| < 1e-9, written `1e-9` in code, since rounding leaves crumbs like 0.0000000000000004 where a 0 belongs), skip the column. Otherwise swap it up to row r, subtract multiples of it to clear the entries below, and move r down one. At the end, r is the number of pivots: the rank.',
  ],
  entry: { python: 'rank', js: 'rank' },
  args: rankArgs,
  starter: { python: RANK_STARTER_PY, javascript: RANK_STARTER_JS, typescript: toTs(RANK_STARTER_JS) },
  solution: { python: RANK_PY, javascript: RANK_JS, typescript: toTs(RANK_JS) },
  examples: [
    { id: 'nine', label: '1 to 9 in a square', input: NINE },
    { id: 'wide', label: 'Two columns are mixes', input: WIDE },
  ],
  tests: [
    { name: 'two independent columns', input: { A: [[1, 2], [3, 4]] } },
    { name: 'one column twice the other', input: { A: [[1, 2], [2, 4]] } },
    { name: '1 to 9: rounding leaves a crumb', input: NINE },
    { name: 'all zeros', input: { A: [[0, 0], [0, 0]] } },
    { name: 'four columns, two of them mixes of the others', input: WIDE },
    { name: 'a column with no pivot', input: { A: [[0, 1, 2], [0, 2, 4], [1, 0, 1]] } },
    { name: 'tall: four rows, two directions', input: { A: [[1, 2, 1], [2, 4, 2], [0, 1, 1], [1, 3, 2]] } },
  ],
  check: checkRank,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'It is elimination from solve, with one change: a column whose candidates are all 0 has no pivot, so it gets skipped and r stays where it is.',
    'Compare with a small tolerance: abs(M[p][c]) < 1e-9 means “this is 0”. Rounding rarely leaves an exact 0.',
    'r counts the pivots found. Stop early if r reaches the number of rows.',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 5. basis-coords ─────────────────────────────

export type CoordsInput = { b1: number[]; b2: number[]; v: number[] };

const coordsArgs = ({ b1, b2, v }: CoordsInput): Arg[] => [
  { kind: 'array', name: 'b1', values: b1 },
  { kind: 'array', name: 'b2', values: b2 },
  { kind: 'array', name: 'v', values: v },
];

/** c with c₁·b1 + c₂·b2 = v, by Cramer's rule. */
export function coordsOf({ b1, b2, v }: CoordsInput): [number, number] {
  const det = b1[0] * b2[1] - b2[0] * b1[1];
  return [(v[0] * b2[1] - b2[0] * v[1]) / det, (b1[0] * v[1] - v[0] * b1[1]) / det];
}

function checkCoords(input: CoordsInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { b1, b2, v } = input;
  const got = result.returned;
  if (!isNumbers(got) || got.length !== 2) return { pass: false, message: 'Return the two coordinates [c1, c2].' };
  const want = coordsOf(input);
  const back = (c: readonly number[]) => [c[0] * b1[0] + c[1] * b2[0], c[0] * b1[1] + c[1] * b2[1]];
  if (matches(got, want)) return { pass: true, message: `v = ${fmt(want[0])}·b1 + ${fmt(want[1])}·b2: in the new basis, v is ${list(want)}.` };
  const det = b1[0] * b2[1] - b2[0] * b1[1];
  if (matches(got, back(v))) return { pass: false, message: `${list(got)} is P·v: where you'd land taking ${fmt(v[0])} steps of b1 and ${fmt(v[1])} of b2. You need the reverse, the c with c1·b1 + c2·b2 = v, which is P⁻¹·v.` };
  if (matches(got, [want[1], want[0]])) return { pass: false, message: 'The two coordinates are swapped: c1 says how many b1s, c2 how many b2s.' };
  if (matches(got, [want[0] * det, want[1] * det])) return { pass: false, message: `Close: divide both by det = ${fmt(det)}.` };
  if (matches(got, [-want[0], -want[1]])) return { pass: false, message: 'Both signs are flipped: det is b1[0]·b2[1] − b2[0]·b1[1], in that order.' };
  const landed = back(got);
  return { pass: false, message: `${fmt(got[0])}·b1 + ${fmt(got[1])}·b2 lands at ${list(landed)}, not at v = ${list(v)}. The coordinates are ${list(want)}.` };
}

const COORDS_PY = `def coords(b1, b2, v):
    c = array(2)
    det = b1[0] * b2[1] - b2[0] * b1[1]
    c[0] = (v[0] * b2[1] - b2[0] * v[1]) / det
    c[1] = (b1[0] * v[1] - v[0] * b1[1]) / det
    return c
`;
const COORDS_JS = `function coords(b1, b2, v) {
  const c = array(2);
  const det = b1[0] * b2[1] - b2[0] * b1[1];
  c[0] = (v[0] * b2[1] - b2[0] * v[1]) / det;
  c[1] = (b1[0] * v[1] - v[0] * b1[1]) / det;
  return c;
}
`;
const COORDS_STARTER_PY = `def coords(b1, b2, v):
    c = array(2)
    # Find c1 = c[0] and c2 = c[1] with c1·b1 + c2·b2 = v.
    return c
`;
const COORDS_STARTER_JS = `function coords(b1, b2, v) {
  const c = array(2);
  // Find c1 = c[0] and c2 = c[1] with c1·b1 + c2·b2 = v.
  return c;
}
`;

const TILTED: CoordsInput = { b1: [1, 1], b2: [-1, 1], v: [3, 1] };
const SKEW: CoordsInput = { b1: [2, 1], b2: [1, 3], v: [5, 10] };

const coordsExercise: Exercise<CoordsInput> = {
  slug: 'basis-coords',
  title: 'Read a vector in another basis',
  kind: 'write',
  visualiser: 'change-of-basis',
  summary: 'Find how many b1s and b2s make v: its coordinates in the basis b1, b2.',
  task: [
    '`coords(b1, b2, v)` returns `[c1, c2]`, the numbers with c1·b1 + c2·b2 = v: v’s coordinates in the basis b1, b2. Write c1 into `c[0]` and c2 into `c[1]`.',
    'Part by part that is two equations: c1·b1[0] + c2·b2[0] = v[0] and c1·b1[1] + c2·b2[1] = v[1]. Solve them, by elimination or with the 2×2 inverse from the determinants lesson.',
  ],
  entry: { python: 'coords', js: 'coords' },
  args: coordsArgs,
  starter: { python: COORDS_STARTER_PY, javascript: COORDS_STARTER_JS, typescript: toTs(COORDS_STARTER_JS) },
  solution: { python: COORDS_PY, javascript: COORDS_JS, typescript: toTs(COORDS_JS) },
  examples: [
    { id: 'tilted', label: 'A tilted, longer basis', input: TILTED },
    { id: 'skew', label: 'A slanted basis', input: SKEW },
  ],
  tests: [
    { name: 'the standard basis changes nothing', input: { b1: [1, 0], b2: [0, 1], v: [3, 2] } },
    { name: 'a basis stretched across', input: { b1: [2, 0], b2: [0, 1], v: [4, 3] } },
    { name: 'a basis turned 45° and a little longer', input: TILTED },
    { name: 'a slanted basis', input: SKEW },
    { name: 'a basis that flips the plane (det < 0)', input: { b1: [1, 2], b2: [3, 1], v: [2, -1] } },
  ],
  check: checkCoords,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Check your answer by going back: c[0]·b1 + c[1]·b2 should land exactly on v.',
    'The matrix P with columns b1 and b2 sends c to v (v = P·c), so c = P⁻¹·v. The 2×2 inverse swaps the diagonal, negates the other two and divides by det.',
    'With det = b1[0]·b2[1] − b2[0]·b1[1]: c1 = (v[0]·b2[1] − b2[0]·v[1]) / det and c2 = (b1[0]·v[1] − v[0]·b1[1]) / det.',
  ],
  legend: [
    { neutral: 'A value not written yet' },
    { mark: 'write', label: 'A coordinate your code just wrote' },
  ],
};

// ───────────────────────────── 6. mean-squared-error ─────────────────────────────

export type MseInput = { w: number; b: number; xs: number[]; ys: number[] };

const mseArgs = ({ w, b, xs, ys }: MseInput): Arg[] => [
  { kind: 'value', name: 'w', value: w },
  { kind: 'value', name: 'b', value: b },
  { kind: 'array', name: 'xs', values: xs },
  { kind: 'array', name: 'ys', values: ys },
];

const errorsOf = ({ w, b, xs, ys }: MseInput) => xs.map((x, i) => w * x + b - ys[i]);
export const meanSquaredError = (input: MseInput) => errorsOf(input).reduce((s, e) => s + e * e, 0) / input.xs.length;

function checkMse(input: MseInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: 'Return the mean squared error: one number.' };
  const e = errorsOf(input);
  const n = e.length;
  const want = meanSquaredError(input);
  const total = e.reduce((s, x) => s + x * x, 0);
  if (close(got, want)) return { pass: true, message: `The mean squared error is ${fmt(want)}: the squared errors ${list(e.map((x) => x * x))} add to ${fmt(total)}, over ${n} points.` };
  if (close(got, e.reduce((s, x) => s + x, 0) / n)) return { pass: false, message: 'The errors weren’t squared, so points above the line and points below it cancelled out. Square each error before adding.' };
  if (close(got, total)) return { pass: false, message: `${fmt(total)} is the total of the squared errors: divide by the number of points, ${n}, for the mean.` };
  if (close(got, Math.sqrt(want))) return { pass: false, message: `${fmt(got)} is the square root of the mean squared error (the RMSE). Leave the mean as it is: ${fmt(want)}.` };
  if (close(got, e.reduce((s, x) => s + Math.abs(x), 0) / n)) return { pass: false, message: 'That is the mean of the errors’ sizes (absolute values). Square each error instead.' };
  if (n > 1 && close(got, total / (n - 1))) return { pass: false, message: `That divides by n − 1 = ${n - 1}. The mean squared error divides by n = ${n}.` };
  return { pass: false, message: `The mean squared error is ${fmt(want)}, but you returned ${fmt(got)}. Each error is w × x + b − y; square it, add them all, divide by n.` };
}

const MSE_PY = `def mse(w, b, xs, ys):
    n = len(xs)
    sq = array(n)
    total = 0
    for i in range(n):
        e = w * xs[i] + b - ys[i]
        sq[i] = e * e
        total = total + sq[i]
    return total / n
`;
const MSE_JS = `function mse(w, b, xs, ys) {
  const n = xs.length;
  const sq = array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const e = w * xs[i] + b - ys[i];
    sq[i] = e * e;
    total = total + sq[i];
  }
  return total / n;
}
`;
const MSE_STARTER_PY = `def mse(w, b, xs, ys):
    n = len(xs)
    sq = array(n)  # each point's squared error
    total = 0
    # The line predicts w * x + b; the error is the prediction minus the label.
    return total
`;
const MSE_STARTER_JS = `function mse(w, b, xs, ys) {
  const n = xs.length;
  const sq = array(n); // each point's squared error
  let total = 0;
  // The line predicts w * x + b; the error is the prediction minus the label.
  return total;
}
`;

const CANCEL: MseInput = { w: 1, b: 0, xs: [1, 2, 3, 4], ys: [2, 1, 4, 3] };
const UNEVEN: MseInput = { w: -1, b: 10, xs: [1, 2, 3, 4, 5], ys: [8, 9, 6, 4, 5] };

const mseExercise: Exercise<MseInput> = {
  slug: 'mean-squared-error',
  title: 'Score a line: the mean squared error',
  kind: 'write',
  visualiser: 'supervised-learning',
  summary: 'How wrong is the line ŷ = w × x + b on these examples? Square each error and take the mean.',
  task: [
    'A model ŷ = w × x + b predicts a label from a feature. `mse(w, b, xs, ys)` scores it on the examples `xs` (features) and `ys` (labels): the mean of the squared errors.',
    'For each point the error is the prediction minus the label, w × xs[i] + b − ys[i]. Write its square into `sq[i]`, add it to `total`, and return the total divided by the number of points.',
  ],
  entry: { python: 'mse', js: 'mse' },
  args: mseArgs,
  starter: { python: MSE_STARTER_PY, javascript: MSE_STARTER_JS, typescript: toTs(MSE_STARTER_JS) },
  solution: { python: MSE_PY, javascript: MSE_JS, typescript: toTs(MSE_JS) },
  examples: [
    { id: 'cancel', label: 'Errors of +1 and −1', input: CANCEL },
    { id: 'uneven', label: 'A falling line', input: UNEVEN },
  ],
  tests: [
    { name: 'a perfect fit scores 0', input: { w: 2, b: 1, xs: [1, 2, 3], ys: [3, 5, 7] } },
    { name: 'errors of +1 and −1 must not cancel', input: CANCEL },
    { name: 'a falling line', input: UNEVEN },
    { name: 'some of the line’s points', input: { w: 0.5, b: 1, xs: [0, 2, 4, 6], ys: [1, 3, 2, 5] } },
    { name: 'halves', input: { w: 0.5, b: 0, xs: [1, 2, 3], ys: [1, 0, 2] } },
  ],
  check: checkMse,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'One loop over the points: e = w * xs[i] + b - ys[i], then sq[i] = e * e.',
    'Add each square to total, and after the loop divide by n.',
  ],
  legend: [
    { neutral: 'A squared error not worked out yet' },
    { mark: 'write', label: 'A squared error your code just wrote' },
  ],
};

// ───────────────────────────── 7. least-squares-fit (M1, part 3) ─────────────────────────────

function checkLstsq({ X, y }: FitInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  const p = X[0].length;
  if (!isNumbers(got) || got.length !== p) return { pass: false, message: `Return one weight per column of X: ${p} number${p === 1 ? '' : 's'}.` };
  const want = lstsqOf(X, y);
  if (matches(got, want)) return { pass: true, message: `w = ${list(want)}: the residual y − Xw is at right angles to every column of X.` };
  const dots = residualDots(X, y, got);
  return {
    pass: false,
    message: `At the best w the leftover y − Xw is at right angles to every column of X, so Xᵀ(y − Xw) is all zeros. Yours gives ${list(dots)}. Solve (XᵀX)·w = Xᵀy: w = ${list(want)}.`,
  };
}

const LSTSQ_STARTER_PY = `${HELPERS_NOTE_PY}${TRANSPOSE_PY}

${MATMUL_PY}

${MATVEC_PY}

${solvePy()}

def lstsq(X, y):
    # The best w solves the normal equations (XᵀX)·w = Xᵀy.
    w = array(len(X[0]))
    return w
`;
const LSTSQ_STARTER_JS = `${HELPERS_NOTE_JS}${TRANSPOSE_JS}
${MATMUL_JS}
${MATVEC_JS}
${solveJs()}
function lstsq(X, y) {
  // The best w solves the normal equations (XᵀX)·w = Xᵀy.
  const w = array(X[0].length);
  return w;
}
`;
const LSTSQ_SOLUTION_PY = `${HELPERS_NOTE_PY}${TRANSPOSE_PY}

${MATMUL_PY}

${MATVEC_PY}

${solvePy()}

${LSTSQ_PY}`;
const LSTSQ_SOLUTION_JS = `${HELPERS_NOTE_JS}${TRANSPOSE_JS}
${MATMUL_JS}
${MATVEC_JS}
${solveJs()}
${LSTSQ_JS}`;

const lstsqExercise: Exercise<FitInput> = {
  slug: 'least-squares-fit',
  title: 'Least squares, part 3: lstsq',
  kind: 'write',
  visualiser: 'least-squares',
  summary: 'The best weights in three lines: transpose, build XᵀX and Xᵀy, and solve.',
  task: [
    'Part 3 of the project “Least squares from scratch”. `lstsq(X, y)` returns the weights w that make X·w as close to y as possible: the smallest total of squared errors.',
    'At the best w, the leftover y − X·w is at right angles to every column of X, which says Xᵀ(y − Xw) = 0, that is (XᵀX)·w = Xᵀy: the normal equations. `transpose`, `matmul`, `matvec` and `solve` are written out above (they are parts 1 and 2). Use them to build XᵀX and Xᵀy, solve, and return w.',
  ],
  entry: { python: 'lstsq', js: 'lstsq' },
  args: fitArgs,
  starter: { python: LSTSQ_STARTER_PY, javascript: LSTSQ_STARTER_JS, typescript: toTs(LSTSQ_STARTER_JS) },
  solution: { python: LSTSQ_SOLUTION_PY, javascript: LSTSQ_SOLUTION_JS, typescript: toTs(LSTSQ_SOLUTION_JS) },
  examples: [
    { id: 'noisy', label: 'Four points, not quite a line', input: LINE4 },
    { id: 'line', label: 'Three points on a line', input: LINE3 },
  ],
  tests: [
    { name: 'three points on a line: an exact fit', input: LINE3 },
    { name: 'four points, not quite a line', input: LINE4 },
    { name: 'a parabola’s columns 1, x, x²', input: PARABOLA },
    { name: 'one column, through the origin', input: { X: [[1], [2], [3]], y: [2, 4, 7] } },
    { name: 'two features and an intercept', input: { X: [[1, 2, 0], [1, -1, 3], [1, 0, 1], [1, 4, -2], [1, 1, 1]], y: [3, 0, 2, 5, -1] } },
  ],
  check: checkLstsq,
  markSortedAtEnd: false,
  pointers: [],
  hints: ['First Xt = transpose(X). Then XᵀX is matmul(Xt, X) and Xᵀy is matvec(Xt, y).', 'solve(XᵀX, Xᵀy) returns w. You can’t solve X·w = y directly: X isn’t square, and usually no w fits every point.'],
  legend: WRITE_LEGEND,
  judge: { budget: 'project' },
};

// ───────────────────────────── 8. fit-curves (M1, part 4) ─────────────────────────────

export type CurveInput = { xs: number[]; ys: number[]; degree: number };

const curveArgs = ({ xs, ys, degree }: CurveInput): Arg[] => [
  { kind: 'array', name: 'xs', values: xs },
  { kind: 'array', name: 'ys', values: ys },
  { kind: 'value', name: 'degree', value: degree },
];

export const fitPolyOf = ({ xs, ys, degree }: CurveInput) => lstsqOf(powerRows(xs, degree), ys);

function checkCurve(input: CurveInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { xs, degree } = input;
  const got = result.returned;
  if (!isNumbers(got)) return { pass: false, message: `Return the weights: ${degree + 1} numbers, for 1, x, …, x^${degree}.` };
  if (got.length === degree && degree > 0) return { pass: false, message: `You returned ${degree} weights, but a degree-${degree} curve needs ${degree + 1}: X’s first column is all 1s, for the constant term (where the curve crosses x = 0).` };
  if (got.length !== degree + 1) return { pass: false, message: `A degree-${degree} curve has ${degree + 1} weights (1, x, …, x^${degree}), but you returned ${got.length}.` };
  const want = fitPolyOf(input);
  const terms = want.map((w, j) => (j === 0 ? fmt(w) : `${fmt(w)}·x${j === 1 ? '' : j === 2 ? '²' : `^${j}`}`)).join(' + ').replace(/\+ −/g, '− ');
  if (matches(got, want)) return { pass: true, message: `The best degree-${degree} curve is y = ${terms}.` };
  const X = powerRows(xs, degree);
  return { pass: false, message: `Row i of X should be [1, x, x², …] for xs[i], up to x^${degree}: for x = ${fmt(xs[1])} that is ${list(X[1])}. Then lstsq(X, ys) gives ${list(want)}; yours is ${list(got)}.` };
}

const CURVE_PY = `def fit_poly(xs, ys, degree):
    X = table(len(xs), degree + 1)
    for i in range(len(xs)):
        for j in range(degree + 1):
            X[i][j] = xs[i] ** j
    return lstsq(X, ys)
`;
const CURVE_JS = `function fitPoly(xs, ys, degree) {
  const X = table(xs.length, degree + 1);
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j <= degree; j++) {
      X[i][j] = xs[i] ** j;
    }
  }
  return lstsq(X, ys);
}
`;
const CURVE_STARTER_PY = `def fit_poly(xs, ys, degree):
    X = table(len(xs), degree + 1)
    # Row i of X is [1, x, x², …, x^degree] for x = xs[i].
    w = array(degree + 1)
    return w
`;
const CURVE_STARTER_JS = `function fitPoly(xs, ys, degree) {
  const X = table(xs.length, degree + 1);
  // Row i of X is [1, x, x², …, x^degree] for x = xs[i].
  const w = array(degree + 1);
  return w;
}
`;
const CURVE_HELPERS_NOTE_PY = '# Written out for you: parts 1 to 3 of the project (transpose, matmul, matvec, solve and lstsq).\n';
const CURVE_HELPERS_NOTE_JS = '// Written out for you: parts 1 to 3 of the project (transpose, matmul, matvec, solve and lstsq).\n';
const CURVE_HELPERS_PY = `${CURVE_HELPERS_NOTE_PY}${TRANSPOSE_PY}

${MATMUL_PY}

${MATVEC_PY}

${solvePy()}

${LSTSQ_PY}

`;
const CURVE_HELPERS_JS = `${CURVE_HELPERS_NOTE_JS}${TRANSPOSE_JS}
${MATMUL_JS}
${MATVEC_JS}
${solveJs()}
${LSTSQ_JS}
`;

const curvesExercise: Exercise<CurveInput> = {
  slug: 'fit-curves',
  title: 'Least squares, part 4: fit a line and a quadratic',
  kind: 'write',
  visualiser: 'least-squares',
  summary: 'Build X from powers of x, then let lstsq find the best line, or parabola, through the points.',
  task: [
    'Part 4, the last, of the project “Least squares from scratch”. `fit_poly(xs, ys, degree)` (`fitPoly` in JavaScript and TypeScript) fits y ≈ w₀ + w₁·x + … + w_d·x^d to the points and returns the weights [w₀, …, w_d].',
    'The curve is still a weighted sum of columns, so it is least squares again: row i of X is [1, x, x², …, x^degree] for x = xs[i]. Fill X, then return lstsq(X, ys). Degree 1 fits a line; degree 2 a parabola.',
  ],
  entry: { python: 'fit_poly', js: 'fitPoly' },
  args: curveArgs,
  starter: { python: `${CURVE_HELPERS_PY}${CURVE_STARTER_PY}`, javascript: `${CURVE_HELPERS_JS}${CURVE_STARTER_JS}`, typescript: toTs(`${CURVE_HELPERS_JS}${CURVE_STARTER_JS}`) },
  solution: { python: `${CURVE_HELPERS_PY}${CURVE_PY}`, javascript: `${CURVE_HELPERS_JS}${CURVE_JS}`, typescript: toTs(`${CURVE_HELPERS_JS}${CURVE_JS}`) },
  examples: [
    { id: 'line', label: 'A line through four points', input: { xs: [0, 1, 2, 3], ys: [1, 2, 2, 4], degree: 1 } },
    { id: 'parabola', label: 'A parabola through four points', input: { xs: [-1, 0, 1, 2], ys: [2, 1, 2, 5], degree: 2 } },
  ],
  tests: [
    { name: 'a line through four points', input: { xs: [0, 1, 2, 3], ys: [1, 2, 2, 4], degree: 1 } },
    { name: 'three points exactly on a line', input: { xs: [1, 2, 3], ys: [5, 7, 9], degree: 1 } },
    { name: 'four points exactly on a parabola', input: { xs: [-1, 0, 1, 2], ys: [2, 1, 2, 5], degree: 2 } },
    { name: 'a parabola through five noisy points', input: { xs: [0, 1, 2, 3, 4], ys: [1, 0, 1, 4, 8], degree: 2 } },
    { name: 'degree 0: the best constant is the mean', input: { xs: [1, 2, 3], ys: [2, 4, 9], degree: 0 } },
  ],
  check: checkCurve,
  markSortedAtEnd: false,
  pointers: [],
  hints: ['Two loops: i over the points, j from 0 to degree, and `X[i][j] = xs[i] ** j` (so column 0 is all 1s).', 'Then the weights are lstsq(X, ys): the same least squares as before, with more columns.'],
  legend: WRITE_LEGEND,
  judge: { budget: 'project' },
};

export const leastSquaresExercises: Exercise[] = [solveExercise, zeroPivotExercise, rankExercise, coordsExercise, mseExercise, normalExercise, lstsqExercise, curvesExercise];

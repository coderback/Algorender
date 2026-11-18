import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { apply, fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Handle, ImageBox, ImagePart, Mat2, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { col1, col2, det, dot, ENTRY_MAX, entries, IDENTITY } from './shared';

// Determinants and inverses. det A = ad − bc is the factor A scales every
// area by (negative when it flips the plane over). When det A = 0 the plane is
// squashed onto a line, many points land on one spot and nothing can undo it;
// otherwise A⁻¹ = (1/det A)·[[d, −b], [−c, a]] moves everything back. Solving
// Ax = b for bigger matrices is done by Gaussian elimination: clear the
// entries under each pivot with row operations (swapping in the row with the
// biggest entry in size first), then back-substitute from the last row up.

export type Matrix = readonly (readonly number[])[];
export type InverseInput =
  | { story: 'area'; m: Mat2 }
  | { story: 'squash'; u: Vec; k: number }
  | { story: 'undo'; m: Mat2 }
  | { story: 'eliminate'; A: Matrix; b: readonly number[] };
export type Story = InverseInput['story'];

export const LIMITS = { size: 4, entry: 9, squash: 2 } as const;
/** Values this close to 0 count as 0. */
export const ZERO = 1e-9;
const EXTENT = 5;
/** On-screen size of one matrix cell, in px. */
const CELL_PX = 46;

const pseudocode = [
  'det A = ad − bc  (for a 2×2 matrix)',
  '|det A| = area scale; det < 0 flips',
  'det A = 0: plane squashed, no undo',
  'A⁻¹ = (1/det A)·[[d, −b], [−c, a]]',
  'A⁻¹A = I: A⁻¹ undoes A',
  'solve Ax = b on [A | b]:',
  '  for each column c:',
  '    pivot ← biggest |entry|, row ≥ c',
  '    swap the pivot row up to row c',
  '    Rᵣ ← Rᵣ − (Mᵣc / Mcc)·Rc, r > c',
  'back-substitute: last row up',
  'det A = ± product of the pivots',
];

// ───────────────────────────── the maths ─────────────────────────────

/** The inverse of a 2×2 matrix, or null when det A = 0. */
export function inverse2(m: Mat2): Mat2 | null {
  const D = det(m);
  if (Math.abs(D) < ZERO) return null;
  const [a, b, c, d] = m;
  return [d / D, -b / D, -c / D, a / D];
}
export const mul2 = ([a, b, c, d]: Mat2, [e, f, g, h]: Mat2): Mat2 => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
/** The matrix of the squash story: columns u and k·u. */
export const squashMatrix = (u: Vec, k: number): Mat2 => [u[0], k * u[0], u[1], k * u[1]];

/** One step of Gaussian elimination on the augmented matrix [A | b]. */
export type ElimStep =
  | { kind: 'swap'; col: number; a: number; b: number; M: number[][] }
  | { kind: 'eliminate'; col: number; row: number; factor: number; M: number[][] }
  | { kind: 'none'; col: number; M: number[][] }
  | { kind: 'back'; row: number; value: number; x: (number | null)[] };

export type Elimination = {
  steps: ElimStep[];
  /** The solution, or null when A has no pivot in some column. */
  x: number[] | null;
  /** The pivots, in column order (only up to the first missing one). */
  pivots: number[];
  swaps: number;
  /** det A: ± the product of the pivots (0 when a pivot is missing). */
  det: number;
  /** The column with no pivot, if any. */
  missing: number | null;
  /** The echelon form [U | c] where elimination stopped. */
  M: number[][];
};

const copy = (M: readonly (readonly number[])[]) => M.map((r) => [...r]);

/**
 * Gaussian elimination with partial pivoting: for each column, the row at or
 * below the diagonal with the biggest |entry| is swapped up (the first such
 * row on a tie), then every entry under the pivot is cleared. Stops at the
 * first column with no non-zero entry at or below the diagonal.
 */
export function eliminate(A: Matrix, b: readonly number[]): Elimination {
  const n = A.length;
  let M = A.map((row, i) => [...row, b[i]]);
  const steps: ElimStep[] = [];
  const pivots: number[] = [];
  let swaps = 0;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c]) + ZERO) p = r;
    if (Math.abs(M[p][c]) < ZERO) {
      steps.push({ kind: 'none', col: c, M: copy(M) });
      return { steps, x: null, pivots, swaps, det: 0, missing: c, M };
    }
    if (p !== c) {
      M = copy(M);
      [M[c], M[p]] = [M[p], M[c]];
      swaps++;
      steps.push({ kind: 'swap', col: c, a: c, b: p, M: copy(M) });
    }
    pivots.push(M[c][c]);
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r][c]) < ZERO) continue;
      const factor = M[r][c] / M[c][c];
      M = copy(M);
      M[r] = M[r].map((v, j) => (j === c ? 0 : v - factor * M[c][j]));
      steps.push({ kind: 'eliminate', col: c, row: r, factor, M: copy(M) });
    }
  }
  const x: (number | null)[] = Array(n).fill(null);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]!;
    x[i] = s / M[i][i];
    steps.push({ kind: 'back', row: i, value: x[i]!, x: [...x] });
  }
  const sign = swaps % 2 === 0 ? 1 : -1;
  return { steps, x: x as number[], pivots, swaps, det: sign * pivots.reduce((p, v) => p * v, 1), missing: null, M };
}

/** The solution of Ax = b by elimination, or null when A has no unique solution. */
export const solveSystem = (A: Matrix, b: readonly number[]) => eliminate(A, b).x;

/** A·x, row by row. */
export const matVec = (A: Matrix, x: readonly number[]) => A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));

// ───────────────────────────── drawing helpers ─────────────────────────────

const sub = (i: number) => String(i + 1).split('').map((d) => String.fromCharCode(0x2080 + Number(d))).join('');
const R = (i: number) => `R${i + 1}`;
/** A number, in brackets when negative, for writing after a · or a −. */
const par = (v: number) => (v < 0 ? `(${fmt(v)})` : fmt(v));
const times = (a: number, b: number) => `${par(a)}·${par(b)}`;
const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });
const matrixPanel = (name: string, label: string, M: Mat2): PlotPart => {
  const [a, b, c, d] = entries(M);
  return { kind: 'matrix', id: name, name, label, cols: [{ values: [a, c], tone: 1 }, { values: [b, d], tone: 2 }] };
};
const written2 = (m: Mat2) => `[[${fmt(m[0])}, ${fmt(m[1])}], [${fmt(m[2])}, ${fmt(m[3])}]]`;
const stats = (rowOps: number) => ({ rowOps });

function plane(label: string, warp: Mat2, shapes: Shape[], handles: Handle[] = []): PlanePart {
  return { kind: 'plane', id: 'plane', label, x: { min: -EXTENT, max: EXTENT, label: 'x' }, y: { min: -EXTENT, max: EXTENT, label: 'y' }, equal: true, warp, shapes, handles };
}
const basis = (M: Mat2): Shape[] => [
  { kind: 'vector', id: 'i', from: [0, 0], to: col1(M), tone: 1, label: 'î' },
  { kind: 'vector', id: 'j', from: [0, 0], to: col2(M), tone: 2, label: 'ĵ' },
];
const parallelogram = (M: Mat2, id = 'square'): Shape => ({ kind: 'path', id, points: [[0, 0], col1(M), [col1(M)[0] + col2(M)[0], col1(M)[1] + col2(M)[1]], col2(M)], closed: true, fill: true, mark: 'key' });
const unitSquare: Shape = { kind: 'path', id: 'unit', points: [[0, 0], [1, 0], [1, 1], [0, 1]], closed: true, dashed: true, faint: true };
const columnHandles = (M: Mat2, step = 0.5): Handle[] => [
  { id: 'i', at: col1(M), label: 'Where î lands', tone: 1, step, min: [-ENTRY_MAX, -ENTRY_MAX], max: [ENTRY_MAX, ENTRY_MAX] },
  { id: 'j', at: col2(M), label: 'Where ĵ lands', tone: 2, step, min: [-ENTRY_MAX, -ENTRY_MAX], max: [ENTRY_MAX, ENTRY_MAX] },
];
const flat = (D: number) => Math.abs(D) < ZERO;

// ───────────────────────────── area ─────────────────────────────

function* area(m: Mat2): Generator<Frame<PlotState>> {
  const [a, b, c, d] = m;
  const D = det(m);
  const vars = { a, b, c, d };
  const triangle = (M: Mat2): Shape => ({ kind: 'path', id: 'half', points: [[0, 0], col1(M), col2(M)], closed: true, fill: true, fillOpacity: 0.4, mark: 'found' });
  const formula = `${times(a, d)} − ${times(b, c)} = ${fmt(D)}`;

  yield plotFrame([plane('The plane before A', IDENTITY, [unitSquare, parallelogram(IDENTITY), ...basis(IDENTITY)]), matrixPanel('A', 'The matrix A', m), readouts([{ id: 'area', label: 'area of the square', value: '1' }])], {
    line: 0,
    note: `Before A moves anything, î and ĵ make the unit square, area 1. A will send î to its first column ${fmtVec(col1(m))} and ĵ to its second, ${fmtVec(col2(m))}. Its determinant, ad − bc, says what A does to that area.`,
    vars,
    stats: stats(0),
    checkpoint: ask('What is det A = ad − bc?', fmt(D), [fmt(a * d + b * c), fmt(a * d), fmt(-D), fmt(a * c - b * d), fmt(a + d)]),
  });

  const after = [plane('The plane under A', m, [unitSquare, parallelogram(m), ...basis(m)], columnHandles(m)), matrixPanel('A', 'The matrix A', m)];
  yield plotFrame([...after, readouts([{ id: 'det', label: 'det A', value: fmt(D), mark: 'key' }, { id: 'area', label: 'area now', value: fmt(Math.abs(D)) }])], {
    line: 1,
    note: flat(D)
      ? `det A = ${formula}. The square is squashed flat: its area is 0, and so is every other shape's.`
      : `det A = ${formula}. The square became a parallelogram with sides ${fmtVec(col1(m))} and ${fmtVec(col2(m))}, and its area is the size of the determinant, ${fmt(Math.abs(D))}. Drag either tip to change A.`,
    vars: { ...vars, det: D },
    stats: stats(0),
    checkpoint: flat(D) ? undefined : askInOrder('Did A flip the plane over, so that ĵ now sits clockwise from î?', ['Yes', 'No'], D < 0 ? 'Yes' : 'No'),
  });

  yield plotFrame([plane('The plane under A', m, [unitSquare, parallelogram(m), triangle(IDENTITY), ...basis(m)], columnHandles(m)), matrixPanel('A', 'The matrix A', m), readouts([{ id: 'det', label: 'det A', value: fmt(D), mark: 'key' }, { id: 'tri', label: 'triangle before', value: '0.5', mark: 'found' }])], {
    line: 1,
    note: flat(D)
      ? 'With det A = 0 there is nothing left to flip: the plane is a line. Now look at the shaded triangle, half of the unit square, before A moves it.'
      : D < 0
        ? `Yes: det A is negative, so the plane was turned over like a mirror image, and ĵ now sits clockwise from î. The minus sign says “flipped”, not “smaller”. Now look at the shaded triangle, half of the unit square, before A moves it.`
        : `No: det A is positive, so ĵ is still anticlockwise from î, as it started. Now look at the shaded triangle, half of the unit square, before A moves it.`,
    vars: { ...vars, det: D },
    stats: stats(0),
    checkpoint: ask('The triangle has area 0.5. What is its area after A?', fmt(Math.abs(D) / 2), [fmt(Math.abs(D)), fmt(0.5), fmt(Math.abs(D) + 0.5), fmt(Math.abs(D) * 2)]),
  });

  yield plotFrame([plane('The plane under A', m, [unitSquare, parallelogram(m), triangle(m), ...basis(m)], columnHandles(m)), matrixPanel('A', 'The matrix A', m), readouts([{ id: 'det', label: 'det A', value: fmt(D), mark: 'key' }, { id: 'tri', label: 'triangle after', value: fmt(Math.abs(D) / 2), mark: 'found' }])], {
    line: 1,
    note: `The triangle is still half of the parallelogram, so its area is ${fmt(Math.abs(D))} × 0.5 = ${fmt(Math.abs(D) / 2)}. Every shape's area is multiplied by the same number, |det A|. Drag î or ĵ: put them on one line and the determinant drops to 0.`,
    vars: { ...vars, det: D },
    stats: stats(0),
  });
}

// ───────────────────────────── squash ─────────────────────────────

/** The three points of the squash story: (1, 0) and one step either way along (k, −1), which A sends to 0. */
export const squashPoints = (k: number): Vec[] => [
  [1 - k, 1],
  [1, 0],
  [1 + k, -1],
];

function* squash(u: Vec, k: number): Generator<Frame<PlotState>> {
  const m = squashMatrix(u, k);
  const pts = squashPoints(k);
  const names = ['P', 'Q', 'S'];
  const vars = { 'u₁': u[0], 'u₂': u[1], k };
  const line: Shape = { kind: 'line', id: 'line', through: [0, 0], dir: u, dashed: true, label: 'u’s line' };
  const handles: Handle[] = [
    { id: 'i', at: u, label: 'Where î lands (u)', tone: 1, step: 0.5, min: [-LIMITS.squash, -LIMITS.squash], max: [LIMITS.squash, LIMITS.squash] },
    { id: 'j', at: [round(k * u[0], 6), round(k * u[1], 6)], label: 'Where ĵ lands (k·u)', tone: 2, step: 0.25, min: [-ENTRY_MAX, -ENTRY_MAX], max: [ENTRY_MAX, ENTRY_MAX] },
  ];
  const before: Shape[] = pts.map((p, n) => ({ kind: 'point', id: `p${n}`, at: p, label: names[n], mark: 'compare' }));
  const after: Shape[] = pts.map((p, n) => ({ kind: 'point', id: `p${n}`, at: apply(m, p), label: n === 1 ? 'P, Q, S' : undefined, mark: 'compare' }));
  const landing = fmtVec(apply(m, pts[1]));
  const w: Vec = u[0] === 0 ? [1, 0] : [0, 1];
  const offLine: Shape = { kind: 'point', id: 'w', at: w, label: `w ${fmtVec(w)}`, mark: 'reject' };
  const D = det(m);

  yield plotFrame(
    [
      plane('The plane before A', IDENTITY, [{ kind: 'path', id: 'through', points: [pts[0], pts[2]], dashed: true, faint: true }, ...before, ...basis(IDENTITY)]),
      matrixPanel('A', 'The matrix A', m),
      readouts(pts.map((p, n) => ({ id: names[n], label: names[n], value: fmtVec(p) }))),
    ],
    {
      line: 0,
      note: `A sends î to u = ${fmtVec(u)} and ĵ to ${fmt(k)}·u = ${fmtVec(col2(m))}: both columns lie on one line through the origin. Follow the three points P, Q and S.`,
      vars,
      stats: stats(0),
      checkpoint: ask('What is det A = ad − bc?', fmt(D), [fmt(m[0] * m[3] + m[1] * m[2]), fmt(m[0] * m[3]), fmt(1), fmt(k)]),
    },
  );

  yield plotFrame([plane('The plane under A', m, [line, ...after, ...basis(m)], handles), matrixPanel('A', 'The matrix A', m), readouts([{ id: 'det', label: 'det A', value: '0', mark: 'key' }, { id: 'land', label: 'P, Q and S all land on', value: landing, mark: 'compare' }])], {
    line: 2,
    note: `det A = ${times(m[0], m[3])} − ${times(m[1], m[2])} = 0. The whole plane is squashed onto u’s line: every point lands somewhere on it, and P, Q and S all land on the same spot, ${landing}. Drag î along or off the line, or slide ĵ along it.`,
    vars: { ...vars, det: 0 },
    stats: stats(0),
    checkpoint: askInOrder(`Could one matrix send ${landing} back to P, Q and S all at once?`, ['Yes', 'No'], 'No'),
  });

  yield plotFrame([plane('The plane under A', m, [line, ...after, offLine, ...basis(m)], handles), matrixPanel('A', 'The matrix A', m), readouts([{ id: 'det', label: 'det A', value: '0', mark: 'key' }, { id: 'inv', label: 'A⁻¹', value: 'none', mark: 'reject' }])], {
    line: 2,
    note: `No. ${landing} came from P, Q and S at once, and a matrix sends each point to only one place. Worse, a point off the line, like w = ${fmtVec(w)}, came from nowhere: nothing lands there. A matrix with det A = 0 has no inverse, and Ax = w has no solution.`,
    vars: { ...vars, det: 0 },
    stats: stats(0),
  });
}

// ───────────────────────────── undo ─────────────────────────────

function* undo(m: Mat2): Generator<Frame<PlotState>> {
  const [a, b, c, d] = m;
  const D = det(m);
  const inv = inverse2(m)!;
  const vars = { a, b, c, d };
  const square = (M: Mat2) => [unitSquare, parallelogram(M)];

  yield plotFrame([plane('The plane under A', m, [...square(m), ...basis(m)], columnHandles(m)), matrixPanel('A', 'The matrix A', m)], {
    line: 3,
    note: `A sends î to ${fmtVec(col1(m))} and ĵ to ${fmtVec(col2(m))}. To undo it, we need the matrix that sends them back to (1, 0) and (0, 1). Its recipe starts with det A. Drag either tip to change A.`,
    vars,
    stats: stats(0),
    checkpoint: ask('What is det A = ad − bc?', fmt(D), [fmt(a * d + b * c), fmt(a * d), fmt(-D), fmt(a + d)]),
  });

  const swapped: Mat2 = [d, -b, -c, a];
  yield plotFrame([plane('The plane under A', m, [...square(m), ...basis(m)]), matrixPanel('A', 'The matrix A', m), matrixPanel('S', 'Swap a and d, negate b and c', swapped), readouts([{ id: 'det', label: 'det A', value: fmt(D), mark: 'key' }])], {
    line: 3,
    note: `det A = ${times(a, d)} − ${times(b, c)} = ${fmt(D)}, not 0, so A can be undone. The recipe: swap a and d, put a minus sign on b and c, then divide everything by det A.`,
    vars: { ...vars, det: D },
    stats: stats(0),
    checkpoint: ask('What is the top-left entry of A⁻¹?', fmt(d / D), [fmt(d), fmt(a / D), fmt(-d / D), fmt(a)]),
  });

  yield plotFrame([plane('The plane under A', m, [...square(m), ...basis(m)]), matrixPanel('A', 'The matrix A', m), matrixPanel('A⁻¹', 'The inverse A⁻¹', inv), readouts([{ id: 'det', label: 'det A', value: fmt(D), mark: 'key' }])], {
    line: 3,
    note: `A⁻¹ = (1/${fmt(D)})·${written2(swapped)} = ${written2(inv)}. Apply it to î’s new place, ${fmtVec(col1(m))}: row 1 of A⁻¹ dotted with it is ${times(inv[0], a)} + ${times(inv[1], c)} = ${fmt(inv[0] * a + inv[1] * c)}, and row 2 gives ${times(inv[2], a)} + ${times(inv[3], c)} = ${fmt(inv[2] * a + inv[3] * c)}. So î goes back to (1, 0).`,
    vars: { ...vars, det: D },
    stats: stats(0),
    checkpoint: ask(`Where does A⁻¹ send ĵ’s new place, the second column of A, ${fmtVec(col2(m))}?`, '(0, 1)', [fmtVec(col2(inv)), fmtVec(col2(m)), '(1, 0)', fmtVec(apply(inv, [col2(m)[1], col2(m)[0]]))]),
  });

  const back = mul2(inv, m);
  yield plotFrame([plane('After A, then A⁻¹', back, [...square(back), ...basis(back)]), matrixPanel('A⁻¹', 'The inverse A⁻¹', inv), matrixPanel('I', 'A⁻¹A', back), readouts([{ id: 'det', label: 'det A', value: fmt(D), mark: 'key' }])], {
    line: 4,
    note: `(0, 1): ĵ is back home too. A⁻¹A is the identity I, the matrix that changes nothing, and AA⁻¹ = I too. Every vector A moved is moved straight back.`,
    vars: { ...vars, det: D },
    stats: stats(0),
    checkpoint: ask('A scales areas by det A. What does A⁻¹ scale them by?', fmt(1 / D), [fmt(D), fmt(-D), fmt(-1 / D), '0']),
  });

  yield plotFrame([plane('The plane under A⁻¹ alone', inv, [...square(inv), ...basis(inv)]), matrixPanel('A⁻¹', 'The inverse A⁻¹', inv), readouts([{ id: 'det', label: 'det A', value: fmt(D) }, { id: 'detinv', label: 'det A⁻¹', value: fmt(det(inv)), mark: 'key' }])], {
    line: 4,
    note: `det A⁻¹ = 1 / det A = ${fmt(det(inv))}: whatever A stretched, A⁻¹ shrinks back by the same factor. That is also why det A = 0 has no inverse: there is no 1/0.`,
    vars: { ...vars, det: D },
    stats: stats(0),
  });
}

// ───────────────────────────── elimination ─────────────────────────────

const LIT = 0.3;
const CURRENT = 0.5;

function augmentedImage(M: readonly (readonly number[])[], opts: { lit?: (i: number, j: number) => number; boxes?: ImageBox[] } = {}): ImagePart {
  const rows = M.length;
  const cols = M[0].length;
  const pixels: number[] = [];
  const values: string[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      pixels.push(opts.lit?.(i, j) ?? 0);
      values.push(fmt(M[i][j]));
    }
  return { kind: 'image', id: 'M', label: `[A | b]: the last column is b`, width: cols, height: rows, pixels, scale: 'signed', values, boxes: opts.boxes ?? [], size: cols * CELL_PX, matrix: true };
}

type Draft = { parts: PlotPart[]; note: string; line: number; ops: number; vars: Record<string, number>; ask?: Frame<PlotState>['checkpoint'] };

function* elimination(A: Matrix, b: readonly number[]): Generator<Frame<PlotState>> {
  const n = A.length;
  const result = eliminate(A, b);
  const xName = (i: number) => `x${sub(i)}`;
  const drafts: Draft[] = [];
  let ops = 0;
  const M0 = A.map((row, i) => [...row, b[i]]);
  const shapeOf = `${n}×${n}`;
  const det0 = result.det;

  drafts.push({
    parts: [augmentedImage(M0, { boxes: [{ id: 'pivot', x: 0, y: 0, w: 1, h: 1, mark: 'pivot' }] }), readouts([{ id: 'n', label: 'unknowns', value: String(n) }])],
    note: `Solve Ax = b: ${n} equations in ${n} unknowns, written as the augmented matrix [A | b], A’s ${shapeOf} numbers with b as an extra column. Row operations (swapping rows, subtracting a multiple of one row from another) change the equations but not their solution.`,
    line: 5,
    ops,
    vars: { n },
  });

  let M = M0;
  for (const s of result.steps) {
    if (s.kind === 'swap') {
      ops++;
      const before = M;
      M = s.M;
      const zero = Math.abs(before[s.col][s.col]) < ZERO;
      drafts.push({
        parts: [
          augmentedImage(M, { lit: (i) => (i === s.a || i === s.b ? LIT : 0), boxes: [{ id: 'pivot', x: s.col, y: s.col, w: 1, h: 1, mark: 'pivot' }, { id: 'swapped', x: 0, y: s.b, w: n + 1, h: 1, mark: 'swap' }] }),
          readouts([{ id: 'op', label: 'row operation', value: `swap ${R(s.a)} and ${R(s.b)}`, mark: 'swap' }]),
        ],
        note: zero
          ? `The pivot spot in column ${s.col + 1} holds 0, and we can’t divide by 0. The biggest entry below it in size (ignoring its sign) is the ${fmt(M[s.col][s.col])} in ${R(s.b)}, so swap that row up: ${R(s.a)} ↔ ${R(s.b)}. Swapping two equations doesn’t change the answer.`
          : `The biggest entry in column ${s.col + 1} in size (ignoring its sign) is the ${fmt(M[s.col][s.col])} in ${R(s.b)}, bigger than the ${fmt(before[s.col][s.col])} in the pivot spot, so swap that row up: ${R(s.a)} ↔ ${R(s.b)}. Computers keep only so many digits, so small rounding errors creep in, and dividing by the biggest pivot keeps them small.`,
        line: 8,
        ops,
        vars: { column: s.col + 1 },
        ask: ask(`Which row moves up to give column ${s.col + 1} its pivot?`, R(s.b), Array.from({ length: n - s.col }, (_, r) => R(s.col + r)).filter((r) => r !== R(s.b))),
      });
    } else if (s.kind === 'eliminate') {
      ops++;
      const before = M;
      M = s.M;
      const f = s.factor;
      const target = before[s.row][s.col];
      const pivot = before[s.col][s.col];
      const how = f < 0 ? `${R(s.row)} + ${fmt(-f)}·${R(s.col)}` : `${R(s.row)} − ${fmt(f)}·${R(s.col)}`;
      drafts.push({
        parts: [
          augmentedImage(M, { lit: (i, j) => (i === s.row ? CURRENT : i === s.col && j >= s.col ? LIT : 0), boxes: [{ id: 'pivot', x: s.col, y: s.col, w: 1, h: 1, mark: 'pivot' }, { id: 'row', x: 0, y: s.row, w: n + 1, h: 1, mark: 'write' }] }),
          readouts([
            { id: 'op', label: 'row operation', value: `${R(s.row)} ← ${how}`, mark: 'write' },
            { id: 'factor', label: 'multiple', value: `${fmt(target)} / ${fmt(pivot)} = ${fmt(f)}` },
          ]),
        ],
        note: `To clear the ${fmt(target)} under the pivot ${fmt(pivot)}, subtract ${fmt(target)} / ${fmt(pivot)} = ${fmt(f)} times ${R(s.col)} from ${R(s.row)}: ${R(s.row)} ← ${how}. Its column ${s.col + 1} entry is now 0, and the whole row changes, b included.`,
        line: 9,
        ops,
        vars: { column: s.col + 1, row: s.row + 1, multiple: round(f, 4) },
        ask: ask(`What multiple of ${R(s.col)} do you subtract from ${R(s.row)} to clear its ${fmt(target)}?`, fmt(f), [fmt(-f), fmt(target), fmt(pivot), target !== 0 ? fmt(pivot / target) : fmt(2 * f), fmt(f + 1)]),
      });
    } else if (s.kind === 'none') {
      const c = s.col;
      const last = c === n - 1;
      const inconsistent = last && Math.abs(M[n - 1][n]) > ZERO;
      drafts.push({
        parts: [
          augmentedImage(M, { lit: (i, j) => (j === c && i >= c ? CURRENT : 0), boxes: [{ id: 'pivot', x: c, y: c, w: 1, h: n - c, mark: 'reject' }] }),
          readouts([
            { id: 'det', label: 'det A', value: '0', mark: 'reject' },
            { id: 'x', label: 'x', value: last ? (inconsistent ? 'no solution' : 'infinitely many') : 'no unique solution', mark: 'reject' },
          ]),
        ],
        note: last
          ? inconsistent
            ? `Column ${c + 1} has only 0s from the pivot spot down, so there is no pivot and det A = 0. The last row now says 0 = ${fmt(M[n - 1][n])}, which is impossible: these equations have no solution at all.`
            : `Column ${c + 1} has only 0s from the pivot spot down, so there is no pivot and det A = 0. The last row now says 0 = 0, which is always true: one equation was a copy of the others in disguise, so there are infinitely many solutions.`
          : `Column ${c + 1} has only 0s from the pivot spot down, so there is no pivot and det A = 0. A squashes space, so Ax = b has either no solution or infinitely many, never exactly one.`,
        line: 7,
        ops,
        vars: { column: c + 1 },
        ask: askInOrder(`Is there a pivot for column ${c + 1}?`, ['Yes', 'No'], 'No'),
      });
    } else {
      const i = s.row;
      // The unknowns already found that this row still uses.
      const known = Array.from({ length: n - i - 1 }, (_, t) => i + 1 + t).filter((j) => Math.abs(M[i][j]) > ZERO);
      const rhs = M[i][n];
      const equation = [i, ...known].map((j, t) => (t === 0 ? `${fmt(M[i][j])}·${xName(j)}` : `${M[i][j] < 0 ? '−' : '+'} ${fmt(Math.abs(M[i][j]))}·${xName(j)}`)).join(' ');
      const terms = known.map((j) => times(M[i][j], s.x[j]!));
      const calc = known.length ? `(${fmt(rhs)} − ${terms.join(' − ')}) / ${par(M[i][i])}` : `${fmt(rhs)} / ${par(M[i][i])}`;
      const subtracted = rhs - known.reduce((t, j) => t + M[i][j] * s.x[j]!, 0);
      drafts.push({
        parts: [
          augmentedImage(M, { lit: (r, j) => (r === i && (j === i || j === n) ? CURRENT : r === i && j > i ? LIT : 0), boxes: [{ id: 'row', x: 0, y: i, w: n + 1, h: 1, mark: 'found' }] }),
          readouts(s.x.map((v, j) => ({ id: `x${j}`, label: xName(j), value: v == null ? '?' : fmt(v), mark: j === i ? ('found' as const) : null }))),
        ],
        note: known.length
          ? `${R(i)} says ${equation} = ${fmt(rhs)}. Put in the ${known.length === 1 ? 'value' : 'values'} already found, move ${known.length === 1 ? 'it' : 'them'} across and divide: ${xName(i)} = ${calc} = ${fmt(s.value)}.`
          : i === n - 1
            ? `Elimination left a staircase of 0s, so the last row has one unknown: ${equation} = ${fmt(rhs)}, so ${xName(i)} = ${calc} = ${fmt(s.value)}. Now work up the rows.`
            : `${R(i)} says ${equation} = ${fmt(rhs)}, so ${xName(i)} = ${calc} = ${fmt(s.value)}.`,
        line: 10,
        ops,
        vars: { [xName(i)]: round(s.value, 4) },
        ask: ask(`What is ${xName(i)}?`, fmt(s.value), [fmt(rhs), fmt(rhs / M[i][i]), fmt(-s.value), fmt(subtracted), fmt(s.value + 1)]),
      });
    }
  }

  if (result.x) {
    const x = result.x;
    const Ax = matVec(A, x);
    drafts.push({
      parts: [
        augmentedImage(M0),
        readouts([
          ...x.map((v, j) => ({ id: `x${j}`, label: xName(j), value: fmt(v), mark: 'found' as const })),
          { id: 'check', label: 'A·x', value: `(${Ax.map((v) => fmt(v)).join(', ')})`, mark: 'found' },
          { id: 'det', label: 'det A', value: `${result.swaps % 2 ? '−(' : ''}${result.pivots.map(par).join('·')}${result.swaps % 2 ? ')' : ''} = ${fmt(det0)}`, mark: 'key' },
        ]),
      ],
      note: `Check with the original equations: each row of A dotted with x gives back b, (${Ax.map((v) => fmt(v)).join(', ')}). Subtracting a multiple of one row from another never changes det A, and each swap flips its sign (like swapping î and ĵ turns the plane over), so the pivots give det A for free: their product${result.swaps === 1 ? ', with a minus sign for the one swap,' : result.swaps ? `, with a minus sign for each of the ${result.swaps} swaps,` : ''} is ${fmt(det0)}.`,
      line: 11,
      ops,
      vars: Object.fromEntries(x.map((v, j) => [xName(j), round(v, 4)])),
    });
  }

  for (let k = 0; k < drafts.length; k++) {
    const d = drafts[k];
    yield plotFrame(d.parts, { line: d.line, note: d.note, vars: d.vars, stats: stats(d.ops), checkpoint: drafts[k + 1]?.ask });
  }
}

function* run(input: InverseInput): Generator<Frame<PlotState>> {
  if (input.story === 'area') yield* area(input.m);
  else if (input.story === 'squash') yield* squash(input.u, input.k);
  else if (input.story === 'undo') yield* undo(input.m);
  else yield* elimination(input.A, input.b);
}

// ───────────────────────────── custom text ─────────────────────────────

const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const isWhole = (x: number) => Number.isInteger(x);

/** The first [[…], […]] in the text as rows, and where it ends. */
function matrixIn(text: string): { rows: number[][]; end: number } | null {
  const m = /\[\s*\[[^[\]]*\](?:\s*,\s*\[[^[\]]*\])*\s*\]/.exec(text);
  if (!m) return null;
  return { rows: [...m[0].matchAll(/\[([^[\]]*)\]/g)].map((r) => numbersIn(r[1])), end: m.index + m[0].length };
}

export function parseInverse(raw: string): { value: InverseInput } | { error: string } {
  const text = raw.replace(/−/g, '-');
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  if (word === 'squash') {
    const xs = numbersIn(text);
    if (xs.length !== 3) return { error: 'squash takes three numbers: u’s two parts, then k (ĵ lands on k·u).' };
    if (!xs.every((x) => isHalf(x) && Math.abs(x) <= LIMITS.squash)) return { error: `Use halves from −${LIMITS.squash} to ${LIMITS.squash}.` };
    if (xs[0] === 0 && xs[1] === 0) return { error: 'u can’t be (0, 0).' };
    return { value: { story: 'squash', u: [xs[0], xs[1]], k: xs[2] } };
  }
  if (word === 'area' || word === 'undo') {
    const found = matrixIn(text);
    if (!found || found.rows.length !== 2 || found.rows.some((r) => r.length !== 2)) return { error: `${word} takes a 2×2 matrix as rows, e.g. ${word} [[2, 1], [1, 1]].` };
    const m = found.rows.flat() as unknown as Mat2;
    if (!m.every((x) => isHalf(x) && Math.abs(x) <= ENTRY_MAX)) return { error: `Use halves from −${ENTRY_MAX} to ${ENTRY_MAX}.` };
    if (word === 'undo' && flat(det(m))) return { error: 'That matrix has det A = 0, so it has no inverse to undo it with.' };
    return { value: { story: word, m: [m[0], m[1], m[2], m[3]] } };
  }
  if (word === 'eliminate') {
    const found = matrixIn(text);
    if (!found) return { error: 'Give A as rows, then b, e.g. eliminate [[2, 1], [1, 3]] [3, 5].' };
    const A = found.rows;
    const n = A.length;
    if (n < 2 || n > LIMITS.size || A.some((r) => r.length !== n)) return { error: `A must be square, from 2×2 to ${LIMITS.size}×${LIMITS.size}.` };
    const b = numbersIn(text.slice(found.end));
    if (b.length !== n) return { error: `b needs ${n} numbers, one per row of A.` };
    if (![...A.flat(), ...b].every((x) => isWhole(x) && Math.abs(x) <= LIMITS.entry)) return { error: `Use whole numbers from −${LIMITS.entry} to ${LIMITS.entry}.` };
    return { value: { story: 'eliminate', A, b } };
  }
  return { error: 'Start with area, squash, undo or eliminate, e.g. area [[2, 1], [1, 3]] or eliminate [[2, 1], [1, 3]] [3, 5].' };
}

const written = (M: Matrix) => `[${M.map((r) => `[${r.map((x) => plain(x)).join(', ')}]`).join(', ')}]`;
const rowsOf = (m: Mat2): Matrix => [
  [m[0], m[1]],
  [m[2], m[3]],
];

export function formatInverse(input: InverseInput): string {
  switch (input.story) {
    case 'area':
    case 'undo':
      return `${input.story} ${written(rowsOf(input.m))}`;
    case 'squash':
      return `squash ${plain(input.u[0])} ${plain(input.u[1])} ${plain(input.k)}`;
    case 'eliminate':
      return `eliminate ${written(input.A)} [${input.b.map((x) => plain(x)).join(', ')}]`;
  }
}

const snap = (x: number, step: number, lim: number) => Math.max(-lim, Math.min(lim, Math.round(x / step) * step)) + 0;

export function dragInverse(input: InverseInput, id: string, to: Vec): InverseInput {
  if (input.story === 'area' || input.story === 'undo') {
    const t: Vec = [snap(to[0], 0.5, ENTRY_MAX), snap(to[1], 0.5, ENTRY_MAX)];
    const [a, b, c, d] = input.m;
    const m: Mat2 = id === 'i' ? [t[0], b, t[1], d] : id === 'j' ? [a, t[0], c, t[1]] : input.m;
    if (input.story === 'undo' && flat(det(m))) return input;
    return { ...input, m };
  }
  if (input.story === 'squash') {
    if (id === 'i') {
      const u: Vec = [snap(to[0], 0.5, LIMITS.squash), snap(to[1], 0.5, LIMITS.squash)];
      return u[0] === 0 && u[1] === 0 ? input : { ...input, u };
    }
    if (id === 'j') return { ...input, k: snap(dot(to, input.u) / dot(input.u, input.u), 0.5, LIMITS.squash) };
  }
  return input;
}

const example = (id: string, label: string, input: InverseInput) => ({ id, label, make: () => input, sized: false });

export const inverseMatrix = defineAlgorithm<InverseInput, PlotState>({
  kind: 'algorithm',
  slug: 'inverse-matrix',
  view: 'plot',
  input: {
    examples: [
      example('area', 'The determinant as an area', { story: 'area', m: [2, 1, 1, 2] }),
      example('flip', 'A negative determinant: a flip', { story: 'area', m: [1, 2, 2, 1] }),
      example('squash', 'Squashed flat: det A = 0', { story: 'squash', u: [2, 1], k: 0.5 }),
      example('undo', 'Undo it: the inverse', { story: 'undo', m: [2, 1, 2, 2] }),
      example('eliminate', 'Solve three equations by elimination', {
        story: 'eliminate',
        A: [
          [4, 2, 0],
          [2, 3, 1],
          [-2, 1, 3],
        ],
        b: [8, 7, -3],
      }),
      example('pivot', 'A zero pivot: swap rows', {
        story: 'eliminate',
        A: [
          [1, 1, 1],
          [1, 1, 2],
          [1, 2, 3],
        ],
        b: [2, 1, 2],
      }),
      example('singular', 'No pivot: no single solution', {
        story: 'eliminate',
        A: [
          [1, 2],
          [2, 4],
        ],
        b: [3, 5],
      }),
    ],
    custom: {
      label: 'area or undo [[a, b], [c, d]] (halves), squash ux uy k, or eliminate A b (whole numbers, up to 4×4)',
      placeholder: 'e.g. eliminate [[2, 1], [1, 3]] [3, 5]',
      parse: parseInverse,
      format: formatInverse,
    },
    drag: dragInverse,
  },
  pseudocode,
  stats: [{ key: 'rowOps', label: 'Row operations' }],
  legend: [
    { neutral: 'Matrix entries, and the grid before it moves' },
    { tone: 1, label: 'Where î lands (the first column)' },
    { tone: 2, label: 'Where ĵ lands (the second column)' },
    { mark: 'key', label: 'The unit square after the move' },
    { mark: 'found', label: 'Half the square, or an unknown just found' },
    { mark: 'compare', label: 'Points that all land on one spot' },
    { mark: 'pivot', label: 'The pivot: the entry the others are cleared with' },
    { mark: 'write', label: 'The row being changed' },
    { mark: 'swap', label: 'A row swapped up' },
    { mark: 'reject', label: 'Unreachable, or no pivot' },
  ],
  run,
  content: {
    idea: 'det A = ad − bc is how much A scales every area, with a minus sign when it flips the plane over. If det A ≠ 0, A can be undone: A⁻¹ = (1/det A)·[[d, −b], [−c, a]] and A⁻¹A = I. To solve Ax = b for any size, use row operations to clear the entries under each pivot, then back-substitute from the last row up.',
    invariant: 'Row operations (swapping two rows, subtracting a multiple of one row from another) never change the solution of the equations. det A is the product of the pivots, with a minus sign for each swap, and det(A⁻¹) = 1/det A.',
    whenToUse: 'Solving systems of linear equations (circuits, balancing, fitting a line by least squares), checking whether a matrix can be undone (det ≠ 0), and measuring how a transformation changes area or volume. In practice, solve by elimination rather than computing A⁻¹.',
    traits: [
      { label: '|det A| = area scale', good: null },
      { label: 'det A = 0: no inverse', good: false },
      { label: 'Elimination: about n³/3 multiplications', good: null },
    ],
    experiments: [
      { example: 'area', prompt: 'Drag ĵ onto î’s line. What happens to the area, and to the determinant?' },
      { example: 'flip', prompt: 'Swap î and ĵ’s places. Predict the sign of the determinant before you look.' },
      { example: 'squash', prompt: 'Drag î off the line ĵ sits on. Is det A still 0? (ĵ follows k·u wherever u goes.)' },
      { example: 'pivot', prompt: 'Before each step, predict the multiple, then which row must swap up when a 0 lands on the diagonal.' },
    ],
  },
});

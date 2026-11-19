import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import type { Handle, ImageBox, ImagePart, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { project } from './dot-product';
import { matmul, type Matrix } from './matrix-multiplication';
import { dot, norm } from './shared';

// Least squares: the best-fitting line is a shadow. Dropping a point y onto
// the line along a gives the closest point p = (a·y / a·a)·a, and the gap left
// over, e = y − p, is at right angles to a. Fitting a line to data is the same
// drop in more dimensions: the data y can't be reached exactly by X·θ (one
// equation per point, two unknowns), so we take the closest point X·θ that
// can, the one whose leftover e = y − X·θ is at right angles to every column
// of X. Xᵀe = 0 rearranges into the normal equations XᵀX·θ = Xᵀy, a small
// square system we can solve.

export type LsqInput = { story: 'shadow'; a: Vec; y: Vec } | { story: 'line'; points: readonly Vec[] } | { story: 'quadratic'; points: readonly Vec[] };
export type Story = LsqInput['story'];

/** Shadow vectors stay in ±plane; data points in [0, data] on both axes. */
export const LIMITS = { plane: 4, data: 6, points: [3, 8] } as const;
/** How much the nudged line's slope is raised by. */
export const NUDGE = 0.1;
/** Below this a residual counts as 0. */
const ZERO = 1e-9;
/** On-screen size of one matrix cell, in px. */
const CELL_PX = 46;

const pseudocode = [
  'closest point on a’s line: p = t·a',
  't = a·y / a·a',
  'e = y − p;  e·a = 0',
  'X = [1 x]: a column of 1s, then x',
  'want X·θ ≈ y, with θ = (b, w)',
  'XᵀX·θ = Xᵀy   (the normal equations)',
  'solve for the weights θ',
  'e = y − X·θ;  Xᵀe = 0',
  'add a column x² to bend the fit',
];

// ───────────────────────────── the maths ─────────────────────────────

export const transposeOf = (A: Matrix): number[][] => (A[0] ?? []).map((_, j) => A.map((row) => row[j]));

/** Solves A·x = b by Gaussian elimination with partial pivoting; null when A has no inverse. */
export function solveSystem(A: Matrix, b: readonly number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[best][c])) best = r;
    if (Math.abs(M[best][c]) < 1e-12) return null;
    [M[c], M[best]] = [M[best], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}

/** The rows [1, x, x², …] of the design matrix for a polynomial of this degree. */
export const design = (xs: readonly number[], degree: number): number[][] => xs.map((x) => Array.from({ length: degree + 1 }, (_, k) => x ** k));

/** XᵀX and Xᵀy. */
export function normalEquations(X: Matrix, y: readonly number[]): { XtX: number[][]; Xty: number[] } {
  const Xt = transposeOf(X);
  return { XtX: matmul(Xt, X), Xty: Xt.map((col) => dot2(col, y)) };
}

const dot2 = (u: readonly number[], v: readonly number[]) => u.reduce((s, x, i) => s + x * v[i], 0);

/** The weights θ minimising |y − X·θ|²: the solution of XᵀX·θ = Xᵀy (null when the columns of X are dependent). */
export function lstsq(X: Matrix, y: readonly number[]): number[] | null {
  const { XtX, Xty } = normalEquations(X, y);
  return solveSystem(XtX, Xty);
}

/** The value of the polynomial with these weights (constant first) at x. */
export const predict = (w: readonly number[], x: number) => w.reduce((s, c, k) => s + c * x ** k, 0);
export const residuals = (points: readonly Vec[], w: readonly number[]) => points.map(([x, y]) => y - predict(w, x));
/** The sum of squared errors of a fit. */
export const sse = (points: readonly Vec[], w: readonly number[]) => residuals(points, w).reduce((s, e) => s + e * e, 0);
/** The best polynomial of a degree through the points, constant first. */
export const fitPoints = (points: readonly Vec[], degree: number) => lstsq(design(points.map((p) => p[0]), degree), points.map((p) => p[1]));

// ───────────────────────────── drawing helpers ─────────────────────────────

const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });
const LIT = 0.3;

function matrixImage(id: string, label: string, M: Matrix, opts: { values?: string[]; lit?: (i: number, j: number) => number; boxes?: ImageBox[] } = {}): ImagePart {
  const rows = M.length;
  const cols = M[0]?.length ?? 0;
  const pixels: number[] = [];
  const values: string[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      pixels.push(opts.lit?.(i, j) ?? 0);
      values.push(opts.values ? opts.values[i * cols + j] : fmt(M[i][j]));
    }
  return { kind: 'image', id, label, width: cols, height: rows, pixels, scale: 'signed', values, boxes: opts.boxes ?? [], size: cols * CELL_PX, matrix: true };
}
const column = (xs: readonly number[]): Matrix => xs.map((x) => [x]);
const hidden = (M: Matrix) => M.flat().map(() => '');

// ───────────────────────────── the shadow ─────────────────────────────

const EXTENT = LIMITS.plane + 0.5;

function* shadow(a: Vec, y: Vec): Generator<Frame<PlotState>> {
  const t = dot(a, y) / dot(a, a);
  const p = project(y, a);
  const e: Vec = [y[0] - p[0], y[1] - p[1]];
  const gap = norm(e);
  const handles: Handle[] = [
    { id: 'a', at: a, label: 'a, the direction of the line', tone: 1, step: 0.5, min: [-LIMITS.plane, -LIMITS.plane], max: [LIMITS.plane, LIMITS.plane] },
    { id: 'y', at: y, label: 'y, the point to drop', tone: 2, step: 0.5, min: [-LIMITS.plane, -LIMITS.plane], max: [LIMITS.plane, LIMITS.plane] },
  ];
  const pl = (label: string, shapes: Shape[]): PlanePart => ({
    kind: 'plane',
    id: 'plane',
    label,
    x: { min: -EXTENT, max: EXTENT, label: 'x' },
    y: { min: -EXTENT, max: EXTENT, label: 'y' },
    equal: true,
    shapes,
    handles,
  });
  const base: Shape[] = [
    { kind: 'line', id: 'span', through: [0, 0], dir: a, dashed: true, label: 'a’s line' },
    { kind: 'vector', id: 'a', from: [0, 0], to: a, tone: 1, label: 'a' },
    { kind: 'vector', id: 'y', from: [0, 0], to: y, tone: 2, label: 'y' },
  ];
  const vars = { 'a·y': dot(a, y), 'a·a': dot(a, a) };
  const at = (s: number): Vec => [s * a[0], s * a[1]];
  const gapTo = (s: number) => norm([y[0] - s * a[0], y[1] - s * a[1]]);
  const tries = [t - 1, t + 0.5];
  const tryShapes: Shape[] = tries.flatMap((s, k) => [
    { kind: 'point' as const, id: `try${k}`, at: at(s), mark: 'compare' as const, label: `t = ${fmt(s)}` },
    { kind: 'path' as const, id: `gap${k}`, points: [at(s), y], dashed: true, mark: 'compare' as const },
  ]);

  yield plotFrame([pl('Drop y onto the line along a', base), readouts([{ id: 'a', label: 'a', value: fmtVec(a), tone: 1 }, { id: 'y', label: 'y', value: fmtVec(y), tone: 2 }])], {
    line: 0,
    note: `The dashed line holds every multiple t·a of a = ${fmtVec(a)}. Which point on it is closest to y = ${fmtVec(y)}? Picture the shortest gap from y to the line. Drag a or y to change them.`,
    vars,
    checkpoint: askInOrder('At what angle does the shortest gap from y meet the line?', ['0°', '45°', '90°', 'It depends on y'], '90°'),
  });

  yield plotFrame(
    [
      pl('Two guesses: t·a for two values of t', [...base, ...tryShapes]),
      readouts(tries.map((s, k) => ({ id: `try${k}`, label: `gap from y to ${fmt(s)}·a`, value: fmt(gapTo(s), 3), mark: 'compare' as const }))),
    ],
    {
      line: 0,
      note: `A right angle. Any other point along the line is further away: here are two guesses, ${fmt(tries[0])}·a and ${fmt(tries[1])}·a, with gaps ${fmt(gapTo(tries[0]), 3)} and ${fmt(gapTo(tries[1]), 3)}. The closest point p = t·a sits where the gap meets the line square on, and the dot product finds it: t = a·y / a·a.`,
      vars,
      checkpoint: ask('What is t, so that p = t·a is the closest point?', fmt(t), [fmt(dot(a, y)), fmt(dot(a, y) / norm(a)), fmt(dot(y, y) / dot(a, a)), fmt(dot(a, a) / dot(a, y))]),
    },
  );

  yield plotFrame(
    [
      pl('p, the shadow of y on the line', [...base, { kind: 'point', id: 'p', at: p, mark: 'found', label: 'p', size: 'lg' }]),
      readouts([
        { id: 'ay', label: 'a·y', value: fmt(dot(a, y)) },
        { id: 'aa', label: 'a·a', value: fmt(dot(a, a)) },
        { id: 't', label: 't = a·y / a·a', value: fmt(t, 3) },
        { id: 'p', label: 'p = t·a', value: fmtVec(p, 3), mark: 'found' },
      ]),
    ],
    {
      line: 1,
      note: `t = a·y / a·a = ${fmt(dot(a, y))} / ${fmt(dot(a, a))} = ${fmt(t, 3)}, so p = ${fmt(t, 3)}·${fmtVec(a)} = ${fmtVec(p, 3)}. That is y's shadow on the line, the projection from the dot product lesson. What is left over is the gap e = y − p.`,
      vars: { ...vars, t },
      checkpoint: ask('What is e·a, the gap dotted with a?', '0', [fmt(dot(a, y)), fmt(dot(e, e)), fmt(-dot(a, a)), fmt(t)]),
    },
  );

  const s = 0.35;
  const ua: Vec = [a[0] / norm(a), a[1] / norm(a)];
  const ue: Vec = gap > ZERO ? [e[0] / gap, e[1] / gap] : [0, 0];
  const corner: Shape[] =
    gap > 0.4
      ? [{ kind: 'path', id: 'corner', points: [[p[0] + s * ua[0], p[1] + s * ua[1]], [p[0] + s * ua[0] + s * ue[0], p[1] + s * ua[1] + s * ue[1]], [p[0] + s * ue[0], p[1] + s * ue[1]]], faint: true }]
      : [];
  const eShape: Shape[] = gap > ZERO ? [{ kind: 'vector', id: 'e', from: p, to: y, mark: 'reject', label: 'e' }] : [];

  yield plotFrame(
    [
      pl('y = p + e, with e at right angles to a', [...base, { kind: 'point', id: 'p', at: p, mark: 'found', label: 'p', size: 'lg' }, ...eShape, ...corner]),
      readouts([
        { id: 'p', label: 'p', value: fmtVec(p, 3), mark: 'found' },
        { id: 'e', label: 'e = y − p', value: fmtVec(e, 3), mark: 'reject' },
        { id: 'ea', label: 'e·a', value: fmt(dot(e, a), 6) },
        { id: 'len', label: '|e|, the shortest gap', value: fmt(gap, 3) },
      ]),
    ],
    {
      line: 2,
      note:
        gap > ZERO
          ? `e = ${fmtVec(e, 3)} and e·a = ${fmt(dot(e, a), 6)}: the gap is at right angles to the line. Its length, ${fmt(gap, 3)}, is shorter than either guess. y splits into a part on the line, p, and a part with nothing along a, e.`
          : `y is already on the line, so p = y and the gap is 0. Drag y off the line to see the gap.`,
      vars: { ...vars, t },
      checkpoint: askInOrder('Now move y one whole a along the line, to y + a. What happens to the gap e?', ['It gets longer', 'It gets shorter', 'It stays the same'], 'It stays the same'),
    },
  );

  const y2: Vec = [y[0] + a[0], y[1] + a[1]];
  const p2 = project(y2, a);
  const e2: Vec = [y2[0] - p2[0], y2[1] - p2[1]];
  yield plotFrame(
    [
      pl('y + a has the same gap', [
        ...base,
        { kind: 'point', id: 'p', at: p, mark: 'found', label: 'p', size: 'lg' },
        ...eShape,
        { kind: 'vector', id: 'y2', from: [0, 0], to: y2, tone: 2, dashed: true, label: 'y + a' },
        { kind: 'point', id: 'p2', at: p2, mark: 'found', label: 'p + a' },
        ...(gap > ZERO ? [{ kind: 'vector' as const, id: 'e2', from: p2, to: y2, mark: 'reject' as const, label: 'e' }] : []),
      ]),
      readouts([
        { id: 'e', label: 'gap from y', value: fmtVec(e, 3), mark: 'reject' },
        { id: 'e2', label: 'gap from y + a', value: fmtVec(e2, 3), mark: 'reject' },
      ]),
    ],
    {
      line: 2,
      note: `It stays the same: moving along a only moves the shadow, by a. The gap e is the part of y that a can never explain. Fitting a line to data is this same drop: the data is y, the columns of a matrix X replace a, and the best fit is the shadow.`,
      vars: { ...vars, t },
    },
  );
}

// ───────────────────────────── fitting a line ─────────────────────────────

const DATA_MIN = -0.5;
const DATA_MAX = LIMITS.data + 0.5;

function dataPlane(label: string, points: readonly Vec[], shapes: Shape[]): PlanePart {
  return {
    kind: 'plane',
    id: 'plane',
    label,
    x: { min: DATA_MIN, max: DATA_MAX, label: 'x' },
    y: { min: DATA_MIN, max: DATA_MAX, label: 'y' },
    equal: true,
    shapes: [...shapes, ...points.map((pt, i) => ({ kind: 'point' as const, id: `pt${i}`, at: pt, size: 'md' as const }))],
    handles: points.map((pt, i) => ({ id: `p${i}`, at: pt, label: `Point ${i + 1}`, step: 0.5, min: [0, 0] as Vec, max: [LIMITS.data, LIMITS.data] as Vec })),
  };
}

/** The fitted curve, sampled across the plane (the plane clips what leaves it). */
function curve(id: string, w: readonly number[], mark: 'found' | 'compare', label?: string, dashed = false): Shape {
  const steps = w.length > 2 ? 48 : 1;
  const points: Vec[] = Array.from({ length: steps + 1 }, (_, k) => {
    const x = DATA_MIN + ((DATA_MAX - DATA_MIN) * k) / steps;
    return [x, predict(w, x)];
  });
  return { kind: 'path', id, points, mark, ...(label && { label }), dashed };
}

const gaps = (points: readonly Vec[], w: readonly number[], prefix = 'res'): Shape[] =>
  points.flatMap(([x, y], i) => {
    const at = predict(w, x);
    return Math.abs(y - at) > ZERO ? [{ kind: 'path' as const, id: `${prefix}${i}`, points: [[x, y], [x, at]] as Vec[], mark: 'reject' as const }] : [];
  });

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
/** “ + 3·x” or “ − 3·x”. */
const plus = (c: number, term: string) => `${c < 0 ? ' − ' : ' + '}${fmt(Math.abs(c), 3)}${term}`;

function* line(points: readonly Vec[]): Generator<Frame<PlotState>> {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const X = design(xs, 1);
  const { XtX, Xty } = normalEquations(X, ys);
  const w = solveSystem(XtX, Xty)!;
  const [b, slope] = w;
  const e = residuals(points, w);
  const exact = e.every((r) => Math.abs(r) < ZERO);
  const loss = sse(points, w);
  const nudged = [b, slope + NUDGE];
  const nudgedLoss = sse(points, nudged);
  const vars = { n };
  const xImg = () => matrixImage('X', `X (${n}×2)`, X, { lit: (_, j) => (j === 0 ? LIT / 2 : 0) });
  const yImg = () => matrixImage('y', `y (${n}×1)`, column(ys));
  const sxx = sum(xs.map((x) => x * x));
  const sxy = sum(points.map(([x, y]) => x * y));

  yield plotFrame([dataPlane(`${n} data points`, points, []), xImg(), yImg()], {
    line: 3,
    note: `We want a line ŷ = b + w·x through these ${n} points. Each point asks for b + w·xᵢ = yᵢ: ${n} equations, only 2 unknowns. As a matrix, X·θ = y with the weights θ = (b, w), where X has a column of 1s (for b) and a column of the x values (for w). Drag the points to change the data.`,
    vars,
    checkpoint: askInOrder(`Can all ${n} equations hold at once, so X·θ = y exactly?`, ['Yes', 'No'], exact ? 'Yes' : 'No'),
  });

  yield plotFrame([dataPlane(`${n} data points`, points, []), xImg(), yImg(), matrixImage('XtX', 'XᵀX (2×2)', XtX, { values: hidden(XtX) }), matrixImage('Xty', 'Xᵀy (2×1)', column(Xty), { values: hidden(column(Xty)) })], {
    line: 5,
    note: exact
      ? `Yes: these points happen to lie on one line, so the shadow of y is y itself. The recipe is the same either way: look for the X·θ closest to y, whose leftover e = y − X·θ is at right angles to every column of X. Xᵀe = 0 becomes XᵀX·θ = Xᵀy, the normal equations. Each entry of XᵀX is a column of X dotted with a column.`
      : `No: no line goes through every point. So find the X·θ closest to y, like the shadow: its leftover e = y − X·θ must be at right angles to every column of X, since X·θ can be any mix of them. Xᵀe = 0 becomes XᵀX·θ = Xᵀy, the normal equations. Each entry of XᵀX is a column of X dotted with a column.`,
    vars,
    checkpoint: ask('What is the top-left entry of XᵀX, the column of 1s dotted with itself?', fmt(n), [fmt(sum(xs)), fmt(sxx), fmt(sum(ys)), fmt(1)]),
  });

  yield plotFrame([dataPlane(`${n} data points`, points, []), xImg(), yImg(), matrixImage('XtX', 'XᵀX (2×2)', XtX), matrixImage('Xty', 'Xᵀy (2×1)', column(Xty), { values: hidden(column(Xty)) })], {
    line: 5,
    note: `XᵀX = [[${fmt(XtX[0][0])}, ${fmt(XtX[0][1])}], [${fmt(XtX[1][0])}, ${fmt(XtX[1][1])}]]: the count of points, the sum of the x values (twice), and the sum of the squares of the x values. Xᵀy dots each column of X with y.`,
    vars,
    checkpoint: ask('What is the bottom entry of Xᵀy, the x column dotted with y?', fmt(sxy), [fmt(sum(ys)), fmt(sum(xs) * sum(ys)), fmt(sxx), fmt(sum(xs))]),
  });

  yield plotFrame(
    [dataPlane(`${n} data points`, points, []), matrixImage('XtX', 'XᵀX (2×2)', XtX), matrixImage('Xty', 'Xᵀy (2×1)', column(Xty)), readouts([{ id: 'eq1', label: 'row 1', value: `${fmt(XtX[0][0])}b + ${fmt(XtX[0][1])}w = ${fmt(Xty[0])}` }, { id: 'eq2', label: 'row 2', value: `${fmt(XtX[1][0])}b + ${fmt(XtX[1][1])}w = ${fmt(Xty[1])}` }])],
    {
      line: 6,
      note: `Xᵀy = (${fmt(Xty[0])}, ${fmt(Xty[1])}): the sum of y, and the sum of x·y. Now XᵀX·θ = Xᵀy, with θ = (b, w), is two equations in two unknowns, a square system we can solve by elimination.`,
      vars,
      checkpoint: ask('What is the slope w of the best line?', fmt(slope), [fmt(b), fmt(sxy / sxx), fmt((ys[n - 1] - ys[0]) / (xs[n - 1] - xs[0] || 1)), fmt(slope + 1)]),
    },
  );

  yield plotFrame(
    [
      dataPlane('The best line and its residuals', points, [curve('fit', w, 'found', 'best'), ...gaps(points, w)]),
      matrixImage('e', `e = y − Xθ (${n}×1)`, column(e)),
      readouts([
        { id: 'b', label: 'b', value: fmt(b, 3), mark: 'found' },
        { id: 'w', label: 'w', value: fmt(slope, 3), mark: 'found' },
        { id: 'sum', label: '1s · e = Σe', value: fmt(sum(e), 6) },
        { id: 'xsum', label: 'x · e = Σx·e', value: fmt(sum(e.map((r, i) => r * xs[i])), 6) },
        { id: 'sse', label: 'squared error Σe²', value: fmt(loss, 3) },
      ]),
    ],
    {
      line: 7,
      note: `b = ${fmt(b, 3)} and w = ${fmt(slope, 3)}: the line ŷ = ${fmt(b, 3)}${plus(slope, '·x')}. The leftovers e are the residuals, drawn as gaps. Their dot product with each column of X is 0, just as e·a was for the shadow. Their squares add up to ${fmt(loss, 3)}.`,
      vars,
      checkpoint: askInOrder(`Raise the slope by ${fmt(NUDGE)}, to ${fmt(slope + NUDGE, 3)}. What happens to the squared error?`, ['It goes up', 'It goes down', 'It stays the same'], 'It goes up'),
    },
  );

  yield plotFrame(
    [
      dataPlane('The best line beats a nudged one', points, [curve('fit', w, 'found', 'best'), curve('nudged', nudged, 'compare', 'nudged', true), ...gaps(points, nudged, 'nres')]),
      readouts([
        { id: 'sse', label: 'squared error, best', value: fmt(loss, 3), mark: 'found' },
        { id: 'nsse', label: `squared error, w + ${fmt(NUDGE)}`, value: fmt(nudgedLoss, 3), mark: 'compare' },
      ]),
    ],
    {
      line: 7,
      note: `It goes up, to ${fmt(nudgedLoss, 3)}. Any change to b or w makes the squared error bigger, because X·θ is already the closest point to y that a line can reach. That is why this is called least squares: no other line has a smaller sum of squared residuals.`,
      vars,
    },
  );
}

// ───────────────────────────── bending the fit ─────────────────────────────

function* quadratic(points: readonly Vec[]): Generator<Frame<PlotState>> {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const lineW = fitPoints(points, 1)!;
  const lineLoss = sse(points, lineW);
  const X = design(xs, 2);
  const { XtX, Xty } = normalEquations(X, ys);
  const w = solveSystem(XtX, Xty)!;
  const loss = sse(points, w);
  const e = residuals(points, w);
  const better = loss < lineLoss - 1e-9;
  const vars = { n };
  const xImg = matrixImage('X', `X (${n}×3)`, X);

  yield plotFrame(
    [dataPlane('The best line through curved data', points, [curve('line', lineW, 'compare', 'line'), ...gaps(points, lineW)]), readouts([{ id: 'lsse', label: 'squared error, best line', value: fmt(lineLoss, 3), mark: 'compare' }])],
    {
      line: 8,
      note: `The best line through these ${n} points has a squared error of ${fmt(lineLoss, 3)}. A line can't bend, so give the model a third column, x², and fit ŷ = c₀ + c₁·x + c₂·x², a parabola. The recipe doesn't change.`,
      vars,
      checkpoint: ask('X gets a third column, x². What shape is XᵀX now?', '3×3', ['2×2', `3×${n}`, `${n}×3`, `${n}×${n}`]),
    },
  );

  yield plotFrame([dataPlane('The best line through curved data', points, [curve('line', lineW, 'compare', 'line')]), xImg, matrixImage('XtX', 'XᵀX (3×3)', XtX, { values: hidden(XtX) })], {
    line: 8,
    note: `3×3: one row and one column for each column of X. X now has the columns 1, x and x², and XᵀX dots each with each.`,
    vars,
    checkpoint: ask('What is the entry in row 1, column 3 of XᵀX: the 1s column dotted with the x² column?', fmt(sum(xs.map((x) => x * x))), [fmt(n), fmt(sum(xs)), fmt(sum(xs.map((x) => x ** 3))), fmt(sum(xs) ** 2)]),
  });

  yield plotFrame([dataPlane('The best line through curved data', points, [curve('line', lineW, 'compare', 'line')]), xImg, matrixImage('XtX', 'XᵀX (3×3)', XtX), matrixImage('Xty', 'Xᵀy (3×1)', column(Xty))], {
    line: 5,
    note: `The sum of the x² values. XᵀX·θ = Xᵀy, with θ = (c₀, c₁, c₂), is three equations in three unknowns, solved by elimination as before.`,
    vars,
    checkpoint: askInOrder('Compared with the best line, the best parabola’s squared error is…', ['Smaller', 'The same', 'Larger'], better ? 'Smaller' : 'The same'),
  });

  yield plotFrame(
    [
      dataPlane('The best parabola', points, [curve('line', lineW, 'compare', 'line', true), curve('fit', w, 'found', 'parabola'), ...gaps(points, w)]),
      readouts([
        { id: 'w', label: '(c₀, c₁, c₂)', value: `(${w.map((c) => fmt(c, 3)).join(', ')})`, mark: 'found' },
        { id: 'sse', label: 'squared error, parabola', value: fmt(loss, 3), mark: 'found' },
        { id: 'lsse', label: 'squared error, line', value: fmt(lineLoss, 3), mark: 'compare' },
        { id: 'xte', label: 'Xᵀe', value: `(${X[0].map((_, k) => fmt(sum(e.map((r, i) => r * X[i][k])), 6)).join(', ')})` },
      ]),
    ],
    {
      line: 7,
      note: better
        ? `ŷ = ${fmt(w[0], 3)}${plus(w[1], '·x')}${plus(w[2], '·x²')}. Its squared error, ${fmt(loss, 3)}, is smaller than the line's ${fmt(lineLoss, 3)}, and Xᵀe = 0 again: the residuals are at right angles to all three columns.`
        : `ŷ = ${fmt(w[0], 3)}${plus(w[1], '·x')}${plus(w[2], '·x²')}. These points lie on a line, so the parabola can do no better: c₂ is 0 and both squared errors are ${fmt(loss, 3)}. Xᵀe = 0 again.`,
      vars,
      checkpoint: askInOrder('Could the best parabola ever have a larger squared error than the best line?', ['Yes', 'No'], 'No'),
    },
  );

  yield plotFrame([dataPlane('The best parabola', points, [curve('fit', w, 'found', 'parabola'), ...gaps(points, w)]), matrixImage('e', `e = y − Xθ (${n}×1)`, column(e))], {
    line: 8,
    note: `No: a line is a parabola with c₂ = 0, so the best parabola is at least as good. More columns can only lower the squared error on the data you fit. That is not always better: a curve bent to every point can do worse on new data, which a later lesson on overfitting takes up.`,
    vars,
  });
}

function* run(input: LsqInput): Generator<Frame<PlotState>> {
  if (input.story === 'shadow') yield* shadow(input.a, input.y);
  else if (input.story === 'line') yield* line(input.points);
  else yield* quadratic(input.points);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const distinctX = (points: readonly Vec[]) => new Set(points.map((p) => p[0])).size;
/** The fewest distinct x values each story needs for one best fit. */
const NEEDS = { line: 2, quadratic: 3 } as const;

export function parseLsq(text: string): { value: LsqInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const xs = numbersIn(text);
  if (word === 'shadow') {
    if (xs.length !== 4) return { error: 'Give a and y, e.g. shadow 4 2, 1 3.' };
    const a: Vec = [xs[0], xs[1]];
    const y: Vec = [xs[2], xs[3]];
    if (![...a, ...y].every((v) => isHalf(v) && Math.abs(v) <= LIMITS.plane)) return { error: `Use halves from −${LIMITS.plane} to ${LIMITS.plane}.` };
    if (a[0] === 0 && a[1] === 0) return { error: 'a can’t be (0, 0): it has no direction.' };
    return { value: { story: 'shadow', a, y } };
  }
  if (word !== 'line' && word !== 'quadratic') return { error: 'Start with shadow, line or quadratic, e.g. line 1 1, 2 3, 3 2, 4 5, 5 4.' };
  const [lo, hi] = LIMITS.points;
  if (xs.length % 2 !== 0 || xs.length / 2 < lo || xs.length / 2 > hi) return { error: `Give ${lo} to ${hi} points as x y pairs.` };
  if (!xs.every((v) => isHalf(v) && v >= 0 && v <= LIMITS.data)) return { error: `Use halves from 0 to ${LIMITS.data}.` };
  const points: Vec[] = [];
  for (let i = 0; i < xs.length; i += 2) points.push([xs[i], xs[i + 1]]);
  if (distinctX(points) < NEEDS[word]) return { error: `Use at least ${NEEDS[word]} different x values, or there is no single best ${word === 'line' ? 'line' : 'parabola'}.` };
  return { value: { story: word, points } };
}

function format(input: LsqInput): string {
  const p = (v: Vec) => `${plain(v[0])} ${plain(v[1])}`;
  if (input.story === 'shadow') return `shadow ${p(input.a)}, ${p(input.y)}`;
  return `${input.story} ${input.points.map(p).join(', ')}`;
}

const snapIn = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x * 2) / 2));

export function dragLsq(input: LsqInput, id: string, to: Vec): LsqInput {
  if (input.story === 'shadow') {
    const t: Vec = [snapIn(to[0], -LIMITS.plane, LIMITS.plane), snapIn(to[1], -LIMITS.plane, LIMITS.plane)];
    if (id === 'a') return t[0] === 0 && t[1] === 0 ? input : { ...input, a: t };
    if (id === 'y') return { ...input, y: t };
    return input;
  }
  const i = Number(id.replace(/^p/, ''));
  if (!/^p\d+$/.test(id) || i >= input.points.length) return input;
  const t: Vec = [snapIn(to[0], 0, LIMITS.data), snapIn(to[1], 0, LIMITS.data)];
  const points = input.points.map((pt, k) => (k === i ? t : pt));
  return distinctX(points) < NEEDS[input.story] ? input : { ...input, points };
}

const example = (id: string, label: string, input: LsqInput) => ({ id, label, make: () => input, sized: false });

export const leastSquares = defineAlgorithm<LsqInput, PlotState>({
  kind: 'algorithm',
  slug: 'least-squares',
  view: 'plot',
  input: {
    examples: [
      example('shadow', 'The closest point is a shadow', { story: 'shadow', a: [4, 2], y: [1, 3] }),
      example('line', 'Fit a line to five points', {
        story: 'line',
        points: [
          [1, 1],
          [2, 3],
          [3, 2],
          [4, 5],
          [5, 4],
        ],
      }),
      example('outlier', 'One point far off the trend', {
        story: 'line',
        points: [
          [1, 1],
          [2, 2],
          [3, 3],
          [4, 4],
          [5, 0],
        ],
      }),
      example('quadratic', 'Bend the fit: a parabola', {
        story: 'quadratic',
        points: [
          [1, 5],
          [2, 2.5],
          [3, 1.5],
          [4, 2],
          [5, 3.5],
          [6, 6],
        ],
      }),
    ],
    custom: {
      label: 'shadow ax ay, yx yy; or line / quadratic and the points as x y pairs (halves, 0 to 6)',
      placeholder: 'e.g. line 1 1, 2 3, 3 2, 4 5, 5 4',
      parse: parseLsq,
      format,
    },
    drag: dragLsq,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Data points, guides and the line along a' },
    { tone: 1, label: 'a, the direction to drop onto' },
    { tone: 2, label: 'y, the point to drop' },
    { mark: 'found', label: 'The closest point, or the best fit' },
    { mark: 'reject', label: 'The gap left over: a residual' },
    { mark: 'compare', label: 'A guess or a rival fit, for comparison' },
  ],
  run,
  content: {
    idea: 'The best fit is a shadow. Dropping y onto the line along a gives the closest point p = (a·y / a·a)·a, and the leftover e = y − p is at right angles to a. Fitting a line to data is the same drop: the closest X·θ to y leaves residuals at right angles to every column of X, so XᵀX·θ = Xᵀy.',
    invariant: 'At the best fit Xᵀe = 0: the residuals dotted with every column of X are 0 (with a column of 1s, they add up to 0). No other weights give a smaller sum of squared residuals, and adding a column (x²) can never make it larger.',
    whenToUse: 'Fitting a line or curve to noisy measurements, linear regression with many features, calibrating sensors, trend lines in spreadsheets, and as the first step of many ML models. Solving the normal equations directly suits a few columns; libraries use more careful methods (QR, SVD) when columns are many or nearly dependent.',
    traits: [
      { label: 'Residuals ⟂ every column: Xᵀe = 0', good: null },
      { label: 'XᵀX·θ = Xᵀy: one small square system', good: true },
      { label: 'Squaring lets one far point pull the line', good: false },
    ],
    experiments: [
      { example: 'shadow', prompt: 'Drag y around. Can you make the gap e point along a? Where must y be for e = 0?' },
      { example: 'line', prompt: 'Drag one point straight up by 1. Predict which way the line tilts before you let go.' },
      { example: 'outlier', prompt: 'Drag the last point up onto the trend and watch the line straighten out.' },
      { example: 'quadratic', prompt: 'Line the points up exactly. What does c₂ become?' },
    ],
  },
});

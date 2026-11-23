import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { unitBall } from '@/algorithms/linear-algebra/norms';
import { contours, logLevels } from '@/viz/plot/contours';
import { askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, ContourShape, HeatmapShape, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Regularisation: ridge, lasso and a wiggly curve tamed. A model fitted by
// least squares chooses the weights with the lowest training error S(w), the
// total of the squared errors. Regularisation adds a charge for big weights:
// ridge minimises S(w) + λ‖w‖₂² (the squared L2 length), lasso S(w) + λ‖w‖₁
// (the L1 length). On a two-weight model the picture is a bowl of S meeting a
// ball of the penalty: the lowest point of the sum sits where a contour of S
// just touches the circle (ridge) or diamond (lasso) through it. A circle has
// no corners, so ridge shrinks both weights without ever reaching 0; a
// diamond's corners sit on the axes, so lasso sets weights exactly to 0. On a
// degree-9 curve through 10 noisy points, ridge calms the wiggles, and the
// validation error against λ makes a U.

// ───────────────────────────── two weights: the data and the bowl ─────────────────────────────

/**
 * Eight points with two features that rise and fall together. Every column
 * (x₁, x₂ and y) averages 0, so the model ŷ = w₁·x₁ + w₂·x₂ needs no intercept.
 */
export const X2: readonly (readonly [number, number])[] = [
  [-3, 0],
  [2, 3],
  [2, 0],
  [2, 2],
  [1, 0],
  [-1, -2],
  [0, 0],
  [-3, -3],
];
export const Y2: readonly number[] = [-5, 7, 3, 6, 1, -3, 0, -9];
export const N2 = X2.length;

/** XᵀX: column i of X dotted with column j. */
export const A2: readonly [readonly [number, number], readonly [number, number]] = (() => {
  const g = [
    [0, 0],
    [0, 0],
  ];
  for (const r of X2) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g[i][j] += r[i] * r[j];
  return [
    [g[0][0], g[0][1]],
    [g[1][0], g[1][1]],
  ] as const;
})();
/** Xᵀy: each column of X dotted with y. */
export const B2: Vec = [X2.reduce((s, r, k) => s + r[0] * Y2[k], 0), X2.reduce((s, r, k) => s + r[1] * Y2[k], 0)];

/** The training error: the total of the squared errors (w₁x₁ + w₂x₂ − y)² over the eight points. */
export function trainingError(w: Vec): number {
  let total = 0;
  for (let k = 0; k < N2; k++) total += (w[0] * X2[k][0] + w[1] * X2[k][1] - Y2[k]) ** 2;
  return total;
}

const solve2 = (m: readonly (readonly number[])[], v: Vec): Vec => {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return [(m[1][1] * v[0] - m[0][1] * v[1]) / det, (m[0][0] * v[1] - m[1][0] * v[0]) / det];
};

/** The least-squares weights ŵ, the lowest point of S. */
export const LEAST_SQUARES: Vec = solve2(A2, B2);
export const S_MIN = trainingError(LEAST_SQUARES);

/** Ridge's weights for λ: the w that solves (XᵀX + λI)w = Xᵀy. */
export function ridgeWeights(lam: number): Vec {
  return solve2(
    [
      [A2[0][0] + lam, A2[0][1]],
      [A2[1][0], A2[1][1] + lam],
    ],
    B2,
  );
}

export const l1 = (w: Vec) => Math.abs(w[0]) + Math.abs(w[1]);
export const l2 = (w: Vec) => Math.hypot(w[0], w[1]);
export const ridgeCost = (w: Vec, lam: number) => trainingError(w) + lam * (w[0] ** 2 + w[1] ** 2);
export const lassoCost = (w: Vec, lam: number) => trainingError(w) + lam * l1(w);

/**
 * Lasso's weights for λ, exactly. The lowest point of S(w) + λ‖w‖₁ has each
 * weight either 0 or of a fixed sign; for each choice of which are 0 and the
 * signs of the rest, the cost is a smooth bowl whose lowest point solves a
 * linear system. The answer is the choice whose solution keeps the signs it
 * assumed and whose zero weights are held there (S's slope along them is at
 * most λ): the cost is strictly convex, so only one choice passes, except
 * exactly at a corner of the path, where the cheapest is taken. A weight that
 * is 0 comes out as exactly 0.
 */
export function lassoWeights(lam: number): Vec {
  const candidates: Vec[] = [];
  for (const s1 of [-1, 0, 1])
    for (const s2 of [-1, 0, 1]) {
      let w: Vec;
      if (s1 === 0 && s2 === 0) w = [0, 0];
      else if (s2 === 0) w = [(2 * B2[0] - lam * s1) / (2 * A2[0][0]), 0];
      else if (s1 === 0) w = [0, (2 * B2[1] - lam * s2) / (2 * A2[1][1])];
      else w = solve2(A2, [B2[0] - (lam * s1) / 2, B2[1] - (lam * s2) / 2]);
      if ((s1 !== 0 && Math.sign(w[0]) !== s1) || (s2 !== 0 && Math.sign(w[1]) !== s2)) continue;
      // A weight held at 0 must stay there: S's slope along it is at most λ in size (else moving off 0 pays).
      const slope = (j: 0 | 1) => Math.abs(2 * (A2[j][0] * w[0] + A2[j][1] * w[1] - B2[j]));
      if ((s1 === 0 && slope(0) > lam) || (s2 === 0 && slope(1) > lam)) continue;
      candidates.push(w);
    }
  let best = candidates[0];
  for (const w of candidates) if (lassoCost(w, lam) < lassoCost(best, lam)) best = w;
  return best;
}

/** Shrink v towards 0 by t, stopping at 0: the soft-threshold. */
export const softThreshold = (v: number, t: number) => (v > t ? v - t : v < -t ? v + t : 0);

/**
 * Lasso by coordinate descent, a second way to the same answer: in turn, set
 * each weight to the best value with the other held, which is the
 * soft-threshold of what least squares would give it. Repeat until it settles.
 */
export function lassoByCoordinates(lam: number, sweeps = 2000): Vec {
  const w: [number, number] = [0, 0];
  for (let s = 0; s < sweeps; s++) {
    for (const j of [0, 1]) {
      const o = 1 - j;
      // S(w) = wᵀAw − 2bᵀw + yᵀy, so with w_o held: a_jj·w_j² − 2(b_j − a_jo·w_o)·w_j + …, plus λ|w_j|.
      w[j] = softThreshold(B2[j] - A2[j][o] * w[o], lam / 2) / A2[j][j];
    }
  }
  return w;
}

/** The λ at which lasso first sets w₂ to exactly 0, and the λ from which both weights are 0. */
function lassoBreak(which: 0 | 1): number {
  let lo = 0;
  let hi = 1024;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (lassoWeights(mid)[which] === 0) hi = mid;
    else lo = mid;
  }
  return hi;
}
export const LASSO_W2_ZERO = lassoBreak(1);
export const LASSO_ALL_ZERO = lassoBreak(0);

/** The λ values the two-weight stories step through, doubling after 1. */
export const W_LAMBDAS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
/** λ at a point t of the chart's axis: the ticks sit at whole t, λ doubles from tick 1 on. */
export const lambdaAt = (t: number) => (t <= 1 ? t : 2 ** (t - 1));
export const axisAt = (lam: number) => (lam <= 1 ? lam : 1 + Math.log2(lam));

// ───────────────────────────── the curve: degree 9 through 10 points ─────────────────────────────

/** The degree of the curve: 10 weights w₀ … w₉. */
export const DEGREE = 9;
export type Datum = { x: number; y: number };
const xsFrom = (start: number, count: number) => Array.from({ length: count }, (_, i) => Math.round((start + 0.2 * i) * 100) / 100);
/** 10 training points near y = sin(πx), noise fixed once and written out, so every engine agrees. */
export const TRAIN: readonly Datum[] = xsFrom(-0.9, 10).map((x, i) => ({ x, y: [-0.43, -0.57, -1.35, -0.82, -0.87, 0.51, 0.29, 0.99, 0.33, 0.06][i] }));
/** 9 validation points from the same curve with their own noise, kept out of the fit. */
export const VALIDATION: readonly Datum[] = xsFrom(-0.8, 9).map((x, i) => ({ x, y: [-0.43, -1.11, -0.69, -0.59, -0.4, 0.9, 1.06, 0.93, 0.32][i] }));

/** [1, x, x², …, x⁹], by repeated multiplication (Math.pow may differ between engines). */
export function powers(x: number): number[] {
  const out = [1];
  for (let j = 1; j <= DEGREE; j++) out.push(out[j - 1] * x);
  return out;
}

/** x with Mx = v, by elimination with partial pivoting. */
function gauss(M: number[][], v: number[]): number[] {
  const n = M.length;
  const a = M.map((row, i) => [...row, v[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(a[r][k]) > Math.abs(a[p][k])) p = r;
    [a[k], a[p]] = [a[p], a[k]];
    for (let r = k + 1; r < n; r++) {
      const f = a[r][k] / a[k][k];
      for (let c = k; c <= n; c++) a[r][c] -= f * a[k][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = a[i][n];
    for (let j = i + 1; j < n; j++) s -= a[i][j] * x[j];
    x[i] = s / a[i][i];
  }
  return x;
}

/**
 * The curve's weights for λ: the lowest point of the total squared error on
 * the training points plus λ(w₁² + … + w₉²). w₀, the curve's height, is not
 * charged, so (XᵀX + λD)w = Xᵀy with D the identity less its first 1.
 */
export function curveWeights(lam: number, data: readonly Datum[] = TRAIN): number[] {
  const rows = data.map((d) => powers(d.x));
  const p = DEGREE + 1;
  const M = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0) + (i === j && i > 0 ? lam : 0)));
  const v = Array.from({ length: p }, (_, i) => rows.reduce((s, r, k) => s + r[i] * data[k].y, 0));
  return gauss(M, v);
}

export const curveAt = (w: readonly number[], x: number) => powers(x).reduce((s, p, j) => s + p * w[j], 0);
export const meanSquaredError = (w: readonly number[], data: readonly Datum[]) => data.reduce((s, d) => s + (curveAt(w, d.x) - d.y) ** 2, 0) / data.length;
export const curvePenalty = (w: readonly number[]) => w.slice(1).reduce((s, v) => s + v * v, 0);
export const meanOf = (data: readonly Datum[]) => data.reduce((s, d) => s + d.y, 0) / data.length;

/** The λ values the curve story steps through, from 0 and then by tens from a millionth. */
export const C_LAMBDAS = [0, 1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.1, 1, 10, 100] as const;
const C_TICKS = ['0', '10⁻⁶', '10⁻⁵', '10⁻⁴', '0.001', '0.01', '0.1', '1', '10', '100'];
/** Every λ's fit, worked out once. */
export const CURVE_FITS: readonly { lam: number; w: number[]; train: number; validation: number }[] = C_LAMBDAS.map((lam) => {
  const w = curveWeights(lam);
  return { lam, w, train: meanSquaredError(w, TRAIN), validation: meanSquaredError(w, VALIDATION) };
});
/** Where on the grid the validation error is lowest. */
export const BEST_CURVE = CURVE_FITS.reduce((b, f, k) => (f.validation < CURVE_FITS[b].validation ? k : b), 0);

/** λ as the notes write it: 0.000001 rather than 1e-6. */
export function fmtLambda(lam: number): string {
  if (lam === 0 || lam >= 0.001) return fmt(lam, 3);
  return `0.${'0'.repeat(-Math.round(Math.log10(lam)) - 1)}1`;
}

// ───────────────────────────── input ─────────────────────────────

export type RegInput = { story: 'ridge' | 'lasso' | 'curve'; lam: number };
export type Story = RegInput['story'];
const STORIES: Story[] = ['ridge', 'lasso', 'curve'];
export const gridOf = (story: Story): readonly number[] => (story === 'curve' ? C_LAMBDAS : W_LAMBDAS);

const pseudocode = [
  'S(w) = Σ (ŷᵢ − yᵢ)²  (training error)',
  'ridge: minimise S(w) + λ‖w‖₂²',
  'lasso: minimise S(w) + λ‖w‖₁',
  'λ = 0: plain least squares',
  'ridge: (XᵀX + λI)w = Xᵀy',
  'lasso: soft-threshold each wⱼ',
  'choose λ by validation error',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const W_BOX: { x: Axis; y: Axis } = { x: { min: -1.2, max: 2.4, label: 'w₁' }, y: { min: -1.2, max: 2.4, label: 'w₂' } };
const WASH_CELLS = 36;
let bowlCache: { contours: ContourShape; wash: HeatmapShape } | null = null;

/** S's contour map and a wash deepest at its lowest point, computed once and shared by every frame. */
function bowl() {
  if (!bowlCache) {
    const b = W_BOX;
    const f = (u: number, v: number) => trainingError([u, v]);
    const samples: number[] = [];
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) samples.push(f(b.x.min + ((b.x.max - b.x.min) * i) / 40, b.y.min + ((b.y.max - b.y.min) * j) / 40));
    samples.sort((p, q) => p - q);
    const hi = samples[Math.floor(samples.length * 0.85)];
    const depth = (v: number) => Math.round(100 * Math.max(0, 1 - Math.log1p(Math.max(0, v - S_MIN)) / Math.log1p(hi - S_MIN))) / 100;
    const values: number[] = [];
    for (let r = 0; r < WASH_CELLS; r++) {
      const c = b.y.max - ((r + 0.5) * (b.y.max - b.y.min)) / WASH_CELLS;
      for (let k = 0; k < WASH_CELLS; k++) values.push(depth(f(b.x.min + ((k + 0.5) * (b.x.max - b.x.min)) / WASH_CELLS, c)));
    }
    bowlCache = {
      contours: { kind: 'contours', id: 'contours', levels: contours(f, b, logLevels(S_MIN, hi, 12)) },
      wash: { kind: 'heatmap', id: 'wash', x0: b.x.min, x1: b.x.max, y0: b.y.min, y1: b.y.max, cols: WASH_CELLS, rows: WASH_CELLS, values, scale: { kind: 'depth' } },
    };
  }
  return bowlCache;
}

const r2 = (p: Vec): Vec => [round(p[0], 2), round(p[1], 2)];

/** The contour of S through w: an ellipse round ŵ, from the eigenvectors of XᵀX. */
export function contourThrough(w: Vec, n = 96): Vec[] {
  const d = trainingError(w) - S_MIN;
  if (d <= 1e-9) return [];
  const [[a, c], [, b]] = A2;
  const half = (a + b) / 2;
  const gap = Math.sqrt(((a - b) / 2) ** 2 + c * c);
  const mu = [half + gap, half - gap];
  const v1: Vec = (() => {
    const len = Math.hypot(c, mu[0] - a);
    return [c / len, (mu[0] - a) / len];
  })();
  const v2: Vec = [-v1[1], v1[0]];
  const [r1, rr2] = [Math.sqrt(d / mu[0]), Math.sqrt(d / mu[1])];
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return r2([LEAST_SQUARES[0] + r1 * Math.cos(t) * v1[0] + rr2 * Math.sin(t) * v2[0], LEAST_SQUARES[1] + r1 * Math.cos(t) * v1[1] + rr2 * Math.sin(t) * v2[1]]);
  });
}

/** The L2 circle or L1 diamond of radius r round the origin. */
const ball = (p: 1 | 2, r: number, id = 'ball'): Shape[] =>
  r < 0.005 ? [] : [{ kind: 'path', id, points: unitBall(p, 144).map((q) => r2([q[0] * r, q[1] * r])), closed: true, tone: 3, label: p === 2 ? `‖w‖₂ = ${fmt(r)}` : `‖w‖₁ = ${fmt(r)}` }];

/** The point on the circle of radius r nearest ŵ: straight out from the origin towards it. */
export const nearestOnCircle = (r: number): Vec => [(LEAST_SQUARES[0] * r) / l2(LEAST_SQUARES), (LEAST_SQUARES[1] * r) / l2(LEAST_SQUARES)];

type Kind = 'ridge' | 'lasso';
export const weightsFor = (kind: Kind, lam: number): Vec => (kind === 'ridge' ? ridgeWeights(lam) : lassoWeights(lam));

/** The path of the weights as λ goes from 0 to `upto`, sampled finely, with lasso's corners included. */
function pathTo(kind: Kind, upto: number): { lam: number; w: Vec }[] {
  const ts: number[] = [];
  const end = axisAt(upto);
  for (let k = 0; k <= 180; k++) ts.push((end * k) / 180);
  const lams = ts.map(lambdaAt);
  if (kind === 'lasso') for (const brk of [LASSO_W2_ZERO, LASSO_ALL_ZERO]) if (brk < upto) lams.push(brk);
  return [...new Set(lams)].sort((p, q) => p - q).map((lam) => ({ lam, w: weightsFor(kind, lam) }));
}

function weightPlane(label: string, shapes: Shape[]): PlanePart {
  const s = bowl();
  return {
    kind: 'plane',
    id: 'plane',
    label,
    ...W_BOX,
    equal: true,
    shapes: [s.wash, s.contours, { kind: 'point', id: 'origin', at: [0, 0], size: 'sm', label: '0' }, { kind: 'point', id: 'ls', at: r2(LEAST_SQUARES), mark: 'found', size: 'md', label: 'ŵ' }, ...shapes],
    handles: [],
  };
}

const PATH_X: Axis = { min: -0.3, max: 9.3, ticks: W_LAMBDAS.map((lam, k) => ({ at: k, label: String(lam) })) };
const PATH_Y: Axis = { min: -0.25, max: 1.9, label: 'weight' };

/** The weights against λ, drawn up to `upto`, with the λ handle at the chosen value. */
/** The λ handle sits only on the frame that draws the chosen λ (null elsewhere), so it always marks the input's own value. */
function pathChart(kind: Kind, upto: number | null, chosen: number | null): PlanePart {
  const path = upto === null ? [] : pathTo(kind, upto);
  const line = (j: 0 | 1): Shape[] =>
    path.length < 2 ? [] : [{ kind: 'path', id: `w${j + 1}`, points: path.map(({ lam, w }): Vec => [round(axisAt(lam), 3), round(w[j], 3)]), tone: j === 0 ? 1 : 2 }];
  return {
    kind: 'plane',
    id: 'path',
    // No x-axis label: λ is named in the caption, and the weights' lines end on the axis, bottom right.
    label: 'The weights w₁ and w₂ as λ grows (λ doubling from 1)',
    x: PATH_X,
    y: PATH_Y,
    equal: false,
    shapes: [
      ...line(0),
      ...line(1),
      { kind: 'label', id: 'n1', at: [2.5, round(LEAST_SQUARES[0] + 0.13, 2)], text: 'w₁' },
      { kind: 'label', id: 'n2', at: [0.35, round(LEAST_SQUARES[1] - 0.15, 2)], text: 'w₂' },
      ...(upto === null ? [] : (() => {
        const w = weightsFor(kind, upto);
        const t = round(axisAt(upto), 3);
        return [
          { kind: 'point', id: 'at1', at: [t, round(w[0], 3)], tone: 1, size: 'md' } as Shape,
          { kind: 'point', id: 'at2', at: [t, round(w[1], 3)], tone: 2, size: 'md' } as Shape,
        ];
      })()),
    ],
    handles: chosen === null ? [] : [{ id: 'lambda', at: [W_LAMBDAS.indexOf(chosen as (typeof W_LAMBDAS)[number]), 0], label: 'λ', mark: 'key', step: 1, min: [0, 0], max: [W_LAMBDAS.length - 1, 0] }],
  };
}

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const S2 = (v: number) => fmt(v, 2);

type FrameOptions = Omit<Parameters<typeof plotFrame>[1], 'stats'>;

/** What a two-weight frame reads out at λ. */
function valuesAt(kind: Kind, lam: number, more: Readout[] = []): Readout[] {
  const w = weightsFor(kind, lam);
  const pen = kind === 'ridge' ? lam * (w[0] ** 2 + w[1] ** 2) : lam * l1(w);
  return [
    { id: 'lambda', label: 'λ', value: String(lam), mark: 'key' },
    { id: 'w', label: kind === 'ridge' ? 'ridge’s weights ŵ(λ)' : 'lasso’s weights ŵ(λ)', value: fmtVec(w), mark: 'key' },
    { id: 's', label: 'training error S', value: S2(trainingError(w)) },
    { id: 'pen', label: kind === 'ridge' ? 'penalty λ‖w‖₂²' : 'penalty λ‖w‖₁', value: S2(pen) },
    ...more,
  ];
}

/** ŵ(λ) on the plane: the point, the ball through it, the contour of S through it, and its path from λ = 0. */
function atLambda(kind: Kind, lam: number, touching = true): Shape[] {
  const w = weightsFor(kind, lam);
  const ring = touching ? contourThrough(w) : [];
  const path = pathTo(kind, lam);
  return [
    ...(path.length > 1 ? [{ kind: 'path', id: 'trail', points: path.map(({ w: p }) => r2(p)), mark: 'path', dashed: true } as Shape] : []),
    ...(touching ? ball(kind === 'ridge' ? 2 : 1, kind === 'ridge' ? l2(w) : l1(w)) : []),
    ...(ring.length ? [{ kind: 'path', id: 'level', points: ring, closed: true, tone: 4, label: `S = ${S2(trainingError(w))}` } as Shape] : []),
    { kind: 'point', id: 'now', at: r2(w), mark: 'key', size: 'lg', label: 'ŵ(λ)' },
  ];
}

// ───────────────────────────── story 1: ridge ─────────────────────────────

export const CIRCLE_CHOICES = ['Where the circle meets the straight line from 0 to ŵ', 'Where a contour of S just touches the circle', 'Where the circle crosses the w₁ axis'];
export const LINE_CHOICES = ['Yes: ridge scales both weights down by the same factor', 'No: w₂ keeps a bigger share of the weight', 'No: w₂ keeps a smaller share of the weight'];
/** w₂/w₁, the share the second weight keeps. */
export const shareOf = (w: Vec) => w[1] / w[0];
export const YES_NO = ['Yes', 'No'];
export const SHAPE_CHOICES = ['Circles', 'Diamonds', 'Squares'];
const RIDGE_LOOK = 16;

function* ridgeStory(chosen: number): Generator<Frame<PlotState>> {
  const ls = LEAST_SQUARES;
  let fits = 0;
  const frame = (parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { fits } });
  const vars = (lam: number): Record<string, number> => {
    const w = ridgeWeights(lam);
    return { λ: lam, w1: round(w[0], 3), w2: round(w[1], 3), S: round(trainingError(w), 3) };
  };
  const circles: Shape[] = [0.5, 1, 1.5, 2].map((r) => ({ kind: 'path', id: `c${r}`, points: unitBall(2, 96).map((q) => r2([q[0] * r, q[1] * r])), closed: true, faint: true }));

  // 0: the bowl and the least-squares weights.
  yield frame([weightPlane('The training error S over (w₁, w₂), and circles of equal ‖w‖₂', circles), pathChart('ridge', null, null), readouts([{ id: 'ls', label: 'least squares ŵ', value: fmtVec(ls), mark: 'found' }, { id: 's', label: 'its training error S', value: S2(S_MIN) }])], {
    line: 0,
    note: `Predict y from two features with ŷ = w₁·x₁ + w₂·x₂, fitted to ${N2} points. Every column averages 0, so no intercept is needed. The training error S(w) is the total of the squared errors over the points: a bowl over the weights (w₁, w₂). The two features rise and fall together, so the bowl is a tilted valley. Its lowest point, the least-squares weights ŵ = ${fmtVec(ls)}, has S = ${S2(S_MIN)}. Ridge regression adds a charge for big weights: it minimises S(w) + λ(w₁² + w₂²) = S(w) + λ‖w‖₂², where λ ≥ 0 sets how much the charge counts. The faint circles are weights of equal L2 length, so of equal charge.`,
    vars: { λ: 0, w1: round(ls[0], 3), w2: round(ls[1], 3), S: round(S_MIN, 3) },
    checkpoint: askInOrder(`Ridge's weights at λ = ${RIDGE_LOOK} lie on one of these circles, the one as long as they are. Where on that circle?`, CIRCLE_CHOICES, CIRCLE_CHOICES[1]),
  });

  // 1: λ = 1.
  fits = 1;
  const w1 = ridgeWeights(1);
  yield frame([weightPlane('Ridge with λ = 1', atLambda('ridge', 1, false)), pathChart('ridge', 1, null), readouts(valuesAt('ridge', 1, [{ id: 'sls', label: 'S at ŵ', value: S2(S_MIN), mark: 'found' }]))], {
    line: 1,
    note: `Where a contour of S just touches it. Every weight on the circle pays the same charge, so ridge takes the one with the lowest S, and a contour that crossed the circle would leave lower ground on it. At λ = 1 ridge's lowest point is ${fmtVec(w1)}, where S = ${S2(trainingError(w1))}, a little above ${S2(S_MIN)} at ŵ (ŵ has the lowest S of all, so any charge raises S), and the charge is 1 × (${fmt(w1[0])}² + ${fmt(w1[1])}²) = ${S2(w1[0] ** 2 + w1[1] ** 2)}, down from ${S2(ls[0] ** 2 + ls[1] ** 2)} at ŵ.`,
    vars: vars(1),
    checkpoint: askInOrder(`Will ŵ(${RIDGE_LOOK}) lie on the straight line from ŵ to the origin?`, LINE_CHOICES, LINE_CHOICES[1]),
  });

  // 2: λ = 16, the circle and the contour touching.
  fits = 2;
  const w16 = ridgeWeights(RIDGE_LOOK);
  const near = nearestOnCircle(l2(w16));
  yield frame(
    [
      weightPlane(`Ridge with λ = ${RIDGE_LOOK}: a contour of S touching the circle`, [...atLambda('ridge', RIDGE_LOOK), { kind: 'point', id: 'near', at: r2(near), size: 'sm', label: 'on the line to ŵ' }]),
      pathChart('ridge', RIDGE_LOOK, null),
      readouts(valuesAt('ridge', RIDGE_LOOK, [{ id: 'r', label: '‖w‖₂, the circle’s radius', value: S2(l2(w16)), tone: 3 }, { id: 'snear', label: 'S where the circle meets the line to ŵ', value: S2(trainingError(near)) }, { id: 'share', label: `w₂/w₁ (${fmt(shareOf(ls))} at ŵ)`, value: S2(shareOf(w16)) }])),
    ],
    {
      line: 1,
      note: `No: ŵ(${RIDGE_LOOK}) = ${fmtVec(w16)}, where w₂/w₁ is ${fmt(shareOf(w16))} against ${fmt(shareOf(ls))} at ŵ. On the circle through it, of radius ${S2(l2(w16))}, the contour S = ${S2(trainingError(w16))} just touches. The circle's point on the straight line to ŵ, ${fmtVec(near)}, has S = ${S2(trainingError(near))}: the valley is tilted, so heading straight for the origin is not lowest. The two features move together, so ridge leans towards sharing the weight between them.`,
      vars: vars(RIDGE_LOOK),
      checkpoint: askInOrder('Keep raising λ. Will w₂ become exactly 0 at some λ?', YES_NO, 'No'),
    },
  );

  // 3: the whole path, up to λ = 256.
  fits = 3;
  const top = W_LAMBDAS[W_LAMBDAS.length - 1];
  const wTop = ridgeWeights(top);
  yield frame([weightPlane(`Ridge’s path as λ grows to ${top}`, atLambda('ridge', top)), pathChart('ridge', top, null), readouts(valuesAt('ridge', top))], {
    line: 4,
    note: `No. As λ doubles up to ${top}, both weights shrink towards 0 along a curve, but neither gets there: at λ = ${top} they are ${fmtVec(wTop)}. Ridge's weights solve (XᵀX + λI)w = Xᵀy, which has a zero weight only by coincidence, and as λ grows they shrink like 1/λ, never all the way. In the picture, the circle is round: its point on the w₁ axis is nothing special, so the contour touches it there only by luck. Ridge shrinks weights; it doesn't remove them.`,
    vars: vars(top),
    checkpoint: askInOrder('Lasso charges λ(|w₁| + |w₂|) instead. What shape are its level lines, the weights with the same |w₁| + |w₂|?', SHAPE_CHOICES, SHAPE_CHOICES[1]),
  });

  // 4: the chosen λ.
  fits = 4;
  const wc = ridgeWeights(chosen);
  yield frame([weightPlane(`Ridge with λ = ${chosen}`, atLambda('ridge', chosen)), pathChart('ridge', top, chosen), readouts(valuesAt('ridge', chosen, [{ id: 'total', label: 'S + penalty', value: S2(ridgeCost(wc, chosen)) }]))], {
    line: chosen === 0 ? 3 : 4,
    note: `Diamonds: the L1 ball, as in lengths and distances. This run's λ is ${chosen}: drag it along the chart. ${
      chosen === 0
        ? `With no charge, ridge is plain least squares: ŵ = ${fmtVec(wc)}.`
        : `Ridge's weights are ${fmtVec(wc)}, with S = ${S2(trainingError(wc))} and a charge of ${S2(chosen * (wc[0] ** 2 + wc[1] ** 2))}, a total of ${S2(ridgeCost(wc, chosen))}. No other weights make that total smaller.`
    } The bigger λ, the shorter the weights and the worse the fit to these ${N2} points: whether that helps on new points is for a validation set to say.`,
    vars: vars(chosen),
  });
}

// ───────────────────────────── story 2: lasso ─────────────────────────────

export const FALL_CHOICES = ['w₁, the bigger weight', 'w₂', 'Both by the same amount'];
export const TOUCH_CHOICES = ['In the middle of a flat side', 'At a corner, on the w₁ axis', 'At the diamond’s point nearest ŵ'];
export const W1_CHOICES = ['Yes, at some λ', 'No, it only gets closer'];
const LASSO_STEPS = [16, 64, 128] as const;

function* lassoStory(chosen: number): Generator<Frame<PlotState>> {
  const ls = LEAST_SQUARES;
  let fits = 0;
  const frame = (parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { fits } });
  const vars = (lam: number): Record<string, number> => {
    const w = lassoWeights(lam);
    return { λ: lam, w1: round(w[0], 3), w2: round(w[1], 3), S: round(trainingError(w), 3) };
  };
  const diamonds: Shape[] = [0.5, 1, 1.5, 2].map((r) => ({ kind: 'path', id: `d${r}`, points: unitBall(1, 144).map((q) => r2([q[0] * r, q[1] * r])), closed: true, faint: true }));
  const [a, b, c] = LASSO_STEPS;

  // 0: the bowl and the diamonds.
  yield frame([weightPlane('The training error S over (w₁, w₂), and diamonds of equal ‖w‖₁', diamonds), pathChart('lasso', null, null), readouts([{ id: 'ls', label: 'least squares ŵ', value: fmtVec(ls), mark: 'found' }, { id: 's', label: 'its training error S', value: S2(S_MIN) }])], {
    line: 2,
    note: `The same ${N2} points and the same bowl S(w), lowest at the least-squares weights ŵ = ${fmtVec(ls)}. Lasso charges for big weights by their sizes rather than their squares: it minimises S(w) + λ(|w₁| + |w₂|) = S(w) + λ‖w‖₁, the L1 length, the city-block distance from the origin. The faint diamonds are weights of equal L1 length, so of equal charge.`,
    vars: { λ: 0, w1: round(ls[0], 3), w2: round(ls[1], 3), S: round(S_MIN, 3) },
    checkpoint: askInOrder(`Raise λ from 0 to ${a}. Which weight will have fallen further from ŵ?`, FALL_CHOICES, FALL_CHOICES[1]),
  });

  // 1: λ = 16.
  fits = 1;
  const wa = lassoWeights(a);
  yield frame([weightPlane(`Lasso with λ = ${a}`, atLambda('lasso', a)), pathChart('lasso', a, null), readouts(valuesAt('lasso', a, [{ id: 'r', label: '‖w‖₁, the diamond’s size', value: S2(l1(wa)), tone: 3 }]))], {
    line: 2,
    note: `w₂: from ${fmt(ls[1])} to ${fmt(wa[1])}, while w₁ went from ${fmt(ls[0])} to ${fmt(wa[0])}. (At λ = 0 nothing is charged, so lasso starts at ŵ, plain least squares.) At λ = ${a} its lowest point is ${fmtVec(wa)}, with S = ${S2(trainingError(wa))}. Every weight on the diamond through it pays the same charge, so lasso has picked, from that diamond, the weights with the lowest S: where the contour S = ${S2(trainingError(wa))} just touches it, here on a flat side.`,
    vars: vars(a),
    checkpoint: askInOrder('Keep raising λ. Will w₂ become exactly 0 at some λ?', YES_NO, 'Yes'),
  });

  // 2: λ = 64.
  fits = 2;
  const wb = lassoWeights(b);
  yield frame([weightPlane(`Lasso with λ = ${b}`, atLambda('lasso', b)), pathChart('lasso', b, null), readouts(valuesAt('lasso', b, [{ id: 'r', label: '‖w‖₁, the diamond’s size', value: S2(l1(wb)), tone: 3 }]))], {
    line: 2,
    note: `At λ = ${b} lasso's weights are ${fmtVec(wb)}: w₂ keeps falling fast, from ${fmt(wa[1])} to ${fmt(wb[1])}, while w₁ slips from ${fmt(wa[0])} to ${fmt(wb[0])}. The two features carry much the same information, so the fit loses little when w₁ stands in for w₂, and lasso, which charges every unit of either weight the same λ, shrinks w₂ hardest.`,
    vars: vars(b),
    checkpoint: askInOrder('When w₂ reaches 0, where will the contour of S touch the diamond?', TOUCH_CHOICES, TOUCH_CHOICES[1]),
  });

  // 3: λ = 128: w₂ is exactly 0.
  fits = 3;
  const wc = lassoWeights(c);
  yield frame([weightPlane(`Lasso with λ = ${c}: the contour meets a corner`, atLambda('lasso', c)), pathChart('lasso', c, null), readouts(valuesAt('lasso', c, [{ id: 'zero', label: 'w₂ became 0 at λ', value: S2(LASSO_W2_ZERO) }]))], {
    line: 5,
    note: `Yes: w₂ became exactly 0 at λ = ${S2(LASSO_W2_ZERO)} and stays there, so at λ = ${c} the weights are ${fmtVec(wc)}. The diamond's corner on the w₁ axis pokes into the valley, and the contour S = ${S2(trainingError(wc))} touches the diamond right at that corner. Why exactly 0? Moving w₂ off 0 by a little h costs λ·|h| in charge, a fixed price per unit however small h is, and buys at most a slope's worth of fit. Once λ is above that slope, w₂ stays at 0. (A square, ridge's w₂², costs almost nothing for a small h, so ridge never stops there.)`,
    vars: vars(c),
    checkpoint: askInOrder('Raise λ further. Will w₁ become exactly 0 too?', W1_CHOICES, W1_CHOICES[0]),
  });

  // 4: the whole path, up to 256.
  fits = 4;
  const top = W_LAMBDAS[W_LAMBDAS.length - 1];
  const rTop = ridgeWeights(top);
  yield frame([weightPlane(`Lasso’s path as λ grows to ${top}`, atLambda('lasso', top)), pathChart('lasso', top, null), readouts(valuesAt('lasso', top, [{ id: 'zero1', label: 'w₁ became 0 at λ', value: S2(LASSO_ALL_ZERO) }, { id: 'ridge', label: `ridge’s weights at λ = ${top}`, value: fmtVec(rTop) }]))], {
    line: 5,
    note: `Yes: w₁ became exactly 0 at λ = ${S2(LASSO_ALL_ZERO)}, and from there on both weights are 0: the charge outweighs anything the fit gains. Across the weight plane, lasso's path is straight pieces with corners, one wherever a weight leaves the model. Ridge at λ = ${top} still has ${fmtVec(rTop)}: smaller, but both in use. Lasso picks features; ridge shrinks them all.`,
    vars: vars(top),
  });

  // 5: the chosen λ.
  fits = 5;
  const wx = lassoWeights(chosen);
  const used = wx.filter((v) => v !== 0).length;
  yield frame([weightPlane(`Lasso with λ = ${chosen}`, atLambda('lasso', chosen)), pathChart('lasso', top, chosen), readouts(valuesAt('lasso', chosen, [{ id: 'total', label: 'S + penalty', value: S2(lassoCost(wx, chosen)) }]))], {
    line: chosen === 0 ? 3 : 2,
    note: `This run's λ is ${chosen}: drag it along the chart. Lasso's weights are ${fmtVec(wx)}, ${used === 2 ? 'both in use' : used === 1 ? 'one of them exactly 0' : 'both exactly 0'}, with S = ${S2(trainingError(wx))}${chosen ? ` and a charge of ${S2(chosen * l1(wx))}` : ''}. Between ${S2(LASSO_W2_ZERO)} and ${S2(LASSO_ALL_ZERO)} it keeps only feature 1, a simpler model that is easier to read.`,
    vars: vars(chosen),
  });
}

// ───────────────────────────── story 3: the curve ─────────────────────────────

export const UPDOWN_CHOICES = ['Up', 'Down', 'It stays at 0'];
export const TINY_CHOICES = ['Hardly: λ is tiny', 'A lot: the weights are huge, so λ·w² is not tiny'];
export const FURTHER_CHOICES = ['Yes: more λ, less overfitting', 'No: it rises again'];
export const FLAT_CHOICES = ['A flat line at the mean of the training ys', 'A flat line at y = 0', 'The λ = 1 curve, only smoother'];

const DATA_X: Axis = { min: -1, max: 1, label: 'x' };
const DATA_Y: Axis = { min: -2, max: 2, label: 'y' };
const BAR_FLOOR = -4;
const BAR_Y: Axis = { min: BAR_FLOOR, max: 4, label: 'size |wⱼ| (log scale)', ticks: [-4, -2, 0, 2, 4].map((k) => ({ at: k, label: ['0.0001', '0.01', '1', '100', '10000'][(k + 4) / 2] })) };
const BAR_X: Axis = { min: -0.6, max: 9.6, ticks: Array.from({ length: DEGREE + 1 }, (_, j) => ({ at: j, label: `w${'₀₁₂₃₄₅₆₇₈₉'[j]}` })) };
const ERR_FLOOR = -2;
const ERR_Y: Axis = { min: ERR_FLOOR, max: 1, label: 'mean squared error (log scale)', ticks: [-2, -1, 0, 1].map((k) => ({ at: k, label: ['0.01', '0.1', '1', '10'][k + 2] })) };
const ERR_X: Axis = { min: -0.3, max: 9.3, ticks: C_TICKS.map((label, k) => ({ at: k, label })) };
export const logError = (v: number) => round(Math.max(ERR_FLOOR, Math.log10(Math.max(v, 1e-12))), 3);

function curveShapes(w: readonly number[]): Shape[] {
  const points = Array.from({ length: 161 }, (_, i): Vec => {
    const x = -1 + i / 80;
    return [round(x, 3), round(Math.max(-5, Math.min(5, curveAt(w, x))), 2)];
  });
  return [{ kind: 'path', id: 'curve', points, mark: 'key' }];
}

function dataPlane(w: readonly number[] | null, label: string): PlanePart {
  return {
    kind: 'plane',
    id: 'data',
    label,
    x: DATA_X,
    y: DATA_Y,
    equal: false,
    shapes: [
      ...(w ? curveShapes(w) : []),
      ...TRAIN.map((d, i): Shape => ({ kind: 'point', id: `t${i}`, at: [d.x, d.y], tone: 1, size: 'md' })),
      ...VALIDATION.map((d, i): Shape => ({ kind: 'point', id: `v${i}`, at: [d.x, d.y], tone: 2, size: 'sm' })),
    ],
    handles: [],
  };
}

function barsPlane(w: readonly number[], label: string): PlanePart {
  return {
    kind: 'plane',
    id: 'weights',
    label,
    x: BAR_X,
    y: BAR_Y,
    equal: false,
    shapes: [
      {
        kind: 'bars',
        id: 'sizes',
        bars: w.map((v, j): Bar => ({ id: `b${j}`, x0: j - 0.32, x1: j + 0.32, y0: BAR_FLOOR, y: round(Math.max(BAR_FLOOR, Math.log10(Math.max(Math.abs(v), 1e-12))), 3), ...(j === 0 ? { tone: 3 } : {}) })),
      },
    ],
    handles: [],
  };
}

/** The error chart: training and validation error at the λ values visited so far, as dots, or as lines once every λ has been. */
function errorChart(seen: readonly number[], chosen: number | null, lines = false): PlanePart {
  const dots = (which: 'train' | 'validation', tone: 1 | 2): Shape[] =>
    lines
      ? [{ kind: 'path', id: `${which}-line`, points: CURVE_FITS.map((f, k): Vec => [k, logError(f[which])]), tone, dots: true }]
      : seen.map((k): Shape => ({ kind: 'point', id: `${which}${k}`, at: [k, logError(CURVE_FITS[k][which])], tone, size: which === 'train' ? 'md' : 'sm' }));
  return {
    kind: 'plane',
    id: 'errors',
    label: 'Training and validation error against λ (λ by tens from a millionth)',
    x: ERR_X,
    y: ERR_Y,
    equal: false,
    shapes: [
      ...dots('train', 1),
      ...dots('validation', 2),
      ...(lines
        ? [
            { kind: 'label', id: 'tl', at: [8.2, round(logError(CURVE_FITS[8].train) - 0.25, 2)], text: 'training' } as Shape,
            { kind: 'label', id: 'vl', at: [1.3, round(logError(CURVE_FITS[1].validation) + 0.2, 2)], text: 'validation' } as Shape,
          ]
        : []),
    ],
    handles: chosen === null ? [] : [{ id: 'lambda', at: [C_LAMBDAS.indexOf(chosen as (typeof C_LAMBDAS)[number]), 0], label: 'λ', mark: 'key', step: 1, min: [0, 0], max: [C_LAMBDAS.length - 1, 0] }],
  };
}

/** The biggest charged weight (w₁ to w₉): its size and which one it is. */
export function biggest(w: readonly number[]): { j: number; size: number } {
  let j = 1;
  for (let k = 2; k < w.length; k++) if (Math.abs(w[k]) > Math.abs(w[j])) j = k;
  return { j, size: Math.abs(w[j]) };
}
const sub = (j: number) => '₀₁₂₃₄₅₆₇₈₉'[j];
const E3 = (v: number) => fmt(v, 3);

function curveValues(k: number, more: Readout[] = []): Readout[] {
  const f = CURVE_FITS[k];
  const big = biggest(f.w);
  return [
    { id: 'lambda', label: 'λ', value: fmtLambda(f.lam), mark: 'key' },
    { id: 'train', label: 'training error (mean of 10)', value: E3(f.train), tone: 1 },
    { id: 'validation', label: 'validation error (mean of 9)', value: E3(f.validation), tone: 2 },
    { id: 'big', label: 'biggest charged weight', value: `w${sub(big.j)} = ${fmt(f.w[big.j], big.size >= 100 ? 0 : 2)}` },
    ...more,
  ];
}

function* curveStory(chosen: number): Generator<Frame<PlotState>> {
  let fits = 0;
  const frame = (parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { fits } });
  const kOf = (lam: number) => C_LAMBDAS.indexOf(lam as (typeof C_LAMBDAS)[number]);
  const vars = (k: number): Record<string, number> => ({ λ: CURVE_FITS[k].lam, train: round(CURVE_FITS[k].train, 4), validation: round(CURVE_FITS[k].validation, 4) });
  const view = (k: number, seen: number[], dataLabel: string, more: Readout[] = [], lines = false, handle = false) => [
    dataPlane(CURVE_FITS[k].w, dataLabel),
    barsPlane(CURVE_FITS[k].w, `The sizes of the 10 weights at λ = ${fmtLambda(CURVE_FITS[k].lam)} (w₀ is not charged)`),
    errorChart(seen, handle ? chosen : null, lines),
    readouts(curveValues(k, more)),
  ];
  const f0 = CURVE_FITS[0];
  const big0 = biggest(f0.w);

  // 0: least squares threads every point.
  fits = 1;
  yield frame(view(0, [0], 'Degree 9 through 10 training points, λ = 0'), {
    line: 3,
    note: `Fit a curve of degree ${DEGREE}, ŷ = w₀ + w₁x + w₂x² + … + w₉x⁹, to ${TRAIN.length} training points (the larger dots). Ten weights for ten points: least squares, λ = 0, threads the curve through every point, so the training error is ${E3(f0.train)}. Between the points it swings wildly, and it misses the ${VALIDATION.length} validation points (the smaller dots), kept out of the fit, by a mean squared error of ${E3(f0.validation)}. To swing like that its weights are huge: the biggest is w${sub(big0.j)} = ${fmt(f0.w[big0.j], 0)}.`,
    vars: vars(0),
    checkpoint: askInOrder('Ridge charges for big weights. With any λ above 0, will the training error go up or down?', UPDOWN_CHOICES, UPDOWN_CHOICES[0]),
  });

  // 1: the charge, before any λ is tried.
  const tiny = C_LAMBDAS[1];
  yield frame(view(0, [0], 'Degree 9 through 10 training points, λ = 0', [{ id: 'penalty', label: 'w₁² + … + w₉² here', value: fmt(curvePenalty(f0.w), 0) }]), {
    line: 1,
    note: `Up: at λ = 0 the training error is already 0, the least it can be, and any other weights fit the training points worse. Ridge minimises the total squared error over the training points plus λ(w₁² + … + w₉²). It leaves w₀ alone: w₀ only lifts the whole curve up or down, and charging it would pull the curve towards y = 0 for no reason. Here w₁² + … + w₉² is ${fmt(curvePenalty(f0.w), 0)}.`,
    vars: vars(0),
    checkpoint: askInOrder(`Try λ = ${fmtLambda(tiny)}, a millionth. Will the curve change much?`, TINY_CHOICES, TINY_CHOICES[1]),
  });

  // 2: a millionth.
  fits = 2;
  const f1 = CURVE_FITS[1];
  yield frame(view(1, [0, 1], `λ = ${fmtLambda(tiny)}`), {
    line: 1,
    note: `A lot. With weights in the thousands, their squares add up to millions, so even a millionth of them is a charge the fit notices. At λ = ${fmtLambda(tiny)} the biggest weight is down to ${fmt(biggest(f1.w).size, 0)}, the wild swings calm, and the validation error falls from ${E3(f0.validation)} to ${E3(f1.validation)}. The training error rose, from 0 to ${E3(f1.train)}: the curve no longer goes through every point.`,
    vars: vars(1),
  });

  // 3: the best λ on the grid.
  fits = 3;
  const kb = BEST_CURVE;
  const fb = CURVE_FITS[kb];
  const kNext = kOf(1);
  yield frame(view(kb, [0, 1, kb], `λ = ${fmtLambda(fb.lam)}`), {
    line: 6,
    note: `At λ = ${fmtLambda(fb.lam)} the curve is a gentle wave, its biggest weight ${fmt(biggest(fb.w).size, 2)}. The training error has crept up to ${E3(fb.train)}, and the validation error is down to ${E3(fb.validation)}: smaller weights, a smoother curve, better guesses at points it never saw.`,
    vars: vars(kb),
    checkpoint: askInOrder(`Raise λ to ${fmtLambda(C_LAMBDAS[kNext])}. Will the validation error be lower than ${E3(fb.validation)}?`, FURTHER_CHOICES, CURVE_FITS[kNext].validation < fb.validation ? FURTHER_CHOICES[0] : FURTHER_CHOICES[1]),
  });

  // 4: λ = 1, too much.
  fits = 4;
  const fn = CURVE_FITS[kNext];
  const kTop = C_LAMBDAS.length - 1;
  yield frame(view(kNext, [0, 1, kb, kNext], `λ = ${fmtLambda(fn.lam)}`), {
    line: 6,
    note: `No: at λ = ${fmtLambda(fn.lam)} the validation error is back up to ${E3(fn.validation)}, and the training error to ${E3(fn.train)}. The charge now outweighs the fit: the curve is too flat to follow the rise and fall of the points. That is underfitting, high bias in the words of overfitting and bias–variance, and a bigger λ only makes it worse.`,
    vars: vars(kNext),
    checkpoint: askInOrder(`At λ = ${fmtLambda(C_LAMBDAS[kTop])} the charge squeezes w₁ to w₉ almost to 0. What is left?`, FLAT_CHOICES, FLAT_CHOICES[0]),
  });

  // 5: λ = 100: almost flat, at the mean.
  fits = 5;
  const ft = CURVE_FITS[kTop];
  yield frame(view(kTop, [0, 1, kb, kNext, kTop], `λ = ${fmtLambda(ft.lam)}`, [{ id: 'w0', label: 'w₀', value: fmt(ft.w[0], 3), tone: 3 }, { id: 'mean', label: 'mean of the training ys', value: fmt(meanOf(TRAIN), 3) }]), {
    line: 1,
    note: `A flat line at the mean: the biggest of w₁ to w₉ is ${fmt(biggest(ft.w).size, 3)} in size, and w₀, which is not charged, settles at ${fmt(ft.w[0], 3)}, the mean of the training ys to three places: the best constant guess. Had w₀ been charged too, the line would sink towards y = 0. Validation error: ${E3(ft.validation)}.`,
    vars: vars(kTop),
  });

  // 6: every λ.
  fits = C_LAMBDAS.length;
  yield frame(view(kb, C_LAMBDAS.map((_, k) => k), `λ = ${fmtLambda(fb.lam)}, the lowest validation error`, [], true), {
    line: 6,
    note: `Every λ from 0 to ${fmtLambda(ft.lam)}. The training error only ever rises with λ, from 0 to ${E3(ft.train)}. The validation error falls from ${E3(f0.validation)}, bottoms out at ${E3(fb.validation)} at λ = ${fmtLambda(fb.lam)}, and rises again to ${E3(ft.validation)}: a U. Too little charge overfits, too much underfits. λ is chosen like the degree in overfitting and bias–variance: by the validation error, never by the training error, which always prefers λ = 0.`,
    vars: vars(kb),
  });

  // 7: the chosen λ.
  const kc = kOf(chosen);
  yield frame(view(kc, C_LAMBDAS.map((_, k) => k), `λ = ${fmtLambda(chosen)}`, [], true, true), {
    line: 1,
    note: `This run's λ is ${fmtLambda(chosen)}: drag it along the error chart. The training error is ${E3(CURVE_FITS[kc].train)} and the validation error ${E3(CURVE_FITS[kc].validation)}${kc === BEST_CURVE ? ', the lowest of any λ here' : kc < BEST_CURVE ? `, above the lowest, ${E3(fb.validation)}: the curve still overfits` : `, above the lowest, ${E3(fb.validation)}: the curve underfits`}.`,
    vars: vars(kc),
  });
}

function* run(input: RegInput): Generator<Frame<PlotState>> {
  if (input.story === 'ridge') yield* ridgeStory(input.lam);
  else if (input.story === 'lasso') yield* lassoStory(input.lam);
  else yield* curveStory(input.lam);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

export function parseRegularisation(text: string): { value: RegInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as Story;
  if (!STORIES.includes(story)) return { error: 'Start with ridge, lasso or curve, then λ, e.g. ridge lambda 16, or curve lambda 0.01.' };
  const xs = numbersIn(text);
  const grid = gridOf(story);
  const list = story === 'curve' ? '0, 0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10 or 100' : W_LAMBDAS.join(', ');
  if (xs.length !== 1) return { error: `Give one λ, e.g. ${story} lambda ${story === 'curve' ? '0.01' : '16'}.` };
  const lam = grid.find((g) => Math.abs(g - xs[0]) <= 1e-12 + 1e-9 * g);
  if (lam === undefined) return { error: `λ is one of ${list}.` };
  return { value: { story, lam } };
}

export function formatRegularisation(input: RegInput): string {
  return `${input.story} lambda ${input.story === 'curve' ? fmtLambda(input.lam) : input.lam}`;
}

export function dragRegularisation(input: RegInput, handle: string, to: Vec): RegInput {
  if (handle !== 'lambda') return input;
  const grid = gridOf(input.story);
  return { ...input, lam: grid[snap(to[0], 1, 0, grid.length - 1)] };
}

const example = (id: string, label: string, input: RegInput) => ({ id, label, make: () => input, sized: false });

export const regularisation = defineAlgorithm<RegInput, PlotState>({
  kind: 'algorithm',
  slug: 'regularisation',
  view: 'plot',
  input: {
    examples: [
      example('ridge', 'Ridge: a charge on w₁² + w₂²', { story: 'ridge', lam: 32 }),
      example('lasso', 'Lasso: a charge on |w₁| + |w₂|', { story: 'lasso', lam: 32 }),
      example('curve', 'Ridge on a degree-9 curve', { story: 'curve', lam: 0.01 }),
    ],
    custom: {
      label: 'ridge or lasso with λ (0, 1, 2, 4, … 256), or curve with λ (0, 0.000001, … 100)',
      placeholder: 'e.g. ridge lambda 16, or curve lambda 0.01',
      parse: parseRegularisation,
      format: formatRegularisation,
    },
    drag: dragRegularisation,
  },
  pseudocode,
  stats: [{ key: 'fits', label: 'Fits worked out' }],
  legend: [
    { neutral: 'Contours of the training error S; the weights’ sizes' },
    { mark: 'key', label: 'The weights at the current λ, the fitted curve, and λ you drag' },
    { mark: 'found', label: 'The least-squares weights ŵ, the lowest S' },
    { mark: 'path', label: 'The path of the weights as λ grows' },
    { tone: 1, label: 'w₁; the training points (larger dots) and training error' },
    { tone: 2, label: 'w₂; the validation points (smaller dots) and validation error' },
    { tone: 3, label: 'The outline of equal charge through the weights; w₀, which is not charged' },
    { tone: 4, label: 'The contour of S through the weights' },
  ],
  run,
  content: {
    idea: 'Regularisation adds a charge for big weights to the training error: λ‖w‖₂² for ridge, λ‖w‖₁ for lasso. Its strength λ is a knob set by the validation error.',
    invariant: 'Ridge’s and lasso’s weights at λ are the least-squares weights at λ = 0, and S at them never falls as λ grows. Ridge shrinks every weight smoothly and sets none exactly to 0; lasso’s path is straight pieces, and once λ is large enough it sets weights exactly to 0, all of them from λ = 2·max|Xᵀy|.',
    whenToUse: 'Whenever a model has more freedom than its data can pin down: many features, features that move together, or a flexible curve. Ridge (weight decay in neural networks) for steadier weights; lasso when you also want a short list of the features that matter. Centre or scale the features first, and leave the intercept uncharged.',
    traits: [
      { label: 'Trades a little training error for smaller weights', good: true },
      { label: 'Ridge has a formula; lasso needs a short search', good: null },
      { label: 'Lasso picks features; ridge keeps them all', good: null },
      { label: 'λ must be chosen on validation data', good: false },
    ],
    experiments: [
      { example: 'ridge', prompt: 'Drag λ from 0 to 256. Does the circle through the weights ever touch a contour on an axis?' },
      { example: 'lasso', prompt: 'Drag λ between 64 and 128. Where does w₂ leave the model, and which corner of the diamond is the contour touching then?' },
      { example: 'curve', prompt: 'Drag λ along the error chart. Where is the validation error lowest, and what does the curve look like either side of it?' },
    ],
  },
});

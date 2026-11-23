import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Overfitting, validation and bias–variance (B7 of the math and ML path).
// Polynomials of rising degree are fitted by least squares to 10 noisy points
// from a smooth curve. Training error can only fall as the degree rises (each
// degree can do whatever the one before could), down to 0 at degree 9, where
// 10 weights pass through the 10 points. Error on validation points, kept out
// of fitting, falls and then rises: a U, underfitting on the left and
// overfitting on the right. Refitting on many training sets dealt from the
// same curve shows why: low degrees miss the curve the same way every time
// (bias), high degrees chase each set's noise (variance). k-fold
// cross-validation scores a degree when there is no data to spare: every point
// is scored once, by the one model that never trained on it.

// ───────────────────────────── the data ─────────────────────────────

/** The curve every point comes from, y = sin(2.5x) + 0.6x² − 0.3. In real life nobody knows it. */
export const truth = (x: number) => Math.sin(2.5 * x) + 0.6 * x * x - 0.3;
export const TRUE_CURVE = 'y = sin(2.5x) + 0.6x² − 0.3';
/** The noise's standard deviation. */
export const NOISE = 0.2;
const DATA_SEED = 2368;
export const MAX_DEGREE = 9;
export const DEGREES: readonly number[] = Array.from({ length: MAX_DEGREE + 1 }, (_, d) => d);

export type Datum = { x: number; y: number };

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Irwin–Hall: four uniforms, centred and scaled to spread 1. Pure arithmetic, so every engine agrees. */
const noise = (u: () => number) => (u() + u() + u() + u() - 2) * Math.sqrt(3);

/** The 10 training x's, evenly spread from −1 to 1 (to hundredths). */
export const TRAIN_X: readonly number[] = Array.from({ length: 10 }, (_, i) => r2(-1 + (2 * i) / 9));

/** A training set: the same 10 x's, new noise. */
export const noisyAt = (xs: readonly number[], u: () => number) => xs.map((x) => r2(truth(x) + NOISE * noise(u)));

/**
 * The fixed data, all from one generator: 10 training points, 40 validation
 * points, 20 points for k-fold cross-validation, and 40 test points.
 */
export const { TRAIN, VALID, POOL, TEST } = (() => {
  const u = createRng(DATA_SEED);
  const at = (xs: readonly number[]): Datum[] => {
    const ys = noisyAt(xs, u);
    return xs.map((x, i) => ({ x, y: ys[i] }));
  };
  /** `count` points at random x's: every x first, then every y. */
  const scattered = (count: number) => at(Array.from({ length: count }, () => r2(-1 + 2 * u())));
  const TRAIN = at(TRAIN_X);
  const VALID = scattered(40);
  const POOL = scattered(20);
  const TEST = scattered(40);
  return { TRAIN, VALID, POOL, TEST } as { TRAIN: readonly Datum[]; VALID: readonly Datum[]; POOL: readonly Datum[]; TEST: readonly Datum[] };
})();

// ───────────────────────────── fitting polynomials ─────────────────────────────

/** The rows [1, x, x², …, x^degree]: the design matrix of a polynomial fit. */
export const polyFeatures = (xs: readonly number[], degree: number): number[][] => xs.map((x) => Array.from({ length: degree + 1 }, (_, j) => x ** j));

/**
 * The least-squares weights w₀ … w_d of y ≈ w₀ + w₁x + … + w_d·x^d, by
 * Householder QR on the design matrix (no XᵀX, whose rounding would spoil the
 * high degrees). With d + 1 = n it interpolates the n points.
 */
export function fitPoly(xs: readonly number[], ys: readonly number[], degree: number): number[] {
  const n = xs.length;
  const m = degree + 1;
  if (m > n) throw new Error(`degree ${degree} needs at least ${m} points, not ${n}`);
  const A = polyFeatures(xs, degree);
  const b = [...ys];
  for (let k = 0; k < m; k++) {
    let norm = 0;
    for (let i = k; i < n; i++) norm += A[i][k] * A[i][k];
    norm = Math.sqrt(norm);
    const alpha = A[k][k] > 0 ? -norm : norm;
    const v = new Array<number>(n).fill(0);
    for (let i = k; i < n; i++) v[i] = A[i][k];
    v[k] -= alpha;
    let vv = 0;
    for (let i = k; i < n; i++) vv += v[i] * v[i];
    if (vv === 0) continue;
    for (let j = k; j < m; j++) {
      let s = 0;
      for (let i = k; i < n; i++) s += v[i] * A[i][j];
      s = (2 * s) / vv;
      for (let i = k; i < n; i++) A[i][j] -= s * v[i];
    }
    let s = 0;
    for (let i = k; i < n; i++) s += v[i] * b[i];
    s = (2 * s) / vv;
    for (let i = k; i < n; i++) b[i] -= s * v[i];
  }
  const w = new Array<number>(m).fill(0);
  for (let k = m - 1; k >= 0; k--) {
    let s = b[k];
    for (let j = k + 1; j < m; j++) s -= A[k][j] * w[j];
    w[k] = s / A[k][k];
  }
  return w;
}

/** w₀ + w₁x + … by Horner's rule. */
export const evalPoly = (w: readonly number[], x: number) => {
  let s = 0;
  for (let j = w.length - 1; j >= 0; j--) s = s * x + w[j];
  return s;
};

export const fitTo = (data: readonly Datum[], degree: number) =>
  fitPoly(
    data.map((d) => d.x),
    data.map((d) => d.y),
    degree,
  );

/** The mean squared error of a curve on some points. */
export function mseOn(w: readonly number[], data: readonly Datum[]): number {
  let total = 0;
  for (const d of data) total += (evalPoly(w, d.x) - d.y) ** 2;
  return total / data.length;
}

/** The fit of every degree to the training points, and its errors on the training, validation and test points. */
export const FITS: readonly number[][] = DEGREES.map((d) => fitTo(TRAIN, d));
export const TRAIN_ERR: readonly number[] = FITS.map((w) => mseOn(w, TRAIN));
export const VALID_ERR: readonly number[] = FITS.map((w) => mseOn(w, VALID));
/** The degree with the lowest of some errors (the first, on a tie). */
export const argmin = (v: readonly number[]) => v.reduce((best, e, d) => (e < v[best] ? d : best), 0);
export const BEST = argmin(VALID_ERR);
export const TEST_ERR = mseOn(FITS[BEST], TEST);
/** A curve's true average squared error on new points: its squared miss of the true curve averaged over x from −1 to 1, plus the noise's average square. */
export const trueError = (w: readonly number[]) => GRID.reduce((s, x) => s + (evalPoly(w, x) - truth(x)) ** 2, 0) / GRID.length + NOISE * NOISE;

// ───────────────────────────── bias and variance ─────────────────────────────

/** Where curves are drawn and bias and variance averaged: x from −1 to 1 in steps of 0.025. */
export const GRID: readonly number[] = Array.from({ length: 81 }, (_, k) => round(-1 + k / 40, 3));
/** How many training sets the bias–variance story deals. */
export const SETS = 20;

/** `count` training sets at the same 10 x's, each with new noise from the seed. */
export function resample(seed: number, count = SETS): number[][] {
  const u = createRng(seed);
  return Array.from({ length: count }, () => noisyAt(TRAIN_X, u));
}

export type Spread = { bias2: number; variance: number; mean: number[] };

/** Bias² and variance of some fits, measured: the average fit against the true curve, and the fits around their average, both averaged over the grid. */
export function spreadOf(fits: readonly (readonly number[])[]): Spread {
  const mean = GRID.map((x) => fits.reduce((s, w) => s + evalPoly(w, x), 0) / fits.length);
  let bias2 = 0;
  let variance = 0;
  GRID.forEach((x, k) => {
    bias2 += (mean[k] - truth(x)) ** 2;
    variance += fits.reduce((s, w) => s + (evalPoly(w, x) - mean[k]) ** 2, 0) / fits.length;
  });
  return { bias2: bias2 / GRID.length, variance: variance / GRID.length, mean };
}

/**
 * Bias² and variance over every possible training set, exactly. A fit is a
 * weighted sum of the y's, so the average fit is the fit to the noiseless
 * curve, and a fit's variance at x is σ² times the sum of the squared weights
 * the y's get there (the fits to each single y = 1, the rest 0).
 */
const exactCache = new Map<number, { bias2: number; variance: number }>();
export function exactSpread(degree: number): { bias2: number; variance: number } {
  let got = exactCache.get(degree);
  if (!got) {
    const mean = fitPoly(TRAIN_X, TRAIN_X.map(truth), degree);
    const units = TRAIN_X.map((_, i) => fitPoly(TRAIN_X, TRAIN_X.map((_, j) => (i === j ? 1 : 0)), degree));
    let bias2 = 0;
    let variance = 0;
    for (const x of GRID) {
      bias2 += (evalPoly(mean, x) - truth(x)) ** 2;
      variance += NOISE * NOISE * units.reduce((s, w) => s + evalPoly(w, x) ** 2, 0);
    }
    got = { bias2: bias2 / GRID.length, variance: variance / GRID.length };
    exactCache.set(degree, got);
  }
  return got;
}
export const totalOf = (d: number) => exactSpread(d).bias2 + exactSpread(d).variance;
/** The degree where bias² + variance is smallest. */
export const BV_BEST = argmin(DEGREES.map(totalOf));

/** The bias–variance story's two degrees. */
export const LOW = 1;
export const HIGH = 9;

// ───────────────────────────── k-fold cross-validation ─────────────────────────────

/**
 * The k folds of the indices 0 … n − 1: contiguous and in order, sizes ⌊n/k⌋,
 * the first n mod k folds taking one more. Every index is in exactly one fold.
 */
export function kFold(n: number, k: number): number[][] {
  const folds: number[][] = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    const size = Math.floor(n / k) + (f < n % k ? 1 : 0);
    folds.push(Array.from({ length: size }, (_, i) => start + i));
    start += size;
  }
  return folds;
}

export const K_RANGE = [2, 10] as const;
export const DEFAULT_K = 5;
export const N_POOL = 20;
/** The degree the k-fold story draws its first rounds with. */
export const FOLD_DEGREE = 3;

/** One round: the model fitted on every fold but `fold`, and its squared errors on that fold. */
export function foldRound(k: number, fold: number, degree: number): { w: number[]; train: number[]; held: number[]; errors: number[] } {
  const folds = kFold(N_POOL, k);
  const held = folds[fold];
  const train = POOL.map((_, i) => i).filter((i) => !held.includes(i));
  const w = fitTo(
    train.map((i) => POOL[i]),
    degree,
  );
  return { w, train, held, errors: held.map((i) => (evalPoly(w, POOL[i].x) - POOL[i].y) ** 2) };
}

/** The cross-validated error of a degree: every point's squared error from the model that didn't train on it, averaged. */
export function cvError(k: number, degree: number): number {
  let total = 0;
  for (let f = 0; f < k; f++) for (const e of foldRound(k, f, degree).errors) total += e;
  return total / N_POOL;
}
export const cvErrors = (k: number) => DEGREES.map((d) => cvError(k, d));

/** Falls at every step to its lowest point, then rises at every step. */
export function isU(v: readonly number[]): boolean {
  const low = argmin(v);
  return v.every((e, d) => d === 0 || (d <= low ? e < v[d - 1] : e > v[d - 1]));
}

// ───────────────────────────── input ─────────────────────────────

export type OverfitInput = { story: 'degree'; degree: number } | { story: 'bias-variance'; degree: number; seed: number } | { story: 'k-fold'; k: number };
export type Story = OverfitInput['story'];
const STORIES: Story[] = ['degree', 'bias-variance', 'k-fold'];

const pseudocode = [
  'fit degree d: least squares on train',
  'train error ← MSE on the train set',
  'valid error ← MSE on the valid set',
  'pick the d with lowest valid error',
  'test error ← MSE on test, once, last',
  "resample: same x's, new noise",
  'bias² ← (mean fit − true curve)²',
  'variance ← spread of fits round mean',
  'k-fold: cut the n points into k folds',
  '  for each fold: fit on the others,',
  '    score on the fold itself',
  'CV error ← mean over all n scores',
  'refit the picked d on all n points',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const DATA_X: Axis = { min: -1.1, max: 1.1, label: 'x' };
const DATA_Y: Axis = { min: -2, max: 2.2, label: 'y' };
const CLAMP = 3;
const curve = (w: readonly number[]): Vec[] => GRID.map((x) => [x, round(Math.max(-CLAMP, Math.min(CLAMP, evalPoly(w, x))), 2)]);
const curveOf = (ys: readonly number[]): Vec[] => GRID.map((x, k) => [x, round(Math.max(-CLAMP, Math.min(CLAMP, ys[k])), 2)]);
const trueCurve: Shape = { kind: 'path', id: 'truth', points: GRID.map((x) => [x, round(truth(x), 2)] as Vec), dashed: true, label: 'true curve' };

const dot = (id: string, d: Datum, extra: Partial<Extract<Shape, { kind: 'point' }>> = {}): Shape => ({ kind: 'point', id, at: [d.x, d.y], size: 'sm', ...extra });

function dataPlane(label: string, shapes: Shape[]): PlanePart {
  return { kind: 'plane', id: 'data', label, x: DATA_X, y: DATA_Y, equal: false, shapes, handles: [] };
}

/** log₁₀ of a mean squared error, floored at 0.0001 and capped at 30 so the chart keeps its shape. */
const LOG_FLOOR = -4;
const LOG_CAP = 1.5;
export const logErr = (v: number) => round(Math.min(LOG_CAP, Math.max(LOG_FLOOR, Math.log10(Math.max(v, 1e-12)))), 3);
const ERR_AXIS = (label: string): Axis => ({
  min: LOG_FLOOR - 0.2,
  max: LOG_CAP + 0.1,
  label,
  ticks: [-4, -3, -2, -1, 0, 1].map((k) => ({ at: k, label: ['0.0001', '0.001', '0.01', '0.1', '1', '10'][k + 4] })),
});
// No x-axis label: a training-error line ends at the floor, bottom right, where it would sit. The caption names the axis.
const DEGREE_AXIS: Axis = { min: -0.5, max: MAX_DEGREE + 0.5, ticks: DEGREES.map((d) => ({ at: d, label: String(d) })) };

/** A series is named on the chart (at its last point) only once it spans every degree, so two names never crowd one spot; `unnamed` for one that ends where another does. */
type Series = { id: string; values: readonly number[]; degrees: readonly number[]; tone: 1 | 2 | 3 | 4; label: string; dashed?: boolean; unnamed?: boolean };

/** A chart by degree on a log scale: each series a dotted line over the degrees it has reached. */
function errorChart(id: string, label: string, yLabel: string, series: Series[], extra: Shape[] = [], handleAt: number | null = null): PlanePart {
  const shapes: Shape[] = [];
  for (const s of series) {
    const pts = s.degrees.map((d): Vec => [d, logErr(s.values[d])]);
    const named = s.degrees.length === DEGREES.length && !s.unnamed ? { label: s.label } : {};
    if (pts.length === 1) shapes.push({ kind: 'point', id: s.id, at: pts[0], size: 'md', tone: s.tone, ...named });
    else if (pts.length > 1) shapes.push({ kind: 'path', id: s.id, points: pts, tone: s.tone, dots: true, ...named, ...(s.dashed ? { dashed: true } : {}) });
  }
  return {
    kind: 'plane',
    id,
    label,
    x: DEGREE_AXIS,
    y: ERR_AXIS(yLabel),
    equal: false,
    shapes: [...shapes, ...extra],
    handles: handleAt === null ? [] : [{ id: 'degree', at: [handleAt, LOG_FLOOR], label: 'degree', mark: 'key', step: 1, min: [0, LOG_FLOOR], max: [MAX_DEGREE, LOG_FLOOR] }],
  };
}

const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });

/** A mean squared error for reading: 0 when it is 0 to rounding, else to 3 places, or 3 significant figures below 0.1. */
export function err(v: number): string {
  if (v < 1e-9) return '0';
  if (v < 0.1) return String(Number(v.toPrecision(3)));
  return fmt(v, 3);
}
const list = (vs: readonly number[]) => vs.map(err).join(', ');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type FrameOptions = Omit<Parameters<typeof plotFrame>[1], 'stats'>;
const frameWith = (fits: number, parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { fits } });

// ───────────────────────────── story 1: training against validation error ─────────────────────────────

export const LOWER_CHOICES = ['Lower', 'The same', 'Higher'];
export const ZERO_CHOICES = ['0: it can pass through every point', 'About the same as degree 3’s', 'Higher than degree 3’s'];
export const VALID9_CHOICES = ['Lower', 'About the same', 'Much higher'];
export const OPTIMISTIC_CHOICES = ['Likely a bit higher', 'Exactly the same', 'Likely a bit lower'];

function* degreeStory(chosen: number): Generator<Frame<PlotState>> {
  const trainDots = TRAIN.map((d, i) => dot(`t${i}`, d, { size: 'md' }));
  const validDots = VALID.map((d, i) => dot(`v${i}`, d, { tone: 2 }));
  const fit = (d: number): Shape => ({ kind: 'path', id: 'fit', points: curve(FITS[d]), mark: 'key', label: `degree ${d}` });
  const data = (d: number, label = `The 10 training points (dark), the 40 validation points, and the degree-${d} fit`) => dataPlane(label, [...validDots, ...trainDots, fit(d)]);
  const train = (degrees: readonly number[]): Series => ({ id: 'train', values: TRAIN_ERR, degrees, tone: 1, label: 'training' });
  const valid = (degrees: readonly number[]): Series => ({ id: 'valid', values: VALID_ERR, degrees, tone: 2, label: 'validation' });
  const chart = (series: Series[], extra: Shape[] = []) => errorChart('errors', 'Mean squared error by degree (log scale)', 'mean squared error', series, extra, chosen);
  const about = (d: number, valid = true): Readout[] => [
    { id: 'degree', label: 'degree d', value: String(d), mark: 'key' },
    { id: 'weights', label: 'weights', value: String(d + 1) },
    { id: 'train', label: 'training error', value: err(TRAIN_ERR[d]), tone: 1 },
    ...(valid ? [{ id: 'valid', label: 'validation error', value: err(VALID_ERR[d]), tone: 2 } as Readout] : []),
  ];
  const vars = (d: number): Record<string, number> => ({ d, weights: d + 1 });
  const ratio = Math.round(VALID_ERR[MAX_DEGREE] / VALID_ERR[3]);

  // 0: a line.
  yield frameWith(1, [data(1), chart([train([1]), valid([1])]), readouts(about(1))], {
    line: 0,
    note: `Ten training points: their x's are evenly spread from −1 to 1, and each y is a smooth curve plus random noise. A polynomial of degree d, y = w₀ + w₁x + w₂x² + … + w_d·x^d, has d + 1 weights, and least squares picks the ones with the smallest mean squared error on the training points. Degree 1 is a straight line: its training error is ${err(TRAIN_ERR[1])}. The 40 validation points were kept apart, never used to fit, only to score: there the line's error is ${err(VALID_ERR[1])}.`,
    vars: vars(1),
    checkpoint: askInOrder('A degree-3 curve can bend where a line can’t. Fitted to the same 10 points, what will its training error be, against the line’s?', LOWER_CHOICES, LOWER_CHOICES[0]),
  });

  // 1: degree 3.
  yield frameWith(2, [data(3), chart([train([1, 3]), valid([1, 3])]), readouts(about(3))], {
    line: 1,
    note: `Degree 3: training error ${err(TRAIN_ERR[3])}, down from the line's ${err(TRAIN_ERR[1])}. It had to be: a line is a degree-3 curve whose w₂ and w₃ are 0, so the best degree-3 curve fits the training points at least as well as the best line. The validation error fell too, from ${err(VALID_ERR[1])} to ${err(VALID_ERR[3])}: the curve follows bends the line couldn't.`,
    vars: vars(3),
    checkpoint: askInOrder('Degree 9 has 10 weights for the 10 training points. What will its training error be?', ZERO_CHOICES, ZERO_CHOICES[0]),
  });

  // 2: degree 9, training error only.
  yield frameWith(3, [data(MAX_DEGREE), chart([train([1, 3, MAX_DEGREE]), valid([1, 3])]), readouts(about(MAX_DEGREE, false))], {
    line: 1,
    note: `Degree 9's curve goes through all 10 training points, so its training error is ${err(TRAIN_ERR[MAX_DEGREE])}. Ten weights can match ten points exactly, wherever they lie, noise and all. Between the points the curve swings about to do it.`,
    vars: vars(MAX_DEGREE),
    checkpoint: askInOrder(`And degree 9's validation error, against degree 3's ${err(VALID_ERR[3])}?`, VALID9_CHOICES, VALID9_CHOICES[2]),
  });

  // 3: degree 9 on the validation points.
  yield frameWith(3, [data(MAX_DEGREE), chart([train([1, 3, MAX_DEGREE]), valid([1, 3, MAX_DEGREE])]), readouts(about(MAX_DEGREE))], {
    line: 2,
    note: `Degree 9's validation error is ${err(VALID_ERR[MAX_DEGREE])}, about ${ratio} times degree 3's ${err(VALID_ERR[3])}. It learned the noise in its 10 training points as if it were the curve, and new points don't share that noise: this is overfitting. Its training error, ${err(TRAIN_ERR[MAX_DEGREE])}, said nothing about how it does on points it never saw.`,
    vars: vars(MAX_DEGREE),
    checkpoint: askInOrder('Now every degree from 0 to 9. As the degree rises by one, can the training error ever go up?', ['Yes', 'No'], 'No'),
  });

  // 4: the training error for every degree.
  yield frameWith(10, [data(MAX_DEGREE), chart([train(DEGREES), valid([1, 3, MAX_DEGREE])]), readouts([...about(MAX_DEGREE), { id: 'trains', label: 'training error, degrees 0 to 9', value: list(TRAIN_ERR), tone: 1 }])], {
    line: 1,
    note: `Training error for degrees 0 to 9: ${list(TRAIN_ERR)}. It falls at every step: each degree can do whatever the one below could, with one weight to spare. Judged by training error alone, the highest degree always wins.`,
    vars: vars(MAX_DEGREE),
    checkpoint: ask('Which degree has the lowest validation error?', String(BEST), [String(MAX_DEGREE), '1', String(Math.min(MAX_DEGREE - 1, BEST + 3))]),
  });

  // 5: the U.
  const best: Shape = { kind: 'point', id: 'best', at: [BEST, logErr(VALID_ERR[BEST])], mark: 'found', size: 'lg', label: 'lowest' };
  yield frameWith(10, [data(BEST), chart([train(DEGREES), valid(DEGREES)], [best]), readouts([...about(BEST), { id: 'valids', label: 'validation error, degrees 0 to 9', value: list(VALID_ERR), tone: 2 }])], {
    line: 3,
    note: `Validation error for degrees 0 to 9: ${list(VALID_ERR)}. It falls while each extra weight helps follow the curve, then rises as the extra weights chase the noise: a U. Left of degree ${BEST} the curves underfit (too stiff to follow the curve); right of it they overfit. Its lowest point is degree ${BEST}, at ${err(VALID_ERR[BEST])}.`,
    vars: vars(BEST),
    checkpoint: askInOrder(`Degree ${BEST} won a contest of 10 degrees on these 40 validation points. On brand-new points, will its error be:`, OPTIMISTIC_CHOICES, OPTIMISTIC_CHOICES[0]),
  });

  // 6: the test set.
  const testDots = TEST.map((d, i) => dot(`x${i}`, d, { tone: 3 }));
  yield frameWith(
    10,
    [
      dataPlane(`The 10 training points (dark), the 40 test points, and the degree-${BEST} fit`, [...testDots, ...trainDots, fit(BEST)]),
      chart([train(DEGREES), valid(DEGREES)], [best, { kind: 'point', id: 'test', at: [BEST, logErr(TEST_ERR)], tone: 3, size: 'md' }]),
      readouts([...about(BEST), { id: 'test', label: `test error, degree ${BEST}`, value: err(TEST_ERR), tone: 3 }]),
    ],
    {
      line: 4,
      note: `The test set: 40 more points, kept back until now and used once. Degree ${BEST} scores ${err(TEST_ERR)} there, worse than its validation error ${err(VALID_ERR[BEST])}.${VALID_ERR[BEST] < trueError(FITS[BEST]) ? ` Measured against the true curve, its average error on new points is ${err(trueError(FITS[BEST]))}: these 40 validation points happen to be easy for most of the curves, scoring them below their true errors.` : ''} And a score used to pick a winner tends to flatter it anyway: when 10 degrees compete on the same points, the winner is partly the one that happened to suit them. Only points never used for any choice give an honest estimate, which is why the test set is used once, at the very end.`,
      vars: vars(BEST),
    },
  );

  // 7: the chosen degree.
  const kind = chosen < BEST ? 'too stiff: it underfits, missing bends of the curve' : chosen > BEST ? 'more flexible than it needs: it overfits, bending to the noise' : 'the validation pick';
  yield frameWith(10, [data(chosen), chart([train(DEGREES), valid(DEGREES)], [best]), readouts(about(chosen))], {
    line: 0,
    note: `Degree ${chosen} (drag the handle along the chart): training error ${err(TRAIN_ERR[chosen])}, validation error ${err(VALID_ERR[chosen])}. It is ${kind}.${chosen === BEST ? '' : ` Its validation error is above degree ${BEST}'s ${err(VALID_ERR[BEST])}.`}`,
    vars: vars(chosen),
  });
}

// ───────────────────────────── story 2: bias and variance ─────────────────────────────

export const AVERAGE_CHOICES = ['Yes: their misses cancel out', 'No: every line misses the bends'];
export const SPREAD_CHOICES = ['More', 'About the same', 'Less'];
export const CLOSER_CHOICES = ['The lines’ average', 'The degree-9 curves’ average'];

function* biasStory(chosen: number, seed: number): Generator<Frame<PlotState>> {
  const sets = resample(seed);
  const fitsOf = (d: number) => sets.map((ys) => fitPoly(TRAIN_X, ys, d));
  const low = fitsOf(LOW);
  const high = fitsOf(HIGH);
  const pick = chosen === LOW ? low : chosen === HIGH ? high : fitsOf(chosen);
  const [sLow, sHigh, sPick] = [spreadOf(low), spreadOf(high), spreadOf(pick)];
  const faint = (fits: readonly number[][], tag: string): Shape[] => fits.map((w, k) => ({ kind: 'path', id: `${tag}${k}`, points: curve(w), faint: true }));
  const average = (s: Spread): Shape => ({ kind: 'path', id: 'mean', points: curveOf(s.mean), mark: 'found' });
  const first = sets[0].map((y, i): Datum => ({ x: TRAIN_X[i], y }));
  const plane = (label: string, shapes: Shape[]) => dataPlane(label, [trueCurve, ...shapes]);
  const measured = (s: Spread, d: number, bias = true): Readout[] => [
    ...(bias ? [{ id: `bias${d}`, label: `degree ${d}: bias², the ${SETS} drawn`, value: fmt(s.bias2, 3), tone: 1 } as Readout] : []),
    { id: `var${d}`, label: `degree ${d}: variance, the ${SETS} drawn`, value: fmt(s.variance, 3), tone: 2 },
  ];
  const exact = (d: number): Readout[] => [
    { id: 'xbias', label: `degree ${d}: bias², every possible set`, value: fmt(exactSpread(d).bias2, 4), tone: 1 },
    { id: 'xvar', label: `degree ${d}: variance, every possible set`, value: fmt(exactSpread(d).variance, 4), tone: 2 },
    { id: 'xsum', label: `degree ${d}: bias² + variance`, value: fmt(totalOf(d), 4), tone: 3 },
  ];
  const chart = (shown: boolean, extra: Shape[] = []) =>
    errorChart(
      'spread',
      'Bias² and variance by degree, over every possible training set (log scale)',
      'squared error',
      shown
        ? [
            { id: 'bias', values: DEGREES.map((d) => exactSpread(d).bias2), degrees: DEGREES, tone: 1, label: 'bias²' },
            { id: 'var', values: DEGREES.map((d) => exactSpread(d).variance), degrees: DEGREES, tone: 2, label: 'variance' },
            { id: 'sum', values: DEGREES.map(totalOf), degrees: DEGREES, tone: 3, label: 'bias² + variance', dashed: true, unnamed: true },
          ]
        : [],
      extra,
      chosen,
    );
  const vars = (d: number): Record<string, number> => ({ d, sets: SETS, 'noise²': round(NOISE * NOISE, 4) });

  // 0: one more training set.
  yield frameWith(1, [plane('The true curve (dashed), one more training set at the same 10 x’s, and its line', [...first.map((d, i) => dot(`t${i}`, d, { size: 'md' })), { kind: 'path', id: 'one', points: curve(low[0]), mark: 'key' }]), chart(false), readouts([{ id: 'sets', label: 'training sets', value: '1' }, { id: 'noise', label: 'the noise’s average square', value: fmt(NOISE * NOISE, 2) }])], {
    line: 5,
    note: `The 10 training points were one roll of the noise. Another day, at the same 10 x's, the noise would come out differently and so would every fit. The dashed curve is the truth the points come from, ${TRUE_CURVE} (in real life nobody sees it). Here is one more training set dealt from it, with its least-squares line.`,
    vars: vars(LOW),
    checkpoint: askInOrder(`Fit a line to each of ${SETS} such training sets and average the ${SETS} lines. Will the average match the true curve?`, AVERAGE_CHOICES, AVERAGE_CHOICES[1]),
  });

  // 1: twenty lines.
  yield frameWith(SETS, [plane(`${SETS} training sets’ lines (faint), their average, and the true curve (dashed)`, [...faint(low, 'l'), average(sLow)]), chart(false), readouts(measured(sLow, LOW))], {
    line: 6,
    note: `The ${SETS} lines lie close together, but their average is a line too, and it misses the curve's bends just where each line does: a line can't bend. How far the average fit is from the truth, squared and averaged over x from −1 to 1, is the bias², here ${fmt(sLow.bias2, 3)}. How far the fits scatter around their own average, the same way, is the variance: ${fmt(sLow.variance, 3)}. Variance measures how much the fit depends on which training set it got.`,
    vars: vars(LOW),
    checkpoint: askInOrder(`Now fit degree 9 to the same ${SETS} training sets. Will its curves disagree with each other, against the lines?`, SPREAD_CHOICES, SPREAD_CHOICES[0]),
  });

  // 2: twenty degree-9 curves, no average yet.
  yield frameWith(2 * SETS, [plane(`The same ${SETS} training sets’ degree-9 curves (faint), and the true curve (dashed)`, faint(high, 'h')), chart(false), readouts([...measured(sLow, LOW), ...measured(sHigh, HIGH, false)])], {
    line: 7,
    note: `Each degree-9 curve passes through its own 10 points, so it follows that set's noise: the curves fan out between the points, widest near the ends. Their variance is ${fmt(sHigh.variance, 3)}, against the lines' ${fmt(sLow.variance, 3)}.`,
    vars: vars(HIGH),
    checkpoint: askInOrder(`Average the ${SETS} curves of each degree. Whose average comes closer to the true curve?`, CLOSER_CHOICES, CLOSER_CHOICES[1]),
  });

  // 3: their average.
  yield frameWith(2 * SETS, [plane(`The ${SETS} degree-9 curves (faint), their average, and the true curve (dashed)`, [...faint(high, 'h'), average(sHigh)]), chart(false), readouts([...measured(sLow, LOW), ...measured(sHigh, HIGH)])], {
    line: 6,
    note: `The degree-9 curves average out closer to the truth: bias² ${fmt(sHigh.bias2, 3)}, against the lines' ${fmt(sLow.bias2, 3)}. Their misses point every which way, so they cancel; the lines all miss the same bends, so theirs don't. A stiff model has high bias and low variance; a flexible one low bias and high variance. On a new point, the expected squared error is bias² + variance + the noise's own average square, ${fmt(NOISE * NOISE, 2)}, which no model can remove.`,
    vars: vars(HIGH),
    checkpoint: ask('Over every possible training set, which degree makes bias² + variance smallest?', String(BV_BEST), [String(LOW), String(BV_BEST + 2), String(HIGH)]),
  });

  // 4: the trade-off, exactly.
  const lowest: Shape = { kind: 'point', id: 'lowest', at: [BV_BEST, logErr(totalOf(BV_BEST))], mark: 'found', size: 'lg', label: 'lowest' };
  yield frameWith(2 * SETS, [plane(`The ${SETS} degree-9 curves (faint), their average, and the true curve (dashed)`, [...faint(high, 'h'), average(sHigh)]), chart(true, [lowest]), readouts(exact(BV_BEST), 'Over every possible training set')], {
    line: 7,
    note: `Worked out exactly over every possible training set at these 10 x's (a fit is a weighted sum of the y's, so the average fit is the fit to the noiseless curve): bias² falls as the degree rises, to near 0 and stays there, while variance climbs. Their sum is smallest at degree ${BV_BEST}, ${fmt(totalOf(BV_BEST), 4)}. That is the bias–variance trade-off: below it the model is too stiff, above it too jumpy. Averaged over training sets, a degree's error on new points is this sum plus the noise's ${fmt(NOISE * NOISE, 2)}; the validation U of the first story was one training set's wobbly version of it.`,
    vars: vars(BV_BEST),
  });

  // 5: the chosen degree.
  yield frameWith(3 * SETS, [plane(`The ${SETS} training sets’ degree-${chosen} curves (faint), their average, and the true curve (dashed)`, [...faint(pick, 'c'), average(sPick)]), chart(true, [lowest]), readouts([...measured(sPick, chosen), ...exact(chosen)])], {
    line: 6,
    note: `Degree ${chosen} (drag the handle along the chart). Over these ${SETS} training sets its bias² is ${fmt(sPick.bias2, 3)} and its variance ${fmt(sPick.variance, 3)}; over every possible set, ${fmt(exactSpread(chosen).bias2, 4)} and ${fmt(exactSpread(chosen).variance, 4)}. ${
      chosen < BV_BEST
        ? 'Bias is the bigger part: the curve is too stiff, and more flexibility would help.'
        : chosen > BV_BEST
          ? 'Variance is the bigger part: the curve bends to each set’s noise.'
          : 'This is the balance point: one degree up adds more variance than it removes bias, and one degree down adds more bias than it saves variance.'
    }`,
    vars: vars(chosen),
  });
}

// ───────────────────────────── story 3: k-fold cross-validation ─────────────────────────────

export const ONCE_CHOICES = (k: number) => ['Once', `${k - 1} times`, `${k} times`];
export const FINAL_CHOICES = (k: number) => [`All ${N_POOL} points`, `The ${N_POOL - kFold(N_POOL, k)[0].length} points one model trained on`, `The ${kFold(N_POOL, k)[0].length} points of one fold`];

function* kFoldStory(k: number): Generator<Frame<PlotState>> {
  const folds = kFold(N_POOL, k);
  const foldOf = POOL.map((_, i) => folds.findIndex((f) => f.includes(i)));
  const rounds = folds.map((_, f) => foldRound(k, f, FOLD_DEGREE));
  const cv = cvErrors(k);
  const pick = argmin(cv);
  const final = fitTo(POOL, pick);
  const size1 = folds[0].length;

  const TIME_X: Axis = { min: 0, max: N_POOL, label: 'point number, 0 to 19' };
  const TIME_Y: Axis = { min: 0.4, max: k + 0.6, ticks: folds.map((_, f) => ({ at: k - f, label: `model ${f + 1}` })) };
  /** One row per model, one cell per point: the cells it is scored on marked, the rest it trains on. */
  const timeline = (marked: (f: number) => boolean, label: string): PlanePart => ({
    kind: 'plane',
    id: 'folds',
    label,
    x: TIME_X,
    y: TIME_Y,
    equal: false,
    shapes: [
      {
        kind: 'bars',
        id: 'cells',
        bars: folds.flatMap((_, f) =>
          POOL.map((__, i): Bar => ({ id: `c${f}-${i}`, x0: i + 0.08, x1: i + 0.92, y0: k - f - 0.32, y: k - f + 0.32, ...(marked(f) && foldOf[i] === f ? { tone: 2 as const } : {}) })),
        ),
      },
    ],
    handles: [],
  });
  const data = (label: string, held: readonly number[], fits: Shape[]) => dataPlane(label, [...POOL.map((d, i) => dot(`p${i}`, d, { size: 'md', ...(held.includes(i) ? { tone: 2 as const } : {}) })), ...fits]);
  const chart = (degrees: readonly number[], extra: Shape[] = []) =>
    errorChart('cv', 'Cross-validated error by degree (log scale)', 'mean squared error', degrees.length ? [{ id: 'cv', values: cv, degrees, tone: 2, label: 'cross-validated' }] : [], extra);
  const vars = (more: Record<string, number> = {}): Record<string, number> => ({ n: N_POOL, k, ...more });
  const sizes = folds.map((f) => f.length);
  const sizeText = sizes.every((s) => s === sizes[0]) ? `${N_POOL} ÷ ${k} = ${sizes[0]} points each` : `${N_POOL} ÷ ${k} leaves ${N_POOL % k} over, so the first ${plural(N_POOL % k, 'fold')} take ${Math.floor(N_POOL / k) + 1} points and the rest ${Math.floor(N_POOL / k)}`;
  const foldCurve = (f: number, faintly: boolean): Shape => ({ kind: 'path', id: `m${f}`, points: curve(rounds[f].w), ...(faintly ? { faint: true } : { mark: 'key' as const, label: `model ${f + 1}` }) });

  // 0: no data to spare.
  yield frameWith(0, [data(`The ${N_POOL} points, in the order they came`, [], []), timeline(() => false, `${k} models, one row each; a cell per point`), chart([])], {
    line: 8,
    note: `Only ${N_POOL} points this time, and no spare validation set. Holding some back to validate leaves fewer to train on, and the score then depends on which ones were held back. k-fold cross-validation uses every point for both jobs: cut the ${N_POOL} points, in the order they came (a random order), into k = ${k} folds of consecutive points. Model r is fitted on every fold except fold r, then scored on fold r.`,
    vars: vars(),
    checkpoint: ask(`With ${N_POOL} points in ${k} folds, how many points does model 1 train on?`, String(N_POOL - size1), [String(size1), String(N_POOL), String(N_POOL - 1)]),
  });

  // 1: model 1.
  yield frameWith(1, [data(`Model 1: trained on the dark points, scored on fold 1 (coloured)`, folds[0], [foldCurve(0, false)]), timeline((f) => f === 0, 'Model 1’s row: the cells it is scored on are coloured'), chart([])], {
    line: 9,
    note: `The folds: ${sizeText}. Model 1, a degree-${FOLD_DEGREE} curve, is fitted to the ${N_POOL - size1} points outside fold 1, then scored on fold 1's ${size1}, which it never saw: mean squared error ${err(rounds[0].errors.reduce((s, e) => s + e, 0) / size1)}.`,
    vars: vars({ d: FOLD_DEGREE }),
    checkpoint: askInOrder(`Each of the ${k} models is scored on its own fold. How many times is each point used for scoring?`, ONCE_CHOICES(k), 'Once'),
  });

  // 2: every model.
  const score = (f: number) => rounds[f].errors.reduce((s, e) => s + e, 0) / folds[f].length;
  yield frameWith(k, [data(`All ${k} models, degree ${FOLD_DEGREE}`, [], rounds.map((_, f) => foldCurve(f, true))), timeline(() => true, 'Every model’s row: the cells it is scored on are coloured'), chart([FOLD_DEGREE])], {
    line: 10,
    note: `All ${k} rounds at degree ${FOLD_DEGREE}. Each column of the timeline has exactly one coloured cell: every point is scored by the one model that never trained on it, and helps train the other ${k - 1}. The models' scores: ${folds.map((_, f) => err(score(f))).join(', ')}. The cross-validated error is the mean of all ${N_POOL} squared errors: ${err(cv[FOLD_DEGREE])}.`,
    vars: vars({ d: FOLD_DEGREE }),
    checkpoint: ask(`Scoring every degree from 0 to ${MAX_DEGREE} this way, how many curves are fitted in all?`, String(DEGREES.length * k), [String(DEGREES.length), String(k), String(DEGREES.length + k)]),
  });

  // 3: every degree.
  const best: Shape = { kind: 'point', id: 'pick', at: [pick, logErr(cv[pick])], mark: 'found', size: 'lg', label: 'lowest' };
  yield frameWith(DEGREES.length * k, [data(`The ${N_POOL} points`, [], []), timeline(() => true, 'Every model’s row: the cells it is scored on are coloured'), chart(DEGREES, [best]), readouts([{ id: 'cv', label: 'cross-validated error, degrees 0 to 9', value: list(cv), tone: 2 }, { id: 'pick', label: 'degree picked', value: String(pick), mark: 'found' }, { id: 'fits', label: 'curves fitted', value: String(DEGREES.length * k) }])], {
    line: 11,
    note: `${DEGREES.length} degrees × ${k} models = ${DEGREES.length * k} curves. Cross-validated error for degrees 0 to 9: ${list(cv)}. ${
      isU(cv)
        ? 'The same U as before: too stiff on the left, chasing noise on the right.'
        : `Roughly the U of before, too stiff on the left and chasing noise on the right, but bumpy: each score rests on only ${N_POOL} points, so luck moves it, and the lowest may be a lucky dip rather than the best degree.`
    } Its lowest is degree ${pick}. A cross-validated score is itself noisy with so few points: another k can pick another degree.`,
    vars: vars({ d: pick }),
    checkpoint: askInOrder(`Cross-validation picks degree ${pick}. What does the final degree-${pick} model train on?`, FINAL_CHOICES(k), FINAL_CHOICES(k)[0]),
  });

  // 4: the final model.
  yield frameWith(DEGREES.length * k + 1, [data(`The final degree-${pick} model, fitted to all ${N_POOL} points`, [], [{ kind: 'path', id: 'final', points: curve(final), mark: 'found', label: `degree ${pick}` }]), timeline(() => true, 'Every model’s row: the cells it is scored on are coloured'), chart(DEGREES, [best]), readouts([{ id: 'pick', label: 'degree picked', value: String(pick), mark: 'found' }, { id: 'fits', label: 'curves fitted', value: String(DEGREES.length * k + 1) }])], {
    line: 12,
    note: `The folds were only for choosing. The final model refits degree ${pick} on all ${N_POOL} points, so every point helps it learn.${isU(cv) ? '' : ` The rule says degree ${pick}, but the scores were bumpy: with ${N_POOL} points, the simplest degree that scores nearly as well, or more data, is often the safer choice.`} The price of cross-validation is time: ${k} fits for every setting tried instead of 1, here ${DEGREES.length * k} plus this one. Common choices are k = 5 or 10; with k = n, one point a fold, it is called leave-one-out.`,
    vars: vars({ d: pick }),
  });
}

function* run(input: OverfitInput): Generator<Frame<PlotState>> {
  if (input.story === 'degree') yield* degreeStory(input.degree);
  else if (input.story === 'bias-variance') yield* biasStory(input.degree, input.seed);
  else yield* kFoldStory(input.k);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const MAX_SEED = 4294967295;
const okSeed = (s: number) => Number.isInteger(s) && s >= 0 && s <= MAX_SEED;
const okDegree = (d: number) => Number.isInteger(d) && d >= 0 && d <= MAX_DEGREE;

export function parseOverfit(text: string): { value: OverfitInput } | { error: string } {
  const t = text.trim().toLowerCase();
  const story = STORIES.find((s) => t.startsWith(s));
  const xs = numbersIn(t.replace(/^k-fold/, ''));
  if (!story) return { error: 'Start with degree, bias-variance or k-fold, e.g. degree 6, bias-variance degree 6 seed 7, or k-fold 5.' };
  if (story === 'degree') {
    if (xs.length !== 1 || !okDegree(xs[0])) return { error: `Give one degree, a whole number from 0 to ${MAX_DEGREE}, e.g. degree 6.` };
    return { value: { story, degree: xs[0] } };
  }
  if (story === 'bias-variance') {
    if (xs.length !== 2) return { error: 'Give a degree and a seed, e.g. bias-variance degree 6 seed 7.' };
    if (!okDegree(xs[0])) return { error: `The degree is a whole number from 0 to ${MAX_DEGREE}.` };
    if (!okSeed(xs[1])) return { error: 'The seed is a whole number, 0 or more.' };
    return { value: { story, degree: xs[0], seed: xs[1] } };
  }
  if (xs.length !== 1 || !Number.isInteger(xs[0]) || xs[0] < K_RANGE[0] || xs[0] > K_RANGE[1]) return { error: `Give the number of folds, a whole number from ${K_RANGE[0]} to ${K_RANGE[1]}, e.g. k-fold 5.` };
  return { value: { story, k: xs[0] } };
}

export function formatOverfit(input: OverfitInput): string {
  if (input.story === 'degree') return `degree ${input.degree}`;
  if (input.story === 'bias-variance') return `bias-variance degree ${input.degree} seed ${input.seed}`;
  return `k-fold ${input.k}`;
}

export function dragOverfit(input: OverfitInput, _handle: string, to: Vec): OverfitInput {
  if (input.story === 'k-fold') return input;
  return { ...input, degree: snap(to[0], 1, 0, MAX_DEGREE) };
}

/** The degree the handle starts at: not an answer to any question. */
export const START_DEGREE = 6;

export const overfitting = defineAlgorithm<OverfitInput, PlotState>({
  kind: 'algorithm',
  slug: 'overfitting',
  view: 'plot',
  input: {
    examples: [
      { id: 'degree', label: 'Training and validation error, degree by degree', make: () => ({ story: 'degree', degree: START_DEGREE }), sized: false },
      { id: 'bias-variance', label: 'Bias and variance: twenty training sets', make: ({ seed }) => ({ story: 'bias-variance', degree: START_DEGREE, seed }), sized: false },
      { id: 'k-fold', label: 'Five-fold cross-validation on a small data set', make: () => ({ story: 'k-fold', k: DEFAULT_K }), sized: false },
    ],
    custom: {
      label: `degree with a degree (0 to ${MAX_DEGREE}); bias-variance with a degree and a seed; k-fold with the number of folds (${K_RANGE[0]} to ${K_RANGE[1]})`,
      placeholder: 'e.g. degree 6, bias-variance degree 6 seed 7, or k-fold 5',
      parse: parseOverfit,
      format: formatOverfit,
    },
    drag: dragOverfit,
  },
  pseudocode,
  stats: [{ key: 'fits', label: 'Curves fitted' }],
  legend: [
    { neutral: 'Training points; faint: other training sets’ fits' },
    { mark: 'key', label: 'The current fit; the degree you drag' },
    { mark: 'found', label: 'The lowest error; the average fit; the final model' },
    { tone: 1, label: 'Training error; bias²' },
    { tone: 2, label: 'Validation points and error; variance; a fold being scored' },
    { tone: 3, label: 'Test points and error; bias² + variance' },
  ],
  run,
  content: {
    idea: 'A model that fits its training data better is not always a better model. Fit curves of rising degree to ten noisy points and score them on points kept apart: the training error only falls, but the validation error falls and then climbs. Bias and variance explain the shape, and k-fold cross-validation finds the bottom when data are scarce.',
    invariant: 'Training error never rises as the degree rises, because each degree contains the ones below it. Validation, cross-validation and test points are never used to fit, and the test set is used once, after every choice is made.',
    whenToUse: 'Whenever you choose anything about a model (its size, its degree, how long to train, a penalty) by its score: choose on a validation set or by cross-validation, never on the training error, and keep a test set back for one honest score at the end.',
    traits: [
      { label: 'Validation error estimates error on new data', good: true },
      { label: 'Training error alone always favours the most flexible model', good: false },
      { label: 'k-fold costs k fits per setting tried', good: null },
      { label: 'Bias² + variance + noise is the expected error', good: null },
    ],
    experiments: [
      { example: 'degree', prompt: 'Drag the degree from 0 to 9 and watch the fitted curve. Where does it start to wiggle between the points?' },
      { example: 'bias-variance', prompt: 'Press New values a few times. Do the degree-1 lines ever average out to the true curve?' },
      { example: 'k-fold', prompt: 'Try k-fold 2 and k-fold 10 in the input box. Which degree does each pick? How far would you trust a pick made from 20 points?' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { DATA_BOX } from '@/ml/datasets';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Handle, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export const STEPS = 30;
export const MIN_POINTS = 2;
export const MAX_POINTS = 12;
const MAX_LR = 1;
/** Past this the fit has blown up: stop and say so. */
const BLOWN_UP = 1e3;

export type XY = { x: number; y: number };
export type LinearInput = { points: XY[]; lr: number };
export type Fit = { w: number; b: number };

const pseudocode = [
  'ŷ = w·x + b;   start at w = b = 0',
  'r_i ← ŷ_i − y_i            the residuals',
  'MSE ← mean of r_i²         the squares',
  'w ← w − η · 2·mean(r_i · x_i)',
  'b ← b − η · 2·mean(r_i)',
  'least squares: the best w, b exactly',
];

export const residuals = (pts: readonly XY[], { w, b }: Fit) => pts.map((p) => w * p.x + b - p.y);
export const mse = (pts: readonly XY[], fit: Fit) => residuals(pts, fit).reduce((s, r) => s + r * r, 0) / pts.length;

/** ∂MSE/∂w and ∂MSE/∂b. */
export function mseGrad(pts: readonly XY[], fit: Fit): Fit {
  const r = residuals(pts, fit);
  const n = pts.length;
  return { w: (2 / n) * r.reduce((s, ri, i) => s + ri * pts[i].x, 0), b: (2 / n) * r.reduce((s, ri) => s + ri, 0) };
}

/** The exact least-squares line, or null when every point has the same x (any slope fits as well). */
export function leastSquares(pts: readonly XY[]): Fit | null {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx < 1e-12) return null;
  const w = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  return { w, b: my - w * mx };
}

/** Every fit along the descent, from w = b = 0; it stops early if the fit blows up. */
export function descend({ points, lr }: LinearInput): { fits: Fit[]; diverged: boolean } {
  const fits: Fit[] = [{ w: 0, b: 0 }];
  for (let k = 0; k < STEPS; k++) {
    const f = fits[k];
    const g = mseGrad(points, f);
    const next = { w: f.w - lr * g.w, b: f.b - lr * g.b };
    fits.push(next);
    if (!Number.isFinite(next.w) || Math.abs(next.w) > BLOWN_UP || Math.abs(next.b) > BLOWN_UP) return { fits, diverged: true };
  }
  return { fits, diverged: false };
}

/** The square on a residual: one side is the residual itself, the square opens towards the plane's middle. */
export function residualSquare(p: XY, fitted: number): Vec[] {
  const side = fitted - p.y;
  const dx = (p.x > 0 ? -1 : 1) * Math.abs(side);
  return [
    [p.x, p.y],
    [p.x, fitted],
    [p.x + dx, fitted],
    [p.x + dx, p.y],
  ];
}

const tilt = (dw: number) => (Math.abs(dw) < 1e-9 ? 'Stay the same' : dw > 0 ? 'Go up' : 'Go down');

function* run(input: LinearInput): Generator<Frame<PlotState>> {
  const { points, lr } = input;
  const n = points.length;
  const { fits, diverged } = descend(input);
  const losses = fits.map((f) => mse(points, f));
  const best = leastSquares(points);
  const top = Math.max(0.5, losses[0] * 1.15, best ? mse(points, best) * 1.15 : 0);

  const parts = (k: number, extra: { best?: boolean } = {}): PlotPart[] => {
    const fit = fits[k];
    const shapes: Shape[] = [];
    points.forEach((p, i) => {
      const fitted = fit.w * p.x + fit.b;
      shapes.push({ kind: 'path', id: `sq${i}`, points: residualSquare(p, fitted), closed: true, fill: true, fillOpacity: 0.12, mark: 'reject' });
    });
    points.forEach((p, i) => {
      shapes.push({ kind: 'path', id: `r${i}`, points: [[p.x, p.y], [p.x, fit.w * p.x + fit.b]], mark: 'reject' });
    });
    if (extra.best && best) shapes.push({ kind: 'line', id: 'best', through: [0, best.b], dir: [1, best.w], mark: 'found', dashed: true, label: 'least squares' });
    shapes.push({ kind: 'line', id: 'fit', through: [0, fit.b], dir: [1, fit.w], mark: 'key', label: 'ŷ' });
    points.forEach((p, i) => shapes.push({ kind: 'point', id: `p${i}`, at: [p.x, p.y], size: 'md' }));
    const handles: Handle[] = points.map((p, i) => ({ id: `p${i}`, at: [p.x, p.y], label: `Point ${i + 1}`, step: 0.1, min: [DATA_BOX.x.min, DATA_BOX.y.min], max: [DATA_BOX.x.max, DATA_BOX.y.max] }));
    const plane: PlanePart = { kind: 'plane', id: 'plane', label: 'The data and the fitted line', x: DATA_BOX.x, y: DATA_BOX.y, equal: true, shapes, handles };
    const loss: PlanePart = {
      kind: 'plane',
      id: 'loss',
      label: 'Mean squared error after each step',
      x: { min: 0, max: STEPS, label: 'step' },
      y: { min: 0, max: top, label: 'MSE' },
      equal: false,
      shapes: [{ kind: 'path', id: 'loss', points: losses.slice(0, k + 1).map((l, j): Vec => [j, Math.min(l, top * 4)]), mark: 'key' }],
      handles: [],
    };
    return [
      plane,
      loss,
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'The fit',
        items: [
          { id: 'w', label: 'w', value: fmt(fit.w, 3), mark: 'key' },
          { id: 'b', label: 'b', value: fmt(fit.b, 3) },
          { id: 'mse', label: 'MSE', value: fmt(losses[k], 4) },
          ...(extra.best && best ? [{ id: 'best', label: 'least squares', value: `w ${fmt(best.w, 3)}, b ${fmt(best.b, 3)}`, mark: 'found' as const }] : []),
        ],
      },
    ];
  };
  const vars = (k: number) => ({ w: round(fits[k].w, 4), b: round(fits[k].b, 4), MSE: round(losses[k], 4) });
  const steps = fits.length - 1;

  yield plotFrame(parts(0), {
    line: 0,
    note: `Fit a line ŷ = w·x + b through ${n} points. Start flat at w = b = 0: each red square has the residual as its side, and the MSE is their average area, ${fmt(losses[0], 3)}. Drag any point to change the data.`,
    vars: vars(0),
    stats: { steps: 0 },
    checkpoint: askInOrder('Will the slope w go up or down on the first step?', ['Go up', 'Go down', 'Stay the same'], tilt(fits[1].w - fits[0].w)),
  });

  for (let k = 1; k <= steps; k++) {
    const g = mseGrad(points, fits[k - 1]);
    const fell = losses[k] < losses[k - 1];
    const next = k < steps ? k + 1 : null;
    yield plotFrame(parts(k), {
      line: k === 1 ? 3 : 4,
      note: fell
        ? `Step ${k}: the gradient is (${fmt(g.w, 3)}, ${fmt(g.b, 3)}), so w and b move against it by η = ${fmt(lr, 3)} times as much. The squares shrink and the MSE falls from ${fmt(losses[k - 1], 4)} to ${fmt(losses[k], 4)}.`
        : `Step ${k}: the MSE rose from ${fmt(losses[k - 1], 4)} to ${fmt(losses[k], 4)}. η = ${fmt(lr, 3)} is too big: the line swings past the best fit and lands further away on the other side.`,
      vars: { ...vars(k), '∂L/∂w': round(g.w, 4), '∂L/∂b': round(g.b, 4) },
      stats: { steps: k },
      checkpoint:
        next === null
          ? undefined
          : k % 2 === 0
            ? askInOrder(`Will the MSE be lower after step ${next}?`, ['Yes', 'No'], losses[next] < losses[k] ? 'Yes' : 'No')
            : askInOrder(`Will the slope w go up or down on step ${next}?`, ['Go up', 'Go down', 'Stay the same'], tilt(fits[next].w - fits[k].w)),
    });
  }

  const end = fits[steps];
  // Still climbing at the end counts as blowing up, even if the numbers haven't got huge yet.
  if (diverged || losses[steps] > losses[steps - 1]) {
    yield plotFrame(parts(steps), {
      line: 3,
      note: `The fit blew up after ${steps} steps: with η = ${fmt(lr, 3)}, every step overshoots by more than the last. Gradient descent on MSE needs a step size small enough for the steepest direction; try η = 0.1.`,
      vars: vars(steps),
      stats: { steps },
    });
    return;
  }

  const gap = best ? Math.hypot(end.w - best.w, end.b - best.b) : 0;
  yield plotFrame(parts(steps, { best: true }), {
    line: 5,
    note: best
      ? `For a straight line the best fit can also be solved exactly (least squares): w = ${fmt(best.w, 3)}, b = ${fmt(best.b, 3)}, MSE ${fmt(mse(points, best), 4)}. ${
          gap < 0.01 ? 'Gradient descent has landed on it.' : `Gradient descent is still ${fmt(gap, 3)} away after ${steps} steps; it gets there with more steps.`
        }`
      : 'Every point has the same x, so any slope through their average fits equally well: least squares has no single answer.',
    vars: { ...vars(steps), ...(best ? { 'w*': round(best.w, 4), 'b*': round(best.b, 4) } : {}) },
    stats: { steps },
  });

  const outlier = points.reduce((worst, p, i) => (Math.abs(residuals([p], end)[0]) > Math.abs(residuals([points[worst]], end)[0]) ? i : worst), 0);
  const share = (residuals([points[outlier]], end)[0] ** 2 / n) / Math.max(1e-12, losses[steps]);
  yield plotFrame(parts(steps, { best: true }), {
    line: 2,
    note: `The fit is ŷ = ${fmt(end.w, 3)}·x ${end.b < 0 ? '−' : '+'} ${fmt(Math.abs(end.b), 3)}, MSE ${fmt(losses[steps], 4)}. ${
      share > 0.5 && n > 2
        ? `Point ${outlier + 1} alone makes up ${Math.round(share * 100)}% of the error: squaring makes one far point pull the line hard.`
        : 'Drag a point far from the line and watch its square, and the line, react.'
    }`,
    vars: vars(steps),
    stats: { steps },
  });
}

const pts = (xs: readonly (readonly [number, number])[]): XY[] => xs.map(([x, y]) => ({ x, y }));
const example = (id: string, label: string, points: XY[], lr = 0.1) => ({ id, label, make: () => ({ points, lr }), sized: false });

const TREND = pts([[-2.5, -1.4], [-1.8, -0.9], [-1.1, -0.2], [-0.4, 0.2], [0.3, 0.8], [1, 1.1], [1.7, 1.9], [2.4, 2.3]]);

export const linearRegression = defineAlgorithm<LinearInput, PlotState>({
  kind: 'algorithm',
  slug: 'linear-regression',
  view: 'plot',
  input: {
    examples: [
      example('trend', 'Clean trend', TREND),
      {
        id: 'noisy',
        label: 'Noisy',
        sized: false,
        make: ({ seed }) => {
          const rng = createRng(seed);
          const points = Array.from({ length: 10 }, (_, i) => {
            const x = round(-2.7 + i * 0.6, 1);
            return { x, y: round(Math.min(2.9, Math.max(-2.9, 0.5 * x - 0.3 + (rng() - 0.5) * 2.4)), 1) };
          });
          return { points, lr: 0.1 };
        },
      },
      example('outlier', 'One outlier', [...TREND.slice(0, 7), { x: 2.4, y: -2.6 }]),
      example('flat', 'No trend', pts([[-2.4, 0.6], [-1.6, -0.5], [-0.8, 0.4], [0, -0.6], [0.8, 0.5], [1.6, -0.4], [2.4, 0.3]])),
      example('too-big', 'Too big a step', TREND, 0.45),
    ],
    custom: {
      label: `Points (x, y), ${MIN_POINTS}–${MAX_POINTS}, each from −3 to 3, then the step size`,
      placeholder: 'e.g. (-2, -1), (0, 0.5), (2, 2); lr = 0.1',
      parse: (text) => {
        const [data, rate] = text.split(/lr|η/i);
        const xs = numbersIn(data);
        if (xs.length % 2 !== 0) return { error: 'Give each point as a pair of numbers (x, y).' };
        const points = Array.from({ length: xs.length / 2 }, (_, i) => ({ x: round(xs[2 * i], 2), y: round(xs[2 * i + 1], 2) }));
        if (points.length < MIN_POINTS || points.length > MAX_POINTS) return { error: `Give ${MIN_POINTS} to ${MAX_POINTS} points.` };
        if (points.some((p) => Math.abs(p.x) > 3 || Math.abs(p.y) > 3)) return { error: 'Keep every coordinate between −3 and 3.' };
        const lrs = rate === undefined ? [] : numbersIn(rate);
        const lr = lrs.length ? lrs[0] : 0.1;
        if (!(lr > 0 && lr <= MAX_LR)) return { error: `The step size must be above 0 and at most ${MAX_LR}.` };
        return { value: { points, lr: round(lr, 4) } };
      },
      format: ({ points, lr }) => `${points.map((p) => `(${plain(p.x)}, ${plain(p.y)})`).join(', ')}; lr = ${plain(lr, 4)}`,
    },
    drag: (input, handle, to) => {
      const i = Number(handle.slice(1));
      const clamp = (v: number) => round(Math.min(3, Math.max(-3, v)), 2);
      return { ...input, points: input.points.map((p, k) => (k === i ? { x: clamp(to[0]), y: clamp(to[1]) } : p)) };
    },
  },
  pseudocode,
  stats: [{ key: 'steps', label: 'Steps' }],
  legend: [
    { neutral: 'Data points (drag them)' },
    { mark: 'key', label: 'The fitted line ŷ = w·x + b' },
    { mark: 'reject', label: 'Residuals and their squares' },
    { mark: 'found', label: 'The exact least-squares line' },
  ],
  run,
  content: {
    idea: 'Fit a line by making its mistakes small. Each point’s residual is how far the line misses it; square it and you literally get a square. The mean squared error is the average area of those squares, and gradient descent nudges the slope and intercept to shrink it.',
    invariant: 'MSE(w, b) = mean((w·xᵢ + b − yᵢ)²) is a bowl in (w, b), so gradient descent with a small enough step size heads to its single lowest point: the least-squares line, which can also be solved exactly.',
    whenToUse: 'Predicting a number from inputs when the relationship is roughly straight: the starting point of every regression model, and the last layer of many neural networks. Squaring punishes big misses most, so a single outlier can drag the line.',
    traits: [
      { label: 'One best line (a convex bowl)', good: true },
      { label: 'Exact closed form exists', good: true },
      { label: 'Sensitive to outliers', good: false },
    ],
    experiments: [
      { example: 'outlier', prompt: 'One far point owns the biggest square, and squaring makes it pull the whole line towards it.' },
      { example: 'too-big', prompt: 'With η = 0.45 the slope overshoots further every step. Predict: does the MSE ever fall?' },
      { example: 'flat', prompt: 'When y doesn’t depend on x, the best slope is about 0 and the line settles on the average y.' },
      { example: 'trend', prompt: 'Drag one point well off the line and watch its square grow and the line lean towards it.' },
    ],
  },
});

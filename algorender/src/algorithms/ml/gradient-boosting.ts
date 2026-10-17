import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type CurveId = 'sine' | 'step' | 'quadratic';
const CURVES: readonly CurveId[] = ['sine', 'step', 'quadratic'];
export const MAX_ROUNDS = 20;
export const MAX_POINTS = 60;
const X_MAX = 6;
/** Where the "left or right" question draws its line: the middle of the x range. */
const MIDDLE = X_MAX / 2;

export type BoostInput = { curve: CurveId; n: number; seed: number; rate: number; rounds: number };

const pseudocode = [
  'F ← mean(y)            a flat first guess',
  'repeat for each round:',
  '  r ← y − F(x)          what F gets wrong',
  '  fit a stump s to r  (one split, 2 means)',
  '  F ← F + η·s           add a shrunk copy',
  'predict: F(x) = mean + η·Σ stumps',
];

const TRUTH: Record<CurveId, (x: number) => number> = {
  sine: (x) => 1.5 * Math.sin(x),
  step: (x) => (x < 2 ? -1 : x < 4 ? 1.2 : 0),
  quadratic: (x) => (x - 3) ** 2 / 3 - 1,
};

/** Gaussian noise from two uniforms (Box–Muller). */
const gaussian = (rng: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());

/** `n` points, x sorted in (0, 6), y = curve(x) + noise; rounded to hundredths. */
export function points({ curve, n, seed }: Pick<BoostInput, 'curve' | 'n' | 'seed'>): Vec[] {
  const rng = createRng(seed);
  const xs = Array.from({ length: n }, () => round(0.1 + rng() * (X_MAX - 0.2), 2)).sort((a, b) => a - b);
  return xs.map((x) => [x, round(TRUTH[curve](x) + gaussian(rng) * 0.25, 2)]);
}

/** A depth-1 regression tree: `left` below t, `right` at or above it. */
export type Stump = { t: number; left: number; right: number };
export const stumpAt = (s: Stump, x: number) => (x < s.t ? s.left : s.right);

const mean = (vs: readonly number[]) => vs.reduce((a, b) => a + b, 0) / vs.length;
const sse = (vs: readonly number[], c: number) => vs.reduce((s, v) => s + (v - c) ** 2, 0);

/** The least-squares stump for residuals r at sorted xs (ties keep the smaller threshold); null if all x are equal. */
export function bestStump(xs: readonly number[], r: readonly number[]): Stump | null {
  let best: (Stump & { err: number }) | null = null;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] === xs[i - 1]) continue;
    const t = (xs[i - 1] + xs[i]) / 2;
    const l = r.filter((_, j) => xs[j] < t);
    const g = r.filter((_, j) => xs[j] >= t);
    const left = mean(l);
    const right = mean(g);
    const err = sse(l, left) + sse(g, right);
    if (!best || err < best.err - 1e-12) best = { t, left, right, err };
  }
  return best && { t: best.t, left: best.left, right: best.right };
}

export type Boosting = { base: number; stumps: Stump[]; mse: number[] };

/** Runs every round ahead of time: the base, each round's stump, and the training MSE after each round (mse[0] is the base's). */
export function boost(pts: readonly Vec[], rate: number, rounds: number): Boosting {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const base = mean(ys);
  const F = ys.map(() => base);
  const stumps: Stump[] = [];
  const mse = [sse(ys.map((y, i) => y - F[i]), 0) / ys.length];
  for (let k = 0; k < rounds; k++) {
    const r = ys.map((y, i) => y - F[i]);
    const s = bestStump(xs, r);
    if (!s) break;
    stumps.push(s);
    xs.forEach((x, i) => (F[i] += rate * stumpAt(s, x)));
    mse.push(sse(ys.map((y, i) => y - F[i]), 0) / ys.length);
  }
  return { base, stumps, mse };
}

/** The ensemble's prediction after the first `k` stumps. */
export const predictWith = (b: Boosting, rate: number, k: number, x: number) => b.base + rate * b.stumps.slice(0, k).reduce((s, st) => s + stumpAt(st, x), 0);

const GRID = Array.from({ length: 241 }, (_, i) => (i * X_MAX) / 240);

function* run(input: BoostInput): Generator<Frame<PlotState>> {
  const { rate } = input;
  const pts = points(input);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const b = boost(pts, rate, input.rounds);
  const rounds = b.stumps.length;
  const lo = Math.min(...ys) - 0.6;
  const hi = Math.max(...ys) + 0.6;
  const residualsAfter = (k: number) => ys.map((y, i) => y - predictWith(b, rate, k, xs[i]));
  const rMax = Math.max(0.5, ...residualsAfter(0).map(Math.abs)) + 0.3;
  const stumpPath = (s: Stump, scale: number, offset = 0): Vec[] => [
    [0, offset + scale * s.left],
    [s.t, offset + scale * s.left],
    [s.t, offset + scale * s.right],
    [X_MAX, offset + scale * s.right],
  ];

  /** k stumps are in the model; `fitting` (if set) is the stump just fitted to the residuals of those k. */
  const scene = (k: number, fitting: Stump | null): PlotPart[] => {
    const model: Shape[] = [
      { kind: 'path', id: 'truth', points: GRID.map((x): Vec => [x, TRUTH[input.curve](x)]), faint: true, dashed: true },
      ...pts.map((p, i): Shape => ({ kind: 'point', id: `p${i}`, at: p, size: 'sm' })),
      { kind: 'path', id: 'model', points: GRID.map((x): Vec => [x, predictWith(b, rate, k, x)]), mark: 'found', label: 'F' },
    ];
    const r = residualsAfter(k);
    const bars: Bar[] = r.map((v, i) => ({ id: `r${i}`, x0: xs[i] - 0.05, x1: xs[i] + 0.05, y: v, y0: 0 }));
    const residualShapes: Shape[] = [{ kind: 'bars', id: 'residuals', bars }];
    if (fitting) residualShapes.push({ kind: 'path', id: 'stump', points: stumpPath(fitting, 1), mark: 'compare', label: 'stump' });
    const planes: PlanePart[] = [
      { kind: 'plane', id: 'plane', label: 'Data and the model F', x: { min: 0, max: X_MAX }, y: { min: lo, max: hi }, equal: false, shapes: model, handles: [] },
      { kind: 'plane', id: 'residuals', label: 'Residuals y − F(x)', x: { min: 0, max: X_MAX }, y: { min: -rMax, max: rMax }, equal: false, shapes: residualShapes, handles: [] },
      {
        kind: 'plane',
        id: 'loss',
        label: 'Training error after each round',
        x: { min: 0, max: Math.max(1, input.rounds), label: 'round' },
        y: { min: 0, max: b.mse[0] * 1.1 + 1e-9, label: 'MSE' },
        equal: false,
        shapes: [{ kind: 'path', id: 'mse', points: b.mse.slice(0, k + 1).map((m, j): Vec => [j, m]), mark: 'found', dots: true }],
        handles: [],
      },
    ];
    return [
      ...planes,
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Boosting',
        items: [
          { id: 'round', label: 'trees', value: String(k) },
          { id: 'mse', label: 'training MSE', value: fmt(b.mse[k], 4), mark: 'found' },
          { id: 'rate', label: 'η', value: fmt(rate) },
        ],
      },
    ];
  };

  const side = (s: Stump) => (s.t < MIDDLE ? 'Left' : 'Right');
  const askSide = (k: number) =>
    b.stumps[k] ? askInOrder(`Will the next stump split left or right of x = ${fmt(MIDDLE)}?`, ['Left', 'Right'], side(b.stumps[k])) : undefined;

  yield plotFrame(scene(0, null), {
    line: 0,
    note: `Boosting builds a strong model from weak ones. Start with the flattest guess there is, the mean of y (${fmt(b.base, 3)}), then add one tiny tree at a time, each fitted to what the model still gets wrong.`,
    vars: { rounds: 0, MSE: round(b.mse[0], 4) },
    stats: { trees: 0 },
    checkpoint: askSide(0),
  });

  for (let k = 0; k < rounds; k++) {
    const s = b.stumps[k];
    yield plotFrame(scene(k, s), {
      line: 3,
      note: `Round ${k + 1}: the residuals (bars) are the errors left over. The best single split for them is at x = ${fmt(s.t, 3)}: below it they average ${fmt(s.left, 3)}, above it ${fmt(s.right, 3)}.`,
      vars: { round: k + 1, t: round(s.t, 3), left: round(s.left, 3), right: round(s.right, 3) },
      stats: { trees: k },
      checkpoint: askInOrder('Once this stump is added, will the training error fall?', ['Yes', 'No'], b.mse[k + 1] < b.mse[k] - 1e-12 ? 'Yes' : 'No'),
    });
    const drop = b.mse[k] - b.mse[k + 1];
    yield plotFrame(scene(k + 1, null), {
      line: 4,
      note: `Add ${fmt(rate)} × the stump to F${
        rate < 1 ? ` (shrunk, so no single tree gets the final word)` : ''
      }: the training error falls from ${fmt(b.mse[k], 4)} to ${fmt(b.mse[k + 1], 4)}${drop < 1e-3 ? ', barely: the easy errors are fixed and what remains is mostly noise' : ''}.`,
      vars: { round: k + 1, MSE: round(b.mse[k + 1], 4) },
      stats: { trees: k + 1 },
      checkpoint: askSide(k + 1),
    });
  }

  yield plotFrame(scene(rounds, null), {
    line: 5,
    note: `${rounds} stumps, each fixing what the ones before got wrong, turn a flat line into a staircase that follows the ${input.curve} curve (dashed): training error ${fmt(b.mse[0], 3)} → ${fmt(b.mse[rounds], 3)}. ${
      rate < 0.5
        ? 'A small learning rate takes more rounds but each tree changes the model gently, which usually generalises better.'
        : rate >= 1
          ? 'With η = 1 each tree is added in full: fast, but later trees start fitting the noise.'
          : 'Lowering η needs more rounds but makes each step gentler; raising it learns faster and overfits sooner.'
    }`,
    vars: { trees: rounds, MSE: round(b.mse[rounds], 4) },
    stats: { trees: rounds },
  });
}

const example = (id: string, label: string, curve: CurveId, rate: number) => ({
  id,
  label,
  make: ({ seed, size }: { seed: number; size: number }): BoostInput => ({ curve, n: 30, seed, rate, rounds: Math.min(MAX_ROUNDS, Math.max(1, size)) }),
});

export const gradientBoosting = defineAlgorithm<BoostInput, PlotState>({
  kind: 'algorithm',
  slug: 'gradient-boosting',
  view: 'plot',
  input: {
    examples: [
      example('sine', 'Sine wave', 'sine', 0.5),
      example('step', 'Steps', 'step', 0.5),
      example('quadratic', 'Parabola', 'quadratic', 0.5),
      example('slow', 'Small learning rate', 'sine', 0.2),
      example('full', 'Learning rate 1', 'sine', 1),
    ],
    size: { label: 'Rounds', min: 1, max: MAX_ROUNDS, default: 10 },
    custom: {
      label: 'Curve (sine, step, quadratic), learning rate, rounds, points, seed',
      placeholder: 'e.g. sine, rate = 0.5, rounds = 10, n = 30, seed = 7',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
        const curve = CURVES.find((c) => c === word);
        if (!curve) return { error: 'Start with a curve: sine, step or quadratic.' };
        const xs = numbersIn(text.slice(word.length));
        if (xs.length < 2 || xs.length > 4) return { error: 'Then give the learning rate and the rounds, and optionally the points and a seed.' };
        const [rate, rounds, n = 30, seed = 7] = xs;
        if (!(rate > 0 && rate <= 1)) return { error: 'The learning rate must be above 0 and at most 1.' };
        if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) return { error: `Use 1 to ${MAX_ROUNDS} rounds.` };
        if (!Number.isInteger(n) || n < 4 || n > MAX_POINTS) return { error: `Use 4 to ${MAX_POINTS} points.` };
        if (!Number.isInteger(seed) || seed < 0) return { error: 'The seed must be a whole number of 0 or more.' };
        return { value: { curve, n, seed, rate: round(rate, 2), rounds } };
      },
      format: ({ curve, n, seed, rate, rounds }) => `${curve}, rate = ${plain(rate)}, rounds = ${rounds}, n = ${n}, seed = ${seed}`,
    },
  },
  pseudocode,
  stats: [{ key: 'trees', label: 'Trees added' }],
  legend: [
    { neutral: 'Data points and residuals' },
    { mark: 'found', label: 'The model F and its error' },
    { mark: 'compare', label: 'The stump fitted this round' },
  ],
  run,
  content: {
    idea: 'Gradient boosting adds up many weak models. Start from a flat guess; each round, look at the residuals (what the model still gets wrong), fit a tiny tree to them, and add a shrunk copy of it. Each tree fixes part of what the previous ones missed.',
    invariant: 'F is always the base guess plus η times the sum of the stumps. Each stump is the least-squares fit to the current residuals, so with 0 < η ≤ 1 the training error never goes up.',
    whenToUse: 'The go-to method for tabular data (XGBoost, LightGBM, CatBoost win most tabular competitions). Fitting residuals is gradient descent on squared error in function space; other losses fit their own gradients. Tune the learning rate and the number of rounds together, and stop before it fits the noise.',
    traits: [
      { label: 'Weak learners, strong ensemble', good: true },
      { label: 'Training error never rises', good: true },
      { label: 'Too many rounds overfit', good: false },
    ],
    experiments: [
      { example: 'step', prompt: 'A step function is made of jumps, exactly what stumps are good at: the first few rounds land them.' },
      { example: 'slow', prompt: 'With η = 0.2 each stump moves F only a little. Compare how fast the error falls with η = 1.' },
      { example: 'full', prompt: 'With η = 1 the early rounds fix big errors fast, then later stumps chase single noisy points.' },
      { example: 'sine', prompt: 'A smooth curve becomes a staircase of stumps. More rounds make the staircase finer.' },
    ],
  },
});

// Milestone project M3, "A classifier, judged honestly" (B7 of the math and ML
// path, closing stage 3): softmax regression on three classes of 2D points,
// trained with the learner's own minibatch SGD, then judged two ways: a
// confusion matrix with accuracy, precision and recall, and k-fold
// cross-validation, which scores every point with a model that never saw it.
//
// Four parts, each starter carrying the earlier parts written out (as M1 and
// M2 do): one SGD step for softmax regression, training with minibatches, the
// confusion matrix, and cross-validation. The shuffles use the Park-Miller
// generator every math and ML exercise shares (B6's `minibatches`), and the
// folds are the overfitting lesson's `k_fold`. Judged tests run in judge mode
// on the project budget.
//
// Python's math.exp and JavaScript's Math.exp can differ in the last bit, so
// the losses drawn are rounded to 6 places, returned weights are compared
// with a tolerance, and the counts and accuracies (whole numbers and their
// ratios) agree exactly.

import { createRng } from '@/engine/random';
import type { Arg, RunResult } from '@/workspace/protocol';
import { minibatches } from './sgd';
import { crashed, type Exercise, type Verdict } from './shared';

type Matrix = readonly (readonly number[])[];
export type Model = { W: number[][]; b: number[] };

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const isMatrix = (x: unknown): x is number[][] => Array.isArray(x) && x.length > 0 && x.every(isNumbers);
/** a and b agree to `tol` of their size (and to `tol` near 0). */
const near = (a: number, b: number, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const sameList = (a: readonly number[], b: readonly number[], tol = 1e-9) => a.length === b.length && b.every((v, i) => near(a[i], v, tol));
const sameMatrix = (a: Matrix, b: Matrix, tol = 1e-9) => a.length === b.length && b.every((row, i) => sameList(a[i], row, tol));
const fmt = (v: number, digits = 4) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[], digits = 4) => `[${vs.map((v) => fmt(v, digits)).join(', ')}]`;
const grid = (rows: Matrix, digits = 4) => `[${rows.map((r) => list(r, digits)).join(', ')}]`;
const pct = (v: number) => `${fmt(100 * v, 1)}%`;
const zeros = (rows: number, cols: number) => Array.from({ length: rows }, () => Array<number>(cols).fill(0));

// ───────────────────────────── the data ─────────────────────────────

const DATA_SEED = 303;
/** Points per class. */
export const PER_CLASS = 30;
export const CLASSES = 3;

/**
 * 90 points in three overlapping clouds (classes 0, 1, 2 taking turns), the
 * clouds' centres 1.4 from the origin at 90°, 210° and 330°, each point spread
 * about 0.8 around its centre. Fixed, rounded to hundredths.
 */
export const DATA: { X: number[][]; y: number[] } = (() => {
  const u = createRng(DATA_SEED);
  const z = () => (u() + u() + u() + u() - 2) * Math.sqrt(3);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < PER_CLASS * CLASSES; i++) {
    const c = i % CLASSES;
    const angle = Math.PI / 2 + (2 * Math.PI * c) / CLASSES;
    X.push([Math.round((1.4 * Math.cos(angle) + 0.8 * z()) * 100) / 100, Math.round((1.4 * Math.sin(angle) + 0.8 * z()) * 100) / 100]);
    y.push(c);
  }
  return { X, y };
})();

const firstN = (n: number) => ({ X: DATA.X.slice(0, n), y: DATA.y.slice(0, n) });

// ───────────────────────────── the reference maths ─────────────────────────────

/** z[c] = W[c] · x + b[c], added up in the order the learner's loops add. */
export function logitsOf(W: Matrix, b: readonly number[], x: readonly number[]): number[] {
  return W.map((row, c) => {
    let s = 0;
    for (let j = 0; j < x.length; j++) s += row[j] * x[j];
    return s + b[c];
  });
}

/** The stable softmax: subtract the largest logit, exponentiate, divide by the sum. */
export function softmaxOf(z: readonly number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  let total = 0;
  for (const v of e) total += v;
  return e.map((v) => v / total);
}

/** The class with the biggest logit (the first, on a tie). */
export function predictOf(W: Matrix, b: readonly number[], x: readonly number[]): number {
  const z = logitsOf(W, b, x);
  let best = 0;
  for (let c = 1; c < z.length; c++) if (z[c] > z[best]) best = c;
  return best;
}

/** The mean cross-entropy, −ln p(true class), over the points. */
export function meanLossOf(W: Matrix, b: readonly number[], X: Matrix, y: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < X.length; i++) total += -Math.log(softmaxOf(logitsOf(W, b, X[i]))[y[i]]);
  return total / X.length;
}

export const accuracyOf = (W: Matrix, b: readonly number[], X: Matrix, y: readonly number[]) => X.filter((x, i) => predictOf(W, b, x) === y[i]).length / X.length;

// ───────────────────────────── 1. softmax-step (M3, part 1) ─────────────────────────────

export type StepInput = { W: number[][]; b: number[]; X: number[][]; y: number[]; batch: number[]; lr: number };

/**
 * One SGD step, the right way and the usual slips, so a wrong answer can be named.
 * - no-onehot: g = p, the true class's 1 never subtracted.
 * - climb: stepping with + lr (or g = onehot − p): uphill.
 * - sum: the gradients added up but never divided by the batch's size.
 * - divide-all: divided by every point's count, not the batch's.
 * - per-point: W and b updated after every point, a step per point.
 * - no-softmax: g = z − onehot, the logits used as if they were probabilities.
 */
export type StepSlip = 'right' | 'no-onehot' | 'climb' | 'sum' | 'divide-all' | 'per-point' | 'no-softmax';

export function softmaxStep({ W, b, X, y, batch, lr }: StepInput, slip: StepSlip = 'right'): Model & { losses: number[] } {
  let w = W.map((r) => [...r]);
  let c0 = [...b];
  const K = W.length;
  const D = X[0].length;
  const gW = zeros(K, D);
  const gb = Array<number>(K).fill(0);
  const losses: number[] = [];
  for (const i of batch) {
    const z = logitsOf(w, c0, X[i]);
    const p = softmaxOf(z);
    losses.push(-Math.log(p[y[i]]));
    const g = (slip === 'no-softmax' ? z : p).map((v, c) => v - (slip === 'no-onehot' ? 0 : c === y[i] ? 1 : 0));
    if (slip === 'per-point') {
      w = w.map((row, c) => row.map((v, j) => v - lr * g[c] * X[i][j]));
      c0 = c0.map((v, c) => v - lr * g[c]);
      continue;
    }
    for (let c = 0; c < K; c++) {
      for (let j = 0; j < D; j++) gW[c][j] += g[c] * X[i][j];
      gb[c] += g[c];
    }
  }
  if (slip === 'per-point') return { W: w, b: c0, losses };
  const n = slip === 'sum' ? 1 : slip === 'divide-all' ? X.length : batch.length;
  const sign = slip === 'climb' ? -1 : 1;
  return {
    W: W.map((row, c) => row.map((v, j) => v - (sign * lr * gW[c][j]) / n)),
    b: b.map((v, c) => v - (sign * lr * gb[c]) / n),
    losses,
  };
}

const IMPORT_PY = 'import math\n';
const SOFTMAX_NOTE_PY = '# Written out for you: your stable softmax from the bug hunt.\n';
const SOFTMAX_NOTE_JS = '// Written out for you: your stable softmax from the bug hunt.\n';
const SOFTMAX_PY = `def softmax(logits):
    m = max(logits)
    exps = [math.exp(z - m) for z in logits]
    total = sum(exps)
    return [e / total for e in exps]
`;
const SOFTMAX_JS = `function softmax(logits) {
  const m = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - m));
  let total = 0;
  for (const e of exps) total += e;
  return exps.map((e) => e / total);
}
`;

const STEP_PY = `def softmax_step(W, b, X, y, batch, lr, losses):
    classes = len(W)
    features = len(X[0])
    grad_W = [[0] * features for _ in range(classes)]
    grad_b = [0] * classes
    for k in range(len(batch)):
        i = batch[k]
        z = [sum(W[c][j] * X[i][j] for j in range(features)) + b[c] for c in range(classes)]
        p = softmax(z)
        losses[k] = round(-math.log(p[y[i]]), 6)
        for c in range(classes):
            g = p[c] - (1 if c == y[i] else 0)
            for j in range(features):
                grad_W[c][j] += g * X[i][j]
            grad_b[c] += g
    n = len(batch)
    new_W = [[W[c][j] - lr * grad_W[c][j] / n for j in range(features)] for c in range(classes)]
    new_b = [b[c] - lr * grad_b[c] / n for c in range(classes)]
    return [new_W, new_b]
`;
const STEP_JS = `function softmaxStep(W, b, X, y, batch, lr, losses) {
  const classes = W.length;
  const features = X[0].length;
  const gradW = W.map((row) => row.map(() => 0));
  const gradB = b.map(() => 0);
  for (let k = 0; k < batch.length; k++) {
    const i = batch[k];
    const z = [];
    for (let c = 0; c < classes; c++) {
      let s = 0;
      for (let j = 0; j < features; j++) s += W[c][j] * X[i][j];
      z.push(s + b[c]);
    }
    const p = softmax(z);
    losses[k] = Math.round(-Math.log(p[y[i]]) * 1e6) / 1e6;
    for (let c = 0; c < classes; c++) {
      const g = p[c] - (c === y[i] ? 1 : 0);
      for (let j = 0; j < features; j++) gradW[c][j] += g * X[i][j];
      gradB[c] += g;
    }
  }
  const n = batch.length;
  const newW = W.map((row, c) => row.map((w, j) => w - (lr * gradW[c][j]) / n));
  const newB = b.map((v, c) => v - (lr * gradB[c]) / n);
  return [newW, newB];
}
`;
const STEP_STARTER_PY = `def softmax_step(W, b, X, y, batch, lr, losses):
    classes = len(W)
    features = len(X[0])
    grad_W = [[0] * features for _ in range(classes)]
    grad_b = [0] * classes
    for k in range(len(batch)):
        i = batch[k]
        # 1. The logits: z[c] = W[c] · X[i] + b[c], one per class; p = softmax(z).
        # 2. Record this point's loss for the picture:
        #        losses[k] = round(-math.log(p[y[i]]), 6)
        # 3. For each class c, g = p[c] - 1 if c is the true class y[i], else p[c].
        #    Add g * X[i][j] to grad_W[c][j] for every feature j, and g to grad_b[c].
        pass
    # 4. Divide both gradients by the batch's size and step against them.
    return [W, b]
`;
const STEP_STARTER_JS = `function softmaxStep(W, b, X, y, batch, lr, losses) {
  const classes = W.length;
  const features = X[0].length;
  const gradW = W.map((row) => row.map(() => 0));
  const gradB = b.map(() => 0);
  for (let k = 0; k < batch.length; k++) {
    const i = batch[k];
    // 1. The logits: z[c] = W[c] · X[i] + b[c], one per class; p = softmax(z).
    // 2. Record this point's loss for the picture:
    //        losses[k] = Math.round(-Math.log(p[y[i]]) * 1e6) / 1e6;
    // 3. For each class c, g = p[c] - 1 if c is the true class y[i], else p[c].
    //    Add g * X[i][j] to gradW[c][j] for every feature j, and g to gradB[c].
  }
  // 4. Divide both gradients by the batch's size and step against them.
  return [W, b];
}
`;

const SIG = {
  softmax: ['function softmax(logits) {', 'function softmax(logits: number[]): number[] {'],
  step: ['function softmaxStep(W, b, X, y, batch, lr, losses) {', 'function softmaxStep(W: number[][], b: number[], X: number[][], y: number[], batch: number[], lr: number, losses: number[]): [number[][], number[]] {'],
  stepPlain: ['function softmaxStep(W, b, X, y, batch, lr) {', 'function softmaxStep(W: number[][], b: number[], X: number[][], y: number[], batch: number[], lr: number): [number[][], number[]] {'],
  next: ['function nextState(state) {', 'function nextState(state: number): number {'],
  batches: ['function minibatches(n, batch, epochs, seed) {', 'function minibatches(n: number, batch: number, epochs: number, seed: number): number[][] {'],
  meanLoss: ['function meanLoss(W, b, X, y) {', 'function meanLoss(W: number[][], b: number[], X: number[][], y: number[]): number {'],
  train: ['function train(X, y, classes, epochs, batchSize, lr, seed, losses) {', 'function train(X: number[][], y: number[], classes: number, epochs: number, batchSize: number, lr: number, seed: number, losses: number[]): [number[][], number[]] {'],
  trainPlain: ['function train(X, y, classes, epochs, batchSize, lr, seed) {', 'function train(X: number[][], y: number[], classes: number, epochs: number, batchSize: number, lr: number, seed: number): [number[][], number[]] {'],
  predict: ['function predict(W, b, x) {', 'function predict(W: number[][], b: number[], x: number[]): number {'],
  confusion: ['function confusionMatrix(W, b, X, y) {', 'function confusionMatrix(W: number[][], b: number[], X: number[][], y: number[]): [number[][], number, number[], number[]] {'],
  kFold: ['function kFold(n, k) {', 'function kFold(n: number, k: number): number[][] {'],
  cv: ['function crossValidate(X, y, classes, k, epochs, batchSize, lr, seed, scores) {', 'function crossValidate(X: number[][], y: number[], classes: number, k: number, epochs: number, batchSize: number, lr: number, seed: number, scores: number[]): number[] {'],
} as const;

/** TypeScript: the JavaScript with its functions' signatures and empty lists typed. */
const toTs = (js: string) => {
  let ts = js;
  for (const [from, to] of Object.values(SIG)) ts = ts.split(from).join(to);
  return ts
    .split('const z = [];').join('const z: number[] = [];')
    .split('const batches = [];').join('const batches: number[][] = [];')
    .split('const folds = [];').join('const folds: number[][] = [];')
    .split('const held = [];').join('const held: number[] = [];')
    .split('const rest = [];').join('const rest: number[] = [];')
    .split('const precision = [];').join('const precision: number[] = [];')
    .split('const recall = [];').join('const recall: number[] = [];');
};

const stepArgs = ({ W, b, X, y, batch, lr }: StepInput): Arg[] => [
  { kind: 'value', name: 'W', value: W },
  { kind: 'value', name: 'b', value: b },
  { kind: 'value', name: 'X', value: X },
  { kind: 'value', name: 'y', value: y },
  { kind: 'value', name: 'batch', value: batch },
  { kind: 'value', name: 'lr', value: lr },
  { kind: 'array', name: 'losses', values: batch.map(() => 0) },
];

/** The learner's array `name` at the end of the run: from its visual events, or (in judge mode) the argument's final value. */
function finalList(result: RunResult, name: string, args: readonly Arg[]): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  if (made && made.kind === 'array') return result.arrays[made.array] ?? null;
  const v = result.args?.[args.findIndex((a) => a.name === name)];
  return isNumbers(v) ? v : null;
}

/** The returned [W, b], if it has that shape. */
function returnedModel(got: unknown, K: number, D: number): Model | null {
  if (!Array.isArray(got) || got.length !== 2 || !isMatrix(got[0]) || !isNumbers(got[1])) return null;
  const [W, b] = got as [number[][], number[]];
  if (W.length !== K || W.some((r) => r.length !== D) || b.length !== K) return null;
  return { W, b };
}

function checkStep(input: StepInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const K = input.W.length;
  const D = input.X[0].length;
  const got = returnedModel(result.returned, K, D);
  if (!got) return { pass: false, message: `Return [new_W, new_b]: W as ${K} rows of ${D} weights (one row per class), and b as ${K} numbers.` };
  const want = softmaxStep(input);
  const is = (slip: StepSlip) => {
    const s = softmaxStep(input, slip);
    return sameMatrix(got.W, s.W) && sameList(got.b, s.b);
  };
  const n = input.batch.length;
  if (sameMatrix(got.W, want.W) && sameList(got.b, want.b)) {
    const losses = finalList(result, 'losses', stepArgs(input));
    if (losses && losses.every((v) => v === 0)) return { pass: false, message: 'The step is right, but losses is still all 0: write each point’s loss, −log of the probability it gives the true class, into losses[k], rounded to 6 places.' };
    if (losses) {
      const bad = losses.findIndex((v, k) => !near(v, want.losses[k], 1e-5));
      if (bad >= 0) return { pass: false, message: `The step is right, but losses[${bad}] should be −log p(true class) for point ${input.batch[bad]}, ${fmt(want.losses[bad], 6)}; yours is ${fmt(losses[bad], 6)}.` };
    }
    return {
      pass: true,
      message: `On ${n} point${n === 1 ? '' : 's'} the step moves b from ${list(input.b)} to ${list(want.b)}, and W to ${grid(want.W)}. The batch’s mean loss was ${fmt(want.losses.reduce((s, v) => s + v, 0) / n)}.`,
    };
  }
  if (is('no-onehot')) return { pass: false, message: 'Every class was pushed down, the true one too: g must be p[c] − 1 for the true class c = y[i], and p[c] for the others. The −1 is what pulls the true class’s score up.' };
  if (is('climb')) return { pass: false, message: 'The step went uphill: the loss’s gradient is p − onehot (the probabilities minus 1 at the true class), and the step goes against it, W − lr × gradient. Check the sign of g and of the update.' };
  if (n > 1 && is('sum')) return { pass: false, message: `You added up the ${n} points’ gradients but never divided by ${n}, so the step is ${n} times too long. The loss is a mean over the batch, so its gradient is a mean too.` };
  if (n < input.X.length && is('divide-all')) return { pass: false, message: `You divided by ${input.X.length}, every point in X, but the sum is over the ${n} points in the batch: divide by len(batch).` };
  if (n > 1 && is('per-point')) return { pass: false, message: `You updated W and b after every point: ${n} little steps instead of one. Add up the gradient over the whole batch first, then step once, after the loop.` };
  if (is('no-softmax')) return { pass: false, message: 'g used the logits z themselves. The gradient of the cross-entropy is the probabilities minus the one-hot label: p = softmax(z) first, then g = p[c] − (1 if c is the true class else 0).' };
  return {
    pass: false,
    message: `The step should give b = ${list(want.b)} and W = ${grid(want.W)}, but yours gives b = ${list(got.b)} and W = ${grid(got.W)}. For each point: z = W·x + b, p = softmax(z), g = p minus 1 at the true class; add g[c]·x[j] to grad_W[c][j] and g[c] to grad_b[c]; then divide by the batch’s size and subtract lr times each.`,
  };
}

const Z3 = () => zeros(3, 2);
const STEP_TESTS: { name: string; input: StepInput }[] = [
  { name: 'one point from all zeros', input: { W: Z3(), b: [0, 0, 0], X: [[1, 2]], y: [1], batch: [0], lr: 0.5 } },
  { name: 'three made-up points, a batch of two', input: { W: Z3(), b: [0, 0, 0], X: [[1, 0], [0, 1], [-1, -1]], y: [0, 1, 2], batch: [0, 2], lr: 1 } },
  { name: 'the first 4 points of the data', input: { W: Z3(), b: [0, 0, 0], X: DATA.X, y: DATA.y, batch: [0, 1, 2, 3], lr: 0.5 } },
  { name: 'a batch of 10 from part-trained weights', input: { W: [[0.4, 1.1], [-0.9, -0.5], [0.6, -0.7]], b: [0.1, -0.2, 0.05], X: DATA.X, y: DATA.y, batch: [5, 17, 33, 2, 61, 40, 89, 12, 70, 28], lr: 0.3 } },
  { name: 'confident and wrong: big weights', input: { W: [[-4, 0], [4, 0], [0, 0]], b: [0, 0, 0], X: [[3, 1], [-2, 2]], y: [0, 1], batch: [0, 1], lr: 0.1 } },
];

const stepExercise: Exercise<StepInput> = {
  slug: 'softmax-step',
  title: 'A classifier, part 1: one SGD step for softmax regression',
  kind: 'write',
  visualiser: 'softmax',
  summary: 'Work out the cross-entropy’s gradient for a batch of points, the probabilities minus the one-hot labels, and step a softmax classifier’s weights against it.',
  task: [
    'Part 1 of the project “A classifier, judged honestly”. A softmax classifier for K classes has a row of weights `W[c]` and a bias `b[c]` per class. For a point x its logits are z[c] = W[c] · x + b[c], and softmax turns them into probabilities p. Its loss on a point is the cross-entropy, −log p[y], where y is the true class.',
    'The gradient of that loss with respect to z is simple: g[c] = p[c] − 1 for the true class and p[c] for every other class (the probabilities minus the one-hot label). Since z[c] = W[c] · x + b[c], the gradient for W[c][j] is g[c] · x[j], and for b[c] it is g[c].',
    'Write `softmax_step(W, b, X, y, batch, lr, losses)` (`softmaxStep` in JavaScript and TypeScript): one SGD step on the points whose indices are in `batch`. Add up the gradients over the batch, divide by its size, and return `[new_W, new_b]`, each weight moved against its gradient by `lr` times it. Write each point’s loss into `losses[k]`, rounded to 6 places, so the run shows which points the model gets most wrong. `softmax` is written out above.',
  ],
  entry: { python: 'softmax_step', js: 'softmaxStep' },
  args: stepArgs,
  starter: {
    python: `${IMPORT_PY}\n${SOFTMAX_NOTE_PY}${SOFTMAX_PY}\n\n${STEP_STARTER_PY}`,
    javascript: `${SOFTMAX_NOTE_JS}${SOFTMAX_JS}\n${STEP_STARTER_JS}`,
    typescript: toTs(`${SOFTMAX_NOTE_JS}${SOFTMAX_JS}\n${STEP_STARTER_JS}`),
  },
  solution: {
    python: `${IMPORT_PY}\n${SOFTMAX_NOTE_PY}${SOFTMAX_PY}\n\n${STEP_PY}`,
    javascript: `${SOFTMAX_NOTE_JS}${SOFTMAX_JS}\n${STEP_JS}`,
    typescript: toTs(`${SOFTMAX_NOTE_JS}${SOFTMAX_JS}\n${STEP_JS}`),
  },
  examples: [
    { id: 'four', label: 'The first 4 points, from all zeros', input: STEP_TESTS[2].input },
    { id: 'confident', label: 'Two points, big weights', input: STEP_TESTS[4].input },
  ],
  tests: STEP_TESTS,
  check: checkStep,
  markSortedAtEnd: false,
  pointers: ['k'],
  hints: [
    'Inside the loop, z is a list with one logit per class: for c in range(classes), add up W[c][j] * X[i][j] over the features j, then add b[c].',
    'g = p[c] - 1 when c == y[i], else p[c]. Add g * X[i][j] into grad_W[c][j] and g into grad_b[c].',
    'After the loop, every new weight is W[c][j] - lr * grad_W[c][j] / len(batch), and every new bias b[c] - lr * grad_b[c] / len(batch). Make new lists; don’t step inside the loop.',
  ],
  legend: [
    { neutral: 'A loss not worked out yet (0)' },
    { mark: 'write', label: 'The loss just worked out: −log p(true class)' },
  ],
  judge: { budget: 'project' },
};

// ───────────────────────────── 2. train-softmax (M3, part 2) ─────────────────────────────

export type TrainInput = { X: number[][]; y: number[]; classes: number; epochs: number; batchSize: number; lr: number; seed: number };

/**
 * Training, the right way and the usual slips.
 * - right: start at zeros, step through every batch of every epoch, the loss over all the data after each epoch.
 * - one-epoch: only the first epoch's batches.
 * - loss-before: each epoch's loss recorded before its steps, so the first is the untrained loss.
 */
export type TrainSlip = 'right' | 'one-epoch' | 'loss-before';

export function trainSoftmax({ X, y, classes, epochs, batchSize, lr, seed }: TrainInput, slip: TrainSlip = 'right'): Model & { losses: number[] } {
  let model: Model = { W: zeros(classes, X[0].length), b: Array<number>(classes).fill(0) };
  const batches = minibatches({ n: X.length, batch: batchSize, epochs, seed });
  const perEpoch = batches.length / epochs;
  const losses: number[] = [];
  const steps = slip === 'one-epoch' ? perEpoch : batches.length;
  for (let t = 0; t < steps; t++) {
    if (slip === 'loss-before' && t % perEpoch === 0) losses.push(meanLossOf(model.W, model.b, X, y));
    model = softmaxStep({ ...model, X, y, batch: batches[t], lr });
    if (slip !== 'loss-before' && (t + 1) % perEpoch === 0) losses.push(meanLossOf(model.W, model.b, X, y));
  }
  return { ...model, losses };
}

const NEXT_PY = `def next_state(state):
    return (16807 * state) % 2147483647
`;
const NEXT_JS = `function nextState(state) {
  return (16807 * state) % 2147483647;
}
`;
const BATCHES_PY = `def minibatches(n, batch, epochs, seed):
    state = seed
    order = list(range(n))
    batches = []
    for epoch in range(epochs):
        for i in range(n - 1, 0, -1):
            state = next_state(state)
            j = int(state / 2147483647 * (i + 1))
            order[i], order[j] = order[j], order[i]
        for start in range(0, n, batch):
            batches.append(order[start:start + batch])
    return batches
`;
const BATCHES_JS = `function minibatches(n, batch, epochs, seed) {
  let state = seed;
  const order = Array.from({ length: n }, (_, i) => i);
  const batches = [];
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = n - 1; i > 0; i--) {
      state = nextState(state);
      const j = Math.floor(state / 2147483647 * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let start = 0; start < n; start += batch) {
      batches.push(order.slice(start, start + batch));
    }
  }
  return batches;
}
`;
/** Part 1 without its losses picture, for the later parts. */
const STEP_PLAIN_PY = STEP_PY.replace('def softmax_step(W, b, X, y, batch, lr, losses):', 'def softmax_step(W, b, X, y, batch, lr):').replace('        losses[k] = round(-math.log(p[y[i]]), 6)\n', '');
const STEP_PLAIN_JS = STEP_JS.replace('function softmaxStep(W, b, X, y, batch, lr, losses) {', 'function softmaxStep(W, b, X, y, batch, lr) {').replace('    losses[k] = Math.round(-Math.log(p[y[i]]) * 1e6) / 1e6;\n', '');

const HELPERS_2_PY = `${IMPORT_PY}
# Written out for you: next_state and minibatches (from the SGD lesson, with
# a plain list for order), your stable softmax, and softmax_step from part 1
# (without its losses picture).
${NEXT_PY}

${BATCHES_PY}

${SOFTMAX_PY}

${STEP_PLAIN_PY}`;
const HELPERS_2_JS = `// Written out for you: nextState and minibatches (from the SGD lesson, with
// a plain list for order), your stable softmax, and softmaxStep from part 1
// (without its losses picture).
${NEXT_JS}
${BATCHES_JS}
${SOFTMAX_JS}
${STEP_PLAIN_JS}`;

const MEAN_LOSS_PY = `def mean_loss(W, b, X, y):
    total = 0
    for i in range(len(X)):
        z = [sum(W[c][j] * X[i][j] for j in range(len(X[i]))) + b[c] for c in range(len(W))]
        p = softmax(z)
        total += -math.log(p[y[i]])
    return total / len(X)
`;
const MEAN_LOSS_JS = `function meanLoss(W, b, X, y) {
  let total = 0;
  for (let i = 0; i < X.length; i++) {
    const z = [];
    for (let c = 0; c < W.length; c++) {
      let s = 0;
      for (let j = 0; j < X[i].length; j++) s += W[c][j] * X[i][j];
      z.push(s + b[c]);
    }
    const p = softmax(z);
    total += -Math.log(p[y[i]]);
  }
  return total / X.length;
}
`;
const TRAIN_PY = `def train(X, y, classes, epochs, batch_size, lr, seed, losses):
    features = len(X[0])
    W = [[0] * features for _ in range(classes)]
    b = [0] * classes
    batches = minibatches(len(X), batch_size, epochs, seed)
    per_epoch = len(batches) // epochs
    for t in range(len(batches)):
        W, b = softmax_step(W, b, X, y, batches[t], lr)
        if (t + 1) % per_epoch == 0:
            losses[(t + 1) // per_epoch - 1] = round(mean_loss(W, b, X, y), 6)
    return [W, b]
`;
const TRAIN_JS = `function train(X, y, classes, epochs, batchSize, lr, seed, losses) {
  const features = X[0].length;
  let W = Array.from({ length: classes }, () => Array(features).fill(0));
  let b = Array(classes).fill(0);
  const batches = minibatches(X.length, batchSize, epochs, seed);
  const perEpoch = batches.length / epochs;
  for (let t = 0; t < batches.length; t++) {
    [W, b] = softmaxStep(W, b, X, y, batches[t], lr);
    if ((t + 1) % perEpoch === 0) {
      losses[(t + 1) / perEpoch - 1] = Math.round(meanLoss(W, b, X, y) * 1e6) / 1e6;
    }
  }
  return [W, b];
}
`;
const TRAIN_STARTER_PY = `def mean_loss(W, b, X, y):
    # The mean, over every point i, of -math.log(p[y[i]]),
    # where p = softmax of point i's logits.
    return 0


def train(X, y, classes, epochs, batch_size, lr, seed, losses):
    features = len(X[0])
    W = [[0] * features for _ in range(classes)]
    b = [0] * classes
    batches = minibatches(len(X), batch_size, epochs, seed)
    # Take one softmax_step per batch, keeping the W and b it returns.
    # After the last batch of each epoch, write the mean loss over all
    # the data, rounded to 6 places, into losses[epoch].
    return [W, b]
`;
const TRAIN_STARTER_JS = `function meanLoss(W, b, X, y) {
  // The mean, over every point i, of -Math.log(p[y[i]]),
  // where p = softmax of point i's logits.
  return 0;
}

function train(X, y, classes, epochs, batchSize, lr, seed, losses) {
  const features = X[0].length;
  let W = Array.from({ length: classes }, () => Array(features).fill(0));
  let b = Array(classes).fill(0);
  const batches = minibatches(X.length, batchSize, epochs, seed);
  // Take one softmaxStep per batch, keeping the W and b it returns.
  // After the last batch of each epoch, write the mean loss over all
  // the data, rounded to 6 places, into losses[epoch].
  return [W, b];
}
`;

const trainArgs = ({ X, y, classes, epochs, batchSize, lr, seed }: TrainInput): Arg[] => [
  { kind: 'value', name: 'X', value: X },
  { kind: 'value', name: 'y', value: y },
  { kind: 'value', name: 'classes', value: classes },
  { kind: 'value', name: 'epochs', value: epochs },
  { kind: 'value', name: 'batch_size', value: batchSize },
  { kind: 'value', name: 'lr', value: lr },
  { kind: 'value', name: 'seed', value: seed },
  { kind: 'array', name: 'losses', values: Array<number>(epochs).fill(0) },
];

/** Weights after many steps: Python's and JavaScript's exp may part in the last bit, and the steps carry it on. */
const TRAINED = 1e-6;

function checkTrain(input: TrainInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const { X, y, classes, epochs } = input;
  const got = returnedModel(result.returned, classes, X[0].length);
  if (!got) return { pass: false, message: `Return [W, b]: W as ${classes} rows of ${X[0].length} weights, and b as ${classes} numbers.` };
  const want = trainSoftmax(input);
  const same = (m: Model) => sameMatrix(got.W, m.W, TRAINED) && sameList(got.b, m.b, TRAINED);
  if (!same(want)) {
    if (got.W.every((r) => r.every((v) => v === 0)) && got.b.every((v) => v === 0)) return { pass: false, message: 'W and b are still all zeros: softmax_step returns the new [W, b], so keep them, W, b = softmax_step(…), and pass them to the next step.' };
    if (epochs > 1 && same(trainSoftmax(input, 'one-epoch'))) {
      const total = minibatches({ n: X.length, batch: input.batchSize, epochs, seed: input.seed }).length;
      return { pass: false, message: `Only the first epoch’s batches were used. minibatches returns every epoch’s batches one after another, ${total} in all: step through every one.` };
    }
    return { pass: false, message: `After ${epochs} epoch${epochs === 1 ? '' : 's'} b should be ${list(want.b)} and W ${grid(want.W)}, but yours are ${list(got.b)} and ${grid(got.W)}. Start from zeros, take one softmax_step per batch in the order minibatches gives them, and keep what each returns.` };
  }
  const losses = finalList(result, 'losses', trainArgs(input));
  if (losses) {
    if (losses.every((v) => v === 0)) return { pass: false, message: 'The weights are right, but losses is still all 0: after the last batch of each epoch, write mean_loss over all the data into losses[epoch].' };
    const before = trainSoftmax(input, 'loss-before').losses;
    if (sameList(losses, before, 1e-5)) return { pass: false, message: `The weights are right, but each loss was measured before its epoch’s steps: losses[0] is ${fmt(before[0])}, the loss of the untrained model (ln ${classes}). Measure after each epoch’s last step.` };
    const bad = losses.findIndex((v, e) => !near(v, want.losses[e], 1e-5));
    if (bad >= 0) return { pass: false, message: `The weights are right, but losses[${bad}] should be the mean cross-entropy over all ${X.length} points after epoch ${bad + 1}, ${fmt(want.losses[bad], 6)}; yours is ${fmt(losses[bad], 6)}. Check mean_loss: the mean of −log p[y[i]].` };
  }
  return {
    pass: true,
    message: `Trained on ${X.length} points for ${epochs} epoch${epochs === 1 ? '' : 's'}: the mean loss went from ln ${classes} = ${fmt(Math.log(classes))} at the start to ${list(want.losses)} after each epoch, and the model classifies ${pct(accuracyOf(want.W, want.b, X, y))} of the points it was trained on correctly. Part 4 asks how it does on points it never saw.`,
  };
}

const ALL = DATA;
export const TRAIN_TESTS: { name: string; input: TrainInput }[] = [
  { name: 'all 90 points, 20 epochs of batches of 10', input: { ...ALL, classes: 3, epochs: 20, batchSize: 10, lr: 0.5, seed: 7 } },
  { name: 'the first 30 points, 5 epochs of batches of 4 (a short last batch)', input: { ...firstN(30), classes: 3, epochs: 5, batchSize: 4, lr: 0.5, seed: 2026 } },
  { name: 'one epoch of single points', input: { ...firstN(12), classes: 3, epochs: 1, batchSize: 1, lr: 0.2, seed: 11 } },
  { name: 'full batches: 12 points, 10 epochs', input: { ...firstN(12), classes: 3, epochs: 10, batchSize: 12, lr: 1, seed: 3 } },
  { name: 'two classes only', input: { X: DATA.X.filter((_, i) => DATA.y[i] < 2).slice(0, 20), y: DATA.y.filter((c) => c < 2).slice(0, 20), classes: 2, epochs: 8, batchSize: 5, lr: 0.5, seed: 42 } },
];

const trainExercise: Exercise<TrainInput> = {
  slug: 'train-softmax',
  title: 'A classifier, part 2: train it with minibatches',
  kind: 'write',
  visualiser: 'softmax',
  summary: 'Write the mean cross-entropy, then train a softmax classifier from zeros, one SGD step per minibatch, recording the loss after every epoch.',
  task: [
    'Part 2 of the project “A classifier, judged honestly”. `next_state`, `minibatches`, `softmax` and your `softmax_step` from part 1 are written out above (`nextState` and `softmaxStep` in JavaScript and TypeScript).',
    'First write `mean_loss(W, b, X, y)` (`meanLoss`): the mean, over every point, of the cross-entropy −log p[y[i]], where p is the softmax of that point’s logits.',
    'Then finish `train(X, y, classes, epochs, batch_size, lr, seed, losses)` (`batchSize` in JavaScript and TypeScript): start W and b at zeros, take one `softmax_step` for each batch that `minibatches(len(X), batch_size, epochs, seed)` returns, keeping the W and b each step returns, and return `[W, b]`. After the last batch of each epoch, write the mean loss over all the data, rounded to 6 places, into `losses[epoch]`, so the run draws the loss falling epoch by epoch.',
  ],
  entry: { python: 'train', js: 'train' },
  args: trainArgs,
  starter: {
    python: `${HELPERS_2_PY}\n\n${TRAIN_STARTER_PY}`,
    javascript: `${HELPERS_2_JS}\n${TRAIN_STARTER_JS}`,
    typescript: toTs(`${HELPERS_2_JS}\n${TRAIN_STARTER_JS}`),
  },
  solution: {
    python: `${HELPERS_2_PY}\n\n${MEAN_LOSS_PY}\n\n${TRAIN_PY}`,
    javascript: `${HELPERS_2_JS}\n${MEAN_LOSS_JS}\n${TRAIN_JS}`,
    typescript: toTs(`${HELPERS_2_JS}\n${MEAN_LOSS_JS}\n${TRAIN_JS}`),
  },
  examples: [
    { id: 'six', label: '6 points, 2 epochs of batches of 3', input: { ...firstN(6), classes: 3, epochs: 2, batchSize: 3, lr: 0.5, seed: 7 } },
    { id: 'four', label: '4 points, 3 epochs of batches of 2', input: { ...firstN(4), classes: 3, epochs: 3, batchSize: 2, lr: 0.5, seed: 2026 } },
  ],
  tests: TRAIN_TESTS,
  check: checkTrain,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'mean_loss: for each point, build its logits as in part 1, take p = softmax(z), and add -math.log(p[y[i]]) to a total. Return total / len(X).',
    'minibatches returns every epoch’s batches in one list, so an epoch is len(batches) // epochs batches. Loop t over all of them: W, b = softmax_step(W, b, X, y, batches[t], lr).',
    'An epoch ends after batch t when (t + 1) is a multiple of the batches per epoch. Then losses[(t + 1) // per_epoch - 1] = round(mean_loss(W, b, X, y), 6).',
  ],
  legend: [
    { neutral: 'An epoch not finished yet (0)' },
    { mark: 'write', label: 'The mean loss after an epoch' },
  ],
  judge: { budget: 'project' },
};

// ───────────────────────────── 3. confusion-matrix (M3, part 3) ─────────────────────────────

export type ConfusionInput = { W: number[][]; b: number[]; X: number[][]; y: number[] };

/** The confusion matrix C[true][predicted], the accuracy, and each class's precision and recall (0 where nothing to count). */
export function confusionOf({ W, b, X, y }: ConfusionInput) {
  const K = W.length;
  const C = zeros(K, K);
  X.forEach((x, i) => C[y[i]][predictOf(W, b, x)]++);
  const total = X.length;
  let correct = 0;
  for (let k = 0; k < K; k++) correct += C[k][k];
  const precision = C.map((_, k) => {
    let predicted = 0;
    for (let r = 0; r < K; r++) predicted += C[r][k];
    return predicted > 0 ? C[k][k] / predicted : 0;
  });
  const recall = C.map((row, k) => {
    let actual = 0;
    for (const v of row) actual += v;
    return actual > 0 ? C[k][k] / actual : 0;
  });
  return { C, accuracy: correct / total, precision, recall };
}

const transposed = (m: Matrix) => m[0].map((_, j) => m.map((row) => row[j]));

const PREDICT_PY = `def predict(W, b, x):
    best = 0
    best_z = None
    for c in range(len(W)):
        z = sum(W[c][j] * x[j] for j in range(len(x))) + b[c]
        if best_z is None or z > best_z:
            best = c
            best_z = z
    return best
`;
const PREDICT_JS = `function predict(W, b, x) {
  let best = 0;
  let bestZ = -Infinity;
  for (let c = 0; c < W.length; c++) {
    let z = 0;
    for (let j = 0; j < x.length; j++) z += W[c][j] * x[j];
    z += b[c];
    if (z > bestZ) {
      best = c;
      bestZ = z;
    }
  }
  return best;
}
`;
const CONFUSION_PY = `def confusion_matrix(W, b, X, y):
    classes = len(W)
    C = table(classes, classes, 0)
    for i in range(len(X)):
        guess = predict(W, b, X[i])
        C[y[i]][guess] = C[y[i]][guess] + 1
    correct = 0
    for k in range(classes):
        correct += C[k][k]
    accuracy = correct / len(X)
    precision = []
    recall = []
    for k in range(classes):
        predicted = 0
        actual = 0
        for other in range(classes):
            predicted += C[other][k]
            actual += C[k][other]
        precision.append(C[k][k] / predicted if predicted > 0 else 0)
        recall.append(C[k][k] / actual if actual > 0 else 0)
    return [C, accuracy, precision, recall]
`;
const CONFUSION_JS = `function confusionMatrix(W, b, X, y) {
  const classes = W.length;
  const C = table(classes, classes, 0);
  for (let i = 0; i < X.length; i++) {
    const guess = predict(W, b, X[i]);
    C[y[i]][guess] = C[y[i]][guess] + 1;
  }
  let correct = 0;
  for (let k = 0; k < classes; k++) correct += C[k][k];
  const accuracy = correct / X.length;
  const precision = [];
  const recall = [];
  for (let k = 0; k < classes; k++) {
    let predicted = 0;
    let actual = 0;
    for (let other = 0; other < classes; other++) {
      predicted += C[other][k];
      actual += C[k][other];
    }
    precision.push(predicted > 0 ? C[k][k] / predicted : 0);
    recall.push(actual > 0 ? C[k][k] / actual : 0);
  }
  return [C, accuracy, precision, recall];
}
`;
const CONFUSION_STARTER_PY = `def predict(W, b, x):
    # The class c whose logit W[c] · x + b[c] is biggest
    # (the first one, if two tie).
    return 0


def confusion_matrix(W, b, X, y):
    classes = len(W)
    C = table(classes, classes, 0)
    # 1. For each point, add 1 to C[true class][predicted class].
    # 2. accuracy: the share of points on the diagonal (predicted = true).
    # 3. For each class k, precision[k]: of the points predicted k, the share
    #    really k (column k); recall[k]: of the points really k, the share
    #    predicted k (row k). Use 0 when there is nothing to divide by.
    accuracy = 0
    precision = [0] * classes
    recall = [0] * classes
    return [C, accuracy, precision, recall]
`;
const CONFUSION_STARTER_JS = `function predict(W, b, x) {
  // The class c whose logit W[c] · x + b[c] is biggest
  // (the first one, if two tie).
  return 0;
}

function confusionMatrix(W, b, X, y) {
  const classes = W.length;
  const C = table(classes, classes, 0);
  // 1. For each point, add 1 to C[true class][predicted class].
  // 2. accuracy: the share of points on the diagonal (predicted = true).
  // 3. For each class k, precision[k]: of the points predicted k, the share
  //    really k (column k); recall[k]: of the points really k, the share
  //    predicted k (row k). Use 0 when there is nothing to divide by.
  const accuracy = 0;
  const precision = Array(classes).fill(0);
  const recall = Array(classes).fill(0);
  return [C, accuracy, precision, recall];
}
`;

const confusionArgs = ({ W, b, X, y }: ConfusionInput): Arg[] => [
  { kind: 'value', name: 'W', value: W },
  { kind: 'value', name: 'b', value: b },
  { kind: 'value', name: 'X', value: X },
  { kind: 'value', name: 'y', value: y },
];

function checkConfusion(input: ConfusionInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const K = input.W.length;
  const got = result.returned;
  if (!Array.isArray(got) || got.length !== 4 || !isMatrix(got[0]) || typeof got[1] !== 'number' || !isNumbers(got[2]) || !isNumbers(got[3]))
    return { pass: false, message: `Return [C, accuracy, precision, recall]: the ${K}×${K} table, a number, and two lists of ${K} numbers.` };
  const [C, accuracy, precision, recall] = got as [number[][], number, number[], number[]];
  const want = confusionOf(input);
  const exact = (a: Matrix, b: Matrix) => a.length === b.length && b.every((row, i) => a[i]?.length === row.length && row.every((v, j) => a[i][j] === v));
  if (!exact(C, want.C)) {
    if (C.flat().every((v) => v === 0)) return { pass: false, message: 'C is all zeros: for each point, predict its class and add 1 to C[y[i]][predicted].' };
    if (exact(C, transposed(want.C))) return { pass: false, message: `C is turned on its side: rows are the true class and columns the prediction, C[y[i]][predicted]. Yours counts C[predicted][y[i]]: row 0 should be ${list(want.C[0])}.` };
    const total = C.flat().reduce((s, v) => s + v, 0);
    if (total !== input.X.length) return { pass: false, message: `C should count every point once, ${input.X.length} in all, but its cells add up to ${total}.` };
    const lowest = input.X.map((x) => {
      const z = logitsOf(input.W, input.b, x);
      return z.indexOf(Math.min(...z));
    });
    const byLowest = zeros(K, K);
    lowest.forEach((g, i) => byLowest[input.y[i]][g]++);
    if (exact(C, byLowest)) return { pass: false, message: 'predict picked the class with the smallest logit. The prediction is the class with the biggest: the one softmax gives the most probability.' };
    const lastTie = zeros(K, K);
    input.X.forEach((x, i) => {
      const z = logitsOf(input.W, input.b, x);
      let best = 0;
      for (let c = 1; c < K; c++) if (z[c] >= z[best]) best = c;
      lastTie[input.y[i]][best]++;
    });
    if (exact(C, lastTie)) return { pass: false, message: 'On a tie predict picked the last of the tied classes. Keep the first: only switch when a logit is strictly bigger (>, not >=).' };
    return { pass: false, message: `C should be ${grid(want.C, 0)} (rows the true class, columns the prediction), but yours is ${grid(C, 0)}. Check predict: the class with the biggest W[c] · x + b[c].` };
  }
  if (!near(accuracy, want.accuracy)) {
    if (near(accuracy, (want.accuracy * input.X.length) / K)) return { pass: false, message: `C is right, but accuracy should be the share of all ${input.X.length} points that are on the diagonal, ${fmt(want.accuracy)}: divide by the number of points, not the number of classes.` };
    return { pass: false, message: `C is right, but accuracy should be ${fmt(want.accuracy)}: the diagonal’s total over all the points.` };
  }
  if (sameList(precision, want.recall) && sameList(recall, want.precision) && !sameList(precision, want.precision))
    return { pass: false, message: `Precision and recall are swapped. Precision for class k reads down column k (of the points predicted k, how many were k); recall reads along row k (of the points really k, how many were found). Precision should be ${list(want.precision)}.` };
  if (!sameList(precision, want.precision)) return { pass: false, message: `C and accuracy are right, but precision should be ${list(want.precision)}: for each class k, C[k][k] over column k’s total, the points predicted k (0 when none were).` };
  if (!sameList(recall, want.recall)) return { pass: false, message: `C, accuracy and precision are right, but recall should be ${list(want.recall)}: for each class k, C[k][k] over row k’s total, the points really k (0 when there are none).` };
  return {
    pass: true,
    message: `C = ${grid(want.C, 0)}: accuracy ${pct(want.accuracy)}, precision ${list(want.precision.map((v) => Math.round(v * 1000) / 1000), 3)} and recall ${list(want.recall.map((v) => Math.round(v * 1000) / 1000), 3)}, class by class.`,
  };
}

/** The model part 2 trains on all 90 points, rounded to 4 places: what part 3's tests judge. */
const fitted = (() => {
  const m = trainSoftmax(TRAIN_TESTS[0].input);
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return { W: m.W.map((row) => row.map(r4)), b: m.b.map(r4) };
})();
export const CONFUSION_TESTS: { name: string; input: ConfusionInput }[] = [
  { name: 'the model trained in part 2, on all 90 points', input: { ...fitted, ...DATA } },
  { name: 'the same model on 12 points', input: { ...fitted, ...firstN(12) } },
  { name: 'all zeros: every logit ties, so everything is class 0', input: { W: zeros(3, 2), b: [0, 0, 0], ...firstN(9) } },
  { name: 'a model that never says class 2', input: { W: [[0, 1], [0, -1], [0, 0]], b: [0, 0, -5], ...firstN(15) } },
  { name: 'two classes', input: { W: [[1, 0], [-1, 0]], b: [0, 0.5], X: [[2, 0], [0.3, 1], [-1, 2], [0.1, -1], [-2, 0], [1, 1]], y: [0, 0, 1, 1, 1, 0] } },
];

const confusionExercise: Exercise<ConfusionInput> = {
  slug: 'confusion-matrix',
  title: 'A classifier, part 3: the confusion matrix',
  kind: 'write',
  visualiser: 'softmax',
  summary: 'Predict each point’s class, count the answers into a table of true against predicted, and read off accuracy, precision and recall for every class.',
  task: [
    'Part 3 of the project “A classifier, judged honestly”. A trained softmax classifier predicts the class with the biggest logit z[c] = W[c] · x + b[c] (the same class softmax gives the most probability, so there is no need to work out p). Write `predict(W, b, x)`, returning that class, the first one if two tie.',
    'Then write `confusion_matrix(W, b, X, y)` (`confusionMatrix` in JavaScript and TypeScript). Count every point into the table `C`, adding 1 to `C[y[i]][predicted]`: rows are the true class, columns the prediction, so the diagonal holds the right answers. Return `[C, accuracy, precision, recall]`: accuracy is the share of points on the diagonal; for each class k, precision[k] is the share of the points predicted k that really are k (column k), and recall[k] the share of the points really k that were predicted k (row k). Use 0 when a column or row is empty.',
  ],
  entry: { python: 'confusion_matrix', js: 'confusionMatrix' },
  args: confusionArgs,
  starter: { python: CONFUSION_STARTER_PY, javascript: CONFUSION_STARTER_JS, typescript: toTs(CONFUSION_STARTER_JS) },
  solution: {
    python: `${PREDICT_PY}\n\n${CONFUSION_PY}`,
    javascript: `${PREDICT_JS}\n${CONFUSION_JS}`,
    typescript: toTs(`${PREDICT_JS}\n${CONFUSION_JS}`),
  },
  examples: [
    { id: 'twelve', label: 'The trained model on 12 points', input: CONFUSION_TESTS[1].input },
    { id: 'never-two', label: 'A model that never says class 2', input: CONFUSION_TESTS[3].input },
  ],
  tests: CONFUSION_TESTS,
  check: checkConfusion,
  markSortedAtEnd: false,
  pointers: ['i', 'k'],
  hints: [
    'predict: loop over the classes, work out each logit, and keep the class whose logit is strictly bigger than the best so far.',
    'For each point: guess = predict(W, b, X[i]), then C[y[i]][guess] = C[y[i]][guess] + 1. Row = truth, column = guess.',
    'The diagonal C[k][k] counts the right answers. Precision divides it by column k’s total; recall by row k’s total.',
  ],
  legend: [
    { neutral: 'A count of 0' },
    { mark: 'compare', label: 'A count the code reads' },
    { mark: 'write', label: 'The count just added to' },
  ],
  judge: { budget: 'project' },
};

// ───────────────────────────── 4. cross-validate (M3, part 4) ─────────────────────────────

export type CvInput = { X: number[][]; y: number[]; classes: number; k: number; epochs: number; batchSize: number; lr: number; seed: number };

/** The overfitting lesson's folds: contiguous, sizes n // k with one more in each of the first n % k. */
export function kFoldOf(n: number, k: number): number[][] {
  const folds: number[][] = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    const size = Math.floor(n / k) + (f < n % k ? 1 : 0);
    folds.push(Array.from({ length: size }, (_, j) => start + j));
    start += size;
  }
  return folds;
}

/**
 * Cross-validation, the right way and the usual slips.
 * - no-shuffle: the folds taken straight from 0, 1, … n − 1, never shuffled.
 * - leak: every model trained on all n points, its own fold included.
 * - swapped: trained on the fold and scored on the rest.
 * (Seeding each fold's training with its own seed is no slip worth naming:
 * the models end up making the same predictions.)
 */
export type CvSlip = 'right' | 'no-shuffle' | 'leak' | 'swapped';

export function crossValidateOf(input: CvInput, slip: CvSlip = 'right'): number[] {
  const { X, y, classes, k, epochs, batchSize, lr, seed } = input;
  const n = X.length;
  const order = slip === 'no-shuffle' ? Array.from({ length: n }, (_, i) => i) : minibatches({ n, batch: n, epochs: 1, seed })[0];
  const folds = kFoldOf(n, k);
  return folds.map((fold, f) => {
    const held = fold.map((j) => order[j]);
    const rest = folds.filter((_, g) => g !== f).flatMap((other) => other.map((j) => order[j]));
    const fitOn = slip === 'leak' ? order : slip === 'swapped' ? held : rest;
    const scoreOn = slip === 'swapped' ? rest : held;
    const m = trainSoftmax({ X: fitOn.map((i) => X[i]), y: fitOn.map((i) => y[i]), classes, epochs, batchSize, lr, seed });
    return scoreOn.filter((i) => predictOf(m.W, m.b, X[i]) === y[i]).length / scoreOn.length;
  });
}

const KFOLD_PY = `def k_fold(n, k):
    folds = []
    start = 0
    for f in range(k):
        size = n // k + (1 if f < n % k else 0)
        folds.append(list(range(start, start + size)))
        start += size
    return folds
`;
const KFOLD_JS = `function kFold(n, k) {
  const folds = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    const size = Math.floor(n / k) + (f < n % k ? 1 : 0);
    folds.push(Array.from({ length: size }, (_, j) => start + j));
    start += size;
  }
  return folds;
}
`;
const TRAIN_PLAIN_PY = `def train(X, y, classes, epochs, batch_size, lr, seed):
    features = len(X[0])
    W = [[0] * features for _ in range(classes)]
    b = [0] * classes
    for batch in minibatches(len(X), batch_size, epochs, seed):
        W, b = softmax_step(W, b, X, y, batch, lr)
    return [W, b]
`;
const TRAIN_PLAIN_JS = `function train(X, y, classes, epochs, batchSize, lr, seed) {
  const features = X[0].length;
  let W = Array.from({ length: classes }, () => Array(features).fill(0));
  let b = Array(classes).fill(0);
  for (const batch of minibatches(X.length, batchSize, epochs, seed)) {
    [W, b] = softmaxStep(W, b, X, y, batch, lr);
  }
  return [W, b];
}
`;
const HELPERS_4_PY = `${IMPORT_PY}
# Written out for you: next_state and minibatches, softmax, softmax_step
# (part 1), train (part 2, without its losses picture), predict (part 3),
# and k_fold from the overfitting lesson.
${NEXT_PY}

${BATCHES_PY}

${SOFTMAX_PY}

${STEP_PLAIN_PY}

${TRAIN_PLAIN_PY}

${PREDICT_PY}

${KFOLD_PY}`;
const HELPERS_4_JS = `// Written out for you: nextState and minibatches, softmax, softmaxStep
// (part 1), train (part 2, without its losses picture), predict (part 3),
// and kFold from the overfitting lesson.
${NEXT_JS}
${BATCHES_JS}
${SOFTMAX_JS}
${STEP_PLAIN_JS}
${TRAIN_PLAIN_JS}
${PREDICT_JS}
${KFOLD_JS}`;

const CV_PY = `def cross_validate(X, y, classes, k, epochs, batch_size, lr, seed, scores):
    n = len(X)
    order = minibatches(n, n, 1, seed)[0]
    folds = k_fold(n, k)
    for f in range(k):
        held = [order[j] for j in folds[f]]
        rest = []
        for g in range(k):
            if g != f:
                rest += [order[j] for j in folds[g]]
        W, b = train([X[i] for i in rest], [y[i] for i in rest], classes, epochs, batch_size, lr, seed)
        correct = 0
        for i in held:
            if predict(W, b, X[i]) == y[i]:
                correct += 1
        scores[f] = correct / len(held)
    return scores
`;
const CV_JS = `function crossValidate(X, y, classes, k, epochs, batchSize, lr, seed, scores) {
  const n = X.length;
  const order = minibatches(n, n, 1, seed)[0];
  const folds = kFold(n, k);
  for (let f = 0; f < k; f++) {
    const held = folds[f].map((j) => order[j]);
    const rest = [];
    for (let g = 0; g < k; g++) {
      if (g !== f) rest.push(...folds[g].map((j) => order[j]));
    }
    const [W, b] = train(rest.map((i) => X[i]), rest.map((i) => y[i]), classes, epochs, batchSize, lr, seed);
    let correct = 0;
    for (const i of held) {
      if (predict(W, b, X[i]) === y[i]) correct += 1;
    }
    scores[f] = correct / held.length;
  }
  return scores;
}
`;
const CV_STARTER_PY = `def cross_validate(X, y, classes, k, epochs, batch_size, lr, seed, scores):
    n = len(X)
    # 1. Shuffle the points once: one epoch of one batch of all n is a
    #    shuffled order, order = minibatches(n, n, 1, seed)[0].
    # 2. folds = k_fold(n, k) gives positions in that order.
    # 3. For each fold f: the held-out points are order[j] for j in fold f,
    #    the rest are every other fold's. Train on the rest (with seed),
    #    then write the share of held-out points predicted right into scores[f].
    return scores
`;
const CV_STARTER_JS = `function crossValidate(X, y, classes, k, epochs, batchSize, lr, seed, scores) {
  const n = X.length;
  // 1. Shuffle the points once: one epoch of one batch of all n is a
  //    shuffled order, order = minibatches(n, n, 1, seed)[0].
  // 2. folds = kFold(n, k) gives positions in that order.
  // 3. For each fold f: the held-out points are order[j] for j in fold f,
  //    the rest are every other fold's. Train on the rest (with seed),
  //    then write the share of held-out points predicted right into scores[f].
  return scores;
}
`;

const cvArgs = ({ X, y, classes, k, epochs, batchSize, lr, seed }: CvInput): Arg[] => [
  { kind: 'value', name: 'X', value: X },
  { kind: 'value', name: 'y', value: y },
  { kind: 'value', name: 'classes', value: classes },
  { kind: 'value', name: 'k', value: k },
  { kind: 'value', name: 'epochs', value: epochs },
  { kind: 'value', name: 'batch_size', value: batchSize },
  { kind: 'value', name: 'lr', value: lr },
  { kind: 'value', name: 'seed', value: seed },
  { kind: 'array', name: 'scores', values: Array<number>(k).fill(0) },
];

const mean = (vs: readonly number[]) => vs.reduce((s, v) => s + v, 0) / vs.length;

function checkCv(input: CvInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const got = result.returned;
  const { k, X } = input;
  if (!isNumbers(got) || got.length !== k) return { pass: false, message: `Return scores: one accuracy per fold, ${k} numbers.` };
  const want = crossValidateOf(input);
  if (sameList(got, want)) {
    const all = trainSoftmax({ ...input });
    const trainAcc = accuracyOf(all.W, all.b, X, input.y);
    return {
      pass: true,
      message: `Fold accuracies ${list(want, 3)}, a mean of ${pct(mean(want))}: each point scored by a model that never saw it. The same model trained on all ${X.length} points gets ${pct(trainAcc)} on those points themselves, the score it was tuned on.`,
    };
  }
  if (got.every((v) => v === 0)) return { pass: false, message: 'scores is all zeros: for each fold, train on the other folds and write the held-out accuracy into scores[f].' };
  const is = (slip: CvSlip) => sameList(got, crossValidateOf(input, slip));
  if (is('leak')) return { pass: false, message: 'Each model was trained on every point, its own fold included, so it was scored on points it had already seen. Train only on the other folds: that is the whole point of holding a fold out.' };
  if (is('swapped')) return { pass: false, message: `Each model was trained on one fold and scored on the other ${k - 1}. It goes the other way: train on the other ${k - 1} folds, the bigger share, and score on the one held out.` };
  if (is('no-shuffle')) return { pass: false, message: 'The folds were cut from the points in their stored order. Shuffle first: order = minibatches(n, n, 1, seed)[0], and fold f holds order[j] for the positions j that k_fold gives it.' };
  return { pass: false, message: `The fold accuracies should be ${list(want, 4)}, but yours are ${list(got, 4)}. Shuffle once with minibatches(n, n, 1, seed)[0], cut the order with k_fold, and for each fold train on the others (with seed) and score the fold.` };
}

export const CV_TESTS: { name: string; input: CvInput }[] = [
  { name: 'all 90 points, 3 folds', input: { ...DATA, classes: 3, k: 3, epochs: 8, batchSize: 15, lr: 0.5, seed: 7 } },
  { name: 'the first 60 points, 5 folds', input: { ...firstN(60), classes: 3, k: 5, epochs: 5, batchSize: 12, lr: 0.5, seed: 2026 } },
  { name: '11 points in 3 folds of 4, 4 and 3', input: { ...firstN(11), classes: 3, k: 3, epochs: 4, batchSize: 4, lr: 0.5, seed: 5 } },
  { name: 'two folds', input: { ...firstN(30), classes: 3, k: 2, epochs: 6, batchSize: 5, lr: 0.5, seed: 99 } },
];

const cvExercise: Exercise<CvInput> = {
  slug: 'cross-validate',
  title: 'A classifier, part 4: k-fold cross-validation',
  kind: 'write',
  visualiser: 'softmax',
  summary: 'Score the classifier honestly: shuffle once, cut the points into k folds, and for each fold train on the others and count how many of its points come out right.',
  task: [
    'Part 4 of the project “A classifier, judged honestly”. A model scored on the points it was trained on looks better than it is. k-fold cross-validation scores every point with a model that never saw it.',
    'Write `cross_validate(X, y, classes, k, epochs, batch_size, lr, seed, scores)` (`crossValidate` and `batchSize` in JavaScript and TypeScript). Shuffle the points once: `order = minibatches(n, n, 1, seed)[0]` is a shuffled order of 0 … n − 1. `k_fold(n, k)` (`kFold`) cuts the positions 0 … n − 1 into k folds; fold f holds the points `order[j]` for its positions j. For each fold, train a model on the points of every other fold (with `train`, using `seed`), then write the share of the fold’s points that `predict` gets right into `scores[f]`. Return `scores`.',
    'Everything else is written out above: `minibatches`, `softmax`, `softmax_step`, `train`, `predict` and `k_fold`.',
  ],
  entry: { python: 'cross_validate', js: 'crossValidate' },
  args: cvArgs,
  starter: {
    python: `${HELPERS_4_PY}\n\n${CV_STARTER_PY}`,
    javascript: `${HELPERS_4_JS}\n${CV_STARTER_JS}`,
    typescript: toTs(`${HELPERS_4_JS}\n${CV_STARTER_JS}`),
  },
  solution: {
    python: `${HELPERS_4_PY}\n\n${CV_PY}`,
    javascript: `${HELPERS_4_JS}\n${CV_JS}`,
    typescript: toTs(`${HELPERS_4_JS}\n${CV_JS}`),
  },
  examples: [
    { id: 'six', label: '6 points in 3 folds, one epoch each', input: { ...firstN(6), classes: 3, k: 3, epochs: 1, batchSize: 2, lr: 0.5, seed: 7 } },
    { id: 'halves', label: '6 points in 2 folds, one epoch each', input: { ...firstN(6), classes: 3, k: 2, epochs: 1, batchSize: 3, lr: 0.5, seed: 2026 } },
  ],
  tests: CV_TESTS,
  check: checkCv,
  markSortedAtEnd: false,
  pointers: ['f'],
  hints: [
    'order = minibatches(n, n, 1, seed)[0], and folds = k_fold(n, k). For fold f, held = [order[j] for j in folds[f]].',
    'rest collects order[j] for the positions of every other fold g != f. Train on the rows of X and y at those indices: W, b = train([X[i] for i in rest], [y[i] for i in rest], classes, epochs, batch_size, lr, seed).',
    'Count the held-out points where predict(W, b, X[i]) == y[i], and write correct / len(held) into scores[f].',
  ],
  legend: [
    { neutral: 'A fold not scored yet (0)' },
    { mark: 'write', label: 'A fold’s held-out accuracy' },
  ],
  judge: { budget: 'project' },
};

export const softmaxClassifierExercises: Exercise[] = [stepExercise, trainExercise, confusionExercise, cvExercise];

// Stochastic gradient descent as code (B6 of the math and ML path): cut
// shuffled data into minibatches epoch after epoch, and take one SGD step on a
// batch of a line fit.
//
// The shuffle uses the Park-Miller generator every math and ML exercise
// shares: state = (16807 × state) mod 2147483647, then u = state / 2147483647.
// Every product stays below 2^53, so Python and JavaScript make exactly the
// same numbers and the same shuffles.

import { DATA, pathsRun } from '@/algorithms/ml/sgd';
import type { Arg, RunResult } from '@/workspace/protocol';
import { nextState, PM_MODULUS } from './monte-carlo';
import { crashed, type Exercise, type Verdict } from './shared';

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
/** a and b agree to `rel` of b's size (and to 1e-12 near 0). */
const near = (a: number, b: number, rel = 1e-12) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b) + 1e-12;
const fmt = (v: number, digits = 6) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const listOf = (vs: readonly number[]) => `[${vs.join(', ')}]`;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The learner's visual array `name` at the end of the run. */
function finalArray(result: RunResult, name: string): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  return made && made.kind === 'array' ? (result.arrays[made.array] ?? null) : null;
}

const NEXT_PY = `def next_state(state):
    # Park-Miller: the next number in the sequence, a whole number
    # from 1 to 2147483646. Divide by 2147483647 for one between 0 and 1.
    return (16807 * state) % 2147483647
`;
const NEXT_JS = `function nextState(state) {
  // Park-Miller: the next number in the sequence, a whole number
  // from 1 to 2147483646. Divide by 2147483647 for one between 0 and 1.
  return (16807 * state) % 2147483647;
}
`;
const strip = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

// ───────────────────────────── 1. minibatches ─────────────────────────────

export type BatchesInput = { n: number; batch: number; epochs: number; seed: number };

/**
 * How the batches can be made: the right way and the usual slips, each as the
 * code that makes it would run, so a wrong answer can be named.
 * - right: shuffle `order` in place every epoch, the generator carrying on.
 * - once: shuffled only in the first epoch, so every epoch has the same order.
 * - restart: state = seed again every epoch, so each reshuffle repeats the same swaps.
 * - frozen: next_state(state) called without keeping it, so every j comes from one number.
 * - sattolo: j from 0 to i − 1 (× i, not × (i + 1)), so no point can stay where it is.
 * - naive: j from anywhere (× n), a biased shuffle.
 * - divide-first: u = state / M before stepping, so the first u is the seed itself.
 * - drop-short: the last, short batch of each epoch left out.
 * - last-epoch: the list of batches emptied every epoch, so only the last epoch's are returned.
 * `reset` starts every epoch's shuffle from 0, 1, … n − 1 instead of last epoch's order (also fine).
 */
export type BatchSlip = 'right' | 'once' | 'restart' | 'frozen' | 'sattolo' | 'naive' | 'divide-first' | 'drop-short' | 'last-epoch';

export function minibatches({ n, batch, epochs, seed }: BatchesInput, how: BatchSlip = 'right', reset = false): number[][] {
  let state = seed;
  let order = range(n);
  let out: number[][] = [];
  for (let e = 0; e < epochs; e++) {
    if (reset) order = range(n);
    if (how === 'restart') state = seed;
    if (!(how === 'once' && e > 0)) {
      for (let i = n - 1; i > 0; i--) {
        let u: number;
        if (how === 'frozen') u = nextState(state) / PM_MODULUS;
        else if (how === 'divide-first') {
          u = state / PM_MODULUS;
          state = nextState(state);
        } else {
          state = nextState(state);
          u = state / PM_MODULUS;
        }
        const j = Math.floor(u * (how === 'sattolo' ? i : how === 'naive' ? n : i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    if (how === 'last-epoch') out = [];
    for (let start = 0; start < n; start += batch) {
      if (how === 'drop-short' && start + batch > n) break;
      out.push(order.slice(start, start + batch));
    }
  }
  return out;
}

const isBatches = (x: unknown): x is number[][] => Array.isArray(x) && x.every(isNumbers);
const sameBatches = (a: readonly number[][], b: readonly number[][]) => JSON.stringify(a) === JSON.stringify(b);

function checkBatches(input: BatchesInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const { n, batch, epochs, seed } = input;
  const got = result.returned;
  const per = Math.ceil(n / batch);
  if (isNumbers(got) && got.length > 0) return { pass: false, message: `You returned one flat list of ${got.length} numbers. Return a list of batches, each a list of indices: append order[start:start + batch] (a slice), not its numbers one by one.` };
  if (!isBatches(got)) return { pass: false, message: 'Return the batches: a list of lists of indices, every epoch’s batches one after another.' };
  if (got.length === 0) return { pass: false, message: `batches is empty. After shuffling each epoch, cut order into batches of ${batch}, in order, and append each one: ${per} a epoch here, ${per * epochs} in all.` };
  const is = (how: BatchSlip) => sameBatches(got, minibatches(input, how)) || sameBatches(got, minibatches(input, how, true));
  const short = n % batch;
  if (is('right')) {
    return {
      pass: true,
      message: `${epochs} epoch${epochs === 1 ? '' : 's'} of ${per} batch${per === 1 ? '' : 'es'} from seed ${seed}${short ? `, each epoch ending in a short batch of ${short}` : ''}. Epoch 1 starts ${listOf(got[0])}${epochs > 1 ? `; epoch 2, reshuffled, starts ${listOf(got[per])}` : ''}.`,
    };
  }
  if (is('drop-short')) return { pass: false, message: `${n} points don’t split evenly into batches of ${batch}: the last batch of each epoch has ${short}. You left it out, so ${short} point${short === 1 ? '' : 's'} miss${short === 1 ? 'es' : ''} every epoch. Keep it: cut from start = 0, ${batch}, ${2 * batch}, … while start < n, and take order[start:start + batch] (a slice stops at the end).` };
  if (is('last-epoch')) return { pass: false, message: `Only the last epoch’s batches came back: batches is emptied every epoch. Make it once, before the epoch loop, and keep appending to it.` };
  if (epochs > 1 && is('once')) return { pass: false, message: 'Every epoch has the same order. Reshuffle at the start of every epoch, and let the generator carry on: don’t set state = seed again, or the same swaps come round again.' };
  if (epochs > 1 && is('restart')) return { pass: false, message: 'You set state = seed again each epoch, so every epoch repeats the same swaps. Set it once, before the epoch loop, and let the generator carry on.' };
  if (is('frozen')) return { pass: false, message: 'Every j comes from the same number: next_state(state) gives the next state, but you never kept it. Write state = next_state(state), then j from state / 2147483647.' };
  if (is('sattolo')) return { pass: false, message: 'j = int(u × i) picks from 0 to i − 1, so a point can never stay where it is, and some orders can never happen. Pick j from 0 to i, both included: int(u × (i + 1)).' };
  if (is('naive')) return { pass: false, message: 'j = int(u × n) picks from the whole list every time. That makes some orders more likely than others. Fisher–Yates picks j from 0 to i only: int(u × (i + 1)).' };
  if (is('divide-first')) return { pass: false, message: 'You divided before stepping, so the first u is seed / 2147483647, the seed itself. Step first: state = next_state(state), then u = state / 2147483647.' };
  if (got.length !== per * epochs) return { pass: false, message: `There should be ${per * epochs} batches (${per} an epoch for ${epochs} epoch${epochs === 1 ? '' : 's'}), but you returned ${got.length}.` };
  for (let e = 0; e < epochs; e++) {
    const used = got.slice(e * per, (e + 1) * per).flat();
    if (used.length !== n || [...used].sort((a, b) => a - b).some((v, i) => v !== i)) return { pass: false, message: `Epoch ${e + 1} doesn’t use every point exactly once: its batches hold ${listOf(used)}. Shuffle by swapping order[i] with order[j], so nothing is lost or copied.` };
  }
  const want = minibatches(input);
  const k = got.findIndex((b, i) => JSON.stringify(b) !== JSON.stringify(want[i]));
  return { pass: false, message: `Batch ${k + 1} should be ${listOf(want[k])}, but yours is ${listOf(got[k])}. For i from n − 1 down to 1: step the state, j = int(state / 2147483647 × (i + 1)), swap order[i] and order[j].` };
}

const BATCHES_BLANKS_PY = `${NEXT_PY}

def minibatches(n, batch, epochs, seed):
    state = seed
    order = array(list(range(n)))
    batches = []
    for epoch in range(epochs):
        for i in range(n - 1, 0, -1):
            state = «1:next_state(state)»
            j = int(state / 2147483647 * «2:(i + 1)»)
            «3:order[i], order[j] = order[j], order[i]»
        for start in range(0, n, «4:batch»):
            batches.append(«5:order[start:start + batch]»)
    return batches
`;
const BATCHES_BLANKS_JS = `${NEXT_JS}
function minibatches(n, batch, epochs, seed) {
  let state = seed;
  const order = array(Array.from({ length: n }, (_, i) => i));
  const batches = [];
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = n - 1; i > 0; i--) {
      state = «1:nextState(state)»;
      const j = Math.floor(state / 2147483647 * «2:(i + 1)»);
      «3:[order[i], order[j]] = [order[j], order[i]]»;
    }
    for (let start = 0; start < n; start += «4:batch») {
      batches.push(«5:order.slice(start, start + batch)»);
    }
  }
  return batches;
}
`;
const BATCHES_STARTER_PY = `${NEXT_PY}

def minibatches(n, batch, epochs, seed):
    state = seed
    order = array(list(range(n)))
    batches = []
    for epoch in range(epochs):
        # Shuffle order in place (Fisher-Yates): for i from n - 1 down to 1,
        # step the state, j = int(state / 2147483647 * (i + 1)), and swap
        # order[i] with order[j]. Then cut order into batches of size batch,
        # in order, and append each one to batches (the last may be shorter).
        pass
    return batches
`;
const BATCHES_STARTER_JS = `${NEXT_JS}
function minibatches(n, batch, epochs, seed) {
  let state = seed;
  const order = array(Array.from({ length: n }, (_, i) => i));
  const batches = [];
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle order in place (Fisher-Yates): for i from n - 1 down to 1,
    // step the state, j = Math.floor(state / 2147483647 * (i + 1)), and swap
    // order[i] with order[j]. Then cut order into batches of size batch,
    // in order, and push each one onto batches (the last may be shorter).
  }
  return batches;
}
`;
const batchesTs = (js: string) =>
  js
    .replace('function nextState(state) {', 'function nextState(state: number): number {')
    .replace('function minibatches(n, batch, epochs, seed) {', 'function minibatches(n: number, batch: number, epochs: number, seed: number): number[][] {')
    .replace('const order = array(', 'const order: number[] = array(')
    .replace('const batches = [];', 'const batches: number[][] = [];');

const batchesArgs = ({ n, batch, epochs, seed }: BatchesInput): Arg[] => [
  { kind: 'value', name: 'n', value: n },
  { kind: 'value', name: 'batch', value: batch },
  { kind: 'value', name: 'epochs', value: epochs },
  { kind: 'value', name: 'seed', value: seed },
];

const batchesExercise: Exercise<BatchesInput> = {
  slug: 'minibatches',
  title: 'Shuffle and cut minibatches',
  kind: 'write',
  visualiser: 'sgd',
  summary: 'Shuffle the indices of n points with Fisher–Yates every epoch, using a seeded generator, and cut each order into batches.',
  task: [
    'Minibatch training goes through the data in epochs: each epoch shuffles the points into a new order and cuts that order into batches. Write `minibatches(n, batch, epochs, seed)`, which returns every epoch’s batches one after another, each batch a list of point indices from 0 to n − 1.',
    'Shuffle `order` in place with Fisher–Yates: for i from n − 1 down to 1, step the generator (`state = next_state(state)`, `nextState` in JavaScript and TypeScript), work out j = ⌊state / 2147483647 × (i + 1)⌋, a whole number from 0 to i, and swap `order[i]` with `order[j]`. Start with `state = seed` once, before the epochs, and let it carry on, so each epoch gets a new order.',
    'Then cut `order` into batches of `batch` indices, in order. When `batch` doesn’t divide n, the last batch of the epoch is shorter: keep it, so every point is used once an epoch.',
  ],
  entry: { python: 'minibatches', js: 'minibatches' },
  args: batchesArgs,
  starter: { python: BATCHES_STARTER_PY, javascript: BATCHES_STARTER_JS, typescript: batchesTs(BATCHES_STARTER_JS) },
  solution: { python: strip(BATCHES_BLANKS_PY), javascript: strip(BATCHES_BLANKS_JS), typescript: batchesTs(strip(BATCHES_BLANKS_JS)) },
  blanks: { python: BATCHES_BLANKS_PY, javascript: BATCHES_BLANKS_JS, typescript: batchesTs(BATCHES_BLANKS_JS) },
  fades: [[2], [2, 4, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['            j = int(state / 2147483647 * n)', '        state = seed'],
    javascript: ['      const j = Math.floor(state / 2147483647 * n);', '    state = seed;'],
    typescript: ['      const j = Math.floor(state / 2147483647 * n);', '    state = seed;'],
  },
  examples: [
    { id: 'ten', label: '10 points, batches of 4, 2 epochs, seed 7', input: { n: 10, batch: 4, epochs: 2, seed: 7 } },
    { id: 'twelve', label: '12 points, batches of 5, 2 epochs, seed 2026', input: { n: 12, batch: 5, epochs: 2, seed: 2026 } },
  ],
  tests: [
    { name: '10 points in batches of 4, 2 epochs', input: { n: 10, batch: 4, epochs: 2, seed: 7 } },
    { name: '32 points in batches of 4, one epoch', input: { n: 32, batch: 4, epochs: 1, seed: 2026 } },
    { name: 'the full batch: 8 points in batches of 8, 3 epochs', input: { n: 8, batch: 8, epochs: 3, seed: 42 } },
    { name: '7 points in batches of 3, 2 epochs', input: { n: 7, batch: 3, epochs: 2, seed: 99 } },
    { name: 'one point a batch: 5 points, 2 epochs', input: { n: 5, batch: 1, epochs: 2, seed: 1 } },
    { name: '12 points in batches of 5, 3 epochs', input: { n: 12, batch: 5, epochs: 3, seed: 123456789 } },
  ],
  check: checkBatches,
  markSortedAtEnd: false,
  pointers: ['i', 'j'],
  hints: [
    'Inside the epoch loop, two loops one after the other: the shuffle, then the cutting.',
    'The shuffle runs i from n − 1 down to 1 (`range(n - 1, 0, -1)` in Python). Each time: state = next_state(state), j = int(state / 2147483647 * (i + 1)), then swap order[i] and order[j].',
    'To cut, run start over 0, batch, 2 × batch, … while start < n, and append the slice order[start:start + batch] (`order.slice(start, start + batch)` in JavaScript). A slice past the end just stops there, so the short last batch comes for free.',
  ],
  legend: [
    { neutral: 'A point’s index, in the order so far' },
    { mark: 'swap', label: 'Two places being swapped' },
  ],
};

// ───────────────────────────── 2. sgd-step ─────────────────────────────

export type StepInput = { xs: number[]; ys: number[]; batch: number[]; w: number; b: number; lr: number };

/**
 * One SGD step on the mean squared error of y ≈ w·x + b over the batch's
 * points, and the usual slips:
 * - sum: the gradient summed over the batch, not averaged.
 * - climb: w + η·g instead of w − η·g (or the error written y − (w·x + b)).
 * - w-first: w updated before b's gradient is worked out, which then uses the new w.
 * - per-point: w and b updated after every point instead of once per batch.
 * - no-two: the 2 from the square left out.
 * - all: the gradient over every point, not the batch.
 * - divide-n: summed over the batch but divided by every point's count.
 * - no-x: w's gradient without the × x.
 */
export type StepSlip = 'sum' | 'climb' | 'w-first' | 'per-point' | 'no-two' | 'all' | 'divide-n' | 'no-x';

export function sgdStep({ xs, ys, batch, w, b, lr }: StepInput, slip?: StepSlip): { w: number; b: number; errors: number[] } {
  const idx = slip === 'all' ? xs.map((_, i) => i) : batch;
  const two = slip === 'no-two' ? 1 : 2;
  const errors = batch.map((i) => w * xs[i] + b - ys[i]);
  if (slip === 'per-point') {
    let pw = w;
    let pb = b;
    for (const i of batch) {
      const e = pw * xs[i] + pb - ys[i];
      const gw = 2 * e * xs[i];
      const gb = 2 * e;
      pw = pw - lr * gw;
      pb = pb - lr * gb;
    }
    return { w: pw, b: pb, errors };
  }
  let gw = 0;
  let gb = 0;
  for (const i of idx) {
    const e = w * xs[i] + b - ys[i];
    gw = gw + (slip === 'no-x' ? two * e : two * e * xs[i]);
    gb = gb + two * e;
  }
  const count = slip === 'sum' ? 1 : slip === 'divide-n' ? xs.length : idx.length;
  gw = gw / count;
  gb = gb / count;
  if (slip === 'climb') return { w: w + lr * gw, b: b + lr * gb, errors };
  const nw = w - lr * gw;
  if (slip === 'w-first') {
    let gb2 = 0;
    for (const i of idx) gb2 = gb2 + 2 * (nw * xs[i] + b - ys[i]);
    return { w: nw, b: b - lr * (gb2 / idx.length), errors };
  }
  return { w: nw, b: b - lr * gb, errors };
}

function checkStep(input: StepInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const got = result.returned;
  if (!isNumbers(got) || got.length !== 2) return { pass: false, message: 'Return the new w and b as a list of two numbers: [w - lr * grad_w, b - lr * grad_b].' };
  const [gw, gb] = got;
  const want = sgdStep(input);
  const k = input.batch.length;
  const is = (slip: StepSlip) => {
    const s = sgdStep(input, slip);
    return near(gw, s.w, 1e-9) && near(gb, s.b, 1e-9);
  };
  if (near(gw, want.w, 1e-9) && near(gb, want.b, 1e-9)) {
    const errors = finalArray(result, 'errors');
    if (!errors || errors.every((e) => e === 0)) return { pass: false, message: `The step is right, but errors is still all 0: write each point’s error w·x + b − y into errors[k], so the run shows which points pull the line which way.` };
    if (errors.every((e, j) => near(e, -want.errors[j], 1e-9))) return { pass: false, message: 'The step is right, but errors holds y − (w·x + b): write the error the loss squares, w·x + b − y, so a point above the line has a negative error.' };
    const bad = errors.findIndex((e, j) => !near(e, want.errors[j], 1e-9));
    if (bad >= 0) return { pass: false, message: `The step is right, but errors[${bad}] should be the error of point ${input.batch[bad]}, ${fmt(want.errors[bad])}; yours is ${fmt(errors[bad])}.` };
    return {
      pass: true,
      message: `On ${k} point${k === 1 ? '' : 's'}, (w, b) goes from (${fmt(input.w, 4)}, ${fmt(input.b, 4)}) to (${fmt(want.w, 4)}, ${fmt(want.b, 4)}). Errors ${listOf(want.errors.map((e) => Number(fmt(e, 4))))}.`,
    };
  }
  if (k > 1 && is('sum')) return { pass: false, message: `You added up the ${k} points’ gradients but never divided by ${k}, so the step is ${k} times too long. The loss is the mean of the squared errors, so its gradient is the mean too: divide by len(batch).` };
  if (is('climb')) return { pass: false, message: 'The step went uphill: either you added η·g (w + lr * grad_w), or the error was y − (w·x + b), which flips the gradient. The gradient points up the bowl; step against it, w − lr * grad_w, with the error w·x + b − y.' };
  if (is('per-point')) return { pass: false, message: `You updated w and b after every point, which is ${k} steps of one point each. One SGD step adds up the gradient over the whole batch first, divides by ${k}, and updates w and b once, after the loop.` };
  if (is('w-first')) return { pass: false, message: 'w is right but b is not: you updated w before working out b’s gradient, which then used the new w. Work out both gradients from the old w and b first, then update both.' };
  if (is('no-two')) return { pass: false, message: 'The step is half as long as it should be: the gradient of e² is 2e times the gradient of e, so grad_w adds 2 * e * x and grad_b adds 2 * e.' };
  if (input.batch.length < input.xs.length && is('all')) return { pass: false, message: `That is a full-batch step: you used all ${input.xs.length} points. An SGD step uses only the points in batch: loop over batch and take i = batch[k].` };
  if (input.batch.length < input.xs.length && is('divide-n')) return { pass: false, message: `You divided by ${input.xs.length}, every point, but the sum is over the ${k} in the batch: divide by len(batch).` };
  if (is('no-x')) return { pass: false, message: 'b is right but w is not: nudging w by a little moves each prediction by x times as much, so w’s gradient adds 2 * e * x, not 2 * e.' };
  return { pass: false, message: `From (${fmt(input.w, 4)}, ${fmt(input.b, 4)}) with lr = ${input.lr} the step goes to (${fmt(want.w, 6)}, ${fmt(want.b, 6)}), but you returned (${fmt(gw, 6)}, ${fmt(gb, 6)}). For each i in batch: e = w * x + b − y, add 2 * e * x to grad_w and 2 * e to grad_b; divide both by len(batch); then w − lr * grad_w and b − lr * grad_b.` };
}

const STEP_BLANKS_PY = `def sgd_step(xs, ys, batch, w, b, lr, errors):
    grad_w = 0
    grad_b = 0
    for k in range(len(batch)):
        i = batch[k]
        e = «1:w * xs[i] + b - ys[i]»
        errors[k] = e
        grad_w = grad_w + «2:2 * e * xs[i]»
        grad_b = grad_b + «3:2 * e»
    grad_w = grad_w / «4:len(batch)»
    grad_b = grad_b / len(batch)
    return [«5:w - lr * grad_w», b - lr * grad_b]
`;
const STEP_BLANKS_JS = `function sgdStep(xs, ys, batch, w, b, lr, errors) {
  let gradW = 0;
  let gradB = 0;
  for (let k = 0; k < batch.length; k++) {
    const i = batch[k];
    const e = «1:w * xs[i] + b - ys[i]»;
    errors[k] = e;
    gradW = gradW + «2:2 * e * xs[i]»;
    gradB = gradB + «3:2 * e»;
  }
  gradW = gradW / «4:batch.length»;
  gradB = gradB / batch.length;
  return [«5:w - lr * gradW», b - lr * gradB];
}
`;
const STEP_STARTER_PY = `def sgd_step(xs, ys, batch, w, b, lr, errors):
    # The loss over the batch is the mean of e * e, where e = w * x + b - y.
    # For each k, take i = batch[k], work out e, write it into errors[k],
    # and add 2 * e * x to grad_w and 2 * e to grad_b. Divide both by the
    # batch's size, then step against them.
    return [w, b]
`;
const STEP_STARTER_JS = `function sgdStep(xs, ys, batch, w, b, lr, errors) {
  // The loss over the batch is the mean of e * e, where e = w * x + b - y.
  // For each k, take i = batch[k], work out e, write it into errors[k],
  // and add 2 * e * x to gradW and 2 * e to gradB. Divide both by the
  // batch's size, then step against them.
  return [w, b];
}
`;
const stepTs = (js: string) =>
  js.replace(
    'function sgdStep(xs, ys, batch, w, b, lr, errors) {',
    'function sgdStep(xs: number[], ys: number[], batch: number[], w: number, b: number, lr: number, errors: number[]): number[] {',
  );

const stepArgs = ({ xs, ys, batch, w, b, lr }: StepInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'value', name: 'ys', value: ys },
  { kind: 'value', name: 'batch', value: batch },
  { kind: 'value', name: 'w', value: w },
  { kind: 'value', name: 'b', value: b },
  { kind: 'value', name: 'lr', value: lr },
  { kind: 'array', name: 'errors', values: batch.map(() => 0) },
];

/** The visualiser's 32 points, and the batches its paths story draws from seed 1. */
export const XS = DATA.map((d) => d.x);
export const YS = DATA.map((d) => d.y);
const FIRST = pathsRun(1).epochs[0];
const fromData = (batch: number[], w: number, b: number, lr: number): StepInput => ({ xs: XS, ys: YS, batch, w, b, lr });

export const STEP_TESTS: { name: string; input: StepInput }[] = [
  { name: 'a made-up three points, a batch of two', input: { xs: [1, 2, 3], ys: [2, 4, 7], batch: [0, 2], w: 0, b: 0, lr: 0.05 } },
  { name: 'the first batch of 4, from the start (−1, −1.5)', input: fromData(FIRST[0], -1, -1.5, 0.1) },
  { name: 'one point', input: fromData([9], 1, 0.5, 0.1) },
  { name: 'a short last batch of 2', input: fromData([5, 17], 0.5, 0, 0.1) },
  { name: 'all 32 points: a full-batch step', input: fromData(range(32), -1, -1.5, 0.1) },
  { name: 'a batch of 8 near the lowest point', input: fromData([...FIRST[1], ...FIRST[2]], 1.5, 1, 0.3) },
];

const stepExercise: Exercise<StepInput> = {
  slug: 'sgd-step',
  title: 'One SGD step on a batch',
  kind: 'write',
  visualiser: 'sgd',
  summary: 'Average the gradient of the squared error over a batch of points, and step a line’s w and b against it.',
  task: [
    'A line y = w·x + b is fitted to points (xs[i], ys[i]). Its loss on a batch is the mean squared error: the mean, over the batch’s points i, of e², where e = w·xs[i] + b − ys[i]. Write `sgd_step(xs, ys, batch, w, b, lr, errors)` (`sgdStep` in JavaScript and TypeScript), which takes one SGD step on the points whose indices are in `batch` and returns the new `[w, b]`. `lr` is the step size η (the learning rate).',
    'The gradient of e² is 2e times the gradient of e. Nudging w by h moves e by x·h; nudging b by h moves e by h. So for each point add 2·e·x to the gradient in w and 2·e to the gradient in b, then divide both by the batch’s size. Step against them: w − lr × grad_w and b − lr × grad_b, both from the old w and b.',
    'Write each point’s error into `errors[k]` (k counts the batch from 0), so the run shows which points pull the line up and which pull it down.',
  ],
  entry: { python: 'sgd_step', js: 'sgdStep' },
  args: stepArgs,
  starter: { python: STEP_STARTER_PY, javascript: STEP_STARTER_JS, typescript: stepTs(STEP_STARTER_JS) },
  solution: { python: strip(STEP_BLANKS_PY), javascript: strip(STEP_BLANKS_JS), typescript: stepTs(strip(STEP_BLANKS_JS)) },
  blanks: { python: STEP_BLANKS_PY, javascript: STEP_BLANKS_JS, typescript: stepTs(STEP_BLANKS_JS) },
  fades: [[4], [2, 3, 4], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['    return [w + lr * grad_w, b + lr * grad_b]', '        grad_b = grad_b + 2 * e * xs[i]'],
    javascript: ['  return [w + lr * gradW, b + lr * gradB];', '    gradB = gradB + 2 * e * xs[i];'],
    typescript: ['  return [w + lr * gradW, b + lr * gradB];', '    gradB = gradB + 2 * e * xs[i];'],
  },
  examples: [
    { id: 'first', label: 'The first batch of 4, from the start', input: STEP_TESTS[1].input },
    { id: 'three', label: 'Three made-up points, a batch of two', input: STEP_TESTS[0].input },
  ],
  tests: STEP_TESTS,
  check: checkStep,
  markSortedAtEnd: false,
  pointers: ['k'],
  hints: [
    'Start grad_w and grad_b at 0. Loop k over the batch, with i = batch[k], and work out e = w * xs[i] + b - ys[i].',
    'Add 2 * e * xs[i] to grad_w and 2 * e to grad_b. After the loop, divide both by len(batch) (`batch.length`): the loss is a mean, so its gradient is too.',
    'Return [w - lr * grad_w, b - lr * grad_b]: minus, because the gradient points uphill.',
  ],
  legend: [
    { neutral: 'An error not worked out yet (0)' },
    { mark: 'write', label: 'The error just worked out' },
  ],
};

export const sgdExercises: Exercise[] = [batchesExercise, stepExercise];

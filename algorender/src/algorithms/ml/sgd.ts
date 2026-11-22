import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { contours, logLevels } from '@/viz/plot/contours';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, ContourShape, HeatmapShape, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Stochastic gradient descent: minibatches, epochs and schedules. Fit a line
// y = w·x + b to 32 points by descending the mean squared error. Full-batch
// descent averages the gradient over every point for each step; minibatch
// descent shuffles the points, cuts them into small batches and steps on each
// batch's average. A batch's gradient misses the full one, but on average it
// points the same way, and its miss is an average of random misses, so it
// shrinks like 1/√(batch size). Per pass through the data (an epoch) the
// minibatches take many more steps; near the bottom their noise keeps them
// jittering, which a schedule that shrinks the step size calms.

// ───────────────────────────── the data and the loss ─────────────────────────────

/** The number of data points. */
export const N = 32;
const DATA_SEED = 2026;
export const TRUE_W = 1.5;
export const TRUE_B = 1;
const NOISE = 0.8;

export type Datum = { x: number; y: number };

/** 32 points near the line y = 1.5x + 1, x from −2 to 2, fixed for every run. Pure arithmetic, so every engine agrees. */
export const DATA: readonly Datum[] = (() => {
  const u = createRng(DATA_SEED);
  return Array.from({ length: N }, () => {
    const x = Math.round((-2 + 4 * u()) * 100) / 100;
    // Irwin–Hall: four uniforms, centred and scaled to spread 1.
    const z = (u() + u() + u() + u() - 2) * Math.sqrt(3);
    return { x, y: Math.round((TRUE_W * x + TRUE_B + NOISE * z) * 100) / 100 };
  });
})();

export const ALL: readonly number[] = DATA.map((_, i) => i);

export const errorOf = (w: number, b: number, i: number) => w * DATA[i].x + b - DATA[i].y;

/** The mean squared error of the line y = w·x + b over some points (all of them by default). */
export function lossOn(w: number, b: number, idx: readonly number[] = ALL): number {
  let total = 0;
  for (const i of idx) total += errorOf(w, b, i) ** 2;
  return total / idx.length;
}

/** The gradient of that loss: the mean of (2e·x, 2e) over the points. */
export function gradOn(w: number, b: number, idx: readonly number[] = ALL): Vec {
  let gw = 0;
  let gb = 0;
  for (const i of idx) {
    const e = errorOf(w, b, i);
    gw += 2 * e * DATA[i].x;
    gb += 2 * e;
  }
  return [gw / idx.length, gb / idx.length];
}

/** The lowest point of the bowl, the least-squares line. */
export const MIN: Vec = (() => {
  const mx = DATA.reduce((s, d) => s + d.x, 0) / N;
  const my = DATA.reduce((s, d) => s + d.y, 0) / N;
  const sxy = DATA.reduce((s, d) => s + (d.x - mx) * (d.y - my), 0);
  const sxx = DATA.reduce((s, d) => s + (d.x - mx) ** 2, 0);
  const w = sxy / sxx;
  return [w, my - w * mx];
})();
export const L_MIN = lossOn(MIN[0], MIN[1]);

// ───────────────────────────── shuffles, batches and runs ─────────────────────────────

/** A Fisher–Yates shuffle of `order`: from the end down, swap each place with a random one at or before it. */
export function shuffle(order: readonly number[], u: () => number): number[] {
  const a = [...order];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(u() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cut an order into batches of `size`; the last one is short when `size` doesn't divide it. */
export function cut(order: readonly number[], size: number): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < order.length; k += size) out.push(order.slice(k, k + size));
  return out;
}

/** The batches of `epochs` epochs: each epoch reshuffles the order (the generator carries on) and cuts it up. */
export function epochBatches(seed: number, size: number, epochs: number): number[][][] {
  const u = createRng(seed);
  let order: number[] = [...ALL];
  return Array.from({ length: epochs }, () => {
    order = shuffle(order, u);
    return cut(order, size);
  });
}

export const stepsPerEpoch = (n: number, size: number) => Math.ceil(n / size);

/** A run of steps: where it was before each step and after the last, the full loss there, and each step's batch and rate. */
export type Run = { at: Vec[]; losses: number[]; batches: number[][]; rates: number[] };

/** Minibatch descent through the given batches, with step size rate(t) at step t (counting from 0). */
export function descend(start: Vec, batches: readonly (readonly number[])[], rate: (t: number) => number): Run {
  const at: Vec[] = [start];
  const losses = [lossOn(...start)];
  const rates: number[] = [];
  batches.forEach((batch, t) => {
    const [w, b] = at[t];
    const [gw, gb] = gradOn(w, b, batch);
    const eta = rate(t);
    rates.push(eta);
    at.push([w - eta * gw, b - eta * gb]);
    losses.push(lossOn(...at[t + 1]));
  });
  return { at, losses, batches: batches.map((b) => [...b]), rates };
}

// ───────────────────────────── schedules ─────────────────────────────

export type ScheduleId = 'constant' | 'step' | 'cosine' | 'warmup';
export const SCHEDULES: readonly ScheduleId[] = ['constant', 'step', 'cosine', 'warmup'];
export const SCHEDULE_NAMES: Record<ScheduleId, string> = { constant: 'constant', step: 'step decay', cosine: 'cosine', warmup: 'warmup, then cosine' };
/** The schedules story: batches of 4 for 12 epochs, 96 steps, from η₀ = 0.3. */
export const S_EPOCHS = 12;
export const S_BATCH = 4;
export const S_STEPS = S_EPOCHS * (N / S_BATCH);
export const ETA0 = 0.3;
/** Step decay halves η every this many epochs. */
export const DROP_EVERY = 3;
/** Warmup climbs over the first epoch's steps. */
export const WARMUP = N / S_BATCH;

/** The step size at step t (counting from 0) of `total`. */
export function rate(id: ScheduleId, t: number, total = S_STEPS, eta0 = ETA0, perEpoch = N / S_BATCH): number {
  if (id === 'constant') return eta0;
  if (id === 'step') return eta0 * 0.5 ** Math.floor(Math.floor(t / perEpoch) / DROP_EVERY);
  if (id === 'cosine') return (eta0 * (1 + Math.cos((Math.PI * t) / total))) / 2;
  if (t < WARMUP) return (eta0 * (t + 1)) / WARMUP;
  return (eta0 * (1 + Math.cos((Math.PI * (t - WARMUP)) / (total - WARMUP)))) / 2;
}

// ───────────────────────────── the spread of a batch's gradient ─────────────────────────────

/** The batch sizes the batch-size story offers (a drag moves along them). */
export const BATCH_SIZES = [1, 2, 4, 8, 16, 32] as const;
/** Random batches drawn for each cloud. */
export const CLOUD = 64;
/** Where the batch-size story stands, and the step size its clouds use. */
export const PROBE: Vec = [0.5, 0];
export const PROBE_ETA = 0.1;

/** σ₁: how far one point's gradient typically lands from the full gradient (the root mean square distance). */
export function sigmaOne(p: Vec): number {
  const [gw, gb] = gradOn(...p);
  let total = 0;
  for (const i of ALL) {
    const [w, b] = gradOn(p[0], p[1], [i]);
    total += (w - gw) ** 2 + (b - gb) ** 2;
  }
  return Math.sqrt(total / N);
}

/**
 * The same spread for a batch of `size`, over every batch it could be: σ₁/√B, a
 * little less because a batch never repeats a point (×√((n − B)/(n − 1))), and
 * 0 when the batch is the whole data.
 */
export const batchSpread = (p: Vec, size: number) => (sigmaOne(p) / Math.sqrt(size)) * Math.sqrt((N - size) / (N - 1));

/** The root mean square distance of some gradients from `centre`. */
export function spreadAround(grads: readonly Vec[], centre: Vec): number {
  return Math.sqrt(grads.reduce((s, g) => s + (g[0] - centre[0]) ** 2 + (g[1] - centre[1]) ** 2, 0) / grads.length);
}

/** `count` random batches of `size`, from consecutive epochs of one seed. */
export function randomBatches(seed: number, size: number, count = CLOUD): number[][] {
  return epochBatches(seed, size, Math.ceil(count / stepsPerEpoch(N, size))).flat().slice(0, count);
}

/** Where one step from p on a batch's gradient lands. */
export const stepFrom = (p: Vec, g: Vec, eta: number): Vec => [p[0] - eta * g[0], p[1] - eta * g[1]];

// ───────────────────────────── the stories' settings ─────────────────────────────

/** The paths story: batches of 4 at η = 0.1, 8 epochs, compared at 4. */
export const START: Vec = [-1, -1.5];
export const PATH_ETA = 0.1;
export const PATH_BATCH = 4;
export const PATH_EPOCHS = 8;
export const COMPARE_AT = 4;
export const PER_EPOCH = N / PATH_BATCH;

export type PathsRun = { epochs: number[][][]; mini: Run; full: Run };

/** The minibatch run and the full-batch run from the same start, one full step per epoch. */
export function pathsRun(seed: number): PathsRun {
  const epochs = epochBatches(seed, PATH_BATCH, PATH_EPOCHS);
  return {
    epochs,
    mini: descend(START, epochs.flat(), () => PATH_ETA),
    full: descend(START, Array.from({ length: PATH_EPOCHS }, () => ALL), () => PATH_ETA),
  };
}

/** How many steps made the full loss go up, among the first `t`. */
export const upSteps = (run: Run, t: number) => run.losses.slice(1, t + 1).filter((l, k) => l > run.losses[k]).length;

export const distanceToMin = (p: Vec) => Math.hypot(p[0] - MIN[0], p[1] - MIN[1]);

/** The angle in degrees between two directions. */
export function angleBetween(a: Vec, b: Vec): number {
  const cos = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** How far L sits above its lowest, on average over a schedules run's last epoch (the 8 points it reached). */
export const lastEpochExcess = (run: Run) => run.losses.slice(-(N / S_BATCH)).reduce((t, l) => t + l - L_MIN, 0) / (N / S_BATCH);

/** An angle for narration: one decimal below 10°, whole degrees above. */
export const degrees = (a: number) => `${fmt(a, a < 10 ? 1 : 0)}°`;

/** The schedules story's runs: every schedule through the same 96 batches. */
export function scheduleRuns(seed: number): Record<ScheduleId, Run> {
  const batches = epochBatches(seed, S_BATCH, S_EPOCHS).flat();
  return Object.fromEntries(SCHEDULES.map((id) => [id, descend(START, batches, (t) => rate(id, t))])) as Record<ScheduleId, Run>;
}

// ───────────────────────────── input ─────────────────────────────

export type SgdInput = { story: 'paths'; seed: number } | { story: 'batch'; batch: number; seed: number } | { story: 'schedules'; seed: number };
export type Story = SgdInput['story'];
const STORIES: Story[] = ['paths', 'batch', 'schedules'];

const pseudocode = [
  'w, b ← start;  pick η and batch B',
  'repeat for each epoch:',
  '  shuffle the order of the n points',
  '  for each batch of B points in it:',
  '    g ← mean gradient over the batch',
  '    (w, b) ← (w, b) − η·g',
  '    η ← schedule(step)',
  'full batch: B = n, one step an epoch',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const box = (w0: number, w1: number, b0: number, b1: number): { x: Axis; y: Axis } => ({ x: { min: w0, max: w1, label: 'w (slope)' }, y: { min: b0, max: b1, label: 'b (intercept)' } });
const FULL_BOX = box(-1.5, 4.5, -2, 4);
const ZOOM_BOX = box(0, 2, -0.5, 1.5);

const surfaceCache = new Map<string, { contours: ContourShape; wash: HeatmapShape }>();
const WASH_CELLS = 36;

/** The loss's contour map and a wash deepest at the lowest point, computed once per box and shared by every frame. */
function surface(name: string, b: { x: Axis; y: Axis }) {
  let got = surfaceCache.get(name);
  if (!got) {
    const f = (w: number, c: number) => lossOn(w, c);
    const samples: number[] = [];
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) samples.push(f(b.x.min + ((b.x.max - b.x.min) * i) / 40, b.y.min + ((b.y.max - b.y.min) * j) / 40));
    samples.sort((p, q) => p - q);
    const hi = samples[Math.floor(samples.length * 0.85)];
    const levels = contours(f, b, logLevels(L_MIN, hi, 12));
    const depth = (v: number) => Math.round(100 * Math.max(0, 1 - Math.log1p(Math.max(0, v - L_MIN)) / Math.log1p(hi - L_MIN))) / 100;
    const values: number[] = [];
    for (let r = 0; r < WASH_CELLS; r++) {
      const c = b.y.max - ((r + 0.5) * (b.y.max - b.y.min)) / WASH_CELLS;
      for (let k = 0; k < WASH_CELLS; k++) values.push(depth(f(b.x.min + ((k + 0.5) * (b.x.max - b.x.min)) / WASH_CELLS, c)));
    }
    got = {
      contours: { kind: 'contours', id: 'contours', levels },
      wash: { kind: 'heatmap', id: 'wash', x0: b.x.min, x1: b.x.max, y0: b.y.min, y1: b.y.max, cols: WASH_CELLS, rows: WASH_CELLS, values, scale: { kind: 'depth' } },
    };
    surfaceCache.set(name, got);
  }
  return got;
}

const r2 = (p: Vec): Vec => [round(p[0], 2), round(p[1], 2)];

function lossMap(label: string, shapes: Shape[], zoom = false, handles: PlanePart['handles'] = []): PlanePart {
  const b = zoom ? ZOOM_BOX : FULL_BOX;
  const s = surface(zoom ? 'zoom' : 'full', b);
  return {
    kind: 'plane',
    id: 'plane',
    label,
    ...b,
    equal: true,
    shapes: [s.wash, s.contours, { kind: 'point', id: 'min', at: r2(MIN), mark: 'found', size: 'sm', label: 'lowest' }, ...shapes],
    handles,
  };
}

const DATA_X: Axis = { min: -2.2, max: 2.2, label: 'x' };
const DATA_Y: Axis = { min: -3.2, max: 5, label: 'y' };

/** The 32 points, the current line through them, and the batch in use marked. */
function dataPlane(at: Vec, batch: readonly number[] | null, label: string): PlanePart {
  const inBatch = new Set(batch ?? []);
  return {
    kind: 'plane',
    id: 'data',
    label,
    x: DATA_X,
    y: DATA_Y,
    equal: false,
    shapes: [
      ...DATA.map((d, i): Shape => ({ kind: 'point', id: `p${i}`, at: [d.x, d.y], size: 'sm', ...(inBatch.has(i) ? { mark: 'compare' as const } : {}) })),
      { kind: 'line', id: 'fit', through: [0, round(at[1], 2)], dir: [1, round(at[0], 2)], mark: 'key', label: 'y = w·x + b' },
    ],
    handles: [],
  };
}

/** log₁₀ of how far the loss is above its lowest, floored at 0.0001. */
const LOG_FLOOR = -4;
export const logExcess = (loss: number) => round(Math.max(LOG_FLOOR, Math.log10(Math.max(loss - L_MIN, 1e-12))), 2);
const LOSS_AXIS: Axis = {
  min: LOG_FLOOR - 0.2,
  max: 1.6,
  label: 'L − lowest L (log scale)',
  ticks: [-4, -3, -2, -1, 0, 1].map((k) => ({ at: k, label: ['0.0001', '0.001', '0.01', '0.1', '1', '10'][k + 4] })),
};
const epochAxis = (epochs: number): Axis => ({
  min: 0,
  max: epochs,
  label: 'epochs',
  ticks: Array.from({ length: epochs + 1 }, (_, k) => k)
    .filter((k) => epochs <= 8 || k % 3 === 0)
    .map((k) => ({ at: k, label: String(k) })),
});

type Series = { id: string; run: Run; upto: number; perEpoch: number; tone: 1 | 2 | 3 | 4; label: string; dots?: boolean };

function lossChart(epochs: number, label: string, series: Series[]): PlanePart {
  return {
    kind: 'plane',
    id: 'loss',
    label,
    x: epochAxis(epochs),
    y: LOSS_AXIS,
    equal: false,
    shapes: series.flatMap((s): Shape[] => {
      const points = s.run.losses.slice(0, s.upto + 1).map((l, t): Vec => [round(t / s.perEpoch, 3), logExcess(l)]);
      return points.length < 2 ? [] : [{ kind: 'path', id: s.id, points, tone: s.tone, label: s.label, ...(s.dots ? { dots: true } : {}) }];
    }),
    handles: [],
  };
}

const pathShape = (id: string, run: Run, upto: number, tone: 1 | 2 | 3 | 4, label: string, dots = false): Shape[] =>
  upto < 1 ? [] : [{ kind: 'path', id, points: run.at.slice(0, upto + 1).map(r2), tone, label, ...(dots ? { dots: true } : {}) }];

const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });
const L3 = (v: number) => fmt(v, 3);
/** How far a loss is above the lowest, to 4 places. */
export const aboveLowest = (v: number) => (v - L_MIN < 0.00005 ? '< 0.0001' : fmt(v - L_MIN, 4));

// ───────────────────────────── story 1: full batch against minibatches ─────────────────────────────

export const AVERAGE_CHOICES = ['Exactly the full gradient', 'Near the full gradient, but not equal', 'Eight times the full gradient', 'Unrelated to the full gradient'];
export const EVERY_STEP = ['Yes: every step goes downhill', 'No: on some steps L goes up'];
export const SAME_BATCH = ['Yes, likely', 'No, unlikely'];
export const CLOSER = ['The full-batch path, after 4 steps', 'The minibatch path, after 32 steps'];
export const COME_TO_REST = ['Yes, it settles there', 'No, it keeps jittering around it'];

type FrameOptions = Omit<Parameters<typeof plotFrame>[1], 'stats'>;

function* pathsStory(seed: number): Generator<Frame<PlotState>> {
  const { epochs, mini, full } = pathsRun(seed);
  const G = gradOn(...START);
  const firstGrads = epochs[0].map((b) => gradOn(START[0], START[1], b));
  const average: Vec = [firstGrads.reduce((s, g) => s + g[0], 0) / PER_EPOCH, firstGrads.reduce((s, g) => s + g[1], 0) / PER_EPOCH];
  const T = PATH_EPOCHS * PER_EPOCH;

  const map = (t: number, fullSteps: number, extra: Shape[] = []) =>
    lossMap('The loss L over (w, b), and the paths', [
      ...pathShape('full', full, fullSteps, 1, 'full batch', true),
      ...pathShape('mini', mini, t, 2, 'batches of 4'),
      ...extra,
      ...(fullSteps ? [{ kind: 'point', id: 'fullnow', at: r2(full.at[fullSteps]), size: 'md', tone: 1 } as Shape] : []),
      { kind: 'point', id: 'now', at: r2(mini.at[t]), mark: 'key', size: 'lg' },
    ]);
  const chart = (t: number, fullSteps: number) =>
    lossChart(PATH_EPOCHS, 'How far L is above its lowest', [
      { id: 'lfull', run: full, upto: fullSteps, perEpoch: 1, tone: 1, label: 'full batch', dots: true },
      { id: 'lmini', run: mini, upto: t, perEpoch: PER_EPOCH, tone: 2, label: 'batches of 4' },
    ]);
  const values = (t: number, more: Readout[] = []) =>
    readouts([
      { id: 'epoch', label: 'epoch', value: String(Math.ceil(t / PER_EPOCH)) },
      { id: 'steps', label: 'steps taken', value: String(t) },
      { id: 'at', label: '(w, b)', value: fmtVec(mini.at[t]), mark: 'key' },
      { id: 'loss', label: 'L', value: L3(mini.losses[t]) },
      ...more,
    ]);
  const frame = (t: number, parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { steps: t, points: PATH_BATCH * t } });
  const vars = (t: number): Record<string, number> => ({ w: round(mini.at[t][0], 3), b: round(mini.at[t][1], 3), η: PATH_ETA, B: PATH_BATCH });
  const points = (at: Vec, batch: readonly number[] | null, label: string) => dataPlane(at, batch, label);
  const START_LABEL = 'The 32 points and the line y = w·x + b';

  // 0: the problem.
  yield frame(0, [points(START, null, START_LABEL), map(0, 0), chart(0, 0), values(0, [{ id: 'eta', label: 'η', value: String(PATH_ETA) }, { id: 'n', label: 'points n', value: String(N) }])], {
    line: 0,
    note: `Fit a line y = w·x + b to these ${N} points. Its loss L is the mean of the squared errors (w·x + b − y)² over the points: a bowl over (w, b) whose lowest point, ${fmtVec(MIN)}, is the best line, with L = ${L3(L_MIN)}. Full-batch gradient descent works out the gradient over all ${N} points for every step. Minibatch descent, often called SGD, shuffles the points, cuts them into batches of ${PATH_BATCH} and takes one step per batch. One pass through all the points is an epoch.`,
    vars: vars(0),
    checkpoint: ask(`With batches of ${PATH_BATCH} from ${N} points, how many steps make one epoch?`, String(PER_EPOCH), [String(PATH_BATCH), String(N), String(N * PATH_BATCH)]),
  });

  // 1: the first shuffle, and the eight steps its batches would take from the start.
  const fan: Shape[] = [
    ...firstGrads.map((g, k): Shape => ({ kind: 'vector', id: `fan${k}`, from: r2(START), to: r2(stepFrom(START, g, PATH_ETA)), tone: 2, ...(k === 0 ? { label: 'a batch' } : {}) })),
    { kind: 'vector', id: 'fullstep', from: r2(START), to: r2(stepFrom(START, G, PATH_ETA)), tone: 1, label: 'full batch' },
  ];
  const widest = Math.max(...firstGrads.map((g) => angleBetween(g, G)));
  yield frame(0, [points(START, null, START_LABEL), map(0, 0, fan), chart(0, 0), values(0, [{ id: 'g', label: 'full gradient', value: fmtVec(G), tone: 1 }])], {
    line: 2,
    note: `Epoch 1 shuffles the ${N} points into a random order and cuts it into ${PER_EPOCH} batches of ${PATH_BATCH}. Each thin arrow is the step one batch would take from the start: −η times the mean gradient over its ${PATH_BATCH} points. They fan out, up to ${Math.round(widest)}° off the full-batch step, because each batch sees only ${PATH_BATCH} of the points.`,
    vars: vars(0),
    checkpoint: askInOrder(`The ${PER_EPOCH} batches share out the ${N} points between them. What is the average of their ${PER_EPOCH} gradients?`, AVERAGE_CHOICES, AVERAGE_CHOICES[0]),
  });

  // 2: their average is the full gradient.
  const avgArrow: Shape = { kind: 'vector', id: 'avg', from: r2(START), to: r2(stepFrom(START, average, PATH_ETA)), mark: 'found', dashed: true, label: 'their average' };
  yield frame(
    0,
    [
      points(START, null, START_LABEL),
      map(0, 0, [...fan, avgArrow]),
      chart(0, 0),
      values(0, [
        { id: 'g', label: 'full gradient', value: fmtVec(G), tone: 1 },
        { id: 'avg', label: `mean of the ${PER_EPOCH} batch gradients`, value: fmtVec(average), mark: 'found' },
      ]),
    ],
    {
      line: 4,
      note: `The ${PER_EPOCH} batch gradients average to ${fmtVec(average)}, the full gradient itself: each is the mean over ${PATH_BATCH} points, and the mean of ${PER_EPOCH} equal-sized groups' means is the mean of all ${N}. So a random batch's gradient points the full gradient's way on average. Each one misses, but its miss is an average of ${PATH_BATCH} random points' misses, so, as the central limit theorem says, it shrinks like 1/√(batch size).`,
      vars: vars(0),
      checkpoint: askInOrder(`Over the ${COMPARE_AT * PER_EPOCH} steps of ${COMPARE_AT} epochs, will the full loss L go down on every step?`, EVERY_STEP, EVERY_STEP[1]),
    },
  );

  // 3: the race, before any step.
  yield frame(
    0,
    [
      points(START, null, START_LABEL),
      map(0, 0, [{ kind: 'vector', id: 'fullstep', from: r2(START), to: r2(stepFrom(START, G, PATH_ETA)), tone: 1, label: 'full-batch step' }]),
      chart(0, 0),
      values(0, [
        { id: 'fullper', label: 'full batch: steps per epoch', value: '1', tone: 1 },
        { id: 'miniper', label: `batches of ${PATH_BATCH}: steps per epoch`, value: String(PER_EPOCH), tone: 2 },
        { id: 'cost', label: 'point-gradients per epoch, either way', value: String(N) },
      ]),
    ],
    {
      line: 1,
      note: `The race: both runs start at ${fmtVec(START)} with η = ${PATH_ETA}. Each epoch costs either run ${N} point-gradients, one per point. The full batch spends them on 1 careful step down the full gradient; the minibatches spend them on ${PER_EPOCH} quick steps, each on an estimate that misses.`,
      vars: vars(0),
      checkpoint: askInOrder(`After ${COMPARE_AT} epochs, the same cost for both, which path will be closer to the lowest point?`, CLOSER, CLOSER[1]),
    },
  );

  // 4–11: the eight steps of epoch 1.
  for (let t = 1; t <= PER_EPOCH; t++) {
    const before = mini.at[t - 1];
    const g = gradOn(before[0], before[1], mini.batches[t - 1]);
    const gFull = gradOn(...before);
    const fullSteps = t === PER_EPOCH ? 1 : 0;
    const rose = mini.losses[t] > mini.losses[t - 1];
    yield frame(
      t,
      [
        points(mini.at[t], mini.batches[t - 1], `Batch ${t} of epoch 1 marked; the line after step ${t}`),
        map(t, fullSteps, [{ kind: 'vector', id: 'fullstep', from: r2(before), to: r2(stepFrom(before, gFull, PATH_ETA)), tone: 1, dashed: true, label: 'full-batch step' }]),
        chart(t, fullSteps),
        values(t, [
          { id: 'g', label: 'batch gradient', value: fmtVec(g), tone: 2 },
          { id: 'gfull', label: 'full gradient there', value: fmtVec(gFull), tone: 1 },
          { id: 'up', label: 'steps where L went up', value: `${upSteps(mini, t)} of ${t}` },
        ]),
      ],
      {
        line: 5,
        note: `Step ${t} uses batch ${t}, the ${PATH_BATCH} points marked. Their mean gradient is ${fmtVec(g)}, against ${fmtVec(gFull)} over all ${N}, so the step heads ${degrees(angleBetween(g, gFull))} off the full-batch direction (the dashed arrow). L ${rose ? 'went up' : 'went down'}, from ${L3(mini.losses[t - 1])} to ${L3(mini.losses[t])}.${
          t === PER_EPOCH ? ` That ends epoch 1: ${PER_EPOCH} steps for the cost of one full-batch step, which took L from ${L3(full.losses[0])} to ${L3(full.losses[1])}.` : ''
        }`,
        vars: vars(t),
        ...(t === PER_EPOCH ? { checkpoint: askInOrder(`Epoch 2 reshuffles the points. Is its first batch likely to be the same ${PATH_BATCH} points as epoch 1’s first batch?`, SAME_BATCH, SAME_BATCH[1]) } : {}),
      },
    );
  }

  // 12–14: epochs 2 to 4, a frame each.
  const shared = epochs[1][0].filter((i) => epochs[0][0].includes(i)).length;
  for (let e = 2; e <= COMPARE_AT; e++) {
    const t = e * PER_EPOCH;
    const more: Readout[] = [
      { id: 'up', label: 'steps where L went up', value: `${upSteps(mini, t)} of ${t}` },
      { id: 'fullloss', label: `full batch after ${e} steps: L`, value: L3(full.losses[e]), tone: 1 },
    ];
    if (e === COMPARE_AT) {
      more.push(
        { id: 'dmini', label: 'distance to the lowest point, batches of 4', value: fmt(distanceToMin(mini.at[t]), 3), tone: 2 },
        { id: 'dfull', label: 'distance to the lowest point, full batch', value: fmt(distanceToMin(full.at[e]), 3), tone: 1 },
      );
    }
    const note =
      e === 2
        ? `Epoch 2 drew a new order: its first batch shares ${shared} of its ${PATH_BATCH} points with epoch 1’s first batch. After ${t} steps the line is at ${fmtVec(mini.at[t])} with L = ${L3(mini.losses[t])}, and L went up on ${upSteps(mini, t)} of those steps: each batch pulls towards the line that suits its own ${PATH_BATCH} points. The full-batch path has taken 2 steps.`
        : e === 3
          ? `Epoch 3: L = ${L3(mini.losses[t])} after ${t} steps, near the lowest ${L3(L_MIN)}, while the full-batch path, after 3 steps, has L = ${L3(full.losses[3])}. A full-batch step is smoother, but it costs as much as ${PER_EPOCH} minibatch steps.`
          : `After ${COMPARE_AT} epochs, each run has used every point ${COMPARE_AT} times: the minibatch path is ${fmt(distanceToMin(mini.at[t]), 3)} from the lowest point and the full-batch path ${fmt(distanceToMin(full.at[e]), 3)}. L went up on ${upSteps(mini, t)} of the ${t} minibatch steps, yet over the run it fell from ${L3(mini.losses[0])} to ${L3(mini.losses[t])}.`;
    const checkpoint =
      e === COMPARE_AT
          ? askInOrder(`Keep going at η = ${PATH_ETA} for ${PATH_EPOCHS - COMPARE_AT} more epochs. Will the minibatch path come to rest at the lowest point?`, COME_TO_REST, COME_TO_REST[1])
          : undefined;
    yield frame(
      t,
      [
        points(mini.at[t], e === 2 ? epochs[1][0] : null, e === 2 ? 'Epoch 2’s first batch marked; the line after epoch 2' : `The line after epoch ${e}`),
        map(t, e),
        chart(t, e),
        values(t, more),
      ],
      { line: e === 2 ? 2 : 3, note, vars: vars(t), ...(checkpoint ? { checkpoint } : {}) },
    );
  }

  // 15: four more epochs: the jitter at the bottom.
  const lastEpoch = mini.at.slice(T - PER_EPOCH + 1, T + 1).map(distanceToMin);
  const lo = fmt(Math.min(...lastEpoch), 3);
  const hi = fmt(Math.max(...lastEpoch), 3);
  yield frame(
    T,
    [
      points(mini.at[T], null, `The line after epoch ${PATH_EPOCHS}`),
      map(T, PATH_EPOCHS),
      chart(T, PATH_EPOCHS),
      values(T, [
        { id: 'up', label: 'steps where L went up', value: `${upSteps(mini, T)} of ${T}` },
        { id: 'jitter', label: `distance to the lowest point in epoch ${PATH_EPOCHS}`, value: `${lo} to ${hi}`, tone: 2 },
        { id: 'dfull', label: 'full batch: distance to the lowest point', value: fmt(distanceToMin(full.at[PATH_EPOCHS]), 3), tone: 1 },
      ]),
    ],
    {
      line: 7,
      note: `${PATH_EPOCHS} epochs. The minibatch path never settles: in epoch ${PATH_EPOCHS} it stayed between ${lo} and ${hi} from the lowest point. Near the bottom the full gradient shrinks to nothing, but a batch's gradient still misses it: there one point's gradient misses by about ${fmt(sigmaOne(MIN), 1)} (σ₁), so a batch of ${PATH_BATCH} by about ${fmt(sigmaOne(MIN) / Math.sqrt(PATH_BATCH), 1)}. Each step is then mostly noise. The full-batch path creeps on (${fmt(distanceToMin(full.at[PATH_EPOCHS]), 3)} away) at ${N} point-gradients a step. A smaller η shrinks the jitter, and a schedule shrinks η as training goes.`,
      vars: vars(T),
    },
  );
}

// ───────────────────────────── story 2: the batch size ─────────────────────────────

export const WIDTH_CHOICES = ['About the same', 'About half as wide', 'About a quarter as wide'];
export const COST_CHOICES = ['The same: 32', '16 times as many: 512', 'A sixteenth as many: 2'];
export const WHOLE_CHOICES = ['As wide as for batches of 16', 'Half as wide as for batches of 16', 'No width: every step is the full-batch step'];

/** The cloud for one batch size: every single point for B = 1, else 64 random batches; each batch's gradient and where its step lands. */
export function cloudFor(size: number, seed: number): { batches: number[][]; grads: Vec[]; tips: Vec[] } {
  const batches = size === 1 ? ALL.map((i) => [i]) : randomBatches(seed, size);
  const grads = batches.map((b) => gradOn(PROBE[0], PROBE[1], b));
  return { batches, grads, tips: grads.map((g) => stepFrom(PROBE, g, PROBE_ETA)) };
}

/** Steps whose landing point has a higher full loss than where they started. */
export const uphill = (tips: readonly Vec[]) => tips.filter((p) => lossOn(...p) > lossOn(...PROBE)).length;

const log2 = (n: number) => Math.round(Math.log2(n));

function* batchStory(chosen: number, seed: number): Generator<Frame<PlotState>> {
  const G = gradOn(...PROBE);
  const L0 = lossOn(...PROBE);
  const sigma = sigmaOne(PROBE);
  const exact = (size: number) => batchSpread(PROBE, size);
  const clouds = new Map(BATCH_SIZES.map((s) => [s as number, cloudFor(s, seed)]));
  const cloud = (size: number) => clouds.get(size) ?? cloudFor(size, seed);
  const fullTip = stepFrom(PROBE, G, PROBE_ETA);
  const SPREAD_Y: Axis = { min: 0, max: Math.ceil(sigma * 1.15), label: 'spread of a batch’s gradient' };
  const SPREAD_X: Axis = { min: -0.5, max: 5.5, label: 'batch size B (log scale)', ticks: BATCH_SIZES.map((s) => ({ at: log2(s), label: String(s) })) };

  const map = (size: number | null, extra: Shape[] = []) => {
    const c = size === null ? null : cloud(size);
    const label = size === null ? 'Where one step from (0.5, 0) lands' : `Where one step lands, on ${size === 1 ? 'each single point' : `${CLOUD} random batches of ${size}`}`;
    return lossMap(
      label,
      [
        ...(c
          ? c.tips.map((p, k): Shape => {
              const up = lossOn(...p) > L0;
              return { kind: 'point', id: `tip${k}`, at: r2(p), size: 'sm', ...(up ? { mark: 'reject' as const } : {}) };
            })
          : []),
        { kind: 'vector', id: 'fullstep', from: r2(PROBE), to: r2(fullTip), tone: 1, label: 'full-batch step' },
        ...extra,
        { kind: 'point', id: 'here', at: r2(PROBE), mark: 'key', size: 'lg', label: '(w, b)' },
      ],
      true,
    );
  };
  const chart = (shown: readonly number[], highlight: number | null, rule = true): PlanePart => ({
    kind: 'plane',
    id: 'spread',
    label: 'How widely a batch’s gradient misses the full one',
    x: SPREAD_X,
    y: SPREAD_Y,
    equal: false,
    shapes: [
      ...(rule ? [{
        kind: 'path',
        id: 'rule',
        points: Array.from({ length: 21 }, (_, k): Vec => [round(k / 4, 2), round(sigma / Math.sqrt(2 ** (k / 4)), 2)]),
        dashed: true,
        tone: 2,
        label: 'σ₁/√B',
      } as Shape] : []),
      {
        kind: 'bars',
        id: 'spreads',
        bars: shown.map((s): Bar => ({ id: `b${s}`, x0: log2(s) - 0.3, x1: log2(s) + 0.3, y: round(exact(s), 2), ...(s === highlight ? { mark: 'key' as const } : {}) })),
      },
      ...shown.map((s): Shape => ({ kind: 'label', id: `v${s}`, at: [log2(s), round(exact(s) + sigma * 0.08, 2)], text: fmt(exact(s), 2) })),
    ],
    handles: [{ id: 'batch', at: [log2(chosen), 0], label: 'batch size', mark: 'key', step: 1, min: [0, 0], max: [5, 0] }],
  });
  const about = (size: number, cost = true): Readout[] => {
    const c = cloud(size);
    return [
      { id: 'batch', label: 'batch size B', value: String(size), mark: 'key' },
      { id: 'steps', label: 'steps per epoch', value: String(stepsPerEpoch(N, size)) },
      ...(cost ? [{ id: 'cost', label: 'point-gradients per epoch', value: String(stepsPerEpoch(N, size) * size) }] : []),
      { id: 'spread', label: 'gradient spread, every possible batch', value: fmt(exact(size), 2), tone: 2 },
      { id: 'measured', label: `gradient spread, the ${c.grads.length} drawn`, value: fmt(spreadAround(c.grads, G), 2) },
      { id: 'uphill', label: 'steps that go uphill', value: `${uphill(c.tips)} of ${c.tips.length}`, mark: 'reject' },
    ];
  };
  const frame = (parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { steps: 0, points: 0 } });
  const vars = (size: number | null): Record<string, number> => ({ w: PROBE[0], b: PROBE[1], η: PROBE_ETA, ...(size === null ? {} : { B: size }) });
  const sizeQ = String(stepsPerEpoch(N, chosen));

  // 0: the point and its full gradient.
  const up1 = uphill(cloud(1).tips);
  yield frame(
    [
      map(null),
      chart([], null, false),
      readouts([
        { id: 'at', label: '(w, b)', value: fmtVec(PROBE), mark: 'key' },
        { id: 'loss', label: 'L', value: L3(L0) },
        { id: 'g', label: 'full gradient', value: fmtVec(G), tone: 1 },
        { id: 'eta', label: 'η', value: String(PROBE_ETA) },
      ]),
    ],
    {
      line: 4,
      note: `Stand at (w, b) = ${fmtVec(PROBE)}, partway down the bowl, where L = ${L3(L0)}. The gradient over all ${N} points is ${fmtVec(G)}, and a full-batch step with η = ${PROBE_ETA} lands at the arrow's tip. A batch's gradient is the mean over just its points, an estimate of that full gradient. The smallest batch is a single point.`,
      vars: vars(null),
      checkpoint: askInOrder(`Take one step with η = ${PROBE_ETA} on a single point’s gradient. Will every one of the ${N} possible steps go downhill on the full loss L?`, ['Yes', 'No'], up1 > 0 ? 'No' : 'Yes'),
    },
  );

  // 1: batches of 1.
  yield frame([map(1), chart([1], null, false), readouts(about(1, false))], {
    line: 4,
    note: `Each dot is where a step on one point's gradient lands. They scatter widely around the full-batch step, and ${up1} of the ${N} land higher up the bowl than where they started (marked as rejected): that point's error pulls the line its own way, against the rest. How far a single point's gradient lands from the full one, as a root mean square of the ${N} distances (a standard deviation for arrows), is σ₁ = ${fmt(sigma, 2)}, more than the full gradient's own length, ${fmt(Math.hypot(...G), 2)}.`,
    vars: vars(1),
    checkpoint: askInOrder('Batches of 4: how wide will the cloud of steps be, against batches of 1?', WIDTH_CHOICES, WIDTH_CHOICES[1]),
  });

  // 2: batches of 4.
  yield frame([map(4), chart([1, 4], null), readouts(about(4, false))], {
    line: 3,
    note: `With batches of 4 the batch gradients spread ${fmt(exact(4), 2)} against ${fmt(exact(1), 2)}, about half, and so do the steps on the map (η = ${PROBE_ETA} times that). A batch's gradient is the average of 4 random points' gradients, and an average of n random draws spreads σ/√n, so σ₁/√4 = ${fmt(sigma / 2, 2)}. It comes out a little less because a batch is drawn without repeats from only ${N} points: the bigger its share of the data, the less is left to chance. The ${CLOUD} batches drawn here spread ${fmt(spreadAround(cloud(4).grads, G), 2)}${fmt(spreadAround(cloud(4).grads, G), 2) === fmt(exact(4), 2) ? '' : ', a little off by luck'}, and ${uphill(cloud(4).tips)} of their steps go uphill.`,
    vars: vars(4),
    checkpoint: askInOrder('Batches of 16 use 16 point-gradients a step. How many does one epoch use, against 32 for batches of 1?', COST_CHOICES, COST_CHOICES[0]),
  });

  // 3: batches of 16.
  yield frame([map(16), chart([1, 4, 16], null), readouts(about(16))], {
    line: 3,
    note: `Batches of 16 take ${stepsPerEpoch(N, 16)} steps an epoch, so an epoch costs ${N} point-gradients whatever the batch size: a bigger batch buys steadier steps, not more of them. The batch gradients spread ${fmt(exact(16), 2)}, well below σ₁/√16 = ${fmt(sigma / 4, 2)}: a batch is half the data now, so much less is left to chance.`,
    vars: vars(16),
    checkpoint: askInOrder('Batches of 32 are the whole data. How wide will that cloud be?', WHOLE_CHOICES, WHOLE_CHOICES[2]),
  });

  // 4: batches of 32: the full batch.
  yield frame([map(32), chart([1, 4, 16, 32], null), readouts(about(32))], {
    line: 7,
    note: `A batch of all ${N} points is the full batch: every one of the ${CLOUD} steps lands on the full-batch step, so the cloud has no width, and an epoch is a single step. Between 1 and ${N}, the batch size trades the number of steps per epoch against the noise in each.`,
    vars: vars(32),
  });

  // 5: the chosen batch size.
  const all = [...BATCH_SIZES];
  yield frame([map(chosen), chart(all, chosen), readouts(about(chosen).filter((r) => r.id === 'batch' || r.id === 'spread'))], {
    line: 3,
    note: `This run's batch size is ${chosen}, highlighted: drag it along the axis. Its batch gradients spread ${fmt(exact(chosen), 2)} around the full gradient. The bars are the spread for every batch size, under the dashed σ₁/√B: they follow it closely for small batches and fall to 0 at the whole data.`,
    vars: vars(chosen),
    checkpoint: ask(`With batches of ${chosen}, how many steps does one epoch take?`, sizeQ, [String(chosen), String(N * chosen), String(N)]),
  });

  // 6: the trade-off.
  yield frame([map(chosen), chart(all, chosen), readouts(about(chosen))], {
    line: 4,
    note: `Batches of ${chosen} take ${sizeQ} step${sizeQ === '1' ? '' : 's'} an epoch. So which batch size? Each epoch costs the same ${N} point-gradients. Small batches take many cheap, noisy steps; big ones take few, steady, expensive ones, and quadrupling the batch only halves the noise. On a GPU the points of a batch are worked on at the same time, so a step on 64 points can take barely longer than a step on 1: in practice batches of 32 to a few thousand are common, and the noise of a small batch is tolerated, even welcomed.`,
    vars: vars(chosen),
  });
}

// ───────────────────────────── story 3: schedules ─────────────────────────────

export const WARMUP_CHOICES = [
  'The start is arbitrary and its gradients are big, so full-size steps can throw the weights far off',
  'Small steps cost less to work out',
  'The loss is already near its lowest at the start',
];
export const SCHEDULE_TONE: Record<ScheduleId, 1 | 2 | 3 | 4> = { constant: 2, step: 1, cosine: 3, warmup: 4 };
const S_PER_EPOCH = N / S_BATCH;

function* schedulesStory(seed: number): Generator<Frame<PlotState>> {
  const runs = scheduleRuns(seed);
  const RATE_Y: Axis = { min: 0, max: 0.33, label: 'step size η' };
  const rateChart = (shown: readonly ScheduleId[]): PlanePart => ({
    kind: 'plane',
    id: 'rates',
    label: 'The step size η at each step, by epoch',
    // No x-axis label: the schedules' names end on the axis, bottom right, where it would sit. The caption says it.
    x: { ...epochAxis(S_EPOCHS), label: undefined },
    y: RATE_Y,
    equal: false,
    shapes: shown.map(
      (id): Shape => ({
        kind: 'path',
        id: `rate-${id}`,
        points: Array.from({ length: S_STEPS }, (_, t) => [[round(t / S_PER_EPOCH, 3), round(rate(id, t), 4)] as Vec, [round((t + 1) / S_PER_EPOCH, 3), round(rate(id, t), 4)] as Vec]).flat(),
        tone: SCHEDULE_TONE[id],
        label: SCHEDULE_NAMES[id],
      }),
    ),
    handles: [],
  });
  const map = (shown: readonly ScheduleId[]) =>
    lossMap('The loss L over (w, b), and the paths', [
      ...shown.flatMap((id) => pathShape(`path-${id}`, runs[id], S_STEPS, SCHEDULE_TONE[id], SCHEDULE_NAMES[id])),
      ...shown.map((id): Shape => ({ kind: 'point', id: `end-${id}`, at: r2(runs[id].at[S_STEPS]), size: 'md', tone: SCHEDULE_TONE[id] })),
      { kind: 'point', id: 'start', at: r2(START), mark: 'key', size: 'lg', label: 'start' },
    ]);
  const chart = (shown: readonly ScheduleId[]) =>
    lossChart(
      S_EPOCHS,
      'How far L is above its lowest',
      shown.map((id) => ({ id: `loss-${id}`, run: runs[id], upto: S_STEPS, perEpoch: S_PER_EPOCH, tone: SCHEDULE_TONE[id], label: SCHEDULE_NAMES[id] })),
    );
  const lastEpoch = (id: ScheduleId) => runs[id].at.slice(S_STEPS - S_PER_EPOCH + 1).map(distanceToMin);
  const finals = (shown: readonly ScheduleId[]): Readout[] =>
    shown.map((id) => ({ id: `end-${id}`, label: `${SCHEDULE_NAMES[id]}: mean of L above its lowest, last epoch`, value: aboveLowest(L_MIN + lastEpochExcess(runs[id])), tone: SCHEDULE_TONE[id] }));
  const setup: Readout[] = [
    { id: 'eta0', label: 'η₀', value: String(ETA0) },
    { id: 'batch', label: 'batch size', value: String(S_BATCH) },
    { id: 'steps', label: 'steps', value: `${S_STEPS} (${S_EPOCHS} epochs)` },
  ];
  const frame = (t: number, parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { steps: t, points: S_BATCH * t } });
  const vars = (id?: ScheduleId): Record<string, number> => ({ η0: ETA0, B: S_BATCH, steps: S_STEPS, ...(id ? { 'final L': round(runs[id].losses[S_STEPS], 4) } : {}) });
  const ALL_S: ScheduleId[] = [...SCHEDULES];

  // 0: constant.
  yield frame(0, [rateChart(['constant']), map([]), chart([]), readouts(setup)], {
    line: 6,
    note: `Fit the same line with batches of ${S_BATCH} for ${S_EPOCHS} epochs, ${S_STEPS} steps in all. A schedule sets the step size η at each step t. The simplest keeps it constant at η₀ = ${ETA0} (η₀ is the step size a schedule starts from), three times the paths story's 0.1, bold enough to get down the bowl fast. Step decay instead cuts η in stages as training goes.`,
    vars: vars(),
    checkpoint: ask(`Step decay starts at η = ${ETA0} and halves it every ${DROP_EVERY} epochs. What is η in epoch ${S_EPOCHS}, the last?`, fmt(rate('step', S_STEPS - 1), 5), [fmt(ETA0 / 16, 5), fmt(ETA0 / 4, 5), fmt(ETA0 / S_EPOCHS, 5)]),
  });

  // 1: step decay.
  yield frame(0, [rateChart(['constant', 'step']), map([]), chart([]), readouts([...setup, { id: 'last', label: 'step decay in the last epoch', value: fmt(rate('step', S_STEPS - 1), 5), tone: SCHEDULE_TONE.step }])], {
    line: 6,
    note: `Step decay keeps η = ${ETA0} for epochs 1 to ${DROP_EVERY}, then halves it at the start of epochs ${DROP_EVERY + 1}, ${2 * DROP_EVERY + 1} and ${3 * DROP_EVERY + 1}: three halvings, not ${S_EPOCHS / DROP_EVERY}, so the last ${DROP_EVERY} epochs run at ${ETA0} ÷ 8 = ${fmt(rate('step', S_STEPS - 1), 5)}. The cosine schedule glides down instead, following half a turn of a cosine from η₀ to 0.`,
    vars: vars(),
    checkpoint: ask(`Cosine sets η = ${ETA0} × (1 + cos(π·t/${S_STEPS}))/2 at step t. What is η at step ${S_STEPS / 2}, halfway?`, fmt(rate('cosine', S_STEPS / 2), 4), ['0', String(ETA0)]),
  });

  // 2: cosine.
  yield frame(0, [rateChart(['constant', 'step', 'cosine']), map([]), chart([]), readouts([...setup, { id: 'half', label: `cosine at step ${S_STEPS / 2}`, value: fmt(rate('cosine', S_STEPS / 2), 4), tone: SCHEDULE_TONE.cosine }])], {
    line: 6,
    note: `Halfway, at t = ${S_STEPS / 2}, cos(π/2) = 0, so cosine's η is ${ETA0} × (1 + 0)/2 = ${fmt(rate('cosine', S_STEPS / 2), 4)}. It starts at cos 0 = 1, the full ${ETA0}, and ends near cos π = −1, almost 0. Warmup adds a ramp before it: η climbs in a straight line over the first epoch's ${WARMUP} steps, from ${fmt(rate('warmup', 0), 4)} to ${ETA0}, and only then decays.`,
    vars: vars(),
    checkpoint: askInOrder('Why would anyone start with tiny steps?', WARMUP_CHOICES, WARMUP_CHOICES[0]),
  });

  // 3: warmup.
  yield frame(0, [rateChart(ALL_S), map([]), chart([]), readouts(setup)], {
    line: 6,
    note: `At the start the weights are a guess and the gradients are big and erratic, so a full-size step can fling a deep network's weights somewhere it never recovers from. Warmup lets the first few steps feel out the ground. On this simple bowl it hardly matters, but large networks are commonly trained with warmup and then a cosine decay.`,
    vars: vars(),
    checkpoint: askInOrder(`Run all ${S_EPOCHS} epochs at the constant η = ${ETA0}. Will the path come to rest at the lowest point?`, COME_TO_REST, COME_TO_REST[1]),
  });

  // 4: the constant run.
  /** The first epoch after which constant's L is within 0.1 of its lowest. */
  const downBy = Math.max(1, Array.from({ length: S_EPOCHS }, (_, e) => e + 1).find((e) => runs.constant.losses[e * S_PER_EPOCH] - L_MIN < 0.1) ?? S_EPOCHS);
  const c = lastEpoch('constant');
  yield frame(S_STEPS, [rateChart(ALL_S), map(['constant']), chart(['constant']), readouts([...finals(['constant']), { id: 'jitter', label: 'constant: distance to the lowest point in the last epoch', value: `${fmt(Math.min(...c), 3)} to ${fmt(Math.max(...c), 3)}`, tone: 2 }])], {
    line: 5,
    note: `With η held at ${ETA0}, the path is down in the bowl within ${downBy === 1 ? 'an epoch' : `${downBy} epochs`} (L is ${aboveLowest(runs.constant.losses[downBy * S_PER_EPOCH])} above its lowest after epoch ${downBy}), then never settles: in the last epoch it stayed between ${fmt(Math.min(...c), 3)} and ${fmt(Math.max(...c), 3)} from the lowest point, and over that epoch L sat ${aboveLowest(L_MIN + lastEpochExcess(runs.constant))} above its lowest on average. Each step is η times a noisy gradient, so the noise in the steps never shrinks to nothing: L bounces along a floor set by η and the batch size.`,
    vars: vars('constant'),
    checkpoint: askInOrder('The same batches with the cosine schedule: over the last epoch, is its loss likely to be lower than constant’s on average?', ['Yes', 'No'], 'Yes'),
  });

  // 5: the cosine run.
  const k = lastEpoch('cosine');
  yield frame(S_STEPS, [rateChart(ALL_S), map(['constant', 'cosine']), chart(['constant', 'cosine']), readouts([...finals(['constant', 'cosine']), { id: 'jitter', label: 'cosine: distance to the lowest point in the last epoch', value: `${fmt(Math.min(...k), 4)} to ${fmt(Math.max(...k), 4)}`, tone: 3 }])], {
    line: 6,
    note: `Cosine took the same batches. Early on its η is nearly ${ETA0}, so it gets down the bowl as fast; as η shrinks, each step moves less, so the noise is averaged over more and more batches before it can push the line around. Over the last epoch its L sat ${aboveLowest(L_MIN + lastEpochExcess(runs.cosine))} above the lowest on average, against ${aboveLowest(L_MIN + lastEpochExcess(runs.constant))} for constant.`,
    vars: vars('cosine'),
  });

  // 6: all four.
  yield frame(S_STEPS, [rateChart(ALL_S), map(ALL_S), chart(ALL_S), readouts(finals(ALL_S))], {
    line: 7,
    note: `All four schedules on the same batches. The three that shrink η end close to the lowest point; constant is left bouncing. That is the job of a schedule: big steps while far away, small steps to settle. A full batch has no noise to settle, but costs a whole pass through the data for every step.`,
    vars: vars('cosine'),
  });
}

function* run(input: SgdInput): Generator<Frame<PlotState>> {
  if (input.story === 'paths') yield* pathsStory(input.seed);
  else if (input.story === 'batch') yield* batchStory(input.batch, input.seed);
  else yield* schedulesStory(input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const MAX_SEED = 4294967295;
const okSeed = (s: number) => Number.isInteger(s) && s >= 0 && s <= MAX_SEED;

export function parseSgd(text: string): { value: SgdInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as Story;
  const xs = numbersIn(text);
  if (!STORIES.includes(story)) return { error: 'Start with paths, batch or schedules, e.g. paths seed 7, or batch 16 seed 7.' };
  if (story === 'batch') {
    if (xs.length !== 2) return { error: 'Give the batch size and a seed, e.g. batch 16 seed 7.' };
    const [batch, seed] = xs;
    if (!(BATCH_SIZES as readonly number[]).includes(batch)) return { error: `The batch size is one of ${BATCH_SIZES.join(', ')}.` };
    if (!okSeed(seed)) return { error: 'The seed is a whole number, 0 or more.' };
    return { value: { story, batch, seed } };
  }
  if (xs.length !== 1 || !okSeed(xs[0])) return { error: `Give one seed, a whole number 0 or more, e.g. ${story} seed 7.` };
  return { value: { story, seed: xs[0] } };
}

export function formatSgd(input: SgdInput): string {
  return input.story === 'batch' ? `batch ${input.batch} seed ${input.seed}` : `${input.story} seed ${input.seed}`;
}

export function dragSgd(input: SgdInput, _handle: string, to: Vec): SgdInput {
  if (input.story !== 'batch') return input;
  return { ...input, batch: 2 ** snap(to[0], 1, 0, BATCH_SIZES.length - 1) };
}

const example = (id: string, label: string, make: (seed: number) => SgdInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const sgd = defineAlgorithm<SgdInput, PlotState>({
  kind: 'algorithm',
  slug: 'sgd',
  view: 'plot',
  input: {
    examples: [
      example('paths', 'Full batch against batches of 4', (seed) => ({ story: 'paths', seed })),
      example('batch-size', 'The batch size: noise against steps', (seed) => ({ story: 'batch', batch: 4, seed })),
      example('schedules', 'Schedules: constant, step decay, cosine, warmup', (seed) => ({ story: 'schedules', seed })),
    ],
    custom: {
      label: 'paths or schedules with a seed; batch with a batch size (1, 2, 4, 8, 16 or 32) and a seed',
      placeholder: 'e.g. paths seed 7, or batch 16 seed 7',
      parse: parseSgd,
      format: formatSgd,
    },
    drag: dragSgd,
  },
  pseudocode,
  stats: [
    { key: 'steps', label: 'Steps taken' },
    { key: 'points', label: 'Point-gradients used' },
  ],
  legend: [
    { neutral: 'Data points, contour lines, and where batch steps land' },
    { mark: 'key', label: 'The current (w, b) and its line; the batch size you drag' },
    { mark: 'compare', label: 'The points in the batch being used' },
    { mark: 'found', label: 'The lowest point of L; the average of the batch gradients' },
    { mark: 'reject', label: 'A step that lands higher up the bowl' },
    { tone: 1, label: 'Full batch; step decay' },
    { tone: 2, label: 'Batches of 4, and the σ₁/√B rule; constant η' },
    { tone: 3, label: 'Cosine schedule' },
    { tone: 4, label: 'Warmup, then cosine' },
  ],
  run,
  content: {
    idea: 'Gradient descent on a loss averaged over many data points needs every point for every step. Stochastic gradient descent shuffles the data, cuts it into small batches, and takes a step on each batch’s average gradient: noisy, but pointing the right way on average, and many more steps for each pass through the data (an epoch). A schedule shrinks the step size as training goes, so the noise settles.',
    invariant: 'A random batch’s gradient averages to the full gradient, and its miss shrinks like 1/√B with the batch size B (exactly 0 when the batch is all the data). Every epoch uses each point once, whatever the batch size; only the number of steps changes.',
    whenToUse: 'Whenever the loss is an average over more data than fits comfortably in one step: almost every neural network is trained with minibatches of 32 to a few thousand examples, reshuffled every epoch, with a schedule such as warmup and then cosine decay.',
    traits: [
      { label: 'Many cheap steps per pass through the data', good: true },
      { label: 'Steps are noisy; the loss can go up', good: false },
      { label: 'Needs a schedule to settle', good: null },
      { label: 'Same seed, same shuffles', good: null },
    ],
    experiments: [
      { example: 'paths', prompt: 'Press New values a few times. Do the minibatch paths ever match the full-batch path? Which ends nearer the lowest point after 4 epochs?' },
      { example: 'batch-size', prompt: 'Drag the batch size from 1 to 32. How much narrower does the cloud get each time the batch quadruples?' },
      { example: 'schedules', prompt: 'Compare the loss chart for constant and cosine in the last few epochs. Which one bounces?' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { CLASS_TONES, DATA_BOX, dataset, regionHeatmap, type Point2 } from '@/ml/datasets';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export const STEPS = 40;
const MAX_LR = 5;

export type LogisticData = 'linear' | 'overlap' | 'xor' | 'circles';
const DATA: readonly LogisticData[] = ['linear', 'overlap', 'xor', 'circles'];
export type LogisticInput = { data: LogisticData; n: number; seed: number; lr: number };
/** Weights for x and y, and the bias. */
export type Params = { w1: number; w2: number; b: number };

const pseudocode = [
  'p = σ(w₁x + w₂y + b)    chance of class 1',
  'loss = mean of −ln(p of the true class)',
  'g ← mean((p − label) · (x, y, 1))',
  '(w₁, w₂, b) ← (w₁, w₂, b) − η · g',
  'boundary: w₁x + w₂y + b = 0, p = ½',
];

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const prob = ({ w1, w2, b }: Params, x: number, y: number) => sigmoid(w1 * x + w2 * y + b);

/** Mean cross-entropy in nats, clipped so a certain wrong answer costs a lot but stays finite. */
export function crossEntropy(params: Params, pts: readonly Point2[]): number {
  return (
    pts.reduce((s, p) => {
      const q = Math.min(1 - 1e-12, Math.max(1e-12, prob(params, p.x, p.y)));
      return s - (p.label === 1 ? Math.log(q) : Math.log(1 - q));
    }, 0) / pts.length
  );
}

/** The gradient of the mean cross-entropy: mean((p − label)·(x, y, 1)). */
export function gradient(params: Params, pts: readonly Point2[]): Params {
  const g = { w1: 0, w2: 0, b: 0 };
  for (const p of pts) {
    const e = prob(params, p.x, p.y) - p.label;
    g.w1 += e * p.x;
    g.w2 += e * p.y;
    g.b += e;
  }
  return { w1: g.w1 / pts.length, w2: g.w2 / pts.length, b: g.b / pts.length };
}

export const correct = (params: Params, p: Point2) => (prob(params, p.x, p.y) > 0.5 ? 1 : 0) === p.label;
export const accuracy = (params: Params, pts: readonly Point2[]) => pts.filter((p) => correct(params, p)).length / pts.length;

export function train({ data, n, seed, lr }: LogisticInput): { points: Point2[]; params: Params[] } {
  const points = dataset(data, n, seed);
  const params: Params[] = [{ w1: 0, w2: 0, b: 0 }];
  for (let k = 0; k < STEPS; k++) {
    const p = params[k];
    const g = gradient(p, points);
    params.push({ w1: p.w1 - lr * g.w1, w2: p.w2 - lr * g.w2, b: p.b - lr * g.b });
  }
  return { points, params };
}

/** The point nearest the boundary (the one most worth asking about), by |w·x + b| / |w|. */
function closest(params: Params, pts: readonly Point2[]): number {
  const z = (p: Point2) => Math.abs(params.w1 * p.x + params.w2 * p.y + params.b);
  return pts.reduce((best, p, i) => (z(p) < z(pts[best]) ? i : best), 0);
}

function* run(input: LogisticInput): Generator<Frame<PlotState>> {
  const { data, lr } = input;
  const { points, params } = train(input);
  const losses = params.map((p) => crossEntropy(p, points));
  const top = Math.max(0.8, losses[0] * 1.15);

  const parts = (k: number, focus: number | null): PlotPart[] => {
    const p = params[k];
    const norm = Math.hypot(p.w1, p.w2);
    const shapes: Shape[] = [regionHeatmap((x, y) => prob(p, x, y), { kind: 'blend', low: CLASS_TONES[0], high: CLASS_TONES[1] }, { cols: 24, rows: 24 })];
    if (norm > 1e-9) {
      // The boundary w·x + b = 0: through the point nearest the origin, along w turned a quarter.
      shapes.push({ kind: 'line', id: 'boundary', through: [(-p.b * p.w1) / norm ** 2, (-p.b * p.w2) / norm ** 2], dir: [-p.w2, p.w1], mark: 'key', label: 'p = ½' });
    }
    points.forEach((pt, i) =>
      shapes.push(
        i === focus
          ? { kind: 'point', id: `p${i}`, at: [pt.x, pt.y], mark: 'key', size: 'lg', label: pt.label ? '+ ?' : '− ?' }
          : // Class 1 dots are larger as well as differently coloured, so colour is never the only cue.
            { kind: 'point', id: `p${i}`, at: [pt.x, pt.y], tone: CLASS_TONES[pt.label], size: pt.label ? 'md' : 'sm' },
      ),
    );
    const plane: PlanePart = { kind: 'plane', id: 'plane', label: 'Points, regions and the boundary', x: DATA_BOX.x, y: DATA_BOX.y, equal: true, shapes, handles: [] };
    const loss: PlanePart = {
      kind: 'plane',
      id: 'loss',
      label: 'Cross-entropy after each step',
      x: { min: 0, max: STEPS, label: 'step' },
      y: { min: 0, max: top, label: 'loss' },
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
        label: 'The model',
        items: [
          { id: 'w1', label: 'w₁', value: fmt(p.w1, 3) },
          { id: 'w2', label: 'w₂', value: fmt(p.w2, 3) },
          { id: 'b', label: 'b', value: fmt(p.b, 3) },
          { id: 'loss', label: 'loss', value: fmt(losses[k], 4), mark: 'key' },
          { id: 'acc', label: 'accuracy', value: `${Math.round(accuracy(p, points) * 100)}%` },
        ],
      },
    ];
  };
  const vars = (k: number) => ({ w1: round(params[k].w1, 4), w2: round(params[k].w2, 4), b: round(params[k].b, 4), loss: round(losses[k], 4) });

  const ask = (k: number): { focus: number | null; checkpoint?: ReturnType<typeof askInOrder> } => {
    if (k >= STEPS) return { focus: null };
    if (k % 2 === 0) {
      const i = closest(params[k], points);
      const verdict = correct(params[k + 1], points[i]) ? 'Yes' : 'No';
      return { focus: i, checkpoint: askInOrder(`Will the highlighted point be classified correctly after step ${k + 1}?`, ['Yes', 'No'], verdict) };
    }
    return { focus: null, checkpoint: askInOrder(`Will the loss fall on step ${k + 1}?`, ['Yes', 'No'], losses[k + 1] < losses[k] ? 'Yes' : 'No') };
  };

  const first = ask(0);
  yield plotFrame(parts(0, first.focus), {
    line: 0,
    note: `Two classes of points: class 1 larger, class 0 smaller. Logistic regression gives every spot a probability of class 1, p = σ(w₁x + w₂y + b). It starts knowing nothing: w = b = 0, so p = ½ everywhere and the loss is ln 2 ≈ ${fmt(losses[0], 3)}. Each step moves the weights against the gradient, by η = ${fmt(lr, 3)} times it.`,
    vars: vars(0),
    stats: { steps: 0 },
    checkpoint: first.checkpoint,
  });

  for (let k = 1; k <= STEPS; k++) {
    const g = gradient(params[k - 1], points);
    const q = ask(k);
    const acc = Math.round(accuracy(params[k], points) * 100);
    yield plotFrame(parts(k, q.focus), {
      line: k === 1 ? 2 : 3,
      note:
        k === 1
          ? `Each point pushes the weights by its error p − label: misclassified points push hardest. The gradient is (${fmt(g.w1, 3)}, ${fmt(g.w2, 3)}, ${fmt(g.b, 3)}); one step against it tilts the regions and the boundary appears.`
          : `Step ${k}: loss ${fmt(losses[k - 1], 4)} → ${fmt(losses[k], 4)}, ${acc}% of points on the right side.`,
      vars: { ...vars(k), 'g.w1': round(g.w1, 4), 'g.w2': round(g.w2, 4), 'g.b': round(g.b, 4) },
      stats: { steps: k },
      checkpoint: q.checkpoint,
    });
  }

  const acc = accuracy(params[STEPS], points);
  const curved = data === 'xor' || data === 'circles';
  yield plotFrame(parts(STEPS, null), {
    line: 4,
    note: curved
      ? `After ${STEPS} steps only ${Math.round(acc * 100)}% are right, and more steps won’t help much: the boundary of logistic regression is always a straight line, and no straight line separates these classes. That is what hidden layers are for.`
      : `After ${STEPS} steps ${Math.round(acc * 100)}% of points are on the right side of the line w₁x + w₂y + b = 0, where p = ½. ${
          data === 'overlap' ? 'Some overlap can’t be separated by any line; the model hedges with p near ½ there.' : 'Further from the line, the model is more confident.'
        }`,
    vars: vars(STEPS),
    stats: { steps: STEPS },
  });
}

const LABELS: Record<LogisticData, string> = { linear: 'Separable', overlap: 'Overlapping', xor: 'XOR', circles: 'Circles' };
const example = (data: LogisticData) => ({ id: data, label: LABELS[data], make: ({ seed, size }: { seed: number; size: number }): LogisticInput => ({ data, n: size, seed, lr: 1 }) });

export const logisticRegression = defineAlgorithm<LogisticInput, PlotState>({
  kind: 'algorithm',
  slug: 'logistic-regression',
  view: 'plot',
  input: {
    examples: [example('linear'), example('overlap'), example('xor'), example('circles')],
    size: { label: 'Points', min: 10, max: 60, default: 30 },
    custom: {
      label: 'Dataset (linear, overlap, xor, circles), points, seed and step size',
      placeholder: 'e.g. overlap, n = 40, seed = 3, lr = 1',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as LogisticData;
        if (!DATA.includes(word)) return { error: 'Start with a dataset: linear, overlap, xor or circles.' };
        const xs = numbersIn(text);
        if (xs.length !== 3) return { error: 'Then give the number of points, a seed and the step size, e.g. n = 40, seed = 3, lr = 1.' };
        const [n, seed, lr] = xs;
        if (!Number.isInteger(n) || n < 10 || n > 60) return { error: 'Use 10 to 60 points.' };
        if (!Number.isInteger(seed) || seed < 0) return { error: 'The seed must be a whole number, 0 or more.' };
        if (!(lr > 0 && lr <= MAX_LR)) return { error: `The step size must be above 0 and at most ${MAX_LR}.` };
        return { value: { data: word, n, seed, lr: round(lr, 4) } };
      },
      format: ({ data, n, seed, lr }) => `${data}, n = ${n}, seed = ${seed}, lr = ${plain(lr, 4)}`,
    },
  },
  pseudocode,
  stats: [{ key: 'steps', label: 'Steps' }],
  legend: [
    { neutral: 'Regions: the colour shows p(class 1)' },
    { tone: 1, label: 'Class 0 (smaller dots)' },
    { tone: 2, label: 'Class 1 (larger dots)' },
    { mark: 'key', label: 'Boundary p = ½, and the point asked about' },
  ],
  run,
  content: {
    idea: 'Draw a line through the plane and call one side class 1. Logistic regression softens that into a probability: p = σ(w·x + b) rises smoothly from 0 to 1 across the line. Gradient descent on the cross-entropy turns and slides the line until it separates the classes as well as a line can.',
    invariant: 'The decision boundary, where p = ½, is always the straight line w₁x + w₂y + b = 0, and p only depends on the distance from it. The gradient is mean((p − label)·x): each point pushes in proportion to how wrong it is.',
    whenToUse: 'Yes/no predictions where you want a probability, not just a label: spam, churn, clicks, medical risk. It is also a single neuron with a sigmoid, so it is the building block of neural networks, which stack many to bend the boundary.',
    traits: [
      { label: 'Gives probabilities', good: true },
      { label: 'Convex: one best fit', good: true },
      { label: 'Boundary is always straight', good: false },
    ],
    experiments: [
      { example: 'linear', prompt: 'Separable classes: watch the line swing into place and the regions sharpen as the weights grow.' },
      { example: 'overlap', prompt: 'Where the classes overlap, the best the line can do is hedge: p stays near ½ in the middle.' },
      { example: 'xor', prompt: 'No single line splits XOR. The loss barely moves from ln 2: this is the classic failure that hidden layers fix.' },
      { example: 'circles', prompt: 'One class surrounds the other, so any straight boundary cuts both. Accuracy stays near a coin flip.' },
    ],
  },
});

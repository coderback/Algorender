import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { dataset, DATA_BOX, regionHeatmap, type DatasetId } from '@/ml/datasets';
import { accuracy, forward, initMlp, predict, train, type Mlp, type Sample } from '@/ml/mlp';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import { layered } from '@/viz/plot/network';
import type { NetEdge, NetNode, NetworkPart, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type PlaygroundData = Exclude<DatasetId, 'blobs' | 'overlap'>;
export type PlaygroundInput = { data: PlaygroundData; hidden: number[]; lr: number; seed: number };

export const EPOCHS = 300;
export const POINTS = 80;
export const MOMENTUM = 0.9;
export const MAX_UNITS = 8;
const MAX_LAYERS = 2;
const MAX_LR = 20;
/** Training snapshots shown as frames: dense at first, when the boundary moves fastest. */
export const CHECKPOINTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 90, 110, 130, 160, 200, 250, 300];
const DATA_IDS: readonly PlaygroundData[] = ['linear', 'xor', 'circles', 'moons'];
const DATA_NAMES: Record<PlaygroundData, string> = { linear: 'two clusters', xor: 'XOR', circles: 'circles', moons: 'moons' };
/** The sample whose activations the network diagram shows. */
const HIGHLIGHT = 0;

const pseudocode = [
  'h = tanh(W·x + b)     each hidden layer',
  'p = σ(w·h + b)        chance of class 1',
  'loss = −mean(y·log p + (1−y)·log(1−p))',
  'grads ← backprop(loss)',
  'v ← 0.9·v − η·grads;  W ← W + v',
];

export type PlaygroundRun = { data: Sample[]; losses: number[]; snapshots: Map<number, Mlp> };

/** Trains once, keeping a snapshot at every checkpoint. */
export function playgroundRun({ data: id, hidden, lr, seed }: PlaygroundInput): PlaygroundRun {
  const data = dataset(id, POINTS, seed);
  const { losses, snapshots } = train(initMlp(hidden, seed), data, { lr, epochs: EPOCHS, momentum: MOMENTUM, keep: (e) => CHECKPOINTS.includes(e) });
  return { data, losses, snapshots };
}

const nodeId = (layer: number, unit: number, layers: number) => (layer === 0 ? `in${unit}` : layer === layers - 1 ? 'out' : `h${layer}_${unit}`);

/** The network diagram: neurons hold their values for the highlighted sample, edges carry the weights. */
export function networkPart(m: Mlp, sample: Sample): NetworkPart {
  const acts = forward(m, [sample.x, sample.y]);
  const layers = m.sizes.length;
  const columns = m.sizes.map((size, l) => Array.from({ length: size }, (_, u) => nodeId(l, u, layers)));
  const at = layered(columns, { dx: 110, dy: 46 });
  const nodes: NetNode[] = [];
  m.sizes.forEach((size, l) => {
    for (let u = 0; u < size; u++) {
      const id = nodeId(l, u, layers);
      const out = l === layers - 1;
      const value = out ? 1 / (1 + Math.exp(-acts[l][u])) : acts[l][u];
      nodes.push({
        id,
        ...at.get(id)!,
        kind: 'neuron',
        label: l === 0 ? (u === 0 ? 'x₁' : 'x₂') : out ? 'p' : '',
        value: fmt(value, 2),
        mark: id === 'out' ? 'key' : null,
      });
    }
  });
  const edges: NetEdge[] = [];
  m.W.forEach((layer, l) =>
    layer.forEach((row, j) => row.forEach((w, i) => edges.push({ id: `w${l}_${j}_${i}`, from: nodeId(l, i, layers), to: nodeId(l + 1, j, layers), weight: w }))),
  );
  return { kind: 'network', id: 'network', label: `The network, showing each neuron’s value for the highlighted point`, nodes, edges };
}

/** A small diamond around a point: class 0 is drawn as diamonds, class 1 as dots, so the shape tells them apart too. */
const diamond = ([x, y]: Vec, r = 0.09): Vec[] => [
  [x, y + r],
  [x + r, y],
  [x, y - r],
  [x - r, y],
];

export const HEAT = { cols: 30, rows: 30 } as const;

function dataPlane(m: Mlp, data: readonly Sample[]): PlanePart {
  const shapes: Shape[] = [regionHeatmap((x, y) => predict(m, x, y), { kind: 'blend', low: 1, high: 2 }, HEAT)];
  data.forEach((s, k) =>
    shapes.push(
      s.label
        ? { kind: 'point', id: `d${k}`, at: [s.x, s.y], tone: 2, size: 'sm' }
        : { kind: 'path', id: `d${k}`, points: diamond([s.x, s.y]), closed: true, fill: true, fillOpacity: 1, tone: 1 },
    ),
  );
  const h = data[HIGHLIGHT];
  shapes.push({ kind: 'point', id: 'highlight', at: [h.x, h.y], mark: 'key', size: 'lg', label: 'x' });
  return { kind: 'plane', id: 'plane', label: 'The data over the network’s prediction', x: DATA_BOX.x, y: DATA_BOX.y, equal: true, shapes, handles: [] };
}

function lossPlane(losses: readonly number[], epoch: number, top: number): PlanePart {
  return {
    kind: 'plane',
    id: 'loss',
    label: 'Loss per epoch',
    x: { min: 0, max: EPOCHS, label: 'epoch' },
    y: { min: 0, max: top, label: 'loss' },
    equal: false,
    shapes: [{ kind: 'path', id: 'loss', points: losses.slice(0, epoch + 1).map((l, e): Vec => [e, Math.min(l, top * 4)]), mark: 'key' }],
    handles: [],
  };
}

const pct = (a: number) => `${Math.round(a * 100)}%`;

function* run(input: PlaygroundInput): Generator<Frame<PlotState>> {
  const { data, losses, snapshots } = playgroundRun(input);
  const { hidden, lr } = input;
  const name = DATA_NAMES[input.data];
  const top = Math.max(0.8, ...losses.slice(0, 5).map((l) => l * 1.1));
  const acc = (e: number) => accuracy(snapshots.get(e)!, data);
  const shape = hidden.length ? `${hidden.length === 1 ? 'one hidden layer' : 'two hidden layers'} of ${hidden.join(' and ')} tanh unit${hidden.at(-1) === 1 && hidden.length === 1 ? '' : 's'}` : 'no hidden layer';
  const parts = (e: number): PlotPart[] => {
    const m = snapshots.get(e)!;
    return [
      dataPlane(m, data),
      lossPlane(losses, e, top),
      networkPart(m, data[HIGHLIGHT]),
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Training',
        items: [
          { id: 'epoch', label: 'epoch', value: String(e) },
          { id: 'loss', label: 'loss', value: fmt(losses[e], 3), mark: 'key' },
          { id: 'accuracy', label: 'accuracy', value: pct(acc(e)) },
        ],
      },
    ];
  };
  const finalAcc = acc(EPOCHS);
  const separable = finalAcc >= 0.95;
  const oscillates = losses.slice(1).filter((l, i) => l > losses[i] + 1e-9).length > EPOCHS / 4;

  yield plotFrame(parts(0), {
    line: 0,
    note: `A network with ${shape} starts from random weights, so its prediction (the shading: orange for class 1, blue for class 0) is wherever chance put it. It classifies ${pct(acc(0))} of the ${name} correctly.`,
    vars: { epoch: 0, loss: round(losses[0], 4), η: lr },
    stats: { epochs: 0 },
    checkpoint: hidden.length
      ? askInOrder('Will accuracy be higher at the next checkpoint?', ['Yes', 'No'], acc(CHECKPOINTS[1]) > acc(0) ? 'Yes' : 'No')
      : askInOrder(`With no hidden layer the boundary is a straight line. Can it separate the ${name}?`, ['Yes', 'No'], separable ? 'Yes' : 'No'),
  });

  let reached = acc(0) === 1;
  for (let k = 1; k < CHECKPOINTS.length; k++) {
    const e = CHECKPOINTS[k];
    const prev = CHECKPOINTS[k - 1];
    const a = acc(e);
    const rose = losses[e] > losses[prev] + 1e-9;
    let note: string;
    if (!reached && a === 1) {
      reached = true;
      note = `Epoch ${e}: every point is now on the right side of the boundary. The loss keeps falling as the network grows more confident.`;
    } else if (rose) {
      note = `Epoch ${e}: the loss went up, from ${fmt(losses[prev], 3)} to ${fmt(losses[e], 3)}. ${
        oscillates ? `With η = ${fmt(lr, 3)} each step overshoots the valley it is aiming for, so training bounces instead of settling.` : 'Momentum carried the weights past a low point; they swing back.'
      }`;
    } else if (!hidden.length) {
      note = `Epoch ${e}: loss ${fmt(losses[e], 3)}, accuracy ${pct(a)}. With no hidden layer the output is σ(w·x + b), so the boundary w·x + b = 0 is always a straight line${separable ? '' : ', and no straight line splits these classes'}.`;
    } else if (e <= 10) {
      note = `Epoch ${e}: loss ${fmt(losses[e], 3)}, accuracy ${pct(a)}. Each hidden unit computes tanh of a straight line through the plane; backprop is turning them all at once.`;
    } else {
      note = `Epoch ${e}: loss ${fmt(losses[e], 3)}, accuracy ${pct(a)}. The output mixes the hidden units’ soft straight edges, so the boundary can bend${hidden.length > 1 ? ', and a second layer mixes those mixtures' : ''}.`;
    }
    const next = CHECKPOINTS[k + 1];
    yield plotFrame(parts(e), {
      line: rose ? 4 : e <= 2 ? 3 : 1,
      note,
      vars: { epoch: e, loss: round(losses[e], 4), accuracy: round(a, 3), η: lr },
      stats: { epochs: e },
      checkpoint: next !== undefined ? askInOrder('Will accuracy be higher at the next checkpoint?', ['Yes', 'No'], acc(next) > a ? 'Yes' : 'No') : undefined,
    });
  }

  yield plotFrame(parts(EPOCHS), {
    line: null,
    note: !hidden.length
      ? separable
        ? `After ${EPOCHS} epochs: ${pct(finalAcc)}. These classes happen to be separable by a straight line, which is all a network without a hidden layer can draw.`
        : `After ${EPOCHS} epochs it is stuck at ${pct(finalAcc)}: a straight line can’t separate the ${name}, however long it trains. Add a hidden layer with the slider.`
      : oscillates
        ? `After ${EPOCHS} epochs: ${pct(finalAcc)}, with the loss still bouncing. Too big a step size keeps it from settling; try a smaller η.`
        : `After ${EPOCHS} epochs: loss ${fmt(losses[EPOCHS], 3)}, accuracy ${pct(finalAcc)}. ${shape[0].toUpperCase()}${shape.slice(1)} bent the boundary around the ${name}${
            finalAcc < 0.95 ? ', but not far enough: try more hidden units' : ''
          }.`,
    vars: { epoch: EPOCHS, loss: round(losses[EPOCHS], 4), accuracy: round(finalAcc, 3), η: lr },
    stats: { epochs: EPOCHS },
  });
}

const sized = (id: PlaygroundData, label: string) => ({
  id,
  label,
  make: ({ seed, size }: { seed: number; size: number }): PlaygroundInput => ({ data: id, hidden: size > 0 ? [size] : [], lr: 0.1, seed }),
});
const fixed = (id: string, label: string, input: PlaygroundInput) => ({ id, label, make: () => input, sized: false });

export const mlpPlayground = defineAlgorithm<PlaygroundInput, PlotState>({
  kind: 'algorithm',
  slug: 'mlp',
  view: 'plot',
  input: {
    examples: [
      sized('xor', 'XOR'),
      sized('circles', 'Circles'),
      sized('moons', 'Moons'),
      sized('linear', 'Two clusters'),
      fixed('no-hidden', 'XOR, no hidden layer', { data: 'xor', hidden: [], lr: 0.1, seed: 7 }),
      fixed('deep', 'Circles, two layers', { data: 'circles', hidden: [6, 6], lr: 0.1, seed: 7 }),
      fixed('too-fast', 'Step too big', { data: 'circles', hidden: [6], lr: 10, seed: 7 }),
    ],
    size: { label: 'Hidden units', min: 0, max: MAX_UNITS, default: 4 },
    custom: {
      label: 'Data (linear, xor, circles, moons), hidden layer sizes, step size and seed',
      placeholder: 'e.g. circles, hidden = 6 6, lr = 0.1, seed = 2',
      parse: (text) => {
        const lower = text.toLowerCase();
        const data = DATA_IDS.find((d) => new RegExp(`\\b${d}\\b`).test(lower));
        if (!data) return { error: 'Name the data: linear, xor, circles or moons.' };
        const hiddenText = lower.match(/hidden\s*=?\s*([^,;]*)/)?.[1] ?? '';
        const hidden = /none/.test(hiddenText) ? [] : numbersIn(hiddenText);
        if (hidden.length > MAX_LAYERS || hidden.some((h) => !Number.isInteger(h) || h < 1 || h > MAX_UNITS)) {
          return { error: `Give up to ${MAX_LAYERS} hidden layers of 1 to ${MAX_UNITS} units, e.g. hidden = 6 6 (or hidden = none).` };
        }
        const lr = Number(lower.match(/lr\s*=?\s*(\d*\.?\d+)/)?.[1] ?? 0.1);
        if (!(lr > 0 && lr <= MAX_LR)) return { error: `The step size must be above 0 and at most ${MAX_LR}.` };
        const seedText = lower.match(/seed\s*=?\s*(\d+)/)?.[1];
        const seed = seedText === undefined ? 7 : Number(seedText);
        if (!Number.isSafeInteger(seed)) return { error: 'The seed must be a whole number.' };
        return { value: { data, hidden, lr: round(lr, 4), seed } };
      },
      format: ({ data, hidden, lr, seed }) => `${data}, hidden = ${hidden.length ? hidden.join(' ') : 'none'}, lr = ${plain(lr, 4)}, seed = ${seed}`,
    },
  },
  pseudocode,
  stats: [{ key: 'epochs', label: 'Epochs' }],
  legend: [
    { neutral: 'Neurons and their values' },
    { tone: 1, label: 'Class 0 (diamonds); positive weights' },
    { tone: 2, label: 'Class 1 (dots); negative weights' },
    { mark: 'key', label: 'The highlighted point and the output' },
  ],
  run,
  content: {
    idea: 'A neural network stacks layers of simple units: each hidden unit draws a soft straight edge through the input space (tanh of a weighted sum), and the next layer mixes those edges into curved boundaries. Training nudges every weight downhill on the loss, with gradients from backpropagation.',
    invariant: 'Without a hidden layer the decision boundary is always a straight line, whatever the training. Every epoch moves each weight against its gradient (plus momentum), so the loss falls whenever the step size is small enough.',
    whenToUse: 'Learning a boundary or function too curved for a straight line, from examples rather than rules: this playground is the smallest version of what image classifiers and language models do with millions of units and many more layers.',
    traits: [
      { label: 'Hidden layers bend the boundary', good: true },
      { label: 'Trained by backprop + gradient descent', good: null },
      { label: 'Too big a step oscillates', good: false },
    ],
    experiments: [
      { example: 'no-hidden', prompt: 'With no hidden layer the boundary stays straight, and XOR can’t be split by one line: accuracy stalls near 60%.' },
      { example: 'xor', prompt: 'Move the slider from 0 to 1, 2 and 4 hidden units and see how many soft edges XOR needs.' },
      { example: 'too-fast', prompt: 'With η = 10 the loss chart zigzags: every step overshoots. Compare it with the smooth fall at η = 0.1.' },
      { example: 'deep', prompt: 'Two layers of 6 bend the boundary into a ring around the inner circle within a few dozen epochs.' },
    ],
  },
});

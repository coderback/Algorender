import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { CLASS_TONES, DATA_BOX, dataset, type DatasetId, type Point2 } from '@/ml/datasets';
import { askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { NetEdge, NetNode, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export const MAX_DEPTH = 5;
export const MAX_POINTS = 50;
const DATASETS: readonly DatasetId[] = ['linear', 'overlap', 'blobs', 'xor', 'circles', 'moons'];
const CLASS_NAMES = ['A', 'B', 'C', 'D'];

export type TreeInput = { data: DatasetId; n: number; seed: number; maxDepth: number };

const pseudocode = [
  'queue ← [the whole plane]',
  'take the next region from the queue:',
  '  if pure or at max depth: make a leaf',
  '  try each axis and threshold t',
  '  score = weighted Gini of the halves',
  '  split at the lowest score',
  '  queue both halves',
  'predict: walk down, take the majority',
];

type Box = { x0: number; x1: number; y0: number; y1: number };
export type Split = { axis: 'x' | 'y'; t: number; score: number };
export type TreeNode = {
  id: string;
  depth: number;
  /** Indices into the data. */
  points: number[];
  box: Box;
  counts: number[];
  gini: number;
  majority: number;
  /** The rule from the parent, e.g. "x < 0.4"; empty for the root. */
  rule: string;
  conditions: string[];
  split?: Split & { left: TreeNode; right: TreeNode; runnerUp: Split | null };
};

export function gini(counts: readonly number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  return n === 0 ? 0 : 1 - counts.reduce((s, c) => s + (c / n) ** 2, 0);
}

const countsOf = (data: readonly Point2[], idx: readonly number[], k: number) => {
  const c = Array<number>(k).fill(0);
  for (const i of idx) c[data[i].label]++;
  return c;
};

/** Majority class; ties go to the lower label so the tree is deterministic. */
const majorityOf = (counts: readonly number[]) => counts.reduce((best, c, i) => (c > counts[best] ? i : best), 0);

/** Every candidate threshold on one axis: midpoints between consecutive distinct values. */
export function thresholds(data: readonly Point2[], idx: readonly number[], axis: 'x' | 'y'): number[] {
  const vs = [...new Set(idx.map((i) => data[i][axis]))].sort((a, b) => a - b);
  return vs.slice(1).map((v, i) => (vs[i] + v) / 2);
}

/** Weighted Gini of splitting `idx` at axis < t. */
export function splitScore(data: readonly Point2[], idx: readonly number[], axis: 'x' | 'y', t: number, k: number): number {
  const left = idx.filter((i) => data[i][axis] < t);
  const right = idx.filter((i) => data[i][axis] >= t);
  return (left.length * gini(countsOf(data, left, k)) + right.length * gini(countsOf(data, right, k))) / idx.length;
}

/** The best split on one axis (lowest score; ties keep the smaller threshold), or null if there is none. */
function bestOn(data: readonly Point2[], idx: readonly number[], axis: 'x' | 'y', k: number): Split | null {
  let best: Split | null = null;
  for (const t of thresholds(data, idx, axis)) {
    const score = splitScore(data, idx, axis, t, k);
    if (!best || score < best.score - 1e-12) best = { axis, t, score };
  }
  return best;
}

const classCount = (data: readonly Point2[]) => Math.max(2, ...data.map((p) => p.label + 1));

/** Grows the whole tree breadth-first (the same tree whatever the frames show). */
export function grow(data: readonly Point2[], maxDepth: number): { root: TreeNode; order: TreeNode[] } {
  const k = classCount(data);
  const make = (id: string, depth: number, points: number[], box: Box, rule: string, conditions: string[]): TreeNode => {
    const counts = countsOf(data, points, k);
    return { id, depth, points, box, counts, gini: gini(counts), majority: majorityOf(counts), rule, conditions };
  };
  const root = make('t', 0, data.map((_, i) => i), { x0: DATA_BOX.x.min, x1: DATA_BOX.x.max, y0: DATA_BOX.y.min, y1: DATA_BOX.y.max }, '', []);
  const order: TreeNode[] = [];
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    order.push(node);
    if (node.depth >= maxDepth || node.gini < 1e-12 || node.points.length < 2) continue;
    const bx = bestOn(data, node.points, 'x', k);
    const by = bestOn(data, node.points, 'y', k);
    const best = bx && (!by || bx.score <= by.score + 1e-12) ? bx : by;
    if (!best || best.score >= node.gini - 1e-12) continue;
    const runnerUp = best === bx ? by : bx;
    const { axis, t } = best;
    const lt = `${axis} < ${fmt(t)}`;
    const ge = `${axis} ≥ ${fmt(t)}`;
    const leftBox = axis === 'x' ? { ...node.box, x1: t } : { ...node.box, y1: t };
    const rightBox = axis === 'x' ? { ...node.box, x0: t } : { ...node.box, y0: t };
    const left = make(`${node.id}L`, node.depth + 1, node.points.filter((i) => data[i][axis] < t), leftBox, lt, [...node.conditions, lt]);
    const right = make(`${node.id}R`, node.depth + 1, node.points.filter((i) => data[i][axis] >= t), rightBox, ge, [...node.conditions, ge]);
    node.split = { ...best, left, right, runnerUp };
    queue.push(left, right);
  }
  return { root, order };
}

/** Class predicted for a point by walking down the tree. */
export function predict(root: TreeNode, p: { x: number; y: number }): number {
  let node = root;
  while (node.split) node = p[node.split.axis] < node.split.t ? node.split.left : node.split.right;
  return node.majority;
}

export function leaves(root: TreeNode): TreeNode[] {
  return root.split ? [...leaves(root.split.left), ...leaves(root.split.right)] : [root];
}

export const pointsOf = (input: TreeInput) => dataset(input.data, input.n, input.seed);

/** Positions for the final tree: leaves left to right in order, parents centred over children. */
function layout(root: TreeNode): Map<string, Vec> {
  const at = new Map<string, Vec>();
  let slot = 0;
  const place = (n: TreeNode): number => {
    const x = n.split ? (place(n.split.left) + place(n.split.right)) / 2 : slot++ * 88;
    at.set(n.id, [x, n.depth * 74]);
    return x;
  };
  place(root);
  return at;
}

const region = (n: TreeNode) => (n.conditions.length ? n.conditions.join(', ') : 'the whole plane');
const tally = (counts: readonly number[]) => counts.map((c, i) => (c ? `${CLASS_NAMES[i]}${c}` : '')).filter(Boolean).join(' ') || 'empty';
const rect = ({ x0, x1, y0, y1 }: Box): Vec[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

type Event = { node: TreeNode; kind: 'split' | 'leaf' };

function* run(input: TreeInput): Generator<Frame<PlotState>> {
  const data = pointsOf(input);
  const { root, order } = grow(data, input.maxDepth);
  const positions = layout(root);
  // Frames: every region above max depth, in breadth-first order, either splits or stops early.
  const events: Event[] = order.filter((n) => n.depth < input.maxDepth).map((node) => ({ node, kind: node.split ? 'split' : 'leaf' }));
  const decided = new Set<string>();

  const accuracyOf = (decidedNow: ReadonlySet<string>) => {
    const walk = (p: Point2) => {
      let node = root;
      while (node.split && decidedNow.has(node.id)) node = p[node.split.axis] < node.split.t ? node.split.left : node.split.right;
      return node.majority;
    };
    return data.filter((p) => walk(p) === p.label).length / data.length;
  };

  const scene = (focus: TreeNode | null): PlotPart[] => {
    const existing: TreeNode[] = [];
    const visit = (n: TreeNode) => {
      existing.push(n);
      if (n.split && decided.has(n.id)) {
        visit(n.split.left);
        visit(n.split.right);
      }
    };
    visit(root);
    const regions = existing.filter((n) => !(n.split && decided.has(n.id)));
    const splits = existing.filter((n) => n.split && decided.has(n.id));
    const shapes: Shape[] = [
      ...regions.map((n): Shape => ({ kind: 'path', id: `r-${n.id}`, points: rect(n.box), closed: true, fill: true, fillOpacity: 0.16, tone: CLASS_TONES[n.majority], faint: true })),
      ...splits.map((n): Shape => {
        const s = n.split!;
        const pts: Vec[] = s.axis === 'x' ? [[s.t, n.box.y0], [s.t, n.box.y1]] : [[n.box.x0, s.t], [n.box.x1, s.t]];
        return { kind: 'path', id: `s-${n.id}`, points: pts, mark: focus?.id === n.id ? 'key' : null };
      }),
      ...(focus ? [{ kind: 'path' as const, id: 'focus', points: rect(focus.box), closed: true, dashed: true, mark: 'key' as const }] : []),
      ...data.map((p, i): Shape => ({ kind: 'point', id: `p${i}`, at: [p.x, p.y], tone: CLASS_TONES[p.label], size: 'sm' })),
    ];
    const plane: PlanePart = { kind: 'plane', id: 'plane', label: 'The data, split into regions', x: DATA_BOX.x, y: DATA_BOX.y, equal: true, shapes, handles: [] };
    const nodes: NetNode[] = existing.map((n) => {
      const [x, y] = positions.get(n.id)!;
      const internal = n.split && decided.has(n.id);
      return internal
        ? { id: n.id, x, y, kind: 'value', label: `${n.split!.axis} < ${fmt(n.split!.t)}?`, value: `gini ${fmt(n.gini, 2)}`, grad: `${n.points.length} points`, mark: focus?.id === n.id ? 'key' : null }
        : { id: n.id, x, y, kind: 'value', label: `→ ${CLASS_NAMES[n.majority]}`, value: tally(n.counts), grad: `gini ${fmt(n.gini, 2)}`, tone: CLASS_TONES[n.majority], mark: focus?.id === n.id ? 'key' : null };
    });
    const edges: NetEdge[] = splits.flatMap((n) => [
      { id: `${n.id}-L`, from: n.id, to: n.split!.left.id, label: 'yes' },
      { id: `${n.id}-R`, from: n.id, to: n.split!.right.id, label: 'no' },
    ]);
    return [
      plane,
      { kind: 'network', id: 'tree', label: 'The tree so far', nodes, edges },
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Tree',
        items: [
          { id: 'leaves', label: 'leaves', value: String(regions.length) },
          { id: 'accuracy', label: 'training accuracy', value: `${round(accuracyOf(decided) * 100, 1)}%`, mark: 'found' },
        ],
      },
    ];
  };

  const ask = (k: number) => {
    const e = events[k];
    if (!e) return undefined;
    if (e.kind === 'split' && k % 2 === 0) return askInOrder(`Region ${region(e.node)}: split it on x or on y?`, ['x', 'y'], e.node.split!.axis);
    return askInOrder(`Will region ${region(e.node)} be split?`, ['Yes', 'No'], e.kind === 'split' ? 'Yes' : 'No');
  };

  yield plotFrame(scene(null), {
    line: 0,
    note: `A decision tree asks yes/no questions like “is x < 0.4?” and predicts the majority class of the region each point lands in. Grow one on ${data.length} points, choosing each question to make the regions as pure as possible (lowest Gini impurity), up to depth ${input.maxDepth}.`,
    vars: { depth: 0, gini: round(root.gini, 3) },
    stats: { splits: 0 },
    checkpoint: ask(0),
  });

  let splitsSoFar = 0;
  for (let k = 0; k < events.length; k++) {
    const { node, kind } = events[k];
    let note: string;
    let line: number;
    if (kind === 'split') {
      const s = node.split!;
      decided.add(node.id);
      splitsSoFar++;
      line = 5;
      const other = s.runnerUp
        ? `the best split on ${s.runnerUp.axis} would only reach ${fmt(s.runnerUp.score, 3)}`
        : `no split on ${s.axis === 'x' ? 'y' : 'x'} is possible`;
      note = `Region ${region(node)} (${node.points.length} points, Gini ${fmt(node.gini, 3)}): the best question is ${s.axis} < ${fmt(s.t)}, leaving halves with weighted Gini ${fmt(s.score, 3)}, a drop of ${fmt(node.gini - s.score, 3)}; ${other}.`;
    } else {
      line = 2;
      note =
        node.gini < 1e-12
          ? `Region ${region(node)} holds only class ${CLASS_NAMES[node.majority]} (${node.points.length} points): it is pure, so it becomes a leaf.`
          : `No question lowers the impurity of region ${region(node)} (${tally(node.counts)}), so it becomes a leaf predicting ${CLASS_NAMES[node.majority]}.`;
    }
    yield plotFrame(scene(node), {
      line,
      note,
      vars: { depth: node.depth, points: node.points.length, gini: round(node.gini, 3), ...(node.split && kind === 'split' ? { t: round(node.split.t, 3), 'gini after': round(node.split.score, 3) } : {}) },
      stats: { splits: splitsSoFar },
      checkpoint: ask(k + 1),
    });
  }

  const all = leaves(root);
  const tiny = all.filter((n) => n.points.length <= 2).length;
  const acc = accuracyOf(decided);
  const atMax = all.some((n) => n.depth === input.maxDepth);
  const overfit = input.maxDepth >= 4 && (input.data === 'circles' || input.data === 'moons' || tiny >= 3);
  yield plotFrame(scene(null), {
    line: 7,
    note: `${atMax ? `Regions at depth ${input.maxDepth} stop there and become leaves. ` : ''}The tree has ${all.length} leaves and classifies ${round(acc * 100, 1)}% of the training points correctly. ${
      overfit
        ? `But look at the boundary: a staircase of boxes${tiny ? `, ${tiny} of them holding just one or two points` : ''}. Axis-aligned cuts fit a curved boundary only by memorising the training points, which is overfitting: a shallower tree would do better on new data.`
        : input.data === 'xor' && input.maxDepth === 1
          ? 'One question can’t separate XOR: it needs a second level of questions.'
          : 'Each leaf predicts its majority class; a new point is classified by walking down the questions.'
    }`,
    vars: { leaves: all.length, accuracy: round(acc, 3) },
    stats: { splits: splitsSoFar },
  });
}

const example = (id: string, label: string, data: DatasetId) => ({
  id,
  label,
  make: ({ seed, size }: { seed: number; size: number }): TreeInput => ({ data, n: 40, seed, maxDepth: Math.min(MAX_DEPTH, Math.max(1, size)) }),
});

export const decisionTree = defineAlgorithm<TreeInput, PlotState>({
  kind: 'algorithm',
  slug: 'decision-tree',
  view: 'plot',
  input: {
    examples: [example('xor', 'XOR', 'xor'), example('linear', 'Two groups', 'linear'), example('circles', 'Circles', 'circles'), example('moons', 'Moons', 'moons'), example('blobs', 'Three classes', 'blobs'), example('overlap', 'Overlapping', 'overlap')],
    size: { label: 'Maximum depth', min: 1, max: MAX_DEPTH, default: 3 },
    custom: {
      label: `Dataset (${DATASETS.join(', ')}), depth, points and seed`,
      placeholder: 'e.g. moons, depth = 4, n = 40, seed = 7',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
        const data = DATASETS.find((d) => d === word);
        if (!data) return { error: `Start with a dataset: ${DATASETS.join(', ')}.` };
        const xs = numbersIn(text.slice(word.length));
        if (xs.length < 1 || xs.length > 3) return { error: 'Then give the depth, and optionally the number of points and a seed.' };
        const [maxDepth, n = 40, seed = 7] = xs;
        if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_DEPTH) return { error: `The depth must be a whole number from 1 to ${MAX_DEPTH}.` };
        if (!Number.isInteger(n) || n < 4 || n > MAX_POINTS) return { error: `Use 4 to ${MAX_POINTS} points.` };
        if (!Number.isInteger(seed) || seed < 0) return { error: 'The seed must be a whole number of 0 or more.' };
        return { value: { data, n, seed, maxDepth } };
      },
      format: ({ data, n, seed, maxDepth }) => `${data}, depth = ${maxDepth}, n = ${n}, seed = ${seed}`,
    },
  },
  pseudocode,
  stats: [{ key: 'splits', label: 'Splits' }],
  legend: [
    { neutral: 'A split line' },
    { tone: 1, label: 'Class A (points and regions)' },
    { tone: 2, label: 'Class B' },
    { tone: 3, label: 'Class C' },
    { mark: 'key', label: 'The region being decided' },
  ],
  run,
  content: {
    idea: 'A decision tree classifies by asking yes/no questions about one feature at a time (“is x < 0.4?”), each answer leading to the next question until a leaf names a class. It is grown greedily: at each region, try every question and keep the one whose two halves are purest.',
    invariant: 'Every split cuts a region into two boxes along one axis and lowers the weighted Gini impurity, 1 − Σ p². The leaves always partition the plane, and each predicts the majority class of the training points inside it.',
    whenToUse: 'Tabular data with mixed features, when you want rules a person can read. Single trees overfit easily, so in practice they are limited in depth or combined: random forests average many trees, and gradient boosting adds trees that fix each other’s mistakes.',
    traits: [
      { label: 'Readable rules', good: true },
      { label: 'No feature scaling needed', good: true },
      { label: 'Deep trees overfit', good: false },
    ],
    experiments: [
      { example: 'xor', prompt: 'XOR is the classic case one straight line can’t solve, but two levels of axis-aligned questions can. Try depth 1, then 2.' },
      { example: 'circles', prompt: 'A round boundary has to be built from boxes. At depth 5 watch the staircase appear, and the tiny leaves that only memorise points.' },
      { example: 'blobs', prompt: 'Three classes work the same way: Gini measures impurity across all of them.' },
      { example: 'overlap', prompt: 'Where the classes overlap, deeper trees chase noise: training accuracy climbs, but the regions get stranger.' },
    ],
  },
});

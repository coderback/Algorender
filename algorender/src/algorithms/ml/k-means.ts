import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { CLASS_TONES, DATA_BOX, dataset, regionHeatmap, type Point2 } from '@/ml/datasets';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Handle, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type KData = 'blobs' | 'elongated' | 'uneven' | 'random';
const DATA: readonly KData[] = ['blobs', 'elongated', 'uneven', 'random'];

/** The points come from `data` (seeded); `starts` are the initial centroids, or chosen from the points when absent. */
export type KMeansInput = { data: KData; n: number; k: number; seed: number; starts?: Vec[] };

export const MIN_N = 12;
export const MAX_N = 60;
export const MIN_K = 2;
export const MAX_K = 4;
export const MAX_ITERS = 15;

const pseudocode = [
  'place k centroids',
  'repeat:',
  '  assign each point to its nearest',
  '  move each centroid to its mean',
  'until no point changes cluster',
];

function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const keep = (v: number) => Math.round(Math.min(2.9, Math.max(-2.9, v)) * 100) / 100;

/** The input's points; `label` is the cluster a point was drawn from (all 0 for noise). */
export function pointsOf({ data, n, seed }: Pick<KMeansInput, 'data' | 'n' | 'seed'>): Point2[] {
  if (data === 'blobs') return dataset('blobs', n, seed, 3);
  const rng = createRng(seed);
  const pts: Point2[] = [];
  for (let i = 0; i < n; i++) {
    if (data === 'elongated') {
      const label = i % 2;
      pts.push({ x: keep(-2.6 + 5.2 * rng()), y: keep((label ? 0.8 : -0.8) + gaussian(rng) * 0.15), label });
    } else if (data === 'uneven') {
      const label = i < Math.round(0.8 * n) ? 0 : 1;
      pts.push(
        label
          ? { x: keep(1.8 + gaussian(rng) * 0.25), y: keep(1.7 + gaussian(rng) * 0.25), label }
          : { x: keep(-0.6 + gaussian(rng) * 0.9), y: keep(-0.5 + gaussian(rng) * 0.9), label },
      );
    } else {
      pts.push({ x: keep(-2.8 + 5.6 * rng()), y: keep(-2.8 + 5.6 * rng()), label: 0 });
    }
  }
  return pts;
}

const tenth = (v: number) => Math.round(v * 10) / 10 + 0;

/** k distinct points of the data (rounded to tenths, so they sit on the handles' grid), picked by the seed. */
export function defaultStarts(pts: readonly Point2[], k: number, seed: number): Vec[] {
  const rng = createRng(seed + 101);
  const starts: Vec[] = [];
  const order = pts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order) {
    const c: Vec = [tenth(pts[i].x), tenth(pts[i].y)];
    if (!starts.some((s) => s[0] === c[0] && s[1] === c[1])) starts.push(c);
    if (starts.length === k) break;
  }
  return starts;
}

export const startsOf = (input: KMeansInput): Vec[] => input.starts ?? defaultStarts(pointsOf(input), input.k, input.seed);

const d2 = (p: { x: number; y: number }, c: Vec) => (p.x - c[0]) ** 2 + (p.y - c[1]) ** 2;

/** The nearest centroid to (x, y); ties go to the lower index. */
export function nearest(cents: readonly Vec[], x: number, y: number): number {
  let best = 0;
  for (let j = 1; j < cents.length; j++) if (d2({ x, y }, cents[j]) < d2({ x, y }, cents[best])) best = j;
  return best;
}

const assign = (pts: readonly Point2[], cents: readonly Vec[]) => pts.map((p) => nearest(cents, p.x, p.y));
export const inertia = (pts: readonly Point2[], labels: readonly number[], cents: readonly Vec[]) => pts.reduce((s, p, i) => s + d2(p, cents[labels[i]]), 0);

export type Step = { kind: 'assign' | 'update'; cents: Vec[]; labels: number[]; inertia: number; changed: number; before?: Vec[] };

/** Lloyd's algorithm from `starts`: an assign step, then update and assign until nothing changes (or MAX_ITERS). */
export function lloyd(pts: readonly Point2[], starts: readonly Vec[]): { steps: Step[]; converged: boolean } {
  let cents = [...starts];
  let labels = assign(pts, cents);
  const steps: Step[] = [{ kind: 'assign', cents, labels, inertia: inertia(pts, labels, cents), changed: pts.length }];
  for (let it = 0; it < MAX_ITERS; it++) {
    const before = cents;
    cents = cents.map((c, j) => {
      const members = pts.filter((_, i) => labels[i] === j);
      // An empty cluster has no mean; it stays where it is.
      return members.length ? ([members.reduce((s, p) => s + p.x, 0) / members.length, members.reduce((s, p) => s + p.y, 0) / members.length] as Vec) : c;
    });
    steps.push({ kind: 'update', cents, labels, inertia: inertia(pts, labels, cents), changed: 0, before });
    const next = assign(pts, cents);
    const changed = next.filter((l, i) => l !== labels[i]).length;
    if (changed === 0) return { steps, converged: true };
    labels = next;
    steps.push({ kind: 'assign', cents, labels, inertia: inertia(pts, labels, cents), changed });
  }
  return { steps, converged: false };
}

/** Share of points whose cluster's majority source matches their own source: 1 means the true groups were found. */
function purity(pts: readonly Point2[], labels: readonly number[], k: number): number {
  let agree = 0;
  for (let j = 0; j < k; j++) {
    const counts = new Map<number, number>();
    pts.forEach((p, i) => labels[i] === j && counts.set(p.label, (counts.get(p.label) ?? 0) + 1));
    agree += Math.max(0, ...counts.values());
  }
  return agree / pts.length;
}

const name = (j: number) => `C${j + 1}`;

function* run(input: KMeansInput): Generator<Frame<PlotState>> {
  const { data, k } = input;
  const pts = pointsOf(input);
  const starts = startsOf(input);
  const { steps, converged } = lloyd(pts, starts);
  const top = Math.max(1, ...steps.map((s) => s.inertia)) * 1.1;
  const tones = CLASS_TONES.slice(0, k);

  const scene = (o: { cents: readonly Vec[]; labels: readonly number[] | null; upTo: number; territory: readonly Vec[] | null; moves?: readonly Vec[]; focus?: number; handles?: boolean; inertiaNow?: number }): PlotPart[] => {
    const shapes: Shape[] = [];
    if (o.territory) {
      const t = o.territory;
      shapes.push(regionHeatmap((x, y) => nearest(t, x, y), { kind: 'classes', tones }, { cols: 30, rows: 30 }));
    }
    pts.forEach((p, i) =>
      shapes.push(
        i === o.focus
          ? { kind: 'point', id: `p${i}`, at: [p.x, p.y], mark: 'key', size: 'lg', label: '?' }
          : { kind: 'point', id: `p${i}`, at: [p.x, p.y], tone: o.labels ? tones[o.labels[i]] : undefined, size: 'sm' },
      ),
    );
    o.moves?.forEach((from, j) => {
      const to = o.cents[j];
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1e-9) shapes.push({ kind: 'vector', id: `move${j}`, from, to, tone: tones[j], dashed: true });
    });
    o.cents.forEach((c, j) => shapes.push({ kind: 'point', id: `c${j}`, at: c, tone: tones[j], size: 'lg', label: name(j) }));
    const handles: Handle[] = o.handles
      ? starts.map((s, j) => ({ id: `c${j}`, at: s, label: `Start of ${name(j)}`, tone: tones[j], step: 0.1, min: [DATA_BOX.x.min, DATA_BOX.y.min], max: [DATA_BOX.x.max, DATA_BOX.y.max] }))
      : [];
    const plane: PlanePart = { kind: 'plane', id: 'plane', label: `${pts.length} points, k = ${k}`, x: DATA_BOX.x, y: DATA_BOX.y, equal: true, shapes, handles };
    const values = steps.slice(0, o.upTo).map((s, i): Vec => [i, s.inertia]);
    const chart: PlanePart = {
      kind: 'plane',
      id: 'inertia',
      label: 'Inertia after each step',
      x: { min: 0, max: Math.max(2, steps.length - 1), label: 'step' },
      y: { min: 0, max: top, label: 'inertia' },
      equal: false,
      shapes: values.length ? [{ kind: 'path', id: 'inertia', points: values, dots: true, mark: 'key' }] : [],
      handles: [],
    };
    const sizes = o.labels ? o.cents.map((_, j) => ({ id: `n${j}`, label: name(j), value: `${o.labels!.filter((l) => l === j).length} points`, tone: tones[j] })) : [];
    return [
      plane,
      chart,
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Clusters',
        items: [...sizes, ...(o.inertiaNow !== undefined ? [{ id: 'inertia', label: 'inertia', value: fmt(o.inertiaNow, 2), mark: 'key' as const }] : [])],
      },
    ];
  };

  // The point most torn between two centroids at the start makes the best first question.
  const margin = (p: Point2) => {
    const ds = starts.map((c) => d2(p, c)).sort((a, b) => a - b);
    return ds[1] - ds[0];
  };
  const focus = pts.reduce((best, p, i) => (margin(p) < margin(pts[best]) ? i : best), 0);
  const names = starts.map((_, j) => name(j));
  let iterations = 0;

  yield plotFrame(scene({ cents: starts, labels: null, upTo: 0, territory: null, focus, handles: true }), {
    line: 0,
    note: `k-means looks for ${k} clusters by repeating two simple steps. It starts from ${k} centroids, ${names.join(', ')} (drag them to choose other starts). The highlighted point is torn between two of them.`,
    vars: { k, n: pts.length },
    stats: { iterations: 0 },
    checkpoint: askInOrder('Which centroid will the highlighted point join?', names, name(steps[0].labels[focus])),
  });

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    const next = steps[s + 1];
    if (step.kind === 'update') iterations++;
    if (step.kind === 'assign') {
      // On an assign step the shading is the current centroids' territories, so a point's cluster is also where it sits.
      const moves = next ? next.cents.map((c, j) => Math.hypot(c[0] - step.cents[j][0], c[1] - step.cents[j][1])) : [];
      const order = [...moves].sort((a, b) => b - a);
      const furthest = moves.indexOf(order[0]);
      yield plotFrame(scene({ cents: step.cents, labels: step.labels, upTo: s + 1, territory: step.cents, inertiaNow: step.inertia }), {
        line: 2,
        note:
          s === 0
            ? `Every point joins its nearest centroid; the shading shows each centroid’s territory. The inertia, the sum of squared distances from points to their centroids, is ${fmt(step.inertia, 2)}.`
            : `${step.changed} ${step.changed === 1 ? 'point was' : 'points were'} now nearer another centroid and switched, so the inertia fell to ${fmt(step.inertia, 2)}.`,
        vars: { iteration: iterations, inertia: round(step.inertia, 3), switched: s === 0 ? 0 : step.changed },
        stats: { iterations },
        checkpoint: next && order.length > 1 && order[0] - order[1] > 1e-6 ? askInOrder('Which centroid will move furthest when the centroids move?', names, name(furthest)) : undefined,
      });
    } else {
      const moved = step.cents.map((c, j) => Math.hypot(c[0] - step.before![j][0], c[1] - step.before![j][1]));
      const most = moved.indexOf(Math.max(...moved));
      const changes = next !== undefined;
      const empty = step.cents.findIndex((_, j) => !step.labels.includes(j));
      yield plotFrame(scene({ cents: step.cents, labels: step.labels, upTo: s + 1, territory: step.before!, moves: step.before!, inertiaNow: step.inertia }), {
        line: 3,
        note: `Each centroid moves to the mean of its points, which is the spot with the smallest total squared distance to them. ${name(most)} moved furthest (${fmt(moved[most], 2)}). Inertia ${fmt(step.inertia, 2)}.${
          empty >= 0 ? ` ${name(empty)} has no points, so it has no mean and stays put.` : ''
        }`,
        vars: { iteration: iterations, inertia: round(step.inertia, 3) },
        stats: { iterations },
        checkpoint: askInOrder('Will any point switch to a different centroid now?', ['Yes', 'No'], changes ? 'Yes' : 'No'),
      });
    }
  }

  const last = steps[steps.length - 1];
  const final = last.inertia;
  // Ten other seeded starts, to tell a good answer from a local optimum.
  const best = Math.min(final, ...Array.from({ length: 10 }, (_, r) => {
    const other = lloyd(pts, defaultStarts(pts, k, input.seed * 31 + r + 1)).steps;
    return other[other.length - 1].inertia;
  }));
  const remarks: string[] = [];
  if (final > best * 1.05 + 1e-9) {
    remarks.push(`This is a local optimum: other starts reach an inertia of ${fmt(best, 2)}. k-means only promises to stop, not to find the best clusters, so in practice it is run from several starts (and k-means++ spreads the starts out).`);
  } else if (data === 'elongated') {
    remarks.push(
      purity(pts, last.labels, k) < 0.8
        ? 'It cut across the two long bands instead of following them: k-means measures squared distance to a centre, so it prefers round clusters, and splitting the bands down the middle gives a smaller total.'
        : 'Here it followed the two bands, but only because they are far enough apart; stretch them and it cuts across them, since it prefers round clusters.',
    );
  } else if (data === 'uneven') {
    const p = purity(pts, last.labels, k);
    remarks.push(
      p < 1
        ? `The boundary sits halfway between the centroids, so the big, spread-out cluster lost ${Math.round((1 - p) * pts.length)} edge ${Math.round((1 - p) * pts.length) === 1 ? 'point' : 'points'} to its small neighbour: k-means assumes clusters of similar size and spread.`
        : 'Both groups were found, though k-means assumes clusters of similar size and spread: move the small one closer and the boundary cuts into the big one.',
    );
  } else if (data === 'random') {
    remarks.push(`There are no real clusters in noise, yet k-means still returns ${k} tidy territories. It always finds exactly k clusters; whether they mean anything is up to you.`);
  } else if (k > 3) {
    remarks.push(`There are only three blobs, so with k = ${k} one of them is split in two. k-means always returns exactly k clusters; plotting inertia against k (the elbow) helps choose k.`);
  }
  yield plotFrame(scene({ cents: last.cents, labels: last.labels, upTo: steps.length, territory: last.cents, inertiaNow: final }), {
    line: 4,
    note: `${converged ? `After ${iterations} ${iterations === 1 ? 'iteration' : 'iterations'} no point changes cluster, so k-means has converged` : `Stopped after ${MAX_ITERS} iterations`}, with inertia ${fmt(final, 2)}. ${remarks.join(' ')}`.trim(),
    vars: { iterations, inertia: round(final, 3) },
    stats: { iterations },
  });
}

const KEYWORDS = /\b(n|k|seed)\s*=\s*(\d+)/gi;

export const kMeans = defineAlgorithm<KMeansInput, PlotState>({
  kind: 'algorithm',
  slug: 'k-means',
  view: 'plot',
  input: {
    examples: [
      // Starts bunched in the middle, so the first run shows several rounds of assigning and moving.
      { id: 'blobs', label: 'Three blobs', make: ({ seed, size }) => ({ data: 'blobs', n: size, k: 3, seed, starts: [[-0.6, -0.2], [0, 0.4], [0.5, -0.4]] }) },
      { id: 'bad-start', label: 'Bad start', make: ({ seed, size }) => ({ data: 'blobs', n: size, k: 3, seed, starts: [[1.3, 0.7], [1.9, 0.6], [-0.8, -0.3]] }) },
      { id: 'elongated', label: 'Long thin bands', make: ({ seed, size }) => ({ data: 'elongated', n: size, k: 2, seed }) },
      { id: 'too-many', label: 'k too big', make: ({ seed, size }) => ({ data: 'blobs', n: size, k: 4, seed }) },
      { id: 'uneven', label: 'Uneven sizes', make: ({ seed, size }) => ({ data: 'uneven', n: size, k: 2, seed }) },
      { id: 'random', label: 'Pure noise', make: ({ seed, size }) => ({ data: 'random', n: size, k: 3, seed }) },
    ],
    size: { label: 'Points', min: MIN_N, max: MAX_N, default: 30 },
    custom: {
      label: `Data (blobs, elongated, uneven, random), n, k (${MIN_K}–${MAX_K}), seed, and optional starts`,
      placeholder: 'e.g. blobs, n = 30, k = 3, seed = 7, starts = (1, 1), (-1, 1), (0, -2)',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as KData;
        if (!DATA.includes(word)) return { error: 'Start with the data: blobs, elongated, uneven or random.' };
        const found: Record<string, number> = {};
        for (const m of text.matchAll(KEYWORDS)) found[m[1].toLowerCase()] = Number(m[2]);
        const { n, k, seed } = found;
        if (n === undefined || k === undefined || seed === undefined) return { error: 'Give n, k and seed, e.g. n = 30, k = 3, seed = 7.' };
        if (n < MIN_N || n > MAX_N) return { error: `n must be between ${MIN_N} and ${MAX_N}.` };
        if (k < MIN_K || k > MAX_K) return { error: `k must be between ${MIN_K} and ${MAX_K}.` };
        const at = text.toLowerCase().indexOf('starts');
        if (at < 0) return { value: { data: word, n, k, seed } };
        const xs = numbersIn(text.slice(at));
        if (xs.length !== 2 * k) return { error: `Give ${k} starting points, one (x, y) per centroid.` };
        const starts: Vec[] = [];
        for (let j = 0; j < k; j++) {
          const [x, y] = [xs[2 * j], xs[2 * j + 1]];
          if (Math.abs(x) > 3 || Math.abs(y) > 3) return { error: 'Starting points must lie between −3 and 3.' };
          starts.push([round(x, 2), round(y, 2)]);
        }
        return { value: { data: word, n, k, seed, starts } };
      },
      format: ({ data, n, k, seed, starts }) =>
        `${data}, n = ${n}, k = ${k}, seed = ${seed}${starts ? `, starts = ${starts.map((s) => `(${plain(s[0])}, ${plain(s[1])})`).join(', ')}` : ''}`,
    },
    drag: (input, handle, to) => {
      const j = Number(handle.slice(1));
      const starts = startsOf(input).map((s, i): Vec => (i === j ? [round(Math.min(3, Math.max(-3, to[0])), 2), round(Math.min(3, Math.max(-3, to[1])), 2)] : s));
      return { ...input, starts };
    },
  },
  pseudocode,
  stats: [{ key: 'iterations', label: 'Iterations' }],
  legend: [
    { neutral: 'A point not yet assigned' },
    { tone: 1, label: 'Cluster C1 and its territory' },
    { tone: 2, label: 'Cluster C2' },
    { tone: 3, label: 'Cluster C3' },
    { tone: 4, label: 'Cluster C4' },
    { mark: 'key', label: 'The point in question; inertia' },
  ],
  run,
  content: {
    idea: 'Pick k centroids, then repeat two steps: give every point to its nearest centroid, and move every centroid to the mean of its points. Each step can only lower the total squared distance, so the clusters settle, usually within a few rounds.',
    invariant: 'Inertia, the sum of squared distances from each point to its centroid, never goes up: assigning to the nearest centroid can only shorten distances, and the mean is the point with the smallest squared distance to a group. So k-means always stops, but possibly at a local optimum.',
    whenToUse: 'Grouping unlabelled data into a chosen number of round, similar-sized clusters: customer segments, colour quantisation, compressing vectors. It struggles with long or uneven clusters, needs k chosen in advance, and should be run from several starts (k-means++).',
    traits: [
      { label: 'Inertia never increases', good: true },
      { label: 'Can stop at a local optimum', good: false },
      { label: 'Prefers round, equal clusters', good: null },
    ],
    experiments: [
      { example: 'bad-start', prompt: 'Two centroids start in the same blob. Usually they end up sharing it while the third stretches across two blobs: compare the final inertia with Three blobs.' },
      { example: 'elongated', prompt: 'Two long bands, one above the other. Predict which way k-means will split them, then watch it cut across.' },
      { example: 'too-many', prompt: 'k = 4 but three blobs: one blob gets split in two. k-means always returns exactly k clusters.' },
      { example: 'random', prompt: 'Noise has no clusters, yet k-means still carves it into k neat regions.' },
    ],
  },
});

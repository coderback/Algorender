import { unitBall } from '@/algorithms/linear-algebra/norms';
import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { CLASS_TONES, DATA_BOX, dataset, regionHeatmap } from '@/ml/datasets';
import type { Tone } from '@/viz/marks';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, Handle, HeatmapShape, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// k-nearest neighbours (B7 of the math and ML path). k-NN learns nothing in
// advance: it keeps the training points, and to label a new point q it
// measures the distance from q to every one of them, takes the k nearest and
// lets them vote. k is the knob: k = 1 copies the single nearest point, so it
// never misses a training point and grows an island around every stray one;
// a big k outvotes the strays and draws a smooth boundary, and k = n predicts
// the biggest class everywhere. The ruler decides who is near (L2, L1, L∞, or
// one feature counted three times over), and in many dimensions every point
// ends up about as far away as every other.

// ───────────────────────────── points, rulers and votes ─────────────────────────────

export type Labelled = { x: number; y: number; label: number };
/** Classes by number: 0 is A, 1 is B, 2 is C. */
export const CLASS_NAMES = ['A', 'B', 'C'] as const;
export const className = (label: number) => CLASS_NAMES[label] ?? String(label);

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The points with no two at the same spot: a repeat moves right by 0.01 until
 * its spot is free. Then every training point is its own nearest neighbour,
 * so k = 1 never gets one wrong.
 */
export function spreadOut(points: readonly Labelled[]): Labelled[] {
  const taken = new Set<string>();
  return points.map((p) => {
    let x = p.x;
    while (taken.has(`${x},${p.y}`)) x = round2(x + 0.01);
    taken.add(`${x},${p.y}`);
    return { ...p, x };
  });
}

/** How a ruler measures the gap (dx, dy): L2, L1, L∞, or L2 with every y gap counted three times. */
export type Ruler = 'L2' | 'L1' | 'Linf' | 'y3';
export const RULERS: readonly Ruler[] = ['L2', 'L1', 'Linf', 'y3'];
export const RULER_NAMES: Record<Ruler, string> = { L2: 'L2', L1: 'L1', Linf: 'L∞', y3: 'L2 with y × 3' };
/** How many times the stretched ruler counts a y gap. */
export const STRETCH = 3;

/** The distance under a ruler. */
export function distance(r: Ruler, dx: number, dy: number): number {
  if (r === 'L1') return Math.abs(dx) + Math.abs(dy);
  if (r === 'Linf') return Math.max(Math.abs(dx), Math.abs(dy));
  const sy = r === 'y3' ? STRETCH * dy : dy;
  return Math.sqrt(dx * dx + sy * sy);
}
/** What the points are ordered by: the squared distance for the straight-line rulers (as the exercise does), else the distance. */
function orderKey(r: Ruler, dx: number, dy: number): number {
  if (r === 'L2') return dx * dx + dy * dy;
  if (r === 'y3') return dx * dx + STRETCH * dy * (STRETCH * dy);
  return distance(r, dx, dy);
}

export type Near = { i: number; d: number };

/** Every point's distance from q, nearest first; a tie goes to the lower index. */
export function byDistance(points: readonly Labelled[], q: Vec, r: Ruler = 'L2'): Near[] {
  const keys = new Float64Array(points.length);
  points.forEach((p, i) => (keys[i] = orderKey(r, p.x - q[0], p.y - q[1])));
  const order = Array.from({ length: points.length }, (_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b);
  return order.map((i) => ({ i, d: distance(r, points[i].x - q[0], points[i].y - q[1]) }));
}

export type Vote = { votes: number[]; winner: number; tied: boolean };

/** The vote of the first k in `order`: the class with the most votes, a tie going to the tied class whose member is nearest. */
export function vote(points: readonly Labelled[], order: readonly Near[], k: number, classes: number): Vote {
  const votes = Array.from({ length: classes }, () => 0);
  const voters = order.slice(0, k);
  for (const n of voters) votes[points[n.i].label]++;
  const best = Math.max(...votes);
  const winner = points[voters.find((n) => votes[points[n.i].label] === best)!.i].label;
  return { votes, winner, tied: votes.filter((v) => v === best).length > 1 };
}

export const classesIn = (points: readonly Labelled[]) => Math.max(...points.map((p) => p.label)) + 1;

/**
 * The same L2 prediction as predict(), faster for maps and mistake counts: it
 * keeps a sorted list of the k nearest so far (a tie to the lower index)
 * instead of sorting every point.
 */
export function quickPredict(points: readonly Labelled[], x: number, y: number, k: number, classes: number): number {
  const top: number[] = [];
  const keys: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - x;
    const dy = points[i].y - y;
    const key = dx * dx + dy * dy;
    if (top.length === k && key >= keys[k - 1]) continue;
    if (top.length < k) {
      top.push(i);
      keys.push(key);
    } else {
      top[k - 1] = i;
      keys[k - 1] = key;
    }
    for (let j = top.length - 1; j > 0 && keys[j - 1] > key; j--) {
      [top[j - 1], top[j]] = [top[j], top[j - 1]];
      [keys[j - 1], keys[j]] = [keys[j], keys[j - 1]];
    }
  }
  const votes = Array.from({ length: classes }, () => 0);
  for (const i of top) votes[points[i].label]++;
  const best = Math.max(...votes);
  return points[top.find((i) => votes[points[i].label] === best)!].label;
}

/** k-NN's prediction at q. */
export const predict = (points: readonly Labelled[], q: Vec, k: number, r: Ruler = 'L2', classes = classesIn(points)) => vote(points, byDistance(points, q, r), k, classes).winner;

/** How many of `judged` k-NN gets wrong, trained on `train`. */
export const mistakes = (train: readonly Labelled[], judged: readonly Labelled[], k: number) => {
  const classes = classesIn(train);
  return judged.filter((p) => quickPredict(train, p.x, p.y, k, classes) !== p.label).length;
};

/** The mistakes on `judged` for every k in `ks` (ascending), sorting each judged point's neighbours once. */
export function mistakesByK(train: readonly Labelled[], judged: readonly Labelled[], ks: readonly number[]): number[] {
  const classes = classesIn(train);
  const out = ks.map(() => 0);
  for (const p of judged) {
    // Add the neighbours one at a time, keeping each class's votes and where its nearest member stands.
    const order = byDistance(train, [p.x, p.y]);
    const votes = Array.from({ length: classes }, () => 0);
    const first = Array.from({ length: classes }, () => Infinity);
    let added = 0;
    ks.forEach((k, j) => {
      for (; added < k; added++) {
        const c = train[order[added].i].label;
        votes[c]++;
        if (first[c] === Infinity) first[c] = added;
      }
      const best = Math.max(...votes);
      let winner = -1;
      for (let c = 0; c < classes; c++) if (votes[c] === best && (winner < 0 || first[c] < first[winner])) winner = c;
      if (winner !== p.label) out[j]++;
    });
  }
  return out;
}

export const countClasses = (points: readonly Labelled[], classes = classesIn(points)) => {
  const n = Array.from({ length: classes }, () => 0);
  for (const p of points) n[p.label]++;
  return n;
};

/** How jagged a map is: the edges between side-by-side or stacked cells of different classes. */
export function boundaryEdges(h: HeatmapShape): number {
  let n = 0;
  for (let r = 0; r < h.rows; r++)
    for (let c = 0; c < h.cols; c++) {
      const v = h.values[r * h.cols + c];
      if (c + 1 < h.cols && h.values[r * h.cols + c + 1] !== v) n++;
      if (r + 1 < h.rows && h.values[(r + 1) * h.cols + c] !== v) n++;
    }
  return n;
}

/** The cells of a map: 30 × 30 over the data box. */
export const MAP_CELLS = 30;
const mapOf = (points: readonly Labelled[], k: number, id: string, classes = classesIn(points)) =>
  regionHeatmap((x, y) => quickPredict(points, x, y, k, classes), { kind: 'classes', tones: CLASS_TONES.slice(0, classes) }, { cols: MAP_CELLS, rows: MAP_CELLS, id });

// ───────────────────────────── the data ─────────────────────────────

/** The query story: 40 points in three blobs, 14 of A and 13 each of B and C. */
export const Q_N = 40;
export const queryData = (seed: number) => spreadOut(dataset('blobs', Q_N, seed));

/** Standard normal from two uniforms (Box–Muller). */
function gaussian(u: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
}
const inBox = (v: number) => round2(Math.min(2.9, Math.max(-2.9, v)));

/**
 * Four overlapping clouds of spread 1, around (±1.2, ±1.2): A in the top-right
 * and bottom-left, B in the other two (a noisy XOR), so no straight line splits
 * them and a big enough k mixes up whole clouds. Labels go A, B, A, B, …
 */
export function fourClouds(n: number, seed: number): Labelled[] {
  const u = createRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const label = i % 2;
    const sx = u() < 0.5 ? -1 : 1;
    const sy = label ? -sx : sx;
    return { x: inBox(1.2 * sx + gaussian(u)), y: inBox(1.2 * sy + gaussian(u)), label };
  });
}
/** The regions story: 121 training points (61 A, 60 B) and 600 test points from the same clouds. */
export const R_TRAIN = 121;
export const R_TEST = 600;
export const R_K = 15;
/** The test points' seed, a scramble of the training seed. */
export const testSeed = (seed: number) => (Math.imul(seed >>> 0, 2654435761) + 1) >>> 0;
export const regionsData = (seed: number) => ({ train: spreadOut(fourClouds(R_TRAIN, seed)), test: fourClouds(R_TEST, testSeed(seed)) });
/** The k the error chart runs through: every odd k up to all 121. */
/** The zoomed chart stops here, where the useful dip ends. */
export const DIP_K = 61;
export const CHART_KS = Array.from({ length: (R_TRAIN + 1) / 2 }, (_, j) => 2 * j + 1);

export type RegionsRun = {
  train: Labelled[];
  test: Labelled[];
  maps: { one: HeatmapShape; many: HeatmapShape };
  edges: { one: number; many: number };
  trainMistakes: { one: number; many: number };
  testMistakes: { one: number; many: number; all: number };
  curve: { train: number[]; test: number[] };
};

export function regionsRun(seed: number): RegionsRun {
  const { train, test } = regionsData(seed);
  const one = mapOf(train, 1, 'map1');
  const many = mapOf(train, R_K, 'map15');
  const curve = { train: mistakesByK(train, train, CHART_KS), test: mistakesByK(train, test, CHART_KS) };
  const at = (k: number) => CHART_KS.indexOf(k);
  return {
    train,
    test,
    maps: { one, many },
    edges: { one: boundaryEdges(one), many: boundaryEdges(many) },
    trainMistakes: { one: curve.train[at(1)], many: curve.train[at(R_K)] },
    testMistakes: { one: curve.test[at(1)], many: curve.test[at(R_K)], all: curve.test[at(R_TRAIN)] },
    curve,
  };
}

/**
 * The metric story's 16 points: six near q = (0, 0), placed so L2, L1 and L∞
 * each pick different neighbours and a different winner (the 4th nearest at
 * least 0.15 farther than the 3rd under every ruler), one to the side that only
 * the stretched ruler takes in, and nine farther out.
 */
export const METRIC_POINTS: readonly Labelled[] = [
  { x: 0.8, y: 0.9, label: 0 },
  { x: -1.05, y: -1.05, label: 0 },
  { x: 1.5, y: 0, label: 1 },
  { x: 0, y: -1.5, label: 1 },
  { x: 1, y: 0.45, label: 2 },
  { x: -0.45, y: 1.25, label: 2 },
  { x: 2.3, y: 2.1, label: 0 },
  { x: 2.6, y: 1.4, label: 0 },
  { x: -2.4, y: -2.2, label: 0 },
  { x: 2.5, y: -0.6, label: 1 },
  { x: 0.4, y: -2.6, label: 1 },
  { x: 1.8, y: -2.2, label: 1 },
  { x: -2.2, y: 1.8, label: 2 },
  { x: -1.4, y: 2.6, label: 2 },
  { x: -2.7, y: 0.9, label: 2 },
  { x: -1.9, y: 0.1, label: 1 },
];
export const M_K = 3;

export type RulerVerdict = { ruler: Ruler; order: Near[]; vote: Vote; radius: number };
export const metricVerdict = (q: Vec, r: Ruler): RulerVerdict => {
  const order = byDistance(METRIC_POINTS, q, r);
  return { ruler: r, order, vote: vote(METRIC_POINTS, order, M_K, 3), radius: order[M_K - 1].d };
};

/** The dimensions story: 200 random points and a query in the unit cube, for d = 2, 10, 100 and 1000. */
export const DIMS = [2, 10, 100, 1000] as const;
export const D_POINTS = 200;
export const BINS = 20;
export type DimensionRun = { d: number; dists: number[]; near: number; far: number; ratio: number; nearest: number; farthest: number; points?: Vec[]; q?: Vec };

export function dimensionsRun(seed: number): DimensionRun[] {
  return DIMS.map((d, k) => {
    const u = createRng((seed + 1000003 * (k + 1)) >>> 0);
    const q = Array.from({ length: d }, () => u());
    const points: Vec[] = [];
    const dists: number[] = [];
    for (let i = 0; i < D_POINTS; i++) {
      let s = 0;
      const p: number[] = [];
      for (let j = 0; j < d; j++) {
        const v = u();
        if (d === 2) p.push(v);
        s += (v - q[j]) * (v - q[j]);
      }
      if (d === 2) points.push([p[0], p[1]]);
      dists.push(Math.sqrt(s));
    }
    const near = Math.min(...dists);
    const far = Math.max(...dists);
    return { d, dists, near, far, ratio: near / far, nearest: dists.indexOf(near), farthest: dists.indexOf(far), ...(d === 2 ? { points, q: [q[0], q[1]] as Vec } : {}) };
  });
}

/** How many of the distances, divided by the farthest, fall in each twentieth of 0 to 1. */
export function histogram(run: DimensionRun): number[] {
  const counts = Array.from({ length: BINS }, () => 0);
  for (const v of run.dists) counts[Math.min(BINS - 1, Math.floor((v / run.far) * BINS))]++;
  return counts;
}

// ───────────────────────────── input ─────────────────────────────

export type KnnInput = { story: 'query'; q: Vec; k: number; seed: number } | { story: 'regions'; seed: number } | { story: 'metric'; q: Vec } | { story: 'dimensions'; seed: number };
export type Story = KnnInput['story'];
const STORIES: Story[] = ['query', 'regions', 'metric', 'dimensions'];
export const K_MAX = 15;
export const Q_LIMIT = 2.9;

const pseudocode = [
  'keep every training point and label',
  'to predict at a new point q:',
  '  d[i] ← distance from q to point i',
  '  take the k points with smallest d',
  '  votes ← how many of each class',
  '  predict the class with most votes',
  '  tie: the class with the nearer one',
  'error: share of points it gets wrong',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });
const toneOf = (label: number): Tone => CLASS_TONES[label];
const r2 = (p: Vec): Vec => [round(p[0], 2), round(p[1], 2)];
/** 1st, 2nd, 3rd, 4th, … 11th, 12th, 13th, … 21st. */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const at = (p: Labelled): Vec => [p.x, p.y];

const dot = (p: Labelled, i: number, size: 'sm' | 'md' = 'sm'): Shape => ({ kind: 'point', id: `p${i}`, at: at(p), tone: toneOf(p.label), size });
const qHandle = (q: Vec, label = 'Query point q'): Handle => ({ id: 'q', at: q, label, mark: 'key', step: 0.1, min: [-Q_LIMIT, -Q_LIMIT], max: [Q_LIMIT, Q_LIMIT] });
const qPoint = (q: Vec): Shape => ({ kind: 'point', id: 'q', at: q, mark: 'key', size: 'lg', label: 'q' });
const spokes = (points: readonly Labelled[], q: Vec, voters: readonly Near[]): Shape[] =>
  voters.map((n): Shape => ({ kind: 'path', id: `spoke${n.i}`, points: [q, at(points[n.i])], dashed: true, faint: true }));

/** The points at distance `r` from q under a ruler: a circle, a diamond, a square, or an ellipse squashed in y. */
function ball(r: Ruler, q: Vec, radius: number, id: string, label?: string): Shape {
  const unit = unitBall(r === 'L1' ? 1 : r === 'Linf' ? Infinity : 2);
  const sy = r === 'y3' ? 1 / STRETCH : 1;
  return { kind: 'path', id, points: unit.map(([x, y]): Vec => [round(q[0] + radius * x, 2), round(q[1] + radius * sy * y, 2)]), closed: true, dashed: true, mark: 'key', ...(label ? { label } : {}) };
}

const votesText = (v: Vote) =>
  v.votes
    .map((n, c) => [n, c] as const)
    .filter(([n]) => n > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([n, c]) => `${n} ${className(c)}`)
    .join(', ');
const voteReadouts = (v: Vote, classes: number, prefix = 'votes'): Readout[] =>
  Array.from({ length: classes }, (_, c): Readout => ({ id: `${prefix}${c}`, label: `${prefix} for ${className(c)}`, value: String(v.votes[c]), tone: toneOf(c) }));

type FrameOptions = Omit<Parameters<typeof plotFrame>[1], 'stats'>;
const frameWith = (distances: number) => (parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { distances } });

// ───────────────────────────── story 1: a query and its neighbours ─────────────────────────────

export const WHICH_MEASURED = (k: number) => [`Only the ${k} nearest`, 'Every training point', 'Only the points of one class'];
export const ALL_VOTE = ['The class with the most training points', 'The class of the nearest point', 'It depends on where q is'];
const LETTERS = ['A', 'B', 'C'];
/** The shown k when the question asks about a second one: 1, or 3 when the run's k is already 1. */
export const otherK = (k: number) => (k === 1 ? 3 : 1);

function* queryStory(q: Vec, k: number, seed: number): Generator<Frame<PlotState>> {
  const pts = queryData(seed);
  const counts = countClasses(pts, 3);
  const order = byDistance(pts, q);
  const v = vote(pts, order, k, 3);
  const k2 = otherK(k);
  const v2 = vote(pts, order, k2, 3);
  const vAll = vote(pts, order, Q_N, 3);
  const rK = order[k - 1].d;
  const SHOWN = K_MAX;
  const yMax = Math.ceil(order[SHOWN - 1].d * 1.15 * 2) / 2;

  const plane = (label: string, extra: Shape[], sizeUp: readonly Near[] = [], map: HeatmapShape | null = null): PlanePart => {
    const big = new Set(sizeUp.map((n) => n.i));
    return {
      kind: 'plane',
      id: 'plane',
      label,
      ...DATA_BOX,
      equal: true,
      shapes: [...(map ? [map] : []), ...extra, ...pts.map((p, i) => dot(p, i, big.has(i) ? 'md' : 'sm')), qPoint(q)],
      handles: [qHandle(q)],
    };
  };
  const chart = (voters: number | 'all'): PlanePart => ({
    kind: 'plane',
    id: 'dist',
    label: 'Distances from q, nearest first',
    x: { min: 0.4, max: SHOWN + 0.6, label: 'neighbour', ticks: Array.from({ length: SHOWN }, (_, j) => ({ at: j + 1, label: String(j + 1) })) },
    y: { min: 0, max: yMax, label: 'distance' },
    equal: false,
    shapes: [
      {
        kind: 'bars',
        id: 'dists',
        bars: order.slice(0, SHOWN).map(
          (n, j): Bar => ({ id: `d${n.i}`, x0: j + 0.65, x1: j + 1.35, y: round(n.d, 2), label: className(pts[n.i].label), ...(voters === 'all' || j < voters ? { tone: toneOf(pts[n.i].label) } : {}) }),
        ),
      },
    ],
    handles: [{ id: 'k', at: [k, 0], label: 'k', mark: 'key', step: 1, min: [1, 0], max: [K_MAX, 0] }],
  });
  const countItems: Readout[] = counts.map((n, c) => ({ id: `n${c}`, label: `class ${className(c)} points`, value: String(n), tone: toneOf(c) }));
  /** q, and the k this frame shows. */
  const base = (kk = k): Readout[] => [
    { id: 'q', label: 'q', value: fmtVec(q, 1), mark: 'key' },
    { id: 'k', label: 'k', value: String(kk), mark: 'key' },
  ];
  const vars = (kk: number): Record<string, number> => ({ k: kk, n: Q_N, 'q.x': q[0], 'q.y': q[1] });
  const frame = frameWith(0);
  const measured = frameWith(Q_N);

  // 0: the training points and the query.
  yield frame([plane(`${Q_N} training points and a query point q`, []), readouts([...base(), ...countItems])], {
    line: 0,
    note: `k-nearest neighbours, k-NN, doesn't train at all: it keeps these ${Q_N} labelled points just as they are. To label a new point q, it finds the k training points nearest to q and lets them vote, one vote each: the class with the most votes wins. Here k = ${k}. Drag q anywhere, and once the chart appears, drag k along it.`,
    vars: vars(k),
    checkpoint: askInOrder(`To find the ${k} nearest, which training points must k-NN measure the distance from q to?`, WHICH_MEASURED(k), WHICH_MEASURED(k)[1]),
  });

  // 1: every distance, sorted.
  yield measured([plane(`${Q_N} training points and q`, []), chart('all'), readouts([...base(), { id: 'measured', label: 'distances measured', value: String(Q_N) }, ...countItems])], {
    line: 2,
    note: `Plain k-NN can't know which ${k} are nearest without measuring them all, so it works out all ${Q_N} distances, straight-line (L2), and sorts them, nearest first. The chart shows the ${SHOWN} nearest, each bar labelled with its point's class. If two classes tie for the most votes, the tied class with the nearer member wins.`,
    vars: vars(k),
    checkpoint: askInOrder(`With k = ${k}, which class will k-NN predict at q?`, LETTERS, className(v.winner)),
  });

  // 2: the k nearest vote.
  const voters = order.slice(0, k);
  const tieNote = (vv: Vote, kk: number) => {
    const nearestTied = order.slice(0, kk).find((n) => pts[n.i].label === vv.winner)!;
    const tiedNames = vv.votes.map((n, c) => [n, c] as const).filter(([n]) => n === Math.max(...vv.votes)).map(([, c]) => className(c));
    return `${tiedNames.length === 2 ? tiedNames.join(' and ') : `${tiedNames.slice(0, -1).join(', ')} and ${tiedNames.at(-1)}`} tie with ${Math.max(...vv.votes)} votes each, and the nearest of their points, ${fmt(nearestTied.d, 2)} away, is class ${className(vv.winner)}, so k-NN predicts ${className(vv.winner)}.`;
  };
  yield measured(
    [
      plane(`The ${k} nearest to q`, [...spokes(pts, q, voters), ball('L2', q, rK, 'circle', `k = ${k}`)], voters),
      chart(k),
      readouts([...base(), { id: 'radius', label: `distance to the ${k === 1 ? 'nearest' : `${ordinal(k)} nearest`}`, value: fmt(rK, 2) }, ...voteReadouts(v, 3)], 'The vote'),
    ],
    {
      line: v.tied ? 6 : 5,
      note: `The ${k === 1 ? 'nearest point lies' : `${k} nearest lie`} inside the dashed circle through the ${k === 1 ? 'nearest' : `${ordinal(k)} nearest`}, ${fmt(rK, 2)} from q. Their votes: ${votesText(v)}. ${v.tied ? tieNote(v, k) : `${className(v.winner)} has the most, so k-NN predicts ${className(v.winner)} at q.`}`,
      vars: vars(k),
      checkpoint: askInOrder(`With k = ${k2} instead, which class would it predict at q?`, LETTERS, className(v2.winner)),
    },
  );

  // 3: a second k.
  const voters2 = order.slice(0, k2);
  yield measured(
    [plane(`The ${k2} nearest to q`, [...spokes(pts, q, voters2), ball('L2', q, order[k2 - 1].d, 'circle', `k = ${k2}`)], voters2), chart(k2), readouts([...base(k2), ...voteReadouts(v2, 3)], 'The vote')],
    {
      line: v2.tied ? 6 : 5,
      note:
        k2 === 1
          ? `With k = 1 only the nearest point votes: class ${className(v2.winner)}, ${fmt(order[0].d, 2)} away, so k-NN predicts ${className(v2.winner)}${v2.winner === v.winner ? `, as k = ${k} did` : `, where k = ${k} predicted ${className(v.winner)}`}. One point decides everything.`
          : `With k = 3 the votes are ${votesText(v2)}. ${v2.tied ? tieNote(v2, 3) : `k-NN predicts ${className(v2.winner)}${v2.winner === v.winner ? ', as k = 1 did' : `, where k = 1 predicted ${className(v.winner)}`}.`}`,
      vars: vars(k2),
      checkpoint: askInOrder(`Now let all ${Q_N} training points vote: k = ${Q_N}. What does k-NN predict at q?`, ALL_VOTE, ALL_VOTE[0]),
    },
  );

  // 4: every point votes.
  const majority = counts.indexOf(Math.max(...counts));
  yield frameWith(Q_N + MAP_CELLS * MAP_CELLS * Q_N)(
    [plane(`k = ${Q_N}: every point votes, everywhere`, [], [], mapOf(pts, Q_N, 'map', 3)), chart('all'), readouts([...base(Q_N), ...voteReadouts(vAll, 3)], 'The vote')],
    {
      line: 5,
      note: `With every point voting, the votes are ${votesText(vAll)} wherever q is: class ${className(majority)} has the most training points, so k-NN predicts ${className(majority)} everywhere, and the whole map, coloured by what a query at each spot would get, is one class. Too big a k ignores where q is.`,
      vars: vars(Q_N),
    },
  );

  // 5: the map for this k.
  const map = mapOf(pts, k, 'map', 3);
  yield frameWith(Q_N + 2 * MAP_CELLS * MAP_CELLS * Q_N)(
    [plane(`What k = ${k} predicts at every spot`, [ball('L2', q, rK, 'circle', `k = ${k}`)], voters, map), chart(k), readouts([...base(), { id: 'pred', label: 'prediction at q', value: className(v.winner), tone: toneOf(v.winner) }], 'The vote')],
    {
      line: 5,
      note: `Each spot of the map is coloured by what k = ${k} would predict for a query there, ${MAP_CELLS * MAP_CELLS} spots, each measured against all ${Q_N} points. Drag q across a boundary and watch the vote change; drag k down to 1 and up to ${K_MAX} and watch the boundaries move.`,
      vars: vars(k),
    },
  );
}

// ───────────────────────────── story 2: k = 1 against k = 15 ─────────────────────────────

export const TRAIN_WRONG = ['None', 'A few', 'About half'];
export const SMOOTHER = ['Smoother', 'More jagged', 'About the same'];
export const FEWER = ['k = 1', `k = ${R_K}`, 'About the same'];
export const MORE_OR_FEWER = ['Fewer', 'More', 'About the same'];
const pct = (m: number, n: number) => `${fmt((100 * m) / n, 1)}%`;
const outOf = (m: number, n: number) => `${m} of ${n} (${pct(m, n)})`;

function* regionsStory(seed: number): Generator<Frame<PlotState>> {
  const run = regionsRun(seed);
  const { train, test, maps, edges, trainMistakes: tm, testMistakes: te, curve } = run;
  const counts = countClasses(train, 2);
  const N = R_TRAIN;
  const missTrain = (k: number) => train.flatMap((p, i) => (quickPredict(train, p.x, p.y, k, 2) !== p.label ? [i] : []));
  const missTest = (k: number) => test.flatMap((p, i) => (quickPredict(train, p.x, p.y, k, 2) !== p.label ? [i] : []));

  type Show = { map: boolean; rings?: number[]; tests?: number[] };
  const plane = (k: 1 | 15, show: Show, label?: string): PlanePart => ({
    kind: 'plane',
    id: k === 1 ? 'k1' : 'k15',
    label: label ?? `k = ${k}`,
    ...DATA_BOX,
    equal: true,
    shapes: [
      ...(show.map ? [k === 1 ? maps.one : maps.many] : []),
      ...(show.tests ?? []).map((i): Shape => ({ kind: 'point', id: `t${i}`, at: at(test[i]), mark: 'reject', size: 'sm' })),
      ...(show.rings ?? []).map((i): Shape => ({ kind: 'point', id: `miss${i}`, at: at(train[i]), mark: 'reject', size: 'lg' })),
      ...train.map((p, i) => dot(p, i)),
    ],
    handles: [],
  });
  const countItems: Readout[] = counts.map((n, c) => ({ id: `n${c}`, label: `class ${className(c)} training points`, value: String(n), tone: toneOf(c) }));
  const vars: Record<string, number> = { n: N, 'test points': R_TEST };
  const cells = MAP_CELLS * MAP_CELLS;

  // 0: the training points.
  yield frameWith(0)([plane(1, { map: false }, `${N} training points`), readouts([...countItems, { id: 'test', label: 'test points, kept aside', value: String(R_TEST) }])], {
    line: 0,
    note: `Four overlapping clouds, class A top right and bottom left, class B in the other two corners: ${counts[0]} training points of A and ${counts[1]} of B. Where the clouds overlap, a point's neighbours are often of the other class. ${R_TEST} more points from the same clouds are kept aside as a test set. Compare k = 1 with k = ${R_K}, each colouring the whole plane by what it would predict there.`,
    vars,
    checkpoint: askInOrder(`Run k = 1 on its own ${N} training points, predicting each one from all ${N}. How many will it get wrong?`, TRAIN_WRONG, TRAIN_WRONG[0]),
  });

  // 1: k = 1's map.
  yield frameWith(cells * N + N * N)([plane(1, { map: true }), readouts([{ id: 'train1', label: 'k = 1: training points wrong', value: outOf(tm.one, N) }, { id: 'edges1', label: 'k = 1: boundary length (cell edges)', value: String(edges.one) }])], {
    line: 3,
    note: `Every training point is its own nearest neighbour, at distance 0 (no two share a spot), so k = 1 gives each one its own label back: ${tm.one} wrong out of ${N}. To do that, the map grows an island of colour around every point that strays into the other cloud. To measure how jagged a boundary is, count the edges between neighbouring cells of different colours on the ${MAP_CELLS} × ${MAP_CELLS} grid: ${edges.one} for k = 1.`,
    vars,
    checkpoint: askInOrder(`k = ${R_K} lets the ${R_K} nearest vote. Will its boundary be smoother or more jagged than k = 1's?`, SMOOTHER, SMOOTHER[0]),
  });

  // 2: k = 15's map beside it.
  yield frameWith(2 * cells * N + N * N)(
    [
      plane(1, { map: true }),
      plane(15, { map: true }),
      readouts([
        { id: 'edges1', label: 'k = 1: boundary length (cell edges)', value: String(edges.one) },
        { id: 'edges15', label: `k = ${R_K}: boundary length (cell edges)`, value: String(edges.many) },
      ]),
    ],
    {
      line: 5,
      note: `With ${R_K} voters, one stray point is outvoted by the points around it, so the islands disappear: k = ${R_K}'s boundary is ${edges.many} cell edges long against ${edges.one} for k = 1. It follows where each class is common, not where each single point happens to lie.`,
      vars,
      checkpoint: askInOrder(`Will k = ${R_K} get any of its own ${N} training points wrong?`, ['Yes', 'No'], tm.many > 0 ? 'Yes' : 'No'),
    },
  );

  // 3: the training mistakes.
  yield frameWith(2 * cells * N + 2 * N * N)(
    [
      plane(1, { map: true }),
      plane(15, { map: true, rings: missTrain(R_K) }),
      readouts([
        { id: 'train1', label: 'k = 1: training points wrong', value: outOf(tm.one, N) },
        { id: 'train15', label: `k = ${R_K}: training points wrong`, value: outOf(tm.many, N) },
      ]),
    ],
    {
      line: 7,
      note: `k = ${R_K} gets ${tm.many} of its ${N} training points wrong, ringed: each sits among more points of the other class than its own, so even with its own vote counted it is outvoted. On the training points, k = 1 looks perfect and k = ${R_K} doesn't.`,
      vars,
      checkpoint: askInOrder(`On the ${R_TEST} test points, new to both, which is likely to make fewer mistakes?`, FEWER, FEWER[1]),
    },
  );

  // 4: the test points.
  const better = te.many < te.one ? `k = ${R_K} makes fewer mistakes` : te.many === te.one ? 'the two tie' : `this time k = 1 makes fewer, by luck`;
  yield frameWith(2 * cells * N + 2 * (N + R_TEST) * N)(
    [
      plane(1, { map: true, tests: missTest(1) }),
      plane(15, { map: true, tests: missTest(R_K) }),
      readouts([
        { id: 'test1', label: 'k = 1: test points wrong', value: outOf(te.one, R_TEST) },
        { id: 'test15', label: `k = ${R_K}: test points wrong`, value: outOf(te.many, R_TEST) },
      ]),
    ],
    {
      line: 7,
      note: `On the ${R_TEST} test points, marked where they are predicted wrongly, k = 1 gets ${te.one} wrong (${pct(te.one, R_TEST)}) and k = ${R_K} gets ${te.many} (${pct(te.many, R_TEST)}): ${better}. k = 1's perfect training score came from remembering every point, strays included, and a new point that lands on a stray's island gets the stray's class. A training score says how well a model remembers; only new points say how well it predicts.`,
      vars,
      checkpoint: askInOrder(`Now let all ${N} training points vote, k = ${N}. Against k = ${R_K}, will it make more or fewer test mistakes?`, MORE_OR_FEWER, te.all > te.many ? 'More' : te.all < te.many ? 'Fewer' : 'About the same'),
    },
  );

  // 5: every odd k.
  const best = curve.test.indexOf(Math.min(...curve.test));
  const bestK = CHART_KS[best];
  const pctPoints = (ms: readonly number[], n: number) => ms.map((m, j): Vec => [CHART_KS[j], round((100 * m) / n, 2)]);
  const trainLine = pctPoints(curve.train, N);
  const testLine = pctPoints(curve.test, R_TEST);
  const DIP = CHART_KS.indexOf(DIP_K);
  const top = (lines: readonly (readonly Vec[])[]) => Math.ceil(Math.max(...lines.flat().map((p) => p[1])) / 10) * 10;
  const chart = (id: string, label: string, upto: number): PlanePart => {
    const tr = trainLine.slice(0, upto + 1);
    const ts = testLine.slice(0, upto + 1);
    const at = (line: readonly Vec[], k: number) => line[Math.min(line.length - 1, CHART_KS.indexOf(k))][1];
    const labelK = Math.round(CHART_KS[upto] * 0.7) | 1;
    return {
      kind: 'plane',
      id,
      label,
      x: { min: 0, max: CHART_KS[upto] + 1, label: 'k' },
      y: { min: 0, max: Math.max(40, top([tr, ts])), label: '% wrong' },
      equal: false,
      shapes: [
        { kind: 'path', id: 'train', points: tr, dashed: true },
        { kind: 'path', id: 'test', points: ts, mark: 'key' },
        { kind: 'label', id: 'train-label', at: [9, round(Math.max(2, at(tr, 9) - 4), 2)], text: 'training' },
        { kind: 'label', id: 'test-label', at: [labelK, round(at(ts, labelK) + 4, 2)], text: 'test' },
        { kind: 'point', id: 'best', at: testLine[best], mark: 'found', size: 'md', label: `k = ${bestK}` },
      ],
      handles: [],
    };
  };
  const worst = DIP + curve.test.slice(DIP, -1).indexOf(Math.max(...curve.test.slice(DIP, -1)));
  yield frameWith(2 * cells * N + 3 * (N + R_TEST) * N)(
    [
      chart('dip', `Points wrong, for every odd k up to ${DIP_K}`, DIP),
      chart('errors', `Points wrong, for every odd k up to ${N}`, CHART_KS.length - 1),
      readouts([
        { id: 'best', label: 'fewest test mistakes', value: `k = ${bestK}: ${outOf(curve.test[best], R_TEST)}`, mark: 'found' },
        { id: 'worst', label: `most test mistakes past k = ${DIP_K}`, value: `k = ${CHART_KS[worst]}: ${outOf(curve.test[worst], R_TEST)}` },
        { id: 'testall', label: `k = ${N}: test points wrong`, value: outOf(te.all, R_TEST) },
      ]),
    ],
    {
      line: 7,
      note: `The charts run k through every odd value (with two classes an odd k never ties): up to ${DIP_K} on the left, all the way to ${N} on the right. Training mistakes start at 0 and climb with k. Test mistakes fall, with some wobble, as voting smooths away the islands: the fewest come at k = ${bestK}. Each cloud holds about 30 training points, so past k ≈ ${DIP_K - 1} a query's own cloud can't fill its vote, and the two clouds beside it, of the other class, outvote it: at k = ${CHART_KS[worst]}, ${curve.test[worst]} of the ${R_TEST} test points are wrong, worse than guessing. At k = ${N} the far cloud of the same class joins in, every query gets the same vote, ${counts[0]} A to ${counts[1]} B, and k-NN predicts A everywhere: ${te.all} wrong. That overshoot comes from the chessboard layout; on most data a big k simply drifts towards predicting the bigger class everywhere. Choosing k by its test score would make the test set part of training, so in practice k is chosen on a third set, kept aside from both.`,
      vars,
    },
  );
}

// ───────────────────────────── story 3: three rulers ─────────────────────────────

function* metricStory(q: Vec): Generator<Frame<PlotState>> {
  const pts = METRIC_POINTS;
  const verdicts = Object.fromEntries(RULERS.map((r) => [r, metricVerdict(q, r)])) as Record<Ruler, RulerVerdict>;
  const plane = (label: string, extra: Shape[], voters: readonly Near[] = []): PlanePart => {
    const big = new Set(voters.map((n) => n.i));
    return { kind: 'plane', id: 'plane', label, ...DATA_BOX, equal: true, shapes: [...extra, ...pts.map((p, i) => dot(p, i, big.has(i) ? 'md' : 'sm')), qPoint(q)], handles: [qHandle(q)] };
  };
  const nearList = (v: RulerVerdict) => v.order.slice(0, M_K).map((n) => `${className(pts[n.i].label)} at ${fmtVec(at(pts[n.i]), 2)}, ${fmt(n.d, 2)} away`).join('; ');
  const verdictReadouts = (v: RulerVerdict): Readout[] => [
    { id: 'ruler', label: 'ruler', value: RULER_NAMES[v.ruler], mark: 'key' },
    ...v.order.slice(0, M_K).map((n, j): Readout => ({ id: `near${j}`, label: `${j + 1}${['st', 'nd', 'rd'][j]} nearest`, value: `${className(pts[n.i].label)}, ${fmt(n.d, 2)}`, tone: toneOf(pts[n.i].label) })),
  ];
  const result = (v: RulerVerdict) => (v.vote.tied ? `a three-way tie, which the nearest, class ${className(v.vote.winner)}, breaks` : `${votesText(v.vote)}, so ${className(v.vote.winner)} wins`);
  const vars: Record<string, number> = { k: M_K, 'q.x': q[0], 'q.y': q[1] };
  const frame = (n: number) => frameWith(n * pts.length);
  const SHAPE: Record<Ruler, string> = { L2: 'a circle', L1: 'a diamond', Linf: 'a square', y3: 'an ellipse' };
  /** The points within 2 of q in both x and y, in list order (not by distance, which would give the vote away). */
  const nearby = pts.map((p, i) => ({ p, i })).filter(({ p }) => Math.abs(p.x - q[0]) <= 2 && Math.abs(p.y - q[1]) <= 2);
  const ask = (r: Ruler, question: string) => askInOrder(question, LETTERS, className(verdicts[r].vote.winner));

  yield frame(0)([plane(`${pts.length} points, k = ${M_K}`, []), readouts([{ id: 'q', label: 'q', value: fmtVec(q, 1), mark: 'key' }, { id: 'k', label: 'k', value: String(M_K) }, ...nearby.map(({ p, i }): Readout => ({ id: `at${i}`, label: `class ${className(p.label)} point`, value: fmtVec(at(p), 2), tone: toneOf(p.label) }))], 'q and the points near it')], {
    line: 0,
    note: `${pts.length} points, one query q, k = ${M_K}, and three rulers from lengths and distances: L2, the straight line √(dx² + dy²); L1, city blocks, |dx| + |dy|; and L∞, the biggest step, max(|dx|, |dy|). Each can pick different points as the ${M_K} nearest. The points near q are listed with their coordinates, so you can work out each distance as in lengths and distances. Drag q to try other spots.`,
    vars,
    checkpoint: ask('L2', `Under L2, which class wins the vote of the ${M_K} nearest?`),
  });

  const story: [Ruler, Ruler | null, string][] = [
    ['L2', 'L1', `Under L1, city blocks, which class wins?`],
    ['L1', 'Linf', `Under L∞, the biggest step, which class wins?`],
    ['Linf', 'y3', `Back to L2, but now y is measured in units ${STRETCH} times smaller, so every y gap counts ${STRETCH} times as much. Which class wins now?`],
    ['y3', null, ''],
  ];
  for (let s = 0; s < story.length; s++) {
    const [r, next, question] = story[s];
    const v = verdicts[r];
    const voters = v.order.slice(0, M_K);
    const changed = s > 0 && v.order.slice(0, M_K).map((n) => n.i).sort().join() !== verdicts[story[s - 1][0]].order.slice(0, M_K).map((n) => n.i).sort().join();
    const lead =
      r === 'L2'
        ? `Under L2 the points within ${fmt(v.radius, 2)} of q fill a circle`
        : r === 'L1'
          ? `Under L1 the points within ${fmt(v.radius, 2)} of q fill a diamond, its corners on the lines through q: a step along a diagonal costs both its parts`
          : r === 'Linf'
            ? `Under L∞ the points within ${fmt(v.radius, 2)} of q fill a square: only the bigger part of a step counts, so the diagonals are cheap`
            : `Counting y ${STRETCH} times squashes the circle into an ellipse ${STRETCH} times wider than it is tall, here ${fmt(v.radius, 2)} to each side: points beside q now count as near, and points above or below as far`;
    yield frame(s + 1)(
      [plane(`The ${M_K} nearest under ${RULER_NAMES[r]}: ${SHAPE[r]}`, [...spokes(pts, q, voters), ball(r, q, v.radius, `ball-${r}`, RULER_NAMES[r])], voters), readouts([...verdictReadouts(v), ...voteReadouts(v.vote, 3)], 'The vote')],
      {
        line: 3,
        note: `${lead}. The ${M_K} nearest: ${nearList(v)}. Votes: ${result(v)}.${s > 0 ? (changed ? ' A different set of neighbours from the last ruler.' : ' The same neighbours as the last ruler.') : ''}`,
        vars: { ...vars, [`${RULER_NAMES[r]} radius`]: round(v.radius, 2) },
        ...(next ? { checkpoint: ask(next, question) } : {}),
      },
    );
  }

  const winners = RULERS.map((r) => className(verdicts[r].vote.winner));
  const distinct = new Set(winners).size;
  yield frame(RULERS.length + 1)(
    [
      plane('Four rulers, one query', RULERS.map((r) => ({ ...ball(r, q, verdicts[r].radius, `ball-${r}`, RULER_NAMES[r]), mark: null, faint: true }) as Shape)),
      readouts(RULERS.map((r): Readout => ({ id: `win-${r}`, label: `${RULER_NAMES[r]} predicts`, value: className(verdicts[r].vote.winner), tone: toneOf(verdicts[r].vote.winner) })), 'Predictions'),
    ],
    {
      line: 5,
      note:
        distinct > 1
          ? `Same points, same q, same k, and ${distinct} different answers: L2 predicts ${winners[0]}, L1 ${winners[1]}, L∞ ${winners[2]}, and L2 with y counted ${STRETCH} times ${winners[3]}. Choosing the ruler is part of designing the model, and so is the units of each feature: one measured in millimetres and one in metres would let the first decide every distance. That is why features are usually put on the same scale before k-NN, for instance by subtracting each feature's smallest value and dividing by its range (largest − smallest), so every feature runs from 0 to 1.`
          : `Here every ruler predicts ${winners[0]}. Drag q nearer the points around (0, 0) and the rulers start to disagree: choosing the ruler, and the units of each feature, is part of designing the model.`,
      vars,
    },
  );
}

// ───────────────────────────── story 4: many dimensions ─────────────────────────────

export const BIGGER = ['Smaller', 'About the same', 'Bigger'];
export const WHERE_BUNCHED = ['Spread from near 0 up to 1', 'Bunched close to 1', 'Bunched close to 0'];

function* dimensionsStory(seed: number): Generator<Frame<PlotState>> {
  const runs = dimensionsRun(seed);
  const RATIO_X: Axis = { min: -0.6, max: DIMS.length - 0.4, label: 'dimensions d', ticks: DIMS.map((d, j) => ({ at: j, label: String(d) })) };
  const ratioChart = (upto: number): PlanePart => ({
    kind: 'plane',
    id: 'ratios',
    label: 'Nearest ÷ farthest, by dimension',
    x: RATIO_X,
    y: { min: 0, max: 1, label: 'nearest ÷ farthest' },
    equal: false,
    shapes: [{ kind: 'bars', id: 'ratio', bars: runs.slice(0, upto + 1).map((r, j): Bar => ({ id: `r${r.d}`, x0: j - 0.3, x1: j + 0.3, y: round(r.ratio, 2), label: fmt(r.ratio, 2), ...(j === upto ? { mark: 'key' as const } : {}) })) }],
    handles: [],
  });
  const hist = (r: DimensionRun): PlanePart => {
    const counts = histogram(r);
    return {
      kind: 'plane',
      id: 'hist',
      label: `The ${D_POINTS} distances from q in ${r.d} dimensions, as fractions of the farthest`,
      x: { min: 0, max: 1, label: 'distance ÷ farthest' },
      y: { min: 0, max: Math.max(10, Math.ceil((Math.max(...counts) * 1.15) / 10) * 10), label: 'points' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'hist', bars: counts.map((n, b): Bar => ({ id: `h${b}`, x0: round(b / BINS + 0.004, 3), x1: round((b + 1) / BINS - 0.004, 3), y: n })) }],
      handles: [],
    };
  };
  const cloud = (r: DimensionRun): PlanePart => {
    const pts = r.points!;
    const q = r.q!;
    return {
      kind: 'plane',
      id: 'cloud',
      label: `${D_POINTS} random points in a square, and q`,
      x: { min: 0, max: 1, label: 'feature 1' },
      y: { min: 0, max: 1, label: 'feature 2' },
      equal: true,
      shapes: [
        ...pts.map((p, i): Shape => ({ kind: 'point', id: `c${i}`, at: r2(p), size: 'sm' })),
        { kind: 'path', id: 'to-far', points: [r2(q), r2(pts[r.farthest])], dashed: true, label: 'farthest' },
        { kind: 'path', id: 'to-near', points: [r2(q), r2(pts[r.nearest])], mark: 'found', label: 'nearest' },
        { kind: 'point', id: 'q', at: r2(q), mark: 'key', size: 'lg', label: 'q' },
      ],
      handles: [],
    };
  };
  const values = (r: DimensionRun): PlotPart =>
    readouts([
      { id: 'd', label: 'dimensions d', value: String(r.d), mark: 'key' },
      { id: 'near', label: 'nearest distance', value: fmt(r.near, 3), mark: 'found' },
      { id: 'far', label: 'farthest distance', value: fmt(r.far, 3) },
      { id: 'ratio', label: 'nearest ÷ farthest', value: fmt(r.ratio, 2) },
    ]);
  const vars = (r: DimensionRun): Record<string, number> => ({ d: r.d, points: D_POINTS });
  const [two, ten, hundred, thousand] = runs;
  const lowest = (r: DimensionRun) => fmt(Math.min(...r.dists.map((v) => v / r.far)), 2);

  yield frameWith(D_POINTS)([cloud(two), hist(two), ratioChart(0), values(two)], {
    line: 2,
    note: `k-NN trusts that a point's nearest neighbours are much nearer than the rest. Test that as the number of features, the dimension d, grows. Here are ${D_POINTS} random points in a square, each coordinate a random number from 0 to 1, and one more random point q. In d dimensions a point has d coordinates, and the straight-line distance is Pythagoras with d parts: the square root of the sum of the d squared gaps. In 2 dimensions the nearest point is ${fmt(two.near, 3)} from q and the farthest ${fmt(two.far, 3)}: nearest ÷ farthest is ${fmt(two.ratio, 2)}, and the distances spread from near 0 to the farthest.`,
    vars: vars(two),
    checkpoint: askInOrder('Do it again with 10 coordinates per point: 10 dimensions. Compared with 2 dimensions, is nearest ÷ farthest likely to be smaller, about the same, or bigger?', BIGGER, BIGGER[2]),
  });

  yield frameWith(2 * D_POINTS)([hist(ten), ratioChart(1), values(ten)], {
    line: 2,
    note: `In 10 dimensions the nearest is ${fmt(ten.near, 3)} away and the farthest ${fmt(ten.far, 3)}: nearest ÷ farthest is ${fmt(ten.ratio, 2)}, up from ${fmt(two.ratio, 2)}. A distance now adds up 10 squared gaps. To be very near q a point must be near it in all 10 coordinates at once, which almost never happens, and to be very far it must be far in all 10, which is just as rare; most points land in between, so the histogram has drawn away from 0.`,
    vars: vars(ten),
    checkpoint: askInOrder('In 100 dimensions, will the nearest point be less than half as far from q as the farthest?', ['Yes', 'No'], hundred.ratio < 0.5 ? 'Yes' : 'No'),
  });

  yield frameWith(3 * D_POINTS)([hist(hundred), ratioChart(2), values(hundred)], {
    line: 2,
    note: `In 100 dimensions the nearest is ${fmt(hundred.near, 3)} away and the farthest ${fmt(hundred.far, 3)}: nearest ÷ farthest is ${fmt(hundred.ratio, 2)}. Every point has wandered far from q, the nearest included, and they have all wandered about as far.`,
    vars: vars(hundred),
    checkpoint: askInOrder(`In 1000 dimensions, where will the ${D_POINTS} distances sit, as fractions of the farthest?`, WHERE_BUNCHED, WHERE_BUNCHED[1]),
  });

  yield frameWith(4 * D_POINTS)([hist(thousand), ratioChart(3), values(thousand)], {
    line: 3,
    note: `In 1000 dimensions every one of the ${D_POINTS} distances is between ${lowest(thousand)} and 1 times the farthest: the nearest is ${fmt(thousand.near, 3)} away and the farthest ${fmt(thousand.far, 3)}. When every point is about as far as every other, "the k nearest" picks almost at random, and k-NN has nothing to go on. This is the curse of dimensionality. With real data the features are not random, so the cure is to keep only the features that matter, or to find a few that sum up the rest; piling on more features can make k-NN worse.`,
    vars: vars(thousand),
  });
}

function* run(input: KnnInput): Generator<Frame<PlotState>> {
  if (input.story === 'query') yield* queryStory(input.q, input.k, input.seed);
  else if (input.story === 'regions') yield* regionsStory(input.seed);
  else if (input.story === 'metric') yield* metricStory(input.q);
  else yield* dimensionsStory(input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const MAX_SEED = 4294967295;
const okSeed = (s: number) => Number.isInteger(s) && s >= 0 && s <= MAX_SEED;
const okCoord = (v: number) => Math.abs(v) <= Q_LIMIT + 1e-9 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

export function parseKnn(text: string): { value: KnnInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as Story;
  const xs = numbersIn(text);
  if (!STORIES.includes(story)) return { error: 'Start with query, regions, metric or dimensions, e.g. query 0 0 k 5 seed 7.' };
  if (story === 'query') {
    if (xs.length !== 4) return { error: 'Give q, k and a seed, e.g. query 0.5 -1 k 5 seed 7.' };
    const [x, y, k, seed] = xs;
    if (!okCoord(x) || !okCoord(y)) return { error: `q's coordinates are tenths from −${Q_LIMIT} to ${Q_LIMIT}.` };
    if (!Number.isInteger(k) || k < 1 || k > K_MAX) return { error: `k is a whole number from 1 to ${K_MAX}.` };
    if (!okSeed(seed)) return { error: 'The seed is a whole number, 0 or more.' };
    return { value: { story, q: [round(x, 1), round(y, 1)], k, seed } };
  }
  if (story === 'metric') {
    if (xs.length !== 2 || !xs.every(okCoord)) return { error: `Give q as two tenths from −${Q_LIMIT} to ${Q_LIMIT}, e.g. metric 0 0.` };
    return { value: { story, q: [round(xs[0], 1), round(xs[1], 1)] } };
  }
  if (xs.length !== 1 || !okSeed(xs[0])) return { error: `Give one seed, a whole number 0 or more, e.g. ${story} seed 7.` };
  return { value: { story, seed: xs[0] } };
}

export function formatKnn(input: KnnInput): string {
  if (input.story === 'query') return `query ${plain(input.q[0], 1)} ${plain(input.q[1], 1)} k ${input.k} seed ${input.seed}`;
  if (input.story === 'metric') return `metric ${plain(input.q[0], 1)} ${plain(input.q[1], 1)}`;
  return `${input.story} seed ${input.seed}`;
}

export function dragKnn(input: KnnInput, handle: string, to: Vec): KnnInput {
  if (input.story !== 'query' && input.story !== 'metric') return input;
  if (handle === 'k') return input.story === 'query' ? { ...input, k: snap(to[0], 1, 1, K_MAX) } : input;
  if (handle !== 'q') return input;
  return { ...input, q: [snap(to[0], 0.1, -Q_LIMIT, Q_LIMIT), snap(to[1], 0.1, -Q_LIMIT, Q_LIMIT)] };
}

const example = (id: string, label: string, make: (seed: number) => KnnInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const kNearestNeighbours = defineAlgorithm<KnnInput, PlotState>({
  kind: 'algorithm',
  slug: 'k-nearest-neighbours',
  view: 'plot',
  input: {
    examples: [
      example('query', 'A query point and its neighbours', (seed) => ({ story: 'query', q: [0, 0], k: 5, seed })),
      example('regions', 'k = 1 against k = 15', (seed) => ({ story: 'regions', seed })),
      example('metric', 'Three rulers, one query', () => ({ story: 'metric', q: [0, 0] })),
      example('dimensions', 'Distances in many dimensions', (seed) => ({ story: 'dimensions', seed })),
    ],
    custom: {
      label: 'query x y k K seed S; regions or dimensions with a seed; or metric x y (tenths from −2.9 to 2.9)',
      placeholder: 'e.g. query 0.5 -1 k 5 seed 7',
      parse: parseKnn,
      format: formatKnn,
    },
    drag: dragKnn,
  },
  pseudocode,
  stats: [{ key: 'distances', label: 'Distances measured' }],
  legend: [
    { neutral: 'Distances, lines to the neighbours, and points of no class' },
    { mark: 'key', label: 'The query q and its neighbourhood; k (drag them)' },
    { tone: 1, label: 'Class A' },
    { tone: 2, label: 'Class B' },
    { tone: 3, label: 'Class C' },
    { mark: 'reject', label: 'A point predicted wrongly' },
    { mark: 'found', label: 'The nearest point; the k with fewest test mistakes' },
  ],
  run,
  content: {
    idea: 'k-nearest neighbours learns nothing in advance: it keeps the training points as they are. To label a new point, it finds the k training points nearest to it and lets them vote.',
    invariant: 'A prediction is the majority class among the k nearest training points (a tie goes to the tied class with the nearest member). k = 1 gets every training point right when no two share a spot; k = n predicts the biggest class everywhere. Which points are nearest depends on the ruler and on each feature’s units.',
    whenToUse: 'A quick, honest baseline on small data with a few meaningful features on comparable scales, and wherever "similar examples have similar labels" is the whole idea (recommendations, search by example). It is slow to predict on big data, since every training point is measured, and it suffers in many dimensions.',
    traits: [
      { label: 'No training: keeps every point', good: null },
      { label: 'Slow to predict: measures every point', good: false },
      { label: 'Small k: jagged; big k: smooth', good: null },
      { label: 'Needs features on the same scale', good: false },
    ],
    experiments: [
      { example: 'query', prompt: 'Drag q onto the line between two blobs, then drag k from 1 to 15. When does the prediction flip?' },
      { example: 'regions', prompt: 'Press New values a few times. Does k = 1 ever make a training mistake? Which k has the fewest test mistakes?' },
      { example: 'metric', prompt: 'Drag q around (0, 0). Find a spot where all four rulers agree, and one where three disagree.' },
      { example: 'dimensions', prompt: 'Press New values: does nearest ÷ farthest in 1000 dimensions ever drop below 0.8?' },
    ],
  },
});

import { bitsOf } from '@/algorithms/numerics/floating-point';
import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { CLASS_TONES, DATA_BOX, dataset, regionHeatmap, type Point2 } from '@/ml/datasets';
import type { Tone } from '@/viz/marks';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, BitsPart, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Softmax and softmax regression (B7 of the math and ML path). A classifier
// gives each class a score, its logit; softmax turns the scores into
// probabilities: e to the power of each score, divided by their total. Three
// stories:
// - bars: four classes' scores → e^z → shares that add up to 1; adding the
//   same number to every score changes nothing; a temperature T (divide the
//   scores by T) sharpens or flattens them without changing their order; and
//   with two classes softmax is the sigmoid of the gap.
// - regions: softmax regression on three classes in the plane, trained by
//   full-batch gradient descent on the mean cross-entropy. Two classes' regions
//   meet where their scores tie, a straight line, and the three lines meet at a
//   point where every class gets 1/3.
// - overflow: in float32, e^1000 is ∞ and ∞/∞ is NaN; subtracting the largest
//   score first fixes it; very negative scores underflow to 0, and ln 0 = −∞
//   breaks the cross-entropy, which log-sum-exp avoids.

// ───────────────────────────── the maths ─────────────────────────────

/** Softmax of scores z at temperature T, computed safely (the largest score subtracted first). */
export function softmaxOf(z: readonly number[], T = 1): number[] {
  const s = z.map((v) => v / T);
  const m = Math.max(...s);
  const e = s.map((v) => Math.exp(v - m));
  const total = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / total);
}

/** ln(e^z₁ + … + e^z_K), computed as m + ln Σ e^(z − m) so nothing overflows. */
export function logSumExp(z: readonly number[]): number {
  const m = Math.max(...z);
  return m + Math.log(z.reduce((t, v) => t + Math.exp(v - m), 0));
}

/** −ln softmax(z)[y], the cross-entropy of one example, computed as log-sum-exp minus the true class's score. */
export const lossOf = (z: readonly number[], y: number) => logSumExp(z) - z[y];

/** The mean cross-entropy over rows of scores with their true classes. */
export const meanCrossEntropy = (rows: readonly (readonly number[])[], labels: readonly number[]) => rows.reduce((t, z, i) => t + lossOf(z, labels[i]), 0) / rows.length;

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** The index of the biggest score (the first, on a tie). */
export const argmax = (z: readonly number[]) => z.reduce((best, v, i) => (v > z[best] ? i : best), 0);

// ── float32, as on most GPUs

export const f32 = Math.fround;
/** e^x rounded to float32. */
export const exp32 = (x: number) => f32(Math.exp(f32(x)));
/** The largest float32, about 3.4 × 10³⁸. */
export const FLOAT32_MAX = 3.4028234663852886e38;
/** ln of the largest float32: e to anything above this overflows to ∞. */
export const LN_FLOAT32_MAX = Math.log(FLOAT32_MAX);

/** Softmax in float32 the naive way: e of each score, divided by their sum. */
export function naive32(z: readonly number[]): { e: number[]; s: number; p: number[] } {
  const e = z.map(exp32);
  const s = e.reduce((a, b) => f32(a + b), 0);
  return { e, s, p: e.map((v) => f32(v / s)) };
}

/** Softmax in float32 the safe way: subtract the largest score m first. */
export function stable32(z: readonly number[]): { m: number; shifted: number[]; e: number[]; s: number; p: number[] } {
  const m = Math.max(...z);
  const shifted = z.map((v) => f32(v - m));
  const { e, s, p } = naive32(shifted);
  return { m, shifted, e, s, p };
}

/** −ln p_y in float32 from the probability itself (ln 0 = −∞), and by log-sum-exp: ln s + m − z_y. */
export function loss32(z: readonly number[], y: number): { fromP: number; lse: number; lnS: number } {
  const { m, s, p } = stable32(z);
  const lnS = f32(Math.log(s));
  return { fromP: f32(-Math.log(p[y])), lse: f32(lnS + f32(m - z[y])), lnS };
}

// ───────────────────────────── story 1: scores into probabilities ─────────────────────────────

export const CLASSES = ['cat', 'dog', 'fox', 'owl'] as const;
export const K = CLASSES.length;
export const DEFAULT_LOGITS = [2, 1.5, 1, -0.5];
export const Z_MIN = -3;
export const Z_MAX = 5;
export const Z_STEP = 0.1;
export const T_MIN = 0.25;
export const T_MAX = 4;
export const T_STEP = 0.25;
/** The "huge" temperature the bars story ends on. */
export const BIG_T = 100;
/** The amount added to every score. */
export const SHIFT = 10;

/** The top two classes by score: the top one is unique (inputs guarantee it), the second the first of the rest. */
export function topTwo(z: readonly number[]): [number, number] {
  const a = argmax(z);
  const rest = z.map((v, i) => (i === a ? -Infinity : v));
  return [a, argmax(rest)];
}

/** No two classes share the top score. */
export const uniqueTop = (z: readonly number[]) => z.filter((v) => v === Math.max(...z)).length === 1;

// ───────────────────────────── story 2: softmax regression in the plane ─────────────────────────────

export const N_POINTS = 30;
export const STEPS = 80;
export const ETA = 0.5;
export const REGION_CLASSES = ['A', 'B', 'C'] as const;
export const DEFAULT_QUERY: Vec = [0.75, 0.5];
export const Q_STEP = 0.25;
export const Q_LIMIT = 2.75;

/** One class's weights: its score at (x, y) is w1·x + w2·y + b. */
export type Weights = readonly [w1: number, w2: number, b: number];
export type Model = readonly Weights[];

export const scoresAt = (W: Model, x: number, y: number) => W.map(([w1, w2, b]) => w1 * x + w2 * y + b);
export const probsAt = (W: Model, x: number, y: number) => softmaxOf(scoresAt(W, x, y));
export const classAt = (W: Model, x: number, y: number) => argmax(scoresAt(W, x, y));
export const scaled = (W: Model, c: number): Model => W.map((w) => w.map((v) => v * c) as unknown as Weights);

export const regionPoints = (seed: number) => dataset('blobs', N_POINTS, seed, 3);
export const modelLoss = (W: Model, pts: readonly Point2[]) => meanCrossEntropy(pts.map((p) => scoresAt(W, p.x, p.y)), pts.map((p) => p.label));
export const accuracy = (W: Model, pts: readonly Point2[]) => pts.filter((p) => classAt(W, p.x, p.y) === p.label).length / pts.length;

/** The gradient of the mean cross-entropy: for each point, (p_k − [k is its class])·(x, y, 1), averaged. */
export function gradient(W: Model, pts: readonly Point2[]): number[][] {
  const g = W.map(() => [0, 0, 0]);
  for (const pt of pts) {
    const p = probsAt(W, pt.x, pt.y);
    p.forEach((pk, k) => {
      const d = pk - (k === pt.label ? 1 : 0);
      g[k][0] += d * pt.x;
      g[k][1] += d * pt.y;
      g[k][2] += d;
    });
  }
  return g.map((row) => row.map((v) => v / pts.length));
}

/** Full-batch gradient descent from all-zero weights: the model after each step (STEPS + 1 of them) and its loss. */
export function train(seed: number): { points: Point2[]; models: Model[]; losses: number[] } {
  const points = regionPoints(seed);
  const models: Model[] = [REGION_CLASSES.map(() => [0, 0, 0] as const)];
  for (let t = 0; t < STEPS; t++) {
    const W = models[t];
    const g = gradient(W, points);
    models.push(W.map((w, k) => [w[0] - ETA * g[k][0], w[1] - ETA * g[k][1], w[2] - ETA * g[k][2]] as const));
  }
  return { points, models, losses: models.map((W) => modelLoss(W, points)) };
}

/** Where all three scores tie: two linear equations, (w_A − w_B)·(x, y) = b_B − b_A and (w_A − w_C)·(x, y) = b_C − b_A. */
export function meetingPoint(W: Model): Vec | null {
  const [A, B, C] = W;
  const a = [A[0] - B[0], A[1] - B[1]];
  const c = [A[0] - C[0], A[1] - C[1]];
  const r1 = B[2] - A[2];
  const r2 = C[2] - A[2];
  const det = a[0] * c[1] - a[1] * c[0];
  if (Math.abs(det) < 1e-12) return null;
  return [(r1 * c[1] - a[1] * r2) / det, (a[0] * r2 - r1 * c[0]) / det];
}

/** The boundary between classes i and j: the ray from the meeting point along which they tie and the third falls behind. */
export function boundaryRay(W: Model, i: number, j: number): Vec {
  const k = 3 - i - j;
  const n = [W[i][0] - W[j][0], W[i][1] - W[j][1]];
  let d: Vec = [-n[1], n[0]];
  if ((W[k][0] - W[i][0]) * d[0] + (W[k][1] - W[i][1]) * d[1] > 0) d = [-d[0], -d[1]];
  const len = Math.hypot(...d);
  return [d[0] / len, d[1] / len];
}

// ───────────────────────────── story 3: overflow ─────────────────────────────

export const DEFAULT_BIG = 1000;
/** Big enough that e^big overflows float32 and e^−big underflows to 0 (below e^−103.97, half the smallest float32). */
export const BIG_MIN = 104;
export const BIG_MAX = 1_000_000;
/** In the loss frame, the true class's score sits this far below the top. */
export const LOSS_GAP = 120;

export const overflowScores = (big: number) => [big, big - 1, big - 2];
export const lossScores = (big: number) => [big, big - 1, big - LOSS_GAP];

// ───────────────────────────── input ─────────────────────────────

export type SoftmaxInput =
  | { story: 'bars'; logits: number[]; t: number }
  | { story: 'regions'; seed: number; q: Vec }
  | { story: 'overflow'; big: number };
export type Story = SoftmaxInput['story'];
const STORIES: Story[] = ['bars', 'regions', 'overflow'];

const pseudocode = [
  'z₁ … z_K: one score per class',
  'divide each score by the temperature T',
  'm ← the largest score',
  'e_k ← exp(z_k − m) for each class k',
  's ← e₁ + e₂ + … + e_K',
  'p_k ← e_k / s   (they add up to 1)',
  'loss: −ln p_y = ln s + m − z_y',
  'train: W ← W − η · gradient of loss',
  'predict: the class with the top p',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

type FrameOptions = Omit<Parameters<typeof plotFrame>[1], 'stats'>;
const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });
/** A probability or a small value to 3 places. */
export const p3 = (v: number) => fmt(v, 3);
/** Any float the overflow story shows: ∞, NaN, or 3 places. */
export const show = (v: number) => (Number.isNaN(v) ? 'NaN' : p3(v));
/** A positive number in 3 significant figures, with a power of ten when big. */
export function sig(v: number): string {
  if (!Number.isFinite(v)) return show(v);
  if (v < 1000) return fmt(v, 3);
  const k = Math.floor(Math.log10(v));
  let m = round(v / 10 ** k, 2);
  let e = k;
  if (m >= 10) {
    m = round(m / 10, 2);
    e += 1;
  }
  return `${fmt(m, 2)} × 10${superscript(e)}`;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (n: number) => (n < 0 ? '⁻' : '') + [...String(Math.abs(n))].map((d) => SUP[Number(d)]).join('');
/** A score as typed: one decimal at most. */
const zText = (v: number) => fmt(v, 1);
const list = (vs: readonly number[], f: (v: number) => string = zText) => `[${vs.map(f).join(', ')}]`;

const classAxis = (names: readonly string[]): Axis => ({ min: -0.6, max: names.length - 0.4, ticks: names.map((n, i) => ({ at: i, label: n })) });

/** Bars per class, the top one marked; `labels` writes a value above each. */
function classBars(id: string, values: readonly number[], top: number | null, labels?: (v: number) => string, extra: Partial<Bar>[] = []): Shape {
  return {
    kind: 'bars',
    id,
    bars: values.map((v, i): Bar => ({
      id: `${id}${i}`,
      x0: i - 0.3,
      x1: i + 0.3,
      y: round(Number.isFinite(v) ? v : 0, 4),
      ...(i === top ? { mark: 'key' as const } : {}),
      ...(labels ? { label: labels(v) } : {}),
      ...(extra[i] ?? {}),
    })),
  };
}

// ───────────────────────────── story 1: the frames ─────────────────────────────

export const ADD_CHOICES = ['They stay exactly the same', 'The top class’s share grows', 'They move towards equal shares'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const halveChoices = (top: string) => [`${cap(top)} stays on top, with a bigger share`, `${cap(top)} stays on top, with a smaller share`, 'Another class takes the top place'];
export const HUGE_CHOICES = ['Equal shares, 1/4 each', 'All of it on the top class', 'The scores divided by their total'];

function* barsStory(z: readonly number[], T: number): Generator<Frame<PlotState>> {
  const [a, b] = topTwo(z);
  const top = CLASSES[a];
  const second = CLASSES[b];
  const zt = z.map((v) => v / T);
  const e = zt.map((v) => Math.exp(v));
  const s = e.reduce((x, y) => x + y, 0);
  const p = softmaxOf(z, T);
  const half = T / 2;
  const pHalf = softmaxOf(z, half);
  const pBig = softmaxOf(z, BIG_T);
  const sum = z.reduce((x, y) => x + y, 0);
  const tText = fmt(T, 2);
  const divided = T === 1 ? 'divided by T = 1, so unchanged' : `divided by T = ${tText}`;

  const handles = z.map((v, i) => ({ id: `z${i}`, at: [i, round(v, 1)] as Vec, label: `${CLASSES[i]}’s score`, mark: i === a ? ('key' as const) : null, step: Z_STEP, min: [i, Z_MIN] as Vec, max: [i, Z_MAX] as Vec }));
  const scores = (values: readonly number[], label: string, draggable = true): PlanePart => ({
    kind: 'plane',
    id: 'scores',
    label,
    x: classAxis(CLASSES),
    y: { min: Math.min(Z_MIN, ...values) - 0.5, max: Math.max(Z_MAX, ...values) + 0.5, label: 'score z' },
    equal: false,
    shapes: [classBars('z', values, a, zText)],
    handles: draggable ? handles : [],
  });
  const shares = (label: string, shapes: Shape[], yMax = 1, yLabel = 'probability'): PlanePart => ({
    kind: 'plane',
    id: 'shares',
    label,
    x: classAxis(CLASSES),
    // Powers of e can reach 10⁸ when T is small: name the biggest one rather than print every round tick.
    y: { min: 0, max: yMax, label: yLabel, ...(yMax > 1 ? { ticks: [{ at: 0, label: '0' }, { at: yMax / 1.2, label: sig(yMax / 1.2) }] } : {}) },
    equal: false,
    shapes,
    handles: [],
  });
  const tCurve = (show: boolean): PlanePart => ({
    kind: 'plane',
    id: 'temperature',
    label: show ? `${top}’s share at each temperature T` : 'The temperature T (drag it)',
    // No x-axis label: the caption names T, and the equal-shares line ends at the right edge.
    x: { min: 0, max: T_MAX + 0.25 },
    y: { min: 0, max: 1, label: `${top}’s share` },
    equal: false,
    shapes: show
      ? [
          { kind: 'path', id: 'equal', points: [[0, 1 / K], [T_MAX + 0.25, 1 / K]], dashed: true, faint: true, label: 'equal shares' },
          { kind: 'path', id: 'curve', points: Array.from({ length: 76 }, (_, k): Vec => [round(T_MIN + k * 0.05, 2), round(softmaxOf(z, T_MIN + k * 0.05)[a], 2)]), mark: 'key' },
          { kind: 'point', id: 'at', at: [T, round(p[a], 2)], mark: 'key', size: 'md' },
        ]
      : [],
    handles: [{ id: 't', at: [T, 0], label: 'temperature T', mark: 'key', step: T_STEP, min: [T_MIN, 0], max: [T_MAX, 0] }],
  });
  const scoreItems = (values: readonly number[]): Readout[] => values.map((v, i) => ({ id: `z${i}`, label: `${CLASSES[i]}: score`, value: zText(v), ...(i === a ? { mark: 'key' as const } : {}) }));
  const probItems = (ps: readonly number[], id = 'p'): Readout[] => ps.map((v, i) => ({ id: `${id}${i}`, label: `${CLASSES[i]}: probability`, value: p3(v), ...(i === a ? { mark: 'key' as const } : {}) }));
  let exps = 0;
  const frame = (more: number, parts: PlotPart[], o: FrameOptions) => {
    exps += more;
    return plotFrame(parts, { ...o, stats: { exps, steps: 0 } });
  };
  const vars = (temp: number): Record<string, number> => ({ T: temp, m: round(Math.max(...z) / temp, 3) });

  // 0: the scores.
  yield frame(0, [scores(z, 'Each class’s score (drag them)'), shares('The probabilities: not worked out yet', []), tCurve(false), readouts([...scoreItems(z), { id: 't', label: 'temperature T', value: tText }])], {
    line: 0,
    note: `A classifier looks at a photo and gives each of ${K} classes a score, its logit: ${CLASSES.map((c, i) => `${c} ${zText(z[i])}`).join(', ')}. Scores can be any number, negative too, and their total means nothing. Softmax turns them into probabilities in three steps: divide each score by the temperature T (here ${tText}), take e to the power of each, and divide each of those by their total.`,
    vars: vars(T),
    checkpoint: askInOrder('Which class will softmax give the most probability?', [...CLASSES], top),
  });

  // 1: e to the power of each.
  yield frame(K, [scores(z, 'Each class’s score (drag them)'), shares(`e to the power z/T for each class`, [classBars('e', e, a, sig)], Math.max(...e) * 1.2, 'e^(z/T)'), tCurve(false), readouts([...e.map((v, i): Readout => ({ id: `e${i}`, label: `${CLASSES[i]}: e^(z/T)`, value: sig(v), ...(i === a ? { mark: 'key' as const } : {}) })), { id: 's', label: 'their total s', value: sig(s) }])], {
    line: 3,
    note: `Each score, ${divided}, becomes e to that power: ${CLASSES.map((c, i) => `${c} ${sig(e[i])}`).join(', ')}. e^x grows as x grows, so the order of the scores is kept and ${top} still leads. And e^x is positive for every x${z.some((v) => v < 0) ? `, so even a negative score such as ${CLASSES[z.findIndex((v) => v < 0)]}’s gives a positive number` : ''}. Their total is s = ${sig(s)}.`,
    vars: vars(T),
    checkpoint: ask(
      `What share of the probability will ${top} get?`,
      p3(p[a]),
      [...(sum > 0 && z[a] / sum <= 1 ? [p3(z[a] / sum)] : []), p3(1 / K), ...(e[a] / (s - e[a]) < 1 ? [p3(e[a] / (s - e[a]))] : []), p3(p[a] / 2)],
    ),
  });

  // 2: divide by the total.
  const overHalf = p[a] > 0.5;
  yield frame(0, [scores(z, 'Each class’s score (drag them)'), shares('The probabilities: e^(z/T) ÷ s', [classBars('e', p, a, p3)]), tCurve(false), readouts([...probItems(p), { id: 'sum', label: 'their total', value: '1' }])], {
    line: 5,
    note: `Divide each by the total s = ${sig(s)}: ${top} gets ${sig(e[a])} ÷ ${sig(s)} = ${p3(p[a])}. The ${K} shares add up to 1, because each is its part of the one total s. ${cap(top)} has the biggest score, yet ${overHalf ? 'more' : 'less'} than half the probability${overHalf ? '' : ': the others share the rest'}.${sum > 0 && z[a] / sum <= 1 ? ` Dividing the scores themselves by their total would have given ${zText(z[a])} ÷ ${zText(sum)} = ${p3(z[a] / sum)}, a different answer: softmax works on e of the scores.` : ''}`,
    vars: vars(T),
    checkpoint: askInOrder(`Add ${SHIFT} to every score. What will happen to the probabilities?`, ADD_CHOICES, ADD_CHOICES[0]),
  });

  // 3: add 10 to every score.
  const zs = z.map((v) => v + SHIFT);
  const es = zs.map((v) => Math.exp(v / T));
  const ss = es.reduce((x, y) => x + y, 0);
  const ps = softmaxOf(zs, T);
  yield frame(K, [scores(zs, `Every score plus ${SHIFT}`, false), shares('The probabilities of the new scores', [classBars('e', ps, a, p3)]), tCurve(false), readouts([...es.map((v, i): Readout => ({ id: `e${i}`, label: `${CLASSES[i]}: e^(z/T)`, value: sig(v) })), { id: 's', label: 'their total s', value: sig(ss) }, ...probItems(ps)])], {
    line: 2,
    note: `With ${SHIFT} added, every e^(z/T) is e^(${SHIFT}/T) = ${sig(Math.exp(SHIFT / T))} times bigger, and so is their total, s = ${sig(ss)}: the factor cancels in each division, and the probabilities are what they were, ${top} ${p3(ps[a])}. Softmax only sees the gaps between scores. That is why code subtracts the largest score m first: the shares stay put, and the biggest power of e is e⁰ = 1.`,
    vars: vars(T),
    checkpoint: askInOrder(`Halve the temperature, from T = ${tText} to T = ${fmt(half, 3)}. What happens?`, halveChoices(top), halveChoices(top)[0]),
  });

  // 4: half the temperature.
  const ratio = (temp: number) => Math.exp((z[a] - z[b]) / temp);
  yield frame(K, [scores(z, 'Each class’s score (drag them)'), shares(`The probabilities at T = ${fmt(half, 3)}`, [classBars('e', pHalf, a, p3)]), tCurve(false), readouts([...probItems(pHalf), { id: 'before', label: `${top} at T = ${tText}`, value: p3(p[a]) }, { id: 'after', label: `${top} at T = ${fmt(half, 3)}`, value: p3(pHalf[a]), mark: 'key' }])], {
    line: 1,
    note: `At T = ${fmt(half, 3)}, ${top} has ${p3(pHalf[a])}, up from ${p3(p[a])}. Dividing by a smaller T stretches every gap between scores, and e turns a gap into a ratio: ${top} against ${second} was e^(${zText(z[a] - z[b])} ÷ ${tText}) = ${sig(ratio(T))} to 1, now ${sig(ratio(half))} to 1. The order never changes, because dividing by a positive T keeps it: ${top} stays on top, its lead sharpened.`,
    vars: vars(half),
    checkpoint: askInOrder(`Now let T grow huge, say T = ${BIG_T}. What do the probabilities tend to?`, HUGE_CHOICES, HUGE_CHOICES[0]),
  });

  // 5: a huge temperature.
  yield frame(K, [scores(z, 'Each class’s score (drag them)'), shares(`The probabilities at T = ${BIG_T}`, [classBars('e', pBig, a, p3)]), tCurve(true), readouts([...probItems(pBig), { id: 'at', label: `${top} at your T = ${tText}`, value: p3(p[a]), mark: 'key' }])], {
    line: 1,
    note: `At T = ${BIG_T} every score divided by T is close to 0, and e of anything close to 0 is close to 1, so the shares flatten towards 1/${K} each: ${CLASSES.map((c, i) => `${c} ${p3(pBig[i])}`).join(', ')}. The curve shows ${top}’s share at every T from ${T_MIN} to ${T_MAX}: high when T is small, falling towards the dashed line of equal shares as T grows. A language model samples its next word from a softmax like this, and its temperature setting is this T: low for safe, predictable text, high for surprising text.`,
    vars: vars(BIG_T),
    checkpoint: ask(
      `Back at T = 1, keep only ${top} and ${second}, scores ${zText(z[a])} and ${zText(z[b])}. What share does ${top} get?`,
      p3(sigmoid(z[a] - z[b])),
      [p3(softmaxOf(z)[a]), '0.5', ...(z[a] + z[b] > 0 && z[a] / (z[a] + z[b]) <= 1 ? [p3(z[a] / (z[a] + z[b]))] : [])],
    ),
  });

  // 6: two classes: the sigmoid.
  const gap = z[a] - z[b];
  const two = softmaxOf([z[a], z[b]]);
  const sigmoidPlane: PlanePart = {
    kind: 'plane',
    id: 'sigmoid',
    label: 'σ(gap): the sigmoid of logistic regression',
    x: { min: -6, max: 6, label: 'gap between the two scores' },
    y: { min: 0, max: 1 },
    equal: false,
    shapes: [
      { kind: 'path', id: 'sig', points: Array.from({ length: 61 }, (_, k): Vec => [round(-6 + k * 0.2, 2), round(sigmoid(-6 + k * 0.2), 2)]) },
      { kind: 'label', id: 'signame', at: [-4, 0.85], text: 'σ(x) = 1/(1 + e^−x)' },
      { kind: 'point', id: 'gap', at: [round(gap, 2), round(sigmoid(gap), 2)], mark: 'key', size: 'lg', label: `${top} vs ${second}` },
    ],
    handles: [],
  };
  yield frame(2, [scores(z, 'Each class’s score (drag them)'), shares(`Only ${top} and ${second}, at T = 1`, [classBars('e', CLASSES.map((_, i) => (i === a ? two[0] : i === b ? two[1] : 0)), a, p3)]), sigmoidPlane, readouts([{ id: 'gap', label: `gap ${top} − ${second}`, value: zText(gap) }, { id: 'two', label: `${top}’s share`, value: p3(two[0]), mark: 'key' }, { id: 'sig', label: 'σ(gap)', value: p3(sigmoid(gap)) }])], {
    line: 5,
    note: `With two classes, e^a/(e^a + e^b) = 1/(1 + e^−(a − b)): divide top and bottom by e^a. That is σ(a − b), the sigmoid of logistic regression, at the gap ${zText(gap)}: ${p3(two[0])}. Logistic regression is softmax with two classes, the second class’s score fixed at 0, so its one score z is the gap. Softmax is the same idea for any number of classes.`,
    vars: { a: z[a], b: z[b], gap: round(gap, 3) },
  });
}

// ───────────────────────────── story 2: the frames ─────────────────────────────

export const SHAPE_CHOICES = ['A straight line', 'A curve that bends round the points', 'A circle round each class'];
export const MEET_CHOICES = ['1/3 each', '1/2, 1/2 and 0', 'It depends on where the data are'];
export const DOUBLE_CHOICES = ['No: the same regions, with more extreme probabilities', 'Yes: each region grows towards its points', 'Yes: the boundaries turn'];

const REGION_TONES: readonly Tone[] = CLASS_TONES.slice(0, 3);
const SIZES = ['sm', 'md', 'lg'] as const;

function* regionsStory(seed: number, q: Vec): Generator<Frame<PlotState>> {
  const { points, models, losses } = train(seed);
  const W = models[STEPS];
  const P = meetingPoint(W);
  const W2 = scaled(W, 2);
  const pq = probsAt(W, q[0], q[1]);
  const pq2 = probsAt(W2, q[0], q[1]);
  const top = argmax(pq);
  const acc = accuracy(W, points);
  const n = points.length;

  const dataPlane = (model: Model | null, extra: Shape[] = []): PlanePart => {
    const shapes: Shape[] = [];
    if (model) shapes.push(regionHeatmap((x, y) => classAt(model, x, y), { kind: 'classes', tones: REGION_TONES }, { cols: 30, rows: 30 }));
    if (model && P) {
      for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
        const d = boundaryRay(model, i, j);
        shapes.push({ kind: 'path', id: `edge${i}${j}`, points: [[round(P[0], 2), round(P[1], 2)], [round(P[0] + 9 * d[0], 2), round(P[1] + 9 * d[1], 2)]], mark: 'key' });
      }
    }
    points.forEach((pt, i) => shapes.push({ kind: 'point', id: `p${i}`, at: [pt.x, pt.y], tone: REGION_TONES[pt.label], size: SIZES[pt.label] }));
    shapes.push(...extra, { kind: 'point', id: 'query', at: q, mark: 'key', size: 'lg', label: 'query' });
    return { kind: 'plane', id: 'plane', label: 'Three classes of points, and a query point (drag it)', ...DATA_BOX, equal: true, shapes, handles: [{ id: 'q', at: q, label: 'query point', mark: 'key', step: Q_STEP, min: [-Q_LIMIT, -Q_LIMIT], max: [Q_LIMIT, Q_LIMIT] }] };
  };
  const lossTop = Math.max(1.2, losses[0] * 1.1);
  const lossPlane = (upto: number): PlanePart => ({
    kind: 'plane',
    id: 'loss',
    label: 'Mean cross-entropy after each step',
    x: { min: 0, max: STEPS, label: 'step' },
    y: { min: 0, max: round(lossTop, 2), label: 'loss' },
    equal: false,
    shapes: upto > 0 ? [{ kind: 'path', id: 'loss', points: losses.slice(0, upto + 1).map((l, t): Vec => [t, round(l, 3)]), mark: 'key' }] : [{ kind: 'point', id: 'loss0', at: [0, round(losses[0], 3)], mark: 'key', size: 'md' }],
    handles: [],
  });
  const queryPlane = (ps: readonly number[], label: string): PlanePart => ({
    kind: 'plane',
    id: 'query',
    label,
    x: classAxis(REGION_CLASSES),
    y: { min: 0, max: 1, label: 'probability' },
    equal: false,
    shapes: [classBars('q', ps, argmax(ps), p3, REGION_TONES.map((tone) => ({ tone })))],
    handles: [],
  });
  const qText = `(${fmt(q[0], 2)}, ${fmt(q[1], 2)})`;
  const share = (ps: readonly number[]) => REGION_CLASSES.map((c, i) => `${c} ${p3(ps[i])}`).join(', ');
  const frame = (steps: number, parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { exps: steps * n * 3, steps } });
  const vars = (model: Model): Record<string, number> => Object.fromEntries(model.flatMap((w, k) => [[`w${REGION_CLASSES[k]}1`, round(w[0], 3)], [`w${REGION_CLASSES[k]}2`, round(w[1], 3)], [`b${REGION_CLASSES[k]}`, round(w[2], 3)]]));

  // 0: the data.
  yield frame(0, [dataPlane(null), readouts([{ id: 'n', label: 'points', value: String(n) }, { id: 'k', label: 'classes', value: '3' }, { id: 'q', label: 'query point', value: qText, mark: 'key' }])], {
    line: 0,
    note: `${n} points in three classes, ${REGION_CLASSES.join(', ')}, ${n / 3} of each. Softmax regression gives each class k its own score at a point (x, y), a line’s worth of numbers: z_k = w_k1·x + w_k2·y + b_k, two weights and a bias. Softmax turns the three scores into three probabilities, and the predicted class is the one with the biggest. Training starts every weight and bias at 0 and moves them by gradient descent on the mean cross-entropy, the mean of −ln p of each point’s true class.`,
    vars: vars(models[0]),
    checkpoint: ask('Every weight and bias starts at 0. What is the mean cross-entropy then?', p3(losses[0]), [p3(1 / 3), '0', p3(Math.LN2)]),
  });

  // 1: every weight 0.
  yield frame(0, [dataPlane(null), lossPlane(0), readouts([{ id: 'loss', label: 'mean cross-entropy', value: p3(losses[0]) }, { id: 'p', label: 'every class, everywhere', value: '1/3' }])], {
    line: 6,
    note: `With every weight and bias at 0, every class scores 0 everywhere, softmax gives each 1/3, and every point’s cross-entropy is −ln(1/3) = ln 3 = ${p3(losses[0])}. Each step of gradient descent moves the weights against the gradient, and each point pushes as in logistic regression: its own class’s score up, by 1 − p for that class, and every other class’s score down, by that class’s p.`,
    vars: vars(models[0]),
    checkpoint: askInOrder('After training, what shape will the boundary between two classes’ regions be?', SHAPE_CHOICES, SHAPE_CHOICES[0]),
  });

  // 2: trained.
  yield frame(STEPS, [dataPlane(W), lossPlane(STEPS), readouts([{ id: 'steps', label: 'steps', value: `${STEPS} at η = ${ETA}` }, { id: 'loss', label: 'mean cross-entropy', value: p3(losses[STEPS]) }, { id: 'acc', label: 'points classified right', value: `${Math.round(acc * n)} of ${n}` }])], {
    line: 7,
    note: `After ${STEPS} steps with η = ${ETA} the loss is down from ${p3(losses[0])} to ${p3(losses[STEPS])}, and ${Math.round(acc * n)} of the ${n} points sit in their own class’s region. Two classes’ regions meet where their scores tie, z_A = z_B: (w_A1 − w_B1)·x + (w_A2 − w_B2)·y + (b_A − b_B) = 0, the equation of a straight line. The three boundaries end where they run into each other.`,
    vars: vars(W),
    checkpoint: askInOrder('Where all three boundaries meet, what probability does each class get?', MEET_CHOICES, MEET_CHOICES[0]),
  });

  // 3: the meeting point, and the query.
  const meet = P ? probsAt(W, P[0], P[1]) : [1 / 3, 1 / 3, 1 / 3];
  const meetText = P ? `(${fmt(P[0], 2)}, ${fmt(P[1], 2)})` : 'nowhere';
  yield frame(STEPS, [dataPlane(W, P ? [{ kind: 'point', id: 'meet', at: [round(P[0], 2), round(P[1], 2)], mark: 'found', size: 'md', label: 'all tie' }] : []), queryPlane(pq, `The query point’s probabilities`), readouts([{ id: 'meet', label: 'where all three tie', value: meetText, mark: 'found' }, ...meet.map((v, i): Readout => ({ id: `m${i}`, label: `${REGION_CLASSES[i]} there`, value: p3(v) })), { id: 'q', label: 'query point', value: qText, mark: 'key' }])], {
    line: 5,
    note: `At ${meetText} all three scores are equal, so softmax gives each class e^z/(3e^z) = 1/3. Everywhere else one class leads. The query point ${qText} has scores ${list(scoresAt(W, q[0], q[1]), (v) => fmt(v, 2))}, so its probabilities are ${share(pq)}: class ${REGION_CLASSES[top]}. Drag it onto a boundary, and the two classes there get equal shares.`,
    vars: vars(W),
    checkpoint: askInOrder('Double every weight and bias. Will the regions change?', DOUBLE_CHOICES, DOUBLE_CHOICES[0]),
  });

  // 4: doubled.
  yield frame(STEPS, [dataPlane(W2), queryPlane(pq2, 'The query point’s probabilities, weights doubled'), readouts([{ id: 'before', label: `query: ${REGION_CLASSES[top]}, as trained`, value: p3(pq[top]) }, { id: 'after', label: `query: ${REGION_CLASSES[top]}, doubled`, value: p3(pq2[top]), mark: 'key' }, { id: 'loss2', label: 'mean cross-entropy, doubled', value: p3(modelLoss(W2, points)) }])], {
    line: 1,
    note: `Doubling every weight and bias doubles every score, the same as softmax at temperature T = 1/2. No boundary moves: a point’s scores keep their order, so every point keeps its class and the regions are the same. But off the boundaries the leading class’s probability rises everywhere: the query’s ${REGION_CLASSES[top]} goes from ${p3(pq[top])} to ${p3(pq2[top])}, with no new data and no better model. Softmax’s numbers sound like confidence, but nothing in it makes them match how often the model is right: that has to be checked on data.`,
    vars: vars(W2),
  });
}

// ───────────────────────────── story 3: the frames ─────────────────────────────

/** e^x written as m × 10^k, m with `digits` decimals (x may be far beyond any float). */
export function eToThe(x: number, digits = 2): string {
  const l = x * Math.LOG10E;
  let k = Math.floor(l);
  let m = round(10 ** (l - k), digits);
  if (m >= 10) {
    m = round(m / 10, digits);
    k += 1;
  }
  return `${fmt(m, digits)} × 10${superscript(k)}`;
}
export const expChoices = (big: number) => [`About ${eToThe(big, 0)}`, '∞', '0', 'NaN'];
export const DIVIDE_CHOICES = ['NaN', '1', '∞', '1/3'];
export const SHIFT_CHOICES = ['Yes: the same probabilities', 'No: the top class loses its lead', 'No: smaller scores give smaller probabilities'];
export const underChoices = (big: number) => ['0', `About ${eToThe(-big, 0)}`, '−∞', 'NaN'];
export const LN0_CHOICES = ['∞', `${LOSS_GAP}`, 'NaN', '0'];

/** The float32 bits of x, split into sign, exponent and fraction. */
function bitsPart(x: number, label: string): BitsPart {
  const pattern = (bitsOf(x) >>> 0).toString(2).padStart(32, '0');
  return {
    kind: 'bits',
    id: 'bits',
    label,
    bits: [...pattern].map((v, i) => ({ id: `bit${31 - i}`, value: v, mark: i >= 1 && i < 9 && pattern.slice(1, 9) === '11111111' ? ('reject' as const) : null })),
    fields: [
      { id: 'sign', label: 'sign', from: 0, to: 1, tone: 1 },
      { id: 'exponent', label: 'exponent', from: 1, to: 9, tone: 2 },
      { id: 'fraction', label: 'fraction', from: 9, to: 32, tone: 3 },
    ],
  };
}

const NAMES3 = ['class 1', 'class 2', 'class 3'];

function* overflowStory(big: number): Generator<Frame<PlotState>> {
  const z = overflowScores(big);
  const neg = z.map((v) => v - 2 * big);
  const naive = naive32(z);
  const safe = stable32(z);
  const under = naive32(neg);
  const lz = lossScores(big);
  const loss = loss32(lz, 2);
  const safeLoss = stable32(lz);
  const B = String(big);
  const shares = (label: string, ps: readonly number[], broken = false): PlanePart => ({
    kind: 'plane',
    id: 'shares',
    label,
    x: classAxis(NAMES3),
    y: { min: 0, max: 1, label: 'probability' },
    equal: false,
    shapes: ps.length ? [classBars('p', ps, null, show, ps.map(() => (broken ? { mark: 'reject' as const } : {})))] : [],
    handles: [],
  });
  const items = (name: string, vs: readonly number[], mark?: 'reject' | 'found'): Readout[] => vs.map((v, i) => ({ id: `${name}${i}`, label: `${NAMES3[i]}: ${name}`, value: show(v), ...(mark ? { mark } : {}) }));
  let exps = 0;
  const frame = (more: number, parts: PlotPart[], o: FrameOptions) => {
    exps += more;
    return plotFrame(parts, { ...o, stats: { exps, steps: 0 } });
  };
  const max32: Readout = { id: 'max', label: 'largest float32', value: `3.4 × 10³⁸ ≈ e^${fmt(LN_FLOAT32_MAX, 2)}` };

  // 0: big scores.
  yield frame(0, [shares('The probabilities: not worked out yet', []), readouts([...z.map((v, i): Readout => ({ id: `z${i}`, label: `${NAMES3[i]}: score`, value: String(v) })), max32])], {
    line: 0,
    note: `Scores can be big: here ${list(z, String)}. Code works in floats, and models are often trained in float32, whose largest number is about 3.4 × 10³⁸ = e^${fmt(LN_FLOAT32_MAX, 2)}. Compute softmax the naive way, e of each score first.`,
    vars: { m: big },
    checkpoint: askInOrder(`In float32, what does e^${B} come out as?`, expChoices(big), '∞'),
  });

  // 1: they overflow.
  yield frame(3, [shares('The probabilities: not worked out yet', []), bitsPart(naive.e[0], `float32 bits of e^${B}`), readouts([...items('e^z', naive.e, 'reject'), { id: 's', label: 'their total s', value: show(naive.s), mark: 'reject' }, max32])], {
    line: 3,
    note: `e^${B} is about ${eToThe(big)}, far past the largest float32, so it is rounded to infinity: the bit pattern with every exponent bit 1 and the fraction 0, as in the floating-point lesson. So are e^${big - 1} and e^${big - 2}, and their total s. The scores were fine; e to their power overflowed.`,
    vars: { m: big },
    checkpoint: askInOrder(`Now divide: what is ∞ ÷ ∞, ${NAMES3[0]}’s probability?`, DIVIDE_CHOICES, 'NaN'),
  });

  // 2: NaN.
  yield frame(0, [shares('The naive probabilities', naive.p, true), bitsPart(naive.p[0], 'float32 bits of ∞ ÷ ∞'), readouts([...items('p', naive.p, 'reject'), max32])], {
    line: 5,
    note: `∞ ÷ ∞ has no sensible value, so it is NaN, “not a number”: an exponent of all 1s with a fraction that isn’t 0. Every probability is NaN, and NaN spreads: the loss computed from it is NaN, its gradient too, and one step of training turns every weight into NaN.`,
    vars: { m: big },
    checkpoint: askInOrder(`Subtract the largest score, ${B}, from every score: [0, −1, −2]. Is softmax of these the same as softmax of ${list(z, String)}?`, SHIFT_CHOICES, SHIFT_CHOICES[0]),
  });

  // 3: subtract the largest score.
  yield frame(3, [shares('The probabilities, largest score subtracted first', safe.p), bitsPart(safe.e[0], 'float32 bits of e⁰ = 1'), readouts([...items('z − m', safe.shifted), ...items('e^(z − m)', safe.e), { id: 's', label: 'their total s', value: p3(safe.s) }, ...items('p', safe.p, 'found')])], {
    line: 3,
    note: `Yes: softmax uses only the gaps, so [0, −1, −2] gives the probabilities of ${list(z, String)}, those of [2, 1, 0]. Shifting every score by the same amount multiplies every e and their total by the same factor, which cancels. With m = ${B} subtracted the scores are [0, −1, −2], the biggest power is e⁰ = 1, and nothing can overflow: e of a score at most 0 is at most 1. s = ${p3(safe.s)}, and the probabilities are ${safe.p.map(p3).join(', ')}, as they should be.`,
    vars: { m: big },
    checkpoint: askInOrder(`Now scores far below 0: ${list(neg, (v) => fmt(v, 0))}. Done the naive way, what is e^−${B} in float32?`, underChoices(big), '0'),
  });

  // 4: very negative scores underflow.
  yield frame(6, [shares('The naive probabilities of the negative scores', under.p, true), bitsPart(under.e[0], `float32 bits of e^−${B}`), readouts([...items('e^z', under.e, 'reject'), { id: 's', label: 'their total s', value: show(under.s), mark: 'reject' }, ...items('p', under.p, 'reject')])], {
    line: 3,
    note: `e^−${B} is about ${eToThe(-big)}, far below the smallest float32 (about 1.4 × 10⁻⁴⁵), so it underflows to 0: every bit 0. So do the others, their total is 0, and 0 ÷ 0 is NaN again. Subtracting the largest score, −${B}, gives [0, −1, −2] once more, and the same safe probabilities. One trick handles both ends.`,
    vars: { m: -big },
    checkpoint: askInOrder(`Training needs the cross-entropy, −ln p of the true class. Say the scores are ${list(lz, String)} and the true class is ${NAMES3[2]}, ${LOSS_GAP} below the top. Safe softmax gives it p = e^−${LOSS_GAP}/s, which in float32 is 0. What is −ln p then?`, LN0_CHOICES, '∞'),
  });

  // 5: ln 0.
  yield frame(3, [shares('The safe probabilities of these scores', safeLoss.p), bitsPart(loss.fromP, `float32 bits of −ln p for ${NAMES3[2]}`), readouts([...items('p', safeLoss.p), { id: 'fromp', label: `−ln p, ${NAMES3[2]}`, value: show(loss.fromP), mark: 'reject' }])], {
    line: 6,
    note: `ln 0 is −∞, so −ln p = ∞: the loss is infinite and its gradient useless, all because p was rounded to 0 before its log was taken. There is no need to compute p first. −ln p_y = −ln(e^(z_y − m)/s) = ln s + m − z_y, the log-sum-exp form, where s = ${p3(safeLoss.s)} is the safe total.`,
    vars: { m: big, y: 3 },
    checkpoint: ask(`With log-sum-exp, −ln p₃ = ln ${p3(safeLoss.s)} + ${LOSS_GAP}. What is it?`, p3(loss.lse), [String(LOSS_GAP), p3(loss.lnS), '∞']),
  });

  // 6: log-sum-exp.
  yield frame(0, [shares('The safe probabilities of these scores', safeLoss.p), bitsPart(loss.lse, `float32 bits of ln s + m − z₃`), readouts([{ id: 'lns', label: 'ln s', value: p3(loss.lnS) }, { id: 'gap', label: 'm − z₃', value: String(LOSS_GAP) }, { id: 'lse', label: `−ln p, ${NAMES3[2]}`, value: p3(loss.lse), mark: 'found' }])], {
    line: 6,
    note: `ln ${p3(safeLoss.s)} = ${p3(loss.lnS)}, plus ${LOSS_GAP}: −ln p₃ = ${p3(loss.lse)}, a big loss, as it should be for a class the model all but ruled out, and finite, so training can learn from it. Libraries compute the cross-entropy straight from the scores this way, never from the probabilities.`,
    vars: { m: big, y: 3 },
  });
}

function* run(input: SoftmaxInput): Generator<Frame<PlotState>> {
  if (input.story === 'bars') yield* barsStory(input.logits, input.t);
  else if (input.story === 'regions') yield* regionsStory(input.seed, input.q);
  else yield* overflowStory(input.big);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const MAX_SEED = 4294967295;
const okSeed = (s: number) => Number.isInteger(s) && s >= 0 && s <= MAX_SEED;
const onGrid = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

export function parseSoftmax(text: string): { value: SoftmaxInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as Story;
  if (!STORIES.includes(story)) return { error: 'Start with bars, regions or overflow, e.g. bars 2 1.5 1 -0.5 T 1.' };
  const xs = numbersIn(text);
  if (story === 'bars') {
    if (xs.length !== K + 1) return { error: `Give ${K} scores (${CLASSES.join(', ')}) and a temperature, e.g. bars 2 1.5 1 -0.5 T 1.` };
    const logits = xs.slice(0, K).map((v) => round(v, 1));
    const t = xs[K];
    if (!xs.slice(0, K).every((v) => v >= Z_MIN && v <= Z_MAX && onGrid(v, Z_STEP))) return { error: `Each score is between ${Z_MIN} and ${Z_MAX}, with at most one decimal place.` };
    if (!uniqueTop(logits)) return { error: 'One class must have the biggest score on its own.' };
    if (!(t >= T_MIN && t <= T_MAX && onGrid(t, T_STEP))) return { error: `The temperature is ${T_MIN} to ${T_MAX}, in steps of ${T_STEP}.` };
    return { value: { story, logits, t } };
  }
  if (story === 'regions') {
    if (xs.length !== 3) return { error: 'Give a seed and the query point, e.g. regions seed 7 query 0.75 0.5.' };
    const [seed, x, y] = xs;
    if (!okSeed(seed)) return { error: 'The seed is a whole number, 0 or more.' };
    if (![x, y].every((v) => Math.abs(v) <= Q_LIMIT && onGrid(v, Q_STEP))) return { error: `The query point’s coordinates are −${Q_LIMIT} to ${Q_LIMIT}, in steps of ${Q_STEP}.` };
    return { value: { story, seed, q: [x, y] } };
  }
  if (xs.length !== 1 || !Number.isInteger(xs[0]) || xs[0] < BIG_MIN || xs[0] > BIG_MAX) return { error: `Give the largest score, a whole number from ${BIG_MIN} to ${BIG_MAX}, e.g. overflow 1000.` };
  return { value: { story, big: xs[0] } };
}

const plainNum = (v: number) => String(v);

export function formatSoftmax(input: SoftmaxInput): string {
  if (input.story === 'bars') return `bars ${input.logits.map(plainNum).join(' ')} T ${plainNum(input.t)}`;
  if (input.story === 'regions') return `regions seed ${input.seed} query ${plainNum(input.q[0])} ${plainNum(input.q[1])}`;
  return `overflow ${input.big}`;
}

export function dragSoftmax(input: SoftmaxInput, handle: string, to: Vec): SoftmaxInput {
  if (input.story === 'bars') {
    if (handle === 't') return { ...input, t: snap(to[0], T_STEP, T_MIN, T_MAX) };
    const k = /^z(\d)$/.exec(handle);
    if (!k) return input;
    const logits = input.logits.map((v, i) => (i === Number(k[1]) ? round(snap(to[1], Z_STEP, Z_MIN, Z_MAX), 1) : v));
    return uniqueTop(logits) ? { ...input, logits } : input;
  }
  if (input.story === 'regions' && handle === 'q') return { ...input, q: [snap(to[0], Q_STEP, -Q_LIMIT, Q_LIMIT), snap(to[1], Q_STEP, -Q_LIMIT, Q_LIMIT)] };
  return input;
}

const example = (id: string, label: string, make: (seed: number) => SoftmaxInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const softmax = defineAlgorithm<SoftmaxInput, PlotState>({
  kind: 'algorithm',
  slug: 'softmax',
  view: 'plot',
  input: {
    examples: [
      example('bars', 'Four scores, and a temperature', () => ({ story: 'bars', logits: [...DEFAULT_LOGITS], t: 1 })),
      example('regions', 'Three classes in the plane', (seed) => ({ story: 'regions', seed, q: DEFAULT_QUERY })),
      example('overflow', 'Scores in the thousands, in float32', () => ({ story: 'overflow', big: DEFAULT_BIG })),
    ],
    custom: {
      label: 'bars with 4 scores and T; regions with a seed and a query point; overflow with the largest score',
      placeholder: 'e.g. bars 2 1.5 1 -0.5 T 1, regions seed 7 query 0.75 0.5, or overflow 1000',
      parse: parseSoftmax,
      format: formatSoftmax,
    },
    drag: dragSoftmax,
  },
  pseudocode,
  stats: [
    { key: 'exps', label: 'Powers of e worked out' },
    { key: 'steps', label: 'Training steps' },
  ],
  legend: [
    { neutral: 'Scores and probabilities of the other classes' },
    { mark: 'key', label: 'The class the story follows; the query point; what you drag' },
    { mark: 'found', label: 'The point where all three boundaries meet; a safe result' },
    { mark: 'reject', label: 'A value that broke' },
    { tone: 1, label: 'Class A (small dots); the sign bit' },
    { tone: 2, label: 'Class B (middle dots); the exponent bits' },
    { tone: 3, label: 'Class C (large dots); the fraction bits' },
  ],
  run,
  content: {
    idea: 'A classifier gives every class a score. Softmax turns the scores into probabilities that add up to 1: e to the power of each score, divided by the total of those powers. Softmax regression learns a score for each class from the data, and a temperature and some care with very big or very small numbers complete the picture.',
    invariant: 'Adding the same number to every score changes no probability, so code subtracts the largest score first and nothing overflows. Dividing the scores by a temperature T > 0 never changes their order: small T sharpens towards the top class, large T flattens towards equal shares. With two classes, softmax of (a, b) is σ(a − b).',
    whenToUse: 'The last layer of almost every classifier with more than two classes, and of every language model choosing its next token. Train it on the cross-entropy computed by log-sum-exp from the scores, never from rounded probabilities.',
    traits: [
      { label: 'Probabilities that add up to 1', good: true },
      { label: 'Only the gaps between scores matter', good: null },
      { label: 'Boundaries between classes are straight lines', good: null },
      { label: 'Its numbers are not calibrated confidence', good: false },
    ],
    experiments: [
      { example: 'bars', prompt: 'Drag the temperature from 0.25 to 4. Does the top class ever change? Drag owl’s score up past cat’s.' },
      { example: 'regions', prompt: 'Drag the query point along a boundary, then across it. How do the two classes’ probabilities change?' },
      { example: 'overflow', prompt: 'Type overflow 104 and overflow 1000000. Does anything change in the safe probabilities?' },
    ],
  },
});

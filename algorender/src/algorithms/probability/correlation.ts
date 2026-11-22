import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Axis, Handle, ImagePart, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Covariance and correlation (B6 of the math and ML path). Lines through the
// means x̄ and ȳ split a scatter plot into four corners; each point's product
// (x − x̄)(y − ȳ) is a signed rectangle, positive up-right and down-left,
// negative in the other two. The covariance is the average product, which
// changes with the units; dividing by both spreads gives the correlation r,
// which doesn't. Centred, the two lists are vectors a and b, and r is the
// cosine of the angle between them: ±1 exactly when the points lie on a sloping
// line, whatever its slope. A ring or a U can have r = 0 despite a perfect pattern,
// and one far point can make a correlation out of nothing.
//
// Every average here divides by n, the number of points (as the random
// variables lesson did with equal chances 1/n).

// ───────────────────────────── the maths ─────────────────────────────

export type Story = 'quadrants' | 'cosine' | 'pattern' | 'outlier';
export type CorrInput = { story: Story; xs: number[]; ys: number[] };

/** Bounds for custom input and drags: coordinates on a 0.5 grid in [0, 10], and how many points each story takes. */
export const LIMITS = {
  coord: [0, 10],
  step: 0.5,
  points: { quadrants: [3, 10], cosine: [3, 6], pattern: [3, 12], outlier: [4, 10] },
} as const satisfies { coord: readonly [number, number]; step: number; points: Record<Story, readonly [number, number]> };

export const sum = (v: readonly number[]) => {
  let s = 0;
  for (const x of v) s += x;
  return s;
};
export const mean = (v: readonly number[]) => sum(v) / v.length;
/** Each value's gap from the mean: the centred list, which adds up to 0. */
export const centre = (v: readonly number[]) => {
  const m = mean(v);
  return v.map((x) => x - m);
};
/** Each point's product (x − x̄)(y − ȳ). */
export function products(xs: readonly number[], ys: readonly number[]): number[] {
  const [a, b] = [centre(xs), centre(ys)];
  return a.map((v, i) => v * b[i]);
}
export const dot = (u: readonly number[], v: readonly number[]) => sum(u.map((x, i) => x * v[i]));
export const norm = (u: readonly number[]) => Math.sqrt(dot(u, u));
/** The average product, dividing by n. */
export const covariance = (xs: readonly number[], ys: readonly number[]) => sum(products(xs, ys)) / xs.length;
/** The standard deviation of a list: the square root of its average squared gap from the mean (÷ n). */
export const spread = (v: readonly number[]) => Math.sqrt(sum(centre(v).map((d) => d * d)) / v.length);
/** r = cov / (sx · sy); NaN when either list has no spread. */
export const correlationOf = (xs: readonly number[], ys: readonly number[]) => covariance(xs, ys) / (spread(xs) * spread(ys));
/** The same r, as the cosine of the angle between the centred lists a and b. */
export const cosineOfCentred = (xs: readonly number[], ys: readonly number[]) => {
  const [a, b] = [centre(xs), centre(ys)];
  return dot(a, b) / (norm(a) * norm(b));
};
/** A list has spread when its values are not all the same. */
export const hasSpread = (v: readonly number[]) => v.some((x) => x !== v[0]);

export type Strength = 'Close to 1' | 'Close to 0' | 'Close to −1';
export const STRENGTHS: Strength[] = ['Close to 1', 'Close to 0', 'Close to −1'];
/** Which of the three a guess of r should pick; null in between, where asking would be unfair. */
export function strength(r: number): Strength | null {
  if (r >= 0.8) return 'Close to 1';
  if (r <= -0.8) return 'Close to −1';
  if (Math.abs(r) <= 0.15) return 'Close to 0';
  return null;
}

/** The sign of a total, with exact zero (a perfectly balanced cloud) as its own answer. */
export const signOf = (v: number) => (v > 0 ? 'Positive' : v < 0 ? 'Negative' : 'Zero');

/** The lines the cosine story moves the points onto: y − ȳ = k (x − x̄). */
export const STEEP = 2;
export const GENTLE = -0.5;
export const onLine = (xs: readonly number[], ys: readonly number[], k: number) => {
  const [mx, my] = [mean(xs), mean(ys)];
  return xs.map((x) => my + k * (x - mx));
};

/** Minutes per hour, for the change of units in the quadrants story. */
export const MINUTES = 60;

// ───────────────────────────── drawing ─────────────────────────────

const pseudocode = [
  'x̄ ← mean(x);  ȳ ← mean(y)',
  'p ← (x − x̄) · (y − ȳ)',
  'cov ← (Σ p) / n',
  'sx ← √(Σ (x − x̄)² / n); sy too',
  'r ← cov / (sx · sy)',
  'a ← x − x̄;  b ← y − ȳ',
  'r = a · b / (|a| |b|) = cos θ',
  'on a line b = k·a, so r = ±1',
];

const f3 = (v: number) => fmt(v, 3);
/** Three places, trailing zeros kept, so 2.160 sits beside 2.517 as the same precision. */
const f3z = (v: number) => round(v, 3).toFixed(3).replace('-', '−');
const signed = (v: number) => (v > 0 ? `+${f3(v)}` : f3(v));
const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const LO = LIMITS.coord[0] - 0.5;
const HI = LIMITS.coord[1] + 0.5;
const pair = (x: number, y: number) => `(${fmt(x)}, ${fmt(y)})`;
/** A list written out: (−3, −1, 0, 4). */
const tuple = (v: readonly number[]) => `(${v.map(f3).join(', ')})`;

type Labels = { x: string; y: string; what: string };
const LABELS: Record<Story, Labels> = {
  quadrants: { x: 'hours of revision', y: 'test score', what: 'students' },
  cosine: { x: 'x', y: 'y', what: 'points' },
  pattern: { x: 'x', y: 'y', what: 'points' },
  outlier: { x: 'x', y: 'y', what: 'points' },
};

type ScatterOpts = {
  label: string;
  means?: boolean;
  quadrants?: boolean;
  /** The points whose product rectangles are drawn. */
  rects?: readonly number[];
  current?: number | null;
  handles?: boolean;
  /** Only the first `upTo` points are shown (the outlier story's cloud). */
  upTo?: number;
  x?: Axis;
};

/** The scatter plot: points, the lines through the means, the four corners shaded ±, and product rectangles. */
function scatter(story: Story, xs: readonly number[], ys: readonly number[], o: ScatterOpts): PlanePart {
  const n = o.upTo ?? xs.length;
  const [px, py] = [xs.slice(0, n), ys.slice(0, n)];
  const [mx, my] = [mean(px), mean(py)];
  const [cx, cy] = [round(mx, 2), round(my, 2)];
  const lab = LABELS[story];
  const shapes: Shape[] = [];
  if (o.quadrants) {
    const box = (id: string, x0: number, x1: number, y0: number, y1: number, tone: 1 | 2): Shape => ({
      kind: 'path',
      id,
      points: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      closed: true,
      fill: true,
      fillOpacity: 0.07,
      faint: true,
      tone,
    });
    shapes.push(box('qTR', cx, HI, cy, HI, 1), box('qBL', LO, cx, LO, cy, 1), box('qTL', LO, cx, cy, HI, 2), box('qBR', cx, HI, LO, cy, 2));
    shapes.push(
      { kind: 'label', id: 'sTR', at: [HI - 0.4, HI - 0.5], text: '+' },
      { kind: 'label', id: 'sBL', at: [LO + 0.4, LO + 0.5], text: '+' },
      { kind: 'label', id: 'sTL', at: [LO + 0.4, HI - 0.5], text: '−' },
      { kind: 'label', id: 'sBR', at: [HI - 0.4, LO + 0.5], text: '−' },
    );
  }
  for (const i of o.rects ?? []) {
    const [x, y] = [px[i], py[i]];
    const p = (x - mx) * (y - my);
    if (Math.abs(x - mx) < 1e-9 || Math.abs(y - my) < 1e-9) continue;
    shapes.push({
      kind: 'path',
      id: `r${i}`,
      points: [
        [cx, cy],
        [x, cy],
        [x, y],
        [cx, y],
      ],
      closed: true,
      fill: true,
      fillOpacity: i === o.current ? 0.4 : 0.22,
      tone: p > 0 ? 1 : 2,
    });
    shapes.push({ kind: 'label', id: `rl${i}`, at: [round((cx + x) / 2, 2), round((cy + y) / 2, 2)], text: signed(p) });
  }
  if (o.means) {
    shapes.push({ kind: 'line', id: 'mx', through: [cx, 0], dir: [0, 1], mark: 'found', dashed: true, label: `x̄ = ${f3(mx)}` });
    shapes.push({ kind: 'line', id: 'my', through: [0, cy], dir: [1, 0], mark: 'found', dashed: true, label: `ȳ = ${f3(my)}` });
  }
  px.forEach((x, i) => shapes.push({ kind: 'point', id: `pt${i}`, at: [x, py[i]], size: 'md', mark: i === o.current ? 'key' : null, ...(i === o.current ? { label: pair(x, py[i]) } : {}) }));
  return {
    kind: 'plane',
    id: 'plane',
    label: o.label,
    x: o.x ?? { min: LO, max: HI, label: lab.x },
    y: { min: LO, max: HI, label: lab.y },
    equal: true,
    shapes,
    handles: o.handles === false ? [] : px.map((x, i): Handle => ({ id: `p${i}`, at: [x, py[i]], label: `${lab.what === 'students' ? 'Student' : 'Point'} ${i + 1}`, step: LIMITS.step, min: [LIMITS.coord[0], LIMITS.coord[0]], max: [LIMITS.coord[1], LIMITS.coord[1]], mark: 'key' })),
  };
}

/** A table of the lists, one row per point, coloured by sign. */
function table(columns: { name: string; values: readonly number[]; signed: boolean }[], current: number | null = null): ImagePart {
  const n = columns[0].values.length;
  const big = Math.max(1e-9, ...columns.filter((c) => c.signed).flatMap((c) => c.values.map(Math.abs)));
  const pixels: number[] = [];
  const values: string[] = [];
  for (let i = 0; i < n; i++)
    for (const c of columns) {
      pixels.push(c.signed ? round(c.values[i] / big, 4) : 0);
      values.push(f3(c.values[i]));
    }
  return {
    kind: 'image',
    id: 'table',
    label: `One row per point. Columns: ${columns.map((c) => c.name).join(', ')}`,
    width: columns.length,
    height: n,
    pixels,
    scale: 'signed',
    values,
    size: Math.min(220, 64 * columns.length),
    matrix: true,
    ...(current !== null && { boxes: [{ id: 'row', x: 0, y: current, w: columns.length, h: 1, mark: 'key' as const }] }),
  };
}

// ───────────────────────────── 1. the four corners ─────────────────────────────

function* quadrantsStory(xs: readonly number[], ys: readonly number[]): Generator<Frame<PlotState>> {
  const n = xs.length;
  const [mx, my] = [mean(xs), mean(ys)];
  const [a, b] = [centre(xs), centre(ys)];
  const p = products(xs, ys);
  const S = sum(p);
  const cov = S / n;
  const [sx, sy] = [spread(xs), spread(ys)];
  const r = cov / (sx * sy);
  const label = `${n} students: hours of revision across, test score up`;
  const minutesAxis: Axis = {
    min: LO,
    max: HI,
    label: 'minutes of revision',
    ticks: [0, 2, 4, 6, 8, 10].map((h) => ({ at: h, label: String(h * MINUTES) })),
  };
  const productQ = (i: number) =>
    ask(`Student ${i + 1} is at ${pair(xs[i], ys[i])}. What is their product (x − x̄)(y − ȳ)?`, f3(p[i]), [f3(xs[i] * ys[i]), f3(a[i] * ys[i]), f3(xs[i] * b[i]), f3(-p[i])]);

  yield plotFrame([scatter('quadrants', xs, ys, { label })], {
    line: 0,
    note: `Each point is a student: hours of revision across, test score up. Do the scores tend to rise with the hours? Start from the middle of the cloud: the mean hours x̄ = ${f3(mx)} and the mean score ȳ = ${f3(my)}. A point's gaps from them, x − x̄ and y − ȳ, say which way it sits from the middle.`,
    vars: { n, 'x̄': round(mx, 4), 'ȳ': round(my, 4) },
    checkpoint: askInOrder('A point below and to the left of the middle has x − x̄ < 0 and y − ȳ < 0. What is the sign of its product (x − x̄)(y − ȳ)?', ['Positive', 'Negative', 'Zero'], 'Positive'),
  });

  yield plotFrame([scatter('quadrants', xs, ys, { label, means: true, quadrants: true })], {
    line: 0,
    note: `The lines through x̄ and ȳ cut the plot into four corners. Up and to the right both gaps are positive, and down and to the left both are negative: either way the product (x − x̄)(y − ȳ) is positive (+). In the other two corners the gaps have opposite signs, so the product is negative (−).`,
    vars: { 'x̄': round(mx, 4), 'ȳ': round(my, 4) },
    checkpoint: productQ(0),
  });

  let total = 0;
  for (let i = 0; i < n; i++) {
    total += p[i];
    const where = Math.abs(p[i]) < 1e-12 ? 'on a line through the middle, so it adds nothing' : p[i] > 0 ? 'a + rectangle from the middle to the point' : 'a − rectangle from the middle to the point';
    yield plotFrame(
      [
        scatter('quadrants', xs, ys, { label, means: true, quadrants: true, rects: Array.from({ length: i + 1 }, (_, k) => k), current: i }),
        readouts([
          { id: 'product', label: `student ${i + 1}'s product`, value: f3(p[i]), mark: 'key' },
          { id: 'sum', label: 'Σ so far', value: f3(total), mark: 'found' },
        ]),
      ],
      {
        line: 1,
        note: `Student ${i + 1}, ${pair(xs[i], ys[i])}: x − x̄ = ${f3(a[i])} and y − ȳ = ${f3(b[i])}, so the product is ${f3(p[i])}, ${where}. Its area is the product's size.`,
        vars: { 'x − x̄': round(a[i], 4), 'y − ȳ': round(b[i], 4), p: round(p[i], 4), 'Σ p': round(total, 4) },
        checkpoint:
          i < n - 1
            ? productQ(i + 1)
            : ask(`The covariance is the average product: the total ÷ ${n}. What is it?`, f3(cov), [f3(S), f3(sum(p.map(Math.abs)) / n)]),
      },
    );
  }

  const all = Array.from({ length: n }, (_, k) => k);
  const lean = cov > 0 ? 'the + rectangles outweigh the − ones, so the scores tend to rise with the hours' : cov < 0 ? 'the − rectangles outweigh the + ones, so the scores tend to fall as the hours rise' : 'the + and − rectangles cancel exactly';
  yield plotFrame(
    [
      scatter('quadrants', xs, ys, { label, means: true, quadrants: true, rects: all }),
      readouts([
        { id: 'sum', label: 'Σ of the products', value: f3(S) },
        { id: 'cov', label: 'covariance', value: f3(cov), mark: 'found' },
      ]),
    ],
    {
      line: 2,
      note: `Covariance = ${f3(S)} ÷ ${n} = ${f3(cov)}: ${lean}. But a covariance carries units, hours × marks here, and its size depends on them.`,
      vars: { cov: round(cov, 4) },
      checkpoint: ask(`Measure the revision in minutes instead: every x − x̄ becomes ${MINUTES} times bigger. What is the covariance now?`, f3(MINUTES * cov), [f3(cov), f3(MINUTES * MINUTES * cov), f3(cov / MINUTES)]),
    },
  );

  const [vx, vy] = [sx * sx, sy * sy];
  yield plotFrame(
    [
      scatter('quadrants', xs, ys, { label: `The same ${n} students, revision in minutes`, means: true, quadrants: true, rects: all, x: minutesAxis }),
      readouts([
        { id: 'covH', label: 'covariance, in hours', value: f3(cov) },
        { id: 'covM', label: 'covariance, in minutes', value: f3(MINUTES * cov), mark: 'found' },
        { id: 'sx', label: 'sx, in minutes', value: f3z(MINUTES * sx) },
        { id: 'sy', label: 'sy', value: f3z(sy) },
      ]),
    ],
    {
      line: 3,
      note: `Same students, same picture, but the covariance is now ${f3(MINUTES * cov)}: on its own it can't say how strongly the two move together. So divide by how spread out each list is, its standard deviation: sx = √(Σ (x − x̄)² ÷ n) = ${f3z(sx)} hours, or ${f3z(MINUTES * sx)} minutes, and sy = ${f3z(sy)} marks.`,
      vars: { 'cov (minutes)': round(MINUTES * cov, 4), sx: round(sx, 4), sy: round(sy, 4) },
      checkpoint: ask('The correlation is r = cov ÷ (sx · sy). What is r, in minutes or in hours?', f3(r), [f3(cov / (vx * vy)), f3(MINUTES * r), f3(r / MINUTES)]),
    },
  );

  yield plotFrame(
    [
      scatter('quadrants', xs, ys, { label: `The same ${n} students, revision in minutes`, means: true, quadrants: true, rects: all, x: minutesAxis }),
      readouts([
        { id: 'covM', label: 'covariance, in minutes', value: f3(MINUTES * cov) },
        { id: 'sx', label: 'sx, in minutes', value: f3z(MINUTES * sx) },
        { id: 'sy', label: 'sy', value: f3z(sy) },
        { id: 'r', label: 'r, the correlation', value: f3(r), mark: 'found' },
      ]),
    ],
    {
      line: 4,
      note: `r = ${f3(cov)} ÷ (${f3z(sx)} × ${f3z(sy)}) = ${f3(r)} in hours, and in minutes the ${MINUTES}s on the top and the bottom cancel, giving the same ${f3(r)}. r has no units, and it always lies between −1 and 1.`,
      vars: { r: round(r, 4) },
    },
  );
}

// ───────────────────────────── 2. correlation is a cosine ─────────────────────────────

/** a along the horizontal and b at angle θ from it: two arrows from one point always lie in one flat plane. */
function vectorPlane(na: number, bVec: Vec, bLabel: string, theta: number | null): PlanePart {
  const L = round(Math.max(na, Math.hypot(bVec[0], bVec[1]), 1) * 1.2, 2);
  const shapes: Shape[] = [
    { kind: 'vector', id: 'a', from: [0, 0], to: [round(na, 2), 0], tone: 3, label: 'a' },
    { kind: 'vector', id: 'b', from: [0, 0], to: [round(bVec[0], 2), round(bVec[1], 2)], tone: 4, label: bLabel },
  ];
  if (theta !== null && theta > 0.02 && theta < Math.PI - 0.02) {
    const rad = L * 0.25;
    const arc: Vec[] = Array.from({ length: 13 }, (_, k) => [round(rad * Math.cos((theta * k) / 12), 2), round(rad * Math.sin((theta * k) / 12), 2)]);
    shapes.push({ kind: 'path', id: 'arc', points: arc, faint: true });
    shapes.push({ kind: 'label', id: 'theta', at: [round(rad * 1.5 * Math.cos(theta / 2), 2), round(rad * 1.5 * Math.sin(theta / 2), 2)], text: 'θ' });
    // b's shadow on a's line: |b| cos θ = a · b / |a|.
    shapes.push({ kind: 'path', id: 'shadow', points: [[round(bVec[0], 2), round(bVec[1], 2)], [round(bVec[0], 2), 0]], dashed: true, faint: true });
  }
  return {
    kind: 'plane',
    id: 'vectors',
    label: 'The centred lists as arrows, laid flat: a along the bottom, b at angle θ',
    x: { min: -L, max: L },
    y: { min: -L * 0.35, max: L },
    equal: true,
    shapes,
    handles: [],
  };
}

function linePlane(xs: readonly number[], ys: readonly number[], k: number): PlanePart {
  const lo = Math.min(LO, ...ys.map((y) => y - 0.5));
  const hi = Math.max(HI, ...ys.map((y) => y + 0.5));
  const [mx, my] = [mean(xs), mean(ys)];
  return {
    kind: 'plane',
    id: 'plane',
    label: `The same x values, moved onto a line of slope ${fmt(k)}`,
    x: { min: LO, max: HI, label: 'x' },
    y: { min: round(lo, 2), max: round(hi, 2), label: 'y' },
    equal: false,
    shapes: [
      { kind: 'line', id: 'mx', through: [round(mx, 2), 0], dir: [0, 1], mark: 'found', dashed: true },
      { kind: 'line', id: 'my', through: [0, round(my, 2)], dir: [1, 0], mark: 'found', dashed: true },
      { kind: 'line', id: 'fit', through: [round(mx, 2), round(my, 2)], dir: [1, k], dashed: true },
      ...xs.map((x, i): Shape => ({ kind: 'point', id: `pt${i}`, at: [x, round(ys[i], 2)], size: 'md' })),
    ],
    handles: [],
  };
}

function* cosineStory(xs: readonly number[], ys: readonly number[]): Generator<Frame<PlotState>> {
  const n = xs.length;
  const [mx, my] = [mean(xs), mean(ys)];
  const [a, b] = [centre(xs), centre(ys)];
  const p = products(xs, ys);
  const ab = sum(p);
  const [aa, bb] = [dot(a, a), dot(b, b)];
  const [na, nb] = [Math.sqrt(aa), Math.sqrt(bb)];
  const r = ab / (na * nb);
  const theta = Math.acos(Math.max(-1, Math.min(1, r)));
  const label = `${n} points`;
  const sc = (o: Partial<ScatterOpts> = {}) => scatter('cosine', xs, ys, { label, means: true, ...o });
  const raw = table([
    { name: 'x', values: xs, signed: false },
    { name: 'y', values: ys, signed: false },
  ]);
  const centred = table([
    { name: 'a = x − x̄', values: a, signed: true },
    { name: 'b = y − ȳ', values: b, signed: true },
  ]);
  const withP = table([
    { name: 'a = x − x̄', values: a, signed: true },
    { name: 'b = y − ȳ', values: b, signed: true },
    { name: 'a × b', values: p, signed: true },
  ]);
  const lengthQ = (name: 'a' | 'b', v: readonly number[], raw: readonly number[]) =>
    ask(`What is |${name}|, the length of ${name}?`, f3(norm(v)), [f3(dot(v, v)), f3(sum(v.map(Math.abs))), f3(norm(raw))]);
  const squares = (v: readonly number[]) => v.map((x) => f3(x * x)).join(' + ');

  yield plotFrame([sc(), raw], {
    line: 5,
    note: `A second way to see r. Centre each list by taking away its mean, x̄ = ${f3(mx)} and ȳ = ${f3(my)}: that gives a = x − x̄ and b = y − ȳ, two vectors with ${n} parts each, one part per point.`,
    vars: { n, 'x̄': round(mx, 4), 'ȳ': round(my, 4) },
    checkpoint: ask('What do the parts of a add up to?', '0', [f3(sum(xs)), f3(mx)]),
  });

  yield plotFrame([sc(), centred], {
    line: 5,
    note: `a = ${tuple(a)} and b = ${tuple(b)}. The gaps from a mean always add up to 0: the points sit evenly either side of the middle.`,
    vars: { 'Σ a': 0, 'Σ b': 0 },
    checkpoint: ask('What is a · b, their dot product?', f3(ab), [f3(dot(xs, ys)), f3(sum(p.map(Math.abs))), f3(ab / n)]),
  });

  yield plotFrame([sc({ quadrants: true, rects: Array.from({ length: n }, (_, k) => k) }), withP, readouts([{ id: 'ab', label: 'a · b', value: f3(ab), mark: 'found' }, { id: 'cov', label: 'covariance = a · b ÷ n', value: f3(ab / n) }])], {
    line: 6,
    note: `a · b = ${p.map(f3).join(' + ').replace(/\+ −/g, '− ')} = ${f3(ab)}: the dot product multiplies the matching parts, so its terms are exactly the points' products, the rectangles. Divided by n it is the covariance, ${f3(ab / n)}.`,
    vars: { 'a · b': round(ab, 4) },
    checkpoint: lengthQ('a', a, xs),
  });

  yield plotFrame([sc(), withP, readouts([{ id: 'ab', label: 'a · b', value: f3(ab) }, { id: 'na', label: '|a|', value: f3(na), mark: 'found' }])], {
    line: 6,
    note: `|a| = √(${squares(a)}) = √${f3(aa)} = ${f3(na)}, by Pythagoras. Divide the sum of squares by n before the square root and you get sx, the spread of the x values: |a| = √n · sx.`,
    vars: { '|a|': round(na, 4) },
    checkpoint: lengthQ('b', b, ys),
  });

  yield plotFrame([sc(), withP, readouts([{ id: 'ab', label: 'a · b', value: f3(ab) }, { id: 'na', label: '|a|', value: f3(na) }, { id: 'nb', label: '|b|', value: f3(nb), mark: 'found' }])], {
    line: 6,
    note: `|b| = √(${squares(b)}) = √${f3(bb)} = ${f3(nb)}. Now divide the dot product by both lengths, as cosine similarity does.`,
    vars: { '|b|': round(nb, 4) },
    checkpoint: ask('What is a · b ÷ (|a| |b|)?', f3(r), [f3(ab), f3(ab / (aa * bb)), f3(ab / aa)]),
  });

  yield plotFrame(
    [
      sc(),
      vectorPlane(na, [nb * Math.cos(theta), nb * Math.sin(theta)], 'b', theta),
      readouts([
        { id: 'cos', label: 'cos θ = a · b ÷ (|a| |b|)', value: f3(r), mark: 'found' },
        { id: 'r', label: 'r = cov ÷ (sx · sy)', value: f3(covariance(xs, ys) / (spread(xs) * spread(ys))) },
      ]),
    ],
    {
      line: 6,
      note: `${f3(ab)} ÷ (${f3(na)} × ${f3(nb)}) = ${f3(r)}: the cosine of the angle θ between a and b, drawn here, and it is r itself. a · b is n times the covariance and the lengths are √n times the spreads, so the n's cancel: a · b ÷ (|a| |b|) = cov ÷ (sx · sy).`,
      vars: { 'cos θ': round(r, 4) },
      checkpoint: ask(`Keep each x, but move every point onto the line y − ȳ = ${STEEP}(x − x̄), of slope ${STEEP}. What is r now?`, '1', [String(STEEP), String(1 / STEEP), f3(r)]),
    },
  );

  const steep = onLine(xs, ys, STEEP);
  yield plotFrame([linePlane(xs, steep, STEEP), vectorPlane(na, [STEEP * na, 0], `b = ${STEEP}a`, 0), readouts([{ id: 'r', label: 'r', value: '1', mark: 'found' }])], {
    line: 7,
    note: `On the line every gap y − ȳ is ${STEEP} times x − x̄, so b = ${STEEP}a: b points exactly along a, the angle is 0 and r = cos 0 = 1. The slope only stretches b; it doesn't turn it.`,
    vars: { r: 1 },
    checkpoint: ask(`Now move them onto y − ȳ = ${fmt(GENTLE)}(x − x̄), a gentle line going down. What is r?`, '−1', [fmt(GENTLE), fmt(-GENTLE), '0']),
  });

  const gentle = onLine(xs, ys, GENTLE);
  yield plotFrame([linePlane(xs, gentle, GENTLE), vectorPlane(na, [GENTLE * na, 0], `b = ${fmt(GENTLE)}a`, Math.PI), readouts([{ id: 'r', label: 'r', value: '−1', mark: 'found' }])], {
    line: 7,
    note: `Now b = ${fmt(GENTLE)}a points straight back along a: the angle is 180° and r = −1, however gentle the line. r is ±1 exactly when the points lie on a sloping line, and in between otherwise, since a cosine never goes past ±1. On a line the slope only sets the sign; with scatter, r compares the wobble around a line with how spread out the points are, so steepness alone can't push it to ±1.`,
    vars: { r: -1 },
  });
}

// ───────────────────────────── 3. a pattern with r = 0 ─────────────────────────────

function* patternStory(xs: readonly number[], ys: readonly number[]): Generator<Frame<PlotState>> {
  const n = xs.length;
  const [mx, my] = [mean(xs), mean(ys)];
  const p = products(xs, ys);
  const S = sum(p);
  const r = correlationOf(xs, ys);
  const label = `${n} points`;
  const guess = strength(r);
  const plus = sum(p.filter((v) => v > 0));
  const minus = sum(p.filter((v) => v < 0));

  yield plotFrame([scatter('pattern', xs, ys, { label })], {
    line: 0,
    note: `${n} points. Look at the shape they make, then predict their correlation r. Drag any point to change the shape.`,
    vars: { n },
    ...(guess && { checkpoint: askInOrder('What will r be?', STRENGTHS, guess) }),
  });

  // A total within a hair of 0 but not 0 would be unfair to ask about.
  const fair = S === 0 || Math.abs(r) >= 0.1;
  yield plotFrame([scatter('pattern', xs, ys, { label, means: true, quadrants: true })], {
    line: 0,
    note: `The middle of the cloud is (x̄, ȳ) = (${f3(mx)}, ${f3(my)}). Points in the + corners push r up, points in the − corners push it down, each by its product (x − x̄)(y − ȳ).`,
    vars: { 'x̄': round(mx, 4), 'ȳ': round(my, 4) },
    ...(fair && { checkpoint: askInOrder('Add up every point’s product (x − x̄)(y − ȳ). What is the sign of the total?', ['Positive', 'Negative', 'Zero'], signOf(S)) }),
  });

  const verdict =
    Math.abs(r) < 0.1
      ? `${S === 0 ? 'They cancel exactly' : 'They nearly cancel'}, so r = ${f3(r)}. r measures only how far the points lean along one straight line, up or down: a shape that falls then rises, or curls round, can have r near 0 however tightly the points follow it.`
      : `${S > 0 ? 'The + side wins' : 'The − side wins'}, so r = ${f3(r)}.`;
  yield plotFrame(
    [
      scatter('pattern', xs, ys, { label, means: true, quadrants: true, rects: Array.from({ length: n }, (_, k) => k) }),
      readouts([
        { id: 'plus', label: '+ rectangles', value: f3(plus), tone: 1 },
        { id: 'minus', label: '− rectangles', value: f3(minus), tone: 2 },
        { id: 'sum', label: 'Σ of the products', value: f3(S) },
        { id: 'r', label: 'r', value: f3(r), mark: 'found' },
      ]),
    ],
    {
      line: 4,
      note: `The + rectangles add up to ${f3(plus)} and the − ones to ${f3(minus)}. ${verdict}`,
      vars: { 'Σ p': round(S, 4), r: round(r, 4) },
    },
  );
}

// ───────────────────────────── 4. one far point ─────────────────────────────

function* outlierStory(xs: readonly number[], ys: readonly number[]): Generator<Frame<PlotState>> {
  const n = xs.length;
  const m = n - 1;
  const [cx, cy] = [xs.slice(0, m), ys.slice(0, m)];
  const r0 = correlationOf(cx, cy);
  const r1 = correlationOf(xs, ys);
  const [mx, my] = [mean(xs), mean(ys)];
  const p = products(xs, ys);
  const S = sum(p);
  const [ox, oy] = [xs[m], ys[m]];
  const guess = strength(r1);
  const label = (k: number) => `${k} points`;

  yield plotFrame([scatter('outlier', xs, ys, { label: label(m), upTo: m, means: true }), readouts([{ id: 'r0', label: `r for these ${m}`, value: f3(r0), mark: 'found' }])], {
    line: 4,
    note: `${m} points with r = ${f3(r0)}${Math.abs(r0) < 0.2 ? ': no straight-line lean to speak of' : ''}. Now one more point arrives, far from the rest, at ${pair(ox, oy)}.`,
    vars: { n: m, r: round(r0, 4) },
    ...(guess && { checkpoint: askInOrder(`With the point at ${pair(ox, oy)} added, what will r be?`, STRENGTHS, guess) }),
  });

  const pq = ask(
    `The middle is now (x̄, ȳ) = (${f3(mx)}, ${f3(my)}). What is the new point’s product (x − x̄)(y − ȳ)?`,
    f3(p[m]),
    [f3(ox * oy), f3((ox - mx) * oy), f3(-p[m])],
  );
  yield plotFrame([scatter('outlier', xs, ys, { label: label(n), means: true, quadrants: true, current: m }), readouts([{ id: 'r0', label: `r for the first ${m}`, value: f3(r0) }, { id: 'r1', label: `r for all ${n}`, value: f3(r1), mark: 'found' }])], {
    line: 4,
    note: `One point moved the middle to (${f3(mx)}, ${f3(my)}) and r from ${f3(r0)} to ${f3(r1)}.`,
    vars: { r: round(r1, 4) },
    ...(pq && { checkpoint: pq }),
  });

  const share = S === 0 ? 0 : (100 * p[m]) / S;
  yield plotFrame(
    [
      scatter('outlier', xs, ys, { label: label(n), means: true, quadrants: true, rects: Array.from({ length: n }, (_, k) => k), current: m }),
      readouts([
        { id: 'po', label: 'the far point’s product', value: f3(p[m]), mark: 'key' },
        { id: 'sum', label: 'Σ of all the products', value: f3(S) },
        { id: 'r1', label: 'r', value: f3(r1), mark: 'found' },
      ]),
    ],
    {
      line: 1,
      note: `Its rectangle is ${f3(p[m])}${S !== 0 ? `, ${fmt(share, 0)}% of the total ${f3(S)}` : ''}: its gaps are big in both directions, and their product bigger still. One point can make a correlation out of nothing, or swing one round, so always look at the scatter plot, not just r.`,
      vars: { 'far point’s p': round(p[m], 4), r: round(r1, 4) },
    },
  );
}

// ───────────────────────────── input ─────────────────────────────

function* run(input: CorrInput): Generator<Frame<PlotState>> {
  if (input.story === 'quadrants') yield* quadrantsStory(input.xs, input.ys);
  else if (input.story === 'cosine') yield* cosineStory(input.xs, input.ys);
  else if (input.story === 'pattern') yield* patternStory(input.xs, input.ys);
  else yield* outlierStory(input.xs, input.ys);
}

const STORIES: Story[] = ['quadrants', 'cosine', 'pattern', 'outlier'];
const onGrid = (v: number) => v >= LIMITS.coord[0] && v <= LIMITS.coord[1] && Math.abs(v / LIMITS.step - Math.round(v / LIMITS.step)) < 1e-9;

/** Why a set of points can't be used, or null. */
export function pointsError(story: Story, xs: readonly number[], ys: readonly number[]): string | null {
  const [lo, hi] = LIMITS.points[story];
  if (xs.length !== ys.length) return 'Give as many y values as x values.';
  if (xs.length < lo || xs.length > hi) return `The ${story} story takes ${lo} to ${hi} points.`;
  if (![...xs, ...ys].every(onGrid)) return `Each coordinate is from ${LIMITS.coord[0]} to ${LIMITS.coord[1]}, in steps of ${LIMITS.step}.`;
  if (!hasSpread(xs) || !hasSpread(ys)) return 'The x values must not all be the same, and nor must the y values: a list with no spread has no correlation.';
  if (story === 'outlier' && (!hasSpread(xs.slice(0, -1)) || !hasSpread(ys.slice(0, -1)))) return 'The points before the last one need some spread in x and in y too.';
  return null;
}

export function parseCorr(text: string): { value: CorrInput } | { error: string } {
  const story = STORIES.find((s) => s === (text.toLowerCase().match(/[a-z]+/) ?? [])[0]);
  if (!story) return { error: 'Start with quadrants, cosine, pattern or outlier.' };
  const [left, right] = text.split('|');
  if (right === undefined) return { error: `Give the x values, then | and the y values, e.g. ${story} 1 2 3 | 2 1 3.` };
  const [xs, ys] = [numbersIn(left), numbersIn(right)];
  const error = pointsError(story, xs, ys);
  return error ? { error } : { value: { story, xs, ys } };
}

export function formatCorr(input: CorrInput): string {
  return `${input.story} ${input.xs.join(' ')} | ${input.ys.join(' ')}`;
}

export function dragCorr(input: CorrInput, handle: string, to: readonly [number, number]): CorrInput {
  const i = Number(handle.slice(1));
  if (handle[0] !== 'p' || !Number.isInteger(i) || i < 0 || i >= input.xs.length) return input;
  const snap = (v: number) => round(Math.min(LIMITS.coord[1], Math.max(LIMITS.coord[0], Math.round(v / LIMITS.step) * LIMITS.step)), 6);
  const xs = input.xs.map((x, k) => (k === i ? snap(to[0]) : x));
  const ys = input.ys.map((y, k) => (k === i ? snap(to[1]) : y));
  return pointsError(input.story, xs, ys) ? input : { ...input, xs, ys };
}

/** The examples' points. */
export const DATA = {
  revision: { xs: [1, 2, 3, 5, 6, 7], ys: [3, 4, 7, 4, 8, 10] },
  cosine: { xs: [2, 4, 5, 9], ys: [6, 2, 4, 8] },
  ring: { xs: [4, 6, 8, 8, 6, 4, 2, 2], ys: [8, 8, 6, 4, 2, 2, 4, 6] },
  'u-shape': { xs: [1, 2, 3, 4, 5, 6, 7], ys: [9, 4, 1, 0, 1, 4, 9] },
  outlier: { xs: [1, 2, 2, 3, 3, 4, 9], ys: [2, 3, 1, 1, 3, 2, 9] },
} as const;

const example = (id: keyof typeof DATA, label: string, story: Story) => ({
  id,
  label,
  make: () => ({ story, xs: [...DATA[id].xs], ys: [...DATA[id].ys] }),
  sized: false,
});

export const correlation = defineAlgorithm<CorrInput, PlotState>({
  kind: 'algorithm',
  slug: 'correlation',
  view: 'plot',
  input: {
    examples: [
      example('revision', 'Revision and scores: the four corners', 'quadrants'),
      example('cosine', 'Correlation as a cosine', 'cosine'),
      example('ring', 'A ring', 'pattern'),
      example('u-shape', 'A U shape', 'pattern'),
      example('outlier', 'One far point', 'outlier'),
    ],
    custom: {
      label: 'quadrants, cosine, pattern or outlier, then the x values | the y values (0 to 10, in steps of 0.5)',
      placeholder: 'e.g. pattern 4 6 8 8 6 4 2 2 | 8 8 6 4 2 2 4 6',
      parse: parseCorr,
      format: formatCorr,
    },
    drag: dragCorr,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'A data point (drag it)' },
    { mark: 'found', label: 'The means x̄ and ȳ, and the result' },
    { mark: 'key', label: 'The point being worked on' },
    { tone: 1, label: '+ corner or product: both gaps the same sign' },
    { tone: 2, label: '− corner or product: the gaps of opposite signs' },
    { tone: 3, label: 'a, the centred x values as a vector' },
    { tone: 4, label: 'b, the centred y values as a vector' },
  ],
  run,
  content: {
    idea: 'Covariance and correlation measure how two quantities move together. Lines through the means split a scatter plot into four corners; each point’s product (x − x̄)(y − ȳ) is positive in two of them and negative in the other two, and the covariance is the average product. It changes with the units, so the correlation r divides it by both standard deviations: r = cov / (sx · sy). Centred, the two lists are vectors a and b, and r = a · b / (|a| |b|) is the cosine of the angle between them.',
    invariant: 'r always lies between −1 and 1, because it is a cosine; it is ±1 exactly when the points lie on a sloping line, whatever the slope (a flat line has no spread in y, so r isn’t defined). Multiplying either list by a positive number (hours to minutes) or adding a number to it leaves r alone, while the covariance scales with both; a negative factor flips r’s sign.',
    whenToUse: 'To ask whether two measurements lean together along a straight line: features that carry the same information, a prediction against the truth, two stocks. Always look at the scatter plot too: a curve can have r = 0, one far point can make r large, and neither says that one quantity causes the other.',
    traits: [
      { label: 'r has no units and lies between −1 and 1', good: true },
      { label: 'Measures straight-line lean only: a ring or a U can have r = 0', good: false },
      { label: 'One far point can make or break it', good: false },
    ],
    experiments: [
      { example: 'revision', prompt: 'Drag student 3 from the top-left corner to the top-right: their rectangle flips from − to +, and r climbs.' },
      { example: 'cosine', prompt: 'Predict |a| and |b| before they appear, then drag a point and watch the angle between a and b open or close.' },
      { example: 'ring', prompt: 'Drag the bottom point up into the middle: the ring is broken, but does r move far from 0?' },
      { example: 'u-shape', prompt: 'Drag the two left-hand points down to the bottom: the U becomes a rising curve, and r jumps.' },
      { example: 'outlier', prompt: 'Drag the far point to (9, 0): the same point now drags r below zero.' },
    ],
  },
});

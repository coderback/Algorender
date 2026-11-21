import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Densities and the normal distribution (B5 of the math and ML path). A
// measurement such as a wait can be any number, so no single value has a
// chance of its own: bars of chance shrink to nothing as the bins narrow.
// Divided by their widths they settle on a curve, the density, and a chance
// is an area under it. The area to the left of x is the CDF F(x), whose slope
// is the density. The normal curve, with its centre μ and spread σ, holds
// about 68%, 95% and 99.7% of its area within 1, 2 and 3σ, and samples drawn
// from any density pile up into its shape.
//
// Plotted heights are rounded to 4 decimals (not hundredths: a density 0.3
// tall would show steps), which still hides Math.exp's last-bit differences
// between Node and browsers.

// ───────────────────────────── the maths ─────────────────────────────

export const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** The normal density: e^(−(x − μ)²/(2σ²)) / (σ√(2π)). */
export const normalPdf = (x: number, mu = 0, sigma = 1) => {
  const z = (x - mu) / sigma;
  return Math.exp((-z * z) / 2) / (sigma * SQRT_2PI);
};

/** Simpson's rule for the standard normal's area from 0 to |z|, steps of at most 0.01 (error below 10⁻⁹). */
function areaFromCentre(t: number): number {
  const n = 2 * Math.max(8, Math.ceil(t / 0.02));
  const h = t / n;
  let s = normalPdf(0) + normalPdf(t);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * normalPdf(k * h);
  return (s * h) / 3;
}

/** Φ(z), the standard normal's area to the left of z. */
export function phi(z: number): number {
  if (z === 0) return 0.5;
  const area = areaFromCentre(Math.min(Math.abs(z), 9));
  return z > 0 ? 0.5 + area : 0.5 - area;
}

/** The normal CDF: the area to the left of x under the normal curve with centre μ and spread σ. */
export const normalCdf = (x: number, mu = 0, sigma = 1) => phi((x - mu) / sigma);

/** The share of a normal curve's area within k σ of its centre (the same for every μ and σ). */
export const withinSigmas = (k: number) => phi(k) - phi(-k);

/** The area under f from a to b by n rectangles, each as tall as f at its middle. */
export function midpointSum(f: (x: number) => number, a: number, b: number, n: number): number {
  const w = (b - a) / n;
  let s = 0;
  for (let k = 0; k < n; k++) s += f(a + (k + 0.5) * w) * w;
  return s;
}

export type DensityId = 'wait' | 'narrow' | 'normal' | 'mix';

export type Density = {
  /** Says what X is, for narration. */
  intro: string;
  /** What one unit of x is, singular (“per minute”). */
  unit: string;
  formula: string;
  f: (x: number) => number;
  F: (x: number) => number;
  /** One draw, from uniforms in [0, 1). */
  draw: (u: () => number) => number;
  x: Axis;
  y: Axis;
  /** Where f jumps (a uniform's edges), so curves and areas keep their corners. */
  breaks: readonly number[];
  /** The handles' step, the range of the interval's ends, and of the CDF story's x (clear of corners and flat tails). */
  step: number;
  lo: number;
  hi: number;
  cdf: readonly [number, number];
  /** The samples story's bin width and the interval whose share it follows. */
  bin: number;
  ref: readonly [number, number];
  /** Where the CDF story sweeps x before it reaches the learner's x. */
  stops: readonly [number, number, number];
};

/** Calls: 60% quick chats around 2.5 minutes (σ 0.8), 40% longer calls around 6.5 (σ 1.2). */
export const MIX = { share: 0.6, short: { mu: 2.5, sigma: 0.8 }, long: { mu: 6.5, sigma: 1.2 } } as const;

/** A draw from the standard normal by Box–Muller, from two uniforms. */
export const boxMuller = (u: () => number) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());

export const DENSITIES: Record<DensityId, Density> = {
  wait: {
    intro: 'X is the wait for a bus that comes at random moments, every 2 minutes on average, with density f(x) = ½e^(−x/2)',
    unit: 'minute',
    formula: '½e^(−x/2)',
    f: (x) => (x < 0 ? 0 : 0.5 * Math.exp(-x / 2)),
    F: (x) => (x < 0 ? 0 : 1 - Math.exp(-x / 2)),
    draw: (u) => -2 * Math.log(1 - u()),
    x: { min: 0, max: 10, label: 'wait (minutes)' },
    y: { min: 0, max: 0.6, label: 'density' },
    breaks: [0],
    step: 0.5,
    lo: 0,
    hi: 10,
    cdf: [0.5, 10],
    bin: 0.5,
    ref: [1, 3],
    stops: [1, 2, 4],
  },
  narrow: {
    intro: 'X is a reaction time, equally likely to be anywhere from 0 to 0.5 seconds, so its density is 2 on that stretch and 0 elsewhere',
    unit: 'second',
    formula: '2 on [0, 0.5]',
    f: (x) => (x >= 0 && x <= 0.5 ? 2 : 0),
    F: (x) => Math.min(1, Math.max(0, 2 * x)),
    draw: (u) => 0.5 * u(),
    x: { min: -0.25, max: 1, label: 'reaction time (s)' },
    y: { min: 0, max: 2.4, label: 'density' },
    breaks: [0, 0.5],
    step: 0.05,
    lo: 0,
    hi: 0.5,
    cdf: [0.05, 0.45],
    bin: 0.05,
    ref: [0.1, 0.3],
    stops: [0.1, 0.25, 0.4],
  },
  normal: {
    intro: 'X has the standard normal density, the bell curve centred on 0 with spread 1',
    unit: 'unit',
    formula: 'e^(−x²/2)/√(2π)',
    f: (x) => normalPdf(x),
    F: (x) => phi(x),
    draw: boxMuller,
    x: { min: -4, max: 4, label: 'x' },
    y: { min: 0, max: 0.5, label: 'density' },
    breaks: [],
    step: 0.25,
    lo: -3,
    hi: 3,
    cdf: [-3, 3],
    bin: 0.5,
    ref: [-1, 1],
    stops: [-2, -1, 0],
  },
  mix: {
    intro: 'X is how long a phone call lasts: most calls are quick chats of about 2.5 minutes, the rest longer calls of about 6.5, so the density has two humps',
    unit: 'minute',
    formula: 'two humps',
    f: (x) => MIX.share * normalPdf(x, MIX.short.mu, MIX.short.sigma) + (1 - MIX.share) * normalPdf(x, MIX.long.mu, MIX.long.sigma),
    F: (x) => MIX.share * normalCdf(x, MIX.short.mu, MIX.short.sigma) + (1 - MIX.share) * normalCdf(x, MIX.long.mu, MIX.long.sigma),
    draw: (u) => {
      const short = u() < MIX.share;
      const { mu, sigma } = short ? MIX.short : MIX.long;
      return mu + sigma * boxMuller(u);
    },
    x: { min: 0, max: 10, label: 'call length (minutes)' },
    y: { min: 0, max: 0.35, label: 'density' },
    breaks: [],
    step: 0.5,
    lo: 0,
    hi: 10,
    cdf: [0, 10],
    bin: 0.5,
    ref: [2, 4],
    stops: [1.5, 2.5, 4.5],
  },
};
export const DENSITY_IDS = Object.keys(DENSITIES) as DensityId[];

/** The chance of landing in each bin of this width, from `from` up to `to`. */
export function binChances(d: Density, width: number, from: number, to: number): number[] {
  const n = Math.round((to - from) / width);
  return Array.from({ length: n }, (_, k) => d.F(from + (k + 1) * width) - d.F(from + k * width));
}

/** The bars story's bin widths, in minutes: each half the one before. */
export const BAR_WIDTHS = [1, 0.5, 0.25] as const;

/** Seeded draws from a density. */
export function drawSamples(d: Density, seed: number, count: number): number[] {
  const u = createRng(seed);
  return Array.from({ length: count }, () => d.draw(u));
}

/** The samples story's sample sizes. */
export const SAMPLE_SIZES = [10, 100, 1000, 10000] as const;

export type Histogram = {
  n: number;
  /** How many of the samples land in each bin across the plane. */
  counts: number[];
  /** count ÷ (n × bin width) per bin across the plane. */
  heights: number[];
  /** The share of the samples inside the plane (the bars' total area). */
  inside: number;
  /** The share inside the density's reference interval. */
  share: number;
  /** The biggest gap between a bar and the bin's true height (its chance ÷ its width). */
  gap: number;
};

/** The density-scaled histogram of the first n samples. */
export function histogram(d: Density, samples: readonly number[], n: number): Histogram {
  const bins = Math.round((d.x.max - d.x.min) / d.bin);
  const counts = new Array<number>(bins).fill(0);
  let inRef = 0;
  for (const s of samples.slice(0, n)) {
    const k = Math.floor((s - d.x.min) / d.bin);
    if (k >= 0 && k < bins) counts[k]++;
    if (s >= d.ref[0] && s <= d.ref[1]) inRef++;
  }
  const truth = binChances(d, d.bin, d.x.min, d.x.max).map((p) => p / d.bin);
  const heights = counts.map((c) => c / (n * d.bin));
  return {
    n,
    counts,
    heights,
    inside: counts.reduce((s, c) => s + c, 0) / n,
    share: inRef / n,
    gap: Math.max(...heights.map((h, k) => Math.abs(h - truth[k]))),
  };
}

// ───────────────────────────── input ─────────────────────────────

export type DistInput =
  | { story: 'bars' }
  | { story: 'interval'; density: DensityId; a: number; b: number }
  | { story: 'cdf'; density: DensityId; x: number }
  | { story: 'normal'; mu: number; sigma: number }
  | { story: 'samples'; density: DensityId; seed: number };
export type Story = DistInput['story'];

export const MU_RANGE = { min: -1.5, max: 1.5, step: 0.5 } as const;
export const SIGMA_RANGE = { min: 0.5, max: 1.5, step: 0.25 } as const;

const pseudocode = [
  'bar = chance X lands in the bin',
  'height = chance ÷ bin width',
  'bins → 0: the tops trace a density f',
  'P(a ≤ X ≤ b) = area under f, a to b',
  'P(X = a) = 0: a line has no area',
  'F(x) = area left of x = P(X ≤ x)',
  'slope of F at x = f(x)',
  'f(x) = e^(−(x−μ)²/(2σ²)) / (σ√(2π))',
  'within 1σ, 2σ, 3σ: 68%, 95%, 99.7%',
  'bar = count ÷ (n × bin width)',
  'more samples: the bars close in on f',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });
const H = (v: number) => round(v, 4);

/** Points along f from `from` to `to`, keeping the corners where f jumps. */
function curve(d: Density, from: number, to: number, n = 160): Vec[] {
  const xs = Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
  const pts: Vec[] = [];
  const eps = 1e-9;
  for (const x of xs) {
    for (const b of d.breaks) {
      const last = pts.length ? pts[pts.length - 1][0] : -Infinity;
      if (b > last + eps && b < x - eps && b > from && b < to) pts.push([round(b, 4), H(d.f(b - eps))], [round(b, 4), H(d.f(b + eps))]);
    }
    pts.push([round(x, 4), H(d.f(x))]);
  }
  return pts;
}

/** The region under f from a to b, as a closed polygon. */
const region = (d: Density, a: number, b: number, n = 80): Vec[] => [[round(a, 4), 0], ...curve(d, a, b, n), [round(b, 4), 0]];

const area = (id: string, d: Density, a: number, b: number, paint: { mark?: 'found' | 'compare' }, label?: string): Shape => ({
  kind: 'path',
  id,
  points: region(d, a, b),
  closed: true,
  fill: true,
  fillOpacity: 0.35,
  ...paint,
  ...(label ? { label } : {}),
});

const stick = (id: string, x: number, y: number, label?: string): Shape => ({ kind: 'path', id, points: [[round(x, 4), 0], [round(x, 4), H(y)]], mark: 'reject', ...(label ? { label } : {}) });
const dashed = (id: string, x: number, y: number): Shape => ({ kind: 'path', id, points: [[round(x, 4), 0], [round(x, 4), H(y)]], dashed: true, faint: true });

// ───────────────────────────── story 1: from bars to a curve ─────────────────────────────

const WAIT = DENSITIES.wait;
const BARS_TO = 10;

function* barsStory(): Generator<Frame<PlotState>> {
  const d = WAIT;
  const chances = BAR_WIDTHS.map((w) => binChances(d, w, 0, BARS_TO));
  const total = chances[0].reduce((s, p) => s + p, 0);
  const [w1, w2, w3] = BAR_WIDTHS;
  const [p1, p2, p3] = chances.map((ps) => ps[0]);
  const bars = (k: 0 | 1 | 2, scaled: boolean, tone?: 1): Shape => ({
    kind: 'bars',
    id: `bars${k}`,
    bars: chances[k].map(
      (p, j): Bar => ({ id: `b${j}`, x0: round(j * BAR_WIDTHS[k], 4), x1: round((j + 1) * BAR_WIDTHS[k], 4), y: H(scaled ? p / BAR_WIDTHS[k] : p), ...(tone ? { tone } : {}) }),
    ),
  });
  const plane = (label: string, yLabel: string, shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'plane', label, x: d.x, y: { ...d.y, label: yLabel }, equal: false, shapes, handles: [] });
  const binLabel = (w: number) => `${fmt(w)}-minute bins`;
  const vars = { 'bin width': w1 };

  yield plotFrame(
    [
      plane(`Chances of a wait in ${binLabel(w1)}`, 'chance', [bars(0, false)]),
      readouts([
        { id: 'first', label: `P(0 ≤ X < ${fmt(w1)})`, value: fmt(p1, 3) },
        { id: 'total', label: 'all the bars together', value: fmt(total, 3) },
      ]),
    ],
    {
      line: 0,
      note: `A bus comes at random moments, every 2 minutes on average, so your wait X can be any amount of time, not just whole minutes. Group the waits into ${binLabel(w1)}: each bar is the chance of a wait in that bin, ${fmt(p1, 3)} for the first. The bars hold ${fmt(total, 3)}; the other ${fmt(1 - total, 3)} is waits over ${BARS_TO} minutes.`,
      vars,
      checkpoint: askInOrder(`Split every bin in two, ${fmt(w2)} minutes wide. What happens to the bars?`, ['They stay about as tall', 'They get about half as tall', 'They get about twice as tall'], 'They get about half as tall'),
    },
  );

  yield plotFrame(
    [
      plane(`Chances of a wait in ${binLabel(w2)}`, 'chance', [bars(1, false)]),
      readouts([
        { id: 'first', label: `P(0 ≤ X < ${fmt(w2)})`, value: fmt(p2, 3) },
        { id: 'second', label: `P(${fmt(w2)} ≤ X < ${fmt(w1)})`, value: fmt(chances[1][1], 3) },
        { id: 'total', label: 'all the bars together', value: fmt(total, 3) },
      ]),
    ],
    {
      line: 0,
      note: `Each bin's chance splits between its two halves: the first bar's ${fmt(p1, 3)} becomes ${fmt(p2, 3)} and ${fmt(chances[1][1], 3)}, a little more in the first half because shorter waits are likelier. The bars still add up to ${fmt(total, 3)}.`,
      vars: { 'bin width': w2 },
      checkpoint: askInOrder('Keep halving the bins, again and again. What does the chance of a wait in any one bin head towards?', ['Towards 0', 'It settles at a fixed size', 'Towards 1'], 'Towards 0'),
    },
  );

  yield plotFrame(
    [
      plane(`Chances of a wait in ${binLabel(w3)}`, 'chance', [bars(2, false)]),
      readouts([
        { id: 'first', label: `P(0 ≤ X < ${fmt(w3)})`, value: fmt(p3, 4) },
        { id: 'width', label: 'bin width', value: `${fmt(w3)} minutes` },
      ]),
    ],
    {
      line: 0,
      note: `Halved again: the first bar is down to ${fmt(p3, 4)}. Every halving takes each bar to about half its height, so a bin of width 0, one exact moment, would hold no chance at all. To keep something worth drawing, measure chance per minute instead: divide each bar by its width.`,
      vars: { 'bin width': w3 },
      checkpoint: ask(`Divide the first bar, ${fmt(p3, 4)}, by its width, ${fmt(w3)} minutes. How tall is it now?`, fmt(p3 / w3, 3), [fmt(p3 * w3, 4), fmt(w3 / p3, 3), fmt(p3, 4)]),
    },
  );

  yield plotFrame(
    [
      plane(`Chance per minute, ${binLabel(w3)}`, 'chance per minute', [bars(2, true)]),
      readouts([
        { id: 'first', label: `first bar: ${fmt(p3, 4)} ÷ ${fmt(w3)}`, value: fmt(p3 / w3, 3) },
        { id: 'area', label: 'its area, height × width', value: fmt(p3, 4) },
        { id: 'total', label: 'all the areas together', value: fmt(total, 3) },
      ]),
    ],
    {
      line: 1,
      note: `Divided by its width, the first bar stands ${fmt(p3 / w3, 3)} tall: that is chance per minute. Now a bar's area, height × width, is its chance (${fmt(p3 / w3, 3)} × ${fmt(w3)} = ${fmt(p3, 4)}), and the ${chances[2].length} areas add up to ${fmt(total, 3)} as before.`,
      vars: { 'bin width': w3 },
      checkpoint: askInOrder(`Divide the ${fmt(w1)}-minute bars by their width too. Next to these, how tall will they stand?`, ['About as tall', 'About 4 times taller', 'About 4 times shorter'], 'About as tall'),
    },
  );

  const firsts = chances.map((ps, k) => ps[0] / BAR_WIDTHS[k]);
  yield plotFrame(
    [
      plane('All three, as chance per minute', 'chance per minute', [bars(0, true, 1), bars(1, true, 1), bars(2, true)]),
      readouts(BAR_WIDTHS.map((w, k) => ({ id: `first${k}`, label: `first ${fmt(w)}-minute bar`, value: fmt(firsts[k], 3) }))),
    ],
    {
      line: 1,
      note: `Divided by their widths, all three sets of bars stand at much the same heights: from the widest bins to the narrowest, the first ones are ${fmt(firsts[0], 3)}, ${fmt(firsts[1], 3)} and ${fmt(firsts[2], 3)} tall. Narrower bins only trace the same shape more finely. Each halving lifts the first bar by less: by ${fmt(firsts[1] - firsts[0], 3)}, then by ${fmt(firsts[2] - firsts[1], 3)}.`,
      vars: { 'bin width': w3 },
      checkpoint: ask('Narrower and narrower, the bars’ tops close in on a smooth curve. How tall is that curve at a wait of 0?', fmt(d.f(0), 3), [fmt(firsts[2], 3), fmt(firsts[0], 3), '1']),
    },
  );

  yield plotFrame(
    [
      plane('The density of the wait', 'chance per minute', [bars(2, true, 1), { kind: 'path', id: 'f', points: curve(d, 0, BARS_TO), label: 'f(x)' }]),
      readouts([
        { id: 'f0', label: 'f(0)', value: fmt(d.f(0), 3) },
        { id: 'whole', label: 'area under the whole curve', value: '1' },
      ]),
    ],
    {
      line: 2,
      note: `The curve is the density of the wait, f(x) = ${d.formula}, ${fmt(d.f(0), 3)} tall at 0. Its height is chance per minute, the area under it between two waits is the chance of a wait in between, and the area under all of it is 1.`,
      vars: { 'f(0)': d.f(0) },
    },
  );
}

// ───────────────────────────── story 2: chance as area ─────────────────────────────

const intervalHandles = (d: Density, a: number, b: number): Handle[] => [
  { id: 'a', at: [a, 0], label: 'a, the left end', mark: 'key', step: d.step, min: [d.lo, 0], max: [round(b - d.step, 6), 0] },
  { id: 'b', at: [b, 0], label: 'b, the right end', mark: 'key', step: d.step, min: [round(a + d.step, 6), 0], max: [d.hi, 0] },
];

function* intervalStory(id: DensityId, a: number, b: number): Generator<Frame<PlotState>> {
  const d = DENSITIES[id];
  const P = d.F(b) - d.F(a);
  const m = (a + b) / 2;
  const w = b - a;
  const fm = d.f(m);
  const rect = fm * w;
  const ten = midpointSum(d.f, a, b, 10);
  const f: Shape = { kind: 'path', id: 'f', points: curve(d, d.x.min, d.x.max), label: 'f(x)' };
  const ends = (open = false): Shape[] => [
    { kind: 'path', id: 'span', points: [[a, 0], [b, 0]], mark: 'key' },
    { kind: 'point', id: 'pa', at: [a, 0], mark: 'key', label: 'a', size: open ? 'sm' : 'md' },
    { kind: 'point', id: 'pb', at: [b, 0], mark: 'key', label: 'b', size: open ? 'sm' : 'md' },
  ];
  const plane = (label: string, shapes: Shape[], handles = true): PlanePart => ({ kind: 'plane', id: 'plane', label, x: d.x, y: d.y, equal: false, shapes: [...shapes, f], handles: handles ? intervalHandles(d, a, b) : [] });
  const inside = area('inside', d, a, b, { mark: 'found' });
  const vars = { a, b };
  const ab = `a = ${fmt(a)} and b = ${fmt(b)}`;
  const tall = id === 'narrow' ? ' The curve is 2 tall, more than 1, and that is fine: a chance is an area, not a height, and the whole area is 2 × 0.5 = 1.' : '';

  yield plotFrame(
    [
      plane(`Between ${fmt(a)} and ${fmt(b)}`, [dashed('da', a, d.f(a)), dashed('db', b, d.f(b)), ...ends()]),
      readouts([
        { id: 'width', label: 'width b − a', value: fmt(w) },
        { id: 'm', label: 'middle m', value: fmt(m, 3) },
        { id: 'fm', label: 'f(m)', value: fmt(fm, 3) },
      ]),
    ],
    {
      line: 3,
      note: `${d.intro}. The chance that X lands between ${ab} is the area under the curve over that stretch. For a first estimate, take one rectangle as wide as the stretch and as tall as the curve at its middle, m = ${fmt(m, 3)}. Drag a and b to move the ends.`,
      vars,
      checkpoint: ask('What is that rectangle’s area, f(m) × (b − a)?', fmt(rect, 3), [fmt(fm, 3), fmt(fm / w, 3), fmt(d.f(a) * w, 3)]),
    },
  );

  yield plotFrame(
    [
      plane(`The area is the chance`, [
        { kind: 'path', id: 'rect', points: [[a, 0], [a, H(fm)], [b, H(fm)], [b, 0]], closed: true, fill: true, fillOpacity: 0.12, tone: 1, dashed: true },
        inside,
        ...ends(),
      ]),
      readouts([
        { id: 'rect', label: 'one rectangle', value: fmt(rect, 3), tone: 1 },
        { id: 'ten', label: 'ten thin rectangles', value: fmt(ten, 4) },
        { id: 'P', label: 'P(a ≤ X ≤ b), the exact area', value: fmt(P, 4), mark: 'found' },
      ]),
    ],
    {
      line: 3,
      note: `One rectangle gives f(m) × (b − a) = ${fmt(fm, 3)} × ${fmt(w)} = ${fmt(rect, 3)}. Ten thinner ones give ${fmt(ten, 4)}, and the exact area, where thinner and thinner rectangles settle, is P(a ≤ X ≤ b) = ${fmt(P, 4)}.${tall}`,
      vars,
      checkpoint: ask('Now drag b down onto a, so the stretch is the single value a. What is the chance that X is exactly a?', '0', [fmt(d.f(a), 3), fmt(P, 3)]),
    },
  );

  yield plotFrame(
    [plane('One value: no width, no area', [stick('fa', a, d.f(a), `f(a) = ${fmt(d.f(a), 3)}`), { kind: 'point', id: 'pa', at: [a, 0], mark: 'key', label: 'a' }], false), readouts([{ id: 'w', label: 'width', value: '0' }, { id: 'P', label: 'P(X = a), the area', value: '0', mark: 'found' }, { id: 'fa', label: 'f(a), a height', value: fmt(d.f(a), 3), mark: 'reject' }])],
    {
      line: 4,
      note: `Squeeze the stretch down to the single value a: no width, so no area. The chance of any one exact value is nil, however tall the curve is there. The height f(a) = ${fmt(d.f(a), 3)} is a density, a chance per ${d.unit}, not a chance.`,
      vars,
      checkpoint: askInOrder('So do the end points matter: how does P(a < X < b) compare with P(a ≤ X ≤ b)?', ['The same', 'Smaller, by f(a) + f(b)', 'Bigger, by f(a) + f(b)'], 'The same'),
    },
  );

  const outside = 1 - P;
  yield plotFrame(
    [plane(`a < X < b: the same area`, [inside, ...ends(true)]), readouts([{ id: 'P', label: 'P(a < X < b)', value: fmt(P, 4), mark: 'found' }, { id: 'Ple', label: 'P(a ≤ X ≤ b)', value: fmt(P, 4), mark: 'found' }])],
    {
      line: 4,
      note: `Leaving out the two ends takes away two lines, each with no area, so P(a < X < b) = P(a ≤ X ≤ b) = ${fmt(P, 4)}. For a measurement that can be any number, < and ≤ give the same chance.`,
      vars,
      checkpoint: ask('What is the chance that X lands outside the stretch, below a or above b?', fmt(outside, 3), [fmt(P, 3), fmt(d.F(a), 3), fmt(1 - d.F(b), 3)]),
    },
  );

  yield plotFrame(
    [
      plane('Outside the stretch', [area('left', d, d.x.min, a, { mark: 'compare' }), area('right', d, b, d.x.max, { mark: 'compare' }), inside, ...ends()]),
      readouts([
        { id: 'left', label: 'below a: F(a)', value: fmt(d.F(a), 4), mark: 'compare' },
        { id: 'right', label: 'above b', value: fmt(1 - d.F(b), 4), mark: 'compare' },
        { id: 'out', label: 'outside, 1 − P', value: fmt(outside, 4), mark: 'compare' },
        { id: 'P', label: 'inside, P', value: fmt(P, 4), mark: 'found' },
      ]),
    ],
    {
      line: 3,
      note: `Below a lies an area of ${fmt(d.F(a), 4)} and above b ${fmt(1 - d.F(b), 4)}: together ${fmt(outside, 4)}, which is 1 − ${fmt(P, 4)}. The whole area under a density is 1, so the inside and the outside share it.`,
      vars,
    },
  );
}

// ───────────────────────────── story 3: the CDF ─────────────────────────────

const CDF_Y: Axis = { min: 0, max: 1.1, label: 'F(x)' };

function* cdfStory(id: DensityId, x: number): Generator<Frame<PlotState>> {
  const d = DENSITIES[id];
  const n = 120;
  const xs = Array.from({ length: n + 1 }, (_, k) => d.x.min + ((d.x.max - d.x.min) * k) / n);
  const Fs = xs.map((v) => d.F(v));
  const Fpath = (upTo: number): Vec[] => [...xs.flatMap((v, k): Vec[] => (v <= upTo + 1e-9 ? [[round(v, 4), H(Fs[k])]] : [])), [round(upTo, 4), H(d.F(upTo))]];
  const f: Shape = { kind: 'path', id: 'f', points: curve(d, d.x.min, d.x.max), label: 'f(x)' };
  const handle: Handle = { id: 'x', at: [x, 0], label: 'x, where the area stops', mark: 'key', step: d.step, min: [d.cdf[0], 0], max: [d.cdf[1], 0] };
  const planes = (label: string, at: number, shapes: Shape[], cdfShapes: Shape[], withHandle: boolean): PlotPart[] => [
    { kind: 'plane', id: 'plane', label, x: d.x, y: d.y, equal: false, shapes: [...shapes, f, { kind: 'point', id: 'px', at: [at, 0], mark: 'key', label: 'x' }], handles: withHandle ? [handle] : [] },
    { kind: 'plane', id: 'cdf', label: 'F(x), the area to the left of x', x: d.x, y: CDF_Y, equal: false, shapes: cdfShapes, handles: [] },
  ];
  const [s0, s1, s2] = d.stops;
  const Fx = d.F(x);
  const fx = d.f(x);
  const dot = (at: number, key = false): Shape => ({ kind: 'point', id: 'Fdot', at: [round(at, 4), H(d.F(at))], ...(key ? { mark: 'key' as const } : { tone: 2 as const }), label: `F = ${fmt(d.F(at), 3)}` });
  const trail = (upTo: number): Shape => ({ kind: 'path', id: 'F', points: Fpath(upTo), tone: 2, label: 'F(x)' });
  const rise = d.F(s2) - d.F(s1);

  yield plotFrame([...planes(`Area to the left of ${fmt(s0)}`, s0, [area('left', d, d.x.min, s0, { mark: 'found' })], [dot(s0)], false), readouts([{ id: 'x', label: 'x', value: fmt(s0) }, { id: 'F', label: 'F(x) = P(X ≤ x)', value: fmt(d.F(s0), 3), mark: 'found' }])], {
    line: 5,
    note: `${d.intro}. Its cumulative distribution function F(x), the CDF, is the area under the density to the left of x: the chance P(X ≤ x). At x = ${fmt(s0)} that area is ${fmt(d.F(s0), 3)}. Slide x to the right and plot the area against x.`,
    vars: { x: s0 },
    checkpoint: askInOrder('As x moves right, can F(x) ever go down?', ['Yes, where the density falls', 'No, never'], 'No, never'),
  });

  yield plotFrame([...planes(`Area to the left of ${fmt(s1)}`, s1, [area('left', d, d.x.min, s1, { mark: 'found' })], [trail(s1), dot(s1)], false), readouts([{ id: 'x', label: 'x', value: fmt(s1) }, { id: 'F', label: 'F(x) = P(X ≤ x)', value: fmt(d.F(s1), 3), mark: 'found' }])], {
    line: 5,
    note: `At x = ${fmt(s1)} the area is ${fmt(d.F(s1), 3)}. Moving x right only ever adds area, and area is never negative, so F can rise or stay level but never fall.`,
    vars: { x: s1 },
    checkpoint: askInOrder('Where will F climb fastest?', ['Where the density is tallest', 'Where the density is falling', 'Where F is already near the top'], 'Where the density is tallest'),
  });

  yield plotFrame([...planes(`Area to the left of ${fmt(s2)}`, s2, [area('left', d, d.x.min, s2, { mark: 'found' })], [trail(s2), dot(s2)], false), readouts([{ id: 'x', label: 'x', value: fmt(s2) }, { id: 'F', label: 'F(x) = P(X ≤ x)', value: fmt(d.F(s2), 3), mark: 'found' }])], {
    line: 5,
    note: `From ${fmt(s1)} to ${fmt(s2)} the area grew by ${fmt(rise, 3)}, to ${fmt(d.F(s2), 3)}. Each step right adds a strip as tall as the density there, so F climbs steeply where the curve is high and barely moves where it is low.`,
    vars: { x: s2 },
    checkpoint: askInOrder('Far to the right, what does F(x) do?', ['It levels off at 1', 'It levels off at the density’s highest point', 'It keeps on growing'], 'It levels off at 1'),
  });

  const whole: Shape = { kind: 'path', id: 'F', points: Fpath(d.x.max), tone: 2, label: 'F(x)' };
  const xVars = { x, 'F(x)': round(Fx, 4) };
  yield plotFrame([...planes(`Area to the left of your x = ${fmt(x)}`, x, [area('left', d, d.x.min, x, { mark: 'found' })], [whole, dot(x, true)], true), readouts([{ id: 'x', label: 'x', value: fmt(x) }, { id: 'F', label: 'F(x) = P(X ≤ x)', value: fmt(Fx, 3), mark: 'found' }])], {
    line: 5,
    note: `Here is all of F. It starts at 0, and it flattens out at the total area under the density, which is 1, so F(x) is always a chance between 0 and 1. At your x = ${fmt(x)}, F(x) = ${fmt(Fx, 3)}: P(X ≤ ${fmt(x)}). Drag x to move it.`,
    vars: xVars,
    checkpoint: ask(`How steep is F at x = ${fmt(x)}: what is its slope there?`, fmt(fx, 3), [fmt(Fx, 3), fmt(1 - Fx, 3), ...(x > d.x.min ? [fmt(Fx / (x - d.x.min), 3)] : [])]),
  });

  const slope: Shape = { kind: 'line', id: 'tan', through: [x, H(Fx)], dir: [1, H(fx)], tone: 2, dashed: true, label: `slope ${fmt(fx, 3)}` };
  yield plotFrame(
    [
      ...planes('The slope of F is the density', x, [area('left', d, d.x.min, x, { mark: 'found' }), stick('fx', x, fx, `f(x) = ${fmt(fx, 3)}`)], [whole, slope, dot(x, true)], true),
      readouts([
        { id: 'F', label: 'F(x)', value: fmt(Fx, 3), mark: 'found' },
        { id: 'fx', label: 'f(x), the slope of F', value: fmt(fx, 3), mark: 'reject' },
      ]),
    ],
    {
      line: 6,
      note: `F's slope at x is the density there, f(${fmt(x)}) = ${fmt(fx, 3)}. Move x on by a tiny step and you add a strip about f(x) tall and one step wide, so F rises by about f(x) × step. This is the accumulated area of the integrals lesson, whose slope is the curve it adds up.`,
      vars: xVars,
      checkpoint: ask(`What is the chance that X is more than ${fmt(x)}?`, fmt(1 - Fx, 3), [fmt(Fx, 3), fmt(fx, 3), fmt(1 - fx, 3)]),
    },
  );

  yield plotFrame(
    [
      ...planes(`More than ${fmt(x)}`, x, [area('left', d, d.x.min, x, { mark: 'found' }), area('right', d, x, d.x.max, { mark: 'compare' })], [whole, dot(x, true)], true),
      readouts([
        { id: 'F', label: 'P(X ≤ x) = F(x)', value: fmt(Fx, 3), mark: 'found' },
        { id: 'R', label: 'P(X > x) = 1 − F(x)', value: fmt(1 - Fx, 3), mark: 'compare' },
      ]),
    ],
    {
      line: 5,
      note: `The rest of the area lies to the right: P(X > ${fmt(x)}) = 1 − F(x) = ${fmt(1 - Fx, 3)}. With F you never measure an area again: the chance of landing between a and b is F(b) − F(a).`,
      vars: xVars,
    },
  );
}

// ───────────────────────────── story 4: the normal curve ─────────────────────────────

const NX: Axis = { min: -6, max: 6, label: 'x' };
const NY: Axis = { min: 0, max: 0.85, label: 'density' };
/** The shares within 1, 2 and 3σ, measured. */
export const SHARES = [1, 2, 3].map(withinSigmas);

const normalDensity = (mu: number, sigma: number): Density => ({ ...DENSITIES.normal, f: (x) => normalPdf(x, mu, sigma), F: (x) => normalCdf(x, mu, sigma), x: NX, y: NY });

function* normalStory(mu: number, sigma: number): Generator<Frame<PlotState>> {
  const d = normalDensity(mu, sigma);
  const wide = normalDensity(mu, 2 * sigma);
  const peak = 1 / (sigma * SQRT_2PI);
  const f: Shape = { kind: 'path', id: 'f', points: curve(d, NX.min, NX.max, 200), label: `σ = ${fmt(sigma)}` };
  const g: Shape = { kind: 'path', id: 'g', points: curve(wide, NX.min, NX.max, 200), tone: 3, label: `σ = ${fmt(2 * sigma)}` };
  const handles: Handle[] = [
    { id: 'mu', at: [mu, 0], label: 'μ, the centre', mark: 'key', step: MU_RANGE.step, min: [MU_RANGE.min, 0], max: [MU_RANGE.max, 0] },
    { id: 'sigma', at: [mu + sigma, 0], label: 'μ + σ, the spread', mark: 'key', step: SIGMA_RANGE.step, min: [mu + SIGMA_RANGE.min, 0], max: [mu + SIGMA_RANGE.max, 0] },
  ];
  const marks: Shape[] = [
    { kind: 'path', id: 'sig', points: [[mu, H(d.f(mu + sigma))], [mu + sigma, H(d.f(mu + sigma))]], mark: 'key', label: 'σ' },
    { kind: 'point', id: 'pmu', at: [mu, 0], mark: 'key', label: 'μ' },
    { kind: 'point', id: 'psig', at: [mu + sigma, 0], mark: 'key' },
  ];
  const plane = (label: string, shapes: Shape[], ghost = false): PlanePart => ({ kind: 'plane', id: 'plane', label, x: NX, y: NY, equal: false, shapes: [...shapes, ...(ghost ? [g] : []), f, ...marks], handles });
  const band = (k: number, dd = d, s = sigma, id = `band${k}`): Shape => area(id, dd, mu - k * s, mu + k * s, { mark: 'found' }, `${fmt(withinSigmas(k), 4)}`);
  const vars = { μ: mu, σ: sigma };
  const share = (k: number) => fmt(SHARES[k - 1], 4);

  yield plotFrame([plane(`The normal curve, μ = ${fmt(mu)}, σ = ${fmt(sigma)}`, []), readouts([{ id: 'mu', label: 'μ', value: fmt(mu) }, { id: 'sigma', label: 'σ', value: fmt(sigma) }, { id: 'peak', label: 'peak 1/(σ√(2π))', value: fmt(peak, 3) }])], {
    line: 7,
    note: `The normal density with centre μ = ${fmt(mu)} and spread σ = ${fmt(sigma)} is f(x) = e^(−(x − μ)²/(2σ²)) / (σ√(2π)). At x = μ the power of e is 0 and e⁰ = 1, so the curve is tallest there, ${fmt(peak, 3)} tall; it is the same on both sides of μ, and σ sets how wide it is. Drag μ and μ + σ.`,
    vars,
    checkpoint: askInOrder(`Double σ to ${fmt(2 * sigma)}. What happens to the peak?`, ['It stays as tall', 'It halves', 'It quarters', 'It doubles'], 'It halves'),
  });

  yield plotFrame([plane(`σ = ${fmt(sigma)} and σ = ${fmt(2 * sigma)}`, [], true), readouts([{ id: 'peak', label: `peak, σ = ${fmt(sigma)}`, value: fmt(peak, 3) }, { id: 'peak2', label: `peak, σ = ${fmt(2 * sigma)}`, value: fmt(peak / 2, 3), tone: 3 }])], {
    line: 7,
    note: `With σ = ${fmt(2 * sigma)} the curve is twice as wide, and the peak 1/(σ√(2π)) falls from ${fmt(peak, 3)} to ${fmt(peak / 2, 3)}. It has to: the area under every density is 1, so a curve twice as wide is half as tall.`,
    vars,
    checkpoint: askInOrder('What share of the area lies within one σ of μ, between μ − σ and μ + σ?', ['About 0.5', 'About 0.68', 'About 0.95'], 'About 0.68'),
  });

  yield plotFrame([plane('Within 1σ of μ', [band(1)]), readouts([{ id: 's1', label: `between ${fmt(mu - sigma)} and ${fmt(mu + sigma)}`, value: share(1), mark: 'found' }])], {
    line: 8,
    note: `Between μ − σ = ${fmt(mu - sigma)} and μ + σ = ${fmt(mu + sigma)} lies an area of ${share(1)}: about 68% of the time X lands within one σ of its centre.`,
    vars,
    checkpoint: askInOrder('And within two σ of μ?', ['About 0.95', 'About 1.37, twice as much', 'All of it, 1'], 'About 0.95'),
  });

  yield plotFrame([plane('Within 2σ of μ', [band(2)]), readouts([{ id: 's2', label: `between ${fmt(mu - 2 * sigma)} and ${fmt(mu + 2 * sigma)}`, value: share(2), mark: 'found' }])], {
    line: 8,
    note: `Twice as far out, between ${fmt(mu - 2 * sigma)} and ${fmt(mu + 2 * sigma)}, lies ${share(2)} of the area. The second σ on each side adds less than the first, because the curve is lower there; a share can never pass 1.`,
    vars,
    checkpoint: askInOrder('And within three σ of μ?', ['About 0.997', 'All of it: the curve stops at 3σ'], 'About 0.997'),
  });

  yield plotFrame([plane('Within 3σ of μ', [band(3)]), readouts([{ id: 's3', label: `between ${fmt(mu - 3 * sigma)} and ${fmt(mu + 3 * sigma)}`, value: share(3), mark: 'found' }, { id: 'out', label: 'further out', value: fmt(1 - SHARES[2], 4) }])], {
    line: 8,
    note: `Within three σ lies ${share(3)} of the area. The curve never quite touches 0, so ${fmt(1 - SHARES[2], 4)} lies further out: rare, but possible.`,
    vars,
    checkpoint: askInOrder('Change μ and σ. Will these three shares change?', ['No: they are the same for every normal curve', 'Yes: a wider curve holds more within one σ'], 'No: they are the same for every normal curve'),
  });

  yield plotFrame(
    [
      plane(`Within 1σ, for σ = ${fmt(sigma)} and σ = ${fmt(2 * sigma)}`, [band(1, wide, 2 * sigma, 'wideband'), band(1)], true),
      readouts([
        { id: 's1', label: `σ = ${fmt(sigma)}: μ ± ${fmt(sigma)}`, value: fmt(normalCdf(mu + sigma, mu, sigma) - normalCdf(mu - sigma, mu, sigma), 4), mark: 'found' },
        { id: 's1w', label: `σ = ${fmt(2 * sigma)}: μ ± ${fmt(2 * sigma)}`, value: fmt(normalCdf(mu + 2 * sigma, mu, 2 * sigma) - normalCdf(mu - 2 * sigma, mu, 2 * sigma), 4), tone: 3 },
      ]),
    ],
    {
      line: 8,
      note: `The wider curve holds ${share(1)} within its own one σ, ${fmt(mu - 2 * sigma)} to ${fmt(mu + 2 * sigma)}, too: stretching a normal curve stretches its bands with it. That is the 68–95–99.7 rule, true of every normal curve. This bell turns up whenever many small independent effects add up, which is what the central limit theorem explains.`,
      vars,
    },
  );
}

// ───────────────────────────── story 5: samples pile up into the density ─────────────────────────────

/** Samples drawn per input (the most the story shows). */
export const MAX_SAMPLES = SAMPLE_SIZES[SAMPLE_SIZES.length - 1];

function* samplesStory(id: DensityId, seed: number): Generator<Frame<PlotState>> {
  const d = DENSITIES[id];
  const samples = drawSamples(d, seed, MAX_SAMPLES);
  const hists = SAMPLE_SIZES.map((n) => histogram(d, samples, n));
  const f: Shape = { kind: 'path', id: 'f', points: curve(d, d.x.min, d.x.max), label: 'f(x)' };
  const [lo, hi] = d.ref;
  const refArea = d.F(hi) - d.F(lo);
  const off = (h: Histogram) => Math.abs(h.share - refArea);
  const count = (n: number) => n.toLocaleString('en-GB').replace(/,/g, ' ');
  const frame = (k: number) => {
    const h = hists[k];
    const bars: Shape = { kind: 'bars', id: 'hist', bars: h.heights.map((y, j): Bar => ({ id: `b${j}`, x0: round(d.x.min + j * d.bin, 4), x1: round(d.x.min + (j + 1) * d.bin, 4), y: H(y), tone: 1 })) };
    const plane: PlanePart = { kind: 'plane', id: 'plane', label: `${count(h.n)} samples`, x: d.x, y: { ...d.y, label: 'count ÷ (n × width)' }, equal: false, shapes: [bars, f], handles: [] };
    return [
      plane,
      readouts([
        { id: 'n', label: 'samples n', value: count(h.n) },
        { id: 'total', label: 'total area of the bars', value: fmt(h.inside, 3), tone: 1 },
        { id: 'share', label: `share between ${fmt(lo)} and ${fmt(hi)}`, value: fmt(h.share, 3), tone: 1 },
        { id: 'area', label: `area between ${fmt(lo)} and ${fmt(hi)}`, value: fmt(refArea, 3), mark: 'found' },
        { id: 'gap', label: 'biggest gap, bar to curve', value: fmt(h.gap, 3) },
      ]),
    ];
  };
  const vars = (k: number) => ({ n: SAMPLE_SIZES[k], seed });
  // Questions whose answers come from the samples would mark a learner wrong on
  // an unlucky seed, so each one is fair for every seed: the bar question gives
  // its count, and the gap question asks what happens as a rule.
  const truth = binChances(d, d.bin, d.x.min, d.x.max);
  const top = truth.indexOf(Math.max(...truth));
  const [x0, x1] = [d.x.min + top * d.bin, d.x.min + (top + 1) * d.bin];
  const n2 = SAMPLE_SIZES[2];
  const c = hists[2].counts[top];
  const tall = c / (n2 * d.bin);
  const grew = hists[3].gap >= hists[2].gap;

  yield plotFrame(frame(0), {
    line: 9,
    note: `${d.intro}. Draw ${count(SAMPLE_SIZES[0])} values of X at random (seed ${seed}) and make a histogram, each bar count ÷ (n × bin width): a bar's area is then the share of the samples in its bin. With so few samples the bars are lumpy, and ${fmt(hists[0].share, 3)} of them land between ${fmt(lo)} and ${fmt(hi)}, where the curve's area is ${fmt(refArea, 3)}.`,
    vars: vars(0),
    checkpoint: askInOrder(`Draw ${count(SAMPLE_SIZES[1])} samples instead. What will the bars’ total area be?`, ['Still about 1', 'About 10 times bigger', 'About 10 times smaller'], 'Still about 1'),
  });

  yield plotFrame(frame(1), {
    line: 10,
    note: `With ${count(SAMPLE_SIZES[1])} samples, about ten times as many fall in each bin, but each bar is divided by n, so the total area stays ${fmt(hists[1].inside, 3)}. The share between ${fmt(lo)} and ${fmt(hi)} is ${fmt(hists[1].share, 3)}, against an area of ${fmt(refArea, 3)}.`,
    vars: vars(1),
    checkpoint: ask(`Draw ${count(n2)} samples. The bin from ${fmt(x0)} to ${fmt(x1)} will hold ${c} of them. How tall will its bar stand?`, fmt(tall, 3), [fmt(c / n2, 3), fmt((c * d.bin) / n2, 4), String(c)]),
  });

  yield plotFrame(frame(2), {
    line: 10,
    note: `With ${count(n2)} samples, the bin from ${fmt(x0)} to ${fmt(x1)} holds ${c}, so its bar stands ${c} ÷ (${count(n2)} × ${fmt(d.bin)}) = ${fmt(tall, 3)} tall. The share between ${fmt(lo)} and ${fmt(hi)} is ${fmt(hists[2].share, 3)}, off the area by ${fmt(off(hists[2]), 3)} (it was ${fmt(off(hists[1]), 3)}), and the bars hug the curve, the biggest gap down to ${fmt(hists[2].gap, 3)}.`,
    vars: vars(2),
    checkpoint: askInOrder(`Ten times as many samples again. As a rule, what happens to the biggest gap between a bar and the curve?`, ['It shrinks', 'It stays about the same', 'It grows'], 'It shrinks'),
  });

  yield plotFrame(frame(3), {
    line: 10,
    note: `With ${count(SAMPLE_SIZES[3])} samples the biggest gap is ${fmt(hists[3].gap, 3)} (it was ${fmt(hists[2].gap, 3)})${grew ? ': this time it grew a little, as chance now and then makes it, though over many draws the gaps shrink as n grows' : ''}, and the share is ${fmt(hists[3].share, 3)}, against ${fmt(refArea, 3)}. Shares of samples settle on areas under the density as n grows: the density is what a histogram of endless samples would look like.`,
    vars: vars(3),
  });
}

function* run(input: DistInput): Generator<Frame<PlotState>> {
  if (input.story === 'bars') yield* barsStory();
  else if (input.story === 'interval') yield* intervalStory(input.density, input.a, input.b);
  else if (input.story === 'cdf') yield* cdfStory(input.density, input.x);
  else if (input.story === 'normal') yield* normalStory(input.mu, input.sigma);
  else yield* samplesStory(input.density, input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;
const inRange = (v: number, d: Density, [lo, hi]: readonly [number, number] = [d.lo, d.hi]) => onStep(v, d.step) && v >= lo - 1e-9 && v <= hi + 1e-9;
const NAMES = DENSITY_IDS.join(', ');

export function parseDistributions(text: string): { value: DistInput } | { error: string } {
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const xs = numbersIn(text);
  const story = words[0];
  const density = DENSITY_IDS.find((id) => words.slice(1).includes(id));
  if (story === 'bars') return xs.length === 0 && words.length === 1 ? { value: { story: 'bars' } } : { error: 'The bars story takes nothing else: just bars.' };
  if (story === 'interval' || story === 'cdf' || story === 'samples') {
    if (!density) return { error: `Name the density: ${NAMES}, e.g. ${story} wait.` };
    const d = DENSITIES[density];
    const range = (lo = d.lo, hi = d.hi) => `multiples of ${fmt(d.step)} from ${fmt(lo)} to ${fmt(hi)}`;
    if (story === 'interval') {
      if (xs.length !== 2 || !xs.every((v) => inRange(v, d)) || !(xs[0] < xs[1])) return { error: `Give a < b, ${range()}, e.g. interval ${density} from ${plain(d.ref[0])} to ${plain(d.ref[1])}.` };
      return { value: { story, density, a: xs[0], b: xs[1] } };
    }
    if (story === 'cdf') {
      if (xs.length !== 1 || !inRange(xs[0], d, d.cdf)) return { error: `Give one x, ${range(...d.cdf)}, e.g. cdf ${density} at ${plain(d.stops[2])}.` };
      return { value: { story, density, x: xs[0] } };
    }
    if (xs.length !== 1 || !Number.isInteger(xs[0]) || xs[0] < 0) return { error: `Give a seed, a whole number, e.g. samples ${density} seed 7.` };
    return { value: { story, density, seed: xs[0] } };
  }
  if (story === 'normal') {
    const ok = (v: number, r: { min: number; max: number; step: number }) => onStep(v, r.step) && v >= r.min && v <= r.max;
    if (xs.length !== 2 || !ok(xs[0], MU_RANGE) || !ok(xs[1], SIGMA_RANGE)) return { error: `Give μ (halves from ${MU_RANGE.min} to ${MU_RANGE.max}) and σ (quarters from ${SIGMA_RANGE.min} to ${SIGMA_RANGE.max}), e.g. normal mu 0 sigma 1.` };
    return { value: { story, mu: xs[0], sigma: xs[1] } };
  }
  return { error: 'Start with bars, interval, cdf, normal or samples, e.g. interval wait from 1 to 3, cdf mix at 4.5, normal mu 0 sigma 1.' };
}

export function formatDistributions(input: DistInput): string {
  if (input.story === 'bars') return 'bars';
  if (input.story === 'interval') return `interval ${input.density} from ${plain(input.a)} to ${plain(input.b)}`;
  if (input.story === 'cdf') return `cdf ${input.density} at ${plain(input.x)}`;
  if (input.story === 'normal') return `normal mu ${plain(input.mu)} sigma ${plain(input.sigma)}`;
  return `samples ${input.density} seed ${input.seed}`;
}

export function dragDistributions(input: DistInput, handle: string, to: Vec): DistInput {
  if (input.story === 'interval') {
    const d = DENSITIES[input.density];
    if (handle === 'a') return { ...input, a: snap(to[0], d.step, d.lo, round(input.b - d.step, 6)) };
    return { ...input, b: snap(to[0], d.step, round(input.a + d.step, 6), d.hi) };
  }
  if (input.story === 'cdf') {
    const d = DENSITIES[input.density];
    return { ...input, x: snap(to[0], d.step, d.cdf[0], d.cdf[1]) };
  }
  if (input.story === 'normal') {
    if (handle === 'mu') return { ...input, mu: snap(to[0], MU_RANGE.step, MU_RANGE.min, MU_RANGE.max) };
    return { ...input, sigma: snap(to[0] - input.mu, SIGMA_RANGE.step, SIGMA_RANGE.min, SIGMA_RANGE.max) };
  }
  return input;
}

const example = (id: string, label: string, make: (seed: number) => DistInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const distributions = defineAlgorithm<DistInput, PlotState>({
  kind: 'algorithm',
  slug: 'distributions',
  view: 'plot',
  input: {
    examples: [
      example('bars', 'From bars to a curve: a bus wait', () => ({ story: 'bars' })),
      example('interval', 'Chance as area: a wait of 1 to 3 minutes', () => ({ story: 'interval', density: 'wait', a: 1, b: 3 })),
      example('tall', 'A density taller than 1', () => ({ story: 'interval', density: 'narrow', a: 0.1, b: 0.3 })),
      example('cdf', 'The CDF of a call’s length', () => ({ story: 'cdf', density: 'mix', x: 4.5 })),
      example('normal', 'The normal curve: 68–95–99.7', () => ({ story: 'normal', mu: 0, sigma: 1 })),
      example('samples', 'Samples pile up into the density', (seed) => ({ story: 'samples', density: 'mix', seed })),
    ],
    custom: {
      label: 'bars; interval <density> from a to b; cdf <density> at x; normal mu μ sigma σ; samples <density> seed n (densities: wait, narrow, normal, mix)',
      placeholder: 'e.g. interval normal from -1 to 1',
      parse: parseDistributions,
      format: formatDistributions,
    },
    drag: dragDistributions,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The density curve, and bars of chance' },
    { mark: 'key', label: 'What you drag: a, b, x, μ or μ + σ' },
    { mark: 'found', label: 'An area: the chance of landing there' },
    { mark: 'compare', label: 'The rest of the area: landing outside' },
    { mark: 'reject', label: 'A height f(a): a density, not a chance' },
    { tone: 1, label: 'An estimate: a rectangle, scaled bars, a histogram' },
    { tone: 2, label: 'The CDF F(x), and its slope' },
    { tone: 3, label: 'The normal curve with σ doubled' },
  ],
  run,
  content: {
    idea: 'A measurement that can be any number gives no single value a chance of its own: bars of chance shrink to nothing as the bins narrow. Divide each bar by its width and the tops settle on a curve, the density f. A chance is an area under it: P(a ≤ X ≤ b) is the area from a to b, and the area to the left of x is the CDF F(x), whose slope is f. The normal curve e^(−(x−μ)²/(2σ²))/(σ√(2π)) holds about 68%, 95% and 99.7% of its area within 1, 2 and 3σ of μ.',
    invariant: 'The whole area under a density is 1 and it is never negative, so F climbs from 0 to 1 and never falls. A density’s height is a chance per unit, so it can be above 1; a single value has chance 0, so < and ≤ give the same chance. Histograms scaled as count ÷ (n × width) always have area 1 and settle on the density as n grows.',
    whenToUse: 'Whenever a quantity is measured rather than counted: waiting times, heights, errors, the outputs of a model. Densities let you compute chances of ranges (F(b) − F(a)), compare data with a model, and they are what a generative model learns; the normal curve is the default model for noise, and what averages of many independent effects turn into.',
    traits: [
      { label: 'Chance = area, not height', good: null },
      { label: 'A density can be above 1', good: null },
      { label: 'F(x) = P(X ≤ x), its slope is f', good: true },
      { label: '68–95–99.7 holds for every normal curve', good: true },
      { label: 'Any one exact value has chance 0', good: null },
    ],
    experiments: [
      { example: 'bars', prompt: 'Before each halving, predict the first bar’s new height. Which bars keep their height once divided by the width?' },
      { example: 'interval', prompt: 'Drag b towards a. How does the area change, and what is it when they meet?' },
      { example: 'tall', prompt: 'This density is 2 tall. Drag a and b to cover all of [0, 0.5]: what is the area?' },
      { example: 'cdf', prompt: 'Drag x across the two humps. Where is F steepest, and where does it level off between them?' },
      { example: 'normal', prompt: 'Drag μ + σ out to σ = 1.5. Do the shares within 1, 2 and 3σ change?' },
      { example: 'samples', prompt: 'Press New values for another seed. Is the 10-sample histogram anything like the last one? Is the 10 000-sample one?' },
    ],
  },
});

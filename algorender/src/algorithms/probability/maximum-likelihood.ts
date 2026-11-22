import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, Handle, PlanePart, PlotPart, PlotState, Readout, Shape, TokensPart, Vec } from '@/viz/plot/types';
import { normalPdf } from './distributions';

// Maximum likelihood (B6 of the math and ML path). A model with a parameter
// gives the data a probability; read as a function of the parameter, that is
// the likelihood, and the best parameter is the one that makes the data most
// probable. Three stories: a coin's likelihood p^h(1 − p)^(n − h), which peaks
// at h/n, whose product underflows so we add logs instead (the log keeps the
// peak where it is), and whose negative average log is the cross-entropy; a
// normal bell with draggable μ and σ over eight measurements, each point's
// density a bar, the log-likelihood peaking at the mean and the root mean
// squared gap; and a line with normal noise, where the log-likelihood is a
// constant minus the squared error over 2σ², so the best line is the
// least-squares line whatever σ is.
//
// Plane coordinates: likelihoods of the coin are products of IEEE
// multiplications (the same in every engine) scaled into view; densities are
// rounded to 4 places and logs to hundredths, which hides the last-bit
// differences of Math.exp and Math.log between Node and browsers.

// ───────────────────────────── the maths ─────────────────────────────

export type MlInput =
  | { story: 'coin'; h: number; n: number; p: number }
  | { story: 'gaussian'; xs: number[]; mu: number; sigma: number }
  | { story: 'squared-error'; ys: number[]; left: number; right: number };
export type Story = MlInput['story'];

/** Bounds for custom input and drags. */
export const LIMITS = {
  n: [2, 12],
  p: [0.05, 0.95],
  pStep: 0.05,
  points: [3, 10],
  x: [0, 10],
  mu: [1, 9],
  sigma: [0.6, 4],
  normalStep: 0.1,
  lineCount: [4, 8],
  y: [0, 10],
  line: [-1, 11],
  lineStep: 0.25,
} as const;

/** The flips multiplied out in the underflow frame: at least this many. */
export const MANY_FLIPS = 5000;
/** The fixed spread of the noise in the squared-error story, and the wider one it is compared with. */
export const NOISE = 1;
export const WIDE_NOISE = 2;
/** The gap used to measure slopes, either side of the point. */
export const SLOPE_GAP = 0.001;

/** bᵉ by repeated multiplication: plain IEEE products, the same in every engine (Math.pow need not be). */
export function power(b: number, e: number): number {
  let r = 1;
  for (let i = 0; i < e; i++) r *= b;
  return r;
}

/** L(p) = pʰ(1 − p)ⁿ⁻ʰ: the chance of one particular run of n flips with h heads, if each flip is heads with chance p. */
export const coinLikelihood = (h: number, n: number, p: number) => power(p, h) * power(1 - p, n - h);
/** ln L(p) = h·ln p + (n − h)·ln(1 − p): the log of a product is the sum of the logs. */
export const coinLogLikelihood = (h: number, n: number, p: number) => h * Math.log(p) + (n - h) * Math.log(1 - p);
/** The cross-entropy of the model's chances (p, 1 − p) against the data's shares: −ln L / n. */
export const crossEntropy = (h: number, n: number, p: number) => -coinLogLikelihood(h, n, p) / n;
/** n choose k (exact for the small n here). */
export function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
}
/** A slope measured across a small gap either side of x. */
export const measuredSlope = (f: (x: number) => number, x: number, gap = SLOPE_GAP) => (f(x + gap) - f(x - gap)) / (2 * gap);

/** The flips in order, heads spread evenly through them (so the run doesn't depend on a seed). */
export function coinFlips(h: number, n: number): ('H' | 'T')[] {
  return Array.from({ length: n }, (_, i) => (Math.floor(((i + 1) * h) / n) > Math.floor((i * h) / n) ? 'H' : 'T'));
}

/** The many-flip run for the underflow frame: the same share of heads in at least MANY_FLIPS flips. */
export function manyFlips(h: number, n: number): { heads: number; flips: number } {
  const m = Math.ceil(MANY_FLIPS / n);
  return { heads: m * h, flips: m * n };
}

export const total = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
export const mean = (xs: readonly number[]) => total(xs) / xs.length;
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Halfway between the smallest and the largest. */
export const midrange = (xs: readonly number[]) => (Math.min(...xs) + Math.max(...xs)) / 2;
/** Σ (x − μ)², the squared gaps added up. */
export const squaredGaps = (xs: readonly number[], mu: number) => xs.reduce((s, x) => s + (x - mu) * (x - mu), 0);
/** The root mean squared gap from μ, dividing by n: the best σ for that μ. */
export const rmsGap = (xs: readonly number[], mu: number) => Math.sqrt(squaredGaps(xs, mu) / xs.length);
/** The same with n − 1, the "sample standard deviation" of a calculator. */
export const sampleSd = (xs: readonly number[]) => Math.sqrt(squaredGaps(xs, mean(xs)) / (xs.length - 1));
/** The average size of the gaps from the mean. */
export const meanAbsGap = (xs: readonly number[]) => total(xs.map((x) => Math.abs(x - mean(xs)))) / xs.length;

/** ln f(x) for the normal density: −ln(σ√(2π)) − (x − μ)²/(2σ²). */
export const logDensity = (x: number, mu: number, sigma: number) => -Math.log(sigma * Math.sqrt(2 * Math.PI)) - ((x - mu) * (x - mu)) / (2 * sigma * sigma);
/** ln L(μ, σ) = Σ ln f(xᵢ). */
export const gaussianLogLikelihood = (xs: readonly number[], mu: number, sigma: number) => total(xs.map((x) => logDensity(x, mu, sigma)));
/** The maximum-likelihood normal: the mean, and the root mean squared gap from it (÷ n). */
export const fitGaussian = (xs: readonly number[]) => ({ mu: mean(xs), sigma: rmsGap(xs, mean(xs)) });

/** The line through (0, left) and (k + 1, right), at x. */
export const lineAt = (ys: readonly number[], left: number, right: number, x: number) => left + ((right - left) * x) / (ys.length + 1);
/** yᵢ minus the line at xᵢ = i + 1. */
export const residuals = (ys: readonly number[], left: number, right: number) => ys.map((y, i) => y - lineAt(ys, left, right, i + 1));
/** ln L of the residuals under normal noise of spread σ: −n·ln(σ√(2π)) − Σ r²/(2σ²). */
export const noiseLogLikelihood = (rs: readonly number[], sigma: number) => -rs.length * Math.log(sigma * Math.sqrt(2 * Math.PI)) - squaredGaps(rs, 0) / (2 * sigma * sigma);
/** The least-squares line y = w·x + b through (i + 1, yᵢ). */
export function leastSquares(ys: readonly number[]): { w: number; b: number } {
  const xs = ys.map((_, i) => i + 1);
  const [mx, my] = [mean(xs), mean(ys)];
  const w = total(xs.map((x, i) => (x - mx) * (ys[i] - my))) / total(xs.map((x) => (x - mx) * (x - mx)));
  return { w, b: my - w * mx };
}

// ───────────────────────────── drawing ─────────────────────────────

const pseudocode = [
  'L(θ) ← P(data | θ)',
  'L(p) ← pʰ · (1 − p)ⁿ⁻ʰ',
  'best p ← the p with the largest L',
  'ln L ← h·ln p + (n − h)·ln(1 − p)',
  'at the peak: slope of ln L = 0',
  'cross-entropy ← −ln L / n',
  'f(x) ← e^(−(x − μ)²/2σ²) / (σ√2π)',
  'ln L ← Σ ln f(xᵢ)',
  'best μ ← Σ xᵢ / n',
  'best σ ← √(Σ (xᵢ − μ)² / n)',
  'rᵢ ← yᵢ − line(xᵢ)',
  'ln L ← C − Σ rᵢ² / (2σ²)',
  'max ln L  ⇔  min Σ rᵢ²',
];

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const f2 = (v: number) => fmt(v, 2);
const f3 = (v: number) => fmt(v, 3);
const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const SUPS: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (k: number) => String(k).replace(/[-\d]/g, (d) => SUPS[d]);

/** A small chance in a few significant figures: 0.000977, or 4.88 × 10⁻¹⁵ when it is tinier than 0.0001. */
export function chance(v: number): string {
  if (v === 0) return '0';
  if (v >= 1e-4) return String(Number(v.toPrecision(3)));
  const [m, e] = v.toExponential(2).split('e');
  return `${Number(m)} × 10${sup(Number(e))}`;
}

const dashedUp = (id: string, x: number, top: number, extra: Partial<Shape> = {}): Shape =>
  ({
    kind: 'path',
    id,
    points: [
      [x, 0],
      [x, top],
    ],
    dashed: true,
    ...extra,
  }) as Shape;

// ───────────────────────────── 1. a coin ─────────────────────────────

function* coinStory(h: number, n: number, p: number): Generator<Frame<PlotState>> {
  const best = h / n;
  const L = (q: number) => coinLikelihood(h, n, q);
  const lnL = (q: number) => coinLogLikelihood(h, n, q);
  // Scale L into view: 7 heads in 10 peaks at 0.00222, drawn as 2.22 thousandths.
  let e = 0;
  while (L(best) * power(10, e) < 1) e++;
  const scale = power(10, e);
  const sig = (v: number) => Number(v.toPrecision(6));
  const top = round(L(best) * scale * 1.3, 2);
  const pText = f2(p);
  const bestText = f2(best);
  const flips = coinFlips(h, n);
  const tokens = (): TokensPart => ({ kind: 'tokens', id: 'flips', label: `The ${n} flips: ${h} heads and ${n - h} tails`, tokens: flips.map((f, i) => ({ id: `f${i}`, text: f, ...(f === 'H' ? { tone: 1 as const } : {}) })) });
  const handle: Handle = { id: 'p', at: [p, 0], label: 'your guess p (drag it)', step: LIMITS.pStep, min: [LIMITS.p[0], 0], max: [LIMITS.p[1], 0], mark: 'key' };
  const grid = Array.from({ length: 9 }, (_, i) => (i + 1) / 10);
  const gridSum = total(grid.map(L));

  const likePlane = (o: { point?: boolean; curve?: boolean; peak?: boolean; stems?: boolean } = {}): PlanePart => ({
    kind: 'plane',
    id: 'like',
    label: `The likelihood L(p) of these flips, for each chance of heads p`,
    x: { min: 0, max: 1, label: 'p, the chance of heads' },
    y: { min: 0, max: top, label: `L(p) × ${commas(scale)}` },
    equal: false,
    shapes: [
      ...(o.curve ? [{ kind: 'path', id: 'L', points: Array.from({ length: 99 }, (_, i): Vec => [(i + 1) / 100, sig(L((i + 1) / 100) * scale)]) } as Shape] : []),
      ...(o.stems ? [{ kind: 'bars', id: 'stems', bars: grid.map((q, i): Bar => ({ id: `s${i}`, x0: q - 0.012, x1: q + 0.012, y: sig(L(q) * scale), tone: 2 })) } as Shape] : []),
      ...(o.peak ? [dashedUp('peakLine', best, sig(L(best) * scale), { mark: 'found' }), { kind: 'point', id: 'peak', at: [best, sig(L(best) * scale)], mark: 'found', label: `p = ${bestText}` } as Shape] : []),
      ...(o.point ? [dashedUp('guessLine', p, sig(L(p) * scale), { mark: 'key' }), { kind: 'point', id: 'guess', at: [p, sig(L(p) * scale)], mark: 'key' } as Shape] : []),
    ],
    handles: [handle],
  });

  // The log curve from 0.05 to 0.95, where the logs stay in view.
  const logPts = Array.from({ length: 91 }, (_, i): Vec => [round(0.05 + i / 100, 2), round(lnL(0.05 + i / 100), 2)]);
  const logLow = Math.floor(Math.min(...logPts.map((q) => q[1])));
  const logPlane = (o: { point?: boolean; peak?: boolean; tangents?: boolean } = {}): PlanePart => {
    const sGuess = measuredSlope(lnL, p);
    const sBest = measuredSlope(lnL, best);
    return {
      kind: 'plane',
      id: 'log',
      label: 'The log-likelihood ln L(p)',
      x: { min: 0, max: 1, label: 'p, the chance of heads' },
      y: { min: logLow, max: Math.ceil(lnL(best)) + 1, label: 'ln L(p)' },
      equal: false,
      shapes: [
        { kind: 'path', id: 'lnL', points: logPts, tone: 2 },
        ...(o.peak ? [{ kind: 'point', id: 'logPeak', at: [best, round(lnL(best), 2)], mark: 'found', label: `p = ${bestText}` } as Shape] : []),
        ...(o.point ? [{ kind: 'point', id: 'logGuess', at: [p, round(lnL(p), 2)], mark: 'key' } as Shape] : []),
        ...(o.tangents
          ? [
              { kind: 'line', id: 'tanGuess', through: [p, round(lnL(p), 2)], dir: [1, round(sGuess, 4)], mark: 'key', dashed: true } as Shape,
              { kind: 'line', id: 'tanBest', through: [best, round(lnL(best), 2)], dir: [1, round(sBest, 4)], mark: 'found', dashed: true } as Shape,
            ]
          : []),
      ],
      handles: [],
    };
  };

  const big = manyFlips(h, n);
  const bigProduct = power(best, big.heads) * power(1 - best, big.flips - big.heads);
  const bigLog = coinLogLikelihood(big.heads, big.flips, best);
  const slopeGuess = h / p - (n - h) / (1 - p);
  const sign = Math.abs(p - best) < 1e-9 ? 'Flat: about 0' : slopeGuess > 0 ? 'Uphill: positive' : 'Downhill: negative';

  yield plotFrame([tokens(), likePlane()], {
    line: 0,
    note: `A coin was flipped ${n} times and came up heads ${h} time${h === 1 ? '' : 's'}. Model it as a coin that lands heads with some chance p, each flip on its own. For each p the model gives these exact flips a chance, the likelihood L(p): the chance of the data, read as a function of p. Drag your guess p along the axis.`,
    vars: { h, n, p },
    checkpoint: ask(
      `The flips are independent, so their chances multiply. If p were ${pText}, what is the chance of exactly these ${n} flips, in this order?`,
      chance(L(p)),
      [chance(choose(n, h) * L(p)), chance(power(p, h)), chance(power(p, h) + power(1 - p, n - h))],
    ),
  });

  yield plotFrame([tokens(), likePlane({ point: true })], {
    line: 1,
    note: `Each head has chance ${pText} and each tail ${f2(1 - p)}, so L(${pText}) = ${pText}${sup(h)} × ${f2(1 - p)}${sup(n - h)} = ${chance(L(p))}: one point on the curve of L. The chart shows L × ${commas(scale)}, since every L here is small.`,
    vars: { p, 'L(p)': L(p) },
    checkpoint: ask(`Which chance of heads p makes these ${n} flips most likely, giving the biggest L(p)?`, bestText, ['0.5', f2(1 - best), '1']),
  });

  yield plotFrame([tokens(), likePlane({ point: true, curve: true, peak: true }), readouts([{ id: 'guess', label: `L(${pText})`, value: chance(L(p)), mark: 'key' }, { id: 'best', label: `L(${bestText})`, value: chance(L(best)), mark: 'found' }])], {
    line: 2,
    note: `Work out L for every p and you get this curve. It peaks at p = ${bestText}, the share of the flips that came up heads, ${h}/${n}: no other chance of heads makes these flips as likely. That p is the maximum-likelihood estimate.`,
    vars: { 'best p': best, 'L(best p)': L(best) },
    checkpoint: askInOrder('Add up L(p) at p = 0.1, 0.2, …, 0.9. Do the heights add up to 1, like the bars of a distribution?', ['Yes', 'No'], 'No'),
  });

  yield plotFrame([tokens(), likePlane({ curve: true, peak: true, stems: true }), readouts([{ id: 'sum', label: 'L(0.1) + L(0.2) + … + L(0.9)', value: chance(gridSum), tone: 2 }])], {
    line: 2,
    note: `The nine heights add up to ${chance(gridSum)}, not 1. Each L(p) is a chance of the data, the flips, worked out once p is fixed. It is not the chance that p is right: across different p's the likelihoods can add up to anything (for a single flip that landed heads, L(p) = p, and the nine heights add up to 4.5).`,
    vars: { 'Σ L': gridSum },
    checkpoint: askInOrder(
      `Now ${commas(big.heads)} heads in ${commas(big.flips)} flips, the same share. Multiply out L(${bestText}) = ${bestText}${sup(big.heads)} × ${f2(1 - best)}${sup(big.flips - big.heads)} in floats. What comes out?`,
      ['A tiny number above 0', 'Exactly 0', `About ${bestText}`],
      bigProduct === 0 ? 'Exactly 0' : 'A tiny number above 0',
    ),
  });

  yield plotFrame(
    [
      likePlane({ curve: true, peak: true, point: true }),
      readouts([
        { id: 'flips', label: 'flips', value: commas(big.flips) },
        { id: 'product', label: `L(${bestText}), multiplied out`, value: chance(bigProduct), mark: 'reject' },
        { id: 'bigLog', label: `ln L(${bestText}), logs added`, value: fmt(bigLog, 1), mark: 'found' },
      ]),
    ],
    {
      line: 3,
      note: `Multiplied out, it comes to ${chance(bigProduct)}: the true value is far smaller than the smallest number a float can hold, so it underflows. Logs turn the product into a sum, ln(a × b) = ln a + ln b: h heads add h·ln p and the tails add (n − h)·ln(1 − p). For these flips that is ${fmt(bigLog, 1)}, an ordinary number.`,
      vars: { 'ln L': round(bigLog, 4) },
      checkpoint: askInOrder(`Draw ln L(p) for the ${n} flips against p. Where will its peak be?`, ['At a smaller p', 'At the same p', 'At a larger p'], 'At the same p'),
    },
  );

  const ln = (q: number) => Math.log(q);
  yield plotFrame([likePlane({ curve: true, peak: true }), logPlane({ peak: true })], {
    line: 3,
    note: `The log curve peaks at p = ${bestText} too. ln only ever grows as its input grows, so a bigger L always has a bigger ln L, and whichever p gives the biggest L gives the biggest ln L. Taking logs changes the heights, never which p wins.`,
    vars: { 'best p': best },
    checkpoint: ask(`ln L(p) = h·ln p + (n − h)·ln(1 − p). What is ln L at your guess, p = ${pText}?`, f3(lnL(p)), [f3(ln(p) + ln(1 - p)), f3(h * ln(p)), f3(h * ln(1 - p) + (n - h) * ln(p))]),
  });

  yield plotFrame([likePlane({ curve: true, peak: true, point: true }), logPlane({ peak: true, point: true }), readouts([{ id: 'logGuess', label: `ln L(${pText})`, value: f3(lnL(p)), mark: 'key' }, { id: 'logBest', label: `ln L(${bestText})`, value: f3(lnL(best)), mark: 'found' }])], {
    line: 3,
    note: `ln L(${pText}) = ${h} × ln ${pText} + ${n - h} × ln ${f2(1 - p)} = ${f3(lnL(p))}${Math.abs(p - best) < 1e-9 ? ', the top of the curve' : `, below the peak's ${f3(lnL(best))}`}. Every log here is negative, since every chance is below 1.`,
    vars: { 'ln L(p)': round(lnL(p), 4) },
    checkpoint: askInOrder(`Measure the slope of ln L at your guess, p = ${pText}. Which way does the curve go there?`, ['Uphill: positive', 'Flat: about 0', 'Downhill: negative'], sign),
  });

  const sGuess = measuredSlope(lnL, p);
  const sBest = measuredSlope(lnL, best);
  yield plotFrame(
    [
      logPlane({ peak: true, point: true, tangents: true }),
      readouts([
        { id: 'slopeGuess', label: `slope at ${pText}`, value: f2(sGuess), mark: 'key' },
        { id: 'slopeBest', label: `slope at ${bestText}`, value: f2(sBest), mark: 'found' },
      ]),
    ],
    {
      line: 4,
      note: `Measured across a gap of ${SLOPE_GAP} either side, the slope at p = ${pText} is ${f2(sGuess)}, and at the peak it is ${f2(sBest)}: the tangent there is level. ${Math.abs(p - best) < 1e-9 ? 'Your guess is the peak itself.' : `So from ${pText} the climb goes towards ${bestText}.`} Finding the best parameter means finding where the slope of ln L is 0.`,
      vars: { 'slope at p': round(sGuess, 4), 'slope at best': round(sBest, 4) },
      checkpoint: ask(`Take −ln L(${bestText}) and divide by the ${n} flips. What do you get?`, f3(-lnL(best) / n), [f3(-lnL(best)), f3(lnL(best) / n)]),
    },
  );

  yield plotFrame(
    [
      logPlane({ peak: true, point: true }),
      readouts([
        { id: 'ceGuess', label: `cross-entropy at ${pText}`, value: f3(crossEntropy(h, n, p)), mark: 'key' },
        { id: 'ceBest', label: `cross-entropy at ${bestText}`, value: f3(crossEntropy(h, n, best)), mark: 'found' },
      ]),
    ],
    {
      line: 5,
      note: `−ln L / n = −(${h}/${n} · ln p + ${n - h}/${n} · ln(1 − p)) is the cross-entropy between the shares in the data, ${bestText} heads and ${f2(1 - best)} tails, and the model's chances p and 1 − p. It is ${f3(crossEntropy(h, n, best))} at the peak and ${f3(crossEntropy(h, n, p))} at your guess. Making the likelihood as big as possible is the same as making the cross-entropy as small as possible. A yes/no classifier gives each example its own chance, and its loss is the same thing: minus the average log of the chance it gave each true answer.`,
      vars: { 'cross-entropy': round(crossEntropy(h, n, best), 4) },
    },
  );
}

// ───────────────────────────── 2. a normal bell over data ─────────────────────────────

const BELL_X = { min: -0.5, max: 13 } as const;
const BELL_TOP = 0.7;

function bell(id: string, mu: number, sigma: number, extra: Partial<Shape>): Shape {
  const points: Vec[] = [];
  for (let i = 0; i <= 135; i++) {
    const x = round(BELL_X.min + i / 10, 2);
    points.push([x, round(normalPdf(x, mu, sigma), 4)]);
  }
  return { kind: 'path', id, points, ...extra } as Shape;
}

function* gaussianStory(xs: readonly number[], mu: number, sigma: number): Generator<Frame<PlotState>> {
  const n = xs.length;
  const best = fitGaussian(xs);
  const xbar = best.mu;
  const ll = (m: number, s: number) => gaussianLogLikelihood(xs, m, s);
  const handles: Handle[] = [
    { id: 'mu', at: [mu, 0], label: 'μ, the centre (drag it)', step: LIMITS.normalStep, min: [LIMITS.mu[0], 0], max: [LIMITS.mu[1], 0], mark: 'key' },
    { id: 's', at: [round(mu + sigma, 1), 0], label: 'μ + σ, the spread (drag it)', step: LIMITS.normalStep, min: [round(mu + LIMITS.sigma[0], 1), 0], max: [round(mu + LIMITS.sigma[1], 1), 0], mark: 'key' },
  ];
  const dataPlane = (o: { bars?: boolean; best?: boolean } = {}): PlanePart => ({
    kind: 'plane',
    id: 'data',
    label: `${n} measurements under a normal bell with centre μ = ${f2(mu)} and spread σ = ${f2(sigma)}`,
    x: { min: BELL_X.min, max: BELL_X.max, label: 'x' },
    y: { min: 0, max: BELL_TOP, label: 'density' },
    equal: false,
    shapes: [
      // A path's label sits at its last point, down on the x-axis for a bell, so each bell is labelled
      // beside its own curve instead: yours over its peak, the best one on its right shoulder.
      bell('bell', mu, sigma, { mark: 'key' }),
      { kind: 'label', id: 'bellLabel', at: [round(mu, 2), round(Math.min(BELL_TOP - 0.04, normalPdf(mu, mu, sigma) + 0.04), 2)], text: 'your bell' } as Shape,
      ...(o.best
        ? [
            bell('best', best.mu, best.sigma, { tone: 2 }),
            { kind: 'label', id: 'bestLabel', at: [round(best.mu + 1.2 * best.sigma, 2), round(Math.min(BELL_TOP - 0.04, normalPdf(best.mu + best.sigma, best.mu, best.sigma) + 0.03), 2)], text: 'the best bell' } as Shape,
          ]
        : []),
      ...(o.bars ? [{ kind: 'bars', id: 'bars', bars: xs.map((x, i): Bar => ({ id: `b${i}`, x0: x - 0.07, x1: x + 0.07, y: round(normalPdf(x, mu, sigma), 4) })) } as Shape] : []),
      ...xs.map((x, i): Shape => ({ kind: 'point', id: `x${i}`, at: [x, 0], size: 'sm' })),
    ],
    handles,
  });

  const lo = Math.min(...xs, mu) - 1;
  const hi = Math.max(...xs, mu) + 1;
  const muPts: Vec[] = [];
  for (let m = lo; m <= hi + 1e-9; m += 0.05) muPts.push([round(m, 2), round(ll(m, sigma), 2)]);
  const muPlane = (): PlanePart => {
    const ys = muPts.map((q) => q[1]);
    return {
      kind: 'plane',
      id: 'byMu',
      label: `ln L as μ slides, with σ kept at ${f2(sigma)}`,
      x: { min: round(lo, 2), max: round(hi, 2), label: 'μ' },
      y: { min: Math.floor(Math.min(...ys)), max: Math.ceil(Math.max(...ys)) + 1, label: 'ln L' },
      equal: false,
      shapes: [
        { kind: 'path', id: 'lnL', points: muPts, tone: 2 },
        { kind: 'point', id: 'muBest', at: [round(xbar, 2), round(ll(xbar, sigma), 2)], mark: 'found', label: `x̄ = ${f2(xbar)}` },
        { kind: 'point', id: 'muYours', at: [mu, round(ll(mu, sigma), 2)], mark: 'key' },
      ],
      handles: [],
    };
  };

  const sHi = Math.max(4, best.sigma * 1.6);
  const sPts: Vec[] = [];
  for (let s = 0.5; s <= sHi + 1e-9; s += 0.05) sPts.push([round(s, 2), round(ll(xbar, s), 2)]);
  const sigmaPlane = (): PlanePart => {
    const ys = sPts.map((q) => q[1]);
    return {
      kind: 'plane',
      id: 'bySigma',
      label: `ln L as σ changes, with μ at the mean, ${f2(xbar)}`,
      x: { min: 0.5, max: round(sHi, 2), label: 'σ' },
      y: { min: Math.floor(Math.min(...ys)), max: Math.ceil(Math.max(...ys)) + 1, label: 'ln L' },
      equal: false,
      shapes: [
        { kind: 'path', id: 'lnLs', points: sPts, tone: 2, label: 'ln L' },
        { kind: 'point', id: 'sBest', at: [round(best.sigma, 2), round(ll(xbar, best.sigma), 2)], mark: 'found', label: `σ = ${f2(best.sigma)}` },
        { kind: 'point', id: 'sYours', at: [sigma, round(ll(xbar, sigma), 2)], mark: 'key' },
      ],
      handles: [],
    };
  };

  // Which point gets the tallest bar: the one nearest μ (no question if two bars come out the same height as drawn).
  const byGap = xs.map((x, i) => ({ x, i, gap: Math.abs(x - mu), y: round(normalPdf(x, mu, sigma), 4) })).sort((a, b) => a.gap - b.gap || a.i - b.i);
  const tallest: Checkpoint | undefined =
    byGap[0].y > byGap[1].y
      ? ask(`Which measurement will get the tallest bar, the biggest density under your bell?`, f2(byGap[0].x), [byGap[byGap.length - 1].x, byGap[byGap.length - 2].x, byGap[1].x].map(f2))
      : undefined;

  yield plotFrame([dataPlane()], {
    line: 6,
    note: `${n} measurements, the dots. Model them as draws from a normal bell with centre μ and spread σ: its density f(x) = e^(−(x − μ)²/(2σ²)) / (σ√(2π)) is tall near μ and falls away on both sides. Each measurement's density is a bar up to the curve, and the likelihood is all the bars multiplied together, since the draws are independent. Drag μ and μ + σ.`,
    vars: { μ: mu, σ: sigma },
    checkpoint: tallest,
  });

  const sse = squaredGaps(xs, mu);
  yield plotFrame([dataPlane({ bars: true }), readouts([{ id: 'll', label: 'ln L for your bell', value: f3(ll(mu, sigma)), mark: 'key' }])], {
    line: 7,
    note: `The bars are tallest near μ. Their product is a tiny number, so add their logs instead: ln f(x) = −ln(σ√(2π)) − (x − μ)²/(2σ²), and ln L = Σ ln f(xᵢ) = ${f3(ll(mu, sigma))} for your bell. Only the squared gaps (x − μ)² depend on μ; here they add up to ${f2(sse)}.`,
    vars: { 'ln L': round(ll(mu, sigma), 4), 'Σ (x − μ)²': round(sse, 4) },
    checkpoint: ask(`Keep σ at ${f2(sigma)} and slide μ. Where will ln L be highest?`, f2(xbar), [f2(median(xs)), f2(midrange(xs))]),
  });

  yield plotFrame([dataPlane({ bars: true }), muPlane(), readouts([{ id: 'll', label: `ln L at μ = ${f2(mu)}`, value: f3(ll(mu, sigma)), mark: 'key' }, { id: 'mean', label: 'x̄, the mean', value: f2(xbar), mark: 'found' }])], {
    line: 8,
    note: `ln L peaks at μ = ${f2(xbar)}, the mean x̄ of the measurements. The squared gaps add up to the least there: by the power rule, the slope of Σ (xᵢ − μ)² against μ is Σ 2(μ − xᵢ), which is 0 only when μ is the average. ${Math.abs(xbar - median(xs)) < 0.25 ? `Here the median, ${f2(median(xs))}, almost agrees: no measurement is far out.` : `The median, ${f2(median(xs))}, ignores how far out the far measurements are; the squares weigh them heavily.`}`,
    vars: { 'best μ': round(xbar, 4) },
    checkpoint: ask(`Put μ at the mean, ${f2(xbar)}. Which σ makes ln L highest?`, f3(best.sigma), [f3(sampleSd(xs)), f3(best.sigma * best.sigma), f3(meanAbsGap(xs))]),
  });

  yield plotFrame(
    [
      dataPlane({ bars: true }),
      sigmaPlane(),
      readouts([
        { id: 'sigma', label: 'best σ = √(Σ (x − x̄)² / n)', value: f3(best.sigma), mark: 'found' },
        { id: 'llBest', label: 'ln L at the best μ and σ', value: f3(ll(xbar, best.sigma)), mark: 'found' },
      ]),
    ],
    {
      line: 9,
      note: `ln L peaks at σ = ${f3(best.sigma)}: the squared gaps from the mean add up to ${f2(squaredGaps(xs, xbar))}, divided by n = ${n} that is ${f3(best.sigma * best.sigma)}, and its square root is the best spread. Too small a σ makes a far measurement's bar almost 0; too big a σ flattens every bar.`,
      vars: { 'best σ': round(best.sigma, 4) },
    },
  );

  yield plotFrame([dataPlane({ bars: true, best: true }), readouts([{ id: 'llYours', label: 'ln L, your bell', value: f3(ll(mu, sigma)), mark: 'key' }, { id: 'llBest', label: 'ln L, the best bell', value: f3(ll(xbar, best.sigma)), tone: 2 }])], {
    line: 9,
    note: `The best bell has μ = ${f2(xbar)} and σ = ${f3(best.sigma)}, and ln L = ${f3(ll(xbar, best.sigma))}${Math.abs(ll(mu, sigma) - ll(xbar, best.sigma)) < 0.0005 ? ', the same as yours' : `, against ${f3(ll(mu, sigma))} for yours`}. No other normal bell makes these ${n} measurements more likely.`,
    vars: { μ: round(xbar, 4), σ: round(best.sigma, 4) },
  });
}

// ───────────────────────────── 3. squared error ─────────────────────────────

const SHIFTS = { min: -3, max: 3 } as const;

function* squaredErrorStory(ys: readonly number[], left: number, right: number): Generator<Frame<PlotState>> {
  const k = ys.length;
  const rs = residuals(ys, left, right);
  const sse = squaredGaps(rs, 0);
  const C = Math.log(Math.sqrt(2 * Math.PI));
  const lnL = (r: readonly number[], s = NOISE) => noiseLogLikelihood(r, s);
  const handles: Handle[] = [
    { id: 'l', at: [0, left], label: 'the line at x = 0 (drag it)', step: LIMITS.lineStep, min: [0, LIMITS.line[0]], max: [0, LIMITS.line[1]], mark: 'key' },
    { id: 'r', at: [k + 1, right], label: `the line at x = ${k + 1} (drag it)`, step: LIMITS.lineStep, min: [k + 1, LIMITS.line[0]], max: [k + 1, LIMITS.line[1]], mark: 'key' },
  ];
  const ls = leastSquares(ys);
  const linePlane = (o: { marked?: number; best?: boolean } = {}): PlanePart => ({
    kind: 'plane',
    id: 'line',
    label: `${k} points and a line, with each point's residual`,
    x: { min: -0.5, max: k + 1.5, label: 'x', ticks: Array.from({ length: k + 2 }, (_, i) => ({ at: i, label: String(i) })) },
    y: { min: LIMITS.line[0], max: LIMITS.line[1], label: 'y' },
    equal: false,
    shapes: [
      {
        kind: 'path',
        id: 'fit',
        points: [
          [0, left],
          [k + 1, right],
        ],
        mark: 'key',
        label: 'your line',
      },
      ...(o.best
        ? [
            {
              kind: 'path',
              id: 'best',
              points: [
                [0, round(ls.b, 2)],
                [k + 1, round(ls.b + ls.w * (k + 1), 2)],
              ],
              tone: 2,
              label: 'least squares',
            } as Shape,
          ]
        : []),
      ...rs.map((r, i): Shape => ({
        kind: 'path',
        id: `r${i}`,
        points: [
          [i + 1, ys[i]],
          [i + 1, round(ys[i] - r, 4)],
        ],
        dashed: true,
        mark: i === o.marked ? 'compare' : null,
      })),
      ...ys.map((y, i): Shape => ({ kind: 'point', id: `y${i}`, at: [i + 1, y], size: 'sm' })),
    ],
    handles,
  });

  const dStar = mean(rs);
  const shifted = (d: number) => rs.map((r) => r - d);
  const shiftPts = (f: (d: number) => number): Vec[] => Array.from({ length: 61 }, (_, i) => SHIFTS.min + i / 10).map((d) => [round(d, 2), round(f(d), 2)] as Vec);
  const ssePts = shiftPts((d) => squaredGaps(shifted(d), 0));
  const llPts = shiftPts((d) => lnL(shifted(d)));
  const wideLlPts = shiftPts((d) => lnL(shifted(d), WIDE_NOISE));
  const curvePlane = (id: 'sse' | 'loglik', o: { wide?: boolean } = {}): PlanePart => {
    const pts = id === 'sse' ? ssePts : llPts;
    const all = id === 'sse' ? ssePts : [...llPts, ...wideLlPts];
    const vals = all.map((q) => q[1]);
    const peak = id === 'sse' ? squaredGaps(shifted(dStar), 0) : lnL(shifted(dStar));
    return {
      kind: 'plane',
      id,
      label: id === 'sse' ? 'Σ r², as the line moves up or down by d' : 'ln L, as the line moves up or down by d',
      x: { min: SHIFTS.min, max: SHIFTS.max, label: 'd, the shift' },
      y: { min: Math.floor(Math.min(...vals)), max: Math.ceil(Math.max(...vals)) + 1, label: id === 'sse' ? 'Σ r²' : 'ln L' },
      equal: false,
      shapes: [
        { kind: 'path', id: `${id}Curve`, points: pts, ...(id === 'sse' ? {} : { tone: 2 as const }), label: id === 'sse' ? 'Σ r²' : `σ = ${NOISE}` },
        ...(o.wide ? [{ kind: 'path', id: 'wide', points: wideLlPts, tone: 3, label: `σ = ${WIDE_NOISE}` } as Shape] : []),
        { kind: 'point', id: `${id}Best`, at: [round(dStar, 2), round(peak, 2)], mark: 'found', label: `d = ${f2(dStar)}` },
        { kind: 'point', id: `${id}Zero`, at: [0, round(id === 'sse' ? sse : lnL(rs), 2)], mark: 'key' },
      ],
      handles: [],
    };
  };

  // The point whose residual adds the most to Σ r² (no question if two tie).
  const bySize = rs.map((r, i) => ({ i, size: r * r })).sort((a, b) => b.size - a.size || a.i - b.i);
  const biggest = bySize[0].i;
  const pointName = (i: number) => `x = ${i + 1}`;
  // Asked only when the biggest residual is clearly ahead, so it can be told by eye after a drag.
  const clear = bySize[0].size >= 1.2 * bySize[1].size && Math.sqrt(bySize[0].size) - Math.sqrt(bySize[1].size) >= 0.15;
  const biggestQ = clear ? ask('Which point’s residual adds the most to Σ r²?', pointName(biggest), bySize.slice(1, 4).map((b) => pointName(b.i))) : undefined;

  yield plotFrame([linePlane()], {
    line: 10,
    note: `${k} points and a line through them. Model each y as the line's height plus noise drawn from a normal bell with spread σ = ${NOISE}. A point's residual r = y − line(x) is its gap from the line, dashed; its density under the noise bell is e^(−r²/2σ²)/(σ√(2π)). Drag the line's two ends.`,
    vars: { k, σ: NOISE },
    checkpoint: biggestQ,
  });

  yield plotFrame([linePlane({ marked: biggest }), readouts([{ id: 'big', label: `r² at ${pointName(biggest)}`, value: f3(rs[biggest] * rs[biggest]), mark: 'compare' }, { id: 'sse', label: 'Σ r²', value: f3(sse) }])], {
    line: 10,
    note: `The residual at ${pointName(biggest)} is ${f3(rs[biggest])}, so it adds ${f3(rs[biggest] * rs[biggest])} to the squared residuals, which add up to Σ r² = ${f3(sse)}. Each point's log density is −ln(σ√(2π)) − r²/(2σ²), and ln(σ√(2π)) = ${f3(C)} when σ = 1.`,
    vars: { 'Σ r²': round(sse, 4) },
    checkpoint: ask(`ln L = −${k} × ${f3(C)} − Σ r²/2 when σ = 1. What is ln L for your line?`, f3(lnL(rs)), [f3(-k * C - sse), f3(-sse / 2), f3(-k * C + sse / 2)]),
  });

  yield plotFrame([linePlane(), readouts([{ id: 'sse', label: 'Σ r²', value: f3(sse) }, { id: 'll', label: 'ln L', value: f3(lnL(rs)), mark: 'key' }])], {
    line: 11,
    note: `ln L = −${k} × ${f3(C)} − ${f3(sse)}/2 = ${f3(lnL(rs))}. The first part is the same for every line; the line only changes −Σ r²/(2σ²).`,
    vars: { 'ln L': round(lnL(rs), 4) },
    checkpoint: askInOrder('Slide your line up or down by d, keeping its slope. Where is ln L highest, compared with where Σ r² is lowest?', ['At a smaller d', 'At the same d', 'At a larger d'], 'At the same d'),
  });

  yield plotFrame([linePlane(), curvePlane('sse'), curvePlane('loglik'), readouts([{ id: 'shift', label: 'best shift d', value: f2(dStar), mark: 'found' }])], {
    line: 12,
    note: `A smaller Σ r² always means a bigger ln L. Σ r² is a bowl with its lowest point at d = ${f2(dStar)}, the average residual (the best centre of the residuals, their mean), and ln L is that bowl turned upside down, halved and moved down by ${k} × ${f3(C)}, so its peak sits right above. Maximising the likelihood is minimising the squared error.`,
    vars: { 'best d': round(dStar, 4) },
    checkpoint: askInOrder(`Now let the noise spread be σ = ${WIDE_NOISE} instead of ${NOISE}. Where is the best shift?`, ['Closer to 0', `At d = ${f2(dStar)} still`, 'Further from 0'], `At d = ${f2(dStar)} still`),
  });

  const lsRs = ys.map((y, i) => y - (ls.b + ls.w * (i + 1)));
  const mse = squaredGaps(lsRs, 0) / k;
  yield plotFrame(
    [
      linePlane({ best: true }),
      curvePlane('loglik', { wide: true }),
      readouts([
        { id: 'w', label: 'least-squares slope', value: f3(ls.w), tone: 2 },
        { id: 'b', label: 'least-squares height at 0', value: f3(ls.b), tone: 2 },
        { id: 'mse', label: 'its mean squared error', value: f3(mse), tone: 2 },
      ]),
    ],
    {
      line: 12,
      note: `With σ = ${WIDE_NOISE}, ln L = −${k} · ln(${WIDE_NOISE}√(2π)) − Σ r²/8: flatter, and lower, but it peaks at the same d = ${f2(dStar)}, because σ only scales the Σ r² part and shifts the rest. Move the slope as well and the best line is the least-squares line, slope ${f3(ls.w)}: under normal noise, the line with the smallest mean squared error is the maximum-likelihood line, whatever σ is.`,
      vars: { slope: round(ls.w, 4), MSE: round(mse, 4) },
    },
  );
}

// ───────────────────────────── input ─────────────────────────────

function* run(input: MlInput): Generator<Frame<PlotState>> {
  if (input.story === 'coin') yield* coinStory(input.h, input.n, input.p);
  else if (input.story === 'gaussian') yield* gaussianStory(input.xs, input.mu, input.sigma);
  else yield* squaredErrorStory(input.ys, input.left, input.right);
}

const whole = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;
const onGrid = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;
const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo - 1e-9 && v <= hi + 1e-9;

export function parseMl(text: string): { value: MlInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  if (word === 'coin') {
    const [h, n, p, ...rest] = numbersIn(text);
    if (rest.length || !whole(n, LIMITS.n)) return { error: `Give heads, flips and your guess, e.g. coin 7 of 10 guess 0.5, with ${LIMITS.n[0]} to ${LIMITS.n[1]} flips.` };
    if (!whole(h, [1, n - 1])) return { error: 'Heads is a whole number from 1 to one less than the flips: some of each.' };
    if (p === undefined || !within(p, LIMITS.p) || !onGrid(p, LIMITS.pStep)) return { error: `Your guess p is a chance from ${LIMITS.p[0]} to ${LIMITS.p[1]}, in steps of ${LIMITS.pStep}.` };
    return { value: { story: 'coin', h, n, p: round(p, 2) } };
  }
  if (word === 'gaussian') {
    const [left, right] = text.split('|');
    if (right === undefined) return { error: 'Give the measurements, then | and μ and σ, e.g. gaussian 2.5 3.5 4 | 4 1.5.' };
    const xs = numbersIn(left);
    const [mu, sigma, ...rest] = numbersIn(right);
    if (xs.length < LIMITS.points[0] || xs.length > LIMITS.points[1]) return { error: `Give ${LIMITS.points[0]} to ${LIMITS.points[1]} measurements.` };
    if (!xs.every((x) => within(x, LIMITS.x) && onGrid(x, 0.01))) return { error: `Each measurement is from ${LIMITS.x[0]} to ${LIMITS.x[1]}, with at most two decimals.` };
    const s = fitGaussian(xs).sigma;
    if (!within(s, LIMITS.sigma)) return { error: `Spread the measurements so their root mean squared gap from the mean is between ${LIMITS.sigma[0]} and ${LIMITS.sigma[1]} (it is ${f2(s)}).` };
    if (rest.length || mu === undefined || sigma === undefined || !within(mu, LIMITS.mu) || !within(sigma, LIMITS.sigma) || !onGrid(mu, LIMITS.normalStep) || !onGrid(sigma, LIMITS.normalStep))
      return { error: `After |, μ from ${LIMITS.mu[0]} to ${LIMITS.mu[1]} and σ from ${LIMITS.sigma[0]} to ${LIMITS.sigma[1]}, in steps of ${LIMITS.normalStep}.` };
    return { value: { story: 'gaussian', xs, mu: round(mu, 1), sigma: round(sigma, 1) } };
  }
  if (word === 'line') {
    const [left, right] = text.split('|');
    if (right === undefined) return { error: 'Give the y values, then | and the line’s heights at both ends, e.g. line 2 3.5 3 5.5 5 7 | 1 7.' };
    const ys = numbersIn(left);
    const [a, b, ...rest] = numbersIn(right);
    if (ys.length < LIMITS.lineCount[0] || ys.length > LIMITS.lineCount[1]) return { error: `Give ${LIMITS.lineCount[0]} to ${LIMITS.lineCount[1]} y values, for x = 1, 2, 3 and so on.` };
    if (!ys.every((y) => within(y, LIMITS.y) && onGrid(y, 0.01))) return { error: `Each y is from ${LIMITS.y[0]} to ${LIMITS.y[1]}, with at most two decimals.` };
    if (rest.length || a === undefined || b === undefined || ![a, b].every((v) => within(v, LIMITS.line) && onGrid(v, LIMITS.lineStep)))
      return { error: `After |, the line’s heights at x = 0 and at the far end, from ${LIMITS.line[0]} to ${LIMITS.line[1]} in steps of ${LIMITS.lineStep}.` };
    return { value: { story: 'squared-error', ys, left: a, right: b } };
  }
  return { error: 'Start with coin, gaussian or line.' };
}

export function formatMl(input: MlInput): string {
  if (input.story === 'coin') return `coin ${input.h} of ${input.n} guess ${input.p}`;
  if (input.story === 'gaussian') return `gaussian ${input.xs.join(' ')} | ${input.mu} ${input.sigma}`;
  return `line ${input.ys.join(' ')} | ${input.left} ${input.right}`;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const snapTo = (v: number, step: number, range: readonly [number, number], digits: number) => round(clamp(Math.round(v / step) * step, range), digits);

export function dragMl(input: MlInput, handle: string, to: readonly [number, number]): MlInput {
  if (input.story === 'coin' && handle === 'p') return { ...input, p: snapTo(to[0], LIMITS.pStep, LIMITS.p, 2) };
  if (input.story === 'gaussian' && handle === 'mu') return { ...input, mu: snapTo(to[0], LIMITS.normalStep, LIMITS.mu, 1) };
  if (input.story === 'gaussian' && handle === 's') return { ...input, sigma: snapTo(to[0] - input.mu, LIMITS.normalStep, LIMITS.sigma, 1) };
  if (input.story === 'squared-error' && handle === 'l') return { ...input, left: snapTo(to[1], LIMITS.lineStep, LIMITS.line, 2) };
  if (input.story === 'squared-error' && handle === 'r') return { ...input, right: snapTo(to[1], LIMITS.lineStep, LIMITS.line, 2) };
  return input;
}

/** The measurements of the bell presets and the points of the line preset. */
export const MEASUREMENTS = [2.5, 3.5, 4, 4.5, 5, 5.5, 7, 10];
export const EVEN_MEASUREMENTS = [3, 4, 4.5, 5, 5.5, 6, 6.5, 8];
export const LINE_POINTS = [2, 3.5, 3, 5.5, 5, 7];

const example = (id: string, label: string, make: () => MlInput) => ({ id, label, make: () => make(), sized: false });

export const maximumLikelihood = defineAlgorithm<MlInput, PlotState>({
  kind: 'algorithm',
  slug: 'maximum-likelihood',
  view: 'plot',
  input: {
    examples: [
      example('coin', 'A coin: 7 heads in 10 flips', () => ({ story: 'coin', h: 7, n: 10, p: 0.5 })),
      example('coin-few', 'A coin: 1 head in 4 flips', () => ({ story: 'coin', h: 1, n: 4, p: 0.4 })),
      example('gaussian', 'A normal bell over 8 measurements', () => ({ story: 'gaussian', xs: [...MEASUREMENTS], mu: 4, sigma: 1.5 })),
      example('gaussian-even', 'A bell over measurements with no far one', () => ({ story: 'gaussian', xs: [...EVEN_MEASUREMENTS], mu: 7, sigma: 1 })),
      example('squared-error', 'A line with normal noise', () => ({ story: 'squared-error', ys: [...LINE_POINTS], left: 1, right: 7 })),
    ],
    custom: {
      label: 'coin h of n guess p, gaussian measurements | μ σ, or line y values | the line’s two end heights',
      placeholder: 'e.g. coin 7 of 10 guess 0.5',
      parse: parseMl,
      format: formatMl,
    },
    drag: dragMl,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The data, and the likelihood curves' },
    { mark: 'key', label: 'Your guess: drag it' },
    { mark: 'found', label: 'The best value, where the likelihood peaks' },
    { tone: 1, label: 'A head' },
    { tone: 2, label: 'The log-likelihood, or the best fit' },
    { tone: 3, label: 'The log-likelihood with wider noise, σ = 2' },
    { mark: 'compare', label: 'The biggest residual' },
    { mark: 'reject', label: 'A product that underflowed to 0' },
  ],
  run,
  content: {
    idea: 'A model with a parameter gives the data a probability. Read as a function of the parameter, that probability is the likelihood L, and the maximum-likelihood estimate is the parameter that makes the data most probable. Products of many chances underflow, so work with ln L, a sum of logs, which peaks at the same place. For a coin that is the share of heads; for a normal bell, the mean and the root mean squared gap; and the negative average log-likelihood is the cross-entropy, or for normal noise the squared error, which is why models are trained on those losses.',
    invariant: 'The log never moves the peak: ln only grows as its input grows. At the best parameter the slope of ln L is 0. With σ fixed, ln L = a constant − Σ r²/(2σ²), so the parameter with the biggest likelihood is the one with the smallest squared error, whatever σ is.',
    whenToUse: 'Whenever a model gives its data a probability: fitting a coin, a bell, a line with noise, or a classifier. Training a classifier on cross-entropy and a regression on mean squared error are both maximum likelihood.',
    traits: [
      { label: 'The likelihood is a chance of the data, not of the parameter', good: null },
      { label: 'Logs turn products into sums and keep the peak', good: true },
      { label: 'The best σ divides by n, not n − 1', good: null },
    ],
    experiments: [
      { example: 'coin', prompt: 'Drag your guess p and watch L(p) and ln L(p): both are highest at 0.7, the share of heads.' },
      { example: 'coin-few', prompt: 'With only 4 flips the curve is wide: many p explain the data almost as well as 0.25.' },
      { example: 'gaussian', prompt: 'Drag μ and μ + σ to make ln L as big as you can, then step on to see the best bell: μ at the mean, not the median.' },
      { example: 'gaussian-even', prompt: 'With no far measurement, the mean and the median almost agree. Drag σ small and watch the outer bars fall towards 0.' },
      { example: 'squared-error', prompt: 'Drag the line’s ends: Σ r² and ln L always move in opposite directions.' },
    ],
  },
});

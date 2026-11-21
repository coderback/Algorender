// Densities as code (B5 of the math and ML path): the normal density written
// from its formula, and its CDF, the area to the left of x, added up from thin
// rectangles. The check names the usual slips: σ² where σ belongs, a missing
// 1/(σ√(2π)), a lost minus, 2π for √(2π), rectangles without their width, and
// a sum that starts at 0 instead of far to the left.
//
// Python's math.exp and JavaScript's Math.exp can differ in the last bit, and
// exercises.test.ts needs both languages to write the same numbers into the
// visual arrays. So the given `curves` writes each value rounded to 6 places
// (round(v, 6) and Math.round(v * 1e6) / 1e6 agree unless a value sits on a
// tie, which none here does), and returns the full values, which the check
// compares with a tolerance.

import { normalCdf, normalPdf } from '@/algorithms/probability/distributions';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const SQRT_2PI = Math.sqrt(2 * Math.PI);
/** Far enough left that the area beyond is below 10⁻¹⁵. */
export const FAR = 8;

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b) + 1e-15;
const allNear = (got: readonly number[], want: readonly number[], rel = 1e-9) => got.length === want.length && want.every((w, i) => near(got[i], w, rel));
const fmt = (v: number, digits = 6) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[], digits = 4) => `[${vs.map((v) => fmt(v, digits)).join(', ')}]`;

export type CurveInput = { xs: number[]; mu: number; sigma: number; n: number };

const args = ({ xs, mu, sigma, n }: CurveInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'value', name: 'mu', value: mu },
  { kind: 'value', name: 'sigma', value: sigma },
  { kind: 'value', name: 'n', value: n },
  { kind: 'array', name: 'pdf', values: xs.map(() => 0) },
  { kind: 'array', name: 'cdf', values: xs.map(() => 0) },
];

/** The reference's numeric CDF: n rectangles from μ − 8σ to x, each as tall as the density at its middle. */
export function numericCdf(x: number, mu: number, sigma: number, n: number, at: 'middle' | 'left' | 'right' = 'middle', start = mu - FAR * sigma): number {
  const width = (x - start) / n;
  const shift = at === 'middle' ? 0.5 : at === 'left' ? 0 : 1;
  let total = 0;
  for (let k = 0; k < n; k++) total += normalPdf(start + (k + shift) * width, mu, sigma) * width;
  return total;
}

/**
 * How far a CDF from n thin rectangles may miss the exact area: the middle
 * rule misses by about w²·|f′|/24 and the trapezoid rule by twice that, with
 * |f′| ≤ 0.242/σ² for the normal; a left or right rule misses by about w·f/2,
 * far more.
 */
const cdfTolerance = (x: number, start: number, { sigma, n }: CurveInput) => 0.03 * ((x - start) / n / sigma) ** 2 + 1e-9;

function checkCurves(input: CurveInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { xs, mu, sigma, n } = input;
  const got = result.returned;
  if (!Array.isArray(got) || got.length !== 2 || !isNumbers(got[0]) || !isNumbers(got[1]) || got[0].length !== xs.length || got[1].length !== xs.length) {
    return { pass: false, message: 'curves() returns the heights and the areas once normal_pdf and normal_cdf each return a number: leave curves as it is.' };
  }
  const [heights, areas] = got as [number[], number[]];
  const at = (i: number) => `at x = ${fmt(xs[i])}`;

  // 1. The density.
  const want = xs.map((x) => normalPdf(x, mu, sigma));
  if (!allNear(heights, want)) {
    if (heights.every((h) => h === 0)) return { pass: false, message: 'normal_pdf still returns 0: return e^(−(x − μ)²/(2σ²)) divided by σ√(2π).' };
    const power = (x: number, s2: number, sign = -1) => Math.exp((sign * (x - mu) * (x - mu)) / s2);
    const like = (f: (x: number) => number) => allNear(heights, xs.map(f), 1e-6);
    const slips: [(x: number) => number, string][] = [
      [(x) => power(x, 2 * sigma * sigma) / (sigma * sigma * SQRT_2PI), `You divided by σ²√(2π): in front it is σ, not σ². Squaring belongs in the power, (x − μ)²/(2σ²); in front, σ√(2π) = ${fmt(sigma * SQRT_2PI, 4)}.`],
      [(x) => power(x, 2 * sigma) / (sigma * SQRT_2PI), 'In the power you divided by 2σ: it is 2σ², σ squared. The power is −(x − μ)²/(2σ²), so a curve with σ = 2 spreads twice as wide, not √2 times.'],
      [(x) => power(x, 2 * sigma * sigma), 'You left out 1/(σ√(2π)): without it the peak is 1 and the area under the curve is σ√(2π), not 1. Divide by sigma * sqrt(2π) so the whole area is 1.'],
      [(x) => power(x, 2 * sigma * sigma) / SQRT_2PI, 'You divided by √(2π) but not by σ: a curve σ times as wide must be σ times lower, or its area grows. Divide by σ√(2π).'],
      [(x) => power(x, 2 * sigma * sigma, 1) / (sigma * SQRT_2PI), 'The power of e has lost its minus: e^(+(x − μ)²/(2σ²)) grows away from μ, so your curve is a valley, not a bell. The power is −(x − μ)²/(2σ²).'],
      [(x) => power(x, 2 * sigma * sigma) / (sigma * 2 * Math.PI), `You divided by σ·2π: it is σ√(2π), with a square root (√(2π) ≈ 2.5066, while 2π ≈ 6.2832).`],
      [(x) => power(x, 2 * sigma * sigma) / (sigma * Math.sqrt(Math.PI)), 'You divided by σ√π: it is σ√(2π), the 2 inside the square root.'],
      [(x) => power(x, sigma * sigma) / (sigma * SQRT_2PI), 'The power is missing its 2: it is −(x − μ)²/(2σ²), not −(x − μ)²/σ².'],
      [(x) => Math.exp((-(x - mu) * (x - mu) * sigma * sigma) / 2) / (sigma * SQRT_2PI), 'In code, / 2 * sigma * sigma divides by 2 and then multiplies by σ². Put brackets round the whole divisor: / (2 * sigma * sigma).'],
      [(x) => Math.exp((-x * x) / (2 * sigma * sigma)) / (sigma * SQRT_2PI), `The power uses x² where it needs (x − μ)²: your bell sits at 0 instead of at μ = ${fmt(mu)}.`],
      [(x) => power(x, 2 * sigma * sigma) * sigma * SQRT_2PI, 'You multiplied by σ√(2π): divide by it instead, e^(…) / (σ√(2π)).'],
    ];
    for (const [f, message] of slips) if (like(f)) return { pass: false, message };
    const worst = heights.reduce((w, h, i) => (Math.abs(h - want[i]) > Math.abs(heights[w] - want[w]) ? i : w), 0);
    return { pass: false, message: `normal_pdf ${at(worst)} gives ${fmt(heights[worst])}, but the density there is ${fmt(want[worst])}. It is e^(−(x − μ)²/(2σ²)) / (σ√(2π)), with μ = ${fmt(mu)} and σ = ${fmt(sigma)}.` };
  }

  // 2. The CDF, from the density.
  const start = mu - FAR * sigma;
  const exact = xs.map((x) => normalCdf(x, mu, sigma));
  const fits = (want: number[], from: number) => want.every((w, i) => Number.isFinite(areas[i]) && Math.abs(areas[i] - w) <= cdfTolerance(xs[i], from, input));
  if (fits(exact, start)) {
    const peak = 1 / (sigma * SQRT_2PI);
    const tall = peak > 1 ? ` The density peaks at ${fmt(peak, 3)}, more than 1, yet every area is a chance below 1.` : '';
    return { pass: true, message: `P(X ≤ x) for x = ${list(xs, 2)} is ${list(exact)}: the area to the left of each x, from ${n} thin rectangles.${tall}` };
  }
  if (areas.every((v) => v === 0)) return { pass: false, message: 'normal_cdf still returns 0: add up n rectangles from μ − 8σ to x, each width = (x − start)/n wide and as tall as normal_pdf at its middle.' };
  const like = (want: number[]) => allNear(areas, want, 1e-6);
  if (like(xs.map((x) => numericCdf(x, mu, sigma, n) / ((x - start) / n)))) {
    return { pass: false, message: `Your “areas” go past 1: you added up the rectangles’ heights without their width. A chance is an area: multiply each height by width = (x − start)/n.` };
  }
  if (like(xs.map((x) => numericCdf(x, mu, sigma, n, 'left'))) || like(xs.map((x) => numericCdf(x, mu, sigma, n, 'right')))) {
    const side = like(xs.map((x) => numericCdf(x, mu, sigma, n, 'left'))) ? 'left' : 'right';
    return { pass: false, message: `Each rectangle is as tall as the curve at its ${side} edge, which tilts every one the same way, so the sum misses by about half a rectangle. Use the middle of each, start + (k + 0.5) × width.` };
  }
  if (mu !== 0 && fits(xs.map((x) => normalCdf(x, mu, sigma) - normalCdf(0, mu, sigma)), 0)) {
    return { pass: false, message: `Your sum starts at x = 0, so it leaves out all the area left of 0 (${fmt(normalCdf(0, mu, sigma), 4)} of it here). F(x) is the area from the far left: start at μ − 8σ = ${fmt(start)}, where the curve is all but 0.` };
  }
  if (fits(xs.map((x) => normalCdf(x, mu, sigma) - 0.5), mu)) {
    return { pass: false, message: `Your sum starts at ${mu === 0 ? '0, which is μ here' : 'μ'}, so it leaves out the half of the area to the left of μ (and comes out negative below μ). F(x) is the area from the far left: start at μ − 8σ = ${fmt(start)}.` };
  }
  if (fits(xs.map((x) => 1 - normalCdf(x, mu, sigma)), start)) {
    return { pass: false, message: 'That is the area to the right of x, P(X > x) = 1 − F(x). The CDF is the area to the left: from μ − 8σ up to x.' };
  }
  const worst = areas.reduce((w, v, i) => (Math.abs(v - exact[i]) > Math.abs(areas[w] - exact[w]) ? i : w), 0);
  return { pass: false, message: `normal_cdf ${at(worst)} gives ${fmt(areas[worst])}, but the area to the left of x is ${fmt(exact[worst])}. Add up n rectangles from start = μ − 8σ to x: each width = (x − start)/n wide, as tall as normal_pdf at start + (k + 0.5) × width.` };
}

// ───────────────────────────── code ─────────────────────────────

const PDF_PY = `def normal_pdf(x, mu, sigma):
    power = -(x - mu) * (x - mu) / (2 * sigma * sigma)
    return math.exp(power) / (sigma * math.sqrt(2 * math.pi))
`;
const CDF_PY = `def normal_cdf(x, mu, sigma, n):
    start = mu - 8 * sigma
    width = (x - start) / n
    total = 0
    for k in range(n):
        middle = start + (k + 0.5) * width
        total = total + normal_pdf(middle, mu, sigma) * width
    return total
`;
const CURVES_PY = `def curves(xs, mu, sigma, n, pdf, cdf):
    heights = []
    areas = []
    for i in range(len(xs)):
        heights.append(normal_pdf(xs[i], mu, sigma))
        areas.append(normal_cdf(xs[i], mu, sigma, n))
        pdf[i] = round(heights[i], 6)
        cdf[i] = round(areas[i], 6)
    return [heights, areas]
`;
const PDF_JS = `function normalPdf(x, mu, sigma) {
  const power = -(x - mu) * (x - mu) / (2 * sigma * sigma);
  return Math.exp(power) / (sigma * Math.sqrt(2 * Math.PI));
}
`;
const CDF_JS = `function normalCdf(x, mu, sigma, n) {
  const start = mu - 8 * sigma;
  const width = (x - start) / n;
  let total = 0;
  for (let k = 0; k < n; k++) {
    const middle = start + (k + 0.5) * width;
    total = total + normalPdf(middle, mu, sigma) * width;
  }
  return total;
}
`;
const CURVES_JS = `function curves(xs, mu, sigma, n, pdf, cdf) {
  const heights = [];
  const areas = [];
  for (let i = 0; i < xs.length; i++) {
    heights.push(normalPdf(xs[i], mu, sigma));
    areas.push(normalCdf(xs[i], mu, sigma, n));
    pdf[i] = Math.round(heights[i] * 1e6) / 1e6;
    cdf[i] = Math.round(areas[i] * 1e6) / 1e6;
  }
  return [heights, areas];
}
`;

const py = (pdf: string, cdf: string) => `import math


${pdf}

${cdf}

${CURVES_PY}`;
const js = (pdf: string, cdf: string) => `${pdf}
${cdf}
${CURVES_JS}`;
const ts = (code: string) =>
  code
    .replace('function normalPdf(x, mu, sigma) {', 'function normalPdf(x: number, mu: number, sigma: number): number {')
    .replace('function normalCdf(x, mu, sigma, n) {', 'function normalCdf(x: number, mu: number, sigma: number, n: number): number {')
    .replace('function curves(xs, mu, sigma, n, pdf, cdf) {', 'function curves(xs: number[], mu: number, sigma: number, n: number, pdf: number[], cdf: number[]): number[][] {')
    .replace('const heights = [];', 'const heights: number[] = [];')
    .replace('const areas = [];', 'const areas: number[] = [];');

const PDF_STUB_PY = `def normal_pdf(x, mu, sigma):
    # The normal density: e^(-(x - mu)² / (2 sigma²)) / (sigma √(2π)).
    return 0
`;
const CDF_STUB_PY = `def normal_cdf(x, mu, sigma, n):
    # The area under normal_pdf from far left, start = mu - 8 sigma, up to x:
    # n thin rectangles, each as tall as the curve at its middle.
    return 0
`;
const PDF_STUB_JS = `function normalPdf(x, mu, sigma) {
  // The normal density: e^(-(x - mu)² / (2 sigma²)) / (sigma √(2π)).
  return 0;
}
`;
const CDF_STUB_JS = `function normalCdf(x, mu, sigma, n) {
  // The area under normalPdf from far left, start = mu - 8 sigma, up to x:
  // n thin rectangles, each as tall as the curve at its middle.
  return 0;
}
`;

const PDF_BLANKS_PY = `def normal_pdf(x, mu, sigma):
    power = «1:-(x - mu) * (x - mu) / (2 * sigma * sigma)»
    return math.exp(power) / «2:(sigma * math.sqrt(2 * math.pi))»
`;
const CDF_BLANKS_PY = `def normal_cdf(x, mu, sigma, n):
    start = «3:mu - 8 * sigma»
    width = «4:(x - start) / n»
    total = 0
    for k in range(n):
        middle = «5:start + (k + 0.5) * width»
        total = total + «6:normal_pdf(middle, mu, sigma) * width»
    return total
`;
const PDF_BLANKS_JS = `function normalPdf(x, mu, sigma) {
  const power = «1:-(x - mu) * (x - mu) / (2 * sigma * sigma)»;
  return Math.exp(power) / «2:(sigma * Math.sqrt(2 * Math.PI))»;
}
`;
const CDF_BLANKS_JS = `function normalCdf(x, mu, sigma, n) {
  const start = «3:mu - 8 * sigma»;
  const width = «4:(x - start) / n»;
  let total = 0;
  for (let k = 0; k < n; k++) {
    const middle = «5:start + (k + 0.5) * width»;
    total = total + «6:normalPdf(middle, mu, sigma) * width»;
  }
  return total;
}
`;

const STANDARD: CurveInput = { xs: [-2, -1, 0, 1, 2], mu: 0, sigma: 1, n: 40 };
const WIDE: CurveInput = { xs: [-3, -1, 1, 3, 5], mu: 1, sigma: 2, n: 40 };

const curvesExercise: Exercise<CurveInput> = {
  slug: 'normal-cdf',
  title: 'The normal curve and its CDF',
  kind: 'write',
  visualiser: 'distributions',
  summary: 'Write the normal density from its formula, then its CDF, the area to its left, by adding up thin rectangles.',
  task: [
    'The normal density with centre μ (`mu`) and spread σ (`sigma`) is f(x) = e^(−(x − μ)²/(2σ²)) / (σ√(2π)). Write `normal_pdf(x, mu, sigma)` (`normalPdf` in JavaScript and TypeScript): `math.exp` (`Math.exp`) gives e to a power, and `math.sqrt(2 * math.pi)` (`Math.sqrt(2 * Math.PI)`) is √(2π).',
    'Its CDF, F(x) = P(X ≤ x), is the area under the density to the left of x. Write `normal_cdf(x, mu, sigma, n)` (`normalCdf`): start far to the left, at start = μ − 8σ, where the curve is all but 0, split the stretch from start to x into n rectangles of width (x − start)/n, and add up each one’s area, as tall as `normal_pdf` at its middle, start + (k + 0.5) × width.',
    '`curves` is written for you: it writes each height into `pdf` and each area into `cdf` (rounded to 6 places for the picture, since Python and JavaScript can disagree in the 16th digit of e to a power) and returns them in full to be checked.',
  ],
  entry: { python: 'curves', js: 'curves' },
  args,
  starter: { python: py(PDF_STUB_PY, CDF_STUB_PY), javascript: js(PDF_STUB_JS, CDF_STUB_JS), typescript: ts(js(PDF_STUB_JS, CDF_STUB_JS)) },
  solution: { python: py(PDF_PY, CDF_PY), javascript: js(PDF_JS, CDF_JS), typescript: ts(js(PDF_JS, CDF_JS)) },
  blanks: { python: py(PDF_BLANKS_PY, CDF_BLANKS_PY), javascript: js(PDF_BLANKS_JS, CDF_BLANKS_JS), typescript: ts(js(PDF_BLANKS_JS, CDF_BLANKS_JS)) },
  fades: [[2, 4], [1, 3, 5, 6], [1, 2, 3, 4, 5, 6]],
  distractors: {
    python: ['power = -(x - mu) * (x - mu) / (2 * sigma)', 'return math.exp(power) / (sigma * 2 * math.pi)', 'total = total + normal_pdf(middle, mu, sigma)'],
    javascript: ['const power = -(x - mu) * (x - mu) / (2 * sigma);', 'return Math.exp(power) / (sigma * 2 * Math.PI);', 'total = total + normalPdf(middle, mu, sigma);'],
    typescript: ['const power = -(x - mu) * (x - mu) / (2 * sigma);', 'return Math.exp(power) / (sigma * 2 * Math.PI);', 'total = total + normalPdf(middle, mu, sigma);'],
  },
  examples: [
    { id: 'standard', label: 'μ = 0, σ = 1, 40 rectangles', input: STANDARD },
    { id: 'wide', label: 'μ = 1, σ = 2, 40 rectangles', input: WIDE },
  ],
  tests: [
    { name: 'the standard normal', input: { xs: [-3, -2, -1, 0, 1, 2, 3], mu: 0, sigma: 1, n: 1000 } },
    { name: 'centre 1, spread 1.5', input: { xs: [-2, 0, 1, 2, 4, 5], mu: 1, sigma: 1.5, n: 1000 } },
    { name: 'a narrow curve, taller than 1', input: { xs: [9.5, 9.75, 10, 10.25, 10.5], mu: 10, sigma: 0.25, n: 800 } },
    { name: 'test scores: centre 65, spread 5', input: { xs: [50, 60, 65, 70, 75], mu: 65, sigma: 5, n: 1000 } },
    { name: 'only 40 rectangles', input: { xs: [-1.5, 0, 0.5, 1.5], mu: 0, sigma: 1, n: 40 } },
  ],
  check: checkCurves,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'The density has two parts: the power of e, −(x − μ)²/(2σ²), and what the whole is divided by, σ√(2π). In code the brackets matter: / (2 * sigma * sigma), not / 2 * sigma * sigma.',
    'For the CDF, start = mu − 8 * sigma and width = (x − start) / n. Rectangle k (k = 0 to n − 1) has its middle at start + (k + 0.5) * width.',
    'Each rectangle adds normal_pdf(middle, mu, sigma) * width: its height times its width. A chance is an area, so leave out the width and the sum is far too big.',
  ],
  legend: [
    { neutral: 'A value not worked out yet (0)' },
    { mark: 'write', label: 'A height or an area your code just wrote' },
  ],
};

export const distributionExercises: Exercise[] = [curvesExercise];

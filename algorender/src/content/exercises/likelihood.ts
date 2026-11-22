// Maximum likelihood as code (B6 of the math and ML path): the log-likelihood
// of measurements under a normal bell, each point's log density written into a
// visual array, and the maximum-likelihood bell itself, the mean and the root
// mean squared gap. The checks name the usual slips: multiplying the densities
// (which underflows) instead of adding their logs, dropping the ln σ term or
// the whole constant, a lost 2 or square, ÷ (n − 1) for σ, a forgotten square
// root, the median for μ, and the average size of the gaps for σ.
//
// Python's math.log and JavaScript's Math.log can differ in the last bit, and
// exercises.test.ts needs both languages to write the same numbers into the
// visual arrays. So log densities go into `logs` rounded to 6 places, and the
// total is returned in full, which the check compares with a tolerance. The
// fit is plain + − × ÷ and a square root, the same in both languages.

import { fitGaussian, logDensity, median, meanAbsGap, sampleSd, squaredGaps } from '@/algorithms/probability/maximum-likelihood';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const close = (a: unknown, b: number, rel = 1e-9) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const fmt = (v: number, digits = 4) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[], digits = 4) => `[${vs.map((v) => fmt(v, digits)).join(', ')}]`;
const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

/** The learner's visual array `name` as the events built it, up to the end of the run or its error. */
function arrayFromEvents(result: RunResult, name: string): number[] | null {
  let id: string | null = null;
  let values: number[] = [];
  for (const e of result.events) {
    if (e.kind === 'array' && e.name === name) {
      id = e.array;
      values = [...e.values];
    } else if (id != null && e.kind === 'write' && e.array === id) values[e.index] = e.value;
  }
  return id == null ? null : values;
}

// ───────────────────────────── 1. log-likelihood ─────────────────────────────

export type LogLikelihoodInput = { xs: number[]; mu: number; sigma: number };

const llArgs = ({ xs, mu, sigma }: LogLikelihoodInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'value', name: 'mu', value: mu },
  { kind: 'value', name: 'sigma', value: sigma },
  { kind: 'array', name: 'logs', values: xs.map(() => 0) },
];

/** Each point's log density and their total, as the reference works them out. */
export function logLikelihood({ xs, mu, sigma }: LogLikelihoodInput): { logs: number[]; total: number } {
  const logs = xs.map((x) => logDensity(x, mu, sigma));
  let total = 0;
  for (const d of logs) total = total + d;
  return { logs, total };
}

/** −∞ as each runtime hands it back: a number in JavaScript, text from Python. */
const minusInfinity = (v: unknown) => v === -Infinity || v === '-Infinity' || v === '-inf';

function checkLogLikelihood(input: LogLikelihoodInput, result: RunResult): Verdict {
  const { xs, mu, sigma } = input;
  const densities = xs.map((x) => Math.exp(logDensity(x, mu, sigma)));
  const product = densities.reduce((s, d) => s * d, 1);
  const underflowed = 'Multiplied together, the densities underflow to 0 (each is tiny, so their product is smaller than the smallest float), and the log of 0 is −∞. Add the logs instead: ln(a × b) = ln a + ln b, so ln L = Σ ln f(xᵢ).';
  if (result.error && /math domain error|expected a positive input/.test(result.error.message)) return { pass: false, message: `${underflowed} In Python, math.log(0) stops with a ValueError.` };
  const failed = crashed(result);
  if (failed) return failed;
  const want = logLikelihood(input);
  const got = result.returned;
  const logs = arrayFromEvents(result, 'logs');
  if (minusInfinity(got)) return { pass: false, message: underflowed };
  if (typeof got !== 'number') return { pass: false, message: 'Return ln L, the total of the log densities: a single number.' };

  if (close(got, want.total)) {
    if (!logs || !logs.every((v, i) => Math.abs(v - want.logs[i]) <= 1.5e-6)) return { pass: false, message: `ln L is right, but logs should hold each point’s log density, rounded to 6 places: ${list(want.logs)}.` };
    return { pass: true, message: `ln L = ${fmt(want.total)}: the log densities ${list(want.logs, 3)} added up, with no product to underflow.` };
  }
  if (got === 0 && want.total !== 0 && product === 0) return { pass: false, message: `You returned 0, which is what the product of the densities comes to here: it underflows. ${underflowed}` };
  if (got !== 0 && Math.abs(got - product) <= 1e-6 * product) return { pass: false, message: `${fmt(got, 6)} is L itself, the densities multiplied together. Return its log, and get it by adding logs, ln f(x) = −ln(σ√(2π)) − (x − μ)²/(2σ²), not by multiplying: with many points the product underflows to 0.` };
  if (close(got, 0) && logs?.every((v) => v === 0)) return { pass: false, message: 'You returned 0 and logs is still all 0s: work out each point’s log density with log_density, write it into logs, and add them up.' };

  const each = (f: (gap: number) => number) => sum(xs.map((x) => f(x - mu)));
  const c = Math.log(sigma * SQRT_2PI);
  const slips: [number, string][] = [
    [each((g) => -Math.log(SQRT_2PI) - (g * g) / (2 * sigma * sigma)), `You dropped the ln σ part of the constant: −ln(σ√(2π)) = −ln σ − ln √(2π), and with σ = ${fmt(sigma)} the ln σ = ${fmt(Math.log(sigma))} counts once for every point. It is what makes a too-wide bell lose.`],
    [each((g) => -(g * g) / (2 * sigma * sigma)), `You left out −ln(σ√(2π)), the log of the 1/(σ√(2π)) in front of the density (${fmt(-c)} for every point here). It doesn’t move the best μ, but it does decide the best σ, and ln L is wrong without it.`],
    [each((g) => c - (g * g) / (2 * sigma * sigma)), 'The constant has the wrong sign: dividing by σ√(2π) subtracts its log, so it is −ln(σ√(2π)), not +.'],
    [each((g) => -c - (g * g) / (sigma * sigma)), 'The gap part is missing its 2: it is −(x − μ)²/(2σ²), half of the squared gap over σ².'],
    [each((g) => -c - (g * g) / (2 * sigma)), 'In the gap part you divided by 2σ: it is 2σ², σ squared.'],
    [each((g) => -c - ((g * g) / 2) * sigma * sigma), 'In code, / 2 * sigma * sigma divides by 2 and then multiplies by σ². Put brackets round the whole divisor: / (2 * sigma * sigma).'],
    [each((g) => -c - g / (2 * sigma * sigma)), 'Square the gap: the power of e is −(x − μ)²/(2σ²), so ln f(x) has (x − μ)², and points on both sides of μ count against it.'],
    [each((g) => -c + (g * g) / (2 * sigma * sigma)), 'The gap part has lost its minus: points far from μ must have smaller log densities, so it is −(x − μ)²/(2σ²).'],
    [want.total / Math.LN10, 'That is the log in base 10. ln is the natural log, base e (math.log in Python, Math.log in JavaScript): the e in the density’s formula only comes off with ln.'],
    [want.total / xs.length, `You divided by the number of points: that is the average log density. ln L is the plain total, Σ ln f(xᵢ) = ${fmt(want.total)}.`],
  ];
  for (const [value, message] of slips) if (close(got, value, 1e-6)) return { pass: false, message };
  return { pass: false, message: `For μ = ${fmt(mu)} and σ = ${fmt(sigma)}, ln L = Σ [−ln(σ√(2π)) − (x − μ)²/(2σ²)] = ${fmt(want.total)}, but your code returns ${fmt(got)}.` };
}

const LL_PY = `import math


def log_density(x, mu, sigma):
    gap = x - mu
    return -math.log(sigma * math.sqrt(2 * math.pi)) - gap * gap / (2 * sigma * sigma)


def log_likelihood(xs, mu, sigma, logs):
    total = 0
    for i in range(len(xs)):
        d = log_density(xs[i], mu, sigma)
        logs[i] = round(d, 6)
        total = total + d
    return total
`;
const LL_BLANKS_PY = `import math


def log_density(x, mu, sigma):
    gap = x - mu
    return «1:-math.log(sigma * math.sqrt(2 * math.pi))» - «2:gap * gap / (2 * sigma * sigma)»


def log_likelihood(xs, mu, sigma, logs):
    total = 0
    for i in range(len(xs)):
        d = «3:log_density(xs[i], mu, sigma)»
        logs[i] = round(d, 6)
        total = «4:total + d»
    return total
`;
const LL_JS = `function logDensity(x, mu, sigma) {
  const gap = x - mu;
  return -Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma * sigma);
}

function logLikelihood(xs, mu, sigma, logs) {
  let total = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = logDensity(xs[i], mu, sigma);
    logs[i] = Math.round(d * 1e6) / 1e6;
    total = total + d;
  }
  return total;
}
`;
const LL_BLANKS_JS = `function logDensity(x, mu, sigma) {
  const gap = x - mu;
  return «1:-Math.log(sigma * Math.sqrt(2 * Math.PI))» - «2:gap * gap / (2 * sigma * sigma)»;
}

function logLikelihood(xs, mu, sigma, logs) {
  let total = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = «3:logDensity(xs[i], mu, sigma)»;
    logs[i] = Math.round(d * 1e6) / 1e6;
    total = «4:total + d»;
  }
  return total;
}
`;
const LL_STARTER_PY = `import math


def log_density(x, mu, sigma):
    # ln f(x) for the normal density f(x) = e^(-(x - mu)² / (2 sigma²)) / (sigma √(2π)):
    # the log of 1/(sigma √(2π)), plus the power of e.
    return 0


def log_likelihood(xs, mu, sigma, logs):
    # ln L = log_density(x, mu, sigma) added up over the xs.
    # Write each one into logs[i] as round(d, 6), and return the total.
    return 0
`;
const LL_STARTER_JS = `function logDensity(x, mu, sigma) {
  // ln f(x) for the normal density f(x) = e^(-(x - mu)² / (2 sigma²)) / (sigma √(2π)):
  // the log of 1/(sigma √(2π)), plus the power of e.
  return 0;
}

function logLikelihood(xs, mu, sigma, logs) {
  // ln L = logDensity(x, mu, sigma) added up over the xs.
  // Write each one into logs[i] as Math.round(d * 1e6) / 1e6, and return the total.
  return 0;
}
`;
const llTs = (js: string) =>
  js
    .replace('function logDensity(x, mu, sigma) {', 'function logDensity(x: number, mu: number, sigma: number): number {')
    .replace('function logLikelihood(xs, mu, sigma, logs) {', 'function logLikelihood(xs: number[], mu: number, sigma: number, logs: number[]): number {');

/** The lesson's eight measurements. */
const MEASUREMENTS = [2.5, 3.5, 4, 4.5, 5, 5.5, 7, 10];

const logLikelihoodExercise: Exercise<LogLikelihoodInput> = {
  slug: 'log-likelihood',
  title: 'The log-likelihood of a normal bell',
  kind: 'write',
  visualiser: 'maximum-likelihood',
  summary: 'Add up the log densities of the measurements under a normal bell, instead of multiplying densities that underflow.',
  task: [
    'Under a normal bell with centre μ (`mu`) and spread σ (`sigma`), a measurement x has density f(x) = e^(−(x − μ)²/(2σ²)) / (σ√(2π)). The likelihood L of all the measurements is their densities multiplied together; with many measurements that product underflows to 0, so work with its log, ln L, the sum of the log densities.',
    'Write `log_density(x, mu, sigma)` (`logDensity` in JavaScript and TypeScript): ln f(x) = −ln(σ√(2π)) − (x − μ)²/(2σ²). `math.log` (`Math.log`) is ln, and `math.sqrt(2 * math.pi)` (`Math.sqrt(2 * Math.PI)`) is √(2π).',
    'Then `log_likelihood(xs, mu, sigma, logs)` (`logLikelihood`): write each measurement’s log density into `logs[i]`, rounded to 6 places so the picture stays readable, and return their total in full.',
  ],
  entry: { python: 'log_likelihood', js: 'logLikelihood' },
  args: llArgs,
  starter: { python: LL_STARTER_PY, javascript: LL_STARTER_JS, typescript: llTs(LL_STARTER_JS) },
  solution: { python: LL_PY, javascript: LL_JS, typescript: llTs(LL_JS) },
  blanks: { python: LL_BLANKS_PY, javascript: LL_BLANKS_JS, typescript: llTs(LL_BLANKS_JS) },
  fades: [[4], [1, 3], [1, 2, 3, 4]],
  distractors: {
    python: ['    return -gap * gap / (2 * sigma * sigma)', '        total = total * d', '    return -math.log(sigma * math.sqrt(2 * math.pi)) - gap * gap / (2 * sigma)'],
    javascript: ['  return -gap * gap / (2 * sigma * sigma);', '    total = total * d;', '  return -Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma);'],
    typescript: ['  return -gap * gap / (2 * sigma * sigma);', '    total = total * d;', '  return -Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma);'],
  },
  examples: [
    { id: 'measurements', label: 'Eight measurements, μ = 4 and σ = 1.5', input: { xs: [...MEASUREMENTS], mu: 4, sigma: 1.5 } },
    { id: 'three', label: 'Three points under the standard bell', input: { xs: [-1, 0, 2], mu: 0, sigma: 1 } },
  ],
  tests: [
    { name: 'eight measurements, μ = 4 and σ = 1.5', input: { xs: [...MEASUREMENTS], mu: 4, sigma: 1.5 } },
    { name: 'the same measurements, centred at their mean, σ = 2', input: { xs: [...MEASUREMENTS], mu: 5.25, sigma: 2 } },
    { name: 'the standard bell', input: { xs: [-1, 0, 1, 2], mu: 0, sigma: 1 } },
    { name: 'a narrow bell, denser than 1 at its centre', input: { xs: [9.8, 10, 10.1, 10.3], mu: 10, sigma: 0.25 } },
    { name: 'a guess far from the data: every density tiny', input: { xs: [30, 32, 35, 37], mu: 0, sigma: 1 } },
  ],
  check: checkLogLikelihood,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'log_density has two parts, both from the formula for f: the log of 1/(σ√(2π)), which is −ln(σ√(2π)), and the log of e to a power, which is just the power, −(x − μ)²/(2σ²).',
    'Never multiply the densities together: with points far from μ each one is tiny and their product underflows to 0. ln(a × b) = ln a + ln b, so add the log densities instead.',
    'In code the brackets matter: gap * gap / (2 * sigma * sigma), not / 2 * sigma * sigma. Write logs[i] = round(d, 6) (Math.round(d * 1e6) / 1e6 in JavaScript), but add the full d to the total.',
  ],
  legend: [
    { neutral: 'A log density not worked out yet (0)' },
    { mark: 'write', label: 'The log density your code just wrote' },
  ],
};

// ───────────────────────────── 2. fit-gaussian ─────────────────────────────

export type FitInput = { xs: number[] };

const fitArgs = ({ xs }: FitInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'array', name: 'gaps', values: xs.map(() => 0) },
];

function checkFit({ xs }: FitInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const n = xs.length;
  const best = fitGaussian(xs);
  const got = result.returned;
  if (!Array.isArray(got) || got.length !== 2 || !got.every((v) => typeof v === 'number')) return { pass: false, message: 'Return a list of two numbers, [mu, sigma].' };
  const [mu, sigma] = got as [number, number];
  const gaps = arrayFromEvents(result, 'gaps');
  const want = xs.map((x) => (x - best.mu) * (x - best.mu));
  const spread = squaredGaps(xs, best.mu);

  if (close(mu, best.mu) && close(sigma, best.sigma)) {
    if (!gaps || !gaps.every((g, i) => close(g, want[i]))) return { pass: false, message: `μ and σ are right, but gaps should hold each squared gap (x − μ)²: ${list(want)}.` };
    return { pass: true, message: `μ = ${fmt(best.mu)} and σ = ${fmt(best.sigma)}: the mean, and the root mean squared gap from it, dividing by n = ${n}. No other normal bell makes these measurements more likely.` };
  }
  if (close(mu, best.sigma) && close(sigma, best.mu)) return { pass: false, message: 'Both numbers are right but swapped: return [mu, sigma], the centre first.' };
  if (close(mu, 0) && close(sigma, 0)) return { pass: false, message: 'You returned [0, 0]: add up the xs and divide by n for μ, then work out the squared gaps from μ.' };
  if (!close(mu, best.mu)) {
    if (n > 2 && close(mu, median(xs)) && !close(median(xs), best.mu)) return { pass: false, message: `${fmt(mu)} is the median, the middle measurement. ln L is highest at the mean, ${fmt(best.mu)}: the squared gaps weigh the far measurements, and the mean is where Σ (x − μ)² is least.` };
    if (close(mu, best.mu * n)) return { pass: false, message: `${fmt(mu)} is the total of the measurements: divide it by n = ${n} for the mean.` };
    if (close(mu, sum(xs) / (n - 1))) return { pass: false, message: `For μ you divided by n − 1: the mean is the total over n = ${n}.` };
    return { pass: false, message: `μ should be the mean of the measurements, ${fmt(best.mu)}, but it is ${fmt(mu)}.` };
  }
  const slips: [number, string][] = [
    [sampleSd(xs), `You divided by n − 1 = ${n - 1}: that is a calculator’s “sample standard deviation”, ${fmt(sampleSd(xs))}. The maximum-likelihood σ divides by n = ${n}, giving ${fmt(best.sigma)}.`],
    [spread / n, `${fmt(spread / n)} is σ², the mean squared gap. Take its square root: σ = ${fmt(best.sigma)}.`],
    [spread / (n - 1), `${fmt(spread / (n - 1))} divides by n − 1 and skips the square root: divide by n = ${n}, then take the square root.`],
    [meanAbsGap(xs), `${fmt(meanAbsGap(xs))} is the average size of the gaps, |x − μ|. The bell’s σ squares them first: σ = √(Σ (x − μ)² / n) = ${fmt(best.sigma)}.`],
    [Math.sqrt(spread) / n, 'You took the square root before dividing by n: divide Σ (x − μ)² by n first, then take the square root of that.'],
    [Math.sqrt(squaredGaps(xs, 0) / n), 'Your σ uses the squared measurements, x², not the squared gaps from the mean: subtract μ first, (x − μ)².'],
    [Math.sqrt(spread), `You took the square root of the total, Σ (x − μ)². Divide by n = ${n} first: σ is the root of the mean squared gap.`],
  ];
  for (const [value, message] of slips) if (close(sigma, value)) return { pass: false, message };
  return { pass: false, message: `μ = ${fmt(best.mu)} is right. σ should be √(Σ (x − μ)² / n) = ${fmt(best.sigma)}, but it is ${fmt(sigma)}.` };
}

const FIT_PY = `import math


def fit_gaussian(xs, gaps):
    n = len(xs)
    total = 0
    for x in xs:
        total = total + x
    mu = total / n
    spread = 0
    for i in range(n):
        gaps[i] = (xs[i] - mu) * (xs[i] - mu)
        spread = spread + gaps[i]
    sigma = math.sqrt(spread / n)
    return [mu, sigma]
`;
const FIT_JS = `function fitGaussian(xs, gaps) {
  const n = xs.length;
  let total = 0;
  for (const x of xs) {
    total = total + x;
  }
  const mu = total / n;
  let spread = 0;
  for (let i = 0; i < n; i++) {
    gaps[i] = (xs[i] - mu) * (xs[i] - mu);
    spread = spread + gaps[i];
  }
  const sigma = Math.sqrt(spread / n);
  return [mu, sigma];
}
`;
const FIT_STARTER_PY = `import math


def fit_gaussian(xs, gaps):
    # The normal bell that makes xs most likely:
    #   mu = the mean of the xs
    #   gaps[i] = (xs[i] - mu)², then sigma = √(the mean of the gaps)
    return [0, 0]
`;
const FIT_STARTER_JS = `function fitGaussian(xs, gaps) {
  // The normal bell that makes xs most likely:
  //   mu = the mean of the xs
  //   gaps[i] = (xs[i] - mu)², then sigma = √(the mean of the gaps)
  return [0, 0];
}
`;
const fitTs = (js: string) => js.replace('function fitGaussian(xs, gaps) {', 'function fitGaussian(xs: number[], gaps: number[]): number[] {');

const fitExercise: Exercise<FitInput> = {
  slug: 'fit-gaussian',
  title: 'Fit a normal bell by maximum likelihood',
  kind: 'write',
  visualiser: 'maximum-likelihood',
  summary: 'The maximum-likelihood normal bell: μ is the mean, and σ the root mean squared gap from it, dividing by n.',
  task: [
    'Of all the normal bells, the one that makes measurements `xs` most likely has its centre μ at their mean, and its spread σ = √(Σ (x − μ)² / n): the root of the mean squared gap from μ, dividing by n, the number of measurements.',
    'Write `fit_gaussian(xs, gaps)` (`fitGaussian` in JavaScript and TypeScript): work out μ, put each squared gap (xs[i] − μ)² into `gaps[i]`, and return `[mu, sigma]`. `math.sqrt` (`Math.sqrt`) takes a square root.',
  ],
  entry: { python: 'fit_gaussian', js: 'fitGaussian' },
  args: fitArgs,
  starter: { python: FIT_STARTER_PY, javascript: FIT_STARTER_JS, typescript: fitTs(FIT_STARTER_JS) },
  solution: { python: FIT_PY, javascript: FIT_JS, typescript: fitTs(FIT_JS) },
  distractors: {
    python: ['    sigma = math.sqrt(spread / (n - 1))', '    sigma = spread / n'],
    javascript: ['  const sigma = Math.sqrt(spread / (n - 1));', '  const sigma = spread / n;'],
    typescript: ['  const sigma = Math.sqrt(spread / (n - 1));', '  const sigma = spread / n;'],
  },
  examples: [
    { id: 'measurements', label: 'The lesson’s eight measurements', input: { xs: [...MEASUREMENTS] } },
    { id: 'three', label: 'Three measurements: 2, 4, 9', input: { xs: [2, 4, 9] } },
  ],
  tests: [
    { name: 'eight measurements, one far out', input: { xs: [...MEASUREMENTS] } },
    { name: 'three measurements', input: { xs: [2, 4, 9] } },
    { name: 'heights in cm', input: { xs: [158, 162, 165, 171, 174, 180] } },
    { name: 'two measurements', input: { xs: [3, 7] } },
    { name: 'not in order, with a repeat', input: { xs: [5.5, 1, 4, 4, 8.5] } },
  ],
  check: checkFit,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Two loops: one adds up the xs, so mu = total / n; the next fills gaps[i] = (xs[i] − mu)² and adds them up.',
    'σ divides by n, not n − 1: the maximum-likelihood bell uses the plain mean of the squared gaps.',
    'Then take the square root of that mean: math.sqrt(spread / n). Without the root you have σ², in squared units.',
  ],
  legend: [
    { neutral: 'A squared gap not worked out yet (0)' },
    { mark: 'write', label: 'The squared gap (x − μ)² just written' },
  ],
};

export const likelihoodExercises: Exercise[] = [logLikelihoodExercise, fitExercise];

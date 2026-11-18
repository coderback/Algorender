// The math toolkit, as code: the learner works out a moved graph's values, adds
// log-probabilities instead of multiplying probabilities, writes the variance
// as the two loops its Σs stand for, and turns a point with sine and cosine.
// Each writes its answers into a visual array, so the run shows them landing.
//
// Python and JavaScript must write the same numbers (exercises.test.ts), so the
// inputs keep the arithmetic exact where it can be: whole and half numbers,
// probabilities that are powers of two (whose log₂ is a whole number), and
// angles whose sines both runtimes compute alike.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const TOLERANCE = 1e-9;
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));

const fmt = (v: number) => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;

/** The learner's visual array `name` at the end of the run. */
function arrayOf(result: RunResult, name: string): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  return made && made.kind === 'array' ? (result.arrays[made.array] ?? null) : null;
}

const WRITE_LEGEND: Exercise['legend'] = [
  { neutral: 'A value not written yet' },
  { mark: 'write', label: 'A value your code just wrote' },
];

// ───────────────────────────── 1. a moved graph ─────────────────────────────

export type GraphInput = { a: number; h: number; k: number; xs: number[] };

const graphArgs = ({ a, h, k, xs }: GraphInput): Arg[] => [
  { kind: 'value', name: 'a', value: a },
  { kind: 'value', name: 'h', value: h },
  { kind: 'value', name: 'k', value: k },
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'array', name: 'ys', values: xs.map(() => 0) },
];

/** y = a·(x − h)² + k at each x. */
export const graphValues = ({ a, h, k, xs }: GraphInput) => xs.map((x) => a * (x - h) * (x - h) + k);

/** “ + 2” or “ − 2”, so a negative number never reads as “+ −2”. */
const signed = (v: number) => (v < 0 ? ` − ${fmt(-v)}` : ` + ${fmt(v)}`);
const formula = ({ a, h, k }: GraphInput) => `${a === 1 ? '' : a === -1 ? '−' : fmt(a)}(x${signed(-h)})²${k === 0 ? '' : signed(k)}`.replace('(x + 0)', 'x').replace('x²', 'x²');
function moves({ a, h, k }: GraphInput): string {
  const parts = [
    a < 0 ? 'flipped' : '',
    Math.abs(a) > 1 ? `stretched ${fmt(Math.abs(a))} times taller` : Math.abs(a) < 1 && a !== 0 ? `squashed to ${fmt(Math.abs(a))} of its height` : '',
    h ? `moved ${h > 0 ? 'right' : 'left'} ${fmt(Math.abs(h))}` : '',
    k ? `moved ${k > 0 ? 'up' : 'down'} ${fmt(Math.abs(k))}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'left exactly where it was';
}

function checkGraph(input: GraphInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = arrayOf(result, 'ys');
  if (!got) return { pass: false, message: 'Write each value into ys: ys[i] for xs[i].' };
  const want = graphValues(input);
  if (matches(got, want)) return { pass: true, message: `ys = ${list(want)}: the table of y = ${formula(input)}, which is x² ${moves(input)}.` };
  const { a, h, k, xs } = input;
  if (got.every((v) => v === 0)) return { pass: false, message: 'Every value is still 0: write a·(x − h)² + k into ys[i] for each xs[i].' };
  if (matches(got, xs.map((x) => a * (x + h) * (x + h) + k))) return { pass: false, message: 'You used x + h, which moves the graph left. To move it right by h, every output must arrive h later: use x − h.' };
  if (matches(got, xs.map((x) => a * (x - h) * (x - h)))) return { pass: false, message: 'The shape and the sideways move are right, but every value is k too low: add k at the end.' };
  if (matches(got, xs.map((x) => (a * (x - h)) ** 2 + k))) return { pass: false, message: 'Square (x − h) first, then multiply by a: a·(x − h)², not (a·(x − h))².' };
  const i = want.findIndex((v, j) => !close(got[j], v));
  return { pass: false, message: `At x = ${fmt(xs[i])}, y should be ${fmt(a)}·(${fmt(xs[i])}${signed(-h)})²${signed(k)} = ${fmt(want[i])}, but your code gives ${fmt(got[i])}.` };
}

const GRAPH_PY = `def graph_values(a, h, k, xs, ys):
    for i in range(len(xs)):
        x = xs[i]
        ys[i] = a * (x - h) * (x - h) + k
    return ys
`;
const GRAPH_JS = `function graphValues(a, h, k, xs, ys) {
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    ys[i] = a * (x - h) * (x - h) + k;
  }
  return ys;
}
`;
const GRAPH_SIG_TS = 'function graphValues(a: number, h: number, k: number, xs: number[], ys: number[]): number[] {';
const GRAPH_TS = GRAPH_JS.replace('function graphValues(a, h, k, xs, ys) {', GRAPH_SIG_TS);

const graphExercise: Exercise<GraphInput> = {
  slug: 'graph-values',
  title: 'Fill in a moved parabola',
  kind: 'write',
  visualiser: 'functions',
  summary: 'Work out y = a·(x − h)² + k at each x: the table of values behind a stretched and shifted graph.',
  task: [
    'Write `graph_values(a, h, k, xs, ys)` (`graphValues` in JavaScript and TypeScript). For each `xs[i]`, put y = a·(x − h)² + k into `ys[i]`, then return `ys`.',
    'That is the parabola y = x² stretched by `a`, moved right by `h` and up by `k`. The values you write are the table a graph is drawn from.',
  ],
  entry: { python: 'graph_values', js: 'graphValues' },
  args: graphArgs,
  starter: {
    python: `def graph_values(a, h, k, xs, ys):
    # Put a * (x - h)² + k into ys[i] for each xs[i].
    return ys
`,
    javascript: `function graphValues(a, h, k, xs, ys) {
  // Put a * (x - h)² + k into ys[i] for each xs[i].
  return ys;
}
`,
    typescript: `${GRAPH_SIG_TS}
  // Put a * (x - h)² + k into ys[i] for each xs[i].
  return ys;
}
`,
  },
  solution: { python: GRAPH_PY, javascript: GRAPH_JS, typescript: GRAPH_TS },
  distractors: { python: ['        ys[i] = a * (x + h) * (x + h) + k'], javascript: ['    ys[i] = a * (x + h) * (x + h) + k;'], typescript: ['    ys[i] = a * (x + h) * (x + h) + k;'] },
  examples: [
    { id: 'moved', label: '(x − 2)² − 1', input: { a: 1, h: 2, k: -1, xs: [0, 1, 2, 3, 4] } },
    { id: 'flipped', label: '−0.5(x + 1)² + 3', input: { a: -0.5, h: -1, k: 3, xs: [-3, -2, -1, 0, 1] } },
  ],
  tests: [
    { name: 'right 2, down 1', input: { a: 1, h: 2, k: -1, xs: [0, 1, 2, 3, 4] } },
    { name: 'left 1, flipped and flattened', input: { a: -0.5, h: -1, k: 3, xs: [-3, -2, -1, 0, 1] } },
    { name: 'no move at all', input: { a: 1, h: 0, k: 0, xs: [-2, -1, 0, 1, 2] } },
    { name: 'steeper, half-way inputs', input: { a: 3, h: 0.5, k: 2, xs: [-1, -0.5, 0, 0.5, 1, 1.5, 2] } },
    { name: 'one input', input: { a: 2, h: -3, k: -4, xs: [1] } },
  ],
  check: checkGraph,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Loop over the indexes of xs. Each time round, read x = xs[i] and write one value into ys[i].',
    'Moving right by h means the old output for 0 now appears at x = h, so the bracket is (x − h), not (x + h).',
    'Order matters: subtract h, square, multiply by a, then add k.',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 2. logs, not products ─────────────────────────────

export type LogProbInput = { ps: number[] };

const logProbArgs = ({ ps }: LogProbInput): Arg[] => [
  { kind: 'value', name: 'ps', value: ps },
  { kind: 'array', name: 'running', values: ps.map(() => 0) },
];

/** log₂ of the product of the probabilities, as a sum of logs. */
export const logProb = ({ ps }: LogProbInput) => ps.reduce((s, p) => s + Math.log2(p), 0);
/** The same product, multiplied out directly: it underflows to 0 for long inputs. */
export const directProduct = ({ ps }: LogProbInput) => ps.reduce((s, p) => s * p, 1);

function checkLogProb(input: LogProbInput, result: RunResult): Verdict {
  const want = logProb(input);
  const n = input.ps.length;
  if (result.error) {
    // Python 3.13 says "math domain error"; 3.14 says "expected a positive input, got 0.0".
    if (/domain|positive input/i.test(result.error.message)) {
      return { pass: false, message: `math.log2 was given 0: the product of ${n} probabilities is smaller than the tiniest float, so it rounded to 0 before the log was taken. Add the logs as you go instead.` };
    }
    return crashed(result)!;
  }
  // JSON has no −∞: the JavaScript runtime sends it as the string '-Infinity', and a worker may drop it altogether.
  const raw = result.returned;
  const got = raw === '-Infinity' ? -Infinity : raw === 'Infinity' ? Infinity : raw;
  // A running product that reached 0 is the underflow, whatever form the −∞ came back in.
  const running = arrayOf(result, 'running');
  if ((got == null || (typeof got === 'number' && !Number.isFinite(got))) && (running ? running.some((v) => v === 0) : true)) {
    return { pass: false, message: `You returned −∞: the product of ${n} probabilities underflowed to 0 (it is smaller than the tiniest float), and log₂ 0 is −∞. Add log₂ p for each p instead of multiplying.` };
  }
  if (typeof got !== 'number' || Number.isNaN(got)) return { pass: false, message: 'Return the total log₂-probability, a single number.' };
  if (!Number.isFinite(got)) {
    return { pass: false, message: `You returned ${fmt(got)}: the product of ${n} probabilities underflowed to 0 (it is smaller than the tiniest float), and log₂ 0 is −∞. Add log₂ p for each p instead of multiplying.` };
  }
  if (close(got, want)) return { pass: true, message: `log₂ P = ${fmt(want)}: the probability is 2^${fmt(want)}${want < -1074 ? ', far too small for a float, but its log is an everyday number' : `, which is ${2 ** want}`}.` };
  if (close(got, want * Math.LN2)) return { pass: false, message: 'That is the natural log (ln). This total is in bits: use log2 (math.log2 or Math.log2).' };
  if (close(got, -want)) return { pass: false, message: 'The sign is flipped: log₂ of a probability below 1 is negative, so the total should be negative too.' };
  return { pass: false, message: `The total should be ${fmt(want)}, but your code returns ${fmt(got)}. Add log₂ p for every p.` };
}

const LOG_BUG_PY = `import math


def log_prob(ps, running):
    total = 1.0
    for i in range(len(ps)):
        total = total * ps[i]
        running[i] = total
    return math.log2(total)
`;
const LOG_PY = `import math


def log_prob(ps, running):
    total = 0.0
    for i in range(len(ps)):
        total = total + math.log2(ps[i])
        running[i] = total
    return total
`;
const LOG_BUG_JS = `function logProb(ps, running) {
  let total = 1;
  for (let i = 0; i < ps.length; i++) {
    total = total * ps[i];
    running[i] = total;
  }
  return Math.log2(total);
}
`;
const LOG_JS = `function logProb(ps, running) {
  let total = 0;
  for (let i = 0; i < ps.length; i++) {
    total = total + Math.log2(ps[i]);
    running[i] = total;
  }
  return total;
}
`;
const LOG_SIG_TS = 'function logProb(ps: number[], running: number[]): number {';
const toTs = (js: string) => js.replace('function logProb(ps, running) {', LOG_SIG_TS);

const repeat = (n: number, pattern: number[]) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
/** 120 words, each about one chance in a thousand (2⁻⁹, 2⁻¹⁰, 2⁻¹¹): 2⁻¹²⁰⁰ in all, far below the smallest float. */
const SENTENCE = repeat(120, [2 ** -10, 2 ** -9, 2 ** -11]);

const logProbExercise: Exercise<LogProbInput> = {
  slug: 'log-probability',
  title: 'Fix a probability that vanishes',
  kind: 'bug',
  visualiser: 'logarithms',
  summary: 'Multiplying a sentence’s word probabilities underflows to 0. Add their logs instead.',
  task: [
    '`log_prob(ps, running)` (`logProb` in JavaScript and TypeScript) should return log₂ of the chance that every event in `ps` happens: log₂(p₁ × p₂ × … × pₙ). It writes its running total into `running` as it goes.',
    'It works for a handful of events, but on a 120-word sentence, each word about one chance in a thousand, it returns −∞ (Python stops with a ValueError instead), although every probability is an ordinary number. Run it, watch `running`, and fix it.',
  ],
  entry: { python: 'log_prob', js: 'logProb' },
  args: logProbArgs,
  starter: { python: LOG_BUG_PY, javascript: LOG_BUG_JS, typescript: toTs(LOG_BUG_JS) },
  solution: { python: LOG_PY, javascript: LOG_JS, typescript: toTs(LOG_JS) },
  bug: {
    symptom: 'On a few events the answer is right; on a 120-word sentence it is −∞, or a ValueError in Python.',
    explanation: 'The product of the sentence’s 120 probabilities is 2⁻¹²⁰⁰, far below the smallest float (about 2⁻¹⁰⁷⁴), so it rounds to 0 and log₂ 0 is −∞. Since log(a·b) = log a + log b, adding log₂ p for each p gives the same answer without ever forming the tiny product.',
  },
  examples: [
    { id: 'few', label: 'Four events', input: { ps: [0.5, 0.25, 0.5, 0.125] } },
    { id: 'sentence', label: 'A 120-word sentence', input: { ps: SENTENCE } },
  ],
  tests: [
    { name: 'four events', input: { ps: [0.5, 0.25, 0.5, 0.125] } },
    { name: 'a sure thing', input: { ps: [1, 1, 0.5] } },
    { name: 'a 120-word sentence: the product underflows', input: { ps: SENTENCE } },
    { name: '1200 coin flips', input: { ps: repeat(1200, [0.5]) } },
    { name: '600 rolls of a four-sided die', input: { ps: repeat(600, [0.25]) } },
  ],
  check: checkLogProb,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Step through the long example and watch `running`: the product shrinks about a thousandfold with each word until it becomes exactly 0.',
    'log(a·b) = log a + log b. What should the total start at, if it is a sum?',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 3. the variance as two Σs ─────────────────────────────

export type VarianceInput = { xs: number[] };

const varianceArgs = ({ xs }: VarianceInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'array', name: 'dev', values: xs.map(() => 0) },
];

/** σ² = (1/n) Σ (xᵢ − x̄)², with x̄ = (1/n) Σ xᵢ. */
export function variance(xs: readonly number[]): { mean: number; dev: number[]; variance: number } {
  const n = xs.length;
  let total = 0;
  for (const x of xs) total += x;
  const mean = total / n;
  const dev = xs.map((x) => (x - mean) * (x - mean));
  let sq = 0;
  for (const d of dev) sq += d;
  return { mean, dev, variance: sq / n };
}

function checkVariance(input: VarianceInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const want = variance(input.xs);
  const got = result.returned;
  const dev = arrayOf(result, 'dev');
  if (typeof got !== 'number') return { pass: false, message: 'Return the variance, a single number.' };
  const { xs } = input;
  const n = xs.length;
  if (close(got, want.variance)) {
    if (dev && !matches(dev, want.dev)) return { pass: false, message: `The variance is right, but dev should hold each squared gap (xᵢ − x̄)²: ${list(want.dev)}.` };
    return { pass: true, message: `x̄ = ${fmt(want.mean)} and σ² = ${fmt(want.variance)}: the average squared distance from the mean.` };
  }
  if (n > 1 && close(got, (want.variance * n) / (n - 1))) return { pass: false, message: 'You divided by n − 1. That is the sample variance, a different formula; this one is (1/n) Σ (xᵢ − x̄)², so divide by n.' };
  if (close(got, want.variance * n)) return { pass: false, message: 'That is Σ (xᵢ − x̄)², the total. The variance is its average: divide by n.' };
  const sumSq = xs.reduce((s, x) => s + x * x, 0);
  if (close(got, sumSq / n)) return { pass: false, message: 'That is the average of xᵢ², without subtracting the mean first. Work out x̄, then square each xᵢ − x̄.' };
  if (close(got, 0) && dev?.every((d) => d === 0) && want.variance !== 0) return { pass: false, message: `You returned 0 and dev is still all 0s: work out the mean first, then fill dev with the squared gaps and return their average.` };
  if (close(got, 0) && want.variance !== 0) return { pass: false, message: 'You got 0. If you added up xᵢ − x̄ without squaring, the gaps above and below the mean always cancel: square each gap first.' };
  return { pass: false, message: `The variance of ${list(xs)} is ${fmt(want.variance)}, but your code returns ${fmt(got)}. First the mean, then the average of the squared gaps.` };
}

const VAR_PY = `def variance(xs, dev):
    n = len(xs)
    total = 0
    for i in range(n):
        total = total + xs[i]
    mean = total / n
    sq = 0
    for i in range(n):
        dev[i] = (xs[i] - mean) * (xs[i] - mean)
        sq = sq + dev[i]
    return sq / n
`;
const VAR_BLANKS_PY = `def variance(xs, dev):
    n = len(xs)
    total = 0
    for i in range(n):
        total = «1:total + xs[i]»
    mean = «2:total / n»
    sq = 0
    for i in range(n):
        dev[i] = «3:(xs[i] - mean) * (xs[i] - mean)»
        sq = sq + dev[i]
    return «4:sq / n»
`;
const VAR_JS = `function variance(xs, dev) {
  const n = xs.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total = total + xs[i];
  }
  const mean = total / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    dev[i] = (xs[i] - mean) * (xs[i] - mean);
    sq = sq + dev[i];
  }
  return sq / n;
}
`;
const VAR_BLANKS_JS = `function variance(xs, dev) {
  const n = xs.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total = «1:total + xs[i]»;
  }
  const mean = «2:total / n»;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    dev[i] = «3:(xs[i] - mean) * (xs[i] - mean)»;
    sq = sq + dev[i];
  }
  return «4:sq / n»;
}
`;
const VAR_SIG_TS = 'function variance(xs: number[], dev: number[]): number {';
const varTs = (js: string) => js.replace('function variance(xs, dev) {', VAR_SIG_TS);

const varianceExercise: Exercise<VarianceInput> = {
  slug: 'variance',
  title: 'Turn the variance formula into loops',
  kind: 'write',
  visualiser: 'sigma-notation',
  summary: 'σ² = (1/n) Σ (xᵢ − x̄)², written as the two loops its Σs stand for.',
  task: [
    'The variance, written σ² (“sigma squared”), measures how spread out some numbers are: σ² = (1/n) Σ (xᵢ − x̄)², where x̄ = (1/n) Σ xᵢ is the mean. Each Σ adds up a term for every item, i from 1 to n, so each is a loop that adds; in code the items are xs[0] to xs[n − 1].',
    'Write `variance(xs, dev)`: first loop to find the mean, then loop again, putting each squared gap (xᵢ − x̄)² into `dev[i]` and adding it up. Return the total divided by n.',
  ],
  entry: { python: 'variance', js: 'variance' },
  args: varianceArgs,
  starter: {
    python: `def variance(xs, dev):
    n = len(xs)
    # 1. mean = (1/n) Σ xs[i]
    # 2. dev[i] = (xs[i] - mean)², then return (1/n) Σ dev[i]
    return 0
`,
    javascript: `function variance(xs, dev) {
  const n = xs.length;
  // 1. mean = (1/n) Σ xs[i]
  // 2. dev[i] = (xs[i] - mean)², then return (1/n) Σ dev[i]
  return 0;
}
`,
    typescript: `${VAR_SIG_TS}
  const n = xs.length;
  // 1. mean = (1/n) Σ xs[i]
  // 2. dev[i] = (xs[i] - mean)², then return (1/n) Σ dev[i]
  return 0;
}
`,
  },
  solution: { python: VAR_PY, javascript: VAR_JS, typescript: varTs(VAR_JS) },
  blanks: { python: VAR_BLANKS_PY, javascript: VAR_BLANKS_JS, typescript: varTs(VAR_BLANKS_JS) },
  fades: [[3], [2, 3, 4], [1, 2, 3, 4]],
  distractors: {
    python: ['        dev[i] = xs[i] * xs[i] - mean', '    return sq / (n - 1)'],
    javascript: ['    dev[i] = xs[i] * xs[i] - mean;', '  return sq / (n - 1);'],
    typescript: ['    dev[i] = xs[i] * xs[i] - mean;', '  return sq / (n - 1);'],
  },
  examples: [
    { id: 'small', label: '[2, 4, 4, 4, 5, 5, 7, 9]', input: { xs: [2, 4, 4, 4, 5, 5, 7, 9] } },
    { id: 'spread', label: '[1, 9, 2, 8]', input: { xs: [1, 9, 2, 8] } },
  ],
  tests: [
    { name: 'a classic: mean 5, variance 4', input: { xs: [2, 4, 4, 4, 5, 5, 7, 9] } },
    { name: 'all the same: no spread', input: { xs: [3, 3, 3] } },
    { name: 'a mean that is not whole', input: { xs: [1, 2, 4] } },
    { name: 'negative values', input: { xs: [-3, 0, 3, 6] } },
    { name: 'one value', input: { xs: [7] } },
    { name: 'a longer list', input: { xs: [10, 12, 9, 15, 11, 13, 8, 14, 10, 12] } },
  ],
  check: checkVariance,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Two loops. The first adds up xs to get the mean; the second needs the mean, so it can only start once the first has finished.',
    'Square each gap before adding: added up as they are, the gaps xᵢ − x̄ always cancel to 0.',
    'Divide by n, the number of values, at the end.',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 4. turn a point ─────────────────────────────

export type RotateInput = { p: [number, number]; degrees: number };

const rotateArgs = ({ p, degrees }: RotateInput): Arg[] => [
  { kind: 'array', name: 'p', values: [...p] },
  { kind: 'value', name: 'degrees', value: degrees },
];

/** p turned anticlockwise by `degrees`, converted to radians first. */
export function rotated({ p: [x, y], degrees }: RotateInput, convert = true): [number, number] {
  const t = convert ? degrees * (Math.PI / 180) : degrees;
  return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
}

function checkRotate(input: RotateInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = arrayOf(result, 'p');
  if (!got || got.length !== 2) return { pass: false, message: 'Write the turned point back into p: p[0] for x, p[1] for y.' };
  const want = rotated(input);
  const [x, y] = input.p;
  if (matches(got, want)) return { pass: true, message: `(${fmt(x)}, ${fmt(y)}) turned ${fmt(input.degrees)}° is (${fmt(want[0])}, ${fmt(want[1])}), and it is still ${fmt(Math.hypot(x, y))} from the origin.` };
  if (matches(got, [x, y]) && input.degrees % 360 !== 0) return { pass: false, message: 'p hasn’t changed: write the new x into p[0] and the new y into p[1].' };
  if (matches(got, rotated(input, false))) return { pass: false, message: `You passed ${fmt(input.degrees)} straight to sin and cos, which read it as ${fmt(input.degrees)} radians. Convert first: multiply the degrees by π/180.` };
  const t = input.degrees * (Math.PI / 180);
  const nx = want[0];
  if (close(got[0], nx) && close(got[1], nx * Math.sin(t) + y * Math.cos(t))) return { pass: false, message: 'The new y used the new x, because p[0] was overwritten first. Keep the old x and y in variables before writing either.' };
  if (matches(got, [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t)])) return { pass: false, message: 'That turned the point clockwise. Anticlockwise is x cos θ − y sin θ, then x sin θ + y cos θ.' };
  return { pass: false, message: `(${fmt(x)}, ${fmt(y)}) turned ${fmt(input.degrees)}° should be (${fmt(want[0])}, ${fmt(want[1])}), but p is (${fmt(got[0])}, ${fmt(got[1])}).` };
}

const ROT_PY = `import math


def rotate(p, degrees):
    t = degrees * (math.pi / 180)
    x = p[0]
    y = p[1]
    p[0] = x * math.cos(t) - y * math.sin(t)
    p[1] = x * math.sin(t) + y * math.cos(t)
    return p
`;
const ROT_JS = `function rotate(p, degrees) {
  const t = degrees * (Math.PI / 180);
  const x = p[0];
  const y = p[1];
  p[0] = x * Math.cos(t) - y * Math.sin(t);
  p[1] = x * Math.sin(t) + y * Math.cos(t);
  return p;
}
`;
const ROT_SIG_TS = 'function rotate(p: number[], degrees: number): number[] {';
const rotTs = (js: string) => js.replace('function rotate(p, degrees) {', ROT_SIG_TS);

const rotateExercise: Exercise<RotateInput> = {
  slug: 'rotate-point',
  title: 'Turn a point about the origin',
  kind: 'write',
  visualiser: 'unit-circle',
  summary: 'Turn (x, y) anticlockwise by an angle in degrees, with sine and cosine in radians.',
  task: [
    'Write `rotate(p, degrees)`: `p` holds a point [x, y]. Turn it anticlockwise about (0, 0) by `degrees`, write the new x and y back into `p[0]` and `p[1]`, and return `p`.',
    'The turned point is (x cos θ − y sin θ, x sin θ + y cos θ). Your language’s sin and cos take radians, so convert the angle first.',
  ],
  entry: { python: 'rotate', js: 'rotate' },
  args: rotateArgs,
  starter: {
    python: `import math


def rotate(p, degrees):
    # Turn p = [x, y] anticlockwise by degrees, in place.
    return p
`,
    javascript: `function rotate(p, degrees) {
  // Turn p = [x, y] anticlockwise by degrees, in place.
  return p;
}
`,
    typescript: `${ROT_SIG_TS}
  // Turn p = [x, y] anticlockwise by degrees, in place.
  return p;
}
`,
  },
  solution: { python: ROT_PY, javascript: ROT_JS, typescript: rotTs(ROT_JS) },
  distractors: { python: ['    t = degrees'], javascript: ['  const t = degrees;'], typescript: ['  const t = degrees;'] },
  examples: [
    { id: 'quarter', label: '(2, 1) by 90°', input: { p: [2, 1], degrees: 90 } },
    { id: 'eighth', label: '(1, 0) by 45°', input: { p: [1, 0], degrees: 45 } },
  ],
  tests: [
    { name: 'a quarter turn', input: { p: [2, 1], degrees: 90 } },
    { name: '(1, 0) by 45°', input: { p: [1, 0], degrees: 45 } },
    { name: 'half a turn', input: { p: [3, -2], degrees: 180 } },
    { name: 'clockwise: a negative angle', input: { p: [0.5, 2], degrees: -30 } },
    { name: '60° from (1, 1)', input: { p: [1, 1], degrees: 60 } },
  ],
  check: checkRotate,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Convert first: radians = degrees × π/180.',
    'Read x and y into variables before you write p[0]: the new y needs the old x.',
    'Check with a quarter turn: (x, y) should become (−y, x).',
  ],
  legend: WRITE_LEGEND,
};

export const toolkitExercises: Exercise[] = [graphExercise, logProbExercise, varianceExercise, rotateExercise];

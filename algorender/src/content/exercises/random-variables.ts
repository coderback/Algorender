// Random variables as code (B5 of the math and ML path): the expected value
// and the variance of a distribution given as values and their chances, and a
// binomial simulation that flips n coins with a seeded generator, many times
// over, and counts the heads of each run into a histogram.
//
// Python and JavaScript must write the same numbers (exercises.test.ts). The
// formulas are plain + − × ÷ done in the same order, and the generator is
// Park–Miller, whose products stay below 2^53, so both runtimes draw exactly
// the same numbers and count exactly the same heads.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const TOLERANCE = 1e-9;
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));
const same = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => got[i] === w);

const fmt = (v: number) => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;
const total = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

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

// ───────────────────────────── 1. expectation-variance ─────────────────────────────

export type MomentsInput = { values: number[]; probs: number[] };

const momentsArgs = ({ values, probs }: MomentsInput): Arg[] => [
  { kind: 'value', name: 'values', value: values },
  { kind: 'value', name: 'probs', value: probs },
  { kind: 'array', name: 'terms', values: values.map(() => 0) },
];

/** E[X] = Σ x·P(x), then each term P(x)·(x − E[X])² of the variance and their total, in the solution's order. */
export function moments({ values, probs }: MomentsInput): { mean: number; terms: number[]; variance: number } {
  let mean = 0;
  for (let i = 0; i < values.length; i++) mean = mean + values[i] * probs[i];
  const terms = values.map((x, i) => probs[i] * (x - mean) * (x - mean));
  let variance = 0;
  for (const t of terms) variance = variance + t;
  return { mean, terms, variance };
}

function checkMoments(input: MomentsInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { values, probs } = input;
  const n = values.length;
  const want = moments(input);
  const got = result.returned;
  const terms = arrayFromEvents(result, 'terms');
  if (typeof got !== 'number') return { pass: false, message: 'Return the variance, a single number.' };
  const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
  const weighted = (f: (x: number, p: number) => number) => sum(values.map((x, i) => f(x, probs[i])));
  const mu = want.mean;

  if (close(got, want.variance)) {
    if (terms && !matches(terms, want.terms)) return { pass: false, message: `The variance is right, but terms should hold each P(x)·(x − E[X])²: ${list(want.terms)}.` };
    return { pass: true, message: `E[X] = ${fmt(mu)} and Var(X) = ${fmt(want.variance)}: the squared gaps from the balance point, each weighted by its chance.` };
  }
  const plain = sum(values) / n;
  if (n > 1 && !close(plain, mu) && close(got, weighted((x, p) => p * (x - plain) * (x - plain))))
    return { pass: false, message: `Your mean was the plain average of the values, ${fmt(plain)}. Some values are more likely than others: weight each by its chance, E[X] = Σ x·P(x) = ${fmt(mu)}.` };
  if (close(got, weighted((x) => (x - mu) * (x - mu))) || close(got, weighted((x) => (x - mu) * (x - mu)) / n))
    return { pass: false, message: 'Each squared gap (x − E[X])² needs weighting by its chance: multiply it by P(x) before adding.' };
  if (close(got, 0) && want.variance !== 0)
    return { pass: false, message: terms?.every((t) => t === 0) ? 'You returned 0 and terms is still all 0s: work out E[X] first, then fill terms with P(x)·(x − E[X])² and add them up.' : 'You got 0. Weighted by their chances, the gaps x − E[X] always cancel out, since E[X] is the balance point: square each gap first.' };
  if (close(got, weighted((x, p) => p * Math.abs(x - mu)))) return { pass: false, message: 'You added the sizes of the gaps, |x − E[X]|. The variance squares each gap instead: P(x)·(x − E[X])².' };
  if (close(got, weighted((x, p) => p * x * x))) return { pass: false, message: `That is E[X²] = ${fmt(got)}, the average of x², without subtracting the mean. Square the gap x − E[X], not x itself.` };
  if (close(got, mu * mu)) return { pass: false, message: `That is E[X]², the balance point squared. The variance is E[(X − E[X])²]: the average of the squared gaps, ${fmt(want.variance)} here.` };
  if (n > 1 && close(got, want.variance / n)) return { pass: false, message: 'You divided by n. The probabilities already do the averaging, since they add up to 1: just add up the weighted squared gaps.' };
  return { pass: false, message: `For ${list(values)} with chances ${list(probs)}, E[X] = ${fmt(mu)} and Var(X) = ${fmt(want.variance)}, but your code returns ${fmt(got)}.` };
}

const MOM_PY = `def expectation(values, probs):
    mean = 0
    for i in range(len(values)):
        mean = mean + values[i] * probs[i]
    return mean


def variance(values, probs, terms):
    mean = expectation(values, probs)
    total = 0
    for i in range(len(values)):
        gap = values[i] - mean
        terms[i] = probs[i] * gap * gap
        total = total + terms[i]
    return total
`;
const MOM_BLANKS_PY = `def expectation(values, probs):
    mean = 0
    for i in range(len(values)):
        mean = «1:mean + values[i] * probs[i]»
    return mean


def variance(values, probs, terms):
    mean = expectation(values, probs)
    total = 0
    for i in range(len(values)):
        gap = «2:values[i] - mean»
        terms[i] = «3:probs[i] * gap * gap»
        total = «4:total + terms[i]»
    return total
`;
const MOM_JS = `function expectation(values, probs) {
  let mean = 0;
  for (let i = 0; i < values.length; i++) {
    mean = mean + values[i] * probs[i];
  }
  return mean;
}

function variance(values, probs, terms) {
  const mean = expectation(values, probs);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const gap = values[i] - mean;
    terms[i] = probs[i] * gap * gap;
    total = total + terms[i];
  }
  return total;
}
`;
const MOM_BLANKS_JS = `function expectation(values, probs) {
  let mean = 0;
  for (let i = 0; i < values.length; i++) {
    mean = «1:mean + values[i] * probs[i]»;
  }
  return mean;
}

function variance(values, probs, terms) {
  const mean = expectation(values, probs);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const gap = «2:values[i] - mean»;
    terms[i] = «3:probs[i] * gap * gap»;
    total = «4:total + terms[i]»;
  }
  return total;
}
`;
const momTs = (js: string) =>
  js
    .replace('function expectation(values, probs) {', 'function expectation(values: number[], probs: number[]): number {')
    .replace('function variance(values, probs, terms) {', 'function variance(values: number[], probs: number[], terms: number[]): number {');

const momentsExercise: Exercise<MomentsInput> = {
  slug: 'expectation-variance',
  title: 'The expected value and the variance',
  kind: 'write',
  visualiser: 'random-variables',
  summary: 'E[X] = Σ x·P(x), then Var(X) = Σ P(x)·(x − E[X])², each a loop over the values and their chances.',
  task: [
    'A random variable X takes the values in `values`, `values[i]` with probability `probs[i]` (the chances add up to 1). Its expected value E[X] = Σ x·P(x) is the balance point of its bars; its variance Var(X) = Σ P(x)·(x − E[X])² is the chance-weighted average of the squared gaps from that balance point.',
    'Write `expectation(values, probs)`, which returns E[X], and `variance(values, probs, terms)`, which works out E[X] with it, puts each P(x)·(x − E[X])² into `terms[i]`, and returns their total.',
  ],
  entry: { python: 'variance', js: 'variance' },
  args: momentsArgs,
  starter: {
    python: `def expectation(values, probs):
    # E[X] = Σ values[i] × probs[i]
    return 0


def variance(values, probs, terms):
    # 1. mean = expectation(values, probs)
    # 2. terms[i] = probs[i] × (values[i] − mean)², then return Σ terms[i]
    return 0
`,
    javascript: `function expectation(values, probs) {
  // E[X] = Σ values[i] × probs[i]
  return 0;
}

function variance(values, probs, terms) {
  // 1. mean = expectation(values, probs)
  // 2. terms[i] = probs[i] × (values[i] − mean)², then return Σ terms[i]
  return 0;
}
`,
    typescript: momTs(`function expectation(values, probs) {
  // E[X] = Σ values[i] × probs[i]
  return 0;
}

function variance(values, probs, terms) {
  // 1. mean = expectation(values, probs)
  // 2. terms[i] = probs[i] × (values[i] − mean)², then return Σ terms[i]
  return 0;
}
`),
  },
  solution: { python: MOM_PY, javascript: MOM_JS, typescript: momTs(MOM_JS) },
  blanks: { python: MOM_BLANKS_PY, javascript: MOM_BLANKS_JS, typescript: momTs(MOM_BLANKS_JS) },
  fades: [[3], [1, 3], [1, 2, 3, 4]],
  distractors: {
    python: ['        terms[i] = gap * gap', '        mean = mean + values[i]', '    return total / len(values)'],
    javascript: ['    terms[i] = gap * gap;', '    mean = mean + values[i];', '  return total / values.length;'],
    typescript: ['    terms[i] = gap * gap;', '    mean = mean + values[i];', '  return total / values.length;'],
  },
  examples: [
    { id: 'loaded', label: 'A die loaded to 1 and 6', input: { values: [1, 2, 3, 4, 5, 6], probs: [0.25, 0.125, 0.125, 0.125, 0.125, 0.25] } },
    { id: 'bet', label: 'Win 1 or lose 1, evens', input: { values: [-1, 1], probs: [0.5, 0.5] } },
  ],
  tests: [
    { name: 'win 1 or lose 1, evens: balance point 0', input: { values: [-1, 1], probs: [0.5, 0.5] } },
    { name: 'a die loaded to 1 and 6', input: { values: [1, 2, 3, 4, 5, 6], probs: [0.25, 0.125, 0.125, 0.125, 0.125, 0.25] } },
    { name: 'a sure thing: no spread', input: { values: [5], probs: [1] } },
    { name: 'heads in three fair flips', input: { values: [0, 1, 2, 3], probs: [0.125, 0.375, 0.375, 0.125] } },
    { name: 'a lottery ticket: mostly a small loss', input: { values: [-2, 10, 98], probs: [0.875, 0.09375, 0.03125] } },
    { name: 'values not in order', input: { values: [4, 0, 2], probs: [0.25, 0.5, 0.25] } },
  ],
  check: checkMoments,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'expectation is one loop: add values[i] × probs[i] for every i. variance calls it first, since every gap needs the mean.',
    'Square each gap before weighting it: the weighted gaps x − E[X] on their own always add up to 0.',
    'Don’t divide by the number of values at the end: the probabilities already add up to 1, so the weighted sum is already an average.',
  ],
  legend: [
    { neutral: 'A term not written yet' },
    { mark: 'write', label: 'The term P(x)·(x − E[X])² just written' },
  ],
};

// ───────────────────────────── 2. binomial-simulation ─────────────────────────────

export type SimInput = { n: number; p: number; runs: number; seed: number };

const simArgs = ({ n, p, runs, seed }: SimInput): Arg[] => [
  { kind: 'value', name: 'n', value: n },
  { kind: 'value', name: 'p', value: p },
  { kind: 'value', name: 'runs', value: runs },
  { kind: 'value', name: 'seed', value: seed },
  { kind: 'array', name: 'counts', values: Array(n + 1).fill(0) },
];

export const PM_A = 16807;
export const PM_M = 2147483647;

/** How a simulation can go wrong; 'right' is the reference. */
export type SimSlip = 'right' | 'greater' | 'restart' | 'before' | 'frozen';

/**
 * The simulation, with the generator stepped before each flip and a head when
 * u < p; or with one of the usual slips: a head when u > p, the state
 * restarted at the seed every run, u read before the step, or a state never
 * stepped at all.
 */
export function simulateFlips({ n, p, runs, seed }: SimInput, slip: SimSlip = 'right'): { counts: number[]; mean: number } {
  const counts = Array(n + 1).fill(0) as number[];
  let state = seed;
  let total = 0;
  for (let r = 0; r < runs; r++) {
    if (slip === 'restart') state = seed;
    let heads = 0;
    for (let i = 0; i < n; i++) {
      let u: number;
      if (slip === 'before') {
        u = state / PM_M;
        state = (PM_A * state) % PM_M;
      } else {
        if (slip !== 'frozen') state = (PM_A * state) % PM_M;
        u = state / PM_M;
      }
      if (slip === 'greater' ? u > p : u < p) heads = heads + 1;
    }
    counts[heads] = counts[heads] + 1;
    total = total + heads;
  }
  return { counts, mean: total / runs };
}

function checkSim(input: SimInput, result: RunResult): Verdict {
  if (result.error && /out of range|IndexError/.test(result.error.message))
    return { pass: false, message: `counts has a place for 0 to ${input.n} heads, but your code looked past it. Start each run's count of heads at 0, inside the loop over runs.` };
  const failed = crashed(result);
  if (failed) return failed;
  const { n, runs } = input;
  const want = simulateFlips(input);
  const counts = arrayFromEvents(result, 'counts');
  const got = result.returned;
  if (!counts) return { pass: false, message: 'Count each run into counts: add 1 to counts[heads].' };
  const shown = `counts should be ${list(want.counts)}`;
  if (same(counts, want.counts)) {
    if (typeof got !== 'number') return { pass: false, message: 'The counts are right. Now return the average number of heads per run, a single number.' };
    if (close(got, want.mean)) return { pass: true, message: `${runs} runs of ${n} flips averaged ${fmt(want.mean)} heads, near n·p = ${fmt(n * input.p)}.` };
    if (close(got, want.mean * runs)) return { pass: false, message: `The counts are right, but ${fmt(got)} is the total number of heads. Divide by the number of runs, ${runs}.` };
    if (close(got, want.mean / n)) return { pass: false, message: `The counts are right, but ${fmt(got)} is the share of all the flips that came up heads. The question asks for the average heads per run: divide the total by ${runs}, not by ${runs * n}.` };
    return { pass: false, message: `The counts are right, but the average number of heads per run is ${fmt(want.mean)}, not ${fmt(got)}.` };
  }
  if (total(counts) !== runs) return { pass: false, message: `counts adds up to ${total(counts)}, but there were ${runs} runs: each run adds exactly 1, to counts[heads].` };
  if (same(counts, simulateFlips(input, 'greater').counts)) return { pass: false, message: 'You counted a head when u > p, which happens with chance 1 − p. A head is u < p: u is spread evenly over (0, 1), so it lands below p with chance p.' };
  if (same(counts, simulateFlips(input, 'frozen').counts)) return { pass: false, message: 'Every flip came out the same, because state never changes. Step the generator before every flip: state = (16807 * state) % 2147483647, then u = state / 2147483647.' };
  if (same(counts, simulateFlips(input, 'restart').counts)) return { pass: false, message: 'Every run gave the same number of heads: the state goes back to the seed at the start of each run, so each run replays the first. Set state = seed once, before all the runs.' };
  if (same(counts, simulateFlips(input, 'before').counts)) return { pass: false, message: 'You read u before stepping the generator, so the first flip used the seed itself. Step first, state = (16807 * state) % 2147483647, then u = state / 2147483647.' };
  return { pass: false, message: `${shown}, but they are ${list(counts)}. Check the generator lines are exactly as given, one step per flip, and that a head is u < p.` };
}

const SIM_PY = `def simulate(n, p, runs, seed, counts):
    state = seed
    total = 0
    for r in range(runs):
        heads = 0
        for i in range(n):
            state = (16807 * state) % 2147483647
            u = state / 2147483647
            if u < p:
                heads = heads + 1
        counts[heads] = counts[heads] + 1
        total = total + heads
    return total / runs
`;
const SIM_JS = `function simulate(n, p, runs, seed, counts) {
  let state = seed;
  let total = 0;
  for (let r = 0; r < runs; r++) {
    let heads = 0;
    for (let i = 0; i < n; i++) {
      state = (16807 * state) % 2147483647;
      const u = state / 2147483647;
      if (u < p) {
        heads = heads + 1;
      }
    }
    counts[heads] = counts[heads] + 1;
    total = total + heads;
  }
  return total / runs;
}
`;
const simTs = (js: string) => js.replace('function simulate(n, p, runs, seed, counts) {', 'function simulate(n: number, p: number, runs: number, seed: number, counts: number[]): number {');
const SIM_STARTER_JS = `function simulate(n, p, runs, seed, counts) {
  let state = seed;
  // The generator: these two lines, run once per flip, give a new u in (0, 1).
  //   state = (16807 * state) % 2147483647;
  //   const u = state / 2147483647;
  // For each of the runs: flip n coins (a head when u < p), count the heads,
  // and add 1 to counts[heads]. Return the average number of heads per run.
  return 0;
}
`;

const simExercise: Exercise<SimInput> = {
  slug: 'binomial-simulation',
  title: 'Simulate the binomial: flip, count, repeat',
  kind: 'write',
  visualiser: 'random-variables',
  summary: 'Flip n coins with a seeded generator, count the heads, repeat, and build the histogram of K and its average.',
  task: [
    'K, the number of heads in n flips that each land heads with chance p, has the binomial distribution, with E[K] = n·p. Check it by simulation: flip the n coins, count the heads, and repeat for `runs` runs.',
    'Random numbers come from a small generator. Start with `state = seed`; for each flip, step it with `state = (16807 * state) % 2147483647` and take `u = state / 2147483647`, a number between 0 and 1. The flip is heads when `u < p`. After each run, add 1 to `counts[heads]`, so `counts` becomes a histogram. Return the average number of heads per run.',
  ],
  entry: { python: 'simulate', js: 'simulate' },
  args: simArgs,
  starter: {
    python: `def simulate(n, p, runs, seed, counts):
    state = seed
    # The generator: these two lines, run once per flip, give a new u in (0, 1).
    #   state = (16807 * state) % 2147483647
    #   u = state / 2147483647
    # For each of the runs: flip n coins (a head when u < p), count the heads,
    # and add 1 to counts[heads]. Return the average number of heads per run.
    return 0
`,
    javascript: SIM_STARTER_JS,
    typescript: simTs(SIM_STARTER_JS),
  },
  solution: { python: SIM_PY, javascript: SIM_JS, typescript: simTs(SIM_JS) },
  distractors: {
    python: ['            if u > p:', '        state = seed'],
    javascript: ['      if (u > p) {', '    state = seed;'],
    typescript: ['      if (u > p) {', '    state = seed;'],
  },
  examples: [
    { id: 'fair', label: '4 fair coins, 12 runs', input: { n: 4, p: 0.5, runs: 12, seed: 2024 } },
    { id: 'biased', label: '3 coins with p = 0.3, 15 runs', input: { n: 3, p: 0.3, runs: 15, seed: 7 } },
  ],
  tests: [
    { name: 'six fair coins, 200 runs', input: { n: 6, p: 0.5, runs: 200, seed: 12345 } },
    { name: 'biased: five coins with p = 0.3', input: { n: 5, p: 0.3, runs: 200, seed: 2024 } },
    { name: 'one coin, 50 runs', input: { n: 1, p: 0.5, runs: 50, seed: 7 } },
    { name: 'ten coins with p = 0.2, 300 runs', input: { n: 10, p: 0.2, runs: 300, seed: 99991 } },
    { name: 'four coins from seed 1', input: { n: 4, p: 0.5, runs: 100, seed: 1 } },
  ],
  check: checkSim,
  markSortedAtEnd: false,
  pointers: ['heads'],
  hints: [
    'Two loops: one over the runs and, inside it, one over the n flips. heads starts at 0 at the top of each run.',
    'Step the generator inside the flip loop, before you read u: one step per flip. state starts at the seed once, before all the runs.',
    'A head is u < p. After the flips, counts[heads] = counts[heads] + 1, and keep a running total of heads to divide by runs at the end.',
  ],
  legend: [
    { neutral: 'Runs that came up with this many heads' },
    { mark: 'write', label: 'The count a run just added to' },
  ],
};

export const randomVariableExercises: Exercise[] = [momentsExercise, simExercise];

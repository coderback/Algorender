// Monte Carlo as code (B5 of the math and ML path): π from darts thrown with a
// seeded random-number generator, and a die's running average.
//
// The randomness is the Park-Miller generator every B5 exercise shares:
// state = (16807 × state) mod 2147483647, then u = state / 2147483647, a
// number between 0 and 1. Every product stays below 2^53, so Python and
// JavaScript make exactly the same numbers, and the same darts land in the
// same places: the estimates agree to the last bit.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

export const PM_MULTIPLIER = 16807;
export const PM_MODULUS = 2147483647;
/** The next state of the Park-Miller generator. */
export const nextState = (state: number) => (PM_MULTIPLIER * state) % PM_MODULUS;

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
/** a and b agree to `rel` of b's size (and to 1e-12 near 0). */
const near = (a: number, b: number, rel = 1e-12) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b) + 1e-12;
const allNear = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => near(got[i], w));

const fmt = (v: number, digits = 6) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map((v) => fmt(v, 4)).join(', ')}]`;
const short = (vs: readonly number[], k = 6) => (vs.length > k ? `${list(vs.slice(0, k)).slice(0, -1)}, …]` : list(vs));

/** The learner's visual array `name` as the events built it, up to the end of the run or its error. */
function arrayFromEvents(result: RunResult, name: string): number[] | null {
  let id: string | null = null;
  let values: number[] = [];
  for (const e of result.events) {
    if (e.kind === 'array' && e.name === name) {
      id = e.array;
      values = [...e.values];
    } else if (id != null && e.kind === 'append' && e.array === id) values.push(e.value);
    else if (id != null && e.kind === 'write' && e.array === id) values[e.index] = e.value;
    else if (id != null && e.kind === 'pop' && e.array === id) values.splice(e.index, 1);
  }
  return id == null ? null : values;
}

const dividesByZero = (result: RunResult) => !!result.error && /zero|finite|NaN|Infinity/i.test(result.error.message);

// ───────────────────────────── 1. estimate-pi ─────────────────────────────

export type PiInput = { n: number; seed: number };

/**
 * Ways to throw the darts: the right one and the usual slips, each as the code
 * that makes it would run, so a wrong answer can be named.
 * - right: two new numbers per dart, x then y, each time keeping the new state.
 * - one-number: one new number per dart, used for both x and y.
 * - frozen: next_state(state) called without keeping it, so every dart is the same.
 * - y-not-kept: y's new state is not kept, so the next dart's x repeats this y.
 * - divide-first: x = state / M before stepping, so the first x is the seed itself.
 */
export type Throw = 'right' | 'one-number' | 'frozen' | 'y-not-kept' | 'divide-first';

export function pinDarts({ n, seed }: PiInput, how: Throw = 'right'): [number, number][] {
  const darts: [number, number][] = [];
  let state = seed;
  for (let i = 0; i < n; i++) {
    if (how === 'frozen') {
      const u = nextState(state) / PM_MODULUS;
      darts.push([u, u]);
    } else if (how === 'one-number') {
      state = nextState(state);
      darts.push([state / PM_MODULUS, state / PM_MODULUS]);
    } else if (how === 'y-not-kept') {
      state = nextState(state);
      darts.push([state / PM_MODULUS, nextState(state) / PM_MODULUS]);
    } else if (how === 'divide-first') {
      const x = state / PM_MODULUS;
      state = nextState(state);
      darts.push([x, state / PM_MODULUS]);
      state = nextState(state);
    } else {
      state = nextState(state);
      const x = state / PM_MODULUS;
      state = nextState(state);
      darts.push([x, state / PM_MODULUS]);
    }
  }
  return darts;
}

/** The count inside the quarter circle after each dart. */
export const insideCounts = (darts: readonly [number, number][]) => {
  let inside = 0;
  return darts.map(([x, y]) => (inside += x * x + y * y <= 1 ? 1 : 0));
};

/** The reference: 4 × inside / n, and the running estimate after every dart. */
export function estimatePi(input: PiInput, how: Throw = 'right'): { estimate: number; estimates: number[]; inside: number } {
  const counts = insideCounts(pinDarts(input, how));
  const inside = counts[input.n - 1];
  return { estimate: (4 * inside) / input.n, estimates: counts.map((c, i) => (4 * c) / (i + 1)), inside };
}

const piArgs = ({ n, seed }: PiInput): Arg[] => [
  { kind: 'value', name: 'n', value: n },
  { kind: 'value', name: 'seed', value: seed },
];

const ZERO = 'The first dart divides by zero. Inside the loop, after dart i (counting from 0) you have thrown i + 1 darts: append 4 * inside / (i + 1), with the brackets.';

function checkPi(input: PiInput, result: RunResult): Verdict {
  const { n, seed } = input;
  const estimates = arrayFromEvents(result, 'estimates');
  if (result.error) {
    if (dividesByZero(result) && (estimates ?? []).length === 0) return { pass: false, message: ZERO };
    return crashed(result)!;
  }
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: 'Return the estimate of π, a single number: 4 * inside / n.' };
  const want = estimatePi(input);
  const fromSeed = `${n} dart${n === 1 ? '' : 's'} from seed ${seed}`;
  if (near(got, want.estimate)) {
    if (!estimates || estimates.length === 0) return { pass: false, message: `${fmt(got)} is right, but estimates is empty: after each dart, append the estimate so far, 4 * inside / (i + 1), so the run shows it settling.` };
    if (estimates.length !== n) return { pass: false, message: `The estimate is right, but estimates holds ${estimates.length} values: append one after every dart, ${n} in all.` };
    if (!allNear(estimates, want.estimates)) {
      if (n > 1 && allNear(estimates, want.estimates.map((e, i) => (e * (i + 1)) / n))) return { pass: false, message: `The answer is right, but each entry of estimates divides by n = ${n}, all the darts, instead of the darts so far: after dart i that is i + 1.` };
      const k = estimates.findIndex((e, i) => !near(e, want.estimates[i]));
      return { pass: false, message: `The answer is right, but estimates[${k}] should be the estimate after ${k + 1} dart${k ? 's' : ''}, ${fmt(want.estimates[k])}; yours is ${fmt(estimates[k])}.` };
    }
    return {
      pass: true,
      message: `${fromSeed}: ${want.inside} inside, so π ≈ 4 × ${want.inside} / ${n} = ${fmt(got)}, off by ${fmt(Math.abs(got - Math.PI), 4)}. (Counting x² + y² < 1 or ≤ 1 makes no difference here: a dart lands exactly on the arc with chance 0.)`,
    };
  }
  const is = (v: number) => near(got, v);
  const frozen = estimatePi(input, 'frozen');
  if (n > 1 && is(4) && want.estimate !== 4) {
    const circle = 'Test the quarter circle of radius 1 around the corner (0, 0): x * x + y * y <= 1. A circle round the middle of the square with radius 1, (x − 0.5)² + (y − 0.5)² ≤ 1, covers the whole square.';
    const same = frozen.estimate === 4 && !!estimates?.length && estimates.every((e) => e === 4);
    return { pass: false, message: `Every dart counted as inside, so the estimate is 4. ${circle}${same ? ' Or every dart landed in the same spot: keep each new state, state = next_state(state).' : ''}` };
  }
  if (n > 1 && is(frozen.estimate) && estimates?.length && estimates.every((e) => e === estimates[0]) && !is(want.estimate)) {
    return { pass: false, message: `Every dart landed in the same spot, so the estimate is ${fmt(got)}: next_state(state) gives the next state, but you never kept it. Write state = next_state(state), so each call moves the generator on.` };
  }
  if (is(want.estimate / 4)) return { pass: false, message: `${fmt(got)} is the share of darts inside, which estimates π/4: the quarter circle is a quarter of a whole circle of area π, and the square has area 1. Multiply by 4: 4 * inside / n.` };
  if (is(want.estimate / 2)) return { pass: false, message: `That is half the estimate: divide by n, the number of darts, not 2n, the number of random numbers; and multiply by 4, not 2 (a quarter circle in a square of area 1).` };
  if (n > 1 && is((4 * want.inside) / (n - 1))) return { pass: false, message: `You divided by n − 1 = ${n - 1}. After the loop, n darts have been thrown: divide by n.` };
  if (n > want.inside && is((4 * want.inside) / (n - want.inside))) return { pass: false, message: `You divided by the darts outside, ${n - want.inside}. The share inside is inside / n, out of all n darts.` };
  if (is(estimatePi(input, 'one-number').estimate)) return { pass: false, message: `You used one random number for both x and y, so every dart lands on the diagonal y = x and the estimate is ${fmt(got)}, not near π. Step the state twice per dart: once for x, then again for y.` };
  if (is(estimatePi(input, 'y-not-kept').estimate)) return { pass: false, message: `After making y you didn't keep the new state, so the next dart’s x repeats this dart’s y. Write state = next_state(state) before each of x and y.` };
  if (is(estimatePi(input, 'divide-first').estimate)) return { pass: false, message: `You divided before stepping, so the first x is seed / 2147483647, the seed itself. Step first: state = next_state(state), then x = state / 2147483647; the same for y.` };
  return { pass: false, message: `From seed ${seed}, ${n} dart${n === 1 ? '' : 's'} put ${want.inside} inside, so the estimate is ${fmt(want.estimate)}, but you returned ${fmt(got)}. For each dart: step the state and make x, step again and make y, count it if x * x + y * y <= 1.` };
}

const NEXT_PY = `def next_state(state):
    # Park-Miller: the next number in the sequence, a whole number
    # from 1 to 2147483646. Divide by 2147483647 for one between 0 and 1.
    return (16807 * state) % 2147483647
`;
const NEXT_JS = `function nextState(state) {
  // Park-Miller: the next number in the sequence, a whole number
  // from 1 to 2147483646. Divide by 2147483647 for one between 0 and 1.
  return (16807 * state) % 2147483647;
}
`;

const PI_BLANKS_PY = `${NEXT_PY}

def estimate_pi(n, seed):
    state = seed
    inside = 0
    estimates = array([])
    for i in range(n):
        state = «1:next_state(state)»
        x = «2:state / 2147483647»
        state = next_state(state)
        y = state / 2147483647
        if «3:x * x + y * y <= 1»:
            inside = inside + 1
        estimates.append(«4:4 * inside / (i + 1)»)
    return «5:4 * inside / n»
`;
const PI_BLANKS_JS = `${NEXT_JS}
function estimatePi(n, seed) {
  let state = seed;
  let inside = 0;
  const estimates = array([]);
  for (let i = 0; i < n; i++) {
    state = «1:nextState(state)»;
    const x = «2:state / 2147483647»;
    state = nextState(state);
    const y = state / 2147483647;
    if («3:x * x + y * y <= 1») {
      inside = inside + 1;
    }
    estimates.push(«4:4 * inside / (i + 1)»);
  }
  return «5:4 * inside / n»;
}
`;
const strip = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

const PI_STARTER_PY = `${NEXT_PY}

def estimate_pi(n, seed):
    state = seed
    inside = 0
    estimates = array([])
    # For each of the n darts: step the state and make x = state / 2147483647,
    # then step again and make y. Count the dart if x * x + y * y <= 1, and
    # append the estimate so far, 4 * inside / (darts so far), to estimates.
    return 0
`;
const PI_STARTER_JS = `${NEXT_JS}
function estimatePi(n, seed) {
  let state = seed;
  let inside = 0;
  const estimates = array([]);
  // For each of the n darts: step the state and make x = state / 2147483647,
  // then step again and make y. Count the dart if x * x + y * y <= 1, and
  // push the estimate so far, 4 * inside / (darts so far), onto estimates.
  return 0;
}
`;
const piTs = (js: string) =>
  js
    .replace('function nextState(state) {', 'function nextState(state: number): number {')
    .replace('function estimatePi(n, seed) {', 'function estimatePi(n: number, seed: number): number {')
    .replace('const estimates = array(', 'const estimates: number[] = array(');

const piExercise: Exercise<PiInput> = {
  slug: 'estimate-pi',
  title: 'Estimate π with random darts',
  kind: 'write',
  visualiser: 'monte-carlo',
  summary: 'Throw n random darts into the unit square with a seeded generator, count those inside the quarter circle, and return 4 × inside / n.',
  task: [
    'A dart thrown at random into the unit square (x and y each between 0 and 1) lands inside the quarter circle x² + y² ≤ 1 with chance π/4, its share of the square. So 4 × (darts inside) / n estimates π. Write `estimate_pi(n, seed)` (`estimatePi` in JavaScript and TypeScript), which throws n darts and returns that estimate.',
    'The darts come from the starter’s generator. Start with `state = seed`. Each call `next_state(state)` (`nextState`) gives the next state, a whole number; divide it by 2147483647 for a number between 0 and 1. A dart needs two: step the state and make x, then step it again and make y, keeping the new state each time. After each dart, append the estimate so far, 4 × inside / (darts so far), to `estimates` (`estimates.push` in JavaScript), so the run shows it settling.',
  ],
  entry: { python: 'estimate_pi', js: 'estimatePi' },
  args: piArgs,
  starter: { python: PI_STARTER_PY, javascript: PI_STARTER_JS, typescript: piTs(PI_STARTER_JS) },
  solution: { python: strip(PI_BLANKS_PY), javascript: strip(PI_BLANKS_JS), typescript: piTs(strip(PI_BLANKS_JS)) },
  blanks: { python: PI_BLANKS_PY, javascript: PI_BLANKS_JS, typescript: piTs(PI_BLANKS_JS) },
  fades: [[3], [3, 4, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['        y = x', '    return inside / n'],
    javascript: ['    const y = x;', '  return inside / n;'],
    typescript: ['    const y = x;', '  return inside / n;'],
  },
  examples: [
    { id: 'sixty', label: '60 darts, seed 7', input: { n: 60, seed: 7 } },
    { id: 'twenty-five', label: '25 darts, seed 2026', input: { n: 25, seed: 2026 } },
  ],
  tests: [
    { name: 'one dart from seed 1', input: { n: 1, seed: 1 } },
    { name: '10 darts from seed 42', input: { n: 10, seed: 42 } },
    { name: '1,000 darts from seed 2026', input: { n: 1000, seed: 2026 } },
    { name: '2,000 darts from seed 100000', input: { n: 2000, seed: 100000 } },
    { name: '500 darts from seed 123456789', input: { n: 500, seed: 123456789 } },
  ],
  check: checkPi,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'One loop over the n darts. Inside it, two steps of the generator: state = next_state(state), then x = state / 2147483647; the same again for y.',
    'Count the dart when x * x + y * y <= 1: that is the quarter circle of radius 1 around the corner (0, 0).',
    'The estimate after i + 1 darts is 4 * inside / (i + 1); at the end, return 4 * inside / n. The 4 is there because the quarter circle covers π/4 of the square.',
  ],
  legend: [
    { neutral: 'An earlier estimate of π' },
    { mark: 'write', label: 'The estimate after the newest dart' },
  ],
};

// ───────────────────────────── 2. running-average ─────────────────────────────

export type RollsInput = { rolls: number[] };

/** `n` die rolls from the Park-Miller generator: 1 + ⌊6u⌋. */
export function parkMillerRolls(n: number, seed: number): number[] {
  let state = seed;
  return Array.from({ length: n }, () => {
    state = nextState(state);
    return 1 + Math.floor((6 * state) / PM_MODULUS);
  });
}

export const runningAverage = (rolls: readonly number[]) => {
  let total = 0;
  return rolls.map((r, i) => (total += r) / (i + 1));
};

const prefixSums = (rolls: readonly number[]) => {
  let total = 0;
  return rolls.map((r) => (total += r));
};

function checkAverages({ rolls }: RollsInput, result: RunResult): Verdict {
  const means = isNumbers(result.returned) ? result.returned : arrayFromEvents(result, 'means');
  if (result.error) {
    if (dividesByZero(result) && (means ?? []).length === 0) return { pass: false, message: 'The first average divides by zero. After roll i (counting from 0) you have i + 1 rolls: append total / (i + 1), with the brackets.' };
    return crashed(result)!;
  }
  const n = rolls.length;
  if (!means || means.length === 0) return { pass: false, message: `Return the ${n} running averages, one after each roll: means[i] is the average of the first i + 1 rolls.` };
  const want = runningAverage(rolls);
  if (allNear(means, want)) {
    const last = want[n - 1];
    return { pass: true, message: `After ${n} roll${n === 1 ? '' : 's'} the average is ${fmt(last, 4)}, ${fmt(Math.abs(last - 3.5), 4)} from 3.5: ${short(want)}.` };
  }
  if (means.length !== n) return { pass: false, message: `There should be ${n} averages, one after each roll, but you made ${means.length}.` };
  const sums = prefixSums(rolls);
  if (allNear(means, rolls) && !allNear(want, rolls)) return { pass: false, message: 'Each average is just that one roll: keep a running total, adding each roll to it, and divide the total by the rolls so far.' };
  if (allNear(means, sums)) return { pass: false, message: 'Those are the running totals: divide each one by the number of rolls so far, i + 1.' };
  if (allNear(means, sums.map((s) => s / n))) return { pass: false, message: `You divided every total by ${n}, all the rolls. The average after roll i uses only the i + 1 rolls so far: total / (i + 1).` };
  if (allNear(means, sums.map((s, i) => (s - rolls[i]) / (i + 1)))) return { pass: false, message: 'Each average misses its own roll: you appended before adding the roll to the total. Add first, then append.' };
  const k = means.findIndex((m, i) => !near(m, want[i]));
  return { pass: false, message: `means[${k}] should be the average of the first ${k + 1} roll${k ? 's' : ''}, ${fmt(want[k], 4)}, but yours is ${fmt(means[k], 4)}.` };
}

const AVG_PY = `def running_average(rolls):
    means = array([])
    total = 0
    for i in range(len(rolls)):
        total = total + rolls[i]
        means.append(total / (i + 1))
    return means
`;
const AVG_JS = `function runningAverage(rolls) {
  const means = array([]);
  let total = 0;
  for (let i = 0; i < rolls.length; i++) {
    total = total + rolls[i];
    means.push(total / (i + 1));
  }
  return means;
}
`;
const AVG_STARTER_PY = `def running_average(rolls):
    means = array([])
    # After each roll, append the average of the rolls so far:
    # keep a running total, and divide it by how many rolls there have been.
    return means
`;
const AVG_STARTER_JS = `function runningAverage(rolls) {
  const means = array([]);
  // After each roll, push the average of the rolls so far:
  // keep a running total, and divide it by how many rolls there have been.
  return means;
}
`;
const avgTs = (js: string) => js.replace('function runningAverage(rolls) {', 'function runningAverage(rolls: number[]): number[] {').replace('const means = array(', 'const means: number[] = array(');

const STREAK = [6, 6, 6, 6, 1, 1, 1, 1];
const THIRTY = parkMillerRolls(30, 2026);
const FORTY = parkMillerRolls(40, 9);

const averageExercise: Exercise<RollsInput> = {
  slug: 'running-average',
  title: 'A die’s running average',
  kind: 'write',
  visualiser: 'monte-carlo',
  summary: 'After each roll of a die, the average of the rolls so far: the numbers that settle towards 3.5.',
  task: [
    'The law of large numbers is about the running average: after each roll, the total so far divided by the number of rolls so far. Write `running_average(rolls)` (`runningAverage` in JavaScript and TypeScript), which returns that average after every roll.',
    'Keep a running total. After roll i (counting from 0) there have been i + 1 rolls, so append total / (i + 1) to `means` (`means.push` in JavaScript), and return `means`.',
  ],
  entry: { python: 'running_average', js: 'runningAverage' },
  args: ({ rolls }) => [{ kind: 'array', name: 'rolls', values: rolls }],
  starter: { python: AVG_STARTER_PY, javascript: AVG_STARTER_JS, typescript: avgTs(AVG_STARTER_JS) },
  solution: { python: AVG_PY, javascript: AVG_JS, typescript: avgTs(AVG_JS) },
  examples: [
    { id: 'thirty', label: '30 rolls from seed 2026', input: { rolls: THIRTY } },
    { id: 'streak', label: 'Four sixes, then four ones', input: { rolls: STREAK } },
  ],
  tests: [
    { name: 'four rolls', input: { rolls: [3, 6, 1, 4] } },
    { name: 'a streak of sixes, then of ones', input: { rolls: STREAK } },
    { name: 'one roll', input: { rolls: [2] } },
    { name: 'the same face three times', input: { rolls: [5, 5, 5] } },
    { name: '40 rolls from seed 9', input: { rolls: FORTY } },
  ],
  check: checkAverages,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Before the loop, total = 0. Inside it, add rolls[i] to total first.',
    'Then append total / (i + 1): i counts from 0, so after roll i there have been i + 1 rolls.',
  ],
  legend: [
    { neutral: 'A roll, or an earlier average' },
    { mark: 'write', label: 'The newest average' },
  ],
};

export const monteCarloExercises: Exercise[] = [piExercise, averageExercise];

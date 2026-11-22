// Standard errors and the bootstrap as code (B6 of the math and ML path): the
// standard error s/√n of a sample's average, and a bootstrap confidence
// interval: resample the data with replacement many times, write each
// resample's average into a visual array, sort, and keep the middle 95%.
//
// The randomness is the Park–Miller generator B5's exercises share:
// state = (16807 × state) mod 2147483647, then u = state / 2147483647. Every
// product stays below 2^53, and the averages are the same + and ÷ in the same
// order, so Python and JavaScript pick the same values and write the same
// averages, to the last bit.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

export const PM_A = 16807;
export const PM_M = 2147483647;

const near = (a: unknown, b: number, rel = 1e-12) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b) + 1e-12;
const allNear = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => near(got[i], w));
const isPair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((v) => typeof v === 'number');
const pairNear = (got: unknown, want: readonly [number, number]) => isPair(got) && near(got[0], want[0]) && near(got[1], want[1]);

const fmt = (v: number, digits = 4) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map((v) => fmt(v)).join(', ')}]`;
const pair = ([a, b]: readonly [number, number]) => `[${fmt(a)}, ${fmt(b)}]`;

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

const meanOf = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t = t + x;
  return t / xs.length;
};

/** The sample standard deviation (÷ n − 1) and the standard error s/√n, in the solution's order. */
export function standardErrorOf(data: readonly number[]): { mean: number; gaps: number[]; s: number; se: number } {
  const n = data.length;
  const mean = meanOf(data);
  const gaps = data.map((x) => (x - mean) * (x - mean));
  let squares = 0;
  for (const g of gaps) squares = squares + g;
  const s = Math.sqrt(squares / (n - 1));
  return { mean, gaps, s, se: s / Math.sqrt(n) };
}

// ───────────────────────────── 1. bootstrap-ci ─────────────────────────────

export type BootInput = { data: number[]; resamples: number; seed: number };

/**
 * How the resamples can be drawn: the right way and the usual slips, each as
 * the code that makes it would run, so a wrong answer can be named.
 * - right: step the state, u = state / M, pick data[⌊u·n⌋], n picks a resample.
 * - n-minus-1: pick ⌊u·(n − 1)⌋, so the last value is never picked.
 * - frozen: the next state is made but never kept, so every pick is the same.
 * - restart: the state goes back to the seed at each resample, so all resamples are the same.
 * - before: u is read before the step, so the first pick comes from the seed itself.
 * - no-reset: the total isn't set back to 0 for each resample.
 */
export type Draw = 'right' | 'n-minus-1' | 'frozen' | 'restart' | 'before' | 'no-reset';

export function bootstrapMeans({ data, resamples, seed }: BootInput, how: Draw = 'right'): number[] {
  const n = data.length;
  const means: number[] = [];
  let state = seed;
  let total = 0;
  for (let r = 0; r < resamples; r++) {
    if (how === 'restart') state = seed;
    if (how !== 'no-reset') total = 0;
    for (let i = 0; i < n; i++) {
      let u: number;
      if (how === 'frozen') u = ((PM_A * state) % PM_M) / PM_M;
      else if (how === 'before') {
        u = state / PM_M;
        state = (PM_A * state) % PM_M;
      } else {
        state = (PM_A * state) % PM_M;
        u = state / PM_M;
      }
      total = total + data[Math.floor(u * (how === 'n-minus-1' ? n - 1 : n))];
    }
    means.push(total / n);
  }
  return means;
}

/** How many averages to drop from each end: 2.5% of the resamples, which are a multiple of 40. */
export const dropOf = (resamples: number) => Math.floor(resamples / 40);

/** The middle 95% of the averages: sorted, `k` dropped from each end. */
export function middle95(means: readonly number[]): [number, number] {
  const sorted = [...means].sort((a, b) => a - b);
  const k = dropOf(means.length);
  return [sorted[k], sorted[means.length - 1 - k]];
}

export const bootstrapCi = (input: BootInput): [number, number] => middle95(bootstrapMeans(input));

const bootArgs = ({ data, resamples, seed }: BootInput): Arg[] => [
  { kind: 'value', name: 'data', value: data },
  { kind: 'value', name: 'resamples', value: resamples },
  { kind: 'value', name: 'seed', value: seed },
];

function checkBoot(input: BootInput, result: RunResult): Verdict {
  const { data, resamples } = input;
  const n = data.length;
  const B = resamples;
  const k = dropOf(B);
  const means = arrayFromEvents(result, 'means');
  if (result.error) {
    if (/out of range|IndexError/.test(result.error.message) && (means ?? []).length === B)
      return { pass: false, message: `The sorted averages sit at positions 0 to ${B - 1}. Drop ${k} from each end: the interval runs from position ${k} to position ${B} − 1 − ${k} = ${B - 1 - k}.` };
    return crashed(result)!;
  }
  if (!means || means.length === 0) return { pass: false, message: 'means is empty: after each resample, append its average, total / n, to means (means.push in JavaScript), so the run shows the averages pile up.' };
  const want = bootstrapMeans(input);
  if (means.length !== B) return { pass: false, message: `means holds ${means.length} averages, but there are ${B} resamples: append one average per resample, after its ${n} picks.` };

  if (!allNear(means, want)) {
    const all = (v: number) => means.every((m) => near(m, v));
    const is = (how: Draw) => allNear(means, bootstrapMeans(input, how));
    if (is('frozen')) return { pass: false, message: 'Every pick was the same value, so every average is too: the next state was worked out but never kept. Write state = (16807 * state) % 2147483647, so each pick moves the generator on.' };
    if (all(meanOf(data))) return { pass: false, message: `Every resample's average is ${fmt(meanOf(data))}, the data's own average: each value was used exactly once, which is resampling without replacement, the same ${n} values in another order. Pick with replacement: each of the ${n} picks is data[⌊u·n⌋] for a fresh u, so a value can come up twice and another not at all.` };
    if (is('restart')) return { pass: false, message: 'Every resample came out the same: the state goes back to the seed at the start of each one. Set state = seed once, before all the resamples.' };
    if (n > 1 && is('n-minus-1')) return { pass: false, message: `You picked ⌊u·(n − 1)⌋, which runs from 0 to ${n - 2}: the last value, data[${n - 1}], is never picked. u is below 1, so ⌊u·n⌋ already stays at or below ${n - 1}.` };
    if (is('before')) return { pass: false, message: 'You read u before stepping the generator, so the first pick used the seed itself. Step first, state = (16807 * state) % 2147483647, then u = state / 2147483647.' };
    if (is('no-reset')) return { pass: false, message: 'The averages keep growing: total isn’t set back to 0 at the start of each resample, so each one adds on to the last. Put total = 0 inside the loop over resamples.' };
    if (allNear(means, want.map((m) => m * n))) return { pass: false, message: `Those are the resamples’ totals: divide each by n = ${n} to get its average.` };
    const j = means.findIndex((m, i) => !near(m, want[i]));
    return { pass: false, message: `means[${j}] should be resample ${j + 1}'s average, ${fmt(want[j])}, but yours is ${fmt(means[j])}. For each of the ${n} picks: step the state, u = state / 2147483647, add data[⌊u·n⌋] to the total.` };
  }

  const got = result.returned;
  const sorted = [...want].sort((a, b) => a - b);
  const right: [number, number] = [sorted[k], sorted[B - 1 - k]];
  if (pairNear(got, right)) {
    const { mean, se } = standardErrorOf(data);
    return {
      pass: true,
      message: `${B} resamples: the middle 95% of their averages runs from ${fmt(right[0])} to ${fmt(right[1])}, positions ${k} and ${B - 1 - k} once sorted. For comparison, x̄ ± 2 SE = ${fmt(mean)} ± ${fmt(2 * se)} gives ${fmt(mean - 2 * se)} to ${fmt(mean + 2 * se)}.`,
    };
  }
  if (!isPair(got)) return { pass: false, message: 'The averages are right. Return the interval as a list of two numbers, [low end, high end].' };
  const same = (p: [number, number]) => pairNear(got, p) && !pairNear(p, right);
  if (same([right[1], right[0]])) return { pass: false, message: 'The two ends are the wrong way round: return [low end, high end], the lower one first.' };
  if (same([want[k], want[B - 1 - k]])) return { pass: false, message: `You took positions ${k} and ${B - 1 - k} of the averages in the order they were made. Sort a copy first (sorted(means) in Python, [...means].sort((a, b) => a - b) in JavaScript), so the lowest average comes first.` };
  const text = [...want].sort();
  if (same([text[k], text[B - 1 - k]])) return { pass: false, message: 'sort() with nothing in the brackets sorts numbers as text, so 10.5 comes before 9.25 (the 1 before the 9). Pass a comparison: .sort((a, b) => a - b).' };
  if (k >= 1 && same([sorted[k - 1], sorted[B - k]])) return { pass: false, message: `You dropped ${k - 1} from each end instead of ${k}: positions count from 0, so after dropping ${k} the lowest one left is at position ${k}, and the highest at ${B - 1 - k}.` };
  if (same([sorted[k], sorted[B - k]])) return { pass: false, message: `The low end is right, but the high end sits at position ${B} − 1 − ${k} = ${B - 1 - k}: the last position is ${B - 1}, not ${B}.` };
  const k5 = Math.floor(B / 20);
  if (same([sorted[k5], sorted[B - 1 - k5]])) return { pass: false, message: `You dropped ${k5}, 5%, from each end, which leaves the middle 90%. A 95% interval leaves out 5% in all: 2.5% at each end, ${k} of ${B}.` };
  if (same([sorted[0], sorted[B - 1]])) return { pass: false, message: `That is the lowest and the highest of all ${B} averages, the whole 100%. Drop the ${k} lowest and the ${k} highest first.` };
  return { pass: false, message: `The averages are right; sorted, the middle 95% runs from position ${k} to ${B - 1 - k}, ${pair(right)}, but you returned ${pair(got)}.` };
}

const BOOT_PY_BLANKS = `def bootstrap_ci(data, resamples, seed):
    n = len(data)
    state = seed
    means = array([])
    for r in range(resamples):
        total = 0
        for i in range(n):
            state = «1:(16807 * state) % 2147483647»
            u = state / 2147483647
            total = total + data[«2:int(u * n)»]
        means.append(«3:total / n»)
    ordered = «4:sorted(means)»
    k = «5:resamples // 40»
    return [ordered[k], «6:ordered[resamples - 1 - k]»]
`;
const BOOT_JS_BLANKS = `function bootstrapCi(data, resamples, seed) {
  const n = data.length;
  let state = seed;
  const means = array([]);
  for (let r = 0; r < resamples; r++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      state = «1:(16807 * state) % 2147483647»;
      const u = state / 2147483647;
      total = total + data[«2:Math.floor(u * n)»];
    }
    means.push(«3:total / n»);
  }
  const ordered = «4:[...means].sort((a, b) => a - b)»;
  const k = «5:Math.floor(resamples / 40)»;
  return [ordered[k], «6:ordered[resamples - 1 - k]»];
}
`;
const strip = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

const BOOT_STARTER_PY = `def bootstrap_ci(data, resamples, seed):
    n = len(data)
    state = seed
    means = array([])
    # The generator: these two lines, run once per pick, give a new u in (0, 1).
    #   state = (16807 * state) % 2147483647
    #   u = state / 2147483647
    # For each resample: make n picks, each data[int(u * n)] for a fresh u,
    # and append their average to means.
    # Then sort a copy of means, drop k = resamples // 40 from each end,
    # and return [lowest left, highest left].
    return [0, 0]
`;
const BOOT_STARTER_JS = `function bootstrapCi(data, resamples, seed) {
  const n = data.length;
  let state = seed;
  const means = array([]);
  // The generator: these two lines, run once per pick, give a new u in (0, 1).
  //   state = (16807 * state) % 2147483647;
  //   const u = state / 2147483647;
  // For each resample: make n picks, each data[Math.floor(u * n)] for a fresh u,
  // and push their average onto means.
  // Then sort a copy of means, drop k = resamples / 40 from each end,
  // and return [lowest left, highest left].
  return [0, 0];
}
`;
const bootTs = (js: string) =>
  js
    .replace('function bootstrapCi(data, resamples, seed) {', 'function bootstrapCi(data: number[], resamples: number, seed: number): number[] {')
    .replace('const means = array(', 'const means: number[] = array(');

/** The lesson's 25 rolls (x̄ = 4.28): confidence-intervals' first sample from seed 4, the one the lesson works through (bootstrap.test.ts checks). */
export const LESSON_ROLLS = [6, 3, 2, 1, 2, 5, 1, 6, 5, 5, 6, 3, 5, 6, 5, 5, 4, 4, 5, 6, 6, 4, 3, 6, 3];
/** 25 other rolls of the same die: the visualiser's first sample from seed 7 (bootstrap.test.ts checks). */
export const ROLLS_SEED_7 = [1, 1, 6, 5, 5, 4, 4, 2, 5, 5, 3, 2, 6, 5, 2, 3, 3, 5, 3, 6, 2, 6, 2, 2, 2];
/** Waits in minutes around 10, so the averages straddle 10 and a text sort goes wrong. */
export const WAITS = [4, 7, 15, 9, 12, 6, 18, 8, 11, 5];

const bootExercise: Exercise<BootInput> = {
  slug: 'bootstrap-ci',
  title: 'A bootstrap confidence interval',
  kind: 'write',
  visualiser: 'confidence-intervals',
  summary: 'Resample the data with replacement, write each resample’s average into an array, sort, and keep the middle 95%.',
  task: [
    'The bootstrap finds a 95% interval for the true average without any formula. Treat the data as if it were the whole population and draw `resamples` new samples from it: each makes n picks (n = the number of values) **with replacement**, so a value can be picked twice and another not at all. Write each resample’s average into `means`. Write `bootstrap_ci(data, resamples, seed)` (`bootstrapCi` in JavaScript and TypeScript).',
    'The picks come from the starter’s generator. Start with `state = seed`. For each pick, step it with `state = (16807 * state) % 2147483647` and take `u = state / 2147483647`, a number between 0 and 1; the pick is `data[⌊u·n⌋]`, where ⌊u·n⌋ means u·n rounded down (`int(u * n)` in Python, `Math.floor(u * n)` in JavaScript): an index from 0 to n − 1.',
    'Then sort a copy of the averages, from lowest to highest. `resamples` is a multiple of 40, so 2.5% of it, k = resamples ÷ 40, is a whole number: drop the k lowest and the k highest. Return `[sorted[k], sorted[resamples − 1 − k]]`, the lowest and highest of the averages left, positions counted from 0.',
  ],
  entry: { python: 'bootstrap_ci', js: 'bootstrapCi' },
  args: bootArgs,
  starter: { python: BOOT_STARTER_PY, javascript: BOOT_STARTER_JS, typescript: bootTs(BOOT_STARTER_JS) },
  solution: { python: strip(BOOT_PY_BLANKS), javascript: strip(BOOT_JS_BLANKS), typescript: bootTs(strip(BOOT_JS_BLANKS)) },
  blanks: { python: BOOT_PY_BLANKS, javascript: BOOT_JS_BLANKS, typescript: bootTs(BOOT_JS_BLANKS) },
  fades: [[2], [2, 5, 6], [1, 2, 3, 4, 5, 6]],
  distractors: {
    python: ['            total = total + data[int(u * (n - 1))]', '    k = resamples // 20', '    ordered = means'],
    javascript: ['      total = total + data[Math.floor(u * (n - 1))];', '  const k = Math.floor(resamples / 20);', '  const ordered = [...means].sort();'],
    typescript: ['      total = total + data[Math.floor(u * (n - 1))];', '  const k = Math.floor(resamples / 20);', '  const ordered = [...means].sort();'],
  },
  examples: [
    { id: 'five-rolls', label: 'Five rolls, 40 resamples', input: { data: [2, 6, 5, 3, 6], resamples: 40, seed: 7 } },
    { id: 'four-waits', label: 'Four waits, 40 resamples', input: { data: [4, 15, 9, 12], resamples: 40, seed: 2026 } },
  ],
  tests: [
    { name: 'eight values, 40 resamples, seed 1', input: { data: [3, 7, 8, 12, 5, 9, 15, 6], resamples: 40, seed: 1 } },
    { name: '25 other rolls of the loaded die, 400 resamples', input: { data: ROLLS_SEED_7, resamples: 400, seed: 7 } },
    { name: 'ten waits around 10 minutes, 200 resamples', input: { data: WAITS, resamples: 200, seed: 2026 } },
    { name: 'two values, 0 and 1, 80 resamples', input: { data: [0, 1], resamples: 80, seed: 42 } },
    { name: 'all the same: no spread at all', input: { data: [5, 5, 5, 5], resamples: 40, seed: 3 } },
    { name: 'twelve heights, 1,000 resamples', input: { data: [152, 160, 171, 158, 166, 175, 149, 163, 180, 157, 169, 161], resamples: 1000, seed: 99991 } },
    { name: 'the lesson’s 25 rolls (x̄ = 4.28), 400 resamples from seed 7', input: { data: LESSON_ROLLS, resamples: 400, seed: 7 } },
  ],
  check: checkBoot,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Two loops: one over the resamples and, inside it, one over the n picks. total starts at 0 at the top of each resample; state starts at the seed once, before all of them.',
    'Each pick: step the state, u = state / 2147483647, then add data[int(u * n)] (Math.floor in JavaScript). u is below 1, so the index is at most n − 1: multiply by n, not n − 1.',
    'After the loops, sorted(means) (or [...means].sort((a, b) => a - b)) gives a sorted copy. k = resamples // 40; return the values at positions k and resamples − 1 − k.',
  ],
  legend: [
    { neutral: 'An earlier resample’s average' },
    { mark: 'write', label: 'The newest resample’s average' },
  ],
};

// ───────────────────────────── 2. standard-error ─────────────────────────────

export type SeInput = { data: number[] };

function checkSe({ data }: SeInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const n = data.length;
  const want = standardErrorOf(data);
  const got = result.returned;
  const gaps = arrayFromEvents(result, 'gaps');
  if (typeof got !== 'number') return { pass: false, message: 'Return the standard error, a single number: s / √n.' };
  const squares = want.gaps.reduce((t, g) => t + g, 0);
  const is = (v: number) => near(got, v, 1e-9) && !near(want.se, v, 1e-9);
  if (near(got, want.se, 1e-9)) {
    if (gaps && !allNear(gaps, want.gaps)) return { pass: false, message: `The standard error is right, but gaps should hold each squared gap (x − x̄)²: ${list(want.gaps)}.` };
    return { pass: true, message: `x̄ = ${fmt(want.mean)}, s = ${fmt(want.s)}, so SE = ${fmt(want.s)}/√${n} = ${fmt(want.se)}: the average of ${n} values like these typically lands about ${fmt(want.se)} from the true average.` };
  }
  if (is(Math.sqrt(squares / n) / Math.sqrt(n))) return { pass: false, message: `You divided the squared gaps by n = ${n}. The sample's s divides by n − 1 = ${n - 1}: the gaps are measured from x̄, which sits closer to the data than the true average does, so dividing by n would make s a little too small.` };
  if (is(want.s)) return { pass: false, message: `${fmt(got)} is s, the spread of single values. The average of ${n} values spreads less: divide by √n, SE = s / √${n}.` };
  if (is(want.s / n)) return { pass: false, message: `You divided s by n = ${n}. An average's spread shrinks like √n, not n: SE = s / √${n} = ${fmt(want.se)}.` };
  if (is(squares / (n - 1) / Math.sqrt(n))) return { pass: false, message: 'You forgot the square root in s: the squared gaps divided by n − 1 make the variance, s². Take its square root first, then divide by √n.' };
  if (is(squares / (n - 1) / n)) return { pass: false, message: `That is s² / n, the variance of the average. The standard error is its square root, s / √n = ${fmt(want.se)}.` };
  if (near(got, 0, 1e-9) && want.se !== 0) return { pass: false, message: 'You got 0. The gaps x − x̄ on their own always add up to 0, since x̄ is the balance point: square each one first.' };
  const absolute = data.reduce((t, x) => t + Math.abs(x - want.mean), 0);
  if (is(Math.sqrt(absolute / (n - 1)) / Math.sqrt(n)) || is(absolute / (n - 1) / Math.sqrt(n))) return { pass: false, message: 'You added the sizes of the gaps, |x − x̄|. s squares each gap instead: (x − x̄)².' };
  return { pass: false, message: `For ${list(data)}: x̄ = ${fmt(want.mean)}, s = ${fmt(want.s)} and SE = ${fmt(want.se)}, but your code returns ${fmt(got)}.` };
}

const SE_PY_BLANKS = `import math


def standard_error(data, gaps):
    n = len(data)
    total = 0
    for i in range(n):
        total = total + data[i]
    mean = «1:total / n»
    squares = 0
    for i in range(n):
        gaps[i] = «2:(data[i] - mean) * (data[i] - mean)»
        squares = squares + gaps[i]
    s = math.sqrt(«3:squares / (n - 1)»)
    return «4:s / math.sqrt(n)»
`;
const SE_JS_BLANKS = `function standardError(data, gaps) {
  const n = data.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total = total + data[i];
  }
  const mean = «1:total / n»;
  let squares = 0;
  for (let i = 0; i < n; i++) {
    gaps[i] = «2:(data[i] - mean) * (data[i] - mean)»;
    squares = squares + gaps[i];
  }
  const s = Math.sqrt(«3:squares / (n - 1)»);
  return «4:s / Math.sqrt(n)»;
}
`;
const SE_STARTER_PY = `import math


def standard_error(data, gaps):
    n = len(data)
    # 1. mean = the average of data
    # 2. gaps[i] = (data[i] − mean)², and add them all up
    # 3. s = √(that sum / (n − 1)), then return s / √n
    return 0
`;
const SE_STARTER_JS = `function standardError(data, gaps) {
  const n = data.length;
  // 1. mean = the average of data
  // 2. gaps[i] = (data[i] − mean)², and add them all up
  // 3. s = √(that sum / (n − 1)), then return s / √n
  return 0;
}
`;
const seTs = (js: string) => js.replace('function standardError(data, gaps) {', 'function standardError(data: number[], gaps: number[]): number {');

const seExercise: Exercise<SeInput> = {
  slug: 'standard-error',
  title: 'The standard error of an average',
  kind: 'write',
  visualiser: 'confidence-intervals',
  summary: 'The sample spread s, dividing by n − 1, then SE = s / √n: how far a sample’s average typically lands from the truth.',
  task: [
    'A sample’s average x̄ estimates the true average, and its standard error SE = s / √n says how far off it typically is. Here s is the sample standard deviation: the squared gaps from x̄ added up, divided by n − 1, square-rooted.',
    'Write `standard_error(data, gaps)` (`standardError` in JavaScript and TypeScript). Work out x̄, put each squared gap (data[i] − x̄)² into `gaps[i]`, then return s / √n. Use `math.sqrt` in Python (the starter imports math) and `Math.sqrt` in JavaScript.',
  ],
  entry: { python: 'standard_error', js: 'standardError' },
  args: ({ data }) => [
    { kind: 'value', name: 'data', value: data },
    { kind: 'array', name: 'gaps', values: data.map(() => 0) },
  ],
  starter: { python: SE_STARTER_PY, javascript: SE_STARTER_JS, typescript: seTs(SE_STARTER_JS) },
  solution: { python: strip(SE_PY_BLANKS), javascript: strip(SE_JS_BLANKS), typescript: seTs(strip(SE_JS_BLANKS)) },
  blanks: { python: SE_PY_BLANKS, javascript: SE_JS_BLANKS, typescript: seTs(SE_JS_BLANKS) },
  fades: [[3], [2, 3], [1, 2, 3, 4]],
  distractors: {
    python: ['    s = math.sqrt(squares / n)', '    return s / n'],
    javascript: ['  const s = Math.sqrt(squares / n);', '  return s / n;'],
    typescript: ['  const s = Math.sqrt(squares / n);', '  return s / n;'],
  },
  examples: [
    { id: 'eight', label: 'Eight values, average 5', input: { data: [2, 4, 4, 4, 5, 5, 7, 9] } },
    { id: 'rolls', label: 'The lesson’s 25 rolls (x̄ = 4.28)', input: { data: LESSON_ROLLS } },
  ],
  tests: [
    { name: 'eight values with average 5', input: { data: [2, 4, 4, 4, 5, 5, 7, 9] } },
    { name: '25 other rolls of the loaded die', input: { data: ROLLS_SEED_7 } },
    { name: 'two values', input: { data: [10, 20] } },
    { name: 'all the same: no spread', input: { data: [3, 3, 3] } },
    { name: 'decimals', input: { data: [1.5, 2.5, 4, 6] } },
    { name: 'ten waits', input: { data: WAITS } },
    { name: 'the lesson’s 25 rolls (x̄ = 4.28)', input: { data: LESSON_ROLLS } },
  ],
  check: checkSe,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'First a loop for the total, so mean = total / n. Then a second loop over the gaps: you need the mean before any gap.',
    'Square each gap before adding: the gaps x − x̄ on their own always add up to 0.',
    'Divide the sum of squared gaps by n − 1, not n, and take its square root: that is s. Then divide by √n, not n.',
  ],
  legend: [
    { neutral: 'A squared gap not written yet' },
    { mark: 'write', label: 'The squared gap (x − x̄)² just written' },
  ],
};

export const bootstrapExercises: Exercise[] = [bootExercise, seExercise];

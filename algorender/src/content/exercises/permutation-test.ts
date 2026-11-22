// The permutation test as code (B6 of the math and ML path): pool two groups,
// shuffle the pool again and again with a seeded Fisher–Yates shuffle, record
// each shuffle's difference in means, and return p, the share of shuffles at
// least as far from 0 as the real difference.
//
// The randomness is the Park–Miller generator every probability exercise
// shares: state = (16807 × state) mod 2147483647, then u = state / 2147483647.
// The shuffle walks i from the last place down to 1 and swaps place i with
// place j = ⌊u·(i + 1)⌋, shuffling the same pool again for each new shuffle:
// exactly what the permutation-test visualiser does, so the same scores and
// seed give the same p in both. Scores are whole numbers, so every total is
// exact and Python and JavaScript make the same differences to the last bit.

import { PM_M, nextState } from '@/algorithms/probability/permutation-test';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

export type PermInput = { a: number[]; b: number[]; shuffles: number; seed: number };

/**
 * The right test and the usual slips, each as the code that makes it would run:
 * - right: pool once, shuffle it again each time, |d| ≥ |observed|.
 * - fresh: a new pool a + b before every shuffle (just as good: also accepted).
 * - one-sided: d ≥ observed, no sizes.
 * - right-tail: d ≥ |observed|, one tail only.
 * - no-abs-observed: |d| ≥ observed, the real difference's sign kept.
 * - strict: |d| > |observed|, ties left out.
 * - sattolo: j = ⌊u·i⌋, which never leaves an item where it is.
 * - sums: totals instead of means (the same p only when the groups are the same size).
 * - frozen: the generator's new state never kept, so every u is the same.
 * - before: u read from the state before stepping it.
 */
export type Slip = 'right' | 'fresh' | 'one-sided' | 'right-tail' | 'no-abs-observed' | 'strict' | 'sattolo' | 'sums' | 'frozen' | 'before';

const total = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t = t + x;
  return t;
};
const meanOf = (xs: readonly number[]) => total(xs) / xs.length;

/** The test run as a slip would run it: each shuffle's difference, the extreme count and p. */
export function permutationReference({ a, b, shuffles, seed }: PermInput, slip: Slip = 'right'): { observed: number; diffs: number[]; extreme: number; p: number } {
  const stat = (A: readonly number[], B: readonly number[]) => (slip === 'sums' ? total(A) - total(B) : meanOf(A) - meanOf(B));
  const observed = stat(a, b);
  let pool = [...a, ...b];
  let state = seed;
  const diffs: number[] = [];
  let extreme = 0;
  for (let s = 0; s < shuffles; s++) {
    if (slip === 'fresh') pool = [...a, ...b];
    for (let i = pool.length - 1; i > 0; i--) {
      let u: number;
      if (slip === 'frozen') u = nextState(state) / PM_M;
      else if (slip === 'before') {
        u = state / PM_M;
        state = nextState(state);
      } else {
        state = nextState(state);
        u = state / PM_M;
      }
      const j = Math.floor(u * (slip === 'sattolo' ? i : i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    const d = stat(pool.slice(0, a.length), pool.slice(a.length));
    diffs.push(d);
    const counts =
      slip === 'one-sided' ? d >= observed : slip === 'right-tail' ? d >= Math.abs(observed) : slip === 'no-abs-observed' ? Math.abs(d) >= observed : slip === 'strict' ? Math.abs(d) > Math.abs(observed) : Math.abs(d) >= Math.abs(observed);
    if (counts) extreme = extreme + 1;
  }
  return { observed, diffs, extreme, p: extreme / shuffles };
}

const near = (x: number, y: number) => Number.isFinite(x) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
const allNear = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => near(got[i], w));

const fmt = (v: number, digits = 4) => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'NaN';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));
const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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

const permArgs = ({ a, b, shuffles, seed }: PermInput): Arg[] => [
  { kind: 'value', name: 'a', value: a },
  { kind: 'value', name: 'b', value: b },
  { kind: 'value', name: 'shuffles', value: shuffles },
  { kind: 'value', name: 'seed', value: seed },
];

function checkPermutation(input: PermInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) {
    if (result.error && /zero|ZeroDivision/i.test(result.error.message)) return { pass: false, message: `${failed.message}. Each group's mean divides its total by its own size, and p divides by the number of shuffles, ${input.shuffles}.` };
    return failed;
  }
  const { a, b, shuffles, seed } = input;
  const got = result.returned;
  const diffs = arrayFromEvents(result, 'diffs');
  const want = permutationReference(input);
  const fresh = permutationReference(input, 'fresh');
  if (typeof got !== 'number') return { pass: false, message: 'Return p, a single number: the share of shuffles at least as extreme, extreme / shuffles.' };

  for (const ref of [want, fresh]) {
    if (!near(got, ref.p)) continue;
    if (!diffs || diffs.length === 0) return { pass: false, message: `p = ${fmt(got)} is right, but diffs is empty: append each shuffle's difference, mean(A′) − mean(B′), so the run shows the pile building.` };
    if (diffs.length !== shuffles) return { pass: false, message: `p is right, but diffs holds ${diffs.length} differences: append one after every shuffle, ${commas(shuffles)} in all.` };
    if (!allNear(diffs, ref.diffs)) {
      if (allNear(diffs, permutationReference(input, ref === fresh ? 'fresh' : 'right').diffs.map((d) => d * a.length)) && a.length === b.length)
        return { pass: false, message: `p is right, since the groups are the same size, but diffs holds differences of totals. Compare means, each total divided by its own group's size, so groups of different sizes compare fairly too.` };
      const k = diffs.findIndex((d, i) => !near(d, ref.diffs[i]));
      return { pass: false, message: `p is right, but diffs[${k}] should be shuffle ${k + 1}'s difference, ${signed(ref.diffs[k])}; yours is ${signed(diffs[k])}.` };
    }
    return {
      pass: true,
      message: `The real difference is ${signed(ref.observed)}. ${commas(ref.extreme)} of ${commas(shuffles)} shuffles from seed ${seed} were at least that far from 0, on either side, so p = ${fmt(got)}.${ref === fresh && fresh.p !== want.p ? ' (You pooled the scores afresh before every shuffle; that is just as good. Shuffling the same pool again also works, and is what the visualiser does.)' : ''}`,
    };
  }

  if ((!diffs || diffs.length === 0) && got === 0)
    return { pass: false, message: `You returned 0 and diffs is still empty. Shuffle ${commas(shuffles)} times: after each shuffle append d to diffs, and count it when abs(d) >= abs(observed); then return extreme / shuffles.` };
  const is = (slip: Slip) => near(got, permutationReference(input, slip).p);
  const observed = want.observed;
  if (diffs && diffs.length > 1 && diffs.every((d) => near(d, observed)) && want.diffs.some((d) => !near(d, observed)))
    return { pass: false, message: `Every shuffled difference is the real one, ${signed(observed)}, so p = 1: the means came from a and b, not from the shuffled pool. After each shuffle, A′ is the first ${a.length} of the pool and B′ the rest.` };
  if (diffs && diffs.length > 2 && diffs.every((d) => near(d, diffs[0])) && !is('right'))
    return { pass: false, message: 'Every shuffle gave the same difference, so the pool never really changed: keep each new state, state = next_state(state), so every swap gets a fresh u.' };
  if (is('frozen')) return { pass: false, message: 'The generator never moved on: next_state(state) gives the next state, but you never kept it, so every u is the same. Write state = next_state(state), then u = state / 2147483647.' };
  if (is('before')) return { pass: false, message: 'You read u before stepping the generator, so the first u came from the seed itself. Step first, state = next_state(state), then u = state / 2147483647.' };
  if (is('sattolo')) return { pass: false, message: 'j = ⌊u·i⌋ never picks i itself, so no item can stay where it is and some orders can never come up. Pick j from 0 to i: j = ⌊u·(i + 1)⌋.' };
  if (a.length !== b.length && is('sums'))
    return { pass: false, message: `You compared totals, not means. With groups of ${a.length} and ${b.length}, the bigger group's total is bigger just for having more scores: compare mean(A′) − mean(B′), each total divided by its own group's size.` };
  if (is('one-sided') || is('right-tail'))
    return { pass: false, message: `You counted one side only. The question is whether the groups differ in either direction, so a shuffle counts when its difference is at least ${fmt(Math.abs(observed))} from 0 on either side: abs(d) >= abs(observed).` };
  if (is('no-abs-observed')) return { pass: false, message: `The real difference is ${signed(observed)}, below 0, so abs(d) >= observed counts every shuffle. Compare sizes on both sides: abs(d) >= abs(observed).` };
  if (is('strict'))
    return { pass: false, message: `You counted only shuffles further out than the real difference, with >. A shuffle exactly as far out, ${fmt(Math.abs(observed))}, is "at least as extreme" too: use >=, so p is the share at least as extreme.` };
  if (near(got, want.extreme) && want.extreme !== want.p) return { pass: false, message: `${got} is the number of extreme shuffles. p is their share: divide by the ${commas(shuffles)} shuffles.` };
  if (near(got, 1 - want.p)) return { pass: false, message: `${fmt(got)} is 1 − p, the share of shuffles less extreme than the real one. p counts those at least as extreme: abs(d) >= abs(observed).` };
  return { pass: false, message: `From seed ${seed}, ${commas(want.extreme)} of the ${commas(shuffles)} shuffles are at least as extreme as ${signed(observed)}, so p = ${fmt(want.p)}, but you returned ${fmt(got)}. For each shuffle: walk i from the last place down to 1, step the generator, swap places i and ⌊u·(i + 1)⌋; then compare the first ${a.length} with the rest.` };
}

const NEXT_PY = `def next_state(state):
    # Park-Miller: the next whole number in the sequence, from 1 to
    # 2147483646. Divide by 2147483647 for a number between 0 and 1.
    return (16807 * state) % 2147483647


def mean(xs):
    total = 0
    for k in range(len(xs)):
        total = total + xs[k]
    return total / len(xs)
`;
const NEXT_JS = `function nextState(state) {
  // Park-Miller: the next whole number in the sequence, from 1 to
  // 2147483646. Divide by 2147483647 for a number between 0 and 1.
  return (16807 * state) % 2147483647;
}

function mean(xs) {
  let total = 0;
  for (let k = 0; k < xs.length; k++) {
    total = total + xs[k];
  }
  return total / xs.length;
}
`;

const BLANKS_PY = `${NEXT_PY}

def permutation_test(a, b, shuffles, seed):
    observed = mean(a) - mean(b)
    pool = a + b
    state = seed
    extreme = 0
    diffs = array([])
    for s in range(shuffles):
        for i in range(len(pool) - 1, 0, -1):
            state = «1:next_state(state)»
            u = state / 2147483647
            j = «2:int(u * (i + 1))»
            pool[i], pool[j] = pool[j], pool[i]
        d = «3:mean(pool[:len(a)]) - mean(pool[len(a):])»
        diffs.append(d)
        if «4:abs(d) >= abs(observed)»:
            extreme = extreme + 1
    return «5:extreme / shuffles»
`;
const BLANKS_JS = `${NEXT_JS}
function permutationTest(a, b, shuffles, seed) {
  const observed = mean(a) - mean(b);
  const pool = a.concat(b);
  let state = seed;
  let extreme = 0;
  const diffs = array([]);
  for (let s = 0; s < shuffles; s++) {
    for (let i = pool.length - 1; i > 0; i--) {
      state = «1:nextState(state)»;
      const u = state / 2147483647;
      const j = «2:Math.floor(u * (i + 1))»;
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    const d = «3:mean(pool.slice(0, a.length)) - mean(pool.slice(a.length))»;
    diffs.push(d);
    if («4:Math.abs(d) >= Math.abs(observed)») {
      extreme = extreme + 1;
    }
  }
  return «5:extreme / shuffles»;
}
`;
const strip = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

const STARTER_PY = `${NEXT_PY}

def permutation_test(a, b, shuffles, seed):
    observed = mean(a) - mean(b)
    pool = a + b
    state = seed
    extreme = 0
    diffs = array([])
    # For each shuffle: walk i from the last place down to 1; step the state,
    # u = state / 2147483647, j = int(u * (i + 1)), and swap pool[i], pool[j].
    # Then d = mean of the first len(a) - mean of the rest: append it to diffs,
    # and count it if abs(d) >= abs(observed). Return p = extreme / shuffles.
    return 0
`;
const STARTER_JS = `${NEXT_JS}
function permutationTest(a, b, shuffles, seed) {
  const observed = mean(a) - mean(b);
  const pool = a.concat(b);
  let state = seed;
  let extreme = 0;
  const diffs = array([]);
  // For each shuffle: walk i from the last place down to 1; step the state,
  // u = state / 2147483647, j = Math.floor(u * (i + 1)), and swap pool[i], pool[j].
  // Then d = mean of the first a.length - mean of the rest: push it onto diffs,
  // and count it if Math.abs(d) >= Math.abs(observed). Return p = extreme / shuffles.
  return 0;
}
`;
const ts = (js: string) =>
  js
    .replace('function nextState(state) {', 'function nextState(state: number): number {')
    .replace('function mean(xs) {', 'function mean(xs: number[]): number {')
    .replace('function permutationTest(a, b, shuffles, seed) {', 'function permutationTest(a: number[], b: number[], shuffles: number, seed: number): number {')
    .replace('const diffs = array(', 'const diffs: number[] = array(');

export const FLASHCARD_SCORES = { a: [72, 85, 64, 79, 91, 68, 77, 76], b: [66, 73, 58, 80, 68, 55, 71, 61] };

const permutationExercise: Exercise<PermInput> = {
  slug: 'permutation-test',
  title: 'A permutation test',
  kind: 'write',
  visualiser: 'permutation-test',
  summary: 'Pool two groups, shuffle the labels again and again with a seeded generator, and return p: the share of shuffles at least as extreme as the real difference.',
  task: [
    'Group a scored higher than group b on average. Could chance alone explain it? If the groups made no difference, the labels are arbitrary: pool the scores, shuffle, call the first `len(a)` of the pool A′ and the rest B′, and record d = mean(A′) − mean(B′). Write `permutation_test(a, b, shuffles, seed)` (`permutationTest` in JavaScript and TypeScript), which does that `shuffles` times and returns p, the share of shuffles with `abs(d) >= abs(observed)`: at least as far from 0 as the real difference, on either side, ties included.',
    'Shuffle with the starter’s generator, Fisher–Yates style: start with `state = seed`, and for each shuffle walk i from the last place of the pool down to 1. Each time, step the state, take `u = state / 2147483647` and `j = ⌊u·(i + 1)⌋` (`int(u * (i + 1))` in Python, `Math.floor(u * (i + 1))` in JavaScript), a place from 0 to i, and swap places i and j. Keep shuffling the same pool. Append each shuffle’s d to `diffs` (`diffs.push` in JavaScript), so the run shows the pile building.',
  ],
  entry: { python: 'permutation_test', js: 'permutationTest' },
  args: permArgs,
  starter: { python: STARTER_PY, javascript: STARTER_JS, typescript: ts(STARTER_JS) },
  solution: { python: strip(BLANKS_PY), javascript: strip(BLANKS_JS), typescript: ts(strip(BLANKS_JS)) },
  blanks: { python: BLANKS_PY, javascript: BLANKS_JS, typescript: ts(BLANKS_JS) },
  fades: [[4], [2, 4, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['            j = int(u * i)', '        if d >= observed:', '        d = mean(a) - mean(b)'],
    javascript: ['      const j = Math.floor(u * i);', '    if (d >= observed) {', '    const d = mean(a) - mean(b);'],
    typescript: ['      const j = Math.floor(u * i);', '    if (d >= observed) {', '    const d = mean(a) - mean(b);'],
  },
  examples: [
    { id: 'flashcards', label: 'Flashcards against rereading, 10 shuffles', input: { ...FLASHCARD_SCORES, shuffles: 10, seed: 7 } },
    { id: 'small', label: 'Three against two, 16 shuffles', input: { a: [3, 9, 6], b: [4, 2], shuffles: 16, seed: 2026 } },
  ],
  tests: [
    { name: 'flashcards against rereading, 1,000 shuffles from seed 7', input: { ...FLASHCARD_SCORES, shuffles: 1000, seed: 7 } },
    { name: 'groups of different sizes: 3 against 6', input: { a: [12, 15, 19], b: [10, 11, 14, 9, 13, 12], shuffles: 500, seed: 42 } },
    { name: 'B ahead: a difference below 0', input: { a: [61, 58, 70, 64], b: [72, 66, 75, 69, 71], shuffles: 400, seed: 2026 } },
    { name: 'no gap at all', input: { a: [5, 7, 9], b: [9, 5, 7], shuffles: 100, seed: 3 } },
    { name: 'two against two', input: { a: [1, 2], b: [3, 4], shuffles: 60, seed: 1 } },
    { name: 'flashcards again, 300 shuffles from seed 123456789', input: { ...FLASHCARD_SCORES, shuffles: 300, seed: 123456789 } },
  ],
  check: checkPermutation,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Two loops: one over the shuffles and, inside it, the Fisher–Yates loop, i from len(pool) − 1 down to 1 (range(len(pool) - 1, 0, -1) in Python).',
    'Each swap needs a fresh u: state = next_state(state) first, then u = state / 2147483647 and j = ⌊u·(i + 1)⌋, so j can be any place from 0 to i, i itself included.',
    'After the swaps, A′ is pool[:len(a)] and B′ is pool[len(a):] (slice in JavaScript): d = mean(A′) − mean(B′), compared with means, not totals, since the groups can differ in size.',
    'Count both tails, ties included: abs(d) >= abs(observed). Return extreme / shuffles.',
  ],
  legend: [
    { neutral: 'An earlier shuffle’s difference' },
    { mark: 'write', label: 'The difference the newest shuffle gave' },
  ],
};

export const permutationExercises: Exercise[] = [permutationExercise];

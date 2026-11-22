import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Axis, Bar, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Hypothesis tests by shuffling labels. Group A scored 10 points more than
// group B. If the groups made no difference (the null hypothesis), each score
// would have come out the same in either group, so the labels A and B are
// arbitrary: shuffle them, record the difference in means, and repeat. The
// pile of shuffled differences is what chance alone does; p is the share of
// shuffles at least as far from 0 as the real difference, on either side.
// When nothing is going on, p is roughly equally likely to land anywhere from 0 to 1,
// so p ≤ 0.05 still happens 1 time in 20, and twenty tests at once usually
// light one up.
//
// The shuffles are exactly the ones the permutation-test exercise makes: the
// Park–Miller generator (state = 16807 · state mod 2147483647, u = state /
// 2147483647) drives a Fisher–Yates shuffle that walks i from the last place
// down to 1 and swaps place i with place j = ⌊u · (i + 1)⌋, shuffling the
// same pool again for every new shuffle. So the visualiser and a learner's
// code agree on every p from the same seed.

// ───────────────────────────── the maths ─────────────────────────────

export const PM_A = 16807;
export const PM_M = 2147483647;
export const nextState = (state: number) => (PM_A * state) % PM_M;
/** The same step by Schrage's method, in whole-number arithmetic that never leaves 32 bits: much faster in a tight loop. */
export function fastNext(state: number): number {
  const hi = (state / 127773) | 0;
  const next = 16807 * (state - hi * 127773) - 2836 * hi;
  return next > 0 ? next : next + PM_M;
}

/** Shuffles per test, the p threshold, and the batch sizes the stories use. */
export const SHUFFLES = 1000;
export const ALPHA = 0.05;
export const EXPERIMENTS = 200;
export const TESTS = 20;
export const ROUNDS = 100;
/** Shuffles per test inside those rounds: enough to tell whether p ≤ 0.05, and quick. */
export const ROUND_SHUFFLES = 200;
/** The threshold that keeps a round of 20 tests to about one false alarm in 20 rounds. */
export const BONFERRONI = ALPHA / TESTS;

/** The flashcard scores (A) and the rereading scores (B), out of 100. */
export const FLASHCARDS = [72, 85, 64, 79, 91, 68, 77, 76] as const;
export const REREADING = [66, 73, 58, 80, 68, 55, 71, 61] as const;

/** Scores are whole numbers from 0 to 100; each group has 2 to 8 of them. */
export const SCORE_MAX = 100;
export const GROUP_MIN = 2;
export const GROUP_MAX = 8;

/** The population the no-effect experiments draw from: a bell curve, mean 65, spread 10, rounded to whole scores. */
export const POP_MEAN = 65;
export const POP_SD = 10;

const sum = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t += x;
  return t;
};
/** The mean as the exercise works it out: the total, then one division. */
export const mean = (xs: readonly number[]) => sum(xs) / xs.length;
export const difference = (a: readonly number[], b: readonly number[]) => mean(a) - mean(b);

/** n choose k, exactly for the small n here. */
export function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
const factorialRatio = (n: number, down: number) => {
  let r = 1;
  for (let i = n; i > n - down; i--) r *= i;
  return r;
};

export type ShuffleRun = {
  observed: number;
  /** Each shuffle's difference mean(A′) − mean(B′), and A′'s total. */
  diffs: number[];
  sums: number[];
  extreme: number;
  p: number;
  state: number;
};

/**
 * `shuffles` shuffles of the pooled scores from Park–Miller state `seed`, the
 * same pool shuffled again each time. A shuffle counts as extreme when
 * |d| ≥ |observed|: two-sided, and a tie with the real difference counts.
 */
export function shuffleTest(a: readonly number[], b: readonly number[], shuffles: number, seed: number): ShuffleRun {
  const nA = a.length;
  const nB = b.length;
  const pool = [...a, ...b];
  const observed = difference(a, b);
  const target = Math.abs(observed);
  const diffs: number[] = [];
  const sums: number[] = [];
  let state = seed;
  let extreme = 0;
  for (let s = 1; s <= shuffles; s++) {
    for (let i = pool.length - 1; i > 0; i--) {
      state = nextState(state);
      const j = Math.floor((state / PM_M) * (i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    let sA = 0;
    for (let i = 0; i < nA; i++) sA += pool[i];
    let sB = 0;
    for (let i = nA; i < pool.length; i++) sB += pool[i];
    const d = sA / nA - sB / nB;
    diffs.push(d);
    sums.push(sA);
    if (Math.abs(d) >= target) extreme++;
  }
  return { observed, diffs, sums, extreme, p: extreme / shuffles, state };
}

/**
 * Just p and where the generator ended: for batches of tests. With
 * `stopAbove`, it stops as soon as more than that many shuffles are extreme
 * (enough to know p is above a threshold), and p is then not known.
 */
export function quickTest(a: readonly number[], b: readonly number[], shuffles: number, state: number, stopAbove = Infinity): { p: number; extreme: number; state: number; done: number } {
  const nA = a.length;
  const nB = b.length;
  const n = nA + nB;
  const pool = Float64Array.from([...a, ...b]);
  const T = sum(a) + sum(b);
  const target = Math.abs(difference(a, b));
  // A split's difference depends only on A′'s total (whole scores), so decide each total once, as the shuffles would.
  const isExtreme = new Uint8Array(T + 1);
  for (let sA = 0; sA <= T; sA++) isExtreme[sA] = Math.abs(sA / nA - (T - sA) / nB) >= target ? 1 : 0;
  let extreme = 0;
  for (let s = 0; s < shuffles; s++) {
    for (let i = n - 1; i > 0; i--) {
      state = fastNext(state);
      const j = Math.floor((state / PM_M) * (i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    let sA = 0;
    for (let i = 0; i < nA; i++) sA += pool[i];
    extreme += isExtreme[sA];
    if (extreme > stopAbove) return { p: NaN, extreme, state, done: s + 1 };
  }
  return { p: extreme / shuffles, extreme, state, done: shuffles };
}

/**
 * Every way to split the pooled scores into |A| and |B|, counted by A's total
 * (a split's difference depends only on that total): the exact p that the
 * shuffles estimate.
 */
export function exactTest(a: readonly number[], b: readonly number[]): { observed: number; splits: number; extreme: number; p: number; counts: Map<number, number> } {
  const nA = a.length;
  const nB = b.length;
  const all = [...a, ...b];
  const T = sum(all);
  const by: Map<number, number>[] = Array.from({ length: nA + 1 }, () => new Map());
  by[0].set(0, 1);
  for (const x of all) {
    for (let k = nA - 1; k >= 0; k--) for (const [s, m] of by[k]) by[k + 1].set(s + x, (by[k + 1].get(s + x) ?? 0) + m);
  }
  const observed = difference(a, b);
  const target = Math.abs(observed);
  let extreme = 0;
  let splits = 0;
  for (const [s, m] of by[nA]) {
    splits += m;
    if (Math.abs(s / nA - (T - s) / nB) >= target) extreme += m;
  }
  return { observed, splits, extreme, p: extreme / splits, counts: by[nA] };
}

/** Whole-number scores from the no-effect population, from a mulberry32 stream. */
export function drawScores(u: () => number, n: number): number[] {
  return Array.from({ length: n }, () => {
    const z = Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
    return Math.min(SCORE_MAX, Math.max(0, Math.round(POP_MEAN + POP_SD * z)));
  });
}

export type Experiment = { a: number[]; b: number[]; p: number; extreme: number };

/**
 * `count` experiments where the null hypothesis is true: both groups of 8
 * drawn from one population, each tested with `shuffles` shuffles. The data
 * come from mulberry32 seeded with `seed`, the shuffles from Park–Miller
 * starting at `seed`, carried on from test to test. With `effect`, group A
 * really does score that many points more (the null hypothesis is false).
 */
export function nullExperiments(seed: number, count: number, shuffles = SHUFFLES, effect = 0): Experiment[] {
  const u = createRng(seed);
  let state = seed;
  return Array.from({ length: count }, () => {
    const a = drawScores(u, 8).map((x) => Math.min(SCORE_MAX, Math.max(0, x + effect)));
    const b = drawScores(u, 8);
    const t = quickTest(a, b, shuffles, state);
    state = t.state;
    return { a, b, p: t.p, extreme: t.extreme };
  });
}

/** The 20 tests the "many" story shows. */
export function manyTests(seed: number): Experiment[] {
  return nullExperiments(seed, TESTS);
}

/**
 * More rounds of 20 no-effect tests (from their own streams), each test with
 * ROUND_SHUFFLES shuffles: whether each test lit up at the threshold, and the
 * shuffles it took. A test stops shuffling once too many shuffles are extreme
 * for it to light up.
 */
export function rounds(seed: number, count = ROUNDS, threshold = ALPHA): { lit: boolean[][]; shuffles: number } {
  const u = createRng(seed + 1);
  let state = nextState(seed);
  let shuffles = 0;
  const most = Math.floor(threshold * ROUND_SHUFFLES + 1e-9);
  const lit = Array.from({ length: count }, () =>
    Array.from({ length: TESTS }, () => {
      const a = drawScores(u, 8);
      const b = drawScores(u, 8);
      const t = quickTest(a, b, ROUND_SHUFFLES, state, most);
      state = t.state;
      shuffles += t.done;
      return t.extreme <= most;
    }),
  );
  return { lit, shuffles };
}

/** The chance that at least one of k independent no-effect tests comes out at or below the threshold. */
export const anyFalseAlarm = (threshold: number, k = TESTS) => 1 - (1 - threshold) ** k;

/** p ≤ threshold, decided on the whole-number count of extreme shuffles (no rounding trouble). */
export const lit = (extreme: number, shuffles: number, threshold: number) => extreme <= threshold * shuffles + 1e-9;

// ───────────────────────────── input ─────────────────────────────

export type PermutationInput = { story: 'shuffle'; a: number[]; b: number[]; seed: number } | { story: 'no-effect'; seed: number } | { story: 'many'; seed: number };
export type Story = PermutationInput['story'];
const STORIES: Story[] = ['shuffle', 'no-effect', 'many'];

const pseudocode = [
  'observed = mean(A) − mean(B)',
  'pool = A + B',
  'repeat N times:',
  '  shuffle the pool (Fisher–Yates)',
  '  A′ = first |A| of pool; B′ = rest',
  '  d = mean(A′) − mean(B′)',
  '  if |d| ≥ |observed|: extreme += 1',
  'p = extreme / N',
  'small p: chance alone rarely does it',
  'm tests: compare each p with 0.05/m',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

/** 1,000 rather than 1000. */
export const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const signed = (v: number, digits = 2) => (v > 0 ? `+${fmt(v, digits)}` : fmt(v, digits));
const readouts = (items: Readout[], label = 'Values'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });

/** A score axis that holds every score, in tens. */
function scoreAxis(values: readonly number[]): Axis {
  const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
  const hi = Math.min(SCORE_MAX + 5, Math.ceil((Math.max(...values) + 5) / 10) * 10);
  return { min: lo, max: Math.max(hi, lo + 10), label: 'score' };
}
const GROUP_X: Axis = {
  min: 0.4,
  max: 2.6,
  label: 'group',
  ticks: [
    { at: 1, label: 'A' },
    { at: 2, label: 'B' },
  ],
};

/** Where the k-th of n dots sits across its group's column. */
const slotX = (g: 1 | 2, k: number, n: number) => round(g - 0.3 + (n === 1 ? 0.3 : (0.6 * k) / (n - 1)), 3);

/**
 * The dot plot: every score a dot keyed by its place in the original pool, so
 * on a shuffle it glides to its new group. `order` is the pool's order (by
 * original place); the first |A| are A′.
 */
function groupsPlane(values: readonly number[], nA: number, order: readonly number[], o: { label: string; handle?: boolean; shuffled?: boolean }): PlanePart {
  const n = values.length;
  const inA = order.slice(0, nA);
  const inB = order.slice(nA);
  const meanOf = (ids: readonly number[]) => mean(ids.map((k) => values[k]));
  const dot = (id: number, g: 1 | 2, k: number, m: number): Shape => ({ kind: 'point', id: `s${id}`, at: [slotX(g, k, m), values[id]], tone: g, size: 'md' });
  const mA = meanOf(inA);
  const mB = meanOf(inB);
  const meanLine = (g: 1 | 2, m: number): Shape => ({ kind: 'path', id: `mean${g}`, points: [[g - 0.4, round(m, 2)], [g + 0.4, round(m, 2)]], tone: g, label: `${o.shuffled ? 'shuffled ' : ''}mean ${fmt(m, 2)}` });
  const a = values.slice(0, nA);
  const minA = Math.min(...a);
  const maxA = Math.max(...a);
  return {
    kind: 'plane',
    id: 'groups',
    label: o.label,
    x: GROUP_X,
    y: scoreAxis(values),
    equal: false,
    shapes: [...inA.map((id, k) => dot(id, 1, k, nA)), ...inB.map((id, k) => dot(id, 2, k, n - nA)), meanLine(1, mA), meanLine(2, mB)],
    handles: o.handle
      ? [{ id: 'shift', at: [1, mA] as Vec, label: 'group A’s mean: drag to move every A score', mark: 'key', step: 1 / nA, min: [1, mA - minA] as Vec, max: [1, mA + SCORE_MAX - maxA] as Vec }]
      : [],
  };
}

/**
 * The null histogram: shuffles counted by A′'s total (each total is one
 * difference), grouped so there are at most about 40 bars, and split where a
 * bar would straddle the edge of the extreme tails.
 */
function nullPlane(a: readonly number[], b: readonly number[], sums: readonly number[], o: { tails: boolean; observed: boolean; mirror: boolean; label: string }): PlanePart {
  const nA = a.length;
  const nB = b.length;
  const all = [...a, ...b].sort((x, y) => x - y);
  const T = sum(all);
  const sMin = sum(all.slice(0, nA));
  const sMax = sum(all.slice(all.length - nA));
  const d = (s: number) => s / nA - (T - s) / nB;
  const step = 1 / nA + 1 / nB;
  const observed = difference(a, b);
  const target = Math.abs(observed);
  const inTail = (s: number) => Math.abs(d(s)) >= target;
  const k = Math.max(1, Math.ceil((sMax - sMin + 1) / 40));
  const counts = new Map<number, number>();
  for (const s of sums) counts.set(s, (counts.get(s) ?? 0) + 1);
  const bars: Bar[] = [];
  for (let start = sMin; start <= sMax; start += k) {
    let from = start;
    let total = 0;
    for (let s = start; s < Math.min(start + k, sMax + 1); s++) {
      const next = s + 1;
      total += counts.get(s) ?? 0;
      const ends = next >= Math.min(start + k, sMax + 1) || (o.tails && inTail(next) !== inTail(s));
      if (ends) {
        if (total > 0) bars.push({ id: `b${from}`, x0: round(d(from) - step / 2, 3), x1: round(d(s) + step / 2, 3), y: total, ...(o.tails && inTail(s) ? { mark: 'found' as const } : {}) });
        from = next;
        total = 0;
      }
    }
  }
  const top = Math.max(4, ...bars.map((x) => x.y));
  const lines: Shape[] = [];
  if (o.observed) lines.push({ kind: 'line', id: 'observed', through: [round(observed, 3), 0], dir: [0, 1], mark: 'key', label: `real ${signed(observed)}` });
  if (o.mirror && observed !== 0) lines.push({ kind: 'line', id: 'mirror', through: [round(-observed, 3), 0], dir: [0, 1], dashed: true, label: signed(-observed) });
  const reach = Math.max(Math.abs(d(sMin)), Math.abs(d(sMax)), target) + step;
  return {
    kind: 'plane',
    id: 'null',
    label: o.label,
    // No x-axis label: it sits inside the chart's bottom-right corner, over the tail's bars. The caption says what x is.
    x: { min: round(-reach, 2), max: round(reach, 2) },
    y: { min: 0, max: Math.ceil(top * 1.15), label: 'shuffles' },
    equal: false,
    shapes: [{ kind: 'bars', id: 'hist', bars }, ...lines],
    handles: [],
  };
}

const identity = (n: number) => Array.from({ length: n }, (_, k) => k);

// ───────────────────────────── story 1: shuffle the labels ─────────────────────────────

/** The splits question's slips: 2^n (any split, ignoring the group sizes) and n!/|B|! (ordered picks). */
export function splitChoices(nA: number, nB: number) {
  const n = nA + nB;
  return { answer: comma(choose(n, nA)), slips: [comma(2 ** n), comma(factorialRatio(n, nA))] };
}

/** The p question's slips: one tail only, 1 − p, and dividing by every possible split rather than the shuffles. */
export function pChoices(run: ShuffleRun, splits: number) {
  const right = run.diffs.filter((x) => (run.observed >= 0 ? x >= run.observed : x <= run.observed)).length;
  const n = run.diffs.length;
  return { answer: fmt(run.extreme / n, 4), slips: [fmt(right / n, 4), fmt(1 - run.extreme / n, 4), fmt(run.extreme / splits, 4)] };
}
export const MORE_SHUFFLES = ['2,000', '4,000', '1,000,000'];
export const CENTRE = 'Near 0';
export const BOTH = 'both';

/** The two-sided question's choices, worded for the real difference. */
export function tailChoices(observed: number) {
  const o = fmt(Math.abs(observed), 2);
  const right = observed >= 0;
  return {
    one: right ? `Only those of +${o} or more` : `Only those of −${o} or less`,
    both: `Those of +${o} or more, or −${o} or less`,
    exact: `Only those of exactly ${right ? '+' : '−'}${o}`,
  };
}

function* shuffleStory(a: readonly number[], b: readonly number[], seed: number): Generator<Frame<PlotState>> {
  const nA = a.length;
  const nB = b.length;
  const values = [...a, ...b];
  const n = values.length;
  const run = shuffleTest(a, b, SHUFFLES, seed);
  const exact = exactTest(a, b);
  const { observed, diffs, sums } = run;
  const mA = mean(a);
  const mB = mean(b);
  const splits = choose(n, nA);
  // Each kept pool order, as places in the original pool (values can repeat, so track places, not values).
  const orderAt = (() => {
    const pool = identity(n);
    let state = seed;
    const kept = new Map<number, number[]>();
    for (let s = 1; s <= SHUFFLES; s++) {
      for (let i = n - 1; i > 0; i--) {
        state = nextState(state);
        const j = Math.floor((state / PM_M) * (i + 1));
        const t = pool[i];
        pool[i] = pool[j];
        pool[j] = t;
      }
      if ([1, 10, 100, SHUFFLES].includes(s)) kept.set(s, [...pool]);
    }
    return (s: number) => kept.get(s)!;
  })();
  const real = (label: string) => groupsPlane(values, nA, identity(n), { label, handle: true });
  const shuffled = (s: number) => groupsPlane(values, nA, orderAt(s), { label: `Shuffle ${comma(s)}: the same ${n} scores, dealt into A′ and B′`, shuffled: true });
  const hist = (s: number, o: { tails?: boolean; observed?: boolean; mirror?: boolean } = {}) =>
    nullPlane(a, b, sums.slice(0, s), { tails: !!o.tails, observed: o.observed ?? true, mirror: !!o.mirror, label: s ? `The differences A′ − B′ of ${comma(s)} shuffle${s === 1 ? '' : 's'}` : 'The shuffled differences will pile up here' });
  const avg = (s: number) => mean(diffs.slice(0, s));
  const base: Readout[] = [
    { id: 'meanA', label: 'mean of A', value: fmt(mA, 3), tone: 1 },
    { id: 'meanB', label: 'mean of B', value: fmt(mB, 3), tone: 2 },
    { id: 'observed', label: 'real difference A − B', value: signed(observed, 3), mark: 'key' },
  ];
  const values$ = (s: number, more: Readout[] = []) =>
    readouts([...base, ...(s ? [{ id: 'shuffles', label: 'shuffles', value: comma(s) }, { id: 'latest', label: 'latest shuffle’s difference', value: signed(diffs[s - 1], 3) }] : []), ...more]);
  const frame = (parts: PlotPart[], s: number, o: Omit<Parameters<typeof plotFrame>[1], 'stats'>) => plotFrame(parts, { ...o, stats: { shuffles: s } });
  const vars = (s: number, more: Record<string, number> = {}): Record<string, number> => ({ observed: round(observed, 3), ...(s ? { shuffles: s, d: round(diffs[s - 1], 3) } : {}), ...more });
  const sp = splitChoices(nA, nB);
  const p = run.p;
  const pText = fmt(p, 4);
  const tails = tailChoices(observed);

  // 0: the data.
  yield frame([real(`The real groups: ${nA} scores in A, ${nB} in B`), hist(0, { observed: false }), values$(0)], 0, {
    line: 0,
    note: `Group A's ${nA} scores average ${fmt(mA, 3)} and group B's ${nB} average ${fmt(mB, 3)}: A is ${fmt(Math.abs(observed), 3)} ${observed >= 0 ? 'ahead' : 'behind'}. A real difference, or the luck of who ended up in which group? Who went where was decided at random, like a coin toss. Suppose the groups make no difference at all: the null hypothesis. Then every score would have come out the same in either group, so the labels A and B are arbitrary, and with random dealing any other way of splitting the ${n} scores into ${nA} and ${nB} was just as likely as the real one.`,
    vars: vars(0),
    checkpoint: ask(`How many different ways are there to split the ${n} scores into a group of ${nA} and a group of ${nB}?`, sp.answer, sp.slips),
  });

  // 1: one shuffle.
  yield frame([shuffled(1), hist(1), values$(1)], 1, {
    line: 3,
    note: `Choosing which ${nA} of the ${n} go to A is ${n} choose ${nA} = ${comma(splits)} ways (the order inside a group doesn't matter). Rather than list them all, shuffle: pool the ${n} scores, shuffle the pool, and deal the first ${nA} to A′ and the rest to B′. This shuffle gives A′ a mean of ${fmt(mean(orderAt(1).slice(0, nA).map((k) => values[k])), 3)} and B′ ${fmt(mean(orderAt(1).slice(nA).map((k) => values[k])), 3)}, a difference of ${signed(diffs[0], 3)}.`,
    vars: vars(1),
  });

  // 2: ten shuffles.
  yield frame([shuffled(10), hist(10), values$(10)], 10, {
    line: 5,
    note: `Ten shuffles, ten differences: ${diffs.slice(0, 10).map((x) => signed(x, 2)).join(', ')}. Each is what chance alone produced from these very scores, with the labels handed out at random. The dots move; the scores themselves never change.`,
    vars: vars(10),
  });

  // 3: a hundred.
  yield frame([shuffled(100), hist(100), values$(100)], 100, {
    line: 2,
    note: `100 shuffles. The differences pile up into a shape: the null distribution, what the difference looks like when the labels mean nothing.`,
    vars: vars(100),
    checkpoint: askInOrder(
      `After ${comma(SHUFFLES)} shuffles, where will the pile of shuffled differences be centred?`,
      [CENTRE, ...(observed !== 0 ? [`Near ${signed(observed, 3)}, the real difference`] : []), `Near ${fmt(mean(values), 3)}, the average score`],
      CENTRE,
    ),
  });

  // 4: a thousand.
  yield frame([shuffled(SHUFFLES), hist(SHUFFLES, { observed: true }), values$(SHUFFLES, [{ id: 'average', label: 'average shuffled difference', value: signed(avg(SHUFFLES), 3) }])], SHUFFLES, {
    line: 5,
    note: `${comma(SHUFFLES)} shuffles, centred on ${signed(avg(SHUFFLES), 2)}: with the labels dealt at random, A′ is as likely to come out ahead as behind, so the differences balance around 0. The real difference, ${signed(observed, 3)}, is the solid line. How unusual is it among the shuffles?`,
    vars: vars(SHUFFLES),
    checkpoint: observed !== 0 ? askInOrder(`Which shuffles count as at least as extreme as the real ${signed(observed, 3)}?`, [tails.one, tails.both, tails.exact], tails.both) : undefined,
  });

  // 5: the tails.
  const k = run.extreme;
  const pc = pChoices(run, splits);
  yield frame([real('The real groups'), hist(SHUFFLES, { tails: true, mirror: true }), values$(SHUFFLES, [{ id: 'extreme', label: `shuffles with |d| ≥ ${fmt(Math.abs(observed), 3)}`, value: comma(k), mark: 'found' }])], SHUFFLES, {
    line: 6,
    note: `The question, fixed before looking at the data, was whether the groups differ in either direction, so a shuffle counts if its difference is at least ${fmt(Math.abs(observed), 3)} away from 0 on either side: |d| ≥ |${fmt(observed, 3)}|, ties included. Both tails are shaded: ${comma(k)} of the ${comma(SHUFFLES)} shuffles are that extreme.`,
    vars: vars(SHUFFLES, { extreme: k }),
    checkpoint: ask(`${comma(k)} of the ${comma(SHUFFLES)} shuffles are at least as extreme as the real split. What is p?`, pc.answer, pc.slips),
  });

  // 6: p.
  yield frame([real('The real groups'), hist(SHUFFLES, { tails: true, mirror: true }), values$(SHUFFLES, [{ id: 'extreme', label: `shuffles with |d| ≥ ${fmt(Math.abs(observed), 3)}`, value: comma(k), mark: 'found' }, { id: 'p', label: 'p = extreme / shuffles', value: pText }])], SHUFFLES, {
    line: 7,
    note: `p = ${comma(k)} / ${comma(SHUFFLES)} = ${pText}: the share of the shuffles at least as extreme as the real split. ${lit(k, SHUFFLES, ALPHA) ? 'That is at or below the usual threshold of 0.05.' : 'That is above the usual threshold of 0.05.'}`,
    vars: vars(SHUFFLES, { extreme: k, p: round(p, 4) }),
    checkpoint: askInOrder(`p is ${pText}. Is that the chance that the groups make no difference?`, ['Yes', 'No'], 'No'),
  });

  // 7: what p is not, and how much it wobbles.
  const wobble = Math.sqrt((p * (1 - p)) / SHUFFLES);
  yield frame([real('The real groups'), hist(SHUFFLES, { tails: true, mirror: true }), values$(SHUFFLES, [{ id: 'p', label: 'p from the shuffles', value: pText }, { id: 'wobble', label: 'typical wobble √(p(1 − p)/N)', value: `± ${fmt(wobble, 4)}` }])], SHUFFLES, {
    line: 8,
    note: `No. Every shuffle was worked out assuming no difference, so p is a chance about the data, not about that assumption: if the groups made no difference, a split at least as lopsided as the real one would turn up about ${fmt(p * 100, 1)} times in 100. ${lit(k, SHUFFLES, ALPHA) ? 'That is rare enough to doubt that chance alone did it' : 'That is not rare: chance alone easily does it'}, but it is not the chance that the groups make no difference. A small p says the data would be surprising without a real difference; it never says how likely that difference is. And p came from random shuffles, so it wobbles: as a share of ${comma(SHUFFLES)} shuffles, by about ± ${fmt(wobble, 4)}.`,
    vars: vars(SHUFFLES, { p: round(p, 4) }),
    checkpoint: askInOrder('How many shuffles would halve that wobble?', MORE_SHUFFLES, '4,000'),
  });

  // 8: every split, exactly.
  yield frame(
    [
      real('The real groups: drag A’s mean to change the gap'),
      hist(SHUFFLES, { tails: true, mirror: true }),
      readouts([...base, { id: 'p', label: `p from ${comma(SHUFFLES)} shuffles`, value: pText }, { id: 'splits', label: 'every possible split', value: comma(exact.splits) }, { id: 'exact', label: 'exact p', value: fmt(exact.p, 4), mark: 'found' }]),
    ],
    SHUFFLES,
    {
      line: 7,
      note: `Four times the shuffles halve the wobble, since it shrinks like 1/√N: 4,000 for half, as with any average. Or skip the shuffles: there are only ${comma(exact.splits)} splits, and counting every one, ${comma(exact.extreme)} are at least as extreme, so the exact p is ${fmt(exact.p, 4)}; the shuffles said ${pText}. Drag A's mean to shrink or grow the gap and watch p follow.`,
      vars: vars(SHUFFLES, { p: round(p, 4), exact: round(exact.p, 4) }),
    },
  );
}

// ───────────────────────────── story 2: when nothing is going on ─────────────────────────────

const P_X: Axis = { min: 0, max: 1, label: 'p', ticks: [0, 0.05, 0.25, 0.5, 0.75, 1].map((v) => ({ at: v, label: String(v) })) };
export const NULL_ASK = ['Rarely', 'About half the time', 'Usually'];
export const SHAPE_ASK = ['Flat: about the same in every bar', 'A bell around 0.5', 'Piled up near 0', 'Piled up near 1'];
export const SHARE_ASK = ['None of them', 'About 1 in 20', 'About half', 'Nearly all'];
export const MORE_LIKELY = ['p ≤ 0.05', 'p > 0.5', 'Equally likely'];
export const STRICTER = ['None of them', 'About 1 in 100', 'About 1 in 20', 'About 1 in 5'];

/** The bin (of 20, each 0.05 wide) a p of extreme / shuffles falls in: p ≤ 0.05 is bin 0. */
export const pBin = (extreme: number, shuffles: number) => Math.min(19, Math.max(0, Math.ceil((20 * extreme) / shuffles) - 1));

function pPlane(experiments: readonly Experiment[], mark: (bin: number) => boolean, label: string): PlanePart {
  const counts = Array(20).fill(0) as number[];
  for (const e of experiments) counts[pBin(e.extreme, SHUFFLES)]++;
  const top = Math.max(...counts);
  return {
    kind: 'plane',
    id: 'pvalues',
    label,
    x: P_X,
    y: { min: 0, max: Math.max(4, Math.ceil(top * 1.25)), label: 'experiments' },
    equal: false,
    shapes: [
      { kind: 'bars', id: 'pbars', bars: counts.map((c, i): Bar => ({ id: `p${i}`, x0: round(i * 0.05, 2), x1: round((i + 1) * 0.05, 2), y: c, ...(mark(i) ? { mark: 'found' as const } : {}) })) },
      { kind: 'line', id: 'alpha', through: [ALPHA, 0], dir: [0, 1], dashed: true, label: 'p = 0.05' },
    ],
    handles: [],
  };
}

function* noEffectStory(seed: number): Generator<Frame<PlotState>> {
  const experiments = nullExperiments(seed, EXPERIMENTS);
  const first = experiments[0];
  const run = shuffleTest(first.a, first.b, SHUFFLES, seed);
  const values = [...first.a, ...first.b];
  const groups = groupsPlane(values, 8, identity(16), { label: 'Experiment 1: both groups from one population' });
  const p1 = fmt(run.p, 4);
  const below = experiments.filter((e) => lit(e.extreme, SHUFFLES, ALPHA)).length;
  const above = experiments.filter((e) => e.extreme > SHUFFLES / 2).length;
  const strict = experiments.filter((e) => lit(e.extreme, SHUFFLES, 0.01)).length;
  const frame = (parts: PlotPart[], shuffles: number, o: Omit<Parameters<typeof plotFrame>[1], 'stats'>) => plotFrame(parts, { ...o, stats: { shuffles } });
  const hist = (s: number) => nullPlane(first.a, first.b, run.sums.slice(0, s), { tails: s > 0, observed: true, mirror: s > 0, label: s ? `Experiment 1: ${comma(s)} shuffles` : 'Experiment 1: the shuffles will pile up here' });
  const one: Readout[] = [
    { id: 'meanA', label: 'mean of A', value: fmt(mean(first.a), 3), tone: 1 },
    { id: 'meanB', label: 'mean of B', value: fmt(mean(first.b), 3), tone: 2 },
    { id: 'observed', label: 'real difference A − B', value: signed(run.observed, 3), mark: 'key' },
  ];
  const all = EXPERIMENTS * SHUFFLES;

  yield frame([groups, hist(0), readouts(one)], 0, {
    line: 0,
    note: `Here the null hypothesis is true by construction: all 16 scores are drawn from one population, a bell curve with mean ${POP_MEAN} and spread ${POP_SD}, and the labels A and B are handed out at random. Any difference between the groups is luck, and the two groups never come out exactly equal.`,
    vars: { observed: round(run.observed, 3) },
    // Asked of such experiments in general, before this one's p, so it is fair whatever gap luck made here.
    checkpoint: askInOrder('In experiments like this, where nothing is going on, how often will p come out at or below 0.05?', NULL_ASK, NULL_ASK[0]),
  });

  yield frame([groups, hist(SHUFFLES), readouts([...one, { id: 'extreme', label: 'at least as extreme', value: comma(run.extreme), mark: 'found' }, { id: 'p', label: 'p', value: p1 }])], SHUFFLES, {
    line: 7,
    note: `${comma(SHUFFLES)} shuffles: ${comma(run.extreme)} are at least as extreme as the real ${signed(run.observed, 3)}, so p = ${p1}. ${lit(run.extreme, SHUFFLES, ALPHA) ? 'Below 0.05, although nothing is going on: one of the false alarms the threshold allows.' : 'Not small: chance alone easily explains the gap, as it should, since chance alone made it.'}`,
    vars: { observed: round(run.observed, 3), extreme: run.extreme, p: round(run.p, 4) },
    checkpoint: askInOrder(`Repeat the experiment ${EXPERIMENTS} times, with fresh scores each time. What shape will the histogram of the ${EXPERIMENTS} p-values take?`, SHAPE_ASK, SHAPE_ASK[0]),
  });

  const counts = (readoutsFor: Readout[]) => readouts([{ id: 'experiments', label: 'experiments', value: String(EXPERIMENTS) }, ...readoutsFor], 'Across the experiments');
  yield frame([groups, pPlane(experiments, () => false, `The p-values of ${EXPERIMENTS} no-effect experiments`), counts([])], all, {
    line: 7,
    note: `${EXPERIMENTS} experiments, each with its own fresh scores and ${comma(SHUFFLES)} shuffles, every one with nothing going on. Their p-values spread out over the whole range from 0 to 1, roughly level from one end to the other.`,
    vars: { experiments: EXPERIMENTS },
    checkpoint: askInOrder('Calling every p ≤ 0.05 a real difference, what share of no-effect experiments would be called one, in the long run?', SHARE_ASK, SHARE_ASK[1]),
  });

  yield frame([groups, pPlane(experiments, (i) => i === 0, `${below} of ${EXPERIMENTS} p-values at or below 0.05`), counts([{ id: 'below', label: 'p ≤ 0.05', value: `${below} of ${EXPERIMENTS}`, mark: 'found' }])], all, {
    line: 8,
    note: `The pile is roughly level, about ${EXPERIMENTS / 20} in each bar of width 0.05. The first bar holds every p ≤ 0.05: ${below} of the ${EXPERIMENTS} experiments, near the 1 in 20 that a level pile puts there. Each would be reported as a difference, and each is a false alarm. The threshold 0.05 is exactly this: of the experiments where nothing is going on, the share you agree to call significant.`,
    vars: { experiments: EXPERIMENTS, below },
    checkpoint: askInOrder('For one more no-effect experiment, which is more likely?', MORE_LIKELY, 'p > 0.5'),
  });

  yield frame([groups, pPlane(experiments, (i) => i >= 10, `${above} of ${EXPERIMENTS} p-values above 0.5`), counts([{ id: 'below', label: 'p ≤ 0.05', value: `${below} of ${EXPERIMENTS}` }, { id: 'above', label: 'p > 0.5', value: `${above} of ${EXPERIMENTS}`, mark: 'found' }])], all, {
    line: 7,
    note: `p > 0.5 covers ten bars, half the range, so about half the experiments land there: ${above} of ${EXPERIMENTS}, against ${below} at or below 0.05. A large p is simply what no effect usually looks like.`,
    vars: { experiments: EXPERIMENTS, below, above },
    checkpoint: askInOrder('Suppose only p ≤ 0.01 counts as a finding. In the long run, what share of no-effect experiments would still be called one?', STRICTER, 'About 1 in 100'),
  });

  yield frame(
    [
      groups,
      pPlane(experiments, (i) => i === 0, `${strict} of ${EXPERIMENTS} p-values at or below 0.01`),
      counts([{ id: 'below', label: 'p ≤ 0.05', value: `${below} of ${EXPERIMENTS}` }, { id: 'strict', label: 'p ≤ 0.01', value: `${strict} of ${EXPERIMENTS}`, mark: 'found' }]),
    ],
    all,
    {
      line: 8,
      note: `When the null hypothesis is true, p is roughly equally likely to land anywhere from 0 to 1, so a level pile puts a share t of the p-values at or below any threshold t: about 1 in 100 at or below 0.01, here ${strict} of ${EXPERIMENTS}. A stricter threshold means fewer false alarms, but also more real differences missed, so no threshold makes a single test certain.`,
      vars: { experiments: EXPERIMENTS, below, strict },
    },
  );
}

// ───────────────────────────── story 3: twenty tests at once ─────────────────────────────

/** p on a log scale: 1 at the top, 0.001 near the bottom; a p of 0 sits on the floor. */
const FLOOR = -3.3;
const logP = (p: number) => round(Math.max(FLOOR + 0.05, Math.log10(Math.max(p, 10 ** (FLOOR + 0.05)))), 2);
const P_LOG: Axis = { min: FLOOR, max: 0.1, label: 'p (log scale)', ticks: [0, -1, -2, -3].map((k) => ({ at: k, label: String(10 ** k) })) };
const TESTS_X: Axis = { min: 0.3, max: TESTS + 0.7, ticks: [1, 5, 10, 15, 20].map((t) => ({ at: t, label: String(t) })) };
export const HOW_MANY = ['None', 'About 1', 'About 5', 'All 20'];
export const ANY_ASK = ['About 5%', 'About 36%', 'About 64%', 'Certain: 20 × 5% = 100%'];
export const THRESHOLD_ASK = ['0.05, as before', '0.0025 = 0.05 ÷ 20', '0.011 = 0.05 ÷ √20', '1 = 0.05 × 20'];
export const AFTER_ASK = ['About 0.25%', 'About 5%', 'About 64%'];

function testsPlane(tests: readonly Experiment[], threshold: number | null, label: string): PlanePart {
  return {
    kind: 'plane',
    id: 'tests',
    label,
    x: TESTS_X,
    y: P_LOG,
    equal: false,
    shapes: [
      {
        kind: 'bars',
        id: 'pbars',
        bars: tests.map((t, i): Bar => {
          const on = threshold !== null && lit(t.extreme, SHUFFLES, threshold);
          return { id: `t${i + 1}`, x0: i + 0.65, x1: i + 1.35, y0: FLOOR, y: logP(t.p), ...(on ? { mark: 'found' as const, label: fmt(t.p, 3) } : {}) };
        }),
      },
      { kind: 'line', id: 'alpha', through: [0, round(Math.log10(ALPHA), 2)], dir: [1, 0], dashed: true, label: 'p = 0.05' },
      ...(threshold === BONFERRONI ? [{ kind: 'line', id: 'bonferroni', through: [0, round(Math.log10(BONFERRONI), 2)], dir: [1, 0], mark: 'key', label: 'p = 0.0025' } as Shape] : []),
    ],
    handles: [],
  };
}

function* manyStory(seed: number): Generator<Frame<PlotState>> {
  const tests = manyTests(seed);
  const litAt = (threshold: number) => tests.filter((t) => lit(t.extreme, SHUFFLES, threshold)).length;
  const k05 = litAt(ALPHA);
  const kB = litAt(BONFERRONI);
  const rs = rounds(seed);
  const anyIn = rs.lit.filter((r) => r.some(Boolean)).length;
  const frame = (parts: PlotPart[], shuffles: number, o: Omit<Parameters<typeof plotFrame>[1], 'stats'>) => plotFrame(parts, { ...o, stats: { shuffles } });
  const shown = TESTS * SHUFFLES;
  const all = shown + rs.shuffles;
  const named = (threshold: number) =>
    tests
      .map((t, i) => [t, i + 1] as const)
      .filter(([t]) => lit(t.extreme, SHUFFLES, threshold))
      .map(([t, i]) => `test ${i} (p = ${fmt(t.p, 3)})`);

  yield frame([testsPlane([], null, `${TESTS} tests, none run yet`), readouts([{ id: 'tests', label: 'tests', value: String(TESTS) }, { id: 'threshold', label: 'threshold', value: '0.05' }])], 0, {
    line: 2,
    note: `Twenty study tricks, tested one by one: for each, 8 students who used it against 8 who didn't. None of them works: every score comes from the same population. Each test is a permutation test with ${comma(SHUFFLES)} shuffles, and a test lights up when its p ≤ 0.05.`,
    vars: { tests: TESTS },
    checkpoint: askInOrder(`About how many of the ${TESTS} tests would you expect to light up?`, HOW_MANY, 'About 1'),
  });

  yield frame([testsPlane(tests, ALPHA, `${k05} of ${TESTS} tests at p ≤ 0.05`), readouts([{ id: 'tests', label: 'tests', value: String(TESTS) }, { id: 'lit', label: 'p ≤ 0.05', value: `${k05} of ${TESTS}`, mark: 'found' }])], shown, {
    line: 8,
    note: `Each test has a 1 in 20 chance of a false alarm, so 20 tests average 1 between them. This round, ${k05 === 0 ? 'none lit up' : `${k05} lit up: ${named(ALPHA).join(', ')}`}. Some rounds have none, some two or three.`,
    vars: { tests: TESTS, lit: k05 },
    checkpoint: askInOrder(`What is the chance that at least one of ${TESTS} no-effect tests lights up?`, ANY_ASK, 'About 64%'),
  });

  yield frame(
    [
      testsPlane(tests, ALPHA, `${k05} of ${TESTS} tests at p ≤ 0.05`),
      readouts([
        { id: 'lit', label: 'p ≤ 0.05 this round', value: `${k05} of ${TESTS}` },
        { id: 'rounds', label: `rounds with at least one lit`, value: `${anyIn} of ${ROUNDS}`, mark: 'found' },
        { id: 'theory', label: '1 − 0.95²⁰', value: fmt(anyFalseAlarm(ALPHA), 3) },
      ]),
    ],
    all,
    {
      line: 8,
      note: `A test stays dark with chance 0.95, so all 20 stay dark with chance 0.95²⁰ ≈ ${fmt((1 - ALPHA) ** TESTS, 2)}, and at least one lights up with chance 1 − 0.95²⁰ ≈ ${fmt(anyFalseAlarm(ALPHA), 2)}. In ${ROUNDS} more rounds of 20 tests (each with ${ROUND_SHUFFLES} shuffles, enough to tell p ≤ 0.05), ${anyIn} lit at least one. Report only the test that lit up and it looks like a discovery.`,
      vars: { tests: TESTS, lit: k05, rounds: ROUNDS, 'any lit': anyIn },
      checkpoint: askInOrder(`To keep the chance of any false alarm in a round of ${TESTS} near 5%, what threshold should each test use?`, THRESHOLD_ASK, THRESHOLD_ASK[1]),
    },
  );

  yield frame([testsPlane(tests, BONFERRONI, `${kB} of ${TESTS} tests at p ≤ 0.0025`), readouts([{ id: 'lit', label: 'p ≤ 0.05', value: `${k05} of ${TESTS}` }, { id: 'litB', label: 'p ≤ 0.0025', value: `${kB} of ${TESTS}`, mark: 'found' }])], all, {
    line: 9,
    note: `Divide the threshold by the number of tests: 0.05 ÷ 20 = 0.0025 for each. Now this round has ${kB === 0 ? 'no test lit up' : `${kB} lit: ${named(BONFERRONI).join(', ')}`}. Each test is held to a far stricter standard, because 20 chances were taken.`,
    vars: { tests: TESTS, lit: kB },
    checkpoint: askInOrder('With every test at 0.0025, what is the chance that at least one of the 20 lights up?', AFTER_ASK, 'About 5%'),
  });

  yield frame([testsPlane(tests, BONFERRONI, `${kB} of ${TESTS} tests at p ≤ 0.0025`), readouts([{ id: 'litB', label: 'p ≤ 0.0025', value: `${kB} of ${TESTS}` }, { id: 'theory', label: '1 − 0.9975²⁰', value: fmt(anyFalseAlarm(BONFERRONI), 4), mark: 'found' }])], all, {
    line: 9,
    note: `1 − 0.9975²⁰ ≈ ${fmt(anyFalseAlarm(BONFERRONI), 3)}: about 5% again, for the whole round. Dividing the threshold by the number of tests (Bonferroni's correction) keeps the chance of any false alarm at about 0.05, however many things are tested. The price: a real but modest difference now needs a much smaller p to be noticed.`,
    vars: { tests: TESTS, lit: kB },
  });
}

function* run(input: PermutationInput): Generator<Frame<PlotState>> {
  if (input.story === 'shuffle') yield* shuffleStory(input.a, input.b, input.seed);
  else if (input.story === 'no-effect') yield* noEffectStory(input.seed);
  else yield* manyStory(input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const okSeed = (s: number) => Number.isInteger(s) && s >= 1 && s < PM_M;
/** A Park–Miller state from any seed: never 0 (the generator would stick there). */
export const pmSeed = (seed: number) => seed % PM_M || 1;

const groupError = `Each group has ${GROUP_MIN} to ${GROUP_MAX} whole-number scores from 0 to ${SCORE_MAX}.`;

export function parsePermutation(text: string): { value: PermutationInput } | { error: string } {
  const t = text.toLowerCase().trim();
  const story = (t.match(/^[a-z-]+/) ?? [''])[0] as Story;
  if (!STORIES.includes(story)) return { error: 'Start with shuffle, no-effect or many, e.g. many seed 7, or shuffle a 72 85 64 b 66 73 58 seed 7.' };
  const seedText = t.match(/\bseed\s+(\S+)/);
  const seed = seedText ? Number(seedText[1]) : NaN;
  if (!okSeed(seed)) return { error: `Give a seed, a whole number from 1 to ${PM_M - 1}, e.g. ${story === 'shuffle' ? 'shuffle a 72 85 64 b 66 73 58 seed 7' : `${story} seed 7`}.` };
  const rest = t.slice(story.length).replace(/\bseed\s+\S+/, '');
  if (story !== 'shuffle') {
    if (rest.trim() !== '') return { error: `${story} takes only a seed, e.g. ${story} seed 7.` };
    return { value: { story, seed } };
  }
  const m = rest.match(/^\s*a\b([^a-z]*)\bb\b([^a-z]*)$/);
  if (!m) return { error: 'Give group A after "a" and group B after "b", then the seed, e.g. shuffle a 72 85 64 b 66 73 58 seed 7.' };
  const a = numbersIn(m[1]);
  const b = numbersIn(m[2]);
  const fine = (xs: number[]) => xs.length >= GROUP_MIN && xs.length <= GROUP_MAX && xs.every((x) => Number.isInteger(x) && x >= 0 && x <= SCORE_MAX);
  if (!fine(a) || !fine(b)) return { error: groupError };
  return { value: { story, a, b, seed } };
}

export function formatPermutation(input: PermutationInput): string {
  return input.story === 'shuffle' ? `shuffle a ${input.a.join(' ')} b ${input.b.join(' ')} seed ${input.seed}` : `${input.story} seed ${input.seed}`;
}

/** Dragging A's mean moves every A score by the same whole number of points (at least one, the way it was dragged), inside 0 to 100. */
export function dragPermutation(input: PermutationInput, _handle: string, to: Vec): PermutationInput {
  if (input.story !== 'shuffle') return input;
  const by = to[1] - mean(input.a);
  if (Math.abs(by) < 1e-9) return input;
  const whole = Math.sign(by) * Math.max(1, Math.round(Math.abs(by)));
  const lo = -Math.min(...input.a);
  const hi = SCORE_MAX - Math.max(...input.a);
  const shift = Math.min(hi, Math.max(lo, whole));
  return shift === 0 ? input : { ...input, a: input.a.map((x) => x + shift) };
}

const example = (id: string, label: string, make: (seed: number) => PermutationInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(pmSeed(seed)), sized: false });

export const permutationTest = defineAlgorithm<PermutationInput, PlotState>({
  kind: 'algorithm',
  slug: 'permutation-test',
  view: 'plot',
  input: {
    examples: [
      example('shuffle', 'Shuffle the labels: is a 10-point gap luck?', (seed) => ({ story: 'shuffle', a: [...FLASHCARDS], b: [...REREADING], seed })),
      example('no-effect', 'When nothing is going on: where do p-values land?', (seed) => ({ story: 'no-effect', seed })),
      example('many', 'Twenty tests at once', (seed) => ({ story: 'many', seed })),
    ],
    custom: {
      label: 'shuffle with two groups of 2 to 8 whole-number scores (0 to 100) and a seed; no-effect or many with a seed',
      placeholder: 'e.g. shuffle a 72 85 64 b 66 73 58 seed 7, or many seed 7',
      parse: parsePermutation,
      format: formatPermutation,
    },
    drag: dragPermutation,
  },
  pseudocode,
  stats: [{ key: 'shuffles', label: 'Shuffles so far' }],
  legend: [
    { neutral: 'Shuffled differences, p-values and guides' },
    { tone: 1, label: 'Group A, or the shuffled A′' },
    { tone: 2, label: 'Group B, or the shuffled B′' },
    { mark: 'found', label: 'At least as extreme as the real split; a p at or below the threshold' },
    { mark: 'key', label: 'The real difference; the mean you drag; the corrected threshold' },
  ],
  run,
  content: {
    idea: 'To ask whether a difference between two groups could be chance alone, suppose it is (the null hypothesis): then the group labels are arbitrary. Shuffle them many times, record the difference each shuffle gives, and see where the real difference falls in that pile. p is the share of shuffles at least as extreme as the real split, on either side.',
    invariant: 'p is the chance of data at least this extreme if the null hypothesis is true, never the chance that it is true. When nothing is going on, p is roughly equally likely to land anywhere from 0 to 1, so p ≤ 0.05 turns up about 1 time in 20; m tests at once need 0.05/m each to keep that.',
    whenToUse: 'Whenever you compare two groups, an A/B test of a website, a drug against a placebo, a new model against the old one on test cases, and want to know whether the gap is bigger than shuffling alone would produce, without assuming a bell curve.',
    traits: [
      { label: 'Assumes nothing about the shape of the data', good: true },
      { label: 'Needs many shuffles: the estimate of p wobbles', good: false },
      { label: 'Exact when every split can be counted', good: true },
      { label: 'Same seed, same shuffles', good: null },
    ],
    experiments: [
      { example: 'shuffle', prompt: 'Drag A’s mean down until the gap is about 5. Where does the real line sit in the pile now, and what is p?' },
      { example: 'no-effect', prompt: 'Press New values a few times. How often is experiment 1’s p at or below 0.05?' },
      { example: 'many', prompt: 'Press New values several times. What share of rounds light up nothing at 0.05?' },
    ],
  },
});

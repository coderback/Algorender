// "Break it" (REVAMP_PLAN.md §7): the learner crafts the input that hurts an
// algorithm. Each challenge is a pure checker: it validates the input, runs
// the real thing, and says how close the input came to the target.

import { quickSort } from '@/algorithms/sorting/quick-sort';
import { recordTrace } from '@/engine/trace';

export type ChallengeId = 'quicksort-worst' | 'greedy-coins' | 'hash-flood';

/** An attempt's outcome, as `game.played` records it: what the input achieved, against the target. */
export type Attempt = { score: number; max: number; won: boolean };

export type Parsed<T> = { value: T } | { error: string };

/** Whole numbers separated by commas or spaces: exactly `count` of them, each in [min, max], optionally all different. */
export function parseNumbers(text: string, { count, min, max, distinct = false }: { count: number; min: number; max: number; distinct?: boolean }): Parsed<number[]> {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return { error: `Enter ${count} numbers, separated by commas or spaces.` };
  const values: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n)) return { error: `“${part}” isn’t a whole number.` };
    if (n < min || n > max) return { error: `Every number must be between ${min} and ${max}; ${n} isn’t.` };
    values.push(n);
  }
  if (values.length !== count) return { error: `Enter exactly ${count} numbers; you entered ${values.length}.` };
  if (distinct) {
    const seen = new Set<number>();
    for (const v of values) {
      if (seen.has(v)) return { error: `Each key must be different; ${v} appears twice.` };
      seen.add(v);
    }
  }
  return { value: values };
}

// ---------------------------------------------------------------------------
// 1. Quicksort's worst case

/** How many values the learner gives quicksort. */
export const QUICK_N = 10;
/** The visualiser's own range, so the link to it opens with exactly this input. */
export const QUICK_MIN = 5;
export const QUICK_MAX = 99;
/**
 * The most comparisons quicksort (Lomuto partition, last element as pivot)
 * can make on n values: a partition of m values compares m − 1 of them with
 * the pivot, and the total is largest when every partition leaves one side
 * empty: (n − 1) + (n − 2) + … + 1 = n(n − 1)/2.
 */
export const quickWorst = (n: number) => (n * (n - 1)) / 2;
/** The expected comparisons on a random order of n distinct values: 2(n + 1)Hₙ − 4n. */
export function quickAverage(n: number): number {
  let h = 0;
  for (let k = 1; k <= n; k++) h += 1 / k;
  return 2 * (n + 1) * h - 4 * n;
}

/** Comparisons the real quick-sort visualiser makes on these values. */
export function quickComparisons(values: readonly number[]): number {
  const { frames } = recordTrace(quickSort.run([...values]));
  return frames.at(-1)?.stats.comparisons ?? 0;
}

export function parseQuick(text: string): Parsed<number[]> {
  return parseNumbers(text, { count: QUICK_N, min: QUICK_MIN, max: QUICK_MAX });
}

export function quicksortAttempt(values: readonly number[]): Attempt & { comparisons: number } {
  const comparisons = quickComparisons(values);
  const max = quickWorst(values.length);
  return { comparisons, score: comparisons, max, won: comparisons >= max };
}

/** The quick-sort visualiser, opened on these values. */
export const quickHref = (values: readonly number[]) => `/visualisers/quick-sort?${new URLSearchParams({ input: values.join(',') })}`;

// ---------------------------------------------------------------------------
// 2. A counterexample to greedy coin change

export const COIN_SETS = [
  [1, 3, 4],
  [1, 5, 6, 9],
] as const;
export const AMOUNT_MIN = 1;
export const AMOUNT_MAX = 60;

export type Change = { coins: number[]; count: number };

/** Largest coin first, as many times as it fits, then the next. */
export function greedyChange(coins: readonly number[], amount: number): Change {
  const used: number[] = [];
  let left = amount;
  for (const c of [...coins].sort((a, b) => b - a)) {
    while (left >= c) {
      used.push(c);
      left -= c;
    }
  }
  return { coins: used, count: used.length };
}

/** The fewest coins that make the amount (dynamic programming), largest coins first in the breakdown. Every set here has a 1, so every amount can be made. */
export function optimalChange(coins: readonly number[], amount: number): Change {
  const best: number[] = Array(amount + 1).fill(Infinity);
  const last: number[] = Array(amount + 1).fill(0);
  best[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && best[a - c] + 1 < best[a]) {
        best[a] = best[a - c] + 1;
        last[a] = c;
      }
    }
  }
  const used: number[] = [];
  for (let a = amount; a > 0; a -= last[a]) used.push(last[a]);
  used.sort((x, y) => y - x);
  return { coins: used, count: used.length };
}

export function parseAmount(text: string): Parsed<number> {
  const raw = text.trim();
  if (!raw) return { error: 'Enter an amount.' };
  const n = Number(raw);
  if (!Number.isInteger(n)) return { error: `“${raw}” isn’t a whole number.` };
  if (n < AMOUNT_MIN || n > AMOUNT_MAX) return { error: `The amount must be between ${AMOUNT_MIN} and ${AMOUNT_MAX}.` };
  return { value: n };
}

/** Won when greedy uses more coins than the best way. The score is how many extra coins greedy used; the target is one. */
export function coinsAttempt(coins: readonly number[], amount: number): Attempt & { greedy: Change; optimal: Change } {
  const greedy = greedyChange(coins, amount);
  const optimal = optimalChange(coins, amount);
  const extra = greedy.count - optimal.count;
  return { greedy, optimal, score: extra, max: 1, won: extra >= 1 };
}

// ---------------------------------------------------------------------------
// 3. A hash flood

export const BUCKETS = 8;
export const KEY_COUNT = 8;
export const KEY_MIN = 0;
export const KEY_MAX = 999;

export const bucketOf = (key: number) => key % BUCKETS;

/** Each bucket's chain, keys in the order they were inserted. */
export function hashChains(keys: readonly number[]): number[][] {
  const chains: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (const k of keys) chains[bucketOf(k)].push(k);
  return chains;
}

export function parseKeys(text: string): Parsed<number[]> {
  return parseNumbers(text, { count: KEY_COUNT, min: KEY_MIN, max: KEY_MAX, distinct: true });
}

/** The score is the longest chain: a lookup in it checks that many keys. The target is all of them in one bucket. */
export function floodAttempt(keys: readonly number[]): Attempt & { chains: number[][] } {
  const chains = hashChains(keys);
  const longest = Math.max(...chains.map((c) => c.length));
  return { chains, score: longest, max: keys.length, won: longest >= keys.length };
}

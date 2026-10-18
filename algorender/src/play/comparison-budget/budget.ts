// Comparison budget: sort n hidden cards by comparing two at a time. The
// pure logic lives here: the deal, the budgets (the information-theoretic
// lower bound ⌈log₂ n!⌉ and what real algorithms need in the worst case),
// what the comparisons so far imply, and how many orders are still possible.

import { createRng } from '@/engine/random';

export const MIN_CARDS = 4;
export const MAX_CARDS = 8;
export const DEFAULT_CARDS = 6;

/** Card names, in deal order. */
export const LABELS = 'ABCDEFGH';

/** One comparison made: card `lo` turned out smaller than card `hi` (indices into the deal). */
export type Comparison = { lo: number; hi: number };

export function factorial(n: number): number {
  let f = 1;
  for (let k = 2; k <= n; k++) f *= k;
  return f;
}

/** ⌈log₂ n!⌉: no comparison sort can do better in the worst case, since each answer at best halves the n! possible orders. */
export function lowerBound(n: number): number {
  const orders = factorial(n);
  let k = 0;
  while (2 ** k < orders) k++;
  return k;
}

const ceilLog2 = (n: number) => {
  let k = 0;
  while (2 ** k < n) k++;
  return k;
};

/** Merge sort's worst case: n⌈log₂ n⌉ − 2^⌈log₂ n⌉ + 1 comparisons. */
export function mergeSortWorst(n: number): number {
  if (n <= 1) return 0;
  const k = ceilLog2(n);
  return n * k - 2 ** k + 1;
}

/** Binary insertion's worst case: inserting the k-th card takes ⌈log₂ k⌉ comparisons. */
export function binaryInsertionWorst(n: number): number {
  let total = 0;
  for (let k = 1; k <= n; k++) total += ceilLog2(k);
  return total;
}

/** Comparing every pair: n(n − 1)/2. */
export const allPairs = (n: number) => (n * (n - 1)) / 2;

/** n distinct card values from a seed (1 to 99, so they read as plain numbers when revealed). */
export function deal(n: number, seed: number): number[] {
  const rng = createRng(seed);
  const values = new Set<number>();
  while (values.size < n) values.add(1 + Math.floor(rng() * 99));
  return [...values];
}

/** The outcome of comparing two cards. */
export function compare(values: readonly number[], a: number, b: number): Comparison {
  return values[a] < values[b] ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** Whether a and b were compared directly already (in either order). */
export const comparedBefore = (comparisons: readonly Comparison[], a: number, b: number) =>
  comparisons.some((c) => (c.lo === a && c.hi === b) || (c.lo === b && c.hi === a));

/** What the comparisons imply: `less[i][j]` when card i is known to be smaller than card j (the transitive closure). */
export function closure(n: number, comparisons: readonly Comparison[]): boolean[][] {
  const less = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  for (const c of comparisons) less[c.lo][c.hi] = true;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) if (less[i][k]) for (let j = 0; j < n; j++) if (less[k][j]) less[i][j] = true;
  return less;
}

/** Whether the comparisons force this order: every card is known to be smaller than the next. */
export function forced(order: readonly number[], less: readonly (readonly boolean[])[]): boolean {
  for (let k = 0; k + 1 < order.length; k++) if (!less[order[k]][order[k + 1]]) return false;
  return true;
}

/** Whether an order of cards is ascending by value. */
export function ascending(order: readonly number[], values: readonly number[]): boolean {
  for (let k = 0; k + 1 < order.length; k++) if (values[order[k]] > values[order[k + 1]]) return false;
  return true;
}

/**
 * How many orders of the n cards are still consistent with the comparisons
 * (the linear extensions of the partial order they imply). Counted over
 * subsets: an order is built card by card, and a card can come next once
 * every card known to be smaller is already placed.
 */
export function remainingOrders(n: number, comparisons: readonly Comparison[]): number {
  const smaller = Array<number>(n).fill(0);
  for (const c of comparisons) smaller[c.hi] |= 1 << c.lo;
  const ways = Array<number>(1 << n).fill(0);
  ways[0] = 1;
  for (let mask = 0; mask < 1 << n; mask++) {
    if (!ways[mask]) continue;
    for (let x = 0; x < n; x++) if (!(mask & (1 << x)) && (smaller[x] & mask) === smaller[x]) ways[mask | (1 << x)] += ways[mask];
  }
  return ways[(1 << n) - 1];
}

export type Verdict = 'won' | 'over-budget' | 'lucky' | 'wrong';

/**
 * How a round ended: the order must be ascending, and forced by the
 * comparisons (a right order that was a guess doesn't count); a forced right
 * order wins within merge sort's worst case.
 */
export function verdict(order: readonly number[], values: readonly number[], comparisons: readonly Comparison[]): Verdict {
  if (!ascending(order, values)) return 'wrong';
  if (!forced(order, closure(values.length, comparisons))) return 'lucky';
  return comparisons.length <= mergeSortWorst(values.length) ? 'won' : 'over-budget';
}

/** Where a card lands in the row when put at gap k (0 = first), moving it if it was already placed. */
export function place(row: readonly number[], card: number, gap: number): number[] {
  const next = [...row];
  const old = next.indexOf(card);
  let at = gap;
  if (old >= 0) {
    next.splice(old, 1);
    if (old < at) at--;
  }
  next.splice(at, 0, card);
  return next;
}

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allPairs,
  ascending,
  binaryInsertionWorst,
  closure,
  compare,
  comparedBefore,
  deal,
  factorial,
  forced,
  lowerBound,
  mergeSortWorst,
  place,
  remainingOrders,
  verdict,
  type Comparison,
} from './budget';

/** Every permutation of 0..n−1. */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, k) => [...p.slice(0, k), n - 1, ...p.slice(k)]));
}

/** Orders consistent with the comparisons, by brute force. */
const bruteRemaining = (n: number, comparisons: readonly Comparison[]) =>
  permutations(n).filter((order) => comparisons.every((c) => order.indexOf(c.lo) < order.indexOf(c.hi))).length;

/** Binary insertion, asking the deal through `compare`: returns the row and the comparisons it made. */
function binaryInsertion(values: readonly number[]) {
  const comparisons: Comparison[] = [];
  let row: number[] = [];
  for (let card = 0; card < values.length; card++) {
    let lo = 0;
    let hi = row.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const c = compare(values, card, row[mid]);
      comparisons.push(c);
      if (c.lo === card) hi = mid;
      else lo = mid + 1;
    }
    row = place(row, card, lo);
  }
  return { row, comparisons };
}

const dealArb = fc.record({ n: fc.integer({ min: 1, max: 8 }), seed: fc.integer({ min: 0, max: 1_000_000 }) });

describe('the budgets', () => {
  it('knows the lower bound and merge sort’s worst case for 1 to 8 cards', () => {
    const ns = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(ns.map(lowerBound)).toEqual([0, 1, 3, 5, 7, 10, 13, 16]);
    expect(ns.map(mergeSortWorst)).toEqual([0, 1, 3, 5, 8, 11, 14, 17]);
    expect(ns.map(binaryInsertionWorst)).toEqual([0, 1, 3, 5, 8, 11, 14, 17]);
    expect(ns.map(allPairs)).toEqual([0, 1, 3, 6, 10, 15, 21, 28]);
    for (const n of ns) expect(2 ** lowerBound(n)).toBeGreaterThanOrEqual(factorial(n));
  });

  it('deals distinct values, the same for the same seed', () => {
    fc.assert(
      fc.property(dealArb, ({ n, seed }) => {
        const values = deal(n, seed);
        expect(new Set(values).size).toBe(n);
        expect(values.every((v) => v >= 1 && v <= 99)).toBe(true);
        expect(deal(n, seed)).toEqual(values);
      }),
    );
  });
});

describe('what the comparisons imply', () => {
  it('closes them transitively, and only forces an order every adjacent pair of which is known', () => {
    const comparisons: Comparison[] = [
      { lo: 0, hi: 1 },
      { lo: 1, hi: 2 },
    ];
    const less = closure(4, comparisons);
    expect(less[0][2]).toBe(true);
    expect(less[2][0]).toBe(false);
    expect(less[0][3] || less[3][0]).toBe(false);
    expect(forced([0, 1, 2], less)).toBe(true);
    expect(forced([0, 1, 2, 3], less)).toBe(false);
    expect(forced([1, 0, 2], less)).toBe(false);
  });

  it('counts the orders still possible, matching brute force', () => {
    fc.assert(
      fc.property(dealArb, fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 10 }), ({ n, seed }, pairs) => {
        const values = deal(n, seed);
        const comparisons = pairs.filter(([a, b]) => a < n && b < n && a !== b).map(([a, b]) => compare(values, a, b));
        expect(remainingOrders(n, comparisons)).toBe(bruteRemaining(n, comparisons));
      }),
      { numRuns: 60 },
    );
    expect(remainingOrders(6, [])).toBe(720);
  });

  it('knows a pair compared before, in either order', () => {
    expect(comparedBefore([{ lo: 2, hi: 0 }], 0, 2)).toBe(true);
    expect(comparedBefore([{ lo: 2, hi: 0 }], 0, 1)).toBe(false);
  });
});

describe('a round', () => {
  it('binary insertion always ends with one order left, forced and right, within merge sort’s worst case', () => {
    fc.assert(
      fc.property(dealArb, ({ n, seed }) => {
        const values = deal(n, seed);
        const { row, comparisons } = binaryInsertion(values);
        expect(ascending(row, values)).toBe(true);
        expect(forced(row, closure(n, comparisons))).toBe(true);
        expect(remainingOrders(n, comparisons)).toBe(1);
        expect(comparisons.length).toBeLessThanOrEqual(binaryInsertionWorst(n));
        expect(verdict(row, values, comparisons)).toBe('won');
      }),
    );
  });

  it('calls a right order nobody proved a lucky guess, and a wrong one wrong', () => {
    const values = [30, 10, 20];
    expect(verdict([1, 2, 0], values, [])).toBe('lucky');
    expect(verdict([0, 1, 2], values, [])).toBe('wrong');
    const all = [compare(values, 0, 1), compare(values, 1, 2), compare(values, 0, 2)];
    expect(verdict([1, 2, 0], values, all)).toBe('won');
  });

  it('is over budget when the order is proved with more comparisons than merge sort needs', () => {
    const values = [40, 10, 30, 20];
    const every: Comparison[] = [];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) every.push(compare(values, a, b));
    expect(every.length).toBeGreaterThan(mergeSortWorst(4));
    expect(verdict([1, 3, 2, 0], values, every)).toBe('over-budget');
  });

  it('places a card at a gap, moving it when it was already in the row', () => {
    expect(place([], 3, 0)).toEqual([3]);
    expect(place([0, 1, 2], 3, 1)).toEqual([0, 3, 1, 2]);
    expect(place([0, 1, 2], 0, 3)).toEqual([1, 2, 0]);
    expect(place([0, 1, 2], 2, 0)).toEqual([2, 0, 1]);
  });
});

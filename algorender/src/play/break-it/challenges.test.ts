import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  coinsAttempt,
  COIN_SETS,
  floodAttempt,
  greedyChange,
  hashChains,
  optimalChange,
  parseAmount,
  parseKeys,
  parseNumbers,
  parseQuick,
  QUICK_MAX,
  QUICK_MIN,
  QUICK_N,
  quickAverage,
  quickComparisons,
  quickHref,
  quicksortAttempt,
  quickWorst,
} from './challenges';

const permutations = (xs: number[]): number[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

describe('quicksort’s worst case', () => {
  it('hits n(n − 1)/2 = 45 comparisons on sorted, reversed and all-equal input', () => {
    expect(quickWorst(QUICK_N)).toBe(45);
    const sorted = Array.from({ length: QUICK_N }, (_, i) => 10 + i * 5);
    for (const values of [sorted, [...sorted].reverse(), Array(QUICK_N).fill(42)]) {
      expect(quicksortAttempt(values)).toMatchObject({ comparisons: 45, score: 45, max: 45, won: true });
    }
  });

  it('never exceeds n(n − 1)/2: every order of 7 values, by brute force', () => {
    let worst = 0;
    for (const p of permutations([10, 20, 30, 40, 50, 60, 70])) worst = Math.max(worst, quickComparisons(p));
    expect(worst).toBe(quickWorst(7));
  });

  it('never exceeds 45 on any 10 values the learner can type', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: QUICK_MIN, max: QUICK_MAX }), { minLength: QUICK_N, maxLength: QUICK_N }), (values) => {
        const c = quickComparisons(values);
        expect(c).toBeLessThanOrEqual(45);
        expect(c).toBeGreaterThanOrEqual(QUICK_N - 1);
      }),
      { numRuns: 300 },
    );
  });

  it('averages about 2(n + 1)Hₙ − 4n on random distinct values', () => {
    expect(quickAverage(QUICK_N)).toBeCloseTo(24.4, 1);
    let total = 0;
    const runs = 400;
    fc.assert(
      fc.property(fc.shuffledSubarray(Array.from({ length: 90 }, (_, i) => i + 10), { minLength: QUICK_N, maxLength: QUICK_N }), (values) => {
        total += quickComparisons(values);
      }),
      { numRuns: runs, seed: 7 },
    );
    expect(total / runs).toBeGreaterThan(quickAverage(QUICK_N) - 2.5);
    expect(total / runs).toBeLessThan(quickAverage(QUICK_N) + 2.5);
  });

  it('a balanced input stays far from the target', () => {
    const attempt = quicksortAttempt([30, 10, 20, 50, 40, 80, 60, 90, 70, 55]);
    expect(attempt.won).toBe(false);
    expect(attempt.score).toBeLessThan(45);
  });

  it('validates what the learner types, in the visualiser’s range', () => {
    expect(parseQuick('5 10, 15,20 25 30 35 40 45 50')).toEqual({ value: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] });
    expect(parseQuick('')).toEqual({ error: expect.stringMatching(/Enter 10 numbers/) });
    expect(parseQuick('1 2 3')).toEqual({ error: expect.stringMatching(/between 5 and 99/) });
    expect(parseQuick('10 20 30')).toEqual({ error: 'Enter exactly 10 numbers; you entered 3.' });
    expect(parseQuick('10 20 x')).toEqual({ error: expect.stringMatching(/isn’t a whole number/) });
    expect(parseQuick('10 20 3.5')).toEqual({ error: expect.stringMatching(/3\.5/) });
    expect(quickHref([5, 10])).toBe('/visualisers/quick-sort?input=5%2C10');
  });
});

describe('greedy coin change', () => {
  it('finds the classic counterexamples', () => {
    expect(coinsAttempt([1, 3, 4], 6)).toMatchObject({ greedy: { coins: [4, 1, 1], count: 3 }, optimal: { coins: [3, 3], count: 2 }, score: 1, max: 1, won: true });
    expect(coinsAttempt([1, 5, 6, 9], 11)).toMatchObject({ greedy: { count: 3 }, optimal: { coins: [6, 5], count: 2 }, won: true });
  });

  it('is not a win when greedy happens to be optimal', () => {
    expect(coinsAttempt([1, 3, 4], 8)).toMatchObject({ greedy: { count: 2 }, optimal: { count: 2 }, score: 0, won: false });
  });

  it('greedy never beats the optimum, and both make the amount', () => {
    for (const coins of COIN_SETS) {
      for (let amount = 1; amount <= 60; amount++) {
        const g = greedyChange(coins, amount);
        const o = optimalChange(coins, amount);
        expect(g.coins.reduce((s, c) => s + c, 0)).toBe(amount);
        expect(o.coins.reduce((s, c) => s + c, 0)).toBe(amount);
        expect(o.count).toBeLessThanOrEqual(g.count);
      }
    }
  });

  it('validates the amount', () => {
    expect(parseAmount(' 6 ')).toEqual({ value: 6 });
    expect(parseAmount('')).toEqual({ error: 'Enter an amount.' });
    expect(parseAmount('0')).toEqual({ error: 'The amount must be between 1 and 60.' });
    expect(parseAmount('61')).toEqual({ error: 'The amount must be between 1 and 60.' });
    expect(parseAmount('2.5')).toEqual({ error: expect.stringMatching(/isn’t a whole number/) });
  });
});

describe('a hash flood', () => {
  it('puts multiples of 8 in one bucket: a chain of 8', () => {
    const keys = [0, 8, 16, 24, 32, 40, 48, 56];
    const attempt = floodAttempt(keys);
    expect(attempt).toMatchObject({ score: 8, max: 8, won: true });
    expect(attempt.chains[0]).toEqual(keys);
    expect(attempt.chains.slice(1).every((c) => c.length === 0)).toBe(true);
  });

  it('spreads consecutive keys one per bucket', () => {
    expect(floodAttempt([1, 2, 3, 4, 5, 6, 7, 8])).toMatchObject({ score: 1, won: false });
    expect(hashChains([3, 11, 19, 4]).map((c) => c.length)).toEqual([0, 0, 0, 3, 1, 0, 0, 0]);
  });

  it('validates the keys', () => {
    expect(parseKeys('0 8 16 24 32 40 48 56')).toEqual({ value: [0, 8, 16, 24, 32, 40, 48, 56] });
    expect(parseKeys('0 8 16 24 32 40 48 48')).toEqual({ error: 'Each key must be different; 48 appears twice.' });
    expect(parseKeys('0 8 16 24 32 40 48 1000')).toEqual({ error: expect.stringMatching(/between 0 and 999/) });
    expect(parseKeys('0 8')).toEqual({ error: 'Enter exactly 8 numbers; you entered 2.' });
    expect(parseNumbers('-1', { count: 1, min: 0, max: 9 })).toEqual({ error: expect.stringMatching(/between 0 and 9/) });
  });
});

import { describe, expect, it } from 'vitest';
import { CURVES, measure, sizesUpTo } from './measure';

describe('measured growth', () => {
  it('lists the sizes step by step up to the largest', () => {
    expect(sizesUpTo(64, 4)).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64]);
    expect(sizesUpTo(7, 2)).toEqual([2, 4, 6]);
  });

  it('probes every value when linear search looks for one that is absent', () => {
    const ns = sizesUpTo(32, 2);
    expect(measure('linear-search', 'absent', 'probes', ns, 7)).toEqual(ns);
  });

  it('probes about log₂ n values when binary search looks for one that is absent', () => {
    const ns = sizesUpTo(32, 2);
    measure('binary-search', 'absent', 'probes', ns, 7).forEach((probes, i) => {
      expect(probes).toBeGreaterThanOrEqual(1);
      expect(probes).toBeLessThanOrEqual(Math.floor(CURVES['log₂ n'](ns[i])) + 1);
    });
  });

  it('keeps bubble sort under n²/2 comparisons and merge sort under n log₂ n', () => {
    const ns = sizesUpTo(64, 4);
    const bubble = measure('bubble-sort', 'random', 'comparisons', ns, 7);
    const merge = measure('merge-sort', 'random', 'comparisons', ns, 7);
    ns.forEach((n, i) => {
      expect(bubble[i]).toBeLessThanOrEqual(CURVES['n²/2'](n));
      expect(merge[i]).toBeLessThanOrEqual(CURVES['n log₂ n'](n));
    });
  });

  it('falls back to the first example for an unknown one, and rejects an unknown algorithm', () => {
    expect(measure('linear-search', 'nope', 'probes', [4], 7)).toHaveLength(1);
    expect(() => measure('nope', 'random', 'comparisons', [4], 7)).toThrow(/No algorithm/);
  });
});

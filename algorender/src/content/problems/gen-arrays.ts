// Random tests for the hashing, two pointers, sliding window, prefix sums, binary search and intervals problems. See generators.ts.

import { size, type Generator, type Rng } from '@/problems/random';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

const ascending = (values: readonly number[]) => [...values].sort((a, b) => a - b);

/** n different integers in [lo, hi], sorted, then rotated by a random amount (possibly none). */
function rotatedSorted(rng: Rng, n: number, lo: number, hi: number): number[] {
  const sorted = ascending(rng.distinct(n, lo, hi));
  const r = rng.int(0, n - 1);
  return [...sorted.slice(n - r), ...sorted.slice(0, n - r)];
}

/** n ranges [start, end] with start < end inside [lo, hi], none longer than `longest`. */
function ranges(rng: Rng, n: number, lo: number, hi: number, longest: number): number[][] {
  return Array.from({ length: n }, () => {
    const start = rng.int(lo, hi - 1);
    return [start, Math.min(hi, start + rng.int(1, longest))];
  });
}

export const ARRAY_GENERATORS: Record<string, Generator> = {
  // Hashing

  'contains-duplicate': (rng, i) => {
    const n = Math.max(2, size(rng, i, 8, 1_500));
    const span = i < 3 ? 20 : 1_000_000_000;
    const nums = rng.distinct(n, -span, span);
    // Every other test copies one value over another.
    if (i % 2 === 1) {
      const [a, b] = rng.distinct(2, 0, n - 1);
      nums[a] = nums[b];
    }
    return { input: { nums } };
  },

  'valid-anagram': (rng, i) => {
    const s = rng.string(size(rng, i, 8, 3_000), i < 3 ? 'abc' : rng.pick(['abcde', LOWER]));
    const t = rng.shuffle([...s]);
    // Every other test spoils the anagram: one letter changed, dropped or added.
    if (i % 2 === 1) {
      const k = rng.int(0, t.length - 1);
      if (t.length === 1 || rng.chance(0.5)) t[k] = rng.pick([...LOWER].filter((c) => c !== t[k]));
      else if (rng.chance(0.5)) t.splice(k, 1);
      else t.splice(k, 0, rng.pick([...LOWER]));
    }
    return { input: { s, t: t.join('') } };
  },

  'top-k-frequent-elements': (rng, i) => {
    // The top k values each appear more than `cut` times and the rest at most `cut` times, so the answer is unique.
    const distinct = size(rng, i, 5, 200);
    const span = i < 3 ? 20 : 10_000;
    const values = rng.distinct(distinct, -span, span);
    const k = rng.int(1, distinct);
    const cut = rng.int(1, i < 3 ? 2 : 6);
    const nums = values.flatMap((v, j) => Array<number>(j < k ? rng.int(cut + 1, cut + (i < 3 ? 2 : 8)) : rng.int(1, cut)).fill(v));
    return { input: { nums: rng.shuffle(nums), k } };
  },

  'longest-consecutive-sequence': (rng, i) => {
    // Runs of consecutive values from random starts (close together when the span is small, so runs merge), a few repeats, shuffled.
    const n = size(rng, i, 8, 3_000);
    const span = i < 3 ? 15 : rng.pick([n, 1_000_000_000]);
    const nums: number[] = [];
    while (nums.length < n) {
      const length = rng.int(1, Math.max(3, Math.floor(n / 4)));
      const start = rng.int(-span, span - length);
      for (let v = start; v < start + length && nums.length < n; v++) nums.push(v);
      if (nums.length < n && rng.chance(0.3)) nums.push(rng.pick(nums));
    }
    return { input: { nums: rng.shuffle(nums) } };
  },

  // Prefix sums

  'product-of-array-except-self': (rng, i) => {
    const n = Math.max(2, size(rng, i, 6, 2_000));
    if (i < 3) return { input: { nums: rng.ints(n, -9, 9) } };
    // Mostly 1s and −1s, with a few bigger factors whose product stays below 2³⁰; tests 5 and 7 add one and two zeros.
    const nums = Array.from({ length: n }, () => rng.pick([1, -1]));
    let product = 1;
    for (let tries = 0; tries < 40; tries++) {
      const factor = rng.int(2, 30);
      if (product * factor >= 2 ** 30) break;
      product *= factor;
      const at = rng.int(0, n - 1);
      nums[at] = Math.sign(nums[at]) * factor;
    }
    for (let zeros = i === 4 ? 1 : i === 6 ? 2 : 0; zeros > 0; zeros--) nums[rng.int(0, n - 1)] = 0;
    return { input: { nums } };
  },

  'subarray-sum-equals-k': (rng, i) => {
    const n = size(rng, i, 8, 3_000);
    const span = i < 3 ? 3 : rng.pick([5, 1_000]);
    const nums = rng.ints(n, -span, span);
    // Usually k is the sum of some run, so at least one run counts; every fourth test picks k at random.
    let k = rng.int(-20, 20);
    if (i % 4 !== 3) {
      const a = rng.int(0, n - 1);
      const b = rng.int(a, n - 1);
      k = nums.slice(a, b + 1).reduce((x, y) => x + y, 0);
    }
    return { input: { nums, k } };
  },

  // Two pointers

  'valid-palindrome': (rng, i) => {
    const alphabet = i < 3 ? 'ab1' : LOWER + DIGITS;
    const half = [...rng.string(Math.floor(size(rng, i, 8, 2_000) / 2), alphabet)];
    const middle = rng.chance(0.5) ? [rng.pick([...alphabet])] : [];
    const core = [...half, ...middle, ...[...half].reverse()];
    // Every other test changes one character, which spoils it unless it is the middle one.
    if (i % 2 === 1 && core.length > 1) {
      const k = rng.int(0, core.length - 1);
      core[k] = rng.pick([...alphabet].filter((c) => c !== core[k]));
    }
    // Then mixed case, with spaces and punctuation scattered in.
    let s = '';
    for (const ch of core) {
      if (rng.chance(0.25)) s += rng.string(rng.int(1, 2), ' ,.!?;:-\'"');
      s += rng.chance(0.5) ? ch.toUpperCase() : ch;
    }
    return { input: { s: s || ' ' } };
  },

  'two-sum-sorted': (rng, i) => {
    const n = Math.max(2, size(rng, i, 8, 3_000));
    const span = i < 3 ? 20 : rng.pick([1_000, 1_000_000_000]);
    const nums = ascending(rng.ints(n, -span, span));
    const [a, b] = rng.distinct(2, 0, n - 1);
    return { input: { nums, target: nums[a] + nums[b] } };
  },

  'three-sum': (rng, i) => {
    // A narrow span gives many triples; a wide one gives few. (Medium spans would give thousands.)
    // Most tests hide at least one triple that sums to zero.
    const n = Math.max(3, size(rng, i, 8, 600));
    const span = i < 3 ? 5 : rng.pick([30, 100_000]);
    const nums = rng.ints(n - 3, -span, span);
    if (i % 4 === 3) nums.push(...rng.ints(3, -span, span));
    else {
      const a = rng.int(-span, span);
      const b = rng.int(Math.max(-span, -span - a), Math.min(span, span - a));
      nums.push(a, b, -a - b);
    }
    return { input: { nums: rng.shuffle(nums) } };
  },

  'container-with-most-water': (rng, i) => {
    const n = Math.max(2, size(rng, i, 8, 3_000));
    return { input: { height: rng.ints(n, 0, i < 3 ? 10 : rng.pick([100, 10_000])) } };
  },

  'trapping-rain-water': (rng, i) => {
    const n = size(rng, i, 8, 3_000);
    return { input: { height: rng.ints(n, 0, i < 3 ? 5 : rng.pick([10, 1_000, 100_000])) } };
  },

  // Sliding window

  'best-time-to-buy-and-sell-stock': (rng, i) => {
    const n = size(rng, i, 8, 3_000);
    if (i < 3) return { input: { prices: rng.ints(n, 0, 20) } };
    // A random walk, like a price chart.
    const prices = [rng.int(0, 10_000)];
    while (prices.length < n) prices.push(Math.min(10_000, Math.max(0, prices[prices.length - 1] + rng.int(-300, 300))));
    return { input: { prices } };
  },

  'longest-substring-without-repeating': (rng, i) => {
    const alphabet = i < 3 ? 'abc' : rng.pick(['abcdef', LOWER, `${LOWER}${UPPER}${DIGITS} !?`]);
    return { input: { s: rng.string(size(rng, i, 8, 3_000), alphabet) } };
  },

  'longest-repeating-character-replacement': (rng, i) => {
    const s = rng.string(size(rng, i, 8, 3_000), i < 3 ? 'AB' : rng.pick(['AB', 'ABC', 'AAAB', UPPER]));
    return { input: { s, k: rng.int(0, Math.min(s.length, i < 3 ? 2 : 40)) } };
  },

  'minimum-window-substring': (rng, i) => {
    const alphabet = i < 3 ? 'abc' : rng.pick(['abcde', LOWER, 'abcdeABCDE']);
    const s = rng.string(size(rng, i, 10, 3_000), alphabet);
    // t takes letters from different positions of s, so some window works; every third test adds one more letter, which may be missing.
    const m = Math.min(s.length, size(rng, i, 3, 30));
    let t = rng
      .distinct(m, 0, s.length - 1)
      .map((k) => s[k])
      .join('');
    if (i % 3 === 2) t += rng.pick([...LOWER, ...UPPER]);
    return { input: { s, t } };
  },

  // Binary search

  'binary-search': (rng, i) => {
    const span = i < 3 ? 20 : 10_000;
    const nums = ascending(rng.distinct(size(rng, i, 8, 3_000), -span, span));
    return { input: { nums, target: i % 2 === 0 ? rng.pick(nums) : rng.int(-span, span) } };
  },

  'search-a-2d-matrix': (rng, i) => {
    const rows = size(rng, i, 3, 50);
    const cols = size(rng, i, 4, 50);
    const span = i < 3 ? 30 : 10_000;
    const values = ascending(rng.distinct(rows * cols, -span, span));
    const matrix = Array.from({ length: rows }, (_, r) => values.slice(r * cols, (r + 1) * cols));
    return { input: { matrix, target: i % 2 === 0 ? rng.pick(values) : rng.int(-span, span) } };
  },

  'koko-eating-bananas': (rng, i) => {
    const n = size(rng, i, 5, 2_000);
    const piles = rng.ints(n, 1, i < 3 ? 20 : [100, 1_000_000, 1_000_000_000][i % 3]);
    // From one hour per pile (the speed must be the biggest pile) to plenty of spare time.
    const h = n + rng.int(0, n * rng.pick([0, 1, 3, 30]));
    return { input: { piles, h } };
  },

  'find-minimum-in-rotated-sorted-array': (rng, i) => {
    // Values from a random stretch of [−5000, 5000], so the minimum isn't always near −5000.
    const n = size(rng, i, 8, 3_000);
    const lo = i < 3 ? -20 : rng.int(-5_000, 5_000 - (n - 1));
    const hi = i < 3 ? 20 : Math.min(5_000, lo + rng.int(n - 1, 3 * n));
    return { input: { nums: rotatedSorted(rng, n, lo, hi) } };
  },

  'search-in-rotated-sorted-array': (rng, i) => {
    const span = i < 3 ? 20 : 10_000;
    const nums = rotatedSorted(rng, size(rng, i, 8, 3_000), -span, span);
    return { input: { nums, target: i % 2 === 0 ? rng.pick(nums) : rng.int(-span, span) } };
  },

  // Intervals

  'insert-interval': (rng, i) => {
    // Separate ranges: 2n different points paired up in order, so no two ranges touch (a few shrink to one point).
    const n = size(rng, i, 6, 500) - 1;
    const span = i < 3 ? 30 : 100_000;
    const points = ascending(rng.distinct(2 * n, 0, span));
    const intervals = Array.from({ length: n }, (_, k) => [points[2 * k], rng.chance(0.1) ? points[2 * k] : points[2 * k + 1]]);
    const width = rng.int(0, i < 3 ? 10 : rng.pick([10, 1_000, 30_000]));
    const start = rng.int(0, span - width);
    return { input: { intervals, newInterval: [start, start + width] } };
  },

  'non-overlapping-intervals': (rng, i) => {
    const span = i < 3 ? 10 : 50_000;
    const longest = i < 3 ? 5 : rng.pick([10, 1_000, 20_000]);
    return { input: { intervals: ranges(rng, size(rng, i, 6, 1_000), -span, span, longest) } };
  },

  'meeting-rooms-ii': (rng, i) => {
    const span = i < 3 ? 20 : 1_000_000;
    const longest = i < 3 ? 6 : rng.pick([100, 10_000, 200_000]);
    return { input: { intervals: ranges(rng, size(rng, i, 6, 1_000), 0, span, longest) } };
  },
};

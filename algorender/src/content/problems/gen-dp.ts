// Random tests for the dynamic programming, greedy, bit manipulation and math problems. See generators.ts.

import { size, type Generator, type Rng } from '@/problems/random';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';

const total = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** `word` after a few random single-character edits (insert, delete or replace), so the two share a lot. */
function edited(rng: Rng, word: string, edits: number, alphabet: string): string {
  const chars = [...word];
  for (let k = 0; k < edits; k++) {
    const kind = chars.length === 0 ? 'insert' : rng.pick(['insert', 'delete', 'replace'] as const);
    if (kind === 'insert') chars.splice(rng.int(0, chars.length), 0, rng.pick([...alphabet]));
    else if (kind === 'delete') chars.splice(rng.int(0, chars.length - 1), 1);
    else chars[rng.int(0, chars.length - 1)] = rng.pick([...alphabet]);
  }
  return chars.join('');
}

/** Paths through an m × n grid moving right or down (exact below 2⁵³, which is all the generator needs). */
function gridPaths(m: number, n: number): number {
  const row = new Array<number>(n).fill(1);
  for (let r = 1; r < m; r++) for (let c = 1; c < n; c++) row[c] += row[c - 1];
  return row[n - 1];
}

/** Every station a car can start from and drive all the way round (brute force). */
function circuitStarts(gas: readonly number[], cost: readonly number[]): number[] {
  const n = gas.length;
  const starts: number[] = [];
  for (let s = 0; s < n; s++) {
    let tank = 0;
    let legs = 0;
    while (legs < n && tank + gas[(s + legs) % n] - cost[(s + legs) % n] >= 0) {
      tank += gas[(s + legs) % n] - cost[(s + legs) % n];
      legs++;
    }
    if (legs === n) starts.push(s);
  }
  return starts;
}

export const DP_GENERATORS: Record<string, Generator> = {
  // 1D dynamic programming

  'climbing-stairs': (rng, i) => ({ input: { n: size(rng, i, 6, 45) } }),

  'house-robber': (rng, i) => ({ input: { nums: rng.ints(size(rng, i, 8, 1_500), 0, i < 3 ? 20 : 1_000) } }),

  'house-robber-ii': (rng, i) => ({ input: { nums: rng.ints(size(rng, i, 8, 1_500), 0, i < 3 ? 20 : 1_000) } }),

  'coin-change': (rng, i) => {
    // Most tests add up random coins to get the amount, so it can be made. Every third test uses
    // multiples of one step only and any amount, which often can't be made.
    const step = i % 3 === 2 ? rng.int(2, 5) : 1;
    const top = Math.floor((i < 3 ? 10 : rng.pick([20, 100, 2_000])) / step);
    const coins = rng.distinct(Math.min(size(rng, i, 3, 12), top), 1, top).map((c) => c * step);
    const limit = i < 3 ? 25 : 10_000;
    if (step > 1) return { input: { coins, amount: rng.int(0, limit) } };
    let amount = 0;
    for (;;) {
      const coin = rng.pick(coins);
      if (amount + coin > limit) break;
      amount += coin;
      if (rng.chance(i < 3 ? 0.3 : 0.003)) break;
    }
    return { input: { coins, amount } };
  },

  'longest-increasing-subsequence': (rng, i) => {
    const n = size(rng, i, 8, 1_500);
    const span = i < 3 ? 9 : rng.pick([50, 10_000]);
    const nums = rng.ints(n, -span, span);
    // Every fourth test starts sorted and is then roughed up, so the answer is long.
    if (i % 4 === 3) {
      nums.sort((a, b) => a - b);
      for (let k = 0; k < n / 10; k++) {
        const [a, b] = [rng.int(0, n - 1), rng.int(0, n - 1)];
        [nums[a], nums[b]] = [nums[b], nums[a]];
      }
    }
    return { input: { nums } };
  },

  'word-break': (rng, i) => {
    const alphabet = i < 3 ? 'ab' : rng.pick(['abc', 'abcd', 'abcdef']);
    const words = [...new Set(Array.from({ length: size(rng, i, 4, 30) }, () => rng.string(rng.int(1, i < 3 ? 3 : 6), alphabet)))];
    // Words glued together always split; every other test then changes one letter, which usually breaks that.
    const length = size(rng, i, 12, 290);
    let s = '';
    while (s.length < length) s += rng.pick(words);
    if (i % 2 === 1) {
      const k = rng.int(0, s.length - 1);
      s = s.slice(0, k) + rng.pick([...alphabet].filter((c) => c !== s[k])) + s.slice(k + 1);
    }
    return { input: { s, wordDict: words } };
  },

  'decode-ways': (rng, i) => {
    // Codes 1 to 26 written one after another, cut to length (never leaving a leading 0).
    const length = size(rng, i, 8, 70);
    let s = '';
    while (s.length < length) s += String(rng.int(1, 26));
    s = s.slice(0, length);
    // Every other test drops in a stray 0: half the time just after a 1 or 2, where it pairs up, otherwise anywhere.
    if (i % 2 === 1) {
      const pairs = [...s].map((_, k) => k).filter((k) => k > 0 && '12'.includes(s[k - 1]));
      const k = pairs.length > 0 && i % 4 === 1 ? rng.pick(pairs) : rng.int(0, s.length - 1);
      s = `${s.slice(0, k)}0${s.slice(k + 1)}`;
    }
    return { input: { s } };
  },

  'partition-equal-subset-sum': (rng, i) => {
    const n = size(rng, i, 6, 120);
    const top = i < 3 ? 10 : 100;
    if (i % 3 === 0) {
      // Two groups with the same total, shuffled together: always splits.
      const group = rng.ints(Math.ceil(n / 2), 1, top);
      const other: number[] = [];
      for (let rest = total(group); rest > 0; rest -= other[other.length - 1]) other.push(Math.min(rest, rng.int(Math.ceil(top / 2), top)));
      return { input: { nums: rng.shuffle([...group, ...other]) } };
    }
    if (i % 3 === 1) return { input: { nums: rng.ints(n, 1, top) } };
    // Even numbers whose total is 2 more than a multiple of 4: half the total is odd, so no group of them reaches it.
    const nums = rng.ints(n, 1, top / 2).map((x) => 2 * x);
    if (total(nums) % 4 === 0) nums[0] = nums[0] === top ? top - 2 : nums[0] + 2;
    return { input: { nums } };
  },

  // 2D dynamic programming

  'unique-paths': (rng, i) => {
    const m = size(rng, i, 5, 100);
    // The widest grid with m rows whose answer stays below 2³¹; later tests sit near it.
    let widest = 1;
    while (widest < 100 && gridPaths(m, widest + 1) < 2 ** 31) widest++;
    const n = i < 3 ? rng.int(1, Math.min(widest, 5)) : rng.int(Math.max(1, widest - 3), widest);
    return { input: rng.chance(0.5) ? { m, n } : { m: n, n: m } };
  },

  'longest-common-subsequence': (rng, i) => {
    const alphabet = i < 3 ? 'abc' : rng.pick(['abcd', 'abcdefgh', LOWER]);
    const text1 = rng.string(size(rng, i, 8, 400), alphabet);
    // Every other test edits text1 into text2, so they share a long subsequence.
    const text2 = i % 2 === 1 ? edited(rng, text1, rng.int(1, Math.max(1, text1.length / 3)), alphabet) : rng.string(size(rng, i, 8, 400), alphabet);
    return { input: { text1, text2: text2 || alphabet[0] } };
  },

  'edit-distance': (rng, i) => {
    const alphabet = i < 3 ? 'ab' : rng.pick(['abc', 'abcdefgh', LOWER]);
    const word1 = rng.string(size(rng, i, 6, 300), alphabet);
    // Every other test edits word1 into word2, so the distance is small next to their lengths.
    const word2 = i % 2 === 1 ? edited(rng, word1, rng.int(1, Math.max(1, word1.length / 4)), alphabet) : rng.string(size(rng, i, 6, 300), alphabet);
    return { input: { word1, word2 } };
  },

  'longest-palindromic-substring': (rng, i) => {
    const alphabet = i < 3 ? 'ab' : rng.pick(['ab', 'abc', 'xyz019', LOWER]);
    let s = rng.string(size(rng, i, 10, 1_000), alphabet);
    // Two tests in three hide a longer palindrome somewhere.
    if (i % 3 !== 0) {
      const half = rng.string(rng.int(1, i < 3 ? 4 : 30), alphabet);
      const middle = rng.chance(0.5) ? rng.pick([...alphabet]) : '';
      const at = rng.int(0, s.length);
      s = (s.slice(0, at) + half + middle + [...half].reverse().join('') + s.slice(at)).slice(0, 1_000);
    }
    return { input: { s } };
  },

  // Greedy

  'maximum-subarray': (rng, i) => {
    const n = size(rng, i, 8, 2_000);
    const span = i < 3 ? 10 : 10_000;
    // Every third test is all negative; the rest lean negative, so the best run is a real choice.
    const nums = i % 3 === 2 ? rng.ints(n, -span, -1) : rng.ints(n, -span, Math.floor(span * 0.9));
    return { input: { nums } };
  },

  'jump-game': (rng, i) => {
    const n = size(rng, i, 8, 3_000);
    const nums = rng.ints(n, 0, i < 3 ? 3 : 5);
    if (i % 2 === 0) {
      // Lengthen a jump wherever the walk would get stuck, so the end is reachable.
      let reach = 0;
      for (let k = 0; k < n; k++) {
        if (k > reach) {
          nums[reach] += k - reach;
          reach = k;
        }
        reach = Math.max(reach, k + nums[k]);
      }
    } else if (n > 1) {
      // A wall: index w holds 0 and no jump from before it gets past it.
      const w = rng.int(0, n - 2);
      nums[w] = 0;
      for (let k = 0; k < w; k++) nums[k] = Math.min(nums[k], w - k);
    }
    return { input: { nums } };
  },

  'gas-station': (rng, i) => {
    const n = size(rng, i, 6, 2_000);
    const top = i < 3 ? 10 : 10_000;
    for (;;) {
      let gas = rng.ints(n, 0, top);
      let cost = rng.ints(n, 0, top);
      if (i % 3 === 2) {
        // Less fuel in all than the loop costs: no start works.
        if (total(gas) < total(cost)) return { input: { gas, cost } };
        continue;
      }
      if (total(gas) < total(cost)) [gas, cost] = [cost, gas];
      // Enough fuel, but only just: trim the surplus so one start tends to be the only one. Keep it if it is.
      const target = rng.int(0, Math.ceil(top / 10));
      for (let surplus = total(gas) - total(cost); surplus > target; ) {
        const k = rng.int(0, n - 1);
        const cut = Math.min(gas[k], surplus - target);
        gas[k] -= cut;
        surplus -= cut;
      }
      if (circuitStarts(gas, cost).length === 1) return { input: { gas, cost } };
    }
  },

  // Bit manipulation and math

  'single-number': (rng, i) => {
    const pairs = size(rng, i, 4, 1_000);
    const span = i < 3 ? 20 : rng.pick([10_000, 1_000_000_000]);
    const values = rng.distinct(pairs + 1, -span, span);
    return { input: { nums: rng.shuffle([...values, ...values.slice(1)]) } };
  },

  'counting-bits': (rng, i) => ({ input: { n: size(rng, i, 16, 5_000) } }),

  'missing-number': (rng, i) => {
    const n = size(rng, i, 8, 2_000);
    // Now and then the missing number is at either end of the range.
    const missing = i % 4 === 1 ? 0 : i % 4 === 2 ? n : rng.int(0, n);
    const nums = rng.shuffle(Array.from({ length: n + 1 }, (_, k) => k).filter((k) => k !== missing));
    return { input: { nums } };
  },

  'spiral-matrix': (rng, i) => ({ input: { matrix: rng.grid(size(rng, i, 4, 20), size(rng, i, 4, 20), -1_000, 1_000) } }),

  'set-matrix-zeroes': (rng, i) => {
    const rows = size(rng, i, 4, 25);
    const cols = size(rng, i, 4, 25);
    const span = i % 2 === 1 ? 2 ** 31 - 1 : 99;
    // Nonzero values with a few zeros dropped in; every fourth test puts one in the first row,
    // which the constant-space trick uses for its marks.
    const matrix = rng.grid(rows, cols, -span, span).map((row) => row.map((v) => v || 1));
    for (let k = rng.int(i < 3 ? 0 : 1, i < 3 ? 2 : 4); k > 0; k--) matrix[rng.int(0, rows - 1)][rng.int(0, cols - 1)] = 0;
    if (i % 4 === 3) matrix[0][rng.int(0, cols - 1)] = 0;
    return { input: { matrix } };
  },
};

// Correctness tests for coin change, LIS, grid paths and house robber. The
// shared checks (good frames, legend, custom round-trip, answer positions)
// run over every DP module in dp.test.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GridState } from '@/viz/grid/types';
import { cellKey } from '@/viz/grid/types';
import { cell, expectGoodTrace, list, table, traceOf } from '@/viz/grid/testing';
import { coinChange, largestFirst, MAX_AMOUNT, type CoinInput } from './coin-change';
import { biggestFirst, houseRobber, MAX_HOUSES } from './house-robber';
import { longestIncreasingSubsequence, MAX_LIS, type LisMode } from './longest-increasing-subsequence';
import { MAX_COLS, MAX_ROWS, uniquePaths, WALL } from './unique-paths';

const last = (algo: Parameters<typeof traceOf>[0], input: unknown) => {
  const { frames, truncated } = traceOf(algo, input);
  expect(truncated).toBe(false);
  return frames;
};
const row = (state: GridState, r: number) => {
  const t = table(state);
  return t.cells[t.rows[r].id];
};

// ───────────────────────────── coin change ─────────────────────────────

/** Fewest coins for every amount 0..A by breadth-first search over amounts (Infinity when unreachable). */
function fewestCoinsBfs(coins: number[], A: number): number[] {
  const dist = Array<number>(A + 1).fill(Infinity);
  dist[0] = 0;
  const queue = [0];
  for (let k = 0; k < queue.length; k++) {
    const a = queue[k];
    for (const c of coins) {
      if (a + c <= A && dist[a + c] === Infinity) {
        dist[a + c] = dist[a] + 1;
        queue.push(a + c);
      }
    }
  }
  return dist;
}

describe('coin-change', () => {
  const input = fc.record({
    coins: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 4 }).map((cs) => [...cs].sort((x, y) => x - y)),
    amount: fc.integer({ min: 1, max: MAX_AMOUNT }),
  });

  it('fills every amount with the fewest coins (or ∞) and lists coins that make the amount', () => {
    fc.assert(
      fc.property(input, ({ coins, amount }) => {
        const frames = last(coinChange, { coins, amount });
        const state = frames.at(-1)!.state;
        const ref = fewestCoinsBfs(coins, amount);
        expect([...row(state, 0)]).toEqual(ref.map((d) => (d === Infinity ? '∞' : String(d))));
        const used = list(state, 'used').items.map((it) => Number(it.text));
        if (ref[amount] === Infinity) {
          expect(used).toEqual([]);
          expect(table(state).marks[cellKey('dp', amount)]).toBe('reject');
        } else {
          expect(used).toHaveLength(ref[amount]);
          expect(used.reduce((s, c) => s + c, 0)).toBe(amount);
          for (const c of used) expect(coins).toContain(c);
        }
      }),
      { numRuns: 120 },
    );
  });

  it('records a last coin that really reaches each amount', () => {
    fc.assert(
      fc.property(input, ({ coins, amount }) => {
        const state = last(coinChange, { coins, amount }).at(-1)!.state;
        const dp = row(state, 0);
        const coin = row(state, 1);
        for (let a = 1; a <= amount; a++) {
          if (dp[a] === '∞') expect(coin[a]).toBe('–');
          else expect(Number(dp[a - Number(coin[a])]) + 1).toBe(Number(dp[a]));
        }
      }),
      { numRuns: 60 },
    );
  });

  it('narrates random runs properly, including the largest input', () => {
    fc.assert(
      fc.property(input, (x) => expectGoodTrace(coinChange, traceOf(coinChange, x).frames)),
      { numRuns: 30 },
    );
    expectGoodTrace(coinChange, last(coinChange, { coins: [1, 2, 3, 4, 5, 6], amount: MAX_AMOUNT }));
  });

  it('says where largest-coin-first goes wrong', () => {
    const notes = (x: CoinInput) => last(coinChange, x).at(-1)!.note;
    expect(largestFirst([1, 3, 4], 6)).toEqual({ taken: [4, 1, 1], left: 0 });
    expect(notes({ coins: [1, 3, 4], amount: 6 })).toContain('4 + 1 + 1');
    expect(notes({ coins: [3, 5], amount: 9 })).toContain('stuck');
  });

  it('rejects malformed custom input', () => {
    const parse = coinChange.input.custom!.parse;
    expect(parse('1, 3, 4')).toHaveProperty('error');
    expect(parse('| amount=6')).toHaveProperty('error');
    expect(parse('0, 3 | amount=6')).toHaveProperty('error');
    expect(parse('1, x | amount=6')).toHaveProperty('error');
    expect(parse('1, 3 | amount=31')).toHaveProperty('error');
    expect(parse('1, 3 | amount=0')).toHaveProperty('error');
    expect(parse('1, 3 | total=5')).toHaveProperty('error');
    expect(parse('1, 2, 3, 4, 5, 6, 7 | amount=5')).toHaveProperty('error');
    expect(parse(' 4, 1, 3, 3 | amount = 6 ')).toEqual({ value: { coins: [1, 3, 4], amount: 6 } });
    expect(parse('2 | 5')).toEqual({ value: { coins: [2], amount: 5 } });
  });
});

// ───────────────────────── longest increasing subsequence ─────────────────────────

/** Length of the longest strictly increasing subsequence, by trying every subset. */
function bruteLis(values: number[]): number {
  let best = 0;
  for (let mask = 1; mask < 1 << values.length; mask++) {
    const picked = values.filter((_, k) => mask & (1 << k));
    if (picked.every((v, k) => k === 0 || picked[k - 1] < v)) best = Math.max(best, picked.length);
  }
  return best;
}

describe('longest-increasing-subsequence', () => {
  const values = fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 2, maxLength: MAX_LIS });
  const modes: LisMode[] = ['dp', 'fast'];

  it.each(modes)('%s fills dp like the recurrence and reads off a longest strictly increasing subsequence', (mode) => {
    fc.assert(
      fc.property(values, (vs) => {
        const state = last(longestIncreasingSubsequence, { values: vs, mode }).at(-1)!.state;
        const dp = vs.map(() => 1);
        vs.forEach((v, i) => vs.slice(0, i).forEach((w, j) => w < v && (dp[i] = Math.max(dp[i], dp[j] + 1))));
        expect(row(state, 1).map(Number)).toEqual(dp);
        // Every prev points at an earlier, smaller value one shorter.
        row(state, 2).forEach((p, i) => {
          if (p === '–') expect(dp[i]).toBe(1);
          else expect([Number(p) < i, vs[Number(p)] < vs[i], dp[Number(p)] + 1]).toEqual([true, true, dp[i]]);
        });
        const picked = list(state, 'lis').items.map((it) => Number(it.id.slice(1)));
        expect(picked).toHaveLength(bruteLis(vs));
        picked.forEach((idx, k) => {
          expect(Number(list(state, 'lis').items[k].text)).toBe(vs[idx]);
          if (k > 0) {
            expect(idx).toBeGreaterThan(picked[k - 1]);
            expect(vs[idx]).toBeGreaterThan(vs[picked[k - 1]]);
          }
        });
      }),
      { numRuns: 120 },
    );
  });

  it('keeps tails rising, and makes far fewer comparisons with binary search', () => {
    fc.assert(
      fc.property(values, (vs) => {
        const frames = last(longestIncreasingSubsequence, { values: vs, mode: 'fast' });
        for (const f of frames) {
          const tt = table(f.state, 'tails');
          const tails = tt.cells[tt.rows[0].id].filter(Boolean).map(Number);
          tails.forEach((x, k) => k > 0 && expect(x).toBeGreaterThan(tails[k - 1]));
        }
        const n = vs.length;
        const fast = frames.at(-1)!.stats.comparisons;
        expect(fast).toBeLessThanOrEqual(n * Math.ceil(Math.log2(n + 1)));
        expect(last(longestIncreasingSubsequence, { values: vs, mode: 'dp' }).at(-1)!.stats.comparisons).toBe((n * (n - 1)) / 2);
      }),
      { numRuns: 60 },
    );
  });

  it('narrates random runs properly, including the largest input', () => {
    for (const mode of modes) {
      fc.assert(
        fc.property(values, (vs) => expectGoodTrace(longestIncreasingSubsequence, traceOf(longestIncreasingSubsequence, { values: vs, mode }).frames)),
        { numRuns: 30 },
      );
      const big = { values: Array.from({ length: MAX_LIS }, (_, k) => ((k * 37) % 23) + 1), mode };
      expectGoodTrace(longestIncreasingSubsequence, last(longestIncreasingSubsequence, big));
    }
  });

  it('draws the values as bars', () => {
    const t = table(last(longestIncreasingSubsequence, { values: [3, 1, 2], mode: 'dp' })[0].state);
    expect(t.scales).toEqual({ v: 3 });
  });

  it('rejects malformed custom input', () => {
    const parse = longestIncreasingSubsequence.input.custom!.parse;
    expect(parse('5')).toHaveProperty('error');
    expect(parse('1, 100')).toHaveProperty('error');
    expect(parse('1, a')).toHaveProperty('error');
    expect(parse('1, 2 | slow')).toHaveProperty('error');
    expect(parse(Array(MAX_LIS + 1).fill('1').join(','))).toHaveProperty('error');
    expect(parse('10 9, 2')).toEqual({ value: { values: [10, 9, 2], mode: 'dp' } });
    expect(parse('10, 9, 2 | Fast ')).toEqual({ value: { values: [10, 9, 2], mode: 'fast' } });
  });
});

// ───────────────────────────── grid paths ─────────────────────────────

/** Paths from the start to every cell, by enumerating every path prefix once (depth-first). */
function enumeratePaths(grid: string[]): number[][] {
  const m = grid.length;
  const n = grid[0].length;
  const count = grid.map(() => Array<number>(n).fill(0));
  const walk = (i: number, j: number) => {
    if (i >= m || j >= n || grid[i][j] === WALL) return;
    count[i][j]++;
    walk(i + 1, j);
    walk(i, j + 1);
  };
  walk(0, 0);
  return count;
}

const gridArb = fc
  .record({ m: fc.integer({ min: 1, max: MAX_ROWS }), n: fc.integer({ min: 2, max: MAX_COLS }), walls: fc.array(fc.boolean(), { minLength: 63, maxLength: 63 }) })
  .map(({ m, n, walls }) =>
    Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (_, j) => ((i === 0 && j === 0) || (i === m - 1 && j === n - 1) || !walls[i * n + j] || (i + j) % 3 === 0 ? '.' : WALL)).join(''),
    ),
  );

describe('unique-paths', () => {
  it('counts the paths to every open cell and shows walls as solid cells', () => {
    fc.assert(
      fc.property(gridArb, (grid) => {
        const state = last(uniquePaths, { grid }).at(-1)!.state;
        const ref = enumeratePaths(grid);
        const t = table(state);
        grid.forEach((r, i) =>
          [...r].forEach((ch, j) => {
            if (ch === WALL) {
              expect(cell(state, i, j)).toBe('');
              expect(t.styles[cellKey(t.rows[i].id, j)]).toBe('block');
            } else {
              expect(Number(cell(state, i, j))).toBe(ref[i][j]);
            }
          }),
        );
      }),
      { numRuns: 120 },
    );
  });

  it('highlights one real path to the corner, or marks the corner unreachable', () => {
    fc.assert(
      fc.property(gridArb, (grid) => {
        const m = grid.length;
        const n = grid[0].length;
        const t = table(last(uniquePaths, { grid }).at(-1)!.state);
        const onPath = Object.entries(t.marks)
          .filter(([, mark]) => mark === 'path')
          .map(([key]) => {
            const [r, c] = key.split(':');
            return [t.rows.findIndex((x) => x.id === r), Number(c)] as const;
          })
          .sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
        if (enumeratePaths(grid)[m - 1][n - 1] === 0) {
          expect(onPath).toEqual([]);
          expect(t.marks[cellKey(t.rows[m - 1].id, n - 1)]).toBe('reject');
          return;
        }
        expect(onPath).toHaveLength(m + n - 1);
        expect(onPath[0]).toEqual([0, 0]);
        expect(onPath.at(-1)).toEqual([m - 1, n - 1]);
        onPath.forEach(([i, j], k) => {
          expect(grid[i][j]).not.toBe(WALL);
          if (k > 0) expect(i - onPath[k - 1][0] + (j - onPath[k - 1][1])).toBe(1);
        });
      }),
      { numRuns: 80 },
    );
  });

  it('narrates random runs properly, including the largest grid', () => {
    fc.assert(
      fc.property(gridArb, (grid) => expectGoodTrace(uniquePaths, traceOf(uniquePaths, { grid }).frames)),
      { numRuns: 30 },
    );
    const open = Array<string>(MAX_ROWS).fill('.'.repeat(MAX_COLS));
    const frames = last(uniquePaths, { grid: open });
    expectGoodTrace(uniquePaths, frames);
    expect(cell(frames.at(-1)!.state, MAX_ROWS - 1, MAX_COLS - 1)).toBe('3003');
  });

  it('rejects malformed custom input', () => {
    const parse = uniquePaths.input.custom!.parse;
    expect(parse('')).toHaveProperty('error');
    expect(parse('.')).toHaveProperty('error');
    expect(parse('..|...')).toHaveProperty('error');
    expect(parse('#.|..')).toHaveProperty('error');
    expect(parse('..|.#')).toHaveProperty('error');
    expect(parse('.a|..')).toHaveProperty('error');
    expect(parse(Array(MAX_ROWS + 1).fill('..').join('|'))).toHaveProperty('error');
    expect(parse('.'.repeat(MAX_COLS + 1))).toHaveProperty('error');
    expect(parse(' . . # | . . . ')).toEqual({ value: { grid: ['..#', '...'] } });
  });
});

// ───────────────────────────── house robber ─────────────────────────────

/** Best total from non-adjacent houses, by trying every subset. */
function bruteRobber(values: number[]): number {
  let best = 0;
  for (let mask = 0; mask < 1 << values.length; mask++) {
    if (mask & (mask >> 1)) continue;
    best = Math.max(best, values.reduce((s, v, k) => (mask & (1 << k) ? s + v : s), 0));
  }
  return best;
}

describe('house-robber', () => {
  const values = fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 2, maxLength: MAX_HOUSES });

  it('finds the best total and robs houses that give it, never two next door', () => {
    fc.assert(
      fc.property(values, (vs) => {
        const state = last(houseRobber, vs).at(-1)!.state;
        const best = bruteRobber(vs);
        const dp = [0, vs[0]];
        for (let i = 2; i <= vs.length; i++) dp.push(Math.max(dp[i - 1], vs[i - 1] + dp[i - 2]));
        expect(row(state, 1).map(Number)).toEqual(dp);
        expect(dp.at(-1)).toBe(best);
        const robbed = list(state, 'robbed').items.map((it) => Number(it.id.slice(1)));
        robbed.forEach((h, k) => k > 0 && expect(h - robbed[k - 1]).toBeGreaterThan(1));
        expect(robbed.reduce((s, h) => s + vs[h - 1], 0)).toBe(best);
      }),
      { numRuns: 120 },
    );
  });

  it('narrates random runs properly, including the largest street', () => {
    fc.assert(
      fc.property(values, (vs) => expectGoodTrace(houseRobber, traceOf(houseRobber, vs).frames)),
      { numRuns: 30 },
    );
    expectGoodTrace(houseRobber, last(houseRobber, Array.from({ length: MAX_HOUSES }, (_, k) => (k * 37) % 23)));
  });

  it('compares with biggest-house-first, which can fall short', () => {
    expect(biggestFirst([5, 9, 6, 1, 8, 7])).toEqual({ houses: [2, 5], total: 17 });
    expect(last(houseRobber, [5, 9, 6, 1, 8, 7]).at(-1)!.note).toContain('only 17');
  });

  it('rejects malformed custom input', () => {
    const parse = houseRobber.input.custom!.parse;
    expect(parse('5')).toHaveProperty('error');
    expect(parse('1, 100')).toHaveProperty('error');
    expect(parse('-1, 2')).toHaveProperty('error');
    expect(parse(Array(MAX_HOUSES + 1).fill('1').join(','))).toHaveProperty('error');
    expect(parse('0, 7  3')).toEqual({ value: [0, 7, 3] });
  });
});

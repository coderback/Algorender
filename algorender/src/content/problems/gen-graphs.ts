// Random tests for the heaps, backtracking, graphs, topological sort, union-find and shortest paths problems. See generators.ts.

import type { Json } from '@/workspace/protocol';
import { size, type Generator, type Rng } from '@/problems/random';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A rows × cols grid, each cell made by `cell`. */
const gridOf = (rows: number, cols: number, cell: () => number): number[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, cell));

/** A map of land (1) and water (0), each cell land with probability p. */
const landAndWater = (rng: Rng, rows: number, cols: number, p: number) => gridOf(rows, cols, () => (rng.chance(p) ? 1 : 0));

/** Up to m different undirected edges [a, b] (a ≠ b) between the nodes lo to hi. */
function undirectedEdges(rng: Rng, lo: number, hi: number, m: number): number[][] {
  const seen = new Set<string>();
  const edges: number[][] = [];
  if (hi <= lo) return edges;
  for (let tries = 0; edges.length < m && tries < 4 * m; tries++) {
    const [a, b] = rng.distinct(2, lo, hi);
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }
  return edges;
}

/** How many different multisets of candidates add up to target (coin-change counting). */
function combinations(candidates: number[], target: number): number {
  const ways = new Array<number>(target + 1).fill(0);
  ways[0] = 1;
  for (const c of candidates) for (let t = c; t <= target; t++) ways[t] += ways[t - c];
  return ways[target];
}

export const GRAPH_GENERATORS: Record<string, Generator> = {
  'kth-largest-element': (rng, i) => {
    const n = size(rng, i, 8, 2_000);
    const span = rng.pick([5, 1_000, 10_000]);
    return { input: { nums: rng.ints(n, -span, span), k: rng.int(1, n) } };
  },

  'last-stone-weight': (rng, i) => ({ input: { stones: rng.ints(size(rng, i, 6, 1_000), 1, rng.pick([10, 1_000])) } }),

  'k-closest-points': (rng, i) => {
    const n = size(rng, i, 6, 500);
    const span = i < 3 ? 10 : rng.pick([100, 10_000]);
    const points = Array.from({ length: n }, () => [rng.int(-span, span), rng.int(-span, span)]);
    // The answer must be unique: the k-th closest point strictly closer than the (k + 1)-th.
    const d = points.map(([x, y]) => x * x + y * y).sort((a, b) => a - b);
    const ks = d.map((_, j) => j + 1).filter((k) => k === n || d[k - 1] < d[k]);
    return { input: { points, k: rng.pick(ks) } };
  },

  'task-scheduler': (rng, i) => {
    const letters = rng.shuffle([...ALPHABET]).slice(0, size(rng, i, 4, 26));
    // Often one task is far more common than the rest, so idle slots are needed.
    const pool = rng.chance(0.5) ? [...letters, ...new Array<string>(2 * letters.length).fill(letters[0])] : letters;
    const tasks = Array.from({ length: size(rng, i, 8, 2_000) }, () => rng.pick(pool));
    return { input: { tasks, n: rng.int(0, i < 3 ? 4 : 100) } };
  },

  'median-finder': (rng, i) => {
    const calls: [string, ...Json[]][] = [['MedianFinder']];
    const span = rng.pick([10, 100_000]);
    let added = 0;
    for (let k = size(rng, i, 8, 1_000); k > 0; k--) {
      if (added === 0 || rng.chance(0.6)) {
        calls.push(['addNum', rng.int(-span, span)]);
        added++;
      } else {
        calls.push(['findMedian']);
      }
    }
    return { calls };
  },

  'kth-largest-in-stream': (rng, i) => {
    const k = size(rng, i, 3, 60);
    const span = rng.pick([5, 10_000]);
    // At least k − 1 values to start with, so there are k once the first add arrives.
    const nums = rng.ints(rng.int(k - 1, k + size(rng, i, 3, 300)), -span, span);
    const calls: [string, ...Json[]][] = [['KthLargest', k, nums]];
    for (let m = size(rng, i, 6, 800); m > 0; m--) calls.push(['add', rng.int(-span, span)]);
    return { calls };
  },

  subsets: (rng, i) => ({ input: { nums: rng.distinct(size(rng, i, 3, 9), -10, 10) } }),

  'combination-sum': (rng, i) => {
    // Keep the answer small (fewer than 150 combinations) but not empty, except in one test.
    const fewest = i === 5 ? 0 : 1;
    for (;;) {
      const candidates = rng.distinct(size(rng, i, 4, 12), 2, i < 3 ? 10 : 40);
      const target = rng.int(i < 3 ? 2 : 10, i < 3 ? 12 : 40);
      const count = combinations(candidates, target);
      if (count >= fewest && count < 150) return { input: { candidates, target } };
    }
  },

  permutations: (rng, i) => ({ input: { nums: rng.distinct(size(rng, i, 3, 6), -10, 10) } }),

  'word-search': (rng, i) => {
    const rows = size(rng, i, 3, 6);
    const cols = size(rng, i, 3, 6);
    const alphabet = rng.pick(['AB', 'ABC', 'ABCDE', 'ABCDEFGHIJ']);
    const board = Array.from({ length: rows }, () => Array.from({ length: cols }, () => rng.pick([...alphabet])));
    const length = Math.min(rows * cols, size(rng, i, 4, 15));
    if (i % 2 === 1) return { input: { board, word: rng.string(length, alphabet) } };
    // Every other word follows a path through the board, so it is there.
    let [r, c] = [rng.int(0, rows - 1), rng.int(0, cols - 1)];
    const used = new Set([r * cols + c]);
    let word = board[r][c];
    while (word.length < length) {
      const next = [
        [r + 1, c],
        [r - 1, c],
        [r, c + 1],
        [r, c - 1],
      ].filter(([y, x]) => y >= 0 && y < rows && x >= 0 && x < cols && !used.has(y * cols + x));
      if (next.length === 0) break;
      [r, c] = rng.pick(next);
      used.add(r * cols + c);
      word += board[r][c];
    }
    return { input: { board, word } };
  },

  'number-of-islands': (rng, i) => ({ input: { grid: landAndWater(rng, size(rng, i, 4, 50), size(rng, i, 4, 60), rng.pick([0.3, 0.45, 0.6])) } }),

  'max-area-of-island': (rng, i) => ({ input: { grid: landAndWater(rng, size(rng, i, 4, 50), size(rng, i, 4, 60), rng.pick([0.2, 0.4, 0.55])) } }),

  'rotting-oranges': (rng, i) => {
    // Few empty cells and at least one rotten orange in most tests, so the rot can usually reach
    // everything; every third test has many empty cells, which often cut some oranges off.
    const empty = i % 3 === 2 ? 0.35 : 0.04;
    const rotten = rng.pick([0.01, 0.05, 0.15]);
    const rows = size(rng, i, 4, 40);
    const cols = size(rng, i, 4, 40);
    const grid = gridOf(rows, cols, () => {
      const p = rng.float();
      return p < empty ? 0 : p < empty + rotten ? 2 : 1;
    });
    if (i % 3 !== 2) grid[rng.int(0, rows - 1)][rng.int(0, cols - 1)] = 2;
    return { input: { grid } };
  },

  'course-schedule': (rng, i) => {
    // Prerequisites follow a hidden order, so there is no loop, except in odd tests, which add one edge against it.
    const n = size(rng, i, 6, 800);
    const order = rng.shuffle(Array.from({ length: n }, (_, k) => k));
    const pairs = new Set<string>();
    const prerequisites: number[][] = [];
    for (let m = rng.int(0, Math.min(2 * n, 1_500)); m > 0 && n > 1; m--) {
      const [x, y] = rng.distinct(2, 0, n - 1).sort((a, b) => a - b);
      const key = `${order[y]},${order[x]}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      prerequisites.push([order[y], order[x]]);
    }
    if (i % 2 === 1 && prerequisites.length > 0) {
      // Follow a chain of prerequisites back from some course, then make the chain's first course
      // wait for that course: a loop as long as the chain (two courses when the chain is one step).
      const befores = new Map<number, number[]>();
      for (const [course, before] of prerequisites) befores.set(course, [...(befores.get(course) ?? []), before]);
      const start = rng.pick(prerequisites)[0];
      let first = start;
      for (let steps = rng.int(1, 12); steps > 0 && befores.has(first); steps--) first = rng.pick(befores.get(first)!);
      prerequisites.push([first, start]);
    }
    return { input: { numCourses: n, prerequisites: rng.shuffle(prerequisites) } };
  },

  'connected-components': (rng, i) => {
    const n = size(rng, i, 6, 1_000);
    return { input: { n, edges: undirectedEdges(rng, 0, n - 1, rng.int(0, Math.min(Math.floor(1.1 * n), 1_200))) } };
  },

  'redundant-connection': (rng, i) => {
    const n = Math.max(3, size(rng, i, 6, 800));
    const label = rng.shuffle(Array.from({ length: n }, (_, k) => k + 1));
    const joined = new Set<string>();
    const edges: number[][] = [];
    const join = (a: number, b: number) => {
      const edge = a < b ? [a, b] : [b, a];
      joined.add(edge.join());
      edges.push(edge);
    };
    // A random tree, long and thin in odd tests so the loop can be long.
    for (let k = 1; k < n; k++) join(label[k], label[i % 2 === 1 && rng.chance(0.8) ? k - 1 : rng.int(0, k - 1)]);
    // The extra edge, between two nodes not already joined directly.
    for (;;) {
      const [a, b] = rng.distinct(2, 1, n);
      if (!joined.has((a < b ? [a, b] : [b, a]).join())) {
        join(a, b);
        break;
      }
    }
    return { input: { edges: rng.shuffle(edges) } };
  },

  'network-delay-time': (rng, i) => {
    const n = size(rng, i, 5, 300);
    const k = rng.int(1, n);
    const slowest = rng.pick([5, 100]);
    const linked = new Set<string>();
    const times: number[][] = [];
    const link = (u: number, v: number) => {
      if (u === v || linked.has(`${u},${v}`)) return;
      linked.add(`${u},${v}`);
      times.push([u, v, rng.int(0, slowest)]);
    };
    // Most tests first reach every node from k along a random tree; every third may leave some out.
    if (i % 3 !== 2) {
      const order = [k, ...rng.shuffle(Array.from({ length: n }, (_, j) => j + 1).filter((v) => v !== k))];
      for (let j = 1; j < n; j++) link(order[rng.int(0, j - 1)], order[j]);
    }
    for (let m = rng.int(0, Math.min(3 * n, 1_000)); m > 0 && n > 1; m--) {
      const [u, v] = rng.distinct(2, 1, n);
      link(u, v);
    }
    return { input: { times: rng.shuffle(times), n, k } };
  },
};

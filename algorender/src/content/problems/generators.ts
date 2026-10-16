// Random tests, by problem slug, for problems whose YAML asks for `generated`
// tests. A generator gets a seeded Rng and the test's number, and returns the
// input (by parameter name) or, for a design problem, the calls. The answers
// come from the problem's TypeScript solution (src/problems/load.ts), and every
// other solution must agree (problems.test.ts).
//
// Keep inputs to a few thousand values at most: the tests travel with the page.
//
// Generators live in one file per group of patterns (gen-*.ts), gathered here.

import type { Json } from '@/workspace/protocol';
import { size, type Generator } from '@/problems/random';
import { ARRAY_GENERATORS } from './gen-arrays';
import { DP_GENERATORS } from './gen-dp';
import { GRAPH_GENERATORS } from './gen-graphs';
import { STRUCTURE_GENERATORS } from './gen-structures';

const CORE: Record<string, Generator> = {
  'two-sum': (rng, i) => {
    const n = i < 5 ? rng.int(2, 10) : rng.int(100, 2_000);
    const nums = rng.distinct(n, -1_000_000, 1_000_000);
    const [a, b] = rng.distinct(2, 0, n - 1);
    return { input: { nums, target: nums[a] + nums[b] } };
  },

  'valid-parentheses': (rng, i) => {
    // Half balanced (built by nesting), half with one character changed or dropped.
    const n = size(rng, i, 6, 400);
    const open = '([{';
    const close: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    let s = '';
    for (let k = 0; k < n; k++) {
      if (stack.length > 0 && rng.chance(0.5)) s += close[stack.pop()!];
      else {
        const ch = rng.pick([...open]);
        stack.push(ch);
        s += ch;
      }
    }
    while (stack.length > 0) s += close[stack.pop()!];
    if (i % 2 === 1) {
      const k = rng.int(0, s.length - 1);
      s = rng.chance(0.5) ? s.slice(0, k) + s.slice(k + 1) : s.slice(0, k) + rng.pick([...'()[]{}']) + s.slice(k + 1);
    }
    return { input: { s: s || '()' } };
  },

  'reverse-linked-list': (rng, i) => ({ input: { head: rng.ints(size(rng, i, 5, 3_000), -5_000, 5_000) } }),

  'invert-binary-tree': (rng, i) => ({ input: { root: rng.tree(rng.ints(size(rng, i, 7, 100), -100, 100)) } }),

  'min-stack': (rng, i) => {
    const calls: [string, ...Json[]][] = [['MinStack']];
    let depth = 0;
    for (let k = size(rng, i, 8, 2_000); k > 0; k--) {
      if (depth === 0 || rng.chance(0.45)) {
        calls.push(['push', rng.int(-1_000, 1_000)]);
        depth++;
      } else {
        const op = rng.pick(['pop', 'top', 'getMin', 'getMin']);
        calls.push([op]);
        if (op === 'pop') depth--;
      }
    }
    return { calls };
  },

  'rotate-image': (rng, i) => {
    const n = size(rng, i, 4, 20);
    return { input: { matrix: rng.grid(n, n, -1_000, 1_000) } };
  },

  'course-schedule-ii': (rng, i) => {
    // Edges follow a hidden order, so there's no loop, except in every third test, which adds one back edge.
    const n = size(rng, i, 6, 1_500);
    const order = rng.shuffle(Array.from({ length: n }, (_, k) => k));
    const pairs = new Set<string>();
    const prerequisites: number[][] = [];
    for (let k = rng.int(0, Math.min(3 * n, 4_000)); k > 0 && n > 1; k--) {
      const [x, y] = rng.distinct(2, 0, n - 1).sort((a, b) => a - b);
      const pair = `${order[y]},${order[x]}`;
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      prerequisites.push([order[y], order[x]]);
    }
    if (i % 3 === 2 && prerequisites.length > 0) {
      const [course, before] = rng.pick(prerequisites);
      if (!pairs.has(`${before},${course}`)) prerequisites.push([before, course]);
    }
    return { input: { numCourses: n, prerequisites } };
  },

  'group-anagrams': (rng, i) => {
    const bases = Array.from({ length: size(rng, i, 3, 60) }, () => rng.string(rng.int(0, 8), 'abcde'));
    const strs = Array.from({ length: size(rng, i, 6, 1_000) }, () => rng.shuffle([...rng.pick(bases)]).join(''));
    return { input: { strs } };
  },

  'merge-intervals': (rng, i) => {
    const n = size(rng, i, 5, 2_000);
    const span = i < 3 ? 20 : 10_000;
    const intervals = Array.from({ length: n }, () => {
      const start = rng.int(0, span);
      return [start, Math.min(span, start + rng.int(0, Math.max(1, Math.floor(span / 20))))];
    });
    return { input: { intervals } };
  },
};

export const GENERATORS: Record<string, Generator> = {
  ...CORE,
  ...ARRAY_GENERATORS,
  ...STRUCTURE_GENERATORS,
  ...GRAPH_GENERATORS,
  ...DP_GENERATORS,
};

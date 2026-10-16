// Seeded helpers for test generators (src/content/problems/generators.ts):
// the same seed always gives the same tests, so answers can be computed once
// and every language is judged on the same inputs.

import { createRng } from '@/engine/random';
import type { Json } from '@/workspace/protocol';

/** A generated test: the input by parameter name, or a design problem's calls (constructor first). */
export type Generated = { input: Record<string, Json> } | { calls: [string, ...Json[]][] };

/** Makes test number i (from 0) of a problem's random tests. */
export type Generator = (rng: Rng, i: number) => Generated;

/** A size that starts small and grows: the first three tests are easy to read when they fail. */
export const size = (rng: Rng, i: number, small: number, large: number) => (i < 3 ? rng.int(1, small) : rng.int(small, large));

export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = createRng(seed);
  }

  /** A float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** An integer in [lo, hi], both ends included. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** n integers in [lo, hi]. */
  ints(n: number, lo: number, hi: number): number[] {
    return Array.from({ length: n }, () => this.int(lo, hi));
  }

  /** n distinct integers in [lo, hi], in random order. */
  distinct(n: number, lo: number, hi: number): number[] {
    if (hi - lo + 1 < n) throw new Error(`Can't pick ${n} distinct integers from [${lo}, ${hi}]`);
    const seen = new Set<number>();
    while (seen.size < n) seen.add(this.int(lo, hi));
    return this.shuffle([...seen]);
  }

  /** A copy in random order (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** A string of n characters drawn from `alphabet`. */
  string(n: number, alphabet = 'abcdefghijklmnopqrstuvwxyz'): string {
    return Array.from({ length: n }, () => this.pick([...alphabet])).join('');
  }

  /** A rows × cols grid of integers in [lo, hi]. */
  grid(rows: number, cols: number, lo: number, hi: number): number[][] {
    return Array.from({ length: rows }, () => this.ints(cols, lo, hi));
  }

  /**
   * A random binary tree of n nodes holding these values (in the order
   * nodes are made), in level order with null gaps, LeetCode style.
   */
  tree(values: readonly number[]): (number | null)[] {
    if (values.length === 0) return [];
    type Node = { val: number; left: Node | null; right: Node | null };
    const root: Node = { val: values[0], left: null, right: null };
    const open: [Node, 'left' | 'right'][] = [
      [root, 'left'],
      [root, 'right'],
    ];
    for (const val of values.slice(1)) {
      const k = this.int(0, open.length - 1);
      const [parent, side] = open[k];
      open.splice(k, 1);
      const node: Node = { val, left: null, right: null };
      parent[side] = node;
      open.push([node, 'left'], [node, 'right']);
    }
    const out: (number | null)[] = [];
    const queue: (Node | null)[] = [root];
    for (let k = 0; k < queue.length; k++) {
      const node = queue[k];
      out.push(node ? node.val : null);
      if (node) queue.push(node.left, node.right);
    }
    while (out.length > 0 && out.at(-1) === null) out.pop();
    return out;
  }

  /** The level order of a binary search tree made by inserting these keys in order. */
  bst(keys: readonly number[]): (number | null)[] {
    type Node = { val: number; left: Node | null; right: Node | null };
    let root: Node | null = null;
    for (const val of keys) {
      const node: Node = { val, left: null, right: null };
      if (!root) {
        root = node;
        continue;
      }
      for (let at: Node = root; ; ) {
        const side = val < at.val ? 'left' : 'right';
        const next: Node | null = at[side];
        if (!next) {
          at[side] = node;
          break;
        }
        at = next;
      }
    }
    const out: (number | null)[] = [];
    const queue: (Node | null)[] = [root];
    for (let k = 0; k < queue.length; k++) {
      const node = queue[k];
      out.push(node ? node.val : null);
      if (node) queue.push(node.left, node.right);
    }
    while (out.length > 0 && out.at(-1) === null) out.pop();
    return out;
  }
}

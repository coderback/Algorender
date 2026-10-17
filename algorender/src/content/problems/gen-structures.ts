// Random tests for the stacks, monotonic stacks, linked lists, trees and tries problems. See generators.ts.

import type { Json } from '@/workspace/protocol';
import { size, type Generator, type Rng } from '@/problems/random';

type Calls = [string, ...Json[]][];

/** A binary tree node, for generators that shape a tree themselves. */
type Node = { val: number; left: Node | null; right: Node | null };

/** A tree written in level order with null gaps (as tests write it), as linked nodes. */
function fromLevels(level: readonly (number | null)[]): Node | null {
  if (level.length === 0 || level[0] === null) return null;
  const root: Node = { val: level[0], left: null, right: null };
  const queue: Node[] = [root];
  let k = 1;
  for (let q = 0; q < queue.length && k < level.length; q++) {
    for (const side of ['left', 'right'] as const) {
      const val = k < level.length ? level[k++] : null;
      if (val === null) continue;
      const node: Node = { val, left: null, right: null };
      queue[q][side] = node;
      queue.push(node);
    }
  }
  return root;
}

/** Linked nodes back to level order, trailing nulls trimmed. */
function toLevels(root: Node | null): (number | null)[] {
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

/** A tree's values in preorder or inorder. */
function walk(node: Node | null, order: 'pre' | 'in', out: number[] = []): number[] {
  if (node) {
    if (order === 'pre') out.push(node.val);
    walk(node.left, order, out);
    if (order === 'in') out.push(node.val);
    walk(node.right, order, out);
  }
  return out;
}

/** A random height-balanced tree of exactly this height. */
function balanced(rng: Rng, height: number): Node | null {
  if (height <= 0) return null;
  const shorter = rng.int(0, 2); // 0: both sides full height; 1: the left a level shorter; 2: the right
  return {
    val: rng.int(-10_000, 10_000),
    left: balanced(rng, height - (shorter === 1 ? 2 : 1)),
    right: balanced(rng, height - (shorter === 2 ? 2 : 1)),
  };
}

function leaves(node: Node | null, out: Node[] = []): Node[] {
  if (node && !node.left && !node.right) out.push(node);
  else if (node) {
    leaves(node.left, out);
    leaves(node.right, out);
  }
  return out;
}

/** Positions in a level-order list that hold a node. */
const filled = (level: readonly (number | null)[]) => level.flatMap((v, k) => (v === null ? [] : [k]));

/** Something to look up in a trie: a stored word, a prefix of one, one with a letter added, or a random string. */
function probe(rng: Rng, words: readonly string[], alphabet: string, longest: number): string {
  const word = rng.pick(words);
  switch (rng.int(0, 3)) {
    case 0:
      return word;
    case 1:
      return word.slice(0, rng.int(1, word.length));
    case 2:
      return word + rng.string(1, alphabet);
    default:
      return rng.string(rng.int(1, longest), alphabet);
  }
}

export const STRUCTURE_GENERATORS: Record<string, Generator> = {
  'evaluate-reverse-polish-notation': (rng, i) => {
    // Evaluated as it is built: each operator is one that keeps the value within ±10⁹ and doesn't divide by zero.
    const LIMIT = 1_000_000_000;
    const apply = (op: string, a: number, b: number) =>
      op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? NaN : Math.trunc(a / b);
    const tokens: string[] = [];
    const stack: number[] = [];
    let operands = size(rng, i, 4, 1_000);
    while (operands > 0 || stack.length > 1) {
      if (operands > 0 && (stack.length < 2 || rng.chance(0.5))) {
        const value = rng.int(-200, 200);
        tokens.push(String(value));
        stack.push(value);
        operands--;
      } else {
        const b = stack.pop()!;
        const a = stack.pop()!;
        // One of + and − always stays in range: they can't both grow |a| and |b|.
        const op = rng.pick(['+', '-', '*', '/'].filter((o) => Math.abs(apply(o, a, b)) <= LIMIT));
        tokens.push(op);
        stack.push(apply(op, a, b));
      }
    }
    return { input: { tokens } };
  },

  'daily-temperatures': (rng, i) => ({ input: { temperatures: rng.ints(size(rng, i, 8, 2_000), 30, 100) } }),

  'largest-rectangle-in-histogram': (rng, i) => {
    // Tall bars test the arithmetic; short ones make many equal heights.
    const tallest = i < 3 ? 10 : i % 2 === 0 ? 10_000 : 30;
    return { input: { heights: rng.ints(size(rng, i, 8, 2_500), 0, tallest) } };
  },

  'merge-two-sorted-lists': (rng, i) => {
    const span = i % 2 === 0 ? 10_000 : 20; // a narrow span repeats values across the lists
    const list = () => (rng.chance(0.15) ? [] : rng.ints(size(rng, i, 5, 700), -span, span).sort((a, b) => a - b));
    return { input: { list1: list(), list2: list() } };
  },

  'remove-nth-node-from-end': (rng, i) => {
    const head = rng.ints(size(rng, i, 5, 1_000), -10_000, 10_000);
    return { input: { head, n: rng.int(1, head.length) } };
  },

  'reorder-list': (rng, i) => ({ input: { head: rng.ints(size(rng, i, 6, 1_000), 1, 1_000) } }),

  'add-two-numbers': (rng, i) => {
    const number = () => {
      const digits = rng.ints(size(rng, i, 4, 100), 0, 9);
      if (digits.length > 1 && digits.at(-1) === 0) digits[digits.length - 1] = rng.int(1, 9); // no leading zero
      return digits;
    };
    return { input: { l1: number(), l2: number() } };
  },

  'find-the-duplicate-number': (rng, i) => {
    const n = size(rng, i, 5, 3_000);
    const repeated = rng.int(1, n);
    const copies = i % 3 === 2 ? rng.int(2, n + 1) : 2;
    const others = rng.shuffle(Array.from({ length: n }, (_, k) => k + 1).filter((v) => v !== repeated)).slice(0, n + 1 - copies);
    return { input: { nums: rng.shuffle([...others, ...Array<number>(copies).fill(repeated)]) } };
  },

  'lru-cache': (rng, i) => {
    const capacity = size(rng, i, 3, 100);
    const keys = capacity + Math.ceil(capacity / 2) + 1; // more keys than room, so evictions happen
    const calls: Calls = [['LRUCache', capacity]];
    for (let k = size(rng, i, 12, 800); k > 0; k--) {
      if (rng.chance(0.5)) calls.push(['put', rng.int(0, keys), rng.int(0, 100_000)]);
      else calls.push(['get', rng.int(0, keys)]);
    }
    return { calls };
  },

  'maximum-depth-of-binary-tree': (rng, i) => ({ input: { root: rng.tree(rng.ints(size(rng, i, 7, 600), -100, 100)) } }),

  'diameter-of-binary-tree': (rng, i) => ({ input: { root: rng.tree(rng.ints(size(rng, i, 7, 600), -100, 100)) } }),

  'balanced-binary-tree': (rng, i) => {
    // A third balanced, a third balanced with a short chain hung under one leaf, a third random.
    if (i % 3 === 2) return { input: { root: rng.tree(rng.ints(size(rng, i, 6, 500), -10_000, 10_000)) } };
    const root = balanced(rng, i < 3 ? rng.int(1, 4) : rng.int(5, 9));
    if (i % 3 === 1 && root) {
      const leaf = rng.pick(leaves(root));
      const tip: Node = { val: rng.int(-10_000, 10_000), left: null, right: null };
      leaf[rng.chance(0.5) ? 'left' : 'right'] = { val: rng.int(-10_000, 10_000), left: tip, right: null };
    }
    return { input: { root: toLevels(root) } };
  },

  'same-tree': (rng, i) => {
    // The same tree, one value changed, one leaf removed, or the same values in another shape.
    const p = rng.tree(rng.ints(size(rng, i, 6, 400), -10_000, 10_000));
    let q = [...p];
    if (i % 4 === 1) {
      const k = rng.pick(filled(q));
      const old = q[k] as number;
      q[k] = old === 10_000 ? old - 1 : old + 1;
    } else if (i % 4 === 2) {
      q.pop(); // the last node in level order is a leaf
      while (q.length > 0 && q.at(-1) === null) q.pop();
    } else if (i % 4 === 3) {
      q = rng.tree(p.filter((v): v is number => v !== null));
    }
    return { input: { p, q } };
  },

  'binary-tree-level-order-traversal': (rng, i) => ({ input: { root: rng.tree(rng.ints(size(rng, i, 7, 600), -1_000, 1_000)) } }),

  'binary-tree-right-side-view': (rng, i) => ({ input: { root: rng.tree(rng.ints(size(rng, i, 7, 600), -1_000, 1_000)) } }),

  'validate-binary-search-tree': (rng, i) => {
    // Valid; two values swapped (never valid); or a key inserted twice (not allowed).
    const n = size(rng, i, 6, 500);
    const keys = i >= 3 && i % 2 === 1 ? rng.distinct(n, -(2 ** 31), 2 ** 31 - 1) : rng.distinct(n, -10_000, 10_000);
    if (i % 3 === 2) return { input: { root: rng.bst([...keys, rng.pick(keys)]) } };
    const root = rng.bst(keys);
    const nodes = filled(root);
    if (i % 3 === 1 && nodes.length >= 2) {
      const [a, b] = rng.distinct(2, 0, nodes.length - 1).map((k) => nodes[k]);
      [root[a], root[b]] = [root[b], root[a]];
    }
    return { input: { root } };
  },

  'kth-smallest-in-bst': (rng, i) => {
    const keys = rng.distinct(size(rng, i, 6, 600), 0, 10_000);
    return { input: { root: rng.bst(keys), k: rng.int(1, keys.length) } };
  },

  'lowest-common-ancestor-bst': (rng, i) => {
    // Any two values, or (odd tests) two values close in order, whose ancestor tends to sit deep.
    const keys = rng.distinct(Math.max(2, size(rng, i, 7, 600)), -10_000, 10_000);
    const sorted = [...keys].sort((a, b) => a - b);
    let [p, q] = rng.distinct(2, 0, keys.length - 1).map((k) => sorted[k]);
    if (i % 2 === 1) {
      const k = rng.int(0, sorted.length - 2);
      [p, q] = rng.shuffle([sorted[k], sorted[Math.min(sorted.length - 1, k + rng.int(1, 3))]]);
    }
    return { input: { root: rng.bst(keys), p, q } };
  },

  'build-tree-from-traversals': (rng, i) => {
    const root = fromLevels(rng.tree(rng.distinct(size(rng, i, 7, 500), -3_000, 3_000)));
    return { input: { preorder: walk(root, 'pre'), inorder: walk(root, 'in') } };
  },

  'binary-tree-max-path-sum': (rng, i) => {
    const highest = i % 3 === 2 ? -1 : 1_000; // every third tree is all negative
    return { input: { root: rng.tree(rng.ints(size(rng, i, 7, 600), -1_000, highest)) } };
  },

  'implement-trie': (rng, i) => {
    const alphabet = i < 3 ? 'ab' : 'abcd';
    const longest = i < 3 ? 3 : 8;
    const words: string[] = [];
    const calls: Calls = [['Trie']];
    for (let k = size(rng, i, 10, 600); k > 0; k--) {
      if (words.length === 0 || rng.chance(0.4)) {
        const word = rng.string(rng.int(1, longest), alphabet);
        words.push(word);
        calls.push(['insert', word]);
      } else {
        calls.push([rng.chance(0.5) ? 'search' : 'startsWith', probe(rng, words, alphabet, longest)]);
      }
    }
    return { calls };
  },

  'word-dictionary': (rng, i) => {
    const alphabet = i < 3 ? 'ab' : 'abcde';
    const longest = i < 3 ? 3 : 7;
    const words: string[] = [];
    const calls: Calls = [['WordDictionary']];
    for (let k = size(rng, i, 10, 600); k > 0; k--) {
      if (words.length === 0 || rng.chance(0.4)) {
        const word = rng.string(rng.int(1, longest), alphabet);
        words.push(word);
        calls.push(['addWord', word]);
      } else {
        const chars = [...probe(rng, words, alphabet, longest)];
        for (let dots = rng.int(0, 2); dots > 0; dots--) chars[rng.int(0, chars.length - 1)] = '.';
        calls.push(['search', chars.join('')]);
      }
    }
    return { calls };
  },
};

// Exercises on a binary tree. The learner's function gets the root TreeNode
// (LeetCode style), and the tree in memory, redrawn at every line, drives
// TreeView (src/workspace/traceTree.ts): their calls walk it, and a node they
// make floats free until they link it in.

import { createRng } from '@/engine/random';
import { TREE_RUN_LEGEND } from '@/workspace/traceTree';
import type { Arg, Json, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

/** A tree in level order (null: no node there), and for insert, the value to add. */
export type TreeInput = { values: (number | null)[]; val?: number };

type Node = { val: number; left: Node | null; right: Node | null };

/** The root of a tree given in level order, as both runtimes build it. */
export function buildTree(values: readonly (number | null)[]): Node | null {
  if (values.length === 0 || values[0] === null) return null;
  const root: Node = { val: values[0], left: null, right: null };
  const waiting = [root];
  let i = 1;
  for (let k = 0; i < values.length && k < waiting.length; k++) {
    for (const side of ['left', 'right'] as const) {
      const v = values[i++];
      if (v == null) continue;
      const child: Node = { val: v, left: null, right: null };
      waiting[k][side] = child;
      waiting.push(child);
    }
  }
  return root;
}

/** A tree in level order, trailing gaps dropped, as the runtimes return one. */
export function levelOrder(root: Node | null): (number | null)[] {
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

function walk(root: Node | null, order: 'pre' | 'in' | 'post'): number[] {
  if (!root) return [];
  const left = walk(root.left, order);
  const right = walk(root.right, order);
  if (order === 'pre') return [root.val, ...left, ...right];
  if (order === 'in') return [...left, root.val, ...right];
  return [...left, ...right, root.val];
}

/** A binary search tree holding these keys, inserted in this order, in level order. */
function bstOf(keys: readonly number[]): (number | null)[] {
  let root: Node | null = null;
  for (const key of keys) root = insertInto(root, key).root;
  return levelOrder(root);
}

/** Inserts into a copy of the BST, returning the root and where the key went. */
function insertInto(root: Node | null, val: number): { root: Node; parent: Node | null; side: 'left' | 'right' | null } {
  const node: Node = { val, left: null, right: null };
  if (!root) return { root: node, parent: null, side: null };
  let at = root;
  for (;;) {
    const side = val < at.val ? 'left' : 'right';
    const next = at[side];
    if (!next) {
      at[side] = node;
      return { root, parent: at, side };
    }
    at = next;
  }
}

function randomKeys(seed: number, n: number): number[] {
  const rng = createRng(seed);
  const keys = new Set<number>();
  while (keys.size < n) keys.add(1 + Math.floor(rng() * 60));
  return [...keys];
}

const treeArgs = ({ values, val }: TreeInput): Arg[] => [
  { kind: 'tree', name: 'root', values },
  ...(val === undefined ? [] : [{ kind: 'value' as const, name: 'val', value: val }]),
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listText = (values: readonly Json[]) => `[${values.map((v) => JSON.stringify(v)).join(', ')}]`;
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkInorder(input: TreeInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  if (!Array.isArray(got)) return { pass: false, message: `Return a list (an array in JavaScript) of the values, not ${JSON.stringify(got)}.` };
  const root = buildTree(input.values);
  const want = walk(root, 'in');
  if (!same(got, want)) {
    const other = (order: 'pre' | 'post', name: string, why: string) =>
      want.length > 1 && same(got, walk(root, order)) && !same(want, walk(root, order)) ? `That is ${name}: ${why} Inorder visits the left subtree, then the node, then the right subtree.` : null;
    const named =
      other('pre', 'preorder', 'each node comes before its subtrees.') ??
      other('post', 'postorder', 'each node comes after its subtrees.') ??
      (want.length > 1 && same(got, levelOrder(root).filter((v) => v !== null)) ? 'That is level order, top row first. Inorder visits the left subtree, then the node, then the right subtree.' : null);
    if (named) return { pass: false, message: named };
    const i = want.findIndex((v, k) => got[k] !== v);
    if (i < 0) return { pass: false, message: `After all ${plural(want.length, 'value')}, your list goes on: ${listText(got.slice(want.length))}. Visit each node once.` };
    if (i >= got.length) return { pass: false, message: `Your list stops after ${listText(want.slice(0, i))}; ${want[i]} comes next.` };
    return { pass: false, message: `Position ${i + 1} should be ${want[i]}, not ${JSON.stringify(got[i])}: after ${listText(want.slice(0, i))}, the next node in order is ${want[i]}.` };
  }
  const sorted = want.every((v, k) => k === 0 || want[k - 1] < v);
  const note = sorted && want.length > 1 ? ', sorted, as a search tree’s inorder always is' : '';
  return { pass: true, message: `All ${plural(want.length, 'value')} in order${note}: ${listText(want)}.` };
}

function checkInsert(input: TreeInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const val = input.val!;
  const got = result.returned;
  const { root, parent, side } = insertInto(buildTree(input.values), val);
  const want = levelOrder(root);
  if (got === null) {
    return {
      pass: false,
      message:
        input.values.length === 0
          ? 'Your function returned nothing. For an empty tree the new node is the whole tree, so return it.'
          : 'Your function returned nothing: return the root, so the caller still has the tree.',
    };
  }
  if (!Array.isArray(got)) return { pass: false, message: `Return the root of the tree (a TreeNode), not ${JSON.stringify(got)}.` };
  if (same(got, want)) {
    const where = parent ? `the ${side} child of ${parent.val}` : 'the root of what was an empty tree';
    return { pass: true, message: `${val} is in place: ${where}.` };
  }
  if (!got.includes(val)) return { pass: false, message: `${val} isn’t in the tree you returned. Did the new node get linked to its parent?` };
  const where = parent ? `as the ${side} child of ${parent.val}` : 'as the root';
  const others = input.values.filter((v): v is number => v !== null);
  if (others.some((v) => !got.includes(v))) return { pass: false, message: `${val} is in, but some of the tree’s other values are gone: only add a leaf, and return the original root.` };
  return { pass: false, message: `${val} is in the tree, but not where a search would look for it: it belongs ${where}.` };
}

const ts = (js: string, ...swaps: [string, string][]) => swaps.reduce((code, [from, to]) => code.replace(from, to), js);
const jsAndTs = (python: string[], js: string[]) => ({ python, javascript: js, typescript: js });

const INSERT_PY = `def insert(root, val):
    if root is None:
        return TreeNode(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root
`;
const INSERT_JS = `function insert(root, val) {
  if (root === null) {
    return new TreeNode(val);
  }
  if (val < root.val) {
    root.left = insert(root.left, val);
  } else {
    root.right = insert(root.right, val);
  }
  return root;
}
`;
const INSERT_PY_BLANKS = `def insert(root, val):
    if «1:root is None»:
        return «2:TreeNode(val)»
    if «3:val < root.val»:
        root.left = «4:insert(root.left, val)»
    else:
        root.right = «5:insert(root.right, val)»
    return root
`;
const INSERT_JS_BLANKS = `function insert(root, val) {
  if («1:root === null») {
    return «2:new TreeNode(val)»;
  }
  if («3:val < root.val») {
    root.left = «4:insert(root.left, val)»;
  } else {
    root.right = «5:insert(root.right, val)»;
  }
  return root;
}
`;
const INSERT_TS: [string, string][] = [['function insert(root, val) {', 'function insert(root: TreeNode | null, val: number): TreeNode {']];

const INORDER_PY = `def inorder(root):
    out = []

    def go(node):
        if node is None:
            return
        go(node.left)
        out.append(node.val)
        go(node.right)

    go(root)
    return out
`;
const INORDER_JS = `function inorder(root) {
  const out = [];
  function go(node) {
    if (node === null) {
      return;
    }
    go(node.left);
    out.push(node.val);
    go(node.right);
  }
  go(root);
  return out;
}
`;
const INORDER_PY_BLANKS = `def inorder(root):
    out = []

    def go(node):
        if «1:node is None»:
            return
        «2:go(node.left)»
        «3:out.append(node.val)»
        «4:go(node.right)»

    go(root)
    return out
`;
const INORDER_JS_BLANKS = `function inorder(root) {
  const out = [];
  function go(node) {
    if («1:node === null») {
      return;
    }
    «2:go(node.left)»;
    «3:out.push(node.val)»;
    «4:go(node.right)»;
  }
  go(root);
  return out;
}
`;
const INORDER_TS: [string, string][] = [
  ['function inorder(root) {', 'function inorder(root: TreeNode | null): number[] {'],
  ['const out = [];', 'const out: number[] = [];'],
  ['function go(node) {', 'function go(node: TreeNode | null): void {'],
];

const SEARCH_TREE = [4, 2, 7, 1, 3, 6, 9];
const FULL = [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15];

const TASK_TREE = '`root` is a `TreeNode` with `val`, `left` and `right` (`None`/`null` where there is no child), or `None`/`null` for an empty tree.';

export const treeExercises: Exercise<TreeInput>[] = [
  {
    slug: 'bst-insert',
    title: 'Insert into a binary search tree',
    kind: 'write',
    visualiser: 'binary-tree',
    summary: 'Walk down a search tree to the empty spot where a new value belongs, and watch your new node get linked in.',
    task: [
      `Write \`insert(root, val)\` (Python, JavaScript and TypeScript). ${TASK_TREE} The tree is a binary search tree: smaller values to the left of a node, larger to the right.`,
      'Add a new `TreeNode(val)` (`new TreeNode(val)` in JavaScript) where it belongs, and return the root. `val` is never already in the tree.',
      'From the root, go left when `val` is smaller than the node’s value and right otherwise, until there is no child that way. Recursion makes the linking easy: the call on an empty spot returns the new node, and each caller stores what came back as its child.',
    ],
    entry: { python: 'insert', js: 'insert' },
    args: treeArgs,
    starter: {
      python: `def insert(root, val):
    # root is a binary search tree, or None when it is empty.
    # Add TreeNode(val) where it belongs, and return the root.
    return root
`,
      javascript: `function insert(root, val) {
  // root is a binary search tree, or null when it is empty.
  // Add new TreeNode(val) where it belongs, and return the root.
  return root;
}
`,
      typescript: `function insert(root: TreeNode | null, val: number): TreeNode | null {
  // root is a binary search tree, or null when it is empty.
  // Add new TreeNode(val) where it belongs, and return the root.
  return root;
}
`,
    },
    solution: { python: INSERT_PY, javascript: INSERT_JS, typescript: ts(INSERT_JS, ...INSERT_TS) },
    blanks: { python: INSERT_PY_BLANKS, javascript: INSERT_JS_BLANKS, typescript: ts(INSERT_JS_BLANKS, ...INSERT_TS) },
    fades: [[5], [4, 5], [2, 3, 4, 5], [1, 2, 3, 4, 5]],
    distractors: jsAndTs(['insert(root.left, val)', 'root = TreeNode(val)'], ['insert(root.left, val);', 'root = new TreeNode(val);']),
    examples: [
      { id: 'middle', label: 'Insert 5', input: { values: [4, 2, 7, null, 3], val: 5 } },
      { id: 'smallest', label: 'A new smallest', input: { values: FULL.slice(0, 7), val: 1 } },
      { id: 'empty', label: 'Into an empty tree', input: { values: [], val: 8 } },
    ],
    tests: [
      { name: 'between two values', input: { values: [4, 2, 7, null, 3], val: 5 } },
      { name: 'a new smallest', input: { values: FULL.slice(0, 7), val: 1 } },
      { name: 'a new largest', input: { values: FULL.slice(0, 7), val: 20 } },
      { name: 'an empty tree', input: { values: [], val: 8 } },
      { name: 'one node, to its left', input: { values: [10], val: 3 } },
      { name: 'down a chain', input: { values: bstOf([10, 20, 30, 40]), val: 35 } },
      { name: 'random tree (12 keys)', input: { values: bstOf(randomKeys(5, 12)), val: 61 } },
      { name: 'random tree (9 keys)', input: { values: bstOf(randomKeys(13, 9)), val: 0 } },
    ],
    check: checkInsert,
    markSortedAtEnd: false,
    pointers: [],
    hints: [
      'An empty tree (`root` is `None`/`null`) is the end of the walk: return the new node.',
      'Otherwise compare `val` with `root.val` and go to one side: `root.left = insert(root.left, val)` when it is smaller.',
      'Return `root` at the end, so each caller keeps its own node as the child it already had, or gains the new node.',
    ],
    legend: [...TREE_RUN_LEGEND],
  },
  {
    slug: 'inorder-traversal',
    title: 'Write an inorder traversal',
    kind: 'write',
    visualiser: 'binary-tree',
    summary: 'List a tree’s values left subtree, node, right subtree, and watch your recursive calls walk it.',
    task: [
      `Write \`inorder(root)\` (Python, JavaScript and TypeScript). ${TASK_TREE}`,
      'Return a list (an array in JavaScript) of the values in inorder: everything in the left subtree, then the node itself, then everything in the right subtree. For a binary search tree that is sorted order.',
      'A recursive helper is the natural fit: for a node, handle its left subtree, record its value, then handle its right subtree. An empty subtree has nothing to add.',
    ],
    entry: { python: 'inorder', js: 'inorder' },
    args: treeArgs,
    starter: {
      python: `def inorder(root):
    # Return the values: left subtree, then the node, then the right subtree.
    out = []
    return out
`,
      javascript: `function inorder(root) {
  // Return the values: left subtree, then the node, then the right subtree.
  const out = [];
  return out;
}
`,
      typescript: `function inorder(root: TreeNode | null): number[] {
  // Return the values: left subtree, then the node, then the right subtree.
  const out: number[] = [];
  return out;
}
`,
    },
    solution: { python: INORDER_PY, javascript: INORDER_JS, typescript: ts(INORDER_JS, ...INORDER_TS) },
    blanks: { python: INORDER_PY_BLANKS, javascript: INORDER_JS_BLANKS, typescript: ts(INORDER_JS_BLANKS, ...INORDER_TS) },
    fades: [[3], [2, 4], [2, 3, 4], [1, 2, 3, 4]],
    distractors: jsAndTs(['go(node)', 'out.append(node)'], ['go(node);', 'out.push(node);']),
    examples: [
      { id: 'search', label: 'A search tree', input: { values: SEARCH_TREE } },
      { id: 'lopsided', label: 'Leaning right', input: { values: [1, null, 2, null, 3] } },
      { id: 'gaps', label: 'With gaps', input: { values: [5, 3, 8, 1, 4, null, 9, null, 2] } },
    ],
    tests: [
      { name: 'a search tree', input: { values: SEARCH_TREE } },
      { name: 'an empty tree', input: { values: [] } },
      { name: 'one node', input: { values: [1] } },
      { name: 'leaning right', input: { values: [1, null, 2, null, 3] } },
      { name: 'leaning left', input: { values: [3, 2, null, 1] } },
      { name: 'with gaps', input: { values: [5, 3, 8, 1, 4, null, 9, null, 2] } },
      { name: 'not a search tree', input: { values: [1, 2, 3, 4, 5, 6] } },
      { name: 'full, 15 nodes', input: { values: FULL } },
      { name: 'random search tree (11 keys)', input: { values: bstOf(randomKeys(21, 11)) } },
    ],
    check: checkInorder,
    markSortedAtEnd: false,
    pointers: [],
    hints: [
      'Write a helper `go(node)` that does nothing when `node` is `None`/`null`.',
      'Otherwise it calls `go(node.left)`, then appends `node.val`, then calls `go(node.right)`: the order of those three lines is the whole difference between pre-, in- and postorder.',
      'Call `go(root)` once and return the list it filled.',
    ],
    legend: [...TREE_RUN_LEGEND],
  },
];

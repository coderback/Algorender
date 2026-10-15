import type { OperationSpec } from '@/engine/module';
import type { Checkpoint } from '@/engine/types';
import { TreeTracer, type TreeDrawing } from '@/viz/tree/tracer';
import type { Cell, NodeId, TreeNode, TreeShape, TreeState } from '@/viz/tree/types';
import { keyArg, plural } from './shared';

// Shared model and helpers for the binary search tree and the AVL tree.
// Models are immutable: every helper returns a new tree and shares the nodes
// it didn't touch. Node ids come from a counter, so a node keeps its identity
// (and its place on screen animates) however the tree is restructured.

export type Side = 'left' | 'right';

export type BinNode = { readonly key: number; readonly left: NodeId | null; readonly right: NodeId | null };

export type BinTree<N extends BinNode = BinNode> = {
  readonly root: NodeId | null;
  readonly nodes: Readonly<Record<NodeId, N>>;
  readonly nextId: number;
};

/** Most nodes a binary tree may hold, so it stays legible on a phone. */
export const MAX_NODES = 31;

export const emptyTree = <N extends BinNode>(): BinTree<N> => ({ root: null, nodes: {}, nextId: 1 });

export const size = (tree: BinTree<BinNode>) => Object.keys(tree.nodes).length;

export function put<N extends BinNode>(tree: BinTree<N>, id: NodeId, node: N): BinTree<N> {
  return { ...tree, nodes: { ...tree.nodes, [id]: node } };
}

export function drop<N extends BinNode>(tree: BinTree<N>, id: NodeId): BinTree<N> {
  const nodes = { ...tree.nodes };
  delete nodes[id];
  return { ...tree, nodes };
}

/** Makes `child` the root (parent null) or the parent's child on `side`. */
export function link<N extends BinNode>(tree: BinTree<N>, parent: NodeId | null, side: Side | null, child: NodeId | null): BinTree<N> {
  if (parent == null || side == null) return { ...tree, root: child };
  return put(tree, parent, { ...tree.nodes[parent], [side]: child });
}

/** Adds a detached node with the next id. */
export function create<N extends BinNode>(tree: BinTree<N>, node: N): [BinTree<N>, NodeId] {
  const id = `n${tree.nextId}`;
  return [{ ...tree, nextId: tree.nextId + 1, nodes: { ...tree.nodes, [id]: node } }, id];
}

export function inorder(tree: BinTree<BinNode>): number[] {
  const out: number[] = [];
  const walk = (id: NodeId | null) => {
    if (id == null) return;
    const n = tree.nodes[id];
    walk(n.left);
    out.push(n.key);
    walk(n.right);
  };
  walk(tree.root);
  return out;
}

/** Height counting nodes: an empty tree has height 0, a single node 1. */
export function heightOf(tree: BinTree<BinNode>, id: NodeId | null): number {
  if (id == null) return 0;
  const n = tree.nodes[id];
  return 1 + Math.max(heightOf(tree, n.left), heightOf(tree, n.right));
}

/** The node holding the smallest key in a subtree, and the nodes walked to reach it. */
export function leftmost(tree: BinTree<BinNode>, id: NodeId): NodeId[] {
  const walk = [id];
  while (tree.nodes[walk[walk.length - 1]].left != null) walk.push(tree.nodes[walk[walk.length - 1]].left!);
  return walk;
}

export function rightmost(tree: BinTree<BinNode>, id: NodeId): NodeId {
  let cur = id;
  while (tree.nodes[cur].right != null) cur = tree.nodes[cur].right!;
  return cur;
}

/** Draws a binary tree. Keys are cells keyed by value, so a copied key flies to its new node. */
export function binaryDrawing<N extends BinNode>(
  name: string,
  badges?: (tree: BinTree<N>, id: NodeId) => TreeNode['badges'],
): TreeDrawing<BinTree<N>> {
  return {
    empty: 'The tree is empty. Insert a key to plant the root.',
    shape: (tree) => {
      const nodes: Record<NodeId, TreeNode> = {};
      const seen = new Set<number>();
      // Pre-order, so when a key is briefly in two nodes (a successor being
      // copied up) the ancestor gets the key's own cell and the copy below gets
      // a fresh one.
      const walk = (id: NodeId | null) => {
        if (id == null) return;
        const n = tree.nodes[id];
        const cell: Cell = { id: seen.has(n.key) ? `k${n.key}@${id}` : `k${n.key}`, label: String(n.key) };
        seen.add(n.key);
        nodes[id] = { shape: 'round', cells: [cell], children: [n.left, n.right], ...(badges && { badges: badges(tree, id) }) };
        walk(n.left);
        walk(n.right);
      };
      walk(tree.root);
      return { root: tree.root, nodes, strip: null } satisfies TreeShape;
    },
    describe: (tree) => {
      const keys = inorder(tree);
      if (keys.length === 0) return `Empty ${name}.`;
      return `${name[0].toUpperCase()}${name.slice(1)} with ${plural(keys.length, 'key')}, height ${heightOf(tree, tree.root)}, root ${tree.nodes[tree.root!].key}. In order: ${keys.join(', ')}.`;
    },
  };
}

/** "Go left or right?" at a comparison. The third choice is the equal case. */
export function sideQuestion(key: number, nodeKey: number, equal: string): Checkpoint {
  return {
    question: `${key} vs ${nodeKey}: where does it go next?`,
    choices: ['Go left', 'Go right', equal],
    answer: key < nodeKey ? 0 : key > nodeKey ? 1 : 2,
  };
}

/** "smaller" / "larger": what every key in that subtree is, relative to the node. */
export const sideWord = (side: Side) => (side === 'left' ? 'smaller' : 'larger');

export const SEARCH_CODE = [
  'search(key):',
  '  node ← root',
  '  while node ≠ nil:',
  '    if key = node.key: return node',
  '    if key < node.key: node ← node.left',
  '    else: node ← node.right',
  '  return nil   (not in the tree)',
] as const;

/** Search, shared by every binary search tree: one walk down, one comparison per level. */
export function searchOperation<N extends BinNode>(
  drawing: TreeDrawing<BinTree<N>>,
  stats: readonly string[],
): OperationSpec<BinTree<N>, TreeState> {
  return {
    id: 'search',
    label: 'Search',
    args: [keyArg('Key', 40)],
    pseudocode: SEARCH_CODE,
    disabledReason: (tree) => (tree.root == null ? 'The tree is empty' : null),
    *run(model, args) {
      const key = Number(args.key);
      const t = new TreeTracer(model, drawing, stats);
      const path: NodeId[] = [];
      let cur = model.root;
      while (cur != null) {
        const node = model.nodes[cur];
        path.push(cur);
        const vars = { key, 'node.key': node.key, depth: path.length - 1 };
        t.count('comparisons');
        yield t.frame({
          line: 3,
          note:
            path.length === 1
              ? `Start at the root and compare ${key} with ${node.key}. Smaller keys live to the left, larger ones to the right.`
              : `Compare ${key} with ${node.key}.`,
          marks: { visited: path.slice(0, -1), compare: [cur] },
          path,
          probe: { label: String(key), at: cur },
          vars,
          checkpoint: sideQuestion(key, node.key, 'Found it'),
        });
        if (key === node.key) {
          yield t.frame({
            line: 3,
            note: `${key} = ${node.key}: found it after ${plural(path.length, 'comparison')}, one per level on the way down.`,
            marks: { visited: path.slice(0, -1), found: [cur] },
            path,
            vars: { ...vars, found: true },
          });
          return model;
        }
        const side: Side = key < node.key ? 'left' : 'right';
        const next = node[side];
        yield t.frame({
          line: side === 'left' ? 4 : 5,
          note: `${key} ${side === 'left' ? '<' : '>'} ${node.key}, so ${key} can only be in ${node.key}'s ${side} subtree, where every key is ${sideWord(side)}. ${
            next == null ? 'That subtree is empty.' : `Go ${side} to ${model.nodes[next].key}.`
          }`,
          marks: { visited: path },
          path,
          probe: { label: String(key), at: cur },
          vars,
        });
        cur = next;
      }
      yield t.frame({
        line: 6,
        note: `The walk fell off the tree, so ${key} is not in it. That empty spot is exactly where inserting ${key} would put it.`,
        marks: { visited: path },
        path,
        vars: { key, found: false },
      });
      return model;
    },
  };
}

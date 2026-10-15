import { defineStructure, type OperationSpec } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { TreeTracer, treeSnapshot } from '@/viz/tree/tracer';
import type { NodeId, TreeState } from '@/viz/tree/types';
import {
  MAX_NODES,
  binaryDrawing,
  create,
  drop,
  emptyTree,
  leftmost,
  link,
  put,
  searchOperation,
  sideQuestion,
  sideWord,
  size,
  storedKeyArg,
  type BinNode,
  type BinTree,
  type Side,
} from './binary';
import { COMPARISONS, ROTATIONS, keyArg, seededKeys, signed } from './shared';

export type AvlNode = BinNode & { readonly height: number };
export type Avl = BinTree<AvlNode>;
type Op = OperationSpec<Avl, TreeState>;
type F = Frame<TreeState>;

const STATS = ['comparisons', 'rotations'];
const EMPTY = 'The tree is empty';
const FULL = `The tree is full (${MAX_NODES} keys), the most this view draws clearly`;

/** Height of a subtree; nil has height 0 and a leaf 1. Read from the node, as the algorithm does. */
export const h = (tree: Avl, id: NodeId | null) => (id == null ? 0 : tree.nodes[id].height);
export const balance = (tree: Avl, id: NodeId) => h(tree, tree.nodes[id].left) - h(tree, tree.nodes[id].right);

const drawing = binaryDrawing<AvlNode>('AVL tree', (tree, id) => {
  const bf = balance(tree, id);
  return { top: signed(bf), bottom: `h${tree.nodes[id].height}`, alert: Math.abs(bf) > 1 };
});

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

/** Recomputes a node's stored height from its children's. */
function fixHeight(tree: Avl, id: NodeId): Avl {
  const n = tree.nodes[id];
  return put(tree, id, { ...n, height: 1 + Math.max(h(tree, n.left), h(tree, n.right)) });
}

/**
 * Rotates the subtree at `top` towards `dir` ('right' lifts its left child).
 * The child's inner subtree changes parent. Re-links the new top under
 * `parent` straight away, so the frame after shows the tree in one piece.
 */
function rotate(tree: Avl, top: NodeId, dir: Side, parent: NodeId | null, side: Side | null): { tree: Avl; lifted: NodeId; moved: NodeId | null } {
  const up = other(dir); // the side the lifted child comes from
  const lifted = tree.nodes[top][up]!;
  const moved = tree.nodes[lifted][dir];
  let next = put(tree, top, { ...tree.nodes[top], [up]: moved });
  next = fixHeight(next, top);
  next = put(next, lifted, { ...next.nodes[lifted], [dir]: top });
  next = fixHeight(next, lifted);
  return { tree: link(next, parent, side, lifted), lifted, moved };
}

const ROTATION_CASES = ['LL', 'LR', 'RR', 'RL'] as const;
const ROTATION_CHOICES = ['Right rotation (LL)', 'Left, then right (LR)', 'Left rotation (RR)', 'Right, then left (RL)'];
const CASE_NAMES = { LL: 'left-left', LR: 'left-right', RR: 'right-right', RL: 'right-left' } as const;

/** Pseudo-code line numbers of the shared rebalancing tail, which insert and delete number differently. */
type Lines = { update: number; lr: number; rotRight: number; rl: number; rotLeft: number };

/**
 * The walk back up: update this node's height, compute its balance factor,
 * and rotate if it is ±2. `path` is the recursion stack (root first, this
 * node last). Returns the id now at the top of this subtree.
 */
function* rebalance(t: TreeTracer<Avl>, id: NodeId, parent: NodeId | null, side: Side | null, path: readonly NodeId[], L: Lines): Generator<F, NodeId> {
  const oldHeight = t.model.nodes[id].height;
  t.model = fixHeight(t.model, id);
  const n = t.model.nodes[id];
  const hl = h(t.model, n.left);
  const hr = h(t.model, n.right);
  const b = hl - hr;
  const above = path.slice(0, -1);
  const vars = { node: n.key, 'h(left)': hl, 'h(right)': hr, bf: signed(b) };
  const head = `Back up at ${n.key}: its height ${n.height === oldHeight ? `stays ${n.height}` : `becomes 1 + max(${hl}, ${hr}) = ${n.height}`}, and its balance factor is ${hl} − ${hr} = ${signed(b)}`;

  if (Math.abs(b) <= 1) {
    yield t.frame({
      line: L.update,
      note: `${head}, within ±1, so no rotation is needed here.`,
      marks: { visited: above, compare: [id] },
      path,
      vars,
    });
    return id;
  }

  const heavy: Side = b > 0 ? 'left' : 'right';
  const child = n[heavy]!;
  const cb = balance(t.model, child);
  const inner = heavy === 'left' ? cb < 0 : cb > 0;
  const kase = heavy === 'left' ? (inner ? 'LR' : 'LL') : inner ? 'RL' : 'RR';
  const key = (x: NodeId | null) => (x == null ? null : t.model.nodes[x].key);

  yield t.frame({
    line: L.update,
    note: `${head}: out of balance, because its ${heavy} subtree is two levels taller than its ${other(heavy)} one.`,
    marks: { visited: above, reject: [id] },
    path,
    vars,
    checkpoint: { question: `Which rotation rebalances ${n.key}?`, choices: ROTATION_CHOICES, answer: ROTATION_CASES.indexOf(kase) },
  });

  const childLean = cb === 0 ? 'is level (0)' : `leans ${cb > 0 ? 'left' : 'right'} (${signed(cb)})`;
  if (inner) {
    const grand = t.model.nodes[child][other(heavy)]!;
    const innerLine = heavy === 'left' ? L.lr : L.rl;
    const innerMoved = t.model.nodes[grand][heavy];
    yield t.frame({
      line: innerLine,
      note: `${n.key} leans ${heavy} (${signed(b)}) but its ${heavy} child ${key(child)} ${childLean}: the ${CASE_NAMES[kase]} case. One rotation would only move the bend to the other side, so first rotate ${key(child)} ${heavy} to straighten it.`,
      marks: { visited: above, reject: [id], swap: [child, grand], write: [innerMoved] },
      path,
      vars,
    });
    const r = rotate(t.model, child, heavy, id, heavy);
    t.model = r.tree;
    t.count('rotations');
    yield t.frame({
      line: innerLine,
      note: `${key(grand)} moved up above ${key(child)}${
        r.moved ? `, and ${key(r.moved)} moved across to become ${key(child)}'s ${other(heavy)} child` : ''
      }. Now ${n.key}'s ${heavy} side leans straight ${heavy}.`,
      marks: { visited: above, reject: [id], swap: [child, grand], write: [r.moved] },
      path,
      vars,
    });
  }

  const lifted = t.model.nodes[id][heavy]!;
  const outerLine = heavy === 'left' ? L.rotRight : L.rotLeft;
  const dir = other(heavy);
  yield t.frame({
    line: outerLine,
    note: inner
      ? `Now rotate ${n.key} ${dir}, so ${key(lifted)} moves up into its place.`
      : `${n.key} leans ${heavy} (${signed(b)}) and its ${heavy} child ${key(lifted)} ${childLean}: the ${CASE_NAMES[kase]} case, fixed by one ${dir} rotation around ${n.key}.`,
    marks: { visited: above, reject: [id], swap: [lifted], write: [t.model.nodes[lifted][dir]] },
    path,
    vars,
  });
  const r = rotate(t.model, id, dir, parent, side);
  t.model = r.tree;
  t.count('rotations');
  const newBf = balance(t.model, lifted);
  yield t.frame({
    line: outerLine,
    note: `${key(lifted)} moved up and ${n.key} became its ${dir} child${
      r.moved ? `; ${key(r.moved)}, which lies between them in order, moved across to become ${n.key}'s ${heavy} child` : ''
    }. Heights are now ${n.key}: ${h(t.model, id)} and ${key(lifted)}: ${h(t.model, lifted)}, so this subtree is balanced again (${signed(newBf)}).`,
    marks: { visited: above, swap: [lifted, id], write: [r.moved] },
    path: [...above, lifted],
    vars: { node: key(lifted), bf: signed(newBf) },
  });
  return lifted;
}

// ───────────────────────────── insert ─────────────────────────────

const INSERT_LINES: Lines = { update: 7, lr: 9, rotRight: 10, rl: 12, rotLeft: 13 };

const insert: Op = {
  id: 'insert',
  label: 'Insert',
  args: [keyArg('Key', 25)],
  pseudocode: [
    'insert(node, key):',
    '  if node = nil: return Node(key)',
    '  if key < node.key:',
    '    node.left ← insert(node.left, key)',
    '  elif key > node.key:',
    '    node.right ← insert(node.right, key)',
    '  else: return node   (duplicate)',
    '  update height; bf ← h(l) − h(r)',
    '  if bf > 1:',
    '    if bf(left) < 0: rotateLeft(left)',
    '    return rotateRight(node)',
    '  if bf < −1:',
    '    if bf(right) > 0: rotateRight(right)',
    '    return rotateLeft(node)',
    '  return node',
  ],
  disabledReason: (tree) => (size(tree) >= MAX_NODES ? FULL : null),
  *run(model, args) {
    const key = Number(args.key);
    const t = new TreeTracer(model, drawing, STATS);
    const path: NodeId[] = [];
    let duplicate = false;

    function* ins(id: NodeId | null, parent: NodeId | null, side: Side | null): Generator<F, void> {
      if (id == null) {
        const [tree, nid] = create(t.model, { key, left: null, right: null, height: 1 });
        t.model = link(tree, parent, side, nid);
        path.push(nid);
        yield t.frame({
          line: 1,
          note:
            parent == null
              ? `The tree is empty, so ${key} becomes the root, a leaf of height 1.`
              : `${key} goes into the empty spot as a new leaf of height 1. Its ancestors may now be taller, so walk back up the path and check each one.`,
          marks: { visited: path.slice(0, -1), key: [nid] },
          path,
          vars: { key },
        });
        path.pop();
        return;
      }
      const node = t.model.nodes[id];
      path.push(id);
      const vars = { key, 'node.key': node.key };
      t.count('comparisons');
      yield t.frame({
        line: 2,
        note: path.length === 1 ? `Insert as in any binary search tree first: start at the root and compare ${key} with ${node.key}.` : `Compare ${key} with ${node.key}.`,
        marks: { visited: path.slice(0, -1), compare: [id] },
        path,
        probe: { label: String(key), at: id },
        vars,
        checkpoint: sideQuestion(key, node.key, 'Already in the tree'),
      });
      if (key === node.key) {
        duplicate = true;
        yield t.frame({ line: 6, note: `${key} is already in the tree, so nothing changes.`, marks: { found: [id] }, path, vars });
        return;
      }
      const dir: Side = key < node.key ? 'left' : 'right';
      yield t.frame({
        line: dir === 'left' ? 3 : 5,
        note: `${key} ${dir === 'left' ? '<' : '>'} ${node.key}, so it belongs in ${node.key}'s ${dir} subtree, with the ${sideWord(dir)} keys.`,
        marks: { visited: path },
        path,
        probe: { label: String(key), at: id },
        vars,
      });
      yield* ins(node[dir], id, dir);
      if (!duplicate) yield* rebalance(t, id, parent, side, path, INSERT_LINES);
      path.pop();
    }

    yield* ins(model.root, null, null);
    if (duplicate) return model;
    yield t.frame({
      line: 14,
      note: `Done: ${key} is in, and every node on its path has a balance factor of −1, 0 or +1, so the height stays about log₂ n.`,
      marks: { key: Object.keys(t.model.nodes).filter((id) => t.model.nodes[id].key === key) },
      vars: { key },
    });
    return t.model;
  },
};

// ───────────────────────────── delete ─────────────────────────────

const DELETE_LINES: Lines = { update: 11, lr: 13, rotRight: 14, rl: 16, rotLeft: 17 };

const remove: Op = {
  id: 'delete',
  label: 'Delete',
  // Only keys in the tree: searching shows how a missing key is ruled out.
  args: [storedKeyArg<AvlNode>()],
  pseudocode: [
    'delete(node, key):',
    '  if key < node.key:',
    '    node.left ← delete(node.left, key)',
    '  elif key > node.key:',
    '    node.right ← delete(node.right, key)',
    '  elif node has < 2 children:',
    '    return its child (or nil)',
    '  else:',
    '    s ← leftmost node of node.right',
    '    node.key ← s.key',
    '    delete s.key from node.right',
    '  update height; bf ← h(l) − h(r)',
    '  if bf > 1:',
    '    if bf(left) < 0: rotateLeft(left)',
    '    return rotateRight(node)',
    '  if bf < −1:',
    '    if bf(right) > 0: rotateRight(right)',
    '    return rotateLeft(node)',
    '  return node',
  ],
  disabledReason: (tree) => (tree.root == null ? EMPTY : null),
  *run(model, args) {
    const key = Number(args.key);
    const t = new TreeTracer(model, drawing, STATS);
    const path: NodeId[] = [];

    /** Deletes `target` from the subtree at `id`; false when it isn't there (unreachable: the key is a choice). */
    function* del(id: NodeId | null, parent: NodeId | null, side: Side | null, target: number, copy: boolean): Generator<F, boolean> {
      if (id == null) return false;
      const node = t.model.nodes[id];
      path.push(id);
      const vars = { key: target, 'node.key': node.key };
      t.count('comparisons');
      yield t.frame({
        line: 1,
        note:
          copy && t.model.nodes[path[path.length - 2]]?.key === target
            ? `Now delete the old ${target} from the right subtree: compare it with ${node.key}.`
            : path.length === 1
              ? `Find ${target} as in any binary search tree: start at the root and compare it with ${node.key}.`
              : `Compare ${target} with ${node.key}.`,
        marks: { visited: path.slice(0, -1), compare: [id] },
        path,
        probe: { label: String(target), at: id },
        vars,
        checkpoint: sideQuestion(target, node.key, 'Found it'),
      });

      if (target !== node.key) {
        const dir: Side = target < node.key ? 'left' : 'right';
        yield t.frame({
          line: dir === 'left' ? 2 : 4,
          note: `${target} ${dir === 'left' ? '<' : '>'} ${node.key}: it can only be in the ${dir} subtree.`,
          marks: { visited: path },
          path,
          probe: { label: String(target), at: id },
          vars,
        });
        const found = yield* del(node[dir], id, dir, target, copy);
        if (found) yield* rebalance(t, id, parent, side, path, DELETE_LINES);
        path.pop();
        return found;
      }

      const kids = [node.left, node.right].filter((c): c is NodeId => c != null);
      if (kids.length < 2) {
        const child = kids[0] ?? null;
        t.model = drop(link(t.model, parent, side, child), id);
        path.pop();
        yield t.frame({
          line: 6,
          note: `${copy ? `This is the old ${target}, now copied up. ` : ''}${
            child == null
              ? `${target} is a leaf, so it is simply removed.`
              : `${target} has one child, ${t.model.nodes[child].key}, which moves up into its place.`
          } The walk back up checks every ancestor's balance.`,
          marks: { visited: path, write: [child] },
          path: child == null ? path : [...path, child],
          vars: { key: target },
        });
        return true;
      }

      const walk = leftmost(t.model, node.right!);
      const s = walk[walk.length - 1];
      const sKey = t.model.nodes[s].key;
      yield t.frame({
        line: 8,
        note: `${target} has two children, so its node stays and takes another key instead: its in-order successor, the leftmost key of its right subtree, ${sKey}.`,
        marks: { visited: [...path.slice(0, -1), ...walk.slice(0, -1)], reject: [id], min: [s] },
        path: [...path, ...walk],
        vars: { key: target, successor: sKey },
      });
      t.model = put(t.model, id, { ...t.model.nodes[id], key: sKey });
      yield t.frame({
        line: 9,
        note: `Copy ${sKey} into the node. Everything on its left is smaller and everything else on its right is larger, so the order holds. The old ${sKey} must now go.`,
        marks: { visited: path.slice(0, -1), write: [id], min: [s] },
        path: [...path, ...walk],
        vars: { key: target, successor: sKey },
      });
      yield* del(t.model.nodes[id].right, id, 'right', sKey, true);
      yield* rebalance(t, id, parent, side, path, DELETE_LINES);
      path.pop();
      return true;
    }

    const found = yield* del(model.root, null, null, key, false);
    if (!found) return model;
    yield t.frame({
      line: 18,
      note:
        t.model.root == null
          ? `Done: ${key} was the only key, so the tree is now empty.`
          : `Done: ${key} is gone and every node on the path is balanced again. Unlike insert, a delete can need a rotation at more than one level.`,
      vars: { key },
    });
    return t.model;
  },
};

// ───────────────────────────── module ─────────────────────────────

const build = (keys: readonly number[]): Avl =>
  keys.reduce<Avl>((tree, key) => recordOperation(insert.run(tree, { key })).result, emptyTree<AvlNode>());

export const avlTree = defineStructure<Avl, TreeState>({
  kind: 'structure',
  slug: 'avl-tree',
  view: 'tree',
  initial: [
    { id: 'balanced', label: 'Balanced (7 keys)', make: () => build([50, 30, 70, 20, 40, 60, 80]) },
    { id: 'empty', label: 'Empty', make: () => emptyTree<AvlNode>() },
    { id: 'sorted', label: 'Sorted inserts 10–70', make: () => build([10, 20, 30, 40, 50, 60, 70]) },
    { id: 'leaning', label: 'About to tip (30, 20)', make: () => build([30, 20]) },
    { id: 'random', label: 'Random (10 keys)', make: (seed) => build(seededKeys(seed, 10)) },
  ],
  snapshot: (tree) => treeSnapshot(drawing, tree),
  operations: [insert, remove, searchOperation(drawing, STATS)],
  stats: [COMPARISONS, ROTATIONS],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'compare', label: 'Compared / checking balance' },
    { mark: 'visited', label: 'On the path' },
    { mark: 'key', label: 'New node' },
    { mark: 'reject', label: 'Out of balance (±2)' },
    { mark: 'swap', label: 'Rotating' },
    { mark: 'write', label: 'Subtree changing parent' },
    { mark: 'min', label: 'In-order successor' },
    { mark: 'found', label: 'Found' },
  ],
  content: {
    idea: 'An AVL tree is a binary search tree that repairs itself. Each node stores its height; after an insert or delete, the walk back up recomputes heights and balance factors (left height minus right height). Where a node reaches ±2, one or two rotations lift the taller side, keeping the order intact. The small numbers beside each node are its balance factor and height.',
    invariant: 'Binary-search-tree order, plus: at every node the two subtree heights differ by at most 1 (balance factor −1, 0 or +1). That caps the height at about 1.44 log₂ n.',
    whenToUse:
      'Lookup-heavy ordered sets and maps that must never degrade: the strict balance keeps searches short. Red-black trees rebalance less often and suit insert-heavy loads. Try "About to tip" and insert 10 (one right rotation) or 25 (a double rotation), or insert 10, 20, 30 into an empty tree.',
    traits: [
      { label: 'O(log n) worst case', good: true },
      { label: 'Keeps keys in sorted order', good: true },
      { label: 'Extra height per node; rotations on update', good: null },
    ],
    experiments: [
      { example: 'leaning', prompt: 'Insert 10: which rotation? Undo, insert 25: why does it need two?' },
      { example: 'sorted', prompt: 'These sorted inserts made a chain in a plain BST. Here the tree is balanced. Search for 70 and count the comparisons.' },
      { example: 'balanced', prompt: 'Delete 20, then 40: which node goes out of balance, and why?' },
    ],
  },
});

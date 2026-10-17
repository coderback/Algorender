import { defineStructure, type OperationSpec } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Checkpoint } from '@/engine/types';
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
  rightmost,
  searchOperation,
  sideQuestion,
  sideWord,
  size,
  storedKeyArg,
  type BinNode,
  type BinTree,
  type Side,
} from './binary';
import { COMPARISONS, keyArg, plural, seededKeys } from './shared';

type Bst = BinTree<BinNode>;
type Op = OperationSpec<Bst, TreeState>;

const drawing = binaryDrawing<BinNode>('binary search tree');
const STATS = ['comparisons'];
const EMPTY = 'The tree is empty';
const FULL = `The tree is full (${MAX_NODES} keys), the most this view draws clearly`;

// ───────────────────────────── insert ─────────────────────────────

const insert: Op = {
  id: 'insert',
  label: 'Insert',
  args: [keyArg('Key', 45)],
  pseudocode: [
    'insert(node, key):',
    '  if node = nil: return Node(key)',
    '  if key = node.key: return node',
    '  if key < node.key:',
    '    node.left ← insert(node.left, key)',
    '  else:',
    '    node.right ← insert(node.right, key)',
    '  return node',
  ],
  disabledReason: (tree) => (size(tree) >= MAX_NODES ? FULL : null),
  *run(model, args) {
    const key = Number(args.key);
    const t = new TreeTracer(model, drawing, STATS);
    if (model.root == null) {
      const [withNode, id] = create(model, { key, left: null, right: null });
      t.model = link(withNode, null, null, id);
      yield t.frame({ line: 1, note: `The tree is empty, so ${key} becomes the root.`, marks: { key: [id] }, vars: { key } });
      return t.model;
    }

    const path: NodeId[] = [];
    let cur: NodeId = model.root;
    for (;;) {
      const node = model.nodes[cur];
      path.push(cur);
      const vars = { key, 'node.key': node.key, depth: path.length - 1 };
      t.count('comparisons');
      yield t.frame({
        line: 2,
        note:
          path.length === 1
            ? `Start at the root and compare ${key} with ${node.key}. Smaller keys belong in the left subtree, larger ones in the right.`
            : `Compare ${key} with ${node.key}.`,
        marks: { visited: path.slice(0, -1), compare: [cur] },
        path,
        probe: { label: String(key), at: cur },
        vars,
        checkpoint: sideQuestion(key, node.key, 'Already in the tree'),
      });
      if (key === node.key) {
        yield t.frame({
          line: 2,
          note: `${key} is already in the tree. A binary search tree holds each key once, so nothing changes.`,
          marks: { visited: path.slice(0, -1), found: [cur] },
          path,
          vars,
        });
        return model;
      }

      const side: Side = key < node.key ? 'left' : 'right';
      const next = node[side];
      yield t.frame({
        line: side === 'left' ? 4 : 6,
        note: `${key} ${side === 'left' ? '<' : '>'} ${node.key}, so ${key} belongs in ${node.key}'s ${side} subtree, with the other ${sideWord(side)} keys. ${
          next == null ? `${node.key} has no ${side} child yet.` : `Go ${side} to ${model.nodes[next].key}.`
        }`,
        marks: { visited: path },
        path,
        probe: { label: String(key), at: cur },
        vars,
      });
      if (next != null) {
        cur = next;
        continue;
      }

      const [withNode, id] = create(model, { key, left: null, right: null });
      t.model = link(withNode, cur, side, id);
      path.push(id);
      yield t.frame({
        line: 1,
        note: `The walk reached an empty spot, so ${key} becomes a new leaf there: ${node.key}'s ${side} child.`,
        marks: { visited: path.slice(0, -1), key: [id] },
        path,
        vars: { key, depth: path.length - 1 },
      });
      yield t.frame({
        line: 7,
        note: `Done: ${key} sits at depth ${path.length - 1}. Inserting cost one comparison per level on the way down, so the tree's height decides how fast it is.`,
        marks: { key: [id] },
        path,
        vars: { key, depth: path.length - 1 },
      });
      return t.model;
    }
  },
};

// ───────────────────────────── delete ─────────────────────────────

const CASES = ['A leaf: just remove it', 'One child: lift the child up', 'Two children: use the successor'];

/** "Which key takes 30's place?": the successor among plausible neighbours, in ascending order. */
function successorQuestion(tree: Bst, id: NodeId, successor: number): Checkpoint {
  const n = tree.nodes[id];
  const keys = new Set([
    successor,
    tree.nodes[n.right!].key,
    tree.nodes[rightmost(tree, n.right!)].key,
    tree.nodes[rightmost(tree, n.left!)].key,
  ]);
  const choices = [...keys].sort((a, b) => a - b);
  return { question: `Which key will take ${n.key}'s place?`, choices: choices.map(String), answer: choices.indexOf(successor) };
}

const remove: Op = {
  id: 'delete',
  label: 'Delete',
  // Only keys in the tree: searching shows how a missing key is ruled out.
  args: [storedKeyArg()],
  pseudocode: [
    'delete(key):',
    '  n ← the node holding key',
    '  if n is a leaf: remove n',
    '  else if n has one child:',
    '    replace n with that child',
    '  else:',
    '    s ← leftmost node of n.right',
    '    n.key ← s.key',
    '    replace s with s.right',
  ],
  disabledReason: (tree) => (tree.root == null ? EMPTY : null),
  *run(model, args) {
    const key = Number(args.key);
    const t = new TreeTracer(model, drawing, STATS);
    const path: NodeId[] = [];
    let parent: NodeId | null = null;
    let side: Side | null = null;
    let cur = model.root;
    while (cur != null) {
      const node = model.nodes[cur];
      path.push(cur);
      const vars = { key, 'node.key': node.key };
      t.count('comparisons');
      yield t.frame({
        line: 1,
        note: path.length === 1 ? `Find ${key} first, starting at the root: compare it with ${node.key}.` : `Compare ${key} with ${node.key}.`,
        marks: { visited: path.slice(0, -1), compare: [cur] },
        path,
        probe: { label: String(key), at: cur },
        vars,
        checkpoint: sideQuestion(key, node.key, 'Found it'),
      });
      if (key === node.key) break;
      const dir: Side = key < node.key ? 'left' : 'right';
      const next = node[dir];
      yield t.frame({
        line: 1,
        note: `${key} ${dir === 'left' ? '<' : '>'} ${node.key}: if ${key} is in the tree, it is in the ${dir} subtree. ${
          next == null ? 'That subtree is empty.' : `Go ${dir} to ${model.nodes[next].key}.`
        }`,
        marks: { visited: path },
        path,
        probe: { label: String(key), at: cur },
        vars,
      });
      parent = cur;
      side = dir;
      cur = next;
    }

    if (cur == null) return model; // unreachable: the key is one of the tree's own (a choice)

    const n = model.nodes[cur];
    const above = path.slice(0, -1);
    const kids = [n.left, n.right].filter((c): c is NodeId => c != null);
    yield t.frame({
      line: 1,
      note: `Found ${key}. How to remove it depends on how many children it has, because those subtrees must stay attached in order.`,
      marks: { visited: above, reject: [cur] },
      path,
      vars: { key },
      checkpoint: { question: `How will ${key} be removed?`, choices: CASES, answer: kids.length },
    });

    if (kids.length === 0) {
      t.model = drop(link(model, parent, side, null), cur);
      yield t.frame({
        line: 2,
        note: `${key} is a leaf: no other key hangs below it, so it can simply be removed.`,
        marks: { visited: above },
        path: above,
        vars: { key },
      });
      return t.model;
    }

    if (kids.length === 1) {
      const child = kids[0];
      t.model = drop(link(model, parent, side, child), cur);
      const parentKey = parent == null ? null : model.nodes[parent].key;
      yield t.frame({
        line: 4,
        note: `${key} has one child, ${model.nodes[child].key}, which moves up into its place with its whole subtree. ${
          parentKey == null
            ? 'It becomes the new root.'
            : `Every key in it was already on the correct side of ${parentKey}, so the order still holds.`
        }`,
        marks: { visited: above, write: [child] },
        path: [...above, child],
        vars: { key },
      });
      return t.model;
    }

    const walk = leftmost(model, n.right!);
    const s = walk[walk.length - 1];
    const sNode = model.nodes[s];
    yield t.frame({
      line: 5,
      note: `${key} has two children, so removing its node would leave two subtrees and only one slot. Instead, give the node another key that keeps everything in order: the next larger key.`,
      marks: { visited: above, reject: [cur] },
      path,
      vars: { key },
      checkpoint: successorQuestion(model, cur, sNode.key),
    });
    yield t.frame({
      line: 6,
      note:
        walk.length === 1
          ? `Go right once, to ${sNode.key}. It has no left child, so it is the smallest key in ${key}'s right subtree: the in-order successor.`
          : `Go right once, to ${model.nodes[walk[0]].key}, then left as far as possible, to ${sNode.key}: the smallest key in ${key}'s right subtree, called the in-order successor.`,
      marks: { visited: [...above, ...walk.slice(0, -1)], reject: [cur], min: [s] },
      path: [...path, ...walk],
      vars: { key, successor: sNode.key },
    });

    t.model = put(model, cur, { ...n, key: sNode.key });
    yield t.frame({
      line: 7,
      note: `Copy ${sNode.key} into ${key}'s node, replacing ${key}. Everything on its left is smaller than ${key}, so smaller than ${sNode.key}, and ${sNode.key} was the smallest key on its right.`,
      marks: { write: [cur], min: [s] },
      path: [...path, ...walk],
      vars: { key, successor: sNode.key },
    });

    const sParent = walk.length === 1 ? cur : walk[walk.length - 2];
    const sSide: Side = walk.length === 1 ? 'right' : 'left';
    t.model = drop(link(t.model, sParent, sSide, sNode.right), s);
    yield t.frame({
      line: 8,
      note:
        sNode.right == null
          ? `Now remove the old ${sNode.key} node. It was a leaf, so nothing else moves.`
          : `Now remove the old ${sNode.key} node. It had no left child, so its right child, ${model.nodes[sNode.right].key}, moves up into its place.`,
      marks: { write: [cur, sNode.right] },
      path,
      vars: { key, successor: sNode.key },
    });
    return t.model;
  },
};

// ──────────────────────────── traversals ───────────────────────────

type Order = 'inorder' | 'preorder' | 'postorder';
type Step = { kind: 'left' | 'right' | 'visit'; at: NodeId; stack: NodeId[] };

const ORDER_CODE: Record<Order, { code: readonly string[]; left: number; right: number; visit: number }> = {
  inorder: {
    code: ['inorder(node):', '  if node = nil: return', '  inorder(node.left)', '  visit(node)', '  inorder(node.right)'],
    left: 2,
    visit: 3,
    right: 4,
  },
  preorder: {
    code: ['preorder(node):', '  if node = nil: return', '  visit(node)', '  preorder(node.left)', '  preorder(node.right)'],
    visit: 2,
    left: 3,
    right: 4,
  },
  postorder: {
    code: ['postorder(node):', '  if node = nil: return', '  postorder(node.left)', '  postorder(node.right)', '  visit(node)'],
    left: 2,
    right: 3,
    visit: 4,
  },
};

/** The recursion as a list of steps: descend left, descend right, or visit. */
function steps(tree: Bst, order: Order): Step[] {
  const out: Step[] = [];
  const rec = (id: NodeId, stack: NodeId[]) => {
    const n = tree.nodes[id];
    const here = [...stack, id];
    if (order === 'preorder') out.push({ kind: 'visit', at: id, stack: here });
    if (n.left) {
      out.push({ kind: 'left', at: n.left, stack: [...here, n.left] });
      rec(n.left, here);
    }
    if (order === 'inorder') out.push({ kind: 'visit', at: id, stack: here });
    if (n.right) {
      out.push({ kind: 'right', at: n.right, stack: [...here, n.right] });
      rec(n.right, here);
    }
    if (order === 'postorder') out.push({ kind: 'visit', at: id, stack: here });
  };
  if (tree.root) rec(tree.root, []);
  return out;
}

/** "Which key is visited next?" among the right one and the likeliest confusions, in ascending order. */
function nextVisitQuestion(correct: number, distractors: readonly number[]): Checkpoint | undefined {
  const keys = [...new Set([correct, ...distractors])].sort((a, b) => a - b);
  if (keys.length < 2) return undefined;
  return { question: 'Which key is visited next?', choices: keys.map(String), answer: keys.indexOf(correct) };
}

function traversal(order: Order, label: string, summary: string): Op {
  const spec = ORDER_CODE[order];
  return {
    id: order,
    label,
    args: [],
    pseudocode: spec.code,
    disabledReason: (tree) => (tree.root == null ? EMPTY : null),
    *run(model) {
      const t = new TreeTracer(model, drawing, STATS);
      const key = (id: NodeId) => model.nodes[id].key;
      const all = steps(model, order);
      const visits = all.filter((s) => s.kind === 'visit').map((s) => s.at);
      const visited: NodeId[] = [];
      const output = () => ({ label: 'Visited', items: visited.map((id) => String(key(id))) });

      for (let i = 0; i < all.length; i++) {
        const step = all[i];
        const n = model.nodes[step.at];
        const k = n.key;
        if (step.kind === 'visit') visited.push(step.at);
        const parentKey = step.stack.length > 1 ? key(step.stack[step.stack.length - 2]) : null;

        let note: string;
        if (step.kind === 'visit') {
          note =
            order === 'preorder'
              ? `Visit ${k} as soon as the walk reaches it: pre-order puts a node before both of its subtrees.`
              : order === 'inorder'
                ? `Visit ${k}: ${n.left ? `its left subtree is finished` : 'it has no left subtree'}, and in-order puts a node between its two subtrees.`
                : `Visit ${k}: ${n.left || n.right ? 'everything below it is finished' : 'it is a leaf'}, and post-order puts a node after both of its subtrees.`;
        } else if (step.kind === 'left') {
          note =
            order === 'preorder'
              ? `${parentKey} is visited, so traverse its left subtree next: go left to ${k}.`
              : order === 'inorder'
                ? `In-order finishes ${parentKey}'s left subtree before ${parentKey} itself: go left to ${k}.`
                : `Post-order finishes both of ${parentKey}'s subtrees before ${parentKey}: go left to ${k}.`;
        } else {
          const leftDone = model.nodes[step.stack[step.stack.length - 2]].left != null;
          note =
            order === 'inorder'
              ? `${parentKey} is visited, so traverse its right subtree: go right to ${k}.`
              : `${parentKey}'s left subtree is ${leftDone ? 'finished' : 'empty'}, so traverse its right subtree: go right to ${k}.`;
        }

        // Ask before each visit (except the very first step, which has no frame before it).
        const next = all[i + 1];
        let checkpoint: Checkpoint | undefined;
        if (next?.kind === 'visit') {
          const done = new Set(visited);
          const after = visits[visited.length + 1];
          const options = [step.at, after].filter((id): id is NodeId => id != null && !done.has(id) && id !== next.at).map(key);
          checkpoint = nextVisitQuestion(key(next.at), options);
        }

        yield t.frame({
          line: step.kind === 'visit' ? spec.visit : step.kind === 'left' ? spec.left : spec.right,
          note,
          marks: {
            frontier: step.stack.slice(0, -1).filter((id) => !visited.includes(id)),
            visited: visited.filter((id) => id !== step.at),
            key: [step.at],
          },
          path: step.stack,
          output: output(),
          vars: { node: k, 'call stack': step.stack.map(key).join(' → ') },
          ...(checkpoint && { checkpoint }),
        });
      }

      yield t.frame({
        line: 0,
        note: `${label} visited all ${plural(visits.length, 'key')}: ${visits.map(key).join(', ')}. ${summary}`,
        marks: { visited },
        output: output(),
        vars: {},
      });
      return model;
    },
  };
}

const levelOrder: Op = {
  id: 'levelorder',
  label: 'Level order',
  args: [],
  pseudocode: ['levelOrder():', '  queue ← [root]', '  while queue is not empty:', '    node ← dequeue()', '    visit(node)', '    enqueue its non-nil children'],
  disabledReason: (tree) => (tree.root == null ? EMPTY : null),
  *run(model) {
    const t = new TreeTracer(model, drawing, STATS);
    const key = (id: NodeId) => model.nodes[id].key;
    const queue: NodeId[] = [model.root!];
    const visited: NodeId[] = [];
    const output = () => ({ label: 'Visited', items: visited.map((id) => String(key(id))) });
    const vars = () => ({ queue: queue.map(key).join(', ') || 'empty' });
    const ask = (): Checkpoint | undefined =>
      nextVisitQuestion(key(queue[0]), [queue[1], queue[queue.length - 1]].filter((id): id is NodeId => id != null).map(key));

    yield t.frame({
      line: 1,
      note: `Level order visits the tree top to bottom, left to right. A queue keeps that order: start with just the root, ${key(model.root!)}.`,
      marks: { frontier: queue },
      output: output(),
      vars: vars(),
      checkpoint: ask(),
    });
    while (queue.length) {
      const id = queue.shift()!;
      visited.push(id);
      const n = model.nodes[id];
      const kids = [n.left, n.right].filter((c): c is NodeId => c != null);
      yield t.frame({
        line: 4,
        note: `Dequeue ${key(id)} from the front of the queue and visit it.${kids.length ? '' : ' It has no children to add.'}`,
        marks: { frontier: queue, visited: visited.slice(0, -1), key: [id] },
        output: output(),
        vars: vars(),
        ...(kids.length === 0 && queue.length > 0 && { checkpoint: ask() }),
      });
      if (kids.length) {
        queue.push(...kids);
        yield t.frame({
          line: 5,
          note: `Enqueue ${kids.map(key).join(' and ')} at the back: ${kids.length === 1 ? 'it waits' : 'they wait'} behind every node already queued, which are all on the same level or the one above.`,
          marks: { frontier: queue, visited: visited.slice(0, -1), key: [id] },
          output: output(),
          vars: vars(),
          checkpoint: ask(),
        });
      }
    }
    yield t.frame({
      line: 2,
      note: `The queue is empty: every key was visited, level by level: ${visited.map(key).join(', ')}.`,
      marks: { visited },
      output: output(),
      vars: vars(),
    });
    return model;
  },
};

// ───────────────────────────── module ─────────────────────────────

const build = (keys: readonly number[]): Bst =>
  keys.reduce<Bst>((tree, key) => recordOperation(insert.run(tree, { key })).result, emptyTree<BinNode>());

export const binaryTree = defineStructure<Bst, TreeState>({
  kind: 'structure',
  slug: 'binary-tree',
  view: 'tree',
  initial: [
    { id: 'balanced', label: 'Balanced (7 keys)', make: () => build([50, 30, 70, 20, 40, 60, 80]) },
    { id: 'empty', label: 'Empty', make: () => emptyTree<BinNode>() },
    { id: 'sorted', label: 'Sorted inserts (a chain)', make: () => build([10, 20, 30, 40, 50, 60, 70]) },
    { id: 'random', label: 'Random (10 keys)', make: (seed) => build(seededKeys(seed, 10)) },
  ],
  snapshot: (tree) => treeSnapshot(drawing, tree),
  operations: [
    insert,
    remove,
    searchOperation(drawing, STATS),
    traversal('inorder', 'In-order', 'That is sorted order: each node comes after every smaller key (its left subtree) and before every larger one.'),
    traversal('preorder', 'Pre-order', 'Every node comes before its subtrees, so inserting keys in this order rebuilds exactly the same tree.'),
    traversal('postorder', 'Post-order', 'Every node comes after its subtrees, the order to free or evaluate a tree bottom-up.'),
    levelOrder,
  ],
  stats: [COMPARISONS],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'compare', label: 'Compared with the key' },
    { mark: 'visited', label: 'On the path / visited' },
    { mark: 'key', label: 'New node / current' },
    { mark: 'found', label: 'Found' },
    { mark: 'reject', label: 'Being deleted' },
    { mark: 'min', label: 'In-order successor' },
    { mark: 'write', label: 'Moved into place' },
    { mark: 'frontier', label: 'Waiting (call stack or queue)' },
  ],
  content: {
    idea: 'A binary search tree keeps every key smaller than a node in its left subtree and every larger key in its right subtree. Finding a key is one walk down from the root: compare, go left or right, repeat. Inserting walks the same path and hangs the new key where the walk falls off.',
    invariant: 'For every node, all keys in its left subtree are smaller and all keys in its right subtree are larger. That is why an in-order traversal lists the keys in sorted order.',
    whenToUse:
      'An ordered set or map: lookup plus sorted iteration, min/max and range queries. A plain BST is only as fast as it is short, and sorted inserts turn it into a chain (start from "Sorted inserts" and search for 70), so real code uses a self-balancing variant: AVL, red-black or a B-tree.',
    traits: [
      { label: 'Keeps keys in sorted order', good: true },
      { label: 'O(height) per operation', good: null },
      { label: 'Height can grow to n', good: false },
    ],
    experiments: [
      { example: 'sorted', prompt: 'Sorted inserts built a chain. Search for 70 and count the comparisons: one per key.' },
      { example: 'balanced', prompt: 'Delete the root, 50. Predict which key takes its place before you watch.' },
      { example: 'balanced', prompt: 'Run all four traversals. Which one lists the keys sorted, and why?' },
    ],
  },
});


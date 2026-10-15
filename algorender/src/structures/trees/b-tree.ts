import { defineStructure, type OperationSpec } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Checkpoint } from '@/engine/types';
import { TreeTracer, treeSnapshot, type TreeDrawing } from '@/viz/tree/tracer';
import type { NodeId, TreeNode, TreeState } from '@/viz/tree/types';
import { COMPARISONS, MERGES, SPLITS, keyArg, plural, seededKeys } from './shared';

/** A node: sorted keys, and either no children (a leaf) or exactly one more child than keys. */
export type BNode = { readonly keys: readonly number[]; readonly children: readonly NodeId[] };
/** A B-tree of order m: every node has at most m children, so at most m − 1 keys. */
export type BTree = {
  readonly order: number;
  readonly root: NodeId | null;
  readonly nodes: Readonly<Record<NodeId, BNode>>;
  readonly nextId: number;
};

type Op = OperationSpec<BTree, TreeState>;

export const MAX_KEYS_TOTAL = 30;
const STATS = ['comparisons', 'splits', 'merges'];
const EMPTY = 'The tree is empty';

export const maxKeys = (tree: BTree) => tree.order - 1;
/** Fewest keys a non-root node may hold: ⌈m / 2⌉ − 1. */
export const minKeys = (tree: BTree) => Math.ceil(tree.order / 2) - 1;
export const isLeaf = (node: BNode) => node.children.length === 0;
const cell = (key: number) => `k${key}`;
const show = (keys: readonly number[]) => `[${keys.join(', ')}]`;
const treeName = (order: number) => (order === 3 ? '2-3 tree' : order === 4 ? '2-3-4 tree' : `B-tree of order ${order}`);

function setNode(tree: BTree, id: NodeId, node: BNode): BTree {
  return { ...tree, nodes: { ...tree.nodes, [id]: node } };
}

function addNode(tree: BTree, node: BNode): [BTree, NodeId] {
  const id = `b${tree.nextId}`;
  return [{ ...tree, nextId: tree.nextId + 1, nodes: { ...tree.nodes, [id]: node } }, id];
}

function dropNode(tree: BTree, id: NodeId): BTree {
  const nodes = { ...tree.nodes };
  delete nodes[id];
  return { ...tree, nodes };
}

export function allKeys(tree: BTree): number[] {
  const out: number[] = [];
  const walk = (id: NodeId) => {
    const n = tree.nodes[id];
    n.keys.forEach((k, i) => {
      if (!isLeaf(n)) walk(n.children[i]);
      out.push(k);
    });
    if (!isLeaf(n)) walk(n.children[n.children.length - 1]);
  };
  if (tree.root) walk(tree.root);
  return out;
}

function heightOf(tree: BTree): number {
  let h = 0;
  for (let id = tree.root; id != null; id = tree.nodes[id].children[0] ?? null) h++;
  return h;
}

/** The first index whose key is ≥ `key`: where `key` is, or which child to follow. */
const branchIndex = (keys: readonly number[], key: number) => {
  const i = keys.findIndex((k) => key <= k);
  return i === -1 ? keys.length : i;
};

/** "25 > 20 and 25 < 40": the comparisons a scan of `keys` makes for `key`. */
function scanPhrase(keys: readonly number[], key: number): string {
  const i = branchIndex(keys, key);
  const parts = keys.slice(0, i).map((k) => `${key} > ${k}`);
  if (i < keys.length) parts.push(`${key} ${keys[i] === key ? '=' : '<'} ${keys[i]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

const branchName = (keys: readonly number[], i: number) =>
  i === 0 ? `Left of ${keys[0]}` : i === keys.length ? `Right of ${keys[keys.length - 1]}` : `Between ${keys[i - 1]} and ${keys[i]}`;

function branchQuestion(keys: readonly number[], key: number, here: string): Checkpoint {
  const i = branchIndex(keys, key);
  const choices = [...Array.from({ length: keys.length + 1 }, (_, j) => branchName(keys, j)), here];
  return { question: `Which way does ${key} go from ${show(keys)}?`, choices, answer: keys[i] === key ? keys.length + 1 : i };
}

const drawing: TreeDrawing<BTree> = {
  empty: 'The tree is empty. Insert a key to create the root.',
  shape: (tree) => {
    const nodes: Record<NodeId, TreeNode> = {};
    const walk = (id: NodeId) => {
      const n = tree.nodes[id];
      nodes[id] = { shape: 'box', cells: n.keys.map((k) => ({ id: cell(k), label: String(k) })), children: n.children };
      n.children.forEach(walk);
    };
    if (tree.root) walk(tree.root);
    return { root: tree.root, nodes, strip: null };
  },
  describe: (tree) => {
    const keys = allKeys(tree);
    const limits = `nodes hold 1 to ${maxKeys(tree)} keys`;
    if (keys.length === 0) return `Empty ${treeName(tree.order)}: ${limits}.`;
    return `${treeName(tree.order)[0].toUpperCase()}${treeName(tree.order).slice(1)} (${limits}) with ${plural(keys.length, 'key')} in ${plural(Object.keys(tree.nodes).length, 'node')}, height ${heightOf(tree)}, root ${show(tree.nodes[tree.root!].keys)}. In order: ${keys.join(', ')}.`;
  },
};

// ───────────────────────────── insert ─────────────────────────────

const insert: Op = {
  id: 'insert',
  label: 'Insert',
  args: [keyArg('Key', 35)],
  pseudocode: [
    'insert(key):',
    '  node ← root',
    '  loop:',
    '    if key is in node: stop (duplicate)',
    '    if node is a leaf: break',
    '    node ← child whose range holds key',
    '  add key to node, in sorted order',
    '  while node has m keys (overflow):',
    '    split around the median key',
    '    if node is the root:',
    '      median becomes a new root',
    '    else: median moves up into parent',
    '    node ← parent',
  ],
  disabledReason: (tree) =>
    allKeys(tree).length >= MAX_KEYS_TOTAL ? `The tree is full (${MAX_KEYS_TOTAL} keys), the most this view draws clearly` : null,
  *run(model, args) {
    const key = Number(args.key);
    const max = maxKeys(model);
    const t = new TreeTracer(model, drawing, STATS);
    if (model.root == null) {
      const [tree, id] = addNode(model, { keys: [key], children: [] });
      t.model = { ...tree, root: id };
      yield t.frame({
        line: 6,
        note: `The tree is empty, so ${key} starts the root: a single leaf that can hold up to ${max} keys.`,
        marks: { key: [cell(key)] },
        vars: { key, 'max keys': max },
      });
      return t.model;
    }

    const path: NodeId[] = [];
    let cur: NodeId = model.root;
    for (;;) {
      const node = model.nodes[cur];
      path.push(cur);
      const i = branchIndex(node.keys, key);
      const here = node.keys[i] === key;
      const leaf = isLeaf(node);
      const vars = { key, node: show(node.keys), 'max keys': max };
      let checkpoint: Checkpoint | undefined;
      if (!leaf) checkpoint = branchQuestion(node.keys, key, 'It is already here');
      else if (!here)
        checkpoint = {
          question: `Will ${show(node.keys)} have to split once ${key} is added?`,
          choices: ['Yes, it overflows', 'No, it has room'],
          answer: node.keys.length + 1 > max ? 0 : 1,
        };
      yield t.frame({
        line: 3,
        note:
          path.length === 1
            ? `Start at the root, ${show(node.keys)}, and find where ${key} fits among its keys.`
            : leaf
              ? `Reached the leaf ${show(node.keys)}. New keys always go into a leaf.`
              : `Look at ${show(node.keys)}.`,
        marks: { visited: path.slice(0, -1) },
        path,
        probe: { label: String(key), at: cur },
        vars,
        checkpoint,
      });
      t.count('comparisons', Math.min(i + 1, node.keys.length));
      if (here) {
        yield t.frame({
          line: 3,
          note: `${scanPhrase(node.keys, key)}: ${key} is already in the tree. A B-tree holds each key once, so nothing changes.`,
          marks: { visited: path.slice(0, -1), found: [cell(key)] },
          path,
          vars,
        });
        return model;
      }
      if (leaf) break;
      const child = node.children[i];
      yield t.frame({
        line: 5,
        note: `${scanPhrase(node.keys, key)}, so ${key} belongs in the branch ${branchName(node.keys, i).toLowerCase()}: go down to ${show(model.nodes[child].keys)}.`,
        marks: { visited: path, compare: node.keys.slice(0, i + 1).map(cell) },
        path: [...path, child],
        probe: { label: String(key), at: cur },
        vars,
      });
      cur = child;
    }

    const leafNode = model.nodes[cur];
    const leafKeys = [...leafNode.keys, key].sort((a, b) => a - b);
    t.model = setNode(model, cur, { ...leafNode, keys: leafKeys });
    const over = leafKeys.length > max;
    yield t.frame({
      line: 6,
      note: `Add ${key} to the leaf in sorted order: ${show(leafKeys)}. ${
        over
          ? `That is ${leafKeys.length} keys, one more than the ${max} a node may hold.`
          : `It holds ${leafKeys.length} of at most ${max} keys, so nothing else changes.`
      }`,
      marks: { visited: path.slice(0, -1), key: [cell(key)], ...(over && { reject: [cur] }) },
      path,
      vars: { key, keys: leafKeys.length, 'max keys': max },
    });

    let node = cur;
    let depth = path.length - 1;
    while (t.model.nodes[node].keys.length > max) {
      const n = t.model.nodes[node];
      const mid = Math.floor(n.keys.length / 2);
      const median = n.keys[mid];
      const leftKeys = n.keys.slice(0, mid);
      const rightKeys = n.keys.slice(mid + 1);
      const parentId = depth > 0 ? path[depth - 1] : null;
      const parentKeys = parentId ? t.model.nodes[parentId].keys : null;
      yield t.frame({
        line: 8,
        note: `Split ${show(n.keys)} around its median, ${median}: ${show(leftKeys)} stays, ${show(rightKeys)} becomes a new node, and ${median} moves up to sit between them.`,
        marks: { reject: [node], pivot: [cell(median)] },
        path: path.slice(0, depth + 1),
        vars: { median, 'max keys': max },
        ...(parentKeys && {
          checkpoint: {
            question: `Will ${show(parentKeys)} overflow when ${median} moves up into it?`,
            choices: ['Yes, it splits too', 'No, it has room'],
            answer: parentKeys.length + 1 > max ? 0 : 1,
          },
        }),
      });

      const [withRight, rightId] = addNode(t.model, { keys: rightKeys, children: n.children.slice(mid + 1) });
      let tree = setNode(withRight, node, { keys: leftKeys, children: n.children.slice(0, mid + 1) });
      t.count('splits');
      if (parentId == null) {
        const [withRoot, rootId] = addNode(tree, { keys: [median], children: [node, rightId] });
        t.model = { ...withRoot, root: rootId };
        yield t.frame({
          line: 10,
          note: `The root itself split, so ${median} becomes a new root above ${show(leftKeys)} and ${show(rightKeys)}. A B-tree only grows taller here, at the top, which is why every leaf stays at the same depth.`,
          marks: { pivot: [cell(median)] },
          vars: { median, height: heightOf(t.model) },
        });
        break;
      }
      const p = tree.nodes[parentId];
      const ci = p.children.indexOf(node);
      const pKeys = [...p.keys.slice(0, ci), median, ...p.keys.slice(ci)];
      tree = setNode(tree, parentId, { keys: pKeys, children: [...p.children.slice(0, ci + 1), rightId, ...p.children.slice(ci + 1)] });
      t.model = tree;
      const pOver = pKeys.length > max;
      yield t.frame({
        line: 11,
        note: `${median} moves up into the parent, between the two halves: ${show(pKeys)}. ${
          pOver
            ? `The parent now has ${pKeys.length} keys, too many, so it must split as well.`
            : `The parent has room (${pKeys.length} of ${max} keys), so the splitting stops. Every leaf is still at the same depth.`
        }`,
        marks: { pivot: [cell(median)], ...(pOver && { reject: [parentId] }) },
        path: path.slice(0, depth),
        vars: { median, 'parent keys': pKeys.length, 'max keys': max },
      });
      node = parentId;
      depth -= 1;
    }
    return t.model;
  },
};

// ───────────────────────────── search ─────────────────────────────

const search: Op = {
  id: 'search',
  label: 'Search',
  args: [keyArg('Key', 30)],
  pseudocode: [
    'search(key):',
    '  node ← root',
    '  loop:',
    '    i ← first i with key ≤ keys[i]',
    '    if keys[i] = key: return found',
    '    if node is a leaf: return missing',
    '    node ← children[i]',
  ],
  disabledReason: (tree) => (tree.root == null ? EMPTY : null),
  *run(model, args) {
    const key = Number(args.key);
    const t = new TreeTracer(model, drawing, STATS);
    const path: NodeId[] = [];
    let cur: NodeId = model.root!;
    for (;;) {
      const node = model.nodes[cur];
      path.push(cur);
      const i = branchIndex(node.keys, key);
      const vars = { key, node: show(node.keys), i };
      yield t.frame({
        line: 3,
        note:
          path.length === 1
            ? `Start at the root, ${show(node.keys)}. Its keys split the rest of the tree into ${node.keys.length + 1} ranges.`
            : `Look at ${show(node.keys)}.`,
        marks: { visited: path.slice(0, -1) },
        path,
        probe: { label: String(key), at: cur },
        vars,
        ...(!isLeaf(node) && { checkpoint: branchQuestion(node.keys, key, 'Found in this node') }),
      });
      t.count('comparisons', Math.min(i + 1, node.keys.length));
      const compared = node.keys.slice(0, i + 1).map(cell);
      if (node.keys[i] === key) {
        yield t.frame({
          line: 4,
          note: `${scanPhrase(node.keys, key)}: found it, after visiting ${plural(path.length, 'node')}. Each node holds several keys, so a B-tree stays shallow.`,
          marks: { visited: path.slice(0, -1), compare: compared.slice(0, -1), found: [cell(key)] },
          path,
          vars: { ...vars, found: true },
        });
        return model;
      }
      if (isLeaf(node)) {
        yield t.frame({
          line: 5,
          note: `${scanPhrase(node.keys, key)}, and ${show(node.keys)} is a leaf with no branch to follow, so ${key} is not in the tree.`,
          marks: { visited: path.slice(0, -1), compare: compared },
          path,
          vars: { ...vars, found: false },
        });
        return model;
      }
      const child = node.children[i];
      yield t.frame({
        line: 6,
        note: `${scanPhrase(node.keys, key)}, so if ${key} is anywhere, it is in the branch ${branchName(node.keys, i).toLowerCase()}. Go down to ${show(model.nodes[child].keys)}.`,
        marks: { visited: path, compare: compared },
        path: [...path, child],
        probe: { label: String(key), at: cur },
        vars,
      });
      cur = child;
    }
  },
};

// ───────────────────────────── delete ─────────────────────────────

const remove: Op = {
  id: 'delete',
  label: 'Delete',
  args: [keyArg('Key', 20)],
  pseudocode: [
    'delete(key):',
    '  find the node holding key',
    '  if key is not there: stop',
    '  if node is internal:',
    '    replace key with its predecessor',
    '    node ← the predecessor’s leaf',
    '  else: remove key from the leaf',
    '  while node has too few keys:',
    '    if a sibling can spare a key:',
    '      borrow it through the parent',
    '    else:',
    '      merge with a sibling, pulling',
    '      down the key between them',
    '    node ← parent',
    '  if the root has no keys: drop it',
  ],
  disabledReason: (tree) => (tree.root == null ? EMPTY : null),
  *run(model, args) {
    const key = Number(args.key);
    const min = minKeys(model);
    const t = new TreeTracer(model, drawing, STATS);
    const path: NodeId[] = [];
    let cur: NodeId = model.root!;

    // Find the key.
    for (;;) {
      const node = model.nodes[cur];
      path.push(cur);
      const i = branchIndex(node.keys, key);
      t.count('comparisons', Math.min(i + 1, node.keys.length));
      if (node.keys[i] === key) {
        yield t.frame({
          line: 1,
          note: `${scanPhrase(node.keys, key)}: found ${key} in ${isLeaf(node) ? 'the leaf' : 'the internal node'} ${show(node.keys)}.`,
          marks: { visited: path.slice(0, -1), reject: [cell(key)] },
          path,
          probe: { label: String(key), at: cur },
          vars: { key, 'min keys': min },
        });
        break;
      }
      if (isLeaf(node)) {
        yield t.frame({
          line: 2,
          note: `${scanPhrase(node.keys, key)}, and ${show(node.keys)} is a leaf: ${key} is not in the tree, so nothing changes.`,
          marks: { visited: path.slice(0, -1), compare: node.keys.slice(0, i + 1).map(cell) },
          path,
          vars: { key, found: false },
        });
        return model;
      }
      const child = node.children[i];
      yield t.frame({
        line: 1,
        note: `${path.length === 1 ? `Find ${key}, starting at the root: ` : ''}${scanPhrase(node.keys, key)}, so go down the branch ${branchName(node.keys, i).toLowerCase()}.`,
        marks: { visited: path, compare: node.keys.slice(0, i + 1).map(cell) },
        path: [...path, child],
        probe: { label: String(key), at: cur },
        vars: { key },
      });
      cur = child;
    }

    // Take the key out of a leaf: directly, or by swapping in the predecessor.
    const found = model.nodes[cur];
    if (!isLeaf(found)) {
      const i = found.keys.indexOf(key);
      const walk = [found.children[i]];
      while (!isLeaf(model.nodes[walk[walk.length - 1]])) {
        const n = model.nodes[walk[walk.length - 1]];
        walk.push(n.children[n.children.length - 1]);
      }
      const leafId = walk[walk.length - 1];
      const leaf = model.nodes[leafId];
      const pred = leaf.keys[leaf.keys.length - 1];
      let tree = setNode(model, cur, { ...found, keys: found.keys.map((k) => (k === key ? pred : k)) });
      tree = setNode(tree, leafId, { ...leaf, keys: leaf.keys.slice(0, -1) });
      t.model = tree;
      path.push(...walk);
      yield t.frame({
        line: 4,
        note: `${key} separates two children here, so it can't simply vanish. Replace it with its predecessor, ${pred}: the largest key to its left, which always sits in a leaf. ${pred} still separates the two sides correctly, and its leaf is now ${show(leaf.keys.slice(0, -1))}.`,
        marks: { visited: path.slice(0, -1), write: [cell(pred)] },
        path,
        vars: { key, predecessor: pred, 'min keys': min },
      });
      cur = leafId;
    } else {
      const keys = found.keys.filter((k) => k !== key);
      t.model = setNode(model, cur, { ...found, keys });
      if (cur === model.root && keys.length === 0) {
        t.model = { ...dropNode(t.model, cur), root: null };
        yield t.frame({ line: 14, note: `${key} was the last key, so the root is empty and the tree is now empty.`, vars: { key } });
        return t.model;
      }
      yield t.frame({
        line: 6,
        note: keys.length ? `Remove ${key} from the leaf: ${show(keys)}.` : `Remove ${key} from the leaf, which leaves it empty.`,
        marks: { visited: path.slice(0, -1) },
        path,
        vars: { key, 'min keys': min },
      });
    }

    // Fix nodes that fell below the minimum, from the leaf upwards.
    for (;;) {
      const n = t.model.nodes[cur];
      if (cur === t.model.root || n.keys.length >= min) {
        yield t.frame({
          line: 7,
          note:
            cur === t.model.root
              ? `${show(n.keys)} is the root, which may hold as few as one key, so nothing more needs fixing.`
              : `${show(n.keys)} has ${plural(n.keys.length, 'key')}, at least the minimum of ${min}, so nothing more needs fixing.`,
          marks: { visited: path.slice(0, -1) },
          path,
          vars: { keys: n.keys.length, 'min keys': min },
        });
        return t.model;
      }

      const parentId = path[path.length - 2];
      const p = t.model.nodes[parentId];
      const ci = p.children.indexOf(cur);
      const leftId = ci > 0 ? p.children[ci - 1] : null;
      const rightId = ci < p.children.length - 1 ? p.children[ci + 1] : null;
      const left = leftId ? t.model.nodes[leftId] : null;
      const right = rightId ? t.model.nodes[rightId] : null;
      const canLeft = left != null && left.keys.length > min;
      const canRight = right != null && right.keys.length > min;
      const siblings = [left && `left sibling is ${show(left.keys)}`, right && `right sibling is ${show(right.keys)}`].filter(Boolean).join(' and its ');
      yield t.frame({
        line: 7,
        note: `${n.keys.length ? `${show(n.keys)} has ${plural(n.keys.length, 'key')}` : 'The node is empty'}, fewer than the minimum of ${min}. Its ${siblings}.`,
        marks: { visited: path.slice(0, -2), reject: [cur], compare: [leftId, rightId] },
        path,
        vars: { keys: n.keys.length, 'min keys': min },
        checkpoint: {
          question: `Can a sibling spare a key for ${n.keys.length ? show(n.keys) : 'the empty node'}?`,
          choices: ['Yes: borrow one', 'No: merge'],
          answer: canLeft || canRight ? 0 : 1,
        },
      });

      if (canLeft || canRight) {
        const fromLeft = canLeft;
        const sibId = (fromLeft ? leftId : rightId)!;
        const sib = (fromLeft ? left : right)!;
        const sepIndex = fromLeft ? ci - 1 : ci;
        const sep = p.keys[sepIndex];
        const up = fromLeft ? sib.keys[sib.keys.length - 1] : sib.keys[0];
        const movedChild = isLeaf(sib) ? null : fromLeft ? sib.children[sib.children.length - 1] : sib.children[0];
        let tree = setNode(t.model, cur, {
          keys: fromLeft ? [sep, ...n.keys] : [...n.keys, sep],
          children: movedChild == null ? n.children : fromLeft ? [movedChild, ...n.children] : [...n.children, movedChild],
        });
        tree = setNode(tree, sibId, {
          keys: fromLeft ? sib.keys.slice(0, -1) : sib.keys.slice(1),
          children: movedChild == null ? sib.children : fromLeft ? sib.children.slice(0, -1) : sib.children.slice(1),
        });
        tree = setNode(tree, parentId, { ...p, keys: p.keys.map((k, j) => (j === sepIndex ? up : k)) });
        t.model = tree;
        t.count('merges');
        yield t.frame({
          line: 9,
          note: `The ${fromLeft ? 'left' : 'right'} sibling has a key to spare, so borrow it through the parent: ${sep} comes down into the short node and ${up}, the sibling's ${fromLeft ? 'largest' : 'smallest'} key, goes up to replace it. The keys stay in order${movedChild ? ', and the child beside ' + up + ' moves across with ' + sep : ''}.`,
          marks: { write: [cell(sep), cell(up)] },
          path,
          vars: { borrowed: up, 'min keys': min },
        });
        return t.model;
      }

      // Merge with a sibling (the left one when there is one).
      const mergeLeft = leftId != null;
      const keepId = mergeLeft ? leftId! : cur;
      const goneId = mergeLeft ? cur : rightId!;
      const keep = t.model.nodes[keepId];
      const gone = t.model.nodes[goneId];
      const sepIndex = mergeLeft ? ci - 1 : ci;
      const sep = p.keys[sepIndex];
      const merged: BNode = { keys: [...keep.keys, sep, ...gone.keys], children: [...keep.children, ...gone.children] };
      let tree = dropNode(setNode(t.model, keepId, merged), goneId);
      const pKeys = p.keys.filter((_, j) => j !== sepIndex);
      const pChildren = p.children.filter((c) => c !== goneId);
      tree = setNode(tree, parentId, { keys: pKeys, children: pChildren });
      t.model = tree;
      t.count('merges');
      path.pop();
      yield t.frame({
        line: 11,
        note: `${left && right ? `Neither sibling can spare a key (each has only ${min})` : `The only sibling can't spare a key (it has only ${min})`}, so merge the short node with its ${mergeLeft ? 'left' : 'right'} sibling, pulling the parent's ${sep} down between them: ${show(merged.keys)}. The parent loses a key.`,
        marks: { visited: path.slice(0, -1), write: [cell(sep)] },
        path: [...path, keepId],
        vars: { merged: show(merged.keys), 'min keys': min },
      });

      if (parentId === t.model.root && pKeys.length === 0) {
        t.model = { ...dropNode(t.model, parentId), root: keepId };
        yield t.frame({
          line: 14,
          note: `The root gave its only key to the merge and is now empty, so drop it: ${show(merged.keys)} becomes the root. The tree loses a level at the top, so every leaf stays at the same depth.`,
          vars: { height: heightOf(t.model) },
        });
        return t.model;
      }
      cur = parentId;
    }
  },
};

// ───────────────────────────── module ─────────────────────────────

const emptyB = (order: number): BTree => ({ order, root: null, nodes: {}, nextId: 1 });

const build = (order: number, keys: readonly number[]): BTree =>
  keys.reduce<BTree>((tree, key) => recordOperation(insert.run(tree, { key })).result, emptyB(order));

const SAMPLE = [50, 20, 80, 10, 30, 60, 90, 40, 70, 25, 35];

export const bTree = defineStructure<BTree, TreeState>({
  kind: 'structure',
  slug: 'b-tree',
  view: 'tree',
  initial: [
    { id: '234', label: '2-3-4 tree (order 4)', make: () => build(4, SAMPLE) },
    { id: '23', label: '2-3 tree (order 3)', make: () => build(3, SAMPLE) },
    { id: 'order-5', label: 'Order 5 (up to 4 keys)', make: () => build(5, [...SAMPLE, 5, 15, 45, 55, 65, 75, 85, 95]) },
    { id: 'empty', label: 'Empty 2-3-4 tree', make: () => emptyB(4) },
    { id: 'sorted', label: 'Sorted inserts 5–60', make: () => build(4, Array.from({ length: 12 }, (_, i) => (i + 1) * 5)) },
    { id: 'random', label: 'Random 2-3-4 tree (14 keys)', make: (seed) => build(4, seededKeys(seed, 14)) },
  ],
  snapshot: (tree) => treeSnapshot(drawing, tree),
  operations: [insert, search, remove],
  stats: [COMPARISONS, SPLITS, MERGES],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'compare', label: 'Compared (key or sibling)' },
    { mark: 'visited', label: 'On the path' },
    { mark: 'key', label: 'Key being inserted' },
    { mark: 'reject', label: 'Too many / too few keys, or deleted' },
    { mark: 'pivot', label: 'Median: moves up' },
    { mark: 'write', label: 'Key moved' },
    { mark: 'found', label: 'Found' },
  ],
  content: {
    idea: 'A B-tree node holds several sorted keys, and the keys split the node’s children into ranges, so one node visit narrows the search many ways at once. A new key goes into a leaf; a leaf that overflows splits in two and pushes its median key up, which can ripple to the root. The tree only grows taller when the root splits.',
    invariant: 'Every node except the root holds between ⌈m/2⌉ − 1 and m − 1 keys (the root at least 1), keys are sorted inside each node and between its children, and every leaf is at the same depth.',
    whenToUse:
      'Databases and file systems (B+-trees): a node is sized to fill one disk page, so a lookup among millions of keys reads only 3–4 pages. In memory, a 2-3-4 tree is the idea behind red-black trees. Start from "Sorted inserts" and insert 65: splits ripple up, yet the leaves stay level.',
    traits: [
      { label: 'O(log n), very shallow', good: true },
      { label: 'All leaves at the same depth', good: true },
      { label: 'Split and merge logic is intricate', good: false },
    ],
    experiments: [
      { example: '234', prompt: 'Insert 33, then 36, then 38: predict which insert makes a node split, and where the median goes.' },
      { example: '23', prompt: 'The same keys in a 2-3 tree: more, smaller nodes and a taller tree. Compare the heights.' },
      { example: '234', prompt: 'Delete 10, then 20: watch a borrow first, then a merge.' },
    ],
  },
});

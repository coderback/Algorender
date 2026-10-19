// A B+ tree: the index structure behind most databases and file systems.
//
// Every key, with its value (a row, a disk address), lives in a leaf; the
// leaves are linked left to right, so a range scan finds its first key once
// and then walks along the leaves. Internal nodes hold only separator keys,
// copies that steer a search: a key equal to a separator, or bigger, lives
// to its right. A node of order m holds at most m − 1 keys; every node but
// the root stays at least half full, and every leaf sits at the same depth,
// so a lookup reads one page per level and a tree of order 100 or more
// indexes millions of keys in three or four page reads.
//
// The system-design canvas (phase 6d) reuses this as a database index: build
// one with `createBPlusTree`, change it with `bptInsert`/`bptDelete`, and
// read it with `bptSearch` (value and page reads) and `bptRange` (entries,
// page reads and leaves read). The visualiser narrates the same operations
// step by step through `insertSteps`, `deleteSteps`, `searchSteps` and
// `rangeSteps`, each of which lists what happened together with the tree
// after it, so the narration can never disagree with the model. Every
// function returns new trees and never changes the one it was given.

export type PageId = string;

export type LeafPage<V> = {
  kind: 'leaf';
  keys: readonly number[];
  /** Parallel to `keys`. */
  values: readonly V[];
  /** The next leaf to the right, or null for the last one. */
  next: PageId | null;
};

/** Separator keys and one more child than keys: children[i] holds keys in [keys[i − 1], keys[i]). */
export type InternalPage = { kind: 'internal'; keys: readonly number[]; children: readonly PageId[] };

export type Page<V> = LeafPage<V> | InternalPage;

export type BPlusTree<V = number> = {
  /** The most children an internal node may have; every node holds at most order − 1 keys. */
  order: number;
  root: PageId | null;
  pages: Readonly<Record<PageId, Page<V>>>;
  nextId: number;
  /** How many keys are stored. */
  size: number;
};

export const MIN_ORDER = 3;
export const MAX_ORDER = 8;

export function createBPlusTree<V = number>(order: number): BPlusTree<V> {
  if (!Number.isInteger(order) || order < MIN_ORDER || order > MAX_ORDER) throw new Error(`A B+ tree needs an order from ${MIN_ORDER} to ${MAX_ORDER}`);
  return { order, root: null, pages: {}, nextId: 1, size: 0 };
}

/** The most keys any node holds. */
export const maxKeys = (order: number) => order - 1;
/** The fewest keys a leaf other than the root may hold: ⌈(m − 1) / 2⌉. */
export const minLeafKeys = (order: number) => Math.ceil((order - 1) / 2);
/** The fewest children an internal node other than the root may have: ⌈m / 2⌉. */
export const minChildren = (order: number) => Math.ceil(order / 2);

/** Which child a search for `key` follows: the number of separators ≤ key (equal keys go right). */
export function childIndex(keys: readonly number[], key: number): number {
  let i = 0;
  while (i < keys.length && keys[i] <= key) i++;
  return i;
}

const lowerBound = (keys: readonly number[], key: number) => {
  let i = 0;
  while (i < keys.length && keys[i] < key) i++;
  return i;
};

function setPage<V>(tree: BPlusTree<V>, id: PageId, page: Page<V>): BPlusTree<V> {
  return { ...tree, pages: { ...tree.pages, [id]: page } };
}

function addPage<V>(tree: BPlusTree<V>, page: Page<V>): [BPlusTree<V>, PageId] {
  const id = `p${tree.nextId}`;
  return [{ ...tree, nextId: tree.nextId + 1, pages: { ...tree.pages, [id]: page } }, id];
}

function dropPage<V>(tree: BPlusTree<V>, id: PageId): BPlusTree<V> {
  const pages = { ...tree.pages };
  delete pages[id];
  return { ...tree, pages };
}

const insertAt = <T>(xs: readonly T[], i: number, x: T): T[] => [...xs.slice(0, i), x, ...xs.slice(i)];
const removeAt = <T>(xs: readonly T[], i: number): T[] => [...xs.slice(0, i), ...xs.slice(i + 1)];

/** How many levels the tree has (0 when empty, 1 when the root is a leaf). */
export function height(tree: BPlusTree<unknown>): number {
  let h = 0;
  for (let id = tree.root; id != null; ) {
    h++;
    const p: Page<unknown> = tree.pages[id];
    id = p.kind === 'leaf' ? null : p.children[0];
  }
  return h;
}

/** The leftmost leaf, where a full scan starts. */
export function firstLeaf(tree: BPlusTree<unknown>): PageId | null {
  let id = tree.root;
  while (id != null) {
    const p: Page<unknown> = tree.pages[id];
    if (p.kind === 'leaf') return id;
    id = p.children[0];
  }
  return null;
}

/** The leaves in chain order, following the links from the leftmost one. */
export function leafChain(tree: BPlusTree<unknown>): PageId[] {
  const out: PageId[] = [];
  for (let id = firstLeaf(tree); id != null; id = (tree.pages[id] as LeafPage<unknown>).next) out.push(id);
  return out;
}

/** Every (key, value) in key order, read along the leaf chain. */
export function entries<V>(tree: BPlusTree<V>): [number, V][] {
  return leafChain(tree).flatMap((id) => {
    const leaf = tree.pages[id] as LeafPage<V>;
    return leaf.keys.map((k, i): [number, V] => [k, leaf.values[i]]);
  });
}

export const keysOf = (tree: BPlusTree<unknown>) => entries(tree).map(([k]) => k);

/** The internal page ids from the root down, in level order. */
export function internalPages(tree: BPlusTree<unknown>): PageId[] {
  const out: PageId[] = [];
  const queue = tree.root == null ? [] : [tree.root];
  while (queue.length) {
    const id = queue.shift()!;
    const p = tree.pages[id];
    if (p.kind === 'internal') {
      out.push(id);
      queue.push(...p.children);
    }
  }
  return out;
}

// ───────────────────────────── steps ─────────────────────────────

/** A step of an operation and the tree right after it. */
export type Step<V> = { tree: BPlusTree<V> } & (
  /** Read a page on the way down: an internal page (following children[index]) or the leaf. */
  | { kind: 'read'; page: PageId; index?: number; child?: PageId }
  /** The tree was empty: the key starts a root leaf. */
  | { kind: 'create'; page: PageId }
  /** The key was already stored: its value is replaced and nothing moves. */
  | { kind: 'update'; page: PageId }
  /** The key went into its leaf; `overflow` when the leaf now holds too many keys. */
  | { kind: 'add'; page: PageId; overflow: boolean }
  /**
   * An overflowing node split in two. A leaf split copies the right half's
   * first key up (it stays in the leaf); an internal split moves its middle
   * key up. `parent` is the node the separator went into: a new root when
   * `newRoot`, and `parentOverflow` when the parent now holds too many keys.
   */
  | { kind: 'split'; level: 'leaf' | 'internal'; page: PageId; right: PageId; separator: number; parent: PageId; newRoot: boolean; parentOverflow: boolean }
  /** The key was in its leaf and is gone; `underflow` when the leaf is now too small. `stays` names the separator copy of it that remains above. */
  | { kind: 'remove'; page: PageId; underflow: boolean; stays: number | null }
  /** The key isn't stored (`page` is the leaf it would be in, null in an empty tree). */
  | { kind: 'missing'; page: PageId | null }
  /** The key was found in this leaf. */
  | { kind: 'found'; page: PageId; value: V }
  /** The last key went, so the tree is empty. */
  | { kind: 'emptied' }
  /**
   * A short node took one entry from a sibling under the same parent. A leaf
   * takes a key; an internal node takes a child, with the parent's separator
   * coming down and the sibling's end key going up. `separator` is the
   * parent's separator before and after.
   */
  | { kind: 'borrow'; level: 'leaf' | 'internal'; page: PageId; sibling: PageId; side: 'left' | 'right'; moved: number; separator: { from: number; to: number }; parent: PageId }
  /**
   * A short node merged with a sibling into `keep` (the left one), and `gone`
   * was dropped. The separator between them leaves the parent: dropped for
   * leaves, pulled down into the merged node for internal nodes.
   */
  | { kind: 'merge'; level: 'leaf' | 'internal'; page: PageId; keep: PageId; gone: PageId; side: 'left' | 'right'; separator: number; parent: PageId; parentUnderflow: boolean }
  /** The root was left with one child, which becomes the root: the tree is a level shorter. */
  | { kind: 'shrink'; root: PageId }
  /** A range scan read a leaf, kept `taken`, and stopped (`stop`) or went on along the link. */
  | { kind: 'scan'; page: PageId; taken: readonly number[]; stop: boolean }
);

/** The reads from the root down to the leaf where `key` is, or would be. */
function descend<V>(tree: BPlusTree<V>, key: number): { path: PageId[]; steps: Step<V>[] } {
  const path: PageId[] = [];
  const steps: Step<V>[] = [];
  let cur = tree.root;
  while (cur != null) {
    const page: Page<V> = tree.pages[cur];
    path.push(cur);
    if (page.kind === 'leaf') {
      steps.push({ kind: 'read', page: cur, tree });
      break;
    }
    const index = childIndex(page.keys, key);
    steps.push({ kind: 'read', page: cur, index, child: page.children[index], tree });
    cur = page.children[index];
  }
  return { path, steps };
}

/** Insert (or update) `key`, step by step. The last step's tree is the result. */
export function insertSteps<V>(tree: BPlusTree<V>, key: number, value: V): Step<V>[] {
  if (tree.root == null) {
    const [t, id] = addPage<V>(tree, { kind: 'leaf', keys: [key], values: [value], next: null });
    return [{ kind: 'create', page: id, tree: { ...t, root: id, size: 1 } }];
  }
  const { path, steps } = descend(tree, key);
  const leafId = path[path.length - 1];
  const leaf = tree.pages[leafId] as LeafPage<V>;
  const at = leaf.keys.indexOf(key);
  if (at >= 0) {
    const t = setPage(tree, leafId, { ...leaf, values: leaf.values.map((v, i) => (i === at ? value : v)) });
    steps.push({ kind: 'update', page: leafId, tree: t });
    return steps;
  }
  const pos = lowerBound(leaf.keys, key);
  const max = maxKeys(tree.order);
  let t: BPlusTree<V> = { ...setPage(tree, leafId, { ...leaf, keys: insertAt(leaf.keys, pos, key), values: insertAt(leaf.values, pos, value) }), size: tree.size + 1 };
  steps.push({ kind: 'add', page: leafId, overflow: leaf.keys.length + 1 > max, tree: t });

  let node = leafId;
  let depth = path.length - 1;
  while (t.pages[node].keys.length > max) {
    const page = t.pages[node];
    let separator: number;
    let right: PageId;
    if (page.kind === 'leaf') {
      const mid = Math.floor(page.keys.length / 2);
      separator = page.keys[mid];
      [t, right] = addPage<V>(t, { kind: 'leaf', keys: page.keys.slice(mid), values: page.values.slice(mid), next: page.next });
      t = setPage(t, node, { kind: 'leaf', keys: page.keys.slice(0, mid), values: page.values.slice(0, mid), next: right });
    } else {
      const mid = Math.floor(page.keys.length / 2);
      separator = page.keys[mid];
      [t, right] = addPage<V>(t, { kind: 'internal', keys: page.keys.slice(mid + 1), children: page.children.slice(mid + 1) });
      t = setPage(t, node, { kind: 'internal', keys: page.keys.slice(0, mid), children: page.children.slice(0, mid + 1) });
    }
    const level = page.kind;
    if (depth === 0) {
      let root: PageId;
      [t, root] = addPage<V>(t, { kind: 'internal', keys: [separator], children: [node, right] });
      t = { ...t, root };
      steps.push({ kind: 'split', level, page: node, right, separator, parent: root, newRoot: true, parentOverflow: false, tree: t });
      break;
    }
    const parentId = path[depth - 1];
    const parent = t.pages[parentId] as InternalPage;
    const ci = parent.children.indexOf(node);
    const keys = insertAt(parent.keys, ci, separator);
    t = setPage(t, parentId, { kind: 'internal', keys, children: insertAt(parent.children, ci + 1, right) });
    steps.push({ kind: 'split', level, page: node, right, separator, parent: parentId, newRoot: false, parentOverflow: keys.length > max, tree: t });
    node = parentId;
    depth -= 1;
  }
  return steps;
}

/** Whether a node other than the root is below its minimum. */
function short<V>(tree: BPlusTree<V>, id: PageId): boolean {
  const p = tree.pages[id];
  return p.kind === 'leaf' ? p.keys.length < minLeafKeys(tree.order) : p.children.length < minChildren(tree.order);
}

/** Whether a sibling can give one entry away and stay at or above its minimum. */
function canSpare<V>(tree: BPlusTree<V>, id: PageId | null): boolean {
  if (id == null) return false;
  const p = tree.pages[id];
  return p.kind === 'leaf' ? p.keys.length > minLeafKeys(tree.order) : p.children.length > minChildren(tree.order);
}

/** Delete `key`, step by step (a missing key ends with a `missing` step). The last step's tree is the result. */
export function deleteSteps<V>(tree: BPlusTree<V>, key: number): Step<V>[] {
  if (tree.root == null) return [{ kind: 'missing', page: null, tree }];
  const { path, steps } = descend(tree, key);
  const leafId = path[path.length - 1];
  const leaf = tree.pages[leafId] as LeafPage<V>;
  const at = leaf.keys.indexOf(key);
  if (at < 0) {
    steps.push({ kind: 'missing', page: leafId, tree });
    return steps;
  }
  let t: BPlusTree<V> = { ...setPage(tree, leafId, { ...leaf, keys: removeAt(leaf.keys, at), values: removeAt(leaf.values, at) }), size: tree.size - 1 };
  if (leafId === tree.root && leaf.keys.length === 1) {
    t = { ...dropPage(t, leafId), root: null };
    steps.push({ kind: 'emptied', tree: t });
    return steps;
  }
  const stays = path.slice(0, -1).some((id) => tree.pages[id].keys.includes(key)) ? key : null;
  const underflow = leafId !== tree.root && short(t, leafId);
  steps.push({ kind: 'remove', page: leafId, underflow, stays, tree: t });
  if (!underflow) return steps;

  let node = leafId;
  let depth = path.length - 1;
  for (;;) {
    const parentId = path[depth - 1];
    const parent = t.pages[parentId] as InternalPage;
    const ci = parent.children.indexOf(node);
    const leftId = ci > 0 ? parent.children[ci - 1] : null;
    const rightId = ci < parent.children.length - 1 ? parent.children[ci + 1] : null;
    const page = t.pages[node];

    if (canSpare(t, leftId) || canSpare(t, rightId)) {
      const side = canSpare(t, leftId) ? 'left' : 'right';
      const sibId = (side === 'left' ? leftId : rightId)!;
      const sib = t.pages[sibId];
      const sepIndex = side === 'left' ? ci - 1 : ci;
      const from = parent.keys[sepIndex];
      let moved: number;
      let to: number;
      if (page.kind === 'leaf' && sib.kind === 'leaf') {
        if (side === 'left') {
          moved = sib.keys[sib.keys.length - 1];
          const v = sib.values[sib.values.length - 1];
          t = setPage(t, node, { ...page, keys: [moved, ...page.keys], values: [v, ...page.values] });
          t = setPage(t, sibId, { ...sib, keys: sib.keys.slice(0, -1), values: sib.values.slice(0, -1) });
          to = moved;
        } else {
          moved = sib.keys[0];
          t = setPage(t, node, { ...page, keys: [...page.keys, moved], values: [...page.values, sib.values[0]] });
          t = setPage(t, sibId, { ...sib, keys: sib.keys.slice(1), values: sib.values.slice(1) });
          to = sib.keys[1];
        }
      } else if (page.kind === 'internal' && sib.kind === 'internal') {
        if (side === 'left') {
          moved = sib.keys[sib.keys.length - 1];
          t = setPage(t, node, { kind: 'internal', keys: [from, ...page.keys], children: [sib.children[sib.children.length - 1], ...page.children] });
          t = setPage(t, sibId, { kind: 'internal', keys: sib.keys.slice(0, -1), children: sib.children.slice(0, -1) });
        } else {
          moved = sib.keys[0];
          t = setPage(t, node, { kind: 'internal', keys: [...page.keys, from], children: [...page.children, sib.children[0]] });
          t = setPage(t, sibId, { kind: 'internal', keys: sib.keys.slice(1), children: sib.children.slice(1) });
        }
        to = moved;
      } else throw new Error('Siblings at different levels');
      t = setPage(t, parentId, { ...parent, keys: parent.keys.map((k, j) => (j === sepIndex ? to : k)) });
      steps.push({ kind: 'borrow', level: page.kind, page: node, sibling: sibId, side, moved, separator: { from, to }, parent: parentId, tree: t });
      return steps;
    }

    // Merge with the left sibling if there is one, else with the right one.
    const side = leftId != null ? 'left' : 'right';
    const keep = side === 'left' ? leftId! : node;
    const gone = side === 'left' ? node : rightId!;
    const sepIndex = side === 'left' ? ci - 1 : ci;
    const separator = parent.keys[sepIndex];
    const a = t.pages[keep];
    const b = t.pages[gone];
    if (a.kind === 'leaf' && b.kind === 'leaf') {
      t = setPage(t, keep, { kind: 'leaf', keys: [...a.keys, ...b.keys], values: [...a.values, ...b.values], next: b.next });
    } else if (a.kind === 'internal' && b.kind === 'internal') {
      t = setPage(t, keep, { kind: 'internal', keys: [...a.keys, separator, ...b.keys], children: [...a.children, ...b.children] });
    } else throw new Error('Siblings at different levels');
    t = dropPage(t, gone);
    const pKeys = removeAt(parent.keys, sepIndex);
    t = setPage(t, parentId, { kind: 'internal', keys: pKeys, children: parent.children.filter((c) => c !== gone) });
    const parentIsRoot = parentId === t.root;
    const parentUnderflow = parentIsRoot ? pKeys.length === 0 : short(t, parentId);
    steps.push({ kind: 'merge', level: page.kind, page: node, keep, gone, side, separator, parent: parentId, parentUnderflow, tree: t });
    if (parentIsRoot) {
      if (pKeys.length === 0) {
        t = { ...dropPage(t, parentId), root: keep };
        steps.push({ kind: 'shrink', root: keep, tree: t });
      }
      return steps;
    }
    if (!parentUnderflow) return steps;
    node = parentId;
    depth -= 1;
  }
}

/** Look `key` up, step by step: the reads down to its leaf, then `found` or `missing`. */
export function searchSteps<V>(tree: BPlusTree<V>, key: number): Step<V>[] {
  if (tree.root == null) return [{ kind: 'missing', page: null, tree }];
  const { path, steps } = descend(tree, key);
  const leafId = path[path.length - 1];
  const leaf = tree.pages[leafId] as LeafPage<V>;
  const at = leaf.keys.indexOf(key);
  steps.push(at >= 0 ? { kind: 'found', page: leafId, value: leaf.values[at], tree } : { kind: 'missing', page: leafId, tree });
  return steps;
}

/**
 * Every key in [from, to], step by step: the reads down to the leaf where
 * `from` is or would be, then one `scan` per leaf along the chain, stopping at
 * the first leaf whose last key is past `to` (or at the last leaf).
 */
export function rangeSteps<V>(tree: BPlusTree<V>, from: number, to: number): Step<V>[] {
  if (tree.root == null) return [{ kind: 'missing', page: null, tree }];
  const { path, steps } = descend(tree, from);
  let id: PageId | null = path[path.length - 1];
  while (id != null) {
    const leaf = tree.pages[id] as LeafPage<V>;
    const taken = leaf.keys.filter((k) => k >= from && k <= to);
    const stop = leaf.next == null || (leaf.keys.length > 0 && leaf.keys[leaf.keys.length - 1] > to);
    steps.push({ kind: 'scan', page: id, taken, stop, tree });
    id = stop ? null : leaf.next;
  }
  return steps;
}

/** How many pages an operation's steps read: each page on the way down, and each further leaf a scan follows a link to. */
export function pagesRead(steps: readonly Step<unknown>[]): number {
  let reads = 0;
  let scans = 0;
  for (const s of steps) {
    if (s.kind === 'read') reads++;
    if (s.kind === 'scan') scans++;
  }
  // The first scanned leaf is the one the descent already read.
  return reads + Math.max(0, scans - 1);
}

const lastTree = <V>(tree: BPlusTree<V>, steps: readonly Step<V>[]) => (steps.length ? steps[steps.length - 1].tree : tree);

// ───────────────────────────── plain API ─────────────────────────────

export const bptInsert = <V>(tree: BPlusTree<V>, key: number, value: V) => lastTree(tree, insertSteps(tree, key, value));
export const bptDelete = <V>(tree: BPlusTree<V>, key: number) => lastTree(tree, deleteSteps(tree, key));

export function bptSearch<V>(tree: BPlusTree<V>, key: number): { value: V | null; pages: number } {
  const steps = searchSteps(tree, key);
  const last = steps[steps.length - 1];
  return { value: last.kind === 'found' ? last.value : null, pages: pagesRead(steps) };
}

export function bptRange<V>(tree: BPlusTree<V>, from: number, to: number): { entries: [number, V][]; pages: number; leaves: number } {
  const steps = rangeSteps(tree, from, to);
  const out: [number, V][] = [];
  let leaves = 0;
  for (const s of steps) {
    if (s.kind !== 'scan') continue;
    leaves++;
    const leaf = tree.pages[s.page] as LeafPage<V>;
    for (const k of s.taken) out.push([k, leaf.values[leaf.keys.indexOf(k)]]);
  }
  return { entries: out, pages: pagesRead(steps), leaves };
}

/** A tree holding `entries`, inserted in order. */
export function bptFrom<V>(order: number, items: readonly (readonly [number, V])[]): BPlusTree<V> {
  return items.reduce((t, [k, v]) => bptInsert(t, k, v), createBPlusTree<V>(order));
}

// ───────────────────────────── checks ─────────────────────────────

/**
 * Everything wrong with a tree, in words (empty when it is a valid B+ tree):
 * node sizes, sorted keys, separators that bound their subtrees, leaves at
 * one depth, and a leaf chain that visits every leaf left to right.
 */
export function problems(tree: BPlusTree<unknown>): string[] {
  const out: string[] = [];
  if (tree.root == null) {
    if (Object.keys(tree.pages).length) out.push('An empty tree still has pages');
    if (tree.size !== 0) out.push('An empty tree has a size');
    return out;
  }
  const max = maxKeys(tree.order);
  const leaves: PageId[] = [];
  const depths = new Set<number>();
  let seen = 0;
  const walk = (id: PageId, depth: number, lo: number, hi: number) => {
    seen++;
    const p = tree.pages[id];
    if (!p) {
      out.push(`Missing page ${id}`);
      return;
    }
    const isRoot = id === tree.root;
    if (p.keys.length > max) out.push(`${id} holds ${p.keys.length} keys, more than ${max}`);
    for (let i = 1; i < p.keys.length; i++) if (p.keys[i] <= p.keys[i - 1]) out.push(`${id}'s keys are not sorted`);
    for (const k of p.keys) if (k < lo || k >= hi) out.push(`${id}'s key ${k} is outside [${lo}, ${hi})`);
    if (p.kind === 'leaf') {
      if (p.values.length !== p.keys.length) out.push(`${id} has ${p.values.length} values for ${p.keys.length} keys`);
      if (!isRoot && p.keys.length < minLeafKeys(tree.order)) out.push(`Leaf ${id} holds too few keys`);
      if (p.keys.length === 0) out.push(`Leaf ${id} is empty`);
      leaves.push(id);
      depths.add(depth);
      return;
    }
    if (p.children.length !== p.keys.length + 1) out.push(`${id} has ${p.children.length} children for ${p.keys.length} keys`);
    if (isRoot ? p.children.length < 2 : p.children.length < minChildren(tree.order)) out.push(`${id} has too few children`);
    p.children.forEach((c, i) => walk(c, depth + 1, i === 0 ? lo : p.keys[i - 1], i === p.keys.length ? hi : p.keys[i]));
  };
  walk(tree.root, 0, -Infinity, Infinity);
  if (depths.size > 1) out.push('Leaves are at different depths');
  if (seen !== Object.keys(tree.pages).length) out.push('Some pages are unreachable');
  const chain = leafChain(tree);
  if (chain.join() !== leaves.join()) out.push('The leaf chain does not visit the leaves left to right');
  if (keysOf(tree).length !== tree.size) out.push(`Size ${tree.size} but ${keysOf(tree).length} keys`);
  return out;
}

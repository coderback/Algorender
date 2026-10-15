import { defineStructure, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import { TreeTracer, treeSnapshot, type TreeDrawing } from '@/viz/tree/tracer';
import type { NodeId, TreeNode, TreeState } from '@/viz/tree/types';

/**
 * Disjoint sets as a forest stored in two arrays: parent[i] (a root is its own
 * parent) and rank[i] (an upper bound on the height of i's tree, only
 * meaningful at roots). Elements are fixed per starting example; operations
 * only re-point parents and raise ranks.
 */
export type UnionFind = {
  readonly labels: readonly string[];
  readonly parent: readonly number[];
  readonly rank: readonly number[];
};

type Op = OperationSpec<UnionFind, TreeState>;
type F = Frame<TreeState>;
type Marks = Partial<Record<MarkKey, readonly string[]>>;

export const MAX_ELEMENTS = 10;
const STATS = ['finds', 'hops', 'repointed', 'links'];

export const nodeId = (i: number): NodeId => `u${i}`;
const parentCell = (i: number) => `p${i}`;
const rankCell = (i: number) => `r${i}`;

/** The root of x's tree, without changing anything. */
export function rootOf(m: UnionFind, x: number): number {
  let r = x;
  while (m.parent[r] !== r) r = m.parent[r];
  return r;
}

/** The sets, each in index order, ordered by their first element. */
export function setsOf(m: UnionFind): number[][] {
  const by = new Map<number, number[]>();
  m.labels.forEach((_, i) => {
    const r = rootOf(m, i);
    by.set(r, [...(by.get(r) ?? []), i]);
  });
  return [...by.values()].sort((a, b) => a[0] - b[0]);
}

/** Number of links from x up to its root. */
export function depthOf(m: UnionFind, x: number): number {
  let d = 0;
  for (let r = x; m.parent[r] !== r; r = m.parent[r]) d++;
  return d;
}

const withParent = (m: UnionFind, i: number, p: number): UnionFind => ({ ...m, parent: m.parent.map((v, k) => (k === i ? p : v)) });
const withRank = (m: UnionFind, i: number, r: number): UnionFind => ({ ...m, rank: m.rank.map((v, k) => (k === i ? r : v)) });

const drawing: TreeDrawing<UnionFind> = {
  empty: 'There are no elements.',
  shape: (m) => {
    const kids = m.labels.map((): number[] => []);
    m.parent.forEach((p, i) => p !== i && kids[p].push(i));
    const nodes: Record<NodeId, TreeNode> = {};
    m.labels.forEach((label, i) => {
      nodes[nodeId(i)] = { shape: 'round', cells: [{ id: `k${i}`, label }], children: kids[i].map(nodeId) };
    });
    const roots = m.labels.flatMap((_, i) => (m.parent[i] === i ? [nodeId(i)] : []));
    return {
      root: roots[0] ?? null,
      roots,
      nodes,
      strip: null,
      parentArrows: true,
      table: [
        { id: 'x', label: 'x', cells: m.labels.map((label, i) => ({ id: `x${i}`, label, node: nodeId(i) })) },
        { id: 'parent', label: 'parent[x]', cells: m.labels.map((_, i) => ({ id: parentCell(i), label: m.labels[m.parent[i]] })) },
        { id: 'rank', label: 'rank[x]', cells: m.labels.map((_, i) => ({ id: rankCell(i), label: String(m.rank[i]) })) },
      ],
    };
  },
  describe: (m) => {
    const sets = setsOf(m);
    const show = (set: number[]) => `{${set.map((i) => m.labels[i]).join(', ')}}`;
    return `Union-find over ${m.labels.length} elements in ${sets.length} ${sets.length === 1 ? 'set' : 'sets'}: ${sets.map(show).join(', ')}. Each element points at its parent; a root points at itself and names its set.`;
  },
};

// ───────────────────────────── find ─────────────────────────────

/** Where find's lines sit in an operation's pseudo-code. */
type FindLines = { start: number; climb: number; write: number; done: number };

const findCode = (indent = '') => [
  `${indent}find(x):`,
  `${indent}  r ← x`,
  `${indent}  while parent[r] ≠ r: r ← parent[r]`,
  `${indent}  while parent[x] ≠ r:   (compress)`,
  `${indent}    next ← parent[x]`,
  `${indent}    parent[x] ← r;  x ← next`,
  `${indent}  return r`,
];
const findLines = (offset: number): FindLines => ({ start: offset + 1, climb: offset + 2, write: offset + 5, done: offset + 6 });

/** Up to three plausible roots, in index order: the right one, x's parent, and the nearest other roots. */
function rootQuestion(m: UnionFind, x: number, root: number): Checkpoint {
  const roots = m.labels.map((_, i) => i).filter((i) => m.parent[i] === i && i !== root);
  roots.sort((a, b) => Math.abs(a - root) - Math.abs(b - root) || a - b);
  const pool = [root, ...(m.parent[x] !== root ? [m.parent[x]] : []), ...roots, x];
  const picked = [...new Set(pool)].slice(0, 3).sort((a, b) => a - b);
  const choices = picked.map((i) => m.labels[i]);
  return { question: `Which root does find(${m.labels[x]}) reach?`, choices, answer: picked.indexOf(root) };
}

function countQuestion(answer: number): Checkpoint {
  const lo = Math.max(0, answer - 2);
  const choices = [lo, lo + 1, lo + 2, lo + 3].map(String);
  return { question: 'How many parent pointers will path compression change?', choices, answer: choices.indexOf(String(answer)) };
}

/**
 * find(x), narrated: climb parent pointers to the root, then path
 * compression re-points every element on the way straight at the root.
 * Updates the tracer's model and returns the root.
 */
function* find(t: TreeTracer<UnionFind>, x: number, L: FindLines, vars: Record<string, VarValue>): Generator<F, number> {
  const m = t.model;
  const name = (i: number) => m.labels[i];
  t.count('finds');
  const root = rootOf(m, x);
  if (root === x) {
    yield t.frame({
      line: L.climb,
      note: `find(${name(x)}): parent[${name(x)}] = ${name(x)}, so ${name(x)} is its own parent: it is the root of its set already, with nothing to climb or compress.`,
      marks: { found: [nodeId(x)] },
      vars: { ...vars, x: name(x), r: name(x) },
    });
    return root;
  }

  yield t.frame({
    line: L.start,
    note: `find(${name(x)}): start at ${name(x)} and follow parent pointers upwards until an element is its own parent. That element, the root, names the set.`,
    marks: { key: [nodeId(x)] },
    vars: { ...vars, x: name(x), r: name(x) },
    checkpoint: rootQuestion(m, x, root),
  });
  const walk = [x];
  for (let r = x; m.parent[r] !== r; ) {
    const p = m.parent[r];
    t.count('hops');
    walk.push(p);
    yield t.frame({
      line: L.climb,
      note: `parent[${name(r)}] = ${name(p)}, not ${name(r)} itself, so ${name(r)} is not a root: climb to ${name(p)}.`,
      marks: { visited: walk.slice(0, -1).map(nodeId), key: [nodeId(p)] },
      path: walk.map(nodeId).reverse(),
      vars: { ...vars, x: name(x), r: name(p) },
    });
    r = p;
  }

  // Everything below the root's own child points somewhere else first.
  const stale = walk.slice(0, -2);
  const hops = walk.length - 1;
  yield t.frame({
    line: L.climb,
    note: stale.length
      ? `parent[${name(root)}] = ${name(root)}: ${name(root)} is the root, ${hops} hops up from ${name(x)}. Now walk the same path again and point each element on it straight at ${name(root)}.`
      : `parent[${name(root)}] = ${name(root)}: ${name(root)} is the root, so find(${name(x)}) = ${name(root)}. ${name(x)} already points straight at it, so there is nothing to compress.`,
    marks: { visited: walk.slice(0, -1).map(nodeId), found: [nodeId(root)] },
    path: walk.map(nodeId).reverse(),
    vars: { ...vars, x: name(x), r: name(root) },
    ...(stale.length > 0 && { checkpoint: countQuestion(stale.length) }),
  });
  if (stale.length === 0) return root;

  const moved: number[] = [];
  for (const y of stale) {
    const old = t.model.parent[y];
    t.model = withParent(t.model, y, root);
    t.count('repointed');
    moved.push(y);
    yield t.frame({
      line: L.write,
      note: `parent[${name(y)}] was ${name(old)}; set it to ${name(root)}. ${name(y)} now hangs directly under the root, so the next find from ${name(y)} takes one hop.`,
      marks: { write: [nodeId(y), parentCell(y)], found: [nodeId(root)] },
      path: [nodeId(root), nodeId(y)],
      vars: { ...vars, x: name(y), r: name(root) },
    });
  }
  yield t.frame({
    line: L.done,
    note: `find(${name(x)}) = ${name(root)}. Path compression re-pointed ${moved.map(name).join(' and ')}: a climb that took ${hops} hops now takes 1, and everything hanging below ${moved.length === 1 ? 'it' : 'them'} moved closer to the root too.`,
    marks: { found: [nodeId(root)], visited: moved.map(nodeId) },
    vars: { ...vars, x: name(x), r: name(root) },
  });
  return root;
}

const elementArg = (name: string, label: string): ArgSpec<UnionFind> => ({ name, label, type: 'choice', options: (m) => m.labels });

/** The element an argument names. Choice arguments are checked against the model before an operation runs. */
const at = (m: UnionFind, label: unknown) => {
  const i = m.labels.indexOf(String(label));
  if (i < 0) throw new Error(`No element "${String(label)}"`);
  return i;
};

const YES_NO = ['Yes', 'No'];

// ───────────────────────────── operations ─────────────────────────────

const FIND_CODE = findCode();

const findOp: Op = {
  id: 'find',
  label: 'Find',
  args: [elementArg('x', 'Element')],
  pseudocode: FIND_CODE,
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    yield* find(t, at(model, args.x), findLines(0), {});
    return t.model;
  },
};

const UNION_CODE = [
  'union(a, b):',
  '  ra ← find(a);  rb ← find(b)',
  '  if ra = rb: stop   (already one set)',
  '  if rank[ra] < rank[rb]: swap ra, rb',
  '  parent[rb] ← ra   (link the roots)',
  '  if ranks were equal: rank[ra] += 1',
  '',
  ...findCode(),
];
const UNION_FIND_AT = 7;

const unionOp: Op = {
  id: 'union',
  label: 'Union',
  args: [elementArg('a', 'First element'), elementArg('b', 'Second element')],
  pseudocode: UNION_CODE,
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    const a = at(model, args.a);
    const b = at(model, args.b);
    const name = (i: number) => model.labels[i];
    const same = rootOf(model, a) === rootOf(model, b);
    yield t.frame({
      line: 1,
      note: `union(${name(a)}, ${name(b)}): find the root of each element, then hang one root under the other. Union by rank puts the root of lower rank underneath; on a tie, b's root goes under a's.`,
      marks: { key: [nodeId(a), nodeId(b)] },
      vars: { a: name(a), b: name(b) },
      checkpoint: { question: `Are ${name(a)} and ${name(b)} already in the same set?`, choices: YES_NO, answer: same ? 0 : 1 },
    });
    const L = findLines(UNION_FIND_AT);
    const ra = yield* find(t, a, L, { a: name(a), b: name(b) });
    const rb = yield* find(t, b, L, { a: name(a), b: name(b), ra: name(ra) });
    const vars = { a: name(a), b: name(b), ra: name(ra), rb: name(rb) };
    if (ra === rb) {
      yield t.frame({
        line: 2,
        note:
          a === b
            ? `Both arguments are ${name(a)}, and an element is always in its own set: nothing to link.`
            : `find(${name(a)}) and find(${name(b)}) both reached ${name(ra)}: already in the same set, so nothing is linked. In Kruskal's algorithm, an edge like this would close a cycle and is skipped.`,
        marks: { found: [nodeId(ra)] },
        vars,
      });
      return t.model;
    }
    const m = t.model;
    yield t.frame({
      line: 3,
      note: `Two different roots: ${name(ra)} with rank ${m.rank[ra]} and ${name(rb)} with rank ${m.rank[rb]}. One of them must go underneath the other.`,
      marks: { compare: [nodeId(ra), nodeId(rb), rankCell(ra), rankCell(rb)] },
      vars: { ...vars, 'rank[ra]': m.rank[ra], 'rank[rb]': m.rank[rb] },
      checkpoint: (() => {
        const child = m.rank[ra] < m.rank[rb] ? ra : rb;
        const picked = [ra, rb].sort((x, y) => x - y);
        return { question: 'Which root becomes the child?', choices: picked.map(name), answer: picked.indexOf(child) };
      })(),
    });
    const [top, child] = m.rank[ra] < m.rank[rb] ? [rb, ra] : [ra, rb];
    const tie = m.rank[ra] === m.rank[rb];
    t.model = withParent(m, child, top);
    t.count('links');
    yield t.frame({
      line: 4,
      note: tie
        ? `Equal ranks, so by convention b's root ${name(child)} goes under a's root ${name(top)}: parent[${name(child)}] = ${name(top)}. The two sets are now one.`
        : `rank ${m.rank[child]} < rank ${m.rank[top]}, so ${name(child)} goes under ${name(top)}: parent[${name(child)}] = ${name(top)}. Hanging the shorter tree under the taller one keeps the height as it was.`,
      marks: { write: [nodeId(child), parentCell(child)], found: [nodeId(top)] },
      path: [nodeId(top), nodeId(child)],
      vars: { ...vars, root: name(top) },
    });
    if (tie) {
      const r = m.rank[top] + 1;
      t.model = withRank(t.model, top, r);
      yield t.frame({
        line: 5,
        note: `Both trees had rank ${r - 1}, so the merged tree may be one level taller: rank[${name(top)}] becomes ${r}. Ranks only grow when equal ranks meet, so a root of rank r has at least 2^r elements below it, and no path is longer than log₂ n.`,
        marks: { write: [rankCell(top)], found: [nodeId(top)] },
        vars: { ...vars, root: name(top), 'rank[root]': r },
      });
    }
    return t.model;
  },
};

const CONNECTED_CODE = ['connected(a, b):', '  return find(a) = find(b)', '', ...findCode()];
const CONNECTED_FIND_AT = 3;

const connectedOp: Op = {
  id: 'connected',
  label: 'Connected?',
  args: [elementArg('a', 'First element'), elementArg('b', 'Second element')],
  pseudocode: CONNECTED_CODE,
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    const a = at(model, args.a);
    const b = at(model, args.b);
    const name = (i: number) => model.labels[i];
    const same = rootOf(model, a) === rootOf(model, b);
    yield t.frame({
      line: 1,
      note: `connected(${name(a)}, ${name(b)}): two elements are in the same set exactly when they reach the same root.`,
      marks: { key: [nodeId(a), nodeId(b)] },
      vars: { a: name(a), b: name(b) },
      checkpoint: { question: `Are ${name(a)} and ${name(b)} already connected?`, choices: YES_NO, answer: same ? 0 : 1 },
    });
    const L = findLines(CONNECTED_FIND_AT);
    const ra = yield* find(t, a, L, { a: name(a), b: name(b) });
    const rb = yield* find(t, b, L, { a: name(a), b: name(b), ra: name(ra) });
    const vars = { a: name(a), b: name(b), ra: name(ra), rb: name(rb), connected: ra === rb };
    const marks: Marks = ra === rb ? { found: [nodeId(ra)] } : { reject: [nodeId(ra), nodeId(rb)] };
    yield t.frame({
      line: 1,
      note:
        ra === rb
          ? `find(${name(a)}) = find(${name(b)}) = ${name(ra)}: same root, so they are connected. In Kruskal's algorithm, an edge between them would close a cycle.`
          : `find(${name(a)}) = ${name(ra)} but find(${name(b)}) = ${name(rb)}: different roots, so they are not connected (yet). In Kruskal's algorithm, an edge between them is safe to add.`,
      marks,
      vars,
    });
    return t.model;
  },
};

// ───────────────────────────── starting examples ─────────────────────────────

const DIGITS = '0123456789';

export function singletons(n: number): UnionFind {
  return { labels: [...DIGITS.slice(0, n)], parent: Array.from({ length: n }, (_, i) => i), rank: Array.from({ length: n }, () => 0) };
}

/** union(a, b) with union by rank and path compression, without recording (for building examples). */
export function unite(m: UnionFind, a: number, b: number, compress = true): UnionFind {
  let model = m;
  const findRoot = (x: number) => {
    const r = rootOf(model, x);
    let y = x;
    while (compress && y !== r && model.parent[y] !== r) {
      const next = model.parent[y];
      model = withParent(model, y, r);
      y = next;
    }
    return r;
  };
  const ra = findRoot(a);
  const rb = findRoot(b);
  if (ra === rb) return model;
  const [top, child] = model.rank[ra] < model.rank[rb] ? [rb, ra] : [ra, rb];
  model = withParent(model, child, top);
  if (model.rank[ra] === model.rank[rb]) model = withRank(model, top, model.rank[top] + 1);
  return model;
}

const unions = (m: UnionFind, pairs: readonly [number, number][]) => pairs.reduce((acc, [a, b]) => unite(acc, a, b), m);

export function randomUnions(seed: number, n = MAX_ELEMENTS, count = 6): UnionFind {
  const rng = createRng(seed);
  let m = singletons(n);
  for (let k = 0; k < count; k++) m = unite(m, Math.floor(rng() * n), Math.floor(rng() * n));
  return m;
}

export const unionFind = defineStructure<UnionFind, TreeState>({
  kind: 'structure',
  slug: 'union-find',
  view: 'tree',
  initial: [
    { id: 'singletons', label: '8 singletons', make: () => singletons(8) },
    {
      id: 'two-sets',
      label: 'Two big sets',
      make: () =>
        unions(singletons(10), [
          [0, 1],
          [2, 3],
          [0, 2],
          [0, 4],
          [5, 6],
          [7, 8],
          [5, 7],
          [5, 9],
        ]),
    },
    {
      id: 'tall',
      label: 'A tall tree (before compression)',
      make: () =>
        unions(singletons(10), [
          [0, 1],
          [2, 3],
          [4, 5],
          [6, 7],
          [0, 2],
          [4, 6],
          [0, 4],
        ]),
    },
    { id: 'random', label: 'Random unions', make: (seed) => randomUnions(seed) },
  ],
  snapshot: (m) => treeSnapshot(drawing, m),
  operations: [findOp, unionOp, connectedOp],
  stats: [
    { key: 'finds', label: 'Finds' },
    { key: 'hops', label: 'Parent links followed' },
    { key: 'repointed', label: 'Pointers compressed' },
    { key: 'links', label: 'Roots linked' },
  ],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'key', label: 'Current element on the climb' },
    { mark: 'visited', label: 'Climbed past' },
    { mark: 'found', label: 'Root: names the set' },
    { mark: 'compare', label: 'Roots compared by rank' },
    { mark: 'write', label: 'Pointer or rank just changed' },
    { mark: 'reject', label: 'Different roots: not connected' },
  ],
  content: {
    idea: 'Union-find (a disjoint-set forest) keeps elements in non-overlapping sets. Every element points at a parent, and each tree’s root, which points at itself, names its set. find(x) climbs to the root; union(a, b) hangs one root under the other; two elements are connected exactly when their roots match. Two tricks keep the trees flat: union by rank hangs the shorter tree under the taller one, and path compression points every element a find passes straight at the root.',
    invariant: 'Following parent pointers from any element always ends at one root, and two elements share a set exactly when they share that root. Union by rank keeps every tree of rank r at least 2^r elements big, so no tree is taller than log₂ n; path compression only ever shortens paths.',
    whenToUse:
      'Kruskal’s minimum spanning tree (an edge whose ends already share a root would close a cycle, so skip it), connected components of a graph that only gains edges, cycle detection, percolation, and merging equivalent things such as accounts or image regions. With both tricks, any m operations on n elements cost O(m·α(n)), where α, the inverse Ackermann function, is at most 4 for any n that fits in the universe: effectively constant per operation. It cannot split a set apart again.',
    traits: [
      { label: 'Near-constant amortised time: O(α(n))', good: true },
      { label: 'Just two arrays: parent and rank', good: true },
      { label: 'Sets only merge: no un-union', good: false },
    ],
    experiments: [
      { example: 'tall', prompt: 'find(7): count the hops on the way up, then run find(7) again. Compression makes the second climb one hop.' },
      { example: 'two-sets', prompt: 'union(3, 8): both roots have rank 2. Predict which root becomes the child, and what happens to the rank.' },
      { example: 'singletons', prompt: 'Play Kruskal: union(0, 1), union(1, 2), then connected(0, 2). Adding edge 0–2 now would close a cycle.' },
    ],
  },
});

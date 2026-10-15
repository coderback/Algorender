import { defineStructure, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame } from '@/engine/types';
import { TreeTracer, treeSnapshot, type TreeDrawing } from '@/viz/tree/tracer';
import type { NodeId, TreeNode, TreeState } from '@/viz/tree/types';
import { COMPARISONS, KEY_MAX, KEY_MIN, SWAPS, keyArg, plural } from './shared';

export type HeapKind = 'min' | 'max';
export type HeapItem = { readonly id: string; readonly value: number };
/** A binary heap stored as an array: index i's children are at 2i + 1 and 2i + 2. */
export type Heap = { readonly kind: HeapKind; readonly items: readonly HeapItem[]; readonly nextId: number };

type Op = OperationSpec<Heap, TreeState>;
type F = Frame<TreeState>;

export const MAX_ITEMS = 31;
const STATS = ['comparisons', 'swaps'];
const EMPTY = 'The heap is empty';

/** True when `a` belongs above `b`: smaller in a min-heap, larger in a max-heap. Ties stay put. */
export const beats = (kind: HeapKind, a: number, b: number) => (kind === 'min' ? a < b : a > b);

const words = (kind: HeapKind) =>
  kind === 'min'
    ? { top: 'minimum', better: 'smaller', big: 'large', le: '≤', rule: 'no larger than' }
    : { top: 'maximum', better: 'larger', big: 'small', le: '≥', rule: 'no smaller than' };

const drawing: TreeDrawing<Heap> = {
  empty: 'The heap is empty. Insert a value or build one from an array.',
  shape: (heap) => {
    const n = heap.items.length;
    const nodes: Record<NodeId, TreeNode> = {};
    heap.items.forEach((item, i) => {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      nodes[item.id] = {
        shape: 'round',
        cells: [{ id: item.id, label: String(item.value) }],
        children: l < n ? [heap.items[l].id, r < n ? heap.items[r].id : null] : [],
        badges: { top: String(i) },
      };
    });
    return { root: heap.items[0]?.id ?? null, nodes, strip: { label: 'Array (index below)', ids: heap.items.map((it) => it.id) } };
  },
  describe: (heap) =>
    heap.items.length === 0
      ? `Empty ${heap.kind}-heap.`
      : `${heap.kind === 'min' ? 'Min' : 'Max'}-heap with ${plural(heap.items.length, 'value')}. Array: ${heap.items.map((it) => it.value).join(', ')}. The ${words(heap.kind).top} is ${heap.items[0].value}, at the root.`,
};

function swapAt(heap: Heap, i: number, j: number): Heap {
  const items = [...heap.items];
  [items[i], items[j]] = [items[j], items[i]];
  return { ...heap, items };
}

/** Parent/child pointers along an edge, for the path highlight. */
const edge = (heap: Heap, parent: number, child: number) => [heap.items[parent].id, heap.items[child].id];

type SiftLines = { loop: number; pick: number; stop: number; swap: number };

/** Sift the value at `start` down until it beats both children or reaches a leaf. */
function* siftDown(t: TreeTracer<Heap>, start: number, L: SiftLines, extra: { output?: TreeState['output'] }): Generator<F, void> {
  const kind = t.model.kind;
  const w = words(kind);
  let i = start;
  for (;;) {
    const items = t.model.items;
    const n = items.length;
    const cur = items[i];
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l >= n) {
      if (i !== start) {
        yield t.frame({
          line: L.loop,
          note: `${cur.value} is now at index ${i}, a leaf (2·${i} + 1 = ${l} is past the end of the array), so the sift-down stops.`,
          marks: { key: [cur.id] },
          vars: { i, n },
          ...extra,
        });
      }
      return;
    }
    const hasRight = r < n;
    let c = l;
    if (hasRight) {
      t.count('comparisons');
      if (beats(kind, items[r].value, items[l].value)) c = r;
    }
    const child = items[c];
    t.count('comparisons');
    const moves = beats(kind, child.value, cur.value);
    const choices = hasRight
      ? [`Left child, ${items[l].value}`, `Right child, ${items[r].value}`, 'Neither: it stays']
      : [`Left child, ${items[l].value}`, 'Neither: it stays'];
    const checkpoint: Checkpoint = {
      question: `Which child does ${cur.value} swap with?`,
      choices,
      answer: !moves ? choices.length - 1 : c === l ? 0 : 1,
    };
    const vars = { i, left: l, right: hasRight ? r : null, 'A[i]': cur.value };
    yield t.frame({
      line: L.pick,
      note: hasRight
        ? `${cur.value} at index ${i} has children at 2·${i} + 1 = ${l} and 2·${i} + 2 = ${r}, holding ${items[l].value} and ${items[r].value}.`
        : `${cur.value} at index ${i} has one child, at 2·${i} + 1 = ${l}, holding ${items[l].value}.`,
      marks: { key: [cur.id], compare: hasRight ? [items[l].id, items[r].id] : [items[l].id] },
      vars,
      checkpoint,
      ...extra,
    });
    if (!moves) {
      yield t.frame({
        line: L.stop,
        note: `${hasRight ? `The ${w.better} child is ${child.value}, and ` : ''}${cur.value} ${w.le} ${child.value}, so ${cur.value} may stay above ${hasRight ? 'both children' : 'it'}: the heap property holds here. Stop.`,
        marks: { key: [cur.id], compare: [child.id] },
        vars,
        ...extra,
      });
      return;
    }
    t.model = swapAt(t.model, i, c);
    t.count('swaps');
    yield t.frame({
      line: L.swap,
      note: `${
        hasRight ? `${child.value} is the ${w.better} child, the only one that can sit above both ${cur.value} and its sibling. It` : `${child.value}`
      } beats ${cur.value}, so swap them: ${child.value} moves up to index ${i} and ${cur.value} down to index ${c}.`,
      marks: { swap: [cur.id, child.id] },
      path: edge(t.model, i, c),
      vars: { ...vars, i: c },
      ...extra,
    });
    i = c;
  }
}

// ───────────────────────────── insert ─────────────────────────────

const insert: Op = {
  id: 'insert',
  label: 'Insert',
  args: [keyArg('Value', 5)],
  pseudocode: [
    'insert(x):',
    '  A.append(x);  i ← n − 1',
    '  while i > 0:',
    '    p ← ⌊(i − 1) / 2⌋',
    '    if A[p] ≤ A[i]: stop   (max: ≥)',
    '    swap A[i] and A[p];  i ← p',
  ],
  disabledReason: (heap) => (heap.items.length >= MAX_ITEMS ? `The heap is full (${MAX_ITEMS} values), the most this view draws clearly` : null),
  *run(model, args) {
    const value = Number(args.key);
    const kind = model.kind;
    const w = words(kind);
    const t = new TreeTracer(model, drawing, STATS);
    const id = `h${model.nextId}`;
    t.model = { ...model, nextId: model.nextId + 1, items: [...model.items, { id, value }] };
    let i = t.model.items.length - 1;
    yield t.frame({
      line: 1,
      note:
        i === 0
          ? `The heap is empty, so ${value} goes in at index 0, the root.`
          : `Append ${value} at index ${i}, the next free spot on the bottom level, so the tree stays complete. It may break the heap rule with its parent, so sift it up.`,
      marks: { key: [id] },
      vars: { x: value, i },
    });
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      const parent = t.model.items[p];
      t.count('comparisons');
      const moves = beats(kind, value, parent.value);
      const vars = { i, p, 'A[i]': value, 'A[p]': parent.value };
      yield t.frame({
        line: 3,
        note: `${value} is at index ${i}; its parent is at ⌊(${i} − 1) / 2⌋ = ${p}, holding ${parent.value}.`,
        marks: { key: [id], compare: [parent.id] },
        path: edge(t.model, p, i),
        vars,
        checkpoint: { question: `Does ${value} swap with its parent, ${parent.value}?`, choices: ['Yes, swap them', 'No, it stays'], answer: moves ? 0 : 1 },
      });
      if (!moves) {
        yield t.frame({
          line: 4,
          note: `${parent.value} ${w.le} ${value}: the parent may stay above it, so the heap property holds and ${value} stays at index ${i}.`,
          marks: { key: [id], compare: [parent.id] },
          path: edge(t.model, p, i),
          vars,
        });
        return t.model;
      }
      t.model = swapAt(t.model, i, p);
      t.count('swaps');
      yield t.frame({
        line: 5,
        note: `${value} is ${w.better} than ${parent.value}, but a parent must be ${w.rule} its children, so swap them: ${value} moves up to index ${p}.`,
        marks: { swap: [id, parent.id] },
        path: edge(t.model, p, i),
        vars: { ...vars, i: p },
      });
      i = p;
    }
    yield t.frame({
      line: 2,
      note: `${value} is at the root (index 0) with no parent left to compare with: it is the new ${w.top}. Sifting up took at most one swap per level.`,
      marks: { key: [id] },
      vars: { i: 0 },
    });
    return t.model;
  },
};

// ─────────────────────────── extract root ──────────────────────────

const EXTRACT_LINES: SiftLines = { loop: 4, pick: 5, stop: 6, swap: 7 };

const extract: Op = {
  id: 'extract',
  label: 'Extract root',
  args: [],
  pseudocode: [
    'extractRoot():',
    '  top ← A[0]',
    '  A[0] ← A[n − 1];  remove the last',
    '  i ← 0',
    '  while 2i + 1 < n:',
    '    c ← smaller child  (max: larger)',
    '    if A[i] ≤ A[c]: stop   (max: ≥)',
    '    swap A[i] and A[c];  i ← c',
    '  return top',
  ],
  disabledReason: (heap) => (heap.items.length === 0 ? EMPTY : null),
  *run(model) {
    const w = words(model.kind);
    const t = new TreeTracer(model, drawing, STATS);
    const top = model.items[0];
    const n = model.items.length;
    const out = () => ({ output: { label: 'Extracted', items: [String(top.value)] } });
    yield t.frame({
      line: 1,
      note: `The root, ${top.value}, is the ${w.top}: a ${model.kind}-heap always keeps it on top. Take it out.`,
      marks: { found: [top.id] },
      vars: { top: top.value },
    });
    if (n === 1) {
      t.model = { ...model, items: [] };
      yield t.frame({ line: 8, note: `${top.value} was the only value, so the heap is now empty.`, vars: { top: top.value }, ...out() });
      return t.model;
    }
    const last = model.items[n - 1];
    t.model = { ...model, items: [last, ...model.items.slice(1, n - 1)] };
    yield t.frame({
      line: 2,
      note: `Fill the hole at the root with the last value, ${last.value} from index ${n - 1}: the tree stays complete, but ${last.value} is probably too ${w.big} for the top.`,
      marks: { write: [last.id] },
      path: [],
      vars: { top: top.value, n: n - 1 },
      ...out(),
    });
    yield* siftDown(t, 0, EXTRACT_LINES, out());
    yield t.frame({
      line: 8,
      note: `Return ${top.value}. The heap has ${plural(n - 1, 'value')}, and its new ${w.top}, ${t.model.items[0].value}, is at the root.`,
      marks: { found: [t.model.items[0].id] },
      vars: { top: top.value },
      ...out(),
    });
    return t.model;
  },
};

// ────────────────────────────── peek ───────────────────────────────

const peek: Op = {
  id: 'peek',
  label: 'Peek',
  args: [],
  pseudocode: ['peek():', '  if the heap is empty: error', '  return A[0]   (the root)'],
  disabledReason: (heap) => (heap.items.length === 0 ? EMPTY : null),
  *run(model) {
    const t = new TreeTracer(model, drawing, STATS);
    const top = model.items[0];
    yield t.frame({
      line: 2,
      note: `The ${words(model.kind).top} is always at the root, index 0: ${top.value}. Peeking reads it without changing anything, in O(1).`,
      marks: { found: [top.id] },
      vars: { 'A[0]': top.value },
    });
    return model;
  },
};

// ──────────────────────────── heapify ──────────────────────────────

const HEAPIFY_LINES: SiftLines = { loop: 6, pick: 7, stop: 8, swap: 9 };

/** Parses "9, 4, 7" into values for heapify, or explains what's wrong. */
export function parseValues(text: string): { values: number[] } | { error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return { error: 'enter at least one number' };
  if (parts.length > MAX_ITEMS) return { error: `use at most ${MAX_ITEMS} numbers` };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < KEY_MIN || v > KEY_MAX) return { error: `"${part}" is not a whole number from ${KEY_MIN} to ${KEY_MAX}` };
    values.push(v);
  }
  return { values };
}

const heapify: Op = {
  id: 'heapify',
  label: 'Build heap',
  args: [{ name: 'values', label: 'Values', type: 'text', maxLength: 90, placeholder: 'e.g. 9, 4, 7, 1, 8, 2' }],
  pseudocode: [
    'heapify(values):',
    '  A ← values   (a complete tree)',
    '  for i from ⌊n/2⌋ − 1 down to 0:',
    '    siftDown(i)',
    '',
    'siftDown(i):',
    '  while 2i + 1 < n:',
    '    c ← smaller child  (max: larger)',
    '    if A[i] ≤ A[c]: stop   (max: ≥)',
    '    swap A[i] and A[c];  i ← c',
  ],
  *run(model, args) {
    const text = String(args.values);
    const parsed = parseValues(text);
    const t = new TreeTracer(model, drawing, STATS);
    if ('error' in parsed) {
      yield t.frame({ line: 1, note: `Can't build a heap from "${text}": ${parsed.error}. Nothing changed.`, vars: {} });
      return model;
    }
    const { values } = parsed;
    const n = values.length;
    const w = words(model.kind);
    t.model = { kind: model.kind, items: values.map((value, k) => ({ id: `h${model.nextId + k}`, value })), nextId: model.nextId + n };
    yield t.frame({
      line: 1,
      note: `Lay the ${plural(n, 'value')} out in the given order. Read as a tree (index i's children at 2i + 1 and 2i + 2), it is complete but not yet a heap.`,
      vars: { n },
    });
    const start = Math.floor(n / 2) - 1;
    for (let i = start; i >= 0; i--) {
      const item = t.model.items[i];
      yield t.frame({
        line: 2,
        note:
          i === start
            ? `Indexes ${start + 1} to ${n - 1} are leaves, and a single node is already a heap. Start at the last parent, index ⌊${n}/2⌋ − 1 = ${start}, and work back to the root.`
            : `Next parent: index ${i}, holding ${item.value}. Both subtrees below it are heaps already, so one sift-down makes this whole subtree a heap.`,
        marks: { key: [item.id] },
        vars: { i },
      });
      yield* siftDown(t, i, HEAPIFY_LINES, {});
    }
    yield t.frame({
      line: 2,
      note:
        n === 1
          ? `A single value is already a heap.`
          : `Done: every parent is ${w.rule} its children, so the array is a ${model.kind}-heap. This takes O(n), less than n inserts, because most nodes sit near the bottom and barely move.`,
      marks: { found: [t.model.items[0].id] },
      vars: { n },
    });
    return t.model;
  },
};

// ───────────────────────────── module ─────────────────────────────

/** Builds a heap without recording anything (for the starting examples). */
export function buildHeap(kind: HeapKind, values: readonly number[]): Heap {
  const items = values.map((value, k) => ({ id: `h${k + 1}`, value }));
  const n = items.length;
  for (let s = Math.floor(n / 2) - 1; s >= 0; s--) {
    let i = s;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let c = i;
      if (l < n && beats(kind, items[l].value, items[c].value)) c = l;
      if (r < n && beats(kind, items[r].value, items[c].value)) c = r;
      if (c === i) break;
      [items[i], items[c]] = [items[c], items[i]];
      i = c;
    }
  }
  return { kind, items, nextId: n + 1 };
}

const randomValues = (seed: number, count: number) => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => KEY_MIN + Math.floor(rng() * (KEY_MAX - KEY_MIN + 1)));
};

export const heap = defineStructure<Heap, TreeState>({
  kind: 'structure',
  slug: 'heap',
  view: 'tree',
  initial: [
    { id: 'min', label: 'Min-heap (7 values)', make: (seed) => buildHeap('min', randomValues(seed, 7)) },
    { id: 'max', label: 'Max-heap (7 values)', make: (seed) => buildHeap('max', randomValues(seed, 7)) },
    { id: 'min-empty', label: 'Empty min-heap', make: () => buildHeap('min', []) },
    { id: 'max-empty', label: 'Empty max-heap', make: () => buildHeap('max', []) },
    { id: 'sorted', label: 'Sorted array (already a min-heap)', make: () => buildHeap('min', [3, 8, 15, 21, 34, 42, 57, 66, 78]) },
  ],
  snapshot: (h) => treeSnapshot(drawing, h),
  operations: [insert, extract, peek, heapify],
  stats: [COMPARISONS, SWAPS],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'key', label: 'Value being sifted' },
    { mark: 'compare', label: 'Compared with it' },
    { mark: 'swap', label: 'Swapping' },
    { mark: 'write', label: 'Moved to the root' },
    { mark: 'found', label: 'The root (the answer)' },
  ],
  content: {
    idea: 'A binary heap is a complete binary tree stored in a plain array: the children of index i sit at 2i + 1 and 2i + 2, and its parent at ⌊(i − 1) / 2⌋. Every parent beats its children (smaller in a min-heap, larger in a max-heap), so the best value is always at the root. Insert sifts a new value up; extracting the root moves the last value to the top and sifts it down.',
    invariant: 'Heap property: every parent is ≤ its children in a min-heap (≥ in a max-heap). And the tree is complete: every level is full except the last, which fills from the left, so the array has no gaps.',
    whenToUse:
      'A priority queue: Dijkstra, Prim, event simulation, schedulers, "top k" problems and heap sort. Insert and extract cost O(log n), peek O(1). It does not keep everything sorted, and finding an arbitrary value takes O(n). Try "Build heap" with a reversed list such as 9, 8, 7, 6, 5, 4, 3 on an empty min-heap.',
    traits: [
      { label: 'O(1) peek, O(log n) insert and extract', good: true },
      { label: 'No pointers: lives in an array', good: true },
      { label: 'Search for any other value is O(n)', good: false },
    ],
    experiments: [
      { example: 'min', prompt: 'Insert 1: predict how many swaps it takes to reach the root.' },
      { example: 'sorted', prompt: 'A sorted array is already a min-heap. Extract the root and watch which value is moved up to replace it.' },
      { example: 'max', prompt: 'Extract the root twice and watch the array strip: index arithmetic, not pointers, finds each child.' },
    ],
  },
});

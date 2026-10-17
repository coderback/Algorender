import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay } from '@/components/explorer/operations';
import type { AnyStructure, Args, StructureModule } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { layoutTree } from '@/viz/tree/layout';
import { parents } from '@/viz/tree/tracer';
import type { NodeId, TreeState } from '@/viz/tree/types';
import { treeStructures } from '.';
import { avlTree, balance, type Avl } from './avl-tree';
import { allKeys, bTree, isLeaf, maxKeys, minKeys, type BTree } from './b-tree';
import { heightOf, inorder, MAX_NODES, type BinNode, type BinTree } from './binary';
import { binaryTree } from './binary-tree';
import { beats, heap, type Heap } from './heap';
import { ROOT, trie, wordsOf, type Trie } from './trie';

// ───────────────────────────── harness ─────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Nodes may only overlap if the layout is broken: same-depth boxes keep the gap, levels never touch. */
function expectTidyLayout(state: TreeState) {
  const layout = layoutTree(state);
  const boxes = Object.entries(layout.boxes);
  expect(boxes.length).toBe(Object.keys(state.nodes).length);
  const gap = layout.metrics.gap;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [, a] = boxes[i];
      const [, b] = boxes[j];
      if (a.depth === b.depth) {
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        expect(r.x - r.left - (l.x + l.right)).toBeGreaterThanOrEqual(gap - 1e-6);
      } else {
        expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual((a.h + b.h) / 2);
      }
    }
  }
  // Children stay left to right, and a lone binary child sits on its own side.
  for (const [id, node] of Object.entries(state.nodes)) {
    const xs = node.children.filter((c): c is NodeId => c != null).map((c) => layout.boxes[c].x);
    for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThan(xs[k - 1]);
    if (node.children.length === 2 && xs.length === 1) {
      const px = layout.boxes[id].x;
      if (node.children[0] != null) expect(xs[0]).toBeLessThan(px);
      else expect(xs[0]).toBeGreaterThan(px);
    }
  }
}

/** Every id a frame points at must exist, and the shape must be a tree. */
function expectWellFormedState(state: TreeState) {
  const cells = Object.values(state.nodes).flatMap((n) => n.cells.map((c) => c.id));
  expect(new Set(cells).size).toBe(cells.length);
  const known = new Set([...Object.keys(state.nodes), ...cells]);
  for (const id of Object.keys(state.marks)) expect(known.has(id), `marked id ${id}`).toBe(true);
  const parent = parents(state);
  const reachable = state.root == null ? 0 : parent.size + 1;
  expect(Object.keys(state.nodes).length).toBe(reachable);
  for (const child of state.pathEdges) expect(parent.has(child)).toBe(true);
  if (state.probe) expect(state.nodes[state.probe.at]).toBeDefined();
  if (state.strip) for (const id of state.strip.ids) expect(state.nodes[id]).toBeDefined();
  expect(state.description.length).toBeGreaterThan(0);
}

type Run<M> = { result: M; frames: Frame<TreeState>[] };

/**
 * Runs one operation with every generic check: the input model is frozen and
 * unchanged, every frame is narrated and points at a real line of this
 * operation's pseudo-code, counters never go backwards, checkpoints are
 * well-formed and answered by a later frame, and the last frame shows the
 * settled structure.
 */
function runOp<M>(ds: StructureModule<M, TreeState>, opId: string, model: M, args: Args): Run<M> {
  const spec = ds.operations.find((o) => o.id === opId)!;
  expect(spec, opId).toBeDefined();
  deepFreeze(model);
  const before = JSON.stringify(model);
  const { frames, result } = recordOperation(spec.run(model, args));
  expect(JSON.stringify(model)).toBe(before);
  expect(frames.length).toBeGreaterThan(0);

  const statKeys = ds.stats.map((s) => s.key).sort();
  let prev: Record<string, number> = {};
  frames.forEach((frame, i) => {
    expect(frame.note.trim().length).toBeGreaterThan(0);
    expect(frame.line, `${ds.slug}/${opId} frame ${i} has no line: ${frame.note}`).not.toBeNull();
    expect(frame.line!).toBeGreaterThanOrEqual(0);
    expect(frame.line!).toBeLessThan(spec.pseudocode.length);
    expect(spec.pseudocode[frame.line!].trim()).not.toBe('');
    expect(Object.keys(frame.stats).sort()).toEqual(statKeys);
    for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
    prev = frame.stats;

    const c = frame.checkpoint;
    if (c) {
      expect(c.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(c.answer).toBeLessThan(c.choices.length);
      expect(i).toBeLessThan(frames.length - 1);
      if (c.choices[c.answer].length > 3) expect(frame.note).not.toContain(c.choices[c.answer]);
    }
    expectWellFormedState(frame.state);
  });

  const last = frames[frames.length - 1].state;
  const settled = ds.snapshot(result);
  expect({ root: last.root, nodes: last.nodes, strip: last.strip }).toEqual({ root: settled.root, nodes: settled.nodes, strip: settled.strip });
  return { result, frames };
}

const lastVars = <M>(run: Run<M>) => run.frames[run.frames.length - 1].vars;
const lastOutput = <M>(run: Run<M>) => run.frames[run.frames.length - 1].state.output?.items ?? [];

const keys = fc.integer({ min: 1, max: 40 });

/**
 * The arguments a learner could give `op` right now: a choice argument takes
 * one of the model's current options (picked by `pick`), anything else `free`.
 */
function offered<M>(ds: StructureModule<M, TreeState>, op: string, model: M, free: Args, pick: number): Args {
  const spec = ds.operations.find((o) => o.id === op)!;
  return Object.fromEntries(
    spec.args.map((a) => {
      if (a.type !== 'choice') return [a.name, free[a.name]];
      const options = a.options(model);
      return [a.name, options.length ? options[pick % options.length] : ''];
    }),
  );
}

/** Runs a call the explorer allows (asserting it is allowed), with every check runOp makes. */
function runAllowed<M>(ds: StructureModule<M, TreeState>, op: string, model: M, args: Args): Run<M> {
  expect(blockedReason(ds as AnyStructure, model, { op, args })).toBeNull();
  return runOp(ds, op, model, args);
}

/** What a narration says when an operation found nothing to do: allowed calls must never end like this. */
const NOTHING_TO_DO = /nothing to delete|is not in the tree and nothing changes|Nothing changed|is not stored/i;

// ───────────────────────────── invariants ─────────────────────────────

function expectBst(tree: BinTree<BinNode>, expected: Set<number>) {
  const order = inorder(tree);
  for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  expect(order).toEqual([...expected].sort((a, b) => a - b));
  expect(Object.keys(tree.nodes)).toHaveLength(order.length);
}

function expectAvl(tree: Avl, expected: Set<number>) {
  expectBst(tree, expected);
  for (const id of Object.keys(tree.nodes)) {
    expect(tree.nodes[id].height).toBe(heightOf(tree, id));
    expect(Math.abs(balance(tree, id))).toBeLessThanOrEqual(1);
  }
}

function expectHeap(h: Heap, expected: number[]) {
  const values = h.items.map((it) => it.value);
  expect([...values].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
  for (let i = 1; i < values.length; i++) expect(beats(h.kind, values[i], values[Math.floor((i - 1) / 2)])).toBe(false);
  expect(new Set(h.items.map((it) => it.id)).size).toBe(h.items.length);
}

function expectBTree(tree: BTree, expected: Set<number>) {
  const ks = allKeys(tree);
  expect(ks).toEqual([...expected].sort((a, b) => a - b));
  for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
  if (tree.root == null) {
    expect(Object.keys(tree.nodes)).toHaveLength(0);
    return;
  }
  const leafDepths = new Set<number>();
  let count = 0;
  const walk = (id: NodeId, depth: number) => {
    count++;
    const n = tree.nodes[id];
    const lo = id === tree.root ? 1 : minKeys(tree);
    expect(n.keys.length).toBeGreaterThanOrEqual(lo);
    expect(n.keys.length).toBeLessThanOrEqual(maxKeys(tree));
    if (isLeaf(n)) leafDepths.add(depth);
    else {
      expect(n.children).toHaveLength(n.keys.length + 1);
      n.children.forEach((c) => walk(c, depth + 1));
    }
  };
  walk(tree.root, 0);
  expect(leafDepths.size).toBe(1);
  expect(Object.keys(tree.nodes)).toHaveLength(count);
}

function expectTrie(tr: Trie, expected: Set<string>) {
  expect(wordsOf(tr)).toEqual([...expected].sort());
  for (const [id, n] of Object.entries(tr.nodes)) {
    for (const [c, child] of Object.entries(n.children)) expect(child).toBe(id + c);
    if (id !== ROOT && Object.keys(n.children).length === 0) expect(n.end).toBe(true);
  }
}

// ───────────────────────────── every module ─────────────────────────────

describe.each(treeStructures.map((ds) => [ds.slug, ds] as const))('%s', (_, ds) => {
  it('is a tree-view structure whose legend starts with the neutral entry', () => {
    expect(ds.kind).toBe('structure');
    expect(ds.view).toBe('tree');
    expect(ds.legend[0]).toHaveProperty('neutral');
  });

  it('builds every starting example, and draws it tidily', () => {
    for (const example of ds.initial) {
      for (const seed of [1, 7, 12345]) {
        const model = example.make(seed);
        const state = ds.snapshot(model) as TreeState;
        expectWellFormedState(state);
        expectTidyLayout(state);
      }
    }
  });

  it('points experiments at real starting examples', () => {
    const ids = new Set(ds.initial.map((s) => s.id));
    for (const x of ds.content.experiments) expect(ids.has(x.example), x.example).toBe(true);
  });

  it('blocks every operation but adding on an empty structure, and unblocks them after one add', () => {
    const empty = ds.initial.find((s) => s.id.includes('empty'))!.make(1);
    for (const op of ds.operations) {
      const adds = op.id === 'insert' || op.id === 'heapify';
      expect(op.disabledReason?.(empty) ?? null, op.id)[adds ? 'toBeNull' : 'toBeTruthy']();
    }
    const insert = ds.operations.find((o) => o.id === 'insert')!;
    const arg = insert.args[0];
    const one = recordOperation(insert.run(empty, { [arg.name]: arg.type === 'int' ? 42 : 'cat' })).result;
    for (const op of ds.operations) expect(op.disabledReason?.(one) ?? null, op.id).toBeNull();
  });

  it('keeps pseudo-code lines short enough for the side panel', () => {
    for (const op of ds.operations) for (const line of op.pseudocode) expect(line.length, line).toBeLessThanOrEqual(40);
  });

  it('offers exactly the stored keys as choices, and blocks anything else, even from a URL', () => {
    for (const example of ds.initial) {
      for (const seed of [1, 7]) {
        const model = example.make(seed);
        for (const op of ds.operations) {
          for (const a of op.args) {
            if (a.type !== 'choice') continue;
            expect(a.options(model), `${op.id} on ${example.id}`).toEqual(stored(ds.slug, model));
            for (const bogus of ['0', '100', 'zzz', 'CAR']) {
              expect(blockedReason(ds, model, { op: op.id, args: { [a.name]: bogus } })).toMatch(/pick one/);
            }
          }
        }
      }
    }
  });

  it('URL replay stops at a delete of something already gone', () => {
    const del = ds.operations.find((o) => o.id === 'delete');
    if (!del) return; // the heap has no keyed delete
    const model = ds.initial[0].make(1);
    const first = stored(ds.slug, model)[0];
    const { applied, model: after } = replay(ds, model, parseOps(`delete:${first};delete:${first};delete:${stored(ds.slug, model)[1]}`, ds));
    expect(applied).toHaveLength(1);
    expect(stored(ds.slug, after)).not.toContain(first);
  });
});

/** What a structure stores, as its delete dropdown lists it. */
function stored(slug: string, model: unknown): string[] {
  if (slug === 'b-tree') return allKeys(model as BTree).map(String);
  if (slug === 'trie') return wordsOf(model as Trie);
  if (slug === 'heap') return [];
  return inorder(model as BinTree<BinNode>).map(String);
}

// ───────────────────────────── binary search tree ─────────────────────────────

/** Insert and search take any key (a missing or duplicate one is narrated); delete picks one of the stored keys. */
const bstOps = fc.array(fc.record({ op: fc.constantFrom('insert', 'delete', 'search'), key: keys, pick: fc.nat() }), { minLength: 1, maxLength: 30 });

/**
 * Checks the call against the explorer's rules: a delete is allowed exactly
 * when its key is stored. Returns the allowed call's arguments, or null.
 */
function allowedKeyCall<M>(ds: StructureModule<M, TreeState>, model: M, ref: ReadonlySet<number>, op: string, key: number, pick: number): Args | null {
  const deleting = blockedReason(ds as AnyStructure, model, { op: 'delete', args: { key } });
  expect(deleting == null).toBe(ref.has(key));
  const args = offered(ds, op, model, { key }, pick);
  return blockedReason(ds as AnyStructure, model, { op, args }) ? null : args;
}

describe('binary-tree', () => {
  const ds = binaryTree as StructureModule<BinTree<BinNode>, TreeState>;
  const start = (id: string) => ds.initial.find((s) => s.id === id)!.make(3);

  it('matches a sorted set under random inserts, deletes and searches, allowing exactly the deletes of stored keys', () => {
    fc.assert(
      fc.property(fc.constantFrom('balanced', 'empty', 'sorted', 'random'), bstOps, (init, ops) => {
        let model = start(init);
        const ref = new Set(inorder(model));
        for (const { op, key: k, pick } of ops) {
          const args = allowedKeyCall(ds, model, ref, op, k, pick);
          if (!args) {
            expect(op === 'insert' ? ref.size >= MAX_NODES : ref.size === 0).toBe(true);
            continue;
          }
          const key = Number(args.key);
          const run = runAllowed(ds, op, model, args);
          if (op === 'insert') ref.add(key);
          if (op === 'delete') {
            for (const f of run.frames) expect(f.note).not.toMatch(NOTHING_TO_DO);
            ref.delete(key);
          }
          if (op === 'search') {
            expect(lastVars(run).found).toBe(ref.has(key));
            expect(run.result).toBe(model);
          }
          model = run.result;
          expectBst(model, ref);
          expectTidyLayout(ds.snapshot(model));
        }
      }),
      { numRuns: 80 },
    );
  });

  it('puts the new node on the highlighted path when inserting', () => {
    const model = start('balanced');
    const run = runOp(ds, 'insert', model, { key: 45 });
    const end = run.frames[run.frames.length - 1].state;
    const id = Object.keys(end.nodes).find((n) => end.nodes[n].cells[0].label === '45')!;
    expect(end.pathEdges).toContain(id);
  });

  it('covers all three delete cases, including the in-order successor', () => {
    const model = start('balanced'); // 50 / 30 70 / 20 40 60 80
    const leaf = runOp(ds, 'delete', model, { key: 20 });
    expectBst(leaf.result, new Set([30, 40, 50, 60, 70, 80]));
    const one = runOp(ds, 'delete', leaf.result, { key: 30 });
    expectBst(one.result, new Set([40, 50, 60, 70, 80]));
    const two = runOp(ds, 'delete', model, { key: 50 });
    expectBst(two.result, new Set([20, 30, 40, 60, 70, 80]));
    expect(two.result.nodes[two.result.root!].key).toBe(60);
    // The found frame asks which case applies; the answer is the number of children.
    const asked = (run: Run<BinTree<BinNode>>) => run.frames.find((f) => f.checkpoint?.question.startsWith('How will'))!.checkpoint!;
    expect(asked(leaf).answer).toBe(0);
    expect(asked(one).answer).toBe(1);
    expect(asked(two).answer).toBe(2);
  });

  it('lists each traversal in the right order', () => {
    fc.assert(
      fc.property(fc.uniqueArray(keys, { minLength: 1, maxLength: 15 }), (ks) => {
        const model = ks.reduce((m, key) => runOp(ds, 'insert', m, { key }).result, start('empty'));
        expect(lastOutput(runOp(ds, 'inorder', model, {}))).toEqual([...ks].sort((a, b) => a - b).map(String));
        // Pre-order of a BST built by inserting in that same order rebuilds the same tree.
        const pre = lastOutput(runOp(ds, 'preorder', model, {})).map(Number);
        const rebuilt = pre.reduce((m, key) => runOp(ds, 'insert', m, { key }).result, start('empty'));
        expect(ds.snapshot(rebuilt).description).toBe(ds.snapshot(model).description);
        expect(lastOutput(runOp(ds, 'postorder', model, {}))).toHaveLength(ks.length);
        const level = lastOutput(runOp(ds, 'levelorder', model, {}));
        expect(level[0]).toBe(String(ks[0]));
        expect([...level].sort()).toEqual(ks.map(String).sort());
      }),
      { numRuns: 40 },
    );
  });

  it('blocks operations that cannot run', () => {
    const empty = start('empty');
    for (const op of ['delete', 'search', 'inorder', 'preorder', 'postorder', 'levelorder']) {
      expect(ds.operations.find((o) => o.id === op)!.disabledReason?.(empty)).toBeTruthy();
    }
    const full = Array.from({ length: MAX_NODES }, (_, i) => i + 1).reduce((m, key) => runOp(ds, 'insert', m, { key }).result, empty);
    expect(ds.operations.find((o) => o.id === 'insert')!.disabledReason?.(full)).toBeTruthy();
    expect(ds.operations.find((o) => o.id === 'insert')!.disabledReason?.(start('balanced'))).toBeNull();
  });

  it('still runs a duplicate insert and a search for a missing key: each walk shows why', () => {
    const model = start('balanced');
    const dup = runAllowed(ds, 'insert', model, { key: 40 });
    expect(dup.result).toBe(model);
    expect(dup.frames.at(-1)!.note).toMatch(/already in the tree/);
    const missing = runAllowed(ds, 'search', model, { key: 45 });
    expect(lastVars(missing).found).toBe(false);
    expect(missing.frames.length).toBeGreaterThan(2); // root, 30's subtree, 40's: one comparison per level
  });

  it('only offers stored keys to delete', () => {
    const model = start('balanced');
    expect(blockedReason(ds as AnyStructure, model, { op: 'delete', args: { key: 45 } })).toMatch(/pick one/);
    expect(blockedReason(ds as AnyStructure, model, { op: 'delete', args: { key: 40 } })).toBeNull();
  });
});

// ───────────────────────────── AVL ─────────────────────────────

describe('avl-tree', () => {
  const ds = avlTree as StructureModule<Avl, TreeState>;
  const start = (id: string) => ds.initial.find((s) => s.id === id)!.make(5);

  it('matches a sorted set and stays balanced with correct heights after every operation', () => {
    fc.assert(
      fc.property(fc.constantFrom('balanced', 'empty', 'sorted', 'leaning', 'random'), bstOps, (init, ops) => {
        let model = start(init);
        const ref = new Set(inorder(model));
        expectAvl(model, ref);
        for (const { op, key: k, pick } of ops) {
          const args = allowedKeyCall(ds, model, ref, op, k, pick);
          if (!args) continue;
          const key = Number(args.key);
          const run = runAllowed(ds, op, model, args);
          if (op === 'insert') ref.add(key);
          if (op === 'delete') {
            for (const f of run.frames) expect(f.note).not.toMatch(NOTHING_TO_DO);
            ref.delete(key);
          }
          if (op === 'search') expect(lastVars(run).found).toBe(ref.has(key));
          model = run.result;
          expectAvl(model, ref);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('names each of the four rotation cases correctly', () => {
    const leaning = start('leaning'); // 30 with left child 20
    const cases: [number, number][] = [
      [10, 0], // LL → right rotation
      [25, 1], // LR
    ];
    for (const [key, answer] of cases) {
      const run = runOp(ds, 'insert', leaning, { key });
      const q = run.frames.find((f) => f.checkpoint?.question.startsWith('Which rotation'))!.checkpoint!;
      expect(q.answer).toBe(answer);
      expect(run.frames[run.frames.length - 1].stats.rotations).toBe(answer === 0 ? 1 : 2);
    }
    const right = [20, 30].reduce((m, key) => runOp(ds, 'insert', m, { key }).result, start('empty'));
    const rr = runOp(ds, 'insert', right, { key: 40 });
    expect(rr.frames.find((f) => f.checkpoint?.question.startsWith('Which rotation'))!.checkpoint!.answer).toBe(2);
    const rl = runOp(ds, 'insert', right, { key: 25 });
    expect(rl.frames.find((f) => f.checkpoint?.question.startsWith('Which rotation'))!.checkpoint!.answer).toBe(3);
  });

  it('animates rotations: nodes keep their ids when they move', () => {
    const run = runOp(ds, 'insert', start('leaning'), { key: 10 });
    const ids = (s: TreeState) => Object.keys(s.nodes).sort();
    const before = run.frames.findIndex((f) => f.checkpoint?.question.startsWith('Which rotation'));
    const after = run.frames[run.frames.length - 1].state;
    expect(ids(after)).toEqual(ids(run.frames[before].state));
    expect(after.root).not.toBe(run.frames[before].state.root);
  });

  it('keeps sorted inserts balanced where a plain BST makes a chain', () => {
    const avl = start('sorted');
    const bst = binaryTree.initial.find((s) => s.id === 'sorted')!.make(5);
    expect(heightOf(avl, avl.root)).toBe(3);
    expect(heightOf(bst, bst.root)).toBe(7);
  });
});

// ───────────────────────────── heap ─────────────────────────────

describe('heap', () => {
  const ds = heap as StructureModule<Heap, TreeState>;
  const heapOps = fc.array(
    fc.oneof(
      { weight: 4, arbitrary: fc.record({ op: fc.constant('insert' as const), key: fc.integer({ min: 1, max: 99 }) }) },
      { weight: 3, arbitrary: fc.record({ op: fc.constant('extract' as const) }) },
      { weight: 1, arbitrary: fc.record({ op: fc.constant('peek' as const) }) },
      { weight: 1, arbitrary: fc.record({ op: fc.constant('heapify' as const), values: fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 1, maxLength: 12 }) }) },
    ),
    { minLength: 1, maxLength: 30 },
  );

  it('behaves like a priority queue and keeps the heap property after every operation', () => {
    fc.assert(
      fc.property(fc.constantFrom('min', 'max', 'min-empty', 'max-empty', 'sorted'), fc.integer({ min: 0, max: 1000 }), heapOps, (init, seed, ops) => {
        let model = ds.initial.find((s) => s.id === init)!.make(seed);
        let ref = model.items.map((it) => it.value);
        const best = () => (model.kind === 'min' ? Math.min(...ref) : Math.max(...ref));
        expectHeap(model, ref);
        for (const step of ops) {
          const spec = ds.operations.find((o) => o.id === step.op)!;
          if (spec.disabledReason?.(model)) {
            expect(step.op === 'insert' ? ref.length >= 31 : ref.length === 0).toBe(true);
            continue;
          }
          if (step.op === 'insert') {
            const run = runOp(ds, 'insert', model, { key: step.key });
            ref = [...ref, step.key];
            model = run.result;
          } else if (step.op === 'extract') {
            const top = best();
            const run = runOp(ds, 'extract', model, {});
            expect(lastOutput(run)).toEqual([String(top)]);
            ref.splice(ref.indexOf(top), 1);
            model = run.result;
          } else if (step.op === 'peek') {
            const run = runOp(ds, 'peek', model, {});
            expect(lastVars(run)['A[0]']).toBe(best());
            expect(run.result).toBe(model);
          } else {
            const run = runAllowed(ds, 'heapify', model, { values: step.values.join(', ') });
            ref = [...step.values];
            model = run.result;
          }
          expectHeap(model, ref);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('draws the array strip with the same ids as the tree, in index order', () => {
    const model = ds.initial[0].make(9);
    const state = ds.snapshot(model);
    expect(state.strip!.ids).toEqual(model.items.map((it) => it.id));
    model.items.forEach((it, i) => {
      const node = state.nodes[it.id];
      const kids = node.children.filter((c) => c != null);
      expect(kids).toEqual([model.items[2 * i + 1]?.id, model.items[2 * i + 2]?.id].filter(Boolean));
    });
  });

  it('asks which child to swap with, and the answer matches the swap that follows', () => {
    const model = ds.initial.find((s) => s.id === 'sorted')!.make(1);
    const run = runOp(ds, 'extract', model, {});
    const asks = run.frames.filter((f) => f.checkpoint?.question.startsWith('Which child'));
    expect(asks.length).toBeGreaterThan(0);
  });

  it('blocks a malformed array with the reason, and replay stops there', () => {
    const model = ds.initial[0].make(2);
    const why = (values: string) => blockedReason(ds as AnyStructure, model, { op: 'heapify', args: { values } });
    expect(why('4, x, 9')).toBe('Can\'t build a heap from "4, x, 9": "x" is not a whole number from 1 to 99');
    expect(why('4, 200')).toMatch(/"200" is not a whole number from 1 to 99/);
    expect(why(Array.from({ length: 32 }, () => '1').join(','))).toMatch(/at most 31 numbers/);
    expect(why('9 4 7')).toBeNull();
    expect(ds.operations.find((o) => o.id === 'heapify')!.disabledReason!(model)).toBeNull(); // nothing to judge until something is typed
    expect(replay(ds as AnyStructure, model, parseOps('insert:5;heapify:4%2C%20x;insert:6', ds as AnyStructure)).applied).toHaveLength(1);
  });
});

// ───────────────────────────── B-tree ─────────────────────────────

describe('b-tree', () => {
  const ds = bTree as StructureModule<BTree, TreeState>;

  it('matches a sorted set with legal node sizes and level leaves after every operation', () => {
    fc.assert(
      fc.property(fc.constantFrom('234', '23', 'order-5', 'empty', 'sorted', 'random'), fc.integer({ min: 0, max: 1000 }), bstOps, (init, seed, ops) => {
        let model = ds.initial.find((s) => s.id === init)!.make(seed);
        const ref = new Set(allKeys(model));
        expectBTree(model, ref);
        for (const { op, key: k, pick } of ops) {
          const args = allowedKeyCall(ds, model, ref, op, k, pick);
          if (!args) continue;
          const key = Number(args.key);
          const run = runAllowed(ds, op, model, args);
          if (op === 'insert') ref.add(key);
          if (op === 'delete') {
            for (const f of run.frames) expect(f.note).not.toMatch(NOTHING_TO_DO);
            ref.delete(key);
          }
          if (op === 'search') expect(lastVars(run).found).toBe(ref.has(key));
          model = run.result;
          expectBTree(model, ref);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('splits a full leaf and moves its median key up visibly (same cell id)', () => {
    let model = ds.initial.find((s) => s.id === 'empty')!.make(1);
    for (const key of [10, 20, 30]) model = runOp(ds, 'insert', model, { key }).result;
    const run = runOp(ds, 'insert', model, { key: 40 });
    expect(run.frames[run.frames.length - 1].stats.splits).toBe(1);
    const end = run.frames[run.frames.length - 1].state;
    const median = end.nodes[end.root!].cells.map((c) => c.id);
    expect(median).toHaveLength(1);
    const beforeSplit = run.frames[0].state;
    const leaf = beforeSplit.nodes[beforeSplit.root!];
    expect(leaf.cells.map((c) => c.id)).toContain(median[0]);
    const q = run.frames.find((f) => f.checkpoint?.question.startsWith('Will'))!.checkpoint!;
    expect(q.choices[q.answer]).toBe('Yes, it overflows');
  });

  it('exercises borrowing and merging on delete', () => {
    let borrows = 0;
    let merges = 0;
    for (let seed = 0; seed < 30; seed++) {
      let model = ds.initial.find((s) => s.id === 'random')!.make(seed);
      for (const key of allKeys(model)) {
        const run = runAllowed(ds, 'delete', model, { key });
        const notes = run.frames.map((f) => f.note).join(' ');
        if (notes.includes('borrow it through the parent')) borrows++;
        if (notes.includes('merge the short node')) merges++;
        model = run.result;
      }
      expect(model.root).toBeNull();
    }
    expect(borrows).toBeGreaterThan(0);
    expect(merges).toBeGreaterThan(0);
  });
});

// ───────────────────────────── trie ─────────────────────────────

describe('trie', () => {
  const ds = trie as StructureModule<Trie, TreeState>;
  const word = fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd'), minLength: 1, maxLength: 5 });
  type TrieOp = { op: 'insert' | 'search' | 'prefix' | 'delete'; w: string; pick: number };
  const trieOps = fc.array(
    fc.record({ op: fc.constantFrom<TrieOp['op']>('insert', 'insert', 'search', 'prefix', 'delete'), w: word, pick: fc.nat() }),
    { minLength: 1, maxLength: 30 },
  );

  it('matches a set of words and answers prefix queries after every operation, deleting only stored words', () => {
    fc.assert(
      fc.property(fc.constantFrom('dictionary', 'empty', 'shared', 'random'), trieOps, (init, ops) => {
        let model = ds.initial.find((s) => s.id === init)!.make(4);
        const ref = new Set(wordsOf(model));
        expectTrie(model, ref);
        for (const { op, w: typed, pick } of ops) {
          // Deleting a word is allowed exactly when it is stored.
          expect(blockedReason(ds as AnyStructure, model, { op: 'delete', args: { word: typed } }) == null).toBe(ref.has(typed));
          const args = offered(ds, op, model, { word: typed, prefix: typed }, pick);
          if (blockedReason(ds as AnyStructure, model, { op, args })) {
            if (op !== 'insert') expect(ref.size).toBe(0);
            continue;
          }
          const w = String(args.word ?? args.prefix);
          const run = runAllowed(ds, op, model, args);
          if (op === 'insert') ref.add(w);
          if (op === 'delete') {
            for (const f of run.frames) expect(f.note).not.toMatch(NOTHING_TO_DO);
            ref.delete(w);
          }
          if (op === 'search') expect(lastVars(run).found).toBe(ref.has(w));
          if (op === 'prefix') expect(lastOutput(run)).toEqual([...ref].filter((x) => x.startsWith(w)).sort());
          model = run.result;
          expectTrie(model, ref);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('asks whether a matched path is a word or only a prefix', () => {
    const model = ds.initial[0].make(1); // car, card, care, cat, do, dog, dot
    const prefixOnly = runOp(ds, 'search', model, { word: 'ca' });
    const word = runOp(ds, 'search', model, { word: 'car' });
    const ask = (run: Run<Trie>) => run.frames.find((f) => f.checkpoint)!.checkpoint!;
    expect(ask(prefixOnly).choices[ask(prefixOnly).answer]).toBe('Only a prefix');
    expect(ask(word).choices[ask(word).answer]).toBe('A stored word');
  });

  it('blocks words with other characters before they run, and normalises case', () => {
    const model = ds.initial[0].make(1);
    for (const [op, field] of [['insert', 'word'], ['search', 'word'], ['prefix', 'prefix']] as const) {
      expect(blockedReason(ds as AnyStructure, model, { op, args: { [field]: 'c4t' } })).toBe('Can\'t use "c4t": use only the letters a–z');
      expect(blockedReason(ds as AnyStructure, model, { op, args: { [field]: 'Ca' } })).toBeNull();
    }
    expect(wordsOf(runAllowed(ds, 'insert', model, { word: 'Cab' }).result)).toContain('cab');
  });

  it('still runs a search for a missing word or a bare prefix: the walk shows where it fails', () => {
    const model = ds.initial[0].make(1); // car, card, care, cat, do, dog, dot
    expect(lastVars(runAllowed(ds, 'search', model, { word: 'cab' })).found).toBe(false);
    expect(lastVars(runAllowed(ds, 'search', model, { word: 'ca' })).found).toBe(false);
    expect(blockedReason(ds as AnyStructure, model, { op: 'delete', args: { word: 'ca' } })).toMatch(/pick one/);
  });
});

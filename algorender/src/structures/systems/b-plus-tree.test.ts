import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay } from '@/components/explorer/operations';
import type { AnyStructure, Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { bptDelete, bptInsert, bptRange, bptSearch, height, keysOf, leafChain, problems, type BPlusTree } from '@/systems/bplus-tree';
import type { MarkKey } from '@/viz/marks';
import { layoutTree } from '@/viz/tree/layout';
import { parents } from '@/viz/tree/tracer';
import { linkId, type TreeState } from '@/viz/tree/types';
import { bPlusTree as ds } from './b-plus-tree';

type Model = BPlusTree<string>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Every id a frame points at exists, cells are unique, links join consecutive leaves, and the drawing has no overlaps. */
function expectWellFormed(state: TreeState) {
  const cells = Object.values(state.nodes).flatMap((n) => n.cells.map((c) => c.id));
  expect(new Set(cells).size).toBe(cells.length);
  const links = (state.links ?? []).map((l) => linkId(l.from, l.to));
  const known = new Set([...Object.keys(state.nodes), ...cells, ...links]);
  for (const id of Object.keys(state.marks)) expect(known.has(id), `marked id ${id}`).toBe(true);
  const parent = parents(state);
  expect(Object.keys(state.nodes).length).toBe(state.root == null ? 0 : parent.size + 1);
  for (const child of state.pathEdges) expect(parent.has(child)).toBe(true);
  if (state.probe) expect(state.nodes[state.probe.at]).toBeDefined();
  expect(state.description.length).toBeGreaterThan(0);

  const layout = layoutTree(state);
  const boxes = Object.values(layout.boxes);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      if (a.depth !== b.depth) continue;
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      expect(r.x - r.left - (l.x + l.right)).toBeGreaterThanOrEqual(layout.metrics.gap - 1e-6);
    }
  // Links run left to right between nodes on one level.
  for (const l of state.links ?? []) {
    expect(layout.boxes[l.from].depth).toBe(layout.boxes[l.to].depth);
    expect(layout.boxes[l.from].x).toBeLessThan(layout.boxes[l.to].x);
  }
}

const used = new Set<MarkKey>();

/** Runs an operation with every generic check, and returns its frames and result. */
function runOp(opId: string, model: Model, args: Args) {
  const spec = ds.operations.find((o) => o.id === opId)!;
  deepFreeze(model);
  const before = JSON.stringify(model);
  const { frames, result } = recordOperation<TreeState, Model>(spec.run(model, args));
  expect(JSON.stringify(model)).toBe(before);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThan(60);
  let prev: Record<string, number> = {};
  frames.forEach((f: Frame<TreeState>, i) => {
    expect(f.note.trim()).not.toBe('');
    expect(f.note).not.toMatch(/undefined|NaN|\[\]/);
    expect(f.line).not.toBeNull();
    expect(spec.pseudocode[f.line!]?.trim()).toBeTruthy();
    expect(Object.keys(f.stats).sort()).toEqual(ds.stats.map((s) => s.key).sort());
    for (const [k, v] of Object.entries(f.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
    prev = f.stats;
    const c = f.checkpoint;
    if (c) {
      expect(c.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.answer >= 0 && c.answer < c.choices.length).toBe(true);
      expect(i).toBeLessThan(frames.length - 1);
      if (c.choices[c.answer].length > 3) expect(f.note).not.toContain(c.choices[c.answer]);
    }
    for (const m of Object.values(f.state.marks)) used.add(m);
    expectWellFormed(f.state);
  });
  const last = frames[frames.length - 1].state;
  const settled = ds.snapshot(result!);
  expect({ root: last.root, nodes: last.nodes, links: last.links }).toEqual({ root: settled.root, nodes: settled.nodes, links: settled.links });
  return { frames, result: result! };
}

const start = (id: string, seed = 1) => ds.initial.find((s) => s.id === id)!.make(seed);
const checkpoints = (frames: readonly Frame<TreeState>[]) => frames.filter((f) => f.checkpoint).map((f) => f.checkpoint!);

const call = fc.record({
  op: fc.constantFrom('insert', 'delete', 'search', 'range'),
  key: fc.integer({ min: 1, max: 60 }),
  span: fc.integer({ min: 0, max: 30 }),
  pick: fc.nat(),
});

describe('b-plus-tree', () => {
  it('matches the model under random operations, with well-formed frames and only the explorer’s allowed calls', () => {
    fc.assert(
      fc.property(fc.constantFrom('order-4', 'order-3', 'order-6', 'empty', 'random'), fc.integer({ min: 0, max: 500 }), fc.array(call, { maxLength: 25 }), (init, seed, calls) => {
        let model = start(init, seed);
        for (const c of calls) {
          let args: Args;
          if (c.op === 'delete') {
            const keys = keysOf(model);
            if (keys.length === 0) {
              expect(blockedReason(ds as AnyStructure, model, { op: 'delete', args: { key: '1' } })).toBeTruthy();
              continue;
            }
            args = { key: String(keys[c.pick % keys.length]) };
          } else if (c.op === 'range') args = { from: c.key, to: c.key + c.span };
          else args = { key: c.key };
          if (blockedReason(ds as AnyStructure, model, { op: c.op, args })) {
            expect(c.op === 'insert' ? model.size >= 30 : model.root == null).toBe(true);
            continue;
          }
          const { frames, result } = runOp(c.op, model, args);
          const last = frames[frames.length - 1];
          if (c.op === 'insert') expect(result).toEqual(bptInsert(model, c.key, `row ${c.key}`));
          else if (c.op === 'delete') expect(result).toEqual(bptDelete(model, Number(args.key)));
          else expect(result).toBe(model);
          if (c.op === 'search') {
            expect(last.vars.found).toBe(bptSearch(model, c.key).value != null);
            expect(last.stats.pages).toBe(height(model));
          }
          if (c.op === 'range') {
            const want = bptRange(model, c.key, c.key + c.span);
            expect(last.state.output?.items).toEqual(want.entries.map(([k]) => String(k)));
            expect(last.stats.pages).toBe(want.pages);
            const q = checkpoints(frames).at(-1)!;
            expect(q.choices[q.answer]).toBe(want.leaves >= 5 ? '5 or more' : String(want.leaves));
          }
          model = result;
          expect(problems(model)).toEqual([]);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('copies a leaf’s first right key up on a split, keeping it in the leaf, and asks which one honestly', () => {
    let m = start('empty');
    for (const key of [10, 20, 30]) m = runOp('insert', m, { key }).result;
    const { frames, result } = runOp('insert', m, { key: 40 });
    expect(frames.at(-1)!.stats.splits).toBe(1);
    const end = frames.at(-1)!.state;
    expect(end.nodes[end.root!].cells.map((c) => c.id)).toEqual(['s30']);
    expect(Object.values(end.nodes).flatMap((n) => n.cells.map((c) => c.id))).toContain('k30');
    const q = checkpoints(frames).find((c) => c.question.startsWith('Which key is copied up'))!;
    expect(q.choices[q.answer]).toBe('30');
    expect(end.links).toEqual([{ from: leafChain(result)[0], to: leafChain(result)[1] }]);
    const split = checkpoints(frames).find((c) => c.question.startsWith('Will'))!;
    expect(split.choices[split.answer]).toBe('Yes, it overflows');
  });

  it('moves an internal node’s middle separator up (the same cell glides)', () => {
    let m = start('empty');
    for (const key of [10, 20, 30, 40]) m = runOp('insert', m, { key }).result;
    // Order 4: inserting 50 and 60 fills the root [30, 50] ... until it splits.
    let moved = false;
    for (const key of [50, 60, 70, 80, 90, 95]) {
      const { frames, result } = runOp('insert', m, { key });
      const q = checkpoints(frames).find((c) => c.question.startsWith('Which separator moves up'));
      if (q) {
        const sep = Number(q.choices[q.answer]);
        const end = frames.at(-1)!.state;
        expect(end.nodes[end.root!].cells.map((c) => c.id)).toContain(`s${sep}`);
        moved = true;
      }
      m = result;
    }
    expect(moved).toBe(true);
    expect(height(m)).toBe(3);
  });

  it('keeps a separator copy when deleting its key, and exercises borrows, merges and a shrinking root', () => {
    const m = start('order-4');
    const sep = (m.pages[m.root!].keys as number[])[0];
    const { frames, result } = runOp('delete', m, { key: String(sep) });
    expect(frames.some((f) => f.note.includes('still sits above as a separator'))).toBe(true);
    expect(keysOf(result)).not.toContain(sep);
    // Searching for it again says the separator proves nothing.
    expect(runOp('search', result, { key: sep }).frames.at(-1)!.note).toMatch(/leftover separator/);

    const seen = { borrow: 0, merge: 0, shrink: 0 };
    for (let seed = 0; seed < 20; seed++) {
      let t = start('random', seed);
      for (const key of keysOf(t)) {
        const run = runOp('delete', t, { key: String(key) });
        const notes = run.frames.map((f) => f.note).join(' ');
        if (/sibling can spare/.test(notes)) seen.borrow++;
        if (/Neither sibling can spare/.test(notes)) seen.merge++;
        if (/a level shorter/.test(notes)) seen.shrink++;
        t = run.result;
      }
      expect(t.root).toBeNull();
    }
    expect(seen.borrow).toBeGreaterThan(0);
    expect(seen.merge).toBeGreaterThan(0);
    expect(seen.shrink).toBeGreaterThan(0);
  });

  it('scans a range along the links, marking the links it follows', () => {
    const m = start('order-4');
    const { frames } = runOp('range', m, { from: 20, to: 60 });
    const last = frames.at(-1)!;
    expect(last.state.output?.items).toEqual(['20', '25', '30', '35', '40', '50', '60']);
    const followed = Object.entries(last.state.marks).filter(([id]) => id.includes('>'));
    expect(followed.length).toBeGreaterThan(0);
    expect(last.stats.pages).toBe(bptRange(m, 20, 60).pages);
    expect(blockedReason(ds as AnyStructure, m, { op: 'range', args: { from: 50, to: 10 } })).toMatch(/From/);
  });

  it('starts from valid, reproducible trees, draws them tidily, and replays operations from the URL', () => {
    for (const s of ds.initial) {
      for (const seed of [1, 7, 12345]) {
        const m = s.make(seed);
        expect(s.make(seed)).toEqual(m);
        expect(problems(m)).toEqual([]);
        const state = ds.snapshot(m);
        expectWellFormed(state);
        expect(state.links ?? []).toHaveLength(Math.max(0, leafChain(m).length - 1));
      }
    }
    expect(height(start('order-6'))).toBe(2);
    expect(height(start('order-3'))).toBeGreaterThanOrEqual(3);
    const ops = parseOps('insert:36;range:20:45;delete:50;search:50', ds);
    expect(ops).toHaveLength(4);
    const { model, applied } = replay(ds, start('order-4'), ops);
    expect(applied).toHaveLength(4);
    expect(keysOf(model as Model)).toContain(36);
    expect(keysOf(model as Model)).not.toContain(50);
    expect(blockedReason(ds, start('order-4'), { op: 'delete', args: { key: '99' } })).toMatch(/pick one/);
  });

  it('is a tree structure with short pseudo-code, a legend of exactly the marks it uses, real experiments, and varied answers', () => {
    expect(ds.kind).toBe('structure');
    expect(ds.view).toBe('tree');
    expect(ds.legend[0]).toHaveProperty('neutral');
    for (const op of ds.operations) for (const line of op.pseudocode) expect(line.length, line).toBeLessThanOrEqual(40);
    const ids = new Set(ds.initial.map((s) => s.id));
    for (const x of ds.content.experiments) expect(ids.has(x.example), x.example).toBe(true);
    for (const op of ds.operations) expect(op.disabledReason?.(start('empty')) ?? null, op.id)[op.id === 'insert' ? 'toBeNull' : 'toBeTruthy']();

    // Exercise every operation broadly, then compare marks used with the legend.
    const positions = new Set<number>();
    for (let seed = 0; seed < 6; seed++) {
      let m = start('random', seed);
      for (const key of [5, 33, 47, 61, 88]) {
        const r = runOp('insert', m, { key });
        checkpoints(r.frames).forEach((c) => positions.add(c.answer));
        m = r.result;
      }
      for (const [from, to] of [[1, 99], [30, 40]]) runOp('range', m, { from, to }).frames.forEach((f) => f.checkpoint && positions.add(f.checkpoint.answer));
      runOp('search', m, { key: keysOf(m)[2] });
      for (const key of keysOf(m).slice(0, 8)) m = runOp('delete', m, { key: String(key) }).result;
    }
    expect(positions.size).toBeGreaterThan(2);
    const legend = new Set(ds.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : [])));
    expect([...used].sort()).toEqual([...legend].sort());
  });

  it('keeps the experiments’ claims true', () => {
    const m = start('order-4');
    const ins = runOp('insert', m, { key: 36 });
    expect(ins.frames.at(-1)!.stats.splits).toBeGreaterThan(0);
    const separators = Object.values(m.pages).flatMap((p) => (p.kind === 'internal' ? p.keys : []));
    expect(separators).toEqual(expect.arrayContaining([30, 50]));
    expect(runOp('search', start('order-6'), { key: 45 }).frames.at(-1)!.stats.pages).toBe(2);
    let small = start('order-3');
    const d1 = runOp('delete', small, { key: '10' });
    expect(d1.frames.some((f) => /sibling can spare/.test(f.note))).toBe(true);
    small = d1.result;
    const d2 = runOp('delete', small, { key: '20' });
    expect(d2.frames.some((f) => /Neither sibling/.test(f.note))).toBe(true);
  });
});

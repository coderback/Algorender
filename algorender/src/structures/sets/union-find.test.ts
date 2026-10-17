import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseArg } from '@/components/explorer/operations';
import type { Args, StructureModule } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import { layoutTree } from '@/viz/tree/layout';
import { parents } from '@/viz/tree/tracer';
import type { TreeState } from '@/viz/tree/types';
import { setStructures } from '.';
import { depthOf, MAX_ELEMENTS, nodeId, rootOf, setsOf, singletons, unionFind, type UnionFind } from './union-find';

const ds = unionFind as StructureModule<UnionFind, TreeState>;

// ───────────────────────────── harness ─────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Every id a frame marks exists; the forest reaches every node; the table and arrows are drawn. */
function expectWellFormed(state: TreeState, m: UnionFind) {
  const tableIds = (state.table ?? []).flatMap((r) => r.cells.map((c) => c.id));
  const cellIds = Object.values(state.nodes).flatMap((n) => n.cells.map((c) => c.id));
  const known = new Set([...Object.keys(state.nodes), ...cellIds, ...tableIds]);
  for (const id of Object.keys(state.marks)) expect(known.has(id), `marked id ${id}`).toBe(true);
  const parent = parents(state);
  expect(parent.size + state.roots!.length).toBe(Object.keys(state.nodes).length);
  expect(state.root).toBe(state.roots![0] ?? null);
  for (const child of state.pathEdges) expect(parent.has(child)).toBe(true);
  expect(state.parentArrows).toBe(true);
  expect(state.table!.map((r) => r.cells.length)).toEqual([m.labels.length, m.labels.length, m.labels.length]);
  expect(state.description.length).toBeGreaterThan(0);
}

/** Forest layout: same-depth nodes keep their gap (wider between trees), and levels never touch. */
function expectTidyForest(state: TreeState) {
  const layout = layoutTree(state);
  const boxes = Object.values(layout.boxes);
  expect(boxes).toHaveLength(Object.keys(state.nodes).length);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      if (a.depth === b.depth) {
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        expect(r.x - r.left - (l.x + l.right)).toBeGreaterThanOrEqual(layout.metrics.gap - 1e-6);
      } else expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual((a.h + b.h) / 2);
    }
  }
  // Roots are side by side in element order.
  const xs = state.roots!.map((id) => layout.boxes[id].x);
  for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThan(xs[k - 1]);
}

type Run = { result: UnionFind; frames: Frame<TreeState>[] };

/**
 * Runs one operation with every generic check: the frozen input model is
 * unchanged, every frame is narrated with a real line of this operation's
 * pseudo-code, counters never go backwards, checkpoints are well-formed and
 * don't leak, states are well-formed, and the last frame is the settled model.
 */
function runOp(opId: string, model: UnionFind, args: Args): Run {
  const spec = ds.operations.find((o) => o.id === opId)!;
  deepFreeze(model);
  const before = JSON.stringify(model);
  const { frames, result } = recordOperation(spec.run(model, args));
  expect(JSON.stringify(model)).toBe(before);
  expect(frames.length).toBeGreaterThan(0);
  const statKeys = ds.stats.map((s) => s.key).sort();
  let prev: Record<string, number> = {};
  frames.forEach((frame, i) => {
    const at = `${opId} frame ${i}: ${frame.note}`;
    expect(frame.note.trim().length, at).toBeGreaterThan(0);
    expect(frame.line, at).not.toBeNull();
    expect(spec.pseudocode[frame.line!]?.trim(), at).toBeTruthy();
    expect(Object.keys(frame.stats).sort()).toEqual(statKeys);
    for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
    prev = frame.stats;
    const c = frame.checkpoint;
    if (c) {
      expect(c.choices.length, at).toBeGreaterThanOrEqual(2);
      expect(c.choices.length, at).toBeLessThanOrEqual(4);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(c.answer).toBeLessThan(c.choices.length);
      expect(i, at).toBeLessThan(frames.length - 1);
      if (c.choices[c.answer].length > 3) expect(frame.note, at).not.toContain(c.choices[c.answer]);
    }
    expectWellFormed(frame.state, model);
  });
  const last = frames[frames.length - 1].state;
  const settled = ds.snapshot(result);
  expect({ roots: last.roots, nodes: last.nodes, table: last.table }).toEqual({ roots: settled.roots, nodes: settled.nodes, table: settled.table });
  return { result, frames };
}

const lastVars = (run: Run) => run.frames[run.frames.length - 1].vars;

/** The reference: a plain partition, merged by relabelling. */
class Partition {
  private readonly of: number[];
  constructor(n: number) {
    this.of = Array.from({ length: n }, (_, i) => i);
  }
  static from(m: UnionFind) {
    const p = new Partition(m.labels.length);
    m.labels.forEach((_, i) => (p.of[i] = rootOf(m, i)));
    return p;
  }
  same(a: number, b: number) {
    return this.of[a] === this.of[b];
  }
  join(a: number, b: number) {
    const [x, y] = [this.of[a], this.of[b]];
    for (let i = 0; i < this.of.length; i++) if (this.of[i] === y) this.of[i] = x;
  }
  sets() {
    const by = new Map<number, number[]>();
    this.of.forEach((s, i) => by.set(s, [...(by.get(s) ?? []), i]));
    return [...by.values()].sort((a, b) => a[0] - b[0]);
  }
}

/** Ranks bound heights, grow strictly towards the root, and a tree of rank r holds at least 2^r elements. */
function expectRankInvariants(m: UnionFind) {
  const n = m.labels.length;
  for (let i = 0; i < n; i++) if (m.parent[i] !== i) expect(m.rank[m.parent[i]]).toBeGreaterThan(m.rank[i]);
  for (const set of setsOf(m)) {
    const root = rootOf(m, set[0]);
    const height = Math.max(...set.map((i) => depthOf(m, i)));
    expect(height).toBeLessThanOrEqual(m.rank[root]);
    expect(set.length).toBeGreaterThanOrEqual(2 ** m.rank[root]);
    expect(height).toBeLessThanOrEqual(Math.floor(Math.log2(set.length)));
  }
}

const start = (id: string, seed = 3) => ds.initial.find((s) => s.id === id)!.make(seed);
const label = (m: UnionFind, i: number) => m.labels[i];

// ───────────────────────────── module ─────────────────────────────

describe('union-find', () => {
  it('is a registered tree-view structure whose legend starts with the neutral entry', () => {
    expect(setStructures).toContain(unionFind);
    expect(ds.view).toBe('tree');
    expect(ds.legend[0]).toHaveProperty('neutral');
    for (const op of ds.operations) for (const line of op.pseudocode) expect([...line].length, line).toBeLessThanOrEqual(42);
    const ids = new Set(ds.initial.map((s) => s.id));
    for (const x of ds.content.experiments) expect(ids.has(x.example), x.example).toBe(true);
  });

  it('builds every starting example as a valid, tidy, rank-balanced forest', () => {
    for (const example of ds.initial) {
      for (const seed of [1, 7, 12345]) {
        const m = example.make(seed);
        expect(m.labels.length).toBeLessThanOrEqual(MAX_ELEMENTS);
        const state = ds.snapshot(m);
        expectWellFormed(state, m);
        expectTidyForest(state);
        expectRankInvariants(m);
      }
    }
    expect(setsOf(start('singletons'))).toHaveLength(8);
    expect(setsOf(start('two-sets')).map((s) => s.length)).toEqual([5, 5]);
    // The tall example is as tall as union by rank allows for 8 elements: 7 is three links below the root.
    expect(depthOf(start('tall'), 7)).toBe(3);
  });

  it('offers exactly the existing elements as choices, so a missing element cannot be named', () => {
    for (const example of ds.initial) {
      const m = example.make(1);
      for (const op of ds.operations) {
        expect(op.args.length).toBeGreaterThan(0);
        for (const a of op.args) {
          expect(a.type).toBe('choice');
          if (a.type !== 'choice') continue;
          expect(a.options(m)).toEqual(m.labels);
          for (const l of m.labels) expect(parseArg(a, l, m)).toBe(l);
          expect(parseArg(a, 'Z', m)).toBeNull();
          expect(parseArg(a, String(m.labels.length), m)).toBeNull();
        }
        expect(op.disabledReason?.(m) ?? null).toBeNull();
      }
    }
  });

  it('matches a reference partition under random finds, unions and connectivity checks', () => {
    const ops = fc.array(
      fc.record({ op: fc.constantFrom('find', 'union', 'union', 'connected'), a: fc.nat(9), b: fc.nat(9) }),
      { minLength: 1, maxLength: 25 },
    );
    fc.assert(
      fc.property(fc.constantFrom('singletons', 'two-sets', 'tall', 'random'), fc.nat(1000), ops, (init, seed, calls) => {
        let model = start(init, seed);
        const ref = Partition.from(model);
        const n = model.labels.length;
        for (const { op, a: ra, b: rb } of calls) {
          const [a, b] = [ra % n, rb % n];
          const args: Args = op === 'find' ? { x: label(model, a) } : { a: label(model, a), b: label(model, b) };
          const before = model;
          const run = runOp(op, model, args);
          model = run.result;
          if (op === 'find') {
            // Path compression: everything on the old path now points straight at the root.
            const root = rootOf(before, a);
            for (let y = a; before.parent[y] !== y; y = before.parent[y]) expect(model.parent[y]).toBe(root);
            expect(lastVars(run).r).toBe(label(model, root));
          }
          if (op === 'connected') expect(lastVars(run).connected).toBe(ref.same(a, b));
          if (op === 'union') ref.join(a, b);
          expect(setsOf(model)).toEqual(ref.sets());
          expectRankInvariants(model);
          // Only parents and ranks change.
          expect(model.labels).toEqual(before.labels);
        }
        expectTidyForest(ds.snapshot(model));
      }),
      { numRuns: 60 },
    );
  });

  it('keeps every tree no taller than log2 n under any sequence of unions from singletons', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(9), fc.nat(9)), { maxLength: 30 }), (pairs) => {
        let model = singletons(MAX_ELEMENTS);
        for (const [a, b] of pairs) {
          model = runOp('union', model, { a: label(model, a), b: label(model, b) }).result;
          for (let i = 0; i < model.labels.length; i++) expect(depthOf(model, i)).toBeLessThanOrEqual(Math.log2(MAX_ELEMENTS));
        }
        expectRankInvariants(model);
      }),
      { numRuns: 60 },
    );
  });

  it('flattens the tall tree: find(7) re-points 7 and 6, and a second find(7) takes one hop', () => {
    const tall = start('tall');
    const first = runOp('find', tall, { x: '7' });
    const s = (r: Run) => r.frames[r.frames.length - 1].stats;
    expect(s(first)).toEqual({ finds: 1, hops: 3, repointed: 2, links: 0 });
    expect(first.result.parent[7]).toBe(0);
    expect(first.result.parent[6]).toBe(0);
    // Re-parenting animates: node ids stay, and the arrow from 7 now ends at the root.
    const after = first.frames[first.frames.length - 1].state;
    expect(parents(after).get(nodeId(7))).toBe(nodeId(0));
    expect(first.frames.filter((f) => f.state.marks[nodeId(7)] === 'write')).toHaveLength(1);
    const second = runOp('find', first.result, { x: '7' });
    expect(s(second)).toEqual({ finds: 1, hops: 1, repointed: 0, links: 0 });
    expect(second.result).toEqual(first.result);
  });

  it('attaches the lower-rank root under the other, breaking ties towards a, and raises the rank only on a tie', () => {
    const two = start('two-sets');
    const tie = runOp('union', two, { a: '3', b: '8' });
    expect(tie.result.parent[5]).toBe(0);
    expect(tie.result.rank[0]).toBe(3);
    const reversed = runOp('union', two, { a: '8', b: '3' });
    expect(reversed.result.parent[0]).toBe(5);
    expect(reversed.result.rank[5]).toBe(3);
    // Lower rank goes under, whichever argument it came from.
    const small = runOp('union', start('tall'), { a: '9', b: '1' });
    expect(small.result.parent[9]).toBe(0);
    expect(small.result.rank[0]).toBe(3);
    const same = runOp('union', tie.result, { a: '1', b: '9' });
    expect(same.frames[same.frames.length - 1].line).toBe(2);
    expect(same.frames[same.frames.length - 1].stats.links).toBe(0);
    expect(setsOf(same.result)).toEqual(setsOf(tie.result));
  });

  it('answers its predictions correctly', () => {
    fc.assert(
      fc.property(fc.constantFrom('two-sets', 'tall', 'random'), fc.nat(1000), fc.nat(9), fc.nat(9), fc.constantFrom('find', 'union', 'connected'), (init, seed, a, b, op) => {
        const model = start(init, seed);
        const args: Args = op === 'find' ? { x: label(model, a) } : { a: label(model, a), b: label(model, b) };
        const { frames } = runOp(op, model, args);
        frames.forEach((f, i) => {
          const c = f.checkpoint;
          if (!c) return;
          const answer = c.choices[c.answer];
          const later = frames.slice(i + 1);
          if (c.question.startsWith('Which root does find(')) {
            const x = model.labels.indexOf(/find\((.+)\) reach\?$/.exec(c.question)![1]);
            expect(answer).toBe(label(model, rootOf(model, x)));
          } else if (c.question === 'How many parent pointers will path compression change?') {
            const until = later.findIndex((g) => g.line !== f.line! + 3);
            expect(later.slice(0, until).length).toBe(Number(answer));
          } else if (c.question === 'Which root becomes the child?') {
            const linked = later.find((g) => g.note.includes(' goes under '))!;
            expect(linked.note).toContain(`${answer} goes under`);
          } else {
            expect(c.question).toMatch(/^Are \d and \d already (connected|in the same set)\?$/);
            expect(answer).toBe(rootOf(model, a) === rootOf(model, b) ? 'Yes' : 'No');
          }
        });
      }),
      { numRuns: 80 },
    );
  });

  it('lists exactly the marks its operations use in its legend', () => {
    const used = new Set<MarkKey>();
    const add = (r: Run) => r.frames.forEach((f) => Object.values(f.state.marks).forEach((m) => used.add(m)));
    for (const example of ds.initial) {
      const m = example.make(5);
      for (const [a, b] of [
        [0, 1],
        [3, 8],
        [7, 9],
        [2, 2],
      ]) {
        const [x, y] = [label(m, a % m.labels.length), label(m, b % m.labels.length)];
        add(runOp('find', m, { x: y }));
        add(runOp('union', m, { a: x, b: y }));
        add(runOp('connected', m, { a: x, b: y }));
      }
    }
    const listed = ds.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
    expect([...used].sort()).toEqual([...listed].sort());
  });

  it('varies where the right answer sits among the choices', () => {
    const positions = new Set<number>();
    const m = start('two-sets');
    for (const [op, args] of [
      ['union', { a: '3', b: '8' }],
      ['union', { a: '1', b: '2' }],
      ['connected', { a: '4', b: '9' }],
      ['find', { x: '8' }],
    ] as const) {
      for (const f of runOp(op, m, args).frames) if (f.checkpoint) positions.add(f.checkpoint.answer);
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});

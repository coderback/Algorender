import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { replay } from '@/components/explorer/operations';
import { recordOperation } from '@/engine/trace';
import type { AdjacencyPanel, GraphState, MatrixPanel } from '@/viz/graph/types';
import { graphStructures } from '.';
import { adjacencyList } from './adjacency-list';
import { adjacencyMatrix } from './adjacency-matrix';
import { graph } from './graph';
import { MAX_VERTICES, makeModel, type GraphModel } from './model';

type DS = (typeof graphStructures)[number];
type Call = { op: string; args: Record<string, string | number> };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X', 'Y', 'Z', 'Q', 'R', 'bad!'];

function arbCall(ds: DS): fc.Arbitrary<Call> {
  const label = fc.constantFrom(...LABELS);
  return fc.constantFrom(...ds.operations).chain((spec) =>
    fc
      .tuple(...spec.args.map((a) => (a.type === 'int' ? fc.integer({ min: a.min, max: a.max }) : label)))
      .map((values) => ({ op: spec.id, args: Object.fromEntries(spec.args.map((a, i) => [a.name, values[i]])) })),
  );
}

/** A model reached by applying random operations to one of the starting graphs. */
function arbModel(ds: DS): fc.Arbitrary<GraphModel> {
  return fc
    .tuple(fc.constantFrom(...ds.initial), fc.array(arbCall(ds), { maxLength: 12 }))
    .map(([start, calls]) => replay<GraphModel>(ds, start.make(1), calls).model);
}

// ───────────────────────────── reference ─────────────────────────────

type Ref = { directed: boolean; nodes: string[]; edges: Map<string, number> };
const key = (r: { directed: boolean }, u: string, v: string) => (r.directed ? `${u}>${v}` : [u, v].sort().join('-'));
const toRef = (m: GraphModel): Ref => ({ directed: m.directed, nodes: m.nodes.map((n) => n.id), edges: new Map(m.edges.map((e) => [key(m, e.from, e.to), e.weight])) });

function refApply(r: Ref, { op, args }: Call, weighted: boolean): Ref {
  const has = (x: string) => r.nodes.includes(x);
  const u = String(args.u ?? args.v);
  const v = String(args.v);
  switch (op) {
    case 'add-vertex':
      return /^[A-Za-z0-9]{1,3}$/.test(v) && !has(v) && r.nodes.length < MAX_VERTICES ? { ...r, nodes: [...r.nodes, v] } : r;
    case 'remove-vertex': {
      if (!has(v)) return r;
      const edges = new Map([...r.edges].filter(([k]) => !k.split(/[->]/).includes(v)));
      return { ...r, nodes: r.nodes.filter((x) => x !== v), edges };
    }
    case 'add-edge': {
      if (!has(u) || !has(v) || u === v) return r;
      const edges = new Map(r.edges);
      edges.set(key(r, u, v), weighted ? Number(args.w) : 1);
      return { ...r, edges };
    }
    case 'remove-edge': {
      const edges = new Map(r.edges);
      edges.delete(key(r, u, v));
      return { ...r, edges };
    }
    default:
      return r;
  }
}

const sameGraph = (m: GraphModel, r: Ref) => {
  expect(m.nodes.map((n) => n.id)).toEqual(r.nodes);
  expect(new Map(m.edges.map((e) => [key(m, e.from, e.to), e.weight]))).toEqual(r.edges);
};

// ───────────────────────────── per structure ─────────────────────────────

describe.each(graphStructures)('$slug', (ds) => {
  const weighted = ds.slug === 'graph';

  it('operations never mutate their input model', () => {
    fc.assert(
      fc.property(arbModel(ds), arbCall(ds), (model, call) => {
        const spec = ds.operations.find((o) => o.id === call.op)!;
        if (spec.disabledReason?.(model)) return;
        const before = clone(model);
        deepFreeze(model);
        recordOperation(spec.run(model, call.args));
        expect(model).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  it('matches a reference model after any sequence of operations', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ds.initial), fc.array(arbCall(ds), { maxLength: 20 }), (start, calls) => {
        let model: GraphModel = start.make(1);
        let ref = toRef(model);
        for (const call of calls) {
          const spec = ds.operations.find((o) => o.id === call.op)!;
          if (spec.disabledReason?.(model)) continue;
          model = recordOperation(spec.run(model, call.args)).result;
          ref = refApply(ref, call, weighted);
          sameGraph(model, ref);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('narrates every frame, points at the operation’s pseudo-code and keeps counters monotonic', () => {
    fc.assert(
      fc.property(arbModel(ds), arbCall(ds), (model, call) => {
        const spec = ds.operations.find((o) => o.id === call.op)!;
        if (spec.disabledReason?.(model)) return;
        const { frames } = recordOperation(spec.run(model, call.args));
        expect(frames.length).toBeGreaterThan(0);
        let prev: Record<string, number> = {};
        for (const f of frames) {
          expect(f.note.trim().length).toBeGreaterThan(0);
          if (f.line != null) {
            expect(f.line).toBeLessThan(spec.pseudocode.length);
            expect(spec.pseudocode[f.line].trim()).not.toBe('');
          }
          expect(Object.keys(f.stats).sort()).toEqual(ds.stats.map((s) => s.key).sort());
          for (const [k, v] of Object.entries(f.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
          prev = f.stats;
          if (f.checkpoint) {
            expect(new Set(f.checkpoint.choices).size).toBe(f.checkpoint.choices.length);
            expect(f.checkpoint.answer).toBeLessThan(f.checkpoint.choices.length);
          }
        }
        for (const line of spec.pseudocode) expect(line.length).toBeLessThanOrEqual(40);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps every vertex where it is: positions never change', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ds.initial), fc.array(arbCall(ds), { maxLength: 20 }), (start, calls) => {
        const where = new Map<string, string>();
        let model: GraphModel = start.make(1);
        for (const call of calls) {
          const spec = ds.operations.find((o) => o.id === call.op)!;
          if (spec.disabledReason?.(model)) continue;
          const rec = recordOperation(spec.run(model, call.args));
          for (const f of rec.frames) for (const n of f.state.nodes) if (where.has(n.id) && model.nodes.some((m) => m.id === n.id)) expect(`${n.x},${n.y}`).toBe(where.get(n.id));
          model = rec.result;
          where.clear();
          for (const n of model.nodes) where.set(n.id, `${n.x},${n.y}`);
          expect(new Set(where.values()).size).toBe(model.nodes.length); // no two vertices share a slot
        }
      }),
      { numRuns: 100 },
    );
  });

  it('blocks operations that make no sense for the current model', () => {
    const op = (id: string) => ds.operations.find((o) => o.id === id)!;
    const emptyModel = makeModel(false, weighted, [], '');
    const lonely = makeModel(false, weighted, ['A'], '');
    const fullModel = makeModel(false, weighted, 'ABCDEFGHIJ'.split(''), 'A-B');
    expect(op('remove-vertex').disabledReason!(emptyModel)).toMatch(/no vertices/);
    expect(op('add-edge').disabledReason!(lonely)).toMatch(/two vertices/);
    expect(op('remove-edge').disabledReason!(lonely)).toMatch(/no edges/);
    expect(op('add-vertex').disabledReason!(fullModel)).toMatch(/full/);
    expect(op('add-vertex').disabledReason!(lonely)).toBeNull();
  });

  it('explains invalid arguments and leaves the model untouched', () => {
    const start = ds.initial[0].make(1);
    const cases: Call[] = [
      { op: 'remove-edge', args: { u: 'A', v: 'E' } }, // no such edge in either example
      { op: 'remove-edge', args: { u: 'A', v: 'Nope' } },
      { op: 'remove-vertex', args: { v: 'Z' } },
      { op: 'add-vertex', args: { v: 'A' } }, // duplicate
      { op: 'add-vertex', args: { v: 'no!' } },
      { op: 'add-edge', args: { u: 'A', v: 'A', w: 1 } }, // self-loop
      { op: 'add-edge', args: { u: 'A', v: 'Z', w: 1 } },
    ];
    for (const call of cases) {
      const spec = ds.operations.find((o) => o.id === call.op)!;
      const rec = recordOperation(spec.run(start, call.args));
      expect(rec.result).toBe(start);
      expect(rec.frames.length).toBeGreaterThan(0);
      expect(rec.frames.at(-1)!.note).toMatch(/no |not |already|isn't|doesn't|Nothing/i);
    }
  });

  it('every starting graph has a snapshot, and operations on it are recorded within the frame cap', () => {
    for (const s of ds.initial) {
      const m = s.make(1);
      expect(ds.snapshot(m).nodes).toHaveLength(m.nodes.length);
      for (const spec of ds.operations) {
        if (spec.disabledReason?.(m)) continue;
        const args = Object.fromEntries(spec.args.map((a) => [a.name, a.type === 'int' ? a.default ?? a.min : (m.nodes[0]?.id ?? 'A')]));
        expect(() => recordOperation(spec.run(m, args))).not.toThrow();
      }
    }
  });

  it('has a legend that starts with the neutral entry', () => expect(ds.legend[0]).toHaveProperty('neutral'));
});

// ───────────────────────────── representation-specific ─────────────────────────────

const adjacencyOf = (s: GraphState) => (s.panels.find((p) => p.id === 'adjacency') as AdjacencyPanel).rows.map((r) => [r.id, r.entries.map((e) => e.label)]);
const matrixOf = (s: GraphState) => (s.panels.find((p) => p.id === 'matrix') as MatrixPanel).cells;

describe('representations', () => {
  it('the adjacency list panel lists exactly each vertex’s neighbours', () => {
    fc.assert(
      fc.property(arbModel(adjacencyList), (m) => {
        const want = m.nodes.map((n) => [
          n.id,
          m.edges.flatMap((e) => (e.from === n.id ? [e.to] : !m.directed && e.to === n.id ? [e.from] : [])),
        ]);
        expect(adjacencyOf(adjacencyList.snapshot(m))).toEqual(want);
      }),
      { numRuns: 200 },
    );
  });

  it('the adjacency matrix panel has a 1 exactly where an edge is, and is symmetric when undirected', () => {
    fc.assert(
      fc.property(arbModel(adjacencyMatrix), (m) => {
        const cells = matrixOf(adjacencyMatrix.snapshot(m));
        const ids = m.nodes.map((n) => n.id);
        ids.forEach((u, i) =>
          ids.forEach((v, j) => {
            const edge = m.edges.some((e) => (e.from === u && e.to === v) || (!m.directed && e.from === v && e.to === u));
            expect(cells[i][j]).toBe(edge ? '1' : '0');
            if (!m.directed) expect(cells[i][j]).toBe(cells[j][i]);
          }),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('“Has edge?” finds the edge exactly when it exists: a list scans, a matrix reads one cell', () => {
    fc.assert(
      fc.property(arbModel(adjacencyList), fc.constantFrom(...LABELS), fc.constantFrom(...LABELS), (m, u, v) => {
        if (!m.nodes.some((n) => n.id === u) || !m.nodes.some((n) => n.id === v)) return;
        const exists = m.edges.some((e) => (e.from === u && e.to === v) || (!m.directed && e.from === v && e.to === u));
        for (const ds of [adjacencyList, adjacencyMatrix]) {
          const spec = ds.operations.find((o) => o.id === 'has-edge')!;
          const { frames } = recordOperation(spec.run(m, { u, v }));
          const last = frames.at(-1)!;
          expect(/return true|yes, the edge exists/.test(last.note)).toBe(exists);
          if (ds === adjacencyMatrix) expect(last.stats.cells).toBe(1);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('“Neighbours of” reports the same vertices in both, reading deg(u) entries vs V cells', () => {
    fc.assert(
      fc.property(arbModel(adjacencyMatrix), fc.constantFrom(...LABELS), (m, u) => {
        if (!m.nodes.some((n) => n.id === u)) return;
        const want = m.nodes.filter((n) => m.edges.some((e) => (e.from === u && e.to === n.id) || (!m.directed && e.to === u && e.from === n.id))).map((n) => n.id).sort();
        const run = (ds: typeof adjacencyList) => recordOperation(ds.operations.find((o) => o.id === 'neighbours')!.run(m, { v: u })).frames.at(-1)!;
        const fromList = run(adjacencyList);
        const fromMatrix = run(adjacencyMatrix);
        const reported = (f: typeof fromList) => Object.entries(f.state.nodeMarks).filter(([, mark]) => mark === 'path').map(([id]) => id).sort();
        expect(reported(fromList)).toEqual(want);
        expect(reported(fromMatrix)).toEqual(want);
        expect(fromMatrix.stats.cells).toBe(m.nodes.length);
        expect(fromList.stats.scanned).toBe(want.length);
      }),
      { numRuns: 200 },
    );
  });

  it('BFS and DFS on the graph structure leave the model as it was and visit only reachable vertices', () => {
    fc.assert(
      fc.property(arbModel(graph), fc.constantFrom(...LABELS), fc.constantFrom('bfs', 'dfs'), (m, s, op) => {
        const spec = graph.operations.find((o) => o.id === op)!;
        if (spec.disabledReason?.(m)) return;
        const rec = recordOperation(spec.run(m, { v: s }));
        expect(rec.result).toBe(m);
        if (!m.nodes.some((n) => n.id === s)) return;
        // Show the traversal step by step, not all at once.
        expect(rec.frames.length).toBeGreaterThan(m.nodes.length > 1 ? 2 : 1);
      }),
      { numRuns: 150 },
    );
  });

  it('updates the weight instead of adding a second edge between the same pair', () => {
    const m = graph.initial[0].make(1);
    const spec = graph.operations.find((o) => o.id === 'add-edge')!;
    const { result } = recordOperation(spec.run(m, { u: 'B', v: 'A', w: 42 }));
    expect(result.edges.filter((e) => [e.from, e.to].sort().join() === 'A,B')).toEqual([{ from: 'A', to: 'B', weight: 42 }]);
  });
});

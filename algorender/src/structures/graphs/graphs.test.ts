import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay, serializeOps, type OpCall } from '@/components/explorer/operations';
import type { AnyStructure } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { AdjacencyPanel, GraphState, MatrixPanel } from '@/viz/graph/types';
import { graphStructures } from '.';
import { adjacencyList } from './adjacency-list';
import { adjacencyMatrix } from './adjacency-matrix';
import { graph } from './graph';
import { EDGE_ARG, endpoints, MAX_VERTICES, makeModel, VERTEX_ARG, type GraphModel } from './model';

type DS = (typeof graphStructures)[number];
type Call = OpCall;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X', 'Y', 'Z', 'Q', 'R', 'bad!'];
const spec = (ds: AnyStructure, id: string) => ds.operations.find((o) => o.id === id)!;

// ───────────────────────────── calls ─────────────────────────────

/** Raw material for one call: which operation, which option of each choice, a new name and a weight. */
type Seed = { op: number; picks: number[]; label: string; w: number };
const arbSeed: fc.Arbitrary<Seed> = fc.record({
  op: fc.nat(),
  picks: fc.array(fc.nat(), { minLength: 3, maxLength: 3 }),
  label: fc.constantFrom(...LABELS),
  w: fc.integer({ min: 1, max: 99 }),
});

/** A call made only from what the model offers right now: every choice is one of its current options. */
function offered(ds: DS, m: GraphModel, s: Seed): Call {
  const op = ds.operations[s.op % ds.operations.length];
  const args = Object.fromEntries(
    op.args.map((a, k) => {
      if (a.type === 'choice') {
        const options = a.options(m);
        return [a.name, options.length ? options[s.picks[k] % options.length] : ''];
      }
      return [a.name, a.type === 'int' ? s.w : s.label];
    }),
  );
  return { op: op.id, args };
}

/** A call as a hand-edited URL might make it: any names at all, existing or not. */
function invented(ds: DS, s: Seed): Call {
  const op = ds.operations[s.op % ds.operations.length];
  const name = (k: number) => LABELS[s.picks[k] % LABELS.length];
  const args = Object.fromEntries(
    op.args.map((a, k) => {
      if (a.type === 'int') return [a.name, s.w];
      if (a.name === 'e') return [a.name, `${name(k)}${s.w % 2 ? '–' : '→'}${name(k + 1)}`];
      return [a.name, a.type === 'text' ? s.label : name(k)];
    }),
  );
  return { op: op.id, args };
}

/** Applies the calls the explorer would allow, skipping blocked ones, as a learner clicking around would. */
function reach(ds: DS, start: GraphModel, seeds: readonly Seed[]): GraphModel {
  let m = start;
  for (const s of seeds) {
    const call = offered(ds, m, s);
    if (blockedReason(ds, m, call)) continue;
    m = recordOperation(spec(ds, call.op).run(m, call.args)).result;
  }
  return m;
}

/** A model reached by allowed operations from one of the starting graphs. */
const arbModel = (ds: DS) =>
  fc.tuple(fc.constantFrom(...ds.initial), fc.array(arbSeed, { maxLength: 12 })).map(([start, seeds]) => reach(ds, start.make(1), seeds));

// ───────────────────────────── reference ─────────────────────────────

type Ref = { directed: boolean; weighted: boolean; nodes: string[]; edges: Map<string, number> };
const key = (r: { directed: boolean }, u: string, v: string) => (r.directed ? `${u}>${v}` : [u, v].sort().join('-'));
const toRef = (m: GraphModel): Ref => ({
  directed: m.directed,
  weighted: m.weighted,
  nodes: m.nodes.map((n) => n.id),
  edges: new Map(m.edges.map((e) => [key(m, e.from, e.to), e.weight])),
});
/** How the edge dropdown names an edge: "A–B" with the ends in order, or "A→B". */
const label = (r: Ref, u: string, v: string) => (r.directed ? `${u}→${v}` : [u, v].sort().join('–'));
const refEdgeLabels = (r: Ref) => [...r.edges.keys()].map((k) => label(r, ...(k.split(/[->]/) as [string, string]))).sort();

/** Whether the reference says a call is impossible (so the explorer must block it). */
function refBlocked(r: Ref, { op, args }: Call): boolean {
  const has = (x: unknown) => r.nodes.includes(String(x));
  const [u, v] = [String(args.u), String(args.v)];
  switch (op) {
    case 'add-vertex':
      return !/^[A-Za-z0-9]{1,3}$/.test(v) || has(v) || r.nodes.length >= MAX_VERTICES;
    case 'add-edge': {
      if (!has(u) || !has(v) || u === v) return true;
      const existing = r.edges.get(key(r, u, v));
      return r.weighted ? existing === Number(args.w) : existing != null;
    }
    case 'remove-edge':
      return !refEdgeLabels(r).includes(String(args.e));
    case 'has-edge':
      return !has(u) || !has(v);
    default: // remove-vertex, neighbours, bfs, dfs
      return !has(v);
  }
}

function refApply(r: Ref, { op, args }: Call): Ref {
  const [u, v] = op === 'remove-edge' ? endpoints(String(args.e)) : [String(args.u), String(args.v)];
  switch (op) {
    case 'add-vertex':
      return { ...r, nodes: [...r.nodes, v] };
    case 'remove-vertex': {
      const edges = new Map([...r.edges].filter(([k]) => !k.split(/[->]/).includes(v)));
      return { ...r, nodes: r.nodes.filter((x) => x !== v), edges };
    }
    case 'add-edge':
      return { ...r, edges: new Map(r.edges).set(key(r, u, v), r.weighted ? Number(args.w) : 1) };
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

const CHANGES = new Set(['add-vertex', 'remove-vertex', 'add-edge', 'remove-edge']);

// ───────────────────────────── per structure ─────────────────────────────

describe.each(graphStructures)('$slug', (ds) => {
  const weighted = ds.slug === 'graph';

  it('operations never mutate their input model', () => {
    fc.assert(
      fc.property(arbModel(ds), arbSeed, (model, seed) => {
        const call = offered(ds, model, seed);
        if (blockedReason(ds, model, call)) return;
        const before = clone(model);
        deepFreeze(model);
        recordOperation(spec(ds, call.op).run(model, call.args));
        expect(model).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  it('blocks exactly the calls the reference says are impossible, whatever names a URL invents', () => {
    fc.assert(
      fc.property(arbModel(ds), arbSeed, fc.boolean(), (model, seed, fromOptions) => {
        const call = fromOptions ? offered(ds, model, seed) : invented(ds, seed);
        expect(blockedReason(ds, model, call) != null).toBe(refBlocked(toRef(model), call));
      }),
      { numRuns: 400 },
    );
  });

  it('matches a reference model after any sequence of allowed operations', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ds.initial), fc.array(arbSeed, { maxLength: 20 }), (start, seeds) => {
        let model: GraphModel = start.make(1);
        let ref = toRef(model);
        for (const s of seeds) {
          const call = offered(ds, model, s);
          if (blockedReason(ds, model, call)) continue;
          model = recordOperation(spec(ds, call.op).run(model, call.args)).result;
          ref = refApply(ref, call);
          sameGraph(model, ref);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('allowed calls never reach an error path: each one narrates, and every change really changes the graph', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ds.initial), fc.array(arbSeed, { maxLength: 25 }), (start, seeds) => {
        let model: GraphModel = start.make(1);
        for (const s of seeds) {
          const call = offered(ds, model, s);
          if (blockedReason(ds, model, call)) continue;
          const { frames, result } = recordOperation(spec(ds, call.op).run(model, call.args));
          expect(frames.length).toBeGreaterThan(0);
          for (const f of frames) expect(f.note).not.toMatch(/Nothing (changes|to remove)|There is no (vertex|edge)|isn't a valid|self-loop/);
          if (CHANGES.has(call.op)) expect(result).not.toEqual(model);
          else expect(result).toBe(model);
          model = result;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('narrates every frame, points at the operation’s pseudo-code and keeps counters monotonic', () => {
    fc.assert(
      fc.property(arbModel(ds), arbSeed, (model, seed) => {
        const call = offered(ds, model, seed);
        if (blockedReason(ds, model, call)) return;
        const op = spec(ds, call.op);
        const { frames } = recordOperation(op.run(model, call.args));
        let prev: Record<string, number> = {};
        for (const f of frames) {
          expect(f.note.trim().length).toBeGreaterThan(0);
          if (f.line != null) {
            expect(f.line).toBeLessThan(op.pseudocode.length);
            expect(op.pseudocode[f.line].trim()).not.toBe('');
          }
          expect(Object.keys(f.stats).sort()).toEqual(ds.stats.map((s) => s.key).sort());
          for (const [k, v] of Object.entries(f.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
          prev = f.stats;
          if (f.checkpoint) {
            expect(new Set(f.checkpoint.choices).size).toBe(f.checkpoint.choices.length);
            expect(f.checkpoint.answer).toBeLessThan(f.checkpoint.choices.length);
          }
        }
        for (const line of op.pseudocode) expect(line.length).toBeLessThanOrEqual(40);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps every vertex where it is: positions never change', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ds.initial), fc.array(arbSeed, { maxLength: 20 }), (start, seeds) => {
        const where = new Map<string, string>();
        let model: GraphModel = start.make(1);
        for (const s of seeds) {
          const call = offered(ds, model, s);
          if (blockedReason(ds, model, call)) continue;
          const rec = recordOperation(spec(ds, call.op).run(model, call.args));
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

  it('offers exactly the existing vertices and edges as choices, in order', () => {
    fc.assert(
      fc.property(arbModel(ds), (m) => {
        const ref = toRef(m);
        expect(VERTEX_ARG.options(m)).toEqual([...ref.nodes].sort());
        expect(EDGE_ARG.options(m)).toEqual(refEdgeLabels(ref));
        for (const op of ds.operations) {
          for (const a of op.args) {
            if (a.type !== 'choice') continue;
            expect(a.options(m)).toEqual(a.name === 'e' ? refEdgeLabels(ref) : [...ref.nodes].sort());
          }
        }
      }),
      { numRuns: 150 },
    );
    expect(EDGE_ARG.options(makeModel(true, false, ['A', 'B', 'C'], 'C>A, A>B, B>A'))).toEqual(['A→B', 'B→A', 'C→A']);
    expect(EDGE_ARG.options(makeModel(false, false, ['A', 'B', 'C'], 'C-A, B-A'))).toEqual(['A–B', 'A–C']);
  });

  it('blocks operations that make no sense for the current model, before any argument is known', () => {
    const emptyModel = makeModel(false, weighted, [], '');
    const lonely = makeModel(false, weighted, ['A'], '');
    const fullModel = makeModel(false, weighted, 'ABCDEFGHIJ'.split(''), 'A-B');
    expect(spec(ds, 'remove-vertex').disabledReason!(emptyModel)).toMatch(/no vertices/);
    expect(spec(ds, 'add-edge').disabledReason!(lonely)).toMatch(/two vertices/);
    expect(spec(ds, 'remove-edge').disabledReason!(lonely)).toMatch(/no edges/);
    expect(spec(ds, 'add-vertex').disabledReason!(fullModel)).toMatch(/full/);
    expect(spec(ds, 'add-vertex').disabledReason!(lonely)).toBeNull();
    for (const op of ds.operations.filter((o) => o.args.some((a) => a.type === 'choice'))) {
      expect(blockedReason(ds, emptyModel, { op: op.id, args: { u: 'A', v: 'A', e: 'A–B', w: 1 } }), op.id).not.toBeNull();
    }
  });

  it('explains why impossible arguments are blocked, and allows the rest', () => {
    const start = ds.initial[0].make(1); // vertices A–E (and F in the network), A–B joined, A–E not
    const why = (op: string, args: Call['args']) => blockedReason(ds, start, { op, args });
    const w = { w: 4 }; // the network's A–B weight
    expect(why('add-vertex', { v: 'A' })).toMatch(/already a vertex A/);
    expect(why('add-vertex', { v: 'no!' })).toMatch(/isn't a valid vertex name/);
    expect(why('add-vertex', { v: 'G' })).toBeNull();
    expect(why('add-edge', { u: 'A', v: 'A', ...w })).toMatch(/self-loop/);
    expect(why('add-edge', { u: 'A', v: 'Z', ...w })).toMatch(/pick one/);
    expect(why('add-edge', { u: 'A', v: 'B', ...w })).toMatch(weighted ? /already has weight 4/ : /already an edge A–B/);
    expect(why('add-edge', { u: 'B', v: 'A', ...w })).toMatch(weighted ? /already has weight 4/ : /already an edge B–A/);
    expect(why('add-edge', { u: 'A', v: 'E', ...w })).toBeNull();
    expect(why('remove-edge', { e: 'A–E' })).toMatch(/pick one/);
    expect(why('remove-edge', { e: 'A→B' })).toMatch(/pick one/); // undirected edges are named with –
    expect(why('remove-edge', { e: 'A–B' })).toBeNull();
    expect(why('remove-vertex', { v: 'Z' })).toMatch(/pick one/);
    for (const op of ['has-edge', 'neighbours', 'bfs', 'dfs'].filter((id) => ds.operations.some((o) => o.id === id))) {
      expect(why(op, { u: 'A', v: 'Z' }), op).toMatch(/pick one/);
    }
  });

  it('blocks an edge in a complete graph before any argument is chosen (unless it only changes a weight)', () => {
    const triangle = makeModel(false, weighted, ['A', 'B', 'C'], 'A-B, B-C, A-C');
    const reason = spec(ds, 'add-edge').disabledReason!(triangle);
    if (weighted) expect(reason).toBeNull();
    else expect(reason).toMatch(/already joined/);
    const cycle = makeModel(true, weighted, ['A', 'B'], 'A>B');
    expect(spec(ds, 'add-edge').disabledReason!(cycle)).toBeNull(); // B→A is still free
  });

  it('URL replay stops at the first call the current graph can’t take', () => {
    const start = ds.initial[0].make(1);
    const calls: Call[] = [
      { op: 'remove-vertex', args: { v: 'A' } },
      { op: 'remove-edge', args: { e: 'A–B' } }, // A and its edges are gone
      { op: 'add-vertex', args: { v: 'G' } },
    ];
    const { model, applied } = replay(ds, start, parseOps(serializeOps(calls, ds), ds));
    expect(applied.map((a) => a.call)).toEqual(calls.slice(0, 1));
    expect(model.nodes.map((n: { id: string }) => n.id)).not.toContain('A');
    expect(model.nodes.map((n: { id: string }) => n.id)).not.toContain('G');

    const handEdited = replay(ds, start, parseOps('add-vertex:A;add-vertex:G', ds)); // A already exists
    expect(handEdited.applied).toHaveLength(0);
  });

  it('every starting graph has a snapshot, and every offered operation on it runs', () => {
    for (const s of ds.initial) {
      const m = s.make(1);
      expect(ds.snapshot(m).nodes).toHaveLength(m.nodes.length);
      ds.operations.forEach((_, op) => {
        const call = offered(ds, m, { op, picks: [0, 1, 0], label: 'G', w: 7 });
        if (blockedReason(ds, m, call)) return;
        expect(() => recordOperation(spec(ds, call.op).run(m, call.args))).not.toThrow();
      });
    }
  });

  it('has a legend that starts with the neutral entry', () => expect(ds.legend[0]).toHaveProperty('neutral'));
});

// ───────────────────────────── representation-specific ─────────────────────────────

const adjacencyOf = (s: GraphState) => (s.panels.find((p) => p.id === 'adjacency') as AdjacencyPanel).rows.map((r) => [r.id, r.entries.map((e) => e.label)]);
const matrixOf = (s: GraphState) => (s.panels.find((p) => p.id === 'matrix') as MatrixPanel).cells;
const vertexPair = (m: GraphModel) => fc.tuple(fc.nat(), fc.nat()).map(([i, j]) => [m.nodes[i % m.nodes.length]?.id, m.nodes[j % m.nodes.length]?.id] as const);

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

  it('“Has edge?” runs for any two vertices and answers no for a missing edge: a list scans, a matrix reads one cell', () => {
    fc.assert(
      fc.property(
        arbModel(adjacencyList).chain((m) => fc.tuple(fc.constant(m), vertexPair(m))),
        ([m, [u, v]]) => {
          if (u == null || v == null) return;
          const exists = m.edges.some((e) => (e.from === u && e.to === v) || (!m.directed && e.from === v && e.to === u));
          for (const ds of [adjacencyList, adjacencyMatrix]) {
            expect(blockedReason(ds, m, { op: 'has-edge', args: { u, v } })).toBeNull();
            const { frames } = recordOperation(spec(ds, 'has-edge').run(m, { u, v }));
            const last = frames.at(-1)!;
            expect(/return true|yes, the edge exists/.test(last.note)).toBe(exists);
            if (ds === adjacencyMatrix) expect(last.stats.cells).toBe(1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('“Neighbours of” reports the same vertices in both, reading deg(u) entries vs V cells', () => {
    fc.assert(
      fc.property(
        arbModel(adjacencyMatrix).chain((m) => fc.tuple(fc.constant(m), vertexPair(m))),
        ([m, [u]]) => {
          if (u == null) return;
          const want = m.nodes.filter((n) => m.edges.some((e) => (e.from === u && e.to === n.id) || (!m.directed && e.to === u && e.from === n.id))).map((n) => n.id).sort();
          const run = (ds: typeof adjacencyList) => recordOperation(spec(ds, 'neighbours').run(m, { v: u })).frames.at(-1)!;
          const fromList = run(adjacencyList);
          const fromMatrix = run(adjacencyMatrix);
          const reported = (f: typeof fromList) => Object.entries(f.state.nodeMarks).filter(([, mark]) => mark === 'path').map(([id]) => id).sort();
          expect(reported(fromList)).toEqual(want);
          expect(reported(fromMatrix)).toEqual(want);
          expect(fromMatrix.stats.cells).toBe(m.nodes.length);
          expect(fromList.stats.scanned).toBe(want.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('BFS and DFS on the graph structure leave the model as it was and step through the traversal', () => {
    fc.assert(
      fc.property(
        arbModel(graph).chain((m) => fc.tuple(fc.constant(m), vertexPair(m), fc.constantFrom('bfs', 'dfs'))),
        ([m, [s], op]) => {
          if (blockedReason(graph, m, { op, args: { v: s ?? '' } })) {
            expect(m.nodes).toHaveLength(0);
            return;
          }
          const rec = recordOperation(spec(graph, op).run(m, { v: s! }));
          expect(rec.result).toBe(m);
          // Show the traversal step by step, not all at once.
          expect(rec.frames.length).toBeGreaterThan(m.nodes.length > 1 ? 2 : 1);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('updates the weight instead of adding a second edge between the same pair', () => {
    const m = graph.initial[0].make(1);
    const call = { op: 'add-edge', args: { u: 'B', v: 'A', w: 42 } };
    expect(blockedReason(graph, m, call)).toBeNull();
    const result: GraphModel = recordOperation(spec(graph, 'add-edge').run(m, call.args)).result;
    expect(result.edges.filter((e) => [e.from, e.to].sort().join() === 'A,B')).toEqual([{ from: 'A', to: 'B', weight: 42 }]);
  });

  it('names directed edges with an arrow, and removes only that direction', () => {
    const m = adjacencyList.initial.find((s) => s.id === 'directed')!.make(1); // A>B, A>C, B>D, C>B, D>E, E>C
    expect(EDGE_ARG.options(m)).toEqual(['A→B', 'A→C', 'B→D', 'C→B', 'D→E', 'E→C']);
    for (const ds of [adjacencyList, adjacencyMatrix]) {
      expect(blockedReason(ds, m, { op: 'remove-edge', args: { e: 'B→C' } })).toMatch(/pick one/); // only C→B exists
      const result: GraphModel = recordOperation(spec(ds, 'remove-edge').run(m, { e: 'C→B' })).result;
      expect(result.edges.some((e) => e.from === 'C' && e.to === 'B')).toBe(false);
      expect(result.edges).toHaveLength(m.edges.length - 1);
    }
  });
});

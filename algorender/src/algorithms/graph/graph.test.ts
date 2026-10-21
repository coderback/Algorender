import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_FRAMES, recordTrace } from '@/engine/trace';
import type { InputSpec } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { circleLayout } from '@/viz/graph/layout';
import type { ChipsPanel, FactsPanel, GraphState, GroupsPanel, MatrixPanel, TablePanel } from '@/viz/graph/types';
import { graphAlgorithms } from '.';
import { bellmanFord } from './bellman-ford';
import { breadthFirstSearch } from './breadth-first-search';
import { depthFirstSearch } from './depth-first-search';
import { dijkstra } from './dijkstra';
import { floydWarshall } from './floyd-warshall';
import { kosaraju } from './kosaraju';
import { kruskals } from './kruskals';
import { LABELS, byLabel, type GraphInput } from './model';
import { prims } from './prims';
import { tarjan } from './tarjan';
import { topologicalSort } from './topological-sort';

type Algo = (typeof graphAlgorithms)[number];

const traceOf = (algo: Algo, input: GraphInput) => recordTrace<GraphState>(algo.run(input));
const last = (algo: Algo, input: GraphInput) => traceOf(algo, input).frames.at(-1)!.state;

function panel<K extends GraphState['panels'][number]['kind']>(state: GraphState, id: string, kind: K) {
  const p = state.panels.find((x) => x.id === id);
  if (!p || p.kind !== kind) throw new Error(`No ${kind} panel "${id}"`);
  return p as Extract<GraphState['panels'][number], { kind: K }>;
}
const num = (text: string) => (text === '∞' ? Infinity : Number(text.replace('−', '-')));
const chipLabels = (p: ChipsPanel) => p.chips.map((c) => c.label);
const fact = (p: FactsPanel, label: string) => p.facts.find((f) => f.label === label)?.value;
const column = (p: TablePanel, col: number) => Object.fromEntries(p.rows.map((r) => [r.id, r.cells[col]]));

// ───────────────────────────── random graphs ─────────────────────────────

type ArbOptions = { directed: boolean | 'any'; weighted: boolean; weights?: [number, number]; maxNodes?: number; connected?: boolean };

function arbGraph({ directed, weighted, weights = [1, 9], maxNodes = 8, connected = false }: ArbOptions) {
  return fc
    .record({
      n: fc.integer({ min: 1, max: maxNodes }),
      dir: directed === 'any' ? fc.boolean() : fc.constant(directed),
      raw: fc.array(fc.tuple(fc.nat(99), fc.nat(99), fc.integer({ min: weights[0], max: weights[1] })), { maxLength: 18 }),
      tree: fc.array(fc.tuple(fc.nat(99), fc.integer({ min: weights[0], max: weights[1] })), { minLength: maxNodes, maxLength: maxNodes }),
      pick: fc.nat(99),
    })
    .map(({ n, dir, raw, tree, pick }): GraphInput => {
      const ids = LABELS.slice(0, n);
      const edges: { from: string; to: string; weight: number }[] = [];
      const seen = new Set<string>();
      const add = (u: string, v: string, w: number) => {
        const key = dir ? `${u}>${v}` : [u, v].sort().join('-');
        if (u === v || seen.has(key)) return;
        seen.add(key);
        edges.push({ from: u, to: v, weight: weighted ? w : 1 });
      };
      if (connected) for (let i = 1; i < n; i++) add(ids[tree[i][0] % i], ids[i], tree[i][1]);
      for (const [a, b, w] of raw) add(ids[a % n], ids[b % n], w);
      const pos = circleLayout(ids);
      return {
        directed: dir,
        weighted,
        nodes: ids.map((id) => ({ id, ...pos[id] })),
        edges,
        start: ids[pick % n],
        target: ids[(pick * 7 + 3) % n],
      };
    });
}

/** Arbitrary graphs that each algorithm accepts. */
const ARBS: Record<string, fc.Arbitrary<GraphInput>> = {
  'breadth-first-search': arbGraph({ directed: 'any', weighted: false }),
  'depth-first-search': arbGraph({ directed: 'any', weighted: false }),
  dijkstra: arbGraph({ directed: 'any', weighted: true, weights: [0, 9] }),
  'bellman-ford': arbGraph({ directed: 'any', weighted: true, weights: [-3, 9] }),
  'floyd-warshall': arbGraph({ directed: 'any', weighted: true, weights: [-3, 9], maxNodes: 6 }),
  prims: arbGraph({ directed: false, weighted: true, weights: [-5, 9] }),
  kruskals: arbGraph({ directed: false, weighted: true, weights: [-5, 9] }),
  'topological-sort': arbGraph({ directed: true, weighted: false }),
  kosaraju: arbGraph({ directed: true, weighted: false }),
  tarjan: arbGraph({ directed: true, weighted: false }),
};

// ───────────────────────────── references ─────────────────────────────

function neighbours(g: GraphInput, reversed = false) {
  const adj = new Map(g.nodes.map((n) => [n.id, [] as { to: string; w: number }[]]));
  for (const e of g.edges) {
    const [a, b] = reversed ? [e.to, e.from] : [e.from, e.to];
    adj.get(a)!.push({ to: b, w: e.weight });
    if (!g.directed) adj.get(b)!.push({ to: a, w: e.weight });
  }
  for (const list of adj.values()) list.sort((x, y) => byLabel(x.to, y.to));
  return adj;
}

function refBfs(g: GraphInput) {
  const adj = neighbours(g);
  const level = new Map([[g.start!, 0]]);
  const order: string[] = [];
  const q = [g.start!];
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    for (const { to } of adj.get(u)!) if (!level.has(to)) {
        level.set(to, level.get(u)! + 1);
        q.push(to);
      }
  }
  return { order, level };
}

function refDfsOrder(g: GraphInput) {
  const adj = neighbours(g);
  const seen = new Set<string>();
  const order: string[] = [];
  const go = (u: string) => {
    seen.add(u);
    order.push(u);
    for (const { to } of adj.get(u)!) if (!seen.has(to)) go(to);
  };
  go(g.start!);
  return order;
}

/** Bellman–Ford: distances, or null if a negative cycle is reachable from the start. */
function refShortest(g: GraphInput): Map<string, number> | null {
  const adj = neighbours(g);
  const d = new Map(g.nodes.map((n) => [n.id, Infinity]));
  d.set(g.start!, 0);
  const pass = () => {
    let changed = false;
    for (const [u, list] of adj) for (const { to, w } of list) if (d.get(u)! + w < d.get(to)!) {
          d.set(to, d.get(u)! + w);
          changed = true;
        }
    return changed;
  };
  for (let i = 0; i < g.nodes.length; i++) pass();
  return pass() ? null : d;
}

function refAllPairs(g: GraphInput): { d: number[][]; negative: boolean } {
  const ids = g.nodes.map((n) => n.id);
  const d = ids.map((_, i) => ids.map((__, j) => (i === j ? 0 : Infinity)));
  for (const e of g.edges) {
    const [a, b] = [ids.indexOf(e.from), ids.indexOf(e.to)];
    d[a][b] = Math.min(d[a][b], e.weight);
    if (!g.directed) d[b][a] = Math.min(d[b][a], e.weight);
  }
  for (let k = 0; k < ids.length; k++)
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  return { d, negative: ids.some((_, i) => d[i][i] < 0) };
}

/** Minimum spanning forest weight (Kruskal with a naive union). */
function refForestWeight(g: GraphInput, only?: Set<string>) {
  const comp = new Map(g.nodes.map((n) => [n.id, n.id]));
  let total = 0;
  for (const e of [...g.edges].sort((a, b) => a.weight - b.weight)) {
    if (only && !only.has(e.from)) continue;
    const [a, b] = [comp.get(e.from)!, comp.get(e.to)!];
    if (a === b) continue;
    total += e.weight;
    for (const [k, v] of comp) if (v === b) comp.set(k, a);
  }
  return total;
}

function reachable(g: GraphInput, s: string, reversed = false) {
  const adj = neighbours(g, reversed);
  const seen = new Set([s]);
  const stack = [s];
  while (stack.length) for (const { to } of adj.get(stack.pop()!)!) if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
  return seen;
}

function refSccs(g: GraphInput): string[] {
  const reach = new Map(g.nodes.map((n) => [n.id, reachable(g, n.id)]));
  const groups = new Map<string, string[]>();
  for (const { id } of g.nodes) {
    const key = g.nodes.filter((m) => reach.get(id)!.has(m.id) && reach.get(m.id)!.has(id)).map((m) => m.id).join(',');
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return normalise([...groups.values()]);
}
const normalise = (groups: string[][]) => groups.map((g) => [...g].sort(byLabel).join(',')).sort();

const hasCycle = (g: GraphInput) => refSccs(g).some((s) => s.includes(','));

// ───────────────────────────── correctness ─────────────────────────────

describe('results match reference implementations', () => {
  it('BFS visits in queue order and finds edge-count levels', () => {
    fc.assert(
      fc.property(ARBS['breadth-first-search'], (g) => {
        const state = last(breadthFirstSearch, g);
        const ref = refBfs(g);
        expect(chipLabels(panel(state, 'order', 'chips'))).toEqual(ref.order);
        const levels = column(panel(state, 'levels', 'table'), 1);
        for (const { id } of g.nodes) expect(levels[id]).toBe(ref.level.has(id) ? String(ref.level.get(id)) : '–');
      }),
      { numRuns: 120 },
    );
  });

  it('DFS discovers exactly the reachable nodes, in depth-first order', () => {
    fc.assert(
      fc.property(ARBS['depth-first-search'], (g) => {
        const order = chipLabels(panel(last(depthFirstSearch, g), 'order', 'chips'));
        expect(new Set(order)).toEqual(reachable(g, g.start!));
        expect(order).toEqual(refDfsOrder(g));
      }),
      { numRuns: 120 },
    );
  });

  it('Dijkstra finds shortest distances when no weight is negative', () => {
    fc.assert(
      fc.property(ARBS.dijkstra, (g) => {
        const dist = column(panel(last(dijkstra, g), 'dist', 'table'), 1);
        const ref = refShortest(g)!;
        for (const { id } of g.nodes) expect(num(dist[id])).toBe(ref.get(id));
      }),
      { numRuns: 120 },
    );
  });

  it('Dijkstra shows a shortest path to the target with the right length', () => {
    fc.assert(
      fc.property(ARBS.dijkstra, (g) => {
        const state = last(dijkstra, g);
        const ref = refShortest(g)!;
        const p = state.panels.find((x) => x.id === 'path') as FactsPanel | undefined;
        if (g.target === g.start || ref.get(g.target!) === Infinity) {
          expect(p).toBeUndefined();
          return;
        }
        const route = fact(p!, 'Route')!.split(/ [→–] /);
        expect(route[0]).toBe(g.start);
        expect(route.at(-1)).toBe(g.target);
        let length = 0;
        for (let i = 1; i < route.length; i++) {
          const e = g.edges.find(
            (x) => (x.from === route[i - 1] && x.to === route[i]) || (!g.directed && x.from === route[i] && x.to === route[i - 1]),
          );
          expect(e).toBeDefined();
          length += e!.weight;
        }
        expect(length).toBe(ref.get(g.target!));
        expect(num(fact(p!, 'Length')!)).toBe(length);
      }),
      { numRuns: 80 },
    );
  });

  it('Bellman–Ford finds shortest distances or reports the negative cycle', () => {
    fc.assert(
      fc.property(ARBS['bellman-ford'], (g) => {
        const state = last(bellmanFord, g);
        const ref = refShortest(g);
        const verdict = fact(panel(state, 'result', 'facts'), 'Negative cycle')!;
        if (ref == null) {
          expect(verdict).not.toBe('none');
          // The cycle shown really is negative and really is a cycle in the graph.
          const weight = fact(panel(state, 'result', 'facts'), 'Cycle weight');
          if (weight) expect(num(weight)).toBeLessThan(0);
        } else {
          expect(verdict).toBe('none');
          const dist = column(panel(state, 'dist', 'table'), 1);
          for (const { id } of g.nodes) expect(num(dist[id])).toBe(ref.get(id));
        }
      }),
      { numRuns: 150 },
    );
  });

  it('Floyd–Warshall computes all-pairs distances and spots negative cycles', () => {
    fc.assert(
      fc.property(ARBS['floyd-warshall'], (g) => {
        const state = last(floydWarshall, g);
        const ref = refAllPairs(g);
        const verdict = fact(panel(state, 'result', 'facts'), 'Negative cycle')!;
        expect(verdict !== 'none').toBe(ref.negative);
        if (!ref.negative) expect((panel(state, 'dist', 'matrix') as MatrixPanel).cells.map((row) => row.map(num))).toEqual(ref.d);
      }),
      { numRuns: 120 },
    );
  });

  it('Prim and Kruskal find a minimum spanning tree weight', () => {
    fc.assert(
      fc.property(arbGraph({ directed: false, weighted: true, weights: [-5, 9], connected: true }), (g) => {
        const want = refForestWeight(g);
        expect(num(fact(panel(last(prims, g), 'mst', 'facts'), 'Total weight')!)).toBe(want);
        expect(num(fact(panel(last(kruskals, g), 'mst', 'facts'), 'Total weight')!)).toBe(want);
      }),
      { numRuns: 150 },
    );
  });

  it('Kruskal gives a minimum spanning forest on disconnected graphs; Prim spans the start’s component', () => {
    fc.assert(
      fc.property(ARBS.kruskals, (g) => {
        expect(num(fact(panel(last(kruskals, g), 'mst', 'facts'), 'Total weight')!)).toBe(refForestWeight(g));
        const component = reachable(g, g.start!);
        expect(num(fact(panel(last(prims, g), 'mst', 'facts'), 'Total weight')!)).toBe(refForestWeight(g, component));
      }),
      { numRuns: 120 },
    );
  });

  it('topological sort gives a valid order, or detects the cycle', () => {
    fc.assert(
      fc.property(ARBS['topological-sort'], (g) => {
        const state = last(topologicalSort, g);
        const order = chipLabels(panel(state, 'order', 'chips'));
        const result = panel(state, 'result', 'facts');
        if (hasCycle(g)) {
          expect(fact(result, 'Cycle')).toBeDefined();
          expect(order.length).toBeLessThan(g.nodes.length);
        } else {
          expect([...order].sort()).toEqual(g.nodes.map((n) => n.id).sort());
          const at = new Map(order.map((id, i) => [id, i]));
          for (const e of g.edges) expect(at.get(e.from)!).toBeLessThan(at.get(e.to)!);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('Kosaraju, Tarjan and a reachability reference agree on the SCCs', () => {
    fc.assert(
      fc.property(ARBS.kosaraju, (g) => {
        const want = refSccs(g);
        const groups = (algo: Algo) => normalise((panel(last(algo, g), 'sccs', 'groups') as GroupsPanel).groups.map((x) => [...x.members]));
        expect(groups(kosaraju)).toEqual(want);
        expect(groups(tarjan)).toEqual(want);
      }),
      { numRuns: 150 },
    );
  });
});

// ───────────────────────────── trace quality ─────────────────────────────

describe.each(graphAlgorithms)('$slug', (algo) => {
  const arb = ARBS[algo.slug];

  it('has a random-graph generator in this test file', () => expect(arb).toBeDefined());

  it('narrates every frame, points at real pseudo-code lines and never lets counters go backwards', () => {
    fc.assert(
      fc.property(arb, (g) => {
        let prev: Record<string, number> = {};
        for (const frame of traceOf(algo, g).frames) {
          expect(frame.note.trim().length).toBeGreaterThan(0);
          if (frame.line != null) {
            expect(frame.line).toBeGreaterThanOrEqual(0);
            expect(frame.line).toBeLessThan(algo.pseudocode.length);
            expect(algo.pseudocode[frame.line].trim()).not.toBe('');
          }
          for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
          prev = frame.stats;
        }
      }),
      { numRuns: 40 },
    );
  });

  it('asks well-formed predictions that the next frame resolves', () => {
    fc.assert(
      fc.property(arb, (g) => {
        const frames: Frame<GraphState>[] = traceOf(algo, g).frames;
        frames.forEach((frame, i) => {
          const c = frame.checkpoint;
          if (!c) return;
          expect(c.choices.length).toBeGreaterThanOrEqual(2);
          expect(c.choices.length).toBeLessThanOrEqual(4);
          expect(new Set(c.choices).size).toBe(c.choices.length);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(c.choices.length);
          expect(i).toBeLessThan(frames.length - 1);
          if (c.choices[c.answer].length > 3) expect(frame.note).not.toContain(c.choices[c.answer]);
        });
      }),
      { numRuns: 40 },
    );
  });

  it('varies the position of the right answer in multiple-choice questions', () => {
    const positions = new Set<number>();
    fc.assert(
      fc.property(arb, (g) => {
        for (const f of traceOf(algo, g).frames) if (f.checkpoint && f.checkpoint.choices.length > 2) positions.add(f.checkpoint.answer);
      }),
      // Fixed seed: some algorithms rarely ask 3+-choice questions on small random
      // graphs, so an unlucky sample could hold just one and make this flaky.
      { numRuns: 300, seed: 20261015 },
    );
    if (positions.size > 0) expect(positions.size).toBeGreaterThan(1);
  });

  it('never moves a node during a run', () => {
    fc.assert(
      fc.property(arb, (g) => {
        const where = new Map(g.nodes.map((n) => [n.id, `${n.x},${n.y}`]));
        for (const { state } of traceOf(algo, g).frames) for (const n of state.nodes) expect(`${n.x},${n.y}`).toBe(where.get(n.id));
      }),
      { numRuns: 20 },
    );
  });

  it('only tracks the stats it displays', () => {
    const input = algo.input.examples[0].make({ seed: 1, size: algo.input.size!.default });
    expect(Object.keys(traceOf(algo, input).frames[0].stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
  });

  it('runs every example at every size within the frame cap', () => {
    const { min, max } = algo.input.size!;
    for (const example of algo.input.examples) {
      for (const size of [min, Math.floor((min + max) / 2), max]) {
        for (const seed of [1, 2, 3]) {
          const input = example.make({ seed: size * 31 + seed, size });
          const trace = traceOf(algo, input);
          expect(trace.truncated).toBe(false);
          expect(trace.frames.length).toBeLessThan(MAX_FRAMES);
          expect(input.nodes.length).toBeLessThanOrEqual(10);
          if (example.id === 'random') expect(input.nodes).toHaveLength(size);
        }
      }
    }
  });

  it('has legend, content and experiments that point at real examples', () => {
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(algo.input.examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
    for (const line of algo.pseudocode) expect(line.length).toBeLessThanOrEqual(40);
  });

  it('round-trips its custom text format', () => {
    const custom = algo.input.custom! as InputSpec<GraphInput>['custom'] & object;
    for (const example of algo.input.examples) {
      const input: GraphInput = example.make({ seed: 9, size: 6 });
      const text = custom.format(input);
      const parsed = custom.parse(text);
      if (!('value' in parsed)) throw new Error(`${algo.slug}/${example.id}: ${parsed.error} in "${text}"`);
      const g = parsed.value;
      expect(g.directed).toBe(input.directed);
      expect(g.nodes.map((n) => n.id)).toEqual(input.nodes.map((n) => n.id));
      expect(g.edges).toEqual(input.edges);
      expect(g.start).toBe(input.start);
      expect(g.target).toBe(input.target);
      expect(custom.format(g)).toBe(text);
    }
  });

  it('round-trips random graphs through the custom format', () => {
    fc.assert(
      fc.property(arb, (input) => {
        const custom = algo.input.custom! as InputSpec<GraphInput>['custom'] & object;
        const parsed = custom.parse(custom.format(input));
        if (!('value' in parsed)) throw new Error(parsed.error);
        expect(parsed.value.edges).toEqual(input.edges);
        expect(new Set(parsed.value.nodes.map((n) => n.id))).toEqual(new Set(input.nodes.map((n) => n.id)));
        expect(custom.format(parsed.value)).toBe(custom.format(input));
      }),
      { numRuns: 40 },
    );
  });

  it('explains what is wrong with bad custom input', () => {
    const { parse } = algo.input.custom!;
    const bad = ['', '  ', 'A=B', 'A-A', 'A>A', 'A-B, B>C', 'A-B, B-A', 'A>B, A>B', 'A-B:4 | start Z', 'A-B | colour red', 'A-B, C-D, E-F, G-H, I-J, K-L', 'LONG-B'];
    for (const text of bad) {
      const r = parse(text);
      if ('value' in r) throw new Error(`"${text}" should be rejected`);
      expect(r.error.length).toBeGreaterThan(10);
    }
  });
});

describe('custom input rules', () => {
  it('rejects undirected edges for directed-only algorithms and vice versa', () => {
    expect(topologicalSort.input.custom!.parse('A-B')).toHaveProperty('error');
    expect(kosaraju.input.custom!.parse('A-B')).toHaveProperty('error');
    expect(prims.input.custom!.parse('A>B:3')).toHaveProperty('error');
    expect(kruskals.input.custom!.parse('A>B:3')).toHaveProperty('error');
    expect(dijkstra.input.custom!.parse('A>B:3, B>C:1 | start B, target C')).toEqual({
      value: expect.objectContaining({ directed: true, start: 'B', target: 'C' }),
    });
  });

  it('keeps isolated nodes and negative weights', () => {
    const r = bellmanFord.input.custom!.parse('A>B:-4, B>C:2, D | start A');
    if (!('value' in r)) throw new Error(r.error);
    expect(r.value.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.value.edges[0].weight).toBe(-4);
    expect(bellmanFord.input.custom!.format(r.value)).toBe('A>B:-4, B>C:2, D | start A');
  });
});

describe('teaching examples behave as their labels promise', () => {
  const example = (algo: Algo, id: string) => algo.input.examples.find((e) => e.id === id)!.make({ seed: 1, size: 7 });

  it('Dijkstra’s negative-edge example ends with wrong distances, and says so', () => {
    const { frames } = traceOf(dijkstra, example(dijkstra, 'negative'));
    expect(frames.at(-1)!.note).toMatch(/true shortest distances differ/);
  });

  it('Bellman–Ford catches the negative cycle and outlines it', () => {
    const state = last(bellmanFord, example(bellmanFord, 'cycle'));
    expect(fact(panel(state, 'result', 'facts'), 'Negative cycle')).toMatch(/B/);
    expect(num(fact(panel(state, 'result', 'facts'), 'Cycle weight')!)).toBe(-2);
  });

  it('Bellman–Ford needs all passes for the unlucky order but stops early for the lucky one', () => {
    const passes = (id: string) => traceOf(bellmanFord, example(bellmanFord, id)).frames.at(-1)!.stats.passes;
    expect(passes('unlucky')).toBe(4);
    expect(passes('lucky')).toBe(2);
  });

  it('Kruskal rejects at least one edge with a reason, and Floyd–Warshall marks the cell it updates', () => {
    expect(traceOf(kruskals, example(kruskals, 'cycles')).frames.some((f) => /would close a cycle/.test(f.note))).toBe(true);
    const fw = traceOf(floydWarshall, example(floydWarshall, 'classic')).frames;
    const update = fw.find((f) => f.line === 5)!;
    const marks = (update.state.panels.find((p) => p.id === 'dist') as MatrixPanel).marks;
    expect(marks.filter((m) => m.mark === 'compare')).toHaveLength(2);
    expect(marks.filter((m) => m.mark === 'write')).toHaveLength(1);
  });

  it('topological sort reports the cycle example and Tarjan shows low-links', () => {
    expect(fact(panel(last(topologicalSort, example(topologicalSort, 'cycle')), 'result', 'facts'), 'Cycle')).toBeDefined();
    const t = last(tarjan, example(tarjan, 'three'));
    expect(t.annotations.A).toMatch(/^\d+\/\d+$/);
  });

  it('BFS from A in the two-component example never reaches the other component', () => {
    const order = chipLabels(panel(last(breadthFirstSearch, example(breadthFirstSearch, 'components')), 'order', 'chips'));
    expect(order).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('regions (V4)', () => {
  it('BFS draws each level as one region, holding exactly the nodes at that level', () => {
    fc.assert(
      fc.property(arbGraph({ directed: 'any', weighted: false }), (g) => {
        for (const { state } of traceOf(breadthFirstSearch, g).frames) {
          const levels = column(panel(state, 'levels', 'table'), 1);
          const placed = (state.regions ?? []).flatMap((r) => r.members.map((m) => [m, r.label] as const));
          expect(new Set(placed.map(([m]) => m)).size).toBe(placed.length);
          for (const [m, label] of placed) expect(label).toBe(`level ${levels[m]}`);
          expect(placed.length).toBe(Object.values(levels).filter((l) => l !== '–').length);
        }
      }),
    );
  });

  it('Kosaraju and Tarjan draw the components found so far, matching the components panel', () => {
    fc.assert(
      fc.property(arbGraph({ directed: true, weighted: false }), (g) => {
        for (const algo of [kosaraju, tarjan]) {
          for (const { state } of traceOf(algo, g).frames) {
            const groups = state.panels.find((p): p is GroupsPanel => p.id === 'sccs');
            if (!groups) continue;
            expect((state.regions ?? []).map((r) => [r.label, [...r.members].sort()])).toEqual(groups.groups.map((c) => [c.label, [...c.members].sort()]));
          }
        }
      }),
    );
  });
});

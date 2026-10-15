import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { EdgeId, GraphState, NodeId } from '@/viz/graph/types';
import { adjacency, arrow, authored, byLabel, choose, fixedExample, graphInput, list, nodeIds, randomGraph, plusW, showDist, showW, type GraphInput, type GraphRules } from './model';
import { EDGES, MinHeap, RELAXATIONS, trueDistances } from './shared';

const rules: GraphRules = { direction: 'either', weighted: true, start: true, target: true, name: 'Dijkstra’s algorithm' };

const pseudocode = [
  'dist[·] ← ∞;  dist[s] ← 0',
  'push (0, s) onto min-heap H',
  'while H is not empty:',
  '  (d, u) ← pop the minimum of H',
  '  if u is settled: skip it',
  '  settle u',
  '  for each edge u → v, weight w:',
  '    if v is settled: skip it',
  '    if d + w < dist[v]:',
  '      dist[v] ← d + w;  prev[v] ← u',
  '      push (dist[v], v) onto H',
  'path: follow prev back from target',
];

type Entry = { d: number; v: NodeId; seq: number };

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['visited', 'edges', 'relaxations', 'pops']);
  const adj = adjacency(g);
  const s = g.start ?? g.nodes[0]?.id;
  const sep = arrow(g.directed);
  if (s == null) {
    yield t.frame({ note: 'The graph is empty, so there are no paths to find.' });
    return;
  }

  const dist = new Map(nodeIds(g).map((id) => [id, Infinity]));
  const prev = new Map<NodeId, { from: NodeId; edge: EdgeId }>();
  const settled = new Set<NodeId>();
  const heap = new MinHeap<Entry>((a, b) => a.d < b.d || (a.d === b.d && (byLabel(a.v, b.v) < 0 || (a.v === b.v && a.seq < b.seq))));
  let seq = 0;
  let questions = 0;
  const negative = g.edges.some((e) => e.weight < 0);

  const isStale = (e: Entry) => settled.has(e.v) || e.d > dist.get(e.v)!;
  const panels = (written?: NodeId) => {
    t.setPanel({
      kind: 'chips',
      id: 'heap',
      title: 'Min-heap H (smallest first)',
      chips: heap.sorted().map((e) => ({ id: `h${e.seq}`, label: e.v, sub: showDist(e.d), ...(isStale(e) && { mark: 'reject' as const }) })),
      empty: 'empty',
    });
    t.setPanel({
      kind: 'table',
      id: 'dist',
      title: 'Distances',
      columns: ['node', 'dist', 'prev'],
      rows: nodeIds(g).map((id) => ({
        id,
        cells: [id, showDist(dist.get(id)!), prev.get(id)?.from ?? '–'],
        ...(settled.has(id) && { mark: 'visited' as const }),
        ...(id === written && { cellMarks: { 1: 'write' as const } }),
      })),
    });
    for (const id of nodeIds(g)) t.annotate(id, showDist(dist.get(id)!));
  };
  const push = (d: number, v: NodeId) => heap.push({ d, v, seq: seq++ });

  t.setAnnotationLabel('dist');
  panels();
  yield t.frame({
    line: 0,
    note: `Dijkstra’s algorithm grows a set of settled nodes whose shortest distance from ${s} is final, always settling the closest unsettled node next. Every distance starts at ∞ except ${s}, which is 0.`,
    vars: { s },
  });
  dist.set(s, 0);
  push(0, s);
  t.mark(s, 'frontier');
  panels(s);
  yield t.frame({ line: 1, note: `Put ${s} in the priority queue with distance 0. The heap always gives back its smallest entry in O(log V).`, vars: { s } });

  while (heap.size > 0) {
    const candidates = [...new Set(heap.sorted().filter((e) => !isStale(e)).map((e) => e.v))];
    const { d, v: u } = heap.pop()!;
    t.count('pops');
    if (settled.has(u) || d > dist.get(u)!) {
      panels();
      yield t.frame({
        line: 4,
        note: settled.has(u)
          ? `Pop (${showDist(d)}, ${u}): ${u} is already settled, so this entry is stale (left behind when a shorter path was found). Skip it.`
          : `Pop (${showDist(d)}, ${u}): stale, because dist[${u}] has since dropped to ${showDist(dist.get(u)!)}. Skip it.`,
        vars: { d, u },
      });
      continue;
    }

    settled.add(u);
    t.count('visited');
    t.mark(u, 'key');
    panels();
    const q = choose(u, candidates.filter((c) => c !== u), questions++);
    yield t.frame({
      line: 5,
      note:
        negative
          ? `Pop (${showDist(d)}, ${u}), the smallest entry, and settle ${u}: Dijkstra assumes no later path can be shorter, which holds only if no edge is negative.`
          : `Pop (${showDist(d)}, ${u}), the smallest entry, and settle ${u} at ${showDist(d)}: any other route would leave the heap at ≥ ${showDist(d)} and only grow, since no edge is negative.`,
      vars: { u, 'dist[u]': d },
      ...(q && { ask: { question: 'Which node is settled next?', ...q } }),
    });

    for (const { to: v, weight: w, edge } of adj.get(u)!) {
      t.count('edges');
      const vars = { u, v, w, 'dist[u]': d, 'dist[v]': dist.get(v)! };
      if (settled.has(v)) {
        if (d + w < dist.get(v)!) {
          t.markEdge(edge, 'reject');
          yield t.frame({
            line: 7,
            note: `${u} ${sep} ${v}: ${v} is settled, so Dijkstra never revisits it, even though ${showDist(d)} ${plusW(w)} = ${showDist(d + w)} < ${showDist(dist.get(v)!)}. The negative edge broke the “settled is final” rule.`,
            vars,
          });
        } else {
          yield t.frame({ line: 7, note: `${u} ${sep} ${v}: ${v} is already settled; its distance is final. Skip it.`, edges: { compare: [edge] }, vars });
        }
        continue;
      }

      const old = dist.get(v)!;
      const ask = {
        question: `Does ${u} ${sep} ${v} (weight ${showW(w)}) improve dist[${v}]?`,
        choices: [`Yes: relax ${v} through ${u}`, `No: keep dist[${v}] = ${showDist(old)}`],
        answer: d + w < old ? 0 : 1,
      };
      if (d + w < old) {
        const before = prev.get(v);
        if (before) t.markEdge(before.edge, null);
        dist.set(v, d + w);
        prev.set(v, { from: u, edge });
        push(d + w, v);
        t.count('relaxations');
        t.markEdge(edge, 'path');
        t.mark(v, 'frontier');
        panels(v);
        yield t.frame({
          line: 9,
          note:
            old === Infinity
              ? `dist[${v}] = ∞ > dist[${u}] ${plusW(w)} = ${showDist(d + w)}, so relax: ${v} is now ${showDist(d + w)} via ${u}. Push (${showDist(d + w)}, ${v}).`
              : `dist[${v}] = ${showDist(old)} > dist[${u}] ${plusW(w)} = ${showDist(d + w)}, so relax: ${v} is now ${showDist(d + w)} via ${u}. Push the new entry; the old (${showDist(old)}, ${v}) stays in the heap as a stale entry.`,
          pulse: edge,
          vars: { ...vars, 'dist[v]': d + w },
          ask,
        });
      } else {
        yield t.frame({
          line: 8,
          note: `${u} ${sep} ${v}: ${showDist(d)} ${plusW(w)} = ${showDist(d + w)} is not less than dist[${v}] = ${showDist(old)}, so keep the current route.`,
          edges: { compare: [edge] },
          vars,
          ask,
        });
      }
    }
    t.mark(u, 'visited');
    panels();
  }

  const unreached = nodeIds(g).filter((id) => dist.get(id) === Infinity);
  yield t.frame({
    line: 2,
    note: `The heap is empty: every reachable node is settled.${unreached.length ? ` ${list(unreached)} stayed at ∞: no path from ${s} reaches ${unreached.length === 1 ? 'it' : 'them'}.` : ''}`,
    vars: { settled: settled.size },
  });

  const target = g.target;
  if (target != null && target !== s) {
    if (dist.get(target) === Infinity) {
      yield t.frame({ line: 11, note: `There is no path from ${s} to ${target}: dist[${target}] is still ∞.`, vars: { target } });
    } else {
      const path: NodeId[] = [target];
      const pathEdges = new Set<EdgeId>();
      while (prev.has(path[0])) {
        const p = prev.get(path[0])!;
        pathEdges.add(p.edge);
        path.unshift(p.from);
      }
      for (const { edge } of prev.values()) if (!pathEdges.has(edge)) t.markEdge(edge, null);
      for (const id of path) t.mark(id, 'path');
      t.setPanel({
        kind: 'facts',
        id: 'path',
        title: `Shortest path to ${target}`,
        facts: [
          { label: 'Route', value: path.join(` ${sep} `), mark: 'path' },
          { label: 'Length', value: showDist(dist.get(target)!) },
        ],
      });
      yield t.frame({
        line: 11,
        note: `Follow prev back from ${target}: ${path.join(` ${sep} `)}, total length ${showDist(dist.get(target)!)}.`,
        vars: { target, 'dist[target]': dist.get(target)! },
      });
    }
  }

  if (negative) {
    const truth = trueDistances(g, s);
    const wrong = truth ? nodeIds(g).filter((id) => truth.get(id) !== dist.get(id)) : [];
    yield t.frame({
      line: null,
      note: !truth
        ? 'Warning: this graph has a negative cycle, so shortest paths are undefined and Dijkstra’s answer means nothing. Bellman–Ford detects this.'
        : wrong.length
          ? `Check: the true shortest distances differ at ${list(wrong.map((id) => `${id} (${showDist(truth.get(id)!)}, not ${showDist(dist.get(id)!)})`))}. Dijkstra settled a node too early because of a negative edge; Bellman–Ford gets these right.`
          : 'This graph has a negative edge, yet every distance happens to be right. That is luck, not a guarantee: Dijkstra needs non-negative weights.',
      vars: { wrong: wrong.length },
    });
  }
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>, start: string, target: string) =>
  fixedExample(id, label, () => ({ ...authored(rules, edges, at), start, target }));

export const dijkstra = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'dijkstra',
  view: 'graph',
  input: graphInput(rules, [
    N(
      'roads',
      'Road map',
      'A-B:4, A-C:2, B-C:1, B-D:5, C-E:10, D-E:2, D-F:6, E-F:3',
      { A: [0, 90], B: [110, 10], C: [110, 170], D: [240, 10], E: [240, 170], F: [350, 90] },
      'A',
      'F',
    ),
    N(
      'negative',
      'Negative edge breaks Dijkstra',
      'A>B:2, A>C:5, C>B:-4, B>D:1',
      { A: [0, 80], B: [140, 0], C: [140, 160], D: [280, 0] },
      'A',
      'D',
    ),
    N(
      'detour',
      'Long way is shorter',
      'A>B:10, A>C:1, C>D:1, D>E:1, E>B:1, B>F:2',
      { A: [0, 60], B: [250, 60], C: [50, 170], D: [140, 210], E: [230, 170], F: [360, 60] },
      'A',
      'F',
    ),
    N(
      'one-way',
      'Unreachable node',
      'A>B:3, A>C:6, B>C:2, C>D:1, E>D:4',
      { A: [0, 80], B: [110, 0], C: [110, 160], D: [230, 80], E: [340, 80] },
      'A',
      'D',
    ),
    {
      id: 'random',
      label: 'Random',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: false, weighted: true, extra: 0.6, start: true, target: true }),
    },
  ]),
  pseudocode,
  stats: [{ key: 'visited', label: 'Nodes settled' }, EDGES, RELAXATIONS, { key: 'pops', label: 'Heap pops' }],
  legend: [
    { neutral: 'Not reached yet' },
    { mark: 'frontier', label: 'Tentative (in the heap)' },
    { mark: 'key', label: 'Just settled' },
    { mark: 'visited', label: 'Settled (final)' },
    { mark: 'path', label: 'Best route (prev edge)' },
    { mark: 'compare', label: 'Edge that doesn’t help' },
    { mark: 'write', label: 'Distance just lowered' },
    { mark: 'reject', label: 'Stale entry / broken by a negative edge' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'Shortest paths from one source when no edge is negative: repeatedly settle the closest unsettled node, then try to shorten its neighbours’ distances through it (relaxation). A min-heap finds the closest node quickly.',
    invariant: 'Nodes leave the priority queue in nondecreasing distance order, and a settled node’s distance is final: every other route to it would leave the heap at a distance at least as large, and non-negative edges can only add to it.',
    whenToUse: 'Road maps, network routing and any shortest-path problem with non-negative weights. With negative edges use Bellman–Ford; with equal weights, plain BFS is simpler.',
    traits: [
      { label: 'Handles negative edges', good: false },
      { label: 'O((V + E) log V) with a binary heap', good: true },
      { label: 'Finds paths to every node at once', good: true },
      { label: 'Lazy deletion: stale heap entries are skipped', good: null },
    ],
    experiments: [
      { example: 'negative', prompt: 'Watch B get settled at 2, then C finds a route to B costing 1. Dijkstra can’t take it back, and D ends up wrong too.' },
      { example: 'detour', prompt: 'The direct edge A → B costs 10. Predict B’s final distance before you run it.' },
      { example: 'roads', prompt: 'B is pushed twice. Find the stale entry and see when it is skipped.' },
      { example: 'one-way', prompt: 'E can reach D, but A can’t reach E. What is dist[E] at the end?' },
    ],
  },
});

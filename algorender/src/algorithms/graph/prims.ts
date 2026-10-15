import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { EdgeId, GraphState, NodeId } from '@/viz/graph/types';
import { CLASSIC_MST_AT, CLASSIC_MST_EDGES } from './examples';
import { adjacency, authored, byLabel, choose, fixedExample, graphInput, list, nodeIds, randomGraph, showDist, showW, type GraphInput, type GraphRules } from './model';
import { EDGES, MinHeap } from './shared';

const rules: GraphRules = { direction: 'undirected', weighted: true, start: true, name: 'Prim’s algorithm' };

const pseudocode = [
  'key[·] ← ∞;  key[s] ← 0',
  'push (0, s) onto min-heap H',
  'while H is not empty:',
  '  (k, u) ← pop the minimum of H',
  '  if u is in the tree: skip it',
  '  add u to the tree via parent[u]',
  '  for each edge u – v, weight w:',
  '    if v is in the tree: skip it',
  '    if w < key[v]:',
  '      key[v] ← w;  parent[v] ← u',
  '      push (w, v) onto H',
];

type Entry = { k: number; v: NodeId; seq: number };

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['visited', 'edges', 'updates']);
  const adj = adjacency(g);
  const s = g.start ?? g.nodes[0]?.id;
  if (s == null) {
    yield t.frame({ note: 'The graph is empty, so there is nothing to span.' });
    return;
  }

  const key = new Map(nodeIds(g).map((id) => [id, Infinity]));
  const parent = new Map<NodeId, { from: NodeId; edge: EdgeId; w: number }>();
  const inTree = new Set<NodeId>();
  const treeEdges: { from: NodeId; to: NodeId; w: number }[] = [];
  const heap = new MinHeap<Entry>((a, b) => a.k < b.k || (a.k === b.k && (byLabel(a.v, b.v) < 0 || (a.v === b.v && a.seq < b.seq))));
  let seq = 0;
  let questions = 0;
  const total = () => treeEdges.reduce((sum, e) => sum + e.w, 0);

  const isStale = (e: Entry) => inTree.has(e.v) || e.k > key.get(e.v)!;
  const panels = (written?: NodeId) => {
    t.setPanel({
      kind: 'chips',
      id: 'heap',
      title: 'Min-heap H (smallest first)',
      chips: heap.sorted().map((e) => ({ id: `h${e.seq}`, label: e.v, sub: showDist(e.k), ...(isStale(e) && { mark: 'reject' as const }) })),
      empty: 'empty',
    });
    t.setPanel({
      kind: 'table',
      id: 'keys',
      title: 'Cheapest link to the tree',
      columns: ['node', 'key', 'parent'],
      rows: nodeIds(g).map((id) => ({
        id,
        cells: [id, showDist(key.get(id)!), parent.get(id)?.from ?? '–'],
        ...(inTree.has(id) && { mark: 'visited' as const }),
        ...(id === written && { cellMarks: { 1: 'write' as const } }),
      })),
    });
    t.setPanel({
      kind: 'facts',
      id: 'mst',
      title: 'Spanning tree',
      facts: [
        { label: 'Edges', value: treeEdges.length ? treeEdges.map((e) => `${e.from}–${e.to}`).join(', ') : 'none yet' },
        { label: 'Total weight', value: showW(total()), mark: 'path' },
      ],
    });
    for (const id of nodeIds(g)) t.annotate(id, inTree.has(id) ? null : showDist(key.get(id)!));
  };

  t.setAnnotationLabel('key (cheapest link)');
  panels();
  yield t.frame({
    line: 0,
    note: `Prim’s algorithm grows one tree from ${s}, always adding the cheapest edge that connects the tree to a new node. key[v] is the cheapest known link from the tree to v.`,
    vars: { s },
  });
  key.set(s, 0);
  heap.push({ k: 0, v: s, seq: seq++ });
  t.mark(s, 'frontier');
  panels(s);
  yield t.frame({ line: 1, note: `${s} starts the tree, so it needs no link: key 0. Push it onto the heap.`, vars: { s } });

  while (heap.size > 0) {
    const candidates = [...new Set(heap.sorted().filter((e) => !isStale(e)).map((e) => e.v))];
    const { k, v: u } = heap.pop()!;
    if (isStale({ k, v: u, seq: -1 })) {
      panels();
      yield t.frame({
        line: 4,
        note: inTree.has(u)
          ? `Pop (${showDist(k)}, ${u}): ${u} is already in the tree, so this old entry is stale. Skip it.`
          : `Pop (${showDist(k)}, ${u}): stale, because ${u} has since found a cheaper link (${showDist(key.get(u)!)}). Skip it.`,
        vars: { k, u },
      });
      continue;
    }

    inTree.add(u);
    t.count('visited');
    t.mark(u, 'key');
    const link = parent.get(u);
    if (link) {
      treeEdges.push({ from: link.from, to: u, w: link.w });
      t.markEdge(link.edge, 'path');
    }
    panels();
    const q = choose(u, candidates.filter((c) => c !== u), questions++);
    yield t.frame({
      line: 5,
      note: link
        ? `Pop (${showDist(k)}, ${u}): ${link.from}–${u} (weight ${showW(link.w)}) is the cheapest edge leaving the tree, so it is safe to add: ${u} joins the tree. Total ${showW(total())}.`
        : `Pop (0, ${u}): ${u} is the root of the tree.`,
      ...(link && { pulse: link.edge }),
      vars: { u, 'key[u]': k, total: total() },
      ...(q && { ask: { question: 'Which node joins the tree next?', ...q } }),
    });

    for (const { to: v, weight: w, edge } of adj.get(u)!) {
      t.count('edges');
      if (inTree.has(v)) {
        if (parent.get(u)?.edge !== edge) {
          yield t.frame({ line: 7, note: `${u}–${v}: ${v} is already in the tree, so this edge would only close a cycle. Skip it.`, edges: { compare: [edge] }, vars: { u, v, w } });
        }
        continue;
      }
      const old = key.get(v)!;
      const ask = {
        question: `Does ${u}–${v} (weight ${showW(w)}) give ${v} a cheaper link?`,
        choices: [`Yes: link ${v} through ${u}`, `No: keep key[${v}] = ${showDist(old)}`],
        answer: w < old ? 0 : 1,
      };
      if (w < old) {
        const before = parent.get(v);
        if (before) t.markEdge(before.edge, null);
        key.set(v, w);
        parent.set(v, { from: u, edge, w });
        heap.push({ k: w, v, seq: seq++ });
        t.count('updates');
        t.markEdge(edge, 'frontier');
        t.mark(v, 'frontier');
        panels(v);
        yield t.frame({
          line: 9,
          note:
            old === Infinity
              ? `${u}–${v}: ${v} had no link to the tree yet; now it can join for ${showW(w)} via ${u}. Push (${showW(w)}, ${v}).`
              : `${u}–${v}: weight ${showW(w)} < key[${v}] = ${showDist(old)}, so ${v}'s cheapest link is now ${showW(w)} via ${u}. Push the new entry.`,
          pulse: edge,
          vars: { u, v, w, 'key[v]': w },
          ask,
        });
      } else {
        yield t.frame({
          line: 8,
          note: `${u}–${v}: weight ${showW(w)} is not below key[${v}] = ${showDist(old)}, so ${v} keeps its cheaper link.`,
          edges: { compare: [edge] },
          vars: { u, v, w, 'key[v]': old },
          ask,
        });
      }
    }
    t.mark(u, 'visited');
    panels();
  }

  const missing = nodeIds(g).filter((id) => !inTree.has(id));
  yield t.frame({
    line: 2,
    note: missing.length
      ? `The heap is empty but ${list(missing)} never joined: no edge connects ${missing.length === 1 ? 'it' : 'them'} to ${s}’s tree. Prim spans only ${s}’s component (total ${showW(total())}); run it again from ${missing[0]} for a spanning forest.`
      : `Done: all ${inTree.size} nodes are connected by ${treeEdges.length} edges with total weight ${showW(total())}, the minimum possible.`,
    vars: { total: total(), edges: treeEdges.length },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>, start: string) =>
  fixedExample(id, label, () => ({ ...authored(rules, edges, at), start }));

export const prims = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'prims',
  view: 'graph',
  input: graphInput(rules, [
    N('classic', 'Six towns', CLASSIC_MST_EDGES, CLASSIC_MST_AT, 'A'),
    N('other-start', 'Six towns, start at E', CLASSIC_MST_EDGES, CLASSIC_MST_AT, 'E'),
    N(
      'ties',
      'Equal weights',
      'A-B:1, B-C:1, C-D:1, D-A:1, A-C:2, B-D:2',
      { A: [0, 0], B: [160, 0], C: [160, 160], D: [0, 160] },
      'A',
    ),
    N(
      'disconnected',
      'Two islands',
      'A-B:3, B-C:1, A-C:4, D-E:2, E-F:5, D-F:1',
      { A: [0, 20], B: [110, 0], C: [60, 120], D: [260, 20], E: [370, 40], F: [300, 140] },
      'A',
    ),
    {
      id: 'random',
      label: 'Random',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: false, weighted: true, extra: 0.8, start: true }),
    },
  ]),
  pseudocode,
  stats: [{ key: 'visited', label: 'Nodes added' }, EDGES, { key: 'updates', label: 'Key updates' }],
  legend: [
    { neutral: 'Not linked yet' },
    { mark: 'frontier', label: 'Has a link to the tree (in the heap)' },
    { mark: 'key', label: 'Just joined' },
    { mark: 'visited', label: 'In the tree' },
    { mark: 'path', label: 'Tree edge' },
    { mark: 'compare', label: 'Edge that doesn’t help' },
    { mark: 'write', label: 'Key just lowered' },
    { mark: 'reject', label: 'Stale heap entry' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'Grow a minimum spanning tree from one node: repeatedly add the cheapest edge that connects the tree to a node outside it. A min-heap keyed by each outside node’s cheapest link finds that edge quickly.',
    invariant: 'The edges chosen so far are part of some minimum spanning tree: the cheapest edge crossing from the tree to the rest of the graph is always safe to add (the cut property).',
    whenToUse: 'Cheapest way to connect everything (networks, wiring, clustering) in a connected, undirected graph, especially a dense one. Kruskal is often simpler on sparse edge lists.',
    traits: [
      { label: 'Greedy, yet optimal', good: true },
      { label: 'O(E log V) with a binary heap', good: true },
      { label: 'Spans only the start’s component', good: false },
      { label: 'Negative weights are fine', good: null },
    ],
    experiments: [
      { example: 'other-start', prompt: 'Start from E instead of A. Do you get the same total weight? The same edges?' },
      { example: 'ties', prompt: 'With equal weights there are several minimum trees. Which one does the tie-break pick?' },
      { example: 'disconnected', prompt: 'No edge joins the two islands. What does Prim do with D, E and F?' },
    ],
  },
});

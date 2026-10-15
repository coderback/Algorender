import { defineAlgorithm } from '@/engine/module';
import { askAhead, edgeKey, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { EdgeId, GraphState, NodeId } from '@/viz/graph/types';
import { CLASSIC_MST_AT, CLASSIC_MST_EDGES } from './examples';
import { authored, byLabel, fixedExample, graphInput, nodeIds, randomGraph, showW, type GraphInput, type GraphRules } from './model';

const rules: GraphRules = { direction: 'undirected', weighted: true, start: false, name: 'Kruskal’s algorithm' };

const pseudocode = [
  'sort the edges by weight',
  'make each node its own set',
  'for each edge u – v in sorted order:',
  '  if find(u) ≠ find(v):',
  '    add u – v to the tree',
  '    union(u, v)',
  '  else: reject it (it closes a cycle)',
  '  stop once the tree has V − 1 edges',
];

const ACCEPT = 'Accepted: it joins two components';
const REJECT = 'Rejected: it would close a cycle';

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['edges', 'finds']);
  const ids = nodeIds(g);
  const V = ids.length;
  if (V === 0) {
    yield t.frame({ note: 'The graph is empty, so there is nothing to span.' });
    return;
  }
  const sorted = g.edges.map((e) => ({ ...e, id: edgeKey(e.from, e.to, false) })).sort((a, b) => a.weight - b.weight);
  const status = new Map<EdgeId, 'path' | 'reject' | 'compare'>();

  // Union–find with union by size and path compression.
  const up = new Map(ids.map((id) => [id, id]));
  const size = new Map(ids.map((id) => [id, 1]));
  const find = (x: NodeId): NodeId => {
    t.count('finds');
    let root = x;
    while (up.get(root) !== root) root = up.get(root)!;
    while (up.get(x) !== root) {
      const next = up.get(x)!;
      up.set(x, root);
      x = next;
    }
    return root;
  };
  const rootOf = (x: NodeId): NodeId => (up.get(x) === x ? x : rootOf(up.get(x)!));
  const members = (root: NodeId) => ids.filter((id) => rootOf(id) === root);
  const setText = (root: NodeId) => `{${members(root).join(', ')}}`;

  const tree: { id: EdgeId; w: number }[] = [];
  const total = () => tree.reduce((s, e) => s + e.w, 0);
  const panels = () => {
    t.setPanel({
      kind: 'chips',
      id: 'sorted',
      title: 'Edges by weight',
      chips: sorted.map((e) => ({ id: e.id, label: `${e.from}–${e.to}`, sub: showW(e.weight), ...(status.has(e.id) && { mark: status.get(e.id)! }) })),
      empty: 'no edges',
    });
    const roots = [...new Set(ids.map(rootOf))].sort(byLabel);
    t.setPanel({
      kind: 'groups',
      id: 'sets',
      title: 'Components (union–find sets)',
      groups: roots.map((r) => ({ id: r, label: r, members: members(r), ...(members(r).length > 1 && { mark: 'visited' as const }) })),
      empty: 'none',
    });
    t.setPanel({
      kind: 'facts',
      id: 'mst',
      title: 'Spanning tree',
      facts: [
        { label: 'Edges', value: `${tree.length} of ${V - 1}` },
        { label: 'Total weight', value: showW(total()), mark: 'path' },
      ],
    });
    for (const id of ids) t.badge(id, members(rootOf(id)).length > 1 ? rootOf(id) : null);
  };

  panels();
  yield t.frame({
    line: 0,
    note: 'Kruskal’s algorithm builds a minimum spanning tree edge by edge, cheapest first, skipping any edge that would close a cycle. First, sort the edges by weight.',
    vars: { V, E: sorted.length },
  });
  yield t.frame({
    line: 1,
    note: 'Each node starts in its own component. A union–find structure tracks the components, so “are u and v already connected?” is a quick find(u) = find(v) check.',
    vars: {},
  });

  for (const e of sorted) {
    if (tree.length === V - 1) break;
    t.count('edges');
    const ru = find(e.from);
    const rv = find(e.to);
    const accept = ru !== rv;
    const ask = {
      question: `Is ${e.from}–${e.to} (weight ${showW(e.weight)}) accepted, or does it form a cycle?`,
      choices: [ACCEPT, REJECT],
      answer: accept ? 0 : 1,
    };
    const vars = { u: e.from, v: e.to, w: e.weight, 'find(u)': ru, 'find(v)': rv };
    if (accept) {
      const [a, b] = [setText(ru), setText(rv)];
      const [big, small] = size.get(ru)! >= size.get(rv)! ? [ru, rv] : [rv, ru];
      up.set(small, big);
      size.set(big, size.get(big)! + size.get(small)!);
      tree.push({ id: e.id, w: e.weight });
      status.set(e.id, 'path');
      t.markEdge(e.id, 'path');
      t.mark(e.from, 'visited');
      t.mark(e.to, 'visited');
      panels();
      yield t.frame({
        line: 4,
        note: `find(${e.from}) = ${ru} and find(${e.to}) = ${rv} differ, so ${e.from}–${e.to} links two separate components and can't close a cycle. Add it (total ${showW(total())}) and merge ${a} with ${b}.`,
        nodes: { compare: [e.from, e.to] },
        pulse: e.id,
        vars,
        ask,
      });
    } else {
      status.set(e.id, 'reject');
      t.markEdge(e.id, 'reject');
      panels();
      yield t.frame({
        line: 6,
        note: `find(${e.from}) = find(${e.to}) = ${ru}: ${e.from} and ${e.to} are already connected inside ${setText(ru)}, so ${e.from}–${e.to} would close a cycle. Reject it.`,
        nodes: { compare: [e.from, e.to] },
        vars,
        ask,
      });
    }
  }

  const skipped = sorted.filter((e) => !status.has(e.id)).length;
  const components = new Set(ids.map(rootOf)).size;
  panels();
  yield t.frame({
    line: tree.length === V - 1 ? 7 : 2,
    note:
      components === 1
        ? `The tree has V − 1 = ${V - 1} edges, so every node is connected: total weight ${showW(total())}.${skipped ? ` The ${skipped} heavier edge${skipped === 1 ? ' was' : 's were'} never needed.` : ''}`
        : `Every edge has been tried, but ${components} components remain: the graph is disconnected, so the result is a minimum spanning forest of total weight ${showW(total())}.`,
    vars: { total: total(), components },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>) => fixedExample(id, label, () => authored(rules, edges, at));

export const kruskals = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'kruskals',
  view: 'graph',
  input: graphInput(rules, [
    N('classic', 'Six towns', CLASSIC_MST_EDGES, CLASSIC_MST_AT),
    N(
      'cycles',
      'Two triangles',
      'A-B:1, A-C:1, B-C:1, D-E:2, D-F:2, E-F:2, B-D:3, C-E:4, B-E:5',
      { A: [0, 100], B: [100, 0], C: [100, 200], D: [250, 0], E: [250, 200], F: [350, 100] },
    ),
    N(
      'ties',
      'Equal weights',
      'A-B:1, B-C:1, C-D:1, D-A:1, A-C:2, B-D:2',
      { A: [0, 0], B: [160, 0], C: [160, 160], D: [0, 160] },
    ),
    N(
      'disconnected',
      'Two islands',
      'A-B:3, B-C:1, A-C:4, D-E:2, E-F:5, D-F:1',
      { A: [0, 20], B: [110, 0], C: [60, 120], D: [260, 20], E: [370, 40], F: [300, 140] },
    ),
    {
      id: 'random',
      label: 'Random',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: false, weighted: true, extra: 0.8 }),
    },
  ]),
  pseudocode,
  stats: [
    { key: 'edges', label: 'Edges examined' },
    { key: 'finds', label: 'find() calls' },
  ],
  legend: [
    { neutral: 'Not in the tree yet' },
    { mark: 'compare', label: 'Ends of the edge being tried' },
    { mark: 'path', label: 'Accepted (tree edge)' },
    { mark: 'reject', label: 'Rejected: would close a cycle' },
    { mark: 'visited', label: 'Touched by the tree' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'Build a minimum spanning tree by taking edges cheapest first, skipping any edge whose ends are already connected (it would close a cycle). A union–find structure answers “already connected?” almost instantly.',
    invariant: 'The accepted edges always form a forest that is part of some minimum spanning tree, and each union–find set is exactly one of its trees.',
    whenToUse: 'Minimum spanning trees on sparse graphs or when edges come as a list; also clustering (stop early to leave k clusters). The cost is dominated by sorting: O(E log E).',
    traits: [
      { label: 'Greedy, yet optimal', good: true },
      { label: 'Handles disconnected graphs (gives a forest)', good: true },
      { label: 'Needs all edges sorted up front', good: false },
      { label: 'Negative weights are fine', good: null },
    ],
    experiments: [
      { example: 'cycles', prompt: 'Many edges get rejected here. For each rejection, find the cycle it would have closed.' },
      { example: 'classic', prompt: 'Run Prim on the same graph: same total weight, but in which order are the edges added?' },
      { example: 'disconnected', prompt: 'Kruskal keeps going across both islands. How many edges end up in the forest?' },
    ],
  },
});

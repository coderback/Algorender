import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { GraphState, NodeId } from '@/viz/graph/types';
import { COMPONENTS_AT, COMPONENTS_EDGES, NETWORK_AT, NETWORK_EDGES, ONE_WAY_AT, ONE_WAY_EDGES } from './examples';
import { adjacency, arrow, authored, choose, fixedExample, graphInput, list, nodeIds, randomGraph, type GraphInput, type GraphRules } from './model';
import { EDGES, nodeChips, VISITED } from './shared';

const rules: GraphRules = { direction: 'either', weighted: false, start: true, name: 'Depth-first search' };

export const pseudocode = [
  'DFS(u):',
  '  discover u;  d[u] ← time++',
  '  for each neighbour v of u:',
  '    if v is undiscovered:',
  '      parent[v] ← u;  DFS(v)',
  '  finish u;  f[u] ← time++',
];

/** Depth-first search from input.start. Also used by the graph data structure's "DFS from" operation. */
export function dfs(input: GraphInput) {
  return askAhead(trace(input));
}

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['visited', 'edges']);
  const adj = adjacency(g);
  const s = g.start ?? g.nodes[0]?.id;
  const sep = arrow(g.directed);
  if (s == null) {
    yield t.frame({ note: 'The graph is empty, so there is nothing to search.' });
    return;
  }

  const disc = new Map<NodeId, number>();
  const fin = new Map<NodeId, number>();
  const parent = new Map<NodeId, NodeId>();
  const stack: NodeId[] = [];
  const order: NodeId[] = [];
  let time = 1;
  let questions = 0;

  const times = (id: NodeId) => (disc.has(id) ? `${disc.get(id)}/${fin.get(id) ?? '–'}` : null);
  const panels = () => {
    t.setPanel({ kind: 'chips', id: 'stack', title: 'Call stack', chips: nodeChips(stack), ends: ['bottom', 'top'], empty: 'empty' });
    t.setPanel({ kind: 'chips', id: 'order', title: 'Discovery order', chips: nodeChips(order), empty: 'none yet' });
    t.setPanel({
      kind: 'table',
      id: 'times',
      title: 'Discovery / finish times',
      columns: ['node', 'd', 'f', 'parent'],
      rows: nodeIds(g).map((id) => ({
        id,
        cells: [id, disc.has(id) ? String(disc.get(id)) : '–', fin.has(id) ? String(fin.get(id)) : '–', parent.get(id) ?? '–'],
      })),
    });
    for (const id of nodeIds(g)) t.annotate(id, times(id));
  };

  /** Undiscovered nodes a learner might wrongly expect next: neighbours of nodes lower on the stack first (what BFS would do). */
  const distractors = (answer: NodeId) => {
    const out: NodeId[] = [];
    for (const u of stack) for (const { to } of adj.get(u)!) if (!disc.has(to) && to !== answer) out.push(to);
    for (const id of nodeIds(g)) if (!disc.has(id) && id !== answer) out.push(id);
    return out;
  };

  function* visit(u: NodeId, from: NodeId | null): Generator<GraphFrame> {
    disc.set(u, time++);
    order.push(u);
    stack.push(u);
    t.count('visited');
    if (from != null) t.mark(from, 'frontier');
    t.mark(u, 'key');
    panels();
    const q = from != null ? choose(u, distractors(u), questions++) : null;
    yield t.frame({
      line: from == null ? 1 : 4,
      note:
        from == null
          ? `Call DFS(${u}): discover ${u} at time ${disc.get(u)} and push it on the call stack.`
          : `${from} ${sep} ${u}: ${u} is undiscovered, so go deeper right away, before ${from}'s other neighbours: call DFS(${u}), discovered at time ${disc.get(u)}.`,
      ...(from != null && { pulse: t.edgeId(from, u) }),
      vars: { u, 'd[u]': disc.get(u)!, depth: stack.length },
      ...(q && { ask: { question: 'Which node does DFS discover next?', ...q } }),
    });

    for (const { to: v, edge } of adj.get(u)!) {
      t.count('edges');
      if (!disc.has(v)) {
        parent.set(v, u);
        t.markEdge(edge, 'path');
        yield* visit(v, u);
        t.mark(u, 'key');
        panels();
        continue;
      }
      let why: string;
      if (!g.directed && v === parent.get(u)) why = `${v} is ${u}'s parent: this is the edge DFS came in on`;
      else if (!fin.has(v)) why = `${v} is still on the call stack, so this edge closes a cycle (a back edge)`;
      else why = `${v} is already finished`;
      yield t.frame({ line: 3, note: `${u} ${sep} ${v}: ${why}. Skip it.`, edges: { compare: [edge] }, vars: { u, v } });
    }

    fin.set(u, time++);
    stack.pop();
    t.mark(u, 'visited');
    panels();
    const back = stack.at(-1);
    yield t.frame({
      line: 5,
      note: back
        ? `${u} has no undiscovered neighbours left, so it is finished at time ${fin.get(u)}. Pop it and backtrack to ${back}.`
        : `${u} has no undiscovered neighbours left, so it is finished at time ${fin.get(u)}. The call stack is now empty.`,
      vars: { u, 'f[u]': fin.get(u)! },
    });
  }

  t.setAnnotationLabel('discovered/finished');
  panels();
  yield t.frame({
    line: 0,
    note: `Depth-first search follows one path as deep as it can, and only backs up when it hits a dead end. The call stack remembers the way back.`,
    vars: { s },
  });
  yield* visit(s, null);

  const unreached = nodeIds(g).filter((id) => !disc.has(id));
  yield t.frame({
    line: null,
    note:
      unreached.length === 0
        ? `Done: DFS reached all ${order.length} nodes. The tree edges form a depth-first tree; a node's interval d/f contains the intervals of everything below it.`
        : `Done: ${list(unreached)} ${unreached.length === 1 ? 'was' : 'were'} never discovered, because no path from ${s} leads there.`,
    vars: { reached: order.length, unreached: unreached.length },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>, start: string) =>
  fixedExample(id, label, () => ({ ...authored(rules, edges, at), start }));

export const depthFirstSearch = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'depth-first-search',
  view: 'graph',
  input: graphInput(rules, [
    N('network', 'Small network', NETWORK_EDGES, NETWORK_AT, 'A'),
    N('one-way', 'One-way streets', ONE_WAY_EDGES, ONE_WAY_AT, 'A'),
    N('components', 'Two components', COMPONENTS_EDGES, COMPONENTS_AT, 'A'),
    N(
      'tree',
      'A tree (no cycles)',
      'A-B, A-C, B-D, B-E, C-F, C-G',
      { A: [160, 0], B: [70, 90], C: [250, 90], D: [20, 190], E: [120, 190], F: [200, 190], G: [300, 190] },
      'A',
    ),
    {
      id: 'random',
      label: 'Random',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: false, weighted: false, extra: 0.4, start: true }),
    },
  ]),
  pseudocode,
  stats: [VISITED, EDGES],
  legend: [
    { neutral: 'Undiscovered' },
    { mark: 'key', label: 'Current (top of the stack)' },
    { mark: 'frontier', label: 'On the call stack' },
    { mark: 'visited', label: 'Finished' },
    { mark: 'path', label: 'Tree edge' },
    { mark: 'compare', label: 'Edge to a discovered node' },
  ],
  run: dfs,
  content: {
    idea: 'Follow one path as deep as it goes, and only back up when every neighbour is already discovered. The call stack (or an explicit stack) remembers the way back.',
    invariant: 'The call stack is always a path in the graph from the start to the current node, and a node finishes only after everything discovered from it has finished.',
    whenToUse: 'Exploring everything reachable with little memory, detecting cycles (a back edge to a node still on the stack), topological sorting, and finding strongly connected components. It does not find shortest paths.',
    traits: [
      { label: 'Finds cycles (back edges)', good: true },
      { label: 'Not shortest paths', good: false },
      { label: 'Each node and edge handled once: O(V + E)', good: true },
      { label: 'Stack depth up to O(V)', good: null },
    ],
    experiments: [
      { example: 'network', prompt: 'Run BFS on the same graph and compare: which nodes come out in a different order, and why?' },
      { example: 'tree', prompt: 'In a tree DFS never meets a discovered node except the parent. Where does it backtrack?' },
      { example: 'one-way', prompt: 'Watch for an edge back to a node still on the stack: that is a cycle.' },
    ],
  },
});

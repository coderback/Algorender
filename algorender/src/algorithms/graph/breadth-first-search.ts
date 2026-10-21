import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { GraphState, NodeId } from '@/viz/graph/types';
import { COMPONENTS_AT, COMPONENTS_EDGES, NETWORK_AT, NETWORK_EDGES, ONE_WAY_AT, ONE_WAY_EDGES } from './examples';
import { adjacency, arrow, authored, choose, fixedExample, graphInput, list, nodeIds, randomGraph, type GraphInput, type GraphRules } from './model';
import { EDGES, levelRegions, nodeChips, VISITED } from './shared';

const rules: GraphRules = { direction: 'either', weighted: false, start: true, name: 'Breadth-first search' };

export const pseudocode = [
  'BFS(s):',
  '  level[s] ← 0;  Q ← [s]',
  '  while Q is not empty:',
  '    u ← dequeue(Q)',
  '    for each neighbour v of u:',
  '      if v is undiscovered:',
  '        level[v] ← level[u] + 1',
  '        parent[v] ← u;  enqueue(v)',
];

/** Breadth-first search from input.start. Also used by the graph data structure's "BFS from" operation. */
export function bfs(input: GraphInput) {
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

  const level = new Map<NodeId, number>();
  const parent = new Map<NodeId, NodeId | null>();
  const queue: NodeId[] = [];
  const order: NodeId[] = [];
  let questions = 0;
  let explained = false;

  const panels = () => {
    t.setPanel({ kind: 'chips', id: 'queue', title: 'Queue', chips: nodeChips(queue, { sub: (id) => `L${level.get(id)}` }), ends: ['front', 'back'], empty: 'empty' });
    t.setPanel({ kind: 'chips', id: 'order', title: 'Visit order', chips: nodeChips(order), empty: 'none yet' });
    t.setPanel({
      kind: 'table',
      id: 'levels',
      title: 'Levels and parents',
      columns: ['node', 'level', 'parent'],
      rows: nodeIds(g).map((id) => ({ id, cells: [id, level.has(id) ? String(level.get(id)) : '–', parent.get(id) ?? '–'] })),
    });
    t.setRegions(levelRegions(level));
  };

  t.setAnnotationLabel('level');
  panels();
  yield t.frame({
    line: 0,
    note: `Breadth-first search explores in rings around ${s}: first every node one edge away, then two edges away, and so on. A first-in, first-out queue keeps the rings in order.`,
    vars: { s },
  });

  level.set(s, 0);
  parent.set(s, null);
  queue.push(s);
  t.mark(s, 'frontier');
  t.annotate(s, '0');
  panels();
  yield t.frame({ line: 1, note: `Start at ${s}: it is 0 edges from itself, so it is level 0. Put it in the queue.`, vars: { s } });

  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    t.count('visited');
    t.mark(u, 'key');
    panels();
    const waiting = [u, ...queue];
    const q = waiting.length > 1 ? choose(u, waiting.slice(1).reverse(), questions++) : null;
    yield t.frame({
      line: 3,
      note: `Dequeue ${u} from the front: it was discovered before anything else still waiting, so it is explored next.`,
      vars: { u, 'level[u]': level.get(u)! },
      ...(q && { ask: { question: 'Which node is dequeued next?', ...q } }),
    });

    for (const { to: v, edge } of adj.get(u)!) {
      t.count('edges');
      if (!level.has(v)) {
        const lv = level.get(u)! + 1;
        level.set(v, lv);
        parent.set(v, u);
        queue.push(v);
        t.mark(v, 'frontier');
        t.markEdge(edge, 'path');
        t.annotate(v, String(lv));
        panels();
        yield t.frame({
          line: 7,
          note: `${u} ${sep} ${v}: ${v} is undiscovered, so it is one ring further out than ${u}: level ${lv}. Record ${u} as its parent and enqueue it at the back.`,
          pulse: edge,
          vars: { u, v, 'level[v]': lv },
        });
      } else {
        const first = !explained;
        explained = true;
        const why = v === parent.get(u) ? `${v} is ${u}'s parent` : `${v} was already discovered at level ${level.get(v)}`;
        yield t.frame({
          line: 5,
          note: `${u} ${sep} ${v}: ${why}, so skip it.${first ? ' BFS never queues a node twice, which keeps the work to O(V + E).' : ''}`,
          edges: { compare: [edge] },
          vars: { u, v },
        });
      }
    }

    t.mark(u, 'visited');
    panels();
    yield t.frame({
      line: 2,
      note:
        queue.length > 0
          ? `${u} is finished: all its neighbours have been discovered. The queue still holds nodes, so keep going.`
          : `${u} is finished and the queue is empty.`,
      vars: { u },
    });
  }

  const unreached = nodeIds(g).filter((id) => !level.has(id));
  yield t.frame({
    line: 2,
    note:
      unreached.length === 0
        ? `Done: BFS reached all ${order.length} nodes. Each node's level is the fewest edges on any path from ${s}, and the tree edges form those shortest paths.`
        : `Done: ${list(unreached)} ${unreached.length === 1 ? 'was' : 'were'} never discovered, because no path from ${s} leads there. BFS only explores what its start can reach.`,
    vars: { reached: order.length, unreached: unreached.length },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>, start: string) =>
  fixedExample(id, label, () => ({ ...authored(rules, edges, at), start }));

export const breadthFirstSearch = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'breadth-first-search',
  view: 'graph',
  input: graphInput(rules, [
    N('network', 'Small network', NETWORK_EDGES, NETWORK_AT, 'A'),
    N('components', 'Two components', COMPONENTS_EDGES, COMPONENTS_AT, 'A'),
    N('one-way', 'One-way streets', ONE_WAY_EDGES, ONE_WAY_AT, 'A'),
    N('middle', 'Start in the middle', NETWORK_EDGES, NETWORK_AT, 'D'),
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
    { mark: 'frontier', label: 'Discovered, in the queue' },
    { mark: 'key', label: 'Being explored' },
    { mark: 'visited', label: 'Finished' },
    { mark: 'path', label: 'Tree edge (parent link)' },
    { mark: 'compare', label: 'Edge to a discovered node' },
  ],
  run: bfs,
  content: {
    idea: 'Explore a graph in rings around the start: every node one edge away, then every node two edges away, and so on. A first-in, first-out queue is what keeps the rings in order.',
    invariant: 'The queue holds discovered-but-unexplored nodes in nondecreasing level order, and its first and last levels differ by at most one. So a node’s level, fixed when it is discovered, is its fewest-edges distance from the start.',
    whenToUse: 'Shortest paths when every edge costs the same (fewest hops, fewest moves in a puzzle), level-by-level processing, and finding everything reachable. With weighted edges, use Dijkstra instead.',
    traits: [
      { label: 'Shortest paths by edge count', good: true },
      { label: 'Ignores edge weights', good: false },
      { label: 'Each node and edge handled once: O(V + E)', good: true },
      { label: 'Queue can hold O(V) nodes', good: null },
    ],
    experiments: [
      { example: 'components', prompt: 'BFS from A never reaches E, F or G. What would you need to do to visit every node?' },
      { example: 'middle', prompt: 'Same graph, started from D. Predict each node’s level before you run it.' },
      { example: 'one-way', prompt: 'Edges only go one way. Which nodes can A reach, and which can’t it?' },
      { example: 'network', prompt: 'Compare the visit order with depth-first search on this same graph.' },
    ],
  },
});

import { bfs, pseudocode as bfsCode } from '@/algorithms/graph/breadth-first-search';
import { dfs, pseudocode as dfsCode } from '@/algorithms/graph/depth-first-search';
import { defineStructure, type Args } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GraphTracer } from '@/viz/graph/tracer';
import type { GraphState } from '@/viz/graph/types';
import {
  addEdgeReason as newEdgeReason,
  addVertexReason,
  EDGE_ARG,
  empty,
  endpoints,
  findEdge,
  FROM_ARG,
  hasVertex,
  idOf,
  makeModel,
  NEW_VERTEX_ARG,
  noEdges,
  selfLoop,
  sep,
  TO_ARG,
  tooFew,
  VERTEX_ARG,
  WEIGHT_ARG,
  withEdge,
  withoutEdge,
  withoutVertex,
  withVertex,
  type GraphModel,
} from './model';

type Op = Generator<Frame<GraphState>, GraphModel>;
const STATS = ['visited', 'edges'];

function tracer(m: GraphModel) {
  const t = new GraphTracer(m, STATS);
  t.setPanel({
    kind: 'facts',
    id: 'size',
    title: 'Graph',
    facts: [
      { label: 'Vertices (V)', value: String(m.nodes.length) },
      { label: 'Edges (E)', value: String(m.edges.length) },
      { label: 'Kind', value: `${m.directed ? 'directed' : 'undirected'}, ${m.weighted ? 'weighted' : 'unweighted'}` },
    ],
  });
  return t;
}

/**
 * Add edge: two different vertices. In a weighted graph an existing edge may
 * be added again to change its weight, so only the same weight is blocked.
 */
function addEdgeReason(m: GraphModel, args?: Args): string | null {
  if (!m.weighted) return newEdgeReason(m, args);
  const shape = tooFew(m);
  if (shape || !args) return shape;
  const [u, v, w] = [String(args.u), String(args.v), Number(args.w ?? 1)];
  return selfLoop(m, u, v) ?? (findEdge(m, u, v)?.weight === w ? `${u}${sep(m)}${v} already has weight ${w}: pick another weight to change it.` : null);
}

// The early returns below are unreachable from the explorer and URL replay,
// which check choices and disabledReason first; they keep a direct call with
// bad arguments from corrupting the model.

function* addVertex(m: GraphModel, args: Args): Op {
  const t = tracer(m);
  const x = String(args.v);
  if (addVertexReason(m, args)) return m;
  yield t.frame({ line: 0, note: `Add a vertex called ${x}.`, vars: { x } });
  const next = withVertex(m, x);
  const t2 = tracer(next);
  t2.mark(x, 'key');
  yield t2.frame({ line: 2, note: `${x} is in the graph with no edges yet (degree 0). Connect it with “Add edge”.`, vars: { x, V: next.nodes.length } });
  return next;
}

function* removeVertex(m: GraphModel, args: Args): Op {
  const t = tracer(m);
  const x = String(args.v);
  if (!hasVertex(m, x)) return m;
  const touching = m.edges.filter((e) => e.from === x || e.to === x);
  t.count('edges', m.edges.length);
  t.mark(x, 'reject');
  for (const e of touching) t.markEdge(idOf(m, e), 'reject');
  yield t.frame({
    line: 1,
    note: touching.length
      ? `Removing ${x} also removes the ${touching.length} edge${touching.length === 1 ? '' : 's'} touching it: an edge can't point at a vertex that no longer exists.`
      : `${x} has no edges, so only the vertex itself goes.`,
    vars: { x, edges: touching.length },
  });
  const next = withoutVertex(m, x);
  const t2 = tracer(next);
  t2.count('edges', m.edges.length);
  yield t2.frame({ line: 3, note: `${x} is gone. The graph now has ${next.nodes.length} vertices and ${next.edges.length} edges.`, vars: { V: next.nodes.length, E: next.edges.length } });
  return next;
}

function* addEdge(m: GraphModel, args: Args): Op {
  const [u, v, w] = [String(args.u), String(args.v), Number(args.w ?? 1)];
  if (!hasVertex(m, u) || !hasVertex(m, v) || addEdgeReason(m, args)) return m;
  const existing = findEdge(m, u, v);
  const next = withEdge(m, u, v, w);
  const t2 = tracer(next);
  const id = idOf(next, findEdge(next, u, v)!);
  t2.markEdge(id, 'write');
  t2.mark(u, 'key');
  t2.mark(v, 'key');
  if (existing) {
    yield t2.frame({
      line: 1,
      note: `${u}${sep(m)}${v} already exists, so update its weight from ${existing.weight} to ${w} rather than adding a second edge.`,
      pulse: id,
      vars: { u, v, w },
    });
    return next;
  }
  yield t2.frame({
    line: 2,
    note: m.directed
      ? `Add the one-way edge ${u} → ${v}${m.weighted ? ` with weight ${w}` : ''}. ${v} can't use it to reach ${u}.`
      : `Connect ${u} and ${v}${m.weighted ? ` with weight ${w}` : ''}. The edge works both ways.`,
    pulse: id,
    vars: { u, v, w, E: next.edges.length },
  });
  return next;
}

function* removeEdge(m: GraphModel, args: Args): Op {
  const t = tracer(m);
  const [u, v] = endpoints(String(args.e));
  const existing = findEdge(m, u, v);
  if (!existing) return m;
  t.markEdge(idOf(m, existing), 'reject');
  yield t.frame({ line: 1, note: `Remove the edge ${u}${sep(m)}${v}. Both vertices stay.`, vars: { u, v } });
  const next = withoutEdge(m, u, v);
  yield tracer(next).frame({ line: 1, note: `${u}${sep(m)}${v} is gone. The graph has ${next.edges.length} edges now.`, vars: { E: next.edges.length } });
  return next;
}

function* traversal(m: GraphModel, args: Args, kind: 'bfs' | 'dfs'): Op {
  const s = String(args.v);
  if (!hasVertex(m, s)) return m;
  yield* (kind === 'bfs' ? bfs : dfs)({ ...m, start: s, target: null });
  return m;
}

const NETWORK = makeModel(false, true, ['A', 'B', 'C', 'D', 'E', 'F'], 'A-B:4, A-C:2, B-C:5, B-D:10, C-E:3, D-E:4, D-F:11, E-F:6');
const ONE_WAY = makeModel(true, true, ['A', 'B', 'C', 'D', 'E'], 'A>B:3, B>C:1, C>A:2, C>D:5, D>E:4');

export const graph = defineStructure<GraphModel, GraphState>({
  kind: 'structure',
  slug: 'graph',
  view: 'graph',
  initial: [
    { id: 'network', label: 'Small network', make: () => NETWORK },
    { id: 'one-way', label: 'Directed', make: () => ONE_WAY },
    { id: 'empty-undirected', label: 'Empty (undirected)', make: () => makeModel(false, true, [], '') },
    { id: 'empty-directed', label: 'Empty (directed)', make: () => makeModel(true, true, [], '') },
  ],
  snapshot: (m) => tracer(m).frame({ note: '' }).state,
  operations: [
    {
      id: 'add-vertex',
      label: 'Add vertex',
      args: [NEW_VERTEX_ARG],
      pseudocode: ['addVertex(x):', '  if x already exists: stop', '  create x with no edges'],
      disabledReason: addVertexReason,
      run: addVertex,
    },
    {
      id: 'remove-vertex',
      label: 'Remove vertex',
      args: [VERTEX_ARG],
      pseudocode: ['removeVertex(x):', '  for each edge touching x:', '    delete that edge', '  delete x'],
      disabledReason: empty,
      run: removeVertex,
    },
    {
      id: 'add-edge',
      label: 'Add edge',
      args: [FROM_ARG, TO_ARG, WEIGHT_ARG],
      pseudocode: ['addEdge(u, v, w):', '  if u–v exists: update its weight', '  else: connect u and v (weight w)'],
      disabledReason: addEdgeReason,
      run: addEdge,
    },
    {
      id: 'remove-edge',
      label: 'Remove edge',
      args: [EDGE_ARG],
      pseudocode: ['removeEdge(u, v):', '  delete the edge u–v'],
      disabledReason: noEdges,
      run: removeEdge,
    },
    { id: 'bfs', label: 'BFS from', args: [VERTEX_ARG], pseudocode: bfsCode, disabledReason: empty, run: (m, a) => traversal(m, a, 'bfs') },
    { id: 'dfs', label: 'DFS from', args: [VERTEX_ARG], pseudocode: dfsCode, disabledReason: empty, run: (m, a) => traversal(m, a, 'dfs') },
  ],
  stats: [
    { key: 'visited', label: 'Vertices visited' },
    { key: 'edges', label: 'Edges examined' },
  ],
  legend: [
    { neutral: 'Vertex' },
    { mark: 'key', label: 'Just added / being explored' },
    { mark: 'write', label: 'Edge just added' },
    { mark: 'reject', label: 'About to be removed' },
    { mark: 'frontier', label: 'Waiting (queue or stack)' },
    { mark: 'visited', label: 'Finished' },
    { mark: 'path', label: 'Traversal tree edge' },
    { mark: 'compare', label: 'Edge to a discovered vertex' },
  ],
  content: {
    idea: 'A graph is a set of vertices joined by edges. Edges can be one-way (directed) or two-way, and can carry weights such as distances. Almost any network, map or dependency structure is a graph.',
    invariant: 'Every edge joins two vertices that exist; removing a vertex removes its edges with it. In a simple graph each pair is joined at most once and no vertex links to itself.',
    whenToUse: 'Model anything made of things and connections: roads, friendships, web links, task dependencies. Store it as an adjacency list when it is sparse (few edges per vertex) and as an adjacency matrix when it is dense or you need instant edge lookups.',
    traits: [
      { label: 'Adjacency list: O(V + E) memory', good: true },
      { label: 'BFS and DFS visit everything in O(V + E)', good: true },
      { label: 'Directed or undirected', good: null },
      { label: 'Weighted or unweighted', good: null },
    ],
    experiments: [],
  },
});

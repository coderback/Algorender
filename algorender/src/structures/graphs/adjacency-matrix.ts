import { defineStructure, type Args } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GraphTracer } from '@/viz/graph/tracer';
import type { GraphState, Mark, NodeId } from '@/viz/graph/types';
import {
  badLabel,
  empty,
  findEdge,
  FROM_ARG,
  full,
  hasVertex,
  idOf,
  makeModel,
  matrixPanel,
  missing,
  noEdges,
  TO_ARG,
  tooFew,
  VERTEX_ARG,
  withEdge,
  withoutEdge,
  withoutVertex,
  withVertex,
  type GraphModel,
} from './model';

type Op = Generator<Frame<GraphState>, GraphModel>;
type CellMark = { row: NodeId; col: NodeId; mark: Mark };

const STATS = ['cells'];

function view(m: GraphModel, cells: number, marks: CellMark[] = [], caption?: string) {
  const t = new GraphTracer(m, STATS);
  t.stats.cells = cells;
  t.setPanel(matrixPanel(m, marks, caption));
  const V = m.nodes.length;
  t.setPanel({
    kind: 'facts',
    id: 'memory',
    title: 'Memory',
    facts: [
      { label: 'Cells (V²)', value: String(V * V) },
      { label: 'Cells holding an edge', value: `${m.directed ? m.edges.length : 2 * m.edges.length}` },
    ],
  });
  return t;
}

const rowAndColumn = (m: GraphModel, x: NodeId, mark: Mark): CellMark[] =>
  m.nodes.flatMap((n) => [
    { row: x, col: n.id, mark },
    { row: n.id, col: x, mark },
  ]);

function* addVertex(m: GraphModel, args: Args): Op {
  const x = String(args.v);
  const problem = badLabel(x) ?? (hasVertex(m, x) ? `${x} already has a row and a column: vertex names must be unique. Nothing changes.` : null);
  if (problem) {
    yield view(m, 0).frame({ line: 1, note: problem, vars: { x } });
    return m;
  }
  const V = m.nodes.length;
  const next = withVertex(m, x);
  const cells = V * V + (2 * V + 1);
  const t = view(next, cells, rowAndColumn(next, x, 'write'));
  t.mark(x, 'key');
  yield t.frame({
    line: 3,
    note: `A matrix can't grow in place: allocate a ${V + 1} × ${V + 1} matrix, copy the ${V * V} old cells across, and fill ${x}'s new row and column with 0. That is O(V²) work for one vertex.`,
    vars: { x, V: V + 1, cells },
  });
  return next;
}

function* removeVertex(m: GraphModel, args: Args): Op {
  const x = String(args.v);
  const problem = missing(m, x);
  if (problem) {
    yield view(m, 0).frame({ line: 0, note: `${problem} Nothing to remove.`, vars: { x } });
    return m;
  }
  const V = m.nodes.length;
  const t = view(m, 0, rowAndColumn(m, x, 'reject'));
  t.mark(x, 'reject');
  for (const e of m.edges) if (e.from === x || e.to === x) t.markEdge(idOf(m, e), 'reject');
  yield t.frame({
    line: 1,
    note: `Delete row ${x} and column ${x}. Every 1 in them was an edge touching ${x}, so those edges disappear with it.`,
    vars: { x },
  });
  const next = withoutVertex(m, x);
  const cells = (V - 1) * (V - 1);
  yield view(next, cells).frame({
    line: 2,
    note: `Close the gap by shifting the later rows up and columns left: the ${cells} remaining cells move into a ${V - 1} × ${V - 1} matrix, O(V²).`,
    vars: { V: V - 1, cells },
  });
  return next;
}

function* setEdge(m: GraphModel, args: Args, on: boolean): Op {
  const [u, v] = [String(args.u), String(args.v)];
  const problem = missing(m, u, v) ?? (on && u === v ? `M[${u}][${u}] would be a self-loop, which this graph doesn't allow.` : null);
  if (problem) {
    yield view(m, 0).frame({ line: 1, note: `${problem} Nothing changes.`, vars: { u, v } });
    return m;
  }
  const exists = findEdge(m, u, v) != null;
  if (!on && !exists) {
    yield view(m, 1, [{ row: u, col: v, mark: 'key' }]).frame({
      line: 1,
      note: `M[${u}][${v}] is already 0: there is no edge ${u}${m.directed ? '→' : '–'}${v} to remove. Checking took one cell read.`,
      vars: { u, v },
    });
    return m;
  }
  if (on && exists) {
    yield view(m, 1, [{ row: u, col: v, mark: 'found' }]).frame({
      line: 2,
      note: `M[${u}][${v}] is already 1: the edge exists, and a matrix has room for only one edge per pair. Nothing changes.`,
      vars: { u, v },
    });
    return m;
  }
  const next = on ? withEdge(m, u, v, 1) : withoutEdge(m, u, v);
  const edgeId = idOf(m, on ? { from: u, to: v } : findEdge(m, u, v)!);
  const sep = m.directed ? '→' : '–';
  if (m.directed) {
    const t = view(next, 1, [{ row: u, col: v, mark: 'write' }]);
    if (on) t.markEdge(edgeId, 'write');
    yield t.frame({
      line: 2,
      note: on
        ? `Set M[${u}][${v}] ← 1. One write, O(1): the row and column numbers lead straight to the cell, whatever the size of the graph.`
        : `Set M[${u}][${v}] ← 0: the edge ${u} → ${v} is gone. One write, O(1).`,
      ...(on && { pulse: edgeId }),
      vars: { u, v },
    });
    return next;
  }

  // Undirected: two writes, shown one at a time.
  const base = on ? next : m;
  const t1 = view(base, 1);
  const panel = matrixPanel(base, [{ row: u, col: v, mark: 'write' }]);
  const [ui, vi] = [panel.labels.indexOf(u), panel.labels.indexOf(v)];
  const [r, c] = on ? [vi, ui] : [ui, vi];
  t1.setPanel({ ...panel, cells: panel.cells.map((row, i) => (i === r ? row.map((x, k) => (k === c ? '0' : x)) : row)) });
  t1.markEdge(edgeId, on ? 'write' : 'reject');
  yield t1.frame({
    line: 2,
    note: on
      ? `Set M[${u}][${v}] ← 1. One write, O(1): the row and column numbers lead straight to the cell, whatever the size of the graph.`
      : `Set M[${u}][${v}] ← 0. One write, O(1).`,
    ...(on && { pulse: edgeId }),
    vars: { u, v },
  });
  const t2 = view(next, 2, [
    { row: u, col: v, mark: 'write' },
    { row: v, col: u, mark: 'write' },
  ]);
  if (on) t2.markEdge(edgeId, 'write');
  yield t2.frame({
    line: 3,
    note: on
      ? `Undirected, so mirror it: M[${v}][${u}] ← 1 too. The matrix of an undirected graph is symmetric about its diagonal.`
      : `Undirected, so clear the mirror cell M[${v}][${u}] as well: ${u}${sep}${v} is gone.`,
    vars: { u, v },
  });
  return next;
}

function* hasEdge(m: GraphModel, args: Args): Op {
  const [u, v] = [String(args.u), String(args.v)];
  const problem = missing(m, u, v);
  if (problem) {
    yield view(m, 0).frame({ line: 0, note: problem, vars: { u, v } });
    return m;
  }
  const yes = findEdge(m, u, v) != null;
  const t = view(m, 1, [{ row: u, col: v, mark: yes ? 'found' : 'key' }]);
  t.mark(u, 'key');
  t.mark(v, 'key');
  if (yes) t.markEdge(idOf(m, findEdge(m, u, v)!), 'found');
  yield t.frame({
    line: 1,
    note: `Read the single cell M[${u}][${v}] = ${yes ? 1 : 0}: ${yes ? 'yes, the edge exists' : 'no edge'}. One read, O(1), however many vertices or edges there are. An adjacency list would have to walk adj[${u}].`,
    vars: { u, v, 'M[u][v]': yes ? 1 : 0 },
  });
  return m;
}

function* neighbours(m: GraphModel, args: Args): Op {
  const u = String(args.v);
  const problem = missing(m, u);
  if (problem) {
    yield view(m, 0).frame({ line: 0, note: problem, vars: { u } });
    return m;
  }
  const found: NodeId[] = [];
  const marks: CellMark[] = [];
  let reads = 0;
  for (const n of m.nodes) {
    reads++;
    const yes = findEdge(m, u, n.id) != null;
    if (yes) found.push(n.id);
    const t = view(m, reads, [...marks, { row: u, col: n.id, mark: yes ? 'found' : 'compare' }]);
    t.mark(u, 'key');
    for (const f of found) {
      t.mark(f, 'path');
      t.markEdge(idOf(m, findEdge(m, u, f)!), 'path');
    }
    yield t.frame({
      line: 2,
      note: yes ? `M[${u}][${n.id}] = 1: report ${n.id}.` : `M[${u}][${n.id}] = 0: not a neighbour, but the cell still had to be read.`,
      vars: { u, v: n.id },
    });
    marks.push({ row: u, col: n.id, mark: yes ? 'path' : 'visited' });
  }
  const t = view(m, reads, marks);
  t.mark(u, 'key');
  for (const f of found) t.mark(f, 'path');
  yield t.frame({
    line: 1,
    note: `${found.length ? `${u}'s neighbours are ${found.join(', ')}` : `${u} has no neighbours`}, but finding ${found.length === 1 ? 'it' : 'them'} took ${reads} reads: the whole row, O(V). An adjacency list needs only deg(${u}) = ${found.length}.`,
    vars: { u, reads },
  });
  return m;
}

const SMALL = makeModel(false, false, ['A', 'B', 'C', 'D', 'E'], 'A-B, A-C, B-C, B-D, C-E, D-E');
const DIRECTED = makeModel(true, false, ['A', 'B', 'C', 'D', 'E'], 'A>B, A>C, B>D, C>B, D>E, E>C');

export const adjacencyMatrix = defineStructure<GraphModel, GraphState>({
  kind: 'structure',
  slug: 'adjacency-matrix',
  view: 'graph',
  initial: [
    { id: 'undirected', label: 'Undirected graph', make: () => SMALL },
    { id: 'directed', label: 'Directed graph', make: () => DIRECTED },
    { id: 'empty', label: 'Empty', make: () => makeModel(false, false, [], '') },
  ],
  snapshot: (m) => view(m, 0).frame({ note: '' }).state,
  operations: [
    {
      id: 'add-vertex',
      label: 'Add vertex',
      args: [VERTEX_ARG],
      pseudocode: ['addVertex(x):', '  if x already exists: stop', '  allocate a (V+1) × (V+1) matrix', '  copy the old cells; fill x with 0s'],
      disabledReason: full,
      run: addVertex,
    },
    {
      id: 'remove-vertex',
      label: 'Remove vertex',
      args: [VERTEX_ARG],
      pseudocode: ['removeVertex(x):', '  delete row x and column x', '  shift later rows up, columns left'],
      disabledReason: empty,
      run: removeVertex,
    },
    {
      id: 'add-edge',
      label: 'Add edge',
      args: [FROM_ARG, TO_ARG],
      pseudocode: ['addEdge(u, v):', '  if u or v is missing: stop', '  M[u][v] ← 1', '  if undirected: M[v][u] ← 1'],
      disabledReason: tooFew,
      run: (m, a) => setEdge(m, a, true),
    },
    {
      id: 'remove-edge',
      label: 'Remove edge',
      args: [FROM_ARG, TO_ARG],
      pseudocode: ['removeEdge(u, v):', '  if M[u][v] = 0: stop', '  M[u][v] ← 0', '  if undirected: M[v][u] ← 0'],
      disabledReason: noEdges,
      run: (m, a) => setEdge(m, a, false),
    },
    {
      id: 'has-edge',
      label: 'Has edge?',
      args: [FROM_ARG, TO_ARG],
      pseudocode: ['hasEdge(u, v):', '  return M[u][v] = 1'],
      disabledReason: empty,
      run: hasEdge,
    },
    {
      id: 'neighbours',
      label: 'Neighbours of',
      args: [VERTEX_ARG],
      pseudocode: ['neighbours(u):', '  for each column v:', '    if M[u][v] = 1: report v'],
      disabledReason: empty,
      run: neighbours,
    },
  ],
  stats: [{ key: 'cells', label: 'Cells read or written' }],
  legend: [
    { neutral: 'Vertex / cell' },
    { mark: 'key', label: 'Vertex or cell in question' },
    { mark: 'compare', label: 'Cell read: 0' },
    { mark: 'found', label: 'Cell read: 1 (edge)' },
    { mark: 'write', label: 'Cell just written' },
    { mark: 'reject', label: 'About to be removed' },
    { mark: 'path', label: 'Reported neighbour' },
    { mark: 'visited', label: 'Already read' },
  ],
  content: {
    idea: 'Store a graph as a V × V grid of 0s and 1s: M[u][v] = 1 when there is an edge from u to v. Any single edge can be checked or changed in one step, at the cost of V² cells of memory however few edges there are.',
    invariant: 'M[u][v] = 1 exactly when the edge u → v exists; for an undirected graph the matrix is symmetric, M[u][v] = M[v][u].',
    whenToUse: 'Dense graphs, small graphs, and algorithms that ask “is there an edge u–v?” over and over (Floyd–Warshall, transitive closure). For large sparse graphs the V² memory and O(V) neighbour scans make an adjacency list the better choice.',
    traits: [
      { label: 'Edge lookup O(1)', good: true },
      { label: 'Add/remove edge O(1)', good: true },
      { label: 'O(V²) memory', good: false },
      { label: 'Neighbours cost O(V), even for few edges', good: false },
      { label: 'Adding a vertex copies O(V²) cells', good: false },
    ],
    experiments: [],
  },
});

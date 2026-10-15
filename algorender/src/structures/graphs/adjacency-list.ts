import { defineStructure, type Args } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GraphTracer } from '@/viz/graph/tracer';
import type { GraphState, Mark, NodeId } from '@/viz/graph/types';
import {
  adjacencyPanel,
  badLabel,
  empty,
  ENTRIES,
  entryId,
  findEdge,
  FROM_ARG,
  full,
  hasVertex,
  idOf,
  listOf,
  makeModel,
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
type Marks = { rows?: Record<NodeId, Mark>; entries?: Record<string, Mark> };

const STATS = ['scanned', 'changed'];

/** A tracer showing the model with its adjacency list; `stats` carries counts across models within one operation. */
function view(m: GraphModel, stats: Record<string, number>, marks: Marks = {}) {
  const t = new GraphTracer(m, STATS);
  Object.assign(t.stats, stats);
  t.setPanel(adjacencyPanel(m, marks));
  const entries = m.directed ? m.edges.length : 2 * m.edges.length;
  t.setPanel({
    kind: 'facts',
    id: 'memory',
    title: 'Memory',
    facts: [
      { label: 'Lists (one per vertex)', value: String(m.nodes.length) },
      { label: 'List entries', value: `${entries}${m.directed ? ' (= E)' : ' (= 2E)'}` },
    ],
  });
  return t;
}

function* addVertex(m: GraphModel, args: Args): Op {
  const stats = { scanned: 0, changed: 0 };
  const x = String(args.v);
  const problem = badLabel(x) ?? (hasVertex(m, x) ? `adj[${x}] already exists: vertex names must be unique. Nothing changes.` : null);
  if (problem) {
    yield view(m, stats).frame({ line: 1, note: problem, vars: { x } });
    return m;
  }
  const next = withVertex(m, x);
  stats.changed++;
  const t = view(next, stats, { rows: { [x]: 'write' } });
  t.mark(x, 'key');
  yield t.frame({
    line: 2,
    note: `Add the row adj[${x}], an empty list. That is O(1): no other list changes, because ${x} has no edges yet.`,
    vars: { x, V: next.nodes.length },
  });
  return next;
}

function* removeVertex(m: GraphModel, args: Args): Op {
  const stats = { scanned: 0, changed: 0 };
  const x = String(args.v);
  const problem = missing(m, x);
  if (problem) {
    yield view(m, stats).frame({ line: 0, note: `${problem} Nothing to remove.`, vars: { x } });
    return m;
  }
  const own = listOf(m, x);
  const ownMarks = Object.fromEntries(own.map((v) => [entryId(x, v), 'reject' as Mark]));
  let t = view(m, stats, { rows: { [x]: 'reject' }, entries: ownMarks });
  t.mark(x, 'reject');
  stats.changed += own.length;
  yield t.frame({
    line: 1,
    note: `Delete ${x}'s own list: ${own.length} entr${own.length === 1 ? 'y' : 'ies'} go with it.`,
    vars: { x, 'deg(x)': own.length },
  });

  // Other lists may still mention x. Nothing records who points at x, so check each list.
  let found = 0;
  for (const n of m.nodes) {
    if (n.id === x) continue;
    const list = listOf(m, n.id);
    const at = list.indexOf(x);
    stats.scanned += at < 0 ? list.length : at + 1;
    if (at < 0) continue;
    found++;
    stats.changed++;
    t = view(m, stats, { rows: { [x]: 'reject', [n.id]: 'compare' }, entries: { ...ownMarks, [entryId(n.id, x)]: 'reject' } });
    t.mark(x, 'reject');
    t.markEdge(idOf(m, findEdge(m, n.id, x)!), 'reject');
    yield t.frame({
      line: 3,
      note: `adj[${n.id}] mentions ${x} (entry ${at + 1} of ${list.length}): unlink it.`,
      vars: { u: n.id, x },
    });
  }
  const next = withoutVertex(m, x);
  yield view(next, stats).frame({
    line: 2,
    note: `${x} is gone after checking every other list (${stats.scanned} entries scanned, ${found} removed): O(V + E). ${
      m.directed ? 'A directed list only records out-edges, so finding who points at x means scanning everything.' : 'An undirected graph could jump straight to the lists of x’s neighbours instead.'
    }`,
    vars: { scanned: stats.scanned },
  });
  return next;
}

/** Scans adj[u] for v, one frame for the scan; returns the index or -1. */
function scanFrame(m: GraphModel, u: NodeId, v: NodeId, stats: Record<string, number>, line: number, extra: Marks = {}) {
  const list = listOf(m, u);
  const at = list.indexOf(v);
  const read = at < 0 ? list.length : at + 1;
  stats.scanned += read;
  const entries: Record<string, Mark> = { ...extra.entries };
  list.slice(0, read).forEach((w) => (entries[entryId(u, w)] = w === v ? 'found' : 'compare'));
  const t = view(m, stats, { rows: { ...extra.rows, [u]: 'key' }, entries });
  return { t, at, read, line, list };
}

function* addEdge(m: GraphModel, args: Args): Op {
  const stats = { scanned: 0, changed: 0 };
  const [u, v] = [String(args.u), String(args.v)];
  const problem = missing(m, u, v) ?? (u === v ? `${u}–${u} would be a self-loop, which this graph doesn't allow.` : null);
  if (problem) {
    yield view(m, stats).frame({ line: 1, note: `${problem} Nothing changes.`, vars: { u, v } });
    return m;
  }
  const scan = scanFrame(m, u, v, stats, 2);
  if (scan.at >= 0) {
    yield scan.t.frame({ line: 2, note: `${v} is already in adj[${u}] (found after ${scan.read} entr${scan.read === 1 ? 'y' : 'ies'}), so the edge exists: stop.`, vars: { u, v } });
    return m;
  }
  yield scan.t.frame({
    line: 2,
    note: `Scan adj[${u}] for ${v} first, so the edge isn't added twice: ${scan.list.length} entr${scan.list.length === 1 ? 'y' : 'ies'} read, O(deg(${u})). Not there.`,
    vars: { u, v, 'deg(u)': scan.list.length },
  });
  const next = withEdge(m, u, v, 1);
  stats.changed++;
  const id = idOf(next, findEdge(next, u, v)!);
  const t = view(next, stats, { entries: { [entryId(u, v)]: 'write' } });
  if (!m.directed) {
    // Show the first half alone: only u's list has the new entry so far.
    const panel = adjacencyPanel(next, { entries: { [entryId(u, v)]: 'write' } });
    t.setPanel({ ...panel, rows: panel.rows.map((r) => (r.id === v ? { ...r, entries: r.entries.filter((c) => c.id !== entryId(v, u)) } : r)) });
  }
  t.markEdge(id, 'write');
  yield t.frame({ line: 3, note: `Append ${v} to the end of adj[${u}]: O(1).`, pulse: id, vars: { u, v } });
  if (!m.directed) {
    stats.changed++;
    const t2 = view(next, stats, { entries: { [entryId(u, v)]: 'write', [entryId(v, u)]: 'write' } });
    t2.markEdge(id, 'write');
    yield t2.frame({
      line: 4,
      note: `The graph is undirected, so the edge is stored twice: also append ${u} to adj[${v}]. Each undirected edge costs two list entries.`,
      vars: { u, v },
    });
  }
  return next;
}

function* removeEdge(m: GraphModel, args: Args): Op {
  const stats = { scanned: 0, changed: 0 };
  const [u, v] = [String(args.u), String(args.v)];
  const problem = missing(m, u, v);
  if (problem) {
    yield view(m, stats).frame({ line: 1, note: `${problem} Nothing to remove.`, vars: { u, v } });
    return m;
  }
  const scan = scanFrame(m, u, v, stats, 1);
  if (scan.at < 0) {
    yield scan.t.frame({
      line: 1,
      note: `Scanned all ${scan.list.length} entr${scan.list.length === 1 ? 'y' : 'ies'} of adj[${u}]: no ${v}, so there is no edge to remove.${m.directed && findEdge(m, v, u) ? ` (${v} → ${u} exists, but that is a different edge.)` : ''}`,
      vars: { u, v },
    });
    return m;
  }
  const id = idOf(m, findEdge(m, u, v)!);
  scan.t.markEdge(id, 'reject');
  stats.changed++;
  yield scan.t.frame({ line: 1, note: `Walk adj[${u}] until ${v} (entry ${scan.at + 1}): O(deg(${u})). Unlink it.`, vars: { u, v } });
  if (!m.directed) {
    const back = scanFrame(m, v, u, stats, 2, { entries: { [entryId(u, v)]: 'reject' } });
    back.t.markEdge(id, 'reject');
    stats.changed++;
    yield back.t.frame({ line: 2, note: `Undirected: the edge is also stored in adj[${v}]. Walk it to ${u} (entry ${back.at + 1}) and unlink that too.`, vars: { u, v } });
  }
  const next = withoutEdge(m, u, v);
  yield view(next, stats).frame({ line: m.directed ? 1 : 2, note: `${u}${m.directed ? '→' : '–'}${v} is gone: ${stats.scanned} entries read in total.`, vars: { scanned: stats.scanned } });
  return next;
}

function* hasEdge(m: GraphModel, args: Args): Op {
  const stats = { scanned: 0, changed: 0 };
  const [u, v] = [String(args.u), String(args.v)];
  const problem = missing(m, u, v);
  if (problem) {
    yield view(m, stats).frame({ line: 0, note: problem, vars: { u, v } });
    return m;
  }
  const list = listOf(m, u);
  if (list.length === 0) {
    yield view(m, stats, { rows: { [u]: 'key' } }).frame({ line: 3, note: `adj[${u}] is empty: return false straight away.`, vars: { u, v } });
    return m;
  }
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    stats.scanned++;
    const entries: Record<string, Mark> = {};
    list.slice(0, i + 1).forEach((x, k) => (entries[entryId(u, x)] = k === i ? (w === v ? 'found' : 'compare') : 'visited'));
    const t = view(m, stats, { rows: { [u]: 'key' }, entries });
    t.mark(w, w === v ? 'found' : 'compare');
    if (w === v) {
      t.markEdge(idOf(m, findEdge(m, u, v)!), 'found');
      yield t.frame({ line: 2, note: `Entry ${i + 1} is ${v}: return true. It took ${i + 1} of ${list.length} reads; the cost depends on where ${v} sits in the list.`, vars: { u, v, i } });
      return m;
    }
    yield t.frame({ line: 2, note: `Entry ${i + 1} of adj[${u}] is ${w}, not ${v}: keep going.`, vars: { u, v, w, i } });
  }
  yield view(m, stats, { rows: { [u]: 'key' } }).frame({
    line: 3,
    note: `Reached the end of adj[${u}] without meeting ${v}: return false after ${list.length} reads, O(deg(${u})). An adjacency matrix answers this with one read.`,
    vars: { u, v },
  });
  return m;
}

function* neighbours(m: GraphModel, args: Args): Op {
  const stats = { scanned: 0, changed: 0 };
  const u = String(args.v);
  const problem = missing(m, u);
  if (problem) {
    yield view(m, stats).frame({ line: 0, note: problem, vars: { u } });
    return m;
  }
  const list = listOf(m, u);
  const entries: Record<string, Mark> = {};
  const seen: NodeId[] = [];
  for (const v of list) {
    stats.scanned++;
    entries[entryId(u, v)] = 'path';
    seen.push(v);
    const t = view(m, stats, { rows: { [u]: 'key' }, entries: { ...entries } });
    t.mark(u, 'key');
    for (const s of seen) t.mark(s, 'path');
    t.markEdge(idOf(m, findEdge(m, u, v)!), 'path');
    for (const s of seen.slice(0, -1)) t.markEdge(idOf(m, findEdge(m, u, s)!), 'path');
    yield t.frame({ line: 2, note: `Report ${v}.`, vars: { u, v } });
  }
  const t = view(m, stats, { rows: { [u]: 'key' }, entries });
  t.mark(u, 'key');
  for (const s of seen) t.mark(s, 'path');
  yield t.frame({
    line: 1,
    note: list.length
      ? `${u}'s ${m.directed ? 'out-' : ''}neighbours are ${seen.join(', ')}: ${list.length} reads for ${list.length} neighbours, O(deg(${u})). No time is spent on vertices that aren't neighbours.`
      : `adj[${u}] is empty: ${u} has no ${m.directed ? 'out-' : ''}neighbours.`,
    vars: { u, 'deg(u)': list.length },
  });
  return m;
}

const SMALL = makeModel(false, false, ['A', 'B', 'C', 'D', 'E'], 'A-B, A-C, B-C, B-D, C-E, D-E');
const DIRECTED = makeModel(true, false, ['A', 'B', 'C', 'D', 'E'], 'A>B, A>C, B>D, C>B, D>E, E>C');

export const adjacencyList = defineStructure<GraphModel, GraphState>({
  kind: 'structure',
  slug: 'adjacency-list',
  view: 'graph',
  initial: [
    { id: 'undirected', label: 'Undirected graph', make: () => SMALL },
    { id: 'directed', label: 'Directed graph', make: () => DIRECTED },
    { id: 'empty', label: 'Empty', make: () => makeModel(false, false, [], '') },
  ],
  snapshot: (m) => view(m, { scanned: 0, changed: 0 }).frame({ note: '' }).state,
  operations: [
    {
      id: 'add-vertex',
      label: 'Add vertex',
      args: [VERTEX_ARG],
      pseudocode: ['addVertex(x):', '  if adj[x] exists: stop', '  adj[x] ← empty list'],
      disabledReason: full,
      run: addVertex,
    },
    {
      id: 'remove-vertex',
      label: 'Remove vertex',
      args: [VERTEX_ARG],
      pseudocode: ['removeVertex(x):', '  delete the list adj[x]', '  for each other list adj[u]:', '    remove x from adj[u] if present'],
      disabledReason: empty,
      run: removeVertex,
    },
    {
      id: 'add-edge',
      label: 'Add edge',
      args: [FROM_ARG, TO_ARG],
      pseudocode: ['addEdge(u, v):', '  if u or v is missing: stop', '  if v is in adj[u]: stop', '  append v to adj[u]', '  if undirected: append u to adj[v]'],
      disabledReason: tooFew,
      run: addEdge,
    },
    {
      id: 'remove-edge',
      label: 'Remove edge',
      args: [FROM_ARG, TO_ARG],
      pseudocode: ['removeEdge(u, v):', '  find v in adj[u]; unlink it', '  if undirected: unlink u in adj[v]'],
      disabledReason: noEdges,
      run: removeEdge,
    },
    {
      id: 'has-edge',
      label: 'Has edge?',
      args: [FROM_ARG, TO_ARG],
      pseudocode: ['hasEdge(u, v):', '  for each w in adj[u]:', '    if w = v: return true', '  return false'],
      disabledReason: empty,
      run: hasEdge,
    },
    {
      id: 'neighbours',
      label: 'Neighbours of',
      args: [VERTEX_ARG],
      pseudocode: ['neighbours(u):', '  for each v in adj[u]:', '    report v'],
      disabledReason: empty,
      run: neighbours,
    },
  ],
  stats: [ENTRIES, { key: 'changed', label: 'Entries added/removed' }],
  legend: [
    { neutral: 'Vertex / list entry' },
    { mark: 'key', label: 'The list being read' },
    { mark: 'compare', label: 'Entry checked, no match' },
    { mark: 'found', label: 'Match found' },
    { mark: 'write', label: 'Entry just added' },
    { mark: 'reject', label: 'About to be removed' },
    { mark: 'path', label: 'Reported neighbour' },
    { mark: 'visited', label: 'Already read' },
  ],
  content: {
    idea: 'Store a graph as one list per vertex holding its neighbours. Memory grows with the edges that actually exist, O(V + E), and listing a vertex’s neighbours costs only its degree.',
    invariant: 'v appears in adj[u] exactly when there is an edge u → v; in an undirected graph every edge appears twice, once in each endpoint’s list.',
    whenToUse: 'The default for sparse graphs (road maps, social networks, the web), and for algorithms that walk neighbours: BFS, DFS, Dijkstra, Prim. Checking one specific edge is slower than in a matrix: O(deg(u)).',
    traits: [
      { label: 'O(V + E) memory', good: true },
      { label: 'Neighbours in O(deg)', good: true },
      { label: 'Edge lookup O(deg), not O(1)', good: false },
      { label: 'Removing a vertex scans the lists', good: false },
    ],
    experiments: [],
  },
});

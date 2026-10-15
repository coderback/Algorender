import type { Args, ArgSpec, StatSpec } from '@/engine/module';
import { circleLayout } from '@/viz/graph/layout';
import { edgeKey } from '@/viz/graph/tracer';
import type { AdjacencyPanel, Chip, EdgeId, Graph, Mark, MatrixPanel, NodeId } from '@/viz/graph/types';

/**
 * The model every graph data structure keeps: an immutable graph whose
 * vertices sit in fixed slots. Operations return a new model and never touch
 * the old one (the explorer keeps old models for undo and URL replay).
 */
export type GraphModel = Graph;

export const MAX_VERTICES = 10;

/** Ten fixed slots on a ring: a new vertex takes the first free one, so nothing ever moves. */
export const SLOTS: readonly { x: number; y: number }[] = (() => {
  const ids = Array.from({ length: MAX_VERTICES }, (_, i) => String(i));
  const pos = circleLayout(ids);
  return ids.map((id) => pos[id]);
})();

const LABEL = /^[A-Za-z0-9]{1,3}$/;

export function freeSlot(model: GraphModel): { x: number; y: number } | null {
  return SLOTS.find((s) => !model.nodes.some((n) => n.x === s.x && n.y === s.y)) ?? null;
}

export function makeModel(directed: boolean, weighted: boolean, labels: readonly NodeId[], edges: string): GraphModel {
  const nodes = labels.map((id, i) => ({ id, ...SLOTS[i] }));
  const parsed = edges
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const m = /^(\w+)[->](\w+)(?::(\d+))?$/.exec(token);
      if (!m) throw new Error(`Bad edge "${token}"`);
      return { from: m[1], to: m[2], weight: m[3] ? Number(m[3]) : 1 };
    });
  return { directed, weighted, nodes, edges: parsed };
}

// ───────────────────────────── queries ─────────────────────────────

export const hasVertex = (m: GraphModel, id: NodeId) => m.nodes.some((n) => n.id === id);

export function findEdge(m: GraphModel, u: NodeId, v: NodeId) {
  return m.edges.find((e) => (e.from === u && e.to === v) || (!m.directed && e.from === v && e.to === u)) ?? null;
}

export const idOf = (m: GraphModel, e: { from: NodeId; to: NodeId }): EdgeId => edgeKey(e.from, e.to, m.directed);

/** Neighbours of u in list order: the order its edges were added. */
export function listOf(m: GraphModel, u: NodeId): NodeId[] {
  const out: NodeId[] = [];
  for (const e of m.edges) {
    if (e.from === u) out.push(e.to);
    else if (!m.directed && e.to === u) out.push(e.from);
  }
  return out;
}

export const degree = (m: GraphModel, u: NodeId) => listOf(m, u).length;

/** "–" between the ends of an undirected edge, "→" for a directed one. */
export const sep = (m: GraphModel) => (m.directed ? '→' : '–');

/** Natural order for vertex names: A, B, …, 2, 10. */
const byLabel = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** The vertex names, sorted: the options of every vertex dropdown. */
export const vertexLabels = (m: GraphModel): string[] => m.nodes.map((n) => n.id).sort(byLabel);

/** An edge's ends as the dropdown shows them: from then to, or in name order when undirected. */
const ends = (m: GraphModel, e: { from: NodeId; to: NodeId }): [NodeId, NodeId] =>
  m.directed || byLabel(e.from, e.to) <= 0 ? [e.from, e.to] : [e.to, e.from];

/** Every existing edge as "A–B" (or "A→B" when directed), sorted: the options of the edge dropdown. */
export function edgeLabels(m: GraphModel): string[] {
  return m.edges
    .map((e) => ends(m, e))
    .sort(([a, b], [c, d]) => byLabel(a, c) || byLabel(b, d))
    .map(([u, v]) => `${u}${sep(m)}${v}`);
}

/** The two vertices an edge label names. */
export function endpoints(label: string): [NodeId, NodeId] {
  const [u = '', v = ''] = label.split(/[–→]/);
  return [u, v];
}

/** Why a label can't name a vertex, or null. */
export function badLabel(label: string): string | null {
  return LABEL.test(label) ? null : `"${label}" isn't a valid vertex name: use 1–3 letters or digits.`;
}

// ───────────────────────────── changes (pure) ─────────────────────────────

export function withVertex(m: GraphModel, id: NodeId): GraphModel {
  const slot = freeSlot(m)!;
  return { ...m, nodes: [...m.nodes, { id, ...slot }] };
}

export function withoutVertex(m: GraphModel, id: NodeId): GraphModel {
  return { ...m, nodes: m.nodes.filter((n) => n.id !== id), edges: m.edges.filter((e) => e.from !== id && e.to !== id) };
}

export function withEdge(m: GraphModel, u: NodeId, v: NodeId, weight: number): GraphModel {
  const existing = findEdge(m, u, v);
  if (existing) return { ...m, edges: m.edges.map((e) => (e === existing ? { ...e, weight } : e)) };
  return { ...m, edges: [...m.edges, { from: u, to: v, weight }] };
}

export function withoutEdge(m: GraphModel, u: NodeId, v: NodeId): GraphModel {
  const existing = findEdge(m, u, v);
  return { ...m, edges: m.edges.filter((e) => e !== existing) };
}

// ───────────────────────────── panels ─────────────────────────────

export type EntryMarks = Readonly<Record<string, Mark>>;
export const entryId = (u: NodeId, v: NodeId) => `${u}→${v}`;

/** The adjacency list as a panel. `entries` marks list cells by entryId(u, v); `rows` marks whole rows. */
export function adjacencyPanel(m: GraphModel, opts: { rows?: Readonly<Record<NodeId, Mark>>; entries?: EntryMarks } = {}): AdjacencyPanel {
  return {
    kind: 'adjacency',
    id: 'adjacency',
    title: m.directed ? 'Adjacency list (out-neighbours)' : 'Adjacency list',
    rows: m.nodes.map((n) => ({
      id: n.id,
      entries: listOf(m, n.id).map((v): Chip => {
        const mark = opts.entries?.[entryId(n.id, v)];
        return { id: entryId(n.id, v), label: v, ...(m.weighted && { sub: String(findEdge(m, n.id, v)!.weight) }), ...(mark && { mark }) };
      }),
      ...(opts.rows?.[n.id] && { mark: opts.rows[n.id] }),
    })),
  };
}

/** The adjacency matrix as a panel: M[u][v] = 1 when there is an edge u → v. */
export function matrixPanel(m: GraphModel, marks: { row: NodeId; col: NodeId; mark: Mark }[] = [], caption?: string): MatrixPanel {
  const ids = m.nodes.map((n) => n.id);
  const at = new Map(ids.map((id, i) => [id, i]));
  return {
    kind: 'matrix',
    id: 'matrix',
    title: `Adjacency matrix (${ids.length} × ${ids.length} = ${ids.length * ids.length} cells)`,
    labels: ids,
    cells: ids.map((u) => ids.map((v) => (findEdge(m, u, v) ? '1' : '0'))),
    marks: marks.filter((x) => at.has(x.row) && at.has(x.col)).map((x) => ({ row: at.get(x.row)!, col: at.get(x.col)!, mark: x.mark })),
    dimZeros: true,
    ...(caption && { caption }),
  };
}

// ───────────────────────────── shared specs ─────────────────────────────

type ChoiceArg = Extract<ArgSpec<GraphModel>, { type: 'choice' }>;

/** A new vertex's name: free text, checked by addVertexReason. */
export const NEW_VERTEX_ARG: ArgSpec<GraphModel> = { name: 'v', label: 'Vertex', type: 'text', maxLength: 3, placeholder: 'e.g. G' };
/** Existing vertices only, so no operation can name a vertex that isn't there. */
export const VERTEX_ARG: ChoiceArg = { name: 'v', label: 'Vertex', type: 'choice', options: vertexLabels };
export const FROM_ARG: ChoiceArg = { name: 'u', label: 'From', type: 'choice', options: vertexLabels };
export const TO_ARG: ChoiceArg = { name: 'v', label: 'To', type: 'choice', options: vertexLabels };
/** Existing edges only, e.g. "A–B"; endpoints() turns one back into its two vertices. */
export const EDGE_ARG: ChoiceArg = { name: 'e', label: 'Edge', type: 'choice', options: edgeLabels };
export const WEIGHT_ARG: ArgSpec<GraphModel> = { name: 'w', label: 'Weight', type: 'int', min: 1, max: 99, default: 1 };

export const full = (m: GraphModel) => (m.nodes.length >= MAX_VERTICES ? `The graph is full (${MAX_VERTICES} vertices). Remove one first.` : null);
export const empty = (m: GraphModel) => (m.nodes.length === 0 ? 'The graph has no vertices yet.' : null);
export const noEdges = (m: GraphModel) => (m.edges.length === 0 ? 'The graph has no edges to remove.' : null);
export const tooFew = (m: GraphModel) => (m.nodes.length < 2 ? 'An edge needs two vertices: add another vertex first.' : null);

/** A simple graph with every pair already joined has no edge left to add. */
export function complete(m: GraphModel): string | null {
  const V = m.nodes.length;
  const pairs = m.directed ? V * (V - 1) : (V * (V - 1)) / 2;
  return V >= 2 && m.edges.length >= pairs
    ? `Every ${m.directed ? 'ordered ' : ''}pair of vertices is already joined: there is no edge left to add.`
    : null;
}

export const selfLoop = (m: GraphModel, u: NodeId, v: NodeId) =>
  u === v ? `${u}${sep(m)}${u} would be a self-loop, which this graph doesn't allow.` : null;

/** Add vertex: there is room, and the name is valid and not taken. */
export function addVertexReason(m: GraphModel, args?: Args): string | null {
  const room = full(m);
  if (room || !args) return room;
  const x = String(args.v);
  return badLabel(x) ?? (hasVertex(m, x) ? `There is already a vertex ${x}: vertex names must be unique.` : null);
}

/** Add edge, in an unweighted graph: two different vertices that aren't joined yet. */
export function addEdgeReason(m: GraphModel, args?: Args): string | null {
  const shape = tooFew(m) ?? complete(m);
  if (shape || !args) return shape;
  const [u, v] = [String(args.u), String(args.v)];
  return selfLoop(m, u, v) ?? (findEdge(m, u, v) ? `There is already an edge ${u}${sep(m)}${v}.` : null);
}

export const ENTRIES: StatSpec = { key: 'scanned', label: 'Entries scanned' };

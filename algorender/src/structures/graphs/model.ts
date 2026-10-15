import type { ArgSpec, StatSpec } from '@/engine/module';
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

/** Why a label can't name a vertex, or null. */
export function badLabel(label: string): string | null {
  return LABEL.test(label) ? null : `"${label}" isn't a valid vertex name: use 1–3 letters or digits.`;
}

export function missing(m: GraphModel, ...ids: NodeId[]): string | null {
  const absent = ids.filter((id) => !hasVertex(m, id));
  if (absent.length === 0) return null;
  const names = m.nodes.map((n) => n.id).join(', ');
  return `There is no vertex ${absent.map((a) => `"${a}"`).join(' or ')}. ${names ? `The vertices are ${names}.` : 'The graph is empty.'}`;
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

export const VERTEX_ARG: ArgSpec = { name: 'v', label: 'Vertex', type: 'text', maxLength: 3, placeholder: 'e.g. G' };
export const FROM_ARG: ArgSpec = { name: 'u', label: 'From', type: 'text', maxLength: 3, placeholder: 'from' };
export const TO_ARG: ArgSpec = { name: 'v', label: 'To', type: 'text', maxLength: 3, placeholder: 'to' };
export const WEIGHT_ARG: ArgSpec = { name: 'w', label: 'Weight', type: 'int', min: 1, max: 99, default: 1 };

export const full = (m: GraphModel) => (m.nodes.length >= MAX_VERTICES ? `The graph is full (${MAX_VERTICES} vertices). Remove one first.` : null);
export const empty = (m: GraphModel) => (m.nodes.length === 0 ? 'The graph has no vertices yet.' : null);
export const noEdges = (m: GraphModel) => (m.edges.length === 0 ? 'The graph has no edges to remove.' : null);
export const tooFew = (m: GraphModel) => (m.nodes.length < 2 ? 'An edge needs two vertices: add another vertex first.' : null);

export const ENTRIES: StatSpec = { key: 'scanned', label: 'Entries scanned' };

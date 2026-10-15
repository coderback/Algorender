import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { EdgeId, Graph, GraphEdge, GraphNode, GraphState, Mark, NodeId, Panel } from './types';

/** Edge id: "A>B" for a directed edge, "A-B" for an undirected one (in the order given). */
export function edgeKey(from: NodeId, to: NodeId, directed: boolean): EdgeId {
  return `${from}${directed ? '>' : '-'}${to}`;
}

/** A frame that may carry a question about itself, to be asked on the frame before it (see askAhead). */
export type GraphFrame = Frame<GraphState> & { ask?: Checkpoint };

export type GraphFrameOptions = {
  note: string;
  line?: number | null;
  /** Marks for this frame only, layered over the persistent ones. */
  nodes?: Partial<Record<Mark, readonly NodeId[]>>;
  edges?: Partial<Record<Mark, readonly EdgeId[]>>;
  /** Pulse this edge once (a relaxation or an accepted edge). */
  pulse?: EdgeId | null;
  vars?: Record<string, VarValue>;
  /** A question this frame answers. askAhead() moves it onto the previous frame, which must not give it away. */
  ask?: Checkpoint;
};

/**
 * Authoring API for graph algorithms, in the style of ArrayTracer: change
 * persistent marks, annotations and panels through methods and call frame() at
 * each meaningful event. Every change replaces the record it touches, so a
 * snapshot shares everything unchanged with earlier frames.
 */
export class GraphTracer {
  readonly directed: boolean;
  readonly weighted: boolean;
  readonly stats: Record<string, number>;
  private nodes: readonly GraphNode[];
  private edges: readonly GraphEdge[];
  private nodeMarks: Readonly<Record<NodeId, Mark>> = {};
  private edgeMarks: Readonly<Record<EdgeId, Mark>> = {};
  private annotations: Readonly<Record<NodeId, string>> = {};
  private badges: Readonly<Record<NodeId, string>> = {};
  private annotationLabel: string | null = null;
  private panels: readonly Panel[] = [];
  private pulses = 0;

  constructor(graph: Graph, trackedStats: readonly string[]) {
    this.directed = graph.directed;
    this.weighted = graph.weighted;
    this.nodes = graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
    this.edges = graph.edges.map((e) => ({ id: edgeKey(e.from, e.to, graph.directed), from: e.from, to: e.to, weight: e.weight }));
    this.stats = Object.fromEntries(trackedStats.map((name) => [name, 0]));
  }

  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  /** The edge joining u and v (either direction when undirected), or null. */
  edgeId(u: NodeId, v: NodeId): EdgeId | null {
    for (const e of this.edges) {
      if (e.from === u && e.to === v) return e.id;
      if (!this.directed && e.from === v && e.to === u) return e.id;
    }
    return null;
  }

  // ── persistent decoration ──

  mark(node: NodeId, mark: Mark | null) {
    this.nodeMarks = withEntry(this.nodeMarks, node, mark);
  }

  markEdge(edge: EdgeId | null, mark: Mark | null) {
    if (edge != null) this.edgeMarks = withEntry(this.edgeMarks, edge, mark);
  }

  clearMarks() {
    this.nodeMarks = {};
    this.edgeMarks = {};
  }

  annotate(node: NodeId, text: string | null) {
    this.annotations = withEntry(this.annotations, node, text);
  }

  setAnnotationLabel(label: string | null) {
    this.annotationLabel = label;
  }

  badge(node: NodeId, text: string | null) {
    this.badges = withEntry(this.badges, node, text);
  }

  /** Adds a panel, or replaces the one with the same id in place. */
  setPanel(panel: Panel) {
    const i = this.panels.findIndex((p) => p.id === panel.id);
    this.panels = i < 0 ? [...this.panels, panel] : this.panels.map((p, k) => (k === i ? panel : p));
  }

  removePanel(id: string) {
    this.panels = this.panels.filter((p) => p.id !== id);
  }

  // ── structural edits (data-structure operations, Kosaraju's reversal) ──

  addNode(node: GraphNode) {
    this.nodes = [...this.nodes, node];
  }

  removeNode(id: NodeId) {
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this.edges = this.edges.filter((e) => e.from !== id && e.to !== id);
    this.mark(id, null);
    this.annotate(id, null);
    this.badge(id, null);
  }

  addEdge(from: NodeId, to: NodeId, weight: number): EdgeId {
    const id = edgeKey(from, to, this.directed);
    this.edges = [...this.edges, { id, from, to, weight }];
    return id;
  }

  setWeight(edge: EdgeId, weight: number) {
    this.edges = this.edges.map((e) => (e.id === edge ? { ...e, weight } : e));
  }

  removeEdge(edge: EdgeId) {
    this.edges = this.edges.filter((e) => e.id !== edge);
    this.markEdge(edge, null);
  }

  /** Flips every edge but keeps its id, so the arrows turn round in place. */
  reverseEdges() {
    this.edges = this.edges.map((e) => ({ ...e, from: e.to, to: e.from }));
  }

  /** Snapshot of the current state plus this step's narration and highlights. */
  frame(opts: GraphFrameOptions): GraphFrame {
    const nodeMarks = overlay(this.nodeMarks, opts.nodes);
    const edgeMarks = overlay(this.edgeMarks, opts.edges);
    const pulse = opts.pulse ? { edge: opts.pulse, seq: ++this.pulses } : null;
    return {
      state: {
        directed: this.directed,
        weighted: this.weighted,
        nodes: this.nodes,
        edges: this.edges,
        nodeMarks,
        edgeMarks,
        annotations: this.annotations,
        badges: this.badges,
        annotationLabel: this.annotationLabel,
        pulse,
        panels: this.panels,
      },
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
      ...(opts.ask && { ask: opts.ask }),
    };
  }
}

/**
 * Moves each frame's `ask` onto the frame before it, so the question is posed
 * just before the step that answers it. Passes the generator's return value
 * through (data-structure operations return their new model).
 */
export function* askAhead<R>(frames: Generator<GraphFrame, R>): Generator<Frame<GraphState>, R> {
  let prev: Frame<GraphState> | null = null;
  for (;;) {
    const next = frames.next();
    if (next.done) {
      if (prev) yield prev;
      return next.value;
    }
    const { ask, ...frame } = next.value;
    if (prev) yield ask && !prev.checkpoint ? { ...prev, checkpoint: ask } : prev;
    prev = frame;
  }
}

function withEntry<V>(record: Readonly<Record<string, V>>, key: string, value: V | null): Readonly<Record<string, V>> {
  if (value == null) {
    if (!(key in record)) return record;
    const next = { ...record };
    delete next[key];
    return next;
  }
  return record[key] === value ? record : { ...record, [key]: value };
}

function overlay(base: Readonly<Record<string, Mark>>, extra: Partial<Record<Mark, readonly string[]>> | undefined) {
  if (!extra) return base;
  const out: Record<string, Mark> = { ...base };
  for (const [mark, ids] of Object.entries(extra) as [Mark, readonly string[]][]) for (const id of ids) out[id] = mark;
  return out;
}

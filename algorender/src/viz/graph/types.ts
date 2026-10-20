import type { MarkKey } from '@/viz/marks';

/** Stable identity of a node: its label, e.g. "A". Nodes are keyed by id, never by index. */
export type NodeId = string;
/** Stable identity of an edge: "A>B" when directed, "A-B" when not (in the authored order). */
export type EdgeId = string;

export type Mark = MarkKey;

/** A node with a fixed position in layout units (roughly px at 1×). Positions never change during a run. */
export type GraphNode = { id: NodeId; x: number; y: number };
export type GraphEdge = { id: EdgeId; from: NodeId; to: NodeId; weight: number };

/** The graph a tracer starts from: what algorithms receive as input and structures keep as their model. */
export type Graph = {
  directed: boolean;
  /** Whether weights mean something here (and are drawn). Unweighted edges carry weight 1. */
  weighted: boolean;
  nodes: readonly { id: NodeId; x: number; y: number }[];
  edges: readonly { from: NodeId; to: NodeId; weight: number }[];
};

// ───────────────────────────── side panels ─────────────────────────────

/** An ordered chip, e.g. a queue entry. `id` must be stable so chips can animate in, out and along. */
export type Chip = { id: string; label: string; sub?: string; mark?: Mark };

/** Queue, stack, priority queue or a result order, drawn as ordered chips. */
export type ChipsPanel = {
  kind: 'chips';
  id: string;
  title: string;
  chips: readonly Chip[];
  /** Captions for the two ends, e.g. ['front', 'back'] or ['bottom', 'top']. */
  ends?: readonly [string, string];
  empty: string;
};

export type TableRow = {
  id: string;
  cells: readonly string[];
  mark?: Mark;
  /** Marks on individual cells, by column index (e.g. the distance that was just written). */
  cellMarks?: Readonly<Record<number, Mark>>;
};

/** A per-node table such as dist / prev. The first column names the node. */
export type TablePanel = { kind: 'table'; id: string; title: string; columns: readonly string[]; rows: readonly TableRow[] };

/** A V×V matrix: an adjacency matrix or Floyd–Warshall's distances. */
export type MatrixPanel = {
  kind: 'matrix';
  id: string;
  title: string;
  labels: readonly NodeId[];
  cells: readonly (readonly string[])[];
  marks: readonly { row: number; col: number; mark: Mark }[];
  /** A row and column to tint, e.g. Floyd–Warshall's intermediate node k. */
  axis?: { index: number; label: string } | null;
  /** Grey out 0 cells (an adjacency matrix, where 0 means “no edge”). */
  dimZeros?: boolean;
  caption?: string;
};

/** An adjacency list: one row per node with its neighbours in list order. */
export type AdjacencyPanel = {
  kind: 'adjacency';
  id: string;
  title: string;
  rows: readonly { id: NodeId; entries: readonly Chip[]; mark?: Mark }[];
};

/** Disjoint groups, e.g. union-find components or strongly connected components. */
export type GroupsPanel = {
  kind: 'groups';
  id: string;
  title: string;
  groups: readonly { id: string; label: string; members: readonly NodeId[]; mark?: Mark }[];
  empty: string;
};

/** Named values, e.g. the MST's total weight or the shortest path found. */
export type FactsPanel = {
  kind: 'facts';
  id: string;
  title: string;
  facts: readonly { label: string; value: string; mark?: Mark }[];
};

export type Panel = ChipsPanel | TablePanel | MatrixPanel | AdjacencyPanel | GroupsPanel | FactsPanel;

/** A soft tint for a region; the track pastels, which read in both themes. */
export type RegionTone = 'sky' | 'mint' | 'butter' | 'lilac' | 'peach' | 'rose' | 'teal';

/**
 * A group of nodes drawn as a soft region behind them (V4): a BFS level, a
 * strongly connected component, Prim's tree so far. Keyed by id, so a region
 * that grows keeps its place.
 */
export type Region = { id: string; label: string; members: readonly NodeId[]; tone: RegionTone };

// ───────────────────────────── state ─────────────────────────────

export type GraphState = {
  directed: boolean;
  weighted: boolean;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  nodeMarks: Readonly<Record<NodeId, Mark>>;
  edgeMarks: Readonly<Record<EdgeId, Mark>>;
  /** Small text under a node, e.g. a tentative distance "7" or Tarjan's "1/0". */
  annotations: Readonly<Record<NodeId, string>>;
  /** A short label pill on a node, e.g. its SCC "S2" or its place in a topological order "#3". */
  badges: Readonly<Record<NodeId, string>>;
  /** What the annotations under the nodes mean, e.g. "dist". Shown once above the graph. */
  annotationLabel: string | null;
  /** An edge that pulses once in this frame (a relaxation). `seq` makes each pulse distinct. */
  pulse: { edge: EdgeId; seq: number } | null;
  panels: readonly Panel[];
  /** Groups of nodes drawn as soft regions behind the graph. */
  regions?: readonly Region[];
};

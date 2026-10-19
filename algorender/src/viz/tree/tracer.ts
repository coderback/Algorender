import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import { MARKS, type MarkKey } from '@/viz/marks';
import { rootsOf } from './layout';
import { linkId, type NodeId, type TableRow, type TreeNode, type TreeShape, type TreeState } from './types';

/** How a structure module draws its (immutable) model as a tree. */
export type TreeDrawing<M> = {
  shape: (model: M) => TreeShape;
  /** Plain-language summary for screen readers, e.g. "Binary search tree with 7 keys, in order: …". */
  describe: (model: M) => string;
  /** Shown instead of the tree when it has no nodes. */
  empty: string;
};

export type TreeFrameOptions = {
  note: string;
  line?: number | null;
  /** Node ids or cell ids per mark. Later marks win when an id is listed twice. */
  marks?: Partial<Record<MarkKey, readonly (string | null | undefined)[]>>;
  /** Node ids from the top of a path downwards; the edges between consecutive nodes are highlighted. */
  path?: readonly NodeId[];
  probe?: { label: string; at: NodeId | null | undefined } | null;
  output?: { label: string; items: readonly string[] } | null;
  vars?: Record<string, VarValue>;
  /** Predict-mode question about the next frame. This frame's note must not reveal the answer. */
  checkpoint?: Checkpoint;
};

type Drawn = { shape: TreeShape; parent: ReadonlyMap<NodeId, NodeId>; description: string };

/**
 * Authoring API for tree structures. A module keeps its own immutable model
 * and assigns each new version to `model`; frame() draws it with the module's
 * drawing and adds this step's highlights. Snapshots are immutable and reuse
 * every node object that did not change since the previous frame, so a long
 * trace stays cheap and the view only re-renders what moved.
 */
export class TreeTracer<M> {
  model: M;
  readonly stats: Record<string, number>;
  private drawn: (Drawn & { model: M }) | null = null;

  constructor(
    model: M,
    private readonly drawing: TreeDrawing<M>,
    trackedStats: readonly string[],
  ) {
    this.model = model;
    this.stats = Object.fromEntries(trackedStats.map((name) => [name, 0]));
  }

  /** Increments a tracked counter such as "comparisons". */
  count(stat: string, by = 1) {
    if (stat in this.stats) this.stats[stat] += by;
  }

  /** Snapshot of the current model plus this step's narration and highlights. */
  frame(opts: TreeFrameOptions): Frame<TreeState> {
    const { shape, parent, description } = this.draw();

    const marks: Record<string, MarkKey> = {};
    for (const [mark, ids] of Object.entries(opts.marks ?? {}) as [MarkKey, readonly (string | null | undefined)[]][]) {
      for (const id of ids) if (id != null) marks[id] = mark;
    }

    const pathEdges: NodeId[] = [];
    const path = opts.path ?? [];
    for (let i = 1; i < path.length; i++) if (parent.get(path[i]) === path[i - 1]) pathEdges.push(path[i]);

    const probe = opts.probe?.at != null && shape.nodes[opts.probe.at] ? { label: opts.probe.label, at: opts.probe.at } : null;

    return {
      state: {
        ...shape,
        marks,
        pathEdges,
        probe,
        output: opts.output ?? null,
        description: `${description}${highlights(shape, parent, marks, probe)}`,
        emptyLabel: this.drawing.empty,
      },
      line: opts.line ?? null,
      note: opts.note,
      vars: opts.vars ?? {},
      stats: { ...this.stats },
      ...(opts.checkpoint && { checkpoint: opts.checkpoint }),
    };
  }

  private draw(): Drawn {
    if (this.drawn && this.drawn.model === this.model) return this.drawn;
    const shape = share(this.drawing.shape(this.model), this.drawn?.shape);
    this.drawn = { model: this.model, shape, parent: parents(shape), description: this.drawing.describe(this.model) };
    return this.drawn;
  }
}

/** The idle view of a model, before any operation runs. */
export function treeSnapshot<M>(drawing: TreeDrawing<M>, model: M): TreeState {
  return new TreeTracer(model, drawing, []).frame({ note: '' }).state;
}

/** Parent of every node reachable from the root (from every root, in a forest). */
export function parents(shape: Pick<TreeShape, 'root' | 'nodes'> & Partial<Pick<TreeShape, 'roots'>>): Map<NodeId, NodeId> {
  const parent = new Map<NodeId, NodeId>();
  const stack = [...rootsOf(shape)];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of shape.nodes[id]?.children ?? []) {
      if (c == null) continue;
      parent.set(c, id);
      stack.push(c);
    }
  }
  return parent;
}

/** Reuses node objects (and the whole record) from the previous snapshot where nothing changed. */
function share(next: TreeShape, prev: TreeShape | undefined): TreeShape {
  if (!prev) return next;
  let allSame = Object.keys(next.nodes).length === Object.keys(prev.nodes).length;
  const nodes: Record<NodeId, TreeNode> = {};
  for (const [id, node] of Object.entries(next.nodes)) {
    const old = prev.nodes[id];
    if (old && sameNode(old, node)) nodes[id] = old;
    else {
      nodes[id] = node;
      allSame = false;
    }
  }
  const strip =
    next.strip && prev.strip && next.strip.label === prev.strip.label && sameList(next.strip.ids, prev.strip.ids)
      ? prev.strip
      : next.strip;
  const shared: TreeShape = { ...next, nodes: allSame ? prev.nodes : nodes, strip };
  if (next.roots && prev.roots && sameList(next.roots, prev.roots)) shared.roots = prev.roots;
  if (next.table && prev.table && sameTable(next.table, prev.table)) shared.table = prev.table;
  return shared;
}

function sameNode(a: TreeNode, b: TreeNode): boolean {
  return (
    a.shape === b.shape &&
    a.edgeLabel === b.edgeLabel &&
    a.terminal === b.terminal &&
    sameList(a.children, b.children) &&
    a.cells.length === b.cells.length &&
    a.cells.every((c, i) => c.id === b.cells[i].id && c.label === b.cells[i].label) &&
    a.badges?.top === b.badges?.top &&
    a.badges?.bottom === b.badges?.bottom &&
    a.badges?.alert === b.badges?.alert &&
    a.hidden === b.hidden &&
    a.edgeGlyph === b.edgeGlyph &&
    a.name === b.name
  );
}

function sameTable(a: readonly TableRow[], b: readonly TableRow[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (row, i) =>
        row.id === b[i].id &&
        row.label === b[i].label &&
        row.cells.length === b[i].cells.length &&
        row.cells.every((c, k) => c.id === b[i].cells[k].id && c.label === b[i].cells[k].label && c.node === b[i].cells[k].node),
    )
  );
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** " Comparing: 30. Current: 42." for screen readers. */
function highlights(
  shape: TreeShape,
  parent: ReadonlyMap<NodeId, NodeId>,
  marks: Record<string, MarkKey>,
  probe: TreeState['probe'],
): string {
  const cellLabel = new Map<string, string>();
  for (const node of Object.values(shape.nodes)) for (const c of node.cells) cellLabel.set(c.id, c.label);
  for (const row of shape.table ?? []) for (const c of row.cells) cellLabel.set(c.id, `${row.label} ${c.label || '(empty)'}`);
  const links = new Map((shape.links ?? []).map((l) => [linkId(l.from, l.to), l]));
  const labelOf = (id: string): string => {
    const cell = cellLabel.get(id);
    if (cell != null) return cell;
    const link = links.get(id);
    if (link) return `the link from ${labelOf(link.from)} to ${labelOf(link.to)}`;
    const node = shape.nodes[id];
    if (!node) return id;
    if (node.name) return node.name;
    if (node.cells.length) return node.cells.map((c) => c.label).join(' ');
    // A trie node: the prefix spelled by the edges above it.
    let prefix = '';
    for (let cur: NodeId | undefined = id; cur != null; cur = parent.get(cur)) prefix = (shape.nodes[cur]?.edgeLabel ?? '') + prefix;
    return prefix ? `"${prefix}"` : 'the root';
  };
  const byMark = new Map<MarkKey, string[]>();
  for (const [id, mark] of Object.entries(marks)) byMark.set(mark, [...(byMark.get(mark) ?? []), labelOf(id)]);
  const parts = [...byMark].map(([mark, labels]) => `${MARKS[mark].label}: ${labels.join(', ')}.`);
  if (probe) parts.push(`Working with ${probe.label} at ${labelOf(probe.at)}.`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

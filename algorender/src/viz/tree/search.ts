import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import { TreeTracer, type TreeDrawing } from './tracer';
import type { NodeId, TableRow, TreeNode, TreeState } from './types';

/** One call of a search or recursion tree, listed before the search is replayed. */
export type SearchCall = {
  id: NodeId;
  /** The call that made this one; null for the first call (the root). */
  parent: NodeId | null;
  /** A key drawn inside the node (e.g. the item just placed); none draws a small dot. */
  label?: string;
  /** The decision that led here, on the edge from the parent: "+b", "−b", "pick 2". */
  edgeLabel?: string;
  /** A one- or two-character form of the edge label for crowded levels: "+", "−". */
  edgeGlyph?: string;
  /** What screen readers call this call, e.g. "{a, b}". */
  name: string;
};

type Revealed = { readonly reached: ReadonlySet<NodeId>; readonly table: readonly TableRow[] };

export type SearchFrameOptions = {
  note: string;
  line?: number | null;
  /** The call being run: drawn as the current node, with the path from the root to it highlighted. */
  at: NodeId;
  /** Marks for this frame only (node or table cell ids); they win over settled marks. */
  marks?: Partial<Record<MarkKey, readonly (string | null | undefined)[]>>;
  output?: { label: string; items: readonly string[] } | null;
  vars?: Record<string, VarValue>;
  checkpoint?: Checkpoint;
};

/**
 * Authoring API for search and recursion trees (backtracking, recursion
 * trees). The module lists every call up front (cheap for the small inputs a
 * learner can read), then replays the search: reveal() shows a call when the
 * search reaches it, so the tree grows into a layout fixed from the start and
 * nothing already drawn moves. Settled marks (a recorded solution, a dead end,
 * a finished subtree) stay until changed; frame() adds the current call, the
 * path to it, and this step's highlights.
 */
export class SearchTracer {
  private readonly tracer: TreeTracer<Revealed>;
  private readonly parentOf: ReadonlyMap<NodeId, NodeId | null>;
  private readonly settled = new Map<string, MarkKey>();

  constructor(calls: readonly SearchCall[], title: string, trackedStats: readonly string[]) {
    if (calls.length === 0 || calls[0].parent != null) throw new Error('The first call must be the root');
    const children = new Map<NodeId, NodeId[]>(calls.map((c) => [c.id, []]));
    for (const c of calls) if (c.parent != null) children.get(c.parent)!.push(c.id);
    const drawing: TreeDrawing<Revealed> = {
      empty: 'The search has not started.',
      shape: ({ reached, table }) => {
        const nodes: Record<NodeId, TreeNode> = {};
        for (const c of calls) {
          nodes[c.id] = {
            shape: 'round',
            cells: c.label ? [{ id: `${c.id}:k`, label: c.label }] : [],
            children: children.get(c.id)!,
            name: c.name,
            ...(c.edgeLabel && { edgeLabel: c.edgeLabel }),
            ...(c.edgeGlyph && { edgeGlyph: c.edgeGlyph }),
            ...(!reached.has(c.id) && { hidden: true }),
          };
        }
        return { root: calls[0].id, nodes, strip: null, search: true, ...(table.length > 0 && { table }) };
      },
      describe: ({ reached }) => `${title}: ${reached.size} of ${calls.length} calls reached so far.`,
    };
    this.parentOf = new Map(calls.map((c) => [c.id, c.parent]));
    this.tracer = new TreeTracer<Revealed>({ reached: new Set([calls[0].id]), table: [] }, drawing, trackedStats);
  }

  get stats(): Readonly<Record<string, number>> {
    return this.tracer.stats;
  }

  /** Increments a tracked counter such as "calls". */
  count(stat: string, by = 1) {
    this.tracer.count(stat, by);
  }

  /** Shows a call: it grows out of its parent in the next frame. */
  reveal(id: NodeId) {
    const { reached, table } = this.tracer.model;
    if (!this.parentOf.has(id)) throw new Error(`Unknown call "${id}"`);
    if (reached.has(id)) return;
    this.tracer.model = { reached: new Set([...reached, id]), table };
  }

  /** Rows of cells under the tree, e.g. the items with used markers and the current choice. */
  setTable(rows: readonly TableRow[]) {
    this.tracer.model = { ...this.tracer.model, table: rows };
  }

  /** A mark that stays on a node or cell until changed: a recorded solution, a dead end, a finished subtree. Null clears it. */
  settle(id: string, mark: MarkKey | null) {
    if (mark) this.settled.set(id, mark);
    else this.settled.delete(id);
  }

  /** Root first, down to `id`. */
  pathTo(id: NodeId): NodeId[] {
    const path: NodeId[] = [];
    for (let cur: NodeId | null | undefined = id; cur != null; cur = this.parentOf.get(cur)) path.unshift(cur);
    return path;
  }

  frame(opts: SearchFrameOptions): Frame<TreeState> {
    if (!this.tracer.model.reached.has(opts.at)) throw new Error(`Call "${opts.at}" is not revealed yet`);
    const final = new Map(this.settled);
    if (!final.has(opts.at)) final.set(opts.at, 'key');
    for (const [mark, ids] of Object.entries(opts.marks ?? {}) as [MarkKey, readonly (string | null | undefined)[]][]) {
      for (const id of ids) if (id != null) final.set(id, mark);
    }
    const marks: Partial<Record<MarkKey, string[]>> = {};
    for (const [id, mark] of final) (marks[mark] ??= []).push(id);
    return this.tracer.frame({
      note: opts.note,
      line: opts.line,
      marks,
      path: this.pathTo(opts.at),
      output: opts.output ?? null,
      vars: opts.vars,
      checkpoint: opts.checkpoint,
    });
  }
}

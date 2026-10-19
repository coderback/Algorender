import type { MarkKey } from '@/viz/marks';

/** Stable identity of a node. Nodes are keyed by id, never by position, so a rotation or a sift moves them. */
export type NodeId = string;

/**
 * One key drawn inside a node. Cells have their own ids, separate from node
 * ids, so a key can travel between nodes: a B-tree median moving up on a
 * split, or an in-order successor's key copied into the node being deleted.
 */
export type Cell = { id: string; label: string };

export type TreeNode = {
  /** 'round': a circle with at most one key (none for a trie node). 'box': a row of key cells (a B-tree node). */
  shape: 'round' | 'box';
  cells: readonly Cell[];
  /**
   * Child slots, left to right. A null keeps an empty slot, so a binary node's
   * lone right child is drawn to the right of it rather than straight below.
   */
  children: readonly (NodeId | null)[];
  /** Text on the edge from the parent, e.g. a trie's letter. */
  edgeLabel?: string;
  /** Ends a word (trie): drawn with a second ring. */
  terminal?: boolean;
  /** Small annotations on the right of a round node: an AVL balance factor and height, a heap index. */
  badges?: { top?: string; bottom?: string; alert?: boolean };
  /**
   * Laid out but not drawn. A search tree lists every call up front and hides
   * the ones not reached yet, so room is kept for them and nothing moves as
   * the tree grows.
   */
  hidden?: boolean;
  /** A shorter edge label for when the full one doesn't fit, e.g. "+" for "+b". */
  edgeGlyph?: string;
  /** What screen readers call a node that has no key, e.g. a search call's "{a, b}". */
  name?: string;
};

/** One cell of a table row. */
export type TableCell = {
  id: string;
  /** An empty label draws an empty (dashed) slot. */
  label: string;
  /** Takes this node's mark when the cell has none of its own, so a node and its array entry light up together. */
  node?: NodeId;
};

/** A labelled row of cells drawn under the tree: union-find's parent[] and rank[], a search's items and current choice. */
export type TableRow = { id: string; label: string; cells: readonly TableCell[] };

/** The structure itself, as a module draws its model. */
export type TreeShape = {
  /** The root; in a forest, the first tree's root (null when there are no nodes). */
  root: NodeId | null;
  nodes: Readonly<Record<NodeId, TreeNode>>;
  /** A heap's array: node ids in index order, drawn under the tree with the same ids. */
  strip: { label: string; ids: readonly NodeId[] } | null;
  /** A forest: every tree's root, drawn side by side in this order. Set `root` to the first of them. */
  roots?: readonly NodeId[];
  /** Draw each edge as an arrow from the child up to its parent: a parent pointer, as union-find stores it. */
  parentArrows?: boolean;
  /** Rows of cells under the tree. Marks address cells by id. */
  table?: readonly TableRow[];
  /**
   * A search or recursion tree: compact nodes, new nodes grow out of their
   * parent, edge labels sit beside the child they lead to (dropping to their
   * glyph when crowded), and a tree too wide for a narrow screen is drawn
   * sideways, root on the left.
   */
  search?: boolean;
  /**
   * Arrows between nodes at the same depth, e.g. a B+ tree's leaf chain. Each
   * is drawn from the right side of `from` to the left side of `to`, and can be
   * marked by its id, `linkId(from, to)`.
   */
  links?: readonly TreeLink[];
};

export type TreeLink = { from: NodeId; to: NodeId };

/** The id a link is marked by. */
export const linkId = (from: NodeId, to: NodeId) => `${from}>${to}`;

/** Everything the tree view draws for one frame. */
export type TreeState = TreeShape & {
  /** Mark per node id, cell id or table cell id. */
  marks: Readonly<Record<string, MarkKey>>;
  /** Child ids whose edge from their parent is on the highlighted path. */
  pathEdges: readonly NodeId[];
  /** A floating label beside a node: the key being inserted or searched for, travelling down the tree. */
  probe: { label: string; at: NodeId } | null;
  /** A growing result list under the tree: a traversal's visiting order, autocomplete matches, extracted values. */
  output: { label: string; items: readonly string[] } | null;
  /** Screen-reader description of the structure and what is highlighted. */
  description: string;
  /** Shown instead of the tree when it has no nodes. */
  emptyLabel: string;
};

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
};

/** The structure itself, as a module draws its model. */
export type TreeShape = {
  root: NodeId | null;
  nodes: Readonly<Record<NodeId, TreeNode>>;
  /** A heap's array: node ids in index order, drawn under the tree with the same ids. */
  strip: { label: string; ids: readonly NodeId[] } | null;
};

/** Everything the tree view draws for one frame. */
export type TreeState = TreeShape & {
  /** Mark per node id or cell id. */
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

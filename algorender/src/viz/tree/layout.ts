import type { NodeId, TreeNode, TreeShape } from './types';

/** Sizes in SVG units. They shrink as the tree grows so big trees stay legible after scaling. */
export type Metrics = {
  /** Diameter of a round node holding a key. */
  round: number;
  /** Diameter of a round node without a key (a trie node). */
  dot: number;
  cellW: number;
  cellH: number;
  /** Padding between a box node's border and its cells. */
  pad: number;
  /** Smallest horizontal gap between neighbouring nodes on the same level. */
  gap: number;
  /** Vertical distance between levels. */
  level: number;
  /** Room on the right of a round node for its badges. */
  badge: number;
  font: number;
};

/** A node's placement: centre (x, y), size, and how far it reaches left and right of x. */
export type Box = { x: number; y: number; w: number; h: number; left: number; right: number; depth: number };

export type TreeLayout = {
  boxes: Readonly<Record<NodeId, Box>>;
  /** Parent of every non-root node. */
  parent: Readonly<Record<NodeId, NodeId>>;
  minX: number;
  maxX: number;
  /** Top of the root and bottom of the deepest node. */
  minY: number;
  maxY: number;
  metrics: Metrics;
};

export function metricsFor(count: number, depth: number, hasEdgeLabels: boolean): Metrics {
  const big = count > 31;
  const mid = count > 15;
  return {
    round: big ? 28 : mid ? 32 : 36,
    dot: 18,
    cellW: big ? 24 : 28,
    cellH: big ? 24 : 28,
    pad: 3,
    gap: hasEdgeLabels ? 14 : big ? 8 : mid ? 10 : 14,
    level: (depth > 7 ? 52 : 64) - (hasEdgeLabels ? 6 : 0),
    badge: 12,
    font: big ? 12 : mid ? 13 : 15,
  };
}

/** Half-widths of a node: how far it reaches left and right of its centre, and its height. */
export function extent(node: TreeNode, m: Metrics): { l: number; r: number; h: number } {
  if (node.shape === 'box') {
    const w = Math.max(1, node.cells.length) * m.cellW + 2 * m.pad;
    return { l: w / 2, r: w / 2, h: m.cellH + 2 * m.pad };
  }
  const d = node.cells.length ? m.round : m.dot;
  const badge = node.badges && (node.badges.top || node.badges.bottom) ? m.badge : 0;
  return { l: d / 2, r: d / 2 + badge, h: d };
}

/** A laid-out subtree: node offsets relative to its root, and its left/right contour per depth. */
type Sub = { ids: NodeId[]; off: number[]; l: number[]; r: number[] };

/**
 * Tidy tree layout (Reingold–Tilford, generalised to any number of children
 * and to nodes of different widths). Each subtree is laid out on its own; then
 * sibling subtrees are pushed apart until their contours keep `gap` at every
 * shared depth, and the parent is centred over its first and last child. A
 * binary node with one child places it half a slot to its side, so a lone
 * left child is left of its parent and a lone right child right of it.
 *
 * Subtrees never overlap, and the layout depends only on the tree's shape, so
 * the same tree always looks the same and a changed tree animates in place.
 */
export function layoutTree(shape: Pick<TreeShape, 'root' | 'nodes'>): TreeLayout {
  const { root, nodes } = shape;
  const depthOf = new Map<NodeId, number>();
  const parent: Record<NodeId, NodeId> = {};
  let maxDepth = 0;
  let edgeLabels = false;
  if (root != null) {
    const stack: [NodeId, number][] = [[root, 0]];
    while (stack.length) {
      const [id, d] = stack.pop()!;
      if (depthOf.has(id)) throw new Error(`Node "${id}" is reachable twice`);
      const node = nodes[id];
      if (!node) throw new Error(`Unknown node "${id}"`);
      depthOf.set(id, d);
      maxDepth = Math.max(maxDepth, d);
      if (node.edgeLabel) edgeLabels = true;
      for (const c of node.children) {
        if (c == null) continue;
        parent[c] = id;
        stack.push([c, d + 1]);
      }
    }
  }
  const m = metricsFor(depthOf.size, maxDepth, edgeLabels);
  if (root == null) return { boxes: {}, parent, minX: 0, maxX: 0, minY: 0, maxY: 0, metrics: m };

  const place = (id: NodeId): Sub => {
    const node = nodes[id];
    const own = extent(node, m);
    const out: Sub = { ids: [id], off: [0], l: [-own.l], r: [own.r] };
    const kids: Sub[] = [];
    const slots: number[] = [];
    node.children.forEach((c, k) => {
      if (c == null) return;
      kids.push(place(c));
      slots.push(k);
    });
    if (kids.length === 0) return out;

    let shifts: number[];
    if (kids.length === 1 && node.children.length === 2) {
      // A binary node's only child sits where it would beside a sibling of its own size.
      const half = (kids[0].r[0] - kids[0].l[0] + m.gap) / 2;
      shifts = [slots[0] === 0 ? -half : half];
    } else {
      shifts = [0];
      const accL = [...kids[0].l];
      const accR = [...kids[0].r];
      for (let j = 1; j < kids.length; j++) {
        const sub = kids[j];
        let s = -Infinity;
        for (let d = 0; d < Math.min(accR.length, sub.l.length); d++) s = Math.max(s, accR[d] + m.gap - sub.l[d]);
        shifts.push(s);
        for (let d = 0; d < sub.l.length; d++) {
          accL[d] = d < accL.length ? Math.min(accL[d], sub.l[d] + s) : sub.l[d] + s;
          accR[d] = d < accR.length ? Math.max(accR[d], sub.r[d] + s) : sub.r[d] + s;
        }
      }
      const mid = (shifts[0] + shifts[shifts.length - 1]) / 2;
      shifts = shifts.map((s) => s - mid);
    }

    kids.forEach((sub, j) => {
      const s = shifts[j];
      for (let i = 0; i < sub.ids.length; i++) {
        out.ids.push(sub.ids[i]);
        out.off.push(sub.off[i] + s);
      }
      for (let d = 0; d < sub.l.length; d++) {
        out.l[d + 1] = out.l[d + 1] === undefined ? sub.l[d] + s : Math.min(out.l[d + 1], sub.l[d] + s);
        out.r[d + 1] = out.r[d + 1] === undefined ? sub.r[d] + s : Math.max(out.r[d + 1], sub.r[d] + s);
      }
    });
    return out;
  };

  const all = place(root);
  const boxes: Record<NodeId, Box> = {};
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  all.ids.forEach((id, i) => {
    const e = extent(nodes[id], m);
    const depth = depthOf.get(id)!;
    const x = all.off[i];
    const y = depth * m.level;
    boxes[id] = { x, y, w: e.l + e.r, h: e.h, left: e.l, right: e.r, depth };
    minX = Math.min(minX, x - e.l);
    maxX = Math.max(maxX, x + e.r);
    minY = Math.min(minY, y - e.h / 2);
    maxY = Math.max(maxY, y + e.h / 2);
  });
  return { boxes, parent, minX, maxX, minY, maxY, metrics: m };
}

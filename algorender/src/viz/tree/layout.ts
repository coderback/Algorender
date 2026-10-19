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
  /** Smallest gap between neighbouring trees of a forest. */
  treeGap: number;
  /** Font size of edge labels. */
  labelFont: number;
  /** Horizontal distance between levels when the tree is drawn sideways. */
  sideLevel: number;
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
  /** Drawn sideways: depth runs left to right and siblings stack top to bottom. */
  sideways: boolean;
};

/** 'forest': several small trees side by side. 'search': a compact search or recursion tree. */
export type LayoutKind = 'tree' | 'forest' | 'search';

/** Smallest gap between nodes when links run between them, room for an arrow. */
const LINK_GAP = 26;

/** Width of an edge label's pill. */
export const labelWidth = (text: string, font: number) => [...text].length * font * 0.62 + 6;

export function metricsFor(count: number, depth: number, hasEdgeLabels: boolean, kind: LayoutKind = 'tree', longestLabel = ''): Metrics {
  if (kind === 'search') {
    const labelW = longestLabel ? labelWidth(longestLabel, 10) : 0;
    return {
      round: 20,
      dot: 12,
      cellW: 20,
      cellH: 20,
      pad: 3,
      gap: 6,
      level: hasEdgeLabels ? 44 : 40,
      badge: 0,
      font: 12,
      treeGap: 12,
      labelFont: 10,
      // Sideways, a level needs room for the label beside each child; without labels, room to breathe.
      sideLevel: labelW ? Math.max(36, 20 + labelW + 14) : 48,
    };
  }
  if (kind === 'forest') {
    return { round: 30, dot: 18, cellW: 24, cellH: 24, pad: 3, gap: 10, level: 56, badge: 12, font: 14, treeGap: 12, labelFont: 12, sideLevel: 56 };
  }
  const big = count > 31;
  const mid = count > 15;
  const gap = hasEdgeLabels ? 14 : big ? 8 : mid ? 10 : 14;
  const level = (depth > 7 ? 52 : 64) - (hasEdgeLabels ? 6 : 0);
  return {
    round: big ? 28 : mid ? 32 : 36,
    dot: 18,
    cellW: big ? 24 : 28,
    cellH: big ? 24 : 28,
    pad: 3,
    gap,
    level,
    badge: 12,
    font: big ? 12 : mid ? 13 : 15,
    treeGap: 2 * gap,
    labelFont: 12,
    sideLevel: level,
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

/** The root of every tree: a forest's roots, or the single root. */
export function rootsOf(shape: Pick<TreeShape, 'root'> & Partial<Pick<TreeShape, 'roots'>>): readonly NodeId[] {
  return shape.roots ?? (shape.root == null ? [] : [shape.root]);
}

/** A laid-out subtree: node offsets relative to its root, and its left/right contour per depth. */
type Sub = { ids: NodeId[]; off: number[]; l: number[]; r: number[] };

/**
 * Offsets that push neighbouring subtrees apart until their contours keep
 * `gap` at every shared depth, centred so the first and last sit evenly
 * either side of 0.
 */
function pack(subs: readonly Sub[], gap: number): number[] {
  const shifts = [0];
  const accL = [...subs[0].l];
  const accR = [...subs[0].r];
  for (let j = 1; j < subs.length; j++) {
    const sub = subs[j];
    let s = -Infinity;
    for (let d = 0; d < Math.min(accR.length, sub.l.length); d++) s = Math.max(s, accR[d] + gap - sub.l[d]);
    shifts.push(s);
    for (let d = 0; d < sub.l.length; d++) {
      accL[d] = d < accL.length ? Math.min(accL[d], sub.l[d] + s) : sub.l[d] + s;
      accR[d] = d < accR.length ? Math.max(accR[d], sub.r[d] + s) : sub.r[d] + s;
    }
  }
  const mid = (shifts[0] + shifts[shifts.length - 1]) / 2;
  return shifts.map((s) => s - mid);
}

/** Adds `sub`, shifted by `s`, to `out`: one level below out's root (a child), or level with it (a forest's next tree). */
function merge(out: Sub, sub: Sub, s: number, below: boolean) {
  const k = below ? 1 : 0;
  for (let i = 0; i < sub.ids.length; i++) {
    out.ids.push(sub.ids[i]);
    out.off.push(sub.off[i] + s);
  }
  for (let d = 0; d < sub.l.length; d++) {
    out.l[d + k] = out.l[d + k] === undefined ? sub.l[d] + s : Math.min(out.l[d + k], sub.l[d] + s);
    out.r[d + k] = out.r[d + k] === undefined ? sub.r[d] + s : Math.max(out.r[d + k], sub.r[d] + s);
  }
}

/**
 * Tidy tree layout (Reingold–Tilford, generalised to any number of children
 * and to nodes of different widths). Each subtree is laid out on its own; then
 * sibling subtrees are pushed apart until their contours keep `gap` at every
 * shared depth, and the parent is centred over its first and last child. A
 * binary node with one child places it half a slot to its side, so a lone
 * left child is left of its parent and a lone right child right of it.
 *
 * A forest's trees sit side by side as whole blocks, a little further apart
 * than siblings. Hidden nodes are laid out like any other, so revealing them moves
 * nothing. Sideways, depth runs left to right and siblings stack downwards.
 *
 * Subtrees never overlap, and the layout depends only on the tree's shape, so
 * the same tree always looks the same and a changed tree animates in place.
 */
export function layoutTree(
  shape: Pick<TreeShape, 'root' | 'nodes'> & Partial<Pick<TreeShape, 'roots' | 'search' | 'links'>>,
  opts: { sideways?: boolean } = {},
): TreeLayout {
  const { nodes } = shape;
  const roots = rootsOf(shape);
  const kind: LayoutKind = shape.search ? 'search' : shape.roots ? 'forest' : 'tree';
  const depthOf = new Map<NodeId, number>();
  const parent: Record<NodeId, NodeId> = {};
  let maxDepth = 0;
  let edgeLabels = false;
  let longest = '';
  for (const root of roots) {
    const stack: [NodeId, number][] = [[root, 0]];
    while (stack.length) {
      const [id, d] = stack.pop()!;
      if (depthOf.has(id)) throw new Error(`Node "${id}" is reachable twice`);
      const node = nodes[id];
      if (!node) throw new Error(`Unknown node "${id}"`);
      depthOf.set(id, d);
      maxDepth = Math.max(maxDepth, d);
      if (node.edgeLabel) {
        edgeLabels = true;
        if ([...node.edgeLabel].length > [...longest].length) longest = node.edgeLabel;
      }
      for (const c of node.children) {
        if (c == null) continue;
        parent[c] = id;
        stack.push([c, d + 1]);
      }
    }
  }
  const sideways = opts.sideways === true;
  const base = metricsFor(depthOf.size, maxDepth, edgeLabels, kind, longest);
  // Sideways, siblings stack down a phone's long side: pack them a little closer.
  // Linked siblings (a B+ tree's leaves) need room between them for the arrow.
  const m = sideways && kind === 'search' ? { ...base, gap: 4 } : shape.links?.length ? { ...base, gap: Math.max(base.gap, LINK_GAP) } : base;
  if (roots.length === 0) return { boxes: {}, parent, minX: 0, maxX: 0, minY: 0, maxY: 0, metrics: m, sideways };

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
      shifts = pack(kids, m.gap);
    }
    kids.forEach((sub, j) => merge(out, sub, shifts[j], true));
    return out;
  };

  const trees = roots.map(place);
  let all = trees[0];
  if (trees.length > 1) {
    // Trees are packed as whole blocks, so one tree never tucks under another's branches.
    const blocks = trees.map((t) => ({ ...t, l: [Math.min(...t.l)], r: [Math.max(...t.r)] }));
    const shifts = pack(blocks, m.treeGap);
    all = { ids: [], off: [], l: [], r: [] };
    trees.forEach((sub, j) => merge(all, sub, shifts[j], false));
  }

  const boxes: Record<NodeId, Box> = {};
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  all.ids.forEach((id, i) => {
    const e = extent(nodes[id], m);
    const depth = depthOf.get(id)!;
    // Sideways, the tidy offset runs down the page and depth runs across.
    const box: Box = sideways
      ? { x: depth * m.sideLevel, y: all.off[i], w: e.h, h: e.l + e.r, left: e.h / 2, right: e.h / 2, depth }
      : { x: all.off[i], y: depth * m.level, w: e.l + e.r, h: e.h, left: e.l, right: e.r, depth };
    boxes[id] = box;
    minX = Math.min(minX, box.x - box.left);
    maxX = Math.max(maxX, box.x + box.right);
    minY = Math.min(minY, sideways ? box.y - e.l : box.y - e.h / 2);
    maxY = Math.max(maxY, sideways ? box.y + e.r : box.y + e.h / 2);
  });
  return { boxes, parent, minX, maxX, minY, maxY, metrics: m, sideways };
}

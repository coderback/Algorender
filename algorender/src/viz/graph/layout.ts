import type { NodeId } from './types';

/** Node radius in layout units. Authored coordinates should keep centres at least ~70 units apart. */
export const NODE_R = 18;

type Point = { x: number; y: number };

const ARROW_LEN = 9;
const ARROW_HALF = 5;
/** How far a two-way directed edge bows out, so the pair doesn't overlap. */
const BEND = 16;

/**
 * Places nodes evenly on a circle, the first at the top, going clockwise. Used
 * for random and custom graphs, which have no authored positions.
 */
export function circleLayout(ids: readonly NodeId[]): Record<NodeId, Point> {
  const n = ids.length;
  if (n === 0) return {};
  if (n === 1) return { [ids[0]]: { x: 0, y: 0 } };
  // Neighbours on the rim at least 80 apart, and a chord that skips one node
  // (i to i + 2) passing at least 30 from it, so edges never graze a node.
  const step = (2 * Math.PI) / n;
  const r = Math.round(Math.max(70, 80 / (2 * Math.sin(step / 2)), n > 3 ? 30 / (1 - Math.cos(step)) : 0));
  return Object.fromEntries(
    ids.map((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [id, { x: Math.round(r * Math.cos(angle)), y: Math.round(r * Math.sin(angle)) }];
    }),
  );
}

export type Geometry = { d: string; arrow: string | null; label: Point };

/** Path, arrowhead and weight-label position for an edge between two node centres. */
export function edgeGeometry(a: Point, b: Point, directed: boolean, twoWay: boolean): Geometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Left-hand normal of a → b: the reverse edge bows the other way.
  const nx = -dy / len;
  const ny = dx / len;
  const bend = twoWay ? BEND : 0;
  const c = { x: (a.x + b.x) / 2 + nx * bend * 2, y: (a.y + b.y) / 2 + ny * bend * 2 };

  const towards = (from: Point, to: Point, dist: number) => {
    const ux = to.x - from.x;
    const uy = to.y - from.y;
    const l = Math.hypot(ux, uy) || 1;
    return { x: from.x + (ux / l) * dist, y: from.y + (uy / l) * dist, ux: ux / l, uy: uy / l };
  };
  const start = towards(a, c, NODE_R);
  const tip = towards(b, c, NODE_R);
  const end = directed ? towards(b, c, NODE_R + ARROW_LEN - 1) : tip;
  const d = `M ${r(start.x)} ${r(start.y)} Q ${r(c.x)} ${r(c.y)} ${r(end.x)} ${r(end.y)}`;

  let arrow: string | null = null;
  if (directed) {
    const base = { x: tip.x + tip.ux * ARROW_LEN, y: tip.y + tip.uy * ARROW_LEN };
    const px = -tip.uy * ARROW_HALF;
    const py = tip.ux * ARROW_HALF;
    arrow = `M ${r(tip.x)} ${r(tip.y)} L ${r(base.x + px)} ${r(base.y + py)} L ${r(base.x - px)} ${r(base.y - py)} Z`;
  }

  // Put the weight beside the edge's midpoint: outside the bow for a curved
  // edge, otherwise on the upper side, so it never sits on the line itself.
  const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
  let ox = nx;
  let oy = ny;
  if (!twoWay && (oy > 0 || (oy === 0 && ox > 0))) {
    ox = -ox;
    oy = -oy;
  }
  const offset = 12;
  return { d, arrow, label: { x: r(mid.x + ox * offset), y: r(mid.y + oy * offset) } };
}

const r = (v: number) => Math.round(v * 10) / 10;

/** Closest a weight label may sit to a node centre, and to another label. */
const LABEL_NODE_GAP = NODE_R + 9;
const LABEL_LABEL_GAP = 18;

/**
 * Picks a spot for every edge's weight label: beside the edge (never on the
 * line), as near the middle as possible while keeping clear of nodes and of
 * labels already placed. Depends only on the endpoints, not on the edge's
 * direction, so reversing an edge leaves its label where it was.
 */
export function placeLabels(
  nodes: readonly { id: string; x: number; y: number }[],
  edges: readonly { id: string; from: string; to: string }[],
  directed: boolean,
): Map<string, Point> {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const pairs = new Set(edges.map((e) => `${e.from}>${e.to}`));
  const placed: Point[] = [];
  const out = new Map<string, Point>();
  const clearance = (p: Point) =>
    Math.min(
      ...nodes.map((n) => Math.hypot(p.x - n.x, p.y - n.y) - LABEL_NODE_GAP),
      ...placed.map((q) => Math.hypot(p.x - q.x, p.y - q.y) - LABEL_LABEL_GAP),
    );

  for (const e of edges) {
    const [p, q] = [at.get(e.from), at.get(e.to)];
    if (!p || !q) continue;
    if (directed && pairs.has(`${e.to}>${e.from}`)) {
      // A two-way pair bows apart; each label sits outside its own bow.
      const { label } = edgeGeometry(p, q, true, true);
      out.set(e.id, label);
      placed.push(label);
      continue;
    }
    const [a, b] = e.from < e.to ? [p, q] : [q, p];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (ny > 0 || (ny === 0 && nx > 0)) [nx, ny] = [-nx, -ny]; // first try the upper side
    let best: Point | null = null;
    let bestScore = -Infinity;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      for (const side of [1, -1]) {
        const c = { x: r(a.x + (b.x - a.x) * t + nx * side * 12), y: r(a.y + (b.y - a.y) * t + ny * side * 12) };
        const score = clearance(c);
        if (score > bestScore) [best, bestScore] = [c, score];
      }
      if (bestScore >= 0) break;
    }
    out.set(e.id, best!);
    placed.push(best!);
  }
  return out;
}

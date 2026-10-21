import { NODE_R } from './layout';

type Point = { x: number; y: number };

/** How far a region reaches past its members' centres. */
export const REGION_PAD = NODE_R + 8;

/**
 * How to draw a group of nodes (a BFS level, a strongly connected component,
 * Prim's tree) as a soft region behind them: one rounded hull around them all
 * when no other node falls inside it, otherwise a halo round each member, so a
 * region never seems to hold a node that isn't in it. `label` is where its name
 * goes: centred under the lowest member, below the node's own annotation, as
 * the board writes "d = 1" at the foot of a band.
 */
export type Label = Point & { anchor: 'middle' };
export type RegionShape = { kind: 'hull'; points: readonly Point[]; label: Label } | { kind: 'halos'; points: readonly Point[]; label: Label };

export function regionShape(members: readonly Point[], others: readonly Point[]): RegionShape | null {
  if (members.length === 0) return null;
  const lowest = members.reduce((a, b) => (b.y > a.y || (b.y === a.y && b.x < a.x) ? b : a));
  const label: Label = { x: lowest.x, y: lowest.y + NODE_R + 30, anchor: 'middle' };
  const hull = convexHull(members);
  // A node counts as inside when its body would overlap the padded hull.
  const reach = REGION_PAD + NODE_R * 0.6;
  const clean = others.every((p) => !insideOrNear(p, hull, reach));
  return clean ? { kind: 'hull', points: hull, label } : { kind: 'halos', points: members, label };
}

/** The convex hull, counter-clockwise (Andrew's monotone chain); fewer than three points come back as they are. */
export function convexHull(points: readonly Point[]): Point[] {
  const ps = [...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return ps;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insideOrNear(p: Point, hull: readonly Point[], reach: number): boolean {
  if (hull.length === 1) return Math.hypot(p.x - hull[0].x, p.y - hull[0].y) < reach;
  for (let i = 0; i < hull.length; i++) if (distanceToSegment(p, hull[i], hull[(i + 1) % hull.length]) < reach) return true;
  if (hull.length < 3) return false;
  // Inside a counter-clockwise polygon: on the left of every edge.
  return hull.every((a, i) => {
    const b = hull[(i + 1) % hull.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
  });
}

/** The hull's outline as an SVG path; drawn with a round stroke 2 × REGION_PAD wide, it becomes the padded, rounded region. */
export function hullPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (points.length > 2 ? ' Z' : '');
}

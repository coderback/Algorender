// Arrow geometry in CSS pixels, relative to the memory diagram's top-left corner.

export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };

/** How far below a box's top edge an arrow lands at most: level with its first row of cells. */
const FIRST_ROW = 22;

/** Where an arrow ends: on the target box's left edge, level with its first row (or its middle, if shorter). */
export function targetPoint(box: Box): Point {
  return { x: box.left, y: box.top + Math.min((box.bottom - box.top) / 2, FIRST_ROW) };
}

/**
 * Side by side, an arrow from a frame runs level to the frame's right edge
 * before it curves, so it never crosses the frame's own text (its header, the
 * "current" badge, the names below).
 */
export function framePath(from: Point, exitX: number, to: Point): string {
  if (exitX <= from.x) return arrowPath(from, to);
  const curve = arrowPath({ x: exitX, y: from.y }, to);
  return `M${round(from.x)} ${round(from.y)} H${round(exitX)} ${curve.slice(curve.indexOf('C'))}`;
}

const round = (n: number) => Number(n.toFixed(1));

/** Where a lane arrow ends: on the target box's right edge, level with its first row. */
export function targetPointRight(box: Box): Point {
  return { x: box.right, y: box.top + Math.min((box.bottom - box.top) / 2, FIRST_ROW) };
}

/**
 * With frames stacked above objects, an arrow from a frame runs right to a
 * lane by the diagram's right edge, down it, and left into its target's right
 * edge, so it never crosses the frames below it. Corners are rounded.
 */
export function lanePath(from: Point, to: Point, laneX: number, radius = 8): string {
  const f = (n: number) => Number(n.toFixed(1));
  const down = to.y >= from.y ? 1 : -1;
  const r = Math.max(0, Math.min(radius, Math.abs(to.y - from.y) / 2, laneX - from.x, laneX - to.x));
  return [
    `M${f(from.x)} ${f(from.y)}`,
    `H${f(laneX - r)}`,
    `Q${f(laneX)} ${f(from.y)} ${f(laneX)} ${f(from.y + down * r)}`,
    `V${f(to.y - down * r)}`,
    `Q${f(laneX)} ${f(to.y)} ${f(laneX - r)} ${f(to.y)}`,
    `H${f(to.x)}`,
  ].join(' ');
}

/** A point moved into a box: a reference dot scrolled out of its list's view starts its arrow at the list's edge. */
export function clampInto(p: Point, box: Box): Point {
  return { x: Math.min(Math.max(p.x, box.left), box.right), y: Math.min(Math.max(p.y, box.top), box.bottom) };
}

/**
 * A cubic curve from a reference dot to the left edge of its target that
 * always arrives horizontally from the left, so the arrowhead points into the
 * box. A target well to the right gets an S-curve. One level with or left of
 * the dot (frames stacked above objects, a list pointing at a list below it,
 * or at itself) is reached by leaving the dot vertically and swinging round
 * to come in from the left, staying right of x = 0 where there is room.
 */
export function arrowPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let c1: Point;
  let c2: Point;
  if (dx >= 24) {
    const h = Math.min(Math.max(dx * 0.5, 16), 90);
    c1 = { x: from.x + h, y: from.y };
    c2 = { x: to.x - h, y: to.y };
  } else {
    const down = dy >= 0 ? 1 : -1;
    const v = Math.max(28, Math.abs(dy) * 0.5);
    const h = Math.min(72, Math.max(32, -dx * 0.3 + 28));
    c1 = { x: from.x, y: from.y + down * v };
    // Stay right of the diagram's edge, but always at least a little left of the target.
    c2 = { x: to.x - Math.min(h, Math.max(8, to.x)), y: to.y };
  }
  const f = (n: number) => Number(n.toFixed(1));
  return `M${f(from.x)} ${f(from.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(to.x)} ${f(to.y)}`;
}

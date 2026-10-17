// Arrow geometry in cell units: cell (r, c) spans x ∈ [c, c + 1], y ∈ [r, r + 1].

export type Point = { x: number; y: number };

/** A shaft that starts just inside the source cell and stops short of the target's centre, plus an arrowhead. */
export function arrowGeometry(from: Point, to: Point, bend: number): { d: string; head: string } | null {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 1e-6) return null;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  // Normal pointing "up" for a left-to-right arrow, so bent arrows arc over the row.
  const control = { x: (from.x + to.x) / 2 + uy * bend, y: (from.y + to.y) / 2 - ux * bend };
  const toward = (p: Point, q: Point, d: number): Point => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) / l) * d, y: p.y + ((q.y - p.y) / l) * d };
  };
  const start = toward(from, bend ? control : to, 0.26);
  const tip = toward(to, bend ? control : from, 0.3);
  const back = bend ? control : start;
  const hl = Math.hypot(tip.x - back.x, tip.y - back.y) || 1;
  const hx = (tip.x - back.x) / hl;
  const hy = (tip.y - back.y) / hl;
  const size = 0.17;
  const base = { x: tip.x - hx * size, y: tip.y - hy * size };
  const shaftEnd = { x: tip.x - hx * size * 0.7, y: tip.y - hy * size * 0.7 };
  const f = (n: number) => Number(n.toFixed(3));
  const d = bend
    ? `M${f(start.x)} ${f(start.y)} Q${f(control.x)} ${f(control.y)} ${f(shaftEnd.x)} ${f(shaftEnd.y)}`
    : `M${f(start.x)} ${f(start.y)} L${f(shaftEnd.x)} ${f(shaftEnd.y)}`;
  const w = size * 0.62;
  const head = [
    `${f(tip.x)},${f(tip.y)}`,
    `${f(base.x + hy * w)},${f(base.y - hx * w)}`,
    `${f(base.x - hy * w)},${f(base.y + hx * w)}`,
  ].join(' ');
  return { d, head };
}


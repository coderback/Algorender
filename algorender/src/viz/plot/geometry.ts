import type { Axis, Mat2, PlanePart, Vec } from './types';

// Pure geometry for PlotView: world ↔ viewBox scales, ticks, clipping and the
// lines of a warped grid. Kept out of the component so it can be unit-tested.

/** Width of every plane's viewBox; text sizes are in these units. */
export const PLANE_W = 360;
export const MARGIN = { left: 30, right: 12, top: 12, bottom: 24 } as const;
/** Height of a chart box (`equal: false`) as a share of its width. */
const CHART_RATIO = 0.62;
/** Most grid lines a warped grid draws in each direction from the origin. */
const MAX_REACH = 40;

export type PlaneGeometry = {
  /** viewBox size. */
  w: number;
  h: number;
  /** Plotting area inside the margins, in viewBox units. */
  inner: { x: number; y: number; w: number; h: number };
  px: (v: Vec) => [number, number];
  /** viewBox point → world point. */
  world: (x: number, y: number) => Vec;
  /** viewBox units per world unit on each axis. */
  kx: number;
  ky: number;
};

export function planeGeometry(p: Pick<PlanePart, 'x' | 'y' | 'equal'>): PlaneGeometry {
  const xr = p.x.max - p.x.min;
  const yr = p.y.max - p.y.min;
  const innerW = PLANE_W - MARGIN.left - MARGIN.right;
  const innerH = p.equal ? (innerW * yr) / xr : innerW * CHART_RATIO;
  const kx = innerW / xr;
  const ky = innerH / yr;
  const inner = { x: MARGIN.left, y: MARGIN.top, w: innerW, h: innerH };
  return {
    w: PLANE_W,
    h: innerH + MARGIN.top + MARGIN.bottom,
    inner,
    kx,
    ky,
    px: ([x, y]) => [inner.x + (x - p.x.min) * kx, inner.y + (p.y.max - y) * ky],
    world: (sx, sy) => [p.x.min + (sx - inner.x) / kx, p.y.max - (sy - inner.y) / ky],
  };
}

/** A round step giving about `count` intervals over `range`. */
export function niceStep(range: number, count = 6): number {
  const rough = range / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough * 0.999)!;
}

/** Multiples of a nice step inside the axis. */
export function ticks(axis: Axis, count = 6): number[] {
  const step = niceStep(axis.max - axis.min, count);
  const out: number[] = [];
  for (let v = Math.ceil(axis.min / step - 1e-9) * step; v <= axis.max + 1e-9; v += step) out.push(round(v, 10));
  return out;
}

/**
 * The part of the infinite line through `p` along `dir` inside the box, or
 * null if it misses (Liang–Barsky).
 */
export function clipLine(p: Vec, dir: Vec, box: { x: Axis; y: Axis }): [Vec, Vec] | null {
  let lo = -Infinity;
  let hi = Infinity;
  const axes: [number, number, number, number][] = [
    [p[0], dir[0], box.x.min, box.x.max],
    [p[1], dir[1], box.y.min, box.y.max],
  ];
  for (const [o, d, min, max] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) return null;
      continue;
    }
    const a = (min - o) / d;
    const b = (max - o) / d;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (!(lo <= hi) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [
    [p[0] + lo * dir[0], p[1] + lo * dir[1]],
    [p[0] + hi * dir[0], p[1] + hi * dir[1]],
  ];
}

export const apply = ([a, b, c, d]: Mat2, [x, y]: Vec): Vec => [a * x + b * y, c * x + d * y];

/**
 * How many integer grid lines each way, so the warped grid still covers a
 * plane reaching `radius` from the origin: the grid's image shrinks by at
 * most the matrix's smaller singular value.
 */
export function gridReach(m: Mat2, radius: number): number {
  const [a, b, c, d] = m;
  const s = a * a + b * b + c * c + d * d;
  const det = Math.abs(a * d - b * c);
  // Singular values σ1 ≥ σ2 of a 2×2 matrix: σ1σ2 = |det|, σ1² + σ2² = ‖A‖F².
  const smin = Math.sqrt(Math.max(0, (s - Math.sqrt(Math.max(0, s * s - 4 * det * det))) / 2));
  const base = Math.ceil(radius) + 1;
  return smin < 1e-9 ? MAX_REACH : Math.min(MAX_REACH, Math.max(base, Math.ceil(radius / smin) + 1));
}

/**
 * The lines x = k and y = k for |k| ≤ reach, moved by `m`. Ids depend only on
 * the line, so each one glides as the matrix changes.
 */
export function warpedGrid(m: Mat2, reach: number): { id: string; from: Vec; to: Vec; axis: boolean }[] {
  const lines: { id: string; from: Vec; to: Vec; axis: boolean }[] = [];
  for (let k = -reach; k <= reach; k++) {
    lines.push({ id: `v${k}`, from: apply(m, [k, -reach]), to: apply(m, [k, reach]), axis: k === 0 });
    lines.push({ id: `h${k}`, from: apply(m, [-reach, k]), to: apply(m, [reach, k]), axis: k === 0 });
  }
  return lines;
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Display form: at most `digits` decimals, no trailing zeros, a true minus sign. */
export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '?';
  const s = String(round(v, digits));
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

export const fmtVec = (v: Vec, digits = 2) => `(${fmt(v[0], digits)}, ${fmt(v[1], digits)})`;

/** Snaps a coordinate to a multiple of `step` inside [min, max]. */
export function snap(v: number, step: number, min: number, max: number): number {
  return round(Math.min(max, Math.max(min, Math.round(v / step) * step)), 6);
}

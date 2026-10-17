import type { Axis, ContourLevel, Vec } from './types';

// Contour lines by marching squares: sample f on a grid, and in every cell
// where the level is crossed, join the crossing points on the cell's edges
// (found by linear interpolation). Segments are not joined into polylines; the
// view draws each level as one path of segments, which looks the same.

export function contours(
  f: (x: number, y: number) => number,
  box: { x: Axis; y: Axis },
  levels: readonly number[],
  resolution = 64,
): ContourLevel[] {
  const n = resolution;
  const xs = Array.from({ length: n + 1 }, (_, i) => box.x.min + ((box.x.max - box.x.min) * i) / n);
  const ys = Array.from({ length: n + 1 }, (_, j) => box.y.min + ((box.y.max - box.y.min) * j) / n);
  const v = ys.map((y) => xs.map((x) => f(x, y)));

  return levels.map((level) => {
    const segments: [Vec, Vec][] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // Corners counter-clockwise from bottom-left.
        const c = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]];
        if (c.some((z) => !Number.isFinite(z))) continue;
        const above = c.map((z) => z >= level);
        const count = above.filter(Boolean).length;
        if (count === 0 || count === 4) continue;
        const corner: Vec[] = [
          [xs[i], ys[j]],
          [xs[i + 1], ys[j]],
          [xs[i + 1], ys[j + 1]],
          [xs[i], ys[j + 1]],
        ];
        // Crossing point on edge k (corner k → corner k+1), where the level is crossed.
        const cross = (k: number): Vec => {
          const a = c[k];
          const b = c[(k + 1) % 4];
          const t = a === b ? 0.5 : (level - a) / (b - a);
          const [x0, y0] = corner[k];
          const [x1, y1] = corner[(k + 1) % 4];
          return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
        };
        const edges = [0, 1, 2, 3].filter((k) => above[k] !== above[(k + 1) % 4]);
        if (edges.length === 2) {
          segments.push([cross(edges[0]), cross(edges[1])]);
        } else {
          // A saddle: two opposite corners above. The centre value decides which pairs join.
          const centreAbove = (c[0] + c[1] + c[2] + c[3]) / 4 >= level;
          const pairs = centreAbove === above[0] ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
          for (const [p, q] of pairs) segments.push([cross(p), cross(q)]);
        }
      }
    }
    return { value: level, segments };
  });
}

/**
 * `count` levels from just above `lo` to `hi`, spaced evenly in log scale, so
 * a bowl gets rings that tighten towards its minimum rather than bunching at
 * its rim.
 */
export function logLevels(lo: number, hi: number, count: number): number[] {
  const span = Math.max(1e-9, hi - lo);
  const first = span / 2 ** count;
  return Array.from({ length: count }, (_, k) => lo + first * (span / first) ** (k / Math.max(1, count - 1)));
}

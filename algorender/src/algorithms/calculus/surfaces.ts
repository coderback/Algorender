import { contours, logLevels } from '@/viz/plot/contours';
import type { Axis, ContourShape, HeatmapShape, Vec } from '@/viz/plot/types';

// Loss surfaces f(x, y) for gradient descent and the optimizer race. Each has
// its exact gradient, a view box, where its minima are, and step sizes that
// show it at its most telling.

export type SurfaceId = 'bowl' | 'valley' | 'banana' | 'two-valleys';

export type Surface = {
  id: SurfaceId;
  label: string;
  /** For narration and the code panel, e.g. "x² + y²". */
  formula: string;
  f: (x: number, y: number) => number;
  grad: (x: number, y: number) => Vec;
  x: Axis;
  y: Axis;
  /** Local minima, the global one first. */
  minima: readonly Vec[];
  /**
   * Step sizes for the race. Momentum's is smaller than plain descent's, since its
   * velocity sums about 1/(1 − β) = 10 past gradients; RMSProp and Adam share one.
   */
  rates: { plain: number; momentum: number; adaptive: number };
};

export const SURFACES: Record<SurfaceId, Surface> = {
  bowl: {
    id: 'bowl',
    label: 'Round bowl',
    formula: 'x² + y²',
    f: (x, y) => x * x + y * y,
    grad: (x, y) => [2 * x, 2 * y],
    x: { min: -3, max: 3 },
    y: { min: -3, max: 3 },
    minima: [[0, 0]],
    rates: { plain: 0.05, momentum: 0.01, adaptive: 0.15 },
  },
  valley: {
    id: 'valley',
    label: 'Narrow valley',
    formula: 'x²/20 + 5y²',
    f: (x, y) => x * x / 20 + 5 * y * y,
    grad: (x, y) => [x / 10, 10 * y],
    x: { min: -4, max: 4 },
    y: { min: -2.5, max: 2.5 },
    minima: [[0, 0]],
    rates: { plain: 0.18, momentum: 0.03, adaptive: 0.1 },
  },
  banana: {
    id: 'banana',
    label: 'Banana valley',
    formula: '(1 − x)² + 10(y − x²)²',
    f: (x, y) => (1 - x) ** 2 + 10 * (y - x * x) ** 2,
    grad: (x, y) => [-2 * (1 - x) - 40 * x * (y - x * x), 20 * (y - x * x)],
    x: { min: -2, max: 2 },
    y: { min: -1, max: 3 },
    minima: [[1, 1]],
    rates: { plain: 0.01, momentum: 0.01, adaptive: 0.1 },
  },
  'two-valleys': {
    id: 'two-valleys',
    label: 'Two valleys',
    formula: '(x² − 1)² + x/3 + y²',
    f: (x, y) => (x * x - 1) ** 2 + x / 3 + y * y,
    grad: (x, y) => [4 * x * (x * x - 1) + 1 / 3, 2 * y],
    x: { min: -2.2, max: 2.2 },
    y: { min: -2, max: 2 },
    // Roots of 4x³ − 4x + 1/3 = 0 near −1 and +1 (the one near 0 is a ridge).
    minima: [minimumNear(-1), minimumNear(1)],
    rates: { plain: 0.05, momentum: 0.02, adaptive: 0.1 },
  },
};

/** Newton's method on f′(x) = 4x³ − 4x + 1/3 for the two-valleys minima. */
function minimumNear(x0: number): Vec {
  let x = x0;
  for (let k = 0; k < 50; k++) x -= (4 * x ** 3 - 4 * x + 1 / 3) / (12 * x * x - 4);
  return [x, 0];
}

export const SURFACE_IDS = Object.keys(SURFACES) as SurfaceId[];

const contourCache = new Map<SurfaceId, ContourShape>();

/** The surface's contour map, computed once and shared by every frame (the view memoises on it). */
export function contourShape(s: Surface): ContourShape {
  let shape = contourCache.get(s.id);
  if (!shape) {
    const samples: number[] = [];
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) samples.push(s.f(s.x.min + ((s.x.max - s.x.min) * i) / 40, s.y.min + ((s.y.max - s.y.min) * j) / 40));
    samples.sort((a, b) => a - b);
    const lo = s.f(...s.minima[0]);
    const hi = samples[Math.floor(samples.length * 0.85)];
    shape = { kind: 'contours', id: 'contours', levels: contours(s.f, s, logLevels(lo, hi, 12)) };
    contourCache.set(s.id, shape);
  }
  return shape;
}

const WASH_CELLS = 36;
const washCache = new Map<SurfaceId, HeatmapShape>();

/**
 * The surface's low ground as a violet wash under its contours (V8), deepest
 * at the minimum and fading out by the outer contour. Log-scaled like the
 * contour levels, sampled at each cell's centre, rounded to hundredths so the
 * server and the browser agree, and shared by every frame.
 */
export function washShape(s: Surface): HeatmapShape {
  let shape = washCache.get(s.id);
  if (!shape) {
    const lo = s.f(...s.minima[0]);
    const levels = contourShape(s).levels;
    const hi = Math.max(lo + 1e-9, levels.at(-1)?.value ?? lo + 1);
    const depth = (v: number) => {
      const t = Math.log1p(Math.max(0, v - lo)) / Math.log1p(hi - lo);
      return Math.round(100 * Math.max(0, 1 - t)) / 100;
    };
    const values: number[] = [];
    for (let r = 0; r < WASH_CELLS; r++) {
      const y = s.y.max - ((r + 0.5) * (s.y.max - s.y.min)) / WASH_CELLS;
      for (let c = 0; c < WASH_CELLS; c++) values.push(depth(s.f(s.x.min + ((c + 0.5) * (s.x.max - s.x.min)) / WASH_CELLS, y)));
    }
    shape = { kind: 'heatmap', id: 'wash', x0: s.x.min, x1: s.x.max, y0: s.y.min, y1: s.y.max, cols: WASH_CELLS, rows: WASH_CELLS, values, scale: { kind: 'depth' } };
    washCache.set(s.id, shape);
  }
  return shape;
}

export function parseSurface(word: string): SurfaceId | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  return SURFACE_IDS.find((id) => id.replace('-', '') === w) ?? null;
}

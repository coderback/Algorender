import { createRng } from '@/engine/random';
import type { Tone } from '@/viz/marks';
import type { Axis, HeatmapShape } from '@/viz/plot/types';

// Small seeded 2D datasets for the ML visualisers, all inside DATA_BOX, and a
// helper that turns any classifier into a heatmap of its decision regions.

export type Point2 = { x: number; y: number; label: number };

export const DATA_BOX: { x: Axis; y: Axis } = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };

export type DatasetId = 'linear' | 'overlap' | 'blobs' | 'xor' | 'circles' | 'moons';

/** Standard normal from two uniforms (Box–Muller). */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const inBox = (v: number) => Math.min(2.9, Math.max(-2.9, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * `n` points labelled 0 or 1 (for `blobs`, 0..k−1 with k = 3). Coordinates are
 * rounded to hundredths and kept inside DATA_BOX; the same seed gives the same points.
 */
export function dataset(id: DatasetId, n: number, seed: number, k = 3): Point2[] {
  const rng = createRng(seed);
  const noise = (s: number) => gaussian(rng) * s;
  const pts: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const label = id === 'blobs' ? i % k : i % 2;
    let x: number;
    let y: number;
    switch (id) {
      case 'linear':
      case 'overlap': {
        const spread = id === 'linear' ? 0.55 : 1.1;
        const c = label ? 1.1 : -1.1;
        x = c + noise(spread);
        y = c * 0.6 + noise(spread);
        break;
      }
      case 'blobs': {
        const angle = (2 * Math.PI * label) / k + 0.4;
        x = 1.7 * Math.cos(angle) + noise(0.5);
        y = 1.7 * Math.sin(angle) + noise(0.5);
        break;
      }
      case 'xor': {
        const sx = rng() < 0.5 ? -1 : 1;
        const sy = label ? -sx : sx;
        x = sx * (0.4 + 1.8 * rng());
        y = sy * (0.4 + 1.8 * rng());
        break;
      }
      case 'circles': {
        const r = label ? 2.2 : 0.9;
        const t = 2 * Math.PI * rng();
        x = r * Math.cos(t) + noise(0.2);
        y = r * Math.sin(t) + noise(0.2);
        break;
      }
      case 'moons': {
        const t = Math.PI * rng();
        x = label ? 1 - Math.cos(t) - 0.5 : Math.cos(t) - 0.5;
        y = label ? 0.4 - Math.sin(t) : Math.sin(t) - 0.1;
        x = x * 1.6 + noise(0.12);
        y = y * 1.6 + noise(0.12);
        break;
      }
    }
    pts.push({ x: round2(inBox(x)), y: round2(inBox(y)), label });
  }
  return pts;
}

/**
 * A heatmap of `f` over the data box: `f` returns a probability of class 1
 * (blend) or a class index (classes, with `tones`).
 */
export function regionHeatmap(
  f: (x: number, y: number) => number,
  scale: HeatmapShape['scale'],
  { cols = 30, rows = 30, box = DATA_BOX, id = 'regions' }: { cols?: number; rows?: number; box?: { x: Axis; y: Axis }; id?: string } = {},
): HeatmapShape {
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    const y = box.y.max - ((r + 0.5) * (box.y.max - box.y.min)) / rows;
    for (let c = 0; c < cols; c++) values.push(f(box.x.min + ((c + 0.5) * (box.x.max - box.x.min)) / cols, y));
  }
  return { kind: 'heatmap', id, x0: box.x.min, x1: box.x.max, y0: box.y.min, y1: box.y.max, cols, rows, values, scale };
}

/** Tones for class labels: class 0 is tone 1, class 1 tone 2, and so on. */
export const CLASS_TONES: readonly Tone[] = [1, 2, 3, 4];

import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { contours } from '@/viz/plot/contours';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round, snap } from '@/viz/plot/geometry';
import type { Axis, ContourLevel, ContourShape, HeatmapShape, ImageBox, ImagePart, LabelShape, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Functions of two variables, read as contour maps (B4 of the math and ML
// path). A surface f(x, y) gives one height for every point of the plane:
// a table with two inputs. Joining the points of equal height gives contour
// lines; walking along one the height never changes, and where they crowd
// together the ground is steep. Slicing the surface along y = b (or x = a)
// leaves an ordinary curve of one variable, whose slope at P is what the next
// lessons call a partial derivative.

export type SurfaceId = 'hill' | 'saddle';
export type Story = 'table' | 'walk' | 'slices';
export type ContourInput = { story: Story; surface: SurfaceId; p: Vec };

export type Surface = {
  id: SurfaceId;
  label: string;
  /** For narration, e.g. "8 − x²/2 − y²". */
  formula: string;
  f: (x: number, y: number) => number;
  /** The slope of the x-slice and of the y-slice at (x, y) (written 0 − x, never −0). */
  slopes: (x: number, y: number) => Vec;
  /** How each slice bends (its second derivative, the same everywhere): below 0 a hill, above 0 a valley. */
  bend: Vec;
  x: Axis;
  y: Axis;
  /** Where P may go in the walk and slices stories (halves). */
  pMin: Vec;
  pMax: Vec;
  /** Whole-number contour heights, highest first. */
  levels: readonly number[];
  /** The table story's grid: columns x left to right, rows y top (largest) to bottom. */
  grid: { xs: readonly number[]; ys: readonly number[] };
  /** Heights the wash runs over: bare at the first, strongest at the second. */
  wash: readonly [number, number];
  /** The height axis of the slices chart. */
  chart: Axis;
  /** Contour levels labelled on the map, each placed along a ray from the origin. */
  labels: readonly { level: number; dir: Vec }[];
  /** A contour with a grid point on it, and named points: the first on it, the rest not. */
  named: { level: number; points: readonly Vec[] };
  /** Heights a slip would give at (a, b): for wrong choices. */
  slips: (a: number, b: number) => number[];
  /** The x-slice f(x, b) and the y-slice f(a, y) as formulas. */
  xSlice: (b: number) => string;
  ySlice: (a: number) => string;
};

const H3 = (v: number) => fmt(v, 3);
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

export const SURFACES: Record<SurfaceId, Surface> = {
  hill: {
    id: 'hill',
    label: 'Oval hill',
    formula: '8 − x²/2 − y²',
    f: (x, y) => 8 - (x * x) / 2 - y * y,
    slopes: (x, y) => [0 - x, 0 - 2 * y],
    bend: [-1, -2],
    x: { min: -4.5, max: 4.5, label: 'x' },
    y: { min: -3, max: 3, label: 'y' },
    pMin: [-3, -2],
    pMax: [3, 2],
    levels: [7, 6, 5, 4, 3, 2, 1],
    grid: { xs: range(-3, 3), ys: range(-2, 2).reverse() },
    wash: [0, 8],
    chart: { min: -6.5, max: 8.5, label: 'height' },
    labels: [7, 5, 3, 1].map((level) => ({ level, dir: [-1, -1] as Vec })),
    named: {
      level: 6,
      points: [
        [2, 0],
        [0, 2],
        [1, 1],
        [2, 1],
      ],
    },
    slips: (a, b) => [8 - a * a - b * b, 8 - (a * a + b * b) / 2, 8 - a / 2 - b],
    xSlice: (b) => `${H3(8 - b * b)} − x²/2`,
    ySlice: (a) => `${H3(8 - (a * a) / 2)} − y²`,
  },
  saddle: {
    id: 'saddle',
    label: 'Saddle',
    formula: '(x² − y²)/2',
    f: (x, y) => (x * x - y * y) / 2,
    slopes: (x, y) => [x, 0 - y],
    bend: [1, -1],
    x: { min: -3, max: 3, label: 'x' },
    y: { min: -3, max: 3, label: 'y' },
    pMin: [-2.5, -2.5],
    pMax: [2.5, 2.5],
    levels: [4, 3, 2, 1, 0, -1, -2, -3, -4],
    grid: { xs: range(-2, 2), ys: range(-2, 2).reverse() },
    wash: [-4.5, 4.5],
    chart: { min: -5, max: 5, label: 'height' },
    labels: [
      ...[3, 1].map((level) => ({ level, dir: [-1, -0.3] as Vec })),
      ...[-1, -3].map((level) => ({ level, dir: [-0.3, -1] as Vec })),
    ],
    named: {
      level: 2,
      points: [
        [2, 0],
        [0, 2],
        [1, 1],
        [2, 1],
      ],
    },
    slips: (a, b) => [(a * a + b * b) / 2, a * a - b * b, (a - b) / 2],
    xSlice: (b) => (b === 0 ? 'x²/2' : `x²/2 − ${H3((b * b) / 2)}`),
    ySlice: (a) => (a === 0 ? '−y²/2' : `${H3((a * a) / 2)} − y²/2`),
  },
};
export const SURFACE_IDS = Object.keys(SURFACES) as SurfaceId[];
export const STORIES: readonly Story[] = ['table', 'walk', 'slices'];

// ───────────────────────────── the maths ─────────────────────────────

/** The height f(x, y) on a surface. */
export const height = (id: SurfaceId, x: number, y: number) => SURFACES[id].f(x, y);

/** The slope of the x-slice (y held at b) and of the y-slice (x held at a) at P = (a, b). */
export const sliceSlopes = (id: SurfaceId, p: Vec): Vec => SURFACES[id].slopes(p[0], p[1]);

/** The x-slice through P: x ↦ f(x, b). */
export const xSliceAt = (id: SurfaceId, b: number) => (x: number) => SURFACES[id].f(x, b);
/** The y-slice through P: y ↦ f(a, y). */
export const ySliceAt = (id: SurfaceId, a: number) => (y: number) => SURFACES[id].f(a, y);

/**
 * The heights at the table story's grid points, row by row from the top (the
 * largest y) and left to right in x: the same layout as the `height-table`
 * exercise's table().
 */
export function heightTable(id: SurfaceId): number[][] {
  const s = SURFACES[id];
  return s.grid.ys.map((y) => s.grid.xs.map((x) => s.f(x, y)));
}

/** What P is on a slice: the top of a hill, the bottom of a valley, or neither (sloping). */
export function sliceShape(slope: number, bend: number): 'Peak' | 'Valley' | 'Neither' {
  if (slope !== 0) return 'Neither';
  return bend < 0 ? 'Peak' : 'Valley';
}

const inside = (s: Surface, v: Vec) => v[0] >= s.x.min && v[0] <= s.x.max && v[1] >= s.y.min && v[1] <= s.y.max;
const dist = (u: Vec, v: Vec) => Math.sqrt((u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2);

/** Where a labelled contour crosses its ray from the origin (bisection, rounded to hundredths). */
export function labelPoint(s: Surface, level: number, dir: Vec): Vec {
  const g = (t: number) => s.f(t * dir[0], t * dir[1]) - level;
  let lo = 0;
  let hi = 10;
  const rising = g(hi) > g(lo);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0 === rising) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return [round(t * dir[0]), round(t * dir[1])];
}

/** Step length when tracing a contour. */
const TRACE_STEP = 0.02;

/** Follows the contour through P one way, until it leaves the map or closes up. */
function trace(s: Surface, p: Vec, sign: 1 | -1): { pts: Vec[]; closed: boolean } {
  const level = s.f(p[0], p[1]);
  const pts: Vec[] = [p];
  let x = p;
  let prev: Vec | null = null;
  let travelled = 0;
  for (let k = 0; k < 4000; k++) {
    const g = s.slopes(x[0], x[1]);
    const n = Math.sqrt(g[0] * g[0] + g[1] * g[1]);
    if (n < 1e-9) break;
    // Along the contour is at right angles to the slopes; keep heading the same way (through a saddle's crossing).
    let d: Vec = [(-sign * g[1]) / n, (sign * g[0]) / n];
    if (prev && d[0] * prev[0] + d[1] * prev[1] < 0) d = [-d[0], -d[1]];
    let y: Vec = [x[0] + TRACE_STEP * d[0], x[1] + TRACE_STEP * d[1]];
    // Pull the step back onto the contour (Newton's method along the slopes).
    for (let i = 0; i < 4; i++) {
      const gy = s.slopes(y[0], y[1]);
      const m = gy[0] * gy[0] + gy[1] * gy[1];
      if (m < 1e-12) break;
      const r = s.f(y[0], y[1]) - level;
      y = [y[0] - (r * gy[0]) / m, y[1] - (r * gy[1]) / m];
    }
    if (!inside(s, y)) break;
    travelled += TRACE_STEP;
    if (travelled > 4 * TRACE_STEP && dist(y, p) < TRACE_STEP) return { pts, closed: true };
    pts.push(y);
    prev = d;
    x = y;
  }
  return { pts, closed: false };
}

const arcLength = (pts: readonly Vec[]) => pts.reduce((sum, v, i) => (i ? sum + dist(pts[i - 1], v) : 0), 0);

export type ContourWalk = {
  level: number;
  /** A closed loop (around a hill's peak) or a line that runs off the map. */
  closed: boolean;
  /** The whole contour line through P inside the map, finely traced. */
  path: Vec[];
  /** The way the walk goes from P, finely traced (P first). */
  walk: Vec[];
  /** Indices into `walk` of the evenly spaced steps along it. */
  steps: number[];
};

/**
 * The contour through P, followed both ways from P (for a closed loop, once
 * round), and the steps a walk along it takes: 7 round a loop, or 4 along a
 * line, in the longer direction. Every point is on the contour (f = f(P)).
 */
export function contourWalk(id: SurfaceId, p: Vec): ContourWalk {
  const s = SURFACES[id];
  const level = s.f(p[0], p[1]);
  const fwd = trace(s, p, 1);
  let path: Vec[];
  let walk: Vec[];
  if (fwd.closed) {
    path = fwd.pts;
    walk = [...fwd.pts, p];
  } else {
    const back = trace(s, p, -1);
    path = [...back.pts.slice(1).reverse(), ...fwd.pts];
    walk = arcLength(fwd.pts) >= arcLength(back.pts) ? fwd.pts : back.pts;
  }
  const len = arcLength(walk);
  const count = fwd.closed ? 7 : 4;
  const spacing = fwd.closed ? len / 8 : Math.min(0.6, len / 4);
  const cumulative: number[] = [0];
  for (let i = 1; i < walk.length; i++) cumulative.push(cumulative[i - 1] + dist(walk[i - 1], walk[i]));
  const steps = Array.from({ length: count }, (_, k) => {
    const want = (k + 1) * spacing;
    const i = cumulative.findIndex((c) => c >= want - 1e-9);
    return i < 0 ? walk.length - 1 : i;
  });
  return { level, closed: fwd.closed, path, walk, steps };
}

/** Every fifth point of a finely traced line, and its last. */
const thin = (pts: readonly Vec[]) => pts.filter((_, i) => i % 5 === 0 || i === pts.length - 1);

// ───────────────────────────── shared drawing ─────────────────────────────

const levelCache = new Map<SurfaceId, ContourLevel[]>();
/** Every contour level of a surface, by marching squares, computed once. */
export function contourLevels(s: Surface): ContourLevel[] {
  let levels = levelCache.get(s.id);
  if (!levels) {
    levels = contours(s.f, s, s.levels, 72);
    levelCache.set(s.id, levels);
  }
  return levels;
}

const shapeCache = new Map<string, ContourShape>();
/** The first `count` contour levels as one shape, shared by every frame that draws them (the view memoises on it). */
function contourShape(s: Surface, count = s.levels.length): ContourShape {
  const key = `${s.id}:${count}`;
  let shape = shapeCache.get(key);
  if (!shape) {
    shape = { kind: 'contours', id: 'contours', levels: contourLevels(s).slice(0, count) };
    shapeCache.set(key, shape);
  }
  return shape;
}

const washCache = new Map<SurfaceId, HeatmapShape>();
/** Height as colour: a violet wash, strongest on the highest ground, shared by every frame. */
function washShape(s: Surface): HeatmapShape {
  let shape = washCache.get(s.id);
  if (!shape) {
    const cols = (s.x.max - s.x.min) * 4;
    const rows = (s.y.max - s.y.min) * 4;
    const [lo, hi] = s.wash;
    const values: number[] = [];
    for (let r = 0; r < rows; r++) {
      const y = s.y.max - ((r + 0.5) * (s.y.max - s.y.min)) / rows;
      for (let c = 0; c < cols; c++) {
        const x = s.x.min + ((c + 0.5) * (s.x.max - s.x.min)) / cols;
        values.push(round(Math.min(1, Math.max(0, (s.f(x, y) - lo) / (hi - lo)))));
      }
    }
    shape = { kind: 'heatmap', id: 'wash', x0: s.x.min, x1: s.x.max, y0: s.y.min, y1: s.y.max, cols, rows, values, scale: { kind: 'depth' } };
    washCache.set(s.id, shape);
  }
  return shape;
}

/** The labelled contour heights, written on the map where each crosses its ray. */
export function levelLabels(s: Surface): LabelShape[] {
  return s.labels.map(({ level, dir }) => ({ kind: 'label', id: `lvl:${level}`, at: labelPoint(s, level, dir), text: fmt(level) }));
}

/** How far above its grid point a height in the table is written, so the point (and P) stay visible. */
export const LABEL_LIFT = 0.35;

/** Joins marching-squares segments that share ends into polylines. */
function chain(segments: readonly (readonly [Vec, Vec])[]): Vec[][] {
  const key = (v: Vec) => `${Math.round(v[0] * 1e6)},${Math.round(v[1] * 1e6)}`;
  const at = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    for (const v of [a, b]) at.set(key(v), [...(at.get(key(v)) ?? []), i]);
  });
  const used = segments.map(() => false);
  const lines: Vec[][] = [];
  const grow = (line: Vec[], atEnd: boolean) => {
    for (;;) {
      const end = atEnd ? line[line.length - 1] : line[0];
      const j = (at.get(key(end)) ?? []).find((i) => !used[i]);
      if (j === undefined) return;
      used[j] = true;
      const [p, q] = segments[j];
      const next = key(p) === key(end) ? q : p;
      if (atEnd) line.push(next);
      else line.unshift(next);
    }
  };
  segments.forEach(([a, b], i) => {
    if (used[i]) return;
    used[i] = true;
    const line: Vec[] = [a, b];
    grow(line, true);
    grow(line, false);
    lines.push(line);
  });
  return lines;
}

const pieceCache = new Map<string, Shape[]>();
/** One contour level drawn as marked lines (the level the table story is joining). */
function levelPaths(s: Surface, index: number): Shape[] {
  const key = `${s.id}:${index}`;
  let shapes = pieceCache.get(key);
  if (!shapes) {
    const level = contourLevels(s)[index];
    shapes = chain(level.segments)
      .filter((line) => line.length > 2)
      .map((points, k): Shape => ({ kind: 'path', id: `level${k}`, points, mark: 'found', ...(k === 0 && { label: `f = ${fmt(level.value)}` }) }));
    pieceCache.set(key, shapes);
  }
  return shapes;
}

function mapPlane(s: Surface, label: string, shapes: Shape[], p: Vec, step: number, min: Vec, max: Vec): PlanePart {
  return {
    kind: 'plane',
    id: 'plane',
    label,
    x: s.x,
    y: s.y,
    equal: true,
    shapes: [...shapes, { kind: 'point', id: 'P', at: p, mark: 'key', size: 'lg', label: 'P' }],
    handles: [{ id: 'p', at: p, label: 'P', mark: 'key', step, min, max }],
  };
}

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const pointOut = (p: Vec, f: number): Readout[] => [
  { id: 'P', label: 'P = (a, b)', value: fmtVec(p), mark: 'key' },
  { id: 'f', label: 'height f(a, b)', value: H3(f), mark: 'key' },
];
const UP_DOWN = ['Go up', 'Go down', 'Stay the same'];
const trend = (from: number, to: number) => (Math.abs(to - from) < 1e-9 ? 'Stay the same' : to > from ? 'Go up' : 'Go down');
const slant = (slope: number) => (slope === 0 ? 'Flat' : slope > 0 ? 'Uphill' : 'Downhill');
const signed = (v: number) => (v > 0 ? `+${H3(v)}` : H3(v));
/** Wrong heights for f(a, b): x and y swapped, a surface's slips, then one either side when those all coincide. */
const wrongHeights = (s: Surface, a: number, b: number) => {
  const v = s.f(a, b);
  return [s.f(b, a), ...s.slips(a, b), v + 1, v - 1].map(H3);
};

const pseudocode = [
  'f(x, y): two inputs, one height',
  'table[row y][column x] ← f(x, y)',
  'contour c: join the points where f = c',
  'walk along a contour: f stays c',
  'step across contours: f changes',
  'close contours: steep ground',
  'x-slice: hold y = b, let x vary',
  'y-slice: hold x = a, let y vary',
  'the slope of each slice at P',
];

// ───────────────────────────── a table with two inputs ─────────────────────────────

const CELL_PX = 40;

function* table(s: Surface, p: Vec): Generator<Frame<PlotState>> {
  const { xs, ys } = s.grid;
  const [a, b] = p;
  const fp = s.f(a, b);
  const rows = heightTable(s.id);
  const pRow = ys.indexOf(b);
  const pCol = xs.indexOf(a);
  const min: Vec = [xs[0], ys[ys.length - 1]];
  const max: Vec = [xs[xs.length - 1], ys[0]];
  const dots: Shape[] = ys.flatMap((y) => xs.map((x): Shape => ({ kind: 'point', id: `g:${x}:${y}`, at: [x, y], size: 'sm' })));
  const heightLabel = (x: number, y: number): LabelShape => ({ kind: 'label', id: `h:${x}:${y}`, at: [x, y + LABEL_LIFT], text: H3(s.f(x, y)) });
  const rowLabels = (count: number) => ys.slice(0, count).flatMap((y) => xs.map((x) => heightLabel(x, y)));
  const tableImage = (count: number, extra: ImageBox[] = [], showP = false): ImagePart => ({
    kind: 'image',
    id: 'table',
    label: `Heights: rows y = ${fmt(ys[0])} down to ${fmt(ys[ys.length - 1])}, columns x = ${fmt(xs[0])} to ${fmt(xs[xs.length - 1])}`,
    width: xs.length,
    height: ys.length,
    pixels: rows.flat().map(() => 0),
    scale: 'signed',
    values: rows.flatMap((row, r) => row.map((v, c) => (r < count || (showP && r === pRow && c === pCol) ? H3(v) : ''))),
    boxes: [...extra, { id: 'P', x: pCol, y: pRow, w: 1, h: 1, mark: 'key' }],
    size: xs.length * CELL_PX,
    matrix: true,
  });
  const plane = (label: string, shapes: Shape[]) => mapPlane(s, label, shapes, p, 1, min, max);
  const vars = { a, b, 'f(a, b)': fp };
  const all = rowLabels(ys.length);

  yield plotFrame([plane(`f(x, y) = ${s.formula}`, dots), tableImage(0), readouts([{ id: 'P', label: 'P = (a, b)', value: fmtVec(p), mark: 'key' }])], {
    line: 0,
    note: `f(x, y) = ${s.formula} takes two numbers, x and y, and gives back one: a height above the point (x, y). So its values fill a table with two inputs: a column for each x and a row for each y, with the largest y on top, like the map. Drag P to another grid point.`,
    vars: { a, b },
    checkpoint: ask(`What is the height at P = ${fmtVec(p)}?`, H3(fp), wrongHeights(s, a, b)),
  });

  yield plotFrame([plane(`f(x, y) = ${s.formula}`, [...dots, heightLabel(a, b)]), tableImage(0, [], true), readouts(pointOut(p, fp))], {
    line: 1,
    note: `f${fmtVec(p)} = ${H3(fp)}: put x = ${fmt(a)} and y = ${fmt(b)} into ${s.formula}. It goes in row y = ${fmt(b)}, column x = ${fmt(a)} of the table, and on the map just above P.`,
    vars,
  });

  for (let r = 0; r < ys.length; r++) {
    const y = ys[r];
    const peak = Math.max(...rows[r]);
    yield plotFrame(
      [plane(`f(x, y) = ${s.formula}`, [...dots, ...rowLabels(r + 1), ...(r < pRow ? [heightLabel(a, b)] : [])]), tableImage(r + 1, [{ id: 'row', x: 0, y: r, w: xs.length, h: 1, mark: 'compare' }], true), readouts(pointOut(p, fp))],
      {
        line: 1,
        note:
          r === 0
            ? `Row y = ${fmt(y)}, the top row: hold y at ${fmt(y)} and work out f for each x from ${fmt(xs[0])} to ${fmt(xs[xs.length - 1])}. The biggest height in this row is ${H3(peak)}.`
            : `Row y = ${fmt(y)}: the heights ${rows[r].map(H3).join(', ')}. ${r === ys.length - 1 ? 'The table is full: every grid point has its height.' : `Its biggest is ${H3(peak)}.`}`,
        vars: { ...vars, y },
      },
    );
  }

  const levels = contourLevels(s);
  const onLevel = (level: number) => ys.flatMap((y) => xs.filter((x) => s.f(x, y) === level).map((x): Vec => [x, y]));
  const namedIndex = s.levels.indexOf(s.named.level);
  const missIndex = s.levels.findIndex((level, i) => i > namedIndex && onLevel(level).length === 0);
  const askIndex = missIndex >= 0 ? missIndex : namedIndex + 1;
  const [answer, ...wrong] = s.named.points;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i].value;
    const hits = onLevel(level);
    const nextLevel = levels[i + 1]?.value;
    const checkpoint =
      i + 1 === namedIndex
        ? ask(`Which of these points lies on the contour f = ${fmt(s.named.level)}?`, fmtVec(answer), wrong.map((w) => fmtVec(w)))
        : i + 1 === askIndex && nextLevel !== undefined
          ? askInOrder(`Will the contour f = ${fmt(nextLevel)} pass through any of the grid points?`, ['Yes', 'No'], onLevel(nextLevel).length ? 'Yes' : 'No')
          : undefined;
    const named = hits.map((h) => fmtVec(h));
    const listed = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}` : named.join('');
    const hitText = hits.length ? `${listed} ${hits.length > 1 ? 'have' : 'has'} height ${fmt(level)} exactly, so the line goes through ${hits.length > 1 ? 'them' : 'it'}` : `No grid point has height ${fmt(level)} exactly: the line runs between the grid points, between a height above ${fmt(level)} and one below it`;
    yield plotFrame(
      [
        plane(`Contours of f = ${s.formula}`, [
          contourShape(s, i + 1),
          ...levelPaths(s, i),
          ...dots.map((d): Shape => (d.kind === 'point' && hits.some((h) => h[0] === d.at[0] && h[1] === d.at[1]) ? { ...d, mark: 'found' } : d)),
          ...all,
        ]),
        tableImage(ys.length),
        readouts([...pointOut(p, fp), { id: 'level', label: 'contour', value: `f = ${fmt(level)}`, mark: 'found' }]),
      ],
      {
        line: 2,
        note:
          i === 0
            ? `Now join points of equal height. The contour f = ${fmt(level)} is the line through every point where the height is exactly ${fmt(level)}. ${hitText}.`
            : `The contour f = ${fmt(level)}. ${hitText}.${i === levels.length - 1 ? ` Contour lines are ${fmt(levels[0].value - levels[1].value)} apart in height, like the lines on a hiking map.` : ''}`,
        vars: { ...vars, c: level },
        ...(checkpoint && { checkpoint }),
      },
    );
  }

  yield plotFrame([plane(`Contours of f = ${s.formula}`, [washShape(s), contourShape(s), ...dots, ...all]), tableImage(ys.length), readouts(pointOut(p, fp))], {
    line: 2,
    note: `Height as colour too: the shading is darker where the ground is higher. ${s.id === 'hill' ? `The ovals ring the peak, 8 at (0, 0), and are squashed: they sit closer together going up the y-axis than along the x-axis, because y² grows twice as fast as x²/2, so the hill is steeper in y.` : `Along x the ground rises and along y it falls: the contours f = 0 cross at (0, 0), the middle of the saddle.`}`,
    vars,
  });
}

// ───────────────────────────── walking on the map ─────────────────────────────

function* walk(s: Surface, p: Vec): Generator<Frame<PlotState>> {
  const [a, b] = p;
  const fp = s.f(a, b);
  const w = contourWalk(s.id, p);
  const base: Shape[] = [washShape(s), contourShape(s), ...levelLabels(s)];
  const plane = (label: string, shapes: Shape[]) => mapPlane(s, label, [...base, ...shapes], p, 0.5, s.pMin, s.pMax);
  const vars = { a, b, 'f(a, b)': fp };
  const level = H3(fp);
  const stepAt = (k: number) => w.walk[w.steps[k]];
  const trail = (k: number): Shape[] => [
    { kind: 'path', id: 'trail', points: thin(w.walk.slice(0, w.steps[k] + 1)), mark: 'found' },
    ...w.steps.slice(0, k + 1).map((i, j): Shape => ({ kind: 'point', id: `step${j}`, at: w.walk[i], mark: 'found', size: 'sm', label: j === k ? `${j + 1}` : undefined })),
  ];
  const stepOuts = (k: number): Readout[] => w.steps.slice(0, k + 1).map((i, j) => ({ id: `step${j}`, label: `height after step ${j + 1}`, value: H3(s.f(...w.walk[i])), mark: 'found' }));

  yield plotFrame([plane(`Contours of f = ${s.formula}`, []), readouts(pointOut(p, fp))], {
    line: 3,
    note: `P = ${fmtVec(p)} stands at height ${level} on f = ${s.formula}. The faint lines are contours, one for each whole-number height (some are labelled), and the shading is darker on higher ground. One contour line passes through P itself. Drag P to move it.`,
    vars,
    checkpoint: askInOrder('Walking along the contour line through P, will the height go up, go down or stay the same?', UP_DOWN, 'Stay the same'),
  });

  for (let k = 0; k < 3; k++) {
    const q = stepAt(k);
    yield plotFrame([plane(`Walking along the contour through P`, trail(k)), readouts([...pointOut(p, fp), ...stepOuts(k)])], {
      line: 3,
      note:
        k === 0
          ? `It stays the same. One step along the line takes us to the first marked point, still on the contour through P.`
          : k === 1
            ? `Step 2, to ${fmtVec(q)}: the height is ${H3(s.f(...q))}, the same as at P and after step 1. A contour joins points of equal height, so walking along one never climbs or drops.`
            : `Step ${k + 1}, to ${fmtVec(q)}: the height is ${H3(s.f(...q))} again. The path curves to keep the height fixed.`,
      vars: { ...vars, step: k + 1 },
      ...(k === 0 && { checkpoint: ask('After the next step along the line, what will the height be?', level, [H3(fp + 1), H3(fp - 1), H3(fp + 0.5)]) }),
    });
  }

  const xl: Vec = [a - 0.5, b];
  const xr: Vec = [a + 0.5, b];
  const yd: Vec = [a, b - 0.5];
  const yu: Vec = [a, b + 0.5];
  const [sx, sy] = s.slopes(a, b);
  const dx = s.f(...xr) - s.f(...xl);
  const dy = s.f(...yu) - s.f(...yd);
  const whole: Shape = { kind: 'path', id: 'trail', points: thin(w.path), closed: w.closed, mark: 'found', ...(!w.closed && { label: `f = ${level}` }) };
  const allSteps = w.steps.map((i, j): Shape => ({ kind: 'point', id: `step${j}`, at: w.walk[i], mark: 'found', size: 'sm' }));
  const across = (id: string, from: Vec, to: Vec, label: string): Shape[] => [
    { kind: 'vector', id, from, to, mark: 'compare', label },
    { kind: 'point', id: `${id}-from`, at: from, mark: 'compare', size: 'sm' },
  ];
  const acrossOuts = (id: string, from: Vec, to: Vec): Readout[] => [
    { id: `${id}-from`, label: `f${fmtVec(from)}`, value: H3(s.f(...from)), mark: 'compare' },
    { id: `${id}-to`, label: `f${fmtVec(to)}`, value: H3(s.f(...to)), mark: 'compare' },
    { id: `${id}-change`, label: `change across ${id}`, value: signed(s.f(...to) - s.f(...from)), mark: 'compare' },
  ];

  yield plotFrame([plane('The whole contour through P', [whole, ...allSteps]), readouts([...pointOut(p, fp), { id: 'level', label: 'height all along it', value: level, mark: 'found' }])], {
    line: 3,
    note: w.closed
      ? `Keep walking and the line closes into an oval that brings us back to P: every point on it has height ${level}. The hill's contours are rings around the peak.`
      : `Followed both ways, this contour runs off the edge of the map, and every point on it has height ${level}. On a saddle the contours open out instead of ringing a peak.`,
    vars,
    checkpoint: askInOrder(`Now step straight across instead, from ${fmtVec(xl)} to ${fmtVec(xr)}, through P. Will the height go up, go down or stay the same?`, UP_DOWN, trend(s.f(...xl), s.f(...xr))),
  });

  yield plotFrame([plane('A step across, along x', [whole, ...across('x', xl, xr, 'x')]), readouts([...pointOut(p, fp), ...acrossOuts('x', xl, xr)])], {
    line: 4,
    note:
      dx === 0
        ? `It stays the same: from ${fmtVec(xl)} the ground rises to P and falls back by just as much, ${H3(s.f(...xl))} at both ends. At P the x direction runs along the contour.`
        : `The height ${dx > 0 ? 'rises' : 'falls'}, from ${H3(s.f(...xl))} to ${H3(s.f(...xr))}, a change of ${signed(dx)} over one unit of x: the step cuts across the contour lines instead of following one.`,
    vars: { ...vars, 'change along x': dx },
    checkpoint: askInOrder(`And from ${fmtVec(yd)} to ${fmtVec(yu)}, a step across through P along y? Will the height go up, go down or stay the same?`, UP_DOWN, trend(s.f(...yd), s.f(...yu))),
  });

  const steeper = Math.abs(sx) === Math.abs(sy) ? 'Equally steep' : Math.abs(sx) > Math.abs(sy) ? 'Along x' : 'Along y';
  yield plotFrame([plane('Steps across, along x and along y', [whole, ...across('x', xl, xr, 'x'), ...across('y', yd, yu, 'y')]), readouts([...acrossOuts('x', xl, xr), ...acrossOuts('y', yd, yu)])], {
    line: 4,
    note:
      dy === 0
        ? `It stays the same: ${H3(s.f(...yd))} at both ends, with P between them.`
        : `It ${dy > 0 ? 'goes up' : 'goes down'}, from ${H3(s.f(...yd))} to ${H3(s.f(...yu))}. Both steps across are one unit long.`,
    vars: { ...vars, 'change along x': dx, 'change along y': dy },
    checkpoint: askInOrder('Near P, where is the ground steeper: along x or along y?', ['Along x', 'Along y', 'Equally steep'], steeper),
  });

  // A rough gap: one unit of height divided by the change per unit (the real gaps differ, since the slope changes as you go).
  const gap = (slope: number) => (slope === 0 ? 'none (level here)' : `about ${fmt(1 / Math.abs(slope))}`);
  yield plotFrame(
    [
      plane('Close contours: steep ground', [whole, ...across('x', xl, xr, 'x'), ...across('y', yd, yu, 'y')]),
      readouts([
        { id: 'sx', label: 'height change per unit of x', value: signed(sx), mark: 'compare' },
        { id: 'sy', label: 'height change per unit of y', value: signed(sy), mark: 'compare' },
        { id: 'gx', label: 'rough gap along x (1 ÷ change per unit)', value: gap(sx) },
        { id: 'gy', label: 'rough gap along y (1 ÷ change per unit)', value: gap(sy) },
      ]),
    ],
    {
      line: 5,
      note:
        steeper === 'Equally steep'
          ? `Equally steep: a change of ${signed(dy)} over one unit of y, against ${signed(dx)} along x, so the height changes by ${fmt(Math.abs(sx))} per unit either way and the contour lines, 1 apart in height, are as close together along x as along y.`
          : `${steeper}: a change of ${signed(dy)} over one unit of y, against ${signed(dx)} along x, so the height changes by ${fmt(Math.max(Math.abs(sx), Math.abs(sy)))} per unit ${steeper === 'Along x' ? 'along x' : 'along y'} against ${fmt(Math.min(Math.abs(sx), Math.abs(sy)))} the other way. Contour lines are 1 apart in height, so where the ground climbs fast they crowd together: close contours mean steep ground, wide gaps mean gentle ground.`,
      vars: { ...vars, 'change along x': dx, 'change along y': dy },
    },
  );
}

// ───────────────────────────── slices through P ─────────────────────────────

const SAMPLES = 96;
const TANGENT = 0.75;

function* slices(s: Surface, p: Vec): Generator<Frame<PlotState>> {
  const [a, b] = p;
  const fp = s.f(a, b);
  const [sx, sy] = s.slopes(a, b);
  const x0 = a + 1 <= s.x.max ? a + 1 : a - 1;
  const hx = s.f(x0, b);
  const base: Shape[] = [washShape(s), contourShape(s), ...levelLabels(s)];
  const xLine: Shape = { kind: 'line', id: 'xline', through: [0, b], dir: [1, 0], tone: 1, label: `y = ${fmt(b)}` };
  const yLine: Shape = { kind: 'line', id: 'yline', through: [a, 0], dir: [0, 1], tone: 2, label: `x = ${fmt(a)}` };
  const wholes = (axis: Axis) => range(Math.ceil(axis.min), Math.floor(axis.max));
  const xDots = (on: 'map' | 'chart'): Shape[] => wholes(s.x).map((x) => ({ kind: 'point', id: `xd${x}`, at: on === 'map' ? [x, b] : [x, s.f(x, b)], tone: 1, size: 'sm' }));
  const yDots = (on: 'map' | 'chart'): Shape[] => wholes(s.y).map((y) => ({ kind: 'point', id: `yd${y}`, at: on === 'map' ? [a, y] : [y, s.f(a, y)], tone: 2, size: 'sm' }));
  const curve = (id: string, axis: Axis, g: (t: number) => number, tone: 1 | 2, label: string): Shape => ({
    kind: 'path',
    id,
    points: Array.from({ length: SAMPLES + 1 }, (_, k): Vec => {
      const t = axis.min + ((axis.max - axis.min) * k) / SAMPLES;
      return [t, g(t)];
    }),
    tone,
    label,
  });
  const xCurve = curve('xslice', s.x, (x) => s.f(x, b), 1, 'x-slice');
  const yCurve = curve('yslice', s.y, (y) => s.f(a, y), 2, 'y-slice');
  const tangent = (id: string, t: number, slope: number, tone: 1 | 2): Shape => ({
    kind: 'path',
    id,
    points: [
      [t - TANGENT, fp - TANGENT * slope],
      [t + TANGENT, fp + TANGENT * slope],
    ],
    tone,
    dashed: true,
    label: `slope ${fmt(slope)}`,
  });
  const Px: Shape = { kind: 'point', id: 'Px', at: [a, fp], tone: 1, size: 'md', label: 'P' };
  const Py: Shape = { kind: 'point', id: 'Py', at: [b, fp], tone: 2, size: 'md', label: 'P' };
  const map = (label: string, shapes: Shape[]) => mapPlane(s, label, [...base, ...shapes], p, 0.5, s.pMin, s.pMax);
  const chartAxis: Axis = { min: Math.min(s.x.min, s.y.min), max: Math.max(s.x.max, s.y.max), label: 'x, or y' };
  const chart = (shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'slices', label: 'Slices through P', x: chartAxis, y: s.chart, equal: false, shapes, handles: [] });
  const vars = { a, b, 'f(a, b)': fp };
  const xOuts: Readout[] = [{ id: 'xslice', label: `x-slice f(x, ${fmt(b)})`, value: s.xSlice(b), tone: 1 }];
  const yOuts: Readout[] = [{ id: 'yslice', label: `y-slice f(${fmt(a)}, y)`, value: s.ySlice(a), tone: 2 }];
  const xSlope: Readout = { id: 'sx', label: 'slope of the x-slice at P', value: fmt(sx), tone: 1 };
  const ySlope: Readout = { id: 'sy', label: 'slope of the y-slice at P', value: fmt(sy), tone: 2 };
  const xShape = sliceShape(sx, s.bend[0]);
  const yShape = sliceShape(sy, s.bend[1]);
  const shapeWords = (shape: 'Peak' | 'Valley' | 'Neither', slope: number) =>
    shape === 'Peak' ? 'at the top of a hill' : shape === 'Valley' ? 'at the bottom of a valley' : `on a slope (${slope > 0 ? 'rising' : 'falling'}), so at no peak or valley`;
  const turn = (bend: number) => (bend < 0 ? 'an upside-down parabola: a hill' : 'an upright parabola: a valley');
  const xChart = [xCurve, Px];
  const xChartT = [xCurve, tangent('xtan', a, sx, 1), Px];

  yield plotFrame([map(`Contours of f = ${s.formula}`, []), chart([]), readouts(pointOut(p, fp))], {
    line: 6,
    note: `f(x, y) = ${s.formula} is a whole surface, drawn here as a contour map. To see its shape through P = ${fmtVec(p)}, slice it: hold y at ${fmt(b)} and let only x vary, as if walking west to east along the line y = ${fmt(b)}. Drag P to move the slices.`,
    vars,
    checkpoint: ask(`Holding y = ${fmt(b)}, what is the height at x = ${fmt(x0)}, the point ${fmtVec([x0, b])}?`, H3(hx), wrongHeights(s, x0, b)),
  });

  yield plotFrame(
    [
      map('The line y = b through P', [xLine, ...xDots('map')]),
      chart([...xDots('chart'), { kind: 'point', id: 'xask', at: [x0, hx], tone: 1, size: 'md', label: H3(hx) }]),
      readouts([...pointOut(p, fp), { id: 'hx', label: `f${fmtVec([x0, b])}`, value: H3(hx), tone: 1 }]),
    ],
    {
      line: 6,
      note: `f${fmtVec([x0, b])} = ${H3(hx)}. Every point on the line y = ${fmt(b)} has a height; plot each one against its x, in the Slices chart.`,
      vars,
    },
  );

  yield plotFrame([map('The line y = b through P', [xLine]), chart([...xDots('chart'), ...xChart]), readouts([...pointOut(p, fp), ...xOuts])], {
    line: 6,
    note: `Joined up, the heights make an ordinary curve of one variable, the x-slice: f(x, ${fmt(b)}) = ${s.xSlice(b)}, ${turn(s.bend[0])}. P sits on it at x = ${fmt(a)}.`,
    vars,
    checkpoint: askInOrder('At P, going right along the x-slice, is the curve going uphill, downhill or flat?', ['Uphill', 'Downhill', 'Flat'], slant(sx)),
  });

  yield plotFrame([map('The line y = b through P', [xLine]), chart(xChartT), readouts([...pointOut(p, fp), ...xOuts, xSlope])], {
    line: 8,
    note: `${slant(sx)}: the dashed line touching the x-slice at P has slope ${fmt(sx)}. That is how fast the height changes as x alone moves away from ${fmt(a)}, with y held at ${fmt(b)}.`,
    vars: { ...vars, 'x-slope': sx },
    checkpoint: askInOrder(`Now hold x = ${fmt(a)} and let y vary instead: the y-slice. Is P at its top (a peak), its bottom (a valley), or neither?`, ['Peak', 'Valley', 'Neither'], yShape),
  });

  yield plotFrame([map('The line x = a through P', [xLine, yLine, ...yDots('map')]), chart([...xChartT, ...yDots('chart')]), readouts([...pointOut(p, fp), ...xOuts, xSlope])], {
    line: 7,
    note: `${yShape}: along the line x = ${fmt(a)}, P is ${shapeWords(yShape, sy)}. Here are the heights at whole values of y, plotted against y.`,
    vars: { ...vars, 'x-slope': sx },
  });

  yield plotFrame([map('The line x = a through P', [xLine, yLine]), chart([...xChartT, yCurve, Py]), readouts([...pointOut(p, fp), ...xOuts, xSlope, ...yOuts])], {
    line: 7,
    note: `The y-slice: f(${fmt(a)}, y) = ${s.ySlice(a)}, ${turn(s.bend[1])}. P sits on it at y = ${fmt(b)}, at the same height ${H3(fp)} as on the x-slice: both slices pass through the same point of the surface.`,
    vars: { ...vars, 'x-slope': sx },
    checkpoint: askInOrder('At P, going up in y along the y-slice, is the curve going uphill, downhill or flat?', ['Uphill', 'Downhill', 'Flat'], slant(sy)),
  });

  const flat = sx === 0 && sy === 0;
  const equally = flat ? 'Equally steep (here, both flat)' : 'Equally steep';
  const steeper = Math.abs(sx) === Math.abs(sy) ? equally : Math.abs(sx) > Math.abs(sy) ? 'The x-slice' : 'The y-slice';
  const both = [...xChartT, yCurve, tangent('ytan', b, sy, 2), Py];
  yield plotFrame([map('Both slices through P', [xLine, yLine]), chart(both), readouts([...pointOut(p, fp), ...xOuts, xSlope, ...yOuts, ySlope])], {
    line: 8,
    note: `${slant(sy)}: the dashed line touching the y-slice at P has slope ${fmt(sy)}. That is how fast the height changes as y alone moves away from ${fmt(b)}, with x held at ${fmt(a)}.`,
    vars: { ...vars, 'x-slope': sx, 'y-slope': sy },
    checkpoint: askInOrder('Which slice is steeper at P?', ['The x-slice', 'The y-slice', equally], steeper),
  });

  const saddleNote =
    s.bend[0] * s.bend[1] < 0 ? ` On this saddle one slice is a valley and the other a hill, whatever P you pick: the surface curves up one way and down the other.` : '';
  yield plotFrame([map('Both slices through P', [xLine, yLine]), chart(both), readouts([...pointOut(p, fp), ...xOuts, xSlope, ...yOuts, ySlope])], {
    line: 8,
    note: `${flat ? `Both flat: slope 0 along x and 0 along y.` : `${steeper}: slope ${fmt(sx)} along x against ${fmt(sy)} along y.`} On the x-slice P is ${shapeWords(xShape, sx)}; on the y-slice, ${shapeWords(yShape, sy)}.${saddleNote} These two slopes, one per input, are what the next lessons call partial derivatives.`,
    vars: { ...vars, 'x-slope': sx, 'y-slope': sy },
  });
}

function* run(input: ContourInput): Generator<Frame<PlotState>> {
  const s = SURFACES[input.surface];
  if (input.story === 'table') yield* table(s, input.p);
  else if (input.story === 'walk') yield* walk(s, input.p);
  else yield* slices(s, input.p);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

/** Where P may go in a story, and its step: the table story keeps P on the grid's whole numbers. */
export function pBounds(story: Story, id: SurfaceId): { min: Vec; max: Vec; step: number } {
  const s = SURFACES[id];
  if (story === 'table') return { min: [s.grid.xs[0], s.grid.ys[s.grid.ys.length - 1]], max: [s.grid.xs[s.grid.xs.length - 1], s.grid.ys[0]], step: 1 };
  return { min: s.pMin, max: s.pMax, step: 0.5 };
}

export function parseContour(text: string): { value: ContourInput } | { error: string } {
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const story = STORIES.find((w) => words.includes(w));
  const surface = SURFACE_IDS.find((w) => words.includes(w));
  if (!story) return { error: 'Start with a story: table, walk or slices, e.g. walk hill at 1 1.' };
  if (!surface) return { error: 'Name a surface: hill or saddle, e.g. walk hill at 1 1.' };
  const xs = numbersIn(text);
  if (xs.length !== 2) return { error: 'Then give P as two numbers, e.g. walk hill at 1 1.' };
  const { min, max, step } = pBounds(story, surface);
  const onStep = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;
  if (!xs.every(onStep)) return { error: step === 1 ? 'In the table story P sits on a grid point: use whole numbers.' : 'Use halves for P, e.g. 1.5.' };
  if (xs.some((v, k) => v < min[k] || v > max[k])) return { error: `Keep P inside x from ${min[0]} to ${max[0]} and y from ${min[1]} to ${max[1]}.` };
  const p: Vec = [round(xs[0], 6), round(xs[1], 6)];
  if (story === 'walk' && p[0] === 0 && p[1] === 0) return { error: 'At (0, 0) the ground is flat, so no contour line runs through P: pick another point.' };
  return { value: { story, surface, p } };
}

const formatContour = ({ story, surface, p }: ContourInput) => `${story} ${surface} at ${plain(p[0])} ${plain(p[1])}`;

export function dragContour(input: ContourInput, id: string, to: Vec): ContourInput {
  if (id !== 'p') return input;
  const { min, max, step } = pBounds(input.story, input.surface);
  const p: Vec = [snap(to[0], step, min[0], max[0]), snap(to[1], step, min[1], max[1])];
  if (input.story === 'walk' && p[0] === 0 && p[1] === 0) return input;
  return { ...input, p };
}

const example = (id: string, label: string, input: ContourInput) => ({ id, label, make: () => input, sized: false });

export const contourMaps = defineAlgorithm<ContourInput, PlotState>({
  kind: 'algorithm',
  slug: 'contour-maps',
  view: 'plot',
  input: {
    examples: [
      example('table', 'A table with two inputs', { story: 'table', surface: 'hill', p: [2, 1] }),
      example('walk', 'Walk along a contour', { story: 'walk', surface: 'hill', p: [1, 1] }),
      example('slices', 'Slice the hill through P', { story: 'slices', surface: 'hill', p: [2, 0] }),
      example('saddle', 'Slice a saddle', { story: 'slices', surface: 'saddle', p: [0, 0] }),
    ],
    custom: {
      label: 'A story (table, walk, slices), a surface (hill, saddle) and P (halves; whole numbers in the table)',
      placeholder: 'e.g. walk hill at 1 1',
      parse: parseContour,
      format: formatContour,
    },
    drag: dragContour,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Contour lines: points of equal height (the shading is darker on higher ground)' },
    { mark: 'key', label: 'The point P (drag it)' },
    { mark: 'found', label: 'The contour being drawn, or the one through P' },
    { mark: 'compare', label: 'A step across the contours' },
    { tone: 1, label: 'The x-slice: y held at b' },
    { tone: 2, label: 'The y-slice: x held at a' },
  ],
  run,
  content: {
    idea: 'A function of two inputs, f(x, y), gives a height above every point of the plane: a table with two inputs, or a landscape. A contour map draws it flat: each contour line joins the points of one height, like a hiking map. Slice the landscape along y = b or x = a and you get an ordinary curve of one variable.',
    invariant: 'Walking along a contour line the height never changes. Neighbouring contours differ by the same height, so where they crowd together the ground is steep and where they spread out it is gentle. The x-slice and the y-slice through P both pass through P at height f(P).',
    whenToUse: 'Reading any function of two inputs: a loss as two weights change, elevation on a map, temperature across a plate. Contour plots show where a function is high, low, steep or flat at a glance, and slicing is how the next lessons measure its slope one input at a time (partial derivatives, then the gradient).',
    traits: [
      { label: 'Two inputs, one output', good: null },
      { label: 'Along a contour: height constant', good: null },
      { label: 'Close contours: steep ground', good: null },
    ],
    experiments: [
      { example: 'table', prompt: 'Drag P to (0, 2) and to (2, 0). Same distance from the peak, different heights: which way is the hill steeper?' },
      { example: 'walk', prompt: 'Drag P towards the peak. The ovals shrink, but are they still squashed the same way?' },
      { example: 'slices', prompt: 'Drag P up to b = 1. How does the x-slice change?' },
      { example: 'saddle', prompt: 'Drag P anywhere: the x-slice always opens up and the y-slice down. Where are both slopes 0?' },
    ],
  },
});

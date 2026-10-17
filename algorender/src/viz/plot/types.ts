import type { MarkKey, Tone } from '@/viz/marks';

// State for the plot view: coordinate planes for math and ML (vectors and a
// warped grid for linear algebra, curves and tangents for calculus, contour
// maps and descent paths for optimization), plus matrix and readout panels.
// Everything is in world coordinates and keyed by stable id, so a vector or a
// grid line glides from one frame to the next instead of being redrawn.

export type Vec = readonly [x: number, y: number];

/** A 2×2 matrix by rows: [[a, b], [c, d]] is [a, b, c, d]. Its columns are where î and ĵ land. */
export type Mat2 = readonly [a: number, b: number, c: number, d: number];

/**
 * How a shape is coloured: by a mark (a state with a meaning across the app,
 * e.g. `key` for the current point) or by a tone (a named series such as î).
 * A shape with neither is drawn in neutral ink.
 */
type Paint = { mark?: MarkKey | null; tone?: Tone };

/** An arrow from `from` to `to`. Its label sits just past the tip. */
export type VectorShape = Paint & { kind: 'vector'; id: string; from: Vec; to: Vec; label?: string; dashed?: boolean };

export type PointShape = Paint & { kind: 'point'; id: string; at: Vec; label?: string; size?: 'sm' | 'md' | 'lg' };

/**
 * A polyline through `points`: a curve, a descent path, a polygon (`closed`,
 * optionally `fill`ed with a pale wash). `dots` marks every vertex.
 */
export type PathShape = Paint & {
  kind: 'path';
  id: string;
  points: readonly Vec[];
  closed?: boolean;
  fill?: boolean;
  dashed?: boolean;
  dots?: boolean;
  /** Thin and quiet, for reference curves. */
  faint?: boolean;
  label?: string;
};

/** The infinite line through `through` with direction `dir`, clipped to the plane (an eigenvector's span, a tangent). */
export type LineShape = Paint & { kind: 'line'; id: string; through: Vec; dir: Vec; dashed?: boolean; label?: string };

/** Text at a point, e.g. the area of a parallelogram. */
export type LabelShape = { kind: 'label'; id: string; at: Vec; text: string };

/** Level curves of a function, each level as line segments (from marching squares). */
export type ContourLevel = { value: number; segments: readonly (readonly [Vec, Vec])[] };
export type ContourShape = { kind: 'contours'; id: string; levels: readonly ContourLevel[] };

export type Shape = VectorShape | PointShape | PathShape | LineShape | LabelShape | ContourShape;

/**
 * A point the learner can drag (or move with the arrow keys) to change the
 * input. Positions snap to multiples of `step` and stay inside `min`..`max`
 * on both axes.
 */
export type Handle = { id: string; at: Vec; label: string; tone?: Tone; mark?: MarkKey | null; step: number; min: number; max: number };

export type Axis = { min: number; max: number; label?: string };

export type PlanePart = {
  kind: 'plane';
  id: string;
  /** Names the plane for screen readers and as its caption. */
  label: string;
  x: Axis;
  y: Axis;
  /** Keep one unit the same length on both axes (geometry); false fills a chart box. */
  equal: boolean;
  /**
   * Draw the integer grid moved by this matrix over a faint copy of the
   * original, so the learner sees space itself transformed. Null or absent:
   * a plain background grid.
   */
  warp?: Mat2 | null;
  shapes: readonly Shape[];
  handles: readonly Handle[];
};

/** A matrix drawn in brackets, each column optionally toned (î's column, ĵ's column). */
export type MatrixPart = {
  kind: 'matrix';
  id: string;
  /** e.g. "A". */
  name: string;
  label: string;
  cols: readonly { values: readonly string[]; tone?: Tone }[];
};

export type Readout = { id: string; label: string; value: string; mark?: MarkKey | null; tone?: Tone };

/** Named values, e.g. det A = 2 or loss = 0.31. */
export type ReadoutPart = { kind: 'readouts'; id: string; label: string; items: readonly Readout[] };

export type PlotPart = PlanePart | MatrixPart | ReadoutPart;

/** Planes sit side by side (wrapping on narrow screens); matrices and readouts follow in a row. */
export type PlotState = { parts: readonly PlotPart[] };

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
  /** How strongly `fill` washes the inside (default 0.18): areas that carry meaning (Bayes) want more. */
  fillOpacity?: number;
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

/**
 * Bars standing on the x-axis (or on `y0`), e.g. a histogram or a probability
 * distribution. Each bar is keyed by id and tweens its height; `label` is
 * written above it.
 */
export type Bar = Paint & { id: string; x0: number; x1: number; y: number; y0?: number; label?: string };
export type BarsShape = { kind: 'bars'; id: string; bars: readonly Bar[] };

export type Shape = VectorShape | PointShape | PathShape | LineShape | LabelShape | ContourShape | BarsShape;

/**
 * A point the learner can drag (or move with the arrow keys) to change the
 * input. Positions snap to multiples of `step` and stay inside `min`..`max`
 * (per axis).
 */
export type Handle = { id: string; at: Vec; label: string; tone?: Tone; mark?: MarkKey | null; step: number; min: Vec; max: Vec };

/** `ticks` replaces the round-number ticks with named ones, e.g. the symbols under a bar chart. */
export type Axis = { min: number; max: number; label?: string; ticks?: readonly { at: number; label: string }[] };

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

/**
 * A small grayscale picture, `width` × `height`, row by row from the top.
 * `gray`: 0 is black and 1 white (a photo looks the same in either theme).
 * `signed`: −1..1 for a piece that adds or subtracts, drawn in two hues.
 */
export type ImagePart = { kind: 'image'; id: string; label: string; width: number; height: number; pixels: readonly number[]; scale: 'gray' | 'signed' };

/** A row of bits split into named fields (sign, exponent, fraction), each field optionally toned. */
export type BitsPart = {
  kind: 'bits';
  id: string;
  label: string;
  bits: readonly { id: string; value: string; mark?: MarkKey | null }[];
  /** Fields as [from, to) bit positions, left to right. */
  fields: readonly { id: string; label: string; from: number; to: number; tone?: Tone; sub?: string }[];
};

export type PlotPart = PlanePart | ImagePart | BitsPart | MatrixPart | ReadoutPart;

/**
 * Planes and images sit side by side (wrapping on narrow screens), bit rows
 * span the width under them, and matrices and readouts follow in a row.
 */
export type PlotState = { parts: readonly PlotPart[] };

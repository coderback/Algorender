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

/**
 * Coloured cells over [x0, x1] × [y0, y1], `cols` × `rows`, values row by row
 * from the top: a classifier's decision regions or k-means' territories.
 * `blend` mixes tone `low` (0) into tone `high` (1); `classes` colours each
 * cell by an integer index into `tones`. Both are drawn as a pale wash under
 * the data. `intensity` is a matrix of weights in 0..1 (attention), from bare
 * (0) to a strong `tone` (1), so the big entries stand out. `depth` is a soft
 * violet wash under contour lines, 0 bare to 1 deepest: a loss surface's low
 * ground (V8).
 */
export type HeatmapShape = {
  kind: 'heatmap';
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cols: number;
  rows: number;
  values: readonly number[];
  scale: { kind: 'blend'; low: Tone; high: Tone } | { kind: 'classes'; tones: readonly Tone[] } | { kind: 'intensity'; tone: Tone } | { kind: 'depth' };
};

export type Shape = VectorShape | PointShape | PathShape | LineShape | LabelShape | ContourShape | BarsShape | HeatmapShape;

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
export type ImagePart = {
  kind: 'image';
  id: string;
  label: string;
  width: number;
  height: number;
  pixels: readonly number[];
  scale: 'gray' | 'signed';
  /** Outlined rectangles over the pixels, in pixel units, keyed by id so they glide: a convolution's window, a cache's new row. */
  boxes?: readonly ImageBox[];
  /** Text written on each pixel, row by row (for small grids such as a 3×3 kernel); empty strings leave a pixel bare. */
  values?: readonly string[];
  /** On-screen width in px (default 240); a 3×3 kernel wants less. */
  size?: number;
};

export type ImageBox = Paint & { id: string; x: number; y: number; w: number; h: number };

/** A row of bits split into named fields (sign, exponent, fraction), each field optionally toned. */
export type BitsPart = {
  kind: 'bits';
  id: string;
  label: string;
  bits: readonly { id: string; value: string; mark?: MarkKey | null }[];
  /** Fields as [from, to) bit positions, left to right. */
  fields: readonly { id: string; label: string; from: number; to: number; tone?: Tone; sub?: string }[];
};

/**
 * A node of a network diagram, in the part's own layout units. `value` boxes
 * show a name, a value and optionally a gradient (a computation graph);
 * `op` is a small circle holding an operation (+, ×, tanh); `neuron` is a
 * circle with an optional value inside (a neural network).
 */
export type NetNode = Paint & { id: string; x: number; y: number; kind: 'value' | 'op' | 'neuron'; label: string; value?: string; grad?: string };

/**
 * An arrow between two nodes. A `weight` sets the stroke width by its size
 * and the hue by its sign (tone 1 positive, tone 2 negative), like a network
 * playground; otherwise a mark or neutral. `label` sits at its middle.
 */
export type NetEdge = Paint & { id: string; from: string; to: string; weight?: number; label?: string };

/** A diagram of nodes and arrows: a computation graph, a neural network, a decision tree. */
export type NetworkPart = { kind: 'network'; id: string; label: string; nodes: readonly NetNode[]; edges: readonly NetEdge[] };

/**
 * A token of a sequence: `text` is shown as is (spaces visible as ·), `sub`
 * is a small line under it (an id, a probability).
 */
export type Token = Paint & { id: string; text: string; sub?: string };

/**
 * A row of tokens that wraps like text: a sentence split by BPE, the text a
 * model has generated so far, the tokens in a KV cache. Tokens are keyed by
 * id, so when two merge or a new one arrives the rest glide into place.
 */
export type TokensPart = { kind: 'tokens'; id: string; label: string; tokens: readonly Token[] };

export type PlotPart = PlanePart | ImagePart | NetworkPart | BitsPart | TokensPart | MatrixPart | ReadoutPart;

/**
 * Token rows span the width at the top, planes, images and networks sit side
 * by side under them (wrapping on narrow screens), bit rows span the width
 * under those, and matrices and readouts follow in a row.
 */
export type PlotState = { parts: readonly PlotPart[] };

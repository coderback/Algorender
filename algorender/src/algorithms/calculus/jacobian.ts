import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { contours, logLevels } from '@/viz/plot/contours';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { apply, fmt, fmtVec, round } from '@/viz/plot/geometry';
import { layered } from '@/viz/plot/network';
import type { Axis, ContourShape, Handle, Mat2, NetEdge, NetNode, NetworkPart, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Jacobians: the local linear map. A smooth map F from the plane to the
// plane bends the grid, so no one matrix does what F does. But zoom in on a
// point p and F looks like a matrix: its Jacobian J, with row i for output i
// and column j for input j (J[i][j] = ∂Fᵢ/∂xⱼ). Column j is where a tiny step
// along input j goes, per unit step; det J is how F scales areas near p. And
// backprop multiplies a row vector (the gradient so far) by one Jacobian after
// another, from the loss backwards: a vector–Jacobian product each time,
// never a full matrix product.

export type MapId = 'bend' | 'polar';
export type Story = 'zoom' | 'columns' | 'chain';
export type JacobianInput = { story: Story; map: MapId; p: Vec };
const STORIES: readonly Story[] = ['zoom', 'columns', 'chain'];

export type PlaneMap = {
  id: MapId;
  /** For narration: "F(x, y) = (x + y²/4, y − x²/4)". */
  formula: string;
  /** The two inputs' names: x and y, or r and θ. */
  names: readonly [string, string];
  /** The two outputs as formulas, F₁ and F₂. */
  outputs: readonly [string, string];
  f: (v: Vec) => Vec;
  /** The exact Jacobian at v, by rows: [∂F₁/∂a, ∂F₁/∂b, ∂F₂/∂a, ∂F₂/∂b]. */
  jac: (v: Vec) => Mat2;
  /** The entries' formulas, by rows. */
  entries: readonly [string, string, string, string];
  /** det J as a formula. */
  detText: string;
  /**
   * Ask for J's entries as formulas rather than numbers: polar's entries need
   * sin and cos of the angle, which nobody works out in their head.
   */
  askFormulas: boolean;
  /** Where p may go (on a 0.5 step). */
  min: Vec;
  max: Vec;
  input: { x: Axis; y: Axis };
  output: { x: Axis; y: Axis };
  /** The input grid lines drawn (and moved by F): a = const for a in `as`, b = const for b in `bs`. */
  grid: { as: readonly number[]; bs: readonly number[]; aRange: Vec; bRange: Vec };
  /** A point where det J = 0, as far from p as the map allows. */
  flat: (p: Vec) => Vec;
};

const steps = (lo: number, hi: number, step: number) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => lo + k * step);

export const MAPS: Record<MapId, PlaneMap> = {
  bend: {
    id: 'bend',
    formula: 'F(x, y) = (x + y²/4, y − x²/4)',
    names: ['x', 'y'],
    outputs: ['x + y²/4', 'y − x²/4'],
    f: ([x, y]) => [x + (y * y) / 4, y - (x * x) / 4],
    jac: ([x, y]) => [1, y / 2, -x / 2, 1],
    entries: ['1', 'y/2', '−x/2', '1'],
    detText: '1 + xy/4',
    askFormulas: false,
    min: [-2, -2],
    max: [2, 2],
    input: { x: { min: -2.5, max: 3 }, y: { min: -2.5, max: 3 } },
    output: { x: { min: -2.5, max: 4 }, y: { min: -4, max: 2.5 } },
    grid: { as: steps(-2, 2, 0.5), bs: steps(-2, 2, 0.5), aRange: [-2, 2], bRange: [-2, 2] },
    // det J = 1 + xy/4 is 0 on xy = −4, which meets the box only at two corners.
    flat: ([x, y]) => (Math.hypot(x - 2, y + 2) >= Math.hypot(x + 2, y - 2) ? [2, -2] : [-2, 2]),
  },
  polar: {
    id: 'polar',
    formula: 'F(r, θ) = (r·cos θ, r·sin θ)',
    names: ['r', 'θ'],
    outputs: ['r·cos θ', 'r·sin θ'],
    f: ([r, t]) => [r * Math.cos(t), r * Math.sin(t)],
    jac: ([r, t]) => [Math.cos(t), -r * Math.sin(t), Math.sin(t), r * Math.cos(t)],
    entries: ['cos θ', '−r·sin θ', 'sin θ', 'r·cos θ'],
    detText: 'r',
    askFormulas: true,
    min: [0.5, -1.5],
    max: [2, 1.5],
    input: { x: { min: -0.5, max: 3 }, y: { min: -2, max: 2.5 } },
    output: { x: { min: -2, max: 3 }, y: { min: -3, max: 3 } },
    grid: { as: steps(0.5, 2, 0.5), bs: steps(-1.5, 1.5, 0.5), aRange: [0, 2], bRange: [-1.5, 1.5] },
    // At r = 0 every angle lands on the origin: det J = r = 0.
    flat: ([, t]) => [0, t],
  },
};
const MAP_IDS = Object.keys(MAPS) as MapId[];

/** Square sizes in the zoom story: each half the one before. */
export const SIZES = [0.8, 0.4, 0.2, 0.1] as const;
/** The one-sided step drawn in the columns story, and the central-difference step it then measures with. */
export const CHORD_H = 0.5;
export const CENTRAL_H = 0.01;
/** The little square drawn for det J. */
export const DET_SIZE = 0.25;
/** The chain story: a fixed linear layer W after F, the target t, and the nudge that checks the gradient. */
export const CHAIN_W: Mat2 = [1, 0, 1, 1];
export const CHAIN_T: Vec = [2, 2];
export const CHECK_H = 0.001;

const pseudocode = [
  'F bends the grid: no one matrix fits',
  'square at p, sides s·î and s·ĵ',
  'linear guess: F(p) + J·(v − p)',
  'halve s: gap ÷ s halves too',
  'J[i][j] = ∂Fᵢ/∂xⱼ  (rows: outputs)',
  'column j ≈ (F(p + h·eⱼ) − F(p)) / h',
  'central: (F(p+h·eⱼ) − F(p−h·eⱼ)) / 2h',
  'det J = area scale near p',
  'forward: x → u = F(x) → v = W·u → L',
  'g ← ∂L/∂v = (v − t)ᵀ   (a row)',
  'g ← g·W        (∂L/∂u)',
  'g ← g·J_F(x)   (∂L/∂x)',
  'row × matrix: n² each, never n³',
  'check: nudge x, central differences',
];

// ───────────────────────────── the maths ─────────────────────────────

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const scale = (k: number, v: Vec): Vec => [k * v[0], k * v[1]];

export const det2 = ([a, b, c, d]: Mat2) => a * d - b * c;
export const col1 = ([a, , c]: Mat2): Vec => [a, c];
export const col2 = ([, b, , d]: Mat2): Vec => [b, d];
export const matMul = ([a, b, c, d]: Mat2, [e, f, g, h]: Mat2): Mat2 => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];

/** A vector–Jacobian product: the row vector g times the matrix m (entry j is g dotted with column j). */
export const vjp = ([g1, g2]: Vec, [a, b, c, d]: Mat2): Vec => [g1 * a + g2 * c, g1 * b + g2 * d];

/** The Jacobian of f at p by central differences: column j is (f(p + h·eⱼ) − f(p − h·eⱼ)) / 2h. */
export function numericJacobian(f: (v: Vec) => Vec, p: Vec, h = 1e-4): Mat2 {
  const cx = scale(1 / (2 * h), sub(f([p[0] + h, p[1]]), f([p[0] - h, p[1]])));
  const cy = scale(1 / (2 * h), sub(f([p[0], p[1] + h]), f([p[0], p[1] - h])));
  return [cx[0], cy[0], cx[1], cy[1]];
}

/** The gradient of a scalar function by central differences. */
export function numericGradient(L: (v: Vec) => number, p: Vec, h = CHECK_H): Vec {
  return [(L([p[0] + h, p[1]]) - L([p[0] - h, p[1]])) / (2 * h), (L([p[0], p[1] + h]) - L([p[0], p[1] - h])) / (2 * h)];
}

/** The one-sided difference quotient along input j: (F(p + h·eⱼ) − F(p)) / h. */
export function forwardColumn(m: PlaneMap, p: Vec, j: 0 | 1, h: number): Vec {
  const step: Vec = j === 0 ? [h, 0] : [0, h];
  return scale(1 / h, sub(m.f(add(p, step)), m.f(p)));
}

const SIDE = 12;
/** The boundary of the unit square [0, 1]², anticlockwise from its corner (0, 0), SIDE points a side (corners included). */
export const UNIT_RING: readonly Vec[] = (() => {
  const corners: Vec[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const out: Vec[] = [];
  corners.forEach((a, k) => {
    const b = corners[(k + 1) % 4];
    for (let i = 0; i < SIDE; i++) out.push([a[0] + ((b[0] - a[0]) * i) / SIDE, a[1] + ((b[1] - a[1]) * i) / SIDE]);
  });
  return out;
})();

/** Where F sends the point of the square at p with side s that sits at u in the unit square. */
const imageAt = (m: PlaneMap, p: Vec, s: number, u: Vec) => m.f([p[0] + s * u[0], p[1] + s * u[1]]);
/** The linear guess at the same point: F(p) + J·(s·u). */
const linearAt = (m: PlaneMap, p: Vec, s: number, u: Vec, J = m.jac(p), Fp = m.f(p)) => add(Fp, apply(J, scale(s, u)));

/**
 * The biggest gap between the square's true image and the linear guess
 * F(p) + J·(v − p), over matching points of their outlines, for the square
 * with corner p and side s.
 */
export function linearGap(m: PlaneMap, p: Vec, s: number): number {
  const J = m.jac(p);
  const Fp = m.f(p);
  let worst = 0;
  for (const u of UNIT_RING) {
    const e = imageAt(m, p, s, u);
    const l = linearAt(m, p, s, u, J, Fp);
    worst = Math.max(worst, Math.hypot(e[0] - l[0], e[1] - l[1]));
  }
  return worst;
}

/** The gap relative to the square's size: it shrinks in proportion to s. */
export const relativeGap = (m: PlaneMap, p: Vec, s: number) => linearGap(m, p, s) / s;

/** Signed area of a polygon (shoelace), positive when anticlockwise. */
export function signedArea(points: readonly Vec[]): number {
  let a = 0;
  points.forEach((q, i) => {
    const r = points[(i + 1) % points.length];
    a += q[0] * r[1] - r[0] * q[1];
  });
  return a / 2;
}

/** The signed area of the image of the square at p with side s, over the square's area: det J as s → 0. */
export const areaScale = (m: PlaneMap, p: Vec, s: number) => signedArea(UNIT_RING.map((u) => imageAt(m, p, s, u))) / (s * s);

/** The loss of the chain story: x → u = F(x) → v = W·u → L = ½|v − t|². */
export function chainLoss(m: PlaneMap, x: Vec): number {
  const v = apply(CHAIN_W, m.f(x));
  return ((v[0] - CHAIN_T[0]) ** 2 + (v[1] - CHAIN_T[1]) ** 2) / 2;
}

/** Every number of the chain story: forward values, the rows of the backward pass and the nudged check. */
export function chainNumbers(m: PlaneMap, x: Vec) {
  const u = m.f(x);
  const v = apply(CHAIN_W, u);
  const L = chainLoss(m, x);
  const gv = sub(v, CHAIN_T);
  const gu = vjp(gv, CHAIN_W);
  const J = m.jac(x);
  const gx = vjp(gu, J);
  return { u, v, L, gv, gu, J, gx, numeric: numericGradient((y) => chainLoss(m, y), x) };
}

/**
 * Multiplications for the gradient through `layers` Jacobians, each n × n:
 * a row times each in turn (n² each), against multiplying the matrices
 * together first (n³ each) and then the row.
 */
export const chainCost = (n: number, layers: number) => ({ rowByRow: layers * n * n, matricesFirst: (layers - 1) * n ** 3 + n * n });

// ───────────────────────────── drawing ─────────────────────────────

const r2 = (v: Vec): Vec => [round(v[0]), round(v[1])];
/** A number in a product, bracketed when negative: (−1)·1. */
const par = (x: number, d = 2) => (round(x, d) < 0 ? `(${fmt(x, d)})` : fmt(x, d));
/** Whole numbers with thousands separators, the same in every engine. */
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const row = (g: Vec, d = 2) => `[${fmt(g[0], d)}, ${fmt(g[1], d)}]`;
/** Fallback wrong answers one either side, for when the usual slips all coincide (every gradient 0 at a minimum). */
const near = (x: number) => [fmt(x + 1), fmt(x - 1)];
const matText = (J: Mat2, d = 2) => `[[${fmt(J[0], d)}, ${fmt(J[1], d)}], [${fmt(J[2], d)}, ${fmt(J[3], d)}]]`;

function matrixPart(id: string, name: string, label: string, m: Mat2, digits = 2, toned = true): PlotPart {
  const [a, b, c, d] = m.map((x) => fmt(x, digits));
  return { kind: 'matrix', id, name, label, cols: [{ values: [a, c], ...(toned && { tone: 1 as const }) }, { values: [b, d], ...(toned && { tone: 2 as const }) }] };
}

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });

const GRID_SAMPLES = 24;

/** The input grid lines, straight (`in`) or moved by F (`out`), as faint paths keyed by line. */
function gridShapes(m: PlaneMap, side: 'in' | 'out'): Shape[] {
  const key = `${m.id}:${side}`;
  const known = gridCache.get(key);
  if (known) return known;
  const { as, bs, aRange, bRange } = m.grid;
  const along = (from: Vec, to: Vec): Vec[] =>
    Array.from({ length: GRID_SAMPLES + 1 }, (_, k) => {
      const q: Vec = [from[0] + ((to[0] - from[0]) * k) / GRID_SAMPLES, from[1] + ((to[1] - from[1]) * k) / GRID_SAMPLES];
      return r2(side === 'in' ? q : m.f(q));
    });
  const shapes: Shape[] = [
    ...as.map((a, i): Shape => ({ kind: 'path', id: `ga${i}`, points: along([a, bRange[0]], [a, bRange[1]]), faint: true })),
    ...bs.map((b, i): Shape => ({ kind: 'path', id: `gb${i}`, points: along([aRange[0], b], [aRange[1], b]), faint: true })),
  ];
  gridCache.set(key, shapes);
  return shapes;
}
const gridCache = new Map<string, Shape[]>();

/** The input grid lines `gridShapes` draws, as (from, to) segments in the input plane: for tests. */
export function gridLines(m: PlaneMap): { id: string; from: Vec; to: Vec }[] {
  const { as, bs, aRange, bRange } = m.grid;
  return [...as.map((a, i) => ({ id: `ga${i}`, from: [a, bRange[0]] as Vec, to: [a, bRange[1]] as Vec })), ...bs.map((b, i) => ({ id: `gb${i}`, from: [aRange[0], b] as Vec, to: [aRange[1], b] as Vec }))];
}

const handleAt = (m: PlaneMap, p: Vec): Handle => ({ id: 'p', at: p, label: 'p', mark: 'key', step: 0.5, min: m.min, max: m.max });

function inPlane(m: PlaneMap, shapes: Shape[], handles: Handle[], label = `Input plane: (${m.names[0]}, ${m.names[1]})`): PlanePart {
  return { kind: 'plane', id: 'plane', label, x: { ...m.input.x, label: m.names[0] }, y: { ...m.input.y, label: m.names[1] }, equal: true, shapes: [...gridShapes(m, 'in'), ...shapes], handles };
}

function outPlane(m: PlaneMap, shapes: Shape[], label = 'Output plane: where F sends the grid'): PlanePart {
  return { kind: 'plane', id: 'out', label, x: { ...m.output.x, label: 'F₁' }, y: { ...m.output.y, label: 'F₂' }, equal: true, shapes: [...gridShapes(m, 'out'), ...shapes], handles: [] };
}

const pPoint = (p: Vec, label = 'p'): Shape => ({ kind: 'point', id: 'p', at: p, mark: 'key', label });
const fpPoint = (m: PlaneMap, p: Vec, label = 'F(p)'): Shape => ({ kind: 'point', id: 'Fp', at: r2(m.f(p)), mark: 'key', label });

/** The square at `at` with side s and its two sides s·î, s·ĵ, in the input plane. */
function squareShapes(at: Vec, s: number, prefix = ''): Shape[] {
  return [
    { kind: 'path', id: `${prefix}sq`, points: UNIT_RING.filter((_, i) => i % SIDE === 0).map((u) => r2(add(at, scale(s, u)))), closed: true, fill: true, mark: 'compare' },
    { kind: 'vector', id: `${prefix}si`, from: at, to: r2(add(at, [s, 0])), tone: 1 },
    { kind: 'vector', id: `${prefix}sj`, from: at, to: r2(add(at, [0, s])), tone: 2 },
  ];
}

/** The square's true image (curved) and, optionally, the linear guess (a dashed parallelogram), in the output plane. */
function imageShapes(m: PlaneMap, at: Vec, s: number, withGuess: boolean, prefix = ''): Shape[] {
  const J = m.jac(at);
  const corners: Vec[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  return [
    { kind: 'path', id: `${prefix}img`, points: UNIT_RING.map((u) => r2(imageAt(m, at, s, u))), closed: true, fill: true, mark: 'compare' },
    ...(withGuess ? [{ kind: 'path' as const, id: `${prefix}lin`, points: corners.map((u) => r2(linearAt(m, at, s, u, J))), closed: true, dashed: true, mark: 'found' as const }] : []),
  ];
}

/** The magnified view: offsets from F(p) divided by s, so the linear guess is always the parallelogram on J's columns. */
const magnified = (m: PlaneMap, p: Vec, s: number, u: Vec): Vec => scale(1 / s, sub(imageAt(m, p, s, u), m.f(p)));

/** A fixed box for the magnified plane that holds every size's picture. */
function zoomBox(m: PlaneMap, p: Vec): { x: Axis; y: Axis } {
  const J = m.jac(p);
  const pts: Vec[] = [[0, 0]];
  for (const s of SIZES) for (const u of UNIT_RING) pts.push(magnified(m, p, s, u), apply(J, u));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 0.35;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const down = (v: number) => Math.floor(v * 2) / 2;
  const up = (v: number) => Math.ceil(v * 2) / 2;
  return { x: { min: down(cx - half), max: up(cx + half) }, y: { min: down(cy - half), max: up(cy + half) } };
}

function zoomPlane(m: PlaneMap, p: Vec, s: number, box: { x: Axis; y: Axis }, o: { labels: [string, string]; arrows: boolean }): PlanePart {
  const J = m.jac(p);
  const corners: Vec[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const centre = apply(J, [0.5, 0.5]);
  const span = Math.max(box.x.max - box.x.min, box.y.max - box.y.min);
  /** A label just outside a corner of the picture. */
  const outside = (q: Vec): Vec => {
    const d = sub(q, centre);
    const len = Math.hypot(d[0], d[1]) || 1;
    return r2(add(q, scale((0.09 * span) / len, d)));
  };
  const shapes: Shape[] = [
    { kind: 'path', id: 'img', points: UNIT_RING.map((u) => r2(magnified(m, p, s, u))), closed: true, fill: true, mark: 'compare' },
    { kind: 'path', id: 'lin', points: corners.map((u) => r2(apply(J, u))), closed: true, dashed: true, mark: 'found' },
    ...(o.arrows
      ? [
          { kind: 'vector' as const, id: 'c1', from: [0, 0] as Vec, to: r2(col1(J)), tone: 1 as const, label: 'J·î' },
          { kind: 'vector' as const, id: 'c2', from: [0, 0] as Vec, to: r2(col2(J)), tone: 2 as const, label: 'J·ĵ' },
        ]
      : []),
    { kind: 'label', id: 'la', at: outside(magnified(m, p, s, [1, 1])), text: o.labels[0] },
    { kind: 'label', id: 'lb', at: outside(apply(J, [1, -0.25])), text: o.labels[1] },
  ];
  return {
    kind: 'plane',
    id: 'zoom',
    label: `Around F(p), magnified ×${fmt(1 / s)}`,
    x: { ...box.x, label: 'offset ÷ size' },
    y: box.y,
    equal: true,
    shapes,
    handles: [],
  };
}

// ───────────────────────────── 1. zoom in until F is a matrix ─────────────────────────────

function* zoom(m: PlaneMap, p: Vec): Generator<Frame<PlotState>> {
  const J = m.jac(p);
  const Fp = m.f(p);
  const box = zoomBox(m, p);
  const [a, b] = m.names;
  const handles = [handleAt(m, p)];
  const vars = { p: fmtVec(p) };
  const gaps = SIZES.map((s) => linearGap(m, p, s));
  const ratios = SIZES.map((s, i) => gaps[i] / s);
  const Jpanel = matrixPart('J', 'J', 'J at p', J);
  const gapReadouts = (i: number): PlotPart =>
    readouts([
      { id: 'size', label: 'square size s', value: fmt(SIZES[i]) },
      { id: 'gap', label: 'biggest gap', value: fmt(gaps[i], 3) },
      { id: 'ratio', label: 'gap ÷ s', value: fmt(ratios[i], 3), mark: 'found' },
    ]);
  const sized = (i: number, labels: [string, string], arrows: boolean): PlotPart[] => {
    const s = SIZES[i];
    return [
      inPlane(m, [...squareShapes(p, s), pPoint(p)], handles),
      outPlane(m, [...imageShapes(m, p, s, true), fpPoint(m, p)]),
      zoomPlane(m, p, s, box, { labels, arrows }),
    ];
  };

  yield plotFrame([inPlane(m, [pPoint(p)], handles), outPlane(m, [fpPoint(m, p)])], {
    line: 0,
    note: `${m.formula} moves every point of the plane. On the left is the input grid; on the right, where F sends it: lines that went in straight and evenly spaced come out curved.`,
    vars,
    checkpoint: askInOrder('Is there one matrix A with F(v) = A·v for every point v?', ['Yes', 'No'], 'No'),
  });

  yield plotFrame([...sized(0, ['A', 'B'], false), readouts([{ id: 'size', label: 'square size s', value: fmt(SIZES[0]) }])], {
    line: 1,
    note: `No: a matrix keeps lines straight and evenly spaced, and F bends them. So zoom in on one point instead: the square with corner p = ${fmtVec(p)} and sides ${fmt(SIZES[0])}·î and ${fmt(SIZES[0])}·ĵ lands on a patch around F(p) = ${fmtVec(Fp)}. The third picture magnifies it, with a second outline drawn over it.`,
    vars: { ...vars, s: SIZES[0] },
    checkpoint: askInOrder('One outline is the true image F(square); the other is F(p) + J·(v − p), what a single matrix J would do. Which is the matrix’s?', ['A', 'B'], 'B'),
  });

  yield plotFrame([...sized(0, ['F(square)', 'J·square'], true), Jpanel, gapReadouts(0)], {
    line: 2,
    note: `B: a matrix turns a square into a parallelogram, here with sides J·(s·î) and J·(s·ĵ), s times J's two columns. J holds F's partial slopes at p: J = [[${m.entries[0]}, ${m.entries[1]}], [${m.entries[2]}, ${m.entries[3]}]] = ${matText(J)}. The outlines are at most ${fmt(gaps[0], 3)} apart, ${fmt(ratios[0], 3)} of the square's size.`,
    vars: { ...vars, s: SIZES[0], gap: round(gaps[0], 4) },
    checkpoint: askInOrder(`Halve the square, to size ${fmt(SIZES[1])}. What happens to gap ÷ s?`, ['It about doubles', 'It stays about the same', 'It about halves', 'It about quarters'], 'It about halves'),
  });

  yield plotFrame([...sized(1, ['F(square)', 'J·square'], true), Jpanel, gapReadouts(1)], {
    line: 3,
    note: `Gap ÷ s went from ${fmt(ratios[0], 3)} to ${fmt(ratios[1], 3)}: about half. The gap itself went from ${fmt(gaps[0], 3)} to ${fmt(gaps[1], 3)}, about a quarter: near p the error of the linear guess grows like s², so next to the square's size it fades in proportion.`,
    vars: { ...vars, s: SIZES[1], gap: round(gaps[1], 4) },
    checkpoint: ask(`Halve again, to size ${fmt(SIZES[2])}. About what will the biggest gap itself be?`, fmt(gaps[2], 3), [fmt(gaps[1] / 2, 3), fmt(gaps[1], 3), fmt(gaps[1] / 8, 3)]),
  });

  yield plotFrame([...sized(2, ['F(square)', 'J·square'], true), Jpanel, gapReadouts(2)], {
    line: 3,
    note: `${fmt(gaps[2], 3)}: about a quarter again, while the square only halved. Magnified ×${fmt(1 / SIZES[2])}, the curved patch hugs the parallelogram ever more closely.`,
    vars: { ...vars, s: SIZES[2], gap: round(gaps[2], 4) },
  });

  yield plotFrame([...sized(3, ['F(square)', 'J·square'], true), Jpanel, gapReadouts(3)], {
    line: 3,
    note: `At size ${fmt(SIZES[3])}, gap ÷ s is ${fmt(ratios[3], 3)}: magnified ×${fmt(1 / SIZES[3])}, the true image and the parallelogram are almost one shape. Zoomed in far enough, F is the matrix J: F(v) ≈ F(p) + J·(v − p) near p.`,
    vars: { ...vars, s: SIZES[3], gap: round(gaps[3], 4) },
  });

  yield plotFrame([inPlane(m, [pPoint(p)], handles), outPlane(m, [fpPoint(m, p)]), Jpanel, readouts([{ id: 'det', label: 'det J', value: fmt(det2(J)) }])], {
    line: 4,
    note: `J = [[∂F₁/∂${a}, ∂F₁/∂${b}], [∂F₂/∂${a}, ∂F₂/∂${b}]]: row i is output i and column j is input j. Here J = [[${m.entries[0]}, ${m.entries[1]}], [${m.entries[2]}, ${m.entries[3]}]] = ${matText(J)} at p, and it depends on where you are: drag p and a different matrix fits each spot.`,
    vars,
  });
}

// ───────────────────────────── 2. the columns, and det J ─────────────────────────────

function* columns(m: PlaneMap, p: Vec): Generator<Frame<PlotState>> {
  const J = m.jac(p);
  const Fp = m.f(p);
  const D = det2(J);
  const [a, b] = m.names;
  const handles = [handleAt(m, p)];
  const vars = { p: fmtVec(p) };
  const { aRange, bRange } = m.grid;
  const line = (from: Vec, to: Vec, mapped: boolean): Vec[] =>
    Array.from({ length: GRID_SAMPLES + 1 }, (_, k) => {
      const q: Vec = [from[0] + ((to[0] - from[0]) * k) / GRID_SAMPLES, from[1] + ((to[1] - from[1]) * k) / GRID_SAMPLES];
      return r2(mapped ? m.f(q) : q);
    });
  const aLine = (mapped: boolean): Shape => ({ kind: 'path', id: 'la', points: line([aRange[0], p[1]], [aRange[1], p[1]], mapped), tone: 1, label: `${b} fixed` });
  const bLine = (mapped: boolean): Shape => ({ kind: 'path', id: 'lb', points: line([p[0], bRange[0]], [p[0], bRange[1]], mapped), tone: 2, label: `${a} fixed` });
  const colArrow = (j: 0 | 1, label = `column ${j + 1}`): Shape => ({ kind: 'vector', id: `c${j + 1}`, from: r2(Fp), to: r2(add(Fp, j === 0 ? col1(J) : col2(J))), tone: j === 0 ? 1 : 2, label });
  const Jpanel = matrixPart('J', 'J', 'J from the formulas', J);

  yield plotFrame([inPlane(m, [aLine(false), bLine(false), pPoint(p)], handles), outPlane(m, [aLine(true), bLine(true), fpPoint(m, p)])], {
    line: 4,
    note: `Through p = ${fmtVec(p)}, hold ${b} fixed and slide ${a}: F(p) slides along the curve marked “${b} fixed”. Hold ${a} fixed and slide ${b}: it slides along the other curve. How fast each output changes along each curve is one entry of J.`,
    vars,
    checkpoint: m.askFormulas
      ? askInOrder(
          `Which formula is ∂F₂/∂${a} (J's bottom-left entry): how fast F's second output, ${m.outputs[1]}, changes per unit step in ${a} with ${b} held fixed?`,
          [m.entries[0], m.entries[2], m.entries[1], m.entries[3]],
          m.entries[2],
        )
      : ask(`At p, how fast does F's second output change per unit step in ${a}? (J's bottom-left entry, ∂F₂/∂${a})`, fmt(J[2]), [fmt(J[0]), fmt(J[1]), fmt(J[3]), fmt(-J[2]), '0']),
  });

  const chord = forwardColumn(m, p, 0, CHORD_H);
  yield plotFrame(
    [
      inPlane(m, [aLine(false), bLine(false), { kind: 'vector', id: 'h1', from: p, to: r2(add(p, [CHORD_H, 0])), tone: 1, label: `h = ${fmt(CHORD_H)}` }, pPoint(p)], handles),
      outPlane(m, [aLine(true), bLine(true), { kind: 'vector', id: 'q1', from: r2(Fp), to: r2(add(Fp, chord)), tone: 1, dashed: true, label: '÷ h' }, colArrow(0), fpPoint(m, p)]),
      readouts([
        { id: 'chord', label: `(F(p + h·î) − F(p)) ÷ h, h = ${fmt(CHORD_H)}`, value: fmtVec(chord, 3) },
        { id: 'col1', label: `column 1: (∂F₁/∂${a}, ∂F₂/∂${a})`, value: fmtVec(col1(J)), mark: 'found' },
      ]),
    ],
    {
      line: 5,
      note: `∂F₁/∂${a} = ${m.entries[0]} and ∂F₂/∂${a} = ${m.entries[2]}, so at p column 1 is ${fmtVec(col1(J))}: a tiny step h along ${a} moves F(p) by about h × ${fmtVec(col1(J))}, along the tangent of the “${b} fixed” curve. A real step of h = ${fmt(CHORD_H)} gives ${fmtVec(chord, 3)} per unit: ${
        Math.hypot(chord[0] - J[0], chord[1] - J[2]) < 1e-9 ? `exactly column 1, because F is linear in ${a} (that curve is straight)` : 'off, because the curve has bent away from its tangent'
      }.`,
      vars: { ...vars, h: CHORD_H },
      checkpoint: m.askFormulas
        ? askInOrder(
            `Now a tiny step along ${b}. Which formulas give column 2, (∂F₁/∂${b}, ∂F₂/∂${b})?`,
            [`(${m.entries[0]}, ${m.entries[2]})`, `(${m.entries[1]}, ${m.entries[3]})`, `(${m.entries[3]}, ${m.entries[1]})`, `(${m.entries[2]}, ${m.entries[0]})`],
            `(${m.entries[1]}, ${m.entries[3]})`,
          )
        : ask(`Now a tiny step along ${b}. Per unit step, by about which vector does F(p) move? (column 2)`, fmtVec(col2(J)), [fmtVec(col1(J)), fmtVec([J[1], J[0]]), fmtVec([J[2], J[3]]), fmtVec([0, 1])]),
    },
  );

  const measured = numericJacobian(m.f, p, CENTRAL_H);
  const worst = Math.max(...measured.map((x, i) => Math.abs(x - J[i])));
  yield plotFrame(
    [
      inPlane(m, [aLine(false), bLine(false), pPoint(p)], handles),
      outPlane(m, [aLine(true), bLine(true), colArrow(0), colArrow(1), fpPoint(m, p)]),
      matrixPart('Jnum', 'J', `J measured, h = ${fmt(CENTRAL_H)}`, measured, 4),
      Jpanel,
      readouts([{ id: 'diff', label: 'biggest difference', value: fmt(worst, 6), mark: 'found' }]),
    ],
    {
      line: 6,
      note: `Column 2 is ${fmtVec(col2(J))} (∂F₁/∂${b} = ${m.entries[1]}, ∂F₂/∂${b} = ${m.entries[3]}). To measure both columns, step h = ${fmt(CENTRAL_H)} each way: (F(p + h·eⱼ) − F(p − h·eⱼ)) ÷ 2h. The measured J matches the formulas ${m.id === 'bend' && round(worst, 6) === 0 ? 'exactly: F is built from squares, and for those a step each way cancels the bend' : `to within ${fmt(worst, 6)}`}.`,
      vars: { ...vars, h: CENTRAL_H },
      checkpoint: ask('What is det J at p?', fmt(D), [fmt(J[0] * J[3] + J[1] * J[2]), fmt(J[0] + J[3]), fmt(-D), fmt(J[0] * J[1] - J[2] * J[3])]),
    },
  );

  const q = m.flat(p);
  const Jq = m.jac(q);
  const qText = fmtVec(q);
  yield plotFrame(
    [
      inPlane(m, [...squareShapes(p, DET_SIZE), pPoint(p)], handles),
      outPlane(m, [...imageShapes(m, p, DET_SIZE, true), colArrow(0), colArrow(1), fpPoint(m, p)]),
      Jpanel,
      readouts([
        { id: 'det', label: 'det J', value: fmt(D), mark: 'found' },
        { id: 'area', label: 'tiny square: image area ÷ area', value: fmt(areaScale(m, p, 0.001), 3) },
      ]),
    ],
    {
      line: 7,
      note: `det J = ${par(J[0])}·${par(J[3])} − ${par(J[1])}·${par(J[2])} = ${fmt(D)} (in general ${m.detText}). As for any matrix, it is the area scale: a square of side ${fmt(DET_SIZE)} at p comes out with ${fmt(areaScale(m, p, DET_SIZE), 3)} times its area, and a tiny one with ${fmt(areaScale(m, p, 0.001), 3)} times.`,
      vars,
      checkpoint: ask(`At q = ${qText}, what is det J?`, fmt(det2(Jq)), [fmt(D), '1', '2', '−1']),
    },
  );

  yield plotFrame(
    [
      inPlane(m, [...squareShapes(q, DET_SIZE, 'q'), { kind: 'point', id: 'q', at: q, mark: 'reject', label: 'q' }, pPoint(p)], handles),
      outPlane(m, [...imageShapes(m, q, DET_SIZE, false, 'q'), { kind: 'point', id: 'Fq', at: r2(m.f(q)), mark: 'reject', label: 'F(q)' }, fpPoint(m, p)]),
      matrixPart('Jq', 'J', 'J at q', Jq),
      readouts([{ id: 'det', label: 'det J at q', value: fmt(det2(Jq)), mark: 'reject' }]),
    ],
    {
      line: 7,
      note: `0: at q, J = ${matText(Jq)}, and its columns ${fmtVec(col1(Jq))} and ${fmtVec(col2(Jq))} lie on one line, so a tiny square near q is squashed flat (${m.id === 'polar' ? 'every angle at r = 0 lands on the origin' : 'a step along x and a step along y move F the opposite ways'}). Where det J = 0 F can't be undone near that point; where it is negative, squares come out flipped.`,
      vars: { ...vars, q: qText },
    },
  );
}

// ───────────────────────────── 3. backprop: a row vector times each Jacobian ─────────────────────────────

const contourCache = new Map<MapId, ContourShape>();

/** Contours of the chain's loss over the input plane, computed once per map (the view memoises on them). */
function lossContours(m: PlaneMap): ContourShape {
  let shape = contourCache.get(m.id);
  if (!shape) {
    const L = (x: number, y: number) => chainLoss(m, [x, y]);
    const box = m.input;
    const samples: number[] = [];
    for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) samples.push(L(box.x.min + ((box.x.max - box.x.min) * i) / 30, box.y.min + ((box.y.max - box.y.min) * j) / 30));
    samples.sort((x, y) => x - y);
    const levels = contours(L, box, logLevels(samples[0], samples[Math.floor(samples.length * 0.8)], 10), 48).map((lv) => ({
      value: lv.value,
      segments: lv.segments.map(([s, t]) => [r2(s), r2(t)] as const),
    }));
    shape = { kind: 'contours', id: 'contours', levels };
    contourCache.set(m.id, shape);
  }
  return shape;
}

function chainNetwork(n: ReturnType<typeof chainNumbers>, x: Vec, o: { graded: number; focus: string | null }): NetworkPart {
  const ids = ['x', 'u', 'v', 'L'];
  const at = layered(ids.map((id) => [id]), { dx: 150, dy: 60 });
  const values: Record<string, string> = { x: fmtVec(x), u: fmtVec(n.u), v: fmtVec(n.v), L: fmt(n.L) };
  const grads: Record<string, string> = { L: '1', v: row(n.gv), u: row(n.gu), x: row(n.gx) };
  // Gradients arrive from the loss backwards: `graded` counts how many nodes have one, from L.
  const known = new Set(ids.slice(ids.length - o.graded));
  const nodes: NetNode[] = ids.map((id) => ({
    id,
    ...at.get(id)!,
    kind: 'value',
    label: id,
    value: values[id],
    grad: o.graded > 0 ? (known.has(id) ? `grad ${grads[id]}` : 'grad ?') : undefined,
    mark: id === o.focus ? 'key' : known.has(id) ? 'found' : null,
  }));
  const edges: NetEdge[] = [
    { id: 'x>u', from: 'x', to: 'u', label: 'F' },
    { id: 'u>v', from: 'u', to: 'v', label: 'W·' },
    { id: 'v>L', from: 'v', to: 'L', label: '½|v − t|²' },
  ];
  return { kind: 'network', id: 'graph', label: o.graded > 0 ? 'Backward: gradients flow right to left' : 'Forward: values flow left to right', nodes, edges };
}

function* chain(m: PlaneMap, x: Vec): Generator<Frame<PlotState>> {
  const n = chainNumbers(m, x);
  const { gv, gu, J, gx, numeric } = n;
  const W = CHAIN_W;
  const handles = [handleAt(m, x)];
  const vars = { x: fmtVec(x) };
  const len = Math.hypot(gx[0], gx[1]);
  const uphill: Shape[] = len > 1e-9 ? [{ kind: 'vector', id: 'grad', from: x, to: r2(add(x, scale(0.9 / len, gx))), mark: 'found', label: 'uphill' }] : [];
  const planes = (withGrad: boolean): PlotPart[] => [
    inPlane(m, [lossContours(m), ...(withGrad ? uphill : []), pPoint(x, 'x')], handles, `Input x, with the contours of L`),
    outPlane(m, [{ kind: 'point', id: 'u', at: r2(n.u), mark: 'key', label: 'u = F(x)' }], 'u = F(x) on the moved grid'),
  ];
  const Wpanel = matrixPart('W', 'W', 'The layer W', W, 2, false);
  const Jpanel = matrixPart('J', 'J', 'J_F at x', J);
  const fwd = { id: 'L', label: 'L = ½|v − t|²', value: fmt(n.L) };
  const cost2 = chainCost(2, 2);
  const cost1000 = chainCost(1000, 2);

  yield plotFrame([...planes(false), chainNetwork(n, x, { graded: 0, focus: null }), Wpanel, readouts([{ id: 't', label: 'target t', value: fmtVec(CHAIN_T) }, fwd])], {
    line: 8,
    note: `Forward: x = ${fmtVec(x)} goes through F to u = ${fmtVec(n.u)}, through a linear layer W to v = W·u = ${fmtVec(n.v)}, and the loss L = ½|v − t|² measures how far v is from the target t = ${fmtVec(CHAIN_T)}: L = ${fmt(n.L)}. Backward, gradients are rows, written in square brackets.`,
    vars,
    checkpoint: ask('Backward starts at the loss. What is ∂L/∂v, as a row?', row(gv), [row(scale(-1, gv)), row(n.v), row(scale(2, gv))]),
  });

  yield plotFrame([...planes(false), chainNetwork(n, x, { graded: 2, focus: 'v' }), Wpanel, readouts([fwd, { id: 'gv', label: '∂L/∂v', value: row(gv), mark: 'found' }])], {
    line: 9,
    note: `∂L/∂v = (v − t)ᵀ = ${row(gv)}: each entry says how fast L changes when that entry of v is nudged. One entry per input of L, in a row.`,
    vars: { ...vars, '∂L/∂v': row(gv) },
    checkpoint: ask(`Next, ∂L/∂u = ${row(gv)}·W. What is its first entry?`, fmt(gu[0]), [fmt(gv[0] * W[0] + gv[1] * W[1]), fmt(gu[1]), fmt(gv[0]), ...near(gu[0])]),
  });

  yield plotFrame(
    [...planes(false), chainNetwork(n, x, { graded: 3, focus: 'u' }), Wpanel, readouts([fwd, { id: 'gv', label: '∂L/∂v', value: row(gv) }, { id: 'gu', label: '∂L/∂u = ∂L/∂v · W', value: row(gu), mark: 'found' }])],
    {
      line: 10,
      note: `W is linear, so its Jacobian is W itself. Row times matrix, one column at a time: ${row(gv)}·(${fmt(W[0])}, ${fmt(W[2])}) = ${par(gv[0])}·${par(W[0])} + ${par(gv[1])}·${par(W[2])} = ${fmt(gu[0])}, and ${row(gv)}·(${fmt(W[1])}, ${fmt(W[3])}) = ${fmt(gu[1])}. So ∂L/∂u = ${row(gu)}.`,
      vars: { ...vars, '∂L/∂u': row(gu) },
      checkpoint: ask(`Then ∂L/∂x = ${row(gu)}·J_F(x), with J_F(x) = ${matText(J)}. What is its second entry?`, fmt(gx[1]), [fmt(gu[0] * J[2] + gu[1] * J[3]), fmt(gx[0]), fmt(gu[1]), ...near(gx[1])]),
    },
  );

  yield plotFrame(
    [
      ...planes(true),
      chainNetwork(n, x, { graded: 4, focus: 'x' }),
      Jpanel,
      readouts([fwd, { id: 'gu', label: '∂L/∂u', value: row(gu) }, { id: 'gx', label: '∂L/∂x = ∂L/∂u · J_F', value: row(gx), mark: 'found' }]),
    ],
    {
      line: 11,
      note: `${row(gu)}·(${fmt(J[0])}, ${fmt(J[2])}) = ${fmt(gx[0])} and ${row(gu)}·(${fmt(J[1])}, ${fmt(J[3])}) = ${par(gu[0])}·${par(J[1])} + ${par(gu[1])}·${par(J[3])} = ${fmt(gx[1])}: ∂L/∂x = ${row(gx)}. On the left it points uphill, across L's contours at a right angle.`,
      vars: { ...vars, '∂L/∂x': row(gx) },
      checkpoint: askInOrder(
        'With layers 1000 numbers wide, which way gets ∂L/∂x with fewer multiplications?',
        ['The row times W, then that row times J_F', 'W times J_F first, then the row times that'],
        'The row times W, then that row times J_F',
      ),
    },
  );

  yield plotFrame(
    [
      ...planes(true),
      chainNetwork(n, x, { graded: 4, focus: null }),
      Wpanel,
      Jpanel,
      readouts([
        { id: 'rows', label: 'a row each time (2 wide)', value: `${cost2.rowByRow} multiplications`, mark: 'found' },
        { id: 'mats', label: 'W·J_F first (2 wide)', value: `${cost2.matricesFirst} multiplications` },
        { id: 'rows1000', label: 'a row each time (1000 wide)', value: thousands(cost1000.rowByRow) },
        { id: 'mats1000', label: 'W·J_F first (1000 wide)', value: thousands(cost1000.matricesFirst) },
      ]),
    ],
    {
      line: 12,
      note: `A row times an n × n matrix takes n² multiplications; a matrix times a matrix takes n³. Two wide, that is ${cost2.rowByRow} against ${cost2.matricesFirst}; a thousand wide, two million against a billion. So backprop starts at the loss and carries one row backwards, never building a whole Jacobian product.`,
      vars,
      checkpoint: ask(
        `Check by nudging: move x's first coordinate by ±${CHECK_H} and recompute L. What is (L(x + h·î) − L(x − h·î)) ÷ 2h, to two decimals?`,
        fmt(numeric[0]),
        [fmt(gx[1]), fmt(gu[0]), fmt(-numeric[0]), fmt(n.L), ...near(numeric[0])],
      ),
    },
  );

  yield plotFrame(
    [
      ...planes(true),
      chainNetwork(n, x, { graded: 4, focus: 'x' }),
      Jpanel,
      readouts([
        { id: 'gx', label: '∂L/∂x, backprop', value: row(gx, 4) },
        { id: 'numeric', label: `∂L/∂x, nudging by ±${CHECK_H}`, value: row(numeric, 4), mark: 'found' },
      ]),
    ],
    {
      line: 13,
      note: `Nudging each coordinate of x by ±${CHECK_H} gives ${row(numeric, 4)}, the same as backprop's ${row(gx, 4)}. Backprop gets the whole gradient in one backward pass; nudging needs two runs of the network per input, which is why it is only used to check.`,
      vars: { ...vars, '∂L/∂x': row(gx) },
    },
  );
}

function* run(input: JacobianInput): Generator<Frame<PlotState>> {
  const m = MAPS[input.map];
  if (input.story === 'zoom') yield* zoom(m, input.p);
  else if (input.story === 'columns') yield* columns(m, input.p);
  else yield* chain(m, input.p);
}

// ───────────────────────────── custom text and dragging ─────────────────────────────

const onHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const allowed = (m: PlaneMap, p: Vec) => p.every((v, k) => onHalf(v) && v >= m.min[k] && v <= m.max[k]);

export function parseJacobian(text: string): { value: JacobianInput } | { error: string } {
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const story = STORIES.find((s) => words.includes(s));
  if (!story) return { error: 'Start with a story: zoom, columns or chain.' };
  const map = MAP_IDS.find((id) => words.includes(id));
  if (!map) return { error: 'Then a map: bend or polar.' };
  const xs = numbersIn(text);
  const m = MAPS[map];
  if (xs.length !== 2) return { error: `Then the point p, e.g. ${story} ${map} (${m.max[0] / 2}, ${m.max[1] / 2}).` };
  const p: Vec = [xs[0] + 0, xs[1] + 0];
  if (!allowed(m, p)) return { error: `For ${map}, p takes halves with ${m.names[0]} from ${m.min[0]} to ${m.max[0]} and ${m.names[1]} from ${m.min[1]} to ${m.max[1]}.` };
  return { value: { story, map, p } };
}

const format = ({ story, map, p }: JacobianInput) => `${story} ${map} (${plain(p[0])}, ${plain(p[1])})`;

export function dragJacobian(input: JacobianInput, id: string, to: Vec): JacobianInput {
  if (id !== 'p') return input;
  const m = MAPS[input.map];
  const snapTo = (v: number, k: number) => Math.min(m.max[k], Math.max(m.min[k], Math.round(v * 2) / 2)) + 0;
  return { ...input, p: [snapTo(to[0], 0), snapTo(to[1], 1)] };
}

const example = (id: string, label: string, input: JacobianInput) => ({ id, label, make: () => input, sized: false });

export const jacobian = defineAlgorithm<JacobianInput, PlotState>({
  kind: 'algorithm',
  slug: 'jacobian',
  view: 'plot',
  input: {
    examples: [
      example('zoom', 'Zoom in until F is a matrix', { story: 'zoom', map: 'bend', p: [1, 1] }),
      example('columns', 'J’s columns and det J', { story: 'columns', map: 'bend', p: [1, 1] }),
      example('polar', 'Polar coordinates: det J = r', { story: 'columns', map: 'polar', p: [2, 0.5] }),
      example('chain', 'Backprop: a row times each Jacobian', { story: 'chain', map: 'bend', p: [2, 2] }),
    ],
    custom: {
      label: 'Story (zoom, columns, chain), map (bend, polar) and the point p (halves)',
      placeholder: 'e.g. zoom bend (1, 1)',
      parse: parseJacobian,
      format,
    },
    drag: dragJacobian,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The grid, and where F sends it' },
    { mark: 'key', label: 'The point p (or x) and F(p)' },
    { mark: 'compare', label: 'The little square and its true image' },
    { mark: 'found', label: 'The linear guess F(p) + J·(v − p), and the answers found' },
    { tone: 1, label: 'Steps along the first input, and J’s column 1' },
    { tone: 2, label: 'Steps along the second input, and J’s column 2' },
    { mark: 'reject', label: 'A point where det J = 0' },
  ],
  run,
  content: {
    idea: 'Zoom in far enough on a smooth map from the plane to the plane and it looks like a matrix: its Jacobian J. Row i of J is output i, column j is input j, and J[i][j] = ∂Fᵢ/∂xⱼ, so column j is where a tiny step along input j goes, per unit step. Backprop is a chain of these: a row vector, the gradient so far, times one Jacobian after another from the loss backwards.',
    invariant: 'F(v) ≈ F(p) + J·(v − p) near p, with an error that shrinks like |v − p|², so the gap relative to a square’s size halves when the square does. det J is the area scale near p. ∂L/∂x = ∂L/∂u · J_F: a vector–Jacobian product.',
    whenToUse: 'Whenever a map has several inputs and several outputs: linearising a model around a point, changing variables in an area or probability (more on this with integrals), Newton’s method in several variables, and every layer of backpropagation, which only ever needs a row vector times a Jacobian.',
    traits: [
      { label: 'Rows are outputs, columns are inputs', good: null },
      { label: 'Exact only in the limit: a local map', good: null },
      { label: 'Backprop: n² per layer, never n³', good: true },
    ],
    experiments: [
      { example: 'zoom', prompt: 'Drag p to the origin: J becomes the identity there, and the square barely bends. Then drag it to a corner.' },
      { example: 'columns', prompt: 'Drag p along the diagonal from (−2, 2) to (2, −2) and watch det J = 1 + xy/4 rise and fall back to 0.' },
      { example: 'polar', prompt: 'Drag p inwards: det J = r, so squares near the origin come out smaller.' },
      { example: 'chain', prompt: 'Drag x until ∂L/∂x is close to [0, 0]: the uphill arrow vanishes where L has a flat spot.' },
    ],
  },
});

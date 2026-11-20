import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Axis, Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Derivative rules (B4 of the math and ML path). Three stories:
// - product: the product rule as a rectangle f(a) × g(a) that grows by two
//   strips and a corner when a is nudged; the corner vanishes as h shrinks,
//   so (fg)′ = f′g + fg′, never the tempting f′·g′.
// - gallery: six functions with their rules (x³, eˣ, ln x, σ, tanh, ReLU),
//   each confirmed by a measured central secant. σ′ = σ(1 − σ) and
//   tanh′ = 1 − tanh² are stated and measured here; the chain rule that
//   derives them comes in the next concept.
// - numeric: measuring the slope of x³ in floating point, forward against
//   central differences, for h = 10⁻¹ … 10⁻¹⁵. The errors fall like h and h²,
//   then rounding noise takes over. Only + − × ÷ is used for the estimates,
//   so every run gives the same numbers in Node and the browser.

// ───────────────────────────── the maths ─────────────────────────────

/** The forward difference (f(a + h) − f(a)) / h. */
export const forwardDiff = (f: (x: number) => number, a: number, h: number) => (f(a + h) - f(a)) / h;
/** The central difference (f(a + h) − f(a − h)) / (2h). */
export const centralDiff = (f: (x: number) => number, a: number, h: number) => (f(a + h) - f(a - h)) / (2 * h);

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const dSigmoid = (x: number) => sigmoid(x) * (1 - sigmoid(x));
export const dTanh = (x: number) => 1 - Math.tanh(x) ** 2;
export const relu = (x: number) => Math.max(0, x);
/** ReLU′: 0 left of 0, 1 right of 0, and none at the corner. */
export const dRelu = (x: number): number | null => (x === 0 ? null : x < 0 ? 0 : 1);

// The product story's two functions: whole numbers at whole a.
export const productF = (x: number) => x + 1;
/** f′ = 1 at every x. */
export const productDf: (x: number) => number = () => 1;
export const productG = (x: number) => x * x;
export const productDg = (x: number) => 2 * x;
export const product = (x: number) => productF(x) * productG(x);
/** The product rule: (fg)′ = f′·g + f·g′. */
export const productRule = (a: number) => productDf(a) * productG(a) + productF(a) * productDg(a);
/** The tempting wrong guess (fg)′ = f′·g′. */
export const wrongGuess = (a: number) => productDf(a) * productDg(a);

/**
 * How the rectangle f × g grows when a moves to a + h: a strip g·Δf along the
 * top, a strip f·Δg down the right side, and the corner Δf·Δg. The three add
 * up to the change in the product exactly.
 */
export function productStrips(a: number, h: number) {
  const f = productF(a);
  const g = productG(a);
  const df = productF(a + h) - f;
  const dg = productG(a + h) - g;
  const top = g * df;
  const right = f * dg;
  const corner = df * dg;
  const change = product(a + h) - product(a);
  return { f, g, df, dg, top, right, corner, change, slope: change / h };
}

/** The numeric story's function: x³, with only multiplications. */
export const cube = (x: number) => x * x * x;
export const cubeSlope = (a: number) => 3 * a * a;
/** h = 10⁻ᵏ for these k, parsed from text so every engine gets the same double. */
export const H_EXPONENTS = Array.from({ length: 15 }, (_, i) => i + 1);
export const hOf = (k: number) => Number(`1e-${k}`);
/** An error of exactly 0 is drawn here, since log 0 is −∞. */
export const ERROR_FLOOR = 1e-17;

export type ErrorRow = { k: number; h: number; forward: number; central: number; forwardError: number; centralError: number; storedH: number };

/** Forward and central estimates of (x³)′ at a, and their errors, for every h. */
export function errorTable(a: number): ErrorRow[] {
  const exact = cubeSlope(a);
  return H_EXPONENTS.map((k) => {
    const h = hOf(k);
    const forward = forwardDiff(cube, a, h);
    const central = centralDiff(cube, a, h);
    return { k, h, forward, central, forwardError: Math.abs(forward - exact), centralError: Math.abs(central - exact), storedH: a + h - a };
  });
}

/** The rows with the smallest forward and the smallest central error (the first, on a tie). */
export function bestH(rows: readonly ErrorRow[]): { forward: ErrorRow; central: ErrorRow } {
  const min = (key: 'forwardError' | 'centralError') => rows.reduce((best, r) => (r[key] < best[key] ? r : best));
  return { forward: min('forwardError'), central: min('centralError') };
}

/** log₁₀ of an error, with 0 drawn at the floor (rounded: Math.log10 may differ in the last bit). */
export const logError = (e: number) => round(Math.log10(Math.max(e, ERROR_FLOOR)), 2);

// ───────────────────────────── the gallery ─────────────────────────────

export type GalleryFn = 'cube' | 'exp' | 'ln' | 'sigmoid' | 'tanh' | 'relu';
export const GALLERY_FNS: readonly GalleryFn[] = ['cube', 'exp', 'ln', 'sigmoid', 'tanh', 'relu'];

type Spec = {
  /** e.g. σ(x). */
  name: string;
  /** f′ by its rule, for readouts. */
  rule: string;
  f: (x: number) => number;
  /** f′ by its rule, or null where there is none. */
  df: (x: number) => number | null;
  x: Axis;
  y: Axis;
  dy: Axis;
  /** Where P may go, and its step. */
  range: readonly [number, number];
  step: number;
  /** Where the curve is drawn from (ln x is not defined at 0). */
  from?: number;
};

export const GALLERY: Record<GalleryFn, Spec> = {
  cube: { name: 'x³', rule: '3x²', f: cube, df: (x) => 3 * x * x, x: { min: -2.2, max: 2.2 }, y: { min: -8.5, max: 8.5 }, dy: { min: -1, max: 13 }, range: [-2, 2], step: 0.5 },
  exp: { name: 'eˣ', rule: 'eˣ', f: Math.exp, df: Math.exp, x: { min: -2.2, max: 2.2 }, y: { min: -0.5, max: 8 }, dy: { min: -0.5, max: 8 }, range: [-2, 2], step: 0.5 },
  ln: { name: 'ln x', rule: '1/x', f: Math.log, df: (x) => 1 / x, x: { min: 0, max: 4.2 }, y: { min: -2.75, max: 1.75 }, dy: { min: -0.5, max: 5.5 }, range: [0.25, 4], step: 0.25, from: 0.08 },
  sigmoid: { name: 'σ(x)', rule: 'σ(x)·(1 − σ(x))', f: sigmoid, df: dSigmoid, x: { min: -6.5, max: 6.5 }, y: { min: -0.1, max: 1.1 }, dy: { min: -0.03, max: 0.3 }, range: [-6, 6], step: 0.5 },
  tanh: { name: 'tanh x', rule: '1 − tanh²(x)', f: Math.tanh, df: dTanh, x: { min: -3.5, max: 3.5 }, y: { min: -1.2, max: 1.2 }, dy: { min: -0.1, max: 1.15 }, range: [-3, 3], step: 0.5 },
  relu: { name: 'ReLU(x)', rule: '0 left of 0, 1 right of 0', f: relu, df: dRelu, x: { min: -3.2, max: 3.2 }, y: { min: -0.5, max: 3.2 }, dy: { min: -0.5, max: 1.5 }, range: [-3, 3], step: 0.5 },
};

/** The h the gallery measures with (central secants). */
export const MEASURE_H = 1e-3;
/** The x values where the sweep measures f′ (centred in eight slots, so ReLU never lands on its corner). */
export const sweepXs = (fn: GalleryFn): number[] => {
  const s = GALLERY[fn];
  const [lo, hi] = s.range;
  return Array.from({ length: 8 }, (_, k) => lo + ((k + 0.5) * (hi - lo)) / 8);
};

// ───────────────────────────── inputs ─────────────────────────────

export type GalleryPoints = Record<GalleryFn, number>;
export type RulesInput = { story: 'product'; a: number } | { story: 'gallery'; at: GalleryPoints } | { story: 'numeric'; a: number };
export type Story = RulesInput['story'];

export const PRODUCT_RANGE = [0.5, 2] as const;
export const NUMERIC_RANGE = [0.5, 2] as const;
const A_STEP = 0.5;
export const GALLERY_DEFAULTS: GalleryPoints = { cube: 2,exp: 1, ln: 2, sigmoid: 0, tanh: 0, relu: -1 };

// ───────────────────────────── drawing helpers ─────────────────────────────

/** Plane coordinates from exp, log and tanh, rounded so Node and the browser agree (thousandths: σ′ spans only 0.25). */
const r3 = (v: number) => round(v, 3);
const pt = (x: number, y: number): Vec => [r3(x), r3(y)];
const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });

function sample(g: (x: number) => number, from: number, to: number, n = 120): Vec[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const x = from + ((to - from) * k) / n;
    return pt(x, g(x));
  });
}

const pseudocode = [
  'p(x) = f(x)·g(x): a rectangle’s area',
  'nudge a by h: Δf ≈ f′·h, Δg ≈ g′·h',
  'Δp = g·Δf + f·Δg + Δf·Δg',
  '(fg)′ = f′·g + f·g′',
  'not f′·g′',
  'f′(a) from the rule',
  'check: (f(a + h) − f(a − h)) / (2h)',
  'f′ everywhere: sweep a',
  'forward = (f(a + h) − f(a)) / h',
  'central = (f(a + h) − f(a − h)) / (2h)',
  'error = |estimate − exact|',
  'shrink h: 10⁻¹, 10⁻², …, 10⁻¹⁵',
  'best h: truncation vs rounding',
];

// ───────────────────────────── the product rule ─────────────────────────────

const PRODUCT_HS = [0.5, 0.25, 0.1, 0.01];
const P_X: Axis = { min: 0, max: 2.75, label: 'x' };
const P_Y: Axis = { min: -0.5, max: 22, label: 'y' };
const inside = ([x, y]: Vec, ax: Axis, ay: Axis) => x >= ax.min && x <= ax.max && y >= ay.min && y <= ay.max;

function* productStory(a: number): Generator<Frame<PlotState>> {
  const f = productF(a);
  const g = productG(a);
  const df = productDf(a);
  const dg = productDg(a);
  const p = product(a);
  const rule = productRule(a);
  const wrong = wrongGuess(a);
  const vars = { a, 'f(a)': f, 'g(a)': g };

  const curves: Shape[] = [
    { kind: 'path', id: 'f', points: sample(productF, P_X.min, P_X.max, 2), tone: 1, label: 'f = x + 1' },
    { kind: 'path', id: 'g', points: sample(productG, P_X.min, P_X.max, 60), tone: 2, label: 'g = x²' },
    { kind: 'path', id: 'p', points: sample(product, P_X.min, P_X.max, 60), tone: 3, label: 'f·g' },
  ];
  const dots: Shape[] = [
    { kind: 'point', id: 'Pf', at: [a, f], tone: 1 },
    { kind: 'point', id: 'Pg', at: [a, g], tone: 2 },
    { kind: 'point', id: 'P', at: [a, p], mark: 'key', label: 'P' },
  ];
  const handle: Handle = { id: 'a', at: [a, p], label: 'P on f·g', mark: 'key', step: A_STEP, min: [PRODUCT_RANGE[0], -Infinity], max: [PRODUCT_RANGE[1], Infinity] };
  const curvePlane = (label: string, extra: Shape[]): PlanePart => ({ kind: 'plane', id: 'plane', label, x: P_X, y: P_Y, equal: false, shapes: [...curves, ...extra, ...dots], handles: [handle] });

  const rect = (w: number, hgt: number): Vec[] => [
    [0, 0],
    [w, 0],
    [w, hgt],
    [0, hgt],
  ];
  const box = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const areaPlane = (label: string, extra: Shape[]): PlanePart => ({
    kind: 'plane',
    id: 'area',
    label,
    x: { min: 0, max: 6.75, label: 'g' },
    y: { min: 0, max: 4, label: 'f' },
    equal: true,
    shapes: [{ kind: 'path', id: 'rect', points: rect(g, f), closed: true, fill: true, label: `f·g = ${fmt(p)}` }, ...extra],
    handles: [],
  });

  yield plotFrame([curvePlane('f, g and their product f·g', [
    { kind: 'line', id: 'tf', through: [a, f], dir: [1, df], tone: 1, dashed: true },
    { kind: 'line', id: 'tg', through: [a, g], dir: [1, dg], tone: 2, dashed: true },
  ]), readouts([
    { id: 'f', label: 'f(a)', value: fmt(f), tone: 1 },
    { id: 'g', label: 'g(a)', value: fmt(g), tone: 2 },
    { id: 'df', label: 'f′(a)', value: fmt(df), tone: 1 },
    { id: 'dg', label: 'g′(a)', value: fmt(dg), tone: 2 },
    { id: 'p', label: 'f(a)·g(a)', value: fmt(p), tone: 3 },
  ])], {
    line: 0,
    note: `Two functions we know the slopes of: f(x) = x + 1 (slope 1 everywhere) and g(x) = x² (slope 2x). At a = ${fmt(a)}, f = ${fmt(f)} and g = ${fmt(g)}, with slopes ${fmt(df)} and ${fmt(dg)}. What is the slope of their product f·g? Drag P to move a.`,
    vars,
  });

  const first = productStrips(a, PRODUCT_HS[0]);
  yield plotFrame([curvePlane('f, g and their product f·g', []), areaPlane(`f·g as a rectangle, ${fmt(g)} wide and ${fmt(f)} tall`, [])], {
    line: 0,
    note: `Picture the product as a rectangle g(a) = ${fmt(g)} wide and f(a) = ${fmt(f)} tall: its area is f·g = ${fmt(p)}. Nudging a by h makes f grow by Δf and g by Δg, so the rectangle grows a strip along the top (g·Δf) and a strip down the right (f·Δg).`,
    vars,
    checkpoint: askInOrder(
      `Nudge a by h = ${fmt(PRODUCT_HS[0])}. Which strip is bigger?`,
      ['The top strip, g·Δf', 'The right strip, f·Δg', 'They are equal'],
      Math.abs(first.top - first.right) < 1e-9 ? 'They are equal' : first.top > first.right ? 'The top strip, g·Δf' : 'The right strip, f·Δg',
    ),
  });

  for (let k = 0; k < PRODUCT_HS.length; k++) {
    const h = PRODUCT_HS[k];
    const s = productStrips(a, h);
    const next = PRODUCT_HS[k + 1];
    const Q: Vec = [a + h, product(a + h)];
    const secant: Shape[] = [
      { kind: 'line', id: 'secant', through: [a, p], dir: [1, s.slope], mark: 'compare' },
      ...(inside(Q, P_X, P_Y) ? [{ kind: 'point' as const, id: 'Q', at: Q, mark: 'compare' as const, label: 'Q' }] : []),
    ];
    const strips: Shape[] = [
      { kind: 'path', id: 'top', points: box(0, f, g, f + s.df), closed: true, fill: true, tone: 1, label: 'g·Δf' },
      { kind: 'path', id: 'right', points: box(g, 0, g + s.dg, f), closed: true, fill: true, tone: 2, label: 'f·Δg' },
      { kind: 'path', id: 'corner', points: box(g, f, g + s.dg, f + s.df), closed: true, fill: true, mark: 'reject', label: k < 2 ? 'Δf·Δg' : undefined },
    ];
    let checkpoint: Checkpoint | undefined;
    if (k === 0) {
      const after = productStrips(a, next);
      const ratio = after.corner / s.corner;
      const shares = [
        ['Half as big', 0.5],
        ['A quarter as big', 0.25],
        ['The same', 1],
      ] as const;
      const nearest = shares.reduce((best, c) => (Math.abs(Math.log(ratio / c[1])) < Math.abs(Math.log(ratio / best[1])) ? c : best));
      checkpoint = askInOrder(`Halve h to ${fmt(next)}. About how big does the corner Δf·Δg become?`, shares.map((c) => c[0]), nearest[0]);
    } else if (k === 1) {
      const nextSlope = productStrips(a, next).slope;
      checkpoint = askInOrder(`Shrink h to ${fmt(next)}. Will Δp/h, the secant’s slope, go up, go down or stay the same?`, ['Go up', 'Go down', 'Stay the same'], Math.abs(nextSlope - s.slope) < 1e-9 ? 'Stay the same' : nextSlope > s.slope ? 'Go up' : 'Go down');
    } else if (next === undefined) {
      checkpoint = askInOrder('As h → 0, what does Δp/h become?', ['f′·g′', 'f′·g + f·g′', 'f′·g + f·g′ + f′·g′'], 'f′·g + f·g′');
    }
    const notes = [
      `h = ${fmt(h)}: f grows by Δf = ${fmt(s.df, 4)} and g by Δg = ${fmt(s.dg, 4)}. The top strip is ${fmt(g)} × ${fmt(s.df, 4)} = ${fmt(s.top, 4)}, the right strip ${fmt(f)} × ${fmt(s.dg, 4)} = ${fmt(s.right, 4)}, and the corner Δf·Δg = ${fmt(s.corner, 4)}. Together they are the whole change in f·g, ${fmt(s.change, 4)}.`,
      `h = ${fmt(h)}: the strips are ${fmt(s.top, 4)} and ${fmt(s.right, 4)}, and the corner is down to ${fmt(s.corner, 4)}. The strips shrink like h, but the corner is a small thing times a small thing, so it shrinks like h².`,
      `h = ${fmt(h)}: the corner is only ${fmt(s.corner, 4)} now, and the secant’s slope Δp/h is ${fmt(s.slope, 4)}. Divide the change by h and the strips give g·(Δf/h) + f·(Δg/h) = ${fmt(s.top / h, 4)} + ${fmt(s.right / h, 4)}, while the corner adds just ${fmt(s.corner / h, 4)}.`,
      `h = ${fmt(h)}: the corner, ${fmt(s.corner, 6)}, has all but vanished. Δf/h is settling on f′(a) = ${fmt(df)} and Δg/h on g′(a) = ${fmt(dg)}.`,
    ];
    yield plotFrame(
      [
        curvePlane(`The secant on f·g with h = ${fmt(h)}`, secant),
        areaPlane(`The rectangle grows: a + h = ${fmt(a + h)}`, strips),
        readouts([
          { id: 'h', label: 'h', value: fmt(h) },
          { id: 'top', label: 'top strip g·Δf', value: fmt(s.top, 4), tone: 1 },
          { id: 'right', label: 'right strip f·Δg', value: fmt(s.right, 4), tone: 2 },
          { id: 'corner', label: 'corner Δf·Δg', value: fmt(s.corner, 6), mark: 'reject' },
          { id: 'change', label: 'change Δp', value: fmt(s.change, 4) },
          { id: 'slope', label: 'Δp / h', value: fmt(s.slope, 4), mark: 'compare' },
        ]),
      ],
      { line: k === 0 ? 1 : 2, note: notes[k], vars: { ...vars, h, 'Δp/h': round(s.slope, 4) }, checkpoint },
    );
  }

  const measured = centralDiff(product, a, MEASURE_H);
  yield plotFrame(
    [
      curvePlane('The tangent to f·g', [{ kind: 'line', id: 'secant', through: [a, p], dir: [1, rule], mark: 'found', label: 'tangent' }]),
      areaPlane('Two strips, no corner', [
        { kind: 'path', id: 'top', points: box(0, f, g, f + 0.08), closed: true, fill: true, tone: 1, label: 'g·f′·h' },
        { kind: 'path', id: 'right', points: box(g, 0, g + 0.08, f), closed: true, fill: true, tone: 2, label: 'f·g′·h' },
      ]),
      readouts([
        { id: 'fdg', label: 'f′·g', value: fmt(df * g), tone: 1 },
        { id: 'gdf', label: 'f·g′', value: fmt(f * dg), tone: 2 },
        { id: 'rule', label: 'f′·g + f·g′', value: fmt(rule), mark: 'found' },
        { id: 'measured', label: `measured, h = ${fmt(MEASURE_H, 3)}`, value: fmt(measured, 4), mark: 'compare' },
      ]),
    ],
    {
      line: 3,
      note: `As h → 0 the corner drops out and each strip, divided by h, becomes a slope times a side: (fg)′ = f′·g + f·g′ = ${fmt(df)}·${fmt(g)} + ${fmt(f)}·${fmt(dg)} = ${fmt(rule)}. A central secant with h = ${fmt(MEASURE_H, 3)} measures ${fmt(measured, 4)}: the product rule.`,
      vars: { ...vars, '(fg)′': rule },
      checkpoint: askInOrder(`A tempting shortcut multiplies the slopes: f′(a)·g′(a) = ${fmt(wrong)}. Which piece of the rectangle does f′·g′ come from?`, ['The top strip', 'The right strip', 'The corner'], 'The corner'),
    },
  );

  yield plotFrame(
    [
      curvePlane('The tangent against the tempting guess', [
        { kind: 'line', id: 'secant', through: [a, p], dir: [1, rule], mark: 'found', label: `slope ${fmt(rule)}` },
        { kind: 'line', id: 'wrong', through: [a, p], dir: [1, wrong], mark: 'reject', dashed: true, label: `slope ${fmt(wrong)}` },
      ]),
      readouts([
        { id: 'rule', label: 'f′·g + f·g′', value: fmt(rule), mark: 'found' },
        { id: 'wrong', label: 'f′·g′', value: fmt(wrong), mark: 'reject' },
        { id: 'measured', label: `measured, h = ${fmt(MEASURE_H, 3)}`, value: fmt(measured, 4), mark: 'compare' },
      ]),
    ],
    {
      line: 4,
      note: `The corner: Δf·Δg ≈ f′·h × g′·h = f′·g′·h², which vanishes as h → 0, so f′·g′ is no part of the slope. The dashed line with slope f′·g′ = ${fmt(wrong)} is nowhere near the tangent’s ${fmt(rule)}. Each factor’s change is weighted by the other factor’s size, which is why both f′·g and f·g′ appear.`,
      vars: { ...vars, '(fg)′': rule, "f′·g′": wrong },
    },
  );
}

// ───────────────────────────── the gallery ─────────────────────────────

function galleryPlanes(fn: GalleryFn, a: number, top: Shape[], bottom: Shape[]): PlotPart[] {
  const s = GALLERY[fn];
  const from = s.from ?? s.x.min;
  const fa = s.f(a);
  const f: PlanePart = {
    kind: 'plane',
    id: 'plane',
    label: `f(x) = ${s.name}`,
    x: s.x,
    y: s.y,
    equal: false,
    shapes: [{ kind: 'path', id: 'f', points: sample(s.f, from, s.x.max) }, ...top, { kind: 'point', id: 'P', at: pt(a, fa), mark: 'key', label: 'P' }],
    handles: [{ id: fn, at: pt(a, fa), label: `P on ${s.name}`, mark: 'key', step: s.step, min: [s.range[0], -Infinity], max: [s.range[1], Infinity] }],
  };
  const d: PlanePart = { kind: 'plane', id: 'slope', label: `Slope f′(x) = ${s.rule}`, x: s.x, y: s.dy, equal: false, shapes: bottom, handles: [] };
  return [f, d];
}

/** The rule's curve, split at ReLU's corner so no vertical jump is drawn. */
function ruleCurve(fn: GalleryFn): Shape[] {
  const s = GALLERY[fn];
  const from = fn === 'ln' ? 0.18 : s.x.min;
  if (fn === 'relu') {
    return [
      { kind: 'path', id: 'df', points: [[s.x.min, 0], [0, 0]], mark: 'found', label: 'f′' },
      { kind: 'path', id: 'df1', points: [[0, 1], [s.x.max, 1]], mark: 'found' },
    ];
  }
  return [{ kind: 'path', id: 'df', points: sample((x) => s.df(x)!, from, s.x.max), mark: 'found', label: 'f′' }];
}

/** The rule's value at a as a choice: 3 decimals, since σ′ is small. */
const val = (v: number) => fmt(v, 3);

function firstQuestion(fn: GalleryFn, a: number): Checkpoint | undefined {
  const s = GALLERY[fn];
  if (fn === 'relu') {
    const answer = a === 0 ? 'None: no single slope' : a < 0 ? '0' : '1';
    return askInOrder(`What is ReLU′(${fmt(a)})?`, ['0', '0.5', '1', 'None: no single slope'], answer);
  }
  const d = s.df(a)!;
  const fa = s.f(a);
  const wrong: Record<Exclude<GalleryFn, 'relu'>, number[]> = {
    cube: [a * a, 2 * a * a, 3 * a * a * a, 3 * a],
    exp: [a * Math.exp(a - 1), Math.exp(a) - 1, a + 1, 0],
    ln: [Math.log(a), a, -1 / (a * a), 1],
    sigmoid: [fa, 1 - fa * fa, fa * fa, 1],
    tanh: [fa, 1 - fa, fa * fa, 0.25, 0.5],
  };
  return ask(`Use the rule f′(x) = ${s.rule}. What is f′(${fmt(a)})?`, val(d), wrong[fn].map(val));
}

/** Where the gallery's second question about eˣ and tanh reads the slope: a point other than P. */
export const secondPoint = (fn: 'exp' | 'tanh', a: number) => (fn === 'exp' ? (a === 2 ? -1 : 2) : a === 1 ? -1 : 1);

function secondQuestion(fn: GalleryFn, a: number): Checkpoint {
  switch (fn) {
    case 'cube':
      return askInOrder('Sweep P along x³. Where is the slope 0?', ['x = −1', 'x = 0', 'x = 1', 'Nowhere'], 'x = 0');
    case 'exp': {
      const x = secondPoint('exp', a);
      return ask(`Use (eˣ)′ = eˣ again: what is the slope of eˣ at x = ${fmt(x)}?`, fmt(Math.exp(x)), [fmt(x * Math.exp(x - 1)), fmt(Math.exp(x - 1)), fmt(x)]) as Checkpoint;
    }
    case 'ln':
      return askInOrder('As x grows, what happens to the slope of ln x?', ['It grows', 'It shrinks towards 0', 'It stays at 1'], 'It shrinks towards 0');
    case 'sigmoid':
      return askInOrder('Where is σ′ biggest?', ['Far left', 'At x = 0', 'Far right'], 'At x = 0');
    case 'tanh': {
      const x = secondPoint('tanh', a);
      const t = Math.tanh(x);
      return ask(`tanh(${fmt(x)}) ≈ ${fmt(t)}. Using tanh′ = 1 − tanh², what is the slope at x = ${fmt(x)}?`, fmt(dTanh(x)), [fmt(1 - t), fmt(t * t), fmt(t)]) as Checkpoint;
    }
    case 'relu':
      return a === 0
        ? askInOrder('What is ReLU′ everywhere left of 0?', ['0', '1', '−1', 'It changes with x'], '0')
        : askInOrder('Is there a slope at the corner x = 0?', ['Yes, 0', 'Yes, 1', 'No: the two sides disagree'], 'No: the two sides disagree');
  }
}

const INTRO: Record<GalleryFn, string> = {
  cube: 'x³, a power. The power rule brings the power down and takes one off it: (xⁿ)′ = n·xⁿ⁻¹, so (x³)′ = 3x².',
  exp: 'eˣ, the exponential. Its rule is the reason e is special: eˣ is its own derivative, (eˣ)′ = eˣ.',
  ln: 'ln x, the natural log, the inverse of eˣ. Its rule: (ln x)′ = 1/x.',
  sigmoid: 'σ(x) = 1/(1 + e⁻ˣ), the sigmoid: an activation that squashes any number into 0 to 1. Its rule is written with σ itself: σ′ = σ·(1 − σ).',
  tanh: 'tanh x, another squashing activation, from −1 to 1. Its rule is also written with itself: tanh′ = 1 − tanh².',
  relu: 'ReLU(x) = max(0, x), the most used activation: 0 for negative inputs, the input itself for positive ones.',
};

const SWEEP_NOTE: Record<GalleryFn, string> = {
  cube: 'The slope of x³ is 3x²: never negative, and 0 only at x = 0, where the curve flattens for a moment without turning round.',
  exp: 'The slope curve is eˣ again: the higher eˣ climbs, the steeper it gets, in exact step. Every dot measured with a secant lands on it.',
  ln: 'The slope 1/x is steep near 0 and shrinks towards 0 as x grows: ln keeps climbing, ever more slowly.',
  sigmoid: 'σ′ peaks at x = 0, where σ = 0.5 and σ′ = 0.5 × 0.5 = 0.25, and dies away on both sides. A neuron pushed far out is saturated: its slope is nearly 0, so backpropagation, which multiplies by σ′, passes almost nothing back.',
  tanh: 'tanh′ peaks at 1 when x = 0 (tanh is 0 there) and falls to 0 on both sides: four times the sigmoid’s best slope.',
  relu: 'ReLU′ is 0 on the left and 1 on the right, with no slope at the corner. Libraries just pick 0 there. A slope of exactly 1 passes a gradient back unshrunk, which is why deep networks like ReLU.',
};

/** The sweep's note, with the answer to the second question for eˣ and tanh. */
function sweepNote(fn: GalleryFn, a: number): string {
  if (fn === 'exp') {
    const x = secondPoint('exp', a);
    return `${SWEEP_NOTE.exp} At x = ${fmt(x)} the slope is e${sup(x)} ≈ ${fmt(Math.exp(x))}, the height of the curve there.`;
  }
  if (fn === 'tanh') {
    const x = secondPoint('tanh', a);
    const t = Math.tanh(x);
    return `${SWEEP_NOTE.tanh} At x = ${fmt(x)}, tanh ≈ ${fmt(t)}, so tanh′ = 1 − ${fmt(t)}² ≈ ${fmt(dTanh(x))}.`;
  }
  return SWEEP_NOTE[fn];
}

function* gallerySection(fn: GalleryFn, a: number, isFirst: boolean): Generator<Frame<PlotState>> {
  const s = GALLERY[fn];
  const fa = s.f(a);
  const d = s.df(a);
  const measured = centralDiff(s.f, a, MEASURE_H);
  const vars = { a, 'f(a)': round(fa, 4) };

  yield plotFrame([...galleryPlanes(fn, a, [], []), readouts([{ id: 'a', label: 'a', value: fmt(a) }, { id: 'fa', label: 'f(a)', value: fmt(fa, 4) }])], {
    line: 5,
    note: `${isFirst ? 'Six functions, six rules, each checked by measuring. ' : ''}${INTRO[fn]} P sits at a = ${fmt(a)}, where f(a) = ${fmt(fa, 4)}. Drag P to move it.`,
    vars,
    checkpoint: firstQuestion(fn, a),
  });

  if (d == null) {
    const left = (s.f(a) - s.f(a - MEASURE_H)) / MEASURE_H;
    const right = (s.f(a + MEASURE_H) - s.f(a)) / MEASURE_H;
    yield plotFrame(
      [
        ...galleryPlanes(fn, a, [
          { kind: 'line', id: 'left', through: [a, fa], dir: [1, left], mark: 'compare', dashed: true, label: 'from the left' },
          { kind: 'line', id: 'right', through: [a, fa], dir: [1, right], mark: 'compare', label: 'from the right' },
        ], [
          { kind: 'point', id: 'dl', at: [a, left], mark: 'compare', label: 'left' },
          { kind: 'point', id: 'dr', at: [a, right], mark: 'compare', label: 'right' },
        ]),
        readouts([
          { id: 'left', label: 'slope from the left', value: fmt(left, 4), mark: 'compare' },
          { id: 'right', label: 'slope from the right', value: fmt(right, 4), mark: 'compare' },
          { id: 'measured', label: `central, h = ${fmt(MEASURE_H, 3)}`, value: fmt(measured, 4) },
          { id: 'rule', label: 'f′(a)', value: 'none' },
        ]),
      ],
      {
        line: 6,
        note: `There is none: from the left the slope is ${fmt(left)}, from the right ${fmt(right)}. A central secant says ${fmt(measured)}, but that only averages the two sides; no single tangent fits a corner.`,
        vars,
        checkpoint: secondQuestion(fn, a),
      },
    );
  } else {
    yield plotFrame(
      [
        ...galleryPlanes(fn, a, [{ kind: 'line', id: 'tangent', through: pt(a, fa), dir: pt(1, d), mark: 'found', label: 'tangent' }], [{ kind: 'point', id: 'slope-a', at: pt(a, d), mark: 'found', label: `f′(${fmt(a)})` }]),
        readouts([
          { id: 'rule', label: `rule ${s.rule}`, value: fmt(d, 4), mark: 'found' },
          { id: 'measured', label: `measured, h = ${fmt(MEASURE_H, 3)}`, value: fmt(measured, 4), mark: 'compare' },
          { id: 'gap', label: 'difference', value: sci(Math.abs(measured - d)) },
        ]),
      ],
      {
        line: 6,
        note: `The rule gives f′(${fmt(a)}) = ${fmt(d, 4)}. Check it by measuring: a central secant with h = ${fmt(MEASURE_H, 3)} gives ${fmt(measured, 4)}, ${measured === d ? 'exactly the same' : `a difference of only ${sci(Math.abs(measured - d))}`}.`,
        vars: { ...vars, "f′(a)": round(d, 4) },
        checkpoint: secondQuestion(fn, a),
      },
    );
  }

  const xs = sweepXs(fn);
  yield plotFrame(
    [
      ...galleryPlanes(fn, a, [], [...ruleCurve(fn), { kind: 'path', id: 'measured', points: xs.map((x) => pt(x, centralDiff(s.f, x, MEASURE_H))), dots: true, mark: 'compare', label: 'measured' }]),
      readouts([{ id: 'rule', label: `(${s.name})′`, value: s.rule, mark: 'found' }]),
    ],
    { line: 7, note: sweepNote(fn, a), vars },
  );
}

function* gallery(at: GalleryPoints): Generator<Frame<PlotState>> {
  for (const fn of GALLERY_FNS) yield* gallerySection(fn, at[fn], fn === GALLERY_FNS[0]);
  const X: Axis = { min: -4.2, max: 4.2, label: 'x' };
  yield plotFrame(
    [
      {
        kind: 'plane',
        id: 'slope',
        label: 'The activations’ slopes, which backpropagation multiplies by',
        x: X,
        y: { min: -0.1, max: 1.15, label: 'slope' },
        equal: false,
        shapes: [
          { kind: 'path', id: 'sigmoid', points: sample(dSigmoid, X.min, X.max), tone: 1, label: 'σ′' },
          { kind: 'path', id: 'tanh', points: sample(dTanh, X.min, X.max), tone: 2, label: 'tanh′' },
          { kind: 'path', id: 'relu', points: [[X.min, 0], [0, 0]], tone: 3, label: 'ReLU′' },
          { kind: 'path', id: 'relu1', points: [[0, 1], [X.max, 1]], tone: 3 },
        ],
        handles: [],
      },
      readouts(
        GALLERY_FNS.map((fn) => ({ id: fn, label: `(${GALLERY[fn].name})′`, value: GALLERY[fn].rule })),
        'rules',
        'The rules',
      ),
    ],
    {
      line: 7,
      note: 'Six rules, each confirmed by measuring. The three activations’ slopes side by side: σ′ never tops 0.25, tanh′ reaches 1, and ReLU′ is exactly 1 for every positive input. Training multiplies by these slopes, so they decide how much signal flows back.',
      vars: {},
    },
  );
}

// ───────────────────────────── measuring in floating point ─────────────────────────────

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');
/** 10⁻ᵏ as text. */
export const tenTo = (k: number) => `10${sup(-k)}`;
/** A small number in scientific notation, e.g. 2.5 × 10⁻⁸. */
export function sci(v: number, decimals = 1): string {
  if (v === 0) return '0';
  const [m, e] = v.toExponential(decimals).split('e');
  return Number(e) === 0 ? m : `${m} × 10${sup(Number(e))}`;
}
/** An estimate with every digit floating point kept (the shortest text that reads back as the same double). */
const digits = (v: number) => String(v);

const N_X: Axis = { min: 0, max: 2.4, label: 'x' };
const N_Y: Axis = { min: -0.5, max: 9, label: 'y' };
const E_X: Axis = { min: 0.4, max: 15.6, label: 'h', ticks: [1, 3, 5, 7, 9, 11, 13, 15].map((k) => ({ at: k, label: tenTo(k) })) };
const E_Y: Axis = { min: -17.6, max: 1.6, label: 'error', ticks: [0, -4, -8, -12, -16].map((e) => ({ at: e, label: e === 0 ? '1' : `10${sup(e)}` })) };

/** Which of ×10, ×100, ×1000 a ratio is closest to (on a log scale). */
function shrinkWord(ratio: number) {
  const options = [
    ['10 times', 1],
    ['100 times', 2],
    ['1000 times', 3],
  ] as const;
  const l = Math.log10(ratio);
  return options.reduce((best, o) => (Math.abs(l - o[1]) < Math.abs(l - best[1]) ? o : best))[0];
}

function* numeric(a: number): Generator<Frame<PlotState>> {
  const rows = errorTable(a);
  const exact = cubeSlope(a);
  const best = bestH(rows);
  const fa = cube(a);
  const vars = { a, exact };
  const handle: Handle = { id: 'a', at: [a, fa], label: 'P on x³', mark: 'key', step: A_STEP, min: [NUMERIC_RANGE[0], -Infinity], max: [NUMERIC_RANGE[1], Infinity] };
  const curvePlane = (extra: Shape[]): PlanePart => ({
    kind: 'plane',
    id: 'plane',
    label: 'f(x) = x³',
    x: N_X,
    y: N_Y,
    equal: false,
    shapes: [{ kind: 'path', id: 'f', points: sample(cube, N_X.min, N_X.max, 60) }, { kind: 'line', id: 'tangent', through: [a, fa], dir: [1, exact], mark: 'found', dashed: true, label: 'exact slope' }, ...extra, { kind: 'point', id: 'P', at: [a, fa], mark: 'key', label: 'P' }],
    handles: [handle],
  });
  const errorPlane = (upTo: number, extra: Shape[] = []): PlanePart => {
    const shown = rows.slice(0, upTo);
    const series = (key: 'forwardError' | 'centralError', id: string, tone: 1 | 2, label: string): Shape[] =>
      shown.length > 1 ? [{ kind: 'path', id, points: shown.map((r) => [r.k, logError(r[key])] as Vec), tone, dots: true, label }] : [];
    const now = shown[shown.length - 1];
    return {
      kind: 'plane',
      id: 'errors',
      label: 'How far each estimate is from the exact slope',
      x: E_X,
      y: E_Y,
      equal: false,
      shapes: [
        ...series('forwardError', 'forward', 1, 'forward'),
        ...series('centralError', 'central', 2, 'central'),
        ...(now
          ? [
              { kind: 'point' as const, id: 'fw-now', at: [now.k, logError(now.forwardError)] as Vec, tone: 1 as const, size: 'md' as const, label: shown.length > 1 ? undefined : 'forward' },
              { kind: 'point' as const, id: 'ce-now', at: [now.k, logError(now.centralError)] as Vec, tone: 2 as const, size: 'md' as const, label: shown.length > 1 ? undefined : 'central' },
            ]
          : []),
        ...extra,
      ],
      handles: [],
    };
  };

  const first = rows[0];
  yield plotFrame([curvePlane([]), errorPlane(0)], {
    line: 8,
    note: `How would code measure a slope? Take f(x) = x³ at a = ${fmt(a)}, where the exact slope is 3a² = ${fmt(exact)}, and try two recipes: the forward difference (f(a + h) − f(a)) / h, and the central difference (f(a + h) − f(a − h)) / (2h), a secant reaching both sides of P. Start with h = 0.1.`,
    vars,
    checkpoint: askInOrder('At h = 0.1, which estimate lands closer to the exact slope?', ['Forward', 'Central', 'They tie'], first.centralError < first.forwardError ? 'Central' : first.forwardError < first.centralError ? 'Forward' : 'They tie'),
  });

  let rising = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const next = rows[i + 1];
    const prev = rows[i - 1];
    const floored = r.forwardError === 0 || r.centralError === 0 ? ' An error of exactly 0 is drawn at the floor, 10⁻¹⁷, since log 0 is −∞.' : '';
    let note: string;
    if (i === 0) {
      note = `h = 0.1: forward gives ${digits(r.forward)}, off by ${sci(r.forwardError)}; central gives ${digits(r.central)}, off by ${sci(r.centralError)}. For x³ the forward error is 3a·h + h², because the secant leans to one side; reaching both sides cancels the 3a·h part and leaves only h².${digits(r.forward).length > 10 ? ` Long readouts like ${digits(r.forward)} show rounding in the last digits: a double can’t store most decimals exactly.` : ''}`;
    } else if (prev && r.centralError > prev.centralError && !rising) {
      rising = true;
      note = `h = ${tenTo(r.k)}: the central error went up, to ${sci(r.centralError)}. A double keeps about 16 significant digits, so f(a + h) and f(a − h) now agree in nearly all of them: their difference keeps only the last few, which are rounding noise, and dividing by a tiny 2h magnifies that noise.`;
    } else if (r.k === 15) {
      note = `h = ${tenTo(15)}: ${r.storedH === r.h ? `a + h − a still comes back as h, but the estimates have lost almost every digit.` : `even a + h − a comes out as ${sci(r.storedH, 4)}, not ${tenTo(15)}: a + h kept only the digits a double has room for.`} Forward is off by ${sci(r.forwardError)} and central by ${sci(r.centralError)}: the estimates are mostly noise.`;
    } else if (rising && r === best.forward) {
      note = `h = ${tenTo(r.k)}: forward is off by ${sci(r.forwardError)}, central by ${sci(r.centralError)}. Central is already climbing, while forward, with its bigger truncation error, has fallen this far.`;
    } else if (rising && r.forward === r.central) {
      note = `h = ${tenTo(r.k)}: forward and central give the very same number, ${digits(r.forward)}, off by ${sci(r.forwardError)}. Neither is measuring the slope any more: both are rounding noise divided by a tiny h.`;
    } else if (rising && r.k < best.forward.k) {
      note = `h = ${tenTo(r.k)}: forward is off by ${sci(r.forwardError)}${prev && r.forwardError < prev.forwardError ? ', still falling' : ''}; central, past its best, is off by ${sci(r.centralError)}.`;
    } else if (rising) {
      note = `h = ${tenTo(r.k)}: forward is off by ${sci(r.forwardError)}, central by ${sci(r.centralError)}. Neither beats its best any more: the noise, divided by h, grows in a ragged, jumpy way.`;
    } else if (i === 1) {
      note = `h = ${tenTo(r.k)}: forward is off by ${sci(r.forwardError)}, central by ${sci(r.centralError)}. On these log axes each step down in h takes one digit off the forward error: it falls like h, along a line of slope 1.`;
    } else if (i === 2) {
      note = `h = ${tenTo(r.k)}: forward is off by ${sci(r.forwardError)}, central by ${sci(r.centralError)}. Each step down in h takes two digits off the central error: it falls like h², along a line of slope 2.`;
    } else {
      note = `h = ${tenTo(r.k)}: forward is off by ${sci(r.forwardError)}, central by ${sci(r.centralError)}.`;
    }
    let checkpoint: Checkpoint | undefined;
    if (i === 0) checkpoint = askInOrder('Shrink h ten times, to 0.01. About how many times smaller does the forward error get?', ['10 times', '100 times', '1000 times'], shrinkWord(r.forwardError / next.forwardError));
    else if (i === 1) checkpoint = askInOrder(`And from h = ${tenTo(2)} to ${tenTo(3)}, about how many times smaller does the central error get?`, ['10 times', '100 times', '1000 times'], shrinkWord(r.centralError / next.centralError));
    else if (next && r === best.central) checkpoint = askInOrder(`Shrink h again, to ${tenTo(next.k)}. Will the central error keep falling?`, ['Yes', 'No'], next.centralError < r.centralError ? 'Yes' : 'No');
    else if (next && r === best.forward) checkpoint = askInOrder(`Shrink h again, to ${tenTo(next.k)}. Will the forward error keep falling?`, ['Yes', 'No'], next.forwardError < r.forwardError ? 'Yes' : 'No');
    else if (!next) {
      const others = [2, 10, 14, 4, 12].filter((k) => k !== best.central.k).slice(0, 3);
      const ks = [best.central.k, ...others].sort((x, y) => x - y);
      checkpoint = askInOrder('Looking back, which h gave the central difference its smallest error?', ks.map((k) => `h = ${tenTo(k)}`), `h = ${tenTo(best.central.k)}`);
    }
    yield plotFrame(
      [
        curvePlane([
          { kind: 'line', id: 'forward', through: [a, fa], dir: [1, r.forward], tone: 1, label: 'forward' },
          { kind: 'line', id: 'central', through: [a - r.h, cube(a - r.h)], dir: [1, r.central], tone: 2, label: 'central' },
        ]),
        errorPlane(i + 1),
        readouts([
          { id: 'h', label: 'h', value: tenTo(r.k) },
          { id: 'stored', label: 'h as stored (a + h − a)', value: sci(r.storedH, 4) },
          { id: 'forward', label: 'forward', value: digits(r.forward), tone: 1 },
          { id: 'fe', label: 'forward error', value: sci(r.forwardError), tone: 1 },
          { id: 'central', label: 'central', value: digits(r.central), tone: 2 },
          { id: 'ce', label: 'central error', value: sci(r.centralError), tone: 2 },
        ]),
      ],
      { line: i === 0 ? 9 : rising ? 12 : i === 1 ? 10 : 11, note: note + floored, vars: { ...vars, k: r.k }, checkpoint },
    );
  }

  const bf = best.forward;
  const bc = best.central;
  const f0 = rows[0];
  yield plotFrame(
    [
      curvePlane([]),
      errorPlane(rows.length, [
        { kind: 'line', id: 'slope1', through: [f0.k, logError(f0.forwardError)], dir: [1, -1], dashed: true, label: '∝ h' },
        { kind: 'line', id: 'slope2', through: [f0.k, logError(f0.centralError)], dir: [1, -2], dashed: true, label: '∝ h²' },
        { kind: 'point', id: 'best-fw', at: [bf.k, logError(bf.forwardError)], mark: 'found', size: 'lg', label: 'best forward' },
        { kind: 'point', id: 'best-ce', at: [bc.k, logError(bc.centralError)], mark: 'found', size: 'lg', label: 'best central' },
      ]),
      readouts([
        { id: 'bf', label: 'best forward h', value: tenTo(bf.k), tone: 1 },
        { id: 'bfe', label: 'its error', value: sci(bf.forwardError), tone: 1 },
        { id: 'bc', label: 'best central h', value: tenTo(bc.k), tone: 2 },
        { id: 'bce', label: 'its error', value: sci(bc.centralError), tone: 2 },
      ]),
    ],
    {
      line: 12,
      note: `Too big an h and the secant bends away from the tangent; too small and rounding noise wins. Forward did best at h = ${tenTo(bf.k)} (error ${sci(bf.forwardError)}), central at h = ${tenTo(bc.k)} (error ${sci(bc.centralError)}). Gradient checks in ML use central differences with an h near there.`,
      vars: { ...vars, 'best forward k': bf.k, 'best central k': bc.k },
    },
  );
}

function* run(input: RulesInput): Generator<Frame<PlotState>> {
  if (input.story === 'product') yield* productStory(input.a);
  else if (input.story === 'gallery') yield* gallery(input.at);
  else yield* numeric(input.a);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;
const NUMBER = '([−-]?\\d*\\.?\\d+)';

export function parseRules(text: string): { value: RulesInput } | { error: string } {
  const t = text.toLowerCase().replace(/−/g, '-');
  const word = (t.match(/[a-z]+/) ?? [''])[0];
  if (word === 'product' || word === 'numeric') {
    const m = t.match(new RegExp(`${word}\\s*(?:at\\s*)?${NUMBER}\\s*$`));
    const [lo, hi] = word === 'product' ? PRODUCT_RANGE : NUMERIC_RANGE;
    if (!m) return { error: `Give the point a, e.g. ${word} at 1.` };
    const a = Number(m[1]);
    if (!(a >= lo && a <= hi) || !onStep(a, A_STEP)) return { error: `a must be a half from ${lo} to ${hi}.` };
    return { value: { story: word, a } };
  }
  if (word !== 'gallery') return { error: 'Start with product, gallery or numeric, e.g. product at 2.' };
  const at: GalleryPoints = { ...GALLERY_DEFAULTS };
  const rest = t.replace(/^\s*gallery\s*/, '');
  const re = new RegExp(`([a-z]+)\\s*(?:at\\s*)?${NUMBER}`, 'g');
  let consumed = rest.replace(/[\s,;]/g, '');
  for (const m of rest.matchAll(re)) {
    const fn = m[1] as GalleryFn;
    if (!GALLERY_FNS.includes(fn)) return { error: `Unknown function “${m[1]}”: use ${GALLERY_FNS.join(', ')}.` };
    const v = Number(m[2]);
    const s = GALLERY[fn];
    if (!(v >= s.range[0] && v <= s.range[1]) || !onStep(v, s.step)) return { error: `${fn} takes a multiple of ${s.step} from ${s.range[0]} to ${s.range[1]}.` };
    at[fn] = v;
    consumed = consumed.replace(m[0].replace(/\s/g, ''), '');
  }
  if (consumed !== '') return { error: 'Give each function and its point, e.g. gallery sigmoid 0, relu -1.' };
  return { value: { story: 'gallery', at } };
}

export function formatRules(input: RulesInput): string {
  if (input.story !== 'gallery') return `${input.story} at ${plain(input.a)}`;
  return `gallery ${GALLERY_FNS.map((fn) => `${fn} ${plain(input.at[fn])}`).join(', ')}`;
}

const snapTo = (x: number, step: number, lo: number, hi: number) => round(Math.min(hi, Math.max(lo, Math.round(x / step) * step)), 6);

export function dragRules(input: RulesInput, id: string, to: Vec): RulesInput {
  if (input.story === 'gallery') {
    const fn = id as GalleryFn;
    if (!GALLERY_FNS.includes(fn)) return input;
    const s = GALLERY[fn];
    return { ...input, at: { ...input.at, [fn]: snapTo(to[0], s.step, s.range[0], s.range[1]) } };
  }
  if (id !== 'a') return input;
  const [lo, hi] = input.story === 'product' ? PRODUCT_RANGE : NUMERIC_RANGE;
  return { ...input, a: snapTo(to[0], A_STEP, lo, hi) };
}

const example = (id: string, label: string, input: RulesInput) => ({ id, label, make: () => input, sized: false });

export const derivativeRules = defineAlgorithm<RulesInput, PlotState>({
  kind: 'algorithm',
  slug: 'derivative-rules',
  view: 'plot',
  input: {
    examples: [
      example('product', 'The product rule as a growing rectangle', { story: 'product', a: 2 }),
      example('gallery', 'Six rules, each checked by measuring', { story: 'gallery', at: GALLERY_DEFAULTS }),
      example('numeric', 'Measuring a slope in floating point', { story: 'numeric', a: 1 }),
      example('saturated', 'Activations far from 0: tiny slopes', { story: 'gallery', at: { ...GALLERY_DEFAULTS, sigmoid: 5, tanh: 2.5, relu: 2 } }),
    ],
    custom: {
      label: 'product at a, numeric at a (halves from 0.5 to 2), or gallery with a point per function',
      placeholder: 'e.g. gallery cube 1, exp 1, ln 2, sigmoid 0, tanh 0, relu -1',
      parse: parseRules,
      format: formatRules,
    },
    drag: dragRules,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Curves, guides and the rectangle f·g' },
    { mark: 'key', label: 'The point P' },
    { tone: 1, label: 'f and its strip; the forward difference; σ′' },
    { tone: 2, label: 'g and its strip; the central difference; tanh′' },
    { tone: 3, label: 'The product f·g; ReLU′' },
    { mark: 'compare', label: 'A secant: a measured slope' },
    { mark: 'found', label: 'The tangent: the rule’s slope' },
    { mark: 'reject', label: 'The corner Δf·Δg, or the guess f′·g′' },
  ],
  run,
  content: {
    idea: 'A few rules give the derivative of almost anything without taking limits: sums add, powers come down (x³ → 3x²), eˣ is its own derivative, ln x gives 1/x, and a product grows like a rectangle: (fg)′ = f′g + fg′. The activations have rules too, σ′ = σ(1 − σ), tanh′ = 1 − tanh² and ReLU′ = 0 or 1, and any rule can be checked by measuring a secant.',
    invariant: 'Every rule agrees with a measured slope: the central difference (f(a + h) − f(a − h)) / (2h) lands on it, with an error that shrinks like h² until floating point’s rounding noise takes over. A product’s change is two strips plus a corner that vanishes like h², so the product rule has no f′·g′ term.',
    whenToUse: 'Whenever you need a derivative by hand: the slopes backpropagation multiplies by are these rules applied to each activation. Measuring with a central difference is how libraries check a hand-written gradient (a gradient check), with h near 10⁻⁵ to 10⁻⁶ for doubles.',
    traits: [
      { label: '(fg)′ = f′g + fg′, not f′·g′', good: null },
      { label: 'σ′ ≤ 0.25: sigmoids saturate', good: false },
      { label: 'Central differences: error ∝ h²', good: true },
    ],
    experiments: [
      { example: 'product', prompt: 'Drag P to a = 1: which strip is bigger now, and does f′·g′ ever match the measured slope?' },
      { example: 'gallery', prompt: 'Drag σ’s point out to x = 5 and read its slope: what does a saturated neuron pass back?' },
      { example: 'saturated', prompt: 'Compare σ′, tanh′ and ReLU′ far from 0: which one still passes a gradient back?' },
      { example: 'numeric', prompt: 'Drag P to a = 2. Does the best h for the central difference move?' },
    ],
  },
});

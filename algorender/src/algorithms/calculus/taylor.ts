import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Taylor approximation and Newton's method. Near a point a, a smooth curve
// looks like its tangent line, and even more like a parabola that also copies
// how much it bends there (the second derivative f″, the slope of the slope).
// Each extra term makes the error at a + d shrink one power of d faster.
// Newton's method finds a root by following the tangent down to zero, and the
// same parabola, written for a loss, gives the Newton step of optimisation:
// a gradient step is the bottom of a parabola that pretends the bend is 1/η.

// ───────────────────────────── the maths ─────────────────────────────

export type FnId = 'exp' | 'log';
export type Order = 0 | 1 | 2;

/** A smooth function with its first two derivatives, and where to draw it. */
export type Smooth = {
  formula: string;
  /** f′ and f″ as formulas, for narration. */
  d1: string;
  d2: string;
  f: (x: number) => number;
  df: (x: number) => number;
  d2f: (x: number) => number;
  x: Axis;
  y: Axis;
  /** The axis of the slope plane, f′. */
  dy: Axis;
  /** Where the curve is drawn from (ln x has no value at 0). */
  from: number;
  /** The range of the draggable point a. */
  aMin: number;
  aMax: number;
};

export const FUNCTIONS: Record<FnId, Smooth> = {
  exp: {
    formula: 'eˣ',
    d1: 'eˣ',
    d2: 'eˣ',
    f: Math.exp,
    df: Math.exp,
    d2f: Math.exp,
    x: { min: -2.5, max: 2.5, label: 'x' },
    y: { min: -1, max: 8, label: 'y' },
    dy: { min: -1, max: 8, label: 'f′' },
    from: -2.5,
    aMin: -1.5,
    aMax: 1.5,
  },
  log: {
    formula: 'ln x',
    d1: '1/x',
    d2: '−1/x²',
    f: Math.log,
    df: (x) => 1 / x,
    d2f: (x) => -1 / (x * x),
    x: { min: 0, max: 4, label: 'x' },
    y: { min: -2.5, max: 2, label: 'y' },
    dy: { min: -0.5, max: 4.5, label: 'f′' },
    from: 0.08,
    aMin: 0.75,
    aMax: 3,
  },
};
const FN_IDS = Object.keys(FUNCTIONS) as FnId[];

/** The gap d the fits are judged at, then halved twice. */
export const GAPS = [0.5, 0.25, 0.125] as const;
/** How far either side of a the neighbouring tangents sit. */
export const SIDE = 0.5;
/** The step the point a snaps to. */
export const A_STEP = 0.25;

/** The Taylor polynomial of this order at a: f(a) + f′(a)(x − a) + ½f″(a)(x − a)². */
export function taylorPoly(fn: Smooth, a: number, order: Order): (x: number) => number {
  const f0 = fn.f(a);
  const f1 = fn.df(a);
  const f2 = fn.d2f(a);
  return (x) => {
    const d = x - a;
    return f0 + (order >= 1 ? f1 * d : 0) + (order >= 2 ? 0.5 * f2 * d * d : 0);
  };
}

/** How far the fit of this order misses the curve at a + d. */
export const fitError = (fn: Smooth, a: number, order: Order, d: number) => Math.abs(fn.f(a + d) - taylorPoly(fn, a, order)(a + d));

export type ErrorRow = { order: Order; errors: number[]; ratios: number[] };

/** Each fit's error at every gap, and how many times smaller it gets each time the gap halves. */
export function errorTable(fn: Smooth, a: number, gaps: readonly number[] = GAPS): ErrorRow[] {
  return ([0, 1, 2] as Order[]).map((order) => {
    const errors = gaps.map((d) => fitError(fn, a, order, d));
    return { order, errors, ratios: errors.slice(1).map((e, i) => errors[i] / e) };
  });
}

/** The power of two (2, 4 or 8) nearest a ratio on a log scale: how a halving shrank an error. */
export const nearestPower = (ratio: number): 2 | 4 | 8 => {
  const p = Math.min(3, Math.max(1, Math.round(Math.log2(ratio))));
  return (2 ** p) as 2 | 4 | 8;
};

/** Stop Newton's method once a step moves x by less than this. */
export const STOP = 1e-12;
export const MAX_NEWTON = 40;
/** Doubles hold about this many correct decimals of √2. */
export const MAX_DECIMALS = 15;

/** Newton's method: x ← x − f(x)/f′(x) until a step is below `tol` (or `cap` steps). Every iterate, x₀ first. */
export function newton(f: (x: number) => number, df: (x: number) => number, x0: number, { tol = STOP, cap = MAX_NEWTON } = {}): number[] {
  const xs = [x0];
  for (let k = 0; k < cap; k++) {
    const x = xs[k];
    const slope = df(x);
    if (slope === 0) break;
    const next = x - f(x) / slope;
    xs.push(next);
    if (!Number.isFinite(next) || Math.abs(next - x) < tol) break;
  }
  return xs;
}

/** Newton's method for √a: the root of x² − a, whose slope is 2x. */
export const sqrtNewton = (a: number, x0: number, opts?: { tol?: number; cap?: number }) =>
  newton(
    (x) => x * x - a,
    (x) => 2 * x,
    x0,
    opts,
  );

/** The iterates if the 2 in f′(x) = 2x is forgotten: x ← x − (x² − a)/x = a/x, which bounces forever. */
export const forgotTheTwo = (a: number, x0: number, steps: number) => {
  const xs = [x0];
  for (let k = 0; k < steps; k++) xs.push(xs[k] - (xs[k] * xs[k] - a) / xs[k]);
  return xs;
};

/**
 * How many decimal digits of x agree with the target's, read left to right as a learner would
 * (1.414998 against 1.414213…: 3), at most 15. A different whole-number part agrees on none.
 * Only the digits x has count, read as JavaScript prints them; one a float or two from the target (the
 * last iterates, which can land a hair either side) agrees on all 15.
 */
export function correctDecimals(x: number, target = Math.SQRT2): number {
  if (Math.abs(x - target) <= 2 * Number.EPSILON * Math.abs(target)) return MAX_DECIMALS;
  const [xi, xf = ''] = String(x).split('.');
  const [ti, tf = ''] = String(target).split('.');
  if (xi !== ti) return 0;
  let d = 0;
  while (d < Math.min(MAX_DECIMALS, xf.length) && xf[d] === tf[d]) d++;
  return d;
}

/** The loss of the step story: lowest at w = 2, a parabola with a quartic added so its bend changes. */
export const W_STAR = 2;
export const ETA = 0.1;
/** Steps of each optimiser shown. */
export const RUN_STEPS = 4;
/** The choices for how much one gradient step multiplies the distance to the minimum by (near the bottom, 1 − η·L″ = 0.8). */
export const SHRINK_CHOICES = [
  { value: 0.1, label: 'About 0.1' },
  { value: 0.5, label: 'About 0.5' },
  { value: 0.8, label: 'About 0.8' },
  { value: 1, label: 'About 1 (no progress)' },
] as const;
export const loss = (w: number) => {
  const t = w - W_STAR;
  return t * t + (t * t * t * t) / 4;
};
export const dLoss = (w: number) => {
  const t = w - W_STAR;
  return 2 * t + t * t * t;
};
export const d2Loss = (w: number) => {
  const t = w - W_STAR;
  return 2 + 3 * t * t;
};
/** A gradient-descent step: w − η·L′(w). */
export const gdStep = (w: number, eta = ETA) => w - eta * dLoss(w);
/** A Newton step: w − L′(w)/L″(w), the bottom of the Taylor parabola. */
export const newtonStep = (w: number) => w - dLoss(w) / d2Loss(w);
/** The second-order Taylor parabola of the loss at w₀. */
export const taylorParabola = (w0: number) => (w: number) => {
  const d = w - w0;
  return loss(w0) + dLoss(w0) * d + 0.5 * d2Loss(w0) * d * d;
};
/** The parabola whose lowest point is the gradient step: the same height and slope, a bend of 1/η. */
export const gdParabola =
  (w0: number, eta = ETA) =>
  (w: number) => {
    const d = w - w0;
    return loss(w0) + dLoss(w0) * d + (d * d) / (2 * eta);
  };
/** Where a parabola c + b·d + ½k·d² is lowest: d = −b/k. */
export const parabolaMin = (b: number, k: number) => -b / k;

/** Both optimisers from w₀, every iterate (w₀ first). */
export function descentRuns(w0: number, steps = RUN_STEPS, eta = ETA): { gd: number[]; newton: number[] } {
  const gd = [w0];
  const nt = [w0];
  for (let k = 0; k < steps; k++) {
    gd.push(gdStep(gd[k], eta));
    nt.push(newtonStep(nt[k]));
  }
  return { gd, newton: nt };
}

// ───────────────────────────── input ─────────────────────────────

export type TaylorInput = { story: 'fits'; fn: FnId; a: number } | { story: 'newton'; x0: number } | { story: 'step'; w0: number };
export type Story = TaylorInput['story'];

export const NEWTON_RANGE = { min: 0.5, max: 4, step: 0.5 } as const;
export const STEP_RANGE = { min: -0.5, max: 4.5, step: 0.5 } as const;
/** Newton steps drawn one per frame (every start on the grid needs at least this many). */
export const NEWTON_FRAMES = 5;

const pseudocode = [
  'pick a point a on the curve',
  'flat:     T₀(x) = f(a)',
  'tangent:  T₁(x) = T₀(x) + f′(a)(x − a)',
  'bend:     f″(a), how fast f′ changes',
  'parabola: T₂(x) = T₁(x) + ½f″(a)(x − a)²',
  'error at a + d shrinks like d, d², d³',
  'newton: x ← x − f(x) / f′(x)',
  'until a step is below 10⁻¹²',
  'gradient: w ← w − η·L′(w)',
  'newton:   w ← w − L′(w) / L″(w)',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (k: number) => [...String(k)].map((c) => SUB[Number(c)]).join('');
const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });
/** Small numbers in scientific form, with a true minus sign. */
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sci = (v: number, digits = 6) => {
  if (v === 0 || Math.abs(v) >= 10 ** -digits) return fmt(v, digits);
  const [m, e] = v.toExponential(1).split('e');
  return `${m.replace('-', '−')}×10${[...e.replace('+', '')].map((c) => SUP[c]).join('')}`;
};

function sample(g: (x: number) => number, from: number, to: number, n = 80, digits = 2): Vec[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const x = from + ((to - from) * k) / n;
    return [round(x, 4), round(g(x), digits)] as Vec;
  });
}

// ───────────────────────────── story 1: the fits ─────────────────────────────

const ORDER_NAME = ['flat line', 'tangent', 'parabola'] as const;
const ORDER_TONE = [1, 2, 3] as const;

function* fits(id: FnId, a: number): Generator<Frame<PlotState>> {
  const fn = FUNCTIONS[id];
  const fa = fn.f(a);
  const f1 = fn.df(a);
  const f2 = fn.d2f(a);
  const T = ([0, 1, 2] as Order[]).map((o) => taylorPoly(fn, a, o));
  const d = GAPS[0];
  const P: Vec = [a, round(fa, 2)];
  const curve: Shape = { kind: 'path', id: 'f', points: sample(fn.f, fn.from, fn.x.max, 120), label: fn.formula };
  const point: Shape = { kind: 'point', id: 'P', at: P, mark: 'key', label: 'P', size: 'lg' };
  const fit = (o: Order, faint = false): Shape =>
    o === 2
      ? { kind: 'path', id: 'fit2', points: sample(T[2], fn.x.min, fn.x.max), tone: 3, label: 'parabola', dashed: faint, faint }
      : { kind: 'line', id: `fit${o}`, through: P, dir: [1, o === 0 ? 0 : round(f1, 4)], tone: ORDER_TONE[o], label: ORDER_NAME[o], dashed: faint };
  const bar = (o: Order, x: number): Shape => ({ kind: 'path', id: `bar${o}`, points: [[round(x, 4), round(T[o](x), 2)], [round(x, 4), round(fn.f(x), 2)]], tone: ORDER_TONE[o] });
  const plane = (label: string, shapes: Shape[]): PlanePart => ({
    kind: 'plane',
    id: 'plane',
    label,
    x: fn.x,
    y: fn.y,
    equal: false,
    shapes: [curve, ...shapes, point],
    handles: [{ id: 'a', at: P, label: 'P, the point a', mark: 'key', step: A_STEP, min: [fn.aMin, -Infinity], max: [fn.aMax, Infinity] }],
  });
  const slopePlane = (shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'slope', label: `Slope f′(x) = ${fn.d1}`, x: fn.x, y: fn.dy, equal: false, shapes, handles: [] });
  const errAt = (o: Order, dd: number) => fitError(fn, a, o, dd);
  const errItems = (dd: number, orders: Order[] = [0, 1, 2]): Readout[] =>
    orders.map((o) => ({ id: `e${o}`, label: `${ORDER_NAME[o]} misses by`, value: fmt(errAt(o, dd), 4), tone: ORDER_TONE[o] }));
  const vars = { a, 'f(a)': round(fa, 3), "f′(a)": round(f1, 3), 'f″(a)': round(f2, 3) };
  const x1 = a + d;
  const at = `x = a + ${fmt(d)} = ${fmt(x1)}`;
  const side = (o: Order, x: number) => (T[o](x) > fn.f(x) ? 'Above the curve' : 'Below the curve');
  const bends = f2 > 0 ? 'up' : 'down';
  const table = errorTable(fn, a);

  // 0: the point.
  yield plotFrame([plane(`f(x) = ${fn.formula} near P`, []), readouts([{ id: 'a', label: 'a', value: fmt(a) }, { id: 'fa', label: 'f(a)', value: fmt(fa, 3), mark: 'key' }])], {
    line: 0,
    note: `How well can simpler shapes copy f(x) = ${fn.formula} near P = (${fmt(a)}, ${fmt(fa, 3)})? The simplest guess keeps only the height there: the flat line y = f(a). Drag P to move it.`,
    vars,
    checkpoint: askInOrder(`At ${at}, will the flat line be above or below the curve?`, ['Above the curve', 'Below the curve'], side(0, x1)),
  });

  // 1: the flat guess.
  yield plotFrame([plane('The flat guess T₀', [fit(0), bar(0, x1)]), readouts(errItems(d, [0]))], {
    line: 1,
    note: `The flat guess T₀(x) = ${fmt(fa, 3)} is exact at P but ignores the slope: at ${at} it misses the curve by ${fmt(errAt(0, d), 3)}. Tilt it to match the slope f′(a) = ${fmt(f1, 3)} and you get the tangent line.`,
    vars,
    checkpoint: askInOrder(`At ${at}, will the tangent be above or below the curve?`, ['Above the curve', 'Below the curve'], side(1, x1)),
  });

  // 2: the tangent.
  yield plotFrame([plane('The tangent T₁', [fit(0, true), fit(1), bar(1, x1)]), readouts(errItems(d, [0, 1]))], {
    line: 2,
    note: `The tangent T₁(x) = f(a) + f′(a)(x − a) copies the height and the slope at P. At ${at} it misses by only ${fmt(errAt(1, d), 3)}, against ${fmt(errAt(0, d), 3)} for the flat line. What it misses is the bend: the curve bends ${bends} away from it, and a straight line can't bend.`,
    vars,
    checkpoint: askInOrder(`Move to ${at}. Will the tangent there be steeper, shallower or just as steep as at P?`, ['Steeper', 'Shallower', 'Just as steep'], f2 > 0 ? 'Steeper' : 'Shallower'),
  });

  // 3: the slope changes: the bend.
  const xs = [a - SIDE, a, a + SIDE];
  const slopes = xs.map((x) => fn.df(x));
  const tangents: Shape[] = [0, 2].map((i) => ({ kind: 'line', id: i ? 'tr' : 'tl', through: [xs[i], round(fn.f(xs[i]), 2)], dir: [1, round(slopes[i], 4)], mark: 'compare', label: `slope ${fmt(slopes[i])}` }));
  const dots: Shape[] = xs.map((x, i) => ({ kind: 'point', id: ['sl', 's0', 'sr'][i], at: [x, round(slopes[i], 2)], ...(i === 1 ? { mark: 'key' as const } : { mark: 'compare' as const }), label: `${fmt(slopes[i])}` }));
  yield plotFrame(
    [
      plane('Tangents either side of P', [fit(1), ...tangents]),
      slopePlane(dots),
      readouts(xs.map((x, i) => ({ id: `s${i}`, label: `slope at x = ${fmt(x)}`, value: fmt(slopes[i], 3), ...(i === 1 ? { mark: 'key' as const } : { mark: 'compare' as const }) }))),
    ],
    {
      line: 3,
      note: `The slope itself changes as you move: ${fmt(slopes[0], 3)} at x = ${fmt(xs[0])}, ${fmt(slopes[1], 3)} at P and ${fmt(slopes[2], 3)} at x = ${fmt(xs[2])}. How fast the slope changes is how much the curve bends. It is called the second derivative f″: the slope of the slope.`,
      vars,
      checkpoint: ask('About how fast is the slope changing at P: what is f″(a)?', fmt(f2), [fmt(-f2), '0', fmt(2 * f2), fmt(f2 / 2)]),
    },
  );

  // 4: f″ is the slope of the f′ curve.
  const dCurve: Shape = { kind: 'path', id: 'df', points: sample(fn.df, Math.max(fn.from, id === 'log' ? 0.2 : fn.from), fn.x.max, 120), label: 'f′' };
  yield plotFrame(
    [
      plane('The tangent at P', [fit(1)]),
      slopePlane([dCurve, { kind: 'line', id: 'stan', through: [a, round(f1, 2)], dir: [1, round(f2, 4)], mark: 'found', label: `slope f″(a) = ${fmt(f2)}` }, { kind: 'point', id: 's0', at: [a, round(f1, 2)], mark: 'key' }]),
      readouts([
        { id: 'f1', label: "f′(a)", value: fmt(f1, 3), mark: 'key' },
        { id: 'f2', label: 'f″(a)', value: fmt(f2, 3), mark: 'found' },
      ]),
    ],
    {
      line: 3,
      note: `Plot every tangent's slope and you get the curve f′(x) = ${fn.d1}. f″(a) is the slope of that curve at a: f″(${fmt(a)}) = ${fmt(f2, 3)}${id === 'exp' ? ', since eˣ is its own derivative' : ', since the slope of 1/x is −1/x²'}. ${f2 > 0 ? 'It is positive: the slope grows, so the curve bends up.' : 'It is negative: the slope shrinks, so the curve bends down.'}`,
      vars,
      checkpoint: ask(`A parabola can bend. Adding ½f″(a)(x − a)² to the tangent gives it P's bend. How much does that add at ${at}?`, fmt(f2 / 8, 3), [fmt(f2 / 4, 3), fmt(f2 / 2, 3), fmt(f2, 3)]),
    },
  );

  // 5: the parabola.
  const xl = a - d;
  const closest = ([0, 1, 2] as Order[]).reduce((best, o) => (errAt(o, -d) < errAt(best, -d) ? o : best), 0 as Order);
  yield plotFrame([plane('The parabola T₂', [fit(0, true), fit(1, true), fit(2), bar(2, x1)]), readouts(errItems(d), 'readouts', `Misses at x = ${fmt(x1)}`)], {
    line: 4,
    note: `Adding ½f″(a)(x − a)² = ${fmt(f2 / 8, 3)} at ${at} gives the parabola T₂. The ½ is there because ½c·x² has slope c·x and bend c, and sliding it sideways to a changes no slopes, so ½c(x − a)² bends by exactly c. It copies P's height, slope and bend, and misses by just ${fmt(errAt(2, d), 4)}.`,
    vars,
    checkpoint: askInOrder(`On the other side, at x = a − ${fmt(d)} = ${fmt(xl)}, which is closest to the curve?`, ['The flat line', 'The tangent', 'The parabola'], ['The flat line', 'The tangent', 'The parabola'][closest]),
  });

  // 6: all three on the other side.
  const ratio = (o: Order, k: number) => table[o].ratios[k];
  const times = (r: number) => `About ${nearestPower(r)} times`;
  const TIMES = ['About 2 times', 'About 4 times', 'About 8 times'];
  yield plotFrame([plane('All three, left of P', [fit(0), fit(1), fit(2), bar(0, xl), bar(1, xl), bar(2, xl)]), readouts(errItems(-d), 'readouts', `Misses at x = ${fmt(xl)}`)], {
    line: 4,
    note: `At x = ${fmt(xl)} the flat line misses by ${fmt(errAt(0, -d), 3)}, the tangent by ${fmt(errAt(1, -d), 3)} and the parabola by ${fmt(errAt(2, -d), 4)}. Each extra term copies one more thing about f at P, so the fit hugs the curve for longer.`,
    vars,
    checkpoint: askInOrder(`Halve the gap to d = ${fmt(GAPS[1])}. About how many times smaller will the tangent's miss get?`, TIMES, times(ratio(1, 0))),
  });

  // 7 and 8: halving the gap.
  const halving = (k: 0 | 1): Readout[] =>
    table.map((row) => ({
      id: `r${row.order}`,
      label: `${ORDER_NAME[row.order]}: ${fmt(row.errors[k], 4)} → ${fmt(row.errors[k + 1], 4)}`,
      value: `÷ ${fmt(row.ratios[k], 1)}`,
      tone: ORDER_TONE[row.order],
    }));
  const x2 = a + GAPS[1];
  yield plotFrame([plane(`Closer in: d = ${fmt(GAPS[1])}`, [fit(0), fit(1), fit(2), bar(0, x2), bar(1, x2), bar(2, x2)]), readouts(halving(0), 'readouts', `d = ${fmt(GAPS[0])} → ${fmt(GAPS[1])}`)], {
    line: 5,
    note: `The tangent's miss falls ${fmt(ratio(1, 0), 1)} times, from ${fmt(table[1].errors[0], 4)} to ${fmt(table[1].errors[1], 4)}. The flat line's falls ${fmt(ratio(0, 0), 1)} times and the parabola's ${fmt(ratio(2, 0), 1)} times. Halving d halves d, quarters d² and cuts d³ by 8: the misses shrink like d, d² and d³.`,
    vars,
    checkpoint: askInOrder(`Halve again, to d = ${fmt(GAPS[2], 3)}. About how many times smaller will the parabola's miss get?`, TIMES, times(ratio(2, 1))),
  });

  const x3 = a + GAPS[2];
  yield plotFrame([plane(`Closer still: d = ${fmt(GAPS[2], 3)}`, [fit(0), fit(1), fit(2), bar(0, x3), bar(1, x3), bar(2, x3)]), readouts(halving(1), 'readouts', `d = ${fmt(GAPS[1])} → ${fmt(GAPS[2], 3)}`)], {
    line: 5,
    note: `About ${fmt(ratio(2, 1), 1)} times: the parabola's miss is down to ${fmt(table[2].errors[2], 5)}. Close to P each extra term buys one more power of d, which is why a tangent is such a good guess close up, and a parabola better still.`,
    vars,
  });

  // 9: the recap.
  yield plotFrame(
    [
      plane('Taylor approximations at P', [fit(0), fit(1), fit(2)]),
      readouts([
        { id: 'fa', label: 'f(a)', value: fmt(fa, 3), tone: 1 },
        { id: 'f1', label: "f′(a)", value: fmt(f1, 3), tone: 2 },
        { id: 'f2', label: 'f″(a)', value: fmt(f2, 3), tone: 3 },
      ]),
    ],
    {
      line: 4,
      note: `This is the Taylor approximation: f(a + d) ≈ f(a) + f′(a)·d + ½f″(a)·d². Newton's method uses the first two terms to find where a curve crosses zero, and the whole parabola is how an optimiser can choose its step.`,
      vars,
    },
  );
}

// ───────────────────────────── story 2: Newton's method for √2 ─────────────────────────────

const ROOT = Math.SQRT2;
const sq = (x: number) => x * x - 2;
const NX: Axis = { min: -0.5, max: 4.5, label: 'x' };
const NY: Axis = { min: -3, max: 15, label: 'f(x)' };
const ZX: Axis = { min: 1.35, max: 1.55, label: 'x' };
const ZY: Axis = { min: -0.2, max: 0.45, label: 'f(x)' };

function* newtonStory(x0: number): Generator<Frame<PlotState>> {
  const xs = sqrtNewton(2, x0);
  const steps = xs.length - 1;
  const dec = xs.map((x) => correctDecimals(x));
  const handle = { id: 'x0', at: [x0, 0] as Vec, label: 'x₀, the first guess', mark: 'key' as const, step: NEWTON_RANGE.step, min: [NEWTON_RANGE.min, 0] as Vec, max: [NEWTON_RANGE.max, 0] as Vec };
  const planes = (label: string, shapes: Shape[], trail: number): PlotPart[] => {
    const base = (axis: Axis): Shape[] => [
      { kind: 'path', id: 'f', points: sample(sq, axis.min, axis.max, 120, 4), label: 'x² − 2' },
      { kind: 'point', id: 'root', at: [round(ROOT, 6), 0], mark: 'found', label: '√2', size: 'sm' },
      ...(trail > 0 ? [{ kind: 'path' as const, id: 'trail', points: xs.slice(0, trail + 1).map((x): Vec => [x, 0]), dots: true, faint: true }] : []),
    ];
    return [
      { kind: 'plane', id: 'plane', label, x: NX, y: NY, equal: false, shapes: [...base(NX), ...shapes, { kind: 'point', id: 'x0', at: [x0, 0], mark: trail ? null : 'key', label: 'x₀' }], handles: [handle] },
      { kind: 'plane', id: 'zoom', label: 'Close up near √2', x: ZX, y: ZY, equal: false, shapes: [...base(ZX), ...shapes], handles: [] },
    ];
  };
  const overshoots = (from: number, to: number) => Math.sign(from - ROOT) * Math.sign(to - ROOT) < 0;
  const OVER = ['It overshoots √2', 'It stops short of √2'];
  const vars = { x0 };

  yield plotFrame([...planes('f(x) = x² − 2 crosses zero at √2', [{ kind: 'path', id: 'drop', points: [[x0, 0], [x0, sq(x0)]], dashed: true }], 0), readouts([{ id: 'x0', label: 'x₀', value: fmt(x0), mark: 'key' }, { id: 'f', label: 'f(x₀)', value: fmt(sq(x0), 4) }])], {
    line: 6,
    note: `To find √2 with no square-root button, find where f(x) = x² − 2 crosses zero. Start from a guess x₀ = ${fmt(x0)}, where f(x₀) = ${fmt(sq(x0), 3)}. Near x₀ the curve looks like its tangent, and a straight line's zero is easy to find. Drag x₀ to start elsewhere.`,
    vars,
    checkpoint: askInOrder('Follow the tangent at x₀ down to where it crosses zero. Will it overshoot √2 or stop short of it?', OVER, overshoots(x0, xs[1]) ? OVER[0] : OVER[1]),
  });

  for (let k = 0; k < NEWTON_FRAMES; k++) {
    const i = Math.min(k, steps - 1);
    const x = xs[i];
    const next = xs[i + 1];
    const fx = sq(x);
    const step = Math.abs(next - x);
    const stops = i === steps - 1;
    const shapes: Shape[] = [
      { kind: 'line', id: 'tan', through: [x, fx], dir: [1, 2 * x], tone: 2, label: 'tangent' },
      { kind: 'point', id: 'cur', at: [x, fx], mark: 'key', label: `x${sub(i)}` },
      { kind: 'path', id: 'drop', points: [[next, 0], [next, sq(next)]], dashed: true },
      { kind: 'point', id: 'next', at: [next, 0], mark: 'compare', label: `x${sub(i + 1)}` },
    ];
    const after = xs[i + 2];
    const q = (() => {
      if (k === 0 && after !== undefined)
        return ask(`Where will the tangent at x₁ cross zero? (x₂ = ?)`, fmt(after, 3), [fmt(2 / next, 3), fmt(next - sq(next), 3), fmt(next + sq(next) / (2 * next), 3), fmt(next, 3)]);
      if ((k === 1 || k === 2) && after !== undefined) {
        const d = dec[i + 1];
        if (d === 0) return askInOrder(`Will x${sub(i + 2)} be above or below √2?`, ['Above √2', 'Below √2'], after > ROOT ? 'Above √2' : 'Below √2');
        return ask(`x${sub(i + 1)} has ${d} correct decimal place${d === 1 ? '' : 's'}. How many will x${sub(i + 2)} have?`, String(dec[i + 2]), [2 * d, d + 1, d, 4 * d, 3 * d, 2 * d + 1].map(String));
      }
      if (k === 3 && after !== undefined)
        return askInOrder(`After the next step, will x have moved by less than 10⁻¹², so that it is time to stop?`, ['Yes', 'No'], Math.abs(after - next) < STOP ? 'Yes' : 'No');
      return undefined;
    })();
    yield plotFrame(
      [
        ...planes(`Newton step ${k + 1}`, shapes, i + 1),
        readouts([
          { id: 'x', label: `x${sub(i)}`, value: fmt(x, 12), mark: 'key' },
          { id: 'f', label: `f(x${sub(i)})`, value: sci(fx, 12) },
          { id: 'df', label: `f′(x${sub(i)}) = 2x${sub(i)}`, value: fmt(2 * x, 12) },
          { id: 'next', label: `x${sub(i + 1)}`, value: fmt(next, 12), mark: 'compare' },
          { id: 'dec', label: `correct decimals of x${sub(i + 1)}`, value: String(dec[i + 1]) },
        ]),
      ],
      {
        line: stops ? 7 : 6,
        note:
          k > i
            ? `The run has already stopped: x${sub(steps)} = ${fmt(xs[steps], 12)} agrees with √2 to all ${MAX_DECIMALS} decimals a computer number holds.`
            : `The tangent at x${sub(i)} = ${fmt(x, 9)} has slope 2x = ${fmt(2 * x, 6)}, so it reaches zero ${sci(Math.abs(fx / (2 * x)), 6)} to the ${fx > 0 ? 'left' : 'right'}: x${sub(i + 1)} = x${sub(i)} − f(x${sub(i)})/f′(x${sub(i)}) = ${fmt(next, 12)}, with ${dec[i + 1]} correct decimal place${dec[i + 1] === 1 ? '' : 's'}.${
                stops ? ` That step moved x by ${sci(step, 12)}, below 10⁻¹², so stop.` : ''
              }`,
        vars: { ...vars, k: i, x: x, next },
        checkpoint: q,
      },
    );
  }

  // The whole run.
  const trail = forgotTheTwo(2, x0, 4);
  yield plotFrame(
    [
      ...planes('Every Newton iterate', [{ kind: 'point', id: 'next', at: [xs[steps], 0], mark: 'found', label: `x${sub(steps)}` }], steps),
      readouts(
        xs.map((x, k) => ({ id: `x${k}`, label: `x${sub(k)}`, value: `${fmt(x, 12)} · ${dec[k]} decimal${dec[k] === 1 ? '' : 's'}`, ...(k === steps ? { mark: 'found' as const } : {}) })),
        'readouts',
        'Every iterate',
      ),
    ],
    {
      line: 7,
      note: `Correct decimals went ${dec.join(', ')}${dec[steps] === MAX_DECIMALS ? ` (${MAX_DECIMALS} is all a computer number holds)` : ''}. Once close, each step roughly doubles them: the new error is about the old error squared, divided by 2x. The run stopped after ${steps} steps, when a step moved x by less than 10⁻¹².`,
      vars,
      checkpoint: askInOrder(`Suppose you forget the 2 and use f′(x) = x. Starting from x₀ = ${fmt(x0)}, what happens?`, ['It still reaches √2', 'It bounces between two values', 'It runs off to infinity'], 'It bounces between two values'),
    },
  );

  yield plotFrame(
    [
      ...planes(
        'Forgetting the 2: slope x instead of 2x',
        [
          { kind: 'line', id: 'tan', through: [x0, sq(x0)], dir: [1, x0], mark: 'reject', label: 'slope x' },
          { kind: 'path', id: 'bounce', points: trail.map((x): Vec => [x, 0]), dots: true, mark: 'reject' },
          { kind: 'point', id: 'next', at: [trail[1], 0], mark: 'reject', label: `${fmt(trail[1], 3)}` },
        ],
        0,
      ),
      readouts(
        trail.map((x, k) => ({ id: `w${k}`, label: `x${sub(k)} with slope x`, value: fmt(x, 6), mark: 'reject' as const })),
        'readouts',
        'Forgetting the 2',
      ),
    ],
    {
      line: 6,
      note: `With slope x instead of 2x the line is too shallow: x ← x − (x² − 2)/x = 2/x. From ${fmt(x0)} it lands at ${fmt(trail[1], 3)}, then back at ${fmt(trail[2], 3)}, and bounces between the two forever. If a Newton loop never settles, check the derivative first.`,
      vars,
    },
  );
}

// ───────────────────────────── story 3: the step an optimiser takes ─────────────────────────────

const LX: Axis = { min: -1, max: 5, label: 'w' };
const LY: Axis = { min: -1, max: 17, label: 'L(w)' };

function* stepStory(w0: number): Generator<Frame<PlotState>> {
  const L0 = loss(w0);
  const g = dLoss(w0);
  const k = d2Loss(w0);
  const runs = descentRuns(w0);
  const gd1 = runs.gd[1];
  const nt1 = runs.newton[1];
  const dist = (w: number) => Math.abs(w - W_STAR);
  const t0 = dist(w0);
  const curve: Shape = { kind: 'path', id: 'L', points: sample(loss, LX.min, LX.max, 120), label: 'L' };
  const minimum: Shape = { kind: 'point', id: 'min', at: [W_STAR, 0], mark: 'found', label: 'minimum', size: 'sm' };
  const start: Shape = { kind: 'point', id: 'w0', at: [w0, L0], mark: 'key', label: 'w₀', size: 'lg' };
  const tangent: Shape = { kind: 'line', id: 'tan', through: [w0, L0], dir: [1, g], tone: 2, dashed: true, label: 'tangent' };
  const handle = { id: 'w0', at: [w0, L0] as Vec, label: 'w₀, where the optimiser starts', mark: 'key' as const, step: STEP_RANGE.step, min: [STEP_RANGE.min, -Infinity] as Vec, max: [STEP_RANGE.max, Infinity] as Vec };
  const distPlane = (upTo: number): PlanePart => ({
    kind: 'plane',
    id: 'dist',
    label: 'Distance from the minimum, |w − 2|',
    x: { min: 0, max: RUN_STEPS, label: 'step' },
    y: { min: 0, max: round(t0 * 1.1, 2), label: '|w − 2|' },
    equal: false,
    shapes:
      upTo === 0
        ? [{ kind: 'point', id: 'start', at: [0, t0], mark: 'key' }]
        : [
            { kind: 'path', id: 'gdd', points: runs.gd.slice(0, upTo + 1).map((w, i): Vec => [i, dist(w)]), dots: true, tone: 4, label: 'gradient' },
            { kind: 'path', id: 'ntd', points: runs.newton.slice(0, upTo + 1).map((w, i): Vec => [i, dist(w)]), dots: true, tone: 3, label: 'Newton' },
          ],
    handles: [],
  });
  const plane = (label: string, shapes: Shape[], upTo: number): PlotPart[] => [
    { kind: 'plane', id: 'plane', label, x: LX, y: LY, equal: false, shapes: [curve, minimum, ...shapes, start], handles: [handle] },
    distPlane(upTo),
  ];
  const vars = { w0, η: ETA };
  const left = g > 0;
  const way = left ? 'Left, to smaller w' : 'Right, to larger w';
  const drop = (id: string, w: number, q: (w: number) => number, tone: 3 | 4): Shape => ({ kind: 'path', id, points: [[w, q(w)], [w, loss(w)]], dashed: true, tone });
  const gdPar: Shape = { kind: 'path', id: 'gdpar', points: sample(gdParabola(w0), LX.min, LX.max, 80, 4), tone: 4, dashed: true, label: 'bend 1/η' };
  const tPar: Shape = { kind: 'path', id: 'tpar', points: sample(taylorParabola(w0), LX.min, LX.max, 80, 4), tone: 3, label: 'Taylor parabola' };
  const land = (id: string, w: number, tone: 3 | 4, label: string): Shape => ({ kind: 'point', id, at: [w, loss(w)], tone, label });
  const closer = (n: number) => (dist(runs.newton[n]) < dist(runs.gd[n]) ? `Newton's w${sub(n)}` : `Gradient descent's w${sub(n)}`);
  const whichQ = (n: number) => askInOrder(`After step ${n}, which will be closer to the minimum at w = 2?`, [`Gradient descent's w${sub(n)}`, `Newton's w${sub(n)}`], closer(n));
  /** How much gradient descent's distance to the minimum is multiplied by at step n. */
  const shrink = (n: number) => dist(runs.gd[n]) / dist(runs.gd[n - 1]);
  const factorQ = (n: number) => {
    const r = shrink(n);
    const near = SHRINK_CHOICES.reduce((best, c) => (Math.abs(c.value - r) < Math.abs(best.value - r) ? c : best));
    return askInOrder(
      `At step ${n}, about what will gradient descent's distance to the minimum be multiplied by?`,
      SHRINK_CHOICES.map((c) => c.label),
      near.label,
    );
  };

  yield plotFrame([...plane('A loss L(w) that is not a parabola', [], 0), readouts([{ id: 'w0', label: 'w₀', value: fmt(w0), mark: 'key' }, { id: 'L', label: 'L(w₀)', value: fmt(L0, 4) }])], {
    line: 8,
    note: `Training a model means walking downhill on a loss. This L(w) = (w − 2)² + ¼(w − 2)⁴ is lowest at w = 2, but an optimiser standing at w₀ = ${fmt(w0)} only knows L and its slopes there. Drag w₀ to start elsewhere.`,
    vars,
    checkpoint: askInOrder('Which way should w move to go downhill?', ['Left, to smaller w', 'Right, to larger w'], way),
  });

  yield plotFrame([...plane('The tangent says which way', [tangent], 0), readouts([{ id: 'g', label: "L′(w₀)", value: fmt(g, 4), tone: 2 }])], {
    line: 8,
    note: `The tangent's slope is L′(w₀) = ${fmt(g, 4)}: uphill to the ${left ? 'right' : 'left'}, so step the other way. But a straight line never bottoms out, so it says which way, not how far. Gradient descent picks a step size η = ${fmt(ETA)} and moves η·L′(w₀).`,
    vars,
    checkpoint: ask('Where does the gradient step w₀ − η·L′(w₀) land?', fmt(gd1, 3), [fmt(w0 - g, 3), fmt(w0 + ETA * g, 3), fmt(w0 - ETA, 3), fmt(nt1, 3)]),
  });

  yield plotFrame(
    [
      ...plane('The gradient step is the bottom of a parabola', [tangent, gdPar, drop('gddrop', gd1, gdParabola(w0), 4), land('gd1', gd1, 4, 'w₁ (gradient)')], 0),
      readouts([
        { id: 'gd1', label: 'gradient step w₁', value: fmt(gd1, 4), tone: 4 },
        { id: 'bend', label: 'its bend 1/η', value: fmt(1 / ETA) },
        { id: 'k', label: 'real bend L″(w₀)', value: fmt(k, 4) },
      ]),
    ],
    {
      line: 8,
      note: `w₁ = ${fmt(w0)} − ${fmt(ETA)}·${fmt(g, 4)} = ${fmt(gd1, 4)}. That is the lowest point of a parabola with L's height and slope at w₀ and a bend of 1/η = ${fmt(1 / ETA)}: gradient descent quietly assumes the loss bends that much. The real bend there is L″(w₀) = 2 + 3(w₀ − 2)² = ${fmt(k, 4)}: the power rule, since sliding a curve sideways by 2 changes no slopes.`,
      vars,
      checkpoint: ask(
        'The Taylor parabola L(w₀) + L′(w₀)d + ½L″(w₀)d², with d = w − w₀, uses the real bend. Its slope L′(w₀) + L″(w₀)d is 0 at its lowest point. At which w is that?',
        fmt(nt1, 3),
        [fmt(gd1, 3), fmt(w0 + g / k, 3), fmt(w0 - k / g, 3), fmt(w0 - g / (2 * k), 3)],
      ),
    },
  );

  const gdCloser = dist(gd1) < dist(nt1);
  yield plotFrame(
    [
      ...plane('The Newton step uses the real bend', [tangent, gdPar, tPar, drop('tdrop', nt1, taylorParabola(w0), 3), land('gd1', gd1, 4, 'w₁ (gradient)'), land('nt1', nt1, 3, 'w₁ (Newton)')], 1),
      readouts([
        { id: 'gd1', label: 'gradient w₁, distance to 2', value: `${fmt(gd1, 4)}, ${fmt(dist(gd1), 4)}`, tone: 4 },
        { id: 'nt1', label: 'Newton w₁, distance to 2', value: `${fmt(nt1, 4)}, ${fmt(dist(nt1), 4)}`, tone: 3 },
      ]),
    ],
    {
      line: 9,
      note: `The lowest point is at d = −L′/L″, so w₁ = w₀ − L′(w₀)/L″(w₀) = ${fmt(w0)} − ${fmt(g, 4)}/${fmt(k, 4)} = ${fmt(nt1, 4)}: the Newton step, Newton's method aimed at the zero of the slope L′. ${
        gdCloser
          ? `This far out the quartic part bends L hard, so the parabola's bottom comes too soon and this time the gradient step lands closer: ${fmt(dist(gd1), 3)} from the minimum against ${fmt(dist(nt1), 3)}.`
          : `It lands ${fmt(dist(nt1), 3)} from the minimum, against ${fmt(dist(gd1), 3)} for the gradient step.`
      }`,
      vars,
      checkpoint: whichQ(2),
    },
  );

  for (let n = 2; n <= RUN_STEPS; n++) {
    const gw = runs.gd[n];
    const nw = runs.newton[n];
    const lastN = runs.newton[n - 1];
    const ahead = dist(nw) < dist(gw);
    const ratios = Array.from({ length: n - 1 }, (_, j) => fmt(shrink(j + 2), 2));
    yield plotFrame(
      [
        ...plane(
          `After ${n} steps each`,
          [
            { kind: 'path', id: 'tpar', points: sample(taylorParabola(lastN), LX.min, LX.max, 80, 4), tone: 3, faint: true, label: 'Taylor parabola' },
            { kind: 'path', id: 'gdtrail', points: runs.gd.slice(0, n + 1).map((w): Vec => [w, loss(w)]), tone: 4, dots: true, faint: true },
            { kind: 'path', id: 'nttrail', points: runs.newton.slice(0, n + 1).map((w): Vec => [w, loss(w)]), tone: 3, dots: true, faint: true },
            land('gd1', gw, 4, `w${sub(n)} (gradient)`),
            land('nt1', nw, 3, `w${sub(n)} (Newton)`),
          ],
          n,
        ),
        readouts([
          { id: 'gd1', label: `gradient w${sub(n)}, distance to 2`, value: `${fmt(gw, 6)}, ${sci(dist(gw), 6)}`, tone: 4 },
          { id: 'nt1', label: `Newton w${sub(n)}, distance to 2`, value: `${fmt(nw, 6)}, ${sci(dist(nw), 6)}`, tone: 3 },
        ]),
      ],
      {
        line: 9,
        note:
          n === 2
            ? `Step 2: Newton is ${sci(dist(nw), 4)} from the minimum, gradient descent ${sci(dist(gw), 4)}. ${
                ahead ? "Newton is ahead now: nearer the bottom its parabola matches L's bend better." : 'Gradient descent is still ahead.'
              } A gradient step is η·L′, so it shrinks along with the slope as w nears the bottom.`
            : n < RUN_STEPS
              ? `Step ${n}: gradient descent's distance went from ${sci(dist(runs.gd[n - 1]), 4)} to ${sci(dist(gw), 4)}, about ${ratios[ratios.length - 1]} of it. Newton's is down to ${sci(dist(nw), 4)}: its parabola is now almost exactly L's bend.`
              : `After ${n} steps Newton is ${sci(dist(nw), 4)} from the minimum and gradient descent ${sci(dist(gw), 4)}. From step 2 on, each gradient step kept about ${ratios.join(', then ')} of the distance: near the bottom L″ is about 2, so a step keeps about 1 − η·2 = ${fmt(1 - 2 * ETA)} of it. A gradient step pretends the bend is 1/η; a Newton step measures it with L″ and jumps to the bottom of the parabola. Near a minimum that model is almost exact, which is why second-order methods converge in so few steps (each costs more, as L″ must be found).`,
        vars: { ...vars, step: n },
        checkpoint: n < RUN_STEPS ? factorQ(n + 1) : undefined,
      },
    );
  }
}

function* run(input: TaylorInput): Generator<Frame<PlotState>> {
  if (input.story === 'fits') yield* fits(input.fn, input.a);
  else if (input.story === 'newton') yield* newtonStory(input.x0);
  else yield* stepStory(input.w0);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

export function parseTaylor(text: string): { value: TaylorInput } | { error: string } {
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const xs = numbersIn(text);
  const story = words[0];
  if (story === 'fits') {
    const fn = FN_IDS.find((f) => words.includes(f));
    if (!fn) return { error: 'Name the function: fits exp at 0, or fits log at 1.' };
    const { aMin, aMax } = FUNCTIONS[fn];
    if (xs.length !== 1) return { error: `Give one point a, e.g. fits ${fn} at ${fn === 'exp' ? 0 : 1}.` };
    if (!onStep(xs[0], A_STEP) || xs[0] < aMin || xs[0] > aMax) return { error: `For ${fn}, a is a multiple of 0.25 from ${aMin} to ${aMax}.` };
    return { value: { story: 'fits', fn, a: xs[0] } };
  }
  if (story === 'newton') {
    const { min, max, step } = NEWTON_RANGE;
    if (xs.length !== 1 || !onStep(xs[0], step) || xs[0] < min || xs[0] > max) return { error: `Give a first guess x₀ in halves from ${min} to ${max}, e.g. newton from 3.` };
    return { value: { story: 'newton', x0: xs[0] } };
  }
  if (story === 'step') {
    const { min, max, step } = STEP_RANGE;
    if (xs.length !== 1 || !onStep(xs[0], step) || xs[0] < min || xs[0] > max) return { error: `Give a start w₀ in halves from ${min} to ${max}, e.g. step from 4.` };
    if (xs[0] === W_STAR) return { error: 'w₀ = 2 is already the minimum: start somewhere else.' };
    return { value: { story: 'step', w0: xs[0] } };
  }
  return { error: 'Start with fits, newton or step, e.g. fits exp at 0, newton from 3, or step from 4.' };
}

export function formatTaylor(input: TaylorInput): string {
  if (input.story === 'fits') return `fits ${input.fn} at ${plain(input.a)}`;
  if (input.story === 'newton') return `newton from ${plain(input.x0)}`;
  return `step from ${plain(input.w0)}`;
}

export function dragTaylor(input: TaylorInput, _handle: string, to: Vec): TaylorInput {
  if (input.story === 'fits') {
    const { aMin, aMax } = FUNCTIONS[input.fn];
    return { ...input, a: snap(to[0], A_STEP, aMin, aMax) };
  }
  if (input.story === 'newton') return { ...input, x0: snap(to[0], NEWTON_RANGE.step, NEWTON_RANGE.min, NEWTON_RANGE.max) };
  const w0 = snap(to[0], STEP_RANGE.step, STEP_RANGE.min, STEP_RANGE.max);
  return w0 === W_STAR ? input : { ...input, w0 };
}

const example = (id: string, label: string, input: TaylorInput) => ({ id, label, make: () => input, sized: false });

export const taylor = defineAlgorithm<TaylorInput, PlotState>({
  kind: 'algorithm',
  slug: 'taylor',
  view: 'plot',
  input: {
    examples: [
      example('fits', 'Flat, tangent, parabola: eˣ at 0', { story: 'fits', fn: 'exp', a: 0 }),
      example('fits-log', 'The same fits for ln x at 1', { story: 'fits', fn: 'log', a: 1 }),
      example('newton', 'Newton’s method finds √2', { story: 'newton', x0: 3 }),
      example('newton-left', 'Newton from left of √2', { story: 'newton', x0: 0.5 }),
      example('step', 'The step an optimiser takes', { story: 'step', w0: 4 }),
    ],
    custom: {
      label: 'fits exp at a or fits log at a (a in quarters); newton from x₀; step from w₀ (halves)',
      placeholder: 'e.g. fits exp at 0.5',
      parse: parseTaylor,
      format: formatTaylor,
    },
    drag: dragTaylor,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The curve, and guides' },
    { mark: 'key', label: 'The point you drag: P, x₀ or w₀' },
    { tone: 1, label: 'The flat guess T₀' },
    { tone: 2, label: 'The tangent line' },
    { tone: 3, label: 'The parabola, and the Newton step it gives' },
    { tone: 4, label: 'The gradient-descent step' },
    { mark: 'compare', label: 'Neighbouring tangents; where a tangent lands' },
    { mark: 'found', label: 'The root √2, the minimum, f″ as a slope' },
    { mark: 'reject', label: 'Forgetting the 2 in f′(x) = 2x' },
  ],
  run,
  content: {
    idea: 'Near a point a, a smooth curve looks like its tangent line f(a) + f′(a)(x − a), and even more like the parabola that adds ½f″(a)(x − a)², where f″ (the slope of the slope) says how much it bends. Newton’s method finds a root by following the tangent down to zero, again and again; aimed at a loss’s slope, the same parabola gives the Newton step w − L′(w)/L″(w).',
    invariant: 'Each fit matches f at a in one more way (height, slope, bend), and its miss at a + d shrinks like d, d² or d³: halving d halves, quarters or cuts by 8 the error. Newton’s error is squared each step once close (e ← e²/2x for √2), so its correct decimals roughly double. A gradient step is the lowest point of a parabola with bend 1/η.',
    whenToUse: 'Taylor approximations are how calculators, physics engines and error estimates replace a hard function by an easy one near a point. Newton’s method computes square roots and solves equations in a few steps from a good guess. In optimisation, the quadratic model explains the step size: second-order methods (Newton, and cheaper approximations of it) use the real bend.',
    traits: [
      { label: 'Errors shrink like d, d², d³', good: null },
      { label: 'Newton: digits double once close', good: true },
      { label: 'Needs the derivative right (forget the 2 and it bounces)', good: false },
      { label: 'Far from the answer the model can mislead', good: false },
    ],
    experiments: [
      { example: 'fits', prompt: 'Drag P to the right. The errors grow, but do the ratios when d halves (about 2, 4 and 8) change?' },
      { example: 'fits-log', prompt: 'ln x bends down. Predict which side of the curve the tangent and the parabola fall on before you step.' },
      { example: 'newton', prompt: 'Drag x₀ to 1.5, close to √2. How many steps does the run need now?' },
      { example: 'newton-left', prompt: 'From left of √2 the first tangent overshoots. Does any later step overshoot?' },
      { example: 'step', prompt: 'Drag w₀ to 3. Which optimiser lands closer after one step now?' },
    ],
  },
});

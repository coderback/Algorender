import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Axis, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

export type FnId = 'square' | 'cubic' | 'sine' | 'exp' | 'abs';
export type DerivativeInput = { fn: FnId; a: number };

type Fn = {
  formula: string;
  /** The derivative's formula, for narration. */
  dFormula: string;
  f: (x: number) => number;
  /** f′(x), or null where it doesn't exist. */
  df: (x: number) => number | null;
  x: Axis;
  y: Axis;
  dy: Axis;
};

export const FUNCTIONS: Record<FnId, Fn> = {
  square: { formula: 'x²', dFormula: '2x', f: (x) => x * x, df: (x) => 2 * x, x: { min: -3, max: 3 }, y: { min: -1, max: 9 }, dy: { min: -6.5, max: 6.5 } },
  cubic: {
    formula: 'x³/3 − x',
    dFormula: 'x² − 1',
    f: (x) => x ** 3 / 3 - x,
    df: (x) => x * x - 1,
    x: { min: -3, max: 3 },
    y: { min: -6.5, max: 6.5 },
    dy: { min: -1.5, max: 8.5 },
  },
  sine: { formula: 'sin x', dFormula: 'cos x', f: Math.sin, df: Math.cos, x: { min: -3.5, max: 3.5 }, y: { min: -1.5, max: 1.5 }, dy: { min: -1.5, max: 1.5 } },
  exp: { formula: 'eˣ', dFormula: 'eˣ', f: Math.exp, df: Math.exp, x: { min: -3, max: 2 }, y: { min: -0.5, max: 7.5 }, dy: { min: -0.5, max: 7.5 } },
  abs: { formula: '|x|', dFormula: '−1 left of 0, +1 right of 0', f: Math.abs, df: (x) => (x === 0 ? null : Math.sign(x)), x: { min: -3, max: 3 }, y: { min: -0.5, max: 3.5 }, dy: { min: -1.5, max: 1.5 } },
};
const FN_IDS = Object.keys(FUNCTIONS) as FnId[];

const HS = [2, 1, 0.5, 0.25, 0.1, 0.01];
const LEFT_H = -0.01;
const SWEEP = 10;
/** Slopes within this of 0 count as flat. */
const FLAT = 0.05;

const pseudocode = [
  'pick a point P = (a, f(a))',
  'Q ← (a + h, f(a + h))',
  'slope ← (f(a + h) − f(a)) / h',
  'f′(a) ← the slope as h → 0',
  'repeat at every x: the graph of f′',
];

const secantSlope = (fn: Fn, a: number, h: number) => (fn.f(a + h) - fn.f(a)) / h;

function curve(fn: Fn, g: (x: number) => number, axis: Axis): Vec[] {
  const n = 120;
  return Array.from({ length: n + 1 }, (_, k) => {
    const x = axis.min + ((axis.max - axis.min) * k) / n;
    return [x, g(x)] as Vec;
  });
}

function planes(fn: Fn, top: Shape[], bottom: Shape[], handleAt: number | null): PlotPart[] {
  const f: PlanePart = {
    kind: 'plane',
    id: 'plane',
    label: `f(x) = ${fn.formula}`,
    x: fn.x,
    y: fn.y,
    equal: false,
    shapes: [{ kind: 'path', id: 'f', points: curve(fn, fn.f, fn.x) }, ...top],
    handles:
      handleAt == null
        ? []
        : [{ id: 'a', at: [handleAt, fn.f(handleAt)], label: 'P', mark: 'key', step: 0.1, min: [fn.x.min, -Infinity], max: [fn.x.max, Infinity] }],
  };
  const d: PlanePart = {
    kind: 'plane',
    id: 'slope',
    label: 'Slope f′(x)',
    x: fn.x,
    y: fn.dy,
    equal: false,
    shapes: bottom,
    handles: [],
  };
  return [f, d];
}

/** Splits a sampled curve where it is undefined, so a jump isn't drawn as a vertical line. */
function pieces(points: readonly Vec[]): Vec[][] {
  const out: Vec[][] = [[]];
  for (const p of points) {
    if (Number.isFinite(p[1])) out[out.length - 1].push(p);
    else if (out[out.length - 1].length) out.push([]);
  }
  return out.filter((piece) => piece.length > 1);
}

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });

const direction = (s: number) => (Math.abs(s) < FLAT ? 'Flat' : s > 0 ? 'Uphill' : 'Downhill');

function* run({ fn: id, a }: DerivativeInput): Generator<Frame<PlotState>> {
  const fn = FUNCTIONS[id];
  const fa = fn.f(a);
  const dAt = fn.df(a);
  const left = secantSlope(fn, a, LEFT_H);
  const P: Shape = { kind: 'point', id: 'P', at: [a, fa], mark: 'key', label: 'P' };
  const vars = { a, 'f(a)': round(fa, 3) };
  const trend = (from: number, to: number) => (Math.abs(to - from) < 1e-9 ? 'Stay the same' : to > from ? 'Go up' : 'Go down');
  const OPTIONS = ['Go up', 'Go down', 'Stay the same'];

  yield plotFrame([...planes(fn, [P], [], a), readouts([{ id: 'a', label: 'a', value: fmt(a) }])], {
    line: 0,
    note: `How steep is f(x) = ${fn.formula} exactly at P = (${fmt(a)}, ${fmt(fa)})? A slope needs two points, so start with a second point Q a distance h further along. Drag P to move it.`,
    vars,
    checkpoint:
      dAt == null ? undefined : askInOrder('Is the curve going uphill, downhill or flat at P (left to right)?', ['Uphill', 'Downhill', 'Flat'], direction(dAt)),
  });

  const slopes: number[] = [];
  for (let k = 0; k < HS.length; k++) {
    const h = HS[k];
    const Q: Vec = [a + h, fn.f(a + h)];
    const s = secantSlope(fn, a, h);
    slopes.push(s);
    const next = HS[k + 1];
    yield plotFrame(
      [
        ...planes(
          fn,
          [
            { kind: 'line', id: 'secant', through: [a, fa], dir: [1, s], mark: 'compare', dashed: false },
            { kind: 'path', id: 'rise', points: [[a, fa], [a + h, fa], Q], dashed: true, faint: true },
            P,
            { kind: 'point', id: 'Q', at: Q, mark: 'compare', label: 'Q' },
          ],
          [{ kind: 'point', id: 'slope-a', at: [a, s], mark: 'compare', label: `h = ${fmt(h)}` }],
          a,
        ),
        readouts([
          { id: 'h', label: 'h', value: fmt(h) },
          { id: 'rise', label: 'rise', value: fmt(Q[1] - fa, 4) },
          { id: 'slope', label: 'slope', value: fmt(s, 4), mark: 'compare' },
        ]),
      ],
      {
        line: 2,
        note:
          k === 0
            ? `With h = ${fmt(h)}, Q = (${fmt(Q[0])}, ${fmt(Q[1])}). The line through P and Q rises ${fmt(Q[1] - fa, 3)} over ${fmt(h)}: slope ${fmt(s, 3)}. But it averages the curve over the whole gap.`
            : `Shrink the gap to h = ${fmt(h)}: Q slides towards P, and the slope is now ${fmt(s, 4)}${Math.abs(s - slopes[k - 1]) < 0.02 ? ', barely changing: it is settling on one value' : ''}.`,
        vars: { ...vars, h, slope: round(s, 4) },
        checkpoint:
          next !== undefined
            ? askInOrder(`When h shrinks to ${fmt(next)}, will the slope go up, go down or stay the same?`, OPTIONS, trend(s, secantSlope(fn, a, next)))
            : askInOrder(
                `Approach P from the left instead (h = ${fmt(LEFT_H)}). Will the slope come out about the same?`,
                ['Yes', 'No'],
                Math.abs(left - s) < 0.05 ? 'Yes' : 'No',
              ),
      },
    );
  }

  const right = slopes[slopes.length - 1];
  const agree = Math.abs(left - right) < 0.05;
  yield plotFrame(
    [
      ...planes(
        fn,
        [
          { kind: 'line', id: 'secant', through: [a, fa], dir: [1, left], mark: 'compare' },
          P,
          { kind: 'point', id: 'Q', at: [a + LEFT_H, fn.f(a + LEFT_H)], mark: 'compare', label: 'Q' },
        ],
        [{ kind: 'point', id: 'slope-a', at: [a, left], mark: 'compare', label: `h = ${fmt(LEFT_H)}` }],
        a,
      ),
      readouts([
        { id: 'h', label: 'h', value: fmt(LEFT_H) },
        { id: 'slope', label: 'slope', value: fmt(left, 4), mark: 'compare' },
      ]),
    ],
    {
      line: 2,
      note: agree
        ? `From the left too (h = ${fmt(LEFT_H)}), the slope is ${fmt(left, 3)}: both sides agree, so the curve has one slope at P.`
        : `From the left (h = ${fmt(LEFT_H)}) the slope is ${fmt(left, 3)}, but from the right it was ${fmt(right, 3)}. The two sides disagree.`,
      vars: { ...vars, h: LEFT_H, slope: round(left, 4) },
    },
  );

  const d = dAt;
  yield plotFrame(
    [
      ...planes(
        fn,
        d == null ? [P] : [{ kind: 'line', id: 'secant', through: [a, fa], dir: [1, d], mark: 'found', label: 'tangent' }, P],
        d == null ? [] : [{ kind: 'point', id: 'slope-a', at: [a, d], mark: 'found', label: `f′(${fmt(a)})` }],
        a,
      ),
      readouts(d == null ? [{ id: 'd', label: 'f′(a)', value: 'none' }] : [{ id: 'd', label: 'f′(a)', value: fmt(d, 4), mark: 'found' }]),
    ],
    {
      line: 3,
      note:
        d == null
          ? `|x| has a sharp corner at 0: the slope is −1 just left of it and +1 just right, so no single tangent fits and f′(0) does not exist.`
          : `As h → 0 the secants settle on the tangent line, and its slope is the derivative: f′(${fmt(a)}) = ${fmt(d, 4)}, matching the rule f′(x) = ${fn.dFormula}.`,
      vars: { ...vars, "f′(a)": d == null ? 'none' : round(d, 4) },
    },
  );

  // Sweep: a tangent at evenly spaced points (centred in their slots, so |x| never lands on its corner).
  const xs = Array.from({ length: SWEEP }, (_, k) => fn.x.min + ((k + 0.5) * (fn.x.max - fn.x.min)) / SWEEP);
  const dots: Vec[] = [];
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k];
    const s = fn.df(x)!;
    dots.push([x, s]);
    const nextX = xs[k + 1];
    yield plotFrame(
      [
        ...planes(
          fn,
          [
            { kind: 'line', id: 'secant', through: [x, fn.f(x)], dir: [1, s], mark: 'found' },
            { kind: 'point', id: 'P', at: [x, fn.f(x)], mark: 'key', label: 'P' },
          ],
          [
            { kind: 'path', id: 'df', points: [...dots], dots: true, mark: 'found' },
            { kind: 'point', id: 'slope-a', at: [x, s], mark: 'key' },
          ],
          null,
        ),
        readouts([
          { id: 'x', label: 'x', value: fmt(x) },
          { id: 'd', label: 'f′(x)', value: fmt(s, 3), mark: 'found' },
        ]),
      ],
      {
        line: 4,
        note:
          k === 0
            ? 'Now do the same at every x and plot each tangent’s slope underneath: that new curve is the derivative f′.'
            : `At x = ${fmt(x)} the tangent’s slope is ${fmt(s, 3)}${Math.abs(s) < FLAT ? ', flat: f is at a peak or a valley here' : s > 0 ? ': f is rising' : ': f is falling'}.`,
        vars: { x: round(x, 2), "f′(x)": round(s, 3) },
        checkpoint:
          nextX !== undefined ? askInOrder(`At x = ${fmt(nextX)}, will f be going uphill, downhill or flat?`, ['Uphill', 'Downhill', 'Flat'], direction(fn.df(nextX)!)) : undefined,
      },
    );
  }

  yield plotFrame(
    [
      ...planes(
        fn,
        [],
        pieces(curve(fn, (x) => fn.df(x) ?? NaN, fn.x)).map((points, k): Shape => ({ kind: 'path', id: k ? `df${k}` : 'df', points, mark: 'found', label: k ? undefined : 'f′' })),
        null,
      ),
      readouts([{ id: 'rule', label: 'f′(x)', value: fn.dFormula, mark: 'found' }]),
    ],
    {
      line: 4,
      note: `The derivative of ${fn.formula} is ${fn.dFormula}. Read the two graphs together: f′ is positive where f rises, negative where it falls, and crosses zero at f’s peaks and valleys.`,
      vars: {},
    },
  );
}

const example = (id: string, label: string, input: DerivativeInput) => ({ id, label, make: () => input, sized: false });

export const derivative = defineAlgorithm<DerivativeInput, PlotState>({
  kind: 'algorithm',
  slug: 'derivative',
  view: 'plot',
  input: {
    examples: [
      example('square', 'x²', { fn: 'square', a: 1 }),
      example('cubic', 'x³/3 − x', { fn: 'cubic', a: 0.5 }),
      example('sine', 'sin x', { fn: 'sine', a: 1 }),
      example('exp', 'eˣ', { fn: 'exp', a: 0.5 }),
      example('abs', '|x| at its corner', { fn: 'abs', a: 0 }),
    ],
    custom: {
      label: 'Function (square, cubic, sine, exp, abs) and the point a',
      placeholder: 'e.g. cubic at 0.5',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
        const fn = FN_IDS.find((f) => f === word);
        if (!fn) return { error: 'Start with a function: square, cubic, sine, exp or abs.' };
        const xs = numbersIn(text);
        if (xs.length !== 1) return { error: 'Then give one point a, e.g. cubic at 0.5.' };
        const { x } = FUNCTIONS[fn];
        if (xs[0] < x.min || xs[0] > x.max) return { error: `For ${fn}, a must be between ${x.min} and ${x.max}.` };
        return { value: { fn, a: round(xs[0], 2) } };
      },
      format: ({ fn, a }) => `${fn} at ${plain(a)}`,
    },
    drag: (input, _handle, to) => {
      const { x } = FUNCTIONS[input.fn];
      return { ...input, a: round(Math.min(x.max, Math.max(x.min, to[0])), 2) };
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The curve f' },
    { mark: 'key', label: 'The point P' },
    { mark: 'compare', label: 'Secant through P and Q' },
    { mark: 'found', label: 'Tangent, and the slope it has' },
  ],
  run,
  content: {
    idea: 'The derivative f′(a) is the slope of a curve at a single point. A slope needs two points, so take a second point a gap h away, measure the slope of the line through both, and shrink h towards 0: the slopes settle on one number, the slope of the tangent line.',
    invariant: 'f′(a) = lim (f(a + h) − f(a)) / h as h → 0, from both sides. Where the two sides disagree, as at a corner, there is no derivative. Near a, f(a + h) ≈ f(a) + f′(a)·h: the tangent line is the best straight-line guess.',
    whenToUse: 'Whenever you need to know how sensitive an output is to an input: rates of change, the gradient that gradient descent follows, and the chain rule that backpropagation is built from. The local straight-line guess f(a) + f′(a)·h is behind Newton’s method too.',
    traits: [
      { label: 'Slope of the tangent', good: null },
      { label: 'Zero at peaks and valleys', good: null },
      { label: 'Can fail at corners', good: false },
    ],
    experiments: [
      { example: 'square', prompt: 'For x² the secant slope is 2a + h, so it falls by exactly as much as h does. Predict the slope at h = 0.01.' },
      { example: 'abs', prompt: 'At the corner of |x| the right-hand slopes are all 1 and the left-hand ones −1: no tangent.' },
      { example: 'cubic', prompt: 'Watch f′ cross zero exactly where x³/3 − x has its peak (x = −1) and its valley (x = 1).' },
      { example: 'exp', prompt: 'eˣ is its own derivative: the bottom graph comes out the same shape as the top one.' },
    ],
  },
});

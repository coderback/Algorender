import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Integrals as accumulated area (B5 of the math and ML path). The area under a
// curve is what thin strips add up to: rectangles as tall as the curve at each
// strip's left end, right end or middle, or trapezoids with slanted tops. Left
// and right ends miss by an amount that halves when the strips do (like 1/n);
// middles and trapezoids miss four times less (like 1/n²). Area below the axis
// counts negative, and the accumulated area A(x), traced as x slides, climbs
// exactly as fast as the curve is tall: A′ = f. That is the derivative run in
// reverse, so the power rule run backwards gives areas: x² → x³/3.

// ───────────────────────────── the maths ─────────────────────────────

export type Rule = 'left' | 'right' | 'mid';
type Fn = (x: number) => number;

/** The car's speed t seconds after it pulls away: t² metres per second. */
export const speed: Fn = (t) => t * t;
/** The curve of the accumulate story: below the axis up to 1, above it after. */
export const dip: Fn = (x) => x * x - 1;
/** Its accumulated area from 0, A(x) = x³/3 − x (the derivative visualiser's cubic). */
export const dipArea: Fn = (x) => (x * x * x) / 3 - x;
/** The area under t² from a to b: (b³ − a³)/3. */
export const squareArea = (a: number, b: number) => (b * b * b - a * a * a) / 3;
/** The area under xᵖ from 0 to b: bᵖ⁺¹/(p + 1), the power rule run backwards. */
export const powerArea = (p: number, b: number) => b ** (p + 1) / (p + 1);

/** Where strip i of width w starting at a takes its height. */
export function samplePoint(a: number, w: number, i: number, rule: Rule): number {
  if (rule === 'left') return a + i * w;
  if (rule === 'right') return a + (i + 1) * w;
  return a + (i + 0.5) * w;
}

/** n rectangles under f from a to b, each as tall as f at its left end, right end or middle: Σ f(xᵢ) · Δx. */
export function riemannSum(f: Fn, a: number, b: number, n: number, rule: Rule): number {
  const w = (b - a) / n;
  let total = 0;
  for (let i = 0; i < n; i++) total = total + f(samplePoint(a, w, i, rule));
  return total * w;
}

/** n trapezoids: the end heights count half, every inner height in full, all times Δx. */
export function trapezoidSum(f: Fn, a: number, b: number, n: number): number {
  const w = (b - a) / n;
  let total = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) total = total + f(a + i * w);
  return total * w;
}

export type SumRule = Rule | 'trap';
export const sumBy = (f: Fn, a: number, b: number, n: number, rule: SumRule) => (rule === 'trap' ? trapezoidSum(f, a, b, n) : riemannSum(f, a, b, n, rule));

/** The fewest strips, a power of two, for which a rule misses the area under t² from 0 to b by less than `tol`. */
export function stripsNeeded(rule: SumRule, b: number, tol = TOLERANCE): number {
  const exact = squareArea(0, b);
  let n = 1;
  while (Math.abs(sumBy(speed, 0, b, n, rule) - exact) >= tol) n *= 2;
  return n;
}

/** The strip counts the sums and rules stories step through. */
export const NS = [2, 4, 8, 16] as const;
/** "Close enough" for the strips-needed questions, in metres. */
export const TOLERANCE = 0.01;
/** The finer "close enough" of the rules story, where the middles and trapezoids race the left ends. */
export const FINE = 0.0001;
/** The widths of the thin strip in the accumulate story. */
export const STRIP_H = [0.1, 0.01] as const;
/** Where the accumulate story's sweep stops. */
export const SWEEP = [0.5, 1, 1.5, 2] as const;

export const B_RANGE = { min: 1, max: 3, step: 0.5 } as const;
export const X_RANGE = { min: 0.5, max: 2, step: 0.25 } as const;
export const POWER_RANGE = { min: 0.5, max: 2, step: 0.5 } as const;

export const TIMES = ['About 2 times', 'About 4 times', 'About 8 times'] as const;
/** The power of two (2, 4 or 8) nearest a ratio on a log scale. */
export const nearestTimes = (ratio: number) => TIMES[Math.min(2, Math.max(0, Math.round(Math.log2(ratio)) - 1))];

// ───────────────────────────── input ─────────────────────────────

export type IntegralInput = { story: 'sums'; b: number } | { story: 'rules'; b: number } | { story: 'accumulate'; x: number } | { story: 'power'; b: number };
export type Story = IntegralInput['story'];

const pseudocode = [
  'Δx ← (b − a) / n',
  'for i in 0 .. n − 1:',
  '  x ← a + i·Δx         (left end)',
  '  x ← a + (i + 1)·Δx   (right end)',
  '  x ← a + (i + ½)·Δx   (middle)',
  '  total ← total + f(x)',
  'area ≈ total · Δx',
  'trapezoids: the two ends count ½',
  'A(x) ← signed area from 0 to x',
  'A′(x) = f(x)',
  'area from a to b = F(b) − F(a)',
];
const LINE: Record<SumRule, number> = { left: 2, right: 3, mid: 4, trap: 7 };

// ───────────────────────────── drawing helpers ─────────────────────────────

/** A whole number with thousands marked, the same on every engine: 2048 → 2,048. */
export const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** A time in seconds, in words. */
const secs = (t: number) => `${fmt(t)} second${t === 1 ? '' : 's'}`;
const readouts = (items: Readout[], label = 'Values', id = 'readouts'): PlotPart => ({ kind: 'readouts', id, label, items });

function sample(g: Fn, from: number, to: number, n = 80): Vec[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const x = from + ((to - from) * k) / n;
    return [round(x, 4), round(g(x), 4)] as Vec;
  });
}

/** The region between the curve and the axis from `from` to `to`, as a filled polygon. */
function region(id: string, g: Fn, from: number, to: number, paint: { mark?: 'found' | 'reject' | 'compare'; tone?: 1 | 2 | 3 | 4 }, label?: string): Shape {
  return { kind: 'path', id, points: [[round(from, 4), 0], ...sample(g, from, to, 40), [round(to, 4), 0]], closed: true, fill: true, fillOpacity: 0.35, ...paint, ...(label ? { label } : {}) };
}

const TONE: Record<SumRule, 1 | 2 | 3 | 4> = { left: 1, right: 2, mid: 3, trap: 4 };

/** The rectangles of a rule, keyed by where each starts, so a strip splits in two as n doubles. */
function rects(rule: Rule, f: Fn, a: number, b: number, n: number): Shape {
  const w = (b - a) / n;
  const bars: Bar[] = Array.from({ length: n }, (_, i) => ({
    id: `${rule}${round(a + i * w, 6)}`,
    x0: round(a + i * w, 6),
    x1: round(a + (i + 1) * w, 6),
    y: round(f(samplePoint(a, w, i, rule)), 4),
    tone: TONE[rule],
  }));
  return { kind: 'bars', id: rule, bars };
}

/** The trapezoids, each a closed polygon whose top joins the curve's heights at its two ends. */
function traps(f: Fn, a: number, b: number, n: number): Shape[] {
  const w = (b - a) / n;
  return Array.from({ length: n }, (_, i) => {
    const x0 = round(a + i * w, 6);
    const x1 = round(a + (i + 1) * w, 6);
    return { kind: 'path', id: `trap${x0}`, points: [[x0, 0], [x0, round(f(x0), 4)], [x1, round(f(x1), 4)], [x1, 0]], closed: true, fill: true, fillOpacity: 0.45, tone: 4 } as Shape;
  });
}

/** Heights in a list, as the notes write them. */
const heightsOf = (f: Fn, a: number, b: number, n: number, rule: Rule) => {
  const w = (b - a) / n;
  return Array.from({ length: n }, (_, i) => f(samplePoint(a, w, i, rule)));
};

// ───────────────────────────── story 1: rectangles under a speed curve ─────────────────────────────

function* sums(b: number): Generator<Frame<PlotState>> {
  const f = speed;
  const exact = squareArea(0, b);
  const fb = f(b);
  const X: Axis = { min: 0, max: round(b * 1.08, 2), label: 't (seconds)' };
  const Y: Axis = { min: 0, max: round(fb * 1.12, 2), label: 'speed (m/s)' };
  const curve: Shape = { kind: 'path', id: 'f', points: sample(f, 0, X.max), label: 'speed t²' };
  const end: Shape = { kind: 'path', id: 'end', points: [[b, 0], [b, fb]], dashed: true };
  const handle = { id: 'b', at: [b, fb] as Vec, label: 'b, where the time stops', mark: 'key' as const, step: B_RANGE.step, min: [B_RANGE.min, -Infinity] as Vec, max: [B_RANGE.max, Infinity] as Vec };
  const L = NS.map((n) => riemannSum(f, 0, b, n, 'left'));
  const R = NS.map((n) => riemannSum(f, 0, b, n, 'right'));
  const w = NS.map((n) => b / n);
  const gap = (k: number) => R[k] - L[k];
  const plane = (label: string, shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'plane', label, x: X, y: Y, equal: false, shapes: [...shapes, curve, end, { kind: 'point', id: 'B', at: [b, fb], mark: 'key', label: 'b' }], handles: [handle] });
  /** The sums so far: left ones up to NS[left], right ones (from 4 strips) up to NS[right]. */
  const chart = (left: number, right = left, truth = false): PlanePart => ({
    kind: 'plane',
    id: 'chart',
    label: 'The sums as the strips get thinner',
    x: { min: 0.5, max: NS.length + 0.5, label: 'strips n', ticks: NS.map((n, k) => ({ at: k + 1, label: String(n) })) },
    y: { min: 0, max: round(R[0] * 1.1, 2), label: 'metres' },
    equal: false,
    shapes: [
      ...(truth ? [{ kind: 'line' as const, id: 'exact', through: [0, round(exact, 4)] as Vec, dir: [1, 0] as Vec, mark: 'found' as const, dashed: true, label: `${fmt(exact, 3)} m` }] : []),
      ...(left >= 0 ? [{ kind: 'path' as const, id: 'lpts', points: L.slice(0, left + 1).map((v, k): Vec => [k + 1, round(v, 4)]), dots: true, tone: 1 as const, label: 'left' }] : []),
      ...(right >= 1 ? [{ kind: 'path' as const, id: 'rpts', points: R.slice(1, right + 1).map((v, k): Vec => [k + 2, round(v, 4)]), dots: true, tone: 2 as const, label: 'right' }] : []),
    ],
    handles: [],
  });
  const vars = (n?: number) => ({ b, ...(n ? { n, 'Δt': w[NS.indexOf(n as (typeof NS)[number])] } : {}) });
  const sumText = (n: number, rule: Rule) => {
    const hs = heightsOf(f, 0, b, n, rule).map((h) => fmt(h, 4));
    return `(${hs.join(' + ')}) × ${fmt(b / n, 4)}`;
  };

  // 0: the question.
  yield plotFrame([plane(`Speed t² from 0 to ${secs(b)}`, []), chart(-1), readouts([{ id: 'b', label: 'b', value: `${fmt(b)} s` }, { id: 'vb', label: 'speed at b', value: `${fmt(fb, 3)} m/s` }])], {
    line: null,
    note: `A car pulls away, and t seconds later it is doing t² metres per second. At a steady speed, distance = speed × time: the area of a rectangle under a flat speed graph. This speed keeps changing, so how far does the car go in ${secs(b)}? Cut the time into strips and pretend the speed is steady in each. Drag b to stop the clock elsewhere.`,
    vars: vars(),
    checkpoint: askInOrder(
      'Cut the time into 2 strips, each as tall as the speed at its start (its left end). Will the rectangles’ area be more or less than the distance?',
      ['Less than the distance', 'More than the distance', 'Exactly the distance'],
      'Less than the distance',
    ),
  });

  // 1: two strips, left ends.
  yield plotFrame(
    [
      plane('2 strips, left ends', [rects('left', f, 0, b, 2)]),
      chart(0),
      readouts([
        { id: 'n', label: 'strips n', value: '2' },
        { id: 'w', label: 'Δt = b / n', value: `${fmt(w[0], 4)} s` },
        { id: 'left', label: 'left sum', value: `${fmt(L[0], 3)} m`, tone: 1 },
      ]),
    ],
    {
      line: LINE.left,
      note: `Two strips, each Δt = ${fmt(w[0], 4)} s wide, as tall as the speed at their left ends: ${sumText(2, 'left')} = ${fmt(L[0], 3)} m. The car speeds up during every strip, so each rectangle falls short of the curve: this is an underestimate.`,
      vars: vars(2),
      checkpoint: ask('Cut it into 4 strips instead, again using left ends. What will the area be?', fmt(L[1], 3), [
        fmt(R[1], 3),
        fmt(L[1] / w[1], 3),
        fmt((L[1] / w[1]) * w[0], 3),
      ]),
    },
  );

  // 2: four strips, left ends.
  yield plotFrame(
    [
      plane('4 strips, left ends', [rects('left', f, 0, b, 4)]),
      chart(1, 0),
      readouts([
        { id: 'n', label: 'strips n', value: '4' },
        { id: 'w', label: 'Δt = b / n', value: `${fmt(w[1], 4)} s` },
        { id: 'left', label: 'left sum', value: `${fmt(L[1], 3)} m`, tone: 1 },
      ]),
    ],
    {
      line: LINE.left,
      note: `Four strips of ${fmt(w[1], 4)} s: ${sumText(4, 'left')} = ${fmt(L[1], 3)} m. Each strip is half as wide, so its rectangle hugs the curve more closely and less is missed, but every rectangle still falls short.`,
      vars: vars(4),
      checkpoint: askInOrder('Take each strip’s height from its right end instead, still 4 strips. Will that area be over or under the distance?', ['Over the distance', 'Under the distance'], 'Over the distance'),
    },
  );

  // 3: right ends against left ends.
  yield plotFrame(
    [
      plane('4 strips: right ends behind, left ends in front', [rects('right', f, 0, b, 4), rects('left', f, 0, b, 4)]),
      chart(1),
      readouts([
        { id: 'left', label: 'left sum', value: `${fmt(L[1], 3)} m`, tone: 1 },
        { id: 'right', label: 'right sum', value: `${fmt(R[1], 3)} m`, tone: 2 },
        { id: 'gap', label: 'right − left', value: fmt(gap(1), 4) },
      ]),
    ],
    {
      line: LINE.right,
      note: `With right ends each strip is as fast as the car gets in it, so ${fmt(R[1], 3)} m is too much. The distance is trapped between ${fmt(L[1], 3)} and ${fmt(R[1], 3)}. The two sums share every height but one: the right sum drops the first left height, ${fmt(f(0))}, and adds the last one, ${fmt(fb, 3)}, so they differ by (${fmt(fb, 3)} − ${fmt(f(0))}) × ${fmt(w[1], 4)} = ${fmt(gap(1), 4)}.`,
      vars: vars(4),
      checkpoint: ask('Double to 8 strips. How far apart will the left and right sums be?', fmt(gap(2), 4), [fmt(gap(1), 4), fmt(gap(1) / 4, 4), fmt(fb - f(0), 4)]),
    },
  );

  // 4: eight strips.
  yield plotFrame(
    [
      plane('8 strips', [rects('right', f, 0, b, 8), rects('left', f, 0, b, 8)]),
      chart(2, 2, true),
      readouts([
        { id: 'left', label: 'left sum', value: `${fmt(L[2], 3)} m`, tone: 1 },
        { id: 'right', label: 'right sum', value: `${fmt(R[2], 3)} m`, tone: 2 },
        { id: 'gap', label: 'right − left', value: fmt(gap(2), 4) },
        { id: 'miss', label: 'left sum misses by', value: fmt(exact - L[2], 3), tone: 1 },
      ]),
    ],
    {
      line: LINE.right,
      note: `8 strips: left ${fmt(L[2], 3)} m, right ${fmt(R[2], 3)} m, ${fmt(gap(2), 4)} apart: the gap is (${fmt(fb, 3)} − ${fmt(f(0))}) × Δt, and Δt went from ${fmt(w[1], 4)} to ${fmt(w[2], 4)}. Keep going and both close in on ${fmt(exact, 3)} m, the distance (the dashed line; a later story shows why). The left sum still misses by ${fmt(exact - L[2], 3)}.`,
      vars: vars(8),
      checkpoint: askInOrder('Double to 16 strips. About how many times smaller will the left sum’s miss get?', TIMES, nearestTimes((exact - L[2]) / (exact - L[3]))),
    },
  );

  // 5: sixteen strips.
  const tooFew = stripsNeeded('left', b);
  yield plotFrame(
    [
      plane('16 strips', [rects('right', f, 0, b, 16), rects('left', f, 0, b, 16)]),
      chart(3, 3, true),
      readouts(
        NS.map((n, k) => ({ id: `n${n}`, label: `${n} strips: left, right`, value: `${fmt(L[k], 3)}, ${fmt(R[k], 3)}` })),
        'The sums',
      ),
      readouts(
        NS.map((n, k) => ({ id: `m${n}`, label: `${n} strips`, value: fmt(exact - L[k], 3), tone: 1 })),
        'Left sum misses by',
        'misses',
      ),
    ],
    {
      line: 6,
      note: `16 strips: left ${fmt(L[3], 3)} m, missing by ${fmt(exact - L[3], 3)}, against ${fmt(exact - L[2], 3)} at 8 strips. Each doubling roughly halves the miss: it shrinks like 1/n. That is slow: to miss by less than ${TOLERANCE} m this way takes ${grouped(tooFew)} strips.`,
      vars: vars(16),
    },
  );

  // 6: the integral.
  yield plotFrame(
    [
      plane('The area under the curve: the distance', [region('area', f, 0, b, { mark: 'found' }, `${fmt(exact, 3)} m`)]),
      chart(3, 3, true),
      readouts([
        { id: 'exact', label: 'distance, the integral', value: `${fmt(exact, 3)} m`, mark: 'found' },
        { id: 'left16', label: 'left sum, 16 strips', value: `${fmt(L[3], 3)} m`, tone: 1 },
        { id: 'right16', label: 'right sum, 16 strips', value: `${fmt(R[3], 3)} m`, tone: 2 },
      ]),
    ],
    {
      line: 6,
      note: `The number both sums settle on as the strips get thinner is the integral of the speed from 0 to ${fmt(b)}, written ∫ t² dt from 0 to ${fmt(b)} = ${fmt(exact, 3)}: the ∫ is a stretched S, for sum, and dt stands for the thin width Δt. Under a speed graph it is the distance travelled.`,
      vars: vars(),
    },
  );
}

// ───────────────────────────── story 2: middles and trapezoids ─────────────────────────────

function* rules(b: number): Generator<Frame<PlotState>> {
  const f = speed;
  const exact = squareArea(0, b);
  const fb = f(b);
  const X: Axis = { min: 0, max: round(b * 1.08, 2), label: 't (seconds)' };
  const Y: Axis = { min: 0, max: round(fb * 1.12, 2), label: 'speed (m/s)' };
  const curve: Shape = { kind: 'path', id: 'f', points: sample(f, 0, X.max), label: 'speed t²' };
  const handle = { id: 'b', at: [b, fb] as Vec, label: 'b, where the time stops', mark: 'key' as const, step: B_RANGE.step, min: [B_RANGE.min, -Infinity] as Vec, max: [B_RANGE.max, Infinity] as Vec };
  const plane = (label: string, shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'plane', label, x: X, y: Y, equal: false, shapes: [...shapes, curve, { kind: 'point', id: 'B', at: [b, fb], mark: 'key', label: 'b' }], handles: [handle] });
  const M = NS.map((n) => riemannSum(f, 0, b, n, 'mid'));
  const T = NS.map((n) => trapezoidSum(f, 0, b, n));
  const L16 = riemannSum(f, 0, b, 16, 'left');
  const mm = M.map((v) => exact - v);
  const tm = T.map((v) => v - exact);
  const misses = (k: number): Readout[] => [
    { id: 'mid', label: `middles, ${NS[k]} strips`, value: `${fmt(M[k], 4)} (miss ${fmt(mm[k], 4)})`, tone: 3 },
    { id: 'trap', label: `trapezoids, ${NS[k]} strips`, value: `${fmt(T[k], 4)} (miss ${fmt(tm[k], 4)})`, tone: 4 },
  ];
  const vars = (n?: number) => ({ b, ...(n ? { n } : {}) });
  const need = { mid: stripsNeeded('mid', b, FINE), trap: stripsNeeded('trap', b, FINE), left: stripsNeeded('left', b, FINE) };
  const mids = heightsOf(f, 0, b, 2, 'mid');
  const w2 = b / 2;

  yield plotFrame(
    [plane('Left ends, 16 strips', [rects('left', f, 0, b, 16)]), readouts([{ id: 'exact', label: 'distance', value: `${fmt(exact, 3)} m`, mark: 'found' }, { id: 'left16', label: 'left sum, 16 strips', value: `${fmt(L16, 3)} m (miss ${fmt(exact - L16, 3)})`, tone: 1 }])],
    {
      line: LINE.left,
      note: `The car covers ${fmt(exact, 3)} m in ${fmt(b)} s, but even 16 left-end rectangles miss that by ${fmt(exact - L16, 3)}: every strip is as slow as its start. A fairer height for each strip is the speed in its middle.`,
      vars: vars(16),
      checkpoint: askInOrder(`With just 2 strips, each as tall as the speed at its middle, will the area miss ${fmt(exact, 3)} m by more or less than 16 left-end strips do?`, ['More', 'Less'], 'Less'),
    },
  );

  yield plotFrame([plane('2 strips, middles', [rects('mid', f, 0, b, 2)]), readouts([...misses(0).slice(0, 1), { id: 'left16', label: 'left sum, 16 strips', value: `miss ${fmt(exact - L16, 3)}`, tone: 1 }])], {
    line: LINE.mid,
    note: `The middles are at ${fmt(w2 / 2, 4)} and ${fmt(1.5 * w2, 4)} s, where the speeds are ${fmt(mids[0], 4)} and ${fmt(mids[1], 4)}: (${fmt(mids[0], 4)} + ${fmt(mids[1], 4)}) × ${fmt(w2, 4)} = ${fmt(M[0], 4)}, missing by ${fmt(mm[0], 4)} with only 2 strips. Each rectangle pokes above the curve on its left half and falls below it on its right half, and the two bits nearly cancel.`,
    vars: vars(2),
    checkpoint: askInOrder(
      'Now slanted tops: join the curve’s heights at each strip’s two ends, making 2 trapezoids. Will their area be over or under the distance?',
      ['Over the distance', 'Under the distance', 'Exactly the distance'],
      'Over the distance',
    ),
  });

  yield plotFrame([plane('2 strips: trapezoids and middles', [...traps(f, 0, b, 2), rects('mid', f, 0, b, 2)]), readouts(misses(0))], {
    line: LINE.trap,
    note: `A trapezoid’s area is its width times the average of its two end heights, so the end heights of the whole run count half: (${fmt(f(0))}/2 + ${fmt(f(w2), 4)} + ${fmt(fb, 3)}/2) × ${fmt(w2, 4)} = ${fmt(T[0], 4)}. The curve bends up, so each straight top runs above it: ${fmt(tm[0], 4)} too much.`,
    vars: vars(2),
    checkpoint: askInOrder(`Double to 4 strips. About how many times smaller will the middles’ miss of ${fmt(mm[0], 4)} get?`, TIMES, nearestTimes(mm[0] / mm[1])),
  });

  yield plotFrame([plane('4 strips: trapezoids and middles', [...traps(f, 0, b, 4), rects('mid', f, 0, b, 4)]), readouts(misses(1))], {
    line: LINE.mid,
    note: `The middles’ miss fell from ${fmt(mm[0], 4)} to ${fmt(mm[1], 4)}, and the trapezoids’ from ${fmt(tm[0], 4)} to ${fmt(tm[1], 4)}: both ${fmt(mm[0] / mm[1], 2)} times smaller, where a left-end sum’s miss only about halves. These misses shrink like 1/n².`,
    vars: vars(4),
    checkpoint: ask('At 8 strips, how far off will the trapezoids be?', fmt(tm[2], 4), [fmt(tm[1] / 2, 4), fmt(tm[1] / 8, 4), fmt(tm[1], 4)]),
  });

  yield plotFrame([plane('8 strips: trapezoids and middles', [...traps(f, 0, b, 8), rects('mid', f, 0, b, 8)]), readouts(misses(2))], {
    line: LINE.trap,
    note: `8 strips: the trapezoids miss by ${fmt(tm[2], 4)}, too much, and the middles by ${fmt(mm[2], 4)}, too little. At every n so far the trapezoids’ miss is twice the middles’, on the other side.`,
    vars: vars(8),
    checkpoint: ask(`Keep doubling. How many strips do the middles need to miss by less than ${FINE}?`, grouped(need.mid), [grouped(need.mid * 2), grouped(need.mid * 4), grouped(need.left)]),
  });

  const simpson = (2 * M[3] + T[3]) / 3;
  yield plotFrame(
    [
      plane('16 strips: trapezoids and middles', [...traps(f, 0, b, 16), rects('mid', f, 0, b, 16)]),
      readouts([...misses(3), { id: 'left', label: 'left ends, 16 strips', value: `${fmt(L16, 4)} (miss ${fmt(exact - L16, 4)})`, tone: 1 }]),
      readouts(
        [
          { id: 'nmid', label: 'middles', value: grouped(need.mid), tone: 3 },
          { id: 'ntrap', label: 'trapezoids', value: grouped(need.trap), tone: 4 },
          { id: 'nleft', label: 'left ends', value: grouped(need.left), tone: 1 },
        ],
        `Strips to miss by under ${FINE}`,
        'need',
      ),
    ],
    {
      line: 6,
      note: `To miss by less than ${FINE}, the middles need ${grouped(need.mid)} strips, the trapezoids ${grouped(need.trap)} and left ends ${grouped(need.left)}. On this curve the trapezoids’ miss is always exactly twice the middles’ and on the other side, so (2 × middles + trapezoids) / 3 cancels both: ${fmt(simpson, 6)}, the distance exactly. That is Simpson’s rule; on most curves the ratio is only nearly 2, so it is close rather than exact.`,
      vars: vars(16),
    },
  );
}

// ───────────────────────────── story 3: the accumulated area A(x) ─────────────────────────────

const AX: Axis = { min: 0, max: 2.2, label: 'x' };
const AY: Axis = { min: -1.4, max: 3.4, label: 'f(x)' };
const AAY: Axis = { min: -1, max: 1, label: 'A(x)' };
/** A measured from thin middle strips, the way the story says it is found (512 of them match x³/3 − x to 5 places). */
export const measuredA = (x: number) => (x === 0 ? 0 : riemannSum(dip, 0, x, 512, 'mid'));
/** A’s slope at x, measured: its rise over a tiny step either side, from the strips, never from f. */
export const measuredSlope = (x: number, d = 0.001) => (measuredA(x + d) - measuredA(x - d)) / (2 * d);

function* accumulate(x0: number): Generator<Frame<PlotState>> {
  const f = dip;
  const curve: Shape = { kind: 'path', id: 'f', points: sample(f, 0, AX.max), label: 'x² − 1' };
  const fx0 = f(x0);
  const Ax0 = dipArea(x0);
  const handle = { id: 'x', at: [x0, fx0] as Vec, label: 'x, where you check A’s slope', mark: 'key' as const, step: X_RANGE.step, min: [X_RANGE.min, -Infinity] as Vec, max: [X_RANGE.max, Infinity] as Vec };
  /** The signed area from 0 to x: minus below the axis (up to 1), plus above it. */
  const shaded = (x: number): Shape[] => [
    ...(x > 0 ? [region('minus', f, 0, Math.min(x, 1), { mark: 'reject' }, '−')] : []),
    ...(x > 1 ? [region('plus', f, 1, x, { mark: 'found' }, '+')] : []),
  ];
  const top = (label: string, shapes: Shape[], withHandle: boolean): PlanePart => ({
    kind: 'plane',
    id: 'plane',
    label,
    x: AX,
    y: AY,
    equal: false,
    shapes: [...shapes, curve],
    handles: withHandle ? [handle] : [],
  });
  const trail = (upTo: number): Shape[] => [
    { kind: 'path', id: 'trail', points: [[0, 0], ...SWEEP.slice(0, upTo).map((x): Vec => [x, round(measuredA(x), 4)])], dots: true, mark: 'compare', label: upTo ? `A(${fmt(SWEEP[upTo - 1])})` : 'A(0)' },
  ];
  const bottom = (label: string, shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'area', label, x: AX, y: AAY, equal: false, shapes, handles: [] });
  const A = (x: number) => measuredA(x);
  const traced: Shape = { kind: 'path', id: 'A', points: sample(A, 0, AX.max, 44), label: 'A(x)' };
  const P: Shape = { kind: 'point', id: 'P', at: [x0, round(fx0, 4)], mark: 'key', label: 'P' };
  const Q: Shape = { kind: 'point', id: 'Q', at: [x0, round(Ax0, 4)], mark: 'key' };
  const vars = (x: number) => ({ x, 'A(x)': round(A(x), 3) });
  const sweepItems = (upTo: number): Readout[] => (upTo ? SWEEP.slice(0, upTo) : [0]).map((x) => ({ id: `A${x}`, label: `A(${fmt(x)})`, value: fmt(A(x), 3), mark: 'compare' as const }));

  yield plotFrame([top('f(x) = x² − 1', [], false), bottom('Accumulated area A(x)', trail(0)), readouts(sweepItems(0))], {
    line: 8,
    note: 'A(x) is the area between the curve f(x) = x² − 1 and the x-axis from 0 to x, counted with a sign: area above the axis adds, area below it takes away, as a speed below zero (a car reversing) takes away from how far forward it is. It starts at A(0) = 0.',
    vars: vars(0),
    checkpoint: askInOrder('As x slides from 0 to 1, will A(x) go up or down?', ['Up', 'Down'], 'Down'),
  });

  const drop1 = A(SWEEP[0]);
  const drop2 = A(SWEEP[1]) - A(SWEEP[0]);
  yield plotFrame([top('Shaded from 0 to 0.5', shaded(0.5), false), bottom('Accumulated area A(x)', trail(1)), readouts(sweepItems(1))], {
    line: 8,
    note: `From 0 to 0.5 the curve is under the axis, so this area counts minus: A(0.5) = ${fmt(drop1, 3)}.`,
    vars: vars(0.5),
    checkpoint: askInOrder('From x = 0.5 to 1, will A fall faster or slower than it did from 0 to 0.5?', ['Faster', 'Slower', 'At the same rate'], 'Slower'),
  });

  yield plotFrame([top('Shaded from 0 to 1', shaded(1), false), bottom('Accumulated area A(x)', trail(2)), readouts(sweepItems(2))], {
    line: 8,
    note: `A fell another ${fmt(-drop2, 3)}, less than the ${fmt(-drop1, 3)} before: near 1 the curve is close to the axis, so each bit of width adds a thinner sliver. How fast A changes is how tall f is. A(1) = ${fmt(A(1), 3)}.`,
    vars: vars(1),
    checkpoint: askInOrder('From x = 1 to 1.5, will A(x) go up or down?', ['Up', 'Down'], 'Up'),
  });

  yield plotFrame([top('Shaded from 0 to 1.5', shaded(1.5), false), bottom('Accumulated area A(x)', trail(3)), readouts(sweepItems(3))], {
    line: 8,
    note: `A(1.5) = ${fmt(A(1.5), 3)}, more than A(1) = ${fmt(A(1), 3)}: past 1 the curve is above the axis, so the new area counts plus, even though A itself is still below zero. So A was lowest at x = 1, exactly where f crosses the axis.`,
    vars: vars(1.5),
    checkpoint: askInOrder('At x = 2, will A(2) be positive, negative or exactly 0?', ['Positive', 'Negative', 'Exactly 0'], A(2) > 1e-9 ? 'Positive' : A(2) < -1e-9 ? 'Negative' : 'Exactly 0'),
  });

  const above = A(2) - A(1);
  const below = -A(1);
  yield plotFrame([top('Shaded from 0 to 2', [...shaded(2), P], true), bottom('Accumulated area A(x)', [...trail(4), Q]), readouts(sweepItems(4))], {
    line: 8,
    note: `A(2) = ${fmt(A(2), 3)}: the ${fmt(above, 3)} above the axis outweighs the ${fmt(below, 3)} below it. For a speed, that is where the car ends up, not how far it drove (that would be ${fmt(above + below, 3)}). P marks x = ${fmt(x0)}: drag it.`,
    vars: vars(2),
    checkpoint: ask(`Look at the A(x) curve at x = ${fmt(x0)}. What will its slope be there?`, fmt(fx0, 3), [fmt(Ax0, 3), fmt(2 * x0, 3)]),
  });

  const [h1, h2] = STRIP_H;
  const slope0 = measuredSlope(x0);
  const tangent: Shape = { kind: 'line', id: 'tan', through: [x0, round(Ax0, 4)], dir: [1, round(slope0, 4)], mark: 'compare', label: `slope ${fmt(slope0, 3)}` };
  yield plotFrame(
    [
      top(`f at x = ${fmt(x0)}`, [{ kind: 'path', id: 'height', points: [[x0, 0], [x0, round(fx0, 4)]], dashed: true }, P], true),
      bottom('A(x), traced from the areas', [traced, tangent, Q]),
      readouts([
        { id: 'fx', label: `f(${fmt(x0)})`, value: fmt(fx0, 4), mark: 'key' },
        { id: 'slope', label: `slope of A at ${fmt(x0)}, measured`, value: fmt(slope0, 4), mark: 'compare' },
        { id: 'Ax', label: `A(${fmt(x0)})`, value: fmt(Ax0, 3) },
      ]),
    ],
    {
      line: 9,
      note: `Measured from the strips, A’s slope at x = ${fmt(x0)} (its rise across a tiny step, divided by the step) is ${fmt(slope0, 4)}: the height of f there. Everywhere along the way A climbs as fast as f is tall: it falls where f is below the axis and is level where f crosses 0. Drag x to check anywhere.`,
      vars: vars(x0),
      checkpoint: ask(`About how much area will the thin strip from x = ${fmt(x0)} to ${fmt(x0 + h1)} add to A?`, fmt(fx0 * h1, 3), [fmt(fx0, 3), fmt(2 * x0 * h1, 3), fmt(Ax0 * h1, 3)]),
    },
  );

  const added = (h: number) => A(x0 + h) - Ax0;
  yield plotFrame(
    [
      top(`A thin strip from ${fmt(x0)} to ${fmt(x0 + h1)}`, [region('strip', f, x0, x0 + h1, { tone: 3 }, `+${fmt(added(h1), 4)}`), { kind: 'bars', id: 'rect', bars: [{ id: 'r', x0, x1: round(x0 + h1, 4), y: round(fx0, 4), y0: 0, mark: 'compare' }] }, P], true),
      bottom('A(x), traced from the areas', [traced, tangent, Q]),
      readouts([
        { id: 'added', label: `strip area, h = ${fmt(h1)}`, value: fmt(added(h1), 4), tone: 3 },
        { id: 'rect', label: `rectangle f(${fmt(x0)}) × ${fmt(h1)}`, value: fmt(fx0 * h1, 4), mark: 'compare' },
        { id: 'r1', label: `strip area ÷ ${fmt(h1)}`, value: fmt(added(h1) / h1, 4) },
        { id: 'r2', label: `strip area ÷ ${fmt(h2)}, for h = ${fmt(h2)}`, value: fmt(added(h2) / h2, 4) },
      ]),
    ],
    {
      line: 9,
      note: `The strip added ${fmt(added(h1), 4)}, ${fx0 === 0 ? `only a sliver, as f(${fmt(x0)}) = 0` : `almost a rectangle ${fmt(fx0, 4)} tall and ${fmt(h1)} wide, ${fmt(fx0 * h1, 4)}`}. Divide by the width: ${fmt(added(h1) / h1, 4)} for h = ${fmt(h1)} and ${fmt(added(h2) / h2, 4)} for h = ${fmt(h2)}, closing in on ${fmt(fx0, 4)} = f(${fmt(x0)}). So A′(x) = f(x): accumulating area undoes the derivative. This is the fundamental theorem of calculus.`,
      vars: vars(x0),
      checkpoint: ask('Which function has slope x² − 1 everywhere and is 0 at x = 0, like A?', 'x³/3 − x', ['2x', 'x³ − x', 'x³/3 − x + 1']),
    },
  );

  yield plotFrame(
    [
      top('f(x) = x² − 1', [...shaded(2), P], true),
      bottom('A(x) = x³/3 − x', [{ kind: 'path', id: 'A', points: sample(dipArea, 0, AX.max, 44), label: 'x³/3 − x', mark: 'found' }, { kind: 'path', id: 'trail', points: [[0, 0], ...SWEEP.map((x): Vec => [x, round(measuredA(x), 4)])], dots: true, mark: 'compare' }]),
      readouts(
        [0, ...SWEEP].map((x) => ({ id: `F${x}`, label: `x = ${fmt(x)}: measured, formula`, value: `${fmt(A(x), 3)}, ${fmt(dipArea(x), 3)}` })),
        'A(x)',
      ),
    ],
    {
      line: 10,
      note: 'x³/3 − x has slope 3x²/3 − 1 = x² − 1 by the power rule, and is 0 at 0, so it is A: its curve runs through every area measured with strips. Working back from a slope to the function that has it is called finding an antiderivative.',
      vars: vars(2),
    },
  );
}

// ───────────────────────────── story 4: the power rule run backwards ─────────────────────────────

function* power(b: number): Generator<Frame<PlotState>> {
  const b2 = 2 * b;
  const X: Axis = { min: 0, max: round(b2 * 1.06, 2), label: 'x' };
  const Y: Axis = { min: 0, max: round(b2 * b2 * 1.1, 2), label: 'y' };
  const AY: Axis = { min: 0, max: round(powerArea(2, b2) * 1.1, 2), label: 'A(x)' };
  const sq: Shape = { kind: 'path', id: 'f', points: sample(speed, 0, X.max), label: 'x²' };
  const handle = { id: 'b', at: [b, b * b] as Vec, label: 'b, the end of the area', mark: 'key' as const, step: POWER_RANGE.step, min: [POWER_RANGE.min, -Infinity] as Vec, max: [POWER_RANGE.max, Infinity] as Vec };
  const B: Shape = { kind: 'point', id: 'B', at: [b, b * b], mark: 'key', label: 'b' };
  const top = (label: string, shapes: Shape[], curves: Shape[] = [sq]): PlanePart => ({ kind: 'plane', id: 'plane', label, x: X, y: Y, equal: false, shapes: [...shapes, ...curves, B], handles: [handle] });
  const bottom = (label: string, shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'area', label, x: X, y: AY, equal: false, shapes, handles: [] });
  const Ab = powerArea(2, b);
  const A2b = powerArea(2, b2);
  const M16 = riemannSum(speed, 0, b, 16, 'mid');
  const cubeCurve: Shape = { kind: 'path', id: 'A', points: sample((x) => (x * x * x) / 3, 0, X.max), label: 'x³/3', mark: 'found' };
  const at = (id: string, x: number, label?: string): Shape => ({ kind: 'point', id, at: [x, round(powerArea(2, x), 4)], mark: 'key', ...(label ? { label } : {}) });
  const vars = { b };

  yield plotFrame([top(`The area under x² from 0 to ${fmt(b)}`, [region('area', speed, 0, b, { mark: 'found' })]), bottom('A(b), the area from 0 to b', [at('Ab', b, 'A(b)')]), readouts([{ id: 'b', label: 'b', value: fmt(b) }, { id: 'm16', label: '16 middle strips', value: fmt(M16, 4), tone: 3 }])], {
    line: 9,
    note: `Is there a formula for A(b), the area under x² from 0 to b? Strips give about ${fmt(M16, 4)} for b = ${fmt(b)}. The fundamental theorem says A’s slope is the curve’s height, A′(x) = x², so look for a function whose slope is x², and which is 0 at 0 like A.`,
    vars,
    checkpoint: ask('The power rule says x³ has slope 3x². Which function has slope x²?', 'x³/3', ['x³', '3x³', '2x']),
  });

  yield plotFrame(
    [top(`A(b) = b³/3`, [region('area', speed, 0, b, { mark: 'found' })]), bottom('A(x) = x³/3', [cubeCurve, at('Ab', b, 'A(b)')]), readouts([{ id: 'Ab', label: `${fmt(b)}³ / 3`, value: fmt(Ab, 4), mark: 'found' }, { id: 'm16', label: '16 middle strips', value: fmt(M16, 4), tone: 3 }])],
    {
      line: 9,
      note: `x³ has slope 3x², three times too steep, so x³/3 has slope exactly x², and it is 0 at 0. So A(b) = b³/3: here ${fmt(b)}³/3 = ${fmt(Ab, 4)}, and the strips agreed. For the car, 3³/3 = 9 m: the number the rectangles were closing in on.`,
      vars,
      checkpoint: ask(`Double the end to ${fmt(b2)}. How many times bigger will the area be?`, '8', ['2', '4', '16']),
    },
  );

  yield plotFrame(
    [top(`The area under x² from 0 to ${fmt(b2)}`, [region('area', speed, 0, b2, { mark: 'found' })]), bottom('A(x) = x³/3', [cubeCurve, at('Ab', b, 'A(b)'), at('A2b', b2, `A(${fmt(b2)})`)]), readouts([{ id: 'Ab', label: `A(${fmt(b)})`, value: fmt(Ab, 4) }, { id: 'A2b', label: `A(${fmt(b2)})`, value: fmt(A2b, 4), mark: 'found' }])],
    {
      line: 9,
      note: `A(${fmt(b2)}) = ${fmt(b2)}³/3 = ${fmt(A2b, 4)}, 8 times ${fmt(Ab, 4)}: the region is twice as wide, and at each matching point the curve is 4 times as tall (x² at 2x is 4x²), so 2 × 4 = 8. Areas under x² grow like the cube of the end.`,
      vars,
      checkpoint: ask(`What is the area under x² from ${fmt(b)} to ${fmt(b2)}?`, fmt(A2b - Ab, 3), [fmt(A2b, 3), fmt(b2 * b2 * b, 3), fmt(b * b * b, 3)]),
    },
  );

  yield plotFrame(
    [top(`The area under x² from ${fmt(b)} to ${fmt(b2)}`, [region('area', speed, b, b2, { mark: 'found' })]), bottom('A(x) = x³/3', [cubeCurve, at('Ab', b, 'A(b)'), at('A2b', b2, `A(${fmt(b2)})`)]), readouts([{ id: 'diff', label: `A(${fmt(b2)}) − A(${fmt(b)})`, value: fmt(A2b - Ab, 4), mark: 'found' }])],
    {
      line: 10,
      note: `The area from ${fmt(b)} to ${fmt(b2)} is all of it up to ${fmt(b2)} minus the part up to ${fmt(b)}: ${fmt(A2b, 4)} − ${fmt(Ab, 4)} = ${fmt(A2b - Ab, 4)}. Any F with F′ = f will do: the area from a to b is F(b) − F(a), written ∫ₐᵇ f(x) dx = F(b) − F(a).`,
      vars,
      checkpoint: ask(`Now the area under x³ from 0 to ${fmt(b)}. What is it?`, fmt(powerArea(3, b), 3), [fmt(b ** 4, 3), fmt(b ** 4 / 3, 3), fmt(3 * b * b, 3)]),
    },
  );

  const cube: Shape = { kind: 'path', id: 'g', points: sample((x) => x * x * x, 0, Math.min(X.max, Math.cbrt(Y.max))), label: 'x³', mark: 'compare' };
  yield plotFrame(
    [
      top(`The area under x³ from 0 to ${fmt(b)}`, [region('area', (x) => x * x * x, 0, b, { mark: 'compare' })], [sq, cube]),
      bottom('Areas from 0 to x', [cubeCurve, { kind: 'path', id: 'A4', points: sample((x) => (x * x * x * x) / 4, 0, Math.min(X.max, (4 * AY.max) ** 0.25)), label: 'x⁴/4', mark: 'compare' }]),
      readouts([
        { id: 'p2', label: `under x², 0 to ${fmt(b)}: ${fmt(b)}³/3`, value: fmt(Ab, 4), mark: 'found' },
        { id: 'p3', label: `under x³, 0 to ${fmt(b)}: ${fmt(b)}⁴/4`, value: fmt(powerArea(3, b), 4), mark: 'compare' },
      ]),
    ],
    {
      line: 10,
      note: `x⁴/4 has slope 4x³/4 = x³, so the area under x³ from 0 to ${fmt(b)} is ${fmt(b)}⁴/4 = ${fmt(powerArea(3, b), 4)}. The power rule run backwards: raise the power by one and divide by the new power, so for a whole number n the area under xⁿ from 0 to b is bⁿ⁺¹/(n + 1).`,
      vars,
    },
  );
}

function* run(input: IntegralInput): Generator<Frame<PlotState>> {
  if (input.story === 'sums') yield* sums(input.b);
  else if (input.story === 'rules') yield* rules(input.b);
  else if (input.story === 'accumulate') yield* accumulate(input.x);
  else yield* power(input.b);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;
const inRange = (v: number, r: { min: number; max: number; step: number }) => onStep(v, r.step) && v >= r.min && v <= r.max;

export function parseIntegral(text: string): { value: IntegralInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/g) ?? [])[0];
  const xs = numbersIn(text);
  if (story === 'sums' || story === 'rules') {
    if (xs.length !== 1 || !inRange(xs[0], B_RANGE)) return { error: `Give the end b in halves from ${B_RANGE.min} to ${B_RANGE.max}, e.g. ${story} to 3.` };
    return { value: { story, b: xs[0] } };
  }
  if (story === 'accumulate') {
    if (xs.length !== 1 || !inRange(xs[0], X_RANGE)) return { error: `Give x in quarters from ${X_RANGE.min} to ${X_RANGE.max}, e.g. accumulate at 1.5.` };
    return { value: { story, x: xs[0] } };
  }
  if (story === 'power') {
    if (xs.length !== 1 || !inRange(xs[0], POWER_RANGE)) return { error: `Give the end b in halves from ${POWER_RANGE.min} to ${POWER_RANGE.max}, e.g. power to 2.` };
    return { value: { story, b: xs[0] } };
  }
  return { error: 'Start with sums, rules, accumulate or power, e.g. sums to 3, rules to 2, accumulate at 1.5, or power to 2.' };
}

export function formatIntegral(input: IntegralInput): string {
  if (input.story === 'accumulate') return `accumulate at ${plain(input.x)}`;
  return `${input.story} to ${plain(input.b)}`;
}

export function dragIntegral(input: IntegralInput, _handle: string, to: Vec): IntegralInput {
  if (input.story === 'accumulate') return { ...input, x: snap(to[0], X_RANGE.step, X_RANGE.min, X_RANGE.max) };
  if (input.story === 'power') return { ...input, b: snap(to[0], POWER_RANGE.step, POWER_RANGE.min, POWER_RANGE.max) };
  return { ...input, b: snap(to[0], B_RANGE.step, B_RANGE.min, B_RANGE.max) };
}

const example = (id: string, label: string, input: IntegralInput) => ({ id, label, make: () => input, sized: false });

export const integral = defineAlgorithm<IntegralInput, PlotState>({
  kind: 'algorithm',
  slug: 'integral',
  view: 'plot',
  input: {
    examples: [
      example('sums', 'Rectangles under a speed curve', { story: 'sums', b: 3 }),
      example('rules', 'Middles and trapezoids', { story: 'rules', b: 3 }),
      example('accumulate', 'Accumulated area A(x) and its slope', { story: 'accumulate', x: 1.5 }),
      example('power', 'The power rule run backwards', { story: 'power', b: 2 }),
    ],
    custom: {
      label: 'sums to b or rules to b (b in halves, 1 to 3); accumulate at x (quarters, 0.5 to 2); power to b (halves, 0.5 to 2)',
      placeholder: 'e.g. sums to 2',
      parse: parseIntegral,
      format: formatIntegral,
    },
    drag: dragIntegral,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The curve, and guides' },
    { mark: 'key', label: 'The point you drag: the end b, or x' },
    { tone: 1, label: 'Rectangles as tall as the left end' },
    { tone: 2, label: 'Rectangles as tall as the right end' },
    { tone: 3, label: 'Rectangles as tall as the middle; a thin strip' },
    { tone: 4, label: 'Trapezoids' },
    { mark: 'found', label: 'The exact area; area that counts plus' },
    { mark: 'reject', label: 'Area below the axis, which counts minus' },
    { mark: 'compare', label: 'A(x) as measured, its tangent; the x³ curve' },
  ],
  run,
  content: {
    idea: 'The area under a curve is what thin strips add up to. Rectangles as tall as the curve at each strip’s left end, right end or middle, or trapezoids with slanted tops, all close in on one number as the strips get thinner: the integral ∫ₐᵇ f(x) dx. Area below the axis counts negative. The accumulated area A(x) from a fixed start climbs exactly as fast as the curve is tall, A′(x) = f(x), so areas come from running derivatives backwards.',
    invariant: 'A sum with n strips is Σ f(xᵢ)·Δx with Δx = (b − a)/n. Left- and right-end sums miss by an amount that halves when n doubles (like 1/n); middle and trapezoid sums miss four times less each doubling (like 1/n²), the trapezoids by about twice as much as the middles, on the other side. The slope of the accumulated area at x is f(x).',
    whenToUse: 'Integrals turn a rate into a total: speed into distance, a probability density into a probability, a power into energy. Numerical integration (middles, trapezoids, Simpson’s rule) is how computers find areas no formula gives; the fundamental theorem is how the formulas are found.',
    traits: [
      { label: 'Left and right ends: misses shrink like 1/n', good: false },
      { label: 'Middles and trapezoids: misses shrink like 1/n²', good: true },
      { label: 'Area below the axis counts negative', good: null },
      { label: 'A′(x) = f(x): accumulating undoes the derivative', good: null },
    ],
    experiments: [
      { example: 'sums', prompt: 'Drag b to 1.5. The sums are smaller, but does doubling the strips still halve the gap between left and right?' },
      { example: 'rules', prompt: 'Compare the middles’ and the trapezoids’ misses at each n. Which is bigger, by how much, and on which side?' },
      { example: 'accumulate', prompt: 'Drag x to 1, where the curve crosses the axis. What is the slope of A there, and why is A lowest there?' },
      { example: 'power', prompt: 'Drag b to 1. Is the area under x³ from 0 to 1 more or less than the area under x²? Why, when x³ is the bigger power?' },
    ],
  },
});

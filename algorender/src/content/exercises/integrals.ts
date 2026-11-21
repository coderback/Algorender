// Integrals as code (B5 of the math and ML path): the area under a curve as
// thin strips added up. riemann(a, b, n) stands a rectangle on each of n strips,
// as tall as the curve at the strip's middle; trapezoid(a, b, n) joins the
// curve's heights at the strips' edges with slanted tops, so the two end edges
// count half. Each writes its heights into a visual array, which draws them as
// the strips' bars.
//
// Python and JavaScript must write the same numbers (exercises.test.ts). The
// curve is x², the ends are whole numbers and n is a power of two, so every
// width, x and height is a short binary fraction and every sum is exact in both.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

export type StripInput = { a: number; b: number; n: number };

/** The curve in both starters: the car's speed from the lesson, t² metres per second. */
export const curve = (x: number) => x * x;
/** The exact area under x² from a to b. */
export const exactArea = (a: number, b: number) => (b * b * b - a * a * a) / 3;

/** The middle sum as the solution writes it: heights at the strips' middles, added up, times the width. */
export function midpointSum({ a, b, n }: StripInput, at: (i: number, w: number) => number = (i, w) => a + (i + 0.5) * w, w = (b - a) / n): number {
  let total = 0;
  for (let i = 0; i < n; i++) total = total + curve(at(i, w));
  return total * w;
}

/** The heights at the n + 1 edges, as the trapezoid solution writes them. */
export const edgeHeights = ({ a, b, n }: StripInput) => Array.from({ length: n + 1 }, (_, i) => curve(a + i * ((b - a) / n)));

/** The trapezoid sum as the solution writes it: the end heights halved, the inner ones in full, times the width. */
export function trapezoidSum(input: StripInput): number {
  const h = edgeHeights(input);
  const { n } = input;
  let total = (h[0] + h[n]) / 2;
  for (let i = 1; i < n; i++) total = total + h[i];
  return total * ((input.b - input.a) / input.n);
}

const near = (got: number, want: number) => Number.isFinite(got) && Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want));
const fmt = (v: number) => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'NaN';
  const r = Math.round(v * 1e6) / 1e6;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;

/** The learner's visual array `name` as the events built it, up to the end of the run or its error. */
function arrayFromEvents(result: RunResult, name: string): number[] | null {
  let id: string | null = null;
  let values: number[] = [];
  for (const e of result.events) {
    if (e.kind === 'array' && e.name === name) {
      id = e.array;
      values = [...e.values];
    } else if (id != null && e.kind === 'append' && e.array === id) values.push(e.value);
    else if (id != null && e.kind === 'write' && e.array === id) values[e.index] = e.value;
    else if (id != null && e.kind === 'pop' && e.array === id) values.splice(e.index, 1);
  }
  return id == null ? null : values;
}

const stripArgs = ({ a, b, n }: StripInput): Arg[] => [
  { kind: 'value', name: 'a', value: a },
  { kind: 'value', name: 'b', value: b },
  { kind: 'value', name: 'n', value: n },
];

const PAST_END = (n: number, last: string) =>
  `Your loop went one step too far: there are ${n} strips, so heights runs from ${last}, numbered from 0. Loop i over range(n), 0 to n − 1 (i < n in JavaScript): counting up to n makes one strip too many.`;

// ───────────────────────────── 1. riemann-sum ─────────────────────────────

function checkRiemann(input: StripInput, result: RunResult): Verdict {
  const { a, b, n } = input;
  const heights = arrayFromEvents(result, 'heights');
  if (result.error) {
    if (/range|index/i.test(result.error.message) && heights?.length === n) return { pass: false, message: PAST_END(n, `heights[0] to heights[${n - 1}]`) };
    return crashed(result)!;
  }
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: 'Return the area: one number, the total of the heights times the width of a strip.' };
  const w = (b - a) / n;
  const want = midpointSum(input);
  const exact = exactArea(a, b);
  const mids = Array.from({ length: n }, (_, i) => a + (i + 0.5) * w);
  if (near(got, want)) {
    if (heights && !heights.every((h, i) => near(h, curve(mids[i])))) return { pass: false, message: `The area is right, but heights should hold each strip’s height, f at its middle: ${list(mids.map(curve))}.` };
    return {
      pass: true,
      message: `${n} strips of ${fmt(w)}, as tall as x² at their middles: area ${fmt(want)}. The exact area under x² from ${fmt(a)} to ${fmt(b)} is ${fmt(exact)}, so ${n} strips miss by only ${fmt(exact - want)}; double n and the miss falls 4 times.`,
    };
  }
  if (got === 0 && heights?.every((h) => h === 0)) return { pass: false, message: 'The area is still 0 and so are the heights: for each strip i, find the x in its middle, set heights[i] = f(x), and add it up.' };
  const like = (v: number) => near(got, v);
  if (like(midpointSum(input, (i, ww) => a + i * ww))) return { pass: false, message: `That is the left-end sum: each strip as tall as f at its left edge, a + i·width. The middle of strip i is half a strip further on, a + (i + 0.5)·width, which here gives ${fmt(want)}.` };
  if (like(midpointSum(input, (i, ww) => a + (i + 1) * ww))) return { pass: false, message: `That is the right-end sum: each strip as tall as f at its right edge, a + (i + 1)·width. The middle of strip i is a + (i + 0.5)·width.` };
  if (like(midpointSum(input, (i, ww) => a + (i + 0.5) * ww, b - a))) {
    return { pass: false, message: `Your strips are b − a = ${fmt(b - a)} wide, the whole interval, so they run far past b. Each of the n strips is (b − a) / n = ${fmt(w)} wide.` };
  }
  if (like(want * n)) return { pass: false, message: `Your area is ${n} times too big: you multiplied the total by b − a, but each strip is only (b − a) / n = ${fmt(w)} wide.` };
  if (like(want / w)) return { pass: false, message: `That is the total of the heights, ${fmt(want / w)}. Each rectangle’s area is its height times its width, so multiply the total by the width, ${fmt(w)}.` };
  if (a !== 0 && like(midpointSum(input, (i, ww) => (i + 0.5) * ww))) {
    return { pass: false, message: `Your strips start at 0, not at a = ${fmt(a)}: the middle of strip i is a + (i + 0.5)·width. Without the a they cover 0 to ${fmt(b - a)} instead of ${fmt(a)} to ${fmt(b)}.` };
  }
  if (like(midpointSum(input, (i, ww) => a + i * ww + 0.5))) {
    return { pass: false, message: `You moved half a unit along, not half a strip: the middle of strip i is a + (i + 0.5)·width, half a width (${fmt(w / 2)}) past its left edge.` };
  }
  return { pass: false, message: `The middles of the ${n} strips are ${list(mids)}, so the area is (f at each middle, added up) × ${fmt(w)} = ${fmt(want)}, but your code returns ${fmt(got)}.` };
}

const CURVE_PY = `def f(x):
    # The car's speed from the lesson: x * x metres per second.
    return x * x
`;
const CURVE_JS = `function f(x) {
  // The car's speed from the lesson: x * x metres per second.
  return x * x;
}
`;

const RIEMANN_PY = `${CURVE_PY}

def riemann(a, b, n):
    width = (b - a) / n
    heights = array(n)
    total = 0
    for i in range(n):
        x = a + (i + 0.5) * width
        heights[i] = f(x)
        total = total + heights[i]
    return total * width
`;
const RIEMANN_BLANKS_PY = `${CURVE_PY}

def riemann(a, b, n):
    width = «1:(b - a) / n»
    heights = array(n)
    total = 0
    for i in range(«2:n»):
        x = «3:a + (i + 0.5) * width»
        heights[i] = f(x)
        total = total + heights[i]
    return «4:total * width»
`;
const RIEMANN_JS = `${CURVE_JS}
function riemann(a, b, n) {
  const width = (b - a) / n;
  const heights = array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const x = a + (i + 0.5) * width;
    heights[i] = f(x);
    total = total + heights[i];
  }
  return total * width;
}
`;
const RIEMANN_BLANKS_JS = `${CURVE_JS}
function riemann(a, b, n) {
  const width = «1:(b - a) / n»;
  const heights = array(n);
  let total = 0;
  for (let i = 0; i < «2:n»; i++) {
    const x = «3:a + (i + 0.5) * width»;
    heights[i] = f(x);
    total = total + heights[i];
  }
  return «4:total * width»;
}
`;
const RIEMANN_STARTER_PY = `${CURVE_PY}

def riemann(a, b, n):
    heights = array(n)  # one height for each of the n strips
    # Each strip is (b - a) / n wide. For strip i, find the x in its middle,
    # set heights[i] = f(x), and add it to a running total.
    # The area is that total times the width of a strip.
    return 0
`;
const RIEMANN_STARTER_JS = `${CURVE_JS}
function riemann(a, b, n) {
  const heights = array(n); // one height for each of the n strips
  // Each strip is (b - a) / n wide. For strip i, find the x in its middle,
  // set heights[i] = f(x), and add it to a running total.
  // The area is that total times the width of a strip.
  return 0;
}
`;
const stripsTs = (js: string, name: string) =>
  js
    .replace('function f(x) {', 'function f(x: number): number {')
    .replace(`function ${name}(a, b, n) {`, `function ${name}(a: number, b: number, n: number): number {`)
    .replace('const heights = array(', 'const heights: number[] = array(');

const CAR: StripInput = { a: 0, b: 3, n: 2 };
const CAR_8: StripInput = { a: 0, b: 3, n: 8 };
const SHIFTED: StripInput = { a: 1, b: 3, n: 4 };

const riemannExercise: Exercise<StripInput> = {
  slug: 'riemann-sum',
  title: 'Add up strips: the middle sum',
  kind: 'write',
  visualiser: 'integral',
  summary: 'The area under a curve as n thin rectangles, each as tall as the curve at its strip’s middle.',
  task: [
    'The area under a curve from a to b is what thin strips add up to. Cut the interval into n strips, each (b − a) / n wide, and stand a rectangle on each one as tall as the curve at the strip’s middle. Strip i (counting from 0) starts at a + i × width, so its middle is half a width further on, at a + (i + 0.5) × width.',
    'Write `riemann(a, b, n)`: put each strip’s height f(x) into `heights[i]` (the run draws them as bars), add the heights up, and return the total times the width. The starter’s f is the car’s speed from the lesson, x², so `riemann(0, 3, n)` closes in on the 9 metres it travels in 3 seconds.',
  ],
  entry: { python: 'riemann', js: 'riemann' },
  args: stripArgs,
  starter: { python: RIEMANN_STARTER_PY, javascript: RIEMANN_STARTER_JS, typescript: stripsTs(RIEMANN_STARTER_JS, 'riemann') },
  solution: { python: RIEMANN_PY, javascript: RIEMANN_JS, typescript: stripsTs(RIEMANN_JS, 'riemann') },
  blanks: { python: RIEMANN_BLANKS_PY, javascript: RIEMANN_BLANKS_JS, typescript: stripsTs(RIEMANN_BLANKS_JS, 'riemann') },
  fades: [[3], [1, 3], [1, 2, 3, 4]],
  distractors: {
    python: ['        x = a + i * width', '    width = b - a'],
    javascript: ['    const x = a + i * width;', '  const width = b - a;'],
    typescript: ['    const x = a + i * width;', '  const width = b - a;'],
  },
  examples: [
    { id: 'car', label: 'The car, 0 to 3 s, 2 strips', input: CAR },
    { id: 'car-8', label: 'The car, 8 strips', input: CAR_8 },
    { id: 'shifted', label: 'From 1 to 3, 4 strips', input: SHIFTED },
  ],
  tests: [
    { name: 'the car, 2 strips', input: CAR },
    { name: 'the car, 8 strips', input: CAR_8 },
    { name: 'from 1 to 3, 4 strips', input: SHIFTED },
    { name: 'across 0, from −2 to 2', input: { a: -2, b: 2, n: 8 } },
    { name: 'from 2 to 5, 16 strips', input: { a: 2, b: 5, n: 16 } },
    { name: 'one strip', input: { a: 1, b: 2, n: 1 } },
  ],
  check: checkRiemann,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'width = (b - a) / n. Then loop i from 0 to n − 1: there is one height per strip.',
    'Strip i starts at a + i * width; its middle is half a width further: x = a + (i + 0.5) * width.',
    'Set heights[i] = f(x) and add it to total inside the loop; after the loop, return total * width.',
  ],
  legend: [
    { neutral: 'A strip not worked out yet' },
    { mark: 'write', label: 'The height your code just wrote' },
  ],
};

// ───────────────────────────── 2. trapezoid-rule ─────────────────────────────

function checkTrapezoid(input: StripInput, result: RunResult): Verdict {
  const { a, b, n } = input;
  const heights = arrayFromEvents(result, 'heights');
  if (result.error) {
    if (/range|index/i.test(result.error.message) && heights?.length === n + 1) {
      return { pass: false, message: `Your loop went past the last edge: n strips have n + 1 edges, heights[0] to heights[${n}]. The edges are a + i × width for i from 0 to n, and the trapezoids add the inner ones, i from 1 to n − 1.` };
    }
    return crashed(result)!;
  }
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: 'Return the area: one number.' };
  const w = (b - a) / n;
  const h = edgeHeights(input);
  const want = trapezoidSum(input);
  const exact = exactArea(a, b);
  const all = h.reduce((s, v) => s + v, 0);
  if (near(got, want)) {
    if (heights && !heights.every((v, i) => near(v, h[i]))) return { pass: false, message: `The area is right, but heights should hold the curve’s height at each of the n + 1 edges: ${list(h)}.` };
    return { pass: true, message: `${n} trapezoids of width ${fmt(w)}: area ${fmt(want)}, against the exact ${fmt(exact)}. The curve bends up, so each slanted top runs above it and the area comes out ${fmt(want - exact)} too big; double n and that falls 4 times.` };
  }
  if (got === 0 && heights?.every((v) => v === 0)) return { pass: false, message: 'The area is still 0 and so are the heights: fill heights[i] with f at each edge, a + i × width, then add them up.' };
  const like = (v: number) => near(got, v);
  if (like(all * w)) {
    return { pass: false, message: `You added every edge’s height in full. Each trapezoid’s area is its width times the average of its two edges, so the inner edges (shared by two trapezoids) count in full but the two end edges, f(a) and f(b), count only half: ${fmt(all * w - want)} too much here.` };
  }
  if (like((all / 2) * w)) return { pass: false, message: 'You halved every height. Only the two end edges, heights[0] and heights[n], count half; every inner edge belongs to two trapezoids, so it counts in full.' };
  if (heights && heights.length === n + 1 && heights[n] === 0 && h[n] !== 0 && like(want - (h[n] / 2) * w)) {
    return { pass: false, message: `heights[${n}] is still 0: the last edge is at b = ${fmt(b)}, where f is ${fmt(h[n])}. n strips have n + 1 edges, so fill i from 0 to n (range(n + 1)).` };
  }
  const left = h.slice(0, n).reduce((s, v) => s + v, 0) * w;
  if (like(left)) return { pass: false, message: 'That is the left-end sum: each strip as tall as its left edge. A trapezoid uses both edges, (left + right) / 2, which adds the end edges at half weight.' };
  const wide = (() => {
    const W = b - a;
    const hs = Array.from({ length: n + 1 }, (_, i) => curve(a + i * W));
    let total = (hs[0] + hs[n]) / 2;
    for (let i = 1; i < n; i++) total = total + hs[i];
    return total * W;
  })();
  if (like(wide)) return { pass: false, message: `Your strips are b − a = ${fmt(b - a)} wide, the whole interval, so the edges run far past b. Each of the n strips is (b − a) / n = ${fmt(w)} wide.` };
  if (like(want * n)) return { pass: false, message: `Your area is ${n} times too big: you multiplied by b − a, but each strip is only (b − a) / n = ${fmt(w)} wide.` };
  if (like(want / w)) return { pass: false, message: `That is the total before multiplying by the width. Multiply it by ${fmt(w)}, the width of a strip.` };
  return { pass: false, message: `With edges at heights ${list(h)}, the trapezoids give (half the two end heights + the inner ones) × ${fmt(w)} = ${fmt(want)}, but your code returns ${fmt(got)}.` };
}

const TRAP_PY = `${CURVE_PY}

def trapezoid(a, b, n):
    width = (b - a) / n
    heights = array(n + 1)
    for i in range(n + 1):
        heights[i] = f(a + i * width)
    total = (heights[0] + heights[n]) / 2
    for i in range(1, n):
        total = total + heights[i]
    return total * width
`;
const TRAP_BLANKS_PY = `${CURVE_PY}

def trapezoid(a, b, n):
    width = (b - a) / n
    heights = array(n + 1)
    for i in range(«1:n + 1»):
        heights[i] = f(«2:a + i * width»)
    total = «3:(heights[0] + heights[n]) / 2»
    for i in range(«4:1, n»):
        total = total + heights[i]
    return total * width
`;
const TRAP_JS = `${CURVE_JS}
function trapezoid(a, b, n) {
  const width = (b - a) / n;
  const heights = array(n + 1);
  for (let i = 0; i <= n; i++) {
    heights[i] = f(a + i * width);
  }
  let total = (heights[0] + heights[n]) / 2;
  for (let i = 1; i < n; i++) {
    total = total + heights[i];
  }
  return total * width;
}
`;
const TRAP_BLANKS_JS = `${CURVE_JS}
function trapezoid(a, b, n) {
  const width = (b - a) / n;
  const heights = array(n + 1);
  for (let i = 0; «1:i <= n»; i++) {
    heights[i] = f(«2:a + i * width»);
  }
  let total = «3:(heights[0] + heights[n]) / 2»;
  for (let i = «4:1»; i < n; i++) {
    total = total + heights[i];
  }
  return total * width;
}
`;
const TRAP_STARTER_PY = `${CURVE_PY}

def trapezoid(a, b, n):
    width = (b - a) / n
    heights = array(n + 1)  # n strips have n + 1 edges
    # Fill heights[i] with f at edge i, a + i * width, for i from 0 to n.
    # Each trapezoid's area is width * (left edge + right edge) / 2.
    # Add up all n of them and return the total.
    return 0
`;
const TRAP_STARTER_JS = `${CURVE_JS}
function trapezoid(a, b, n) {
  const width = (b - a) / n;
  const heights = array(n + 1); // n strips have n + 1 edges
  // Fill heights[i] with f at edge i, a + i * width, for i from 0 to n.
  // Each trapezoid's area is width * (left edge + right edge) / 2.
  // Add up all n of them and return the total.
  return 0;
}
`;

const trapezoidExercise: Exercise<StripInput> = {
  slug: 'trapezoid-rule',
  title: 'Slanted tops: the trapezoid rule',
  kind: 'write',
  visualiser: 'integral',
  summary: 'Join the curve’s heights at the strips’ edges with straight lines, and add up the trapezoids.',
  task: [
    'Instead of a flat top, give each strip a slanted one: the straight line joining the curve’s heights at its two edges. The strip becomes a trapezoid, whose area is its width times the average of its two edge heights.',
    'Write `trapezoid(a, b, n)`: fill `heights[i]` with f at each of the n + 1 edges, a + i × width for i from 0 to n, then add up the n trapezoids and return the area. When you add them up, notice which edges are shared by two trapezoids and which belong to only one.',
  ],
  entry: { python: 'trapezoid', js: 'trapezoid' },
  args: stripArgs,
  starter: { python: TRAP_STARTER_PY, javascript: TRAP_STARTER_JS, typescript: stripsTs(TRAP_STARTER_JS, 'trapezoid') },
  solution: { python: TRAP_PY, javascript: TRAP_JS, typescript: stripsTs(TRAP_JS, 'trapezoid') },
  blanks: { python: TRAP_BLANKS_PY, javascript: TRAP_BLANKS_JS, typescript: stripsTs(TRAP_BLANKS_JS, 'trapezoid') },
  fades: [[3], [2, 3], [1, 2, 3, 4]],
  distractors: {
    python: ['    total = heights[0] + heights[n]', '    for i in range(n):'],
    javascript: ['  let total = heights[0] + heights[n];', '  for (let i = 0; i < n; i++) {'],
    typescript: ['  let total = heights[0] + heights[n];', '  for (let i = 0; i < n; i++) {'],
  },
  examples: [
    { id: 'car', label: 'The car, 0 to 3 s, 2 strips', input: CAR },
    { id: 'car-8', label: 'The car, 8 strips', input: CAR_8 },
    { id: 'shifted', label: 'From 1 to 3, 4 strips', input: SHIFTED },
  ],
  tests: [
    { name: 'the car, 2 strips', input: CAR },
    { name: 'the car, 8 strips', input: CAR_8 },
    { name: 'from 1 to 3, 4 strips', input: SHIFTED },
    { name: 'across 0, from −2 to 2', input: { a: -2, b: 2, n: 8 } },
    { name: 'from 2 to 5, 16 strips', input: { a: 2, b: 5, n: 16 } },
    { name: 'one strip', input: { a: 1, b: 2, n: 1 } },
  ],
  check: checkTrapezoid,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'n strips have n + 1 edges: loop i from 0 to n (range(n + 1)) and set heights[i] = f(a + i * width).',
    'Trapezoid i has edges heights[i] and heights[i + 1]. Add up width * (heights[i] + heights[i + 1]) / 2 for i from 0 to n − 1, or notice that every inner edge is counted twice, halved.',
    'So: total = (heights[0] + heights[n]) / 2, plus heights[1] to heights[n − 1] in full; return total * width.',
  ],
  legend: [
    { neutral: 'An edge not worked out yet' },
    { mark: 'write', label: 'The height your code just wrote' },
  ],
};

export const integralExercises: Exercise[] = [riemannExercise, trapezoidExercise];

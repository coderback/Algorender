// Calculus as code (B4 of the math and ML path): a table of heights read like
// a map (a function of two variables), a slope measured by stepping both ways,
// square roots by Newton's method, and the Jacobian of a map of the plane,
// measured one input at a time.
//
// Python and JavaScript must write the same numbers (exercises.test.ts), so the
// functions here are plain + − × ÷ (polynomials and 1/x, never exp or sin), and
// the loops do the same operations in the same order: even the measured slopes,
// with their rounding crumbs, agree to the last bit.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

type Matrix = readonly (readonly number[])[];

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const isMatrix = (x: unknown): x is number[][] => Array.isArray(x) && x.every(isNumbers);
/** a and b agree to `rel` of b's size (and to 1e-12 near 0). */
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b) + 1e-12;
const allNear = (got: readonly number[], want: readonly number[], rel = 1e-9) => got.length === want.length && want.every((w, i) => near(got[i], w, rel));
const sameMatrix = (got: Matrix, want: Matrix, rel = 1e-9) => got.length === want.length && want.every((row, i) => allNear(got[i], row, rel));

const fmt = (v: number) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e6) / 1e6;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
/** A small error, written so its size shows: 0.000012 rather than 0. */
const tiny = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e-3 ? fmt(v) : v.toExponential(1).replace('-', '−'));
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;
const grid = (rows: Matrix) => `[${rows.map(list).join(', ')}]`;

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

const writeLegend = (cell: string, wrote: string): Exercise['legend'] => [
  { neutral: cell },
  { mark: 'write', label: wrote },
];

// ───────────────────────────── 1. height-table ─────────────────────────────

export type HeightInput = { xs: number[]; ys: number[] };

/**
 * The hill in the starter, written as the code writes it: its top is at (1, 2),
 * height 9. It is steeper along y than along x and the x·y term slants it, so
 * it looks different upside down, mirrored across a diagonal, or with x and y
 * swapped (an even hill would hide those slips).
 */
export const hill = (x: number, y: number) => 2 - x * x - 2 * y * y + x * y + 7 * y;

/** One row per y (ys from the top of the map down), one column per x. */
export const heightGrid = ({ xs, ys }: HeightInput) => ys.map((y) => xs.map((x) => hill(x, y)));

const heightArgs = ({ xs, ys }: HeightInput): Arg[] => [
  { kind: 'array', name: 'xs', values: xs },
  { kind: 'array', name: 'ys', values: ys },
];

function checkHeights(input: HeightInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { xs, ys } = input;
  const [rows, cols] = [ys.length, xs.length];
  const got = result.returned;
  if (!isMatrix(got) || got.length === 0) return { pass: false, message: `Return the table of heights: make it with table(${rows}, ${cols}, 0) (one row for each y, one column for each x), fill it in, and return it.` };
  const want = heightGrid(input);
  const shape = `${got.length}×${got[0]?.length ?? 0}`;
  if (rows !== cols && got.length === cols && got.every((r) => r.length === rows)) {
    return { pass: false, message: `Your table is ${shape}: one row for each x. A map has one row for each y and one column for each x, so it is ${rows}×${cols}: table(len(ys), len(xs), 0), with grid[i][j] = f(xs[j], ys[i]).` };
  }
  if (got.length !== rows || got.some((r) => r.length !== cols)) return { pass: false, message: `The table should be ${rows}×${cols} (${rows} values of y, so ${rows} rows; ${cols} values of x, so ${cols} columns), but yours is ${shape}.` };
  if (sameMatrix(got, want)) {
    let [top, ti, tj] = [-Infinity, 0, 0];
    want.forEach((row, i) => row.forEach((v, j) => v > top && ([top, ti, tj] = [v, i, j])));
    return { pass: true, message: `A ${rows}×${cols} map of the hill. Its highest height here is ${fmt(top)}, at x = ${fmt(xs[tj])}, y = ${fmt(ys[ti])} (row ${ti}, column ${tj}); the hilltop itself is at (1, 2), height 9.` };
  }
  if (got.every((r) => r.every((v) => v === 0))) return { pass: false, message: 'Every height is still 0: for each row i and column j, set grid[i][j] to the height f(x, y) at x = xs[j], y = ys[i].' };
  if (sameMatrix(got, [...want].reverse())) {
    return { pass: false, message: `Your map is upside down: its top row holds the heights for y = ${fmt(ys[rows - 1])}. ys is listed from the top of the map down, largest first, as a map is read, so row i goes with ys[i] just as it comes.` };
  }
  if (sameMatrix(got, ys.map((y) => xs.map((x) => hill(y, x))))) {
    return { pass: false, message: 'You called f(y, x): f takes x first, then y, and this hill isn’t the same both ways round. Row i’s y is ys[i] and column j’s x is xs[j], so grid[i][j] = f(xs[j], ys[i]).' };
  }
  if (rows === cols && sameMatrix(got, ys.map((_, i) => xs.map((__, j) => hill(xs[i], ys[j]))))) {
    return { pass: false, message: 'Rows and columns are swapped: your row i uses xs[i] and column j uses ys[j]. On a map, row i is the line y = ys[i] and column j is the line x = xs[j].' };
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      if (!near(got[i][j], want[i][j], 1e-9)) return { pass: false, message: `grid[${i}][${j}] is the height at x = xs[${j}] = ${fmt(xs[j])}, y = ys[${i}] = ${fmt(ys[i])}: f(${fmt(xs[j])}, ${fmt(ys[i])}) = ${fmt(want[i][j])}, but yours is ${fmt(got[i][j])}.` };
  return { pass: false, message: `The heights should be ${grid(want)}.` };
}

const HILL_PY = `def f(x, y):
    # The height of a hill at the point (x, y). Its top is at (1, 2).
    return 2 - x * x - 2 * y * y + x * y + 7 * y
`;
const HILL_JS = `function f(x, y) {
  // The height of a hill at the point (x, y). Its top is at (1, 2).
  return 2 - x * x - 2 * y * y + x * y + 7 * y;
}
`;
const HEIGHTS_PY = `${HILL_PY}

def heights(xs, ys):
    grid = table(len(ys), len(xs), 0)
    for i in range(len(ys)):
        for j in range(len(xs)):
            grid[i][j] = f(xs[j], ys[i])
    return grid
`;
const HEIGHTS_JS = `${HILL_JS}
function heights(xs, ys) {
  const grid = table(ys.length, xs.length, 0);
  for (let i = 0; i < ys.length; i++) {
    for (let j = 0; j < xs.length; j++) {
      grid[i][j] = f(xs[j], ys[i]);
    }
  }
  return grid;
}
`;
const HEIGHTS_STARTER_PY = `${HILL_PY}

def heights(xs, ys):
    # Make grid = table(rows, cols, 0), one row for each y and one column
    # for each x. Row i is the line y = ys[i] (the top row first, as on a
    # map); column j is the line x = xs[j]. Fill in every height, return grid.
    return []
`;
const HEIGHTS_STARTER_JS = `${HILL_JS}
function heights(xs, ys) {
  // Make grid = table(rows, cols, 0), one row for each y and one column
  // for each x. Row i is the line y = ys[i] (the top row first, as on a
  // map); column j is the line x = xs[j]. Fill in every height, return grid.
  return [];
}
`;
const heightsTs = (js: string) =>
  js
    .replace('function f(x, y) {', 'function f(x: number, y: number): number {')
    .replace('function heights(xs, ys) {', 'function heights(xs: number[], ys: number[]): number[][] {')
    .replace('const grid = table(', 'const grid: number[][] = table(');

const AROUND_TOP: HeightInput = { xs: [-1, 0, 1, 2, 3], ys: [4, 3, 2, 1, 0] };
const WIDE: HeightInput = { xs: [-2, -1, 0, 1, 2, 3, 4], ys: [3, 2, 1] };

const heightsExercise: Exercise<HeightInput> = {
  slug: 'height-table',
  title: 'Fill in a table of heights',
  kind: 'write',
  visualiser: 'contour-maps',
  summary: 'Work out a hill’s height f(x, y) at every point of a grid: one row for each y, one column for each x, the top row first, as a map is read.',
  task: [
    'A function of two variables gives a height for every point (x, y), like a hill on a map. The starter’s `f(x, y)` is a slanted hill whose top is at (1, 2). Write `heights(xs, ys)`, which returns a table of its heights, ready to draw as a map.',
    'Make the table with `grid = table(len(ys), len(xs), 0)` (`table(ys.length, xs.length, 0)` in JavaScript and TypeScript): one row for each y and one column for each x. `ys` comes from the top of the map down, largest first, so row i is the line y = `ys[i]`, and column j is the line x = `xs[j]`. Set `grid[i][j]` to the height there, f(`xs[j]`, `ys[i]`), and return `grid`.',
  ],
  entry: { python: 'heights', js: 'heights' },
  args: heightArgs,
  starter: { python: HEIGHTS_STARTER_PY, javascript: HEIGHTS_STARTER_JS, typescript: heightsTs(HEIGHTS_STARTER_JS) },
  solution: { python: HEIGHTS_PY, javascript: HEIGHTS_JS, typescript: heightsTs(HEIGHTS_JS) },
  examples: [
    { id: 'around-top', label: 'Around the hilltop', input: AROUND_TOP },
    { id: 'wide', label: 'Seven columns, three rows', input: WIDE },
  ],
  tests: [
    { name: 'around the hilltop', input: AROUND_TOP },
    { name: 'more columns than rows', input: WIDE },
    { name: 'more rows than columns', input: { xs: [0, 2], ys: [5, 4, 3, 2, 1, 0] } },
    { name: 'half steps', input: { xs: [0, 0.5, 1, 1.5, 2], ys: [2.5, 2, 1.5] } },
    { name: 'one row', input: { xs: [-1, 1, 3], ys: [2] } },
  ],
  check: checkHeights,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'The table has len(ys) rows and len(xs) columns. Two loops: i over the rows, and inside it, j over the columns.',
    'Row i is the line y = ys[i] and column j is the line x = xs[j]. Which of the two goes first into f?',
    'grid[i][j] = f(xs[j], ys[i]): x first, from the column; y second, from the row.',
  ],
  legend: writeLegend('A height not worked out yet', 'A height your code just wrote'),
};

// ───────────────────────────── 2. numeric-derivative ─────────────────────────────

/** The starter's named functions, each with its exact derivative. */
export const SLOPE_FUNCTIONS = {
  square: { f: (x: number) => x * x, df: (x: number) => 2 * x, formula: 'x²', slope: '2x' },
  cube: { f: (x: number) => x * x * x, df: (x: number) => 3 * x * x, formula: 'x³', slope: '3x²' },
  reciprocal: { f: (x: number) => 1 / x, df: (x: number) => -1 / (x * x), formula: '1/x', slope: '−1/x²' },
  bump: { f: (x: number) => x * x * x * x - 2 * x * x, df: (x: number) => 4 * x * x * x - 4 * x, formula: 'x⁴ − 2x²', slope: '4x³ − 4x' },
};

export type SlopeInput = { name: keyof typeof SLOPE_FUNCTIONS; xs: number[]; h: number };

/** The slope of f at x, from a step h each way: (f(x + h) − f(x − h)) / 2h. */
export const centralDifference = (f: (x: number) => number, x: number, h: number) => (f(x + h) - f(x - h)) / (2 * h);

/**
 * How far a central difference may miss the exact slope: its error is about
 * h²·f‴(x)/6, which stays under this for the functions and points used here,
 * while a one-sided difference misses by about h·f″(x)/2, far more.
 */
const slopeTolerance = (h: number, exact: number) => 50 * h * h * Math.max(1, Math.abs(exact));

const slopeArgs = ({ name, xs, h }: SlopeInput): Arg[] => [
  { kind: 'value', name: 'name', value: name },
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'value', name: 'h', value: h },
];

function checkSlopes(input: SlopeInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { name, xs, h } = input;
  const { f, df, formula, slope } = SLOPE_FUNCTIONS[name];
  const got = isNumbers(result.returned) ? result.returned : arrayFromEvents(result, 'out');
  if (!got || got.length !== xs.length) return { pass: false, message: `Return the ${xs.length} slopes, one for each x: slopes() does this once derivative returns a number.` };
  const exact = xs.map(df);
  const errors = got.map((g, i) => Math.abs(g - exact[i]));
  if (errors.every((e, i) => Number.isFinite(e) && e <= slopeTolerance(h, exact[i]))) {
    return { pass: true, message: `The slopes of ${formula} at ${list(xs)} are ${list(exact)} (it is ${slope}), and yours miss by at most ${tiny(Math.max(...errors))}: stepping both ways, the errors on the two sides cancel.` };
  }
  if (got.every((v) => v === 0)) return { pass: false, message: 'Every slope is still 0: derivative(f, x, h) should return the rise over the run between x − h and x + h.' };
  const central = xs.map((x) => centralDifference(f, x, h));
  const like = (want: number[]) => allNear(got, want, 1e-6);
  const worst = errors.reduce((w, e, i) => (e > errors[w] ? i : w), 0);
  const at = `at x = ${fmt(xs[worst])} it gives ${fmt(got[worst])}, but the slope is ${fmt(exact[worst])}`;
  if (like(xs.map((x) => (f(x + h) - f(x)) / h))) {
    return { pass: false, message: `That is the forward difference (f(x + h) − f(x)) / h: a chord that starts at x leans the way the curve bends, so it misses by an amount that shrinks only like h (${at}). Step both ways, (f(x + h) − f(x − h)) / (2h): the two sides’ errors cancel, and what is left shrinks like h², far faster.` };
  }
  if (like(xs.map((x) => (f(x) - f(x - h)) / h))) {
    return { pass: false, message: `That is the backward difference (f(x) − f(x − h)) / h, a chord that ends at x and leans the way the curve bends, so it misses by an amount that shrinks only like h (${at}). Step both ways, (f(x + h) − f(x − h)) / (2h): the two sides’ errors cancel, and what is left shrinks like h², far faster.` };
  }
  if (like(central.map((c) => 2 * c))) return { pass: false, message: 'Every slope is twice too big: x − h and x + h are 2h apart, so the run is 2h. Divide by 2 * h, not h.' };
  if (like(central.map((c) => c * h * h))) return { pass: false, message: 'In code, / 2 * h divides by 2 and then multiplies by h. Put brackets round the run: / (2 * h).' };
  if (like(central.map((c) => -c))) return { pass: false, message: 'Every slope has the wrong sign: the rise goes from the left point to the right one, f(x + h) − f(x − h).' };
  return { pass: false, message: `The slope of ${formula} is ${slope}: ${at}. derivative(f, x, h) should return (f(x + h) − f(x − h)) / (2 * h).` };
}

const FUNCTIONS_PY = `def square(x):
    return x * x


def cube(x):
    return x * x * x


def reciprocal(x):
    return 1 / x


def bump(x):
    return x * x * x * x - 2 * x * x


FUNCTIONS = {'square': square, 'cube': cube, 'reciprocal': reciprocal, 'bump': bump}
`;
const FUNCTIONS_JS = `function square(x) {
  return x * x;
}

function cube(x) {
  return x * x * x;
}

function reciprocal(x) {
  return 1 / x;
}

function bump(x) {
  return x * x * x * x - 2 * x * x;
}

const FUNCTIONS = { square: square, cube: cube, reciprocal: reciprocal, bump: bump };
`;
const SLOPES_PY = `def slopes(name, xs, h):
    f = FUNCTIONS[name]
    out = array(len(xs))
    for i in range(len(xs)):
        out[i] = derivative(f, xs[i], h)
    return out
`;
const SLOPES_JS = `function slopes(name, xs, h) {
  const f = FUNCTIONS[name];
  const out = array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    out[i] = derivative(f, xs[i], h);
  }
  return out;
}
`;
const derivativePy = (body: string) => `${FUNCTIONS_PY}

def derivative(f, x, h):
${body}


${SLOPES_PY}`;
const derivativeJs = (body: string) => `${FUNCTIONS_JS}
function derivative(f, x, h) {
${body}
}

${SLOPES_JS}`;
const slopesTs = (js: string) =>
  js
    .replace(/function (square|cube|reciprocal|bump)\(x\) \{/g, 'function $1(x: number): number {')
    .replace('const FUNCTIONS = {', 'const FUNCTIONS: Record<string, (x: number) => number> = {')
    .replace('function derivative(f, x, h) {', 'function derivative(f: (x: number) => number, x: number, h: number): number {')
    .replace('function slopes(name, xs, h) {', 'function slopes(name: string, xs: number[], h: number): number[] {')
    .replace('const out = array(', 'const out: number[] = array(');

const DERIVATIVE_PY = derivativePy('    return (f(x + h) - f(x - h)) / (2 * h)');
const DERIVATIVE_JS = derivativeJs('  return (f(x + h) - f(x - h)) / (2 * h);');
const DERIVATIVE_STARTER_PY = derivativePy('    # The slope of f at x, measured from a step h to each side.\n    return 0');
const DERIVATIVE_STARTER_JS = derivativeJs('  // The slope of f at x, measured from a step h to each side.\n  return 0;');

const SQUARE: SlopeInput = { name: 'square', xs: [-2, -1, 0, 1, 2], h: 0.001 };
const CUBE: SlopeInput = { name: 'cube', xs: [-2, -1, 0, 1, 2, 3], h: 0.001 };
const RECIPROCAL: SlopeInput = { name: 'reciprocal', xs: [0.25, 0.5, 1, 2, 4], h: 0.001 };

const derivativeExercise: Exercise<SlopeInput> = {
  slug: 'numeric-derivative',
  title: 'Measure a slope numerically',
  kind: 'write',
  visualiser: 'derivative-rules',
  summary: 'Measure f′(x) without any rules: the rise over the run between x − h and x + h, for a tiny h.',
  task: [
    'The derivative f′(x) is the slope of f’s graph at x. You can measure it without knowing any rules: take two points a tiny step h either side of x, and work out the slope of the line through them, rise over run.',
    'Write `derivative(f, x, h)`: the rise is f(x + h) − f(x − h), and the run, from x − h to x + h, is 2h. `slopes(name, xs, h)` is written for you: it picks a function from `FUNCTIONS` by name and writes the slope at each x into `out`, so you can compare them with the rules (the slope of x² is 2x, of x³ is 3x², of 1/x is −1/x²).',
  ],
  entry: { python: 'slopes', js: 'slopes' },
  args: slopeArgs,
  starter: { python: DERIVATIVE_STARTER_PY, javascript: DERIVATIVE_STARTER_JS, typescript: slopesTs(DERIVATIVE_STARTER_JS) },
  solution: { python: DERIVATIVE_PY, javascript: DERIVATIVE_JS, typescript: slopesTs(DERIVATIVE_JS) },
  examples: [
    { id: 'square', label: 'x², whose slope is 2x', input: SQUARE },
    { id: 'cube', label: 'x³, whose slope is 3x²', input: CUBE },
    { id: 'reciprocal', label: '1/x, whose slope is −1/x²', input: RECIPROCAL },
  ],
  tests: [
    { name: 'x² at whole numbers', input: SQUARE },
    { name: 'x³, flat at 0', input: CUBE },
    { name: '1/x, falling ever more slowly', input: RECIPROCAL },
    { name: 'x⁴ − 2x², with a smaller step', input: { name: 'bump', xs: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5], h: 0.0001 } },
    { name: 'x³ at halves, with a smaller step', input: { name: 'cube', xs: [-1.5, -0.5, 0.5, 1.5, 2.5], h: 0.0001 } },
  ],
  check: checkSlopes,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Slope = rise / run. The two points are (x − h, f(x − h)) and (x + h, f(x + h)).',
    'The run from x − h to x + h is 2h, not h, and in code it needs brackets: / (2 * h).',
    'return (f(x + h) - f(x - h)) / (2 * h)',
  ],
  legend: writeLegend('A slope not measured yet', 'A slope your code just measured'),
};

// ───────────────────────────── 3. newton-sqrt ─────────────────────────────

export type SqrtInput = { a: number };

/** One step of Newton's method for x² = a: x − (x² − a) / 2x. */
export const newtonStep = (x: number, a: number) => x - (x * x - a) / (2 * x);

/** The guesses the solution records, from x = a until a step is under 1e-12 × x. */
export function newtonGuesses(a: number): number[] {
  let x = a;
  const steps = [x];
  for (let k = 0; k < 200; k++) {
    const step = (x * x - a) / (2 * x);
    x = x - step;
    steps.push(x);
    if (Math.abs(step) <= 1e-12 * x) break;
  }
  return steps;
}

const sqrtArgs = ({ a }: SqrtInput): Arg[] => [{ kind: 'value', name: 'a', value: a }];

const ZERO_START = 'A guess of 0 breaks Newton’s method: the tangent of x² − a at 0 is flat (its slope 2x is 0), so the step divides by zero. Start from x = a.';

function checkSqrt({ a }: SqrtInput, result: RunResult): Verdict {
  const steps = arrayFromEvents(result, 'steps');
  /** Each guess follows from the one before by `rule`. */
  const follows = (rule: (x: number) => number, from = 0) => steps != null && steps.length >= from + 2 && steps.slice(from + 1).every((x, k) => near(x, rule(steps[from + k]), 1e-9));
  const flipFlop = () => steps != null && steps.length >= 3 && steps.slice(1).every((x, k) => near(x * steps[k], a, 1e-9));
  const FLIP = `Your guesses jump back and forth (${list((steps ?? []).slice(0, 4))}…) instead of settling: x − (x² − a) / x is just a / x, which swaps between x and a / x forever. The step is (x² − a) / (2x): half as big.`;
  if (result.error) {
    if (steps?.[0] === 0 || /zero/i.test(result.error.message) || (steps?.some((v) => v === 0) && /finite|Infinity|NaN/.test(result.error.message))) return { pass: false, message: ZERO_START };
    if (flipFlop()) return { pass: false, message: FLIP };
    if (result.error.kind === 'limit' || result.error.kind === 'timeout') return { pass: false, message: `The loop never stopped, so the step never got tiny. Stop once |step| is below 1e-12 × x (a millionth of a millionth of x). Your first guesses were ${list((steps ?? []).slice(0, 5))}.` };
    return crashed(result)!;
  }
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: 'Return the square root: a single number, your last guess.' };
  const want = Math.sqrt(a);
  if (near(got, want, 1e-9)) {
    if (!steps || steps.length < 2) return { pass: false, message: `${fmt(got)} is √${fmt(a)}, but steps should hold every guess, so the run shows them settling: append each new x to steps.` };
    if (!near(steps[steps.length - 1], got, 1e-9)) return { pass: false, message: 'The answer is right, but the last guess in steps isn’t it: append each new x to steps, the last one too.' };
    return { pass: true, message: `√${fmt(a)} = ${fmt(want)} after ${steps.length - 1} step${steps.length === 2 ? '' : 's'}: ${list(steps.slice(0, 5))}${steps.length > 5 ? '…' : ''}. Once a guess is close, each step about doubles its correct digits.` };
  }
  if (steps?.[0] === 0) return { pass: false, message: ZERO_START };
  if (flipFlop()) return { pass: false, message: FLIP };
  if (follows((x) => (x + a) / 2)) return { pass: false, message: `You averaged x and a, which settles on a itself. Newton’s step x − (x² − a) / (2x) works out as the average of x and a / x: x = (x + a / x) / 2.` };
  const iterates = newtonGuesses(a);
  const k = iterates.findIndex((v) => near(got, v, 1e-12));
  if (k === 0) return { pass: false, message: `You returned your first guess, ${fmt(a)}. Improve it again and again with x = x − (x² − a) / (2x), until a step is tiny.` };
  if (k > 0 || follows((x) => newtonStep(x, a))) {
    const n = k > 0 ? k : steps!.length - 1;
    return { pass: false, message: `You stopped after ${n} step${n === 1 ? '' : 's'}, at ${fmt(got)}, still ${tiny(Math.abs(got - want))} away from √${fmt(a)} = ${fmt(want)}. Keep stepping until the step itself is tiny: |step| below 1e-12 × x.` };
  }
  return { pass: false, message: `√${fmt(a)} = ${fmt(want)}, but you returned ${fmt(got)}. Each step is x = x − (x² − a) / (2x): slide down the tangent of x² − a to where it crosses 0.` };
}

const SQRT_PY = `def newton_sqrt(a):
    x = a
    steps = array([x])
    while True:
        step = (x * x - a) / (2 * x)
        x = x - step
        steps.append(x)
        if abs(step) <= 1e-12 * x:
            return x
`;
const SQRT_JS = `function newtonSqrt(a) {
  let x = a;
  const steps = array([x]);
  while (true) {
    const step = (x * x - a) / (2 * x);
    x = x - step;
    steps.push(x);
    if (Math.abs(step) <= 1e-12 * x) {
      return x;
    }
  }
}
`;
const SQRT_STARTER_PY = `def newton_sqrt(a):
    x = a  # the first guess
    steps = array([x])
    # Improve the guess again and again: x = x - (x * x - a) / (2 * x).
    # Append each new guess to steps, and stop once a step is tiny.
    return x
`;
const SQRT_STARTER_JS = `function newtonSqrt(a) {
  let x = a; // the first guess
  const steps = array([x]);
  // Improve the guess again and again: x = x - (x * x - a) / (2 * x).
  // Push each new guess onto steps, and stop once a step is tiny.
  return x;
}
`;
const sqrtTs = (js: string) => js.replace('function newtonSqrt(a) {', 'function newtonSqrt(a: number): number {').replace('const steps = array(', 'const steps: number[] = array(');

const sqrtExercise: Exercise<SqrtInput> = {
  slug: 'newton-sqrt',
  title: 'Square roots by Newton’s method',
  kind: 'write',
  visualiser: 'taylor',
  summary: 'Guess, then slide down the tangent line to a better guess, again and again: √a in a handful of steps.',
  task: [
    '√a is the x where x² − a = 0. Newton’s method finds it from a guess: replace the curve y = x² − a by its tangent line at the guess (the best straight-line copy of the curve there), and move to where that line crosses 0. The tangent at x has slope 2x, so the new guess is x − (x² − a) / (2x).',
    'Write `newton_sqrt(a)` (`newtonSqrt` in JavaScript and TypeScript). Start from x = a, and repeat the step, appending each new guess to `steps` (`steps.push` in JavaScript), until a step is tiny: stop once |step| is at most 1e-12 × x, written `1e-12 * x`. Return x.',
  ],
  entry: { python: 'newton_sqrt', js: 'newtonSqrt' },
  args: sqrtArgs,
  starter: { python: SQRT_STARTER_PY, javascript: SQRT_STARTER_JS, typescript: sqrtTs(SQRT_STARTER_JS) },
  solution: { python: SQRT_PY, javascript: SQRT_JS, typescript: sqrtTs(SQRT_JS) },
  examples: [
    { id: 'two', label: '√2', input: { a: 2 } },
    { id: 'million', label: '√1,000,000, from far away', input: { a: 1_000_000 } },
    { id: 'quarter', label: '√0.25, from below', input: { a: 0.25 } },
  ],
  tests: [
    { name: '√2', input: { a: 2 } },
    { name: '√9 = 3', input: { a: 9 } },
    { name: '√0.25 = 0.5: a guess too small at first', input: { a: 0.25 } },
    { name: '√1,000,000 = 1000, from far away', input: { a: 1_000_000 } },
    { name: '√10', input: { a: 10 } },
    { name: '√1: already there', input: { a: 1 } },
  ],
  check: checkSqrt,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'A loop that never ends by itself (while True / while (true)), which returns x once the step is tiny.',
    'Inside the loop: work out step = (x * x - a) / (2 * x), then x = x - step, then append x to steps.',
    'Check the step after moving: if abs(step) <= 1e-12 * x, return x. Don’t forget the 2: without it, the guesses jump between x and a / x forever.',
  ],
  legend: writeLegend('An earlier guess', 'The newest guess'),
};

// ───────────────────────────── 4. jacobian-numeric ─────────────────────────────

type PlaneMap = (x: number, y: number) => [number, number];

/** The starter's maps of the plane, with their exact Jacobians [[∂u/∂x, ∂u/∂y], [∂v/∂x, ∂v/∂y]]. */
export const PLANE_MAPS: Record<'bend' | 'squaring' | 'linear', { F: PlaneMap; J: (x: number, y: number) => number[][] }> = {
  bend: { F: (x, y) => [x + (y * y) / 4, y - (x * x) / 4], J: (x, y) => [[1, y / 2], [-x / 2, 1]] },
  squaring: { F: (x, y) => [x * x - y * y, 2 * x * y], J: (x, y) => [[2 * x, -2 * y], [2 * y, 2 * x]] },
  linear: { F: (x, y) => [2 * x + y, 3 * y], J: () => [[2, 1], [0, 3]] },
};

export type JacobianInput = { name: keyof typeof PLANE_MAPS; x: number; y: number; h: number };

/** J measured by central differences, one input at a time, as the solution does. */
export function numericJacobian({ name, x, y, h }: JacobianInput, { run = 2 * h, oneSided = false } = {}): number[][] {
  const { F } = PLANE_MAPS[name];
  const [right, left, up, down] = [F(x + h, y), oneSided ? F(x, y) : F(x - h, y), F(x, y + h), oneSided ? F(x, y) : F(x, y - h)];
  return [0, 1].map((i) => [(right[i] - left[i]) / run, (up[i] - down[i]) / run]);
}

const jacobianArgs = ({ name, x, y, h }: JacobianInput): Arg[] => [
  { kind: 'value', name: 'name', value: name },
  { kind: 'value', name: 'x', value: x },
  { kind: 'value', name: 'y', value: y },
  { kind: 'value', name: 'h', value: h },
];

function checkJacobian(input: JacobianInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { name, x, y, h } = input;
  const got = result.returned;
  if (!isMatrix(got) || got.length !== 2 || got.some((r) => r.length !== 2)) return { pass: false, message: 'Return J, a 2×2 table: J = table(2, 2), one row per output and one column per input.' };
  const want = PLANE_MAPS[name].J(x, y);
  if (sameMatrix(got, want, 1e-6)) {
    const det = want[0][0] * want[1][1] - want[0][1] * want[1][0];
    return { pass: true, message: `J = ${grid(want)} at (${fmt(x)}, ${fmt(y)}): close up, the map acts like this matrix, and det J = ${fmt(det)} says it scales tiny areas there by ${fmt(Math.abs(det))}${det < 0 ? ' and flips them' : ''}.` };
  }
  if (got.every((r) => r.every((v) => v === 0))) return { pass: false, message: 'J is still all zeros: fill each cell J[i][j] with how much output i changes per unit step of input j.' };
  const like = (m: number[][]) => sameMatrix(got, m, 1e-6);
  const central = numericJacobian(input);
  if (like([[want[0][0], want[1][0]], [want[0][1], want[1][1]]])) {
    return { pass: false, message: 'Rows and columns are swapped. Row i is output i and column j is input j: J[0][1] is how fast output 0 changes as y moves, (F(x, y + h)[0] − F(x, y − h)[0]) / (2h).' };
  }
  if (like(numericJacobian(input, { oneSided: true, run: h }))) {
    return { pass: false, message: 'That is a forward difference, (F(x + h, y) − F(x, y)) / h: a one-sided chord leans the way the map bends, so it is off by about h times half the bend. Step both ways, F(x + h, y) − F(x − h, y), over 2h.' };
  }
  if (like(central.map((r) => r.map((v) => 2 * v)))) return { pass: false, message: 'Every entry is twice too big: x − h and x + h are 2h apart. Divide by 2 * h, not h.' };
  if (like(central.map((r) => r.map((v) => v * h * h)))) return { pass: false, message: 'In code, / 2 * h divides by 2 and then multiplies by h. Put brackets round the run: / (2 * h).' };
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      if (!near(got[i][j], want[i][j], 1e-6)) return { pass: false, message: `J[${i}][${j}] is how fast output ${i} changes as ${j === 0 ? 'x' : 'y'} moves: ${fmt(want[i][j])} here, but yours is ${fmt(got[i][j])}. Nudge only ${j === 0 ? 'x' : 'y'}, by h each way, and divide the change in output ${i} by 2h.` };
  return { pass: false, message: `J should be ${grid(want)}.` };
}

const MAPS_PY = `def bend(x, y):
    return [x + y * y / 4, y - x * x / 4]


def squaring(x, y):
    # Squares each point's distance from (0, 0) and doubles its angle.
    return [x * x - y * y, 2 * x * y]


def linear(x, y):
    # A linear map: its matrix is [[2, 1], [0, 3]].
    return [2 * x + y, 3 * y]


MAPS = {'bend': bend, 'squaring': squaring, 'linear': linear}
`;
const MAPS_JS = `function bend(x, y) {
  return [x + y * y / 4, y - x * x / 4];
}

function squaring(x, y) {
  // Squares each point's distance from (0, 0) and doubles its angle.
  return [x * x - y * y, 2 * x * y];
}

function linear(x, y) {
  // A linear map: its matrix is [[2, 1], [0, 3]].
  return [2 * x + y, 3 * y];
}

const MAPS = { bend: bend, squaring: squaring, linear: linear };
`;
const JACOBIAN_PY = `${MAPS_PY}

def jacobian(name, x, y, h):
    F = MAPS[name]
    J = table(2, 2)
    right = F(x + h, y)
    left = F(x - h, y)
    up = F(x, y + h)
    down = F(x, y - h)
    for i in range(2):
        J[i][0] = (right[i] - left[i]) / (2 * h)
        J[i][1] = (up[i] - down[i]) / (2 * h)
    return J
`;
const JACOBIAN_JS = `${MAPS_JS}
function jacobian(name, x, y, h) {
  const F = MAPS[name];
  const J = table(2, 2);
  const right = F(x + h, y);
  const left = F(x - h, y);
  const up = F(x, y + h);
  const down = F(x, y - h);
  for (let i = 0; i < 2; i++) {
    J[i][0] = (right[i] - left[i]) / (2 * h);
    J[i][1] = (up[i] - down[i]) / (2 * h);
  }
  return J;
}
`;
const JACOBIAN_STARTER_PY = `${MAPS_PY}

def jacobian(name, x, y, h):
    F = MAPS[name]
    J = table(2, 2)
    # J[i][j]: how fast output i changes per unit step of input j
    # (j = 0 is x, j = 1 is y). Measure it by nudging that one input
    # by h each way.
    return J
`;
const JACOBIAN_STARTER_JS = `${MAPS_JS}
function jacobian(name, x, y, h) {
  const F = MAPS[name];
  const J = table(2, 2);
  // J[i][j]: how fast output i changes per unit step of input j
  // (j = 0 is x, j = 1 is y). Measure it by nudging that one input
  // by h each way.
  return J;
}
`;
const jacobianTs = (js: string) =>
  js
    .replace(/function (bend|squaring|linear)\(x, y\) \{/g, 'function $1(x: number, y: number): number[] {')
    .replace('const MAPS = {', 'const MAPS: Record<string, (x: number, y: number) => number[]> = {')
    .replace('function jacobian(name, x, y, h) {', 'function jacobian(name: string, x: number, y: number, h: number): number[][] {')
    .replace('const J = table(', 'const J: number[][] = table(');

const BEND: JacobianInput = { name: 'bend', x: 1, y: 2, h: 0.001 };
const SQUARING: JacobianInput = { name: 'squaring', x: 1, y: 2, h: 0.001 };
const LINEAR: JacobianInput = { name: 'linear', x: 3, y: -1, h: 0.001 };

const jacobianExercise: Exercise<JacobianInput> = {
  slug: 'jacobian-numeric',
  title: 'The Jacobian, measured',
  kind: 'write',
  visualiser: 'jacobian',
  summary: 'Nudge one input at a time and watch both outputs move: the 2×2 matrix a curved map looks like up close.',
  task: [
    'A map F takes a point (x, y) of the plane to a new point, F(x, y) = [output 0, output 1]. Close up, any smooth map acts like a matrix, its Jacobian J: J[i][j] is how fast output i changes per unit step of input j (input 0 is x, input 1 is y).',
    'Write `jacobian(name, x, y, h)`, which measures J at (x, y) for the map `MAPS[name]`. For column 0, nudge x alone: (F(x + h, y)[i] − F(x − h, y)[i]) / (2h) for each output i. For column 1, nudge y alone. Write the four numbers into `J` and return it.',
  ],
  entry: { python: 'jacobian', js: 'jacobian' },
  args: jacobianArgs,
  starter: { python: JACOBIAN_STARTER_PY, javascript: JACOBIAN_STARTER_JS, typescript: jacobianTs(JACOBIAN_STARTER_JS) },
  solution: { python: JACOBIAN_PY, javascript: JACOBIAN_JS, typescript: jacobianTs(JACOBIAN_JS) },
  examples: [
    { id: 'bend', label: 'A bend at (1, 2)', input: BEND },
    { id: 'squaring', label: 'Squaring at (1, 2)', input: SQUARING },
    { id: 'linear', label: 'A linear map: J is its matrix', input: LINEAR },
  ],
  tests: [
    { name: 'a bend at (1, 2)', input: BEND },
    { name: 'squaring at (1, 2)', input: SQUARING },
    { name: 'squaring at (−1.5, 0.5)', input: { name: 'squaring', x: -1.5, y: 0.5, h: 0.001 } },
    { name: 'a linear map: J is its matrix everywhere', input: LINEAR },
    { name: 'a bend at (−2, 1), with a smaller step', input: { name: 'bend', x: -2, y: 1, h: 0.0001 } },
  ],
  check: checkJacobian,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Work out the four nudged points first: F(x + h, y) and F(x − h, y) for column 0, F(x, y + h) and F(x, y − h) for column 1. Each is a list of two outputs.',
    'Row i is output i, column j is input j. So J[i][0] uses the x-nudges’ output i, and J[i][1] the y-nudges’ output i.',
    'Each cell is a central difference: (right[i] - left[i]) / (2 * h) in column 0, (up[i] - down[i]) / (2 * h) in column 1.',
  ],
  legend: writeLegend('A cell not measured yet', 'A cell your code just measured'),
};

export const calculusExercises: Exercise[] = [heightsExercise, derivativeExercise, sqrtExercise, jacobianExercise];

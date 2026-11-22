// Correlation as code (B6 of the math and ML path): centre both lists, write
// each point's product (x − x̄)(y − ȳ) into a visual array, average them into
// the covariance, and divide by both standard deviations to get r. Every
// average divides by n, as the lesson does.
//
// Python and JavaScript must write the same numbers (exercises.test.ts): the
// sums are explicit loops in the same order (Python's sum() of floats rounds
// differently since 3.12), and the only function is the square root, which is
// correctly rounded in both runtimes.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const TOLERANCE = 1e-9;
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));

const fmt = (v: number) => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e4) / 1e4;
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
    } else if (id != null && e.kind === 'write' && e.array === id) values[e.index] = e.value;
  }
  return id == null ? null : values;
}

export type CorrelationInput = { xs: number[]; ys: number[] };

const args = ({ xs, ys }: CorrelationInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'value', name: 'ys', value: ys },
  { kind: 'array', name: 'products', values: xs.map(() => 0) },
];

const total = (v: readonly number[]) => {
  let s = 0;
  for (const x of v) s = s + x;
  return s;
};

/** The solution's numbers, in its order: the products, the covariance, both spreads and r. */
export function correlate({ xs, ys }: CorrelationInput): { products: number[]; cov: number; sx: number; sy: number; r: number } {
  const n = xs.length;
  const mx = total(xs) / n;
  const my = total(ys) / n;
  const products: number[] = [];
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    products[i] = a * b;
    sxy = sxy + products[i];
    sxx = sxx + a * a;
    syy = syy + b * b;
  }
  const cov = sxy / n;
  const sx = Math.sqrt(sxx / n);
  const sy = Math.sqrt(syy / n);
  return { products, cov, sx, sy, r: cov / (sx * sy) };
}

/** The slips' answers, each computed the way the slip computes it. */
export function slips({ xs, ys }: CorrelationInput) {
  const n = xs.length;
  const mx = total(xs) / n;
  const my = total(ys) / n;
  const a = xs.map((x) => x - mx);
  const b = ys.map((y) => y - my);
  const sq = (v: readonly number[]) => total(v.map((d) => d * d));
  const sab = total(a.map((v, i) => v * b[i]));
  const { cov, sx, sy } = correlate({ xs, ys });
  return {
    /** Raw values, never centred: Σxy over √(Σx² Σy²). */
    raw: total(xs.map((x, i) => x * ys[i])) / Math.sqrt(sq(xs) * sq(ys)),
    /** Only x centred in the spreads too: Σ (x − x̄)y over √(Σ (x − x̄)² Σ y²). */
    onlyX: total(a.map((v, i) => v * ys[i])) / Math.sqrt(sq(a) * sq(ys)),
    onlyY: total(b.map((v, i) => xs[i] * v)) / Math.sqrt(sq(xs) * sq(b)),
    /** The covariance ÷ n, the spreads ÷ (n − 1); and the other way round. */
    spreadsByNMinus1: cov / (Math.sqrt(sq(a) / (n - 1)) * Math.sqrt(sq(b) / (n - 1))),
    covByNMinus1: sab / (n - 1) / (sx * sy),
    /** Variances where the standard deviations should be. */
    noRoot: cov / ((sx * sx) * (sy * sy)),
    noRootSums: sab / (sq(a) * sq(b)),
    cov,
    dot: sab,
    /** Sizes of the products, signs dropped. */
    absolute: total(a.map((v, i) => Math.abs(v * b[i]))) / n / (sx * sy),
    /** Only one spread divided out. */
    oneSpread: [cov / sx, cov / sy],
  };
}

function checkCorrelation(input: CorrelationInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { xs, ys } = input;
  const n = xs.length;
  const want = correlate(input);
  const got = result.returned;
  const products = arrayFromEvents(result, 'products');
  if (typeof got !== 'number') return { pass: false, message: 'Return r, a single number.' };
  const s = slips(input);
  const productsRight = products !== null && matches(products, want.products);
  const onlyOneCentred =
    products !== null &&
    (matches(
      products,
      xs.map((x, i) => (x - total(xs) / n) * ys[i]),
    ) ||
      matches(
        products,
        ys.map((y, i) => xs[i] * (y - total(ys) / n)),
      ));

  if (close(got, want.r)) {
    if (productsRight) return { pass: true, message: `r = ${fmt(want.r)}: the covariance ${fmt(want.cov)} divided by the spreads ${fmt(want.sx)} and ${fmt(want.sy)}.` };
    if (onlyOneCentred)
      return { pass: false, message: `r is right, but products should hold (x − x̄)(y − ȳ), with both centred: ${list(want.products)}. Centring only one list gives a different product for each point, though the same total, since the gaps of the other add up to 0.` };
    return { pass: false, message: `r is right, but products should hold each point's (x − x̄)(y − ȳ): ${list(want.products)}.` };
  }
  if (products !== null && products.every((p) => p === 0) && close(got, 0) && want.r !== 0)
    return { pass: false, message: 'You returned 0 and products is still all 0s: work out x̄ and ȳ first, then fill products with (x − x̄)(y − ȳ).' };
  if (close(got, s.raw) || (products !== null && matches(products, xs.map((x, i) => x * ys[i]))))
    return { pass: false, message: 'You multiplied the raw values, x times y. Centre them first: take the mean away from each list, so a point counts by how far it sits from the middle, (x − x̄)(y − ȳ).' };
  if (close(got, s.onlyX) || close(got, s.onlyY) || onlyOneCentred)
    return { pass: false, message: 'You centred only one of the lists. Take x̄ away from every x and ȳ away from every y, in the products and in both spreads.' };
  if (close(got, s.cov)) return { pass: false, message: `${fmt(got)} is the covariance, the average product. Divide it by both standard deviations, sx = ${fmt(want.sx)} and sy = ${fmt(want.sy)}, to get r.` };
  if (close(got, s.dot)) return { pass: false, message: `${fmt(got)} is the total of the products, a · b. Divide by n for the covariance, then by sx · sy for r.` };
  if (close(got, s.noRoot) || close(got, s.noRootSums))
    return { pass: false, message: 'You divided by the variances, the average squared gaps. The spreads are their square roots: sx = √(Σ (x − x̄)² ÷ n), and the same for y.' };
  if (close(got, s.spreadsByNMinus1) || close(got, s.covByNMinus1))
    return { pass: false, message: `You divided by different counts: n in one place and n − 1 in another. Use n = ${n} everywhere, and the counts cancel, as they must for r to be a cosine.` };
  if (close(got, s.absolute)) return { pass: false, message: 'You added the sizes of the products. Keep their signs: a point in a − corner, where the gaps have opposite signs, must pull r down.' };
  if (s.oneSpread.some((v) => close(got, v))) return { pass: false, message: 'Divide the covariance by both spreads, sx · sy, not just one of them.' };
  if (Math.abs(got) > 1 + 1e-9) return { pass: false, message: `r is always between −1 and 1, but your code returns ${fmt(got)}. For these points r = ${fmt(want.r)}.` };
  return { pass: false, message: `For these points r = ${fmt(want.r)} (the covariance ${fmt(want.cov)} over ${fmt(want.sx)} × ${fmt(want.sy)}), but your code returns ${fmt(got)}.` };
}

const PY = `import math


def correlation(xs, ys, products):
    n = len(xs)
    mx = 0
    my = 0
    for i in range(n):
        mx = mx + xs[i]
        my = my + ys[i]
    mx = mx / n
    my = my / n
    sxy = 0
    sxx = 0
    syy = 0
    for i in range(n):
        a = xs[i] - mx
        b = ys[i] - my
        products[i] = a * b
        sxy = sxy + products[i]
        sxx = sxx + a * a
        syy = syy + b * b
    cov = sxy / n
    sx = math.sqrt(sxx / n)
    sy = math.sqrt(syy / n)
    return cov / (sx * sy)
`;
const PY_BLANKS = `import math


def correlation(xs, ys, products):
    n = len(xs)
    mx = 0
    my = 0
    for i in range(n):
        mx = mx + xs[i]
        my = my + ys[i]
    mx = mx / n
    my = my / n
    sxy = 0
    sxx = 0
    syy = 0
    for i in range(n):
        a = «1:xs[i] - mx»
        b = «2:ys[i] - my»
        products[i] = «3:a * b»
        sxy = sxy + products[i]
        sxx = sxx + a * a
        syy = syy + b * b
    cov = «4:sxy / n»
    sx = «5:math.sqrt(sxx / n)»
    sy = math.sqrt(syy / n)
    return «6:cov / (sx * sy)»
`;
const JS = `function correlation(xs, ys, products) {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx = mx + xs[i];
    my = my + ys[i];
  }
  mx = mx / n;
  my = my / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    products[i] = a * b;
    sxy = sxy + products[i];
    sxx = sxx + a * a;
    syy = syy + b * b;
  }
  const cov = sxy / n;
  const sx = Math.sqrt(sxx / n);
  const sy = Math.sqrt(syy / n);
  return cov / (sx * sy);
}
`;
const JS_BLANKS = `function correlation(xs, ys, products) {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx = mx + xs[i];
    my = my + ys[i];
  }
  mx = mx / n;
  my = my / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const a = «1:xs[i] - mx»;
    const b = «2:ys[i] - my»;
    products[i] = «3:a * b»;
    sxy = sxy + products[i];
    sxx = sxx + a * a;
    syy = syy + b * b;
  }
  const cov = «4:sxy / n»;
  const sx = «5:Math.sqrt(sxx / n)»;
  const sy = Math.sqrt(syy / n);
  return «6:cov / (sx * sy)»;
}
`;
const ts = (js: string) => js.replace('function correlation(xs, ys, products) {', 'function correlation(xs: number[], ys: number[], products: number[]): number {');

const STARTER_PY = `import math


def correlation(xs, ys, products):
    # 1. The means: mx = x̄ and my = ȳ.
    # 2. For each point: a = x − x̄, b = y − ȳ, and products[i] = a × b.
    #    Keep running totals of a × b, a × a and b × b.
    # 3. cov = (total of the products) / n, sx = √(total of a × a / n), sy too.
    # 4. Return r = cov / (sx × sy).
    return 0
`;
const STARTER_JS = `function correlation(xs, ys, products) {
  // 1. The means: mx = x̄ and my = ȳ.
  // 2. For each point: a = x − x̄, b = y − ȳ, and products[i] = a × b.
  //    Keep running totals of a × b, a × a and b × b.
  // 3. cov = (total of the products) / n, sx = √(total of a × a / n), sy too.
  // 4. Return r = cov / (sx × sy).
  return 0;
}
`;

const correlationExercise: Exercise<CorrelationInput> = {
  slug: 'correlation',
  title: 'The correlation r',
  kind: 'write',
  visualiser: 'correlation',
  summary: 'Centre both lists, average the products (x − x̄)(y − ȳ) into the covariance, and divide by both spreads.',
  task: [
    'Each point i has two measurements, `xs[i]` and `ys[i]`. Its product (x − x̄)(y − ȳ) is positive when the point sits up and to the right of the middle (x̄, ȳ), or down and to the left, and negative in the other two corners. The covariance is the average of the products, and the correlation divides it by both standard deviations: r = cov / (sx · sy), where sx = √(Σ (x − x̄)² / n).',
    'Write `correlation(xs, ys, products)`: `products` comes in with a 0 for every point, so overwrite `products[i]` with point i’s product (don’t append), and return r. Divide by n, the number of points, every time.',
  ],
  entry: { python: 'correlation', js: 'correlation' },
  args,
  starter: { python: STARTER_PY, javascript: STARTER_JS, typescript: ts(STARTER_JS) },
  solution: { python: PY, javascript: JS, typescript: ts(JS) },
  blanks: { python: PY_BLANKS, javascript: JS_BLANKS, typescript: ts(JS_BLANKS) },
  fades: [[3, 6], [1, 2, 3, 5], [1, 2, 3, 4, 5, 6]],
  distractors: {
    python: ['        products[i] = xs[i] * ys[i]', '    sx = sxx / n', '    return cov'],
    javascript: ['    products[i] = xs[i] * ys[i];', '  const sx = sxx / n;', '  return cov;'],
    typescript: ['    products[i] = xs[i] * ys[i];', '  const sx = sxx / n;', '  return cov;'],
  },
  examples: [
    { id: 'revision', label: 'Hours of revision and test scores', input: { xs: [1, 2, 3, 5, 6, 7], ys: [3, 4, 7, 4, 8, 10] } },
    { id: 'ring', label: 'A ring: a pattern with r = 0', input: { xs: [4, 6, 8, 8, 6, 4, 2, 2], ys: [8, 8, 6, 4, 2, 2, 4, 6] } },
  ],
  tests: [
    { name: 'hours of revision and test scores', input: { xs: [1, 2, 3, 5, 6, 7], ys: [3, 4, 7, 4, 8, 10] } },
    { name: 'a ring: r = 0 despite the pattern', input: { xs: [4, 6, 8, 8, 6, 4, 2, 2], ys: [8, 8, 6, 4, 2, 2, 4, 6] } },
    { name: 'exactly on a rising line: r = 1', input: { xs: [0, 1, 2, 3, 4], ys: [1, 4, 7, 10, 13] } },
    { name: 'on a gentle falling line: r = −1', input: { xs: [2, 4, 6, 8], ys: [9, 8, 7, 6] } },
    { name: 'a cloud with one far point', input: { xs: [1, 2, 2, 3, 3, 4, 9], ys: [2, 3, 1, 1, 3, 2, 8] } },
    { name: 'leaning down, with decimals and negatives', input: { xs: [-1.5, 0.5, 2, 3.5, 4], ys: [6.2, 4.1, 4.4, 1.3, 2] } },
  ],
  check: checkCorrelation,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Two loops: the first adds up the x values and the y values for the means, the second goes through the points again, centring each one.',
    'Inside the second loop, a = xs[i] − mx and b = ys[i] − my. The product a × b goes into products[i]; keep running totals of a × b, a × a and b × b.',
    'cov = total of a × b / n. Each spread is a square root: sx = √(total of a × a / n). Then r = cov / (sx × sy), which always lands between −1 and 1.',
  ],
  legend: [
    { neutral: 'A product not written yet' },
    { mark: 'write', label: 'The product (x − x̄)(y − ȳ) just written' },
  ],
};

export const correlationExercises: Exercise[] = [correlationExercise];

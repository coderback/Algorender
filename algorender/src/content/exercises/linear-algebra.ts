// Linear algebra, as code (B2 of the math and ML path): the learner writes
// the three vector moves (add, scale, length) and walks a robot with them,
// finds the most similar vector by cosine, measures a gap with three norms,
// and multiplies two matrices into a table, so each cell lights up the row of
// A and the column of B it reads.
//
// Python and JavaScript must write the same numbers (exercises.test.ts). Both
// round +, −, ×, ÷ and √ the same way, and the loops add in the same order, so
// even the irrational lengths and cosines agree to the last bit.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

const TOLERANCE = 1e-9;
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));

const fmt = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `(${vs.map(fmt).join(', ')})`;
const grid = (rows: readonly (readonly (number | null)[])[]) => `[${rows.map((r) => `[${r.map((v) => (v == null ? '·' : fmt(v))).join(', ')}]`).join(', ')}]`;

/** The learner's visual array `name` at the end of the run. */
function arrayOf(result: RunResult, name: string): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  return made && made.kind === 'array' ? (result.arrays[made.array] ?? null) : null;
}

const WRITE_LEGEND: Exercise['legend'] = [
  { neutral: 'A value not written yet' },
  { mark: 'write', label: 'A value your code just wrote' },
];

// ───────────────────────────── 1. add, scale, length ─────────────────────────────

export type WalkInput = { moves: [number, number][]; speeds: number[] };

const walkArgs = ({ moves, speeds }: WalkInput): Arg[] => [
  { kind: 'value', name: 'moves', value: moves },
  { kind: 'value', name: 'speeds', value: speeds },
  { kind: 'array', name: 'pos', values: [0, 0] },
];

/** Where the robot ends (the sum of speed × move) and how far that is from the start. */
export function walk({ moves, speeds }: WalkInput): { pos: [number, number]; distance: number } {
  let here: [number, number] = [0, 0];
  moves.forEach((m, i) => {
    here = [here[0] + speeds[i] * m[0], here[1] + speeds[i] * m[1]];
  });
  return { pos: here, distance: Math.sqrt(here[0] * here[0] + here[1] * here[1]) };
}

function checkWalk(input: WalkInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const want = walk(input);
  const pos = arrayOf(result, 'pos');
  const got = result.returned;
  if (!pos) return { pass: false, message: 'Keep the line that writes the robot’s position into pos.' };
  if (typeof got !== 'number') return { pass: false, message: 'walk returns length(here), a single number: make length return a number.' };
  const [x, y] = want.pos;
  if (matches(pos, want.pos)) {
    if (close(got, want.distance)) return { pass: true, message: `The robot ends at ${list(want.pos)}, ${fmt(want.distance)} from where it started: √(${fmt(x)}² + ${fmt(y)}²).` };
    if (close(got, x * x + y * y)) return { pass: false, message: `The robot ends in the right place, ${list(want.pos)}, but length returned ${fmt(got)}: that is x² + y². Take its square root.` };
    if (close(got, Math.abs(x) + Math.abs(y))) return { pass: false, message: `length returned ${fmt(got)}, the city-block distance |x| + |y|. The length is the straight line, √(x² + y²) = ${fmt(want.distance)}.` };
    return { pass: false, message: `The robot ends at ${list(want.pos)}, which is right, so length is off: √(${fmt(x)}² + ${fmt(y)}²) = ${fmt(want.distance)}, but your code returns ${fmt(got)}.` };
  }
  if (pos.every((v) => v === 0) && want.pos.some((v) => v !== 0)) return { pass: false, message: 'pos never moved from (0, 0): add and scale still return a placeholder. Fill them in.' };
  const unscaled = walk({ moves: input.moves, speeds: input.speeds.map(() => 1) }).pos;
  if (matches(pos, unscaled) && !matches(unscaled, want.pos)) return { pass: false, message: `pos is ${list(pos)}: every move was taken once, at speed 1. scale(k, v) must multiply both parts of v by k.` };
  const firstOnly = walk({ moves: input.moves.map((m) => [m[0], 0] as [number, number]), speeds: input.speeds }).pos;
  if (matches(pos, firstOnly)) return { pass: false, message: 'Only the x parts moved. add and scale must work on both parts, [0] and [1].' };
  return { pass: false, message: `After every move the robot should be at ${list(want.pos)}, but pos holds ${list(pos)}. Check add (part by part: u[0] + v[0], u[1] + v[1]) and scale (k times each part).` };
}

const WALK_PY = `import math


def add(u, v):
    return [u[0] + v[0], u[1] + v[1]]


def scale(k, v):
    return [k * v[0], k * v[1]]


def length(v):
    return math.sqrt(v[0] * v[0] + v[1] * v[1])


def walk(moves, speeds, pos):
    here = [0, 0]
    for i in range(len(moves)):
        here = add(here, scale(speeds[i], moves[i]))
        pos[0] = here[0]
        pos[1] = here[1]
    return length(here)
`;
const WALK_JS = `function add(u, v) {
  return [u[0] + v[0], u[1] + v[1]];
}

function scale(k, v) {
  return [k * v[0], k * v[1]];
}

function length(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

function walk(moves, speeds, pos) {
  let here = [0, 0];
  for (let i = 0; i < moves.length; i++) {
    here = add(here, scale(speeds[i], moves[i]));
    pos[0] = here[0];
    pos[1] = here[1];
  }
  return length(here);
}
`;
const walkTs = (js: string) =>
  js
    .replace('function add(u, v) {', 'function add(u: number[], v: number[]): number[] {')
    .replace('function scale(k, v) {', 'function scale(k: number, v: number[]): number[] {')
    .replace('function length(v) {', 'function length(v: number[]): number {')
    .replace('function walk(moves, speeds, pos) {', 'function walk(moves: number[][], speeds: number[], pos: number[]): number {');

const WALK_LOOP_PY = WALK_PY.slice(WALK_PY.indexOf('def walk'));
const WALK_LOOP_JS = WALK_JS.slice(WALK_JS.indexOf('function walk'));

const walkExercise: Exercise<WalkInput> = {
  slug: 'vector-walk',
  title: 'Walk a robot with vectors',
  kind: 'write',
  visualiser: 'vectors',
  summary: 'Write add, scale and length for 2D vectors, then follow a robot through its moves.',
  task: [
    'A robot starts at (0, 0) and makes a list of moves. Move `i` is the vector `moves[i]` scaled by `speeds[i]`: a speed of 2 goes twice as far, 0.5 half as far, and a negative speed goes backwards.',
    'The function `walk` is written for you: it adds up the scaled moves and writes the robot’s position into `pos` after each one. Write the three helpers it uses: `add(u, v)` (part by part), `scale(k, v)` (every part times k) and `length(v)` (by Pythagoras). Each vector is a list `[x, y]`.',
  ],
  entry: { python: 'walk', js: 'walk' },
  args: walkArgs,
  starter: {
    python: `import math


def add(u, v):
    # u + v, part by part
    return [0, 0]


def scale(k, v):
    # k times every part of v
    return [0, 0]


def length(v):
    # √(x² + y²)
    return 0


${WALK_LOOP_PY}`,
    javascript: `function add(u, v) {
  // u + v, part by part
  return [0, 0];
}

function scale(k, v) {
  // k times every part of v
  return [0, 0];
}

function length(v) {
  // √(x² + y²)
  return 0;
}

${WALK_LOOP_JS}`,
    typescript: walkTs(`function add(u, v) {
  // u + v, part by part
  return [0, 0];
}

function scale(k, v) {
  // k times every part of v
  return [0, 0];
}

function length(v) {
  // √(x² + y²)
  return 0;
}

${WALK_LOOP_JS}`),
  },
  solution: { python: WALK_PY, javascript: WALK_JS, typescript: walkTs(WALK_JS) },
  distractors: {
    python: ['    return [u[0] * v[0], u[1] * v[1]]', '    return v[0] * v[0] + v[1] * v[1]'],
    javascript: ['  return [u[0] * v[0], u[1] * v[1]];', '  return v[0] * v[0] + v[1] * v[1];'],
    typescript: ['  return [u[0] * v[0], u[1] * v[1]];', '  return v[0] * v[0] + v[1] * v[1];'],
  },
  examples: [
    { id: 'square', label: 'Right 3, then up 2 twice', input: { moves: [[3, 0], [0, 2]], speeds: [1, 2] } },
    { id: 'back', label: 'There and partly back', input: { moves: [[2, 1], [-1, 0.5], [1, -1]], speeds: [2, 3, 0.5] } },
  ],
  tests: [
    { name: 'right 3, then up 2 twice', input: { moves: [[3, 0], [0, 2]], speeds: [1, 2] } },
    { name: 'there and partly back', input: { moves: [[2, 1], [-1, 0.5], [1, -1]], speeds: [2, 3, 0.5] } },
    { name: 'a move made backwards (negative speed)', input: { moves: [[1, 2], [1, 2]], speeds: [3, -1] } },
    { name: 'round a square, back to the start', input: { moves: [[1, 0], [0, 1], [-1, 0], [0, -1]], speeds: [2, 2, 2, 2] } },
    { name: 'one long diagonal', input: { moves: [[1, 1]], speeds: [5] } },
  ],
  check: checkWalk,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Each helper returns a new list. add(u, v) is [u[0] + v[0], u[1] + v[1]].',
    'scale multiplies both parts: [k * v[0], k * v[1]].',
    'length is Pythagoras: the square root of x² + y² (math.sqrt in Python, Math.sqrt in JavaScript).',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 2. the most similar vector ─────────────────────────────

export type NearestInput = { vectors: number[][]; q: number[] };

const nearestArgs = ({ vectors, q }: NearestInput): Arg[] => [
  { kind: 'value', name: 'vectors', value: vectors },
  { kind: 'value', name: 'q', value: q },
  { kind: 'array', name: 'scores', values: vectors.map(() => 0) },
];

const dotOf = (u: readonly number[], v: readonly number[]) => u.reduce((s, x, i) => s + x * v[i], 0);
const cosineOf = (u: readonly number[], v: readonly number[]) => dotOf(u, v) / (Math.sqrt(dotOf(u, u)) * Math.sqrt(dotOf(v, v)));
const argmax = (xs: readonly number[]) => xs.reduce((b, x, i) => (x > xs[b] ? i : b), 0);

/** Each vector's cosine similarity with q, and the index of the largest (the first, on a tie). */
export function nearest({ vectors, q }: NearestInput): { scores: number[]; best: number } {
  const scores = vectors.map((v) => cosineOf(v, q));
  return { scores, best: argmax(scores) };
}

function checkNearest(input: NearestInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const want = nearest(input);
  const scores = arrayOf(result, 'scores');
  const got = result.returned;
  if (!scores) return { pass: false, message: 'Write each vector’s cosine similarity into scores[i].' };
  const dots = input.vectors.map((v) => dotOf(v, input.q));
  if (matches(scores, dots) && !matches(dots, want.scores)) {
    return { pass: false, message: `scores holds the dot products ${list(dots)}. Divide each by both lengths, |v|·|q|, to get the cosine: it compares direction only.` };
  }
  const oneLength = input.vectors.map((v) => dotOf(v, input.q) / Math.sqrt(dotOf(v, v)));
  if (matches(scores, oneLength) && !matches(oneLength, want.scores)) return { pass: false, message: 'Each score is divided by the vector’s length but not by q’s. cos θ = u·v / (|u|·|v|): divide by both.' };
  if (!matches(scores, want.scores)) {
    const i = want.scores.findIndex((s, k) => !close(scores[k], s));
    return { pass: false, message: `scores[${i}] should be ${fmt(want.scores[i])}, the cosine similarity of ${list(input.vectors[i])} with q, but your code wrote ${fmt(scores[i])}.` };
  }
  if (typeof got !== 'number') return { pass: false, message: 'Return the index of the most similar vector, a whole number.' };
  if (got === want.best) return { pass: true, message: `Vector ${want.best}, ${list(input.vectors[want.best])}, points most nearly the way q does: cos θ = ${fmt(want.scores[want.best])}.` };
  if (got === argmax(dots)) return { pass: false, message: `You returned ${got}, the vector with the biggest dot product. It wins by being long, not by pointing q’s way: pick the biggest score instead.` };
  if (got === argmax(want.scores.map((s) => -s))) return { pass: false, message: `You returned ${got}, the least similar vector. Keep the index with the largest score.` };
  return { pass: false, message: `The scores are right, but the largest is scores[${want.best}] = ${fmt(want.scores[want.best])}, and you returned ${got}.` };
}

const NEAREST_PY = `import math


def dot(u, v):
    total = 0
    for i in range(len(u)):
        total = total + u[i] * v[i]
    return total


def cosine(u, v):
    return dot(u, v) / (math.sqrt(dot(u, u)) * math.sqrt(dot(v, v)))


def nearest(vectors, q, scores):
    best = 0
    for i in range(len(vectors)):
        scores[i] = cosine(vectors[i], q)
        if scores[i] > scores[best]:
            best = i
    return best
`;
const NEAREST_JS = `function dot(u, v) {
  let total = 0;
  for (let i = 0; i < u.length; i++) {
    total = total + u[i] * v[i];
  }
  return total;
}

function cosine(u, v) {
  return dot(u, v) / (Math.sqrt(dot(u, u)) * Math.sqrt(dot(v, v)));
}

function nearest(vectors, q, scores) {
  let best = 0;
  for (let i = 0; i < vectors.length; i++) {
    scores[i] = cosine(vectors[i], q);
    if (scores[i] > scores[best]) {
      best = i;
    }
  }
  return best;
}
`;
const nearestTs = (js: string) =>
  js
    .replace('function dot(u, v) {', 'function dot(u: number[], v: number[]): number {')
    .replace('function cosine(u, v) {', 'function cosine(u: number[], v: number[]): number {')
    .replace('function nearest(vectors, q, scores) {', 'function nearest(vectors: number[][], q: number[], scores: number[]): number {');

const NEAREST_STARTER_JS = `function dot(u, v) {
  // u[0]·v[0] + u[1]·v[1] + … for every part
  return 0;
}

function cosine(u, v) {
  // u·v divided by both lengths (a length is √(v·v))
  return 0;
}

function nearest(vectors, q, scores) {
  // scores[i] = cosine(vectors[i], q); return the index of the largest
  return 0;
}
`;

const nearestExercise: Exercise<NearestInput> = {
  slug: 'nearest-vector',
  title: 'Find the most similar vector',
  kind: 'write',
  visualiser: 'dot-product',
  summary: 'Write the dot product and cosine similarity, then find the vector that points most like a query.',
  task: [
    '`vectors` is a list of vectors, all with the same number of parts as the query `q` (think of word vectors, with a few parts instead of hundreds). Find the one most similar to `q` by direction.',
    'Write `dot(u, v)` (multiply matching parts, add them up), `cosine(u, v)` (the dot product divided by both lengths, where a length is √(v·v)) and `nearest(vectors, q, scores)`: put each vector’s cosine with `q` into `scores[i]` and return the index of the largest.',
  ],
  entry: { python: 'nearest', js: 'nearest' },
  args: nearestArgs,
  starter: {
    python: `import math


def dot(u, v):
    # u[0]·v[0] + u[1]·v[1] + … for every part
    return 0


def cosine(u, v):
    # u·v divided by both lengths (a length is √(v·v))
    return 0


def nearest(vectors, q, scores):
    # scores[i] = cosine(vectors[i], q); return the index of the largest
    return 0
`,
    javascript: NEAREST_STARTER_JS,
    typescript: nearestTs(NEAREST_STARTER_JS),
  },
  solution: { python: NEAREST_PY, javascript: NEAREST_JS, typescript: nearestTs(NEAREST_JS) },
  distractors: {
    python: ['    return dot(u, v)', '        if scores[i] < scores[best]:'],
    javascript: ['  return dot(u, v);', '    if (scores[i] < scores[best]) {'],
    typescript: ['  return dot(u, v);', '    if (scores[i] < scores[best]) {'],
  },
  examples: [
    { id: 'words', label: 'Four word vectors', input: { vectors: [[4, 2, 0], [2, 1.5, 1], [6, 6, 6], [-2, 3, 1]], q: [2, 1, 0] } },
    { id: 'long', label: 'A long vector that points away', input: { vectors: [[1, 1, 0], [10, 0, 10], [0, 2, 2]], q: [1, 2, 0] } },
  ],
  tests: [
    { name: 'four word vectors', input: { vectors: [[4, 2, 0], [2, 1.5, 1], [6, 6, 6], [-2, 3, 1]], q: [2, 1, 0] } },
    { name: 'the longest vector is not the most similar', input: { vectors: [[1, 1, 0], [10, 0, 10], [0, 2, 2]], q: [1, 2, 0] } },
    { name: 'the best match comes last', input: { vectors: [[0, 1], [-1, 0], [1, 1], [3, 0.5]], q: [2, 0] } },
    { name: 'every vector points away', input: { vectors: [[-1, -1, 0, 0], [0, -2, -1, 0], [-3, 0, 0, -1]], q: [1, 1, 1, 1] } },
    { name: 'five parts', input: { vectors: [[1, 0, 1, 0, 1], [1, 1, 1, 1, 1], [0, 1, 0, 1, 0]], q: [2, 1, 2, 1, 2] } },
  ],
  check: checkNearest,
  markSortedAtEnd: false,
  pointers: ['i', 'best'],
  hints: [
    'dot is one loop with a running total, like any Σ.',
    'cosine needs both lengths: math.sqrt(dot(u, u)) is |u| (Math.sqrt in JavaScript).',
    'In nearest, keep best, the index of the largest score so far, and replace it when scores[i] beats scores[best].',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 3. three distances ─────────────────────────────

export type DistancesInput = { a: number[]; b: number[] };

const distancesArgs = ({ a, b }: DistancesInput): Arg[] => [
  { kind: 'value', name: 'a', value: a },
  { kind: 'value', name: 'b', value: b },
  { kind: 'array', name: 'out', values: [0, 0, 0] },
];

/** [L1, L2, L∞] of a − b, adding in order (as the learner's loop does). */
export function distances({ a, b }: DistancesInput): [number, number, number] {
  let l1 = 0;
  let l2 = 0;
  let li = 0;
  a.forEach((x, i) => {
    const d = Math.abs(x - b[i]);
    l1 += d;
    l2 += d * d;
    li = Math.max(li, d);
  });
  return [l1, Math.sqrt(l2), li];
}

function checkDistances(input: DistancesInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const out = arrayOf(result, 'out');
  if (!out) return { pass: false, message: 'Write the three distances into out: out[0] = L1, out[1] = L2, out[2] = L∞.' };
  const [l1, l2, li] = distances(input);
  const gaps = input.a.map((x, i) => x - input.b[i]);
  const problems: string[] = [];
  if (!close(out[0], l1)) {
    const signed = gaps.reduce((s, g) => s + g, 0);
    problems.push(close(out[0], signed) && !close(signed, l1) ? `out[0] is ${fmt(out[0])}: the gaps were added with their signs, so some cancelled. L1 adds their sizes, |aᵢ − bᵢ|, = ${fmt(l1)}.` : `out[0], the L1 distance, should be ${fmt(l1)} (the sizes of the gaps added up), not ${fmt(out[0])}.`);
  }
  if (!close(out[1], l2)) problems.push(close(out[1], l2 * l2) ? `out[1] is ${fmt(out[1])}, the sum of the squared gaps. L2 is its square root, ${fmt(l2)}.` : `out[1], the L2 distance, should be √(sum of squared gaps) = ${fmt(l2)}, not ${fmt(out[1])}.`);
  if (!close(out[2], li)) {
    const min = Math.min(...gaps.map(Math.abs));
    problems.push(close(out[2], min) && !close(min, li) ? `out[2] is ${fmt(out[2])}, the smallest gap. L∞ is the largest, ${fmt(li)}.` : `out[2], the L∞ distance, should be the largest gap, ${fmt(li)}, not ${fmt(out[2])}.`);
  }
  if (problems.length) return { pass: false, message: problems.join(' ') };
  return { pass: true, message: `L1 = ${fmt(l1)}, L2 = ${fmt(l2)}, L∞ = ${fmt(li)}: L∞ ≤ L2 ≤ L1, as always.` };
}

const DIST_BLANKS_PY = `import math


def distances(a, b, out):
    l1 = 0
    l2 = 0
    linf = 0
    for i in range(len(a)):
        d = «1:abs(a[i] - b[i])»
        l1 = «2:l1 + d»
        l2 = «3:l2 + d * d»
        linf = «4:max(linf, d)»
    out[0] = l1
    out[1] = «5:math.sqrt(l2)»
    out[2] = linf
    return out
`;
const DIST_BLANKS_JS = `function distances(a, b, out) {
  let l1 = 0;
  let l2 = 0;
  let linf = 0;
  for (let i = 0; i < a.length; i++) {
    const d = «1:Math.abs(a[i] - b[i])»;
    l1 = «2:l1 + d»;
    l2 = «3:l2 + d * d»;
    linf = «4:Math.max(linf, d)»;
  }
  out[0] = l1;
  out[1] = «5:Math.sqrt(l2)»;
  out[2] = linf;
  return out;
}
`;
const distTs = (js: string) => js.replace('function distances(a, b, out) {', 'function distances(a: number[], b: number[], out: number[]): number[] {');

const distancesExercise: Exercise<DistancesInput> = {
  slug: 'three-distances',
  title: 'Measure a gap three ways',
  kind: 'write',
  visualiser: 'norms',
  summary: 'The L1, L2 and L∞ distances between two points with any number of parts, in one loop.',
  task: [
    '`a` and `b` are two points with the same number of parts (two for a point on paper, more for a row of data). Write `distances(a, b, out)`: put the L1 distance into `out[0]`, the L2 distance into `out[1]` and the L∞ distance into `out[2]`, then return `out`.',
    'Each starts from the gaps |aᵢ − bᵢ|. L1 adds them up (city blocks), L2 is the square root of the sum of their squares (the straight line), and L∞ is the largest one (a chess king’s moves). One loop can build all three.',
  ],
  entry: { python: 'distances', js: 'distances' },
  args: distancesArgs,
  starter: {
    python: `import math


def distances(a, b, out):
    # out[0] = L1, out[1] = L2, out[2] = L∞ of the gaps |a[i] - b[i]|
    return out
`,
    javascript: `function distances(a, b, out) {
  // out[0] = L1, out[1] = L2, out[2] = L∞ of the gaps |a[i] - b[i]|
  return out;
}
`,
    typescript: distTs(`function distances(a, b, out) {
  // out[0] = L1, out[1] = L2, out[2] = L∞ of the gaps |a[i] - b[i]|
  return out;
}
`),
  },
  solution: { python: stripBlanks(DIST_BLANKS_PY), javascript: stripBlanks(DIST_BLANKS_JS), typescript: distTs(stripBlanks(DIST_BLANKS_JS)) },
  blanks: { python: DIST_BLANKS_PY, javascript: DIST_BLANKS_JS, typescript: distTs(DIST_BLANKS_JS) },
  fades: [[5], [1, 4, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['        d = a[i] - b[i]', '        linf = min(linf, d)'],
    javascript: ['    const d = a[i] - b[i];', '    linf = Math.min(linf, d);'],
    typescript: ['    const d = a[i] - b[i];', '    linf = Math.min(linf, d);'],
  },
  examples: [
    { id: 'plane', label: '(−2, −1) to (1, 3)', input: { a: [-2, -1], b: [1, 3] } },
    { id: 'rows', label: 'Two rows of data', input: { a: [5, 1, 4, 2], b: [3, 2, 4, 6] } },
  ],
  tests: [
    { name: 'a 3–4–5 gap', input: { a: [-2, -1], b: [1, 3] } },
    { name: 'two rows of data', input: { a: [5, 1, 4, 2], b: [3, 2, 4, 6] } },
    { name: 'gaps of both signs (they must not cancel)', input: { a: [1, 5, 2], b: [4, 2, 2] } },
    { name: 'the same point twice', input: { a: [2.5, -1, 0], b: [2.5, -1, 0] } },
    { name: 'one part', input: { a: [7], b: [-1.5] } },
  ],
  check: checkDistances,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Work out the gap d = |a[i] − b[i]| first; every distance is built from it.',
    'L1 and the sum of squares are running totals; L∞ is a running maximum that starts at 0.',
    'Only take the square root once, after the loop.',
  ],
  legend: WRITE_LEGEND,
};

// ───────────────────────────── 4. matrix multiplication ─────────────────────────────

export type MatmulInput = { A: number[][]; B: number[][] };

const matmulArgs = ({ A, B }: MatmulInput): Arg[] => [
  { kind: 'grid', name: 'A', values: A },
  { kind: 'grid', name: 'B', values: B },
];

/** C = AB, adding each cell's products in order of k. */
export function matrixProduct(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number[][] {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, x, k) => s + x * B[k][j], 0)));
}

/** The learner's table: the one called C, else the first one made. */
function learnerTable(result: RunResult): (number | null)[][] | null {
  const made = result.events.filter((e) => e.kind === 'grid' && e.name !== 'A' && e.name !== 'B');
  const table = made.find((e) => e.kind === 'grid' && e.name === 'C') ?? made[0];
  return table && table.kind === 'grid' ? (result.grids?.[table.grid] ?? null) : null;
}

const sameGrid = (got: readonly (readonly (number | null)[])[], want: readonly (readonly number[])[]) =>
  got.length === want.length && want.every((row, i) => got[i].length === row.length && row.every((v, j) => got[i][j] != null && close(got[i][j]!, v)));

function checkMatmul({ A, B }: MatmulInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const m = A.length;
  const n = B.length;
  const p = B[0].length;
  const want = matrixProduct(A, B);
  const C = learnerTable(result);
  if (!C) return { pass: false, message: 'Make the result with C = table(rows, cols) and fill it in: the cells you write there are what the picture shows.' };
  const shape = `${C.length}×${C[0]?.length ?? 0}`;
  if (C.length !== m || C.some((r) => r.length !== p)) {
    return { pass: false, message: `C is ${shape}, but a ${m}×${n} matrix times a ${n}×${p} one gives ${m}×${p}: one row for each row of A, one column for each column of B.` };
  }
  if (sameGrid(C, want)) {
    const back = result.returned;
    if (!Array.isArray(back)) return { pass: false, message: 'Every cell of C is right: now return C.' };
    return { pass: true, message: `C = ${grid(want)}: ${m * p} cells, each ${n} multiplications, ${m * n * p} in all.` };
  }
  if (m === n && n === p && sameGrid(C, matrixProduct(B, A))) return { pass: false, message: 'That is BA, not AB: each cell C[i][j] is row i of A times column j of B, so A’s numbers come first.' };
  if (m === n && n === p && sameGrid(C, A.map((r, i) => r.map((x, j) => x * B[i][j])))) return { pass: false, message: 'Each cell is A[i][j] × B[i][j], one product. A cell of AB adds up n products: A[i][k] × B[k][j] for every k.' };
  if (sameGrid(C, A.map((r) => B[0].map((_, j) => r[n - 1] * B[n - 1][j])))) return { pass: false, message: 'Each cell holds only its last product: add every A[i][k] × B[k][j] into C[i][j], don’t replace it.' };
  for (let i = 0; i < m; i++)
    for (let j = 0; j < p; j++)
      if (C[i][j] == null || !close(C[i][j]!, want[i][j])) {
        const terms = A[i].map((x, k) => `${fmt(x)}×${fmt(B[k][j])}`).join(' + ');
        return { pass: false, message: `C[${i}][${j}] should be row ${i} of A times column ${j} of B (counting from 0): ${terms} = ${fmt(want[i][j])}, but it holds ${C[i][j] == null ? 'nothing' : fmt(C[i][j]!)}.` };
      }
  return { pass: false, message: 'Compare your C with the right one cell by cell.' };
}

const MATMUL_BLANKS_PY = `def matmul(A, B):
    m = len(A)
    n = len(B)
    p = len(B[0])
    C = «1:table(m, p)»
    for i in range(m):
        for j in range(p):
            for k in range(«2:n»):
                C[i][j] = «3:C[i][j] + A[i][k] * B[k][j]»
    return C
`;
const MATMUL_BLANKS_JS = `function matmul(A, B) {
  const m = A.length;
  const n = B.length;
  const p = B[0].length;
  const C = «1:table(m, p)»;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < «2:n»; k++) {
        C[i][j] = «3:C[i][j] + A[i][k] * B[k][j]»;
      }
    }
  }
  return C;
}
`;
const matmulTs = (js: string) =>
  js.replace('function matmul(A, B) {', 'function matmul(A: number[][], B: number[][]): number[][] {').replace('const C = ', 'const C: number[][] = ');

const matmulExercise: Exercise<MatmulInput> = {
  slug: 'matrix-multiply',
  title: 'Multiply two matrices',
  kind: 'write',
  visualiser: 'matrix-multiplication',
  summary: 'Fill C = AB cell by cell: each cell is a row of A times a column of B, added up.',
  task: [
    '`A` is an m×n matrix and `B` is n×p, each a list of rows. Write `matmul(A, B)`: make the result with `C = table(m, p)` (every cell starts at 0), fill it, and return `C`.',
    'Cell `C[i][j]` is row `i` of A times column `j` of B: `A[i][0] * B[0][j] + A[i][1] * B[1][j] + …`, one product for each k from 0 to n − 1. Add each product into `C[i][j]` as you go, and the picture lights up the cells of A and B each step reads.',
  ],
  entry: { python: 'matmul', js: 'matmul' },
  args: matmulArgs,
  starter: {
    python: `def matmul(A, B):
    m = len(A)
    n = len(B)
    p = len(B[0])
    C = table(m, p)
    # C[i][j] = row i of A times column j of B
    return C
`,
    javascript: `function matmul(A, B) {
  const m = A.length;
  const n = B.length;
  const p = B[0].length;
  const C = table(m, p);
  // C[i][j] = row i of A times column j of B
  return C;
}
`,
    typescript: matmulTs(`function matmul(A, B) {
  const m = A.length;
  const n = B.length;
  const p = B[0].length;
  const C = table(m, p);
  // C[i][j] = row i of A times column j of B
  return C;
}
`),
  },
  solution: { python: stripBlanks(MATMUL_BLANKS_PY), javascript: stripBlanks(MATMUL_BLANKS_JS), typescript: matmulTs(stripBlanks(MATMUL_BLANKS_JS)) },
  blanks: { python: MATMUL_BLANKS_PY, javascript: MATMUL_BLANKS_JS, typescript: matmulTs(MATMUL_BLANKS_JS) },
  fades: [[3], [2, 3], [1, 2, 3]],
  distractors: {
    python: ['                C[i][j] = A[i][k] * B[k][j]', '            for k in range(p):'],
    javascript: ['        C[i][j] = A[i][k] * B[k][j];', '      for (let k = 0; k < p; k++) {'],
    typescript: ['        C[i][j] = A[i][k] * B[k][j];', '      for (let k = 0; k < p; k++) {'],
  },
  examples: [
    { id: 'rect', label: '2×3 times 3×2', input: { A: [[1, 2, 0], [3, -1, 2]], B: [[2, 1], [0, 3], [1, -1]] } },
    { id: 'square', label: '2×2 times 2×2', input: { A: [[1, 2], [3, 4]], B: [[0, 1], [1, 0]] } },
  ],
  tests: [
    { name: '2×3 times 3×2', input: { A: [[1, 2, 0], [3, -1, 2]], B: [[2, 1], [0, 3], [1, -1]] } },
    { name: '2×2 times 2×2 (not the same as BA)', input: { A: [[1, 2], [3, 4]], B: [[0, 1], [1, 0]] } },
    { name: 'a row times a column: one cell, a dot product', input: { A: [[1, 2, 3]], B: [[4], [5], [6]] } },
    { name: 'a column times a row: a 3×3 table', input: { A: [[1], [2], [3]], B: [[4, 5, 6]] } },
    { name: 'the identity changes nothing', input: { A: [[2, -1, 0], [4, 3, 1], [0, 5, -2]], B: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } },
    { name: '3×3 times 3×3', input: { A: [[1, 0, 2], [-1, 3, 1], [2, 2, 0]], B: [[3, 1, 0], [0, 2, 1], [1, 0, -1]] } },
  ],
  check: checkMatmul,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Three loops: i over the rows of A, j over the columns of B, and k along the row and the column together.',
    'Inside the innermost loop add one product: C[i][j] = C[i][j] + A[i][k] * B[k][j].',
    'k runs over n, the length of a row of A (which is also the height of a column of B).',
  ],
  legend: [
    { neutral: 'A cell not filled yet' },
    { mark: 'compare', label: 'A cell of A or B the step reads' },
    { mark: 'write', label: 'The cell of C your code just wrote' },
  ],
};

export const linearAlgebraExercises: Exercise[] = [walkExercise, nearestExercise, distancesExercise, matmulExercise];

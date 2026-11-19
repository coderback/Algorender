import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, planeGeometry, round } from '@/viz/plot/geometry';
import type { Handle, ImagePart, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// What learning from examples means. A dataset is a table of examples, each a
// feature x and a label y. A model is a rule with knobs, here a line
// ŷ = w·x + b, and its loss (the mean squared error) says how badly it misses
// the labels: training turns the knobs to make the loss small. The second
// story sets some examples aside as a test set and compares a line with a
// "memoriser" that looks up the nearest training example: it scores a
// perfect 0 on the examples it has seen and worse than the line on new ones.
// Least squares comes later in the stage, so the best line is only said to
// have been found, never derived.

export type XY = { x: number; y: number };
/** A line by its heights at the left and right edges of the plane (x = 0 and x = SPAN), which is what its handles drag. */
export type Ends = { left: number; right: number };
export type Fit = { w: number; b: number };
export type LearningInput = { story: 'fit'; points: XY[]; line: Ends; other: Ends } | { story: 'split'; seed: number };
export type Story = LearningInput['story'];

/** The fit story's plane: x (hours of revision) from 0 to SPAN, y (the mark) from 0 to TOP. */
export const SPAN = 6;
export const TOP = 8;
export const LIMITS = { points: { min: 2, max: 8 } } as const;
/** The split story: how many examples, how many are kept back for testing, and its plane. */
export const SPLIT = { n: 16, test: 5, x: 8, y: 8 } as const;
const HANDLE_STEP = 0.5;
const CELL_PX = 46;

const pseudocode = [
  'example i: feature xᵢ, label yᵢ',
  'model: ŷ = w·x + b    (knobs w, b)',
  'error: eᵢ = ŷᵢ − yᵢ',
  'loss: MSE = (1/n)·Σ eᵢ²',
  'train: turn w, b to lower the loss',
  'split: a train set and a test set',
  'judge on the test set, never seen',
];

// ───────────────────────────── the maths ─────────────────────────────

/** The line through (0, left) and (SPAN, right). */
export const lineOf = ({ left, right }: Ends): Fit => ({ w: (right - left) / SPAN, b: left });
export const predict = ({ w, b }: Fit, x: number) => w * x + b;
/** Each example's error, prediction minus label. */
export const errors = (fit: Fit, pts: readonly XY[]) => pts.map((p) => predict(fit, p.x) - p.y);
/** The mean squared error of the line ŷ = w·x + b on the examples (xs, ys): the exercise's mse(w, b, xs, ys). */
export function mse(w: number, b: number, xs: readonly number[], ys: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < xs.length; i++) total += (w * xs[i] + b - ys[i]) ** 2;
  return total / xs.length;
}
export const loss = (fit: Fit, pts: readonly XY[]) =>
  mse(
    fit.w,
    fit.b,
    pts.map((p) => p.x),
    pts.map((p) => p.y),
  );

/** The line with the lowest mean squared error on the examples (found in closed form; the path's later lesson derives it). */
export function bestLine(pts: readonly XY[]): Fit {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const w = sxx < 1e-12 ? 0 : pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  return { w, b: my - w * mx };
}

/** The memoriser: the label of the training example nearest to x (the first one on a tie). */
export function memorise(train: readonly XY[], x: number): number {
  let best = train[0];
  for (const p of train) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best.y;
}
export const memoriserLoss = (train: readonly XY[], pts: readonly XY[]) => pts.reduce((s, p) => s + (memorise(train, p.x) - p.y) ** 2, 0) / pts.length;

/** The split story's data: the rule y = 0.6x + 1 plus noise, and which examples are kept back to test on, both from the seed. */
export function splitData(seed: number): { points: XY[]; test: Set<number> } {
  const rng = createRng(seed);
  const points = Array.from({ length: SPLIT.n }, (_, i) => {
    const x = round(0.4 + i * 0.48, 2);
    const y = round(Math.min(SPLIT.y - 0.2, Math.max(0.2, 0.6 * x + 1 + (rng() - 0.5) * 2.6)), 1);
    return { x, y };
  });
  // Pick the test examples by shuffling the indices (Fisher–Yates) and keeping the first few.
  const order = points.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { points, test: new Set(order.slice(0, SPLIT.test)) };
}

/** Everything the split story shows, from its seed. */
export function splitStory(seed: number) {
  const { points, test } = splitData(seed);
  const train = points.filter((_, i) => !test.has(i));
  const tested = points.filter((_, i) => test.has(i));
  const line = bestLine(train);
  return {
    points,
    test,
    train,
    tested,
    line,
    trainLoss: { line: loss(line, train), memoriser: memoriserLoss(train, train) },
    testLoss: { line: loss(line, tested), memoriser: memoriserLoss(train, tested) },
  };
}

/** On how many of the datasets made from seeds 0 … count − 1 the line beats the memoriser on the test set. */
export function lineWins(count: number): number {
  let wins = 0;
  for (let seed = 0; seed < count; seed++) {
    const s = splitStory(seed);
    if (s.testLoss.line < s.testLoss.memoriser) wins++;
  }
  return wins;
}

// ───────────────────────────── drawing helpers ─────────────────────────────

const lineText = ({ w, b }: Fit) => `ŷ = ${fmt(w, 3)}·x ${b < 0 ? '−' : '+'} ${fmt(Math.abs(b), 3)}`;
const readouts = (items: Readout[], label = 'The model and its loss'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });

/** The table of examples, one row each; columns are added as the story goes (x, y, ŷ, e, e²). */
function table(rows: readonly (readonly number[])[], columns: string, lit?: number): ImagePart {
  const cols = rows[0]?.length ?? 0;
  return {
    kind: 'image',
    id: 'table',
    label: `The examples, one row each: ${columns}`,
    width: cols,
    height: rows.length,
    pixels: rows.flatMap((r, i) => r.map(() => (i === lit ? 0.3 : 0))),
    scale: 'signed',
    values: rows.flatMap((r) => r.map((v) => fmt(v))),
    boxes: lit === undefined ? [] : [{ id: 'row', x: 0, y: lit, w: cols, h: 1, mark: 'compare' }],
    size: cols * CELL_PX,
    matrix: true,
  };
}

/** A line across a plane from x = 0 to x1, as a path. */
const segment = (id: string, fit: Fit, x1: number, mark: 'key' | 'compare', label: string, dashed = false): Shape => ({
  kind: 'path',
  id,
  points: [
    [0, predict(fit, 0)],
    [x1, predict(fit, x1)],
  ],
  mark,
  label,
  dashed,
});

const endHandles = (prefix: string, ends: Ends, name: string, mark: 'key' | 'compare'): Handle[] => [
  { id: `${prefix}left`, at: [0, ends.left], label: `${name}: its height at x = 0`, mark, step: HANDLE_STEP, min: [0, 0], max: [0, TOP] },
  { id: `${prefix}right`, at: [SPAN, ends.right], label: `${name}: its height at x = ${SPAN}`, mark, step: HANDLE_STEP, min: [SPAN, 0], max: [SPAN, TOP] },
];

// ───────────────────────────── the fit story ─────────────────────────────

const FIT_AXES = { x: { min: 0, max: SPAN, label: 'x: hours of revision' }, y: { min: 0, max: TOP, label: 'y: the mark' }, equal: false } as const;
/** World units across that are as long on screen as one unit up, in the fit plane. */
const SQUARE_ACROSS = (() => {
  const g = planeGeometry(FIT_AXES);
  return g.ky / g.kx;
})();
/** The side across of the square on an error e, in world units: on screen it is as long as the side up. */
export const squareAcross = (e: number) => Math.abs(e) * SQUARE_ACROSS;

export const TRENDS = ['It tends to go up', 'It tends to go down', 'It stays about the same'] as const;
type Trend = (typeof TRENDS)[number];
const TREND_NOTE: Record<Trend, string> = {
  'It tends to go up': 'More hours, higher marks, roughly: the marks tend to go up.',
  'It tends to go down': 'More hours, lower marks, roughly: the marks tend to go down.',
  'It stays about the same': 'The marks don’t change much with the hours.',
};
/** The trend the examples follow: the slope of the line that fits them best, calling slopes under a quarter of a mark an hour flat. */
export function trendOf(points: readonly XY[]): Trend {
  const { w } = bestLine(points);
  return w > 0.25 ? TRENDS[0] : w < -0.25 ? TRENDS[1] : TRENDS[2];
}

function* fitStory(points: readonly XY[], ends: Ends, otherEnds: Ends): Generator<Frame<PlotState>> {
  const n = points.length;
  const A = lineOf(ends);
  const B = lineOf(otherEnds);
  const e = errors(A, points);
  const sq = e.map((x) => x * x);
  const L = loss(A, points);
  const LB = loss(B, points);

  type Show = { line?: boolean; gaps?: boolean; squares?: boolean; other?: boolean; otherSquares?: boolean; columns: 2 | 3 | 4 | 5; lit?: number };
  const parts = (s: Show): PlotPart[] => {
    const shapes: Shape[] = [];
    if (s.otherSquares)
      points.forEach((p, i) => {
        const side = predict(B, p.x) - p.y;
        shapes.push({ kind: 'path', id: `bsq${i}`, points: square(p, side), closed: true, fill: true, fillOpacity: 0.08, mark: 'compare', faint: true });
      });
    if (s.squares)
      points.forEach((p, i) => shapes.push({ kind: 'path', id: `sq${i}`, points: square(p, e[i]), closed: true, fill: true, fillOpacity: 0.14, mark: 'reject' }));
    if (s.gaps) points.forEach((p, i) => shapes.push({ kind: 'path', id: `gap${i}`, points: [[p.x, p.y], [p.x, predict(A, p.x)]], mark: 'reject', dashed: true }));
    if (s.other) shapes.push(segment('other', B, SPAN, 'compare', 'line B', true));
    if (s.line) shapes.push(segment('fit', A, SPAN, 'key', 'line A'));
    points.forEach((p, i) => shapes.push({ kind: 'point', id: `p${i}`, at: [p.x, p.y], size: 'md', label: `${i + 1}` }));
    const handles = [...(s.line ? endHandles('', ends, 'Line A', 'key') : []), ...(s.other ? endHandles('b', otherEnds, 'Line B', 'compare') : [])];
    const plane: PlanePart = {
      kind: 'plane',
      id: 'plane',
      label: s.line ? 'The examples and the model’s line' : 'The examples',
      ...FIT_AXES,
      shapes,
      handles,
    };
    const rows = points.map((p, i) => [p.x, p.y, predict(A, p.x), e[i], sq[i]].slice(0, s.columns));
    const names = ['x', 'y', 'ŷ', 'e = ŷ − y', 'e²'].slice(0, s.columns).join(', ');
    const items: Readout[] = [];
    if (s.line) items.push({ id: 'w', label: 'w', value: fmt(A.w, 3), mark: 'key' }, { id: 'b', label: 'b', value: fmt(A.b, 3), mark: 'key' });
    if (s.squares) items.push({ id: 'mse', label: s.other ? 'MSE of line A' : 'MSE', value: fmt(L, 4), mark: 'key' });
    if (s.otherSquares) items.push({ id: 'mseB', label: 'MSE of line B', value: fmt(LB, 4), mark: 'compare' });
    return [plane, table(rows, names, s.lit), ...(items.length ? [readouts(items)] : [])];
  };
  const vars = { n, w: round(A.w, 3), b: round(A.b, 3) };

  const trend = trendOf(points);
  yield plotFrame(parts({ columns: 2 }), {
    line: 0,
    note: `${n} examples, one row each. Every example has a feature x (the hours a student revised) and a label y (the mark they got). A model will learn from these examples to guess a mark from the hours.`,
    vars: { n },
    checkpoint: askInOrder('Look at the examples. Roughly, as the hours go up, what does the mark do?', TRENDS, trend),
  });

  const probe = Math.min(1, n - 1);
  const px = points[probe].x;
  const guess = predict(A, px);
  yield plotFrame(parts({ line: true, columns: 2 }), {
    line: 1,
    note: `${TREND_NOTE[trend]} The model is a line, line A: ŷ = w·x + b, read “y-hat”, its guess for the label y. Here · just means times: w·x is w times x. Its two knobs are its parameters, here w = ${fmt(A.w, 3)} (the slope) and b = ${fmt(A.b, 3)} (the height at x = 0).`,
    vars,
    checkpoint: ask(`What does line A guess for x = ${fmt(px)}?`, fmt(guess), [fmt(points[probe].y), fmt(A.w * px), fmt(guess + 1), fmt(A.b), fmt(guess + 2)]),
  });

  const sizes = e.map(Math.abs);
  const worst = sizes.indexOf(Math.max(...sizes));
  const tie = sizes.filter((s) => Math.abs(s - sizes[worst]) < 1e-9).length > 1;
  yield plotFrame(parts({ line: true, gaps: true, columns: 4, lit: probe }), {
    line: 2,
    note: `For x = ${fmt(px)} the line guesses ${fmt(guess)} and the label is ${fmt(points[probe].y)}: an error of e = ${fmt(guess)} − ${fmt(points[probe].y)} = ${fmt(e[probe])}. Each dashed gap is one example’s error, guess minus label: below the point when the guess is too low.`,
    vars,
    checkpoint: tie
      ? undefined
      : askInOrder(
          'Which example does line A miss by the most?',
          points.map((_, i) => `Example ${i + 1}`),
          `Example ${worst + 1}`,
        ),
  });

  const meanErr = e.reduce((s, x) => s + x, 0) / n;
  const sumSq = sq.reduce((s, x) => s + x, 0);
  const meanAbs = sizes.reduce((s, x) => s + x, 0) / n;
  yield plotFrame(parts({ line: true, gaps: true, squares: true, columns: 5 }), {
    line: 3,
    note: `${tie ? 'Some examples are missed by the same amount.' : `Example ${worst + 1} is missed by the most, ${fmt(sizes[worst])}.`} One number for the whole line: square each error (drawn as a square on each gap), add the squares and divide by ${n}. Squaring makes every error count as bad, whichever side it is on, and big misses count far more than small ones. (Some books write the error as y − ŷ; once it is squared, the sign makes no difference.)`,
    vars,
    checkpoint: ask('What is the mean squared error, the loss?', fmt(L, 4), [fmt(meanErr, 4), fmt(sumSq, 4), fmt(Math.sqrt(L), 4), fmt(meanAbs, 4)]),
  });

  const verdict = Math.abs(L - LB) < 1e-9 ? 'They tie' : L < LB ? 'Line A' : 'Line B';
  yield plotFrame(parts({ line: true, squares: true, other: true, columns: 5 }), {
    line: 3,
    note: `The loss of line A is MSE = ${fmt(L, 4)}. Here is a second line, B: ${lineText(B)}. A smaller loss means the guesses are closer to the labels, on these examples.`,
    vars: { ...vars, 'MSE A': round(L, 4) },
    checkpoint: askInOrder('Which line has the lower loss on these examples?', ['Line A', 'Line B', 'They tie'], verdict),
  });

  yield plotFrame(parts({ line: true, squares: true, other: true, otherSquares: true, columns: 5 }), {
    line: 4,
    note: `Line B’s loss is ${fmt(LB, 4)} against line A’s ${fmt(L, 4)}, so ${verdict === 'They tie' ? 'the two fit these examples equally well' : `${verdict === 'Line A' ? 'line A' : 'line B'} fits these examples better`}. Training is exactly this: turning the knobs w and b until the loss is as small as it gets. Drag the ends and chase the smallest MSE.`,
    vars: { ...vars, 'MSE A': round(L, 4), 'MSE B': round(LB, 4) },
  });
}

/**
 * The square standing on an error: one side is the gap itself, opening towards the middle of the plane.
 * The plane is a chart box, where a unit across is longer on screen than a unit up, so the side across
 * is shortened to match and the square looks square.
 */
export function square(p: XY, side: number): Vec[] {
  const fitted = p.y + side;
  const dx = (p.x > SPAN / 2 ? -1 : 1) * squareAcross(side);
  return [
    [p.x, p.y],
    [p.x, fitted],
    [p.x + dx, fitted],
    [p.x + dx, p.y],
  ];
}

// ───────────────────────────── the split story ─────────────────────────────

/** The memoriser's answer as a staircase: flat at each training label up to halfway to the next training example. */
function staircase(train: readonly XY[], x1: number): Vec[] {
  const sorted = [...train].sort((a, b) => a.x - b.x);
  const out: Vec[] = [[0, sorted[0].y]];
  for (let i = 0; i < sorted.length - 1; i++) {
    const mid = (sorted[i].x + sorted[i + 1].x) / 2;
    out.push([mid, sorted[i].y], [mid, sorted[i + 1].y]);
  }
  out.push([x1, sorted[sorted.length - 1].y]);
  return out;
}

function* splitStoryFrames(seed: number): Generator<Frame<PlotState>> {
  const s = splitStory(seed);
  const { points, test, train, tested, line } = s;
  type Show = { split?: boolean; memoriser?: boolean; line?: boolean; testGaps?: boolean };
  const parts = (show: Show): PlotPart[] => {
    const shapes: Shape[] = [];
    if (show.testGaps)
      points.forEach((p, i) => {
        if (!test.has(i)) return;
        if (show.memoriser) shapes.push({ kind: 'path', id: `mgap${i}`, points: [[p.x, p.y], [p.x, memorise(train, p.x)]], mark: 'compare', dashed: true });
        if (show.line) shapes.push({ kind: 'path', id: `lgap${i}`, points: [[p.x - 0.08, p.y], [p.x - 0.08, predict(line, p.x)]], mark: 'key', dashed: true });
      });
    if (show.memoriser) shapes.push({ kind: 'path', id: 'memoriser', points: staircase(train, SPLIT.x), mark: 'compare', label: 'memoriser' });
    if (show.line) shapes.push(segment('line', line, SPLIT.x, 'key', 'line'));
    points.forEach((p, i) =>
      shapes.push(show.split && test.has(i) ? { kind: 'point', id: `p${i}`, at: [p.x, p.y], size: 'md', mark: 'frontier', label: 'test' } : { kind: 'point', id: `p${i}`, at: [p.x, p.y], size: 'md' }),
    );
    const plane: PlanePart = {
      kind: 'plane',
      id: 'plane',
      label: show.split ? 'Training examples, and the test examples kept back' : 'The examples',
      x: { min: 0, max: SPLIT.x, label: 'x: a made-up feature' },
      y: { min: 0, max: SPLIT.y, label: 'y: its label' },
      equal: false,
      shapes,
      handles: [],
    };
    const items: Readout[] = [];
    if (show.split) items.push({ id: 'train', label: 'training examples', value: String(train.length) }, { id: 'test', label: 'test examples', value: String(tested.length), mark: 'frontier' });
    if (show.memoriser) items.push({ id: 'memTrain', label: 'memoriser, training MSE', value: fmt(s.trainLoss.memoriser, 3), mark: 'compare' });
    if (show.line) items.push({ id: 'lineTrain', label: 'line, training MSE', value: fmt(s.trainLoss.line, 3), mark: 'key' });
    if (show.testGaps) {
      items.push({ id: 'memTest', label: 'memoriser, test MSE', value: fmt(s.testLoss.memoriser, 3), mark: 'compare' });
      items.push({ id: 'lineTest', label: 'line, test MSE', value: fmt(s.testLoss.line, 3), mark: 'key' });
    }
    return [plane, ...(items.length ? [readouts(items, 'Losses')] : [])];
  };
  const vars = { seed, train: train.length, test: tested.length };

  yield plotFrame(parts({}), {
    line: 0,
    note: `A different, made-up dataset: ${points.length} examples, each a feature x and a label y. What we want is a model that guesses well on examples it has never seen, like next year’s students. So before training, we hide some examples away to test it on later.`,
    vars,
  });

  yield plotFrame(parts({ split: true }), {
    line: 5,
    note: `${tested.length} examples picked at random are the test set (marked “test”); the other ${train.length} are the training set, and the models see only those. Model 1 is a memoriser: it stores the training examples, and for any x it answers the label of the training example whose x is closest.`,
    vars,
    checkpoint: ask('What will the memoriser’s loss (MSE) be on the training examples?', '0', [fmt(s.trainLoss.line, 3), fmt(s.testLoss.memoriser, 3), fmt(s.testLoss.line, 3), '1']),
  });

  const lineTrain = s.trainLoss.line;
  const trainWinner = lineTrain < 1e-12 ? 'They tie' : 'The memoriser';
  yield plotFrame(parts({ split: true, memoriser: true }), {
    line: 4,
    note: `0: its answer is the staircase, and on every training example it answers that example’s own label, so it never misses. Model 2 is a straight line: the one with the lowest loss on the training examples (a later lesson shows how to find it).`,
    vars,
    checkpoint: askInOrder('Which model will have the lower loss on the training examples?', ['The memoriser', 'The line', 'They tie'], trainWinner),
  });

  const better = s.testLoss.line < s.testLoss.memoriser ? 'The line' : 'The memoriser';
  yield plotFrame(parts({ split: true, memoriser: true, line: true }), {
    line: 4,
    note: `Model 2, the line, is ${lineText(line)}, with training MSE ${fmt(lineTrain, 3)}: ${trainWinner === 'They tie' ? 'the training examples lie on it, so both models score 0' : 'no straight line passes through every training example here, so on the training set the memoriser has the lower loss'}. Now the test examples, which neither model has seen.`,
    vars: { ...vars, 'line train MSE': round(lineTrain, 3) },
    checkpoint: askInOrder(`Which model will make smaller errors on the ${tested.length} test examples?`, ['The memoriser', 'The line'], better),
  });

  yield plotFrame(parts({ split: true, memoriser: true, line: true, testGaps: true }), {
    line: 6,
    note:
      better === 'The line'
        ? `On the test set the line’s MSE is ${fmt(s.testLoss.line, 3)} and the memoriser’s is ${fmt(s.testLoss.memoriser, 3)}. The memoriser learned the noise in the training examples, every random wobble, so it jumps about between them. The line learned the trend, which carries over to new examples: it generalises. Only the test loss tells you that.`
        : `On the test set the memoriser’s MSE is ${fmt(s.testLoss.memoriser, 3)} and the line’s is ${fmt(s.testLoss.line, 3)}: on this split the memoriser got lucky. With few test examples the test loss is itself noisy; try other splits, and the line usually wins, because it learned the trend rather than the noise.`,
    vars: { ...vars, 'line test MSE': round(s.testLoss.line, 3), 'memoriser test MSE': round(s.testLoss.memoriser, 3) },
  });
}

function* run(input: LearningInput): Generator<Frame<PlotState>> {
  if (input.story === 'fit') yield* fitStory(input.points, input.line, input.other);
  else yield* splitStoryFrames(input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const isHalf = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
const MAX_SEED = 999_999;

export function parseLearning(text: string): { value: LearningInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  if (word === 'split') {
    const xs = numbersIn(text);
    if (xs.length !== 1 || !Number.isInteger(xs[0]) || xs[0] < 0 || xs[0] > MAX_SEED) return { error: `Give a seed, a whole number from 0 to ${MAX_SEED}, e.g. split seed 7.` };
    return { value: { story: 'split', seed: xs[0] } };
  }
  if (word !== 'fit') return { error: 'Start with fit (examples, then two lines) or split (a seed).' };
  const pieces = text.split(';');
  const data = pieces[0].replace(/fit/i, '');
  const lineA = pieces.find((p) => /line\s*a\b/i.test(p)) ?? '';
  const lineB = pieces.find((p) => /line\s*b\b/i.test(p)) ?? '';
  const xs = numbersIn(data);
  if (xs.length % 2 !== 0) return { error: 'Give each example as a pair (x, y).' };
  const points = Array.from({ length: xs.length / 2 }, (_, i) => ({ x: round(xs[2 * i], 2), y: round(xs[2 * i + 1], 2) }));
  if (points.length < LIMITS.points.min || points.length > LIMITS.points.max) return { error: `Give ${LIMITS.points.min} to ${LIMITS.points.max} examples.` };
  if (points.some((p) => p.x < 0 || p.x > SPAN || p.y < 0 || p.y > TOP)) return { error: `Keep x from 0 to ${SPAN} and y from 0 to ${TOP}.` };
  const a = numbersIn(lineA);
  const b = numbersIn(lineB);
  if (a.length !== 2 || b.length !== 2) return { error: `Give each line by its heights at x = 0 and x = ${SPAN}, e.g. line A 1 7, line B 2.5 5.5.` };
  if (![...a, ...b].every((v) => isHalf(v) && v >= 0 && v <= TOP)) return { error: `Line heights are halves from 0 to ${TOP}.` };
  return { value: { story: 'fit', points, line: { left: a[0], right: a[1] }, other: { left: b[0], right: b[1] } } };
}

function format(input: LearningInput): string {
  if (input.story === 'split') return `split seed ${input.seed}`;
  const pts = input.points.map((p) => `(${plain(p.x)}, ${plain(p.y)})`).join(', ');
  return `fit ${pts}; line A ${plain(input.line.left)} ${plain(input.line.right)}; line B ${plain(input.other.left)} ${plain(input.other.right)}`;
}

const snapHeight = (v: number) => Math.min(TOP, Math.max(0, Math.round(v * 2) / 2));

export function dragLearning(input: LearningInput, id: string, to: Vec): LearningInput {
  if (input.story !== 'fit') return input;
  const h = snapHeight(to[1]);
  switch (id) {
    case 'left':
      return { ...input, line: { ...input.line, left: h } };
    case 'right':
      return { ...input, line: { ...input.line, right: h } };
    case 'bleft':
      return { ...input, other: { ...input.other, left: h } };
    case 'bright':
      return { ...input, other: { ...input.other, right: h } };
    default:
      return input;
  }
}

/** Five students: hours of revision and the mark they got. */
export const REVISION: XY[] = [
  { x: 1, y: 2 },
  { x: 2, y: 3.5 },
  { x: 3, y: 5.5 },
  { x: 4, y: 5 },
  { x: 5, y: 6.5 },
];
export const SPLIT_SEED = 0;

export const supervisedLearning = defineAlgorithm<LearningInput, PlotState>({
  kind: 'algorithm',
  slug: 'supervised-learning',
  view: 'plot',
  input: {
    examples: [
      { id: 'fit', label: 'A line, its errors and its loss', sized: false, make: () => ({ story: 'fit', points: REVISION, line: { left: 1, right: 7 }, other: { left: 2.5, right: 5.5 } }) },
      { id: 'split', label: 'Train, then test: a line against a memoriser', sized: false, make: () => ({ story: 'split', seed: SPLIT_SEED }) },
      { id: 'resplit', label: 'A fresh random dataset and split', sized: false, make: ({ seed }) => ({ story: 'split', seed: seed % (MAX_SEED + 1) }) },
    ],
    custom: {
      label: `fit (x, y) examples; line A and line B by their heights at x = 0 and x = ${SPAN}, or split and a seed`,
      placeholder: 'e.g. fit (1, 2), (3, 5), (5, 6); line A 1 7; line B 2.5 5.5',
      parse: parseLearning,
      format,
    },
    drag: dragLearning,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Examples (numbered), and the training examples' },
    { mark: 'key', label: 'The model’s line (line A); drag its ends' },
    { mark: 'reject', label: 'Errors, and their squares' },
    { mark: 'compare', label: 'A second model: line B, or the memoriser' },
    { mark: 'frontier', label: 'Test examples, kept back from training' },
  ],
  run,
  content: {
    idea: 'Learning from examples: a table of examples, each with features x and a label y; a model, a rule with knobs (parameters) that turns x into a guess ŷ; and a loss, one number saying how badly the guesses miss the labels. Training turns the knobs to make the loss small. A test set, kept back from training, says whether the model works on examples it has never seen.',
    invariant: 'The mean squared error is (1/n)·Σ(ŷᵢ − yᵢ)²: never negative, 0 only when every guess is exactly right, and squaring makes big misses count most. A model judged on the examples it trained on can look perfect (a memoriser scores 0) and still guess badly on new ones.',
    whenToUse: 'Whenever examples with known answers exist and you want answers for new cases: predicting prices, marks or demand (regression), or spam, diseases and digits (classification). Every later model on the path, from logistic regression to a GPT, is a model with knobs, a loss and a train/test split.',
    traits: [
      { label: 'Examples: features x, labels y', good: null },
      { label: 'Training lowers the loss by turning knobs', good: null },
      { label: 'Training loss alone can fool you', good: false },
    ],
    experiments: [
      { example: 'fit', prompt: 'Drag the ends of line A to make its MSE as small as you can. How low does it go?' },
      { example: 'fit', prompt: 'Make line A pass exactly through two examples. Is that the lowest loss?' },
      { example: 'split', prompt: 'Before the last step, predict which model wins on the test examples.' },
      { example: 'resplit', prompt: 'Try several fresh datasets. How often does the memoriser beat the line on the test set?' },
    ],
  },
});

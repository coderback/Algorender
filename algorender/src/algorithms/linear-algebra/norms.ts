import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Lengths and distances: the gap d = q − p between two points measured three
// ways. L2 is the straight line (Pythagoras, √(d·d)), L1 walks the grid like
// city blocks (|d₁| + |d₂|), and L∞ counts only the biggest step
// (max(|d₁|, |d₂|), a chess king's moves). The points at distance 1 form a
// diamond, a circle and a square, and which point is "nearest" can change
// with the ruler you choose.

export type Norm = 1 | 2 | 'inf';
export type NormsInput = { story: 'distance'; p: Vec; q: Vec } | { story: 'balls'; t: Vec } | { story: 'nearest'; q: Vec; a: Vec; b: Vec };
export type Story = NormsInput['story'];

export const LIMITS = { point: 4, ball: 1.3 } as const;
export const NORMS: readonly Norm[] = [2, 1, 'inf'];
/** The family of unit balls drawn at the end of the balls story. */
export const FAMILY = [1, 1.5, 2, 4, Infinity] as const;

/** ‖v‖ₚ for p ≥ 1, or ∞. */
export function lp(v: readonly number[], p: number): number {
  if (p === Infinity) return Math.max(0, ...v.map(Math.abs));
  if (p === 1) return v.reduce((s, x) => s + Math.abs(x), 0);
  if (p === 2) return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.reduce((s, x) => s + Math.abs(x) ** p, 0) ** (1 / p);
}
const pOf = (n: Norm) => (n === 'inf' ? Infinity : n);
export const normOf = (v: Vec, n: Norm) => lp(v, pOf(n));
const NAME: Record<Norm, string> = { 2: 'L2', 1: 'L1', inf: 'L∞' };
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];

const pseudocode = [
  'd = q − p   (the gap, part by part)',
  'L2: √(d₁² + d₂²) = √(d·d)',
  'L1: |d₁| + |d₂|',
  'L∞: max(|d₁|, |d₂|)',
  'Lp: (|d₁|ᵖ + |d₂|ᵖ)^(1/p)',
  'unit ball: every v with ‖v‖ = 1',
  'nearest: the smallest ‖q − x‖',
];

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const TONE: Record<Norm, 1 | 2 | 3> = { 2: 1, 1: 2, inf: 3 };

function plane(label: string, shapes: Shape[], handles: Handle[], extent: number): PlanePart {
  return { kind: 'plane', id: 'plane', label, x: { min: -extent, max: extent, label: 'x' }, y: { min: -extent, max: extent, label: 'y' }, equal: true, shapes, handles };
}

const pointHandle = (id: string, at: Vec, label: string, mark: 'key' | null = null): Handle => ({ id, at, label, mark, step: 0.5, min: [-LIMITS.point, -LIMITS.point], max: [LIMITS.point, LIMITS.point] });

/** How each norm walks from p to q: straight, across then up, or the longer leg. */
function route(p: Vec, q: Vec, n: Norm, id: string): Shape[] {
  const d = sub(q, p);
  if (n === 2) return [{ kind: 'path', id, points: [p, q], tone: TONE[2], label: `L2 ${fmt(normOf(d, 2), 3)}` }];
  if (n === 1) return [{ kind: 'path', id, points: [p, [q[0], p[1]], q], tone: TONE[1], label: `L1 ${fmt(normOf(d, 1))}` }];
  // L∞: a king's route, diagonal while both directions remain, then straight on to q.
  const m = Math.min(Math.abs(d[0]), Math.abs(d[1]));
  const corner: Vec = [p[0] + Math.sign(d[0]) * m, p[1] + Math.sign(d[1]) * m];
  return [{ kind: 'path', id, points: [p, corner, q], tone: TONE.inf, label: `L∞ ${fmt(normOf(d, 'inf'))}` }];
}

// ───────────────────────────── three distances ─────────────────────────────

function* distance(p: Vec, q: Vec): Generator<Frame<PlotState>> {
  const d = sub(q, p);
  const [l2, l1, li] = [normOf(d, 2), normOf(d, 1), normOf(d, 'inf')];
  const handles = [pointHandle('p', p, 'Point p', 'key'), pointHandle('q', q, 'Point q')];
  const dots: Shape[] = [
    { kind: 'point', id: 'p', at: p, mark: 'key', label: 'p' },
    { kind: 'point', id: 'q', at: q, label: 'q' },
  ];
  const legs: Shape = { kind: 'path', id: 'legs', points: [p, [q[0], p[1]], q], dashed: true, faint: true };
  const E = LIMITS.point + 0.5;
  const gap = { id: 'd', label: 'd = q − p', value: fmtVec(d) };
  const vars = { d1: d[0], d2: d[1] };

  yield plotFrame([plane('Two points', [legs, ...dots], handles, E), readouts([{ id: 'p', label: 'p', value: fmtVec(p), mark: 'key' }, { id: 'q', label: 'q', value: fmtVec(q) }, gap])], {
    line: 0,
    note: `How far apart are p = ${fmtVec(p)} and q = ${fmtVec(q)}? The gap is d = q − p = ${fmtVec(d)}: ${fmt(Math.abs(d[0]))} ${d[0] < 0 ? 'left' : 'right'} and ${fmt(Math.abs(d[1]))} ${d[1] < 0 ? 'down' : 'up'}. Drag either point.`,
    vars,
    checkpoint: ask('How long is the straight line from p to q?', fmt(l2, 3), [fmt(l1, 3), fmt(li, 3), fmt(d[0] * d[0] + d[1] * d[1], 3)]),
  });

  yield plotFrame([plane('L2: as the crow flies', [legs, ...route(p, q, 2, 'l2'), ...dots], handles, E), readouts([gap, { id: 'l2', label: 'L2', value: fmt(l2, 3), tone: TONE[2] }])], {
    line: 1,
    note: `The straight line is the L2 distance, from Pythagoras: √(${fmt(d[0])}² + ${fmt(d[1])}²) = ${fmt(l2, 3)}. It is the length |d| of the gap vector, and √(d·d), since d·d adds up the squares.`,
    vars: { ...vars, L2: round(l2, 3) },
    checkpoint: ask('Now walk only along the grid lines, like a taxi in a city of square blocks. How far is it?', fmt(l1), [fmt(l2, 3), fmt(li), fmt(Math.abs(d[0] - d[1]))]),
  });

  yield plotFrame([plane('L1: city blocks', [legs, ...route(p, q, 2, 'l2'), ...route(p, q, 1, 'l1'), ...dots], handles, E), readouts([gap, { id: 'l2', label: 'L2', value: fmt(l2, 3), tone: TONE[2] }, { id: 'l1', label: 'L1', value: fmt(l1), tone: TONE[1] }])], {
    line: 2,
    note: `Along the grid, every route without backtracking is ${fmt(Math.abs(d[0]))} + ${fmt(Math.abs(d[1]))} = ${fmt(l1)} long: the L1 distance, or Manhattan distance, the sum of the parts' sizes.`,
    vars: { ...vars, L1: l1 },
    checkpoint: ask('A chess king steps one square in any direction, diagonals included. How many steps from p to q? (That is the L∞ distance.)', fmt(li), [fmt(l1), fmt(l2, 3), fmt(Math.min(Math.abs(d[0]), Math.abs(d[1])))]),
  });

  yield plotFrame(
    [
      plane('L∞: only the biggest step counts', [legs, ...route(p, q, 2, 'l2'), ...route(p, q, 1, 'l1'), ...route(p, q, 'inf', 'li'), ...dots], handles, E),
      readouts([gap, { id: 'l2', label: 'L2', value: fmt(l2, 3), tone: TONE[2] }, { id: 'l1', label: 'L1', value: fmt(l1), tone: TONE[1] }, { id: 'li', label: 'L∞', value: fmt(li), tone: TONE.inf }]),
    ],
    {
      line: 3,
      note: `A king steps diagonally, covering both directions at once, until the shorter one runs out, then goes straight on: max(${fmt(Math.abs(d[0]))}, ${fmt(Math.abs(d[1]))}) = ${fmt(li)} steps. That is the L∞ distance, the biggest part's size.`,
      vars: { ...vars, 'L∞': li },
      checkpoint: askInOrder('Can you place p and q so that the L1 distance is shorter than the L2 distance?', ['Yes', 'No'], 'No'),
    },
  );

  yield plotFrame(
    [
      plane('Three rulers', [legs, ...route(p, q, 2, 'l2'), ...route(p, q, 1, 'l1'), ...route(p, q, 'inf', 'li'), ...dots], handles, E),
      readouts([{ id: 'order', label: 'always', value: 'L∞ ≤ L2 ≤ L1' }, { id: 'l2', label: 'L2', value: fmt(l2, 3), tone: TONE[2] }, { id: 'l1', label: 'L1', value: fmt(l1), tone: TONE[1] }, { id: 'li', label: 'L∞', value: fmt(li), tone: TONE.inf }]),
    ],
    {
      line: 0,
      note: `Never: a straight line is the shortest route, so L2 ≤ L1, and it is the long side of a right-angled triangle, so it is at least as long as the longer short side, L∞. So L∞ ≤ L2 ≤ L1 for every gap. They all agree when the gap runs straight along one axis. Here: ${fmt(li)} ≤ ${fmt(l2, 3)} ≤ ${fmt(l1)}.`,
      vars: { ...vars, L2: round(l2, 3), L1: l1, 'L∞': li },
    },
  );
}

// ───────────────────────────── unit balls ─────────────────────────────

/** The points at distance 1 from the origin under ‖·‖ₚ, as a closed path. */
export function unitBall(p: number, n = 144): Vec[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const dir: Vec = [Math.cos(t), Math.sin(t)];
    const r = lp(dir, p);
    return [round(dir[0] / r, 4), round(dir[1] / r, 4)] as Vec;
  });
}

const BALL_NAME: Record<Norm, string> = { 2: 'circle', 1: 'diamond', inf: 'square' };
const SHAPES = ['A circle', 'A diamond', 'A square'];
const shapeAnswer = (n: Norm) => `A ${BALL_NAME[n]}`;
const inside = (t: Vec, n: Norm) => normOf(t, n) <= 1 + 1e-9;

function* balls(t: Vec): Generator<Frame<PlotState>> {
  const E = 1.6;
  const handles: Handle[] = [{ id: 't', at: t, label: 'Point t', mark: 'key', step: 0.1, min: [-LIMITS.ball, -LIMITS.ball], max: [LIMITS.ball, LIMITS.ball] }];
  const ball = (n: Norm): Shape => ({ kind: 'path', id: `ball${NAME[n]}`, points: unitBall(pOf(n)), closed: true, tone: TONE[n], label: `‖v‖${n === 'inf' ? '∞' : n === 1 ? '₁' : '₂'} = 1` });
  const T: Shape = { kind: 'point', id: 't', at: t, mark: 'key', label: 't' };
  const norms = (shown: readonly Norm[]) =>
    readouts([
      { id: 't', label: 't', value: fmtVec(t), mark: 'key' },
      ...shown.map((n) => ({ id: NAME[n], label: `${NAME[n]} length of t`, value: fmt(normOf(t, n), 3), tone: TONE[n] })),
    ]);

  yield plotFrame([plane('Points at L2 distance 1 from the origin', [ball(2), T], handles, E), norms([2])], {
    line: 5,
    note: 'Collect every point whose L2 distance from the origin is exactly 1: they make the circle of radius 1. It is the outline of L2’s unit ball, the points at distance 1 or less (in 3D, a solid ball).',
    vars: {},
    checkpoint: askInOrder('Which shape do the points at L1 distance exactly 1 make?', SHAPES, shapeAnswer(1)),
  });

  yield plotFrame([plane('…and at L1 distance 1', [ball(2), ball(1), T], handles, E), norms([2, 1])], {
    line: 5,
    note: 'Under L1 the points with |x| + |y| = 1 make a diamond: (1, 0), (0.5, 0.5) and (0, 1) are all 1 away. Its corners sit on the axes, where one part is 0.',
    vars: {},
    checkpoint: askInOrder('And the points at L∞ distance exactly 1?', SHAPES, shapeAnswer('inf')),
  });

  yield plotFrame([plane('…and at L∞ distance 1', [ball(2), ball(1), ball('inf'), T], handles, E), norms([2, 1, 'inf'])], {
    line: 5,
    note: 'Under L∞ the points whose bigger part is exactly 1 make a square: (1, 0.4) and (1, 1) are both 1 away. Diamond inside circle inside square, because L∞ ≤ L2 ≤ L1.',
    vars: {},
    checkpoint: askInOrder(`Is t = ${fmtVec(t)} inside the diamond (L1 length 1 or less)?`, ['Yes', 'No'], inside(t, 1) ? 'Yes' : 'No'),
  });

  const where = (n: Norm) => `${NAME[n]} ${fmt(normOf(t, n), 3)} (${inside(t, n) ? 'inside' : 'outside'} the ${BALL_NAME[n]})`;
  yield plotFrame([plane('One point, three lengths', [ball(2), ball(1), ball('inf'), T], handles, E), norms([2, 1, 'inf'])], {
    line: 4,
    note: `t = ${fmtVec(t)} has ${where(1)}, ${where(2)} and ${where('inf')}. Drag t across the shapes and watch which ones it leaves.`,
    vars: {},
  });

  yield plotFrame(
    [
      plane('Lp unit balls for p = 1, 1.5, 2, 4 and ∞', [...FAMILY.map((p, i) => ({ kind: 'path' as const, id: `family${i}`, points: unitBall(p), closed: true, faint: p !== 1 && p !== Infinity && p !== 2, label: p === Infinity ? 'p = ∞' : `p = ${p}` })), T], handles, E),
      readouts(FAMILY.map((p, i) => ({ id: `n${i}`, label: p === Infinity ? 'L∞' : `L${p}`, value: fmt(lp(t, p), 3) }))),
    ],
    {
      line: 4,
      note: 'L1, L2 and L∞ are members of one family, Lp = (|x|ᵖ + |y|ᵖ)^(1/p). As p grows, the diamond puffs out into the circle and on to the square. Later, the diamond’s sharp corners on the axes are why L1 penalties (the lasso) set weights to exactly zero.',
      vars: {},
    },
  );
}

// ───────────────────────────── which point is nearest ─────────────────────────────

function* nearest(q: Vec, a: Vec, b: Vec): Generator<Frame<PlotState>> {
  const E = LIMITS.point + 0.5;
  const handles = [pointHandle('q', q, 'Query point q', 'key'), pointHandle('a', a, 'Point A'), pointHandle('b', b, 'Point B')];
  const dots: Shape[] = [
    { kind: 'point', id: 'q', at: q, mark: 'key', label: 'q' },
    { kind: 'point', id: 'a', at: a, label: 'A' },
    { kind: 'point', id: 'b', at: b, label: 'B' },
  ];
  const da = sub(a, q);
  const db = sub(b, q);
  const winner = (n: Norm) => {
    const [x, y] = [normOf(da, n), normOf(db, n)];
    return Math.abs(x - y) < 1e-9 ? 'A tie' : x < y ? 'A' : 'B';
  };
  const CHOICES = ['A', 'B', 'A tie'];
  const order: Norm[] = [2, 1, 'inf'];
  const shown: Norm[] = [];
  const routes = (n: Norm): Shape[] => [...route(q, a, n, `${NAME[n]}a`).map((s) => ({ ...s, label: undefined })), ...route(q, b, n, `${NAME[n]}b`).map((s) => ({ ...s, label: undefined }))];

  yield plotFrame([plane('Which point is nearer to q?', dots, handles, E), readouts([{ id: 'q', label: 'q', value: fmtVec(q), mark: 'key' }, { id: 'a', label: 'A', value: fmtVec(a) }, { id: 'b', label: 'B', value: fmtVec(b) }])], {
    line: 6,
    note: `A nearest-neighbour model labels a new point q like the training point closest to it. Is A = ${fmtVec(a)} or B = ${fmtVec(b)} closer to q = ${fmtVec(q)}? It depends on the ruler. Drag any of the three.`,
    vars: {},
    checkpoint: askInOrder('Under L2, the straight line, which is nearer to q?', CHOICES, winner(2)),
  });

  for (let k = 0; k < order.length; k++) {
    const n = order[k];
    shown.push(n);
    const next = order[k + 1];
    const [x, y] = [normOf(da, n), normOf(db, n)];
    const w = winner(n);
    yield plotFrame(
      [
        plane(`Nearest under ${NAME[n]}`, [...routes(n), ...dots.map((d) => (d.id === w.toLowerCase() ? { ...d, mark: 'found' as const } : d))], handles, E),
        readouts(shown.flatMap((m) => [{ id: `${NAME[m]}a`, label: `${NAME[m]} to A`, value: fmt(normOf(da, m), 3), tone: TONE[m] }, { id: `${NAME[m]}b`, label: `${NAME[m]} to B`, value: fmt(normOf(db, m), 3), tone: TONE[m] }])),
      ],
      {
        line: n === 2 ? 1 : n === 1 ? 2 : 3,
        note: `Under ${NAME[n]}, A is ${fmt(x, 3)} away and B is ${fmt(y, 3)}: ${w === 'A tie' ? 'a tie' : `${w} is nearer`}.`,
        vars: { [`${NAME[n]} A`]: round(x, 3), [`${NAME[n]} B`]: round(y, 3) },
        checkpoint: next === undefined ? undefined : askInOrder(`Under ${NAME[next]}, which is nearer to q?`, CHOICES, winner(next)),
      },
    );
  }

  const ws = order.map(winner);
  yield plotFrame([plane('The answer depends on the ruler', [...routes(2), ...dots], handles, E), readouts(order.map((n) => ({ id: NAME[n], label: `nearest by ${NAME[n]}`, value: winner(n), tone: TONE[n] })))], {
    line: 6,
    note: new Set(ws).size > 1 ? `L2 picks ${ws[0]}, L1 picks ${ws[1]} and L∞ picks ${ws[2]}: the same three points, a different nearest neighbour. Choosing the distance is part of designing the model.` : `Here all three rulers agree (${ws[0]}). Drag A or B until they don't: choosing the distance is part of designing the model.`,
    vars: {},
  });
}

function* run(input: NormsInput): Generator<Frame<PlotState>> {
  switch (input.story) {
    case 'distance':
      return yield* distance(input.p, input.q);
    case 'balls':
      return yield* balls(input.t);
    case 'nearest':
      return yield* nearest(input.q, input.a, input.b);
  }
}

// ───────────────────────────── custom text ─────────────────────────────

const STORIES: Story[] = ['distance', 'balls', 'nearest'];
const onStep = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-9;

export function parseNorms(text: string): { value: NormsInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const story = STORIES.find((s) => s === word);
  if (!story) return { error: 'Start with distance, balls or nearest.' };
  const xs = numbersIn(text);
  const P = LIMITS.point;
  const pointOk = (x: number) => onStep(x, 0.5) && Math.abs(x) <= P;
  if (story === 'balls') {
    if (xs.length !== 2 || !xs.every((x) => onStep(x, 0.1) && Math.abs(x) <= LIMITS.ball + 1e-9)) return { error: `Give t as two tenths from −${LIMITS.ball} to ${LIMITS.ball}, e.g. balls 0.6 0.6.` };
    return { value: { story, t: [round(xs[0], 1), round(xs[1], 1)] } };
  }
  const want = story === 'distance' ? 4 : 6;
  if (xs.length !== want || !xs.every(pointOk)) return { error: story === 'distance' ? `Give p and q, halves from −${P} to ${P}, e.g. distance 1 1, 4 5.` : `Give q, A and B, halves from −${P} to ${P}, e.g. nearest 0 0, 3 0, 2 2.` };
  if (story === 'distance') return { value: { story, p: [xs[0], xs[1]], q: [xs[2], xs[3]] } };
  return { value: { story, q: [xs[0], xs[1]], a: [xs[2], xs[3]], b: [xs[4], xs[5]] } };
}

function format(input: NormsInput): string {
  const p = (v: Vec) => `${plain(v[0])} ${plain(v[1])}`;
  if (input.story === 'distance') return `distance ${p(input.p)}, ${p(input.q)}`;
  if (input.story === 'balls') return `balls ${p(input.t)}`;
  return `nearest ${p(input.q)}, ${p(input.a)}, ${p(input.b)}`;
}

export function dragNorms(input: NormsInput, id: string, to: Vec): NormsInput {
  if (input.story === 'balls') return { ...input, t: [round(to[0], 1), round(to[1], 1)] };
  const t: Vec = [Math.round(to[0] * 2) / 2, Math.round(to[1] * 2) / 2];
  if (input.story === 'distance') return id === 'p' ? { ...input, p: t } : { ...input, q: t };
  return id === 'q' ? { ...input, q: t } : id === 'a' ? { ...input, a: t } : { ...input, b: t };
}

const example = (id: string, label: string, input: NormsInput) => ({ id, label, make: () => input, sized: false });

export const norms = defineAlgorithm<NormsInput, PlotState>({
  kind: 'algorithm',
  slug: 'norms',
  view: 'plot',
  input: {
    examples: [
      example('distance', 'Three ways to measure a gap', { story: 'distance', p: [-2, -1], q: [1, 3] }),
      example('balls', 'Points at distance 1', { story: 'balls', t: [0.6, 0.6] }),
      example('nearest', 'Which point is nearest?', { story: 'nearest', q: [0, 0], a: [3, 0], b: [2, 2] }),
    ],
    custom: {
      label: 'A story: distance px py, qx qy; balls tx ty; or nearest qx qy, ax ay, bx by',
      placeholder: 'e.g. distance -2 -1, 1 3',
      parse: parseNorms,
      format,
    },
    drag: dragNorms,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The points, and the steps across and up' },
    { tone: 1, label: 'L2: the straight line, the circle' },
    { tone: 2, label: 'L1: city blocks, the diamond' },
    { tone: 3, label: 'L∞: the biggest step, the square' },
    { mark: 'key', label: 'The point you measure from, or t' },
    { mark: 'found', label: 'The nearest point' },
  ],
  run,
  content: {
    idea: 'To measure how far apart two points are, take the gap d = q − p and measure its size. L2 is the straight line, √(d₁² + d₂²) by Pythagoras. L1 adds the parts’ sizes, |d₁| + |d₂|, like walking city blocks. L∞ takes only the biggest part, max(|d₁|, |d₂|), like a chess king’s moves.',
    invariant: 'For every gap, L∞ ≤ L2 ≤ L1, with all three equal when the gap runs along one axis. Each is 0 only for the zero vector, scales with |k| when the vector is scaled by k, and obeys the triangle inequality: going via a third point is never shorter. L2 is √(d·d).',
    whenToUse: 'Nearest-neighbour models and k-means need a distance, and the choice changes which points count as near. L2 is the usual default; L1 is less thrown by one large difference; L∞ suits “every part must be within a tolerance”. As penalties on weights, L2 (ridge) shrinks them all and L1 (lasso) sets some exactly to zero.',
    traits: [
      { label: 'L∞ ≤ L2 ≤ L1', good: null },
      { label: 'Unit balls: diamond, circle, square', good: null },
      { label: 'The nearest point can change with the ruler', good: false },
    ],
    experiments: [
      { example: 'distance', prompt: 'Drag q so the gap runs straight across. Why do all three distances agree?' },
      { example: 'balls', prompt: 'Find a point t that is inside the square but outside the circle.' },
      { example: 'nearest', prompt: 'Drag B until L1 and L2 agree. Then find a spot where all three disagree.' },
    ],
  },
});

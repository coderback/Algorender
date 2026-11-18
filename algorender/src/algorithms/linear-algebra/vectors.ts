import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { add, norm, scale } from './shared';

// Vectors: an arrow is a move (so many across, so many up), not a place. The
// same move drawn from anywhere is the same vector, and the vector from P to Q
// is Q − P. Moves add tip to tail, a number stretches or flips one, Pythagoras
// gives its length, and a data point (a row of features) is a vector too, so
// the mean of the data is "add them up, then scale by 1/n".

export type VectorsInput =
  | { story: 'arrow'; v: Vec; at: Vec }
  | { story: 'add'; u: Vec; v: Vec }
  | { story: 'scale'; v: Vec; k: number }
  | { story: 'length'; v: Vec }
  | { story: 'data'; points: readonly Vec[] };
export type Story = VectorsInput['story'];

/** Components a learner may choose (halves), per story, and the scale factors. */
export const LIMITS = { move: 3, length: 4, k: 2, data: 5 } as const;
const MOVE_EXTENT = 6.5;

const pseudocode = [
  'v = (x, y): x across, y up',
  'the arrow from P to Q is Q − P',
  'u + v = (u₁ + v₁, u₂ + v₂)',
  'kv = (k × v₁, k × v₂)',
  '|v| = √(v₁² + v₂²)',
  'unit vector: v / |v|',
  'mean = (1/n)·(x₁ + x₂ + … + xₙ)',
];

export const neg = (v: Vec): Vec => [-v[0], -v[1]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const sum = (vs: readonly Vec[]): Vec => vs.reduce<Vec>((s, v) => add(s, v), [0, 0]);
/** The mean of the points: their sum scaled by 1/n. */
export const mean = (vs: readonly Vec[]): Vec => scale(1 / vs.length, sum(vs));

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });

function plane(label: string, shapes: Shape[], handles: Handle[], x: [number, number] = [-MOVE_EXTENT, MOVE_EXTENT], y: [number, number] = x): PlanePart {
  return { kind: 'plane', id: 'plane', label, x: { min: x[0], max: x[1], label: 'x' }, y: { min: y[0], max: y[1], label: 'y' }, equal: true, shapes, handles };
}

/** A handle on an arrow's tip (or tail) inside ±limit, never letting a dependent tip leave ±6. */
const handle = (id: string, at: Vec, label: string, limit: number, opts: Partial<Handle> = {}): Handle => ({ id, at, label, step: 0.5, min: [-limit, -limit], max: [limit, limit], ...opts });

/** The across-then-up steps of an arrow, drawn faint. */
const steps = (id: string, from: Vec, v: Vec): Shape => ({ kind: 'path', id, points: [from, [from[0] + v[0], from[1]], add(from, v)], dashed: true, faint: true });

const moves = (v: Vec) => {
  const across = v[0] === 0 ? '' : `${fmt(Math.abs(v[0]))} ${v[0] > 0 ? 'right' : 'left'}`;
  const up = v[1] === 0 ? '' : `${fmt(Math.abs(v[1]))} ${v[1] > 0 ? 'up' : 'down'}`;
  return [across, up].filter(Boolean).join(' and ') || 'nowhere at all';
};

// ───────────────────────────── an arrow is a move ─────────────────────────────

function* arrow(v: Vec, at: Vec): Generator<Frame<PlotState>> {
  const tip = add(at, v);
  const L = LIMITS.move;
  // Both stay inside ±3, so the copy's tip stays on the ±6.5 plane.
  const tail = handle('at', at, 'Where the copy starts', L, { mark: 'key' });
  const tipHandle = handle('v', v, 'Tip of v', L, { tone: 2 });
  const V: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' };
  const vars = { x: v[0], y: v[1] };

  yield plotFrame([plane('An arrow from the origin', [steps('steps', [0, 0], v), V], [tipHandle]), readouts([{ id: 'v', label: 'v', value: fmtVec(v), tone: 2 }])], {
    line: 0,
    note: `The vector v = ${fmtVec(v)} is a move: ${moves(v)}. Drawn from the origin (0, 0), its tip lands on the point ${fmtVec(v)}. Drag the tip to try other moves.`,
    vars,
    checkpoint: ask(`Make the same move starting from ${fmtVec(at)} instead. Where does the tip land?`, fmtVec(tip), [fmtVec(v), fmtVec(sub(v, at)), fmtVec([at[0] + v[1], at[1] + v[0]])]),
  });

  const copy: Shape = { kind: 'vector', id: 'copy', from: at, to: tip, tone: 2, label: 'v again' };
  yield plotFrame(
    [
      plane('The same move, from somewhere else', [V, steps('copy-steps', at, v), copy, { kind: 'point', id: 'P', at, mark: 'key', label: 'P' }], [tipHandle, tail]),
      readouts([
        { id: 'P', label: 'start P', value: fmtVec(at), mark: 'key' },
        { id: 'Q', label: 'tip Q', value: fmtVec(tip) },
      ]),
    ],
    {
      line: 0,
      note: `Start at P = ${fmtVec(at)} and go ${moves(v)}: the tip lands at Q = ${fmtVec(tip)}. Drag P to start the copy elsewhere.`,
      vars: { ...vars, Px: at[0], Py: at[1] },
      checkpoint: askInOrder('Is the arrow from P to Q the same vector as v, or a different one?', ['The same vector', 'A different vector'], 'The same vector'),
    },
  );

  yield plotFrame(
    [
      plane('Both arrows are v', [V, copy, { kind: 'point', id: 'P', at, mark: 'key', label: 'P' }, { kind: 'point', id: 'Q', at: tip, label: 'Q' }], [tipHandle, tail]),
      readouts([
        { id: 'P', label: 'P', value: fmtVec(at), mark: 'key' },
        { id: 'Q', label: 'Q', value: fmtVec(tip) },
        { id: 'QP', label: 'Q − P', value: fmtVec(sub(tip, at)), mark: 'found' },
      ]),
    ],
    {
      line: 1,
      note: `They are the same vector. A vector records only a length and a direction, not where it is drawn, so v is every arrow that goes ${moves(v)}. To find the arrow from P to Q, subtract: Q − P = ${fmtVec(tip)} − ${fmtVec(at)} = ${fmtVec(v)}.`,
      vars: { ...vars, Px: at[0], Py: at[1] },
      checkpoint: ask(`So what is the vector from Q back to P?`, fmtVec(neg(v)), [fmtVec(v), fmtVec(at), fmtVec(neg(tip))]),
    },
  );

  yield plotFrame(
    [
      plane('Back again: −v', [V, copy, { kind: 'vector', id: 'back', from: tip, to: at, mark: 'found', label: '−v' }, { kind: 'point', id: 'P', at, mark: 'key', label: 'P' }], [tipHandle, tail]),
      readouts([
        { id: 'PQ', label: 'P − Q', value: fmtVec(neg(v)), mark: 'found' },
        { id: 'len', label: 'both lengths', value: fmt(norm(v), 3) },
      ]),
    ],
    {
      line: 1,
      note: `P − Q = ${fmtVec(neg(v))}: the same length as v, pointing the opposite way. That is −v. A point says where; a vector says which way and how far.`,
      vars: { ...vars, Px: at[0], Py: at[1] },
    },
  );
}

// ───────────────────────────── adding tip to tail ─────────────────────────────

function* addition(u: Vec, v: Vec): Generator<Frame<PlotState>> {
  const w = add(u, v);
  const d = sub(u, v);
  const L = LIMITS.move;
  const handles = [handle('u', u, 'Tip of u', L, { tone: 1 }), handle('v', v, 'Tip of v', L, { tone: 2 })];
  const U: Shape = { kind: 'vector', id: 'u', from: [0, 0], to: u, tone: 1, label: 'u' };
  const V: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' };
  const vals = (extra: Readout[] = []) =>
    readouts([{ id: 'u', label: 'u', value: fmtVec(u), tone: 1 }, { id: 'v', label: 'v', value: fmtVec(v), tone: 2 }, ...extra]);
  const vars = { u1: u[0], u2: u[1], v1: v[0], v2: v[1] };

  yield plotFrame([plane('Two moves, u and v', [U, V], handles), vals()], {
    line: 0,
    note: `u = ${fmtVec(u)} goes ${moves(u)}; v = ${fmtVec(v)} goes ${moves(v)}. Adding vectors means making one move and then the other. Drag either tip.`,
    vars,
    checkpoint: ask('Make the move u, then the move v. Where do you end up?', fmtVec(w), [fmtVec([u[0] + v[1], u[1] + v[0]]), fmtVec([u[0] * v[0], u[1] * v[1]]), fmtVec(d)]),
  });

  yield plotFrame(
    [plane('u, then v from u’s tip', [U, V, { kind: 'vector', id: 'v-after-u', from: u, to: w, tone: 2, dashed: true }, { kind: 'vector', id: 'sum', from: [0, 0], to: w, mark: 'found', label: 'u + v' }], handles), vals([{ id: 'sum', label: 'u + v', value: fmtVec(w), mark: 'found' }])],
    {
      line: 2,
      note: `Put v's tail on u's tip (tip to tail): you end at ${fmtVec(w)}. In numbers, add the matching parts: (${fmt(u[0])} + ${fmt(v[0])}, ${fmt(u[1])} + ${fmt(v[1])}) = ${fmtVec(w)}.`,
      vars: { ...vars, x: w[0], y: w[1] },
      checkpoint: ask('Now make the move v first, then u. Where do you end up?', fmtVec(w), [fmtVec(add(v, neg(u))), fmtVec(add(w, v)), fmtVec([v[0] + u[1], v[1] + u[0]])]),
    },
  );

  yield plotFrame(
    [
      plane('Either order: a parallelogram', [
        U,
        V,
        { kind: 'vector', id: 'v-after-u', from: u, to: w, tone: 2, dashed: true },
        { kind: 'vector', id: 'u-after-v', from: v, to: w, tone: 1, dashed: true },
        { kind: 'vector', id: 'sum', from: [0, 0], to: w, mark: 'found', label: 'u + v' },
      ], handles),
      vals([{ id: 'sum', label: 'u + v = v + u', value: fmtVec(w), mark: 'found' }]),
    ],
    {
      line: 2,
      note: `The same place: u + v = v + u = ${fmtVec(w)}. The two routes go round opposite halves of a parallelogram and meet at the same corner, so the sum is its diagonal.`,
      vars: { ...vars, x: w[0], y: w[1] },
      checkpoint: ask('u − v means u plus the reverse of v. What is u − v?', fmtVec(d), [fmtVec(sub(v, u)), fmtVec(w), fmtVec([u[0] - v[1], u[1] - v[0]])]),
    },
  );

  yield plotFrame(
    [
      plane('u − v: from v’s tip to u’s tip', [U, V, { kind: 'vector', id: 'diff', from: v, to: u, mark: 'found', label: 'u − v' }], handles),
      vals([{ id: 'diff', label: 'u − v', value: fmtVec(d), mark: 'found' }]),
    ],
    {
      line: 1,
      note: `u − v = ${fmtVec(d)}: subtract the matching parts. Drawn from v's tip it ends on u's tip, so it is the arrow from v to u, just as Q − P is the arrow from P to Q.`,
      vars: { ...vars, x: d[0], y: d[1] },
    },
  );
}

// ───────────────────────────── scaling ─────────────────────────────

function* scaling(v: Vec, k: number): Generator<Frame<PlotState>> {
  const handles = [handle('v', v, 'Tip of v', LIMITS.move, { tone: 2 })];
  const V: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' };
  const kv = scale(k, v);
  const line: Shape = { kind: 'line', id: 'span', through: [0, 0], dir: v, dashed: true, label: 'every kv' };
  const vals = (extra: Readout[] = []) => readouts([{ id: 'v', label: 'v', value: fmtVec(v), tone: 2 }, { id: 'len', label: '|v|', value: fmt(norm(v), 3) }, ...extra]);
  const vars = { x: v[0], y: v[1] };

  yield plotFrame([plane('A vector v', [V], handles), vals()], {
    line: 0,
    note: `v = ${fmtVec(v)}. Multiplying a vector by a number k (a scalar) scales the move: k = 2 makes it twice as long, and a negative k also flips it. Drag the tip to change v.`,
    vars,
    checkpoint: ask('What is 2v?', fmtVec(scale(2, v)), [fmtVec([v[0] + 2, v[1] + 2]), fmtVec([2 * v[0], v[1]]), fmtVec(scale(0.5, v))]),
  });

  yield plotFrame([plane('2v: twice as far', [{ kind: 'vector', id: 'kv', from: [0, 0], to: scale(2, v), mark: 'found', label: '2v' }, V], handles), vals([{ id: 'kv', label: '2v', value: fmtVec(scale(2, v)), mark: 'found' }, { id: 'klen', label: '|2v|', value: fmt(2 * norm(v), 3) }])], {
    line: 3,
    note: `2v = (2 × ${fmt(v[0])}, 2 × ${fmt(v[1])}) = ${fmtVec(scale(2, v))}: every part doubles, so the arrow points the same way and is twice as long.`,
    vars: { ...vars, k: 2 },
    checkpoint: askInOrder('Which way does −1v, written −v, point?', ['The same way as v', 'The opposite way to v', 'At right angles to v'], 'The opposite way to v'),
  });

  yield plotFrame([plane('−v: turned right round', [{ kind: 'vector', id: 'kv', from: [0, 0], to: neg(v), mark: 'found', label: '−v' }, V], handles), vals([{ id: 'kv', label: '−v', value: fmtVec(neg(v)), mark: 'found' }, { id: 'klen', label: '|−v|', value: fmt(norm(v), 3) }])], {
    line: 3,
    note: `−v = ${fmtVec(neg(v))}: a negative number flips the arrow to point backwards. Its length doesn't change.`,
    vars: { ...vars, k: -1 },
    checkpoint: ask(`What is ${fmt(k)}v?`, fmtVec(kv), [fmtVec(scale(-k, v)), fmtVec([k * v[0], v[1]]), fmtVec([v[0] + k, v[1] + k])]),
  });

  yield plotFrame(
    [
      plane(`${fmt(k)}v, on the line through v`, [line, { kind: 'vector', id: 'kv', from: [0, 0], to: kv, mark: 'found', label: `${fmt(k)}v` }, V], handles),
      vals([{ id: 'kv', label: `${fmt(k)}v`, value: fmtVec(kv), mark: 'found' }, { id: 'klen', label: `|${fmt(k)}v|`, value: fmt(Math.abs(k) * norm(v), 3) }]),
    ],
    {
      line: 3,
      note: `${fmt(k)}v = ${fmtVec(kv)}${k === 0 ? ': no move at all, the zero vector' : k < 0 ? `, ${fmt(-k)} times as long and pointing backwards` : `, ${fmt(k)} times as long`}. Every multiple of v lies on the one line through the origin and v: scaling can stretch, shrink or flip an arrow, but never turn it to a new direction.`,
      vars: { ...vars, k },
    },
  );
}

// ───────────────────────────── length ─────────────────────────────

function* length(v: Vec): Generator<Frame<PlotState>> {
  const L = LIMITS.length;
  const n = norm(v);
  const unit = scale(1 / n, v);
  const handles = [handle('v', v, 'Tip of v', L, { tone: 2 })];
  const V: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' };
  const extent: [number, number] = [-2 * L - 0.5, 2 * L + 0.5];
  const vals = (extra: Readout[] = []) => readouts([{ id: 'v', label: 'v', value: fmtVec(v), tone: 2 }, ...extra]);
  const legs: Shape[] = [
    { kind: 'path', id: 'across', points: [[0, 0], [v[0], 0]], dashed: true, label: `${fmt(Math.abs(v[0]))} ${v[0] < 0 ? 'left' : 'right'}` },
    { kind: 'path', id: 'up', points: [[v[0], 0], v], dashed: true, label: `${fmt(Math.abs(v[1]))} ${v[1] < 0 ? 'down' : 'up'}` },
  ];
  const vars = { x: v[0], y: v[1] };
  const sq = v[0] * v[0] + v[1] * v[1];

  yield plotFrame([plane('How long is v?', [V], handles, extent), vals()], {
    line: 4,
    note: `v = ${fmtVec(v)}. Its length, written |v|, is how far the move takes you in a straight line. Drag the tip to change v.`,
    vars,
    checkpoint: ask(`How long is v = ${fmtVec(v)}?`, fmt(n, 3), [fmt(Math.abs(v[0]) + Math.abs(v[1]), 3), fmt(sq, 3), fmt(Math.max(Math.abs(v[0]), Math.abs(v[1])), 3)]),
  });

  yield plotFrame([plane('Pythagoras', [...legs, V], handles, extent), vals([{ id: 'len', label: '|v|', value: fmt(n, 3), mark: 'found' }])], {
    line: 4,
    note: `The steps across and up are the two short sides of a right-angled triangle, and v is its long side. By Pythagoras, |v| = √(${fmt(v[0])}² + ${fmt(v[1])}²) = √${fmt(sq)} = ${fmt(n, 3)}.`,
    vars: { ...vars, '|v|': round(n, 3) },
    checkpoint: ask('How long is 2v?', fmt(2 * n, 3), [fmt(n, 3), fmt(4 * n, 3), fmt(n * n, 3)]),
  });

  yield plotFrame([plane('|2v| = 2|v|', [{ kind: 'vector', id: 'kv', from: [0, 0], to: scale(2, v), mark: 'found', label: '2v' }, V], handles, extent), vals([{ id: 'len', label: '|v|', value: fmt(n, 3) }, { id: 'klen', label: '|2v|', value: fmt(2 * n, 3), mark: 'found' }])], {
    line: 4,
    note: `|2v| = √(${fmt(2 * v[0])}² + ${fmt(2 * v[1])}²) = ${fmt(2 * n, 3)}: doubling both parts doubles the length.`,
    vars,
    checkpoint: ask('How long is −v?', fmt(n, 3), [fmt(-n, 3), '0', fmt(2 * n, 3)]),
  });

  yield plotFrame([plane('|−v| = |v|', [{ kind: 'vector', id: 'kv', from: [0, 0], to: neg(v), mark: 'found', label: '−v' }, V], handles, extent), vals([{ id: 'len', label: '|v|', value: fmt(n, 3) }, { id: 'klen', label: '|−v|', value: fmt(n, 3), mark: 'found' }])], {
    line: 4,
    note: `|−v| = ${fmt(n, 3)}: the squares hide the minus signs, so a length is never negative. −v is just as long, pointing the other way.`,
    vars,
    checkpoint: ask(`Divide v by its length, ${fmt(n, 3)}. How long is the result?`, '1', [fmt(n, 3), '0', fmt(1 / n, 3)]),
  });

  const unitCircle: Shape = { kind: 'path', id: 'circle', points: Array.from({ length: 73 }, (_, i) => [Math.cos((i * Math.PI) / 36), Math.sin((i * Math.PI) / 36)] as Vec), closed: true, faint: true };
  yield plotFrame([plane('The unit vector: direction alone', [unitCircle, V, { kind: 'vector', id: 'kv', from: [0, 0], to: unit, mark: 'found', label: 'v / |v|' }], handles, extent), vals([{ id: 'unit', label: 'v / |v|', value: fmtVec(unit, 3), mark: 'found' }, { id: 'ulen', label: 'its length', value: '1' }])], {
    line: 5,
    note: `v / |v| = ${fmtVec(unit, 3)} has length 1: it keeps v's direction and forgets its size. Such a unit vector always ends on the circle of radius 1, like a point on the unit circle.`,
    vars,
  });
}

// ───────────────────────────── data as vectors ─────────────────────────────

const NAMES = ['a', 'b', 'c', 'd'];

function* data(points: readonly Vec[]): Generator<Frame<PlotState>> {
  const n = points.length;
  const total = sum(points);
  const m = mean(points);
  const L = LIMITS.data;
  const hi = Math.max(L, total[0], total[1]) + 1;
  const range: [number, number] = [-1, hi];
  const handles = points.map((p, i) => handle(NAMES[i], p, `Student ${NAMES[i]}`, L, { mark: 'key', min: [0, 0] }));
  const dots: Shape[] = points.map((p, i) => ({ kind: 'point', id: `p${i}`, at: p, mark: 'key', label: NAMES[i] }));
  const table = readouts(points.map((p, i) => ({ id: `p${i}`, label: `student ${NAMES[i]}`, value: fmtVec(p), mark: 'key' as const })));
  const [a, b] = points;
  const ab = sub(b, a);
  const chain: Shape[] = points.map((p, i) => {
    const from = sum(points.slice(0, i));
    return { kind: 'vector', id: `step${i}`, from, to: add(from, p), dashed: i > 0, label: i === 0 ? NAMES[0] : `+ ${NAMES[i]}` };
  });
  const vars = { n };
  const label = 'Scores (maths across, art up)';
  const axes = (p: PlanePart): PlanePart => ({ ...p, x: { min: range[0], max: range[1], label: 'maths' }, y: { min: range[0], max: range[1], label: 'art' } });

  yield plotFrame([axes(plane(label, dots, handles, range)), table], {
    line: 0,
    note: `${n} students, each with a maths score and an art score out of ${L}. A model sees each student as a vector: student a is ${fmtVec(a)}. Drag a point to change a score.`,
    vars,
    checkpoint: ask(`Which vector takes you from student a to student b?`, fmtVec(ab), [fmtVec(neg(ab)), fmtVec(add(a, b)), fmtVec(b)]),
  });

  yield plotFrame([axes(plane(label, [...dots, { kind: 'vector', id: 'ab', from: a, to: b, mark: 'found', label: 'b − a' }], handles, range)), readouts([{ id: 'ab', label: 'b − a', value: fmtVec(ab), mark: 'found' }, { id: 'gap', label: '|b − a|', value: fmt(norm(ab), 3) }])], {
    line: 1,
    note: `b − a = ${fmtVec(ab)}: how b differs from a, score by score. Its length, ${fmt(norm(ab), 3)}, says how different the two students are overall: close vectors mean similar students.`,
    vars,
    checkpoint: ask(`Add all ${n} students’ vectors, tip to tail. Where do you end up?`, fmtVec(total), [fmtVec(m), fmtVec(add(a, b)), fmtVec(scale(n, a))]),
  });

  yield plotFrame([axes(plane(label, [...dots, ...chain], handles, range)), readouts([{ id: 'sum', label: 'the sum', value: fmtVec(total), mark: 'found' }])], {
    line: 2,
    note: `Tip to tail, the ${n} moves end at ${fmtVec(total)}: the maths scores add to ${fmt(total[0])} and the art scores to ${fmt(total[1])}.`,
    vars,
    checkpoint: ask(`The average student is that sum scaled by 1/${n}. Where is it?`, fmtVec(m), [fmtVec(total), fmtVec(scale(0.5, total)), fmtVec(scale(1 / n, [total[1], total[0]]))]),
  });

  yield plotFrame(
    [
      axes(plane(label, [...dots, ...chain, { kind: 'vector', id: 'mean', from: [0, 0], to: m, mark: 'found', label: 'mean' }], handles, range)),
      readouts([
        { id: 'sum', label: 'the sum', value: fmtVec(total) },
        { id: 'mean', label: `the mean, sum / ${n}`, value: fmtVec(m), mark: 'found' },
      ]),
    ],
    {
      line: 6,
      note: `The mean is (1/${n})·${fmtVec(total)} = ${fmtVec(m)}: the average maths score and the average art score in one vector. Adding and scaling are all it takes.`,
      vars,
    },
  );
}

function* run(input: VectorsInput): Generator<Frame<PlotState>> {
  switch (input.story) {
    case 'arrow':
      return yield* arrow(input.v, input.at);
    case 'add':
      return yield* addition(input.u, input.v);
    case 'scale':
      return yield* scaling(input.v, input.k);
    case 'length':
      return yield* length(input.v);
    case 'data':
      return yield* data(input.points);
  }
}

// ───────────────────────────── custom text ─────────────────────────────

const STORIES: Story[] = ['arrow', 'add', 'scale', 'length', 'data'];
const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const within = (x: number, lo: number, hi: number) => isHalf(x) && x >= lo && x <= hi;
const vec = (xs: number[], i: number): Vec => [xs[i], xs[i + 1]];

export function parseVectors(text: string): { value: VectorsInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const story = STORIES.find((s) => s === word);
  if (!story) return { error: 'Start with arrow, add, scale, length or data.' };
  const xs = numbersIn(text);
  const M = LIMITS.move;
  const moveOk = (v: Vec) => v.every((c) => within(c, -M, M));
  if (story === 'arrow' || story === 'add') {
    if (xs.length !== 4) return { error: story === 'arrow' ? 'Give v and where it starts, e.g. arrow 3 2 from -2 1.' : 'Give u and v, e.g. add 3 1 + 1 2.' };
    const [p, q] = [vec(xs, 0), vec(xs, 2)];
    if (!moveOk(p) || !moveOk(q)) return { error: `Use halves from −${M} to ${M} for each part.` };
    return { value: story === 'arrow' ? { story, v: p, at: q } : { story, u: p, v: q } };
  }
  if (story === 'scale') {
    if (xs.length !== 3) return { error: 'Give v and k, e.g. scale 2 1 k=-1.5.' };
    const v = vec(xs, 0);
    if (!moveOk(v)) return { error: `Use halves from −${M} to ${M} for v.` };
    if (!within(xs[2], -LIMITS.k, LIMITS.k)) return { error: `k must be a half from −${LIMITS.k} to ${LIMITS.k}.` };
    return { value: { story, v, k: xs[2] } };
  }
  if (story === 'length') {
    if (xs.length !== 2) return { error: 'Give v, e.g. length 3 4.' };
    const v = vec(xs, 0);
    if (!v.every((c) => within(c, -LIMITS.length, LIMITS.length))) return { error: `Use halves from −${LIMITS.length} to ${LIMITS.length}.` };
    if (v[0] === 0 && v[1] === 0) return { error: 'The zero vector has no direction: pick a vector that moves.' };
    return { value: { story, v } };
  }
  if (xs.length % 2 !== 0 || xs.length < 4 || xs.length > 8) return { error: 'Give 2 to 4 points, two scores each, e.g. data 4 1, 2 3, 3 5.' };
  const points = Array.from({ length: xs.length / 2 }, (_, i) => vec(xs, 2 * i));
  if (!points.every((p) => p.every((c) => within(c, 0, LIMITS.data)))) return { error: `Scores are halves from 0 to ${LIMITS.data}.` };
  return { value: { story, points } };
}

function format(input: VectorsInput): string {
  const p = (v: Vec) => `${plain(v[0])} ${plain(v[1])}`;
  switch (input.story) {
    case 'arrow':
      return `arrow ${p(input.v)} from ${p(input.at)}`;
    case 'add':
      return `add ${p(input.u)} + ${p(input.v)}`;
    case 'scale':
      return `scale ${p(input.v)} k=${plain(input.k)}`;
    case 'length':
      return `length ${p(input.v)}`;
    case 'data':
      return `data ${input.points.map(p).join(', ')}`;
  }
}

const snapHalf = (x: number) => Math.round(x * 2) / 2;

export function dragVectors(input: VectorsInput, id: string, to: Vec): VectorsInput {
  const t: Vec = [snapHalf(to[0]), snapHalf(to[1])];
  switch (input.story) {
    case 'arrow':
      return id === 'at' ? { ...input, at: t } : { ...input, v: t };
    case 'add':
      return id === 'u' ? { ...input, u: t } : { ...input, v: t };
    case 'scale':
      return { ...input, v: t };
    case 'length':
      return t[0] === 0 && t[1] === 0 ? input : { ...input, v: t };
    case 'data': {
      const i = NAMES.indexOf(id);
      return i < 0 ? input : { ...input, points: input.points.map((p, j) => (j === i ? t : p)) };
    }
  }
}

const example = (id: string, label: string, input: VectorsInput) => ({ id, label, make: () => input, sized: false });

export const vectors = defineAlgorithm<VectorsInput, PlotState>({
  kind: 'algorithm',
  slug: 'vectors',
  view: 'plot',
  input: {
    examples: [
      example('arrow', 'An arrow is a move', { story: 'arrow', v: [3, 2], at: [-2, 1] }),
      example('add', 'Adding tip to tail', { story: 'add', u: [3, 1], v: [1, 2] }),
      example('scale', 'Stretching and flipping', { story: 'scale', v: [2, 1], k: -1.5 }),
      example('length', 'Length by Pythagoras', { story: 'length', v: [3, 4] }),
      example('data', 'Data points as vectors', { story: 'data', points: [[4, 1], [2, 3], [3, 5]] }),
    ],
    custom: {
      label: 'A story: arrow x y from px py, add ux uy + vx vy, scale x y k=…, length x y, or data (scores)',
      placeholder: 'e.g. add 3 1 + 1 2',
      parse: parseVectors,
      format,
    },
    drag: dragVectors,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Guides: the steps across and up, and copies of an arrow' },
    { tone: 1, label: 'u' },
    { tone: 2, label: 'v' },
    { mark: 'found', label: 'The result: u + v, kv, a difference or the mean' },
    { mark: 'key', label: 'A point: where a copy starts, or a data point' },
  ],
  run,
  content: {
    idea: 'A vector is a move: so many steps across and so many up, written (x, y). It has a length and a direction but no fixed position, so the same arrow drawn anywhere is the same vector, and the arrow from P to Q is Q − P. Vectors add tip to tail (add the matching parts) and a number k stretches, shrinks or flips one (multiply every part by k).',
    invariant: 'u + v = v + u, and every multiple kv lies on the line through the origin and v. The length |v| = √(x² + y²) by Pythagoras, |kv| = |k| × |v|, and a length is never negative.',
    whenToUse: 'Anywhere a thing is described by a list of numbers: a position or velocity in a game, a pixel’s colour, a row of a dataset. Machine learning treats every example as a vector, so the mean of a dataset, the gap between two examples and a model’s weights are all built from adding and scaling vectors.',
    traits: [
      { label: 'A vector is a move, not a place', good: null },
      { label: 'Add part by part, tip to tail', good: null },
      { label: 'Scaling never changes the direction’s line', good: null },
    ],
    experiments: [
      { example: 'arrow', prompt: 'Drag P around: the copy of v moves, but its parts and length never change.' },
      { example: 'add', prompt: 'Drag u so it points the opposite way to v. How long is u + v now?' },
      { example: 'scale', prompt: 'Try scale 2 1 k=0: what is left of the arrow?' },
      { example: 'length', prompt: 'Predict the length of (−4, 3) before you type length -4 3.' },
      { example: 'data', prompt: 'Drag one student far away from the others and watch the mean follow it.' },
    ],
  },
});

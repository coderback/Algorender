import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import type { Handle, Mat2, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';
import {
  add,
  ask,
  blend,
  col1,
  col2,
  det,
  ENTRY_MAX,
  entries,
  IDENTITY,
  matrixCustom,
  plotFrame,
  scale,
  transpose,
  type MatrixInput,
} from './shared';

const EXTENT = 5;
const STEPS = [0.25, 0.5, 0.75, 1];
const DEFAULT_V: Vec = [1, 2];

const pseudocode = [
  'A = [a b; c d]',
  'v = x·î + y·ĵ',
  'A·î = (a, c)        first column',
  'A·ĵ = (b, d)        second column',
  'A·v = x·(A·î) + y·(A·ĵ)',
  'det A = ad − bc     area scale',
];

type Stage = {
  /** How far the grid has moved towards A. */
  t: number;
  /** Where î and ĵ are drawn (they may land before the grid moves). */
  i: Vec;
  j: Vec;
  handles: { i: boolean; j: boolean; v: boolean };
  square?: boolean;
};

function scene({ m, v }: MatrixInput, s: Stage): PlotPart[] {
  const grid = blend(m, s.t);
  const vNow = apply(grid, v);
  // v as x steps along the current î, then y steps along the current ĵ.
  const along = scale(v[0], apply(grid, [1, 0]));
  const shapes: Shape[] = [];
  if (s.square) {
    const a = col1(m);
    const b = col2(m);
    shapes.push(
      { kind: 'path', id: 'unit', points: [[0, 0], [1, 0], [1, 1], [0, 1]], closed: true, dashed: true, faint: true },
      { kind: 'path', id: 'square', points: [[0, 0], a, add(a, b), b], closed: true, fill: true, mark: 'key' },
      { kind: 'label', id: 'area', at: scale(0.5, add(a, b)), text: `area ${fmt(Math.abs(det(m)))}` },
    );
  }
  shapes.push(
    { kind: 'path', id: 'steps', points: [[0, 0], along, vNow], dashed: true, faint: true },
    { kind: 'vector', id: 'v', from: [0, 0], to: vNow, label: s.t === 1 ? 'Av' : 'v' },
    { kind: 'vector', id: 'i', from: [0, 0], to: s.i, tone: 1, label: 'î' },
    { kind: 'vector', id: 'j', from: [0, 0], to: s.j, tone: 2, label: 'ĵ' },
  );
  const handle = (id: string, at: Vec, label: string, tone?: 1 | 2): Handle => ({ id, at, label, tone, step: 0.5, min: -ENTRY_MAX, max: ENTRY_MAX });
  const handles: Handle[] = [];
  if (s.handles.v) handles.push(handle('v', v, 'v'));
  if (s.handles.i) handles.push(handle('i', col1(m), 'Where î lands', 1));
  if (s.handles.j) handles.push(handle('j', col2(m), 'Where ĵ lands', 2));

  const plane: PlanePart = {
    kind: 'plane',
    id: 'plane',
    label: 'The plane under A',
    x: { min: -EXTENT, max: EXTENT },
    y: { min: -EXTENT, max: EXTENT },
    equal: true,
    warp: s.t > 0 ? grid : IDENTITY,
    shapes,
    handles,
  };
  const [a, b, c, d] = entries(m);
  return [
    plane,
    { kind: 'matrix', id: 'A', name: 'A', label: 'The matrix A', cols: [{ values: [a, c], tone: 1 }, { values: [b, d], tone: 2 }] },
    {
      kind: 'readouts',
      id: 'readouts',
      label: 'Values',
      items: [
        { id: 'v', label: 'v', value: fmtVec(v) },
        ...(s.t > 0 ? [{ id: 'av', label: s.t === 1 ? 'Av' : 'v now', value: fmtVec(vNow) }] : []),
        ...(s.square ? [{ id: 'det', label: 'det A', value: fmt(det(m)), mark: 'key' as const }] : []),
      ],
    },
  ];
}

function* run(input: MatrixInput): Generator<Frame<PlotState>> {
  const { m, v } = input;
  const [a, b, c, d] = m;
  const i = col1(m);
  const j = col2(m);
  const av = apply(m, v);
  const D = det(m);
  const vars = { a, b, c, d, x: v[0], y: v[1] };
  const none = { i: false, j: false, v: true };

  yield plotFrame(scene(input, { t: 0, i: [1, 0], j: [0, 1], handles: none }), {
    line: 1,
    note: `A matrix moves the whole plane. Every vector is a mix of the basis vectors: v = ${fmtVec(v)} is ${steps(v[0])} along î = (1, 0) plus ${fmt(v[1])} along ĵ = (0, 1).`,
    vars,
    checkpoint: ask(`Where does A = [${fmt(a)} ${fmt(b)}; ${fmt(c)} ${fmt(d)}] send î = (1, 0)?`, fmtVec(i), [fmtVec([a, b]), fmtVec(j), fmtVec([c, d])]),
  });

  yield plotFrame(scene(input, { t: 0, i, j: [0, 1], handles: { ...none, i: true } }), {
    line: 2,
    note: `A·î picks out the first column of A, so î lands on ${fmtVec(i)}. Columns, not rows: that is the whole trick of reading a matrix.`,
    vars,
    checkpoint: ask('And where does ĵ = (0, 1) land?', fmtVec(j), [fmtVec([c, d]), fmtVec([a, b]), fmtVec(i)]),
  });

  yield plotFrame(scene(input, { t: 0, i, j, handles: { i: true, j: true, v: true } }), {
    line: 3,
    note: `ĵ lands on the second column, ${fmtVec(j)}. Drag either tip to change A.`,
    vars,
    checkpoint: ask(`So where does v = ${fmtVec(v)} land?`, fmtVec(av), [fmtVec(apply(transpose(m), v)), fmtVec(v), fmtVec([a * v[0], d * v[1]])]),
  });

  for (const t of STEPS) {
    const g = blend(m, t);
    const notes: Record<number, string> = {
      0.25: 'Now the whole grid moves at once. Lines stay straight, parallel and evenly spaced, and the origin stays put: that is what makes the map linear.',
      0.5: `Halfway, every point has gone half of the way to where A sends it: v is at ${fmtVec(apply(g, v))}.`,
      0.75: `v rides along with the grid: it is still ${steps(v[0])} along the moving î and ${fmt(v[1])} along the moving ĵ.`,
      1: `v lands at ${fmt(v[0])}·${fmtVec(i)} + ${fmt(v[1])}·${fmtVec(j)} = ${fmtVec(av)}. Where î and ĵ land decides where every vector goes.`,
    };
    yield plotFrame(scene(input, { t, i: col1(g), j: col2(g), handles: { i: t === 1, j: t === 1, v: false } }), {
      line: 4,
      note: notes[t],
      vars: { ...vars, t },
      checkpoint:
        t === 1
          ? ask('The unit square has area 1. What does A turn its area into, sign included?', fmt(D), [fmt(-D), fmt(a * d + b * c), fmt(a * d), fmt(a + d)])
          : undefined,
    });
  }

  const flat = Math.abs(D) < 1e-9;
  yield plotFrame(scene(input, { t: 1, i, j, handles: { i: true, j: true, v: false }, square: true }), {
    line: 5,
    note: flat
      ? `det A = ${fmt(a)}·${fmt(d)} − ${fmt(b)}·${fmt(c)} = 0: the square is squashed flat, so A crushes the plane onto a line (or a point) and can't be undone.`
      : D < 0
        ? `det A = ${fmt(a)}·${fmt(d)} − ${fmt(b)}·${fmt(c)} = ${fmt(D)}: areas grow by ${fmt(Math.abs(D))}, and the minus sign means the plane was flipped over, so ĵ now sits clockwise from î.`
        : `det A = ${fmt(a)}·${fmt(d)} − ${fmt(b)}·${fmt(c)} = ${fmt(D)}: the unit square became a parallelogram of area ${fmt(D)}, and every shape's area is scaled by the same factor.`,
    vars: { ...vars, det: D },
  });

  yield plotFrame(scene(input, { t: 1, i, j, handles: { i: true, j: true, v: false }, square: true }), {
    line: 0,
    note: `A sends î to ${fmtVec(i)}, ĵ to ${fmtVec(j)} and v to ${fmtVec(av)}, and ${
      flat ? 'squashes the plane flat' : D < 0 ? `scales areas by ${fmt(-D)} while flipping the plane over` : `scales areas by ${fmt(D)}`
    }. Drag î or ĵ and watch the grid and the determinant follow.`,
    vars: { ...vars, det: D },
  });
}

const steps = (n: number) => `${fmt(n)} ${Math.abs(n) === 1 ? 'step' : 'steps'}`;

const fixed = (id: string, label: string, m: Mat2) => ({ id, label, make: () => ({ m, v: DEFAULT_V }), sized: false });

export const linearTransformations = defineAlgorithm<MatrixInput, PlotState>({
  kind: 'algorithm',
  slug: 'linear-transformations',
  view: 'plot',
  input: {
    examples: [
      fixed('stretch-shear', 'Stretch and shear', [2, 1, 0, 1]),
      fixed('rotation', 'Rotate 90°', [0, -1, 1, 0]),
      fixed('shear', 'Shear', [1, 1, 0, 1]),
      fixed('flip', 'Swap the axes', [0, 1, 1, 0]),
      fixed('squash', 'Squash flat', [1, 2, 0.5, 1]),
      {
        id: 'random',
        label: 'Random',
        sized: false,
        make: ({ seed }) => {
          const rng = createRng(seed);
          const entry = () => (Math.floor(rng() * 9) - 4) / 2;
          return { m: [entry(), entry(), entry(), entry()], v: DEFAULT_V };
        },
      },
    ],
    custom: matrixCustom(DEFAULT_V),
    drag: (input, handle, to) => {
      const [a, b, c, d] = input.m;
      if (handle === 'i') return { ...input, m: [to[0], b, to[1], d] };
      if (handle === 'j') return { ...input, m: [a, to[0], c, to[1]] };
      return { ...input, v: to };
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { tone: 1, label: 'î = (1, 0), then where it lands' },
    { tone: 2, label: 'ĵ = (0, 1), then where it lands' },
    { neutral: 'v, the vector we follow' },
    { mark: 'key', label: 'The unit square after A' },
  ],
  run,
  content: {
    idea: 'A 2×2 matrix is a way of moving the whole plane. Its first column is where î = (1, 0) lands and its second is where ĵ = (0, 1) lands; every other vector is a mix of î and ĵ, so it lands on the same mix of their images.',
    invariant: 'A·(x·î + y·ĵ) = x·(A·î) + y·(A·ĵ): grid lines stay straight, parallel and evenly spaced, and the origin never moves. Every area is multiplied by the same number, det A = ad − bc.',
    whenToUse: 'Whenever data is a list of numbers that gets mixed linearly: rotating and scaling graphics, changing coordinates, a layer of a neural network before its activation. Reading a matrix by its columns tells you at a glance what it does to space.',
    traits: [
      { label: 'Columns are where î and ĵ land', good: null },
      { label: 'Lines stay lines', good: null },
      { label: 'det = 0 means it can’t be undone', good: null },
    ],
    experiments: [
      { example: 'shear', prompt: 'A shear slides the plane sideways. The square leans over, yet its area stays 1: det = 1·1 − 1·0.' },
      { example: 'flip', prompt: 'Swapping the axes is a mirror. det = −1: the area is unchanged, but ĵ ends up clockwise from î.' },
      { example: 'squash', prompt: 'The columns (1, 0.5) and (2, 1) point the same way, so the whole plane collapses onto one line and det = 0.' },
      { example: 'rotation', prompt: 'Predict where v = (1, 2) goes under a quarter turn before you step: (−2, 1).' },
    ],
  },
});

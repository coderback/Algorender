import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { apply, fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Handle, Mat2, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { ask, blend, col1, col2, dot, eigenvalues, eigenvector, ENTRY_MAX, entries, IDENTITY, matrixOnlyCustom, plotFrame, scale } from './shared';

const EXTENT = 5;
/** Length of the swept vector v. */
const R = 1.5;
const SWEEP_DEG = 15;

const pseudocode = [
  'for each direction v around the circle:',
  '  w ← A·v',
  '  if w lies on the line through v:',
  '    v is an eigenvector: A·v = λ·v',
  'apply A to the whole plane:',
  '  eigen lines stay put, stretched by λ',
];

type Eigen = { lambda: number; dir: Vec; deg: number };

/** Real eigen directions of m, by angle in [0°, 180°). A multiple of the identity has every direction. */
function eigenDirections(m: Mat2): Eigen[] | 'all' {
  const [a, b, c, d] = m;
  if (Math.abs(b) < 1e-12 && Math.abs(c) < 1e-12 && Math.abs(a - d) < 1e-12) return 'all';
  const found: Eigen[] = [];
  for (const lambda of eigenvalues(m)) {
    const dir = eigenvector(m, lambda);
    const deg = (((Math.atan2(dir[1], dir[0]) * 180) / Math.PI) % 180 + 180) % 180;
    if (!found.some((e) => Math.abs(e.deg - deg) < 1e-6)) found.push({ lambda, dir, deg });
  }
  return found.sort((x, y) => x.deg - y.deg);
}

const unit = (deg: number): Vec => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

function circle(m: Mat2 | null): Vec[] {
  return Array.from({ length: 73 }, (_, k) => {
    const p = scale(R, unit(k * 5));
    return m ? apply(m, p) : p;
  });
}

function readouts(items: Readout[]): PlotPart {
  return { kind: 'readouts', id: 'readouts', label: 'Values', items };
}

function matrixPart(m: Mat2): PlotPart {
  const [a, b, c, d] = entries(m);
  return { kind: 'matrix', id: 'A', name: 'A', label: 'The matrix A', cols: [{ values: [a, c], tone: 1 }, { values: [b, d], tone: 2 }] };
}

function plane(shapes: Shape[], opts: { warp?: Mat2; handles?: Handle[] } = {}): PlanePart {
  return {
    kind: 'plane',
    id: 'plane',
    label: 'Directions v and their images A·v',
    x: { min: -EXTENT, max: EXTENT },
    y: { min: -EXTENT, max: EXTENT },
    equal: true,
    warp: opts.warp ?? IDENTITY,
    shapes,
    handles: opts.handles ?? [],
  };
}

function eigenLines(found: readonly Eigen[]): Shape[] {
  return found.map((e, k) => ({ kind: 'line', id: `eig${k}`, through: [0, 0], dir: e.dir, mark: 'found', dashed: true, label: `λ = ${fmt(e.lambda)}` }));
}

function* run(m: Mat2): Generator<Frame<PlotState>> {
  const [a, b, c, d] = m;
  const eig = eigenDirections(m);
  const all = eig === 'all';
  const list = all ? [] : eig;
  const vars = { a, b, c, d };
  // The sweep's round angles, with each eigen angle added (replacing a round one within half a degree of it).
  const sweep = Array.from({ length: 180 / SWEEP_DEG }, (_, k) => k * SWEEP_DEG).filter((deg) => !list.some((e) => Math.abs(e.deg - deg) < 0.5));
  const degs = [...sweep, ...list.map((e) => e.deg)].sort((x, y) => x - y);
  const isEigen = (deg: number) => all || list.some((e) => Math.abs(e.deg - deg) < 1e-6);
  const base: Shape[] = [
    { kind: 'path', id: 'circle', points: circle(null), faint: true },
    { kind: 'path', id: 'ellipse', points: circle(m), faint: true, dashed: true },
  ];

  yield plotFrame([plane([...base, { kind: 'vector', id: 'v', from: [0, 0], to: [R, 0], label: 'v' }]), matrixPart(m)], {
    line: 0,
    note: 'Most vectors get knocked off their own line by A. An eigenvector is one that A only stretches, flips or shrinks: A·v = λ·v. Sweep v around the circle and watch where A·v points.',
    vars,
    checkpoint: ask('Will A·v for v = (1, 0) stay on v’s own line (the x-axis)?', isEigen(0) ? 'Yes' : 'No', ['Yes', 'No']),
  });

  const passed: Eigen[] = [];
  for (let k = 0; k < degs.length; k++) {
    const deg = degs[k];
    const v = scale(R, unit(deg));
    const w = apply(m, v);
    const hit = isEigen(deg);
    const lambda = dot(w, v) / dot(v, v);
    if (hit && !all) passed.push(list.find((e) => Math.abs(e.deg - deg) < 1e-6)!);
    const next = degs[k + 1];
    const shapes: Shape[] = [
      ...base,
      ...eigenLines(passed),
      { kind: 'line', id: 'span', through: [0, 0], dir: v, dashed: true },
      { kind: 'vector', id: 'v', from: [0, 0], to: v, label: 'v', mark: hit ? 'found' : null },
      { kind: 'vector', id: 'w', from: [0, 0], to: w, mark: hit ? 'found' : 'compare', label: 'A·v' },
    ];
    let note: string;
    if (!hit) {
      note = `At ${fmt(deg, 1)}°, A·v = ${fmtVec(w)} points off the line through v, so this v is not an eigenvector.`;
    } else if (Math.abs(lambda) < 1e-9) {
      note = `At ${fmt(deg, 1)}°, A·v = (0, 0) = 0·v: an eigenvector with λ = 0. A crushes this whole line to the origin, which is why det A = 0.`;
    } else {
      note = `At ${fmt(deg, 1)}°, A·v = ${fmtVec(w)} lies on v’s own line: v is an eigenvector, and A·v = ${fmt(lambda)}·v${lambda < 0 ? ', flipped to point the other way' : ''}.`;
      if (all) note = `A = ${fmt(a)}·I stretches every vector by ${fmt(a)}, so every direction is an eigen direction (λ = ${fmt(a)}).`;
    }
    yield plotFrame([plane(shapes), matrixPart(m), readouts([
      { id: 'angle', label: 'angle of v', value: `${fmt(deg, 1)}°` },
      { id: 'w', label: 'A·v', value: fmtVec(w) },
      ...(hit ? [{ id: 'lambda', label: 'λ', value: fmt(lambda), mark: 'found' as const }] : []),
    ])], {
      line: hit ? 3 : 2,
      note,
      vars: { ...vars, 'θ': round(deg, 1), ...(hit ? { 'λ': round(lambda, 2) } : {}) },
      checkpoint:
        next !== undefined && (isEigen(next) || k % 2 === 1)
          ? ask(`Will A·v stay on v’s line at ${fmt(next, 1)}°?`, isEigen(next) ? 'Yes' : 'No', ['Yes', 'No'])
          : undefined,
    });
  }

  const found = all ? [] : list;
  const summary = all
    ? `Every direction is an eigen direction: A just scales the plane by ${fmt(a)}.`
    : found.length === 0
      ? 'A·v never lined up with v: A turns every direction, so it has no real eigenvectors (its eigenvalues are complex).'
      : found.length === 1
        ? `Only one direction stays on its line, with λ = ${fmt(found[0].lambda)}. A has a repeated eigenvalue but just one eigen line, as a shear does.`
        : `Two eigen directions: λ = ${fmt(found[0].lambda)} and λ = ${fmt(found[1].lambda)}. They are the axes along which A acts like plain scaling.`;
  yield plotFrame([plane([...base, ...eigenLines(found)]), matrixPart(m)], {
    line: 3,
    note: summary,
    vars,
    checkpoint:
      found.length > 0
        ? ask('When A moves the whole plane, what happens to points on an eigen line?', 'They slide along it', ['They slide along it', 'They rotate off it', 'They stay exactly still'])
        : undefined,
  });

  for (const t of [0.5, 1]) {
    const g = blend(m, t);
    const handles: Handle[] =
      t === 1
        ? [
            { id: 'i', at: col1(m), label: 'Where î lands', tone: 1, step: 0.5, min: -ENTRY_MAX, max: ENTRY_MAX },
            { id: 'j', at: col2(m), label: 'Where ĵ lands', tone: 2, step: 0.5, min: -ENTRY_MAX, max: ENTRY_MAX },
          ]
        : [];
    const riders: Shape[] = found.map((e, k) => ({
      kind: 'point',
      id: `p${k}`,
      at: apply(g, scale(2, e.dir)),
      mark: 'found',
      size: 'lg',
    }));
    yield plotFrame(
      [
        plane(
          [
            ...eigenLines(found),
            ...riders,
            { kind: 'vector', id: 'i', from: [0, 0], to: col1(g), tone: 1, label: 'î' },
            { kind: 'vector', id: 'j', from: [0, 0], to: col2(g), tone: 2, label: 'ĵ' },
          ],
          { warp: g, handles },
        ),
        matrixPart(m),
        readouts(found.map((e, k) => ({ id: `l${k}`, label: `λ${k + 1}`, value: fmt(e.lambda), mark: 'found' as const }))),
      ],
      {
        line: t === 1 ? 5 : 4,
        note:
          t === 1
            ? found.length > 0
              ? `The grid twisted, but each eigen line stayed where it was: its points just slid along it, scaled by λ. Drag î or ĵ to change A and see the eigen lines move.`
              : 'With no real eigenvectors, no line through the origin survives: every direction is turned. Drag î or ĵ to change A.'
            : 'Now apply A to the whole plane at once.',
        vars: { ...vars, t },
      },
    );
  }
}

const fixed = (id: string, label: string, m: Mat2) => ({ id, label, make: () => m, sized: false });

export const eigenvectors = defineAlgorithm<Mat2, PlotState>({
  kind: 'algorithm',
  slug: 'eigenvectors',
  view: 'plot',
  input: {
    examples: [
      fixed('symmetric', 'Symmetric', [2, 1, 1, 2]),
      fixed('stretch', 'Stretch the axes', [2, 0, 0, 0.5]),
      fixed('shear', 'Shear', [1, 1, 0, 1]),
      fixed('rotation', 'Rotation', [0, -1, 1, 0]),
      fixed('flip', 'Reflection', [0, 1, 1, 0]),
      fixed('singular', 'Squash flat', [1, 2, 0.5, 1]),
      {
        id: 'random',
        label: 'Random',
        sized: false,
        make: ({ seed }) => {
          const rng = createRng(seed);
          const entry = () => (Math.floor(rng() * 7) - 3) / 2;
          return [entry(), entry(), entry(), entry()];
        },
      },
    ],
    custom: matrixOnlyCustom,
    drag: (m, handle, to) => (handle === 'i' ? [to[0], m[1], to[1], m[3]] : [m[0], to[0], m[2], to[1]]),
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'v, sweeping around the circle' },
    { mark: 'compare', label: 'A·v, off v’s line' },
    { mark: 'found', label: 'Eigenvector: A·v = λ·v' },
    { tone: 1, label: 'î after A' },
    { tone: 2, label: 'ĵ after A' },
  ],
  run,
  content: {
    idea: 'Most vectors get turned by a matrix. An eigenvector is a direction it leaves alone: A only stretches, shrinks or flips it, A·v = λ·v. Sweep a vector around the circle and the eigenvectors are where A·v lines up with v.',
    invariant: 'Points on an eigen line stay on it under A, multiplied by λ. Away from those lines, A·v leaves v’s line. Eigenvalues multiply to det A and add up to a + d.',
    whenToUse: 'Whenever a transformation is applied again and again: eigenvectors are the directions that survive (Markov chains settle along one, PageRank is one, and repeated multiplication blows up or dies along them). PCA finds the eigenvectors of a covariance matrix to get the directions of most spread.',
    traits: [
      { label: 'A·v = λ·v', good: null },
      { label: 'Rotations have none (real)', good: null },
      { label: 'Symmetric matrices: perpendicular ones', good: true },
    ],
    experiments: [
      { example: 'symmetric', prompt: 'A symmetric matrix has two eigen directions at right angles, here 45° (λ = 3) and 135° (λ = 1).' },
      { example: 'shear', prompt: 'A shear has only one eigen line, the x-axis. Watch A·v lean right of every other direction.' },
      { example: 'rotation', prompt: 'A quarter turn moves every direction, so A·v never lines up with v.' },
      { example: 'singular', prompt: 'One eigenvalue is 0: a whole line is crushed onto the origin, which is why det A = 0.' },
    ],
  },
});

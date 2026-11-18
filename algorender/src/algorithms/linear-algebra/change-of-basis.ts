import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { apply, fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Handle, Mat2, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { add, col1, col2, det, eigenvalues, eigenvector, ENTRY_MAX, entries, IDENTITY, scale } from './shared';

// Change of basis: a vector is one arrow, but its coordinates depend on the
// ruler. In the standard basis v = x·î + y·ĵ; in a basis b₁, b₂ the same
// arrow is v = c₁·b₁ + c₂·b₂ = P·c, where P has b₁ and b₂ as its columns. So
// P turns new coordinates into standard ones, and P⁻¹ turns them back (only
// when b₁ and b₂ don't lie on one line, det P ≠ 0). In its own eigenbasis a
// matrix just stretches: D = P⁻¹AP is diagonal, and A = P·D·P⁻¹.

export type CobInput = { story: 'coords'; b1: Vec; b2: Vec; v: Vec } | { story: 'back'; b1: Vec; b2: Vec; c: Vec } | { story: 'eigenbasis'; m: Mat2 };
export type Story = CobInput['story'];
const STORIES: readonly Story[] = ['coords', 'back', 'eigenbasis'];

/** How far the plane reaches each way, and the limits on what a learner may choose. */
const EXTENT = 5;
export const LIMITS = { basis: 3, v: 4, c: 3, minDet: 0.5 } as const;

const pseudocode = [
  'standard basis: î = (1, 0), ĵ = (0, 1)',
  'v = x·î + y·ĵ   →  coordinates (x, y)',
  'new basis b₁, b₂;  P = [b₁ b₂]',
  'v = c₁·b₁ + c₂·b₂ = P·c',
  'c = P⁻¹·v   (needs det P ≠ 0)',
  'new → standard:  v = P·c',
  'A·bᵢ = λᵢ·bᵢ  (eigenbasis)',
  'D = P⁻¹·A·P,  A = P·D·P⁻¹',
];

// ───────────────────────────── the maths ─────────────────────────────

/** The matrix with b₁ and b₂ as its columns. */
export const basisMatrix = (b1: Vec, b2: Vec): Mat2 => [b1[0], b2[0], b1[1], b2[1]];

/** The inverse of a 2×2 matrix, (1/det)·[[d, −b], [−c, a]], or null when det = 0. */
export function inverse2(m: Mat2): Mat2 | null {
  const D = det(m);
  if (Math.abs(D) < 1e-12) return null;
  const [a, b, c, d] = m;
  return [d / D, -b / D, -c / D, a / D];
}

/** The coordinates c of v in the basis b₁, b₂: v = c₁·b₁ + c₂·b₂ (Cramer's rule). */
export function coordsIn(b1: Vec, b2: Vec, v: Vec): Vec {
  const D = b1[0] * b2[1] - b2[0] * b1[1];
  return [(v[0] * b2[1] - b2[0] * v[1]) / D, (b1[0] * v[1] - v[0] * b1[1]) / D];
}

/** The standard coordinates of the vector with coordinates c in the basis b₁, b₂: c₁·b₁ + c₂·b₂. */
export const fromCoords = (b1: Vec, b2: Vec, c: Vec): Vec => add(scale(c[0], b1), scale(c[1], b2));

const mul2 = ([a, b, c, d]: Mat2, [e, f, g, h]: Mat2): Mat2 => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];

export type Eigenbasis = { lambdas: [number, number]; b1: Vec; b2: Vec };

/**
 * Two eigen directions of m, each scaled so its bigger part is ±1 (whole
 * numbers when they can be), with their stretches, biggest first. Null unless
 * m has two different real eigenvalues.
 */
export function eigenbasisOf(m: Mat2): Eigenbasis | null {
  const ls = eigenvalues(m);
  if (ls.length !== 2 || Math.abs(ls[0] - ls[1]) < 1e-9) return null;
  const nice = (v: Vec): Vec => {
    const k = Math.max(Math.abs(v[0]), Math.abs(v[1]));
    return [round(v[0] / k, 9), round(v[1] / k, 9)];
  };
  return { lambdas: [ls[0], ls[1]], b1: nice(eigenvector(m, ls[0])), b2: nice(eigenvector(m, ls[1])) };
}

/** D = P⁻¹AP for the eigenbasis: diagonal, with the stretches on its diagonal. */
export function diagonalised(m: Mat2, e: Eigenbasis): Mat2 {
  const P = basisMatrix(e.b1, e.b2);
  return mul2(mul2(inverse2(P)!, m), P);
}

// ───────────────────────────── drawing ─────────────────────────────

/** A number in a product, bracketed when negative: (−1)·1. */
const par = (x: number) => (x < 0 ? `(${fmt(x)})` : fmt(x));
const r2 = (v: Vec): Vec => [round(v[0]), round(v[1])];

function matrixPart(id: string, name: string, label: string, m: Mat2, toned = true): PlotPart {
  const [a, b, c, d] = entries(m);
  return { kind: 'matrix', id, name, label, cols: [{ values: [a, c], ...(toned && { tone: 1 as const }) }, { values: [b, d], ...(toned && { tone: 2 as const }) }] };
}

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });

function plane(label: string, warp: Mat2, shapes: Shape[], handles: Handle[] = [], id = 'plane'): PlanePart {
  return { kind: 'plane', id, label, x: { min: -EXTENT, max: EXTENT }, y: { min: -EXTENT, max: EXTENT }, equal: true, warp, shapes, handles };
}

const hnd = (id: string, at: Vec, label: string, lim: number, tone?: 1 | 2): Handle => ({ id, at, label, ...(tone && { tone }), step: 0.5, min: [-lim, -lim], max: [lim, lim] });

const basisArrows = (b1: Vec, b2: Vec, names: [string, string] = ['b₁', 'b₂']): Shape[] => [
  { kind: 'vector', id: 'b1', from: [0, 0], to: r2(b1), tone: 1, label: names[0] },
  { kind: 'vector', id: 'b2', from: [0, 0], to: r2(b2), tone: 2, label: names[1] },
];

/** v as c₁ steps along b₁ (from the origin), then c₂ steps along b₂: two toned dashed arrows. */
function steps(b1: Vec, b2: Vec, c: Vec, prefix = 's'): Shape[] {
  const mid = scale(c[0], b1);
  return [
    { kind: 'vector', id: `${prefix}1`, from: [0, 0], to: r2(mid), tone: 1, dashed: true, label: `${fmt(c[0])}·b₁` },
    { kind: 'vector', id: `${prefix}2`, from: r2(mid), to: r2(add(mid, scale(c[1], b2))), tone: 2, dashed: true, label: `${fmt(c[1])}·b₂` },
  ];
}

const vArrow = (v: Vec, label = 'v'): Shape => ({ kind: 'vector', id: 'v', from: [0, 0], to: r2(v), label });
const STD = basisArrows([1, 0], [0, 1], ['î', 'ĵ']);
const stdSteps = (v: Vec): Shape => ({ kind: 'path', id: 'std', points: [[0, 0], r2([v[0], 0]), r2(v)], dashed: true, faint: true });

// ───────────────────────────── 1. coordinates in a new basis ─────────────────────────────

function* coords(b1: Vec, b2: Vec, v: Vec): Generator<Frame<PlotState>> {
  const P = basisMatrix(b1, b2);
  const Pinv = inverse2(P)!;
  const c = coordsIn(b1, b2, v);
  const D = det(P);
  const vars = { 'b₁': `(${fmt(b1[0])}, ${fmt(b1[1])})`, 'b₂': `(${fmt(b2[0])}, ${fmt(b2[1])})`, v: fmtVec(v) };
  const handles = (withBasis: boolean) => [hnd('v', v, 'v', LIMITS.v), ...(withBasis ? [hnd('b1', b1, 'b₁', LIMITS.basis, 1), hnd('b2', b2, 'b₂', LIMITS.basis, 2)] : [])];
  const std = readouts([{ id: 'v', label: 'v in the standard basis', value: fmtVec(v) }]);
  const both = (extra: Readout[] = []) =>
    readouts([{ id: 'v', label: 'v in the standard basis', value: fmtVec(v) }, { id: 'c', label: 'v in the basis b₁, b₂', value: fmtVec(c), mark: 'found' }, ...extra]);

  yield plotFrame([plane('The standard grid', IDENTITY, [...STD, stdSteps(v), vArrow(v)], handles(false)), std], {
    line: 1,
    note: `v = ${fmtVec(v)} means ${fmt(v[0])} steps along î = (1, 0) and ${fmt(v[1])} along ĵ = (0, 1). Those two numbers are v's coordinates in the standard basis: the ruler every graph uses by default.`,
    vars,
  });

  const wrongC1 = [fmt(v[0]), fmt(c[1]), fmt(c[0] + 1), fmt(c[0] - 1)];
  yield plotFrame([plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), vArrow(v)], handles(true)), std], {
    line: 2,
    note: `A different ruler: b₁ = ${fmtVec(b1)} and b₂ = ${fmtVec(b2)}. The grid drawn now is theirs: its lines are whole steps along b₁ and along b₂. In “Matrices move space” every arrow moved with the grid; here v stays put and only the grid behind it is redrawn. Drag b₁, b₂ or v.`,
    vars,
    checkpoint: ask('Write v = c₁·b₁ + c₂·b₂. How many steps along b₁ is c₁?', fmt(c[0]), wrongC1),
  });

  yield plotFrame([plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), ...steps(b1, b2, c), vArrow(v)], handles(true)), both()], {
    line: 3,
    note: `v = ${fmt(c[0])}·b₁ + ${fmt(c[1])}·b₂: ${fmt(c[0])} steps along b₁ reach ${fmtVec(scale(c[0], b1))}, then ${fmt(c[1])} along b₂ end on v's tip. So in this basis v's coordinates are c = ${fmtVec(c)}.`,
    vars: { ...vars, c: fmtVec(c) },
    checkpoint: ask('Stack b₁ and b₂ as the columns of a matrix P. What is P·c?', fmtVec(v), [fmtVec(c), fmtVec(apply([P[0], P[2], P[1], P[3]], c)), fmtVec(add(b1, b2))]),
  });

  yield plotFrame([plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), ...steps(b1, b2, c), vArrow(v)], handles(true)), matrixPart('P', 'P', 'P = [b₁ b₂]', P), both()], {
    line: 3,
    note: `P·c = ${fmt(c[0])}·b₁ + ${fmt(c[1])}·b₂ = ${fmtVec(v)}: P turns coordinates in the new basis into standard ones. (Each part of P·c is a row of P dotted with c.)`,
    vars: { ...vars, c: fmtVec(c) },
    checkpoint: askInOrder('To go the other way, from v to c, which matrix do you multiply v by?', ['P', 'P⁻¹', 'P with its columns swapped'], 'P⁻¹'),
  });

  const swapped = coordsIn(b2, b1, v);
  yield plotFrame(
    [
      plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), ...steps(b1, b2, c), vArrow(v)], handles(true)),
      matrixPart('P', 'P', 'P = [b₁ b₂]', P),
      matrixPart('Pinv', 'P⁻¹', 'Its inverse P⁻¹', Pinv, false),
      both([{ id: 'det', label: 'det P', value: fmt(D) }]),
    ],
    {
      line: 4,
      note: `P⁻¹ undoes P: det P = ${par(P[0])}·${par(P[3])} − ${par(P[1])}·${par(P[2])} = ${fmt(D)}, so P⁻¹ = (1/${fmt(D)})·[[${fmt(P[3])}, ${fmt(-P[1] + 0)}], [${fmt(-P[2] + 0)}, ${fmt(P[0])}]], and c = P⁻¹·v = ${fmtVec(c)}. That only works because det P isn't 0: b₁ and b₂ don't lie on one line, so every point has exactly one pair of coordinates.`,
      vars: { ...vars, c: fmtVec(c), 'det P': round(D, 4) },
      checkpoint: ask(`If you listed the basis the other way round, b₂ first, what would v's coordinates be?`, fmtVec(swapped), [fmtVec(c), fmtVec(v), fmtVec([-c[0], -c[1]]), fmtVec(add(c, [1, 1]))]),
    },
  );

  yield plotFrame(
    [
      plane('The standard grid', IDENTITY, [...STD, stdSteps(v), vArrow(v)], [], 'plane'),
      plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), ...steps(b1, b2, c, 't'), vArrow(v)], [], 'plane2'),
      both(),
    ],
    {
      line: 5,
      note: `One arrow, two descriptions: ${fmtVec(v)} on the standard grid and ${fmtVec(c)} on the grid of b₁ and b₂ (the order of the basis counts: swapped, the coordinates swap too). P converts the second into the first, P⁻¹ the first into the second.`,
      vars: { ...vars, c: fmtVec(c) },
    },
  );
}

// ───────────────────────────── 2. back to standard coordinates ─────────────────────────────

function* back(b1: Vec, b2: Vec, c: Vec): Generator<Frame<PlotState>> {
  const P = basisMatrix(b1, b2);
  const v = fromCoords(b1, b2, c);
  const vars = { 'b₁': `(${fmt(b1[0])}, ${fmt(b1[1])})`, 'b₂': `(${fmt(b2[0])}, ${fmt(b2[1])})`, c: fmtVec(c) };
  const handles = [hnd('b1', b1, 'b₁', LIMITS.basis, 1), hnd('b2', b2, 'b₂', LIMITS.basis, 2)];
  const reads = (known: boolean) => readouts([{ id: 'c', label: 'coordinates in the basis b₁, b₂', value: fmtVec(c) }, ...(known ? [{ id: 'v', label: 'standard coordinates', value: fmtVec(v), mark: 'found' as const }] : [])]);
  const mid = scale(c[0], b1);

  yield plotFrame([plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2)], handles), reads(false)], {
    line: 5,
    note: `On the grid of b₁ = ${fmtVec(b1)} and b₂ = ${fmtVec(b2)}, a vector has coordinates c = ${fmtVec(c)}: ${fmt(c[0])} steps along b₁ and ${fmt(c[1])} along b₂. Where is its tip on an ordinary graph?`,
    vars,
    checkpoint: ask('What are its standard coordinates?', fmtVec(v), [fmtVec(c), fmtVec(add(b1, b2)), fmtVec(fromCoords(b2, b1, c)), fmtVec(scale(c[0] + c[1], b1))]),
  });

  yield plotFrame([plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), ...steps(b1, b2, c), vArrow(v)], handles), reads(true)], {
    line: 3,
    note: `${fmt(c[0])}·b₁ = ${fmtVec(mid)}, then ${fmt(c[1])}·b₂ = ${fmtVec(scale(c[1], b2))} on top: the tip is at ${fmtVec(v)}.`,
    vars: { ...vars, v: fmtVec(v) },
    checkpoint: askInOrder('Which matrix turns c into v in one step?', ['P', 'P⁻¹', 'det P · P'], 'P'),
  });

  const [p, q, s, t] = P;
  yield plotFrame([plane('The grid of the basis b₁, b₂', P, [...basisArrows(b1, b2), ...steps(b1, b2, c), vArrow(v)], handles), matrixPart('P', 'P', 'P = [b₁ b₂]', P), reads(true)], {
    line: 5,
    note: `That is P·c, with b₁ and b₂ as P's columns. Row by row it is a dot product: ${fmt(p)}·${fmt(c[0])} + ${fmt(q)}·${fmt(c[1])} = ${fmt(v[0])} and ${fmt(s)}·${fmt(c[0])} + ${fmt(t)}·${fmt(c[1])} = ${fmt(v[1])}.`,
    vars: { ...vars, v: fmtVec(v) },
    checkpoint: ask('Add one more step along b₂: c becomes (c₁, c₂ + 1). Where is the tip now, in standard coordinates?', fmtVec(add(v, b2)), [fmtVec(add(v, [0, 1])), fmtVec(add(v, b1)), fmtVec(add(c, [0, 1])), fmtVec(add(v, scale(-1, b2)))]),
  });

  yield plotFrame([plane('The standard grid', IDENTITY, [...STD, stdSteps(v), vArrow(v)]), matrixPart('P', 'P', 'P = [b₁ b₂]', P), reads(true)], {
    line: 0,
    note: `One more step along b₂ adds ${fmtVec(b2)}, landing on ${fmtVec(add(v, b2))}: a step of the b-grid is a whole b-arrow. Now the standard grid is back, and the arrow v hasn't moved: it is ${fmt(v[0])}·î + ${fmt(v[1])}·ĵ = ${fmtVec(v)}. A basis is a choice of ruler, and P converts readings on the b-ruler into readings on the standard one.`,
    vars: { ...vars, v: fmtVec(v) },
  });
}

// ───────────────────────────── 3. the eigenbasis ─────────────────────────────

/** What A does to steps along one eigen direction, in words. */
function stepsChange(name: string, l: number): string {
  if (Math.abs(l) < 1e-9) return `steps along ${name} shrink to nothing`;
  const flip = l < 0 ? ' and point the other way' : '';
  if (Math.abs(Math.abs(l) - 1) < 1e-9) return `steps along ${name} stay the same length${flip}`;
  return `steps along ${name} become ${fmt(Math.abs(l))} times as long${flip}`;
}

const parallel = (u: Vec, v: Vec) => Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-9;

function* eigen(m: Mat2): Generator<Frame<PlotState>> {
  const e = eigenbasisOf(m)!;
  const { b1, b2 } = e;
  const [l1, l2] = e.lambdas;
  const P = basisMatrix(b1, b2);
  const D = diagonalised(m, e);
  const [a, b, c, d] = m;
  const vars = { a, b, c, d };
  const name = `[[${fmt(a)}, ${fmt(b)}], [${fmt(c)}, ${fmt(d)}]]`;
  const A = matrixPart('A', 'A', 'The matrix A', m);
  const Ab1 = apply(m, b1);
  const Ab2 = apply(m, b2);
  const lines: Shape[] = [
    { kind: 'line', id: 'e1', through: [0, 0], dir: r2(b1), mark: 'found', dashed: true, label: `λ = ${fmt(l1)}` },
    { kind: 'line', id: 'e2', through: [0, 0], dir: r2(b2), mark: 'found', dashed: true, label: `λ = ${fmt(l2)}` },
  ];

  const candidates: Vec[] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
    [1, 2],
    [2, 1],
    [1, -2],
    [2, -1],
  ];
  const wrongDirs = candidates.filter((v) => !parallel(v, b1) && !parallel(v, b2)).map((v) => fmtVec(v));
  yield plotFrame([plane('The standard grid under A', m, [...basisArrows(col1(m), col2(m), ['Aî', 'Aĵ'])]), A], {
    line: 0,
    note: `A = ${name} on the standard grid: î lands on ${fmtVec(col1(m))} and ĵ on ${fmtVec(col2(m))}. Every grid square is stretched and slanted, and the numbers in A don't say simply what it does.`,
    vars,
    checkpoint: ask('Which of these directions does A only stretch, without turning it?', fmtVec(b1), wrongDirs),
  });

  yield plotFrame(
    [
      plane('A only stretches two directions', IDENTITY, [
        ...lines,
        { kind: 'vector', id: 'Ab1', from: [0, 0], to: r2(Ab1), mark: 'compare', label: 'A·b₁' },
        { kind: 'vector', id: 'Ab2', from: [0, 0], to: r2(Ab2), mark: 'compare', label: 'A·b₂' },
        ...basisArrows(b1, b2),
      ]),
      A,
      readouts([
        { id: 'l1', label: `A·b₁ = λ₁·b₁`, value: `${fmtVec(Ab1)} = ${fmt(l1)}·${fmtVec(b1)}`, mark: 'found' },
        { id: 'l2', label: `A·b₂ = λ₂·b₂`, value: `${fmtVec(Ab2)} = ${fmt(l2)}·${fmtVec(b2)}`, mark: 'found' },
      ]),
    ],
    {
      line: 6,
      note: `b₁ = ${fmtVec(b1)}: A·b₁ = ${fmtVec(Ab1)} = ${fmt(l1)}·b₁. b₂ = ${fmtVec(b2)}: A·b₂ = ${fmtVec(Ab2)} = ${fmt(l2)}·b₂. Each stays on its own line, only stretched: these are A's eigenvectors. Take them as the basis.`,
      vars: { ...vars, 'λ₁': round(l1, 4), 'λ₂': round(l2, 4) },
      checkpoint: ask('A point has coordinates (1, 1) in the basis b₁, b₂. What are the coordinates of where A sends it, in the same basis?', fmtVec([l1, l2]), [
        fmtVec([1, 1]),
        fmtVec([l1, l1]),
        fmtVec([l1 + l2, l1 + l2]),
        fmtVec(apply(m, [1, 1])),
      ]),
    },
  );

  yield plotFrame([plane('The eigenbasis grid', P, [...lines, ...basisArrows(b1, b2)]), A, matrixPart('P', 'P', 'P = [b₁ b₂]', P)], {
    line: 6,
    note: `(${fmt(l1)}, ${fmt(l2)}): in this basis A multiplies the first coordinate by ${fmt(l1)} and the second by ${fmt(l2)}, nothing else. Here is the grid of b₁ and b₂ before A acts.`,
    vars: { ...vars, 'λ₁': round(l1, 4), 'λ₂': round(l2, 4) },
    checkpoint: ask('A point has coordinates (2, −1) in this basis. Where does A send it, in the same basis?', fmtVec([2 * l1, -l2]), [fmtVec([2, -1]), fmtVec([2 * l1, -l1]), fmtVec([2 * l2, -l1]), fmtVec(apply(m, [2, -1]))]),
  });

  const AP = mul2(m, P);
  yield plotFrame([plane('The eigenbasis grid after A', AP, [...lines, ...basisArrows(Ab1, Ab2, ['A·b₁', 'A·b₂'])]), A, matrixPart('P', 'P', 'P = [b₁ b₂]', P)], {
    line: 6,
    note: `${fmtVec([2 * l1, -l2])}: each coordinate is multiplied by its own stretch. On the picture, every line of the eigenbasis grid keeps its direction: ${stepsChange('b₁', l1)}, and ${stepsChange('b₂', l2)}. On this grid A is just two stretches.`,
    vars: { ...vars, 'λ₁': round(l1, 4), 'λ₂': round(l2, 4) },
    checkpoint: ask('So which matrix is A, written in the basis b₁, b₂?', `[[${fmt(l1)}, 0], [0, ${fmt(l2)}]]`, [name, `[[${fmt(l2)}, 0], [0, ${fmt(l1)}]]`, `[[${fmt(b1[0])}, ${fmt(b2[0])}], [${fmt(b1[1])}, ${fmt(b2[1])}]]`]),
  });

  yield plotFrame([plane('The eigenbasis grid after A', AP, [...lines, ...basisArrows(Ab1, Ab2, ['A·b₁', 'A·b₂'])]), A, matrixPart('P', 'P', 'P = [b₁ b₂]', P), matrixPart('D', 'D', 'D = P⁻¹AP', D, false)], {
    line: 7,
    note: `Written in the eigenbasis, A is D = P⁻¹AP = [[${fmt(D[0])}, ${fmt(D[1])}], [${fmt(D[2])}, ${fmt(D[3])}]]: its stretches on the diagonal and zeros elsewhere. Read A = P·D·P⁻¹ right to left: P⁻¹ changes to eigen coordinates, D stretches, P changes back.`,
    vars: { ...vars, 'λ₁': round(l1, 4), 'λ₂': round(l2, 4) },
    checkpoint: ask('Applying A ten times is P·D¹⁰·P⁻¹. What is on the diagonal of D¹⁰?', `${fmt(l1)}¹⁰ and ${fmt(l2)}¹⁰`, [`${fmt(10 * l1)} and ${fmt(10 * l2)}`, `${fmt(l1)} and ${fmt(l2)}`, `${fmt(l1 + 10)} and ${fmt(l2 + 10)}`]),
  });

  yield plotFrame([plane('The eigenbasis grid after A', AP, [...lines, ...basisArrows(Ab1, Ab2, ['A·b₁', 'A·b₂'])]), matrixPart('D', 'D', 'D = P⁻¹AP', D, false)], {
    line: 7,
    note: `Each coordinate just gets multiplied by its own λ ten times: ${fmt(l1)}¹⁰ and ${fmt(l2)}¹⁰. That is why the eigenbasis is the natural ruler for a matrix: powers, repeated steps and long-run behaviour become one number per direction.`,
    vars: { ...vars, 'λ₁': round(l1, 4), 'λ₂': round(l2, 4) },
  });
}

function* run(input: CobInput): Generator<Frame<PlotState>> {
  if (input.story === 'coords') yield* coords(input.b1, input.b2, input.v);
  else if (input.story === 'back') yield* back(input.b1, input.b2, input.c);
  else yield* eigen(input.m);
}

// ───────────────────────────── custom text and dragging ─────────────────────────────

const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const within = (v: Vec, lim: number) => v.every((x) => isHalf(x) && Math.abs(x) <= lim);
/** A basis the pictures can show: halves, and b₁, b₂ far enough from one line that coordinates stay readable. */
const goodBasis = (b1: Vec, b2: Vec) => within(b1, LIMITS.basis) && within(b2, LIMITS.basis) && Math.abs(det(basisMatrix(b1, b2))) >= LIMITS.minDet;
const onPlane = (v: Vec) => v.every((x) => Math.abs(x) <= EXTENT);

export function parseCob(text: string): { value: CobInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const story = STORIES.find((s) => s === word);
  if (!story) return { error: 'Start with coords, back or eigenbasis.' };
  const xs = numbersIn(text.slice(text.toLowerCase().indexOf(word) + word.length));
  if (story === 'eigenbasis') {
    if (xs.length !== 4) return { error: 'Give A as rows, e.g. eigenbasis [[2, 1], [1, 2]].' };
    if (!xs.every((x) => isHalf(x) && Math.abs(x) <= ENTRY_MAX)) return { error: `Use halves from −${ENTRY_MAX} to ${ENTRY_MAX}.` };
    const m: Mat2 = [xs[0], xs[1], xs[2], xs[3]];
    if (!eigenbasisOf(m)) return { error: 'Pick a matrix that stretches two different directions by different amounts (a turn or a shear has no eigenbasis).' };
    return { value: { story, m } };
  }
  if (xs.length !== 6) return { error: story === 'coords' ? 'Give b₁, b₂ and v, e.g. coords (2, 1), (-1, 1), v = (3, 3).' : 'Give b₁, b₂ and c, e.g. back (1, 1), (-1, 1), c = (3, 1).' };
  const b1: Vec = [xs[0], xs[1]];
  const b2: Vec = [xs[2], xs[3]];
  const w: Vec = [xs[4], xs[5]];
  if (!goodBasis(b1, b2)) return { error: `b₁ and b₂ take halves from −${LIMITS.basis} to ${LIMITS.basis}, and mustn't lie on (or nearly on) one line: |det P| ≥ ${LIMITS.minDet}.` };
  if (story === 'coords') {
    if (!within(w, LIMITS.v)) return { error: `v takes halves from −${LIMITS.v} to ${LIMITS.v}.` };
    return { value: { story, b1, b2, v: w } };
  }
  if (!within(w, LIMITS.c)) return { error: `c takes halves from −${LIMITS.c} to ${LIMITS.c}.` };
  if (!onPlane(fromCoords(b1, b2, w))) return { error: `That vector lands off the picture: keep c₁·b₁ + c₂·b₂ within ${EXTENT} of the origin.` };
  return { value: { story, b1, b2, c: w } };
}

const pair = (v: Vec) => `(${plain(v[0])}, ${plain(v[1])})`;
function format(input: CobInput): string {
  if (input.story === 'eigenbasis') {
    const [a, b, c, d] = input.m;
    return `eigenbasis [[${plain(a)}, ${plain(b)}], [${plain(c)}, ${plain(d)}]]`;
  }
  if (input.story === 'coords') return `coords ${pair(input.b1)}, ${pair(input.b2)}, v = ${pair(input.v)}`;
  return `back ${pair(input.b1)}, ${pair(input.b2)}, c = ${pair(input.c)}`;
}

const snapHalf = (x: number) => Math.round(x * 2) / 2 + 0;

export function dragCob(input: CobInput, id: string, to: Vec): CobInput {
  if (input.story === 'eigenbasis') return input;
  const t: Vec = [snapHalf(to[0]), snapHalf(to[1])];
  if (input.story === 'coords' && id === 'v') return within(t, LIMITS.v) ? { ...input, v: t } : input;
  if (id !== 'b1' && id !== 'b2') return input;
  const b1 = id === 'b1' ? t : input.b1;
  const b2 = id === 'b2' ? t : input.b2;
  if (!goodBasis(b1, b2)) return input;
  if (input.story === 'back' && !onPlane(fromCoords(b1, b2, input.c))) return input;
  return { ...input, b1, b2 };
}

const example = (id: string, label: string, input: CobInput) => ({ id, label, make: () => input, sized: false });

export const changeOfBasis = defineAlgorithm<CobInput, PlotState>({
  kind: 'algorithm',
  slug: 'change-of-basis',
  view: 'plot',
  input: {
    examples: [
      example('coords', 'One arrow, two sets of coordinates', { story: 'coords', b1: [2, 1], b2: [-1, 1], v: [3, 3] }),
      example('back', 'From the new basis back to the standard one', { story: 'back', b1: [1, 1], b2: [-1, 1], c: [3, 1] }),
      example('eigenbasis', 'In its eigenbasis, A only stretches', { story: 'eigenbasis', m: [2, 1, 1, 2] }),
    ],
    custom: {
      label: 'coords b₁, b₂, v = …; back b₁, b₂, c = …; or eigenbasis A (halves)',
      placeholder: 'e.g. coords (2, 1), (-1, 1), v = (3, 3)',
      parse: parseCob,
      format,
    },
    drag: dragCob,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'v, the arrow being described, and the standard grid' },
    { tone: 1, label: 'b₁ (or î) and the steps taken along it' },
    { tone: 2, label: 'b₂ (or ĵ) and the steps taken along it' },
    { mark: 'found', label: 'The coordinates found, and the eigen directions A only stretches' },
    { mark: 'compare', label: 'Where A sends an eigenvector' },
  ],
  run,
  content: {
    idea: 'A basis is a choice of ruler: two arrows b₁, b₂ that every vector is measured against, v = c₁·b₁ + c₂·b₂. The arrow stays put; only its coordinates change. With b₁ and b₂ as the columns of P, v = P·c, so P turns new coordinates into standard ones and P⁻¹ turns them back.',
    invariant: 'P·c = v and c = P⁻¹·v, which needs det P ≠ 0 (b₁ and b₂ not on one line). In a basis of eigenvectors a matrix only stretches: D = P⁻¹AP is diagonal with the eigenvalues on it, and A = P·D·P⁻¹.',
    whenToUse: 'Describing data in better axes (principal components), working with a matrix in its eigenbasis to take powers or predict long-run behaviour, switching between pixel, world and camera coordinates in graphics, and reading what a learned layer’s directions mean.',
    traits: [
      { label: 'Same arrow, new numbers', good: null },
      { label: 'P: new → standard; P⁻¹: standard → new', good: null },
      { label: 'Eigenbasis: the matrix becomes diagonal', good: true },
    ],
    experiments: [
      { example: 'coords', prompt: 'Drag v until both of its new coordinates are whole numbers. Where does it sit on the b-grid?' },
      { example: 'coords', prompt: 'Drag b₂ towards b₁’s line and watch the coordinates grow: how close can it get before the basis stops working?' },
      { example: 'back', prompt: 'Swap b₁ and b₂ by dragging. Which standard coordinates change, and which numbers of c would you need to swap to get back?' },
      { example: 'eigenbasis', prompt: 'Try eigenbasis [[3, 1], [0, 2]]. Its eigen directions aren’t at right angles, yet A is still diagonal on their grid.' },
    ],
  },
});

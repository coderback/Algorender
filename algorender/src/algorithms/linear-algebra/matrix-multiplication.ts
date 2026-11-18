import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import type { Handle, ImageBox, ImagePart, Mat2, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { col1, col2, ENTRY_MAX, entries, IDENTITY } from './shared';

// Matrix multiplication: each cell of C = AB is a row of A dotted with a
// column of B, so an m×n matrix times an n×p one is m×p, and it takes m·n·p
// multiplications (n³ for two n×n matrices). As transformations, AB means
// "do B, then A": each column of AB is A applied to a column of B, and doing
// them in the other order usually moves the plane somewhere else, so AB ≠ BA.

export type Matrix = readonly (readonly number[])[];
export type MatMulInput = { story: 'cells'; A: Matrix; B: Matrix } | { story: 'compose'; A: Mat2; B: Mat2 };
export type Story = MatMulInput['story'];

export const LIMITS = { size: 4, entry: 9 } as const;
/** On-screen size of one matrix cell, in px. */
const CELL_PX = 46;

const pseudocode = [
  'A is m×n, B is n×p  →  C = AB is m×p',
  'for each row i of A:',
  '  for each column j of B:',
  '    Cᵢⱼ ← row i of A · column j of B',
  '    (n products, added up)',
  'AB·v = A(B·v): first B, then A',
  'column j of AB = A · (column j of B)',
  'AB ≠ BA, in general',
];

export const shape = (M: Matrix) => [M.length, M[0]?.length ?? 0] as const;
/** The product AB, cell by cell: row i of A dotted with column j of B. */
export function matmul(A: Matrix, B: Matrix): number[][] {
  const [m, n] = shape(A);
  const p = shape(B)[1];
  return Array.from({ length: m }, (_, i) => Array.from({ length: p }, (_, j) => Array.from({ length: n }, (_, k) => A[i][k] * B[k][j]).reduce((s, x) => s + x, 0)));
}
/** The 2×2 product AB: do B, then A. */
export const mul2 = ([a, b, c, d]: Mat2, [e, f, g, h]: Mat2): Mat2 => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
const toMatrix = (m: Mat2): Matrix => [
  [m[0], m[1]],
  [m[2], m[3]],
];
const same = (x: Mat2, y: Mat2) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9);

const sub = (i: number) => String(i + 1).split('').map((d) => String.fromCharCode(0x2080 + Number(d))).join('');
const cell = (name: string, i: number, j: number) => `${name}${sub(i)}${sub(j)}`;
const size = (M: Matrix) => `${shape(M)[0]}×${shape(M)[1]}`;
const times = (a: number, b: number) => `${fmt(a)}·${b < 0 ? `(${fmt(b)})` : fmt(b)}`;
const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });

/** Highlight intensities for a matrix's cells, as pixels of a signed image: pale for neutral, light blue to stand out. */
const LIT = 0.3;
const CURRENT = 0.5;

function matrixImage(id: string, label: string, M: Matrix, opts: { values?: string[]; lit?: (i: number, j: number) => number; boxes?: ImageBox[] } = {}): ImagePart {
  const [rows, cols] = shape(M);
  const pixels: number[] = [];
  const values: string[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      pixels.push(opts.lit?.(i, j) ?? 0);
      values.push(opts.values ? opts.values[i * cols + j] : fmt(M[i][j]));
    }
  return { kind: 'image', id, label, width: cols, height: rows, pixels, scale: 'signed', values, boxes: opts.boxes ?? [], size: cols * CELL_PX, matrix: true };
}

// ───────────────────────────── cell by cell ─────────────────────────────

function* cells(A: Matrix, B: Matrix): Generator<Frame<PlotState>> {
  const [m, n] = shape(A);
  const [n2, p] = shape(B);
  const stats = (mults: number) => ({ multiplications: mults });

  if (n !== n2) {
    const rowBox: ImageBox = { id: 'row', x: 0, y: 0, w: n, h: 1, mark: 'compare' };
    const colBox: ImageBox = { id: 'col', x: 0, y: 0, w: 1, h: n2, mark: 'reject' };
    yield plotFrame([matrixImage('A', `A (${size(A)})`, A), matrixImage('B', `B (${size(B)})`, B), readouts([{ id: 'A', label: 'A', value: `${m}×${n}` }, { id: 'B', label: 'B', value: `${n2}×${p}` }])], {
      line: 0,
      note: `A is ${m}×${n} (${m} rows, ${n} columns) and B is ${n2}×${p}. Each cell of AB pairs a row of A with a column of B, part by part.`,
      vars: { m, n, 'B rows': n2, p },
      stats: stats(0),
      checkpoint: askInOrder('Can AB be worked out?', ['Yes', 'No'], 'No'),
    });
    yield plotFrame(
      [
        matrixImage('A', `A (${size(A)})`, A, { lit: (i) => (i === 0 ? LIT : 0), boxes: [rowBox] }),
        matrixImage('B', `B (${size(B)})`, B, { lit: (_, j) => (j === 0 ? LIT : 0), boxes: [colBox] }),
        readouts([{ id: 'row', label: 'a row of A has', value: `${n} numbers`, mark: 'compare' }, { id: 'col', label: 'a column of B has', value: `${n2} numbers`, mark: 'reject' }]),
      ],
      {
        line: 0,
        note: `No. A row of A has ${n} numbers but a column of B has ${n2}, so they can't be paired up part by part. AB needs A's column count to equal B's row count: the inner numbers of ${m}×${n} and ${n2}×${p} must match.${p === m ? ` (BA would work: ${n2}×${p} times ${m}×${n}.)` : ''}`,
        vars: { m, n, 'B rows': n2, p },
        stats: stats(0),
      },
    );
    return;
  }

  const C = matmul(A, B);
  const filled = new Set<string>();
  const cValues = () => C.flatMap((row, i) => row.map((v, j) => (filled.has(`${i}:${j}`) ? fmt(v) : '')));
  const blank: Matrix = C.map((row) => row.map(() => 0));
  const shapes = readouts([
    { id: 'A', label: 'A', value: `${m}×${n}` },
    { id: 'B', label: 'B', value: `${n}×${p}` },
    { id: 'C', label: 'C = AB', value: `${m}×${p}`, mark: 'found' },
  ]);
  const vars = { m, n, p };
  const wrongShapes = [`${n}×${n}`, `${m}×${n}`, `${n}×${p}`, `${p}×${m}`, `${m}×${n * p}`, `1×${m * p}`];

  yield plotFrame([matrixImage('A', `A (${size(A)})`, A), matrixImage('B', `B (${size(B)})`, B), readouts([{ id: 'A', label: 'A', value: `${m}×${n}` }, { id: 'B', label: 'B', value: `${n}×${p}` }])], {
    line: 0,
    note: `A is ${m}×${n} (${m} rows, ${n} columns) and B is ${n}×${p}. Each cell of C = AB will pair a row of A with a column of B, part by part, like a dot product.`,
    vars,
    stats: stats(0),
    checkpoint: ask('What shape will C = AB be?', `${m}×${p}`, wrongShapes),
  });

  const rowsOf = (i: number, j: number) => ({
    a: matrixImage('A', `A (${size(A)})`, A, { lit: (r) => (r === i ? LIT : 0), boxes: [{ id: 'row', x: 0, y: i, w: n, h: 1, mark: 'compare' }] }),
    b: matrixImage('B', `B (${size(B)})`, B, { lit: (_, c) => (c === j ? LIT : 0), boxes: [{ id: 'col', x: j, y: 0, w: 1, h: n, mark: 'compare' }] }),
  });
  const valueQuestion = (i: number, j: number) => {
    const row = A[i];
    const col = B.map((r) => r[j]);
    const right = C[i][j];
    const added = row.reduce((s, x, k) => s + x + col[k], 0);
    const sums = row.reduce((s, x) => s + x, 0) * col.reduce((s, x) => s + x, 0);
    const flipped = row.reduce((s, x, k) => s + x * col[n - 1 - k], 0);
    return ask(`What number goes in ${cell('C', i, j)}?`, fmt(right), [fmt(sums), fmt(added), fmt(flipped), fmt(right + row[0])]);
  };
  const whichQuestion = (i: number, j: number) =>
    ask(`Which row of A and which column of B make ${cell('C', i, j)}?`, `row ${i + 1} of A, column ${j + 1} of B`, [`row ${j + 1} of A, column ${i + 1} of B`, `column ${j + 1} of A, row ${i + 1} of B`, `row ${i + 1} of A, row ${j + 1} of B`]);

  yield plotFrame([matrixImage('A', `A (${size(A)})`, A), matrixImage('B', `B (${size(B)})`, B), matrixImage('C', `C = AB (${m}×${p})`, blank, { values: cValues() }), shapes], {
    line: 0,
    note: `C is ${m}×${p}: one cell for every row of A (${m}) and every column of B (${p}). The ${n}s in the middle must match, and they disappear: ${m}×${n} times ${n}×${p} gives ${m}×${p}. ${cell('C', 0, 0)} means row 1, column 1 of C.`,
    vars,
    stats: stats(0),
    checkpoint: valueQuestion(0, 0),
  });

  let mults = 0;
  const order: [number, number][] = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < p; j++) order.push([i, j]);
  for (let k = 0; k < order.length; k++) {
    const [i, j] = order[k];
    filled.add(`${i}:${j}`);
    mults += n;
    const { a, b } = rowsOf(i, j);
    const terms = A[i].map((x, t) => times(x, B[t][j]));
    const next = order[k + 1];
    const c = matrixImage('C', `C = AB (${m}×${p})`, blank, {
      values: cValues(),
      lit: (r, s) => (r === i && s === j ? CURRENT : filled.has(`${r}:${s}`) ? 0.12 : 0),
      boxes: [{ id: 'cell', x: j, y: i, w: 1, h: 1, mark: 'write' }],
    });
    yield plotFrame(
        [
          a,
          b,
          c,
          readouts([
            { id: 'calc', label: `${cell('C', i, j)} = row ${i + 1} · column ${j + 1}`, value: `${terms.join(' + ').replace(/\+ −/g, '− ')} = ${fmt(C[i][j])}`, mark: 'write' },
            { id: 'mults', label: 'multiplications so far', value: String(mults) },
          ]),
        ],
        {
          line: 3,
          note: `${cell('C', i, j)} is row ${i + 1} of A dotted with column ${j + 1} of B: ${terms.join(' + ').replace(/\+ −/g, '− ')} = ${fmt(C[i][j])}. That took ${n} multiplication${n === 1 ? '' : 's'}.`,
          vars: { i: i + 1, j: j + 1, [cell('C', i, j)]: C[i][j] },
          stats: stats(mults),
          checkpoint: next ? (k % 2 === 0 ? whichQuestion(...next) : valueQuestion(...next)) : ask('How many multiplications did all of C take?', String(m * n * p), [String(m * p), String(m * n + n * p), String(m * p * (n - 1) || m * p + 1), String(2 * m * n * p), String(m * n + n * p + m * p)]),
        },
      );
  }

  yield plotFrame([matrixImage('A', `A (${size(A)})`, A), matrixImage('B', `B (${size(B)})`, B), matrixImage('C', `C = AB (${m}×${p})`, blank, { values: cValues() }), readouts([{ id: 'mults', label: 'multiplications', value: `${m}·${n}·${p} = ${m * n * p}`, mark: 'found' }, { id: 'cube', label: 'two n×n matrices', value: 'n·n·n = n³' }])], {
    line: 4,
    note: `C has ${m * p} cells and each took ${n} multiplications: ${m}·${n}·${p} = ${m * n * p} in all. For two n×n matrices that is n³, so doubling n means 8 times the work. Large models do this all the time, which is why the chips they run on are built to do it fast.`,
    vars,
    stats: stats(mults),
  });
}

// ───────────────────────────── composing transformations ─────────────────────────────

const EXTENT = 4.5;

function* compose(A: Mat2, B: Mat2): Generator<Frame<PlotState>> {
  const AB = mul2(A, B);
  const BA = mul2(B, A);
  const equal = same(AB, BA);
  const panel = (name: string, label: string, M: Mat2): PlotPart => {
    const [a, b, c, d] = entries(M);
    return { kind: 'matrix', id: name, name, label, cols: [{ values: [a, c], tone: 1 }, { values: [b, d], tone: 2 }] };
  };
  const hnd = (id: string, at: Vec, label: string, tone: 1 | 2): Handle => ({ id, at, label, tone, step: 0.5, min: [-ENTRY_MAX, -ENTRY_MAX], max: [ENTRY_MAX, ENTRY_MAX] });
  const basis = (M: Mat2, suffix = ''): Shape[] => [
    { kind: 'vector', id: `i${suffix}`, from: [0, 0], to: col1(M), tone: 1, label: 'î' },
    { kind: 'vector', id: `j${suffix}`, from: [0, 0], to: col2(M), tone: 2, label: 'ĵ' },
  ];
  const square = (M: Mat2, suffix = ''): Shape => ({ kind: 'path', id: `square${suffix}`, points: [[0, 0], col1(M), [col1(M)[0] + col2(M)[0], col1(M)[1] + col2(M)[1]], col2(M)], closed: true, fill: true, mark: 'key' });
  const pl = (label: string, warp: Mat2, shapes: Shape[], handles: Handle[] = [], id = 'plane'): PlanePart => ({ kind: 'plane', id, label, x: { min: -EXTENT, max: EXTENT }, y: { min: -EXTENT, max: EXTENT }, equal: true, warp, shapes, handles });
  const panels = (...ps: PlotPart[]) => ps;
  const bHandles = [hnd('bi', col1(B), 'Where B sends î', 1), hnd('bj', col2(B), 'Where B sends ĵ', 2)];
  const aHandles = [hnd('ai', col1(A), 'Where A sends î', 1), hnd('aj', col2(A), 'Where A sends ĵ', 2)];
  const Bi = col1(B);
  const ABi = apply(A, Bi);
  const vars = {};
  const stats = (k: number) => ({ multiplications: k });

  yield plotFrame([pl('The plane before anything moves', IDENTITY, [...basis(IDENTITY), square(IDENTITY)]), ...panels(panel('A', 'The matrix A', A), panel('B', 'The matrix B', B))], {
    line: 5,
    note: `Two transformations, A and B, shown below. The product AB is the single matrix that does both. To apply AB to a vector v, compute AB·v = A(B·v).`,
    vars,
    stats: stats(0),
    checkpoint: askInOrder('In AB·v = A(B·v), which matrix moves v first?', ['A', 'B'], 'B'),
  });

  yield plotFrame([pl('After B', B, [...basis(B), square(B)], bHandles), ...panels(panel('A', 'The matrix A', A), panel('B', 'The matrix B', B))], {
    line: 5,
    note: `B first: it is next to v, so it acts first. B sends î to its first column ${fmtVec(Bi)} and ĵ to its second, ${fmtVec(col2(B))}. Drag either tip to change B.`,
    vars,
    stats: stats(0),
    checkpoint: ask(`Now A moves everything again. Where does A send B's î, ${fmtVec(Bi)}?`, fmtVec(ABi), [fmtVec(apply(B, col1(A))), fmtVec(Bi), fmtVec(col1(A))]),
  });

  yield plotFrame([pl('After B, then A: the plane under AB', AB, [...basis(AB), square(AB)]), ...panels(panel('A', 'The matrix A', A), panel('B', 'The matrix B', B), panel('AB', 'The product AB', AB))], {
    line: 6,
    note: `î lands at A·${fmtVec(Bi)} = ${fmtVec(ABi)}, and that is the first column of AB. Each column of AB is A times a column of B, and each entry is a row of A dotted with a column of B, just as in the cell-by-cell story. One matrix, AB, does both moves.`,
    vars,
    stats: stats(8),
    checkpoint: askInOrder('Now do A first, then B: the product BA. Does it move the plane the same way as AB?', ['Yes', 'No'], equal ? 'Yes' : 'No'),
  });

  yield plotFrame([pl('A on its own', A, [...basis(A), square(A)], aHandles), ...panels(panel('A', 'The matrix A', A), panel('B', 'The matrix B', B), panel('AB', 'The product AB', AB))], {
    line: 7,
    note: `${equal ? 'Yes, for these two.' : 'No.'} To see why, start again with A alone: î goes to ${fmtVec(col1(A))} and ĵ to ${fmtVec(col2(A))}. Drag either tip to change A.`,
    vars,
    stats: stats(8),
  });

  yield plotFrame([pl('After A, then B: the plane under BA', BA, [...basis(BA), square(BA)]), ...panels(panel('A', 'The matrix A', A), panel('B', 'The matrix B', B), panel('BA', 'The product BA', BA))], {
    line: 7,
    note: `Then B moves A's picture: î ends at B·${fmtVec(col1(A))} = ${fmtVec(col1(BA))}. ${equal ? 'Here BA = AB, because these two moves happen not to get in each other’s way (for example two turns, or a stretch that is the same in every direction).' : `That is not where AB sent it, ${fmtVec(col1(AB))}. The order matters.`}`,
    vars,
    stats: stats(16),
  });

  yield plotFrame(
    [
      pl('AB: B, then A', AB, [...basis(AB, 'ab'), square(AB, 'ab')], [], 'plane'),
      pl('BA: A, then B', BA, [...basis(BA, 'ba'), square(BA, 'ba')], [], 'plane2'),
      ...panels(panel('AB', 'The product AB', AB), panel('BA', 'The product BA', BA)),
    ],
    {
      line: 7,
      note: equal
        ? 'These two commute: AB = BA. That is the exception. Swap in a stretch and a turn and the two orders give different pictures.'
        : `AB ≠ BA: the same two moves, done in the other order, leave the plane in a different place. Never swap the order of a matrix product.`,
      vars,
      stats: stats(16),
    },
  );
}

function* run(input: MatMulInput): Generator<Frame<PlotState>> {
  if (input.story === 'cells') yield* cells(input.A, input.B);
  else yield* compose(input.A, input.B);
}

// ───────────────────────────── custom text ─────────────────────────────

/** The matrices written as [[…], […]] in the text, each a list of rows. */
function matricesIn(text: string): number[][][] {
  return [...text.replace(/−/g, '-').matchAll(/\[\s*\[[^[\]]*\](?:\s*,\s*\[[^[\]]*\])*\s*\]/g)].map((m) => [...m[0].matchAll(/\[([^[\]]*)\]/g)].map((r) => numbersIn(r[1])));
}

const isWhole = (x: number) => Number.isInteger(x);

export function parseMatMul(text: string): { value: MatMulInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  if (word !== 'cells' && word !== 'compose') return { error: 'Start with cells or compose, then two matrices as rows, e.g. cells [[1, 2], [3, 4]] [[5, 6], [7, 8]].' };
  const ms = matricesIn(text);
  if (ms.length !== 2) return { error: 'Give two matrices, each as a list of rows like [[1, 2], [3, 4]].' };
  for (const M of ms) {
    if (M.length === 0 || M.some((r) => r.length !== M[0].length || r.length === 0)) return { error: 'Every row of a matrix needs the same number of entries.' };
  }
  if (word === 'compose') {
    if (!ms.every((M) => M.length === 2 && M[0].length === 2)) return { error: 'compose takes two 2×2 matrices.' };
    if (!ms.flat(2).every((x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9 && Math.abs(x) <= ENTRY_MAX)) return { error: `Use halves from −${ENTRY_MAX} to ${ENTRY_MAX}.` };
    const [A, B] = ms.map((M) => [M[0][0], M[0][1], M[1][0], M[1][1]] as unknown as Mat2);
    return { value: { story: 'compose', A, B } };
  }
  if (!ms.every((M) => M.length <= LIMITS.size && M[0].length <= LIMITS.size)) return { error: `Keep each matrix at most ${LIMITS.size}×${LIMITS.size}.` };
  if (!ms.flat(2).every((x) => isWhole(x) && Math.abs(x) <= LIMITS.entry)) return { error: `Use whole numbers from −${LIMITS.entry} to ${LIMITS.entry}.` };
  return { value: { story: 'cells', A: ms[0], B: ms[1] } };
}

const written = (M: Matrix) => `[${M.map((r) => `[${r.map((x) => plain(x)).join(', ')}]`).join(', ')}]`;
function format(input: MatMulInput): string {
  if (input.story === 'cells') return `cells ${written(input.A)} ${written(input.B)}`;
  return `compose ${written(toMatrix(input.A))} ${written(toMatrix(input.B))}`;
}

export function dragMatMul(input: MatMulInput, id: string, to: Vec): MatMulInput {
  if (input.story !== 'compose') return input;
  const set = ([a, b, c, d]: Mat2, column: 'i' | 'j'): Mat2 => (column === 'i' ? [to[0], b, to[1], d] : [a, to[0], c, to[1]]);
  if (id === 'bi' || id === 'bj') return { ...input, B: set(input.B, id === 'bi' ? 'i' : 'j') };
  if (id === 'ai' || id === 'aj') return { ...input, A: set(input.A, id === 'ai' ? 'i' : 'j') };
  return input;
}

const example = (id: string, label: string, input: MatMulInput) => ({ id, label, make: () => input, sized: false });

export const matrixMultiplication = defineAlgorithm<MatMulInput, PlotState>({
  kind: 'algorithm',
  slug: 'matrix-multiplication',
  view: 'plot',
  input: {
    examples: [
      example('cells', '2×3 times 3×2, cell by cell', {
        story: 'cells',
        A: [
          [1, 2, 0],
          [3, -1, 2],
        ],
        B: [
          [2, 1],
          [0, 3],
          [1, -1],
        ],
      }),
      example('square', '2×2 times 2×2', {
        story: 'cells',
        A: [
          [1, 2],
          [3, 4],
        ],
        B: [
          [0, 1],
          [1, 0],
        ],
      }),
      example('mismatch', 'Shapes that don’t fit', {
        story: 'cells',
        A: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        B: [
          [1, 0],
          [0, 1],
          [1, 1],
        ],
      }),
      example('compose', 'A turn and a stretch: AB ≠ BA', { story: 'compose', A: [0, -1, 1, 0], B: [2, 0, 0, 1] }),
    ],
    custom: {
      label: 'cells or compose, then A and B as rows (whole numbers for cells; 2×2 halves for compose)',
      placeholder: 'e.g. cells [[1, 2], [3, 4]] [[0, 1], [1, 0]]',
      parse: parseMatMul,
      format,
    },
    drag: dragMatMul,
  },
  pseudocode,
  stats: [{ key: 'multiplications', label: 'Multiplications' }],
  legend: [
    { neutral: 'Matrix entries, and the grid before it moves' },
    { mark: 'compare', label: 'The row of A and the column of B being paired' },
    { mark: 'write', label: 'The cell of C being filled' },
    { tone: 1, label: 'Where î lands (a first column)' },
    { tone: 2, label: 'Where ĵ lands (a second column)' },
    { mark: 'key', label: 'The unit square after the move' },
  ],
  run,
  content: {
    idea: 'Each cell of C = AB is a row of A dotted with a column of B: C[i][j] = Σₖ A[i][k]·B[k][j]. So A’s rows must be as long as B’s columns, and an m×n matrix times an n×p one gives an m×p result. As moves of the plane, AB means “do B, then A”.',
    invariant: 'Column j of AB is A applied to column j of B, and (AB)v = A(Bv). The product takes m·n·p multiplications, n³ for two n×n matrices. Usually AB ≠ BA, but (AB)C = A(BC), so a chain can be grouped any way as long as the order stays.',
    whenToUse: 'Chaining transformations into one matrix (graphics, robotics), applying a layer of a neural network to a whole batch of examples at once, and almost every step of training and running a large model. Its n³ cost is why GPUs are built around it.',
    traits: [
      { label: 'Row of A · column of B', good: null },
      { label: '(m×n)(n×p) = m×p', good: null },
      { label: 'AB ≠ BA in general', good: false },
    ],
    experiments: [
      { example: 'cells', prompt: 'Before each cell, point at the row and the column it will use.' },
      { example: 'square', prompt: 'B swaps the columns of A. Predict what BA does instead: type cells [[0, 1], [1, 0]] [[1, 2], [3, 4]].' },
      { example: 'mismatch', prompt: 'Which one change to B’s shape would make AB work? What shape would C be?' },
      { example: 'compose', prompt: 'Drag B’s columns until AB and BA agree. What kind of B does that need?' },
    ],
  },
});

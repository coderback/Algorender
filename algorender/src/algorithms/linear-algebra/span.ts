import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import type { Handle, ImageBox, ImagePart, Mat2, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { add, dot, scale } from './shared';

// Span, basis and rank. The combinations a·u + b·v of two vectors reach a
// whole plane when neither is a multiple of the other (they are independent,
// a basis, and every point has exactly one recipe), and only a line when one
// is. The rank of a matrix is how many independent directions its columns
// give: elimination clears the entries under each pivot, and the number of
// pivots it finds is the rank. A column with no pivot is a mix of the earlier
// columns.

export type Matrix = readonly (readonly number[])[];
export type SpanInput = { story: 'span'; u: Vec; v: Vec; w: Vec } | { story: 'rank'; A: Matrix };
export type Story = SpanInput['story'];

/** u and v stay inside ±vector, w inside ±target, on half steps; matrices are whole numbers up to 4×4. */
export const LIMITS = { vector: 3, target: 5.5, size: 4, entry: 9 } as const;
const EXTENT = 6;
/** Whole multiples drawn as dots: a and b from −REACH to REACH. */
export const REACH = 3;
/** Entries this close to 0 count as 0. */
export const ZERO = 1e-9;

const pseudocode = [
  'span{u} = every a·u: a line',
  'a·u + b·v: a combination',
  'span{u, v} = every a·u + b·v',
  'w = a·u + b·v: solve for a and b',
  'independent: neither is a multiple',
  'basis: independent, and spans',
  'rank = how many independent directions',
  'for each column: find a pivot',
  '  swap it up; clear the rows below',
  'rank = the number of pivots',
];

// ───────────────────────────── the maths ─────────────────────────────

/** det [u v]: zero exactly when u and v lie on one line. */
export const cross = (u: Vec, v: Vec) => u[0] * v[1] - u[1] * v[0];
export const dependent = (u: Vec, v: Vec) => Math.abs(cross(u, v)) < ZERO;

/** The recipe (a, b) with a·u + b·v = w, when u and v are independent (Cramer's rule). */
export function recipe(u: Vec, v: Vec, w: Vec): [number, number] {
  const d = cross(u, v);
  return [cross(w, v) / d, cross(u, w) / d];
}

export type Elimination = {
  /** The echelon form. */
  M: number[][];
  /** Where each pivot sits, [row, column], in order. */
  pivots: [number, number][];
};

/** Row echelon form by elimination, taking the first non-zero entry at or below each row as its pivot. */
export function echelon(A: Matrix): Elimination {
  const M = A.map((r) => [...r]);
  const m = M.length;
  const n = M[0]?.length ?? 0;
  const pivots: [number, number][] = [];
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    const p = M.findIndex((row, i) => i >= r && Math.abs(row[c]) > ZERO);
    if (p < 0) continue;
    [M[r], M[p]] = [M[p], M[r]];
    for (let i = r + 1; i < m; i++) {
      const f = M[i][c] / M[r][c];
      if (Math.abs(f) < ZERO) continue;
      M[i] = M[i].map((x, j) => clean(x - f * M[r][j]));
      M[i][c] = 0;
    }
    pivots.push([r, c]);
    r++;
  }
  return { M, pivots };
}

export const rankOf = (A: Matrix) => echelon(A).pivots.length;

const clean = (x: number) => (Math.abs(x) < ZERO ? 0 : x);

/** Reduced echelon form: each pivot 1, with 0s above and below it. */
export function reduced(A: Matrix): Elimination {
  const { M, pivots } = echelon(A);
  for (let k = pivots.length - 1; k >= 0; k--) {
    const [r, c] = pivots[k];
    const p = M[r][c];
    M[r] = M[r].map((x) => clean(x / p));
    for (let i = 0; i < r; i++) {
      const f = M[i][c];
      if (f !== 0) M[i] = M[i].map((x, j) => clean(x - f * M[r][j]));
    }
  }
  return { M, pivots };
}

/**
 * Each column without a pivot as a mix of the pivot columns before it:
 * column j = Σ coefficient · column (pivot column).
 */
export function dependencies(A: Matrix): { column: number; terms: { column: number; times: number }[] }[] {
  const { M, pivots } = reduced(A);
  const n = A[0]?.length ?? 0;
  const pivotCols = new Set(pivots.map(([, c]) => c));
  const out: { column: number; terms: { column: number; times: number }[] }[] = [];
  for (let j = 0; j < n; j++) {
    if (pivotCols.has(j)) continue;
    const terms = pivots.filter(([r, c]) => c < j && M[r][j] !== 0).map(([r, c]) => ({ column: c, times: M[r][j] }));
    out.push({ column: j, terms });
  }
  return out;
}

/** "column 2 = 2·column 1", counting from 1. */
export function dependencyText(d: { column: number; terms: { column: number; times: number }[] }): string {
  if (d.terms.length === 0) return `column ${d.column + 1} is all 0s`;
  const parts = d.terms.map((t, i) => {
    const size = Math.abs(t.times);
    const k = size === 1 ? '' : `${fmt(size)}·`;
    const sign = t.times < 0 ? (i === 0 ? '−' : ' − ') : i === 0 ? '' : ' + ';
    return `${sign}${k}column ${t.column + 1}`;
  });
  return `column ${d.column + 1} = ${parts.join('')}`;
}

// ───────────────────────────── drawing helpers ─────────────────────────────

const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });
const inside = (p: Vec, lim = EXTENT - 0.2) => Math.abs(p[0]) <= lim && Math.abs(p[1]) <= lim;
const times = (k: number, name: string) => (k === 1 ? name : k === -1 ? `−${name}` : `${fmt(k)}${name}`);
/** "2u + v", "−u − 0.5v". */
export const comboText = (a: number, b: number) => {
  if (b === 0) return times(a, 'u');
  if (a === 0) return times(b, 'v');
  return `${times(a, 'u')} ${b < 0 ? '−' : '+'} ${times(Math.abs(b), 'v')}`;
};

function plane(label: string, shapes: Shape[], handles: Handle[], warp: Mat2 | null = null): PlanePart {
  return { kind: 'plane', id: 'plane', label, x: { min: -EXTENT, max: EXTENT, label: 'x' }, y: { min: -EXTENT, max: EXTENT, label: 'y' }, equal: true, warp, shapes, handles };
}

const handle = (id: string, at: Vec, label: string, lim: number, tone?: 1 | 2): Handle => ({ id, at, label, tone, step: 0.5, min: [-lim, -lim], max: [lim, lim] });

/** The combination asked about first: the first of these whose tip-to-tail path stays on the plane. */
const COMBOS: [number, number][] = [
  [2, 1],
  [1, 2],
  [2, -1],
  [-1, 2],
  [1, -1],
  [1, 1],
];
export function firstCombo(u: Vec, v: Vec): [number, number] {
  return COMBOS.find(([a, b]) => inside(scale(a, u)) && inside(add(scale(a, u), scale(b, v)))) ?? [1, 1];
}

// ───────────────────────────── span: combinations of u and v ─────────────────────────────

function* spanStory(u: Vec, v: Vec, w: Vec): Generator<Frame<PlotState>> {
  const indep = !dependent(u, v);
  const rank = indep ? 2 : 1;
  const [a1, b1] = firstCombo(u, v);
  const combo = add(scale(a1, u), scale(b1, v));
  const reachable = indep || Math.abs(cross(u, w)) < ZERO;
  const [a, b] = indep ? recipe(u, v, w) : [dot(w, u) / dot(u, u), 0];
  const shadow = scale(dot(w, u) / dot(u, u), u);
  const P: Mat2 = [u[0], v[0], u[1], v[1]];
  const d = cross(u, v);

  const uVec: Shape = { kind: 'vector', id: 'u', from: [0, 0], to: u, tone: 1, label: 'u' };
  const vVec: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' };
  const uLine: Shape = { kind: 'line', id: 'uline', through: [0, 0], dir: u, dashed: true, label: 'multiples of u' };
  const multiples: Shape[] = [];
  for (let k = -REACH; k <= REACH; k++) {
    const p = scale(k, u);
    if (k !== 0 && k !== 1 && inside(p)) multiples.push({ kind: 'point', id: `m${k}`, at: p, size: 'sm', tone: 1 });
  }
  const dots: Shape[] = [];
  for (let i = -REACH; i <= REACH; i++)
    for (let j = -REACH; j <= REACH; j++) {
      const p = add(scale(i, u), scale(j, v));
      if (inside(p)) dots.push({ kind: 'point', id: `c${i}_${j}`, at: p, size: 'sm' });
    }
  const wPoint: Shape = { kind: 'point', id: 'w', at: w, mark: 'key', label: 'w', size: 'md' };
  const hu = handle('u', u, 'u', LIMITS.vector, 1);
  const hv = handle('v', v, 'v', LIMITS.vector, 2);
  const hw = handle('w', w, 'w', LIMITS.target);
  const matrix: PlotPart = { kind: 'matrix', id: 'P', name: '[u v]', label: 'u and v as the columns of a matrix', cols: [{ values: [fmt(u[0]), fmt(u[1])], tone: 1 }, { values: [fmt(v[0]), fmt(v[1])], tone: 2 }] };
  const basics: Readout[] = [
    { id: 'u', label: 'u', value: fmtVec(u), tone: 1 },
    { id: 'v', label: 'v', value: fmtVec(v), tone: 2 },
  ];
  const vars = { u: fmtVec(u), v: fmtVec(v) };

  // The recipe for w, drawn tip to tail (or the gap to the line when it can't be reached).
  const recipeShapes: Shape[] = !reachable
    ? [
        { kind: 'point', id: 'shadow', at: shadow, label: 'closest', size: 'sm' },
        { kind: 'path', id: 'gap', points: [shadow, w], dashed: true, mark: 'reject', label: 'gap' },
      ]
    : indep
      ? [
          { kind: 'vector', id: 'wa', from: [0, 0], to: scale(a, u), tone: 1, dashed: true, label: times(a, 'u') },
          { kind: 'vector', id: 'wb', from: scale(a, u), to: w, tone: 2, dashed: true, label: times(b, 'v') },
        ]
      : [{ kind: 'vector', id: 'wa', from: [0, 0], to: w, tone: 1, dashed: true, label: times(a, 'u') }];
  const recipeReadout: Readout = !reachable
    ? { id: 'recipe', label: 'w', value: 'out of reach', mark: 'reject' }
    : { id: 'recipe', label: 'w', value: indep ? `${comboText(a, b)}` : `${times(a, 'u')} (or other mixes)`, mark: 'found' };
  const spanShapes: Shape[] = indep ? [] : [{ kind: 'line', id: 'spanline', through: [0, 0], dir: u, mark: 'path', label: 'span{u, v}' }];

  yield plotFrame([plane('The multiples of u', [uLine, ...multiples, uVec], [hu]), readouts([basics[0]])], {
    line: 0,
    note: `Start with one vector, u = ${fmtVec(u)}. Scaling it by any number a gives a·u, and every a·u lies on one line through the origin: the dots are a few whole multiples. One vector on its own reaches only that line, its span.`,
    vars: { u: fmtVec(u) },
    checkpoint: ask(`Now add v = ${fmtVec(v)}. Where does ${comboText(a1, b1)} land?`, fmtVec(combo), [
      fmtVec(add(scale(b1, u), scale(a1, v))),
      fmtVec(add(scale(a1, u), scale(-b1, v))),
      fmtVec(add(u, v)),
      fmtVec(scale(a1 + b1, u)),
    ]),
  });

  yield plotFrame(
    [
      plane(
        'A combination of u and v',
        [
          uLine,
          uVec,
          vVec,
          { kind: 'vector', id: 'au', from: [0, 0], to: scale(a1, u), tone: 1, dashed: true, label: times(a1, 'u') },
          { kind: 'vector', id: 'bv', from: scale(a1, u), to: combo, tone: 2, dashed: true, label: times(b1, 'v') },
          { kind: 'point', id: 'combo', at: combo, mark: 'found', label: comboText(a1, b1) },
        ],
        [hu, hv],
      ),
      readouts([...basics, { id: 'combo', label: comboText(a1, b1), value: fmtVec(combo), mark: 'found' }]),
    ],
    {
      line: 1,
      note: `${comboText(a1, b1)} = ${fmtVec(combo)}: first ${times(a1, 'u')}, then ${times(b1, 'v')} from its tip. Any a·u + b·v, with any numbers a and b, is called a combination of u and v.`,
      vars: { ...vars, a: a1, b: b1 },
      checkpoint: askInOrder('Do the combinations a·u + b·v reach every point of the plane?', ['Yes', 'No'], indep ? 'Yes' : 'No'),
    },
  );

  const spanNote = indep
    ? `Yes. The whole-number combinations sit on a tilted grid (the grid lines run along u and along v), and with fractions a and b they fill every gap. u and v point different ways, so together they reach the whole plane: span{u, v} is the plane.`
    : `No. v = ${times(dot(v, u) / dot(u, u), 'u')} lies on u's line, so every a·u + b·v is just some amount of u, and the tilted grid collapses onto that line. span{u, v} is only a line, and det [u v] = 0.`;
  const wQuestion: Checkpoint | undefined = indep
    ? ask(`w = ${fmtVec(w)}. In w = a·u + b·v, what is a, the number of u's?`, fmt(a), [fmt(b), fmt(-a), fmt(a + 1), fmt(a - 1)])
    : askInOrder(`Can w = ${fmtVec(w)} be written as a·u + b·v?`, ['Yes', 'No'], reachable ? 'Yes' : 'No');
  yield plotFrame(
    [
      plane('Every combination of u and v', [...spanShapes, ...dots, uVec, vVec, wPoint], [hu, hv, hw], P),
      matrix,
      readouts([...basics, { id: 'det', label: 'det [u v]', value: fmt(d), mark: indep ? null : 'reject' }]),
    ],
    { line: 2, note: spanNote, vars: { ...vars, 'det [u v]': d }, checkpoint: wQuestion },
  );

  const recipeNote = !reachable
    ? `No. w = ${fmtVec(w)} is off the line, and every combination stays on it. The closest any combination gets is ${fmtVec(shadow)}, w's shadow on the line, still ${fmt(Math.hypot(w[0] - shadow[0], w[1] - shadow[1]))} away.`
    : indep
      ? `w = ${comboText(a, b)}: first ${times(a, 'u')}, then ${times(b, 'v')} from its tip. Solving w = a·u + b·v is two equations, one per part, with two unknowns, a and b.`
      : `Yes: w lies on the line, so w = ${times(a, 'u')}. It has other recipes too: v is just more u, so trading some u for some v leaves w where it is.`;
  yield plotFrame(
    [
      plane('w as a combination', [...spanShapes, ...dots, uVec, vVec, ...recipeShapes, wPoint], [hu, hv, hw], P),
      matrix,
      readouts([...basics, { id: 'det', label: 'det [u v]', value: fmt(d), mark: indep ? null : 'reject' }, recipeReadout]),
    ],
    {
      line: 3,
      note: recipeNote,
      vars: { ...vars, ...(reachable && { a, b }) },
      checkpoint: askInOrder('How many independent directions do u and v really give? That number is the rank.', ['1', '2'], String(rank)),
    },
  );

  const endNote = indep
    ? `Two. Neither u nor v is a multiple of the other, so they are independent, and together they reach the whole plane: a basis. Every point has exactly one recipe (a, b), and the matrix [u v] has rank 2.`
    : `One. v adds no new direction, so u and v are dependent and not a basis: they reach only a line, points on it have many recipes, and the rest have none. The matrix [u v] has rank 1.`;
  yield plotFrame(
    [
      plane(indep ? 'u and v: a basis for the plane' : 'u and v: one direction', [...spanShapes, ...dots, uVec, vVec, ...recipeShapes, wPoint], [hu, hv, hw], P),
      matrix,
      readouts([...basics, { id: 'det', label: 'det [u v]', value: fmt(d), mark: indep ? null : 'reject' }, recipeReadout, { id: 'rank', label: 'rank', value: String(rank), mark: 'found' }]),
    ],
    { line: indep ? 5 : 6, note: endNote, vars: { ...vars, rank } },
  );
}

// ───────────────────────────── rank by elimination ─────────────────────────────

/** On-screen size of one matrix cell, in px. */
const CELL_PX = 46;
const LIT = 0.3;

function matrixImage(id: string, label: string, M: Matrix, opts: { lit?: (i: number, j: number) => number; boxes?: ImageBox[] } = {}): ImagePart {
  const rows = M.length;
  const cols = M[0]?.length ?? 0;
  const pixels: number[] = [];
  const values: string[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      pixels.push(opts.lit?.(i, j) ?? 0);
      values.push(fmt(M[i][j]));
    }
  return { kind: 'image', id, label, width: cols, height: rows, pixels, scale: 'signed', values, boxes: opts.boxes ?? [], size: cols * CELL_PX, matrix: true };
}

type Focus = { pivot?: [number, number]; row?: number; pivotRow?: number; empty?: { col: number; from: number }; swap?: [number, number] };
type Step = { M: number[][]; note: string; line: number; focus: Focus; ops: number; pivots: [number, number][]; checkpoint?: Checkpoint };

function rankSteps(A: Matrix): Step[] {
  const M = A.map((r) => [...r]);
  const m = M.length;
  const n = M[0]?.length ?? 0;
  const steps: Step[] = [];
  const pivots: [number, number][] = [];
  let ops = 0;
  const push = (s: Omit<Step, 'M' | 'ops' | 'pivots'>, before?: Checkpoint) => {
    if (before && steps.length) steps[steps.length - 1].checkpoint = before;
    steps.push({ ...s, M: M.map((r) => [...r]), ops, pivots: [...pivots] });
  };
  const row = (i: number) => `(${M[i].map((x) => fmt(x)).join(', ')})`;

  push({
    line: 6,
    focus: {},
    note: `A has ${m} row${m === 1 ? '' : 's'} and ${n} column${n === 1 ? '' : 's'}, so its columns are ${n} vector${n === 1 ? '' : 's'} with ${m} part${m === 1 ? '' : 's'} each. The rank is how many independent directions those columns give. Elimination finds it: work column by column, clearing the entries under each pivot.`,
  });

  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    const p = M.findIndex((x, i) => i >= r && Math.abs(x[c]) > ZERO);
    const hasPivot = askInOrder(`Is there a pivot in column ${c + 1}: a non-zero entry in row ${r + 1} or below?`, ['Yes', 'No'], p < 0 ? 'No' : 'Yes');
    if (p < 0) {
      push(
        {
          line: 7,
          focus: { empty: { col: c, from: r } },
          note: `Column ${c + 1} has only 0s from row ${r + 1} down, so it has no pivot. Its direction is not new: column ${c + 1} of A is a mix of the columns before it.`,
        },
        hasPivot,
      );
      continue;
    }
    let asked: Checkpoint | undefined = hasPivot;
    if (p !== r) {
      [M[r], M[p]] = [M[p], M[r]];
      ops++;
      push(
        {
          line: 8,
          focus: { swap: [r, p] },
          note: `Row ${r + 1} has a 0 in column ${c + 1}, which can't be a pivot. Swap in row ${p + 1}, the first row below with a non-zero entry there: R${r + 1} ↔ R${p + 1}. Swapping rows never changes the rank.`,
        },
        asked,
      );
      asked = undefined;
    }
    pivots.push([r, c]);
    push(
      {
        line: 7,
        focus: { pivot: [r, c], pivotRow: r },
        note:
          r === m - 1
            ? `The pivot is ${fmt(M[r][c])}, in row ${r + 1}, column ${c + 1}. It is in the last row, so there is nothing below it to clear.`
            : M.slice(r + 1).every((x) => Math.abs(x[c]) < ZERO)
              ? `The pivot is ${fmt(M[r][c])}, in row ${r + 1}, column ${c + 1}. Everything below it is already 0.`
              : `The pivot is ${fmt(M[r][c])}, in row ${r + 1}, column ${c + 1}. Next, make every entry below it 0 by subtracting a multiple of row ${r + 1}.`,
      },
      asked,
    );
    for (let i = r + 1; i < m; i++) {
      if (Math.abs(M[i][c]) < ZERO) continue;
      const f = M[i][c] / M[r][c];
      const below = M[i][c];
      const question = ask(`R${i + 1} ← R${i + 1} − ?·R${r + 1}. What multiple of row ${r + 1} clears the ${fmt(below)}?`, fmt(f), [fmt(-f), fmt(1 / f), fmt(below), fmt(2 * f), fmt(f + 1)]);
      M[i] = M[i].map((x, j) => clean(x - f * M[r][j]));
      M[i][c] = 0;
      ops++;
      push(
        {
          line: 8,
          focus: { pivot: [r, c], pivotRow: r, row: i },
          note: `R${i + 1} ← R${i + 1} ${f < 0 ? '+' : '−'} ${fmt(Math.abs(f))}·R${r + 1}: ${fmt(below)} ${f < 0 ? '+' : '−'} ${fmt(Math.abs(f))} × ${fmt(M[r][c])} = 0. Row ${i + 1} is now ${row(i)}. Subtracting a multiple of one row from another never changes the rank.`,
        },
        question,
      );
    }
    r++;
  }

  const rank = pivots.length;
  const deps = dependencies(A);
  const pivotCols = pivots.map(([, c]) => c + 1);
  const wrong = [rank - 1, rank + 1, rank - 2, Math.min(m, n), 0].filter((k, i, all) => k >= 0 && k <= Math.min(m, n) && k !== rank && all.indexOf(k) === i).map(String);
  const depText = deps.length === 0 ? `Every column has a pivot, so the ${n} columns are independent.` : `Columns without a pivot are mixes of earlier ones: ${deps.map(dependencyText).join('; ')}.`;
  const reach = rank === 0 ? 'nothing but the origin' : rank === 1 ? 'a line' : rank === 2 ? 'a plane' : rank === 3 ? 'all of 3D space: 3 independent directions' : `a space with ${rank} independent directions`;
  push(
    {
      line: 9,
      focus: {},
      note: `${rank} pivot${rank === 1 ? '' : 's'} (in column${pivotCols.length === 1 ? '' : 's'} ${pivotCols.join(', ') || 'none'}), so rank A = ${rank}. ${depText} The columns reach ${reach}.`,
    },
    ask('How many pivots, so what is the rank of A?', String(rank), wrong),
  );
  return steps;
}

function* rankStory(A: Matrix): Generator<Frame<PlotState>> {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  for (const s of rankSteps(A)) {
    const f = s.focus;
    const boxes: ImageBox[] = [];
    if (f.pivotRow !== undefined) boxes.push({ id: 'pivotrow', x: 0, y: f.pivotRow, w: n, h: 1, mark: 'compare' });
    if (f.row !== undefined) boxes.push({ id: 'row', x: 0, y: f.row, w: n, h: 1, mark: 'write' });
    if (f.pivot) boxes.push({ id: 'pivot', x: f.pivot[1], y: f.pivot[0], w: 1, h: 1, mark: 'pivot' });
    if (f.swap) boxes.push({ id: 'swap1', x: 0, y: f.swap[0], w: n, h: 1, mark: 'swap' }, { id: 'swap2', x: 0, y: f.swap[1], w: n, h: 1, mark: 'swap' });
    if (f.empty) boxes.push({ id: 'empty', x: f.empty.col, y: f.empty.from, w: 1, h: m - f.empty.from, mark: 'reject' });
    const done = new Set(s.pivots.map(([i, j]) => `${i}:${j}`));
    const image = matrixImage('A', `A (${m}×${n}), being eliminated`, s.M, { lit: (i, j) => (done.has(`${i}:${j}`) ? LIT : 0), boxes });
    yield plotFrame(
      [
        image,
        readouts([
          { id: 'pivots', label: 'pivots found', value: String(s.pivots.length), mark: 'pivot' },
          { id: 'ops', label: 'row operations', value: String(s.ops) },
        ]),
      ],
      { line: s.line, note: s.note, vars: { pivots: s.pivots.length, 'row ops': s.ops }, ...(s.checkpoint && { checkpoint: s.checkpoint }) },
    );
  }
}

function* run(input: SpanInput): Generator<Frame<PlotState>> {
  if (input.story === 'span') yield* spanStory(input.u, input.v, input.w);
  else yield* rankStory(input.A);
}

// ───────────────────────────── custom text and dragging ─────────────────────────────

const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const within = (v: Vec, lim: number) => v.every((x) => isHalf(x) && Math.abs(x) <= lim);
const nonZero = (v: Vec) => v[0] !== 0 || v[1] !== 0;

/** The matrices written as [[…], […]] in the text, each a list of rows. */
function matricesIn(text: string): number[][][] {
  return [...text.replace(/−/g, '-').matchAll(/\[\s*\[[^[\]]*\](?:\s*,\s*\[[^[\]]*\])*\s*\]/g)].map((m) => [...m[0].matchAll(/\[([^[\]]*)\]/g)].map((r) => numbersIn(r[1])));
}

export function parseSpan(text: string): { value: SpanInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  if (word === 'rank') {
    const ms = matricesIn(text);
    if (ms.length !== 1) return { error: 'Give one matrix as a list of rows, e.g. rank [[1, 2], [2, 4]].' };
    const A = ms[0];
    if (A.length === 0 || A.some((r) => r.length !== A[0].length || r.length === 0)) return { error: 'Every row of the matrix needs the same number of entries.' };
    if (A.length > LIMITS.size || A[0].length > LIMITS.size) return { error: `Keep the matrix at most ${LIMITS.size}×${LIMITS.size}.` };
    if (!A.flat().every((x) => Number.isInteger(x) && Math.abs(x) <= LIMITS.entry)) return { error: `Use whole numbers from −${LIMITS.entry} to ${LIMITS.entry}.` };
    return { value: { story: 'rank', A } };
  }
  if (word !== 'span') return { error: 'Start with span (then u, v and w) or rank (then a matrix).' };
  const xs = numbersIn(text);
  if (xs.length !== 6) return { error: 'Give u, v and w, two numbers each, e.g. span 2 1, 1 2, 0 3.' };
  const u: Vec = [xs[0], xs[1]];
  const v: Vec = [xs[2], xs[3]];
  const w: Vec = [xs[4], xs[5]];
  if (!within(u, LIMITS.vector) || !within(v, LIMITS.vector) || !nonZero(u) || !nonZero(v)) return { error: `u and v are halves from −${LIMITS.vector} to ${LIMITS.vector}, neither (0, 0).` };
  if (!within(w, LIMITS.target)) return { error: `w's parts are halves from −${LIMITS.target} to ${LIMITS.target}.` };
  return { value: { story: 'span', u, v, w } };
}

const written = (M: Matrix) => `[${M.map((r) => `[${r.map((x) => plain(x)).join(', ')}]`).join(', ')}]`;
function format(input: SpanInput): string {
  if (input.story === 'rank') return `rank ${written(input.A)}`;
  const p = (v: Vec) => `${plain(v[0])} ${plain(v[1])}`;
  return `span ${p(input.u)}, ${p(input.v)}, ${p(input.w)}`;
}

const snap = (x: number, lim: number) => Math.max(-lim, Math.min(lim, Math.round(x * 2) / 2)) + 0;

export function dragSpan(input: SpanInput, id: string, to: Vec): SpanInput {
  if (input.story !== 'span') return input;
  if (id === 'w') return { ...input, w: [snap(to[0], LIMITS.target), snap(to[1], LIMITS.target)] };
  const t: Vec = [snap(to[0], LIMITS.vector), snap(to[1], LIMITS.vector)];
  if (!nonZero(t)) return input;
  if (id === 'u') return { ...input, u: t };
  if (id === 'v') return { ...input, v: t };
  return input;
}

const example = (id: string, label: string, input: SpanInput) => ({ id, label, make: () => input, sized: false });

export const span = defineAlgorithm<SpanInput, PlotState>({
  kind: 'algorithm',
  slug: 'span',
  view: 'plot',
  input: {
    examples: [
      example('span', 'Two directions reach the plane', { story: 'span', u: [2, 1], v: [1, 2], w: [0, 3] }),
      example('parallel', 'Two vectors on one line', { story: 'span', u: [2, 1], v: [-2, -1], w: [1, 3] }),
      example('rank', 'Rank by elimination: a repeated direction', {
        story: 'rank',
        A: [
          [1, 2, 1],
          [2, 4, 3],
          [3, 6, 5],
        ],
      }),
      example('rank-full', 'Rank by elimination: a swap, then full rank', {
        story: 'rank',
        A: [
          [0, 2, 1],
          [1, 1, 0],
          [2, 1, 3],
        ],
      }),
    ],
    custom: {
      label: 'span then u, v and w (halves), or rank then a matrix as rows (whole numbers, up to 4×4)',
      placeholder: 'e.g. span 2 1, 1 2, 0 3  or  rank [[1, 2], [2, 4]]',
      parse: parseSpan,
      format,
    },
    drag: dragSpan,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Whole-number combinations of u and v, and matrix entries' },
    { tone: 1, label: 'u, and its multiples' },
    { tone: 2, label: 'v' },
    { mark: 'key', label: 'The target w' },
    { mark: 'found', label: 'A combination reached, or the rank' },
    { mark: 'path', label: 'The span, when it is only a line' },
    { mark: 'reject', label: 'Out of reach, or a column with no pivot' },
    { mark: 'pivot', label: 'A pivot' },
    { mark: 'compare', label: 'The pivot row' },
    { mark: 'write', label: 'The row being cleared' },
    { mark: 'swap', label: 'Two rows being swapped' },
  ],
  run,
  content: {
    idea: 'The span of some vectors is every point their combinations a·u + b·v + … can reach. Two vectors in the plane span the whole plane unless one is a multiple of the other, when they span only a line. The rank of a matrix is how many independent directions its columns give, and elimination counts it as the number of pivots.',
    invariant: 'Independent vectors that span a space are a basis for it: every point has exactly one recipe. Swapping rows and subtracting a multiple of one row from another never change the rank, so the pivots in the echelon form count it. A column with no pivot is a mix of the pivot columns before it.',
    whenToUse: 'Deciding whether Ax = b has a solution (b must be in the span of A’s columns) and whether it is unique (rank = number of columns); spotting repeated or redundant features in data, which make a column a mix of others; and reasoning about low-rank matrices, which compress images and fine-tune large models.',
    traits: [
      { label: 'Span: every combination', good: null },
      { label: 'Basis: independent, and spans', good: null },
      { label: 'Rank = pivots = independent columns', good: null },
    ],
    experiments: [
      { example: 'span', prompt: 'Drag v until the tilted grid collapses onto a line. What is det [u v] then?' },
      { example: 'parallel', prompt: 'Drag w onto the line. How many recipes does it have now?' },
      { example: 'rank', prompt: 'Change the 3 in the middle row so that column 3 is a mix of column 1 too. What is the rank now?' },
      { example: 'rank-full', prompt: 'Predict each multiple before the row operation. Which entry makes the swap necessary?' },
    ],
  },
});

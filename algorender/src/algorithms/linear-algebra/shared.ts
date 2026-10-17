import type { InputSpec } from '@/engine/module';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import { fmt, round } from '@/viz/plot/geometry';
import type { Mat2, PlotPart, PlotState, Vec } from '@/viz/plot/types';

export const IDENTITY: Mat2 = [1, 0, 0, 1];

export const det = ([a, b, c, d]: Mat2) => a * d - b * c;
export const col1 = (m: Mat2): Vec => [m[0], m[2]];
export const col2 = (m: Mat2): Vec => [m[1], m[3]];
export const transpose = ([a, b, c, d]: Mat2): Mat2 => [a, c, b, d];
export const add = (u: Vec, v: Vec): Vec => [u[0] + v[0], u[1] + v[1]];
export const scale = (k: number, v: Vec): Vec => [k * v[0], k * v[1]];
export const dot = (u: Vec, v: Vec) => u[0] * v[0] + u[1] * v[1];
export const norm = (v: Vec) => Math.hypot(v[0], v[1]);

/** The matrix a fraction t of the way from the identity to m: what the plane looks like mid-move. */
export const blend = (m: Mat2, t: number): Mat2 => [1 + (m[0] - 1) * t, m[1] * t, m[2] * t, 1 + (m[3] - 1) * t];

/** Real eigenvalues of m, largest first (none for a rotation-like matrix). */
export function eigenvalues([a, b, c, d]: Mat2): number[] {
  const tr = a + d;
  const disc = tr * tr - 4 * (a * d - b * c);
  if (disc < -1e-12) return [];
  const r = Math.sqrt(Math.max(0, disc));
  return r < 1e-12 ? [tr / 2] : [(tr + r) / 2, (tr - r) / 2];
}

/** A unit vector v with (m − λI)v = 0, pointing into the right half-plane (or straight up). */
export function eigenvector([a, b, c, d]: Mat2, lambda: number): Vec {
  // Each row of m − λI is perpendicular to v; use the longer row for stability.
  const r1: Vec = [a - lambda, b];
  const r2: Vec = [c, d - lambda];
  const row = norm(r1) >= norm(r2) ? r1 : r2;
  let v: Vec = norm(row) < 1e-12 ? [1, 0] : [-row[1], row[0]];
  const n = norm(v);
  v = [v[0] / n, v[1] / n];
  return v[0] < -1e-12 || (Math.abs(v[0]) <= 1e-12 && v[1] < 0) ? [-v[0], -v[1]] : v;
}

/**
 * A checkpoint's choices: the answer and up to three distinct wrong ones,
 * sorted so the answer's position gives nothing away. Null when the wrong
 * ones all coincide with the answer (nothing to ask).
 */
export function choices(answer: string, wrong: readonly string[], count = 4): Pick<Checkpoint, 'choices' | 'answer'> | null {
  const set = new Set([answer]);
  for (const w of wrong) if (set.size < count) set.add(w);
  if (set.size < 2) return null;
  const sorted = [...set].sort();
  return { choices: sorted, answer: sorted.indexOf(answer) };
}

export function ask(question: string, answer: string, wrong: readonly string[]): Checkpoint | undefined {
  const c = choices(answer, wrong);
  return c ? { question, ...c } : undefined;
}

/** One frame of a plot module. Math modules rebuild their parts each frame and keep no counters. */
export function plotFrame(
  parts: readonly PlotPart[],
  o: { note: string; line?: number | null; vars?: Record<string, VarValue>; checkpoint?: Checkpoint; stats?: Record<string, number> },
): Frame<PlotState> {
  return {
    state: { parts },
    line: o.line ?? null,
    note: o.note,
    vars: o.vars ?? {},
    stats: o.stats ?? {},
    ...(o.checkpoint && { checkpoint: o.checkpoint }),
  };
}

/** Every number in the text, accepting a true minus sign. */
export function numbersIn(text: string): number[] {
  return (text.replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Plain-text number for custom input (ASCII minus, at most two decimals). */
export const plain = (v: number) => String(round(v, 2));

/** Matrix and vector entries a learner may choose. */
export const ENTRY_MAX = 4;

export type MatrixInput = { m: Mat2; v: Vec };

/** Custom input "[[a, b], [c, d]], v = (x, y)": four numbers for the matrix and an optional two for v. */
export function matrixCustom(defaultV: Vec): NonNullable<InputSpec<MatrixInput>['custom']> {
  return {
    label: `Matrix rows and a vector (entries −${ENTRY_MAX} to ${ENTRY_MAX})`,
    placeholder: 'e.g. [[2, 1], [0, 1]], v = (1, 2)',
    parse: (text) => {
      const xs = numbersIn(text);
      if (xs.length !== 4 && xs.length !== 6) return { error: 'Enter four numbers for the matrix, then optionally two for v.' };
      if (xs.some((x) => Math.abs(x) > ENTRY_MAX)) return { error: `Keep every entry between −${ENTRY_MAX} and ${ENTRY_MAX}.` };
      const r = xs.map((x) => round(x, 2));
      return { value: { m: [r[0], r[1], r[2], r[3]], v: xs.length === 6 ? [r[4], r[5]] : defaultV } };
    },
    format: ({ m, v }) => `[[${plain(m[0])}, ${plain(m[1])}], [${plain(m[2])}, ${plain(m[3])}]], v = (${plain(v[0])}, ${plain(v[1])})`,
  };
}

/** Custom input "[[a, b], [c, d]]": just a matrix. */
export const matrixOnlyCustom: NonNullable<InputSpec<Mat2>['custom']> = {
  label: `Matrix rows (entries −${ENTRY_MAX} to ${ENTRY_MAX})`,
  placeholder: 'e.g. [[2, 1], [1, 2]]',
  parse: (text) => {
    const xs = numbersIn(text);
    if (xs.length !== 4) return { error: 'Enter four numbers: the first row, then the second.' };
    if (xs.some((x) => Math.abs(x) > ENTRY_MAX)) return { error: `Keep every entry between −${ENTRY_MAX} and ${ENTRY_MAX}.` };
    const r = xs.map((x) => round(x, 2));
    return { value: [r[0], r[1], r[2], r[3]] };
  },
  format: (m) => `[[${plain(m[0])}, ${plain(m[1])}], [${plain(m[2])}, ${plain(m[3])}]]`,
};

/** Readable matrix entries for the matrix panel. */
export const entries = (m: Mat2) => m.map((x) => fmt(x));

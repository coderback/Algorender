// Property tests for determinants and inverses (B3 of the math and ML path):
// the area story against ad − bc, the squash story against a matrix with
// dependent columns, the inverse against the identity, and Gaussian
// elimination against cofactor determinants and the original equations.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, Mat2, PlotState, Vec } from '@/viz/plot/types';
import { dragInverse, eliminate, formatInverse, inverse2, inverseMatrix, matVec, mul2, parseInverse, solveSystem, squashMatrix, squashPoints, type InverseInput, type Matrix } from './inverse-matrix';
import { det } from './shared';

const num = (s: string | undefined) => Number((s ?? 'NaN').replace(/−/g, '-'));
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const closeAll = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.length === b.length && a.every((x, i) => close(x, b[i], eps));

function roundTrips(input: InverseInput) {
  const text = formatInverse(input);
  expect(parseInverse(text), text).toEqual({ value: input });
}

/** Cofactor expansion along the first row: the reference determinant. */
function cofactorDet(A: Matrix): number {
  const n = A.length;
  if (n === 1) return A[0][0];
  let s = 0;
  for (let j = 0; j < n; j++) {
    const minor = A.slice(1).map((r) => r.filter((_, k) => k !== j));
    s += (j % 2 ? -1 : 1) * A[0][j] * cofactorDet(minor);
  }
  return s;
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);
const mat2 = fc.tuple(half(-4, 4), half(-4, 4), half(-4, 4), half(-4, 4)) as fc.Arbitrary<Mat2>;
const entry = fc.integer({ min: -9, max: 9 });
const square = (n: number) => fc.array(fc.array(entry, { minLength: n, maxLength: n }), { minLength: n, maxLength: n }) as fc.Arbitrary<Matrix>;
const system = fc.integer({ min: 2, max: 4 }).chain((n) => fc.tuple(square(n), fc.array(entry, { minLength: n, maxLength: n })));

describe('inverse-matrix', () => {
  it('plays every example, round-trips its text and survives every drag', () => {
    for (const ex of inverseMatrix.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as InverseInput;
      const frames = traceOf(inverseMatrix, input).frames as { state: PlotState }[];
      expectGoodPlotTrace(inverseMatrix, frames as never);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            const to: Vec = [Math.min(h.max[0], h.at[0] + h.step), Math.max(h.min[1], h.at[1] - h.step)];
            const moved = dragInverse(input, h.id, to);
            const again = traceOf(inverseMatrix, moved).frames;
            expectGoodPlotTrace(inverseMatrix, again);
            roundTrips(moved);
            expect(again.length, `${ex.id} dragging ${h.id}`).toBe(frames.length);
          }
        }
    }
  });

  it('reads the area scale as ad − bc, its sign as a flip, and scales the half square by |det A|', () => {
    fc.assert(
      fc.property(mat2, (m) => {
        const input: InverseInput = { story: 'area', m };
        roundTrips(input);
        const frames = traceOf(inverseMatrix, input).frames;
        expectGoodPlotTrace(inverseMatrix, frames);
        const D = m[0] * m[3] - m[1] * m[2];
        expect(planeOf(frames[1].state).warp).toEqual(m);
        expect(num(readout(frames[1].state, 'det'))).toBeCloseTo(D, 2);
        expect(Math.abs(num(readout(frames[3].state, 'tri')) - Math.abs(D) / 2)).toBeLessThanOrEqual(0.0051);
        // Nothing to ask for the zero matrix: every wrong choice is 0 too.
        const c0 = frames[0].checkpoint;
        if (c0) expect(num(c0.choices[c0.answer])).toBeCloseTo(D, 2);
        else expect(new Set([D, m[0] * m[3] + m[1] * m[2], m[0] * m[3], m[0] * m[2] - m[1] * m[3], m[0] + m[3]].map((x) => x + 0)).size).toBe(1);
        const c1 = frames[1].checkpoint;
        if (Math.abs(D) < 1e-9) expect(c1).toBeUndefined();
        else expect(c1!.choices[c1!.answer]).toBe(D < 0 ? 'Yes' : 'No');
      }),
      { numRuns: 60 },
    );
  });

  it('squashes the plane when the columns share a line: det 0, no inverse, three points on one spot', () => {
    fc.assert(
      fc.property(fc.tuple(half(-2, 2), half(-2, 2)).filter(([x, y]) => x !== 0 || y !== 0) as fc.Arbitrary<Vec>, half(-2, 2), (u, k) => {
        const m = squashMatrix(u, k);
        expect(det(m)).toBeCloseTo(0, 12);
        expect(inverse2(m)).toBeNull();
        const landed = squashPoints(k).map((p) => apply(m, p));
        for (const p of landed) expect(closeAll(p, u)).toBe(true);
        const input: InverseInput = { story: 'squash', u, k };
        roundTrips(input);
        const frames = traceOf(inverseMatrix, input).frames;
        expectGoodPlotTrace(inverseMatrix, frames);
        expect(frames[1].checkpoint!.choices[frames[1].checkpoint!.answer]).toBe('No');
      }),
      { numRuns: 60 },
    );
  });

  it('undoes A with (1/det A)·[[d, −b], [−c, a]]: A⁻¹A = AA⁻¹ = I and det A⁻¹ = 1/det A', () => {
    fc.assert(
      fc.property(
        mat2.filter((m) => Math.abs(det(m)) > 1e-9),
        (m) => {
          const inv = inverse2(m)!;
          expect(closeAll(mul2(inv, m), [1, 0, 0, 1])).toBe(true);
          expect(closeAll(mul2(m, inv), [1, 0, 0, 1])).toBe(true);
          expect(det(inv)).toBeCloseTo(1 / det(m), 9);
          const input: InverseInput = { story: 'undo', m };
          roundTrips(input);
          const frames = traceOf(inverseMatrix, input).frames;
          expectGoodPlotTrace(inverseMatrix, frames);
          expect(closeAll(planeOf(frames[3].state).warp!, [1, 0, 0, 1])).toBe(true);
          expect(planeOf(frames[4].state).warp).toEqual(inv);
        },
      ),
      { numRuns: 60 },
    );
    expect(parseInverse('undo [[1, 2], [2, 4]]')).toHaveProperty('error');
  });

  it('solves Ax = b by elimination: x satisfies every equation, det matches cofactors, pivots are the biggest entries', () => {
    fc.assert(
      fc.property(system, ([A, b]) => {
        const input: InverseInput = { story: 'eliminate', A, b };
        roundTrips(input);
        const frames = traceOf(inverseMatrix, input).frames;
        expectGoodPlotTrace(inverseMatrix, frames);
        const result = eliminate(A, b);
        const reference = cofactorDet(A);
        if (result.x) {
          expect(Math.abs(reference)).toBeGreaterThan(0);
          expect(closeAll(matVec(A, result.x), b, 1e-6)).toBe(true);
          expect(result.det).toBeCloseTo(reference, 6);
          // The last frame checks A·x against b and reads det A off the pivots.
          expect(frames[frames.length - 1].note).toMatch(/Check with the original equations/);
        } else {
          expect(reference).toBe(0);
          expect(result.det).toBe(0);
          expect(result.missing).not.toBeNull();
        }
        // Row operations never change the solution: every intermediate system is still solved by x.
        const n = A.length;
        let ops = 0;
        for (const s of result.steps) {
          if (s.kind === 'swap' || s.kind === 'eliminate') {
            ops++;
            if (result.x) for (const row of s.M) expect(close(row.slice(0, n).reduce((t, v, j) => t + v * result.x![j], 0), row[n], 1e-6)).toBe(true);
            // Below the pivot, everything this column has seen is cleared or still to clear, and the pivot is the biggest.
            if (s.kind === 'swap') for (let r = s.col; r < n; r++) expect(Math.abs(s.M[s.col][s.col])).toBeGreaterThanOrEqual(Math.abs(s.M[r][s.col]) - 1e-9);
            if (s.kind === 'eliminate') expect(s.M[s.row][s.col]).toBe(0);
          }
        }
        expect(frames[frames.length - 1].stats.rowOps).toBe(ops);
        expect(solveSystem(A, b)).toEqual(result.x);
      }),
      { numRuns: 120 },
    );
  });

  it('reaches echelon form: zeros under every pivot before back substitution', () => {
    fc.assert(
      fc.property(system, ([A, b]) => {
        const { M, x, missing } = eliminate(A, b);
        const n = A.length;
        const upto = missing ?? n;
        for (let c = 0; c < upto; c++) for (let r = c + 1; r < n; r++) expect(Math.abs(M[r][c])).toBeLessThan(1e-9);
        if (x) for (let c = 0; c < n; c++) expect(Math.abs(M[c][c])).toBeGreaterThan(1e-9);
      }),
      { numRuns: 80 },
    );
  });

  it('tells a singular system with no solution from one with infinitely many', () => {
    const none = traceOf(inverseMatrix, { story: 'eliminate', A: [[1, 2], [2, 4]], b: [3, 5] }).frames;
    expect(readout(none[none.length - 1].state, 'x')).toBe('no solution');
    const many = traceOf(inverseMatrix, { story: 'eliminate', A: [[1, 2], [2, 4]], b: [3, 6] }).frames;
    expect(readout(many[many.length - 1].state, 'x')).toBe('infinitely many');
  });

  it('swaps a zero pivot away, and the matrix image shows each step’s numbers', () => {
    const input = inverseMatrix.input.examples.find((e) => e.id === 'pivot')!.make({ seed: 0, size: 0 }) as Extract<InverseInput, { story: 'eliminate' }>;
    const result = eliminate(input.A, input.b);
    const swap = result.steps.find((s) => s.kind === 'swap');
    expect(swap).toBeDefined();
    const frames = traceOf(inverseMatrix, input).frames;
    const swapFrame = frames.find((f) => /can’t divide by 0/.test(f.note));
    expect(swapFrame).toBeDefined();
    const image = swapFrame!.state.parts.find((p) => p.kind === 'image') as ImagePart;
    expect(image.values!.map(num)).toEqual(swap!.kind === 'swap' ? swap!.M.flat() : []);
  });

  it('refuses text it can’t draw', () => {
    for (const bad of ['area [[1, 2, 3], [4, 5, 6]]', 'squash 0 0 1', 'squash 1 1', 'eliminate [[1, 2], [3, 4]] [1]', 'eliminate [[1, 2, 3], [4, 5, 6]] [1, 2]', 'eliminate [[10, 0], [0, 1]] [1, 1]', 'hello'])
      expect(parseInverse(bad), bad).toHaveProperty('error');
  });
});

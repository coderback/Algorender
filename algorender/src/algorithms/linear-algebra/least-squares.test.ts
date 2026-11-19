// Property tests for least squares (B3 of the math and ML path): the shadow
// is the closest point with its gap at right angles, the normal equations
// give weights no nudge can beat, and every frame says what it draws.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Shape, Vec } from '@/viz/plot/types';
import { design, fitPoints, leastSquares, lstsq, normalEquations, parseLsq, predict, residuals, solveSystem, sse, type LsqInput } from './least-squares';
import { dot, norm } from './shared';

const num = (s: string | undefined) => Number((s ?? 'NaN').replace(/−/g, '-'));
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const shapeIn = (state: PlotState, id: string): Shape | undefined => planeOf(state).shapes.find((s) => s.id === id);

function roundTrips(input: LsqInput) {
  const custom = leastSquares.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);
const vec = (lim: number) => fc.tuple(half(-lim, lim), half(-lim, lim)) as fc.Arbitrary<Vec>;
const point = fc.tuple(half(0, 6), half(0, 6)) as fc.Arbitrary<Vec>;
const dataset = (min: number, distinct: number) => fc.array(point, { minLength: min, maxLength: 8 }).filter((ps) => new Set(ps.map((p) => p[0])).size >= distinct);

describe('least-squares', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of leastSquares.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as LsqInput;
      const frames = traceOf(leastSquares, input).frames;
      expectGoodPlotTrace(leastSquares, frames);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [
              [h.at[0] + h.step, h.at[1] - h.step],
              [h.min[0], h.max[1]],
              [0, 0],
            ] as Vec[]) {
              const moved = leastSquares.input.drag!(input as never, h.id, to) as LsqInput;
              const again = traceOf(leastSquares, moved).frames;
              expectGoodPlotTrace(leastSquares, again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id}`).toBe(frames.length);
            }
          }
        }
    }
  });

  it('refuses inputs with no single answer', () => {
    expect(parseLsq('shadow 0 0, 1 1')).toHaveProperty('error');
    expect(parseLsq('line 2 1, 2 3, 2 5')).toHaveProperty('error');
    expect(parseLsq('quadratic 1 1, 1 2, 3 3, 3 4')).toHaveProperty('error');
    expect(parseLsq('line 1 1, 2 2')).toHaveProperty('error');
    expect(parseLsq('line 1 1, 2 2, 7 3')).toHaveProperty('error');
    // A drag that would stack every x refuses to move.
    const input: LsqInput = { story: 'line', points: [[1, 1], [2, 2], [2, 3]] };
    expect(leastSquares.input.drag!(input as never, 'p0', [2, 4])).toBe(input);
  });

  it('drops y onto a’s line: the shadow is t·a with t = a·y / a·a, the gap is at right angles and the shortest', () => {
    fc.assert(
      fc.property(
        vec(4).filter((a) => a[0] !== 0 || a[1] !== 0),
        vec(4),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (a, y, s) => {
          const input: LsqInput = { story: 'shadow', a, y };
          const frames = traceOf(leastSquares, input).frames;
          expectGoodPlotTrace(leastSquares, frames);
          roundTrips(input);
          const t = dot(a, y) / dot(a, a);
          const p = shapeIn(frames[2].state, 'p');
          expect(p?.kind === 'point' && close(p.at[0], t * a[0]) && close(p.at[1], t * a[1])).toBe(true);
          const e: Vec = [y[0] - t * a[0], y[1] - t * a[1]];
          expect(Math.abs(dot(e, a))).toBeLessThan(1e-9);
          expect(num(readout(frames[3].state, 'ea'))).toBe(0);
          // No point s·a on the line is closer to y.
          expect(norm(e)).toBeLessThanOrEqual(norm([y[0] - s * a[0], y[1] - s * a[1]]) + 1e-9);
          // The second frame's answer is t.
          const c = frames[1].checkpoint;
          // (Shown to hundredths, so −0.125 may read −0.12.)
          if (c) expect(Math.abs(num(c.choices[c.answer]) - t)).toBeLessThanOrEqual(0.005 + 1e-9);
          // Moving y along a moves nothing but the shadow: the gap stays.
          expect(readout(frames[4].state, 'e2')).toBe(readout(frames[4].state, 'e'));
        },
      ),
    );
  });

  it('solves square systems by elimination, swapping rows when a pivot is 0', () => {
    expect(solveSystem([[0, 1], [1, 0]], [2, 3])).toEqual([3, 2]);
    expect(solveSystem([[1, 2], [2, 4]], [1, 2])).toBeNull();
    fc.assert(
      fc.property(fc.array(fc.array(fc.integer({ min: -5, max: 5 }), { minLength: 3, maxLength: 3 }), { minLength: 3, maxLength: 3 }), fc.array(fc.integer({ min: -5, max: 5 }), { minLength: 3, maxLength: 3 }), (A, b) => {
        const x = solveSystem(A, b);
        if (!x) return;
        A.forEach((row, i) => expect(row.reduce((s, v, k) => s + v * x[k], 0)).toBeCloseTo(b[i], 6));
      }),
    );
  });

  it('fits weights whose residuals are at right angles to every column, and no nudge does better', () => {
    fc.assert(
      fc.property(dataset(3, 2), fc.integer({ min: 1, max: 2 }), fc.integer({ min: 0, max: 2 }), fc.double({ min: -0.5, max: 0.5, noNaN: true }), (points, degree, k, d) => {
        if (new Set(points.map((p) => p[0])).size <= degree) return;
        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        const X = design(xs, degree);
        const w = lstsq(X, ys)!;
        const e = residuals(points, w);
        for (let c = 0; c <= degree; c++) expect(Math.abs(e.reduce((s, r, i) => s + r * X[i][c], 0))).toBeLessThan(1e-6);
        const nudged = w.map((v, i) => (i === Math.min(k, degree) ? v + d : v));
        expect(sse(points, nudged)).toBeGreaterThanOrEqual(sse(points, w) - 1e-6);
        // Each entry of XᵀX is a column dotted with a column.
        const { XtX, Xty } = normalEquations(X, ys);
        expect(XtX[0][0]).toBe(points.length);
        expect(Xty[0]).toBeCloseTo(ys.reduce((s, v) => s + v, 0), 9);
      }),
    );
  });

  it('draws the line story from its own numbers: n, Σxy, the slope, Σe = 0 and a nudge that costs', () => {
    fc.assert(
      fc.property(dataset(3, 2), (points) => {
        const input: LsqInput = { story: 'line', points };
        const frames = traceOf(leastSquares, input).frames;
        expectGoodPlotTrace(leastSquares, frames);
        roundTrips(input);
        const w = fitPoints(points, 1)!;
        const answer = (i: number) => {
          const c = frames[i].checkpoint!;
          return c.choices[c.answer];
        };
        const exact = residuals(points, w).every((r) => Math.abs(r) < 1e-9);
        expect(answer(0)).toBe(exact ? 'Yes' : 'No');
        expect(num(answer(1))).toBe(points.length);
        expect(num(answer(2))).toBeCloseTo(points.reduce((s, [x, y]) => s + x * y, 0), 2);
        expect(answer(3)).toBe(fmt(w[1]));
        expect(answer(4)).toBe('It goes up');
        expect(num(readout(frames[4].state, 'sum'))).toBe(0);
        expect(num(readout(frames[4].state, 'xsum'))).toBe(0);
        expect(num(readout(frames[5].state, 'nsse'))).toBeGreaterThan(num(readout(frames[5].state, 'sse')) - 1e-3);
        // Every residual gap joins a point to the line, straight up or down.
        for (const s of planeOf(frames[4].state).shapes)
          if (s.id.startsWith('res') && s.kind === 'path') {
            expect(s.points[0][0]).toBe(s.points[1][0]);
            expect(s.points[1][1]).toBeCloseTo(predict(w, s.points[0][0]), 9);
          }
      }),
      { numRuns: 60 },
    );
  });

  it('bends the fit with x²: never worse than the line, and right angles to all three columns', () => {
    fc.assert(
      fc.property(dataset(4, 3), (points) => {
        const input: LsqInput = { story: 'quadratic', points };
        const frames = traceOf(leastSquares, input).frames;
        expectGoodPlotTrace(leastSquares, frames);
        roundTrips(input);
        const line = sse(points, fitPoints(points, 1)!);
        const curve = sse(points, fitPoints(points, 2)!);
        expect(curve).toBeLessThanOrEqual(line + 1e-9);
        const c = frames[2].checkpoint!;
        expect(c.choices[c.answer]).toBe(curve < line - 1e-9 ? 'Smaller' : 'The same');
        expect(readout(frames[3].state, 'xte')).toBe('(0, 0, 0)');
        expect(num(frames[1].checkpoint!.choices[frames[1].checkpoint!.answer])).toBeCloseTo(points.reduce((s, [x]) => s + x * x, 0), 2);
      }),
      { numRuns: 60 },
    );
  });
});

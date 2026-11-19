// Property tests for the change-of-basis visualiser (B3 of the math and ML
// path): the coordinates it draws and narrates against the arithmetic, on
// random bases, vectors and matrices.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { Mat2, PlotState, Vec } from '@/viz/plot/types';
import { basisMatrix, changeOfBasis, coordsIn, diagonalised, eigenbasisOf, fromCoords, inverse2, LIMITS, parseCob, type CobInput } from './change-of-basis';
import { det } from './shared';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const closeVec = (a: Vec, b: Vec, eps = 1e-9) => close(a[0], b[0], eps) && close(a[1], b[1], eps);
const mul2 = ([a, b, c, d]: Mat2, [e, f, g, h]: Mat2): Mat2 => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
const closeMat = (x: Mat2, y: Mat2, eps = 1e-9) => x.every((v, i) => close(v, y[i], eps));

const frames = (input: CobInput) => traceOf(changeOfBasis, input).frames as { state: PlotState; note: string; checkpoint?: { choices: readonly string[]; answer: number } }[];
const answer = (f: { checkpoint?: { choices: readonly string[]; answer: number } }) => f.checkpoint!.choices[f.checkpoint!.answer];
const shape = (state: PlotState, id: string, plane = 'plane') => planeOf(state, plane).shapes.find((s) => s.id === id);

function roundTrips(input: CobInput) {
  const custom = changeOfBasis.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);
const vec = (lim: number) => fc.tuple(half(-lim, lim), half(-lim, lim)) as fc.Arbitrary<Vec>;
const basis = fc.tuple(vec(LIMITS.basis), vec(LIMITS.basis)).filter(([b1, b2]) => Math.abs(det(basisMatrix(b1, b2))) >= LIMITS.minDet);
const matrix = fc.tuple(half(-4, 4), half(-4, 4), half(-4, 4), half(-4, 4)) as fc.Arbitrary<Mat2>;

describe('change-of-basis', () => {
  it('plays every example, round-trips its text and survives every drag', () => {
    for (const ex of changeOfBasis.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as CobInput;
      const fs = frames(input);
      expectGoodPlotTrace(changeOfBasis, fs as never);
      roundTrips(input);
      for (const f of fs)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [
              [Math.min(h.max[0], h.at[0] + h.step), Math.max(h.min[1], h.at[1] - h.step)],
              [h.max[0], h.max[1]],
              [0, 0],
            ] as Vec[]) {
              const moved = changeOfBasis.input.drag!(input as never, h.id, to) as CobInput;
              const again = frames(moved);
              expectGoodPlotTrace(changeOfBasis, again as never);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id}`).toBe(fs.length);
            }
          }
        }
    }
  });

  it('solves v = c₁·b₁ + c₂·b₂, and P⁻¹ undoes P', () => {
    fc.assert(
      fc.property(basis, vec(LIMITS.v), ([b1, b2], v) => {
        const c = coordsIn(b1, b2, v);
        expect(closeVec(fromCoords(b1, b2, c), v)).toBe(true);
        const P = basisMatrix(b1, b2);
        const Pinv = inverse2(P)!;
        expect(closeMat(mul2(Pinv, P), [1, 0, 0, 1])).toBe(true);
        expect(closeVec(apply(Pinv, v), c)).toBe(true);
        expect(closeVec(apply(P, c), v)).toBe(true);
        // Listing the basis the other way round swaps the coordinates.
        expect(closeVec(coordsIn(b2, b1, v), [c[1], c[0]])).toBe(true);
      }),
    );
    expect(inverse2([1, 2, 2, 4])).toBeNull();
  });

  it('draws v tip to tail along b₁ then b₂, reads out c, and asks for c₁, P·c and P⁻¹ honestly', () => {
    fc.assert(
      fc.property(basis, vec(LIMITS.v), ([b1, b2], v) => {
        const input: CobInput = { story: 'coords', b1, b2, v };
        const fs = frames(input);
        expectGoodPlotTrace(changeOfBasis, fs as never);
        roundTrips(input);
        const c = coordsIn(b1, b2, v);
        expect(planeOf(fs[1].state).warp).toEqual(basisMatrix(b1, b2));
        expect(answer(fs[1])).toBe(fmt(c[0]));
        expect(answer(fs[2])).toBe(fmtVec(v));
        expect(answer(fs[3])).toBe('P⁻¹');
        expect(answer(fs[4])).toBe(fmtVec([c[1], c[0]]));
        for (const f of fs.slice(2)) expect(readout(f.state, 'c')).toBe(fmtVec(c));
        const s2 = shape(fs[2].state, 's2');
        const v2 = shape(fs[2].state, 'v');
        if (s2?.kind !== 'vector' || v2?.kind !== 'vector') throw new Error('no steps');
        expect(closeVec(s2.to, v2.to, 0.02)).toBe(true);
        expect(readout(fs[4].state, 'det')).toBe(fmt(det(basisMatrix(b1, b2))));
        // The arrow v never moves while the grid changes.
        for (const f of fs) {
          const s = shape(f.state, 'v');
          expect(s?.kind === 'vector' && closeVec(s.to, v, 0.006)).toBe(true);
        }
      }),
      { numRuns: 60, examples: [[[[2, 1], [-1, 1]], [0, 0]]] },
    );
  });

  it('goes from new coordinates back to standard ones with P·c, and the arrow stays when the grid changes back', () => {
    fc.assert(
      fc.property(
        basis,
        vec(LIMITS.c),
        ([b1, b2], c) => {
          const v = fromCoords(b1, b2, c);
          fc.pre(v.every((x) => Math.abs(x) <= 5));
          const input: CobInput = { story: 'back', b1, b2, c };
          const fs = frames(input);
          expectGoodPlotTrace(changeOfBasis, fs as never);
          roundTrips(input);
          expect(answer(fs[0])).toBe(fmtVec(v));
          expect(answer(fs[1])).toBe('P');
          expect(answer(fs[2])).toBe(fmtVec([v[0] + b2[0], v[1] + b2[1]]));
          expect(readout(fs[3].state, 'v')).toBe(fmtVec(apply(basisMatrix(b1, b2), c)));
          expect(planeOf(fs[3].state).warp).toEqual([1, 0, 0, 1]);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('finds an eigenbasis where A only stretches: D = P⁻¹AP is diagonal and A = P·D·P⁻¹', () => {
    fc.assert(
      fc.property(matrix, (m) => {
        const e = eigenbasisOf(m);
        const disc = (m[0] + m[3]) ** 2 - 4 * det(m);
        if (!e) {
          expect(disc <= 1e-9, 'two different real eigenvalues were missed').toBe(true);
          expect('error' in parseCob(`eigenbasis [[${m[0]}, ${m[1]}], [${m[2]}, ${m[3]}]]`)).toBe(true);
          return;
        }
        const [l1, l2] = e.lambdas;
        expect(l1).toBeGreaterThan(l2);
        expect(closeVec(apply(m, e.b1), [l1 * e.b1[0], l1 * e.b1[1]], 1e-6)).toBe(true);
        expect(closeVec(apply(m, e.b2), [l2 * e.b2[0], l2 * e.b2[1]], 1e-6)).toBe(true);
        expect(Math.max(Math.abs(e.b1[0]), Math.abs(e.b1[1]))).toBeCloseTo(1, 9);
        const D = diagonalised(m, e);
        expect(closeMat(D, [l1, 0, 0, l2], 1e-6)).toBe(true);
        const P = basisMatrix(e.b1, e.b2);
        expect(closeMat(mul2(mul2(P, D), inverse2(P)!), m, 1e-6)).toBe(true);
        const input: CobInput = { story: 'eigenbasis', m };
        const fs = frames(input);
        expectGoodPlotTrace(changeOfBasis, fs as never);
        roundTrips(input);
        expect(answer(fs[0])).toBe(fmtVec(e.b1));
        expect(answer(fs[1])).toBe(fmtVec([l1, l2]));
        expect(answer(fs[2])).toBe(fmtVec([2 * l1, -l2]));
        expect(answer(fs[3])).toBe(`[[${fmt(l1)}, 0], [0, ${fmt(l2)}]]`);
      }),
      { numRuns: 150 },
    );
  });

  it('refuses bases on one line, matrices with no eigenbasis, and values out of range', () => {
    expect('error' in parseCob('coords (1, 2), (2, 4), v = (1, 1)')).toBe(true);
    expect('error' in parseCob('coords (1, 0), (0, 1), v = (5, 1)')).toBe(true);
    expect('error' in parseCob('back (3, 3), (-3, 3), c = (3, 3)')).toBe(true);
    expect('error' in parseCob('eigenbasis [[0, -1], [1, 0]]')).toBe(true); // a quarter turn
    expect('error' in parseCob('eigenbasis [[1, 1], [0, 1]]')).toBe(true); // a shear
    expect('error' in parseCob('eigenbasis [[2, 0], [0, 2]]')).toBe(true); // every direction
    expect('error' in parseCob('spin (1, 0), (0, 1), v = (1, 1)')).toBe(true);
    expect(parseCob('coords (2, 1), (-1, 1), v = (3, 3)')).toEqual({ value: { story: 'coords', b1: [2, 1], b2: [-1, 1], v: [3, 3] } });
  });
});

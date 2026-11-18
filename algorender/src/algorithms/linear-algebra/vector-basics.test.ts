// Property tests for B2 of the math and ML path: vectors, the dot product,
// norms and matrix multiplication. Each module's drawing is checked against
// the arithmetic it narrates, on random inputs.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { apply } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, Mat2, PlotState, Shape, Vec } from '@/viz/plot/types';
import { cosine, dotN, dotProduct, project, swept, SWEEP, WORDS, type DotInput } from './dot-product';
import { matmul, matrixMultiplication, mul2, shape, type Matrix, type MatMulInput } from './matrix-multiplication';
import { FAMILY, lp, normOf, norms, unitBall, type NormsInput } from './norms';
import { dot, norm } from './shared';
import { mean, sum, vectors, type VectorsInput } from './vectors';

const shapeIn = (state: PlotState, id: string, plane = 'plane'): Shape | undefined => planeOf(state, plane).shapes.find((s) => s.id === id);
const num = (s: string | undefined) => Number((s ?? 'NaN').replace(/−/g, '-'));
const vecOf = (s: string | undefined): Vec => {
  const m = (s ?? '').replace(/−/g, '-').match(/^\((-?[\d.]+), (-?[\d.]+)\)$/);
  if (!m) throw new Error(`not a vector: ${s}`);
  return [Number(m[1]), Number(m[2])];
};
const tipOf = (state: PlotState, id: string): Vec => {
  const s = shapeIn(state, id);
  if (s?.kind !== 'vector') throw new Error(`no vector ${id}`);
  return s.to;
};
/** −0 and 0 compare equal. */
const z = (xs: readonly number[]) => xs.map((x) => x + 0);
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const closeVec = (a: Vec, b: Vec, eps = 1e-9) => close(a[0], b[0], eps) && close(a[1], b[1], eps);

function roundTrips(module: AnyAlgorithm, input: unknown) {
  const custom = module.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** Every example plays well, and dragging any handle of any frame keeps the same number of frames and a well-formed input. */
function examplesAndDrags(module: AnyAlgorithm) {
  for (const ex of module.input.examples) {
    const input = ex.make({ seed: 0, size: 0 });
    const frames = traceOf(module, input).frames as { state: PlotState }[];
    expectGoodPlotTrace(module, frames as never);
    roundTrips(module, input);
    for (const f of frames) {
      for (const part of f.state.parts) {
        if (part.kind !== 'plane') continue;
        for (const h of part.handles) {
          const to: Vec = [Math.min(h.max[0], h.at[0] + h.step), Math.max(h.min[1], h.at[1] - h.step)];
          const moved = module.input.drag!(input as never, h.id, to);
          const again = traceOf(module, moved).frames;
          expectGoodPlotTrace(module, again);
          roundTrips(module, moved);
          if (ex.id !== 'nearest' && ex.id !== 'similar') expect(again.length, `${ex.id} dragging ${h.id}`).toBe(frames.length);
        }
      }
    }
  }
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);
const vec = (lim: number) => fc.tuple(half(-lim, lim), half(-lim, lim)) as fc.Arbitrary<Vec>;
const nonZeroVec = (lim: number) => vec(lim).filter((v) => v[0] !== 0 || v[1] !== 0);

// ───────────────────────────── vectors ─────────────────────────────

describe('vectors', () => {
  it('plays every example, round-trips its text and survives every drag', () => examplesAndDrags(vectors));

  it('draws a copy of v from anywhere with the same parts, and the way back as −v', () => {
    fc.assert(
      fc.property(vec(3), vec(3), (v, at) => {
        const input: VectorsInput = { story: 'arrow', v, at };
        const frames = traceOf(vectors, input).frames;
        expectGoodPlotTrace(vectors, frames);
        roundTrips(vectors, input);
        const copy = shapeIn(frames[1].state, 'copy');
        expect(copy?.kind === 'vector' && closeVec([copy.to[0] - copy.from[0], copy.to[1] - copy.from[1]], v)).toBe(true);
        const back = shapeIn(frames[3].state, 'back');
        expect(back?.kind === 'vector' && closeVec([back.to[0] - back.from[0], back.to[1] - back.from[1]], [-v[0], -v[1]])).toBe(true);
        expect(z(vecOf(readout(frames[2].state, 'QP')))).toEqual(z(v));
      }),
      { numRuns: 40 },
    );
  });

  it('adds part by part, in either order, and subtracts to the arrow from v to u', () => {
    fc.assert(
      fc.property(vec(3), vec(3), (u, v) => {
        const frames = traceOf(vectors, { story: 'add', u, v }).frames;
        expectGoodPlotTrace(vectors, frames);
        const w: Vec = [u[0] + v[0], u[1] + v[1]];
        expect(closeVec(tipOf(frames[1].state, 'sum'), w)).toBe(true);
        expect(closeVec(tipOf(frames[2].state, 'u-after-v'), w)).toBe(true);
        expect(closeVec(tipOf(frames[2].state, 'v-after-u'), w)).toBe(true);
        expect(closeVec(tipOf(frames[3].state, 'diff'), u)).toBe(true);
        // The first question's answer is u + v.
        const c = frames[0].checkpoint!;
        expect(z(vecOf(c.choices[c.answer]))).toEqual(z(w));
      }),
      { numRuns: 40 },
    );
  });

  it('keeps every multiple of v on its line, k times as long', () => {
    fc.assert(
      fc.property(nonZeroVec(3), half(-2, 2), (v, k) => {
        const frames = traceOf(vectors, { story: 'scale', v, k }).frames;
        expectGoodPlotTrace(vectors, frames);
        const kv = tipOf(frames[3].state, 'kv');
        expect(closeVec(kv, [k * v[0], k * v[1]])).toBe(true);
        // On v's line: the cross product with v is 0.
        expect(Math.abs(kv[0] * v[1] - kv[1] * v[0])).toBeLessThan(1e-9);
        expect(close(norm(kv), Math.abs(k) * norm(v))).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it('measures by Pythagoras, never negative, and the unit vector has length 1', () => {
    fc.assert(
      fc.property(nonZeroVec(4), (v) => {
        const frames = traceOf(vectors, { story: 'length', v }).frames;
        expectGoodPlotTrace(vectors, frames);
        expect(num(readout(frames[1].state, 'len'))).toBeCloseTo(Math.hypot(...v), 3);
        expect(num(readout(frames[3].state, 'klen'))).toBeCloseTo(Math.hypot(...v), 3);
        const unit = tipOf(frames[4].state, 'kv');
        expect(norm(unit)).toBeCloseTo(1, 9);
        expect(dot(unit, v)).toBeCloseTo(norm(v), 9);
      }),
      { numRuns: 40 },
    );
  });

  it('builds the mean as the sum scaled by 1/n', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(half(0, 5), half(0, 5)) as fc.Arbitrary<Vec>, { minLength: 2, maxLength: 4 }), (points) => {
        const frames = traceOf(vectors, { story: 'data', points }).frames;
        expectGoodPlotTrace(vectors, frames);
        const last = frames[frames.length - 1].state;
        const total = sum(points);
        expect(closeVec(tipOf(last, `step${points.length - 1}`), total)).toBe(true);
        expect(closeVec(tipOf(last, 'mean'), [total[0] / points.length, total[1] / points.length])).toBe(true);
        expect(closeVec(mean(points), [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length])).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});

// ───────────────────────────── the dot product ─────────────────────────────

describe('dot-product', () => {
  it('plays every example, round-trips its text and survives every drag', () => examplesAndDrags(dotProduct));

  it('adds the products one at a time to Σ uᵢvᵢ, each question answered by the next running total', () => {
    const lists = fc.integer({ min: 2, max: 6 }).chain((n) => fc.tuple(fc.array(half(-9, 9), { minLength: n, maxLength: n }), fc.array(half(-9, 9), { minLength: n, maxLength: n })));
    fc.assert(
      fc.property(lists, ([u, v]) => {
        const input: DotInput = { story: 'parts', u, v };
        const frames = traceOf(dotProduct, input).frames;
        expectGoodPlotTrace(dotProduct, frames);
        roundTrips(dotProduct, input);
        expect(frames).toHaveLength(u.length + 2);
        const total = u.reduce((s, x, i) => s + x * v[i], 0);
        expect(dotN(u, v)).toBe(total);
        expect(num(readout(frames[frames.length - 1].state, 'total'))).toBeCloseTo(total, 2);
        for (let i = 1; i < u.length; i++) {
          const c = frames[i].checkpoint!;
          expect(num(c.choices[c.answer])).toBeCloseTo(num(readout(frames[i + 1].state, 'total')), 2);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('asks the sign at each angle, and u·v = |u|·|v|·cos θ, zero at 90°', () => {
    fc.assert(
      fc.property(nonZeroVec(4), half(0.5, 3), (u, len) => {
        const frames = traceOf(dotProduct, { story: 'angle', u, len }).frames;
        expectGoodPlotTrace(dotProduct, frames);
        SWEEP.forEach((deg, k) => {
          const v = tipOf(frames[k].state, 'v');
          expect(closeVec(v, swept(u, len, deg), 1e-9)).toBe(true);
          expect(dot(u, v)).toBeCloseTo(norm(u) * len * Math.cos((deg * Math.PI) / 180), 9);
          if (k > 0) {
            const c = frames[k - 1].checkpoint!;
            const want = deg < 90 ? 'Positive' : deg === 90 ? 'Zero' : 'Negative';
            expect(c.choices[c.answer]).toBe(want);
          }
        });
      }),
      { numRuns: 40 },
    );
  });

  it('splits v into its shadow on u and a part at right angles to u', () => {
    fc.assert(
      fc.property(nonZeroVec(4), vec(4), (u, v) => {
        const frames = traceOf(dotProduct, { story: 'shadow', u, v }).frames;
        expectGoodPlotTrace(dotProduct, frames);
        const p = tipOf(frames[2].state, 'shadow');
        const perp = shapeIn(frames[2].state, 'perp');
        expect(perp?.kind).toBe('vector');
        if (perp?.kind !== 'vector') return;
        expect(closeVec(perp.from, p)).toBe(true);
        expect(closeVec(perp.to, v)).toBe(true);
        expect(Math.abs(dot(u, [v[0] - p[0], v[1] - p[1]]))).toBeLessThan(1e-9);
        expect(closeVec(project(v, u), p)).toBe(true);
        // The shadow's signed length is u·v / |u|.
        const s = Math.sign(dot(u, p)) * norm(p);
        expect(s).toBeCloseTo(dot(u, v) / norm(u), 9);
      }),
      { numRuns: 40 },
    );
  });

  it('ranks the toy words: the dot product favours long vectors, the cosine compares direction', () => {
    const frames = traceOf(dotProduct, { story: 'similar', q: [2, 1] }).frames;
    const answer = (i: number) => frames[i].checkpoint!.choices[frames[i].checkpoint!.answer];
    expect(answer(0)).toBe('elephant');
    expect(answer(1)).toBe('dog');
    expect(answer(2)).toBe('car');
    fc.assert(
      fc.property(nonZeroVec(3), (q) => {
        for (const w of WORDS) expect(Math.abs(cosine(q, w.at))).toBeLessThanOrEqual(1 + 1e-12);
        expectGoodPlotTrace(dotProduct, traceOf(dotProduct, { story: 'similar', q }).frames);
      }),
      { numRuns: 40 },
    );
  });
});

// ───────────────────────────── norms ─────────────────────────────

describe('norms', () => {
  it('plays every example, round-trips its text and survives every drag', () => examplesAndDrags(norms));

  it('orders L∞ ≤ L2 ≤ L1, scales with |k| and obeys the triangle inequality', () => {
    const v3 = fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: 1, maxLength: 5 });
    fc.assert(
      fc.property(v3, v3, fc.double({ min: -5, max: 5, noNaN: true }), (a, b0, k) => {
        const b = a.map((_, i) => b0[i] ?? 0);
        const [li, l2, l1] = [lp(a, Infinity), lp(a, 2), lp(a, 1)];
        expect(li).toBeLessThanOrEqual(l2 + 1e-9);
        expect(l2).toBeLessThanOrEqual(l1 + 1e-9);
        for (const p of [1, 1.5, 2, 4, Infinity]) {
          expect(lp(a.map((x) => k * x), p)).toBeCloseTo(Math.abs(k) * lp(a, p), 6);
          expect(lp(a.map((x, i) => x + b[i]), p)).toBeLessThanOrEqual(lp(a, p) + lp(b, p) + 1e-9);
        }
        expect(lp(a, 2)).toBeCloseTo(Math.sqrt(a.reduce((s, x) => s + x * x, 0)), 9);
      }),
      { numRuns: 100 },
    );
  });

  it('draws unit balls whose every point is 1 away under its own norm', () => {
    for (const p of FAMILY) for (const pt of unitBall(p)) expect(lp(pt, p)).toBeCloseTo(1, 3);
  });

  it('reads the three distances off the gap, and names the nearest point for each', () => {
    fc.assert(
      fc.property(vec(4), vec(4), vec(4), (q, a, b) => {
        const d = traceOf(norms, { story: 'distance', p: q, q: a }).frames;
        expectGoodPlotTrace(norms, d);
        const last = d[d.length - 1].state;
        const gap: Vec = [a[0] - q[0], a[1] - q[1]];
        expect(num(readout(last, 'l2'))).toBeCloseTo(normOf(gap, 2), 3);
        expect(num(readout(last, 'l1'))).toBeCloseTo(normOf(gap, 1), 9);
        expect(num(readout(last, 'li'))).toBeCloseTo(normOf(gap, 'inf'), 9);
        const input: NormsInput = { story: 'nearest', q, a, b };
        roundTrips(norms, input);
        const n = traceOf(norms, input).frames;
        expectGoodPlotTrace(norms, n);
        const end = n[n.length - 1].state;
        for (const [id, which] of [['L2', 2], ['L1', 1], ['L∞', 'inf']] as const) {
          const [x, y] = [normOf([a[0] - q[0], a[1] - q[1]], which), normOf([b[0] - q[0], b[1] - q[1]], which)];
          expect(readout(end, id)).toBe(Math.abs(x - y) < 1e-9 ? 'A tie' : x < y ? 'A' : 'B');
        }
      }),
      { numRuns: 40 },
    );
  });

  it('asks whether t is inside the diamond from its L1 length', () => {
    fc.assert(
      fc.property(fc.integer({ min: -13, max: 13 }), fc.integer({ min: -13, max: 13 }), (x, y) => {
        const t: Vec = [x / 10, y / 10];
        const frames = traceOf(norms, { story: 'balls', t }).frames;
        expectGoodPlotTrace(norms, frames);
        const c = frames[2].checkpoint!;
        expect(c.choices[c.answer]).toBe(Math.abs(t[0]) + Math.abs(t[1]) <= 1 + 1e-9 ? 'Yes' : 'No');
      }),
      { numRuns: 40 },
    );
  });
});

// ───────────────────────────── matrix multiplication ─────────────────────────────

const entry = fc.integer({ min: -9, max: 9 });
const matrix = (rows: number, cols: number) => fc.array(fc.array(entry, { minLength: cols, maxLength: cols }), { minLength: rows, maxLength: rows }) as fc.Arbitrary<Matrix>;
const dims = fc.integer({ min: 1, max: 4 });
const imageValues = (state: PlotState, id: string) => (state.parts.find((p) => p.kind === 'image' && p.id === id) as ImagePart).values!;

describe('matrix-multiplication', () => {
  it('plays every example, round-trips its text and survives every drag', () => examplesAndDrags(matrixMultiplication));

  it('fills C cell by cell with row · column, m·n·p multiplications in all', () => {
    fc.assert(
      fc.property(
        fc.tuple(dims, dims, dims).chain(([m, n, p]) => fc.tuple(matrix(m, n), matrix(n, p))),
        ([A, B]) => {
          const input: MatMulInput = { story: 'cells', A, B };
          roundTrips(matrixMultiplication, input);
          const frames = traceOf(matrixMultiplication, input).frames;
          expectGoodPlotTrace(matrixMultiplication, frames);
          const [m, n] = shape(A);
          const p = shape(B)[1];
          expect(frames).toHaveLength(m * p + 3);
          const C = matmul(A, B);
          // A plain triple loop, as the reference.
          for (let i = 0; i < m; i++)
            for (let j = 0; j < p; j++) {
              let s = 0;
              for (let k = 0; k < n; k++) s += A[i][k] * B[k][j];
              expect(C[i][j]).toBe(s);
            }
          const last = frames[frames.length - 1];
          expect(imageValues(last.state, 'C').map(num)).toEqual(C.flat());
          expect(last.stats.multiplications).toBe(m * n * p);
          // Each cell frame fills exactly one more cell, the one its box marks.
          for (let k = 0; k < m * p; k++) {
            const f = frames[k + 2];
            const filled = imageValues(f.state, 'C').filter(Boolean).length;
            expect(filled).toBe(k + 1);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it('says why mismatched shapes can’t be multiplied', () => {
    fc.assert(
      fc.property(
        fc.tuple(dims, dims, dims, dims).filter(([, n, n2]) => n !== n2).chain(([m, n, n2, p]) => fc.tuple(matrix(m, n), matrix(n2, p))),
        ([A, B]) => {
          const frames = traceOf(matrixMultiplication, { story: 'cells', A, B }).frames;
          expectGoodPlotTrace(matrixMultiplication, frames);
          expect(frames).toHaveLength(2);
          expect(frames[0].checkpoint!.choices[frames[0].checkpoint!.answer]).toBe('No');
        },
      ),
      { numRuns: 30 },
    );
  });

  it('composes 2×2 moves: (AB)v = A(Bv), columns of AB are A times columns of B, and BA is asked about honestly', () => {
    const m2 = fc.tuple(half(-4, 4), half(-4, 4), half(-4, 4), half(-4, 4)) as fc.Arbitrary<Mat2>;
    fc.assert(
      fc.property(m2, m2, vec(4), m2, (A, B, v, C) => {
        const AB = mul2(A, B);
        expect(z(apply(AB, v))).toEqual(z(apply(A, apply(B, v))));
        expect(z(matmul([[A[0], A[1]], [A[2], A[3]]], [[B[0], B[1]], [B[2], B[3]]]).flat())).toEqual(z(AB));
        // Grouping doesn't matter, order does.
        expect(z(mul2(mul2(A, B), C))).toEqual(z(mul2(A, mul2(B, C))));
        const input: MatMulInput = { story: 'compose', A, B };
        roundTrips(matrixMultiplication, input);
        const frames = traceOf(matrixMultiplication, input).frames;
        expectGoodPlotTrace(matrixMultiplication, frames);
        expect(z(planeOf(frames[2].state).warp!)).toEqual(z(AB));
        expect(z(planeOf(frames[4].state).warp!)).toEqual(z(mul2(B, A)));
        const c = frames[2].checkpoint!;
        expect(c.choices[c.answer]).toBe(mul2(B, A).every((x, i) => Math.abs(x - AB[i]) < 1e-9) ? 'Yes' : 'No');
      }),
      { numRuns: 40 },
    );
  });
});

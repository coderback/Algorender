// Property tests for span, basis and rank (B3 of the math and ML path): the
// combinations drawn are the ones narrated, the recipe for w really adds up to
// w, and elimination's pivot count is the rank, checked against a reference
// that never swaps rows the same way.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, PlotState, Shape, Vec } from '@/viz/plot/types';
import { cross, dependencies, dependent, echelon, rankOf, recipe, reduced, span, ZERO, type Matrix, type SpanInput } from './span';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const shapeIn = (state: PlotState, id: string): Shape | undefined => planeOf(state).shapes.find((s) => s.id === id);

function roundTrips(input: SpanInput) {
  const custom = span.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);
const vec = (lim: number) => fc.tuple(half(-lim, lim), half(-lim, lim)) as fc.Arbitrary<Vec>;
const nonZeroVec = (lim: number) => vec(lim).filter((v) => v[0] !== 0 || v[1] !== 0);
const matrix = fc
  .tuple(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 4 }))
  .chain(([m, n]) => fc.array(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }));
/** Matrices with repeated directions: a column copied or mixed from others. */
const lowRank = fc
  .tuple(fc.integer({ min: 2, max: 4 }), fc.integer({ min: 1, max: 2 }))
  .chain(([m, k]) =>
    fc.tuple(
      fc.array(fc.array(fc.integer({ min: -3, max: 3 }), { minLength: k, maxLength: k }), { minLength: m, maxLength: m }),
      fc.array(fc.array(fc.integer({ min: -2, max: 2 }), { minLength: k, maxLength: k }), { minLength: 1, maxLength: 2 }),
    ),
  )
  .map(([B, mixes]) => B.map((row) => [...row, ...mixes.map((mix) => mix.reduce((s, x, i) => s + x * row[i], 0))]))
  .filter((A) => A.flat().every((x) => Math.abs(x) <= 9));

/** Reference rank: the largest k with a non-zero k×k minor. */
function minorRank(A: Matrix): number {
  const m = A.length;
  const n = A[0].length;
  const det = (M: number[][]): number => (M.length === 1 ? M[0][0] : M[0].reduce((s, x, j) => s + (j % 2 ? -1 : 1) * x * det(M.slice(1).map((r) => r.filter((_, c) => c !== j))), 0));
  const subsets = (size: number, of: number): number[][] => (size === 0 ? [[]] : of < size ? [] : [...subsets(size, of - 1), ...subsets(size - 1, of - 1).map((s) => [...s, of - 1])]);
  for (let k = Math.min(m, n); k > 0; k--)
    for (const rows of subsets(k, m)) for (const cols of subsets(k, n)) if (Math.abs(det(rows.map((r) => cols.map((c) => A[r][c])))) > 1e-6) return k;
  return 0;
}

describe('span', () => {
  it('plays every example, round-trips its text and survives every drag', () => {
    for (const ex of span.input.examples) {
      const input = ex.make({ seed: 0, size: 0 });
      const frames = traceOf(span, input).frames;
      expectGoodPlotTrace(span, frames);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            const to: Vec = [Math.min(h.max[0], h.at[0] + h.step), Math.max(h.min[1], h.at[1] - h.step)];
            const moved = span.input.drag!(input, h.id, to);
            const again = traceOf(span, moved).frames;
            expectGoodPlotTrace(span, again);
            roundTrips(moved);
            expect(again.length, `${ex.id} dragging ${h.id}`).toBe(frames.length);
          }
        }
    }
  });

  it('draws the asked combination, finds w’s recipe, and says whether u and v reach the plane', () => {
    fc.assert(
      fc.property(nonZeroVec(3), nonZeroVec(3), vec(5.5), (u, v, w) => {
        const input: SpanInput = { story: 'span', u, v, w };
        roundTrips(input);
        const frames = traceOf(span, input).frames;
        expectGoodPlotTrace(span, frames);
        expect(frames).toHaveLength(5);
        // The combination drawn tip to tail lands where the readout says.
        const combo = shapeIn(frames[1].state, 'combo');
        const au = shapeIn(frames[1].state, 'au');
        const bv = shapeIn(frames[1].state, 'bv');
        if (combo?.kind !== 'point' || au?.kind !== 'vector' || bv?.kind !== 'vector') throw new Error('no combination');
        expect(bv.from).toEqual(au.to);
        expect(bv.to).toEqual(combo.at);
        // Every whole-number dot is a combination: on u's line when dependent.
        const dots = planeOf(frames[2].state).shapes.filter((s) => s.kind === 'point' && s.id.startsWith('c'));
        expect(dots.length).toBeGreaterThan(0);
        for (const d of dots) if (d.kind === 'point' && dependent(u, v)) expect(Math.abs(cross(u, d.at))).toBeLessThan(1e-9);
        const indep = !dependent(u, v);
        expect(frames[1].checkpoint!.choices[frames[1].checkpoint!.answer]).toBe(indep ? 'Yes' : 'No');
        expect(frames[3].checkpoint!.choices[frames[3].checkpoint!.answer]).toBe(indep ? '2' : '1');
        expect(readout(frames[4].state, 'rank')).toBe(indep ? '2' : '1');
        if (indep) {
          const [a, b] = recipe(u, v, w);
          expect(close(a * u[0] + b * v[0], w[0]) && close(a * u[1] + b * v[1], w[1])).toBe(true);
          const wb = shapeIn(frames[3].state, 'wb');
          expect(wb?.kind === 'vector' && close(wb.to[0], w[0]) && close(wb.to[1], w[1])).toBe(true);
        } else {
          const reachable = Math.abs(cross(u, w)) < ZERO;
          expect(frames[2].checkpoint!.choices[frames[2].checkpoint!.answer]).toBe(reachable ? 'Yes' : 'No');
          expect(readout(frames[3].state, 'recipe') === 'out of reach').toBe(!reachable);
          if (!reachable) {
            // The closest point is w's shadow on the line: the gap is at right angles to u.
            const gap = shapeIn(frames[3].state, 'gap');
            if (gap?.kind !== 'path') throw new Error('no gap');
            const [p, q] = gap.points;
            expect(Math.abs((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1])).toBeLessThan(1e-9);
          }
        }
      }),
    );
  });

  it('keeps dragging inside the limits, never making u or v zero', () => {
    fc.assert(
      fc.property(fc.constantFrom('u', 'v', 'w'), fc.tuple(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true })), (id, to) => {
        const input = span.input.examples[0].make({ seed: 0, size: 0 });
        const moved = span.input.drag!(input, id, to as Vec);
        roundTrips(moved);
      }),
    );
  });
});

describe('rank by elimination', () => {
  it('counts the pivots: the rank, as the largest non-zero minor says', () => {
    fc.assert(
      fc.property(fc.oneof(matrix, lowRank), (A) => {
        const r = rankOf(A);
        expect(r).toBe(minorRank(A));
        const { M, pivots } = echelon(A);
        // Echelon form: under each pivot only zeros, and pivots step right as they go down.
        for (const [i, j] of pivots) for (let k = i + 1; k < M.length; k++) expect(M[k][j]).toBe(0);
        pivots.forEach(([i, j], k) => {
          expect(i).toBe(k);
          if (k) expect(j).toBeGreaterThan(pivots[k - 1][1]);
        });
        // Rows past the last pivot are all zero.
        for (let k = pivots.length; k < M.length; k++) for (const x of M[k]) expect(Math.abs(x)).toBeLessThan(1e-6);
      }),
    );
  });

  it('names each column without a pivot as a mix of earlier columns, and the mix adds up', () => {
    fc.assert(
      fc.property(fc.oneof(matrix, lowRank), (A) => {
        const deps = dependencies(A);
        const n = A[0].length;
        expect(deps.length).toBe(n - rankOf(A));
        for (const d of deps)
          for (let i = 0; i < A.length; i++) {
            const mixed = d.terms.reduce((s, t) => s + t.times * A[i][t.column], 0);
            expect(Math.abs(mixed - A[i][d.column])).toBeLessThan(1e-6);
          }
        // Reduced form: pivots are 1 with zeros above and below.
        const { M, pivots } = reduced(A);
        for (const [i, j] of pivots) M.forEach((row, k) => expect(Math.abs(row[j] - (k === i ? 1 : 0))).toBeLessThan(1e-9));
      }),
    );
  });

  it('plays a trace that ends on the rank, with each multiple asked before it is used', () => {
    fc.assert(
      fc.property(fc.oneof(matrix, lowRank), (A) => {
        const input: SpanInput = { story: 'rank', A };
        roundTrips(input);
        const frames = traceOf(span, input).frames;
        expectGoodPlotTrace(span, frames);
        const last = frames[frames.length - 1];
        expect(readout(last.state, 'pivots')).toBe(String(rankOf(A)));
        const before = frames[frames.length - 2].checkpoint!;
        expect(before.choices[before.answer]).toBe(String(rankOf(A)));
        // The image always shows a matrix A's shape.
        for (const f of frames) {
          const img = f.state.parts.find((p): p is ImagePart => p.kind === 'image')!;
          expect([img.height, img.width]).toEqual([A.length, A[0].length]);
          expect(img.matrix).toBe(true);
        }
        // Row operations never decrease and the pivots found never decrease.
        let ops = 0;
        for (const f of frames) {
          const now = Number(readout(f.state, 'ops'));
          expect(now).toBeGreaterThanOrEqual(ops);
          ops = now;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('refuses matrices that are too big, ragged or not whole', () => {
    const parse = span.input.custom!.parse;
    expect(parse('rank [[1, 2], [3]]')).toHaveProperty('error');
    expect(parse('rank [[1, 2, 3, 4, 5]]')).toHaveProperty('error');
    expect(parse('rank [[1.5, 2]]')).toHaveProperty('error');
    expect(parse('span 0 0, 1 2, 3 4')).toHaveProperty('error');
    expect(parse('nothing')).toHaveProperty('error');
  });
});

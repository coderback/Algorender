import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply, fmt, fmtVec } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { Mat2, PlotState, Vec } from '@/viz/plot/types';
import { eigenvectors } from './eigenvectors';
import { linearTransformations } from './linear-transformations';
import { det, eigenvalues, ENTRY_MAX, type MatrixInput } from './shared';

const half = fc.integer({ min: -2 * ENTRY_MAX, max: 2 * ENTRY_MAX }).map((k) => k / 2);
const matrix = fc.tuple(half, half, half, half) as fc.Arbitrary<Mat2>;
const vector = fc.tuple(half, half) as fc.Arbitrary<Vec>;
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

describe('linear-transformations', () => {
  const input = fc.record({ m: matrix, v: vector }) as fc.Arbitrary<MatrixInput>;

  it('plays every example as a good trace', () => {
    for (const ex of linearTransformations.input.examples) {
      expectGoodPlotTrace(linearTransformations, traceOf(linearTransformations, ex.make({ seed: 3, size: 0 })).frames);
    }
  });

  it('sends î, ĵ and v where A says, warps the grid by A and reports det A', () => {
    fc.assert(
      fc.property(input, ({ m, v }) => {
        const frames = traceOf(linearTransformations, { m, v }).frames;
        expectGoodPlotTrace(linearTransformations, frames);
        const end = frames.at(-1)!.state;
        const plane = planeOf(end);
        expect(plane.warp).toEqual(m);
        const shape = (id: string) => plane.shapes.find((s) => s.id === id)!;
        expect(shape('i')).toMatchObject({ to: [m[0], m[2]] });
        expect(shape('j')).toMatchObject({ to: [m[1], m[3]] });
        const av = apply(m, v);
        const drawn = shape('v');
        if (drawn.kind !== 'vector') throw new Error('v is not a vector');
        expect(drawn.to[0]).toBeCloseTo(av[0]);
        expect(drawn.to[1]).toBeCloseTo(av[1]);
        expect(readout(end, 'det')).toBe(fmt(det(m)));
      }),
      { numRuns: 80 },
    );
  });

  it('asks where î lands and accepts the first column', () => {
    fc.assert(
      fc.property(input, ({ m, v }) => {
        const c = traceOf(linearTransformations, { m, v }).frames[0].checkpoint;
        if (c) expect(c.choices[c.answer]).toBe(fmtVec([m[0], m[2]]));
      }),
    );
  });

  it('round-trips custom input and maps drags onto the matrix and v', () => {
    const { custom, drag } = linearTransformations.input;
    fc.assert(
      fc.property(input, vector, ({ m, v }, to) => {
        const parsed = custom!.parse(custom!.format({ m, v }));
        expect(parsed).toEqual({ value: { m, v } });
        expect(drag!({ m, v }, 'i', to).m).toEqual([to[0], m[1], to[1], m[3]]);
        expect(drag!({ m, v }, 'j', to).m).toEqual([m[0], to[0], m[2], to[1]]);
        expect(drag!({ m, v }, 'v', to)).toEqual({ m, v: to });
      }),
    );
  });

  it('rejects malformed custom input', () => {
    const { custom } = linearTransformations.input;
    for (const text of ['', '1 2 3', '[[9, 0], [0, 1]]', '1 2 3 4 5']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

describe('eigenvectors', () => {
  const found = (state: PlotState) =>
    planeOf(state).shapes.flatMap((s) => (s.kind === 'vector' && s.id === 'w' && s.mark === 'found' ? [s] : []));

  it('plays every example as a good trace', () => {
    for (const ex of eigenvectors.input.examples) expectGoodPlotTrace(eigenvectors, traceOf(eigenvectors, ex.make({ seed: 5, size: 0 })).frames);
  });

  it('marks A·v as an eigenvector exactly when it lies on v’s line, with the right λ', () => {
    fc.assert(
      fc.property(matrix, (m) => {
        const frames = traceOf(eigenvectors, m).frames;
        expectGoodPlotTrace(eigenvectors, frames);
        for (const f of frames) {
          const plane = planeOf(f.state);
          const v = plane.shapes.find((s) => s.id === 'v');
          const w = plane.shapes.find((s) => s.id === 'w');
          if (v?.kind !== 'vector' || w?.kind !== 'vector') continue;
          const cross = v.to[0] * w.to[1] - v.to[1] * w.to[0];
          const parallel = Math.abs(cross) < 1e-6 * Math.max(1, Math.hypot(...w.to));
          expect(w.mark === 'found', `${m} at ${v.to}`).toBe(parallel);
          const image = apply(m, v.to);
          expect(w.to[0]).toBeCloseTo(image[0]);
          expect(w.to[1]).toBeCloseTo(image[1]);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('finds as many eigen directions as the characteristic polynomial says', () => {
    fc.assert(
      fc.property(matrix, (m) => {
        const [a, b, c, d] = m;
        const scalar = b === 0 && c === 0 && a === d;
        const frames = traceOf(eigenvectors, m).frames;
        const directions = frames.filter((f) => found(f.state).length > 0).length;
        const lambdas = eigenvalues(m);
        if (scalar) expect(directions).toBe(frames.filter((f) => planeOf(f.state).shapes.some((s) => s.id === 'w')).length);
        else if (lambdas.length === 0) expect(directions).toBe(0);
        else {
          // A repeated eigenvalue of a non-scalar matrix has one eigen line; distinct ones have two.
          expect(directions).toBe(lambdas.length);
          if (lambdas.length === 2) {
            expect(close(lambdas[0] * lambdas[1], det(m))).toBe(true);
            expect(close(lambdas[0] + lambdas[1], a + d)).toBe(true);
          }
        }
      }),
      { numRuns: 120 },
    );
  });

  it('round-trips custom input and maps drags onto the columns', () => {
    const { custom, drag } = eigenvectors.input;
    fc.assert(
      fc.property(matrix, vector, (m, to) => {
        expect(custom!.parse(custom!.format(m))).toEqual({ value: m });
        expect(drag!(m, 'i', to)).toEqual([to[0], m[1], to[1], m[3]]);
        expect(drag!(m, 'j', to)).toEqual([m[0], to[0], m[2], to[1]]);
      }),
    );
  });
});

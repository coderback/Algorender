import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, readout, traceOf } from '@/viz/plot/testing';
import { picture, SIZE, type ImageId, type Picture } from './images';
import { decompose, distance, MAX_TERMS, rankK, rankOf, svd } from './svd';

const IDS: ImageId[] = ['plus', 'gradient', 'checker', 'letter', 'smiley', 'noise'];
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** A random m×n matrix with entries in [−1, 1], from a seed. */
const matrix = fc
  .record({ m: fc.integer({ min: 1, max: 8 }), n: fc.integer({ min: 1, max: 8 }), values: fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 64, maxLength: 64 }) })
  .map(({ m, n, values }): Picture => Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => values[i * 8 + j])));

/** A random matrix of rank at most r: a sum of r outer products (entries in eighths, so no subnormal dust). */
const eighth = fc.integer({ min: -8, max: 8 }).map((k) => k / 8);
const lowRank = fc
  .record({ r: fc.integer({ min: 1, max: 3 }), cols: fc.array(eighth, { minLength: 18, maxLength: 18 }), rows: fc.array(eighth, { minLength: 18, maxLength: 18 }) })
  .map(({ r, cols, rows }) => ({ r, a: Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => Array.from({ length: r }, (_, t) => cols[t * 6 + i] * rows[t * 6 + j]).reduce((s, x) => s + x, 0))) }));

function expectDecomposes(a: Picture) {
  const d = decompose(a);
  const m = a.length;
  const n = a[0].length;
  // A = Σ σᵢuᵢvᵢᵀ over every term.
  expect(distance(a, rankK(d, d.sigma.length))).toBeLessThan(1e-9 * Math.max(1, d.sigma[0]));
  // Non-negative, largest first.
  for (let i = 0; i < d.sigma.length; i++) {
    expect(d.sigma[i]).toBeGreaterThanOrEqual(0);
    if (i) expect(d.sigma[i]).toBeLessThanOrEqual(d.sigma[i - 1] + 1e-12);
  }
  // u's (for σ > 0) and all v's are orthonormal.
  const live = d.sigma.flatMap((s, i) => (s > 0 ? [i] : []));
  for (const i of live) for (const j of live) expect(dot(d.u[i], d.u[j])).toBeCloseTo(i === j ? 1 : 0, 9);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(dot(d.v[i], d.v[j])).toBeCloseTo(i === j ? 1 : 0, 9);
  // Eckart–Young: what's left after k terms has squared size equal to the dropped σ².
  for (let k = 0; k <= d.sigma.length; k++) {
    const dropped = d.sigma.slice(k).reduce((s, x) => s + x * x, 0);
    expect(distance(a, rankK(d, k)) ** 2).toBeCloseTo(dropped, 6);
  }
  expect(d.u.every((u) => u.length === m)).toBe(true);
}

describe('svd (the decomposition)', () => {
  it('decomposes every picture', () => {
    for (const id of IDS) expectDecomposes(picture(id, 3));
  });

  it('decomposes random matrices of any shape', () => {
    fc.assert(
      fc.property(matrix, (a) => {
        expectDecomposes(a);
      }),
      { numRuns: 60 },
    );
  });

  it('finds the rank of a sum of r outer products', () => {
    fc.assert(
      fc.property(lowRank, ({ r, a }) => {
        expect(rankOf(decompose(a))).toBeLessThanOrEqual(r);
      }),
      { numRuns: 60 },
    );
  });

  it('knows the ranks of the simple pictures', () => {
    expect(rankOf(decompose(picture('plus')))).toBe(2);
    expect(rankOf(decompose(picture('gradient')))).toBe(2);
    expect(rankOf(decompose(picture('checker')))).toBe(2);
    expect(rankOf(decompose(picture('noise', 9)))).toBe(SIZE);
  });

  it('is deterministic', () => {
    expect(decompose(picture('smiley'))).toEqual(decompose(picture('smiley')));
    expect(picture('noise', 4)).toEqual(picture('noise', 4));
    expect(picture('noise', 4)).not.toEqual(picture('noise', 5));
  });
});

describe('svd (the visualiser)', () => {
  it('plays every example as a good trace', () => {
    for (const ex of svd.input.examples) {
      const frames = traceOf(svd, ex.make({ seed: 2, size: 0 })).frames;
      expectGoodPlotTrace(svd, frames);
      expect(frames.length).toBeLessThan(40);
    }
  });

  it('adds one piece per step until the picture is exact or the term budget runs out', () => {
    for (const id of IDS) {
      const a = picture(id, 2);
      const d = decompose(a);
      const frames = traceOf(svd, { image: id, seed: 2 }).frames;
      const terms = Math.min(rankOf(d), MAX_TERMS);
      expect(frames.at(-1)!.stats.rank).toBe(terms);
      // The readout error after k pieces is the distance from A to the rank-k sum.
      for (const f of frames) {
        const k = f.stats.rank;
        const err = Number((readout(f.state, 'error') ?? '').replace('−', '-'));
        expect(err).toBeCloseTo(distance(a, rankK(d, k)), 2);
      }
    }
  });

  it('asks honestly whether the next piece makes the picture exact', () => {
    for (const ex of svd.input.examples) {
      const input = ex.make({ seed: 2, size: 0 });
      const rank = rankOf(decompose(picture(input.image, input.seed)));
      const frames = traceOf(svd, input).frames;
      frames.forEach((f) => {
        const c = f.checkpoint;
        if (!c?.question.startsWith('Will the picture be exact')) return;
        expect(c.choices[c.answer]).toBe(f.stats.rank + 1 === rank ? 'Yes' : 'No');
      });
      const first = frames[0].checkpoint!;
      expect(first.choices[first.answer]).toBe(String(rank));
    }
  });
});

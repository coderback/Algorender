import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CLASS_TONES, type Point2 } from '@/ml/datasets';
import { expectGoodPlotTrace, planeOf, traceOf } from '@/viz/plot/testing';
import type { HeatmapShape, PointShape, Vec } from '@/viz/plot/types';
import { defaultStarts, inertia, kMeans, lloyd, MAX_ITERS, MAX_K, MAX_N, MIN_K, MIN_N, nearest, pointsOf, startsOf, type KData, type KMeansInput } from './k-means';
import { classOf, MAX_EPOCHS, perceptron, pointsOf as perceptronPoints, train, type PerceptronInput } from './perceptron';

const kInput: fc.Arbitrary<KMeansInput> = fc.record({
  data: fc.constantFrom<KData>('blobs', 'elongated', 'uneven', 'random'),
  n: fc.integer({ min: MIN_N, max: MAX_N }),
  k: fc.integer({ min: MIN_K, max: MAX_K }),
  seed: fc.integer({ min: 0, max: 100_000 }),
});

const shapes = (frame: { state: Parameters<typeof planeOf>[0] }) => planeOf(frame.state).shapes;
const centroids = (frame: { state: Parameters<typeof planeOf>[0] }) =>
  shapes(frame).filter((s): s is PointShape => s.kind === 'point' && /^c\d+$/.test(s.id)).map((s) => s.at);

describe('k-means', () => {
  it('plays every example as a good trace', () => {
    for (const ex of kMeans.input.examples) {
      for (const size of [MIN_N, 30, MAX_N]) {
        const frames = traceOf(kMeans, ex.make({ seed: 7, size })).frames;
        expectGoodPlotTrace(kMeans, frames, { handlesOnStep: true });
        expect(frames.length).toBeLessThan(90);
      }
    }
  });

  it('never raises the inertia, and stops exactly when no point changes cluster', () => {
    fc.assert(
      fc.property(kInput, (input) => {
        const pts = pointsOf(input);
        const { steps, converged } = lloyd(pts, startsOf(input));
        for (let s = 1; s < steps.length; s++) expect(steps[s].inertia).toBeLessThanOrEqual(steps[s - 1].inertia + 1e-9);
        const last = steps[steps.length - 1];
        const again = pts.map((p) => nearest(last.cents, p.x, p.y));
        if (converged) expect(again).toEqual(last.labels);
        else expect(steps.filter((s) => s.kind === 'update').length).toBe(MAX_ITERS);
        for (const s of steps) expect(s.inertia).toBeCloseTo(inertia(pts, s.labels, s.cents), 9);
      }),
      { numRuns: 120 },
    );
  });

  it('moves each centroid to the mean of its points, and shades each cell by its nearest centroid', () => {
    fc.assert(
      fc.property(kInput, (input) => {
        const pts = pointsOf(input);
        const frames = traceOf(kMeans, input).frames;
        expectGoodPlotTrace(kMeans, frames, { handlesOnStep: !input.starts });
        for (const f of frames) {
          const cents = centroids(f);
          const points = shapes(f).filter((s): s is PointShape => s.kind === 'point' && /^p\d+$/.test(s.id));
          if (f.line === 3) {
            // After an update, every non-empty cluster's centroid is its members' mean.
            cents.forEach((c, j) => {
              // A point's tone is its cluster's tone.
              const members = pts.filter((_, i) => points[i].tone === CLASS_TONES[j]);
              if (members.length === 0) return;
              expect(c[0]).toBeCloseTo(members.reduce((s, p) => s + p.x, 0) / members.length, 9);
              expect(c[1]).toBeCloseTo(members.reduce((s, p) => s + p.y, 0) / members.length, 9);
            });
          }
          if (f.line === 2 || f.line === 4) {
            const map = shapes(f).find((s): s is HeatmapShape => s.kind === 'heatmap')!;
            for (let r = 0; r < map.rows; r += 7) {
              for (let c = 0; c < map.cols; c += 7) {
                const x = map.x0 + ((c + 0.5) * (map.x1 - map.x0)) / map.cols;
                const y = map.y1 - ((r + 0.5) * (map.y1 - map.y0)) / map.rows;
                expect(map.values[r * map.cols + c]).toBe(nearest(cents, x, y));
              }
            }
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('is deterministic, and narrates the bad start as a local optimum', () => {
    const make = kMeans.input.examples.find((e) => e.id === 'bad-start')!.make;
    expect(traceOf(kMeans, make({ seed: 7, size: 30 })).frames).toEqual(traceOf(kMeans, make({ seed: 7, size: 30 })).frames);
    // The page's default seed is 7; from it the bad start stays stuck at every size.
    for (const size of [MIN_N, 30, MAX_N]) expect(traceOf(kMeans, make({ seed: 7, size })).frames.at(-1)!.note, `n ${size}`).toContain('local optimum');
  });

  it('only calls an ending a local optimum when another start does clearly better', () => {
    fc.assert(
      fc.property(kInput, (input) => {
        const pts = pointsOf(input);
        const end = (starts: Vec[]) => lloyd(pts, starts).steps.at(-1)!.inertia;
        const final = end(startsOf(input));
        const best = Math.min(final, ...Array.from({ length: 10 }, (_, r) => end(defaultStarts(pts, input.k, input.seed * 31 + r + 1))));
        expect(traceOf(kMeans, input).frames.at(-1)!.note.includes('local optimum')).toBe(final > best * 1.05 + 1e-9);
      }),
      { numRuns: 40 },
    );
  });

  it('drags exactly one start, and round-trips custom input', () => {
    const { custom, drag } = kMeans.input;
    fc.assert(
      fc.property(kInput, fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 }), (input, x, y) => {
        const to: Vec = [x / 10, y / 10];
        const j = input.k - 1;
        const dragged = drag!(input, `c${j}`, to);
        const before = startsOf(input);
        expect(dragged.starts![j]).toEqual(to);
        dragged.starts!.forEach((s, i) => i !== j && expect(s).toEqual(before[i]));
        expect(custom!.parse(custom!.format(input))).toEqual({ value: input });
        expect(custom!.parse(custom!.format(dragged))).toEqual({ value: dragged });
      }),
    );
    for (const text of ['clouds, n = 30, k = 3, seed = 1', 'blobs, n = 30, k = 3', 'blobs, n = 5, k = 3, seed = 1', 'blobs, n = 30, k = 9, seed = 1', 'blobs, n = 30, k = 2, seed = 1, starts = (0, 0)', 'blobs, n = 30, k = 2, seed = 1, starts = (0, 0), (5, 0)']) {
      expect(custom!.parse(text)).toHaveProperty('error');
    }
  });

  it('picks distinct default starts from the data', () => {
    fc.assert(
      fc.property(kInput, (input) => {
        const starts = defaultStarts(pointsOf(input), input.k, input.seed);
        expect(starts).toHaveLength(input.k);
        expect(new Set(starts.map((s) => s.join(','))).size).toBe(input.k);
      }),
    );
  });
});

/** An independent perceptron, written from the textbook rule. */
function reference(pts: readonly Point2[], epochs: number) {
  let w1 = 0;
  let w2 = 0;
  let b = 0;
  const mistakes: number[] = [];
  for (let e = 0; e < epochs; e++) {
    let m = 0;
    for (const p of pts) {
      const y = p.label === 1 ? 1 : -1;
      if (y * (w1 * p.x + w2 * p.y + b) <= 0) {
        w1 += y * p.x;
        w2 += y * p.y;
        b += y;
        m++;
      }
    }
    mistakes.push(m);
    if (m === 0) break;
  }
  return { w: [w1, w2], b, mistakes };
}

const pInput: fc.Arbitrary<PerceptronInput> = fc.record({
  data: fc.constantFrom<PerceptronInput['data']>('linear', 'overlap', 'xor'),
  n: fc.integer({ min: 10, max: 40 }),
  seed: fc.integer({ min: 0, max: 100_000 }),
});

/** Points with a clear gap around a random line through the box, so they are separable. */
const separable = fc
  .record({ angle: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), offset: fc.double({ min: -1, max: 1, noNaN: true }), raw: fc.array(fc.tuple(fc.double({ min: -2.8, max: 2.8, noNaN: true }), fc.double({ min: -2.8, max: 2.8, noNaN: true })), { minLength: 4, maxLength: 30 }) })
  .map(({ angle, offset, raw }) => {
    const n: Vec = [Math.cos(angle), Math.sin(angle)];
    return raw
      .map(([x, y]) => ({ x, y, d: n[0] * x + n[1] * y - offset }))
      .filter((p) => Math.abs(p.d) > 0.4)
      .map((p) => ({ x: p.x, y: p.y, label: p.d > 0 ? 1 : 0 }));
  })
  .filter((pts) => pts.length >= 2);

describe('perceptron', () => {
  it('plays every example as a good trace', () => {
    for (const ex of perceptron.input.examples) {
      for (const size of [10, 20, 40]) {
        const frames = traceOf(perceptron, ex.make({ seed: 3, size })).frames;
        expectGoodPlotTrace(perceptron, frames);
        expect(frames.length).toBeLessThan(90);
      }
    }
  });

  it('updates exactly as the textbook rule does', () => {
    fc.assert(
      fc.property(pInput, (input) => {
        const pts = perceptronPoints(input);
        const mine = train(pts);
        const ref = reference(pts, MAX_EPOCHS);
        expect(mine.mistakesPerEpoch).toEqual(ref.mistakes);
        expect(mine.w[0]).toBeCloseTo(ref.w[0], 9);
        expect(mine.w[1]).toBeCloseTo(ref.w[1], 9);
        expect(mine.b).toBe(ref.b);
        expectGoodPlotTrace(perceptron, traceOf(perceptron, input).frames);
      }),
      { numRuns: 60 },
    );
  });

  it('ends with zero mistakes on separable data, and never on XOR', () => {
    fc.assert(
      fc.property(separable, (pts) => {
        const { converged, w, b } = train(pts, 2000);
        expect(converged).toBe(true);
        for (const p of pts) expect(classOf(p) * (w[0] * p.x + w[1] * p.y + b)).toBeGreaterThan(0);
      }),
      { numRuns: 80 },
    );
    for (const seed of [1, 2, 3, 4, 5]) {
      const { converged, mistakesPerEpoch } = train(perceptronPoints({ data: 'xor', n: 30, seed }), 200);
      expect(converged).toBe(false);
      expect(Math.min(...mistakesPerEpoch)).toBeGreaterThan(0);
    }
  });

  it('is deterministic and round-trips custom input', () => {
    const input: PerceptronInput = { data: 'xor', n: 20, seed: 11 };
    expect(traceOf(perceptron, input).frames).toEqual(traceOf(perceptron, input).frames);
    const { custom } = perceptron.input;
    fc.assert(
      fc.property(pInput, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    for (const text of ['circles, n = 20, seed = 1', 'linear, n = 20', 'linear, n = 3, seed = 1', 'linear, n = 99, seed = 1']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

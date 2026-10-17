import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DatasetId } from '@/ml/datasets';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { Vec } from '@/viz/plot/types';
import { decisionTree, grow, leaves, MAX_DEPTH, pointsOf, predict, splitScore, thresholds, type TreeInput, type TreeNode } from './decision-tree';
import { bestStump, boost, gradientBoosting, MAX_ROUNDS, points, predictWith, stumpAt, type BoostInput } from './gradient-boosting';

const DATASETS: DatasetId[] = ['linear', 'overlap', 'blobs', 'xor', 'circles', 'moons'];

describe('decision-tree', () => {
  const input: fc.Arbitrary<TreeInput> = fc.record({
    data: fc.constantFrom(...DATASETS),
    n: fc.integer({ min: 4, max: 50 }),
    seed: fc.integer({ min: 0, max: 1000 }),
    maxDepth: fc.integer({ min: 1, max: MAX_DEPTH }),
  });

  const internal = (n: TreeNode): TreeNode[] => (n.split ? [n, ...internal(n.split.left), ...internal(n.split.right)] : []);

  it('plays every example at every depth as a good trace under 60 frames', () => {
    for (const ex of decisionTree.input.examples) {
      for (let depth = 1; depth <= MAX_DEPTH; depth++) {
        const frames = traceOf(decisionTree, ex.make({ seed: 7, size: depth })).frames;
        expectGoodPlotTrace(decisionTree, frames);
        expect(frames.length).toBeLessThan(60);
      }
    }
  });

  it('splits each region where the weighted Gini is lowest (brute force over every threshold)', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const data = pointsOf(inp);
        const k = Math.max(2, ...data.map((p) => p.label + 1));
        const { root } = grow(data, inp.maxDepth);
        for (const node of internal(root)) {
          let best = Infinity;
          for (const axis of ['x', 'y'] as const) for (const t of thresholds(data, node.points, axis)) best = Math.min(best, splitScore(data, node.points, axis, t, k));
          expect(node.split!.score).toBeCloseTo(best, 12);
          expect(node.split!.score).toBeLessThan(node.gini);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('has leaves that partition the points, and predicts by walking down to them', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const data = pointsOf(inp);
        const { root } = grow(data, inp.maxDepth);
        const all = leaves(root);
        const seen = all.flatMap((l) => l.points).sort((a, b) => a - b);
        expect(seen).toEqual(data.map((_, i) => i));
        for (const leaf of all) {
          expect(leaf.depth).toBeLessThanOrEqual(inp.maxDepth);
          for (const i of leaf.points) expect(predict(root, data[i])).toBe(leaf.majority);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('never loses training accuracy when allowed to grow deeper', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const data = pointsOf(inp);
        const accuracy = (d: number) => {
          const { root } = grow(data, d);
          return data.filter((p) => predict(root, p) === p.label).length;
        };
        for (let d = 1; d < MAX_DEPTH; d++) expect(accuracy(d + 1)).toBeGreaterThanOrEqual(accuracy(d));
      }),
      { numRuns: 40 },
    );
  });

  it('reports the final tree’s training accuracy and is deterministic', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(decisionTree, inp).frames;
        expectGoodPlotTrace(decisionTree, frames);
        expect(traceOf(decisionTree, inp)).toEqual({ frames, truncated: false });
        const data = pointsOf(inp);
        const { root } = grow(data, inp.maxDepth);
        const acc = (data.filter((p) => predict(root, p) === p.label).length / data.length) * 100;
        expect(Number(readout(frames.at(-1)!.state, 'accuracy')!.replace('%', ''))).toBeCloseTo(acc, 1);
        expect(readout(frames.at(-1)!.state, 'leaves')).toBe(String(leaves(root).length));
      }),
      { numRuns: 30 },
    );
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = decisionTree.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    expect(custom!.parse('moons, 3')).toEqual({ value: { data: 'moons', n: 40, seed: 7, maxDepth: 3 } });
    for (const text of ['trees, 3', 'xor', 'xor, depth = 9', 'xor, 2, n = 2', 'xor, 2, 40, -1']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

describe('gradient-boosting', () => {
  const input: fc.Arbitrary<BoostInput> = fc.record({
    curve: fc.constantFrom('sine', 'step', 'quadratic' as const),
    n: fc.integer({ min: 4, max: 60 }),
    seed: fc.integer({ min: 0, max: 1000 }),
    rate: fc.integer({ min: 5, max: 100 }).map((k) => k / 100),
    rounds: fc.integer({ min: 1, max: MAX_ROUNDS }),
  });

  /** Brute-force least-squares error of the best stump over every threshold between data points. */
  const bestError = (xs: readonly number[], r: readonly number[]) => {
    let best = Infinity;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] === xs[i - 1]) continue;
      const t = (xs[i - 1] + xs[i]) / 2;
      const groups = [r.filter((_, j) => xs[j] < t), r.filter((_, j) => xs[j] >= t)];
      const err = groups.reduce((s, g) => {
        const m = g.reduce((a, b) => a + b, 0) / g.length;
        return s + g.reduce((e, v) => e + (v - m) ** 2, 0);
      }, 0);
      best = Math.min(best, err);
    }
    return best;
  };

  it('plays every example at several round counts as a good trace under 60 frames', () => {
    for (const ex of gradientBoosting.input.examples) {
      for (const size of [1, 5, MAX_ROUNDS]) {
        const frames = traceOf(gradientBoosting, ex.make({ seed: 7, size })).frames;
        expectGoodPlotTrace(gradientBoosting, frames);
        expect(frames.length).toBeLessThan(60);
      }
    }
  });

  it('fits each stump by least squares to the residuals, and the training error never rises', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const pts = points(inp);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const b = boost(pts, inp.rate, inp.rounds);
        b.stumps.forEach((s, k) => {
          const r = ys.map((y, i) => y - predictWith(b, inp.rate, k, xs[i]));
          const err = r.reduce((e, v, i) => e + (v - stumpAt(s, xs[i])) ** 2, 0);
          expect(err).toBeCloseTo(bestError(xs, r), 9);
          // Recomputed residuals differ from boost()'s running ones only by rounding, so compare loosely.
          const again = bestStump(xs, r)!;
          expect(again.t).toBe(s.t);
          expect(again.left).toBeCloseTo(s.left, 9);
          expect(again.right).toBeCloseTo(s.right, 9);
        });
        for (let k = 1; k < b.mse.length; k++) expect(b.mse[k]).toBeLessThanOrEqual(b.mse[k - 1] + 1e-12);
      }),
      { numRuns: 60 },
    );
  });

  it('predicts the mean plus the scaled sum of the stumps, as drawn', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(gradientBoosting, inp).frames;
        expectGoodPlotTrace(gradientBoosting, frames);
        const pts = points(inp);
        const b = boost(pts, inp.rate, inp.rounds);
        const model = planeOf(frames.at(-1)!.state).shapes.find((s) => s.id === 'model');
        if (model?.kind !== 'path') throw new Error('no model path');
        for (const [x, y] of model.points as Vec[]) {
          const expected = b.base + b.stumps.reduce((s, st) => s + inp.rate * stumpAt(st, x), 0);
          expect(y).toBeCloseTo(expected, 9);
        }
        expect(traceOf(gradientBoosting, inp)).toEqual({ frames, truncated: false });
      }),
      { numRuns: 30 },
    );
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = gradientBoosting.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    expect(custom!.parse('step, 0.3, 8')).toEqual({ value: { curve: 'step', n: 30, seed: 7, rate: 0.3, rounds: 8 } });
    for (const text of ['wave, 0.5, 10', 'sine, 0.5', 'sine, 0, 10', 'sine, 1.5, 10', 'sine, 0.5, 25', 'sine, 0.5, 10, 2']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

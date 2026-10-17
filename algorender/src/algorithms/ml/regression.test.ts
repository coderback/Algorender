import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { HeatmapShape, LineShape, PathShape } from '@/viz/plot/types';
import { descend, leastSquares, linearRegression, mse, MAX_POINTS, residuals, STEPS as LINEAR_STEPS, type LinearInput } from './linear-regression';
import { accuracy, crossEntropy, gradient, logisticRegression, prob, train, type LogisticInput, type Params } from './logistic-regression';

const tenth = fc.integer({ min: -30, max: 30 }).map((k) => k / 10 + 0);
const point = fc.record({ x: tenth, y: tenth });
const linearInput: fc.Arbitrary<LinearInput> = fc.record({
  points: fc.array(point, { minLength: 2, maxLength: MAX_POINTS }).filter((ps) => new Set(ps.map((p) => p.x)).size > 1),
  lr: fc.constantFrom(0.02, 0.05, 0.1, 0.15),
});

/** Area of a closed four-corner path, by the shoelace formula. */
const area = (s: PathShape) =>
  Math.abs(s.points.reduce((sum, [x, y], i) => {
    const [x2, y2] = s.points[(i + 1) % s.points.length];
    return sum + x * y2 - x2 * y;
  }, 0)) / 2;

describe('linear-regression', () => {
  it('plays every example as a good trace', () => {
    for (const ex of linearRegression.input.examples) expectGoodPlotTrace(linearRegression, traceOf(linearRegression, ex.make({ seed: 3, size: 0 })).frames);
  });

  it('converges to the exact least-squares line on clean data', () => {
    const { points } = linearRegression.input.examples[0].make({ seed: 0, size: 0 });
    const { fits } = descend({ points, lr: 0.1 });
    const best = leastSquares(points)!;
    expect(fits.at(-1)!.w).toBeCloseTo(best.w, 2);
    expect(fits.at(-1)!.b).toBeCloseTo(best.b, 2);
  });

  it('draws residual squares whose areas are the squared residuals, and charts the MSE', () => {
    fc.assert(
      fc.property(linearInput, (input) => {
        const frames = traceOf(linearRegression, input).frames;
        expectGoodPlotTrace(linearRegression, frames);
        const { fits } = descend(input);
        frames.forEach((f) => {
          const k = f.stats.steps;
          const r = residuals(input.points, fits[k]);
          const plane = planeOf(f.state);
          r.forEach((ri, i) => expect(area(plane.shapes.find((s) => s.id === `sq${i}`) as PathShape)).toBeCloseTo(ri * ri, 6));
          const loss = planeOf(f.state, 'loss').shapes.find((s) => s.id === 'loss') as PathShape;
          const last = loss.points.at(-1)!;
          expect(last[0]).toBe(k);
          // The chart clips only a blow-up, at four times its top (at least 4.6 × the starting MSE).
          const m = mse(input.points, fits[k]);
          if (m <= 4 * mse(input.points, fits[0])) expect(last[1]).toBeCloseTo(m, 9);
          else expect(last[1]).toBeLessThanOrEqual(m);
        });
        // The least-squares line really is the lowest MSE: nudging it only makes things worse.
        const best = leastSquares(input.points)!;
        for (const [dw, db] of [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]]) {
          expect(mse(input.points, { w: best.w + dw, b: best.b + db })).toBeGreaterThan(mse(input.points, best));
        }
      }),
      { numRuns: 60 },
    );
  });

  it('says honestly when the step size is too big', () => {
    const tooBig = linearRegression.input.examples.find((e) => e.id === 'too-big')!.make({ seed: 0, size: 0 });
    const frames = traceOf(linearRegression, tooBig).frames;
    expect(frames.at(-1)!.note).toMatch(/blew up/);
    expect(frames.length).toBeLessThanOrEqual(LINEAR_STEPS + 3);
  });

  it('drags exactly the point that was dragged, and round-trips custom input', () => {
    const { custom, drag } = linearRegression.input;
    fc.assert(
      fc.property(linearInput, fc.nat(), point, (input, k, to) => {
        const i = k % input.points.length;
        const next = drag!(input, `p${i}`, [to.x, to.y]);
        expect(next.points[i]).toEqual(to);
        next.points.forEach((p, j) => j !== i && expect(p).toEqual(input.points[j]));
        expect(next.lr).toBe(input.lr);
        expect(custom!.parse(custom!.format(input))).toEqual({ value: input });
      }),
    );
    expect(custom!.parse('(1, 2), (−3, 2.5)')).toEqual({ value: { points: [{ x: 1, y: 2 }, { x: -3, y: 2.5 }], lr: 0.1 } });
    for (const text of ['(1, 2)', '(1, 2), (3)', '(1, 2), (9, 4)', '(1, 2), (2, 3); lr = 5']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

describe('logistic-regression', () => {
  const input: fc.Arbitrary<LogisticInput> = fc.record({
    data: fc.constantFrom('linear', 'overlap', 'xor', 'circles' as const),
    n: fc.integer({ min: 10, max: 60 }),
    seed: fc.integer({ min: 0, max: 1000 }),
    lr: fc.constantFrom(0.3, 1, 2),
  });

  it('computes the cross-entropy gradient exactly (finite differences)', () => {
    fc.assert(
      fc.property(input, fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true }), (inp, w1, w2, b) => {
        const { points } = train({ ...inp, lr: 0 });
        const g = gradient({ w1, w2, b }, points);
        const h = 1e-6;
        const d = (key: keyof Params) => (crossEntropy({ w1, w2, b, [key]: { w1, w2, b }[key] + h }, points) - crossEntropy({ w1, w2, b, [key]: { w1, w2, b }[key] - h }, points)) / (2 * h);
        expect(g.w1).toBeCloseTo(d('w1'), 5);
        expect(g.w2).toBeCloseTo(d('w2'), 5);
        expect(g.b).toBeCloseTo(d('b'), 5);
      }),
      { numRuns: 60 },
    );
  });

  it('separates the linear data almost perfectly', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const { points, params } = train({ data: 'linear', n: 40, seed, lr: 1 });
      expect(accuracy(params.at(-1)!, points), `seed ${seed}`).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('draws the regions as σ(w·x + b) at cell centres and the boundary where p = ½', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(logisticRegression, inp).frames;
        expectGoodPlotTrace(logisticRegression, frames);
        const { params } = train(inp);
        for (const f of [frames[1], frames.at(-1)!]) {
          const p = params[f.stats.steps];
          const plane = planeOf(f.state);
          const heat = plane.shapes.find((s) => s.kind === 'heatmap') as HeatmapShape;
          const cw = (heat.x1 - heat.x0) / heat.cols;
          const ch = (heat.y1 - heat.y0) / heat.rows;
          heat.values.forEach((v, k) => {
            const x = heat.x0 + ((k % heat.cols) + 0.5) * cw;
            const y = heat.y1 - (Math.floor(k / heat.cols) + 0.5) * ch;
            expect(v).toBeCloseTo(prob(p, x, y), 9);
          });
          const line = plane.shapes.find((s) => s.id === 'boundary') as LineShape | undefined;
          if (line) expect(prob(p, ...line.through)).toBeCloseTo(0.5, 9);
          expect(readout(f.state, 'acc')).toBe(`${Math.round(accuracy(p, train(inp).points) * 100)}%`);
        }
      }),
      { numRuns: 30 },
    );
  });

  it('asks honestly whether the highlighted point will be right after the next step', () => {
    const inp: LogisticInput = { data: 'overlap', n: 30, seed: 4, lr: 1 };
    const frames = traceOf(logisticRegression, inp).frames;
    const { points, params } = train(inp);
    frames.forEach((f, i) => {
      if (!f.checkpoint?.question.includes('highlighted')) return;
      const focus = planeOf(f.state).shapes.find((s) => s.kind === 'point' && s.mark === 'key');
      const idx = Number(focus!.id.slice(1));
      const k = f.stats.steps;
      const p = prob(params[k + 1], points[idx].x, points[idx].y);
      expect(f.checkpoint.choices[f.checkpoint.answer], `frame ${i}`).toBe((p > 0.5 ? 1 : 0) === points[idx].label ? 'Yes' : 'No');
    });
  });

  it('is deterministic and fails honestly where no line can separate the classes', () => {
    const a = traceOf(logisticRegression, { data: 'xor', n: 40, seed: 5, lr: 1 }).frames;
    const b = traceOf(logisticRegression, { data: 'xor', n: 40, seed: 5, lr: 1 }).frames;
    expect(a).toEqual(b);
    expect(a.at(-1)!.note).toMatch(/hidden layers/);
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = logisticRegression.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    for (const text of ['spiral, n = 20, seed = 1, lr = 1', 'linear, n = 5, seed = 1, lr = 1', 'linear, n = 20, seed = 1', 'linear, n = 20, seed = 1, lr = 0']) {
      expect(custom!.parse(text)).toHaveProperty('error');
    }
  });
});

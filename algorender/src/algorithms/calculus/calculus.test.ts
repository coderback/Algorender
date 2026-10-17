import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PathShape, PlotState, Vec } from '@/viz/plot/types';
import { derivative, FUNCTIONS, type DerivativeInput, type FnId } from './derivative';
import { descend, gradientDescent, MAX_STEPS, type DescentInput } from './gradient-descent';
import { OPTIMIZERS, optimizers, race, RACE_STEPS } from './optimizers';
import { SURFACE_IDS, SURFACES } from './surfaces';

const shape = (state: PlotState, id: string, plane = 'plane') => planeOf(state, plane).shapes.find((s) => s.id === id);

describe('surfaces', () => {
  it('have gradients that match finite differences, and minima where the gradient vanishes', () => {
    for (const id of SURFACE_IDS) {
      const s = SURFACES[id];
      fc.assert(
        fc.property(fc.double({ min: s.x.min, max: s.x.max, noNaN: true }), fc.double({ min: s.y.min, max: s.y.max, noNaN: true }), (x, y) => {
          const h = 1e-5;
          const [gx, gy] = s.grad(x, y);
          expect(gx).toBeCloseTo((s.f(x + h, y) - s.f(x - h, y)) / (2 * h), 3);
          expect(gy).toBeCloseTo((s.f(x, y + h) - s.f(x, y - h)) / (2 * h), 3);
        }),
        { numRuns: 50 },
      );
      for (const m of s.minima) expect(Math.hypot(...s.grad(...m))).toBeLessThan(1e-9);
    }
  });
});

describe('derivative', () => {
  const input = fc
    .record({ fn: fc.constantFrom(...(Object.keys(FUNCTIONS) as FnId[])), k: fc.integer({ min: 0, max: 60 }) })
    .map(({ fn, k }): DerivativeInput => {
      const { x } = FUNCTIONS[fn];
      return { fn, a: Math.round((x.min + ((x.max - x.min) * k) / 60) * 10) / 10 + 0 };
    });

  it('plays every example as a good trace', () => {
    for (const ex of derivative.input.examples) expectGoodPlotTrace(derivative, traceOf(derivative, ex.make({ seed: 1, size: 0 })).frames, { handlesOnStep: false });
  });

  it('draws each secant through P and Q, then the tangent with slope f′(a), then f′ at every swept x', () => {
    fc.assert(
      fc.property(input, ({ fn, a }) => {
        const F = FUNCTIONS[fn];
        const frames = traceOf(derivative, { fn, a }).frames;
        expectGoodPlotTrace(derivative, frames, { handlesOnStep: false });
        for (const f of frames) {
          const q = shape(f.state, 'Q');
          const line = shape(f.state, 'secant');
          if (q?.kind === 'point' && line?.kind === 'line') {
            const h = q.at[0] - a;
            expect(line.dir[1] / line.dir[0]).toBeCloseTo((F.f(a + h) - F.f(a)) / h, 9);
            expect(q.at[1]).toBeCloseTo(F.f(a + h), 9);
          }
        }
        const tangent = frames.find((f) => f.line === 3)!;
        const d = F.df(a);
        const line = shape(tangent.state, 'secant');
        if (d == null) expect(line).toBeUndefined();
        else if (line?.kind === 'line') expect(line.dir[1]).toBeCloseTo(d, 9);
        else throw new Error('no tangent line');
        const swept = frames.filter((f) => f.line === 4).at(-2)!;
        const df = shape(swept.state, 'df', 'slope') as PathShape;
        for (const [x, y] of df.points) expect(y).toBeCloseTo(F.df(x)!, 9);
      }),
      { numRuns: 60 },
    );
  });

  it('finds no tangent at the corner of |x|', () => {
    const frames = traceOf(derivative, { fn: 'abs', a: 0 }).frames;
    expect(readout(frames.find((f) => f.line === 3)!.state, 'd')).toBe('none');
  });

  it('round-trips custom input and drags P along the curve', () => {
    const { custom, drag } = derivative.input;
    fc.assert(
      fc.property(input, ({ fn, a }) => {
        expect(custom!.parse(custom!.format({ fn, a }))).toEqual({ value: { fn, a } });
        expect(drag!({ fn, a }, 'a', [0.5, 99]).a).toBe(0.5);
      }),
    );
    expect(custom!.parse('tangent at 1')).toHaveProperty('error');
    expect(custom!.parse('square at 7')).toHaveProperty('error');
  });
});

describe('gradient-descent', () => {
  const input = fc
    .record({ surface: fc.constantFrom(...SURFACE_IDS), lr: fc.constantFrom(0.01, 0.05, 0.1, 0.18, 0.5, 1.05), fx: fc.double({ min: 0, max: 1, noNaN: true }), fy: fc.double({ min: 0, max: 1, noNaN: true }) })
    .map(({ surface, lr, fx, fy }): DescentInput => {
      const s = SURFACES[surface];
      const at = (a: { min: number; max: number }, t: number) => Math.round((a.min + (a.max - a.min) * t) * 10) / 10 + 0;
      return { surface, lr, start: [at(s.x, fx), at(s.y, fy)] };
    });

  it('plays every example as a good trace', () => {
    for (const ex of gradientDescent.input.examples) expectGoodPlotTrace(gradientDescent, traceOf(gradientDescent, ex.make({ seed: 1, size: 0 })).frames);
  });

  it('steps x ← x − η∇f(x) and asks honestly whether f will fall', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const s = SURFACES[inp.surface];
        const frames = traceOf(gradientDescent, inp).frames;
        expectGoodPlotTrace(gradientDescent, frames);
        const trail = (shape(frames.at(-1)!.state, 'trail') as PathShape).points;
        expect(trail[0]).toEqual(inp.start);
        expect(trail.length).toBeLessThanOrEqual(MAX_STEPS + 1);
        for (let k = 0; k + 1 < trail.length; k++) {
          const g = s.grad(...trail[k]);
          expect(trail[k + 1][0]).toBeCloseTo(trail[k][0] - inp.lr * g[0], 9);
          expect(trail[k + 1][1]).toBeCloseTo(trail[k][1] - inp.lr * g[1], 9);
        }
        frames.forEach((f, i) => {
          if (!f.checkpoint) return;
          const k = f.stats.steps;
          const lower = s.f(...trail[k + 1]) < s.f(...trail[k]);
          expect(f.checkpoint.choices[f.checkpoint.answer], `frame ${i}`).toBe(lower ? 'Yes' : 'No');
        });
      }),
      { numRuns: 80 },
    );
  });

  it('shows the classic behaviours on the examples', () => {
    const run = (id: string) => descend(gradientDescent.input.examples.find((e) => e.id === id)!.make({ seed: 0, size: 0 }));
    const bowl = run('bowl');
    expect(bowl.outcome).toBe('flat');
    expect(Math.hypot(...bowl.xs.at(-1)!)).toBeLessThan(1e-2);
    expect(run('too-big').fs.every((f, k, fs) => k === 0 || f > fs[k - 1])).toBe(true);
    const zig = run('zigzag').xs;
    expect(zig.slice(1, 6).every((x, k) => Math.sign(x[1]) !== Math.sign(zig[k][1]))).toBe(true);
    const valleys = run('two-valleys').xs.at(-1)!;
    expect(Math.hypot(valleys[0] - SURFACES['two-valleys'].minima[1][0], valleys[1])).toBeLessThan(0.15);
    expect(run('timid').outcome).toBe('steps');
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = gradientDescent.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    for (const text of ['hill, lr = 0.1, start = (0, 0)', 'bowl, lr = 0, start = (0, 0)', 'bowl, lr = 0.1, start = (9, 0)', 'bowl, 0.1']) {
      expect(custom!.parse(text)).toHaveProperty('error');
    }
  });
});

describe('optimizers', () => {
  it('plays every example as a good trace', () => {
    for (const ex of optimizers.input.examples) expectGoodPlotTrace(optimizers, traceOf(optimizers, ex.make({ seed: 1, size: 0 })).frames);
  });

  it('runs plain gradient descent exactly as the gradient-descent visualiser does', () => {
    for (const id of SURFACE_IDS) {
      const s = SURFACES[id];
      const start: Vec = [s.x.min * 0.6, s.y.max * 0.6];
      const mine = race(s, start, 'gd').xs.slice(0, MAX_STEPS + 1);
      const theirs = descend({ surface: id, lr: s.rates.plain, start }).xs;
      for (let k = 0; k < Math.min(mine.length, theirs.length); k++) expect(mine[k]).toEqual(theirs[k]);
    }
  });

  it('asks which optimizer leads after the next step and the next frame agrees', () => {
    for (const ex of optimizers.input.examples) {
      const frames = traceOf(optimizers, ex.make({ seed: 1, size: 0 })).frames;
      frames.forEach((f, i) => {
        if (!f.checkpoint) return;
        const next = frames[i + 1].state;
        const gaps = OPTIMIZERS.map((o) => Number((readout(next, o.id) ?? 'NaN').replace('−', '-')));
        const lowest = Math.min(...gaps);
        const named = OPTIMIZERS.findIndex((o) => o.name === f.checkpoint!.choices[f.checkpoint!.answer]);
        expect(gaps[named]).toBeCloseTo(lowest, 2);
      });
    }
  });

  it('lets momentum and Adam beat plain descent in the ravine and the banana', () => {
    for (const ex of ['valley', 'banana']) {
      const { surface, start } = optimizers.input.examples.find((e) => e.id === ex)!.make({ seed: 0, size: 0 });
      const s = SURFACES[surface];
      const gap = (id: (typeof OPTIMIZERS)[number]['id']) => race(s, start, id).fs[RACE_STEPS] - s.f(...s.minima[0]);
      expect(gap('momentum'), ex).toBeLessThan(gap('gd'));
      expect(gap('adam'), ex).toBeLessThan(gap('gd'));
    }
  });
});

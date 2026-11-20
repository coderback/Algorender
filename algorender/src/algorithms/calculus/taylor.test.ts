// Property tests for the Taylor approximation and Newton's method (B4 of the
// math and ML path): the fits copy f's height, slope and bend at a, their
// misses shrink like d, d² and d³, Newton's iterates square the error once
// close, and the Newton step on a loss is the bottom of its Taylor parabola.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Shape, Vec } from '@/viz/plot/types';
import {
  A_STEP,
  correctDecimals,
  d2Loss,
  descentRuns,
  dLoss,
  errorTable,
  fitError,
  forgotTheTwo,
  FUNCTIONS,
  gdParabola,
  gdStep,
  loss,
  nearestPower,
  NEWTON_FRAMES,
  NEWTON_RANGE,
  newtonStep,
  parseTaylor,
  RUN_STEPS,
  SHRINK_CHOICES,
  sqrtNewton,
  STEP_RANGE,
  STOP,
  taylor,
  taylorParabola,
  taylorPoly,
  W_STAR,
  type FnId,
  type Order,
  type TaylorInput,
} from './taylor';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const shapeIn = (state: PlotState, id: string, plane = 'plane'): Shape | undefined => planeOf(state, plane).shapes.find((s) => s.id === id);
const answer = (frames: readonly { checkpoint?: { choices: readonly string[]; answer: number } }[], i: number) => {
  const c = frames[i].checkpoint!;
  return c.choices[c.answer];
};
const range = (min: number, max: number, step: number) => Array.from({ length: Math.round((max - min) / step) + 1 }, (_, k) => min + k * step);
const derivative = (g: (x: number) => number, x: number, h = 1e-4) => (g(x + h) - g(x - h)) / (2 * h);
const second = (g: (x: number) => number, x: number, h = 1e-3) => (g(x + h) - 2 * g(x) + g(x - h)) / (h * h);

function roundTrips(input: TaylorInput) {
  const custom = taylor.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const trace = (input: TaylorInput) => traceOf(taylor, input).frames;
const good = (frames: ReturnType<typeof trace>) => expectGoodPlotTrace(taylor, frames, { handlesOnStep: false });

/** Every input on the stories' grids. */
const GRID: TaylorInput[] = [
  ...(['exp', 'log'] as FnId[]).flatMap((fn) => range(FUNCTIONS[fn].aMin, FUNCTIONS[fn].aMax, A_STEP).map((a): TaylorInput => ({ story: 'fits', fn, a }))),
  ...range(NEWTON_RANGE.min, NEWTON_RANGE.max, NEWTON_RANGE.step).map((x0): TaylorInput => ({ story: 'newton', x0 })),
  ...range(STEP_RANGE.min, STEP_RANGE.max, STEP_RANGE.step)
    .filter((w0) => w0 !== W_STAR)
    .map((w0): TaylorInput => ({ story: 'step', w0 })),
];

describe('taylor', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of taylor.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as TaylorInput;
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [
              [h.at[0] + h.step, h.at[1] - h.step],
              [h.at[0] - h.step, h.at[1]],
              [h.min[0], 0],
              [h.max[0], 0],
              [0, 0],
            ] as Vec[]) {
              const moved = taylor.input.drag!(input as never, h.id, to) as TaylorInput;
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
    }
  });

  it('plays every input on the grids, with the same frame count per story and the same handles', () => {
    const counts: Record<string, Set<number>> = {};
    for (const input of GRID) {
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      (counts[input.story] ??= new Set()).add(frames.length);
      // Each handle sits on the shape it moves.
      const h = planeOf(frames[0].state).handles[0];
      if (input.story === 'fits') expect(h.at[0]).toBe(input.a);
      if (input.story === 'newton') expect(h.at).toEqual([input.x0, 0]);
      if (input.story === 'step') expect(h.at).toEqual([input.w0, loss(input.w0)]);
    }
    expect(Object.values(counts).map((s) => s.size)).toEqual([1, 1, 1]);
    // The lesson's Predict challenge needs at least three questions in each story.
    for (const input of GRID) expect(trace(input).filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(3);
  });

  it('refuses inputs outside the stories', () => {
    for (const text of ['fits exp at 2', 'fits log at 0.5', 'fits exp at 0.3', 'fits at 1', 'newton from 0', 'newton from 1.25', 'newton from 5', 'step from 2', 'step from 5', 'step from 1.25', 'taylor 1'])
      expect(parseTaylor(text), text).toHaveProperty('error');
    // Dragging the step story onto the minimum leaves it where it was.
    const input: TaylorInput = { story: 'step', w0: 2.5 };
    expect(taylor.input.drag!(input as never, 'w0', [2, 0])).toBe(input);
  });

  it('fits pass through (a, f(a)), the tangent with slope f′(a) and the parabola with bend f″(a)', () => {
    fc.assert(
      fc.property(fc.constantFrom<FnId>('exp', 'log'), fc.double({ min: 0, max: 1, noNaN: true }), (id, u) => {
        const fn = FUNCTIONS[id];
        const a = fn.aMin + u * (fn.aMax - fn.aMin);
        for (const o of [0, 1, 2] as Order[]) expect(taylorPoly(fn, a, o)(a)).toBe(fn.f(a));
        expect(derivative(taylorPoly(fn, a, 1), a)).toBeCloseTo(fn.df(a), 6);
        expect(derivative(taylorPoly(fn, a, 2), a)).toBeCloseTo(fn.df(a), 6);
        expect(second(taylorPoly(fn, a, 2), a)).toBeCloseTo(fn.d2f(a), 4);
        // The derivatives are right: f′ and f″ against differences of f.
        expect(derivative(fn.f, a)).toBeCloseTo(fn.df(a), 6);
        expect(second(fn.f, a, 1e-4)).toBeCloseTo(fn.d2f(a), 3);
      }),
      { numRuns: 100 },
    );
  });

  it('draws each fit where the maths puts it', () => {
    for (const input of GRID) {
      if (input.story !== 'fits') continue;
      const fn = FUNCTIONS[input.fn];
      const { a } = input;
      const frames = trace(input);
      const P = shapeIn(frames[0].state, 'P');
      expect(P?.kind === 'point' && P.at[0] === a && close(P.at[1], fn.f(a), 0.006)).toBe(true);
      const tangent = shapeIn(frames[2].state, 'fit1');
      expect(tangent?.kind === 'line' && tangent.through[0] === a && close(tangent.dir[1] / tangent.dir[0], fn.df(a), 1e-4)).toBe(true);
      const parabola = shapeIn(frames[5].state, 'fit2');
      if (parabola?.kind !== 'path') throw new Error('no parabola');
      for (const [x, y] of parabola.points) expect(Math.abs(y - taylorPoly(fn, a, 2)(x))).toBeLessThanOrEqual(0.006);
      // Error bars join the fit to the curve at x = a + 0.5.
      const bar = shapeIn(frames[5].state, 'bar2');
      if (bar?.kind !== 'path') throw new Error('no bar');
      expect(bar.points[0][0]).toBeCloseTo(a + 0.5, 9);
      expect(Math.abs(bar.points[1][1] - bar.points[0][1] - (fn.f(a + 0.5) - taylorPoly(fn, a, 2)(a + 0.5)))).toBeLessThanOrEqual(0.011);
      // The answers: which side the guesses fall, the bend, the halvings.
      expect(answer(frames, 0)).toBe('Below the curve');
      expect(answer(frames, 1)).toBe(fn.d2f(a) > 0 ? 'Below the curve' : 'Above the curve');
      expect(answer(frames, 2)).toBe(fn.d2f(a) > 0 ? 'Steeper' : 'Shallower');
      expect(answer(frames, 3)).toBe(fmt(fn.d2f(a)));
      expect(answer(frames, 4)).toBe(fmt(fn.d2f(a) / 8, 3));
      expect(answer(frames, 5)).toBe('The parabola');
      expect(answer(frames, 6)).toBe('About 4 times');
      expect(answer(frames, 7)).toBe('About 8 times');
      expect(readout(frames[5].state, 'e2')).toBe(fmt(fitError(fn, a, 2, 0.5), 4));
    }
  });

  it('misses shrink like d, d² and d³: halving a small d divides them by about 2, 4 and 8', () => {
    fc.assert(
      fc.property(fc.constantFrom<FnId>('exp', 'log'), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0.002, max: 0.05, noNaN: true }), (id, u, d) => {
        const fn = FUNCTIONS[id];
        const a = fn.aMin + u * (fn.aMax - fn.aMin);
        const table = errorTable(fn, a, [d, d / 2, d / 4]);
        table.forEach((row, o) => {
          for (const r of row.ratios) expect(Math.abs(r / 2 ** (o + 1) - 1), `order ${o}, ratio ${r}`).toBeLessThan(0.1);
          expect(nearestPower(row.ratios[0])).toBe(2 ** (o + 1));
          // The miss is about the next Taylor term: |f⁽ⁿ⁺¹⁾(a)| dⁿ⁺¹ / (n + 1)!.
          if (o < 2) {
            const next = o === 0 ? Math.abs(fn.df(a)) * d : (Math.abs(fn.d2f(a)) * d * d) / 2;
            expect(Math.abs(row.errors[0] / next - 1)).toBeLessThan(0.1);
          }
        });
        // And every left and right miss, both sides, gets smaller as the order goes up.
        for (const s of [d, -d]) expect(fitError(fn, a, 2, s)).toBeLessThan(fitError(fn, a, 1, s));
      }),
      { numRuns: 150 },
    );
  });

  it('Newton’s iterates match the reference and square the error once close', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.25, max: 4, noNaN: true }), fc.double({ min: 0.1, max: 10, noNaN: true }), (a, x0) => {
        const r = Math.sqrt(a);
        const xs = sqrtNewton(a, x0);
        expect(xs[0]).toBe(x0);
        for (let k = 1; k < xs.length; k++) expect(close(xs[k], (xs[k - 1] + a / xs[k - 1]) / 2, 1e-12)).toBe(true);
        expect(close(xs[xs.length - 1], r, 1e-12)).toBe(true);
        expect(Math.abs(xs[xs.length - 1] - xs[xs.length - 2])).toBeLessThan(STOP);
        for (let k = 0; k + 1 < xs.length; k++) {
          const e = xs[k] - r;
          // The new error is exactly the old one squared over 2x.
          if (Math.abs(e) > 1e-5 * r) expect(close(xs[k + 1] - r, (e * e) / (2 * xs[k]), 1e-4)).toBe(true);
          // After the first step every iterate sits at or above the root.
          if (k >= 1) expect(xs[k]).toBeGreaterThanOrEqual(r * (1 - 1e-15));
        }
      }),
      { numRuns: 200 },
    );
    expect(correctDecimals(1.4142)).toBe(4);
    expect(correctDecimals(1.41)).toBe(2);
    // Counted digit by digit, as a learner reads them: 1.414998 agrees on 414.
    expect(correctDecimals(1.414998429895)).toBe(3);
    expect(correctDecimals(1.4199)).toBe(2);
    expect(correctDecimals(Math.SQRT2 + 2.3e-16)).toBe(15);
    expect(correctDecimals(1.732, Math.sqrt(3))).toBe(3);
    expect(correctDecimals(3)).toBe(0);
    expect(correctDecimals(Math.SQRT2)).toBe(15);
    expect(forgotTheTwo(2, 3, 4)).toEqual([3, 2 / 3, 3, 2 / 3, 3].map((x, k) => (k ? expect.closeTo(x, 12) : x)));
  });

  it('draws the Newton story from its own iterates', () => {
    for (const input of GRID) {
      if (input.story !== 'newton') continue;
      const xs = sqrtNewton(2, input.x0);
      expect(xs.length - 1).toBeGreaterThanOrEqual(NEWTON_FRAMES);
      const frames = trace(input);
      const over = Math.sign(input.x0 - Math.SQRT2) !== Math.sign(xs[1] - Math.SQRT2);
      expect(answer(frames, 0)).toBe(over ? 'It overshoots √2' : 'It stops short of √2');
      expect(answer(frames, 1)).toBe(fmt(xs[2], 3));
      const dec = xs.map((x) => correctDecimals(x));
      // Asked about the next count only once there is one to double; before that, which side of √2.
      for (const k of [2, 3]) expect(answer(frames, k)).toBe(dec[k] === 0 ? (xs[k + 1] > Math.SQRT2 ? 'Above √2' : 'Below √2') : String(dec[k + 1]));
      for (const k of [2, 3]) if (dec[k] > 0) expect(frames[k].checkpoint!.choices).toContain(String(2 * dec[k]));
      // Once close, the correct decimals roughly double (never fewer than 2d − 1), ending at the 15 a double holds.
      for (let k = 0; k + 1 < xs.length; k++) if (dec[k] >= 1) expect(dec[k + 1]).toBeGreaterThanOrEqual(Math.min(2 * dec[k] - 1, 15));
      expect(dec[xs.length - 1]).toBe(15);
      expect(answer(frames, 4)).toBe(Math.abs(xs[5] - xs[4]) < STOP ? 'Yes' : 'No');
      for (let k = 0; k < NEWTON_FRAMES; k++) {
        const state = frames[k + 1].state;
        expect(readout(state, 'next')).toBe(fmt(xs[k + 1], 12));
        const next = shapeIn(state, 'next');
        expect(next?.kind === 'point' && next.at[0] === xs[k + 1] && next.at[1] === 0).toBe(true);
        // The tangent passes through (x, f(x)) with slope 2x, and crosses zero at the next iterate.
        const tan = shapeIn(state, 'tan');
        if (tan?.kind !== 'line') throw new Error('no tangent');
        const [px, py] = tan.through;
        expect(close(px - (py * tan.dir[0]) / tan.dir[1], xs[k + 1], 1e-12)).toBe(true);
        expect(tan.dir[1] / tan.dir[0]).toBe(2 * xs[k]);
      }
      const summary = frames[NEWTON_FRAMES + 1].state;
      xs.forEach((x, k) => expect(readout(summary, `x${k}`)).toBe(`${fmt(x, 12)} · ${correctDecimals(x)} decimal${correctDecimals(x) === 1 ? '' : 's'}`));
      expect(answer(frames, NEWTON_FRAMES + 1)).toBe('It bounces between two values');
      expect(readout(frames[frames.length - 1].state, 'w1')).toBe(fmt(2 / input.x0, 6));
    }
  });

  it('the Newton step is the bottom of the Taylor parabola, and the gradient step the bottom of one with bend 1/η', () => {
    fc.assert(
      fc.property(fc.double({ min: -0.5, max: 4.5, noNaN: true }), fc.double({ min: 0.01, max: 0.5, noNaN: true }), (w0, eta) => {
        // L′ and L″ are right.
        expect(derivative(loss, w0)).toBeCloseTo(dLoss(w0), 5);
        expect(derivative(dLoss, w0)).toBeCloseTo(d2Loss(w0), 5);
        // The Taylor parabola copies L's height, slope and bend at w₀.
        const T = taylorParabola(w0);
        expect(T(w0)).toBe(loss(w0));
        expect(derivative(T, w0)).toBeCloseTo(dLoss(w0), 5);
        expect(second(T, w0)).toBeCloseTo(d2Loss(w0), 3);
        // Its lowest point is the Newton step: slope 0 there, and nothing nearby is lower.
        const n = newtonStep(w0);
        expect(derivative(T, n)).toBeCloseTo(0, 6);
        for (const s of [-0.1, 0.1]) expect(T(n + s)).toBeGreaterThan(T(n));
        // The gradient step is the bottom of the parabola with the same height and slope and a bend of 1/η.
        const Q = gdParabola(w0, eta);
        const g = gdStep(w0, eta);
        expect(derivative(Q, g)).toBeCloseTo(0, 5);
        expect(second(Q, w0)).toBeCloseTo(1 / eta, 2);
        expect(Q(w0)).toBe(loss(w0));
        // Newton never overshoots this loss and always gets closer.
        if (w0 !== W_STAR) expect(Math.abs(n - W_STAR)).toBeLessThan(Math.abs(w0 - W_STAR));
        expect(Math.sign(n - W_STAR) * Math.sign(w0 - W_STAR)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });

  it('draws the step story from its own runs', () => {
    for (const input of GRID) {
      if (input.story !== 'step') continue;
      const { w0 } = input;
      const runs = descentRuns(w0);
      const frames = trace(input);
      expect(answer(frames, 0)).toBe(dLoss(w0) > 0 ? 'Left, to smaller w' : 'Right, to larger w');
      expect(answer(frames, 1)).toBe(fmt(gdStep(w0), 3));
      expect(answer(frames, 2)).toBe(fmt(newtonStep(w0), 3));
      const closer = (n: number) => (Math.abs(runs.newton[n] - W_STAR) < Math.abs(runs.gd[n] - W_STAR) ? 'Newton' : 'Gradient descent');
      expect(answer(frames, 3).startsWith(closer(2))).toBe(true);
      // Then: what one gradient step multiplies the distance by. After the first step it is always near 1 − η·2 = 0.8.
      for (const n of [3, 4]) {
        const r = Math.abs(runs.gd[n] - W_STAR) / Math.abs(runs.gd[n - 1] - W_STAR);
        expect(r).toBeGreaterThan(0.7);
        expect(r).toBeLessThanOrEqual(0.8);
        expect(answer(frames, n + 1)).toBe(SHRINK_CHOICES.find((c) => c.value === 0.8)!.label);
      }
      // Where each lands on the curve.
      const nt = shapeIn(frames[3].state, 'nt1');
      expect(nt?.kind === 'point' && nt.at[0] === runs.newton[1] && nt.at[1] === loss(runs.newton[1])).toBe(true);
      const gd = shapeIn(frames[2].state, 'gd1');
      expect(gd?.kind === 'point' && gd.at[0] === runs.gd[1]).toBe(true);
      // After four steps Newton is far closer than gradient descent.
      expect(Math.abs(runs.newton[RUN_STEPS] - W_STAR)).toBeLessThan(Math.abs(runs.gd[RUN_STEPS] - W_STAR));
      // The distance chart never goes up for Newton.
      const dist = shapeIn(frames[frames.length - 1].state, 'ntd', 'dist');
      if (dist?.kind !== 'path') throw new Error('no distance chart');
      dist.points.slice(1).forEach((p, i) => expect(p[1]).toBeLessThanOrEqual(dist.points[i][1]));
    }
  });
});

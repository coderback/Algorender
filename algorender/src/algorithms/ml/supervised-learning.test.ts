// Property tests for the supervised-learning visualiser (B3 of the math and ML
// path): the table, the drawn errors and the loss readouts agree with the
// arithmetic they narrate, every question is answered by the maths, and the
// split story's memoriser really scores 0 on what it has seen.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planeOf, readout, traceOf, expectGoodPlotTrace } from '@/viz/plot/testing';
import { fmt, planeGeometry } from '@/viz/plot/geometry';
import type { ImagePart, PlotState, Vec } from '@/viz/plot/types';
import {
  bestLine,
  dragLearning,
  errors,
  lineOf,
  loss,
  memorise,
  memoriserLoss,
  mse,
  parseLearning,
  predict,
  SPAN,
  square,
  squareAcross,
  trendOf,
  SPLIT,
  splitData,
  splitStory,
  supervisedLearning,
  TOP,
  type Ends,
  type LearningInput,
  type XY,
} from './supervised-learning';

type F = { state: PlotState; checkpoint?: { question: string; choices: readonly string[]; answer: number }; note: string };
const framesOf = (input: LearningInput) => traceOf(supervisedLearning, input).frames as F[];
const answerOf = (f: F) => f.checkpoint!.choices[f.checkpoint!.answer];
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const tableOf = (state: PlotState) => state.parts.find((p): p is ImagePart => p.kind === 'image' && p.id === 'table')!;

function roundTrips(input: LearningInput) {
  const custom = supervisedLearning.input.custom!;
  const text = custom.format(input);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const half = (lo: number, hi: number) => fc.integer({ min: lo * 2, max: hi * 2 }).map((v) => v / 2);
const ends: fc.Arbitrary<Ends> = fc.record({ left: half(0, TOP), right: half(0, TOP) });
const hundredths = (lo: number, hi: number) => fc.integer({ min: lo * 100, max: hi * 100 }).map((v) => v / 100);
const examples: fc.Arbitrary<XY[]> = fc.array(fc.record({ x: hundredths(0, SPAN), y: hundredths(0, TOP) }), { minLength: 2, maxLength: 8 });
const fitInput: fc.Arbitrary<LearningInput> = fc.record({ story: fc.constant('fit' as const), points: examples, line: ends, other: ends });

describe('supervised-learning', () => {
  it('plays every example, round-trips its text and survives every drag with the same number of frames', () => {
    for (const ex of supervisedLearning.input.examples) {
      for (const seed of [0, 1, 7]) {
        const input = ex.make({ seed, size: 0 });
        const frames = framesOf(input);
        expectGoodPlotTrace(supervisedLearning, frames as never);
        roundTrips(input);
        for (const f of frames)
          for (const part of f.state.parts) {
            if (part.kind !== 'plane') continue;
            for (const h of part.handles) {
              const to: Vec = [Math.min(h.max[0], h.at[0] + h.step), Math.max(h.min[1], h.at[1] - h.step)];
              const moved = supervisedLearning.input.drag!(input, h.id, to);
              expect(moved, h.id).not.toEqual(input);
              const again = framesOf(moved);
              expectGoodPlotTrace(supervisedLearning, again as never);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id}`).toBe(frames.length);
            }
          }
      }
    }
  });

  it('computes the mean squared error as the mean of the squared errors: never negative, 0 only for a perfect line', () => {
    fc.assert(
      fc.property(examples, half(-2, 2), half(-4, 4), (pts, w, b) => {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const e = xs.map((x, i) => w * x + b - ys[i]);
        const want = e.reduce((s, x) => s + x * x, 0) / e.length;
        expect(close(mse(w, b, xs, ys), want)).toBe(true);
        expect(mse(w, b, xs, ys)).toBeGreaterThanOrEqual(0);
        expect(close(loss({ w, b }, pts), want)).toBe(true);
        // On examples that lie on the line, the loss is exactly 0.
        expect(mse(w, b, xs, xs.map((x) => w * x + b))).toBe(0);
      }),
    );
  });

  it('draws the line through its two handles, and fills the table and readouts with ŷ, e, e² and the MSE', () => {
    fc.assert(
      fc.property(fitInput, (input) => {
        if (input.story !== 'fit') return;
        const frames = framesOf(input);
        expectGoodPlotTrace(supervisedLearning, frames as never);
        roundTrips(input);
        const A = lineOf(input.line);
        expect(close(predict(A, 0), input.line.left)).toBe(true);
        expect(close(predict(A, SPAN), input.line.right)).toBe(true);
        const full = tableOf(frames[3].state);
        expect(full.width).toBe(5);
        expect(full.height).toBe(input.points.length);
        const e = errors(A, input.points);
        input.points.forEach((p, i) => {
          const row = full.values!.slice(i * 5, i * 5 + 5);
          expect(row).toEqual([p.x, p.y, predict(A, p.x), e[i], e[i] * e[i]].map((v) => fmt(v)));
        });
        expect(readout(frames[3].state, 'mse')).toBe(fmt(loss(A, input.points), 4));
        expect(readout(frames[5].state, 'mseB')).toBe(fmt(loss(lineOf(input.other), input.points), 4));
        // Every gap runs from its example straight up or down to the line.
        for (const s of planeOf(frames[2].state).shapes) {
          if (s.kind !== 'path' || !s.id.startsWith('gap')) continue;
          const p = input.points[Number(s.id.slice(3))];
          expect(s.points).toEqual([
            [p.x, p.y],
            [p.x, predict(A, p.x)],
          ]);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('answers each question from the maths: the guess, the biggest miss, the loss and the better line', () => {
    fc.assert(
      fc.property(fitInput, (input) => {
        if (input.story !== 'fit') return;
        const frames = framesOf(input);
        const A = lineOf(input.line);
        const B = lineOf(input.other);
        expect(answerOf(frames[0])).toBe(trendOf(input.points));
        const probe = Math.min(1, input.points.length - 1);
        expect(answerOf(frames[1])).toBe(fmt(predict(A, input.points[probe].x)));
        const sizes = errors(A, input.points).map(Math.abs);
        const biggest = Math.max(...sizes);
        if (frames[2].checkpoint) expect(sizes[Number(answerOf(frames[2]).replace('Example ', '')) - 1]).toBe(biggest);
        else expect(sizes.filter((s) => Math.abs(s - biggest) < 1e-9).length).toBeGreaterThan(1);
        expect(answerOf(frames[3])).toBe(fmt(loss(A, input.points), 4));
        const la = loss(A, input.points);
        const lb = loss(B, input.points);
        expect(answerOf(frames[4])).toBe(Math.abs(la - lb) < 1e-9 ? 'They tie' : la < lb ? 'Line A' : 'Line B');
      }),
      { numRuns: 80 },
    );
  });

  it('draws each error’s square as tall as it is wide on screen, and on the five students no square reaches another student', () => {
    fc.assert(
      fc.property(fc.record({ x: hundredths(0, SPAN), y: hundredths(0, TOP) }), half(-4, 4), (p, e) => {
        const corners = square(p, e);
        const plane = { x: { min: 0, max: SPAN }, y: { min: 0, max: TOP }, equal: false };
        const g = planeGeometry(plane);
        const [a, b, c] = corners.map((v) => g.px(v));
        expect(Math.abs(Math.abs(b[1] - a[1]) - Math.abs(c[0] - b[0]))).toBeLessThan(0.02);
        expect(close(Math.abs(corners[2][0] - p.x), squareAcross(e))).toBe(true);
      }),
    );
    const input = supervisedLearning.input.examples.find((x) => x.id === 'fit')!.make({ seed: 0, size: 0 });
    if (input.story !== 'fit') throw new Error('fit');
    const frames = framesOf(input);
    const shapes = planeOf(frames[frames.length - 1].state).shapes;
    const spans = shapes.flatMap((s) => (s.kind === 'path' && /^b?sq\d+$/.test(s.id) ? [{ who: Number(s.id.replace(/\D/g, '')), lo: Math.min(...s.points.map((q) => q[0])), hi: Math.max(...s.points.map((q) => q[0])) }] : []));
    expect(spans.length).toBe(10);
    for (const s of spans) {
      input.points.forEach((q, i) => {
        if (i !== s.who) expect(q.x < s.lo || q.x > s.hi, `square of ${s.who + 1} reaches student ${i + 1}`).toBe(true);
      });
      for (const t of spans) if (t.who !== s.who && t.hi > t.lo && s.hi > s.lo) expect(t.hi <= s.lo || t.lo >= s.hi, `squares of ${s.who + 1} and ${t.who + 1} overlap`).toBe(true);
    }
  });

  it('moves only the dragged end of the dragged line, snapped to halves inside the plane', () => {
    fc.assert(
      fc.property(fitInput, fc.constantFrom('left', 'right', 'bleft', 'bright'), fc.double({ min: -3, max: 12, noNaN: true }), (input, id, y) => {
        if (input.story !== 'fit') return;
        const moved = dragLearning(input, id, [0, y]);
        if (moved.story !== 'fit') throw new Error('story changed');
        const h = Math.min(TOP, Math.max(0, Math.round(y * 2) / 2));
        const line = id.startsWith('b') ? moved.other : moved.line;
        const kept = id.startsWith('b') ? moved.line : moved.other;
        expect(line[id.endsWith('left') ? 'left' : 'right']).toBe(h);
        expect(kept).toEqual(id.startsWith('b') ? input.line : input.other);
        expect(moved.points).toBe(input.points);
      }),
    );
  });

  it('finds the line no other line beats on the training examples', () => {
    fc.assert(
      fc.property(examples, fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), (pts, dw, db) => {
        const best = bestLine(pts);
        expect(loss(best, pts)).toBeLessThanOrEqual(loss({ w: best.w + dw, b: best.b + db }, pts) + 1e-9);
      }),
    );
  });

  it('splits by the seed into disjoint train and test sets; the memoriser scores 0 on its own training examples', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999 }), (seed) => {
        const { points, test } = splitData(seed);
        expect(splitData(seed)).toEqual({ points, test });
        expect(points).toHaveLength(SPLIT.n);
        expect(test.size).toBe(SPLIT.test);
        for (const i of test) expect(i >= 0 && i < SPLIT.n).toBe(true);
        for (const p of points) expect(p.y >= 0 && p.y <= SPLIT.y && p.x >= 0 && p.x <= SPLIT.x).toBe(true);
        const s = splitStory(seed);
        expect(s.train.length + s.tested.length).toBe(SPLIT.n);
        expect(memoriserLoss(s.train, s.train)).toBe(0);
        for (const p of s.tested) {
          // The memoriser answers the label of a nearest training example.
          const nearest = Math.min(...s.train.map((q) => Math.abs(q.x - p.x)));
          expect(s.train.some((q) => Math.abs(q.x - p.x) === nearest && q.y === memorise(s.train, p.x))).toBe(true);
        }
        expect(s.trainLoss.line).toBeGreaterThanOrEqual(0);
        expect(s.trainLoss.line).toBeLessThanOrEqual(loss({ w: 0.6, b: 1 }, s.train) + 1e-9);
      }),
      { numRuns: 60 },
    );
  });

  it('reports the losses it narrates and asks which model wins on the test set honestly', () => {
    for (const seed of [0, 1, 2, 3, 4, 7, 10, 42]) {
      const frames = framesOf({ story: 'split', seed });
      expectGoodPlotTrace(supervisedLearning, frames as never);
      const s = splitStory(seed);
      expect(answerOf(frames[1])).toBe('0');
      expect(answerOf(frames[2])).toBe('The memoriser');
      expect(answerOf(frames[3])).toBe(s.testLoss.line < s.testLoss.memoriser ? 'The line' : 'The memoriser');
      const end = frames[frames.length - 1].state;
      expect(readout(end, 'memTrain')).toBe(fmt(s.trainLoss.memoriser, 3));
      expect(readout(end, 'lineTrain')).toBe(fmt(s.trainLoss.line, 3));
      expect(readout(end, 'memTest')).toBe(fmt(s.testLoss.memoriser, 3));
      expect(readout(end, 'lineTest')).toBe(fmt(s.testLoss.line, 3));
      const tests = planeOf(end).shapes.filter((x) => x.kind === 'point' && x.mark === 'frontier');
      expect(tests).toHaveLength(SPLIT.test);
    }
  });

  it('refuses custom text it can’t draw', () => {
    for (const bad of ['', 'fit (1, 2); line A 1 7; line B 2 5', 'fit (1, 2), (2, 3); line A 1 7', 'fit (1, 2), (9, 3); line A 1 7; line B 2 5', 'fit (1, 2), (2, 3); line A 1.3 7; line B 2 5', 'split seed -1', 'split seed 2.5', 'fit (1, 2), (2); line A 1 7; line B 2 5']) {
      expect('error' in parseLearning(bad), bad).toBe(true);
    }
    expect(parseLearning('split seed 9')).toEqual({ value: { story: 'split', seed: 9 } });
  });
});

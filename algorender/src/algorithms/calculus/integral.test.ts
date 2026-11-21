// Property tests for integrals as accumulated area (B5 of the math and ML
// path): the sums match a plain reference, left and right ends miss like 1/n
// and middles and trapezoids like 1/n², the accumulated area's slope is the
// curve's height, and the power rule run backwards gives the areas. Every
// story is drawn from its own numbers, asks about what the next frame shows,
// and never gives a question's answer away in the frame that asks it.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Shape, Vec } from '@/viz/plot/types';
import {
  B_RANGE,
  dip,
  FINE,
  dipArea,
  grouped,
  integral,
  measuredA,
  measuredSlope,
  NS,
  parseIntegral,
  POWER_RANGE,
  powerArea,
  riemannSum,
  samplePoint,
  speed,
  squareArea,
  stripsNeeded,
  SWEEP,
  TOLERANCE,
  trapezoidSum,
  X_RANGE,
  type IntegralInput,
  type Rule,
} from './integral';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const shapeIn = (state: PlotState, id: string, plane = 'plane'): Shape | undefined => planeOf(state, plane).shapes.find((s) => s.id === id);
const answer = (frames: readonly { checkpoint?: { choices: readonly string[]; answer: number } }[], i: number) => {
  const c = frames[i].checkpoint!;
  return c.choices[c.answer];
};
const range = (r: { min: number; max: number; step: number }) => Array.from({ length: Math.round((r.max - r.min) / r.step) + 1 }, (_, k) => r.min + k * r.step);
const num = (s: string) => Number(s.replace('−', '-').replace(/,/g, ''));

function roundTrips(input: IntegralInput) {
  const custom = integral.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const trace = (input: IntegralInput) => traceOf(integral, input).frames;
const good = (frames: ReturnType<typeof trace>) => expectGoodPlotTrace(integral, frames, { handlesOnStep: false });

/** Every input on the stories' grids. */
const GRID: IntegralInput[] = [
  ...range(B_RANGE).map((b): IntegralInput => ({ story: 'sums', b })),
  ...range(B_RANGE).map((b): IntegralInput => ({ story: 'rules', b })),
  ...range(X_RANGE).map((x): IntegralInput => ({ story: 'accumulate', x })),
  ...range(POWER_RANGE).map((b): IntegralInput => ({ story: 'power', b })),
];

/** A plain reference: the strips listed one by one, then added up. */
const reference = (f: (x: number) => number, a: number, b: number, n: number, rule: Rule | 'trap') => {
  const w = (b - a) / n;
  const strips = Array.from({ length: n }, (_, i) => {
    const [l, r] = [a + i * w, a + (i + 1) * w];
    if (rule === 'trap') return ((f(l) + f(r)) / 2) * w;
    return f(rule === 'left' ? l : rule === 'right' ? r : (l + r) / 2) * w;
  });
  return strips.reduce((s, v) => s + v, 0);
};

describe('integral', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of integral.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as IntegralInput;
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [[h.at[0] + h.step, h.at[1] - h.step], [h.at[0] - h.step, h.at[1]], [h.min[0], 0], [h.max[0], 0], [0, 0], [9, 9]] as Vec[]) {
              const moved = integral.input.drag!(input as never, h.id, to) as IntegralInput;
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
    }
  });

  it('plays every input on the grids, with one frame count per story, each handle on the shape it moves', () => {
    const counts: Record<string, Set<number>> = {};
    for (const input of GRID) {
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      (counts[input.story] ??= new Set()).add(frames.length);
      expect(frames.filter((f) => f.checkpoint).length, input.story).toBeGreaterThanOrEqual(4);
      for (const f of frames) {
        const h = planeOf(f.state).handles[0];
        if (!h) continue;
        if (input.story === 'accumulate') expect(h.at).toEqual([input.x, dip(input.x)]);
        else expect(h.at).toEqual([input.b, input.b * input.b]);
        // The point drawn under the handle is where the handle is.
        const under = planeOf(f.state).shapes.find((s) => s.kind === 'point' && s.at[0] === h.at[0] && Math.abs(s.at[1] - h.at[1]) < 1e-4);
        expect(under, `${input.story}: nothing drawn under the handle`).toBeDefined();
      }
    }
    expect(Object.values(counts).map((s) => s.size)).toEqual([1, 1, 1, 1]);
  });

  it('refuses inputs outside the stories', () => {
    for (const text of ['sums to 0.5', 'sums to 3.5', 'sums to 1.25', 'rules', 'accumulate at 0.25', 'accumulate at 1.1', 'power to 2.5', 'power to 0', 'area to 2', '3'])
      expect(parseIntegral(text), text).toHaveProperty('error');
    expect(parseIntegral('accumulate at 1')).toEqual({ value: { story: 'accumulate', x: 1 } });
  });

  it('sums the strips as a plain reference does, and every rule closes in on the area', () => {
    fc.assert(
      fc.property(fc.integer({ min: -3, max: 3 }), fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 7 }), (a, len, k) => {
        const b = a + len;
        const n = 2 ** k;
        for (const rule of ['left', 'right', 'mid'] as Rule[]) expect(close(riemannSum(speed, a, b, n, rule), reference(speed, a, b, n, rule))).toBe(true);
        expect(close(trapezoidSum(speed, a, b, n), reference(speed, a, b, n, 'trap'))).toBe(true);
        // The trapezoids are the average of the left and right sums.
        expect(close(trapezoidSum(speed, a, b, n), (riemannSum(speed, a, b, n, 'left') + riemannSum(speed, a, b, n, 'right')) / 2)).toBe(true);
        // For a parabola the misses are exact: the middles fall short by (b − a)³/(12n²), the trapezoids overshoot by twice that.
        const exact = squareArea(a, b);
        expect(close(exact - riemannSum(speed, a, b, n, 'mid'), len ** 3 / (12 * n * n), 1e-9)).toBe(true);
        expect(close(trapezoidSum(speed, a, b, n) - exact, len ** 3 / (6 * n * n), 1e-9)).toBe(true);
        // Left and right differ by (f(b) − f(a))·Δx.
        expect(close(riemannSum(speed, a, b, n, 'right') - riemannSum(speed, a, b, n, 'left'), (speed(b) - speed(a)) * (len / n))).toBe(true);
      }),
      { numRuns: 200 },
    );
    expect(samplePoint(1, 0.5, 2, 'left')).toBe(2);
    expect(samplePoint(1, 0.5, 2, 'right')).toBe(2.5);
    expect(samplePoint(1, 0.5, 2, 'mid')).toBe(2.25);
  });

  it('left ends miss like 1/n, middles and trapezoids like 1/n²', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 4, noNaN: true }), fc.integer({ min: 4, max: 9 }), (b, k) => {
        const n = 2 ** k;
        const miss = (rule: Rule | 'trap', m: number) => Math.abs((rule === 'trap' ? trapezoidSum(speed, 0, b, m) : riemannSum(speed, 0, b, m, rule)) - squareArea(0, b));
        expect(Math.abs(miss('left', n) / miss('left', 2 * n) - 2)).toBeLessThan(0.1);
        expect(Math.abs(miss('right', n) / miss('right', 2 * n) - 2)).toBeLessThan(0.1);
        expect(miss('mid', n) / miss('mid', 2 * n)).toBeCloseTo(4, 6);
        expect(miss('trap', n) / miss('trap', 2 * n)).toBeCloseTo(4, 6);
      }),
      { numRuns: 100 },
    );
    // The strips each rule needs to miss the car's 9 m by under 0.01.
    expect(['mid', 'trap', 'left'].map((r) => stripsNeeded(r as Rule, 3))).toEqual([16, 32, 2048]);
    expect(['mid', 'trap', 'left'].map((r) => stripsNeeded(r as Rule, 3, FINE))).toEqual([256, 256, 262144]);
    for (const b of range(B_RANGE))
      for (const rule of ['mid', 'trap', 'left'] as const) {
        const n = stripsNeeded(rule, b);
        const miss = (m: number) => Math.abs((rule === 'trap' ? trapezoidSum(speed, 0, b, m) : riemannSum(speed, 0, b, m, rule)) - squareArea(0, b));
        expect(miss(n)).toBeLessThan(TOLERANCE);
        expect(miss(n / 2)).toBeGreaterThanOrEqual(TOLERANCE);
      }
    expect(grouped(2048)).toBe('2,048');
    expect(grouped(512)).toBe('512');
  });

  it('the accumulated area climbs as fast as the curve is tall, and the power rule run backwards gives the areas', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 2.2, noNaN: true }), (x) => {
        // A′ = f: a small strip divided by its width is about the height.
        const h = 1e-4;
        expect((dipArea(x + h) - dipArea(x - h)) / (2 * h)).toBeCloseTo(dip(x), 6);
        // Strips measure the same A as the formula.
        expect(measuredA(x)).toBeCloseTo(dipArea(x), 5);
        for (const p of [1, 2, 3]) {
          expect((powerArea(p, x + h) - powerArea(p, x - h)) / (2 * h)).toBeCloseTo(x ** p, 5);
          expect(riemannSum((t) => t ** p, 0, x, 256, 'mid')).toBeCloseTo(powerArea(p, x), 3);
        }
      }),
      { numRuns: 150 },
    );
    expect(dipArea(0)).toBe(0);
    expect(measuredA(0)).toBe(0);
  });

  it('draws the sums story from its own sums, and asks about what the next frame shows', () => {
    for (const input of GRID) {
      if (input.story !== 'sums') continue;
      const { b } = input;
      const frames = trace(input);
      const L = NS.map((n) => riemannSum(speed, 0, b, n, 'left'));
      const R = NS.map((n) => riemannSum(speed, 0, b, n, 'right'));
      const exact = squareArea(0, b);
      // Every rectangle stands on its strip, as tall as the curve at its left or right end.
      for (const [i, n] of [[1, 2], [2, 4], [3, 4], [4, 8], [5, 16]] as const) {
        const left = shapeIn(frames[i].state, 'left');
        if (left?.kind !== 'bars') throw new Error(`frame ${i}: no left bars`);
        expect(left.bars.length).toBe(n);
        left.bars.forEach((bar, k) => {
          expect(bar.x0).toBeCloseTo((k * b) / n, 9);
          expect(bar.x1).toBeCloseTo(((k + 1) * b) / n, 9);
          expect(bar.y).toBeCloseTo(speed((k * b) / n), 4);
        });
        expect(left.bars.reduce((s, bar) => s + bar.y * (bar.x1 - bar.x0), 0)).toBeCloseTo(L[NS.indexOf(n)], 3);
      }
      const right = shapeIn(frames[3].state, 'right');
      if (right?.kind !== 'bars') throw new Error('no right bars');
      right.bars.forEach((bar, k) => expect(bar.y).toBeCloseTo(speed(((k + 1) * b) / 4), 4));
      // Answers: under; the next left sum; over; the gap halves; the miss halves.
      expect(answer(frames, 0)).toBe('Less than the distance');
      expect(L[0]).toBeLessThan(exact);
      expect(answer(frames, 1)).toBe(fmt(L[1], 3));
      expect(readout(frames[2].state, 'left')).toBe(`${fmt(L[1], 3)} m`);
      expect(answer(frames, 2)).toBe('Over the distance');
      expect(R[1]).toBeGreaterThan(exact);
      expect(answer(frames, 3)).toBe(fmt(R[2] - L[2], 4));
      expect(readout(frames[4].state, 'gap')).toBe(fmt(R[2] - L[2], 4));
      expect(close(R[2] - L[2], (R[1] - L[1]) / 2)).toBe(true);
      expect(answer(frames, 4)).toBe('About 2 times');
      expect(readout(frames[5].state, 'm16')).toBe(fmt(exact - L[3], 3));
      expect(readout(frames[6].state, 'exact')).toBe(`${fmt(exact, 3)} m`);
    }
  });

  it('draws the rules story from its own sums', () => {
    for (const input of GRID) {
      if (input.story !== 'rules') continue;
      const { b } = input;
      const frames = trace(input);
      const exact = squareArea(0, b);
      const M = NS.map((n) => riemannSum(speed, 0, b, n, 'mid'));
      const T = NS.map((n) => trapezoidSum(speed, 0, b, n));
      expect(answer(frames, 0)).toBe(exact - M[0] < exact - riemannSum(speed, 0, b, 16, 'left') ? 'Less' : 'More');
      const mids = shapeIn(frames[1].state, 'mid');
      if (mids?.kind !== 'bars') throw new Error('no middle bars');
      mids.bars.forEach((bar, k) => expect(bar.y).toBeCloseTo(speed(((k + 0.5) * b) / 2), 4));
      expect(answer(frames, 1)).toBe('Over the distance');
      expect(T[0]).toBeGreaterThan(exact);
      // A trapezoid's top joins the curve's heights at the strip's two ends.
      const trap = shapeIn(frames[2].state, 'trap0');
      if (trap?.kind !== 'path') throw new Error('no trapezoid');
      expect(trap.points[1][1]).toBeCloseTo(speed(0), 4);
      expect(trap.points[2]).toEqual([b / 2, speed(b / 2)]);
      expect(answer(frames, 2)).toBe('About 4 times');
      expect(answer(frames, 3)).toBe(fmt(T[2] - exact, 4));
      expect(readout(frames[4].state, 'trap')).toBe(`${fmt(T[2], 4)} (miss ${fmt(T[2] - exact, 4)})`);
      expect(answer(frames, 4)).toBe(grouped(stripsNeeded('mid', b, FINE)));
      expect(readout(frames[5].state, 'nmid')).toBe(grouped(stripsNeeded('mid', b, FINE)));
      // Simpson's rule cancels both misses exactly for a parabola.
      expect((2 * M[3] + T[3]) / 3).toBeCloseTo(exact, 12);
    }
  });

  it('draws the accumulate story: signed area swept, then A’s slope at x is f(x)', () => {
    for (const input of GRID) {
      if (input.story !== 'accumulate') continue;
      const { x } = input;
      const frames = trace(input);
      expect(answer(frames, 0)).toBe('Down');
      expect(answer(frames, 1)).toBe('Slower');
      expect(-(dipArea(1) - dipArea(0.5))).toBeLessThan(-dipArea(0.5));
      expect(answer(frames, 2)).toBe('Up');
      expect(dipArea(1.5)).toBeGreaterThan(dipArea(1));
      expect(answer(frames, 3)).toBe('Positive');
      expect(dipArea(2)).toBeGreaterThan(0);
      SWEEP.forEach((s, k) => expect(readout(frames[k + 1].state, `A${s}`)).toBe(fmt(dipArea(s), 3)));
      // Below the axis is shaded as minus, above as plus.
      const minus = shapeIn(frames[4].state, 'minus');
      const plus = shapeIn(frames[4].state, 'plus');
      if (minus?.kind !== 'path' || plus?.kind !== 'path') throw new Error('no signed regions');
      expect(minus.points.every(([, y]) => y <= 0)).toBe(true);
      expect(plus.points.every(([, y]) => y >= 0)).toBe(true);
      expect(answer(frames, 4)).toBe(fmt(dip(x), 3));
      const tan = shapeIn(frames[5].state, 'tan', 'area');
      if (tan?.kind !== 'line') throw new Error('no tangent');
      expect(tan.dir[1] / tan.dir[0]).toBeCloseTo(dip(x), 4);
      expect(tan.through[1]).toBeCloseTo(dipArea(x), 4);
      // A's slope is measured from the strips, never copied from f, and still reads as f(x).
      expect(readout(frames[5].state, 'slope')).toBe(fmt(measuredSlope(x), 4));
      expect(readout(frames[5].state, 'slope')).toBe(fmt(dip(x), 4));
      expect(answer(frames, 5)).toBe(fmt(dip(x) * 0.1, 3));
      // The strip's real area is closer to f(x)·h than to any other choice.
      const strip = measuredA(x + 0.1) - measuredA(x);
      const c = frames[5].checkpoint!;
      const nearest = c.choices.reduce((best, ch) => (Math.abs(num(ch) - strip) < Math.abs(num(best) - strip) ? ch : best));
      expect(nearest).toBe(answer(frames, 5));
      expect(num(readout(frames[6].state, 'added')!)).toBeCloseTo(dipArea(x + 0.1) - dipArea(x), 4);
      expect(answer(frames, 6)).toBe('x³/3 − x');
      // The traced A runs through the formula.
      const A = shapeIn(frames[7].state, 'A', 'area');
      if (A?.kind !== 'path') throw new Error('no A');
      for (const [px, py] of A.points) expect(Math.abs(py - dipArea(px))).toBeLessThan(1e-4);
    }
  });

  it('draws the power story: b³/3, eight times the area for twice the end, F(b) − F(a), and x⁴/4', () => {
    for (const input of GRID) {
      if (input.story !== 'power') continue;
      const { b } = input;
      const frames = trace(input);
      expect(answer(frames, 0)).toBe('x³/3');
      expect(readout(frames[1].state, 'Ab')).toBe(fmt(b ** 3 / 3, 4));
      expect(answer(frames, 1)).toBe('8');
      expect(powerArea(2, 2 * b) / powerArea(2, b)).toBeCloseTo(8, 12);
      expect(answer(frames, 2)).toBe(fmt(powerArea(2, 2 * b) - powerArea(2, b), 3));
      expect(readout(frames[3].state, 'diff')).toBe(fmt(powerArea(2, 2 * b) - powerArea(2, b), 4));
      expect(answer(frames, 3)).toBe(fmt(b ** 4 / 4, 3));
      expect(readout(frames[4].state, 'p3')).toBe(fmt(b ** 4 / 4, 4));
      const area = shapeIn(frames[0].state, 'area');
      if (area?.kind !== 'path') throw new Error('no area');
      expect(Math.max(...area.points.map(([px]) => px))).toBeCloseTo(b, 9);
    }
  });

  it('never gives a question’s answer away in the note, readouts or labels of the frame that asks it', () => {
    const PHRASES: Record<string, string[]> = {
      'Less than the distance': ['less than the', 'falls short', 'underestimate'],
      'Over the distance': ['over', 'too much', 'above it'],
      'About 2 times': ['2 times', 'twice', 'halv', 'half'],
      'About 4 times': ['4 times', 'quarter'],
      Less: ['less'],
      More: ['more'],
      Up: ['goes up', 'rises', 'climbs'],
      Down: ['goes down', 'falls'],
      Slower: ['slower', 'less'],
      Positive: ['positive', 'outweigh'],
      'x³/3 − x': ['x³/3 − x', 'x³/3'],
      'x³/3': ['x³/3'],
    };
    const check = (input: IntegralInput) => {
      const frames = trace(input);
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const labels = f.state.parts.flatMap((p) => (p.kind === 'plane' ? [p.label, ...p.shapes.map((s) => ('label' in s ? (s.label ?? '') : ''))] : p.kind === 'readouts' ? p.items.flatMap((r) => [r.label, r.value]) : []));
        const shown = [f.note, ...labels].join(' | ');
        const where = `${JSON.stringify(input)} frame ${i}: "${c.question}" (${said}) in "${shown}"`;
        if (/^[−-]?\d/.test(said)) {
          // A number the frame names for another reason (the question, the input itself) can't be told apart.
          const known = [...numbersIn(c.question), ...Object.values(input).filter((v): v is number => typeof v === 'number'), ...('b' in input ? [2 * input.b] : [0])]; // every area starts at 0
          if (!known.includes(num(said))) expect(numbersIn(shown), where).not.toContain(num(said));
        } else {
          expect(PHRASES[said], said).toBeDefined();
          // The sums story's first frames explain the earlier answer ("falls short"), which is fine: only this frame's answer counts.
          for (const phrase of PHRASES[said]) expect(f.note.toLowerCase().includes(phrase.toLowerCase()), `${where} says "${phrase}"`).toBe(false);
          for (const phrase of PHRASES[said]) expect(labels.join(' ').includes(phrase), `${where} labels say "${phrase}"`).toBe(false);
        }
      });
    };
    for (const input of GRID) check(input);
  });
});

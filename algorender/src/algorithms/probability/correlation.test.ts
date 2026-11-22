// Property tests for covariance and correlation (B6 of the math and ML path):
// the products, covariance and r match plain reference sums; r is the cosine
// of the centred lists, lies in [−1, 1], ignores the units and is ±1 exactly
// on a line; every story plays on any points in bounds, every drag keeps the
// frame count, and every question is answered by the frame after it, never by
// its own.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  centre,
  correlation,
  correlationOf,
  cosineOfCentred,
  covariance,
  DATA,
  dot,
  dragCorr,
  formatCorr,
  GENTLE,
  hasSpread,
  LIMITS,
  mean,
  MINUTES,
  norm,
  onLine,
  parseCorr,
  products,
  spread,
  STEEP,
  strength,
  type CorrInput,
  type Story,
} from './correlation';

const trace = (input: CorrInput) => traceOf(correlation, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(correlation, frames);
const f3 = (v: number) => fmt(v, 3);
const num = (s: string | undefined) => Number(s?.replace('−', '-'));

function roundTrips(input: CorrInput) {
  const custom = correlation.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** How many frames each story makes: fixed by how many points there are, never by where a drag puts them. */
function frameCount(input: CorrInput): number {
  if (input.story === 'quadrants') return input.xs.length + 5;
  if (input.story === 'cosine') return 8;
  return 3;
}

/** Pearson's r the textbook way, from raw sums, as an independent reference. */
function pearson(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length;
  const [sx, sy] = [xs.reduce((s, v) => s + v, 0), ys.reduce((s, v) => s + v, 0)];
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const syy = ys.reduce((s, v) => s + v * v, 0);
  return (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
}

const coord = fc.integer({ min: 0, max: 20 }).map((k) => k / 2);
const points = (story: Story) => {
  const [lo, hi] = LIMITS.points[story];
  return fc
    .integer({ min: lo, max: hi })
    .chain((n) => fc.tuple(fc.array(coord, { minLength: n, maxLength: n }), fc.array(coord, { minLength: n, maxLength: n })))
    .filter(([xs, ys]) => hasSpread(xs) && hasSpread(ys) && (story !== 'outlier' || (hasSpread(xs.slice(0, -1)) && hasSpread(ys.slice(0, -1)))))
    .map(([xs, ys]): CorrInput => ({ story, xs, ys }));
};
const anyInput: fc.Arbitrary<CorrInput> = fc.oneof(points('quadrants'), points('cosine'), points('pattern'), points('outlier'));

const examples = correlation.input.examples.map((ex) => ({ id: ex.id, input: ex.make({ seed: 7, size: 0 }) as CorrInput }));

describe('correlation: the maths', () => {
  it('covariance, spreads and r match plain sums, and r is the cosine of the centred lists', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 12 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -50, max: 50 }), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -50, max: 50 }), { minLength: n, maxLength: n }))),
        ([xs, ys]) => {
          fc.pre(hasSpread(xs) && hasSpread(ys));
          const n = xs.length;
          const [mx, my] = [xs.reduce((s, v) => s + v, 0) / n, ys.reduce((s, v) => s + v, 0) / n];
          const p = xs.map((x, i) => (x - mx) * (ys[i] - my));
          products(xs, ys).forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
          // The centred lists add to 0, and Σ (x − x̄)·y is the same total as Σ (x − x̄)(y − ȳ).
          expect(centre(xs).reduce((s, v) => s + v, 0)).toBeCloseTo(0, 9);
          expect(xs.reduce((s, x, i) => s + (x - mx) * ys[i], 0)).toBeCloseTo(p.reduce((s, v) => s + v, 0), 7);
          expect(covariance(xs, ys)).toBeCloseTo(p.reduce((s, v) => s + v, 0) / n, 9);
          // cov = E[xy] − x̄ȳ, the random-variables shortcut with chances 1/n.
          expect(covariance(xs, ys)).toBeCloseTo(xs.reduce((s, x, i) => s + x * ys[i], 0) / n - mx * my, 7);
          expect(spread(xs)).toBeCloseTo(Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) / n), 9);
          expect(covariance(xs, xs)).toBeCloseTo(spread(xs) ** 2, 7);
          const r = correlationOf(xs, ys);
          expect(r).toBeCloseTo(pearson(xs, ys), 9);
          expect(r).toBeCloseTo(cosineOfCentred(xs, ys), 9);
          expect(dot(centre(xs), centre(ys))).toBeCloseTo(n * covariance(xs, ys), 7);
          expect(norm(centre(xs))).toBeCloseTo(Math.sqrt(n) * spread(xs), 9);
          expect(Math.abs(r)).toBeLessThanOrEqual(1 + 1e-12);
          expect(correlationOf(ys, xs)).toBeCloseTo(r, 12);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('r ignores the units and shifts, flips with a sign, and covariance scales with both lists', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }).chain((n) => fc.tuple(fc.array(coord, { minLength: n, maxLength: n }), fc.array(coord, { minLength: n, maxLength: n }))),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: -20, max: 20 }),
        ([xs, ys], c, shift) => {
          fc.pre(hasSpread(xs) && hasSpread(ys));
          const r = correlationOf(xs, ys);
          const scaled = xs.map((x) => c * x + shift);
          expect(correlationOf(scaled, ys)).toBeCloseTo(r, 9);
          expect(covariance(scaled, ys)).toBeCloseTo(c * covariance(xs, ys), 7);
          expect(correlationOf(xs.map((x) => -x), ys)).toBeCloseTo(-r, 9);
          expect(covariance(xs.map((x) => MINUTES * x), ys)).toBeCloseTo(MINUTES * covariance(xs, ys), 7);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('r is ±1 exactly on a line, whatever its slope, and strictly between otherwise', () => {
    fc.assert(
      fc.property(fc.array(coord, { minLength: 3, maxLength: 8 }), fc.integer({ min: -40, max: 40 }), fc.integer({ min: 0, max: 10 }), (xs, k10, c) => {
        fc.pre(hasSpread(xs) && k10 !== 0);
        const k = k10 / 10;
        const ys = xs.map((x) => c + k * x);
        expect(correlationOf(xs, ys)).toBeCloseTo(Math.sign(k), 9);
        expect(correlationOf(xs, onLine(xs, xs.map((x) => x + 1), k))).toBeCloseTo(Math.sign(k), 9);
      }),
      { numRuns: 200 },
    );
    // Off a line, |r| < 1.
    expect(Math.abs(correlationOf([1, 2, 3], [1, 3, 2]))).toBeLessThan(1);
    expect(correlationOf([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
  });

  it('measures the examples', () => {
    const r = (id: keyof typeof DATA) => correlationOf(DATA[id].xs, DATA[id].ys);
    expect(f3(r('revision'))).toBe('0.797');
    expect(covariance(DATA.revision.xs, DATA.revision.ys)).toBeCloseTo(26 / 6, 12);
    expect(f3(r('cosine'))).toBe('0.526');
    expect(r('ring')).toBe(0);
    expect(r('u-shape')).toBe(0);
    expect(correlationOf(DATA.outlier.xs.slice(0, -1), DATA.outlier.ys.slice(0, -1))).toBe(0);
    expect(f3(r('outlier'))).toBe('0.89');
  });
});

describe('correlation: the stories', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const { id, input } of examples) {
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      expect(frames.length, id).toBe(frameCount(input));
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles)
            for (const to of [[h.at[0] + h.step, h.at[1] + h.step], [h.at[0] - h.step, h.at[1]], h.min, h.max, [0, 0], [99, -99], [h.at[0] + 0.3, h.at[1] - 1.2]] as Vec[]) {
              const moved = dragCorr(input, h.id, to);
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
        }
    }
    expect(examples.map((e) => e.id)).toEqual(['revision', 'cosine', 'ring', 'u-shape', 'outlier']);
    // At least one story asks five questions, for a lesson's prediction challenge.
    expect(Math.max(...examples.map(({ input }) => trace(input).filter((f) => f.checkpoint).length))).toBeGreaterThanOrEqual(5);
  });

  it('plays any points in bounds, with handles on the points they move', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(frameCount(input));
        for (const f of frames)
          for (const part of f.state.parts) {
            if (part.kind !== 'plane') continue;
            for (const h of part.handles) {
              const i = Number(h.id.slice(1));
              expect(h.at).toEqual([input.xs[i], input.ys[i]]);
              const pt = part.shapes.find((s) => s.id === `pt${i}`);
              expect(pt?.kind === 'point' && pt.at).toEqual([input.xs[i], input.ys[i]]);
            }
          }
      }),
      { numRuns: 150 },
    );
  });

  it('refuses points it can’t use, and drags that would leave a list with no spread', () => {
    for (const text of ['quadrants 1 2 | 3 4', 'quadrants 1 2 3 | 3 4', 'quadrants 1 2 3 | 3 3 3', 'cosine 1 1 1 | 1 2 3', 'cosine 1 2 3 4 5 6 7 | 1 2 3 4 5 6 7', 'pattern 1 2 11 | 1 2 3', 'pattern 1 2 3.3 | 1 2 3', 'pattern 1 2 3', 'outlier 1 1 1 9 | 1 2 3 9', 'circle 1 2 3 | 1 2 3', 'outlier 1 2 3 | 1 2 3'])
      expect(parseCorr(text), text).toHaveProperty('error');
    expect(parseCorr('pattern 1 2 3.5 | 1 2 3')).toEqual({ value: { story: 'pattern', xs: [1, 2, 3.5], ys: [1, 2, 3] } });
    const three: CorrInput = { story: 'pattern', xs: [1, 2, 3], ys: [5, 6, 6] };
    // Moving the first point's y to 6 would make every y the same.
    expect(dragCorr(three, 'p0', [1, 6])).toBe(three);
    expect(dragCorr(three, 'p0', [1.2, 7.8])).toEqual({ story: 'pattern', xs: [1, 2, 3], ys: [8, 6, 6] });
    expect(dragCorr(three, 'p2', [50, -3])).toEqual({ story: 'pattern', xs: [1, 2, 10], ys: [5, 6, 0] });
    expect(dragCorr(three, 'q1', [0, 0])).toBe(three);
    expect(formatCorr({ story: 'cosine', xs: [2, 4.5, 5], ys: [6, 2, 4] })).toBe('cosine 2 4.5 5 | 6 2 4');
  });

  it('labels no example with the answer to a question in any example', () => {
    // The input panel shows every example's label beside the stage, so none may answer a prediction.
    const answers = examples.flatMap(({ input }) => trace(input).flatMap((f) => (f.checkpoint ? [f.checkpoint.choices[f.checkpoint.answer]] : [])));
    for (const ex of correlation.input.examples) {
      const label = ex.label.toLowerCase();
      expect(label, ex.id).not.toMatch(/r\s*=|cancel|strong|zero|positive|negative|close to/);
      for (const said of new Set(answers)) {
        if (/[a-z]{3,}/i.test(said)) expect(label.includes(said.toLowerCase()), `${ex.id}: ${said}`).toBe(false);
        else expect(numbersIn(ex.label), `${ex.id}: ${said}`).not.toContain(num(said));
      }
    }
  });

  it('asks how strong r will be only where the answer is clear-cut', () => {
    expect([0.85, 0.1, -0.81, 0.5, -0.3, 0.15, -0.15, 0.8, -0.8, 0.7, -0.75, 0.2].map(strength)).toEqual(['Close to 1', 'Close to 0', 'Close to −1', null, null, 'Close to 0', 'Close to 0', 'Close to 1', 'Close to −1', null, null, null]);
  });

  it('answers each question in the frame after it', () => {
    const check = (input: CorrInput) => {
      const frames = trace(input);
      const { xs, ys } = input;
      const next = (i: number) => frames[i + 1].state;
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const q = c.question;
        const after = next(i);
        if (q.startsWith('A point below and to the left')) {
          expect(said).toBe('Positive');
          expect(frames[i + 1].note).toContain('either way the product (x − x̄)(y − ȳ) is positive');
        } else if (/^Student \d+ is at/.test(q)) {
          const k = numbersIn(q)[0];
          expect(readout(after, 'product')).toBe(said);
          expect(said).toBe(f3(products(xs, ys)[k - 1]));
        } else if (q.startsWith('The covariance is the average product')) expect(readout(after, 'cov')).toBe(said);
        else if (q.startsWith('Measure the revision in minutes')) expect(readout(after, 'covM')).toBe(said);
        else if (q.startsWith('The correlation is r')) expect(readout(after, 'r')).toBe(said);
        else if (q.startsWith('What do the parts of a add up to')) {
          expect(said).toBe('0');
          expect(frames[i + 1].note).toContain('always add up to 0');
        } else if (q.startsWith('What is a · b, their')) expect(readout(after, 'ab')).toBe(said);
        else if (q.startsWith('What is |a|')) expect(readout(after, 'na')).toBe(said);
        else if (q.startsWith('What is |b|')) expect(readout(after, 'nb')).toBe(said);
        else if (q.startsWith('What is a · b ÷')) {
          expect(readout(after, 'cos')).toBe(said);
          expect(readout(after, 'r')).toBe(said);
        } else if (q.startsWith('Keep each x')) {
          expect(readout(after, 'r')).toBe(said);
          expect(f3(correlationOf(xs, onLine(xs, ys, STEEP)))).toBe('1');
        } else if (q.startsWith('Now move them')) {
          expect(readout(after, 'r')).toBe(said);
          expect(f3(correlationOf(xs, onLine(xs, ys, GENTLE)))).toBe('−1');
        } else if (q === 'What will r be?') {
          const r = num(readout(frames[2].state, 'r'));
          expect(said).toBe(strength(r));
        } else if (q.startsWith('Add up every point')) {
          const total = num(readout(frames[i + 1].state, 'sum'));
          expect(said).toBe(total > 0 ? 'Positive' : total < 0 ? 'Negative' : 'Zero');
        } else if (q.startsWith('With the point at')) {
          const r = num(readout(after, 'r1'));
          expect(said).toBe(strength(r));
          expect(said).toBe(strength(correlationOf(xs, ys)));
        } else if (q.includes('new point’s product')) expect(readout(after, 'po')).toBe(said);
        else throw new Error(`an unchecked question: ${q}`);
      });
    };
    for (const { input } of examples) check(input);
    fc.assert(fc.property(anyInput, check), { numRuns: 200 });
  });

  it('never gives a question’s answer away in its own frame', () => {
    const check = (input: CorrInput) => {
      const frames = trace(input);
      frames.forEach((f) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((r) => `${r.label} ${r.value}`) : [])), ...f.state.parts.flatMap((p) => (p.kind === 'plane' ? p.shapes.flatMap((s) => (s.kind === 'label' ? [s.text] : [])) : []))].join(' | ');
        const where = `${formatCorr(input)}: "${c.question}" (${said}) in "${shown}"`;
        if (/^[−-]?\d/.test(said)) {
          // A number the frame names for another reason can't be told apart: the coordinates, the question's own
          // numbers, n, and what this frame works out (an earlier product can equal the next one).
          const worked = Object.values(f.vars).flatMap((v) => (typeof v === 'number' ? [v, Math.abs(v), -v] : []));
          const asked = /^Student (\d+)/.exec(c.question);
          const ps = products(input.xs, input.ys);
          // Other points' products (one can equal the next), their total, and the lengths it is divided by.
          const others = [...(asked ? ps.filter((_, k) => k !== Number(asked[1]) - 1) : ps), ps.reduce((t, v) => t + v, 0), norm(centre(input.xs)), norm(centre(input.ys))].flatMap((v) => [v, -v]);
          const known = [...numbersIn(c.question), ...input.xs, ...input.ys, ...input.xs.map((_, k) => k + 1), ...centre(input.xs), ...centre(input.ys), ...worked, ...others];
          const value = num(said);
          if (!known.some((k) => Math.abs(k - value) < 0.0015)) expect(numbersIn(shown), where).not.toContain(value);
        } else if (said === 'Positive' || said === 'Negative' || said === 'Zero') {
          expect(shown.toLowerCase(), where).not.toMatch(/the \+ side wins|the − side wins|cancel/);
        } else {
          // A strength: the frame shows no r for the points the question asks about.
          expect(f.state.parts.some((p) => p.kind === 'readouts' && p.items.some((r) => r.id === 'r' || r.id === 'r1')), where).toBe(false);
        }
      });
    };
    for (const { input } of examples) check(input);
    fc.assert(fc.property(anyInput, check), { numRuns: 200 });
  });

  it('draws the means, the rectangles and the vectors where the maths puts them', () => {
    const { input } = examples[0];
    const frames = trace(input);
    const last = planeOf(frames.at(-1)!.state);
    const line = (id: string) => last.shapes.find((s) => s.id === id);
    const mx = line('mx');
    expect(mx?.kind === 'line' && mx.through[0]).toBe(mean(input.xs));
    // Every point off the mean lines has a rectangle from the middle to it, its label the product.
    products(input.xs, input.ys).forEach((p, i) => {
      const label = last.shapes.find((s) => s.id === `rl${i}`);
      if (p === 0) return;
      expect(label?.kind === 'label' && label.text).toBe(p > 0 ? `+${f3(p)}` : f3(p));
      const rect = last.shapes.find((s) => s.id === `r${i}`);
      expect(rect?.kind === 'path' && rect.tone).toBe(p > 0 ? 1 : 2);
    });
    // In minutes, the ticks are the hours times 60.
    expect(last.x.ticks?.map((t) => t.label)).toEqual(['0', '120', '240', '360', '480', '600']);

    const cos = trace(examples[1].input);
    const vectors = planeOf(cos[5].state, 'vectors');
    const [a, b] = ['a', 'b'].map((id) => vectors.shapes.find((s) => s.id === id));
    if (a?.kind !== 'vector' || b?.kind !== 'vector') throw new Error('no vectors');
    const { xs, ys } = examples[1].input;
    expect(a.to[0]).toBeCloseTo(norm(centre(xs)), 2);
    expect(Math.hypot(b.to[0], b.to[1])).toBeCloseTo(norm(centre(ys)), 1);
    // The angle between the drawn arrows has cosine r.
    expect(b.to[0] / Math.hypot(b.to[0], b.to[1])).toBeCloseTo(correlationOf(xs, ys), 2);
  });
});

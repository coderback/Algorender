// Property tests for maximum likelihood (B6 of the math and ML path): the
// coin's likelihood peaks at h/n and its log at the same place, with slope 0
// there; the normal bell's log-likelihood peaks at the mean and the root mean
// squared gap; a line's log-likelihood under normal noise is a constant minus
// the squared error over 2σ², so it peaks where the squared error is least,
// whatever σ is; every question is answered by the frame after it and never
// given away by its own; custom text round-trips and drags keep the frame count.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  chance,
  choose,
  coinFlips,
  coinLikelihood,
  coinLogLikelihood,
  crossEntropy,
  dragMl,
  fitGaussian,
  formatMl,
  gaussianLogLikelihood,
  leastSquares,
  LIMITS,
  logDensity,
  manyFlips,
  maximumLikelihood,
  mean,
  meanAbsGap,
  measuredSlope,
  median,
  midrange,
  noiseLogLikelihood,
  parseMl,
  power,
  residuals,
  rmsGap,
  sampleSd,
  squaredGaps,
  type MlInput,
} from './maximum-likelihood';
import { normalPdf } from './distributions';

const trace = (input: MlInput) => traceOf(maximumLikelihood, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(maximumLikelihood, frames);
const f2 = (v: number) => fmt(v, 2);
const f3 = (v: number) => fmt(v, 3);

function roundTrips(input: MlInput) {
  const custom = maximumLikelihood.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const FRAMES: Record<MlInput['story'], number> = { coin: 9, gaussian: 5, 'squared-error': 5 };

const tenth = (lo: number, hi: number) => fc.integer({ min: Math.round(lo * 10), max: Math.round(hi * 10) }).map((v) => v / 10);
const quarter = (lo: number, hi: number) => fc.integer({ min: Math.round(lo * 4), max: Math.round(hi * 4) }).map((v) => v / 4);
const coinInput: fc.Arbitrary<MlInput> = fc
  .integer({ min: LIMITS.n[0], max: LIMITS.n[1] })
  .chain((n) => fc.record({ h: fc.integer({ min: 1, max: n - 1 }), p20: fc.integer({ min: 1, max: 19 }) }).map(({ h, p20 }): MlInput => ({ story: 'coin', h, n, p: p20 / 20 })));
const gaussianInput: fc.Arbitrary<MlInput> = fc
  .record({ xs: fc.array(quarter(0, 10), { minLength: LIMITS.points[0], maxLength: LIMITS.points[1] }), mu: tenth(LIMITS.mu[0], LIMITS.mu[1]), sigma: tenth(LIMITS.sigma[0], LIMITS.sigma[1]) })
  .filter(({ xs }) => fitGaussian(xs).sigma >= LIMITS.sigma[0] && fitGaussian(xs).sigma <= LIMITS.sigma[1])
  .map(({ xs, mu, sigma }): MlInput => ({ story: 'gaussian', xs, mu, sigma }));
const lineInput: fc.Arbitrary<MlInput> = fc
  .record({ ys: fc.array(quarter(0, 10), { minLength: LIMITS.lineCount[0], maxLength: LIMITS.lineCount[1] }), left: quarter(LIMITS.line[0], LIMITS.line[1]), right: quarter(LIMITS.line[0], LIMITS.line[1]) })
  .map(({ ys, left, right }): MlInput => ({ story: 'squared-error', ys, left, right }));
const anyInput = fc.oneof(coinInput, gaussianInput, lineInput);

const examples = maximumLikelihood.input.examples.map((ex) => ({ id: ex.id, input: ex.make({ seed: 7, size: 0 }) as MlInput }));

describe('maximum-likelihood', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const { id, input } of examples) {
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      expect(frames.length, id).toBe(FRAMES[input.story]);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles)
            for (const to of [[h.at[0] + h.step, h.at[1] + h.step], [h.at[0] - h.step, h.at[1] - h.step], h.min, h.max, [0, 0], [99, 99], [-99, -99]] as Vec[]) {
              const moved = dragMl(input, h.id, to);
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
        }
    }
  });

  it('plays any input in bounds, with handles where the input puts them', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(input.story === 'coin' ? 8 : 1);
        for (const f of frames)
          for (const part of f.state.parts) {
            if (part.kind !== 'plane') continue;
            for (const h of part.handles) {
              if (input.story === 'coin') expect([h.id, ...h.at]).toEqual(['p', input.p, 0]);
              else if (input.story === 'gaussian') expect(h.at[0]).toBeCloseTo(h.id === 'mu' ? input.mu : input.mu + input.sigma, 9);
              else expect(h.at[1]).toBe(h.id === 'l' ? input.left : input.right);
              // Dragging a handle to where it already is changes nothing.
              expect(dragMl(input, h.id, h.at)).toEqual(input);
            }
          }
      }),
      { numRuns: 120 },
    );
  });

  it('refuses inputs outside the stories', () => {
    for (const text of [
      'coin 0 of 10 guess 0.5',
      'coin 10 of 10 guess 0.5',
      'coin 3 of 13 guess 0.5',
      'coin 3 of 10 guess 0.52',
      'coin 3 of 10 guess 1',
      'coin 3 of 10',
      'gaussian 1 2 3',
      'gaussian 1 2 | 4 1',
      'gaussian 1 2 3 11 | 4 1',
      'gaussian 4 5 6 | 0.5 1',
      'gaussian 4 5 6 | 5 0.5',
      'gaussian 4 5 6 | 5 1.25',
      'gaussian 5 5 5.1 | 5 1',
      'gaussian 0 0 10 10 | 5 1',
      'line 1 2 3 | 1 2',
      'line 1 2 3 4 | 1 2.1',
      'line 1 2 3 4 | 1 12',
      'line 1 2 3 11 | 1 2',
      'bell 1 2 3',
    ])
      expect(parseMl(text), text).toHaveProperty('error');
    expect(parseMl('coin 7 of 10 guess 0.5')).toEqual({ value: { story: 'coin', h: 7, n: 10, p: 0.5 } });
    expect(dragMl({ story: 'coin', h: 7, n: 10, p: 0.5 }, 'p', [0.68, 0])).toEqual({ story: 'coin', h: 7, n: 10, p: 0.7 });
    expect(dragMl({ story: 'gaussian', xs: [1, 2, 3], mu: 4, sigma: 1 }, 's', [9.2, 0])).toEqual({ story: 'gaussian', xs: [1, 2, 3], mu: 4, sigma: 4 });
    expect(dragMl({ story: 'gaussian', xs: [1, 2, 3], mu: 4, sigma: 1 }, 'mu', [5.04, 0])).toEqual({ story: 'gaussian', xs: [1, 2, 3], mu: 5, sigma: 1 });
    expect(formatMl({ story: 'squared-error', ys: [1, 2, 3, 4], left: -1, right: 2.5 })).toBe('line 1 2 3 4 | -1 2.5');
  });

  it('the coin: L is a product of the flips’ chances, peaks at h/n, and its log peaks there too with slope 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 12 }).chain((n) => fc.tuple(fc.constant(n), fc.integer({ min: 1, max: n - 1 }))), ([n, h]) => {
        const flips = coinFlips(h, n);
        expect(flips.filter((f) => f === 'H').length).toBe(h);
        const grid = Array.from({ length: 999 }, (_, i) => (i + 1) / 1000);
        const best = h / n;
        for (const p of grid) {
          // The long way round: the chance of each flip in turn, multiplied.
          const product = flips.reduce((s, f) => s * (f === 'H' ? p : 1 - p), 1);
          expect(coinLikelihood(h, n, p)).toBeCloseTo(product, 15);
          expect(coinLogLikelihood(h, n, p)).toBeCloseTo(Math.log(product), 9);
          expect(coinLikelihood(h, n, p)).toBeLessThanOrEqual(coinLikelihood(h, n, best) * (1 + 1e-12));
          expect(coinLogLikelihood(h, n, p)).toBeLessThanOrEqual(coinLogLikelihood(h, n, best) + 1e-12);
          expect(crossEntropy(h, n, p)).toBeCloseTo(-(best * Math.log(p) + (1 - best) * Math.log(1 - p)), 12);
        }
        expect(measuredSlope((p) => coinLogLikelihood(h, n, p), best)).toBeCloseTo(0, 2);
        // The slope of ln L is h/p − (n − h)/(1 − p): measured, it agrees.
        for (const p of [0.2, 0.45, 0.8]) expect(measuredSlope((q) => coinLogLikelihood(h, n, q), p)).toBeCloseTo(h / p - (n - h) / (1 - p), 3);
        // The many-flip run underflows when multiplied out, but its log is an ordinary number.
        const big = manyFlips(h, n);
        expect(big.flips).toBeGreaterThanOrEqual(5000);
        expect(big.heads / big.flips).toBeCloseTo(best, 12);
        expect(power(best, big.heads) * power(1 - best, big.flips - big.heads)).toBe(0);
        expect(Number.isFinite(coinLogLikelihood(big.heads, big.flips, best))).toBe(true);
      }),
      { numRuns: 60 },
    );
    expect(choose(10, 7)).toBe(120);
    expect(chance(0.0009765625)).toBe('0.000977');
    expect(chance(4.8828125e-15)).toBe('4.88 × 10⁻¹⁵');
  });

  it('the bell: ln L is the sum of log densities, best at the mean and the root mean squared gap (÷ n)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 10, noNaN: true }), { minLength: 2, maxLength: 10 }), tenth(1, 9), tenth(0.6, 4), (xs, mu, sigma) => {
        fc.pre(rmsGap(xs, mean(xs)) > 0.05);
        // The long way round, while no density underflows: the log of each bar, added.
        if (xs.every((x) => normalPdf(x, mu, sigma) > 1e-300)) expect(gaussianLogLikelihood(xs, mu, sigma)).toBeCloseTo(xs.reduce((s, x) => s + Math.log(normalPdf(x, mu, sigma)), 0), 6);
        for (const x of xs) if (normalPdf(x, mu, sigma) > 1e-300) expect(logDensity(x, mu, sigma)).toBeCloseTo(Math.log(normalPdf(x, mu, sigma)), 9);
        const { mu: m, sigma: s } = fitGaussian(xs);
        const top = gaussianLogLikelihood(xs, m, s);
        for (const dm of [-0.3, -0.01, 0.01, 0.3]) for (const ds of [0.97, 1, 1.03]) if (dm !== 0 || ds !== 1) expect(gaussianLogLikelihood(xs, m + dm, s * ds)).toBeLessThan(top);
        expect(gaussianLogLikelihood(xs, m, s * 1.0001)).toBeLessThan(top);
        expect(gaussianLogLikelihood(xs, m, s / 1.0001)).toBeLessThan(top);
        // The slips are other numbers.
        expect(sampleSd(xs)).toBeGreaterThan(s);
        expect(meanAbsGap(xs)).toBeLessThanOrEqual(s + 1e-12);
        expect(squaredGaps(xs, m)).toBeCloseTo(xs.length * s * s, 9);
      }),
      { numRuns: 150 },
    );
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(midrange([2, 9, 4])).toBe(5.5);
  });

  it('the line: ln L = constant − Σ r²/(2σ²), so the same shift and the least-squares line win for every σ', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 10, noNaN: true }), { minLength: 4, maxLength: 8 }), quarter(-1, 11), quarter(-1, 11), (ys, left, right) => {
        const rs = residuals(ys, left, right);
        rs.forEach((r, i) => expect(r).toBeCloseTo(ys[i] - (left + ((right - left) * (i + 1)) / (ys.length + 1)), 12));
        for (const sigma of [0.5, 1, 2]) {
          const direct = rs.reduce((s, r) => s + Math.log(normalPdf(r, 0, sigma)), 0);
          expect(noiseLogLikelihood(rs, sigma)).toBeCloseTo(direct, 8);
          // Shifting the line by the mean residual is best, whatever σ.
          const d = mean(rs);
          const at = (dd: number) => noiseLogLikelihood(rs.map((r) => r - dd), sigma);
          for (const dd of [-0.5, -0.01, 0.01, 0.5]) expect(at(d + dd)).toBeLessThan(at(d));
        }
        // The least-squares line has the smallest squared error of any line nearby.
        const { w, b } = leastSquares(ys);
        const sse = (ww: number, bb: number) => ys.reduce((s, y, i) => s + (y - (ww * (i + 1) + bb)) ** 2, 0);
        for (const [dw, db] of [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01], [0.05, -0.1]]) expect(sse(w + dw, b + db)).toBeGreaterThan(sse(w, b));
      }),
      { numRuns: 150 },
    );
  });

  it('answers each question in the frame after it', () => {
    const check = (input: MlInput) => {
      const frames = trace(input);
      const next = (i: number) => frames[i + 1].state;
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const q = c.question;
        if (input.story === 'coin') {
          const { h, n, p } = input;
          const best = h / n;
          if (q.includes('what is the chance of exactly')) expect(said).toBe(chance(coinLikelihood(h, n, p)));
          else if (q.startsWith('Which chance of heads')) {
            const peak = planeOf(next(i), 'like').shapes.find((s) => s.id === 'peak');
            expect(peak?.kind === 'point' && peak.at[0]).toBeCloseTo(best, 12);
            expect(said).toBe(f2(best));
          } else if (q.startsWith('Add up L(p)')) {
            expect(said).toBe('No');
            expect(Number(readout(next(i), 'sum'))).not.toBe(1);
          } else if (q.includes('Multiply out')) {
            expect(said).toBe('Exactly 0');
            expect(readout(next(i), 'product')).toBe('0');
          } else if (q.startsWith('Draw ln L')) {
            expect(said).toBe('At the same p');
            const peak = planeOf(next(i), 'log').shapes.find((s) => s.id === 'logPeak');
            expect(peak?.kind === 'point' && peak.at[0]).toBeCloseTo(best, 12);
            // The drawn curve's highest point is there too, to the curve's 0.01 grid.
            const curve = planeOf(next(i), 'log').shapes.find((s) => s.id === 'lnL');
            if (curve?.kind !== 'path') throw new Error('no log curve');
            const highest = Math.max(...curve.points.map((q) => q[1]));
            const nearest = curve.points.reduce((a, b) => (Math.abs(b[0] - best) < Math.abs(a[0] - best) ? b : a));
            expect(nearest[1]).toBeGreaterThanOrEqual(highest - 0.011);
          } else if (q.includes('What is ln L at your guess')) expect(readout(next(i), 'logGuess')).toBe(said);
          else if (q.startsWith('Measure the slope')) {
            const slope = Number(readout(next(i), 'slopeGuess')!.replace('−', '-'));
            expect(said).toBe(Math.abs(p - best) < 1e-9 ? 'Flat: about 0' : slope > 0 ? 'Uphill: positive' : 'Downhill: negative');
            if (Math.abs(p - best) < 1e-9) expect(Math.abs(slope)).toBeLessThan(0.01);
          } else if (q.startsWith('Take −ln L')) expect(readout(next(i), 'ceBest')).toBe(said);
          else throw new Error(`unknown question ${q}`);
        } else if (input.story === 'gaussian') {
          const { xs, mu, sigma } = input;
          if (q.startsWith('Which measurement')) {
            const bars = planeOf(next(i), 'data').shapes.flatMap((s) => (s.kind === 'bars' ? s.bars : []));
            const tallest = bars.reduce((a, b) => (b.y > a.y ? b : a));
            expect(f2(xs[Number(tallest.id.slice(1))])).toBe(said);
            expect(bars.filter((b) => b.y === tallest.y).length).toBe(1);
          } else if (q.startsWith('Keep σ')) {
            expect(readout(next(i), 'mean')).toBe(said);
            // The drawn curve against μ is highest at the mean (to its 0.05 grid).
            const curve = planeOf(next(i), 'byMu').shapes.find((s) => s.id === 'lnL');
            if (curve?.kind !== 'path') throw new Error('no curve');
            const highest = Math.max(...curve.points.map((q) => q[1]));
            const nearest = curve.points.reduce((a, b) => (Math.abs(b[0] - mean(xs)) < Math.abs(a[0] - mean(xs)) ? b : a));
            expect(nearest[1]).toBeGreaterThanOrEqual(highest - 0.011);
            expect(gaussianLogLikelihood(xs, mean(xs), sigma)).toBeGreaterThanOrEqual(gaussianLogLikelihood(xs, median(xs), sigma));
          } else if (q.startsWith('Put μ at the mean')) {
            expect(readout(next(i), 'sigma')).toBe(said);
            expect(said).toBe(f3(rmsGap(xs, mean(xs))));
          } else throw new Error(`unknown question ${q}`);
          expect(mu).toBeGreaterThan(0);
        } else {
          const rs = residuals(input.ys, input.left, input.right);
          if (q.startsWith('Which point')) {
            // Only asked when the biggest residual is clearly ahead of the next, so it can be told by eye.
            const sizes = rs.map((r) => r * r).sort((a, b) => b - a);
            expect(sizes[0]).toBeGreaterThanOrEqual(1.2 * sizes[1]);
            expect(Math.sqrt(sizes[0]) - Math.sqrt(sizes[1])).toBeGreaterThanOrEqual(0.15);
            const k = numbersIn(said)[0];
            expect(readout(next(i), 'big')).toBe(f3(rs[k - 1] ** 2));
            expect(Math.max(...rs.map((r) => r * r))).toBe(rs[k - 1] ** 2);
          } else if (q.startsWith('ln L =')) expect(readout(next(i), 'll')).toBe(said);
          else if (q.startsWith('Slide your line')) {
            expect(said).toBe('At the same d');
            const [sse, ll] = ['sse', 'loglik'].map((id) => planeOf(next(i), id).shapes.find((s) => s.id === `${id}Best`));
            expect(sse?.kind === 'point' && ll?.kind === 'point' && sse.at[0] === ll.at[0]).toBe(true);
          } else if (q.startsWith('Now let the noise')) {
            expect(said).toBe(`At d = ${f2(mean(rs))} still`);
            const wide = planeOf(next(i), 'loglik').shapes.find((s) => s.id === 'wide');
            if (wide?.kind !== 'path') throw new Error('no wide curve');
            const highest = Math.max(...wide.points.map((q) => q[1]));
            const nearest = wide.points.reduce((a, b) => (Math.abs(b[0] - mean(rs)) < Math.abs(a[0] - mean(rs)) ? b : a));
            if (Math.abs(mean(rs)) < 2.95) expect(nearest[1]).toBeGreaterThanOrEqual(highest - 0.011);
          } else throw new Error(`unknown question ${q}`);
        }
      });
    };
    for (const { input } of examples) check(input);
    fc.assert(fc.property(anyInput, check), { numRuns: 200 });
  });

  it('never gives a question’s answer away in its own frame', () => {
    const PHRASES: Record<string, string[]> = {
      No: ['add up to', 'not the chance'],
      'Exactly 0': ['underflow', 'comes to 0'],
      'At the same p': ['peaks at p', 'same p', 'never which'],
      'Uphill: positive': ['uphill', 'climb', 'slope at'],
      'Downhill: negative': ['downhill', 'climb', 'slope at'],
      'Flat: about 0': ['flat', 'level', 'slope at'],
      'At the same d': ['same d', 'sits right above', 'turned upside down', 'always means a bigger', 'smaller Σ r²'],
    };
    const check = (input: MlInput) => {
      const frames = trace(input);
      frames.forEach((f) => {
        const c = f.checkpoint;
        if (!c) return;
        const said = c.choices[c.answer];
        const ro = f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((r) => `${r.label} ${r.value}`) : []));
        const vars = Object.entries(f.vars).map(([k, v]) => `${k} ${typeof v === 'number' ? fmt(v, 3) : String(v)}`);
        const shown = [f.note, ...ro, ...vars].join(' | ');
        const where = `${formatMl(input)}: "${c.question}" (${said}) in "${shown}"`;
        if (said.startsWith('At d =')) {
          for (const phrase of ['σ only', 'whatever σ', 'same d', 'still']) expect(shown.includes(phrase), where).toBe(false);
        } else if (said.startsWith('x = ')) {
          expect(shown.includes(said), where).toBe(false);
        } else if (PHRASES[said]) {
          for (const phrase of PHRASES[said]) expect(shown.toLowerCase().includes(phrase.toLowerCase()), `${where} says "${phrase}"`).toBe(false);
        } else {
          // A number: not in the note or the readouts, unless the question or the input names it for another reason.
          const value = Number(said.replace('−', '-'));
          expect(Number.isFinite(value) || said.includes('×'), said).toBe(true);
          // Values a frame names for their own sake (the median it compares with the mean) can coincide with an answer.
          const own =
            input.story === 'coin'
              ? [input.h, input.n, input.p, 1 - input.p]
              : input.story === 'gaussian'
                ? [...input.xs, input.mu, input.sigma, mean(input.xs), median(input.xs), midrange(input.xs)]
                : [...input.ys, input.left, input.right];
          // 2 is in the density's formula, e^(−(x − μ)²/(2σ²)).
          const known = [...numbersIn(c.question), ...own, 2];
          if (!known.some((k) => Math.abs(k - value) < 0.0015)) expect(said.includes('×') ? shown.includes(said) : numbersIn(shown).some((v) => Math.abs(v - value) < 1e-9), where).toBe(false);
        }
      });
    };
    for (const { input } of examples) check(input);
    fc.assert(fc.property(anyInput, check), { numRuns: 200 });
  });

  it('keeps the squared-error story’s “same d” question unanswered in its own frame (a regression)', () => {
    const frames = trace({ story: 'squared-error', ys: [2, 3.5, 3, 5.5, 5, 7], left: 1, right: 7 });
    const asking = frames.findIndex((f) => f.checkpoint?.question.startsWith('Slide your line'));
    expect(asking).toBe(2);
    expect(frames[asking].note).not.toMatch(/smaller Σ r²|always means a bigger/);
    expect(frames[asking + 1].note).toContain('A smaller Σ r² always means a bigger ln L');
  });

  it('asks the biggest-residual question only when one residual is clearly the biggest', () => {
    // Residuals 1 and 0.95, or 1 and 0.9, after a drag: too close to tell apart by eye, so no question.
    expect(trace({ story: 'squared-error', ys: [3, 2.95, 2, 2], left: 2, right: 2 })[0].checkpoint).toBeUndefined();
    expect(trace({ story: 'squared-error', ys: [3, 2.9, 2, 2], left: 2, right: 2 })[0].checkpoint).toBeUndefined();
    expect(trace({ story: 'squared-error', ys: [2, 3.5, 2, 2.5], left: 2, right: 2 })[0].checkpoint?.question).toMatch(/Which point/);
  });

  it('narrates the median by what the data are like', () => {
    expect(trace({ story: 'gaussian', xs: [2.5, 3.5, 4, 4.5, 5, 5.5, 7, 10], mu: 4, sigma: 1.5 })[2].note).toContain('ignores how far out');
    expect(trace({ story: 'gaussian', xs: [3, 4, 4.5, 5, 5.5, 6, 6.5, 8], mu: 7, sigma: 1 })[2].note).toContain('almost agrees: no measurement is far out');
  });

  it('draws the curves where the maths puts them', () => {
    const coin = trace({ story: 'coin', h: 7, n: 10, p: 0.5 });
    const like = planeOf(coin[2].state, 'like');
    expect(like.y.label).toBe('L(p) × 1,000');
    const peak = like.shapes.find((s) => s.id === 'peak');
    expect(peak?.kind === 'point' && peak.at[1]).toBeCloseTo(coinLikelihood(7, 10, 0.7) * 1000, 4);
    const bell = trace({ story: 'gaussian', xs: [2.5, 3.5, 4, 4.5, 5, 5.5, 7, 10], mu: 4, sigma: 1.5 });
    const bars = planeOf(bell[1].state, 'data').shapes.flatMap((s) => (s.kind === 'bars' ? s.bars : []));
    bars.forEach((b, i) => expect(b.y).toBeCloseTo(normalPdf([2.5, 3.5, 4, 4.5, 5, 5.5, 7, 10][i], 4, 1.5), 4));
    // Every bell stays under the fixed top of the chart, however narrow.
    expect(normalPdf(0, 0, LIMITS.sigma[0])).toBeLessThan(planeOf(bell[0].state, 'data').y.max);
  });
});

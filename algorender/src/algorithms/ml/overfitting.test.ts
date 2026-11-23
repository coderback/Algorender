// Property tests for overfitting, validation and bias–variance (B7 of the math
// and ML path): polynomial fits are least squares (their residuals are at right
// angles to every column, and degree n − 1 interpolates), training error never
// rises with the degree, k-fold folds partition the points, the exact bias² and
// variance match many training sets counted out, every question's answer is
// what the next frame shows, questions about random training sets are right on
// every seed, and no frame, label or caption gives an answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { createRng } from '@/engine/random';
import { statesAnswer } from '@/testing/answers';
import { LONG_MS } from '@/testing/timing';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  AVERAGE_CHOICES,
  argmin,
  BEST,
  BV_BEST,
  CLOSER_CHOICES,
  cvError,
  cvErrors,
  DEGREES,
  err,
  evalPoly,
  exactSpread,
  FINAL_CHOICES,
  fitPoly,
  fitTo,
  FITS,
  GRID,
  HIGH,
  isU,
  K_RANGE,
  kFold,
  LOW,
  LOWER_CHOICES,
  mseOn,
  N_POOL,
  NOISE,
  ONCE_CHOICES,
  OPTIMISTIC_CHOICES,
  overfitting,
  parseOverfit,
  polyFeatures,
  POOL,
  resample,
  SPREAD_CHOICES,
  spreadOf,
  START_DEGREE,
  TEST,
  TEST_ERR,
  totalOf,
  TRAIN,
  TRAIN_ERR,
  TRAIN_X,
  truth,
  VALID,
  VALID9_CHOICES,
  VALID_ERR,
  ZERO_CHOICES,
  type OverfitInput,
  type Story,
} from './overfitting';

const trace = (input: OverfitInput) => traceOf(overfitting, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(overfitting, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 0, max: 1_000_000 });
const degrees = fc.integer({ min: 0, max: 9 });
const ks = fc.integer({ min: K_RANGE[0], max: K_RANGE[1] });
const FRAMES: Record<Story, number> = { degree: 8, 'bias-variance': 6, 'k-fold': 5 };
const QUESTIONS: Record<Story, number> = { degree: 6, 'bias-variance': 4, 'k-fold': 4 };
const inputOf = (story: Story, seed: number, degree: number, k: number): OverfitInput =>
  story === 'degree' ? { story, degree } : story === 'bias-variance' ? { story, degree, seed } : { story, k };
const SEEDS = Array.from({ length: 200 }, (_, k) => k * 7919 + 3);

function roundTrips(input: OverfitInput) {
  const custom = overfitting.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** The polynomial through the points by Lagrange's formula, the reference for interpolation. */
const lagrange = (xs: readonly number[], ys: readonly number[], x: number) =>
  xs.reduce((s, xi, i) => s + ys[i] * xs.reduce((p, xj, j) => (j === i ? p : (p * (x - xj)) / (xi - xj)), 1), 0);

describe('overfitting', () => {
  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of overfitting.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as OverfitInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        for (const part of frames[0].state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [[h.at[0] + h.step, -4], [h.at[0] - h.step, 0.4], [h.min[0], -4], [h.max[0], -4], [-3, 0], [12, 0], [2.4, 0]] as Vec[]) {
              const moved = overfitting.input.drag!(input as never, h.id, to) as OverfitInput;
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
      }
    }
  });

  it('plays every story from any seed, degree and k, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('degree', 'bias-variance', 'k-fold'), seeds, degrees, ks, (story, seed, degree, k) => {
        const input = inputOf(story, seed, degree, k);
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBe(QUESTIONS[story]);
      }),
      { numRuns: 30 },
    );
  });

  it('uses its seed only to deal the bias–variance story’s training sets', () => {
    for (const ex of overfitting.input.examples) {
      const a = JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as OverfitInput));
      expect(JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as OverfitInput))).toBe(a);
      const b = JSON.stringify(trace(ex.make({ seed: 4, size: 0 }) as OverfitInput));
      if (ex.id === 'bias-variance') expect(b).not.toBe(a);
      else expect(b).toBe(a);
    }
  });

  it('refuses inputs outside the stories, and the handle moves only the degree', () => {
    for (const text of ['walk 3', 'degree', 'degree 10', 'degree -1', 'degree 2.5', 'degree 2 3', 'bias-variance degree 3', 'bias-variance degree 12 seed 1', 'bias-variance degree 3 seed -2', 'k-fold', 'k-fold 1', 'k-fold 11', 'k-fold 2.5', 'k-fold 5 6'])
      expect(parseOverfit(text), text).toHaveProperty('error');
    expect(parseOverfit('Degree 0')).toEqual({ value: { story: 'degree', degree: 0 } });
    expect(parseOverfit('bias-variance degree 9 seed 0')).toEqual({ value: { story: 'bias-variance', degree: 9, seed: 0 } });
    expect(parseOverfit('k-fold 10')).toEqual({ value: { story: 'k-fold', k: 10 } });
    const kf: OverfitInput = { story: 'k-fold', k: 5 };
    expect(overfitting.input.drag!(kf as never, 'degree', [3, 0])).toBe(kf);
    const d: OverfitInput = { story: 'degree', degree: 6 };
    expect(overfitting.input.drag!(d as never, 'degree', [3.2, 0])).toEqual({ story: 'degree', degree: 3 });
    expect(overfitting.input.drag!(d as never, 'degree', [-2, 0])).toEqual({ story: 'degree', degree: 0 });
    expect(overfitting.input.drag!(d as never, 'degree', [14, 0])).toEqual({ story: 'degree', degree: 9 });
    // The handle sits at the chosen degree on the error chart (and on the bias–variance chart).
    for (const degree of DEGREES) {
      expect(planeOf(trace({ story: 'degree', degree })[0].state, 'errors').handles[0].at[0]).toBe(degree);
      expect(planeOf(trace({ story: 'bias-variance', degree, seed: 1 })[0].state, 'spread').handles[0].at[0]).toBe(degree);
    }
  });

  it('keeps its pseudo-code lines short enough for the code panel', () => {
    for (const line of overfitting.pseudocode) expect(line.length, line).toBeLessThanOrEqual(38);
  });
});

describe('the maths against plain loops', () => {
  it('the data: 10 evenly spread training x’s, every point inside [−1, 1], to hundredths', () => {
    expect(TRAIN_X).toEqual([-1, -0.78, -0.56, -0.33, -0.11, 0.11, 0.33, 0.56, 0.78, 1]);
    expect([TRAIN.length, VALID.length, POOL.length, TEST.length]).toEqual([10, 40, 20, 40]);
    for (const d of [...TRAIN, ...VALID, ...POOL, ...TEST]) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.round(d.x * 100) - d.x * 100)).toBeLessThan(1e-9);
      expect(Math.abs(Math.round(d.y * 100) - d.y * 100)).toBeLessThan(1e-9);
      expect(Math.abs(d.y - truth(d.x))).toBeLessThan(NOISE * 2 * Math.sqrt(3) + 0.01);
    }
  });

  it('features are the powers of x, and a fit is least squares: its residuals are at right angles to every column', () => {
    expect(polyFeatures([2, -0.5], 3)).toEqual([
      [1, 2, 4, 8],
      [1, -0.5, 0.25, -0.125],
    ]);
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 12, maxLength: 30 }),
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 1000 }),
        (xs, degree, seed) => {
          const u = createRng(seed);
          const ys = xs.map((x) => truth(x) + u() - 0.5);
          const w = fitPoly(xs, ys, degree);
          const X = polyFeatures(xs, degree);
          const r = ys.map((y, i) => y - evalPoly(w, xs[i]));
          // Spread-out x's keep the columns independent; near-repeats make any fit ill-posed, so skip those.
          if (new Set(xs.map((x) => x.toFixed(2))).size < degree + 4) return;
          for (let j = 0; j <= degree; j++) expect(Math.abs(X.reduce((s, row, i) => s + row[j] * r[i], 0))).toBeLessThan(1e-7 * xs.length);
          // No nearby weights do better.
          for (let j = 0; j <= degree; j++) {
            const nudged = w.map((v, k) => (k === j ? v + 1e-3 : v));
            expect(mseOn(nudged, xs.map((x, i) => ({ x, y: ys[i] })))).toBeGreaterThan(mseOn(w, xs.map((x, i) => ({ x, y: ys[i] }))));
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('degree n − 1 interpolates the n points, matching Lagrange’s polynomial', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const ys of resample(seed, 3)) {
          const w = fitPoly(TRAIN_X, ys, 9);
          TRAIN_X.forEach((x, i) => expect(evalPoly(w, x)).toBeCloseTo(ys[i], 9));
          for (const x of GRID) expect(Math.abs(evalPoly(w, x) - lagrange(TRAIN_X, ys, x))).toBeLessThan(1e-7);
        }
      }),
      { numRuns: 20 },
    );
    expect(TRAIN_ERR[9]).toBeLessThan(1e-20);
    expect(() => fitPoly([0, 1], [1, 2], 2)).toThrow();
  });

  it('training error never rises with the degree, on any data', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const ys of resample(seed, 2)) {
          const data = TRAIN_X.map((x, i) => ({ x, y: ys[i] }));
          const errs = DEGREES.map((d) => mseOn(fitTo(data, d), data));
          for (let d = 1; d < errs.length; d++) expect(errs[d]).toBeLessThanOrEqual(errs[d - 1] + 1e-12);
        }
      }),
      { numRuns: 30 },
    );
    for (let d = 1; d <= 9; d++) expect(TRAIN_ERR[d]).toBeLessThan(TRAIN_ERR[d - 1]);
    expect(VALID_ERR.map((v, d) => mseOn(FITS[d], VALID) === v).every(Boolean)).toBe(true);
  });

  it('k-fold: consecutive folds that share out every index once, sizes differing by at most one, the bigger ones first', () => {
    for (let n = 1; n <= 30; n++) {
      for (let k = 1; k <= n; k++) {
        const folds = kFold(n, k);
        expect(folds.length).toBe(k);
        expect(folds.flat()).toEqual(Array.from({ length: n }, (_, i) => i));
        const sizes = folds.map((f) => f.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        for (let f = 1; f < k; f++) expect(sizes[f]).toBeLessThanOrEqual(sizes[f - 1]);
        expect(sizes.filter((s) => s === Math.floor(n / k) + 1).length).toBe(n % k);
      }
    }
    expect(kFold(10, 4)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7], [8, 9]]);
  });

  it('the cross-validated error is every point’s squared error from the model that left it out, averaged', () => {
    for (const k of [2, 3, 5, 7, 10]) {
      const folds = kFold(N_POOL, k);
      for (const d of [0, 3, 6]) {
        let total = 0;
        for (const fold of folds) {
          const train = POOL.filter((_, i) => !fold.includes(i));
          const w = fitTo(train, d);
          for (const i of fold) total += (evalPoly(w, POOL[i].x) - POOL[i].y) ** 2;
        }
        expect(cvError(k, d)).toBeCloseTo(total / N_POOL, 12);
      }
    }
  });

  it('measured bias² and variance match plain loops, and the exact ones match thousands of training sets', () => {
    const fits = resample(5, 4).map((ys) => fitPoly(TRAIN_X, ys, 2));
    const s = spreadOf(fits);
    let b = 0;
    let v = 0;
    for (const x of GRID) {
      const vals = fits.map((w) => evalPoly(w, x));
      const m = vals.reduce((a, c) => a + c, 0) / vals.length;
      b += (m - truth(x)) ** 2;
      v += vals.reduce((a, c) => a + (c - m) ** 2, 0) / vals.length;
    }
    expect(s.bias2).toBeCloseTo(b / GRID.length, 12);
    expect(s.variance).toBeCloseTo(v / GRID.length, 12);
    // Monte Carlo: 4000 training sets. The bias² of their average carries variance / 4000 on top of the exact bias².
    for (const d of [1, 3, 9]) {
      const many = spreadOf(resample(99, 4000).map((ys) => fitPoly(TRAIN_X, ys, d)));
      const exact = exactSpread(d);
      expect(Math.abs(many.variance / exact.variance - 1), `variance at degree ${d}`).toBeLessThan(0.06);
      expect(Math.abs(many.bias2 - exact.bias2), `bias² at degree ${d}`).toBeLessThan(0.003 + (5 * exact.variance) / 4000);
    }
    // Bias² falls and variance climbs with the degree; their sum is lowest at degree 3.
    for (let d = 1; d <= 9; d++) {
      expect(exactSpread(d).bias2).toBeLessThanOrEqual(exactSpread(d - 1).bias2 + 1e-12);
      expect(exactSpread(d).variance).toBeGreaterThan(exactSpread(d - 1).variance);
    }
    expect(BV_BEST).toBe(3);
    expect(argmin(DEGREES.map(totalOf))).toBe(BV_BEST);
  });
});

describe('the fixed data tell the story the notes tell', () => {
  it('the validation error makes a clean U with its lowest at degree 3, and the test error is worse than the validation error', () => {
    expect(isU(VALID_ERR)).toBe(true);
    expect(BEST).toBe(3);
    expect(VALID_ERR[9]).toBeGreaterThan(VALID_ERR[3] * 10);
    expect(TEST_ERR).toBeGreaterThan(VALID_ERR[BEST]);
    expect(isU(cvErrors(5))).toBe(true);
    expect(argmin(cvErrors(5))).toBe(3);
    expect(isU([3, 2, 1, 2])).toBe(true);
    expect(isU([3, 2, 4, 3])).toBe(false);
    expect(err(1e-28)).toBe('0');
    expect(err(0.005441)).toBe('0.00544');
    expect(err(0.6063)).toBe('0.606');
  });
});

describe('questions about random training sets are right on every seed', () => {
  it(
    'the lines’ average misses the curve, the degree-9 curves spread far wider, and their average comes closer',
    () => {
      for (const seed of SEEDS) {
        const sets = resample(seed);
        const low = spreadOf(sets.map((ys) => fitPoly(TRAIN_X, ys, LOW)));
        const high = spreadOf(sets.map((ys) => fitPoly(TRAIN_X, ys, HIGH)));
        expect(low.bias2, `seed ${seed}`).toBeGreaterThan(0.1);
        expect(high.variance).toBeGreaterThan(5 * low.variance);
        expect(high.bias2).toBeLessThan(low.bias2 / 1.5);
        // The degree-9 curves fan out widest near the ends.
        const fits = sets.map((ys) => fitPoly(TRAIN_X, ys, HIGH));
        const varAt = (x: number) => {
          const vals = fits.map((w) => evalPoly(w, x));
          const m = vals.reduce((a, c) => a + c, 0) / vals.length;
          return vals.reduce((a, c) => a + (c - m) ** 2, 0) / vals.length;
        };
        const ends = Math.max(varAt(-0.9), varAt(0.9));
        for (const x of [-0.45, -0.22, 0, 0.22, 0.45]) expect(ends).toBeGreaterThan(varAt(x));
      }
    },
    LONG_MS,
  );
});

describe('every question’s answer is what the next frame shows', () => {
  it('the degree story', () => {
    const frames = trace({ story: 'degree', degree: START_DEGREE });
    expect(answer(frames, 0)).toBe(LOWER_CHOICES[0]);
    expect(Number(readout(frames[1].state, 'train'))).toBeLessThan(Number(readout(frames[0].state, 'train')));
    expect(answer(frames, 1)).toBe(ZERO_CHOICES[0]);
    expect(readout(frames[2].state, 'train')).toBe('0');
    expect(readout(frames[2].state, 'valid')).toBeUndefined();
    expect(answer(frames, 2)).toBe(VALID9_CHOICES[2]);
    expect(Number(readout(frames[3].state, 'valid'))).toBeGreaterThan(10 * VALID_ERR[3]);
    expect(answer(frames, 3)).toBe('No');
    expect(readout(frames[4].state, 'trains')).toBe(TRAIN_ERR.map(err).join(', '));
    expect(answer(frames, 4)).toBe(String(BEST));
    expect(frames[4].checkpoint!.choices).toEqual(['1', '3', '6', '9']);
    expect(planeOf(frames[4].state, 'errors').shapes.find((s) => s.id === 'valid')).toMatchObject({ kind: 'path' });
    expect(readout(frames[5].state, 'valids')).toBe(VALID_ERR.map(err).join(', '));
    expect(answer(frames, 5)).toBe(OPTIMISTIC_CHOICES[0]);
    expect(Number(readout(frames[6].state, 'test'))).toBeGreaterThan(Number(readout(frames[5].state, 'valid')));
    // The validation curve isn't drawn past degree 9's single point before the question about the lowest one.
    const before = planeOf(frames[4].state, 'errors').shapes.find((s) => s.id === 'valid');
    expect(before && before.kind === 'path' && before.points.map((p) => p[0])).toEqual([1, 3, 9]);
  });

  it('the bias–variance story', () => {
    fc.assert(
      fc.property(seeds, degrees, (seed, degree) => {
        const frames = trace({ story: 'bias-variance', degree, seed });
        const sets = resample(seed);
        const low = spreadOf(sets.map((ys) => fitPoly(TRAIN_X, ys, LOW)));
        const high = spreadOf(sets.map((ys) => fitPoly(TRAIN_X, ys, HIGH)));
        expect(answer(frames, 0)).toBe(AVERAGE_CHOICES[1]);
        expect(readout(frames[1].state, 'bias1')).toBe(fmt(low.bias2, 3));
        expect(answer(frames, 1)).toBe(SPREAD_CHOICES[0]);
        expect(readout(frames[2].state, 'var9')).toBe(fmt(high.variance, 3));
        expect(readout(frames[2].state, 'bias9')).toBeUndefined();
        expect(planeOf(frames[2].state, 'data').shapes.some((s) => s.id === 'mean')).toBe(false);
        expect(answer(frames, 2)).toBe(CLOSER_CHOICES[1]);
        expect(Number(readout(frames[3].state, 'bias9'))).toBeLessThan(Number(readout(frames[3].state, 'bias1')));
        expect(answer(frames, 3)).toBe(String(BV_BEST));
        expect(frames[3].checkpoint!.choices).toEqual(['1', '3', '5', '9']);
        expect(planeOf(frames[3].state, 'spread').shapes).toEqual([]);
        expect(readout(frames[4].state, 'xsum')).toBe(fmt(totalOf(BV_BEST), 4));
        expect(frames[4].note).toContain(`smallest at degree ${BV_BEST}`);
      }),
      { numRuns: 20 },
    );
  });

  it('the k-fold story, for every k', () => {
    for (let k = K_RANGE[0]; k <= K_RANGE[1]; k++) {
      const frames = trace({ story: 'k-fold', k });
      const folds = kFold(N_POOL, k);
      expect(answer(frames, 0)).toBe(String(N_POOL - folds[0].length));
      expect(frames[1].note).toContain(`fitted to the ${N_POOL - folds[0].length} points outside fold 1`);
      expect(answer(frames, 1)).toBe(ONCE_CHOICES(k)[0]);
      const cells = planeOf(frames[2].state, 'folds').shapes[0];
      if (cells.kind !== 'bars') throw new Error('no cells');
      for (let i = 0; i < N_POOL; i++) expect(cells.bars.filter((b) => b.id.endsWith(`-${i}`) && b.tone === 2).length).toBe(1);
      expect(answer(frames, 2)).toBe(String(10 * k));
      expect(frames[3].stats.fits).toBe(10 * k);
      const pick = argmin(cvErrors(k));
      expect(readout(frames[3].state, 'pick')).toBe(String(pick));
      expect(answer(frames, 3)).toBe(FINAL_CHOICES(k)[0]);
      expect(frames[4].note).toContain(`on all ${N_POOL} points`);
      expect(frames[3].note.includes('The same U')).toBe(isU(cvErrors(k)));
      // A bumpy score says so, and so does the refit it leads to.
      expect(frames[3].note.includes('lucky dip')).toBe(!isU(cvErrors(k)));
      expect(frames[4].note.includes('safer choice')).toBe(!isU(cvErrors(k)));
      expect(frames[3].note).toContain('another k can pick another degree');
    }
  });
});

describe('no frame gives its own question’s answer away', () => {
  const PHRASES: Record<string, string[]> = {
    [LOWER_CHOICES[0]]: ['lower', 'at least as well'],
    [ZERO_CHOICES[0]]: ['through every', 'through all', 'training error is 0'],
    [VALID9_CHOICES[2]]: ['much higher', 'times'],
    [OPTIMISTIC_CHOICES[0]]: ['a bit higher', 'flatter', 'optimistic', 'luck'],
    [AVERAGE_CHOICES[1]]: ["can't bend", 'misses the bends', 'bias'],
    [SPREAD_CHOICES[0]]: ['more', 'wider', 'fan out'],
    [CLOSER_CHOICES[1]]: ['closer', 'cancel'],
    ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => [FINAL_CHOICES(k)[0], ['all 20', 'every point helps']])),
    Once: ['once', 'exactly one'],
  };
  it('in its note or its readouts', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('degree', 'bias-variance', 'k-fold'), seeds, degrees, ks, (story, seed, degree, k) => {
        for (const f of trace(inputOf(story, seed, degree, k))) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => it.value) : []))].join(' \n ');
          const where = `${story} ${seed} ${degree} ${k}: "${c.question}" (${said})`;
          expect(statesAnswer(shown, c), where).toBe(false);
          if (said === 'Yes' || said === 'No' || /^\d+$/.test(said)) continue;
          for (const phrase of PHRASES[said] ?? [said]) {
            const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(shown.toLowerCase(), where).not.toMatch(new RegExp(`(?<![\\w\\d.,])${esc}(?![\\w\\d])`));
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('in any example label, plane caption, legend row or the idea', () => {
    const inputs: OverfitInput[] = [
      ...overfitting.input.examples.map((ex) => ex.make({ seed: 1, size: 0 }) as OverfitInput),
      ...[2, 3, 7, 10].map((k): OverfitInput => ({ story: 'k-fold', k })),
    ];
    const checkpoints = inputs.flatMap((input) => trace(input).flatMap((f) => (f.checkpoint ? [f.checkpoint] : [])));
    const always = [overfitting.content.idea, ...overfitting.input.examples.map((ex) => ex.label), ...overfitting.legend.map((l) => (typeof l === 'string' ? l : 'label' in l ? l.label : l.neutral))];
    for (const text of always) {
      for (const c of checkpoints) {
        expect(statesAnswer(text, c), `${text}: ${c.question}`).toBe(false);
        const said = c.choices[c.answer].toLowerCase();
        if (/[a-z]{3,}/.test(said)) expect(text.toLowerCase().includes(said), `${text}: ${said}`).toBe(false);
      }
      expect(text.toLowerCase()).not.toMatch(/\bonce\b|lowest at|degree 3|all 20|much higher|cancel|optimistic/);
    }
    // A question's frame names no answer in its plane captions either.
    for (const input of inputs) {
      for (const f of trace(input)) {
        if (!f.checkpoint) continue;
        const said = f.checkpoint.choices[f.checkpoint.answer].toLowerCase();
        for (const p of f.state.parts) {
          if (p.kind !== 'plane') continue;
          expect(statesAnswer(p.label, f.checkpoint)).toBe(false);
          if (/[a-z]{3,}/.test(said)) expect(p.label.toLowerCase().includes(said), `${p.label}: ${said}`).toBe(false);
        }
      }
    }
  });
});

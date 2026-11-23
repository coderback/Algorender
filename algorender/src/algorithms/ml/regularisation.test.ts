// Property tests for regularisation (B7 of the math and ML path): ridge's
// weights solve (XᵀX + λI)w = Xᵀy and beat every nearby point; lasso's exact
// weights agree with coordinate descent and a brute-force search, keep the KKT
// conditions, and reach exactly 0 where the story says; the curve's fits
// solve their own equations, the training error only rises with λ and the
// validation error makes a U; every question's answer is what the next frame
// shows; and nothing on screen gives a question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { mentions } from '@/testing/answers';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  A2,
  axisAt,
  B2,
  BEST_CURVE,
  biggest,
  C_LAMBDAS,
  CIRCLE_CHOICES,
  FALL_CHOICES,
  LINE_CHOICES,
  contourThrough,
  CURVE_FITS,
  curveAt,
  curvePenalty,
  curveWeights,
  FLAT_CHOICES,
  fmtLambda,
  FURTHER_CHOICES,
  gridOf,
  l1,
  l2,
  lambdaAt,
  LASSO_ALL_ZERO,
  LASSO_W2_ZERO,
  lassoByCoordinates,
  lassoCost,
  lassoWeights,
  LEAST_SQUARES,
  meanOf,
  meanSquaredError,
  nearestOnCircle,
  parseRegularisation,
  powers,
  regularisation,
  ridgeCost,
  ridgeWeights,
  shareOf,
  S_MIN,
  SHAPE_CHOICES,
  softThreshold,
  TINY_CHOICES,
  TOUCH_CHOICES,
  TRAIN,
  trainingError,
  UPDOWN_CHOICES,
  VALIDATION,
  W1_CHOICES,
  W_LAMBDAS,
  X2,
  Y2,
  type RegInput,
  type Story,
} from './regularisation';

const trace = (input: RegInput) => traceOf(regularisation, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(regularisation, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const FRAMES: Record<Story, number> = { ridge: 5, lasso: 6, curve: 8 };
const STORIES: Story[] = ['ridge', 'lasso', 'curve'];
const lambdas = fc.double({ min: 0, max: 600, noNaN: true });

function roundTrips(input: RegInput) {
  const custom = regularisation.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

describe('regularisation', () => {
  it('plays every story at every λ on its grid, round-trips its text, and every drag keeps the frame count', () => {
    for (const story of STORIES) {
      for (const lam of gridOf(story)) {
        const input: RegInput = { story, lam };
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length, `${story} ${lam}`).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(4);
        // The λ handle sits only on the last frame, the one that draws the input's own λ.
        for (const fr of frames.slice(0, -1)) expect(fr.state.parts.flatMap((p) => (p.kind === 'plane' ? p.handles : []))).toEqual([]);
        const handles = frames.at(-1)!.state.parts.flatMap((p) => (p.kind === 'plane' ? p.handles : []));
        expect(handles.map((h) => h.id)).toEqual(['lambda']);
        const h = handles[0];
        expect(h.at).toEqual([gridOf(story).indexOf(lam), 0]);
        for (const to of [[h.at[0] + 1, 0], [h.at[0] - 1, 0.4], [h.min[0], 0], [h.max[0], 0], [-3, 0], [12, 0], [2.4, 0]] as Vec[]) {
          const moved = regularisation.input.drag!(input as never, h.id, to) as RegInput;
          expect(moved.story).toBe(story);
          expect(gridOf(story)).toContain(moved.lam);
          const again = trace(moved);
          expect(again.length).toBe(frames.length);
        }
      }
    }
  });

  it('runs the same whatever the seed: its examples are fixed data', () => {
    for (const ex of regularisation.input.examples) expect(JSON.stringify(ex.make({ seed: 1, size: 0 }))).toBe(JSON.stringify(ex.make({ seed: 99, size: 0 })));
    expect(regularisation.input.examples.map((e) => e.id)).toEqual(['ridge', 'lasso', 'curve']);
  });

  it('refuses inputs outside the stories, and accepts λ written either way', () => {
    for (const text of ['elastic lambda 4', 'ridge', 'ridge lambda 3', 'ridge lambda -1', 'lasso lambda 512', 'curve lambda 0.5', 'curve lambda 1e-7', 'ridge lambda 1 2'])
      expect(parseRegularisation(text), text).toHaveProperty('error');
    expect(parseRegularisation('Curve, λ = 1e-6')).toEqual({ value: { story: 'curve', lam: 1e-6 } });
    expect(parseRegularisation('curve lambda 0.000001')).toEqual({ value: { story: 'curve', lam: 1e-6 } });
    expect(parseRegularisation('lasso lambda 256')).toEqual({ value: { story: 'lasso', lam: 256 } });
    expect(fmtLambda(1e-5)).toBe('0.00001');
    expect(fmtLambda(0.001)).toBe('0.001');
    expect(regularisation.input.drag!({ story: 'ridge', lam: 16 } as never, 'other', [0, 0])).toEqual({ story: 'ridge', lam: 16 });
  });
});

describe('two weights: the maths against plain loops and searches', () => {
  it('the data are centred, and S is the total squared error, a bowl round ŵ', () => {
    for (const j of [0, 1]) expect(X2.reduce((s, r) => s + r[j], 0)).toBe(0);
    expect(Y2.reduce((s, v) => s + v, 0)).toBe(0);
    expect(A2).toEqual([[32, 21], [21, 26]]);
    expect(B2).toEqual([78, 66]);
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), (u, v) => {
        const d = [u - LEAST_SQUARES[0], v - LEAST_SQUARES[1]];
        const quad = A2[0][0] * d[0] ** 2 + 2 * A2[0][1] * d[0] * d[1] + A2[1][1] * d[1] ** 2;
        expect(trainingError([u, v])).toBeCloseTo(S_MIN + quad, 8);
      }),
      { numRuns: 100 },
    );
  });

  it('ridge solves (XᵀX + λI)w = Xᵀy and beats every nearby point', () => {
    fc.assert(
      fc.property(lambdas, fc.double({ min: -0.05, max: 0.05, noNaN: true }), fc.double({ min: -0.05, max: 0.05, noNaN: true }), (lam, du, dv) => {
        const w = ridgeWeights(lam);
        expect((A2[0][0] + lam) * w[0] + A2[0][1] * w[1]).toBeCloseTo(B2[0], 9);
        expect(A2[1][0] * w[0] + (A2[1][1] + lam) * w[1]).toBeCloseTo(B2[1], 9);
        if (Math.hypot(du, dv) > 1e-6) expect(ridgeCost([w[0] + du, w[1] + dv], lam)).toBeGreaterThan(ridgeCost(w, lam));
      }),
      { numRuns: 150 },
    );
    expect(ridgeWeights(0)).toEqual(LEAST_SQUARES);
    expect(ridgeWeights(1).map((v) => fmt(v, 9))).toEqual(['1.6', '1.2']);
  });

  it('ridge shrinks both weights as λ grows, never to 0, and S only rises', () => {
    let prev = ridgeWeights(0);
    for (let t = 0.02; t <= 14; t += 0.02) {
      const w = ridgeWeights(lambdaAt(t));
      expect(w[0]).toBeLessThan(prev[0]);
      expect(w[1]).toBeLessThan(prev[1]);
      expect(w[0]).toBeGreaterThan(0);
      expect(w[1]).toBeGreaterThan(0);
      expect(trainingError(w)).toBeGreaterThan(trainingError(prev));
      prev = w;
    }
    // w₂ > 0 for every λ: with w = (A + λI)⁻¹b, w₂ ∝ (a + λ)b₂ − c·b₁, and a·b₂ > c·b₁ here.
    expect(A2[0][0] * B2[1]).toBeGreaterThan(A2[0][1] * B2[0]);
  });

  it('lasso’s exact weights agree with coordinate descent and a brute-force search', () => {
    for (const lam of [0, 0.5, 3, 10, 16, 40, 64, 86, 87, 100, 128, 150, 155, 157, 256, 400]) {
      const w = lassoWeights(lam);
      const cd = lassoByCoordinates(lam);
      expect(cd[0], `λ ${lam}`).toBeCloseTo(w[0], 9);
      expect(cd[1], `λ ${lam}`).toBeCloseTo(w[1], 9);
      // A grid of steps of 0.01 over the box, then a finer one round the best of it.
      let best: Vec = [0, 0];
      for (let u = -0.5; u <= 2.5; u += 0.01) for (let v = -0.5; v <= 2.5; v += 0.01) if (lassoCost([u, v], lam) < lassoCost(best, lam)) best = [u, v];
      const coarse = best;
      for (let u = coarse[0] - 0.01; u <= coarse[0] + 0.01; u += 0.0002) for (let v = coarse[1] - 0.01; v <= coarse[1] + 0.01; v += 0.0002) if (lassoCost([u, v], lam) < lassoCost(best, lam)) best = [u, v];
      expect(lassoCost(w, lam)).toBeLessThanOrEqual(lassoCost(best, lam) + 1e-9);
      expect(Math.abs(best[0] - w[0])).toBeLessThan(0.002);
      expect(Math.abs(best[1] - w[1])).toBeLessThan(0.002);
    }
  });

  it('lasso keeps the KKT conditions, and its weights are exactly 0 from where the story says', () => {
    fc.assert(
      fc.property(lambdas, (lam) => {
        const w = lassoWeights(lam);
        // ∂S/∂wⱼ = 2(Aw − b)ⱼ: −λ·sign(wⱼ) where wⱼ ≠ 0, at most λ in size where wⱼ = 0.
        for (const j of [0, 1]) {
          const g = 2 * (A2[j][0] * w[0] + A2[j][1] * w[1] - B2[j]);
          if (w[j] !== 0) expect(g).toBeCloseTo(-lam * Math.sign(w[j]), 8);
          else expect(Math.abs(g)).toBeLessThanOrEqual(lam + 1e-9);
        }
        expect(w[1] === 0).toBe(lam >= LASSO_W2_ZERO);
        expect(w[0] === 0).toBe(lam >= LASSO_ALL_ZERO);
        expect(w[0]).toBeGreaterThanOrEqual(0);
        expect(w[1]).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 300 },
    );
    // While both are in use, w = ŵ − (λ/2)A⁻¹(1, 1), so w₂ meets 0 at λ = 2·ŵ₂·det A / (a − c); after, w₁ = (b₁ − λ/2)/a meets it at 2b₁.
    const det = A2[0][0] * A2[1][1] - A2[0][1] ** 2;
    expect(LASSO_W2_ZERO).toBeCloseTo((2 * LEAST_SQUARES[1] * det) / (A2[0][0] - A2[0][1]), 9);
    expect(LASSO_ALL_ZERO).toBeCloseTo(2 * B2[0], 9);
    expect([fmt(LASSO_W2_ZERO), fmt(LASSO_ALL_ZERO)]).toEqual(['86.18', '156']);
    expect(lassoWeights(0)).toEqual(LEAST_SQUARES);
    expect(softThreshold(3, 1)).toBe(2);
    expect(softThreshold(-3, 1)).toBe(-2);
    expect(softThreshold(0.5, 1)).toBe(0);
  });

  it('the weights at λ are the lowest S on their own circle or diamond, which a contour touches there', () => {
    for (const lam of [1, 4, 16, 64, 128]) {
      for (const [kind, w, norm] of [['ridge', ridgeWeights(lam), l2], ['lasso', lassoWeights(lam), l1]] as const) {
        const r = norm(w);
        for (let k = 0; k < 720; k++) {
          const t = (2 * Math.PI * k) / 720;
          const dir: Vec = [Math.cos(t), Math.sin(t)];
          const on: Vec = [(dir[0] * r) / norm(dir), (dir[1] * r) / norm(dir)];
          expect(trainingError(on), `${kind} ${lam}`).toBeGreaterThanOrEqual(trainingError(w) - 1e-9);
        }
      }
    }
    // The drawn contour is S's level through the weights (coordinates rounded to hundredths).
    const w = ridgeWeights(16);
    for (const p of contourThrough(w)) expect(Math.abs(trainingError(p) - trainingError(w))).toBeLessThan(0.5);
    expect(contourThrough(LEAST_SQUARES)).toEqual([]);
    // On a tilted valley the circle's point nearest ŵ is not its lowest.
    const near = nearestOnCircle(l2(w));
    expect(l2(near)).toBeCloseTo(l2(w), 12);
    expect(trainingError(near)).toBeGreaterThan(trainingError(w) + 0.05);
  });

  it('the λ axis: whole ticks, doubling from 1', () => {
    W_LAMBDAS.forEach((lam, k) => {
      expect(lambdaAt(k)).toBe(lam);
      expect(axisAt(lam)).toBe(k);
    });
  });
});

describe('the curve: the maths against plain loops', () => {
  it('each fit solves its own equations, and λ = 0 threads every training point', () => {
    for (const { lam, w } of CURVE_FITS) {
      // The gradient of Σ(ŷ − y)² + λ(w₁² + … + w₉²) is 0 at the fit.
      const rows = TRAIN.map((d) => powers(d.x));
      for (let j = 0; j <= 9; j++) {
        const g = 2 * rows.reduce((s, r, k) => s + r[j] * (curveAt(w, TRAIN[k].x) - TRAIN[k].y), 0) + (j > 0 ? 2 * lam * w[j] : 0);
        expect(Math.abs(g), `λ ${lam}, w${j}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(w[j])));
      }
    }
    expect(CURVE_FITS[0].train).toBeLessThan(1e-12);
    for (const d of TRAIN) expect(curveAt(CURVE_FITS[0].w, d.x)).toBeCloseTo(d.y, 8);
    for (let j = 0; j <= 9; j++) expect(powers(0.7)[j]).toBeCloseTo(0.7 ** j, 14);
  });

  it('the training error only rises with λ, and the validation error makes a U', () => {
    let prev = -1;
    for (let e = -8; e <= 3; e += 0.05) {
      const w = curveWeights(10 ** e);
      const train = meanSquaredError(w, TRAIN);
      expect(train).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = train;
    }
    const v = CURVE_FITS.map((f) => f.validation);
    expect(BEST_CURVE).toBe(5);
    for (let k = 1; k <= BEST_CURVE; k++) expect(v[k]).toBeLessThan(v[k - 1]);
    for (let k = BEST_CURVE + 1; k < v.length; k++) expect(v[k]).toBeGreaterThan(v[k - 1]);
    // Validation error is above training error wherever λ > 0.
    for (const f of CURVE_FITS.slice(1)) expect(f.validation).toBeGreaterThan(f.train);
    // The penalty shrinks as λ grows.
    for (let k = 1; k < CURVE_FITS.length; k++) expect(curvePenalty(CURVE_FITS[k].w)).toBeLessThan(curvePenalty(CURVE_FITS[k - 1].w));
  });

  it('a huge λ leaves a flat line at the training mean, because w₀ is not charged', () => {
    const w = curveWeights(1e9);
    expect(w[0]).toBeCloseTo(meanOf(TRAIN), 6);
    for (const v of w.slice(1)) expect(Math.abs(v)).toBeLessThan(1e-6);
    const top = CURVE_FITS.at(-1)!;
    expect(fmt(top.w[0], 3)).toBe(fmt(meanOf(TRAIN), 3));
    expect(meanOf(TRAIN)).not.toBeCloseTo(0, 1);
    expect(TRAIN.length).toBe(10);
    expect(VALIDATION.length).toBe(9);
  });
});

describe('every question’s answer is what the next frame shows', () => {
  it('ridge', () => {
    const ls = LEAST_SQUARES;
    for (const lam of W_LAMBDAS) {
      const f = trace({ story: 'ridge', lam });
      expect(answer(f, 0)).toBe(CIRCLE_CHOICES[1]);
      expect(f[1].note).toContain('Where a contour of S just touches it');
      expect(Number(readout(f[1].state, 's'))).toBeGreaterThan(Number(readout(f[1].state, 'sls')));
      expect(answer(f, 1)).toBe(LINE_CHOICES[1]);
      // Off the line, with w₂ keeping a bigger share; the line's point of the circle is higher ground.
      expect(shareOf(ridgeWeights(16))).toBeGreaterThan(shareOf(ls) + 0.05);
      expect(readout(f[2].state, 'share')).toBe(fmt(shareOf(ridgeWeights(16))));
      expect(f[2].note).toContain('just touches');
      expect(Number(readout(f[2].state, 'snear'))).toBeGreaterThan(Number(readout(f[2].state, 's')));
      expect(answer(f, 2)).toBe('No');
      expect(readout(f[3].state, 'w')).toBe(fmtVec(ridgeWeights(256)));
      expect(ridgeWeights(256).every((v) => v > 0.2)).toBe(true);
      expect(answer(f, 3)).toBe(SHAPE_CHOICES[1]);
      expect(f[4].note.startsWith('Diamonds')).toBe(true);
      expect(readout(f[4].state, 'w')).toBe(fmtVec(ridgeWeights(lam)));
    }
    // w₂'s share only grows with λ, towards b₂/b₁: ridge leans towards sharing.
    let prev = shareOf(ls);
    for (let t = 0.05; t <= 14; t += 0.05) {
      const now = shareOf(ridgeWeights(2 ** t));
      expect(now).toBeGreaterThan(prev);
      prev = now;
    }
  });

  it('lasso', () => {
    const ls = LEAST_SQUARES;
    for (const lam of W_LAMBDAS) {
      const f = trace({ story: 'lasso', lam });
      expect(answer(f, 0)).toBe(FALL_CHOICES[1]);
      const w16 = lassoWeights(16);
      expect(ls[1] - w16[1]).toBeGreaterThan(2 * (ls[0] - w16[0]));
      expect(f[1].note.startsWith(`w₂: from ${fmt(ls[1])} to ${fmt(w16[1])}`)).toBe(true);
      expect(answer(f, 1)).toBe('Yes');
      expect(answer(f, 2)).toBe(TOUCH_CHOICES[1]);
      expect(lassoWeights(64)[1]).toBeGreaterThan(0);
      expect(lassoWeights(128)[1]).toBe(0);
      expect(readout(f[3].state, 'w')).toBe(fmtVec(lassoWeights(128)));
      expect(f[3].note).toContain('right at that corner');
      expect(answer(f, 3)).toBe(W1_CHOICES[0]);
      expect(lassoWeights(256)).toEqual([0, 0]);
      expect(readout(f[4].state, 'w')).toBe('(0, 0)');
      expect(readout(f[5].state, 'w')).toBe(fmtVec(lassoWeights(lam)));
    }
  });

  it('the curve', () => {
    for (const lam of C_LAMBDAS) {
      const f = trace({ story: 'curve', lam });
      expect(answer(f, 0)).toBe(UPDOWN_CHOICES[0]);
      expect(answer(f, 1)).toBe(TINY_CHOICES[1]);
      expect(Number(readout(f[2].state, 'validation'))).toBeLessThan(Number(readout(f[0].state, 'validation')) / 10);
      expect(Number(readout(f[2].state, 'train'))).toBeGreaterThan(0);
      expect(answer(f, 3)).toBe(FURTHER_CHOICES[1]);
      expect(Number(readout(f[4].state, 'validation'))).toBeGreaterThan(Number(readout(f[3].state, 'validation')));
      expect(answer(f, 4)).toBe(FLAT_CHOICES[0]);
      expect(readout(f[5].state, 'w0')).toBe(readout(f[5].state, 'mean'));
      expect(biggest(CURVE_FITS[9].w).size).toBeLessThan(0.05);
      expect(readout(f[7].state, 'lambda')).toBe(fmtLambda(lam));
      // The error chart shows only the λs visited so far.
      expect(planeOf(f[0].state, 'errors').shapes.filter((s) => s.kind === 'point').length).toBe(2);
      expect(planeOf(f[3].state, 'errors').shapes.filter((s) => s.kind === 'point').length).toBe(6);
    }
  });
});

describe('nothing gives a question’s answer away', () => {
  const PHRASES: Record<string, string[]> = {
    [CIRCLE_CHOICES[1]]: ['touch', 'meets the outline', 'meets the circle'],
    [LINE_CHOICES[1]]: ['share', 'lean'],
    [SHAPE_CHOICES[1]]: ['diamond'],
    [FALL_CHOICES[1]]: ['further', 'fastest', 'hardest'],
    [TOUCH_CHOICES[1]]: ['corner'],
    [W1_CHOICES[0]]: ['w₁ became', 'both weights are 0'],
    [UPDOWN_CHOICES[0]]: ['rose', 'rises', 'up:'],
    [TINY_CHOICES[1]]: ['a lot', 'calm'],
    [FURTHER_CHOICES[1]]: ['back up', 'rises again', 'underfit'],
    [FLAT_CHOICES[0]]: ['mean of the training', 'constant'],
  };
  // Yes/No questions, by what would say their answer.
  const YES_NO_PHRASES: Record<string, string[]> = {
    'Keep raising λ. Will w₂ become exactly 0 at some λ?': ['exactly 0', 'never', 'neither'],
  };
  const phrasesOf = (question: string, said: string) => (said === 'Yes' || said === 'No' ? (YES_NO_PHRASES[question] ?? []) : (PHRASES[said] ?? [said]));
  const allFrames = () => STORIES.flatMap((story) => gridOf(story).flatMap((lam) => trace({ story, lam }).map((f) => ({ story, lam, f }))));

  it('every question has its giveaway phrases listed', () => {
    for (const { f } of allFrames()) {
      const c = f.checkpoint;
      if (!c) continue;
      const said = c.choices[c.answer];
      if (said !== 'Yes' && said !== 'No') expect(PHRASES[said], said).toBeDefined();
    }
  });

  it('in a frame’s own note, readouts or captions', () => {
    for (const { story, lam, f } of allFrames()) {
      const c = f.checkpoint;
      if (!c) continue;
      const said = c.choices[c.answer];
      const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => it.value) : [])), ...f.state.parts.map((p) => ('label' in p ? p.label : ''))].join(' \n ').toLowerCase();
      for (const phrase of phrasesOf(c.question, said)) expect(shown, `${story} ${lam}: "${c.question}" (${said}) says "${phrase}"`).not.toContain(phrase.toLowerCase());
    }
  });

  it('in the idea, the example labels or the legend, which stay on screen in Predict mode', () => {
    const always = [regularisation.content.idea, ...regularisation.input.examples.map((e) => e.label), ...regularisation.legend.map((l) => (typeof l === 'string' ? l : 'label' in l ? l.label : l.neutral))];
    for (const { f } of allFrames()) {
      const c = f.checkpoint;
      if (!c) continue;
      for (const phrase of phrasesOf(c.question, c.choices[c.answer])) for (const text of always) expect(mentions(text, phrase), `"${text}" says "${phrase}"`).toBe(false);
    }
    for (const text of always) for (const word of ['exactly 0', 'never', 'corner', 'U-shape', 'rises', 'diamond', 'touch', 'meets']) expect(text.toLowerCase(), word).not.toContain(word);
  });
});

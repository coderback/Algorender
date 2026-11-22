// Property tests for standard errors, confidence intervals and the bootstrap
// (B6 of the math and ML path): the maths matches plain reference loops, the
// loaded die has the μ and σ the frames reveal, x̄ ± 2 SE really catches μ in
// about 95% of samples, every question's answer is what the next frame shows,
// questions about random runs are right on every seed, and no frame gives its
// own question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { fmt } from '@/viz/plot/geometry';
import { LONG_MS } from '@/testing/timing';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';
import {
  averageBars,
  BIG_N,
  BIGGER_ASK,
  bootstrapRun,
  CENTRE_ASK,
  CHANCE_ASK,
  CHANCES,
  closeTo,
  confidenceIntervals,
  coverage,
  DROP,
  drawRolls,
  FACES,
  halfish,
  firstCaught,
  HALF_ASK,
  interval,
  intervalsRun,
  MANY,
  mean,
  middle,
  MISS_ASK,
  missChoices,
  MORE_ASK,
  MU,
  nearlySame,
  N,
  ONE_SE_ASK,
  parseConfidence,
  REPLACE_ASK,
  resample,
  sampleSd,
  SAMPLES,
  SHARE_ASK,
  SIGMA,
  spread,
  SPREAD_ASK,
  standardError,
  standardErrorRun,
  TRUE_SE,
  type CiInput,
  type Story,
} from './confidence-intervals';

const trace = (input: CiInput) => traceOf(confidenceIntervals, input).frames;
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 0, max: 1_000_000 });
const STORY_LIST: Story[] = ['standard-error', 'intervals', 'bootstrap'];
const FRAMES: Record<Story, number> = { 'standard-error': 6, intervals: 7, bootstrap: 6 };

function roundTrips(input: CiInput) {
  const custom = confidenceIntervals.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

describe('the maths against plain loops', () => {
  it('the loaded die: μ = 4, σ = √3, and rolls land with its chances', () => {
    expect(CHANCES.reduce((s, p) => s + p, 0)).toBe(1);
    const ex = CHANCES.reduce((s, p, i) => s + (i + 1) * p, 0);
    const ex2 = CHANCES.reduce((s, p, i) => s + (i + 1) ** 2 * p, 0);
    expect([ex, ex2, ex2 - ex * ex]).toEqual([MU, 19, 3]);
    expect(SIGMA).toBe(Math.sqrt(3));
    expect(FACES.length).toBe(8);
    const rolls = drawRolls(createRng(1), 80_000);
    for (let f = 1; f <= 6; f++) expect(Math.abs(rolls.filter((r) => r === f).length / rolls.length - CHANCES[f - 1])).toBeLessThan(0.006);
    expect(Math.abs(mean(rolls) - MU)).toBeLessThan(0.02);
  });

  it('the sample spread, the standard error and the interval', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 2, maxLength: 60 }), (xs) => {
        const n = xs.length;
        let t = 0;
        for (const x of xs) t += x;
        const m = t / n;
        let sq = 0;
        for (const x of xs) sq += (x - m) ** 2;
        const s = Math.sqrt(sq / (n - 1));
        expect(mean(xs)).toBeCloseTo(m, 12);
        expect(sampleSd(xs)).toBeCloseTo(s, 12);
        expect(standardError(xs)).toBeCloseTo(s / Math.sqrt(n), 12);
        const iv = interval(xs);
        expect([iv.lo, iv.hi]).toEqual([iv.xbar - 2 * iv.se, iv.xbar + 2 * iv.se]);
        // Distance works both ways: the interval catches μ exactly when x̄ is within 2 SE of μ.
        // (Away from the edge, where the two roundings can disagree in the last bit: [2, 2, 4] puts μ exactly on it.)
        if (Math.abs(Math.abs(iv.xbar - MU) - 2 * iv.se) > 1e-9) expect(iv.caught).toBe(Math.abs(iv.xbar - MU) <= 2 * iv.se);
        expect(spread(xs)).toBeCloseTo(Math.sqrt(sq / n), 12);
      }),
      { numRuns: 200 },
    );
  });

  it('resamples pick from the sample with replacement; the middle drops the same count from each end', () => {
    fc.assert(
      fc.property(seeds, fc.integer({ min: 5, max: 40 }), (seed, n) => {
        const u = createRng(seed);
        const sample = drawRolls(u, n);
        const again = resample(sample, u);
        expect(again.length).toBe(n);
        for (const v of again) expect(sample).toContain(v);
        const values = Array.from({ length: 200 }, () => u());
        const sorted = [...values].sort((a, b) => a - b);
        expect(middle(values)).toEqual({ lo: sorted[5], hi: sorted[194], drop: 5 });
      }),
      { numRuns: 50 },
    );
    // With replacement, a resample of 25 nearly always repeats some pick (and so differs from a reshuffle).
    const u = createRng(3);
    const sample = Array.from({ length: N }, (_, i) => i);
    let repeats = 0;
    for (let i = 0; i < 200; i++) if (new Set(resample(sample, u)).size < N) repeats++;
    expect(repeats).toBe(200);
    // Without replacement, any reordering has the same average, exactly x̄ (the bootstrap's first question).
    const rolls = drawRolls(createRng(7), N);
    for (let k = 0; k < 20; k++) {
      const order = [...rolls].sort(() => createRng(k)() - 0.5);
      expect(mean(order)).toBe(mean(rolls));
    }
    expect(middle(Array.from({ length: MANY }, (_, i) => i)).drop).toBe(DROP);
  });

  it('averages of 25 rolls are multiples of 0.04, and the histograms count every one', () => {
    const { means, bigMeans } = standardErrorRun(11);
    for (const m of means) expect(Math.abs(m * 25 - Math.round(m * 25))).toBeLessThan(1e-9);
    const total = (bars: { y: number }[]) => bars.reduce((s, b) => s + b.y, 0);
    expect(total(averageBars('a', means, N))).toBe(means.filter((m) => m >= 2 && m <= 6).length);
    expect(total(averageBars('b', bigMeans, BIG_N))).toBe(bigMeans.filter((m) => m >= 1.98 && m <= 6.02).length);
    expect(means.filter((m) => m >= 2 && m <= 6).length).toBeGreaterThan(995);
  });
});

describe('what 95% promises', () => {
  it('x̄ ± 2 SE catches μ in about 95% of samples, x̄ ± 1 SE in about 68%, at 25 rolls or 100', () => {
    const two = coverage(1, 20_000);
    expect(two).toBeGreaterThan(0.93);
    expect(two).toBeLessThan(0.96);
    const one = coverage(2, 20_000, N, 1);
    expect(one).toBeGreaterThan(0.65);
    expect(one).toBeLessThan(0.71);
    const big = coverage(3, 10_000, BIG_N);
    expect(big).toBeGreaterThan(0.94);
    expect(big).toBeLessThan(0.965);
  });

  it('a run of 50 typically misses 2 or 3, and sometimes none', () => {
    const misses = Array.from({ length: 1000 }, (_, s) => intervalsRun(s).two.filter((iv) => !iv.caught).length);
    const avg = mean(misses);
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(3.5);
    // Of the choices About 0, 2 or 3, 10 and 25, 2 or 3 is the nearest on nearly every run.
    expect(misses.filter((m) => m <= 6).length).toBeGreaterThan(950);
    expect(misses.filter((m) => m === 0).length).toBeGreaterThan(10);
  });
});

describe('the visualiser', () => {
  it('plays every example from several seeds, with a fixed frame count, enough questions and no handles', () => {
    for (const ex of confidenceIntervals.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as CiInput;
        const frames = trace(input);
        expectGoodPlotTrace(confidenceIntervals, frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(input.story === 'intervals' ? 6 : 4);
        for (const f of frames) for (const p of f.state.parts) if (p.kind === 'plane') expect(p.handles).toEqual([]);
      }
    }
  });

  it('plays every story from any seed', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STORY_LIST), seeds, (story, seed) => {
        const frames = trace({ story, seed });
        expectGoodPlotTrace(confidenceIntervals, frames);
        roundTrips({ story, seed });
        expect(frames.length).toBe(FRAMES[story]);
      }),
      { numRuns: 30 },
    );
  });

  it('uses its seed: the same seed gives the same run, and new seeds new ones', () => {
    for (const story of STORY_LIST) {
      const a = JSON.stringify(trace({ story, seed: 3 }));
      expect(JSON.stringify(trace({ story, seed: 3 }))).toBe(a);
      expect(JSON.stringify(trace({ story, seed: 4 }))).not.toBe(a);
    }
    // Sample 1 is the same 25 rolls in every story.
    expect(intervalsRun(9).small[0]).toEqual(standardErrorRun(9).sample);
    expect(bootstrapRun(9).sample).toEqual(standardErrorRun(9).sample);
    expect(intervalsRun(9).small[1]).toEqual(standardErrorRun(9).second);
  });

  it('refuses inputs outside the stories', () => {
    for (const text of ['darts seed 3', 'intervals', 'intervals seed -1', 'bootstrap seed 1.5', 'standard-error seed 1 2', 'intervals seed 99999999999', 'standard seed 3'])
      expect(parseConfidence(text), text).toHaveProperty('error');
    expect(parseConfidence('standard-error seed 0')).toEqual({ value: { story: 'standard-error', seed: 0 } });
    expect(parseConfidence('Bootstrap seed 42')).toEqual({ value: { story: 'bootstrap', seed: 42 } });
  });
});

describe('every question’s answer is what the next frame shows, on every seed', () => {
  it('the standard error', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'standard-error', seed });
        const { sample, second, means, big, bigMeans } = standardErrorRun(seed);
        const se = standardError(sample);
        expect(answer(frames, 1)).toBe('No');
        expect(frames[2].note).toContain(mean(second) === mean(sample) ? `the same x̄, ${fmt(mean(sample))}` : `The next 25 rolls give x̄ = ${fmt(mean(second))}`);
        expect(answer(frames, 2)).toBe(readout(frames[3].state, 'se'));
        expect(answer(frames, 2)).toBe(missChoices(sample).answer);
        expect(readout(frames[2].state, 'se')).toBeUndefined();
        // The 1,000 averages spread about as SE says, never about as s or s/n.
        expect(answer(frames, 3)).toBe(SPREAD_ASK[1]);
        const sd = spread(means);
        const s = sampleSd(sample);
        expect(Math.abs(sd - se)).toBeLessThan(Math.min(Math.abs(sd - s), Math.abs(sd - s / N)));
        expect(readout(frames[4].state, 'spread')).toBe(fmt(sd, 3));
        // Averages of 100 rolls spread about half as much as averages of 25.
        expect(answer(frames, 4)).toBe(BIGGER_ASK[1]);
        const ratio = spread(bigMeans) / sd;
        expect(Math.abs(ratio - 0.5)).toBeLessThan(0.08);
        expect(readout(frames[5].state, 'se')).toBe(fmt(standardError(big), 3));
      }),
      { numRuns: 40 },
    );
    // Another 25 rolls give the same x̄ only now and then, so No is right in general.
    let same = 0;
    for (let s = 0; s < 2000; s++) {
      const u = createRng(s);
      if (mean(drawRolls(u, N)) === mean(drawRolls(u, N))) same++;
    }
    expect(same / 2000).toBeLessThan(0.12);
  }, LONG_MS);

  it('the intervals', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'intervals', seed });
        const { two, one, bigTwo } = intervalsRun(seed);
        expect(answer(frames, 0)).toBe(SHARE_ASK[1]);
        expect(frames[1].note).toContain('About 95%');
        expect(answer(frames, 1)).toBe('Yes');
        expect(answer(frames, 2)).toBe(MISS_ASK[1]);
        expect(frames[3].note).toContain('misses 2 or 3');
        expect(readout(frames[3].state, 'missed')).toBe(String(two.filter((iv) => !iv.caught).length));
        // The interval asked about is one that caught μ, and the answer is No however it fell.
        const k = firstCaught(two);
        expect(two[k].caught).toBe(true);
        expect(frames[3].checkpoint!.question).toContain(`Sample ${k + 1}’s interval runs from ${fmt(two[k].lo)} to ${fmt(two[k].hi)}`);
        expect(answer(frames, 3)).toBe(CHANCE_ASK[1]);
        expect(frames[4].note).toMatch(/^No\. μ is one fixed number/);
        expect(answer(frames, 4)).toBe(MORE_ASK[1]);
        expect(readout(frames[5].state, 'caught')).toBe(String(bigTwo.filter((iv) => iv.caught).length));
        expect(answer(frames, 5)).toBe(ONE_SE_ASK[1]);
        expect(readout(frames[6].state, 'caught')).toBe(String(one.filter((iv) => iv.caught).length));
        // Misses are marked, and only misses.
        const plane = planeOf(frames[3].state);
        for (let i = 0; i < SAMPLES; i++) {
          const shape = plane.shapes.find((s) => s.id === `i${i + 1}`);
          expect(shape?.kind === 'path' && shape.mark === 'reject').toBe(!two[i].caught);
        }
      }),
      { numRuns: 25 },
    );
  }, LONG_MS);

  it('the bootstrap', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'bootstrap', seed });
        const { sample, first, means, cut, bigCut } = bootstrapRun(seed);
        const xbar = mean(sample);
        const se = standardError(sample);
        const s = sampleSd(sample);
        expect(answer(frames, 0)).toBe(REPLACE_ASK[0]);
        expect(frames[1].note).toContain('average exactly x̄');
        expect(readout(frames[1].state, 'first')).toBe(fmt(mean(first)));
        // The resample averages centre on x̄ (within a few hundredths), whatever μ is.
        expect(answer(frames, 1)).toBe(CENTRE_ASK[0]);
        expect(Math.abs(mean(means) - xbar)).toBeLessThan(0.04);
        expect(readout(frames[2].state, 'centre')).toBe(fmt(mean(means), 3));
        // Their spread is about SE, not s or s/n.
        expect(answer(frames, 2)).toBe(SPREAD_ASK[1]);
        const sd = spread(means);
        expect(Math.abs(sd - se)).toBeLessThan(Math.min(Math.abs(sd - s), Math.abs(sd - s / N)));
        expect(readout(frames[2].state, 'spread')).toBeUndefined();
        expect(readout(frames[3].state, 'spread')).toBe(fmt(sd, 3));
        // 2.5% of 1,000 from each end.
        expect(answer(frames, 3)).toBe(String(DROP));
        expect(cut.drop).toBe(DROP);
        expect(frames[4].note).toContain('Drop the 25 lowest and the 25 highest');
        const sorted = [...means].sort((a, b) => a - b);
        expect([cut.lo, cut.hi]).toEqual([sorted[25], sorted[974]]);
        expect(readout(frames[4].state, 'boot')).toBe(`${fmt(cut.lo)} to ${fmt(cut.hi)}`);
        // The cut tails are marked, and lie outside the interval.
        const bars = planeOf(frames[4].state, 'averages').shapes.find((x) => x.id === 'resamples');
        if (bars?.kind !== 'bars') throw new Error('no bars');
        const cutOff = bars.bars.filter((b) => b.mark === 'reject');
        expect(cutOff.reduce((n, b) => n + b.y, 0)).toBeLessThanOrEqual(2 * DROP);
        for (const b of cutOff) expect((b.x0 + b.x1) / 2 < cut.lo || (b.x0 + b.x1) / 2 > cut.hi).toBe(true);
        expect(answer(frames, 4)).toBe(HALF_ASK[1]);
        expect(readout(frames[5].state, 'big')).toBe(`${fmt(bigCut.lo)} to ${fmt(bigCut.hi)}`);
      }),
      { numRuns: 25 },
    );
    // A sample of 100 bootstraps to about half the width: nearer a half than the same or a quarter on nearly every seed.
    let near = 0;
    for (let s = 0; s < 200; s++) {
      const { cut, bigCut } = bootstrapRun(s);
      const r = (bigCut.hi - bigCut.lo) / (cut.hi - cut.lo);
      if (r > 0.375 && r < 0.75) near++;
    }
    expect(near).toBeGreaterThanOrEqual(190);
  }, LONG_MS);
});

describe('every claim a note makes is true of its own run, on every seed', () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

  it('the standard error: "close", "about half", "about twice as tightly"', () => {
    let rough = 0;
    for (const seed of SEEDS) {
      const frames = trace({ story: 'standard-error', seed });
      const { sample, means, big, bigMeans } = standardErrorRun(seed);
      const se = standardError(sample);
      const sd = spread(means);
      expect(frames[4].note.includes('about the standard error'), `seed ${seed}`).toBe(closeTo(se, sd));
      expect(frames[4].note.includes('came close to it'), `seed ${seed}`).toBe(closeTo(se, TRUE_SE));
      if (!closeTo(se, TRUE_SE)) rough++;
      expect(frames[5].note.includes('about half'), `seed ${seed}`).toBe(halfish(standardError(big) / se));
      // "About twice as tightly" is said on every seed, so it must hold on every seed.
      expect(spread(bigMeans) / sd, `seed ${seed}`).toBeGreaterThan(0.4);
      expect(spread(bigMeans) / sd, `seed ${seed}`).toBeLessThan(0.6);
      expect(frames[3].note).toContain(`≈ ${fmt(se, 3)}`);
    }
    // Both branches are reachable, so both are worded.
    expect(rough).toBeGreaterThan(0);
    expect(rough).toBeLessThan(SEEDS.length / 2);
  }, LONG_MS);

  it('the intervals: sums that add up, misses that lean high, ± 1 SE far less often right', () => {
    for (const seed of SEEDS) {
      const frames = trace({ story: 'intervals', seed });
      const { two, one } = intervalsRun(seed);
      const first = two[0];
      // x̄ ± 2 SE as the note writes them (x̄ to 2 places, 2 SE to 3) gives the ends it shows.
      const twice = 2 * Number(fmt(first.se, 3));
      expect(frames[1].note, `seed ${seed}`).toContain(`2 SE ≈ ${fmt(twice, 3)} and the interval x̄ ± 2 SE runs from ${fmt(first.xbar - twice, 3)} to ${fmt(first.xbar + twice, 3)}`);
      expect(Math.abs(first.xbar - twice - first.lo)).toBeLessThan(0.002);
      const missed = two.filter((iv) => !iv.caught);
      const high = missed.filter((iv) => iv.xbar > MU).length;
      expect(frames[3].note.includes('misses landed high'), `seed ${seed}`).toBe(missed.length >= 2 && high > missed.length - high);
      expect(one.filter((iv) => iv.caught).length, `seed ${seed}`).toBeLessThan(two.filter((iv) => iv.caught).length - 5);
    }
  }, LONG_MS);

  it('the bootstrap: "close to the formula", "nearly the same", "about half"', () => {
    for (const seed of SEEDS) {
      const frames = trace({ story: 'bootstrap', seed });
      const { sample, means, cut, bigCut } = bootstrapRun(seed);
      // Said on every seed.
      expect(closeTo(spread(means), standardError(sample)), `seed ${seed}`).toBe(true);
      expect(frames[4].note.includes('nearly the same interval'), `seed ${seed}`).toBe(nearlySame(cut, interval(sample)));
      expect(frames[5].note.includes('about half'), `seed ${seed}`).toBe(halfish((bigCut.hi - bigCut.lo) / (cut.hi - cut.lo)));
    }
  }, LONG_MS);
});

describe('no frame gives its own question’s answer away', () => {
  const PHRASES: Record<string, string[]> = {
    [SHARE_ASK[1]]: ['95%'],
    [MISS_ASK[1]]: ['2 or 3', '2.5'],
    [CHANCE_ASK[1]]: ['either holds', 'fixed number'],
    [MORE_ASK[1]]: ['about as often', 'still about 95'],
    [ONE_SE_ASK[1]]: ['68'],
    [SPREAD_ASK[1]]: ['spread by'],
    [BIGGER_ASK[1]]: ['half'],
    [REPLACE_ASK[0]]: ['exactly x̄'],
    [CENTRE_ASK[0]]: ['around x̄', 'pile up around'],
    [HALF_ASK[1]]: ['half'],
    // n = 25 is on show throughout (the rolls, the readouts); only the dropping is checked.
    [String(DROP)]: ['drop the 25', '25 lowest', '26th'],
  };
  it('in its note or its readouts', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STORY_LIST), seeds, (story, seed) => {
        for (const f of trace({ story, seed })) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => it.value) : []))].join(' \n ').toLowerCase();
          const where = `${story} ${seed}: "${c.question}" (${said})`;
          if (said === 'Yes' || said === 'No') continue;
          const phrases = PHRASES[said] ?? [said];
          for (const phrase of phrases) {
            const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(shown, where).not.toMatch(new RegExp(`(?<![\\d.,])${esc}(?![\\d])`));
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});

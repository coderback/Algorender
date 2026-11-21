// Property tests for densities and the normal distribution (B5 of the math
// and ML path): each density's F is the area under its f, the normal curve
// has area 1 and holds 68–95–99.7% within 1, 2 and 3σ, seeded samples settle
// on the density, and every story draws and asks what the maths says, without
// a note or readout giving away its own frame's answer.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Shape, Vec } from '@/viz/plot/types';
import {
  BAR_WIDTHS,
  binChances,
  boxMuller,
  DENSITIES,
  DENSITY_IDS,
  distributions,
  drawSamples,
  histogram,
  midpointSum,
  MU_RANGE,
  normalCdf,
  normalPdf,
  parseDistributions,
  phi,
  SAMPLE_SIZES,
  SHARES,
  SIGMA_RANGE,
  withinSigmas,
  type DensityId,
  type DistInput,
} from './distributions';
import { createRng } from '@/engine/random';

type Frames = readonly Frame<PlotState>[];
const trace = (input: DistInput) => traceOf(distributions, input).frames;
const good = (frames: Frames) => expectGoodPlotTrace(distributions, frames, { handlesOnStep: false });
const answer = (frames: Frames, i: number) => {
  const c = frames[i].checkpoint!;
  return c.choices[c.answer];
};
const shapeIn = (state: PlotState, id: string, plane = 'plane'): Shape | undefined => planeOf(state, plane).shapes.find((s) => s.id === id);
const range = (min: number, max: number, step: number) => Array.from({ length: Math.round((max - min) / step) + 1 }, (_, k) => Math.round((min + k * step) * 1e6) / 1e6);

function roundTrips(input: DistInput) {
  const custom = distributions.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** Φ at a few points, to 16 digits (from erf tables). */
const PHI: [number, number][] = [
  [-3, 0.0013498980316301],
  [-1.5, 0.0668072012688581],
  [-0.5, 0.3085375387259869],
  [0.25, 0.5987063256829237],
  [1, 0.8413447460685429],
  [2, 0.9772498680518208],
  [3, 0.9986501019683699],
];

/** A few inputs of every story, spread over their ranges. */
const SOME: DistInput[] = [
  { story: 'bars' },
  ...DENSITY_IDS.flatMap((density): DistInput[] => {
    const d = DENSITIES[density];
    const xs = range(d.lo, d.hi, d.step);
    const pick = (k: number) => xs[Math.round(k * (xs.length - 1))];
    const pickIn = ([lo, hi]: readonly [number, number], k: number) => range(lo, hi, d.step)[Math.round(k * Math.round((hi - lo) / d.step))];
    return [
      { story: 'interval', density, a: pick(0), b: pick(1) },
      { story: 'interval', density, a: pick(0.3), b: pick(0.35) },
      { story: 'interval', density, a: pick(0.6), b: pick(0.9) },
      ...[0, 0.2, 0.5, 0.8, 1].map((k): DistInput => ({ story: 'cdf', density, x: pickIn(d.cdf, k) })),
      { story: 'samples', density, seed: 1 },
      { story: 'samples', density, seed: 2024 },
    ];
  }),
  ...range(MU_RANGE.min, MU_RANGE.max, MU_RANGE.step).flatMap((mu) => range(SIGMA_RANGE.min, SIGMA_RANGE.max, SIGMA_RANGE.step).map((sigma): DistInput => ({ story: 'normal', mu, sigma }))),
];

describe('distributions: the maths', () => {
  it('Φ matches the tables, and the normal CDF is Φ of the standard score', () => {
    for (const [z, p] of PHI) expect(Math.abs(phi(z) - p), `Φ(${z})`).toBeLessThan(1e-9);
    expect(phi(0)).toBe(0.5);
    fc.assert(
      fc.property(fc.double({ min: -8, max: 8, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: 0.2, max: 4, noNaN: true }), (x, mu, sigma) => {
        expect(normalCdf(x, mu, sigma)).toBeCloseTo(phi((x - mu) / sigma), 12);
        // Symmetric: Φ(−z) = 1 − Φ(z).
        expect(phi(-x) + phi(x)).toBeCloseTo(1, 12);
      }),
      { numRuns: 200 },
    );
  });

  it('the normal density has area 1, is tallest at μ with height 1/(σ√(2π)), and its slope at μ ± σ is steepest', () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: 0.2, max: 4, noNaN: true }), (mu, sigma) => {
        expect(midpointSum((x) => normalPdf(x, mu, sigma), mu - 12 * sigma, mu + 12 * sigma, 4000)).toBeCloseTo(1, 9);
        expect(normalPdf(mu, mu, sigma)).toBeCloseTo(1 / (sigma * Math.sqrt(2 * Math.PI)), 14);
        for (const s of [0.3, 1, 2]) expect(normalPdf(mu + s * sigma, mu, sigma)).toBeCloseTo(normalPdf(mu - s * sigma, mu, sigma), 14);
        // The area from far left to x, by thin rectangles, is the CDF.
        const x = mu + 0.7 * sigma;
        expect(midpointSum((t) => normalPdf(t, mu, sigma), mu - 10 * sigma, x, 3000)).toBeCloseTo(normalCdf(x, mu, sigma), 6);
      }),
      { numRuns: 100 },
    );
  });

  it('68–95–99.7: the shares within 1, 2 and 3σ, the same for every μ and σ', () => {
    expect(SHARES.map((s) => fmt(s, 4))).toEqual(['0.6827', '0.9545', '0.9973']);
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: 0.2, max: 4, noNaN: true }), fc.integer({ min: 1, max: 3 }), (mu, sigma, k) => {
        expect(normalCdf(mu + k * sigma, mu, sigma) - normalCdf(mu - k * sigma, mu, sigma)).toBeCloseTo(withinSigmas(k), 10);
      }),
      { numRuns: 100 },
    );
  });

  it('every density: F is the area under f from the far left, climbs from 0 to 1, and never falls', () => {
    for (const id of DENSITY_IDS) {
      const d = DENSITIES[id];
      const far = id === 'mix' || id === 'normal' ? -10 : id === 'wait' ? 0 : -1;
      fc.assert(
        fc.property(fc.double({ min: d.x.min, max: d.x.max, noNaN: true }), fc.double({ min: d.x.min, max: d.x.max, noNaN: true }), (x, y) => {
          // The uniform's corners make thin rectangles converge slowly; everything else is smooth.
          expect(Math.abs(midpointSum(d.f, far, x, 20000) - d.F(x)), `${id} at ${x}`).toBeLessThan(id === 'narrow' ? 2e-4 : 1e-6);
          if (x <= y) expect(d.F(x)).toBeLessThanOrEqual(d.F(y) + 1e-15);
          expect(d.f(x)).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 40 },
      );
      expect(d.F(-50)).toBeCloseTo(0, 12);
      expect(d.F(50)).toBeCloseTo(1, 9);
    }
    // The narrow uniform is 2 tall, more than 1, with area 1.
    expect(DENSITIES.narrow.f(0.25)).toBe(2);
    expect(DENSITIES.narrow.F(0.5)).toBe(1);
  });

  it('bins hold the chances F gives, and halving a bin about halves its chance', () => {
    const d = DENSITIES.wait;
    const [p1, p2, p3] = BAR_WIDTHS.map((w) => binChances(d, w, 0, 10));
    expect([p1.length, p2.length, p3.length]).toEqual([10, 20, 40]);
    p1.forEach((p, k) => expect(p2[2 * k] + p2[2 * k + 1]).toBeCloseTo(p, 14));
    for (const ps of [p1, p2, p3]) expect(ps.reduce((s, p) => s + p, 0)).toBeCloseTo(1 - Math.exp(-5), 14);
    for (let k = 0; k < 10; k++) {
      const half = p2[2 * k] / p1[k];
      expect(half).toBeGreaterThan(0.5);
      expect(half).toBeLessThan(0.6);
    }
  });

  it('seeded samples settle on the density', () => {
    const u = createRng(11);
    const zs = Array.from({ length: 20000 }, () => boxMuller(u));
    const mean = zs.reduce((s, z) => s + z, 0) / zs.length;
    const variance = zs.reduce((s, z) => s + (z - mean) ** 2, 0) / zs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(variance - 1)).toBeLessThan(0.04);
    for (const id of DENSITY_IDS) {
      const d = DENSITIES[id];
      const samples = drawSamples(d, 5, 10000);
      expect(drawSamples(d, 5, 10000)).toEqual(samples);
      const h = histogram(d, samples, 10000);
      expect(Math.abs(h.share - (d.F(d.ref[1]) - d.F(d.ref[0])))).toBeLessThan(0.02);
      // Bars count ÷ (n × width): their areas add up to the share inside the plane.
      expect(h.heights.reduce((s, y) => s + y * d.bin, 0)).toBeCloseTo(h.inside, 12);
      expect(h.inside).toBeLessThanOrEqual(1);
      expect(h.inside).toBeGreaterThan(0.99);
      expect(h.gap).toBeLessThan(histogram(d, samples, 10).gap);
    }
  });
});

describe('distributions: the stories', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of distributions.input.examples) {
      const input = ex.make({ seed: 7, size: 0 }) as DistInput;
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [[h.at[0] + h.step, 0], [h.at[0] - h.step, 0], [h.min[0], 0], [h.max[0], 0], [h.at[0] + 3 * h.step, 1], [0, 0], [-100, 0], [100, 0]] as Vec[]) {
              const moved = distributions.input.drag!(input as never, h.id, to) as DistInput;
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
    }
  });

  it('plays inputs across every story, with a fixed frame count and at least three questions per story', () => {
    const counts: Record<string, Set<number>> = {};
    for (const input of SOME) {
      const frames = trace(input);
      good(frames);
      roundTrips(input);
      (counts[input.story] ??= new Set()).add(frames.length);
      expect(frames.filter((f) => f.checkpoint).length, JSON.stringify(input)).toBeGreaterThanOrEqual(3);
    }
    expect(Object.fromEntries(Object.entries(counts).map(([k, s]) => [k, [...s]]))).toEqual({ bars: [6], interval: [5], cdf: [6], normal: [6], samples: [4] });
  });

  it('any interval, on any density, keeps its frames and its handles on the ends', () => {
    fc.assert(
      fc.property(fc.constantFrom<DensityId>(...DENSITY_IDS), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (density, u, v) => {
        const d = DENSITIES[density];
        const xs = range(d.lo, d.hi, d.step);
        const [i, j] = [Math.floor(u * (xs.length - 1)), Math.floor(v * (xs.length - 1))].sort((p, q) => p - q);
        if (i === j) return;
        const input: DistInput = { story: 'interval', density, a: xs[i], b: xs[j] };
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(5);
        const [ha, hb] = planeOf(frames[0].state).handles;
        expect([ha.at[0], hb.at[0]]).toEqual([input.a, input.b]);
        const pa = shapeIn(frames[0].state, 'pa');
        expect(pa?.kind === 'point' && pa.at[0] === input.a).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('refuses inputs outside the stories', () => {
    for (const text of [
      'bars 3',
      'interval wait from 3 to 1',
      'interval wait from 1 to 1',
      'interval wait from 1.25 to 3',
      'interval wait from -1 to 3',
      'interval from 1 to 3',
      'interval normal from -5 to 1',
      'cdf mix at 11',
      'cdf narrow at 0.33',
      'cdf narrow at 0.5',
      'interval narrow from 0.2 to 0.6',
      'cdf wait at 0',
      'normal mu 2 sigma 1',
      'normal mu 0 sigma 0.3',
      'normal mu 0.25 sigma 1',
      'samples mix seed 1.5',
      'samples seed 3',
      'histogram 3',
    ])
      expect(parseDistributions(text), text).toHaveProperty('error');
    expect(parseDistributions('interval normal from −1 to 1')).toEqual({ value: { story: 'interval', density: 'normal', a: -1, b: 1 } });
    expect(parseDistributions('Normal mu -0.5 sigma 1.25')).toEqual({ value: { story: 'normal', mu: -0.5, sigma: 1.25 } });
    // Dragging an end past the other stops one step short of it.
    const input: DistInput = { story: 'interval', density: 'wait', a: 1, b: 3 };
    expect(distributions.input.drag!(input as never, 'a', [5, 0])).toEqual({ ...input, a: 2.5 });
    expect(distributions.input.drag!(input as never, 'b', [0, 0])).toEqual({ ...input, b: 1.5 });
    // σ is dragged as the distance from μ.
    expect(distributions.input.drag!({ story: 'normal', mu: 0.5, sigma: 1 } as never, 'sigma', [2.25, 0])).toEqual({ story: 'normal', mu: 0.5, sigma: 1.5 });
  });

  it('only the samples story uses its seed', () => {
    for (const ex of distributions.input.examples) {
      const made = [1, 2, 3].map((seed) => JSON.stringify(ex.make({ seed, size: 0 })));
      expect(new Set(made).size, ex.id).toBe(ex.id === 'samples' ? 3 : 1);
    }
  });
});

describe('distributions: the answers are what the next frame shows', () => {
  it('bars: halving halves, chance per unit width, a curve 0.5 tall at 0', () => {
    const frames = trace({ story: 'bars' });
    const d = DENSITIES.wait;
    const firsts = BAR_WIDTHS.map((w) => binChances(d, w, 0, 10)[0]);
    expect(answer(frames, 0)).toBe('They get about half as tall');
    expect(firsts[1] / firsts[0]).toBeGreaterThan(0.5);
    expect(firsts[1] / firsts[0]).toBeLessThan(0.6);
    expect(answer(frames, 1)).toBe('Towards 0');
    expect(answer(frames, 2)).toBe(readout(frames[3].state, 'first'));
    expect(answer(frames, 2)).toBe(fmt(firsts[2] / 0.25, 3));
    expect(fmt(firsts[2], 4)).toBe('0.1175');
    expect(answer(frames, 3)).toBe('About as tall');
    // Scaled by their widths, the first bars differ by under a fifth.
    const scaled = firsts.map((p, k) => p / BAR_WIDTHS[k]);
    expect(Math.max(...scaled) / Math.min(...scaled)).toBeLessThan(1.25);
    expect(answer(frames, 4)).toBe(readout(frames[5].state, 'f0'));
    expect(answer(frames, 4)).toBe('0.5');
    // The bars are drawn at the chances, then at chance ÷ width.
    const bars = (i: number, id: string) => {
      const s = shapeIn(frames[i].state, id);
      if (s?.kind !== 'bars') throw new Error(`no ${id}`);
      return s.bars.map((b) => b.y);
    };
    expect(bars(0, 'bars0')[0]).toBeCloseTo(firsts[0], 4);
    expect(bars(3, 'bars2')[0]).toBeCloseTo(firsts[2] / 0.25, 4);
  });

  it('interval: the rectangle, nothing at one value, ends that do not matter, the outside', () => {
    for (const input of SOME) {
      if (input.story !== 'interval') continue;
      const d = DENSITIES[input.density];
      const { a, b } = input;
      const P = d.F(b) - d.F(a);
      const frames = trace(input);
      const asked = (i: number) => frames[i].checkpoint;
      if (asked(0)) expect(answer(frames, 0)).toBe(readout(frames[1].state, 'rect'));
      expect(readout(frames[1].state, 'rect')).toBe(fmt(d.f((a + b) / 2) * (b - a), 3));
      expect(readout(frames[1].state, 'P')).toBe(fmt(P, 4));
      if (asked(1)) expect(answer(frames, 1)).toBe(readout(frames[2].state, 'P'));
      expect(answer(frames, 2)).toBe('The same');
      expect(readout(frames[3].state, 'P')).toBe(readout(frames[3].state, 'Ple'));
      if (asked(3)) expect(answer(frames, 3)).toBe(fmt(Number(readout(frames[4].state, 'out')!.replace('−', '-')), 3));
      // The shaded region sits under the curve, between a and b.
      const region = shapeIn(frames[1].state, 'inside');
      if (region?.kind !== 'path') throw new Error('no region');
      for (const [x, y] of region.points) {
        expect(x).toBeGreaterThanOrEqual(a - 1e-9);
        expect(x).toBeLessThanOrEqual(b + 1e-9);
        expect(y).toBeLessThanOrEqual(Math.max(d.f(x), d.f(x - 1e-9), d.f(x + 1e-9)) + 1e-4);
      }
    }
  });

  it('cdf: F never falls, levels off at 1, has slope f, and leaves 1 − F to the right', () => {
    for (const input of SOME) {
      if (input.story !== 'cdf') continue;
      const d = DENSITIES[input.density];
      const frames = trace(input);
      expect(answer(frames, 0)).toBe('No, never');
      expect(answer(frames, 1)).toBe('Where the density is tallest');
      expect(answer(frames, 2)).toBe('It levels off at 1');
      const F = shapeIn(frames[3].state, 'F', 'cdf');
      if (F?.kind !== 'path') throw new Error('no F');
      F.points.slice(1).forEach((p, i) => expect(p[1]).toBeGreaterThanOrEqual(F.points[i][1]));
      expect(F.points[F.points.length - 1][1]).toBeGreaterThan(0.99);
      if (frames[3].checkpoint) expect(answer(frames, 3)).toBe(readout(frames[4].state, 'fx'));
      expect(readout(frames[4].state, 'fx')).toBe(fmt(d.f(input.x), 3));
      // The slope of F at x, measured, is f(x) (away from the uniform's corners).
      if (!d.breaks.some((b) => Math.abs(b - input.x) < 0.01)) expect((d.F(input.x + 1e-5) - d.F(input.x - 1e-5)) / 2e-5).toBeCloseTo(d.f(input.x), 4);
      const tan = shapeIn(frames[4].state, 'tan', 'cdf');
      expect(tan?.kind === 'line' && tan.through[0] === input.x).toBe(true);
      if (frames[4].checkpoint) expect(answer(frames, 4)).toBe(readout(frames[5].state, 'R'));
      // The handle sits on x, on the point drawn there.
      const h = planeOf(frames[3].state).handles[0];
      const px = shapeIn(frames[3].state, 'px');
      expect(h.at[0]).toBe(input.x);
      expect(px?.kind === 'point' && px.at[0] === input.x).toBe(true);
    }
  });

  it('normal: the peak halves, then 68–95–99.7 for every μ and σ', () => {
    for (const input of SOME) {
      if (input.story !== 'normal') continue;
      const { mu, sigma } = input;
      const frames = trace(input);
      expect(answer(frames, 0)).toBe('It halves');
      const peak = (id: string) => Number(readout(frames[1].state, id));
      expect(peak('peak2') / peak('peak')).toBeCloseTo(0.5, 1);
      expect(answer(frames, 1)).toBe('About 0.68');
      expect(readout(frames[2].state, 's1')).toBe('0.6827');
      expect(answer(frames, 2)).toBe('About 0.95');
      expect(readout(frames[3].state, 's2')).toBe('0.9545');
      expect(answer(frames, 3)).toBe('About 0.997');
      expect(readout(frames[4].state, 's3')).toBe('0.9973');
      expect(answer(frames, 4)).toBe('No: they are the same for every normal curve');
      expect([readout(frames[5].state, 's1'), readout(frames[5].state, 's1w')]).toEqual(['0.6827', '0.6827']);
      // The handles sit on μ and μ + σ, where the points are drawn.
      const [hm, hs] = planeOf(frames[0].state).handles;
      expect([hm.at[0], hs.at[0]]).toEqual([mu, mu + sigma]);
      const f = shapeIn(frames[0].state, 'f');
      if (f?.kind !== 'path') throw new Error('no curve');
      for (const [x, y] of f.points) expect(Math.abs(y - normalPdf(x, mu, sigma))).toBeLessThanOrEqual(5e-5);
    }
  });

  it('samples: total area stays 1, and the answers follow the samples', () => {
    for (const input of SOME) {
      if (input.story !== 'samples') continue;
      const d = DENSITIES[input.density];
      const frames = trace(input);
      const hists = SAMPLE_SIZES.map((n) => histogram(d, drawSamples(d, input.seed, 10000), n));
      expect(answer(frames, 0)).toBe('Still about 1');
      for (const k of [0, 1, 2, 3]) expect(readout(frames[k].state, 'total')).toBe(fmt(hists[k].inside, 3));
      // The bar question gives its bin's count, so its answer is count ÷ (n × width) on every seed,
      // and the next frame works it out the same way.
      const truth = binChances(d, d.bin, d.x.min, d.x.max);
      const top = truth.indexOf(Math.max(...truth));
      const c = hists[2].counts[top];
      expect(c).toBeGreaterThan(0);
      expect(frames[1].checkpoint!.question).toContain(`will hold ${c} of them`);
      expect(answer(frames, 1)).toBe(fmt(c / (1000 * d.bin), 3));
      expect(frames[2].note).toContain(`holds ${c}, so its bar stands`);
      expect(frames[2].note).toContain(`= ${answer(frames, 1)} tall`);
      expect(fmt(hists[2].heights[top], 3)).toBe(answer(frames, 1));
      // The gap question asks what happens as a rule, so it never hangs on the seed.
      expect(answer(frames, 2)).toBe('It shrinks');
    }
  });

  it('samples: no question’s answer hangs on the seed, and a gap that grows is explained', () => {
    const d = DENSITIES.mix;
    let grew = 0;
    for (let seed = 0; seed < 400; seed++) {
      const frames = trace({ story: 'samples', density: 'mix', seed });
      expect([answer(frames, 0), answer(frames, 2)]).toEqual(['Still about 1', 'It shrinks']);
      const hists = SAMPLE_SIZES.map((n) => histogram(d, drawSamples(d, seed, 10000), n));
      // With 10 samples or 100, the total area is still about 1.
      expect(Math.abs(hists[1].inside - 1)).toBeLessThan(0.1);
      if (hists[3].gap >= hists[2].gap) {
        grew++;
        expect(frames[3].note).toContain('this time it grew a little');
      } else expect(frames[3].note).not.toContain('grew');
    }
    // As a rule the gap shrinks: it grows on only a rare seed.
    expect(grew).toBeLessThan(4);
  });
});

describe('distributions: no frame gives its own answer away', () => {
  /** Number tokens in a text, with true minus signs read as minus. */
  const numbers = (text: string) => (text.replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/g) ?? []).map((t) => t.replace('-', '−'));
  /**
   * Numbers a note may mention for their own sake even when one equals an answer: the input's own
   * values (a = 0.3 when the area is 0.3) and the constants in the density's description.
   */
  const given = (input: DistInput) => {
    const own = Object.values(input).filter((v): v is number => typeof v === 'number').map((v) => fmt(v));
    return new Set([...own, ...('density' in input ? numbers(DENSITIES[input.density].intro) : [])]);
  };
  it('neither in the note nor in a readout of the frame that asks', () => {
    const problems: string[] = [];
    for (const input of [...SOME, ...distributions.input.examples.map((e) => e.make({ seed: 7, size: 0 }) as DistInput)]) {
      const free = given(input);
      for (const [i, f] of trace(input).entries()) {
        const c = f.checkpoint;
        if (!c) continue;
        const said = c.choices[c.answer];
        const values = f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((r) => r.value) : []));
        const labels = f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((r) => r.label) : []));
        const where = `${JSON.stringify(input)} frame ${i}: "${c.question}" (${said})`;
        if (/[a-z]{3,}/i.test(said)) {
          if (f.note.toLowerCase().includes(said.toLowerCase())) problems.push(`${where} in the note`);
          if (labels.some((l) => l.toLowerCase().includes(said.toLowerCase()))) problems.push(`${where} in a readout`);
        } else {
          if (!free.has(said) && numbers(f.note).includes(said)) problems.push(`${where} in the note`);
          // F(x) = 0.5 leaves 1 − F(x) = 0.5 too: the readout shows F, not the answer.
          const half = input.story === 'cdf' && said === '0.5';
          if (!free.has(said) && !half && values.includes(said)) problems.push(`${where} in a readout`);
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});

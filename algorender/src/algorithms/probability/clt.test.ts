import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { BarsShape } from '@/viz/plot/types';
import { centralLimitTheorem, histogram, MAX_N, POPULATIONS, simulate, stats, TOTALS, type CltInput, type PopulationId } from './central-limit-theorem';

const POPULATION_IDS = Object.keys(POPULATIONS) as PopulationId[];
const input = fc.record({
  population: fc.constantFrom(...POPULATION_IDS),
  n: fc.integer({ min: 1, max: MAX_N }),
  seed: fc.integer({ min: 0, max: 1_000_000 }),
}) as fc.Arbitrary<CltInput>;

const histogramOf = (frame: { state: Parameters<typeof planeOf>[0] }) =>
  (planeOf(frame.state, 'means').shapes.find((s) => s.id === 'hist') as BarsShape).bars;

describe('central-limit-theorem', () => {
  it('plays every example at several sizes as a good trace, in under 60 frames', () => {
    for (const ex of centralLimitTheorem.input.examples) {
      for (const size of [1, 2, 5, 30]) {
        const frames = traceOf(centralLimitTheorem, ex.make({ seed: 11, size })).frames;
        expectGoodPlotTrace(centralLimitTheorem, frames);
        expect(frames.length).toBeLessThan(60);
      }
    }
  });

  it('counts every mean in the histogram and reports the running totals', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(centralLimitTheorem, inp).frames;
        const { means } = simulate(inp);
        for (const f of frames) {
          const count = Number(readout(f.state, 'count'));
          expect(f.stats.means).toBe(count);
          const bars = histogramOf(f);
          expect(bars.reduce((s, b) => s + b.y, 0)).toBe(count);
          expect(bars.map((b) => b.y)).toEqual(histogram(means.slice(0, count)));
        }
        expect(frames.at(-1)!.stats.means).toBe(TOTALS.at(-1));
      }),
      { numRuns: 40 },
    );
  });

  it('centres the means on μ and spreads them by about σ/√n', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const p = POPULATIONS[inp.population];
        const { means } = simulate(inp);
        const { mean, sd } = stats(means);
        const se = p.sd / Math.sqrt(inp.n);
        expect(Math.abs(mean - p.mean)).toBeLessThan((4 * p.sd) / Math.sqrt(inp.n * means.length));
        if (inp.n >= 5) expect(Math.abs(sd - se) / se).toBeLessThan(0.25);
      }),
      { numRuns: 60 },
    );
  });

  it('draws populations that match their stated mean and spread', () => {
    for (const id of POPULATION_IDS) {
      const p = POPULATIONS[id];
      const { means } = simulate({ population: id, n: 1, seed: 3 });
      const { mean, sd } = stats(means);
      expect(Math.abs(mean - p.mean)).toBeLessThan(0.05);
      expect(Math.abs(sd - p.sd) / p.sd).toBeLessThan(0.1);
      expect(means.every((x) => x >= 0 && x <= 1)).toBe(true);
    }
  });

  it('is reproducible from its seed', () => {
    fc.assert(
      fc.property(input, (inp) => {
        expect(traceOf(centralLimitTheorem, inp).frames).toEqual(traceOf(centralLimitTheorem, inp).frames);
      }),
      { numRuns: 10 },
    );
  });

  it('answers the shape question honestly for n = 1', () => {
    const frames = traceOf(centralLimitTheorem, { population: 'skewed', n: 1, seed: 4 }).frames;
    const asked = frames.find((f) => f.checkpoint?.question.includes('bell'))!;
    expect(asked.checkpoint!.choices[asked.checkpoint!.answer]).toBe('The population’s shape');
    const spread = frames.find((f) => f.checkpoint?.question.includes('spread'))!;
    expect(spread.checkpoint!.choices[spread.checkpoint!.answer]).toBe('About the same');
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = centralLimitTheorem.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    expect(custom!.parse('skewed, n = 10')).toEqual({ value: { population: 'skewed', n: 10, seed: 7 } });
    for (const text of ['', 'normal, n = 5', 'coin', 'coin, n = 0', 'coin, n = 31', 'coin, n = 2.5', 'coin, n = 5, seed = 1, 2']) {
      expect(custom!.parse(text), text).toHaveProperty('error');
    }
  });
});

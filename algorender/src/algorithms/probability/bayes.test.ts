import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PathShape } from '@/viz/plot/types';
import { bayes, posterior, type BayesInput } from './bayes';

const hundredths = (min: number, max: number) => fc.integer({ min, max }).map((k) => k / 100);
const input: fc.Arbitrary<BayesInput> = fc
  .record({ story: fc.constantFrom('disease', 'spam', 'generic' as const), prior: hundredths(1, 99), hit: hundredths(0, 100), fa: hundredths(0, 100) })
  .filter(({ hit, fa }) => hit + fa > 0);

/** Area of an axis-aligned rectangle given as four corners. */
const area = (s: PathShape) => {
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

describe('bayes', () => {
  it('plays every example as a good trace', () => {
    for (const ex of bayes.input.examples) expectGoodPlotTrace(bayes, traceOf(bayes, ex.make({ seed: 0, size: 0 })).frames, { handlesOnStep: false });
  });

  it('matches Bayes’ rule computed directly', () => {
    expect(posterior({ prior: 0.01, hit: 0.9, fa: 0.09 })).toBeCloseTo(0.009 / (0.009 + 0.0891), 12);
    expect(posterior({ prior: 0.2, hit: 0.5, fa: 0.5 })).toBeCloseTo(0.2, 12);
  });

  it('draws areas whose green share of the evidence strip is the posterior', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(bayes, inp).frames;
        expectGoodPlotTrace(bayes, frames, { handlesOnStep: false });
        const full = frames[3].state;
        const shape = (id: string) => planeOf(full).shapes.find((s) => s.id === id) as PathShape;
        const tp = area(shape('h-e'));
        const fp = area(shape('not-h-e'));
        expect(tp).toBeCloseTo(inp.prior * inp.hit, 9);
        expect(fp).toBeCloseTo((1 - inp.prior) * inp.fa, 9);
        // Every region together tiles the unit square.
        const total = ['h-e', 'not-h-e', 'h-not-e', 'not-h-not-e'].reduce((sum, id) => sum + area(shape(id)), 0);
        expect(total).toBeCloseTo(1, 9);
        const zoom = planeOf(frames[4].state, 'zoom').shapes.find((s) => s.id === 'zoom-h') as PathShape;
        expect(area(zoom) / 0.5).toBeCloseTo(tp / (tp + fp), 9);
      }),
      { numRuns: 100 },
    );
  });

  it('asks honestly whether a second piece of evidence raises the chance', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(bayes, inp).frames;
        const asked = frames.find((f) => f.checkpoint?.question.startsWith('Now a second'))!;
        const p1 = posterior(inp);
        const p2 = posterior({ ...inp, prior: p1 });
        const answer = asked.checkpoint!.choices[asked.checkpoint!.answer];
        expect(answer).toBe(p2 > p1 + 1e-9 ? 'Go up' : p2 < p1 - 1e-9 ? 'Go down' : 'Stay the same');
        expect(readout(frames.at(-1)!.state, 'post')).toBeDefined();
      }),
    );
  });

  it('round-trips custom input, reads percentages, and drags each handle onto its number', () => {
    const { custom, drag } = bayes.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
        expect(drag!(inp, 'prior', [0.37, 1]).prior).toBe(0.37);
        if (inp.fa > 0) expect(drag!(inp, 'hit', [0, 0.42]).hit).toBe(0.42);
        if (inp.hit > 0) expect(drag!(inp, 'fa', [0.9, 0.05]).fa).toBe(0.05);
      }),
    );
    expect(custom!.parse('disease: 1%, 90%, 9%')).toEqual({ value: { story: 'disease', prior: 0.01, hit: 0.9, fa: 0.09 } });
    for (const text of ['0.5, 0.5', 'generic: 0, 0.5, 0.5', 'generic: 0.5, 0, 0', 'generic: 0.5, 2, 0.1']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

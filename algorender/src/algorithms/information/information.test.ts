import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, readout, traceOf } from '@/viz/plot/testing';
import { crossEntropy, entropy, entropyModule, MAX_OUTCOMES, reweigh, type EntropyInput } from './entropy';

const dist = (n: number, allowZero: boolean) =>
  fc.array(fc.integer({ min: allowZero ? 0 : 1, max: 20 }), { minLength: n, maxLength: n }).filter((xs) => xs.some((x) => x > 0)).map((xs) => {
    const total = xs.reduce((a, b) => a + b, 0);
    return xs.map((x) => Math.round((x / total) * 1e4) / 1e4);
  });
const input: fc.Arbitrary<EntropyInput> = fc.integer({ min: 2, max: MAX_OUTCOMES }).chain((n) =>
  fc.record({ names: fc.constant(Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))), p: dist(n, true), q: dist(n, true) }),
);

describe('entropy', () => {
  it('knows the textbook values', () => {
    expect(entropy([0.5, 0.25, 0.125, 0.125])).toBeCloseTo(1.75, 12);
    expect(entropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2, 12);
    expect(entropy([1, 0])).toBe(0);
    expect(crossEntropy([0.5, 0.25, 0.125, 0.125], [0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2, 12);
    expect(crossEntropy([0.5, 0.5], [1, 0])).toBe(Infinity);
  });

  it('obeys Gibbs’ inequality: H(P, Q) ≥ H(P), and H(P) ≤ log₂ n', () => {
    fc.assert(
      fc.property(input, ({ p, q }) => {
        expect(crossEntropy(p, q)).toBeGreaterThanOrEqual(entropy(p) - 1e-9);
        expect(entropy(p)).toBeLessThanOrEqual(Math.log2(p.length) + 1e-9);
      }),
    );
  });

  it('plays every example as a good trace', () => {
    for (const ex of entropyModule.input.examples) expectGoodPlotTrace(entropyModule, traceOf(entropyModule, ex.make({ seed: 0, size: 0 })).frames, { handlesOnStep: false });
  });

  it('reports H(P), H(P, Q) and their difference', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(entropyModule, inp).frames;
        expectGoodPlotTrace(entropyModule, frames, { handlesOnStep: false });
        const end = frames.at(-1)!.state;
        const bits = (id: string) => readout(end, id)!.replace(' bits', '').replace('−', '-');
        expect(Number(bits('H'))).toBeCloseTo(entropy(inp.p), 3);
        const ce = crossEntropy(inp.p, inp.q);
        if (Number.isFinite(ce)) {
          expect(Number(bits('CE'))).toBeCloseTo(ce, 3);
          expect(Number(bits('KL'))).toBeCloseTo(ce - entropy(inp.p), 3);
        } else expect(bits('KL')).toBe('∞');
      }),
      { numRuns: 80 },
    );
  });

  it('keeps a dragged distribution summing to 1', () => {
    fc.assert(
      fc.property(input, fc.integer({ min: 0, max: 100 }), ({ p }, v) => {
        const next = reweigh(p, 0, v / 100);
        expect(next[0]).toBe(v / 100);
        expect(next.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
      }),
    );
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = entropyModule.input;
    for (const ex of entropyModule.input.examples) {
      const value = ex.make({ seed: 0, size: 0 });
      const parsed = custom!.parse(custom!.format(value));
      expect(parsed).toEqual({ value: { ...value, p: value.p.map((x) => expect.closeTo(x, 3)), q: value.q.map((x) => expect.closeTo(x, 3)) } });
    }
    for (const text of ['A 1, B 1', 'A 1 | 1', 'A 1, B 1 | 1', 'A 0, B 0 | 1, 1', 'A 1, A 1 | 1, 1']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

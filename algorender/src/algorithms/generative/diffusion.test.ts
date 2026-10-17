import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { alphaBars, distanceToShape, noised, SHAPES, T } from '@/ml/denoiser';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import { dataOf, diffusion, FORWARD_STEPS, MAX_N, MIN_N, reverseOf, type DiffusionInput } from './diffusion';

const input: fc.Arbitrary<DiffusionInput> = fc.record({
  shape: fc.constantFrom(...SHAPES),
  n: fc.integer({ min: MIN_N, max: MAX_N }),
  seed: fc.integer({ min: 0, max: 10_000 }),
});

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('diffusion', () => {
  it('plays every example as a good trace', () => {
    for (const ex of diffusion.input.examples) {
      const frames = traceOf(diffusion, ex.make({ seed: 5, size: 80 })).frames;
      expectGoodPlotTrace(diffusion, frames);
      expect(frames.length).toBeGreaterThan(30);
      expect(frames.length).toBeLessThan(150);
      expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('plays good traces on random inputs, ending at t = 0', () => {
    fc.assert(
      fc.property(input, (i) => {
        const frames = traceOf(diffusion, i).frames;
        expectGoodPlotTrace(diffusion, frames);
        expect(readout(frames.at(-1)!.state, 't')).toBe('0');
        // The lesson's predict challenge asks for five.
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(5);
        expect(planeOf(frames.at(-1)!.state).shapes.filter((s) => s.kind === 'point')).toHaveLength(i.n);
      }),
      { numRuns: 8 },
    );
  });

  it('noises the data by the closed form: mean √ᾱ_t·mean(x₀), spread √(1 − ᾱ_t) around √ᾱ_t·x₀', () => {
    const { x0, eps } = dataOf({ shape: 'ring', n: 3000, seed: 2 });
    for (const t of FORWARD_STEPS) {
      const xt = x0.map((p, i) => noised(p, eps[i], t));
      const a = Math.sqrt(alphaBars[t]);
      const dev = xt.map((p, i) => [p[0] - a * x0[i][0], p[1] - a * x0[i][1]]);
      const variance = mean(dev.map(([dx, dy]) => (dx * dx + dy * dy) / 2));
      expect(Math.abs(variance - (1 - alphaBars[t]))).toBeLessThan(0.08 * (1 - alphaBars[t]) + 1e-9);
      expect(Math.abs(mean(xt.map((p) => p[0])) - a * mean(x0.map((p) => p[0])))).toBeLessThan(0.06);
    }
    // At t = T the cloud is close to N(0, I).
    const last = x0.map((p, i) => noised(p, eps[i], T));
    expect(Math.abs(mean(last.map((p) => p[0] * p[0])) - 1)).toBeLessThan(0.1);
  });

  it('draws the forward frames from the closed form', () => {
    const i: DiffusionInput = { shape: 'spiral', n: 40, seed: 9 };
    const frames = traceOf(diffusion, i).frames;
    const { x0, eps } = dataOf(i);
    const at20 = frames.find((f) => readout(f.state, 'phase') === 'forward' && readout(f.state, 't') === '20')!;
    const p = planeOf(at20.state).shapes.find((s) => s.id === 'd5')!;
    const want = noised(x0[5], eps[5], 20);
    expect(p.kind === 'point' && p.at).toEqual([Math.round(want[0] * 100) / 100 + 0, Math.round(want[1] * 100) / 100 + 0]);
  });

  it('turns fresh noise into points on the shape, far closer than the noise it starts from', () => {
    for (const shape of SHAPES) {
      const { positions } = reverseOf({ shape, n: 150, seed: 3 });
      const start = mean(positions[T].map((p) => distanceToShape(shape, p)));
      const end = mean(positions[0].map((p) => distanceToShape(shape, p)));
      expect(end).toBeLessThan(0.2);
      expect(end).toBeLessThan(start * 0.6);
    }
  });

  it('is deterministic', () => {
    const i: DiffusionInput = { shape: 'moons', n: 50, seed: 21 };
    expect(traceOf(diffusion, i)).toEqual(traceOf(diffusion, i));
  });

  it('round-trips custom input', () => {
    const custom = diffusion.input.custom!;
    fc.assert(
      fc.property(input, (i) => {
        expect(custom.parse(custom.format!(i))).toEqual({ value: i });
      }),
    );
    expect('error' in custom.parse('square, n = 50, seed = 1')).toBe(true);
    expect('error' in custom.parse('ring, n = 5, seed = 1')).toBe(true);
  });

  it('keeps pseudo-code within the code panel', () => {
    for (const line of diffusion.pseudocode) expect(line.length).toBeLessThanOrEqual(42);
  });
});

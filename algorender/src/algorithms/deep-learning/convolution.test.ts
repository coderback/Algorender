import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, readout, traceOf } from '@/viz/plot/testing';
import type { ImagePart, PlotState } from '@/viz/plot/types';
import { convolution, convolve, K, KERNEL_IDS, KERNELS, maxPool, outputSize, PICTURE_IDS, picture, relu, type ConvInput } from './convolution';

/** Convolution straight from the definition: out[i][j] = Σ_{a,b} image[s·i + a][s·j + b] · kernel[a][b]. */
function reference(image: number[][], kernel: number[][], s: number): number[][] {
  const n = image.length;
  const k = kernel.length;
  const out: number[][] = [];
  for (let i = 0; i * s + k <= n; i++) {
    const row: number[] = [];
    for (let j = 0; j * s + k <= n; j++) {
      let sum = 0;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) sum += image[i * s + a][j * s + b] * kernel[a][b];
      row.push(sum);
    }
    out.push(row);
  }
  return out;
}

const rows = (flat: readonly number[], w: number) => Array.from({ length: flat.length / w }, (_, r) => flat.slice(r * w, r * w + w));

const weight = fc.integer({ min: -20, max: 20 }).map((v) => v / 4 + 0);
const kernelArb = fc.array(weight, { minLength: 9, maxLength: 9 });
const inputArb: fc.Arbitrary<ConvInput> = fc.record({
  picture: fc.constantFrom(...PICTURE_IDS),
  kernel: fc.oneof(fc.constantFrom(...KERNEL_IDS).map((id) => [...KERNELS[id]]), kernelArb),
  stride: fc.constantFrom(1 as const, 2 as const),
});

const custom = convolution.input.custom!;
const imageOf = (state: PlotState, id: string) => state.parts.find((p): p is ImagePart => p.kind === 'image' && p.id === id);

describe('convolution', () => {
  it('plays every example as a good trace of a sensible length', () => {
    for (const ex of convolution.input.examples) {
      const frames = traceOf(convolution, ex.make({ seed: 1, size: 0 })).frames;
      expectGoodPlotTrace(convolution, frames);
      expect(frames.length).toBeGreaterThan(20);
      expect(frames.length).toBeLessThan(150);
      expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('plays custom inputs as good traces', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expectGoodPlotTrace(convolution, traceOf(convolution, input).frames);
      }),
      { numRuns: 40 },
    );
  });

  it('matches the definition on random images, kernels and strides', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 9 }).chain((n) =>
          fc.record({
            n: fc.constant(n),
            image: fc.array(fc.integer({ min: 0, max: 4 }).map((v) => v / 4), { minLength: n * n, maxLength: n * n }),
            kernel: kernelArb,
            s: fc.integer({ min: 1, max: 3 }),
          }),
        ),
        ({ n, image, kernel, s }) => {
          const { m, out } = convolve(image, n, kernel, s);
          const want = reference(rows(image, n), rows(kernel, K), s);
          expect(m).toBe(want.length);
          expect(m).toBe(outputSize(n, K, s));
          rows(out, m).forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(want[i][j], 10)));
        },
      ),
    );
  });

  it('sizes the output as ⌊(n − k)/s⌋ + 1', () => {
    expect(outputSize(12, 3, 1)).toBe(10);
    expect(outputSize(12, 3, 2)).toBe(5);
    expect(outputSize(7, 3, 2)).toBe(3);
    expect(outputSize(3, 3, 1)).toBe(1);
  });

  it('applies ReLU and 2×2 max-pooling as defined', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((m) => fc.record({ m: fc.constant(m), map: fc.array(weight, { minLength: m * m, maxLength: m * m }) })),
        ({ m, map }) => {
          const r = relu(map);
          r.forEach((v, k) => expect(v).toBe(map[k] > 0 ? map[k] : 0));
          const { p, out } = maxPool(map, m);
          expect(p).toBe(Math.floor(m / 2));
          const grid = rows(map, m);
          for (let i = 0; i < p; i++)
            for (let j = 0; j < p; j++) expect(out[i * p + j]).toBe(Math.max(grid[2 * i][2 * j], grid[2 * i][2 * j + 1], grid[2 * i + 1][2 * j], grid[2 * i + 1][2 * j + 1]));
        },
      ),
    );
  });

  it('writes the true convolution into the feature map and ends with the pooled map', () => {
    for (const ex of convolution.input.examples) {
      const input = ex.make({ seed: 0, size: 0 });
      const { frames } = traceOf(convolution, input);
      const { n, pixels } = picture(input.picture);
      const { m, out } = convolve(pixels, n, input.kernel, input.stride);
      const feature = frames.map((f) => imageOf(f.state, 'feature')).filter((p) => p !== undefined).at(-1)!;
      expect(feature.values!.every((v) => v !== '')).toBe(true);
      expect(feature.width).toBe(m);
      feature.values!.forEach((v, k) => expect(Number(v.replace('−', '-'))).toBeCloseTo(out[k], 1));
      const last = frames[frames.length - 1].state;
      const pooled = imageOf(last, 'pooled')!;
      const { p, out: want } = maxPool(relu(out), m);
      expect(pooled.width).toBe(p);
      pooled.values!.forEach((v, k) => expect(Number(v)).toBeCloseTo(want[k], 1));
      expect(readout(last, 'size')).toBe(`${m} × ${m}`);
      expect(frames[frames.length - 1].stats.multiplies).toBe(9 * m * m);
    }
  });

  it('answers each prediction with the next frame', () => {
    for (const ex of convolution.input.examples) {
      const input = ex.make({ seed: 0, size: 0 });
      const { frames } = traceOf(convolution, input);
      const { n, pixels } = picture(input.picture);
      const { m, out } = convolve(pixels, n, input.kernel, input.stride);
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        const answer = c.choices[c.answer];
        if (c.question.startsWith('How big')) expect(answer).toBe(`${m} × ${m}`);
        if (c.question.startsWith('Will the sum')) {
          const sum = Number(readout(frames[i + 1].state, 'sum')!.replace('−', '-'));
          expect(answer).toBe(Math.abs(sum) < 0.05 ? 'About zero' : sum > 0 ? 'Positive' : 'Negative');
        }
        if (c.question.startsWith('What will the window write')) expect(answer).toBe(readout(frames[i + 1].state, 'sum'));
        if (c.question.startsWith('Which value')) expect(answer).toBe(frames[i + 1].note.match(/keeps the largest, ([\d.]+)/)?.[1]);
        if (c.question.startsWith('ReLU')) expect(answer).toBe(out.some((v) => v < 0) ? 'Yes' : 'No');
      });
    }
  });

  it('round-trips custom text', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const parsed = custom.parse(custom.format(input));
        expect(parsed).toEqual({ value: input });
      }),
    );
    expect('error' in custom.parse('picture = cat, kernel = blur')).toBe(true);
    expect('error' in custom.parse('picture = square, kernel = [1 2 3]')).toBe(true);
    expect('error' in custom.parse('picture = square, kernel = blur, stride = 3')).toBe(true);
    expect(custom.parse('picture = square, kernel = [-1 0 1; -2 0 2; -1 0 1]')).toEqual({ value: { picture: 'square', kernel: [...KERNELS.vertical], stride: 1 } });
  });

  it('keeps pseudo-code within the panel and is deterministic', () => {
    for (const line of convolution.pseudocode) expect(line.length).toBeLessThanOrEqual(42);
    const input = convolution.input.examples[0].make({ seed: 0, size: 0 });
    expect(JSON.stringify(traceOf(convolution, input).frames)).toBe(JSON.stringify(traceOf(convolution, input).frames));
  });
});

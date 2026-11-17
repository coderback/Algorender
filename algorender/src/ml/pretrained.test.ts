import { describe, expect, it } from 'vitest';
import { distanceToShape, generate, netFromJson, outline, SHAPES, T, type NetJson } from '@/ml/denoiser';
import { trainers, configHash } from '@/ml/train';
import { modelNames, readModelFile } from './weights.node';
import { model } from './weights';

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('pretrained models', () => {
  it('has weights for every trainer, made from its current config, and nothing else', () => {
    expect(modelNames().sort()).toEqual(Object.keys(trainers).sort());
    for (const [name, trainer] of Object.entries(trainers)) {
      const file = readModelFile(name);
      expect(file.name).toBe(name);
      expect(file.hash, `public/models/${name}.json is stale (its trainer's config changed): run npm run models -- ${name}`).toBe(configHash(trainer.config));
      expect(file.config).toEqual(JSON.parse(JSON.stringify(trainer.config)));
      // The fast config is for iterating only: it must differ, or a fast run would look committed.
      expect(configHash(trainer.fast)).not.toBe(configHash(trainer.config));
    }
  });

  it('keeps every model small: each one is fetched whole by the pages that use it', () => {
    for (const name of modelNames()) expect(JSON.stringify(readModelFile(name)).length, name).toBeLessThan(100 * 1024);
  });

  it('turns pure noise into each diffusion shape', () => {
    const net = netFromJson(model<NetJson>('diffusion').weights);
    for (const shape of SHAPES) {
      const curves = outline(shape, 600);
      const { positions } = generate(net, shape, 300, 11);
      const near = (ps: readonly (readonly [number, number])[]) => ps.filter((p) => distanceToShape(shape, p, curves) < 0.25).length / ps.length;
      const after = mean(positions[0].map((p) => distanceToShape(shape, p, curves)));
      // Coverage: every part of the outline has a sample nearby (no collapse onto one bit of the shape).
      const gaps = curves.flat().filter((_, k) => k % 10 === 0).map((q) => Math.min(...positions[0].map((p) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
      expect(after).toBeLessThan(0.2);
      expect(near(positions[0])).toBeGreaterThan(0.8);
      expect(near(positions[0])).toBeGreaterThan(near(positions[T]) + 0.3);
      expect(Math.max(...gaps)).toBeLessThan(0.5);
    }
  });
});

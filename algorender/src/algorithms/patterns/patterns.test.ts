import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { ArrayState } from '@/viz/array/types';
import { patterns } from '.';
import { monotonicStack } from './monotonic-stack';
import { slidingWindow } from './sliding-window';
import { twoPointers } from './two-pointers';

const framesOf = (algo: AnyAlgorithm, input: unknown): Frame<ArrayState>[] => recordTrace<ArrayState>(algo.run(input)).frames;
const lastVars = (frames: Frame<ArrayState>[]) => frames.at(-1)!.vars;

const sortedDistinct = fc
  .uniqueArray(fc.integer({ min: 1, max: 99 }), { minLength: 2, maxLength: 20 })
  .map((a) => [...a].sort((x, y) => x - y));

describe('two pointers', () => {
  it('finds a pair exactly when one exists', () => {
    fc.assert(
      fc.property(sortedDistinct, fc.integer({ min: 2, max: 198 }), (values, target) => {
        const frames = framesOf(twoPointers, { values, target });
        const exists = values.some((a, i) => values.some((b, j) => j > i && a + b === target));
        const found = frames.at(-1)!.state.marks;
        const foundIds = Object.entries(found).filter(([, m]) => m === 'found').map(([id]) => id);
        expect(foundIds.length === 2).toBe(exists);
        if (exists) {
          const [a, b] = foundIds.map((id) => frames.at(-1)!.state.values[id]);
          expect(a + b).toBe(target);
        }
        expect(frames.at(-1)!.stats.comparisons).toBeLessThanOrEqual(values.length - 1);
      }),
      { numRuns: 200 },
    );
  });
});

describe('sliding window', () => {
  it('finds the best window sum', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 1, maxLength: 24 }), fc.nat(), (values, kSeed) => {
        const k = 1 + (kSeed % values.length);
        let best = -Infinity;
        for (let i = 0; i + k <= values.length; i++) best = Math.max(best, values.slice(i, i + k).reduce((a, b) => a + b, 0));
        expect(lastVars(framesOf(slidingWindow, { values, k })).best).toBe(best);
      }),
      { numRuns: 200 },
    );
  });
});

describe('monotonic stack', () => {
  it('computes every next greater value and pushes each value once', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 2, maxLength: 20 }), (values) => {
        const expected = values.map((v, i) => values.slice(i + 1).find((w) => w > v) ?? -1);
        const frames = framesOf(monotonicStack, values);
        const answer = frames.at(-1)!.state.counters.find((c) => c.id === 'answer')!;
        expect([...answer.values]).toEqual(expected);
        expect(frames.at(-1)!.stats.pushes).toBe(values.length);
        expect(frames.at(-1)!.stats.comparisons).toBeLessThanOrEqual(2 * values.length);
      }),
      { numRuns: 200 },
    );
  });
});

describe.each(patterns as AnyAlgorithm[])('$slug', (algo) => {
  const inputs = () =>
    algo.input.examples.flatMap((e) =>
      [algo.input.size!.min, algo.input.size!.default, algo.input.size!.max].map((size) => e.make({ seed: size * 13, size })),
    );

  it('narrates every frame with a real pseudo-code line and well-formed predictions', () => {
    for (const input of inputs()) {
      const frames = framesOf(algo, input);
      frames.forEach((frame, i) => {
        expect(frame.note.length).toBeGreaterThan(0);
        if (frame.line != null) expect(algo.pseudocode[frame.line]?.trim()).toBeTruthy();
        const c = frame.checkpoint;
        if (c) {
          expect(new Set(c.choices).size).toBe(c.choices.length);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(c.choices.length);
          expect(i).toBeLessThan(frames.length - 1);
        }
      });
    }
  });

  it('never duplicates or loses an element in any frame', () => {
    for (const input of inputs()) {
      const n = Array.isArray(input) ? input.length : (input as { values: number[] }).values.length;
      const expected = Array.from({ length: n }, (_, i) => `e${i}`).sort();
      for (const { state } of framesOf(algo, input)) {
        expect(state.lanes.flatMap((l) => l.slots.filter((id): id is string => id != null)).sort()).toEqual(expected);
      }
    }
  });

  it('round-trips its examples through custom text', () => {
    for (const input of inputs()) {
      expect(algo.input.custom!.parse(algo.input.custom!.format(input))).toEqual({ value: input });
    }
  });
});

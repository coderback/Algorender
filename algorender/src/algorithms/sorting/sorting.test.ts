import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recordTrace } from '@/engine/trace';
import { generateArray, ARRAY_PRESETS } from '@/engine/random';
import type { ArrayState } from '@/viz/array/types';
import { algorithms } from '..';

const valuesOf = (state: ArrayState, laneId = 'main') =>
  state.lanes.find((l) => l.id === laneId)!.slots.map((id) => (id == null ? null : state.values[id]));

describe.each(Object.values(algorithms))('$slug', (algo) => {
  const { min, max, maxSize } = algo.input;
  const arrays = fc.array(fc.integer({ min, max }), { minLength: 0, maxLength: maxSize });

  it('ends with the main lane sorted and holding the same values', () => {
    fc.assert(
      fc.property(arrays, (input) => {
        const { frames, truncated } = recordTrace(algo.run(input));
        expect(truncated).toBe(false);
        const last = frames[frames.length - 1].state;
        expect(valuesOf(last)).toEqual([...input].sort((a, b) => a - b));
      }),
      { numRuns: 60 },
    );
  });

  it('never duplicates or loses an element in any frame', () => {
    fc.assert(
      fc.property(arrays, (input) => {
        const expected = input.map((_, i) => `e${i}`).sort();
        for (const { state } of recordTrace(algo.run(input)).frames) {
          const ids = state.lanes.flatMap((l) => l.slots.filter((id): id is string => id != null));
          expect(ids.sort()).toEqual(expected);
        }
      }),
      { numRuns: 30 },
    );
  });

  it('narrates every frame, points at real pseudo-code lines and never lets counters go backwards', () => {
    fc.assert(
      fc.property(arrays, (input) => {
        const { frames } = recordTrace(algo.run(input));
        let prev: Record<string, number> = {};
        for (const frame of frames) {
          expect(frame.note.length).toBeGreaterThan(0);
          if (frame.line != null) {
            expect(frame.line).toBeGreaterThanOrEqual(0);
            expect(frame.line).toBeLessThan(algo.pseudocode.length);
            expect(algo.pseudocode[frame.line].trim()).not.toBe('');
          }
          for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
          prev = frame.stats;
        }
      }),
      { numRuns: 30 },
    );
  });

  it('only tracks the stats it displays, so the panel and the trace agree', () => {
    const { frames } = recordTrace(algo.run(generateArray('random', algo.input.defaultSize, 1, algo.input)));
    expect(Object.keys(frames[0].stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
  });

  it('handles every preset at the maximum size', () => {
    for (const preset of ARRAY_PRESETS) {
      const input = generateArray(preset, maxSize, 7, algo.input);
      const { frames, truncated } = recordTrace(algo.run(input));
      expect(truncated).toBe(false);
      expect(valuesOf(frames[frames.length - 1].state)).toEqual([...input].sort((a, b) => a - b));
    }
  });
});

describe('stability', () => {
  // Stable sorts keep equal values in input order: compare element ids of equal values.
  const stable = Object.values(algorithms).filter((a) => a.content.properties.stable);
  it.each(stable.map((a) => [a.slug, a] as const))('%s keeps equal values in input order', (_, algo) => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: algo.input.min, max: algo.input.min + 3 }), { maxLength: 20 }), (input) => {
        const { frames } = recordTrace(algo.run(input));
        const main = frames[frames.length - 1].state.lanes.find((l) => l.id === 'main')!;
        const order = main.slots.map((id) => Number(id!.slice(1)));
        for (let k = 1; k < order.length; k++) {
          if (input[order[k]] === input[order[k - 1]]) expect(order[k]).toBeGreaterThan(order[k - 1]);
        }
      }),
      { numRuns: 60 },
    );
  });
});

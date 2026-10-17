import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { ArrayState } from '@/viz/array/types';
import { sorting } from '.';

const valuesOf = (state: ArrayState, laneId = 'main') =>
  state.lanes.find((l) => l.id === laneId)!.slots.map((id) => (id == null ? null : state.values[id]));

const traceOf = (algo: (typeof sorting)[number], input: number[]) => recordTrace<ArrayState>(algo.run(input));

// Every sort must handle any non-negative integers, not just what the UI offers.
const arrays = fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 0, maxLength: 24 });

describe.each(sorting)('$slug', (algo) => {
  it('ends with the main lane sorted and holding the same values', () => {
    fc.assert(
      fc.property(arrays, (input) => {
        const { frames, truncated } = traceOf(algo, input);
        expect(truncated).toBe(false);
        expect(valuesOf(frames.at(-1)!.state)).toEqual([...input].sort((a, b) => a - b));
      }),
      { numRuns: 60 },
    );
  });

  it('never duplicates or loses an element in any frame', () => {
    fc.assert(
      fc.property(arrays, (input) => {
        const expected = input.map((_, i) => `e${i}`).sort();
        for (const { state } of traceOf(algo, input).frames) {
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
        let prev: Record<string, number> = {};
        for (const frame of traceOf(algo, input).frames) {
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

  it('asks well-formed predictions that the next frame resolves', () => {
    fc.assert(
      fc.property(arrays, (input) => {
        const frames: Frame<ArrayState>[] = traceOf(algo, input).frames;
        frames.forEach((frame, i) => {
          const c = frame.checkpoint;
          if (!c) return;
          expect(c.choices.length).toBeGreaterThanOrEqual(2);
          expect(new Set(c.choices).size).toBe(c.choices.length);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(c.choices.length);
          expect(i).toBeLessThan(frames.length - 1); // there is a next frame to reveal the answer
          // The question's frame must not give a worded answer away. (Short numeric
          // answers can legitimately appear in the note, e.g. "count[3] is 5".)
          if (c.choices[c.answer].length > 3) expect(frame.note).not.toContain(c.choices[c.answer]);
        });
      }),
      { numRuns: 30 },
    );
  });

  it('only tracks the stats it displays, so the panel and the trace agree', () => {
    const input = algo.input.examples[0].make({ seed: 1, size: algo.input.size!.default });
    expect(Object.keys(traceOf(algo, input).frames[0].stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
  });

  it('sorts every example at every size', () => {
    const { min, max } = algo.input.size!;
    for (const example of algo.input.examples) {
      for (const size of [min, Math.floor((min + max) / 2), max]) {
        const input = example.make({ seed: size * 31, size });
        expect(input).toHaveLength(size);
        expect(valuesOf(traceOf(algo, input).frames.at(-1)!.state)).toEqual([...input].sort((a, b) => a - b));
      }
    }
  });

  it('accepts its own formatted custom input', () => {
    const input = algo.input.examples[0].make({ seed: 5, size: 6 });
    const text = algo.input.custom!.format(input);
    expect(algo.input.custom!.parse(text)).toEqual({ value: input });
  });
});

describe('stability', () => {
  // Stable sorts keep equal values in input order: compare element ids of equal values.
  const stable = sorting.filter((a) => a.content.traits.some((t) => t.label === 'Stable'));
  it('covers the five stable sorts', () => expect(stable).toHaveLength(5));
  it.each(stable.map((a) => [a.slug, a] as const))('%s keeps equal values in input order', (_, algo) => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 5, max: 8 }), { maxLength: 20 }), (input) => {
        const main = traceOf(algo, input).frames.at(-1)!.state.lanes.find((l) => l.id === 'main')!;
        const order = main.slots.map((id) => Number(id!.slice(1)));
        for (let k = 1; k < order.length; k++) {
          if (input[order[k]] === input[order[k - 1]]) expect(order[k]).toBeGreaterThan(order[k - 1]);
        }
      }),
      { numRuns: 60 },
    );
  });
});

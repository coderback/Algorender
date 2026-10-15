import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { ArrayState } from '@/viz/array/types';
import { searching } from '.';
import { TARGET, parseSearch, type SearchInput } from './shared';

type Algo = (typeof searching)[number];

const traceOf = (algo: Algo, input: SearchInput) => recordTrace<ArrayState>(algo.run(input));
const isSorted = (values: readonly number[]) => values.every((v, i) => i === 0 || values[i - 1] <= v);
const sortedAlgos = searching.filter((a) => a.slug !== 'linear-search');
const needsSorted = (algo: Algo) => algo.slug !== 'linear-search';

const mainLane = (state: ArrayState) => state.lanes.find((l) => l.id === 'main')!;

/** Index the trace reports as found (marked "found" in the main lane at the end), or -1. */
function resultOf(frames: Frame<ArrayState>[]): number {
  const state = frames.at(-1)!.state;
  return mainLane(state).slots.findIndex((id) => id != null && state.marks[id] === 'found');
}

// Arrays with repeats and targets that are usually (not always) present.
const unsortedInputs = fc
  .array(fc.integer({ min: 0, max: 30 }), { minLength: 0, maxLength: 24 })
  .chain((values) =>
    fc.record({
      values: fc.constant(values),
      target: values.length ? fc.oneof(fc.constantFrom(...values), fc.integer({ min: 0, max: 31 })) : fc.integer({ min: 0, max: 31 }),
    }),
  );
const sortedInputs = unsortedInputs.map(({ values, target }) => ({ values: [...values].sort((a, b) => a - b), target }));
const inputsFor = (algo: Algo) => (needsSorted(algo) ? sortedInputs : unsortedInputs);

describe.each(searching)('$slug', (algo) => {
  it('finds the target exactly when it is present', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        const { frames, truncated } = traceOf(algo, input);
        expect(truncated).toBe(false);
        const found = resultOf(frames);
        if (input.values.includes(input.target)) {
          expect(input.values[found]).toBe(input.target);
          if (!needsSorted(algo)) expect(found).toBe(input.values.indexOf(input.target));
        } else {
          expect(found).toBe(-1);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('never moves elements and always shows the target bar once', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        const expected = input.values.map((_, i) => `e${i}`);
        for (const { state } of traceOf(algo, input).frames) {
          expect(mainLane(state).slots).toEqual(expected);
          if (input.values.length === 0) continue;
          const lane = state.lanes.find((l) => l.id === TARGET)!;
          expect(lane.slots.filter((id) => id === TARGET)).toHaveLength(1);
          expect(lane.slots).toHaveLength(input.values.length);
          expect(state.values[TARGET]).toBe(input.target);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('narrates every frame, points at real pseudo-code lines and never lets counters go backwards', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        let prev: Record<string, number> = {};
        for (const frame of traceOf(algo, input).frames) {
          expect(frame.note.trim().length).toBeGreaterThan(0);
          if (frame.line != null) {
            expect(frame.line).toBeGreaterThanOrEqual(0);
            expect(frame.line).toBeLessThan(algo.pseudocode.length);
            expect(algo.pseudocode[frame.line].trim()).not.toBe('');
          }
          for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
          prev = frame.stats;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('asks well-formed predictions that the next frame resolves', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        const frames = traceOf(algo, input).frames;
        frames.forEach((frame, i) => {
          const c = frame.checkpoint;
          if (!c) return;
          expect(c.choices.length).toBeGreaterThanOrEqual(2);
          expect(c.choices.length).toBeLessThanOrEqual(4);
          expect(new Set(c.choices).size).toBe(c.choices.length);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(c.choices.length);
          expect(i).toBeLessThan(frames.length - 1);
          if (c.choices[c.answer].length > 3) expect(frame.note).not.toContain(c.choices[c.answer]);
        });
      }),
      { numRuns: 60 },
    );
  });

  it('asks at least one question on its default input, with more than one kind of answer across inputs', () => {
    const answers = new Set<number>();
    for (const example of algo.input.examples) {
      for (const seed of [1, 2, 3]) {
        const frames = traceOf(algo, example.make({ seed, size: algo.input.size!.default })).frames;
        for (const f of frames) if (f.checkpoint) answers.add(f.checkpoint.answer);
      }
    }
    expect(answers.size).toBeGreaterThan(1);
  });

  it('only tracks the stats it displays, so the panel and the trace agree', () => {
    const input = algo.input.examples[0].make({ seed: 1, size: algo.input.size!.default });
    expect(Object.keys(traceOf(algo, input).frames[0].stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
  });

  it('builds and searches every example at several sizes and seeds', () => {
    const { min, max } = algo.input.size!;
    for (const example of algo.input.examples) {
      for (const size of [min, Math.floor((min + max) / 2), max]) {
        for (const seed of [1, 42, size * 31]) {
          const input: SearchInput = example.make({ seed, size });
          expect(input.values).toHaveLength(size);
          for (const v of [...input.values, input.target]) {
            expect(Number.isInteger(v) && v >= 0 && v <= 99).toBe(true);
          }
          if (needsSorted(algo)) expect(isSorted(input.values)).toBe(true);
          const present = input.values.includes(input.target);
          if (example.id === 'absent') expect(present).toBe(false);
          else expect(present).toBe(true);
          if (example.id === 'first') expect(input.values[0]).toBe(input.target);
          if (example.id === 'last') expect(input.values.at(-1)).toBe(input.target);
          if (example.id === 'duplicates') expect(input.values.filter((v) => v === input.target).length).toBeGreaterThan(1);
          const found = resultOf(traceOf(algo, input).frames);
          expect(found >= 0).toBe(present);
        }
      }
    }
  });

  it('accepts its own formatted custom input', () => {
    for (const example of algo.input.examples) {
      const input = example.make({ seed: 5, size: 7 });
      const text = algo.input.custom!.format(input);
      expect(algo.input.custom!.parse(text)).toEqual({ value: input });
    }
  });

  it('starts with nothing ruled out and no pointers, before any probe', () => {
    const input = algo.input.examples[0].make({ seed: 3, size: 10 });
    const { state, stats } = traceOf(algo, input).frames[0];
    expect(state.pointers).toEqual([]);
    expect(stats.probes).toBe(0);
    for (const id of mainLane(state).slots) expect(state.marks[id!]).toBe('frontier');
  });
});

describe('probe counts', () => {
  const get = (slug: string) => searching.find((a) => a.slug === slug)!;
  const probes = (slug: string, input: SearchInput) => traceOf(get(slug), input).frames.at(-1)!.stats.probes;

  it('binary search needs at most ⌊log₂ n⌋ + 1 probes', () => {
    fc.assert(
      fc.property(sortedInputs, (input) => {
        const n = input.values.length;
        expect(probes('binary-search', input)).toBeLessThanOrEqual(n === 0 ? 0 : Math.floor(Math.log2(n)) + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('linear search probes up to and including the first match', () => {
    fc.assert(
      fc.property(unsortedInputs, (input) => {
        const at = input.values.indexOf(input.target);
        expect(probes('linear-search', input)).toBe(at === -1 ? input.values.length : at + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('jump search needs at most about 2√n + 1 probes', () => {
    fc.assert(
      fc.property(sortedInputs, (input) => {
        const n = input.values.length;
        const m = Math.floor(Math.sqrt(n));
        expect(probes('jump-search', input)).toBeLessThanOrEqual(n === 0 ? 0 : Math.ceil(n / Math.max(1, m)) + m + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('interpolation search crawls on uneven gaps but not on evenly spread values', () => {
    const interp = get('interpolation-search');
    const uneven = interp.input.examples.find((e) => e.id === 'uneven')!.make({ seed: 9, size: 24 });
    const even = { values: Array.from({ length: 24 }, (_, i) => 3 + 4 * i), target: 3 + 4 * 17 };
    expect(probes('interpolation-search', uneven)).toBeGreaterThan(probes('binary-search', uneven));
    expect(probes('interpolation-search', even)).toBe(1);
  });
});

describe('custom input', () => {
  it('rejects unsorted arrays for the sorted searches, with the offending pair', () => {
    for (const algo of sortedAlgos) {
      const parsed = algo.input.custom!.parse('2, 9, 5 → 5');
      expect(parsed).toEqual({ error: expect.stringContaining('9') });
    }
    expect(searching.find((a) => a.slug === 'linear-search')!.input.custom!.parse('2, 9, 5 → 5')).toEqual({
      value: { values: [2, 9, 5], target: 5 },
    });
  });

  it('accepts -> as well as →, and reports missing or bad targets', () => {
    expect(parseSearch('1, 2, 3 -> 2', true)).toEqual({ value: { values: [1, 2, 3], target: 2 } });
    expect(parseSearch('1, 2, 3', true)).toHaveProperty('error');
    expect(parseSearch('1, 2, 3 → ', true)).toHaveProperty('error');
    expect(parseSearch('1, 2, 3 → x', true)).toHaveProperty('error');
    expect(parseSearch('1, 2, 3 → 120', true)).toHaveProperty('error');
    expect(parseSearch(' → 3', true)).toHaveProperty('error');
  });
});

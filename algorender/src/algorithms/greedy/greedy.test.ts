import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Item } from '@/algorithms/dp/knapsack-input';
import type { MeterPart } from '@/viz/grid/types';
import { answerPositions, expectLegendMatchesMarks, expectGoodTrace, expectShortPseudocode, list, table, traceOf } from '@/viz/grid/testing';
import { greedy } from '.';
import { activitySelection, type Activity } from './activity-selection';
import { knapsackGreedy } from './knapsack-greedy';

// ───────────────────────────── references ─────────────────────────────

const overlaps = (a: Activity, b: Activity) => a.start < b.finish && b.start < a.finish;

/** Largest set of pairwise compatible activities, by trying every subset. */
function bruteMaxActivities(acts: Activity[]): number {
  let best = 0;
  for (let mask = 0; mask < 1 << acts.length; mask++) {
    const picked = acts.filter((_, k) => mask & (1 << k));
    if (picked.every((a, x) => picked.every((b, y) => x === y || !overlaps(a, b)))) best = Math.max(best, picked.length);
  }
  return best;
}

/** Fractional knapsack optimum, computed independently as an LP solved by trying fill orders from best ratio down. */
function fractionalOptimum(items: Item[], W: number): number {
  const sorted = [...items].sort((a, b) => b.v * a.w - a.v * b.w);
  let room = W;
  let value = 0;
  for (const it of sorted) {
    const take = Math.min(it.w, room);
    value += (it.v * take) / it.w;
    room -= take;
  }
  return value;
}

const finalValue = (frames: { vars: Record<string, unknown> }[]) => Number(frames.at(-1)!.vars.value);

// ───────────────────────────── every module ─────────────────────────────

describe.each(greedy)('$slug', (algo) => {
  it('builds every example and replays it with good frames, under the frame cap', () => {
    for (const example of algo.input.examples) {
      for (const seed of [1, 7, 99, 1234]) {
        const { frames, truncated } = traceOf(algo, example.make({ seed, size: 0 }));
        expect(truncated).toBe(false);
        expectGoodTrace(algo, frames);
      }
    }
  });

  it('keeps pseudo-code short enough for the side panel', () => expectShortPseudocode(algo));

  it('lists exactly the marks it uses in its legend', () => expectLegendMatchesMarks(algo));

  it('has a legend that starts with the neutral state, and experiments that name real examples', () => {
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(algo.input.examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('varies where the right answer sits among the choices', () => {
    const positions = new Set<number>();
    for (const example of algo.input.examples) for (const p of answerPositions(traceOf(algo, example.make({ seed: 3, size: 0 })).frames)) positions.add(p);
    expect(positions.size).toBeGreaterThan(1);
  });

  it('accepts its own formatted custom input', () => {
    for (const example of algo.input.examples) {
      const input = example.make({ seed: 11, size: 0 });
      expect(algo.input.custom!.parse(algo.input.custom!.format(input))).toEqual({ value: input });
    }
  });
});

// ───────────────────────────── correctness ─────────────────────────────

describe('activity-selection', () => {
  const activity = fc
    .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 1, max: 8 }))
    .map(([start, len]) => ({ start, finish: Math.min(24, start + len) }));
  const activities = fc.array(activity, { minLength: 1, maxLength: 10 });

  it('chooses a largest set of non-overlapping activities', () => {
    fc.assert(
      fc.property(activities, (acts) => {
        const { frames, truncated } = traceOf(activitySelection, acts);
        expect(truncated).toBe(false);
        const chosen = list(frames.at(-1)!.state, 'chosen').items.map((it) => acts[Number(it.id.slice(1))]);
        expect(chosen).toHaveLength(bruteMaxActivities(acts));
        for (let x = 0; x < chosen.length; x++) for (let y = x + 1; y < chosen.length; y++) expect(overlaps(chosen[x], chosen[y])).toBe(false);
        expect(frames.at(-1)!.stats.chosen).toBe(chosen.length);
      }),
      { numRuns: 80 },
    );
  });

  it('narrates random runs properly, including the largest custom input', () => {
    fc.assert(
      fc.property(activities, (acts) => expectGoodTrace(activitySelection, traceOf(activitySelection, acts).frames)),
      { numRuns: 30 },
    );
    const big = Array.from({ length: 12 }, (_, k) => ({ start: k * 2, finish: Math.min(24, k * 2 + 3) }));
    expectGoodTrace(activitySelection, traceOf(activitySelection, big).frames);
  });

  it('shows rows sorted by finish time once sorted', () => {
    const input = activitySelection.input.examples[0].make({ seed: 1, size: 0 });
    const { frames } = traceOf(activitySelection, input);
    const rows = table(frames[1].state).rows.map((r) => input[Number(r.id.slice(1))].finish);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it('rejects malformed custom input', () => {
    const parse = activitySelection.input.custom!.parse;
    expect(parse('')).toHaveProperty('error');
    expect(parse('4-1')).toHaveProperty('error');
    expect(parse('3-3')).toHaveProperty('error');
    expect(parse('1-30')).toHaveProperty('error');
    expect(parse('1 to 4')).toHaveProperty('error');
    expect(parse(Array(13).fill('1-2').join(','))).toHaveProperty('error');
    expect(parse('1-4,  3 – 5')).toEqual({ value: [{ start: 1, finish: 4 }, { start: 3, finish: 5 }] });
  });
});

describe('knapsack-greedy', () => {
  const items = fc.array(fc.record({ w: fc.integer({ min: 1, max: 100 }), v: fc.integer({ min: 0, max: 999 }) }), { minLength: 1, maxLength: 8 });
  const capacity = fc.integer({ min: 1, max: 100 });

  it('reaches the fractional optimum and never overfills the knapsack', () => {
    fc.assert(
      fc.property(items, capacity, (its, W) => {
        const { frames, truncated } = traceOf(knapsackGreedy, { items: its, capacity: W });
        expect(truncated).toBe(false);
        expect(finalValue(frames)).toBeCloseTo(fractionalOptimum(its, W), 1);
        const bag = frames.at(-1)!.state.parts.find((p): p is MeterPart => p.kind === 'meter')!;
        const used = bag.segments.reduce((s, x) => s + x.amount, 0);
        expect(used).toBeLessThanOrEqual(W + 1e-9);
        // Full, unless everything fit.
        const total = its.reduce((s, it) => s + it.w, 0);
        expect(used).toBeCloseTo(Math.min(W, total), 9);
      }),
      { numRuns: 80 },
    );
  });

  it('beats every other feasible fractional packing', () => {
    fc.assert(
      fc.property(items, capacity, fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 8, maxLength: 8 }), (its, W, fractions) => {
        // Scale random fractions down until they fit, then compare values.
        const weight = its.reduce((s, it, k) => s + it.w * fractions[k], 0);
        const scale = weight > W ? W / weight : 1;
        const other = its.reduce((s, it, k) => s + it.v * fractions[k] * scale, 0);
        expect(finalValue(traceOf(knapsackGreedy, { items: its, capacity: W }).frames)).toBeGreaterThanOrEqual(other - 0.01);
      }),
      { numRuns: 80 },
    );
  });

  it('narrates random runs properly', () => {
    fc.assert(
      fc.property(items, capacity, (its, W) => expectGoodTrace(knapsackGreedy, traceOf(knapsackGreedy, { items: its, capacity: W }).frames)),
      { numRuns: 30 },
    );
  });
});

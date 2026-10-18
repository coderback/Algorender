import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { ArrayState } from '@/viz/array/types';
import { ALGORITHMS } from './algorithms';
import { frameBefore, makeRound, movesOf, order, sameSwap, SUPPORTED, valuesAfter } from './moves';

const PRESETS = ['random', 'nearly-sorted', 'reversed', 'few-unique', 'sorted'];

describe('be the algorithm: moves from a trace', () => {
  for (const slug of SUPPORTED) {
    const { module } = ALGORITHMS[slug];
    it(`${slug} changes its array only by swaps, and replaying the swaps sorts the input`, () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 10 }), fc.integer({ min: 0, max: 2 ** 31 - 1 }), fc.constantFrom(...PRESETS), (size, seed, preset) => {
          const example = module.input.examples.find((e) => e.id === preset)!;
          const input = example.make({ seed, size }) as number[];
          const frames = recordTrace(module.run(input) as Generator<Frame<ArrayState>>).frames;
          const moves = movesOf(frames);
          // Apply the moves to the starting order: the result is the trace's final order.
          const slots = [...order(frames[0].state)];
          for (const m of moves) {
            const i = slots.indexOf(m.a);
            const j = slots.indexOf(m.b);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(j).toBeGreaterThanOrEqual(0);
            [slots[i], slots[j]] = [slots[j], slots[i]];
          }
          const last = frames.at(-1)!.state;
          expect(slots).toEqual(order(last));
          const values = slots.map((id) => last.values[id!]);
          expect(values).toEqual([...input].sort((a, b) => a - b));
          // Every move's frame comes after the one before it.
          moves.forEach((m, k) => expect(m.after).toBeGreaterThan(k === 0 ? 0 : moves[k - 1].after));
        }),
        { numRuns: 80 },
      );
    });
  }

  it('rejects a trace whose array changes by more than one swap', () => {
    const { frames } = makeRound(ALGORITHMS['bubble-sort'].module, 3, 5);
    const state = frames[0].state;
    const [a, b, c] = order(state) as string[];
    const rotated: ArrayState = { ...state, lanes: state.lanes.map((l) => ({ ...l, slots: [b, c, a, ...l.slots.slice(3)] })) };
    expect(() => movesOf([frames[0], { ...frames[0], state: rotated }])).toThrow(/more than one swap/);
  });

  it('accepts the algorithm’s swap, or a swap of an equal value that leaves the same order', () => {
    const state: ArrayState = {
      values: { e0: 5, e1: 3, e2: 5, e3: 1 },
      lanes: [{ id: 'main', label: 'Array', slots: ['e0', 'e1', 'e2', 'e3'] }],
      marks: {},
      pointers: [],
      ranges: [],
      counters: [],
      digitPlace: null,
    };
    const move = { after: 1, a: 'e0', b: 'e3' };
    expect(valuesAfter(state, ['e0', 'e3'])).toEqual([1, 3, 5, 5]);
    expect(sameSwap(state, ['e3', 'e0'], move)).toBe(true);
    expect(sameSwap(state, ['e0', 'e1'], move)).toBe(false);
    // Swapping e2 (also 5) into the last place gives [5, 3, 1, 5]: not the same.
    expect(sameSwap(state, ['e2', 'e3'], move)).toBe(false);
    expect(sameSwap(state, ['e0', 'e0'], move)).toBe(false);
    // Equal values: swapping e0 or e2 with each other changes nothing visible, but a swap of two 5s isn't the move either.
    expect(sameSwap(state, ['e0', 'e2'], { after: 1, a: 'e2', b: 'e0' })).toBe(true);
  });

  it('makes reproducible rounds and steps through them', () => {
    const selection = ALGORITHMS['selection-sort'].module;
    const one = makeRound(selection, 42, 7);
    expect(makeRound(selection, 42, 7)).toEqual(one);
    expect(one.input).toHaveLength(7);
    expect(frameBefore(one, 0)).toBe(0);
    if (one.moves.length) expect(frameBefore(one, 1)).toBe(one.moves[0].after);
  });

  it('has a few moves at size 7 for every algorithm', () => {
    for (const slug of SUPPORTED) {
      const counts = [1, 2, 3, 4, 5].map((seed) => makeRound(ALGORITHMS[slug].module, seed, 7).moves.length);
      expect(Math.max(...counts), slug).toBeGreaterThan(2);
      expect(Math.max(...counts), slug).toBeLessThan(30);
    }
  });
});

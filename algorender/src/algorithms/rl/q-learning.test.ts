import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, traceOf as record } from '@/viz/plot/testing';
import {
  A,
  WORLDS,
  greedyPath,
  index,
  isCliff,
  isState,
  isWall,
  maxQ,
  optimalQ,
  train,
  type Params,
  type QTable,
  type World,
} from './gridworld';
import { formatInput, hugsEdge, parseInput, qLearning, type QInput } from './q-learning';

const traceOf = (...args: Parameters<typeof record>) => record(...args).frames;
const example = (id: string, size = 100, seed = 7) => qLearning.input.examples.find((e) => e.id === id)!.make({ seed, size });

describe('q-learning trace', () => {
  for (const ex of qLearning.input.examples) {
    for (const seed of [1, 7]) {
      it(`${ex.id}, seed ${seed}: a well-formed trace`, () => {
        const frames = traceOf(qLearning, ex.make({ seed, size: 100 }));
        expectGoodPlotTrace(qLearning, frames);
        expect(frames.length).toBeGreaterThan(30);
        expect(frames.length).toBeLessThan(150);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('works at the smallest and largest episode counts', () => {
    for (const size of [qLearning.input.size!.min, qLearning.input.size!.max]) expectGoodPlotTrace(qLearning, traceOf(qLearning, example('maze', size)));
  });

  it('is deterministic', () => {
    expect(JSON.stringify(traceOf(qLearning, example('cliff')))).toBe(JSON.stringify(traceOf(qLearning, example('cliff'))));
  });

  it('keeps pseudo-code within the code panel', () => {
    for (const line of qLearning.pseudocode) expect(line.length).toBeLessThanOrEqual(42);
  });
});

/** Replays training from a zero table, checking every update against the formula. */
function checkUpdates(w: World, p: Params) {
  const { episodes } = train(w, p);
  const q: QTable = new Float64Array(w.width * w.height * A);
  for (const ep of episodes) {
    for (const s of ep.steps) {
      const k = index(w, s.s) * A + s.a;
      expect(s.before).toBe(q[k]);
      expect(isState(w, s.s)).toBe(true);
      expect(isWall(w, s.next)).toBe(false);
      expect(isCliff(w, s.next)).toBe(false);
      const future = s.terminal ? 0 : maxQ(q, index(w, s.next));
      expect(s.future).toBe(future);
      expect(s.target).toBeCloseTo(s.r + p.gamma * future, 12);
      expect(s.after).toBeCloseTo(s.before + p.alpha * (s.target - s.before), 12);
      q[k] = s.after;
    }
    expect(Array.from(ep.q)).toEqual(Array.from(q));
    expect(ep.steps.length).toBeLessThanOrEqual(w.maxSteps);
  }
}

describe('Q-learning', () => {
  it('makes every update Q ← Q + α(r + γ·max Q(s′) − Q), and never enters a wall or the cliff', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(WORLDS)),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 0.99, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.nat(1000),
        (w, alpha, gamma, epsilon, seed) => {
          checkUpdates(w, { alpha, gamma, epsilon, episodes: 15, seed });
        },
      ),
      { numRuns: 30 },
    );
  });

  it('value iteration satisfies the Bellman equation', () => {
    for (const w of Object.values(WORLDS)) {
      const q = optimalQ(w, 0.9);
      const path = greedyPath(w, q);
      expect(path.end?.good).toBe(true);
      expect(path.loops).toBe(false);
    }
  });

  for (const w of Object.values(WORLDS)) {
    it(`${w.id}: with enough exploration, Q approaches value iteration's Q* along the optimal route`, () => {
      const gamma = 0.9;
      const { q } = train(w, { alpha: 0.5, gamma, epsilon: 0.4, episodes: 3000, seed: 3 });
      const star = optimalQ(w, gamma);
      const best = greedyPath(w, star);
      const learned = greedyPath(w, q);
      expect(learned.cells).toEqual(best.cells);
      for (const cell of best.cells.slice(0, -1)) expect(maxQ(q, index(w, cell))).toBeCloseTo(maxQ(star, index(w, cell)), 3);
    });
  }

  it('learns the short path along the cliff edge with the default settings', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const input = example('cliff', 100, seed);
      const { q } = train(WORLDS.cliff, input);
      const path = greedyPath(WORLDS.cliff, q);
      expect(path.end?.good).toBe(true);
      expect(path.cells.length - 1).toBe(9);
      expect(hugsEdge(WORLDS.cliff, path.cells)).toBe(true);
    }
  });

  it('a patient agent heads for the far +10, a short-sighted one for the near +1', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const far = greedyPath(WORLDS['two-goals'], train(WORLDS['two-goals'], example('two-goals', 100, seed)).q);
      const near = greedyPath(WORLDS['two-goals'], train(WORLDS['two-goals'], example('short-sighted', 100, seed)).q);
      expect(far.end?.label).toBe('+10');
      expect(near.end?.label).toBe('+1');
    }
  });
});

describe('custom input', () => {
  it('round-trips', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('cliff', 'maze', 'two-goals'),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 10, max: 300 }),
        fc.nat(1_000_000),
        (world, a, g, e, episodes, seed) => {
          const input = { world, alpha: a / 100, gamma: g / 100, epsilon: e / 100, episodes, seed } as QInput;
          const parsed = parseInput(formatInput(input));
          expect(parsed).toEqual({ value: input });
        },
      ),
    );
  });

  it('rejects bad input with a reason', () => {
    for (const text of [
      'world = lake, alpha = 0.5, gamma = 0.9, epsilon = 0.1, episodes = 100, seed = 1',
      'world = cliff, alpha = 0.5, gamma = 0.9, epsilon = 0.1, seed = 1',
      'world = cliff, alpha = 2, gamma = 0.9, epsilon = 0.1, episodes = 100, seed = 1',
      'world = cliff, alpha = 0.5, gamma = 1, epsilon = 0.1, episodes = 100, seed = 1',
      'world = cliff, alpha = 0.5, gamma = 0.9, epsilon = 0.1, episodes = 5000, seed = 1',
    ]) {
      expect(parseInput(text)).toHaveProperty('error');
    }
  });
});

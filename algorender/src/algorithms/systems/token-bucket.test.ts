import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { maxAccepted, runBucket } from '@/systems/token-bucket';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PathShape, PointShape } from '@/viz/plot/types';
import { formatTokenBucket, MAX_CAPACITY, MAX_RATE, MAX_REQUESTS, MIN_CAPACITY, parseTokenBucket, PATTERNS, requestTimes, tokenBucket, type TokenBucketInput } from './token-bucket';

const input: fc.Arbitrary<TokenBucketInput> = fc.record({
  capacity: fc.integer({ min: MIN_CAPACITY, max: MAX_CAPACITY }),
  refillRate: fc.constantFrom(0.5, 1, 1.5, 2, 2.5, 3, 4),
  pattern: fc.constantFrom(...PATTERNS),
  seed: fc.integer({ min: 0, max: 100_000 }),
});

const framesOf = (inp: TokenBucketInput) => traceOf(tokenBucket, inp).frames;

describe('token-bucket', () => {
  it('plays every example at several capacities as a good trace', () => {
    for (const ex of tokenBucket.input.examples) {
      for (const size of [MIN_CAPACITY, 4, MAX_CAPACITY]) {
        const frames = framesOf(ex.make({ seed: 3, size }));
        expectGoodPlotTrace(tokenBucket, frames);
        expect(frames.length).toBeLessThanOrEqual(MAX_REQUESTS + 2);
      }
    }
  });

  it('shows one frame per request with the model’s decision, and a tokens path that stays in the bucket', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = framesOf(inp);
        expectGoodPlotTrace(tokenBucket, frames);
        const { decisions } = runBucket(inp, requestTimes(inp));
        expect(frames.length).toBe(decisions.length + 2);
        decisions.forEach((d, i) => {
          const f = frames[i + 1];
          const marker = planeOf(f.state, 'bucket').shapes.find((s) => s.id === `r${i}`) as PointShape;
          expect(marker.mark).toBe(d.accepted ? 'found' : 'reject');
          expect(marker.label).toBe(d.accepted ? '✓' : '✗');
          expect(f.stats.accepted + f.stats.rejected).toBe(i + 1);
        });
        const last = frames.at(-1)!;
        const path = planeOf(last.state, 'bucket').shapes.find((s) => s.id === 'tokens') as PathShape;
        for (const [, y] of path.points) {
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(inp.capacity + 1e-9);
        }
        expect(Number(readout(last.state, 'accepted'))).toBe(decisions.filter((d) => d.accepted).length);
        expect(last.stats.accepted).toBeLessThanOrEqual(maxAccepted(inp, 10));
      }),
      { numRuns: 60 },
    );
  });

  it('asks about close calls only, answering with the model’s decision', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = framesOf(inp);
        const { decisions } = runBucket(inp, requestTimes(inp));
        const questions = frames.filter((f) => f.checkpoint);
        expect(questions.length).toBeLessThanOrEqual(8);
        frames.forEach((f, i) => {
          if (!f.checkpoint) return;
          const d = decisions[i];
          expect(d.before).toBeLessThan(2);
          expect(f.checkpoint.choices[f.checkpoint.answer]).toBe(d.accepted ? 'Accepted' : 'Rejected');
        });
      }),
      { numRuns: 60 },
    );
  });

  it('makes each pattern do what it says', () => {
    const base = { capacity: 4, refillRate: 2, seed: 1 };
    const decided = (pattern: TokenBucketInput['pattern']) => {
      const inp: TokenBucketInput = { ...base, pattern };
      return runBucket(inp, requestTimes(inp)).decisions;
    };
    expect(decided('steady').every((d) => d.accepted)).toBe(true);
    // Each burst of 7 lets 4 through on a full bucket (plus whatever refills in its 0.3 s).
    const bursty = decided('bursty');
    expect(bursty.length).toBe(21);
    expect(bursty.slice(0, 7).filter((d) => d.accepted).length).toBe(4);
    expect(decided('spike').some((d) => !d.accepted)).toBe(true);
    const over = decided('overload');
    expect(over.filter((d) => !d.accepted).length).toBeGreaterThan(0);
    for (const pattern of PATTERNS) {
      for (const refillRate of [0.5, MAX_RATE]) {
        const times = requestTimes({ ...base, refillRate, capacity: MAX_CAPACITY, pattern });
        expect(times.length).toBeGreaterThan(2);
        expect(times.length).toBeLessThanOrEqual(MAX_REQUESTS);
        expect(times).toEqual([...times].sort((a, b) => a - b));
      }
    }
  });

  it('is reproducible, and round-trips custom input while rejecting nonsense', () => {
    fc.assert(
      fc.property(input, (inp) => {
        expect(parseTokenBucket(formatTokenBucket(inp))).toEqual({ value: inp });
      }),
    );
    const inp = tokenBucket.input.examples[2].make({ seed: 8, size: 5 });
    expect(framesOf(inp)).toEqual(framesOf(inp));
    expect(parseTokenBucket('capacity = 4, rate = 2, pattern = bursty')).toEqual({ value: { capacity: 4, refillRate: 2, pattern: 'bursty', seed: 1 } });
    for (const text of ['', 'capacity = 4, rate = 2', 'capacity = 0, rate = 2, bursty', 'capacity = 11, rate = 2, bursty', 'capacity = 2.5, rate = 2, bursty', 'capacity = 4, rate = 9, bursty', 'capacity = 4, bursty', 'capacity = 4, rate = 2, bursty, seed = 1, 2']) {
      expect(parseTokenBucket(text), text).toHaveProperty('error');
    }
  });
});

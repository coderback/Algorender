import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createBucket, maxAccepted, refill, request, runBucket, type BucketConfig } from './token-bucket';

/**
 * The same limiter written as GCRA (the "virtual scheduling" algorithm): a
 * request is allowed if its theoretical arrival time is no more than the
 * burst tolerance ahead of now. It accepts exactly what a full token bucket does.
 */
function gcra({ capacity, refillRate }: BucketConfig, times: readonly number[]): boolean[] {
  const T = 1 / refillRate;
  const tolerance = (capacity - 1) * T;
  let tat = 0;
  return times.map((t) => {
    const due = Math.max(tat, t);
    if (due - t > tolerance + 1e-9) return false;
    tat = due + T;
    return true;
  });
}

const configArb = fc.record({ capacity: fc.integer({ min: 1, max: 8 }), refillRate: fc.constantFrom(0.5, 1, 2, 4, 5, 10) });
/** Request times on a 10 ms grid, so both limiters see the same exact moments. */
const timesArb = fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 60 }).map((xs) => [...xs].sort((a, b) => a - b).map((x) => x / 100));

describe('the token bucket model', () => {
  it('accepts exactly what GCRA accepts', () => {
    fc.assert(
      fc.property(configArb, timesArb, (config, times) => {
        expect(runBucket(config, times).decisions.map((d) => d.accepted)).toEqual(gcra(config, times));
      }),
      { numRuns: 300 },
    );
  });

  it('keeps between 0 and capacity tokens, and never lets more through in a window than a full bucket plus the refill', () => {
    fc.assert(
      fc.property(configArb, timesArb, (config, times) => {
        const { decisions } = runBucket(config, times);
        for (const d of decisions) {
          expect(d.before).toBeGreaterThanOrEqual(0);
          expect(d.before).toBeLessThanOrEqual(config.capacity + 1e-9);
          expect(d.after).toBeCloseTo(d.accepted ? d.before - 1 : d.before, 9);
          if (!d.accepted) expect(d.before).toBeLessThan(1);
        }
        const accepted = decisions.filter((d) => d.accepted).map((d) => d.time);
        for (let i = 0; i < accepted.length; i++) {
          for (let j = i; j < accepted.length; j++) expect(j - i + 1).toBeLessThanOrEqual(maxAccepted(config, accepted[j] - accepted[i]));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('lets a steady stream at or under the refill rate straight through, and a burst only up to capacity', () => {
    const config = { capacity: 3, refillRate: 2 };
    const steady = Array.from({ length: 20 }, (_, k) => k * 0.5);
    expect(runBucket(config, steady).decisions.every((d) => d.accepted)).toBe(true);
    const burst = Array(6).fill(1);
    expect(runBucket(config, burst).decisions.map((d) => d.accepted)).toEqual([true, true, true, false, false, false]);
  });

  it('refills over time without going past capacity, and never changes the state it was given', () => {
    const config = { capacity: 4, refillRate: 2 };
    const empty = { tokens: 0, time: 1 };
    expect(refill(empty, config, 2)).toEqual({ tokens: 2, time: 2 });
    expect(refill(empty, config, 10)).toEqual({ tokens: 4, time: 10 });
    expect(refill(empty, config, 0.5)).toBe(empty);
    const before = { ...empty };
    request(empty, config, 1.5);
    expect(empty).toEqual(before);
    expect(createBucket(config)).toEqual({ tokens: 4, time: 0 });
    expect(maxAccepted(config, 3)).toBe(10);
  });
});

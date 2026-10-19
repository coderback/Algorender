import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DRILL_KINDS,
  LATENCY_NUMBERS,
  SECONDS_PER_DAY,
  drillRound,
  formatBytes,
  formatCount,
  judge,
  makeDrill,
  parseEstimate,
  type Drill,
} from './estimation';

const f = (d: Drill, id: string) => d.facts.find((x) => x.id === id)!.value;

/** Each kind's answer worked out again from its facts alone, independently of the generator. */
function reference(d: Drill): number {
  switch (d.kind) {
    case 'qps':
      return (f(d, 'users') * f(d, 'per')) / SECONDS_PER_DAY;
    case 'peak':
      return ((f(d, 'users') * f(d, 'per')) / SECONDS_PER_DAY) * f(d, 'factor');
    case 'storage':
      return f(d, 'users') * f(d, 'per') * f(d, 'size') * 365 * f(d, 'replicas');
    case 'bandwidth':
      return f(d, 'rate') * f(d, 'size');
    case 'servers':
      return Math.ceil(f(d, 'peak') / (f(d, 'capacity') * f(d, 'target')) - 1e-9);
    case 'cache':
      return f(d, 'items') * f(d, 'hot') * f(d, 'size');
    case 'latency':
      return f(d, 'budget') / f(d, 'each');
  }
}

describe('estimation drills', () => {
  it('are the same for the same seed, and vary with it', () => {
    for (const kind of DRILL_KINDS) {
      expect(makeDrill(kind, 7)).toEqual(makeDrill(kind, 7));
      const questions = new Set(Array.from({ length: 12 }, (_, s) => makeDrill(kind, s).question));
      expect(questions.size, kind).toBeGreaterThan(3);
    }
    expect(drillRound(5)).toEqual(drillRound(5));
  });

  it('give answers that match the facts and the last step of the working', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DRILL_KINDS), fc.integer({ min: 0, max: 100_000 }), (kind, seed) => {
        const d = makeDrill(kind, seed);
        expect(d.kind).toBe(kind);
        expect(d.answer).toBeGreaterThan(0);
        expect(d.answer / reference(d)).toBeCloseTo(1, 9);
        expect(d.steps.at(-1)!.value).toBe(d.answer);
        for (const s of d.steps) {
          expect(s.working.trim()).not.toBe('');
          expect(Number.isFinite(s.value)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('mix every kind into a round before repeating one', () => {
    const round = drillRound(3);
    expect(new Set(round.map((d) => d.kind)).size).toBe(DRILL_KINDS.length);
    expect(new Set(round.map((d) => d.id)).size).toBe(round.length);
  });
});

describe('judging an estimate', () => {
  it('counts within ×2 as spot on, within ×10 as the right order of magnitude, and further as off', () => {
    expect(judge(1000, 1000)).toMatchObject({ verdict: 'spot-on', factor: 1, direction: 'exact' });
    expect(judge(2000, 1000)).toMatchObject({ verdict: 'spot-on', direction: 'high' });
    expect(judge(500, 1000)).toMatchObject({ verdict: 'spot-on', direction: 'low' });
    expect(judge(2001, 1000).verdict).toBe('close');
    expect(judge(10_000, 1000).verdict).toBe('close');
    expect(judge(100, 1000).verdict).toBe('close');
    expect(judge(10_001, 1000).verdict).toBe('off');
    expect(judge(99, 1000).verdict).toBe('off');
    expect(judge(0, 1000).verdict).toBe('off');
    expect(judge(Number.NaN, 1000).verdict).toBe('off');
  });

  it('is symmetric on a log scale', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-3, max: 1e12, noNaN: true }), fc.double({ min: 1.01, max: 1e4, noNaN: true }), (truth, k) => {
        const high = judge(truth * k, truth);
        const low = judge(truth / k, truth);
        expect(high.verdict).toBe(low.verdict);
        expect(high.factor).toBeCloseTo(low.factor, 6);
      }),
    );
  });
});

describe('reading what the learner types', () => {
  const value = (text: string, unit?: Parameters<typeof parseEstimate>[1]) => {
    const r = parseEstimate(text, unit);
    return 'value' in r ? r.value : null;
  };

  it('reads plain numbers, exponents and suffixes', () => {
    expect(value('300000')).toBe(300_000);
    expect(value('300,000')).toBe(300_000);
    expect(value('3e5')).toBe(300_000);
    expect(value('3 × 10^5')).toBe(300_000);
    expect(value('3x10^5')).toBe(300_000);
    expect(value('10^5')).toBe(100_000);
    expect(value('300k')).toBe(300_000);
    expect(value('300 K')).toBe(300_000);
    expect(value('2.5M')).toBe(2_500_000);
    expect(value('2.5 million requests a second')).toBe(2_500_000);
    expect(value('1.2 billion')).toBeCloseTo(1.2e9);
    expect(value('3B')).toBe(3e9);
    expect(value('~500')).toBe(500);
    expect(value('about 40 servers')).toBe(40);
    expect(value('.5')).toBe(0.5);
  });

  it('reads byte sizes, and bits on a byte answer', () => {
    expect(value('40 GB', 'bytes')).toBe(40e9);
    expect(value('40GB', 'bytes')).toBe(40e9);
    expect(value('1.5 TB', 'bytes')).toBe(1.5e12);
    expect(value('2 PB', 'bytes')).toBe(2e15);
    expect(value('500 bytes', 'bytes')).toBe(500);
    expect(value('1 GiB', 'bytes')).toBe(1024 ** 3);
    expect(value('100 MB/s', 'bytes/s')).toBe(100e6);
    expect(value('8 Gbps', 'bytes/s')).toBe(1e9);
  });

  it('explains what it cannot read', () => {
    for (const bad of ['', 'lots', 'k', '-5', '0']) expect(parseEstimate(bad)).toHaveProperty('error');
  });
});

describe('formatting and the latency table', () => {
  it('rounds to three significant figures with words or byte prefixes', () => {
    expect(formatCount(1157.4)).toBe('1,160');
    expect(formatCount(3_500_000)).toBe('3.5 million');
    expect(formatCount(2.5)).toBe('2.5');
    expect(formatBytes(40e9)).toBe('40 GB');
    expect(formatBytes(1.2e6, true)).toBe('1.2 MB/s');
  });

  it('lists the numbers in increasing order, from nanoseconds to a cross-ocean round trip', () => {
    for (let i = 1; i < LATENCY_NUMBERS.length; i++) expect(LATENCY_NUMBERS[i].ns).toBeGreaterThanOrEqual(LATENCY_NUMBERS[i - 1].ns);
    expect(LATENCY_NUMBERS.at(-1)!.ns / LATENCY_NUMBERS.find((n) => n.operation.startsWith('Main memory'))!.ns).toBe(1.5e6);
  });
});

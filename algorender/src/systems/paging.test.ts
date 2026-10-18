import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BELADY_REFS, beladyAnomaly, createPaging, faultsOf, pagingStep, simulatePaging, type ReplacementPolicy } from './paging';

const POLICIES: ReplacementPolicy[] = ['fifo', 'lru', 'opt', 'clock'];

/** The fewest faults any replacement choices can achieve: every choice tried. */
function bruteMinimum(refs: readonly number[], k: number): number {
  const best = (i: number, frames: readonly number[]): number => {
    if (i === refs.length) return 0;
    const p = refs[i];
    if (frames.includes(p)) return best(i + 1, frames);
    if (frames.length < k) return 1 + best(i + 1, [...frames, p]);
    return 1 + Math.min(...frames.map((_, j) => best(i + 1, frames.map((f, m) => (m === j ? p : f)))));
  };
  return best(0, []);
}

/** Naive FIFO and LRU: a list in eviction order. */
function naive(refs: readonly number[], k: number, policy: 'fifo' | 'lru'): boolean[] {
  let list: number[] = [];
  return refs.map((p) => {
    if (list.includes(p)) {
      if (policy === 'lru') list = [...list.filter((x) => x !== p), p];
      return true;
    }
    if (list.length >= k) list = list.slice(1);
    list.push(p);
    return false;
  });
}

/** Naive second chance: a queue where a page with its bit set goes to the back with the bit cleared. */
function naiveClock(refs: readonly number[], k: number): boolean[] {
  let queue: { page: number; bit: boolean }[] = [];
  return refs.map((p) => {
    const held = queue.find((e) => e.page === p);
    if (held) {
      held.bit = true;
      return true;
    }
    if (queue.length >= k) {
      for (;;) {
        const head = queue[0];
        if (!head.bit) break;
        queue = [...queue.slice(1), { page: head.page, bit: false }];
      }
      queue = queue.slice(1);
    }
    queue.push({ page: p, bit: true });
    return false;
  });
}

const refsArb = fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 11 });

describe('page replacement', () => {
  it('shows Bélády’s anomaly: FIFO with 4 frames faults more than with 3', () => {
    expect(faultsOf(BELADY_REFS, 3, 'fifo')).toBe(9);
    expect(faultsOf(BELADY_REFS, 4, 'fifo')).toBe(10);
    expect(beladyAnomaly()).toEqual({ fewer: 9, more: 10, anomaly: true });
    // LRU and OPT are stack algorithms: more frames never hurt them.
    for (const p of ['lru', 'opt'] as const) expect(faultsOf(BELADY_REFS, 4, p)).toBeLessThanOrEqual(faultsOf(BELADY_REFS, 3, p));
  });

  it('gives the textbook counts on 7 0 1 2 0 3 0 4 2 3 0 3 2 with 3 frames', () => {
    const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
    expect(POLICIES.map((p) => faultsOf(refs, 3, p))).toEqual([10, 9, 7, 9]);
  });

  it('matches naive FIFO, LRU and second chance on random strings', () => {
    fc.assert(
      fc.property(refsArb, fc.integer({ min: 1, max: 4 }), (refs, k) => {
        expect(simulatePaging(refs, k, 'fifo').steps.map((s) => s.hit)).toEqual(naive(refs, k, 'fifo'));
        expect(simulatePaging(refs, k, 'lru').steps.map((s) => s.hit)).toEqual(naive(refs, k, 'lru'));
        expect(simulatePaging(refs, k, 'clock').steps.map((s) => s.hit)).toEqual(naiveClock(refs, k));
      }),
      { numRuns: 300 },
    );
  });

  it('makes OPT as good as any choice of victims could be, and no policy beats it', () => {
    fc.assert(
      fc.property(refsArb, fc.integer({ min: 1, max: 3 }), (refs, k) => {
        const opt = faultsOf(refs, k, 'opt');
        expect(opt).toBe(bruteMinimum(refs, k));
        for (const p of POLICIES) expect(faultsOf(refs, k, p)).toBeGreaterThanOrEqual(opt);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps every step consistent: the page ends up in the frame named, and only a full memory evicts', () => {
    fc.assert(
      fc.property(refsArb, fc.integer({ min: 1, max: 4 }), fc.constantFrom(...POLICIES), (refs, k, policy) => {
        const { states, steps, faults, hits } = simulatePaging(refs, k, policy);
        steps.forEach((step, i) => {
          const before = i === 0 ? createPaging(policy, k) : states[i - 1];
          expect(states[i].frames[step.frame]).toBe(step.page);
          expect(step.hit).toBe(before.frames.includes(step.page));
          if (step.evicted != null) expect(before.frames.includes(null)).toBe(false);
          expect(new Set(states[i].frames.filter((f) => f != null)).size).toBe(states[i].frames.filter((f) => f != null).length);
        });
        expect(faults + hits).toBe(refs.length);
      }),
    );
  });

  it('never changes the state it was given', () => {
    const s = createPaging('clock', 2);
    const a = pagingStep(s, 1).state;
    const frozen = structuredClone(a);
    pagingStep(a, 2);
    pagingStep(a, 3);
    expect(a).toEqual(frozen);
    expect(() => createPaging('lru', 0)).toThrow();
  });
});

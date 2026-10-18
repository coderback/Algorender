import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cacheAccess, cacheGet, cachePut, cacheRun, createCache, hitRate, nextVictim, type CacheState, type Policy } from './cache';

/** A naive cache: a list scanned in full on every call, the obviously-right version of each policy. */
function naive(policy: Policy, capacity: number) {
  let entries: { key: string; value: number; uses: number; last: number }[] = [];
  let time = 0;
  const victim = () =>
    [...entries].sort((a, b) => (policy === 'lfu' ? a.uses - b.uses : 0) || a.last - b.last)[0];
  return {
    get(key: string) {
      time++;
      const e = entries.find((x) => x.key === key);
      if (!e) return { hit: false };
      e.uses++;
      e.last = time;
      return { hit: true, value: e.value };
    },
    put(key: string, value: number) {
      time++;
      const e = entries.find((x) => x.key === key);
      if (e) {
        e.value = value;
        e.uses++;
        e.last = time;
        return null;
      }
      let evicted: string | null = null;
      if (entries.length >= capacity) {
        evicted = victim().key;
        entries = entries.filter((x) => x.key !== evicted);
      }
      entries.push({ key, value, uses: 1, last: time });
      return evicted;
    },
    order: () => {
      const sorted = [...entries];
      sorted.sort((a, b) => (policy === 'lfu' ? a.uses - b.uses : 0) || a.last - b.last);
      return sorted.map((e) => e.key);
    },
  };
}

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];
const op = fc.oneof(
  fc.record({ kind: fc.constant('get' as const), key: fc.constantFrom(...KEYS) }),
  fc.record({ kind: fc.constant('put' as const), key: fc.constantFrom(...KEYS), value: fc.integer({ min: 0, max: 99 }) }),
);

describe('the cache model', () => {
  for (const policy of ['lru', 'lfu'] as const) {
    it(`${policy.toUpperCase()} matches a naive implementation on random calls`, () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 4 }), fc.array(op, { maxLength: 60 }), (capacity, ops) => {
          const ref = naive(policy, capacity);
          let s: CacheState = createCache(policy, capacity);
          let hits = 0;
          let misses = 0;
          let evictions = 0;
          for (const o of ops) {
            const before = s;
            if (o.kind === 'get') {
              const r = cacheGet(s, o.key);
              const want = ref.get(o.key);
              expect(r.hit).toBe(want.hit);
              expect(r.value).toBe(want.value);
              if (r.hit) hits++;
              else misses++;
              s = r.state;
            } else {
              const victim = nextVictim(s);
              const r = cachePut(s, o.key, o.value);
              const want = ref.put(o.key, o.value);
              expect(r.evicted?.key ?? null).toBe(want);
              if (want) {
                evictions++;
                // The entry evicted is the one nextVictim promised.
                expect(want).toBe(victim?.key);
              }
              s = r.state;
            }
            // Never changes the state it was given.
            expect(before).not.toBe(s);
            expect(s.entries.map((e) => e.key)).toEqual(ref.order());
            expect(s.entries.length).toBeLessThanOrEqual(capacity);
          }
          expect([s.hits, s.misses, s.evictions]).toEqual([hits, misses, evictions]);
        }),
        { numRuns: 300 },
      );
    });
  }

  it('leaves the state it was given untouched', () => {
    let s = createCache('lfu', 2);
    s = cachePut(s, 'a', 1).state;
    s = cachePut(s, 'b', 2).state;
    const frozen = structuredClone(s);
    cacheGet(s, 'a');
    cachePut(s, 'c', 3);
    cacheAccess(s, 'd', () => 4);
    expect(s).toEqual(frozen);
  });

  it('evicts the least recently used under LRU, and the least used (oldest first) under LFU', () => {
    const fill = (policy: Policy) => {
      let s = createCache(policy, 3);
      for (const k of ['a', 'b', 'c']) s = cachePut(s, k, 0).state;
      s = cacheGet(s, 'a').state;
      s = cacheGet(s, 'a').state;
      s = cacheGet(s, 'b').state;
      return s;
    };
    // LRU order: c (used longest ago), a, b.
    expect(cachePut(fill('lru'), 'd', 0).evicted?.key).toBe('c');
    // LFU: a used 3 times, b twice, c once.
    const lfu = fill('lfu');
    expect(lfu.entries.map((e) => [e.key, e.uses])).toEqual([['c', 1], ['b', 2], ['a', 3]]);
    expect(cachePut(lfu, 'd', 0).evicted?.key).toBe('c');
  });

  it('shows why LRU suffers a scan and LFU does not', () => {
    const hot = ['a', 'a', 'a', 'b', 'b', 'b'];
    const scan = ['x', 'y', 'z'];
    const run = (policy: Policy) => cacheRun(createCache(policy, 3), [...hot, ...scan, 'a', 'b'], () => 0).hits.slice(-2);
    expect(run('lru')).toEqual([false, false]);
    expect(run('lfu')).toEqual([true, true]);
  });

  it('runs read-through accesses and reports the hit rate', () => {
    const { state, hits } = cacheRun(createCache('lru', 2), ['a', 'b', 'a', 'c', 'b', 'a'], (k) => k.charCodeAt(0));
    expect(hits).toEqual([false, false, true, false, false, false]);
    expect(hitRate(state)).toBeCloseTo(1 / 6);
    expect(state.entries.map((e) => e.key)).toEqual(['b', 'a']);
    expect(hitRate(createCache('lru', 1))).toBe(0);
    expect(() => createCache('lru', 0)).toThrow();
  });

  it('gives the same answers one call at a time as in one run', () => {
    fc.assert(
      fc.property(fc.constantFrom<Policy>('lru', 'lfu'), fc.integer({ min: 1, max: 4 }), fc.array(fc.constantFrom(...KEYS), { maxLength: 40 }), (policy, capacity, keys) => {
        let s = createCache(policy, capacity);
        const hits = keys.map((k) => {
          const r = cacheAccess(s, k, () => 0);
          s = r.state;
          return r.hit;
        });
        const bulk = cacheRun(createCache(policy, capacity), keys, () => 0);
        expect(bulk.hits).toEqual(hits);
        expect(bulk.state).toEqual(s);
      }),
    );
  });
});

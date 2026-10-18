import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay } from '@/components/explorer/operations';
import type { Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { cacheGet, cachePut, createCache, type CacheState, type Policy } from '@/systems/cache';
import { list, stateProblems, table } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import { lruCacheStructure as ds } from './lru-cache';

type Model = CacheState<number>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const op = (id: string) => ds.operations.find((o) => o.id === id)!;
const run = (id: string, model: Model, args: Args) => recordOperation<GridState, Model>(op(id).run(deepFreeze(model), args));

function checkFrames(opId: string, frames: readonly Frame<GridState>[]) {
  const spec = op(opId);
  let prev: Record<string, number> = {};
  frames.forEach((frame, i) => {
    expect(frame.note.trim()).not.toBe('');
    if (frame.line != null) {
      expect(frame.line).toBeGreaterThanOrEqual(0);
      expect(spec.pseudocode[frame.line]?.trim()).toBeTruthy();
    }
    expect(Object.keys(frame.stats).sort()).toEqual(ds.stats.map((s) => s.key).sort());
    for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
    prev = frame.stats;
    expect(stateProblems(frame.state)).toEqual([]);
    const c = frame.checkpoint;
    if (c) {
      expect(c.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.answer >= 0 && c.answer < c.choices.length).toBe(true);
      expect(i).toBeLessThan(frames.length - 1);
    }
  });
}

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const call = fc.oneof(
  fc.record({ op: fc.constant('get'), key: fc.constantFrom(...KEYS) }),
  fc.record({ op: fc.constant('put'), key: fc.constantFrom(...KEYS), value: fc.integer({ min: 0, max: 99 }) }),
);

describe('lru-cache', () => {
  it('matches the cache model on random calls, never changing the model it is given, with well-formed frames', () => {
    fc.assert(
      fc.property(fc.constantFrom<Policy>('lru', 'lfu'), fc.integer({ min: 1, max: 4 }), fc.array(call, { maxLength: 25 }), (policy, capacity, calls) => {
        let model = createCache<number>(policy, capacity);
        let want = model;
        for (const c of calls) {
          const args: Args = c.op === 'get' ? { key: c.key } : { key: c.key, value: c.value! };
          const { frames, result } = run(c.op, model, args);
          checkFrames(c.op, frames);
          want = c.op === 'get' ? cacheGet(want, c.key).state : cachePut(want, c.key, c.value!).state;
          expect(result).toEqual(want);
          // The last frame shows the model the operation returns.
          const last = frames[frames.length - 1].state;
          expect(list(last, 'order').items.map((it) => it.id)).toEqual(want.entries.map((e) => `k-${e.key}`));
          expect(table(last, 'map').rows.map((r) => r.label).sort()).toEqual(want.entries.map((e) => e.key).sort());
          model = result!;
        }
      }),
      { numRuns: 120 },
    );
  });

  it('asks hit-or-miss on every get and which key goes on every evicting put, honestly', () => {
    let m = ds.initial[0].make(1);
    const g = run('get', m, { key: 'B' }).frames.find((f) => f.checkpoint)!.checkpoint!;
    expect(g.choices[g.answer]).toBe('Hit');
    const miss = run('get', m, { key: 'Z' }).frames.find((f) => f.checkpoint)!.checkpoint!;
    expect(miss.choices[miss.answer]).toBe('Miss');
    // LRU, full with B oldest: putting D evicts B.
    const p = run('put', m, { key: 'D', value: 4 });
    const q = p.frames.find((f) => f.checkpoint)!.checkpoint!;
    expect(q.choices[q.answer]).toBe('B');
    expect(list(p.frames.at(-1)!.state, 'evicted').items.map((it) => it.text)).toEqual(['B=2']);
    // No question when nothing is evicted: an update, or room to spare.
    m = p.result!;
    expect(run('put', m, { key: 'D', value: 9 }).frames.some((f) => f.checkpoint)).toBe(false);
  });

  it('evicts by use count under LFU', () => {
    const lfu = ds.initial.find((s) => s.id === 'lfu-warm')!.make(1);
    const p = run('put', lfu, { key: 'D', value: 4 });
    const q = p.frames.find((f) => f.checkpoint)!.checkpoint!;
    expect(q.choices[q.answer]).toBe('C');
    expect(p.result!.entries.map((e) => e.key)).toEqual(['D', 'B', 'A']);
  });

  it('starts from well-formed models, reproducibly, and replays operations from the URL', () => {
    for (const start of ds.initial) {
      const m = start.make(4);
      expect(start.make(4)).toEqual(m);
      expect(m.entries.length).toBeLessThanOrEqual(m.capacity);
      expect(stateProblems(ds.snapshot(m))).toEqual([]);
    }
    const ops = parseOps('put:D:4;get:B;get:A', ds);
    expect(ops).toHaveLength(3);
    const { model, applied } = replay(ds, ds.initial[0].make(1), ops);
    expect(applied).toHaveLength(3);
    expect((model as Model).hits).toBe(2);
    expect((model as Model).misses).toBe(1);
    expect(blockedReason(ds, model, { op: 'get', args: { key: 'TOOLONG' } })).toMatch(/Key/);
  });
});

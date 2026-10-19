import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compact,
  contents,
  createLsm,
  flush,
  levelLimit,
  levelSize,
  lsmCompact,
  lsmDelete,
  lsmFlush,
  lsmGet,
  lsmPut,
  manualCompaction,
  mayContain,
  memtableWrite,
  pendingCompaction,
  readAmplification,
  writeAmplification,
  type LsmConfig,
  type LsmState,
} from './lsm';

/** Every structural rule the tree must keep. */
function expectWellFormed(s: LsmState) {
  const sortedUnique = (keys: readonly number[]) => keys.every((k, i) => i === 0 || keys[i - 1] < k);
  expect(sortedUnique(s.memtable.map((e) => e.key))).toBe(true);
  expect(s.memtable.length).toBeLessThan(s.config.memtableCapacity);
  expect(s.levels).toHaveLength(s.config.levels + 1);
  const ids = new Set<string>();
  s.levels.forEach((level, i) => {
    for (const t of level) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.entries.length).toBeGreaterThan(0);
      expect(sortedUnique(t.entries.map((e) => e.key))).toBe(true);
      expect(t.min).toBe(t.entries[0].key);
      expect(t.max).toBe(t.entries.at(-1)!.key);
      // Bloom filters never give a false negative.
      for (const e of t.entries) expect(mayContain(t, e.key, s.config.bloomBits)).toBe(true);
      if (i > 0) expect(t.entries.length).toBeLessThanOrEqual(s.config.tableSize);
    }
    // L0 is newest first; deeper levels are sorted and never overlap.
    if (i === 0) level.forEach((t, j) => j === 0 || expect(level[j - 1].seq).toBeGreaterThan(t.seq));
    else level.forEach((t, j) => j === 0 || expect(level[j - 1].max).toBeLessThan(t.min));
  });
  // Nothing is due after a public call: L0 below its trigger, every level within its limit.
  expect(pendingCompaction(s)).toBeNull();
  for (let i = 1; i < s.config.levels; i++) expect(levelSize(s, i)).toBeLessThanOrEqual(levelLimit(s, i));
}

const KEY = fc.integer({ min: 1, max: 30 });
const call = fc.oneof(
  { weight: 5, arbitrary: fc.record({ op: fc.constant('put' as const), key: KEY, value: fc.integer({ min: 0, max: 9 }) }) },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('delete' as const), key: KEY }) },
  { weight: 3, arbitrary: fc.record({ op: fc.constant('get' as const), key: KEY }) },
  { weight: 1, arbitrary: fc.constant({ op: 'flush' as const }) },
  { weight: 1, arbitrary: fc.constant({ op: 'compact' as const }) },
);
const config: fc.Arbitrary<Partial<LsmConfig>> = fc.record({
  memtableCapacity: fc.integer({ min: 1, max: 5 }),
  l0Trigger: fc.integer({ min: 1, max: 4 }),
  tableSize: fc.integer({ min: 1, max: 5 }),
  level1Limit: fc.integer({ min: 2, max: 10 }),
  ratio: fc.integer({ min: 2, max: 4 }),
  levels: fc.integer({ min: 1, max: 4 }),
  bloomBits: fc.integer({ min: 4, max: 30 }),
});

describe('LSM tree', () => {
  it('answers every get like a plain map, under any mix of writes, flushes and compactions, and stays well formed', () => {
    fc.assert(
      fc.property(config, fc.array(call, { maxLength: 80 }), (cfg, calls) => {
        let s = createLsm(cfg);
        const map = new Map<number, number>();
        for (const c of calls) {
          if (c.op === 'put') {
            s = lsmPut(s, c.key, c.value).state;
            map.set(c.key, c.value);
          } else if (c.op === 'delete') {
            s = lsmDelete(s, c.key).state;
            map.delete(c.key);
          } else if (c.op === 'get') {
            const r = lsmGet(s, c.key);
            expect(r.value).toBe(map.get(c.key) ?? null);
            s = r.state;
          } else if (c.op === 'flush') s = lsmFlush(s).state;
          else s = lsmCompact(s).state;
          expectWellFormed(s);
          expect([...contents(s)]).toEqual([...map].sort((a, b) => a[0] - b[0]));
        }
      }),
      { numRuns: 300 },
    );
  });

  it('never changes the state it is given', () => {
    let s = createLsm();
    for (let k = 1; k <= 30; k++) s = lsmPut(s, (k * 7) % 31, k % 10).state;
    const snapshot = JSON.stringify(s);
    lsmPut(s, 5, 1);
    lsmDelete(s, 7);
    lsmGet(s, 7);
    lsmFlush(s);
    lsmCompact(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('flushes a full memtable into L0 as a sorted table, and merges L0 into L1 at the trigger', () => {
    let s = createLsm({ memtableCapacity: 3, l0Trigger: 2 });
    for (const k of [5, 1, 3]) s = lsmPut(s, k, k).state;
    expect(s.memtable).toEqual([]);
    expect(s.levels[0].map((t) => t.entries.map((e) => e.key))).toEqual([[1, 3, 5]]);
    for (const k of [4, 2]) s = lsmPut(s, k, k).state;
    const r = lsmPut(s, 6, 6);
    expect(r.flushed?.entries.map((e) => e.key)).toEqual([2, 4, 6]);
    expect(r.compactions.map((c) => c.plan.reason)).toEqual(['l0']);
    expect(r.state.levels[0]).toEqual([]);
    expect(r.state.levels[1].flatMap((t) => t.entries.map((e) => e.key))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps the newest version in a merge and drops tombstones only at the bottom', () => {
    let s = createLsm({ memtableCapacity: 2, l0Trigger: 9, levels: 2 });
    s = lsmPut(s, 1, 1).state;
    s = lsmPut(s, 2, 2).state; // T1 = {1, 2}
    s = lsmPut(s, 1, 7).state;
    s = lsmDelete(s, 2).state; // T2 = {1=7, 2=✕}
    const p = manualCompaction(s)!;
    expect(p).toMatchObject({ from: 0, into: 1, inputs: ['T2', 'T1'] });
    const r = compact(s, p);
    const one = r.decisions.find((d) => d.key === 1)!;
    expect(one.winner.value).toBe(7);
    expect(one.shadowed.map((x) => x.entry.value)).toEqual([1]);
    // L2 is empty, so L1 is the bottom for now and the tombstone goes.
    expect(r.decisions.find((d) => d.key === 2)!.dropped).toBe(true);
    expect(r.state.levels[1].flatMap((t) => t.entries)).toEqual([{ key: 1, value: 7 }]);

    // With older data below, the tombstone must stay to hide it.
    let deep = createLsm({ memtableCapacity: 2, l0Trigger: 9, levels: 2 });
    deep = lsmPut(deep, 2, 2).state;
    deep = lsmPut(deep, 3, 3).state;
    deep = lsmCompact(lsmCompact(deep).state).state; // {2, 3} pushed down to L2
    expect(deep.levels[2].flatMap((t) => t.entries.map((e) => e.key))).toEqual([2, 3]);
    // Nothing below overlapped, so each step was a trivial move: nothing rewritten.
    expect(deep.counters.written).toBe(2);
    deep = lsmPut(deep, 1, 1).state;
    deep = lsmPut(deep, 4, 4).state;
    deep = lsmCompact(deep).state; // {1, 4} into L1
    deep = lsmDelete(deep, 2).state;
    deep = lsmPut(deep, 9, 9).state; // flushed: {2=✕, 9}
    const q = compact(deep, manualCompaction(deep)!);
    expect(q.decisions.find((d) => d.key === 2)!.dropped).toBe(false);
    expect(lsmGet(q.state, 2).entry).toEqual({ key: 2, value: null });
    expect(lsmGet(q.state, 2).value).toBeNull();
  });

  it('searches newest to oldest, stops at the first entry, and counts reads and Bloom skips', () => {
    let s = createLsm({ memtableCapacity: 2, l0Trigger: 9 });
    s = lsmPut(s, 10, 1).state;
    s = lsmPut(s, 20, 1).state; // T1 {10, 20}
    s = lsmPut(s, 10, 2).state;
    s = lsmPut(s, 30, 2).state; // T2 {10, 30}
    s = memtableWrite(s, 40, 3);
    expect(lsmGet(s, 40)).toMatchObject({ value: 3, answeredBy: 'memtable', probes: [{ where: 'memtable', result: 'hit' }] });
    const ten = lsmGet(s, 10);
    expect(ten).toMatchObject({ value: 2, answeredBy: 'T2' });
    expect(ten.probes.map((p) => p.where === 'table' && p.table)).toEqual([false, 'T2']);
    const twenty = lsmGet(s, 20);
    expect(twenty.answeredBy).toBe('T1');
    expect(twenty.probes.map((p) => p.where === 'table' && `${p.table}:${p.result}`)).toEqual([false, expect.stringMatching(/^T2:(bloom|false-positive)$/), 'T1:hit']);
    const outside = lsmGet(s, 5);
    expect(outside.value).toBeNull();
    expect(outside.probes.slice(1).map((p) => p.where === 'table' && p.result)).toEqual(['range', 'range']);
    expect(outside.state.counters.probes).toBe(0);
    expect(twenty.state.counters.gets).toBe(1);
    expect(readAmplification(twenty.state)).toBe(twenty.state.counters.probes);
  });

  it('sees Bloom false positives sometimes and skips most absent keys', () => {
    let s = createLsm({ memtableCapacity: 4, l0Trigger: 99, bloomBits: 16 });
    for (let k = 0; k < 40; k += 2) s = lsmPut(s, k, 1).state; // even keys in five L0 tables
    let skips = 0;
    let fps = 0;
    for (let k = 1; k < 40; k += 2) {
      const r = lsmGet(s, k);
      skips += r.state.counters.bloomSkips;
      fps += r.state.counters.falsePositives;
    }
    expect(skips).toBeGreaterThan(0);
    expect(fps).toBeGreaterThan(0);
    expect(skips).toBeGreaterThan(fps);
  });

  it('writes each entry more than once as data sinks, which is write amplification', () => {
    let s = createLsm();
    for (let i = 0; i < 60; i++) s = lsmPut(s, (i * 37) % 97, i % 10).state;
    expect(s.counters.put).toBe(60);
    expect(writeAmplification(s)).toBeGreaterThan(1.5);
    expect(s.levels.slice(2).some((l) => l.length > 0)).toBe(true);
    expect(flush(createLsm()).table).toBeNull();
    expect(manualCompaction(createLsm())).toBeNull();
  });
});

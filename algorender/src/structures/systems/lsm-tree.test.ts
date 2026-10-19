import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay } from '@/components/explorer/operations';
import type { Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { contents, createLsm, lsmCompact, lsmDelete, lsmFlush, lsmGet, lsmPut, type LsmState } from '@/systems/lsm';
import type { MarkKey } from '@/viz/marks';
import { list, marksIn, stateProblems, table } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import { CONFIG, lsmTreeStructure as ds } from './lsm-tree';

type Model = LsmState;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const op = (id: string) => ds.operations.find((o) => o.id === id)!;
const run = (id: string, model: Model, args: Args = {}) => recordOperation<GridState, Model>(op(id).run(deepFreeze(model), args));
const legendMarks = new Set(ds.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : [])));
const usedMarks = new Set<MarkKey>();

function checkFrames(opId: string, frames: readonly Frame<GridState>[]) {
  const spec = op(opId);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThan(40);
  let prev: Record<string, number> = {};
  frames.forEach((frame, i) => {
    expect(frame.note.trim()).not.toBe('');
    if (frame.line != null) expect(spec.pseudocode[frame.line]?.trim()).toBeTruthy();
    expect(Object.keys(frame.stats).sort()).toEqual(ds.stats.map((s) => s.key).sort());
    for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
    prev = frame.stats;
    expect(stateProblems(frame.state)).toEqual([]);
    marksIn(frame.state).forEach((m) => usedMarks.add(m));
    const c = frame.checkpoint;
    if (c) {
      expect(c.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.answer >= 0 && c.answer < c.choices.length).toBe(true);
      expect(i).toBeLessThan(frames.length - 1);
      const answer = c.choices[c.answer];
      if (answer.length > 3) expect(frame.note).not.toContain(answer);
    }
  });
}

/** Keys shown in a level's table rows, in order. */
const levelIds = (state: GridState, level: number) => table(state, `L${level}`).rows.map((r) => r.id);

const KEY = fc.integer({ min: 1, max: 25 });
const call: fc.Arbitrary<{ op: string; key?: number; value?: number }> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ op: fc.constant('put'), key: KEY, value: fc.integer({ min: 0, max: 9 }) }) },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('delete'), key: KEY }) },
  { weight: 3, arbitrary: fc.record({ op: fc.constant('get'), key: KEY }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('flush') }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('compact') }) },
);

describe('lsm-tree', () => {
  it('matches the LSM model on random calls, never changing the model it is given, with well-formed frames', () => {
    fc.assert(
      fc.property(fc.array(call, { maxLength: 40 }), (calls) => {
        let model = createLsm(CONFIG);
        let want = model;
        for (const c of calls) {
          const args: Args = c.op === 'put' ? { key: c.key!, value: c.value! } : c.op === 'delete' || c.op === 'get' ? { key: c.key! } : {};
          if (blockedReason(ds, model, { op: c.op, args })) continue;
          const { frames, result } = run(c.op, model, args);
          checkFrames(c.op, frames);
          want =
            c.op === 'put'
              ? lsmPut(want, c.key!, c.value!).state
              : c.op === 'delete'
                ? lsmDelete(want, c.key!).state
                : c.op === 'get'
                  ? lsmGet(want, c.key!).state
                  : c.op === 'flush'
                    ? lsmFlush(want).state
                    : lsmCompact(want).state;
          expect(result).toEqual(want);
          // The last frame shows the model the operation returns, and the stats match its counters.
          const last = frames[frames.length - 1];
          want.levels.forEach((level, i) => expect(levelIds(last.state, i)).toEqual(level.map((t) => t.id)));
          expect(list(last.state, 'memtable').items.map((it) => it.id)).toEqual(want.memtable.map((e) => `m${e.key}`));
          expect(last.stats).toMatchObject({ written: want.counters.written, probes: want.counters.probes, skips: want.counters.bloomSkips, compactions: want.counters.compactions });
          model = result!;
        }
      }),
      { numRuns: 150 },
    );
    // The legend lists exactly the marks the runs used.
    expect([...usedMarks].sort()).toEqual([...legendMarks].sort());
  });

  it('asks where every get stops, honestly, and narrates the probe order', () => {
    const m = ds.initial.find((s) => s.id === 'levels')!.make(1);
    const keys = [...contents(m).keys()];
    const positions = new Set<number>();
    for (const key of [...keys, 1, 50, 98]) {
      const { frames } = run('get', m, { key });
      const c = frames[0].checkpoint!;
      const r = lsmGet(m, key);
      const want = r.answeredBy === 'memtable' ? 'In the memtable' : (r.answeredBy ?? 'Not found anywhere');
      expect(c.choices[c.answer]).toBe(want);
      positions.add(c.answer);
      expect(list(frames.at(-1)!.state, 'path').items).toHaveLength(r.probes.length);
    }
    expect(positions.size).toBeGreaterThan(2);
  });

  it('stops a get at a tombstone though an older value sits below', () => {
    const m = ds.initial.find((s) => s.id === 'tombstones')!.make(1);
    const r = lsmGet(m, 20);
    expect(r.entry).toEqual({ key: 20, value: null });
    expect(r.answeredBy).not.toBe('memtable');
    // The deleted key's old value is still on disk somewhere below.
    const below = m.levels.flat().filter((t) => t.entries.some((e) => e.key === 20 && e.value !== null));
    expect(below.length).toBeGreaterThan(0);
    const { frames } = run('get', m, { key: 20 });
    expect(frames.at(-1)!.note).toMatch(/tombstone/);
  });

  it('asks which version wins a merge, and which a delete writes', () => {
    let m = createLsm(CONFIG);
    for (const [k, v] of [[1, 1], [2, 2], [3, 3], [4, 4], [1, 5], [2, 6], [7, 7], [8, 8], [1, 9], [9, 9], [10, 0]] as const) m = lsmPut(m, k, v).state;
    const { frames } = run('put', m, { key: 11, value: 1 });
    const q = frames.find((f) => f.checkpoint?.question.includes('Which one wins'))!.checkpoint!;
    expect(q.choices[q.answer]).toBe('1=9 from T3');
    expect(frames.some((f) => f.note.includes('older version'))).toBe(true);
    for (const key of [4, 5]) {
      const d = run('delete', m, { key }).frames[0].checkpoint!;
      expect(d.choices[d.answer]).toMatch(/^A tombstone/);
    }
  });

  it('starts from well-formed models, reproducibly, and replays operations from the URL', () => {
    for (const start of ds.initial) {
      const m = start.make(4);
      expect(start.make(4)).toEqual(m);
      expect(stateProblems(ds.snapshot(m))).toEqual([]);
    }
    const levels = ds.initial[0].make(1);
    expect(levels.levels.slice(0, 3).every((l) => l.length > 0)).toBe(true);
    const ops = parseOps('put:12:3;delete:12;get:12;flush;compact', ds);
    expect(ops).toHaveLength(5);
    const { model, applied } = replay(ds, createLsm(CONFIG), ops);
    expect(applied.length).toBeGreaterThanOrEqual(4);
    expect(lsmGet(model as Model, 12).value).toBeNull();
    expect(blockedReason(ds, createLsm(CONFIG), { op: 'flush', args: {} })).toMatch(/empty/);
    expect(blockedReason(ds, createLsm(CONFIG), { op: 'compact', args: {} })).toMatch(/Nothing/);
    expect(blockedReason(ds, createLsm(CONFIG), { op: 'put', args: { key: 100, value: 1 } })).toMatch(/Key/);
  });

  it('keeps pseudo-code short and its experiments on real starting states', () => {
    for (const o of ds.operations) for (const line of o.pseudocode) expect([...line].length).toBeLessThanOrEqual(40);
    const ids = new Set(ds.initial.map((s) => s.id));
    for (const x of ds.content.experiments) expect(ids.has(x.example)).toBe(true);
    expect(ds.legend[0]).toHaveProperty('neutral');
  });
});

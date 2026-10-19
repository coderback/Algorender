import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, parseOps, replay, serializeOps } from '@/components/explorer/operations';
import type { Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { advance, clientWrite, crash, heal, leaderOf, leaders, partition, restart, serverById, step, type Cluster } from '@/systems/raft';
import { list, marksIn, stateProblems, table } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import type { MarkKey } from '@/viz/marks';
import { caughtUp, raftStructure as ds, splits, UNTIL } from './raft';

type Model = Cluster;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const op = (id: string) => ds.operations.find((o) => o.id === id)!;
const run = (id: string, model: Model, args: Args = {}) => recordOperation<GridState, Model>(op(id).run(deepFreeze(model), args));
const start = (id: string) => ds.initial.find((s) => s.id === id)!.make(1);

function checkFrames(opId: string, frames: readonly Frame<GridState>[]) {
  const spec = op(opId);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(40);
  let prev: Record<string, number> = {};
  frames.forEach((frame, i) => {
    expect(frame.note.trim()).not.toBe('');
    expect(frame.note).not.toMatch(/undefined|NaN|\[object/);
    if (frame.line != null) expect(spec.pseudocode[frame.line]?.trim()).toBeTruthy();
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
      const answer = c.choices[c.answer];
      if (answer.length > 3) expect(frame.note).not.toContain(answer);
    }
  });
}

/** A valid call on this model, picked by `pick`. */
function someCall(m: Model, pick: number): { op: string; args: Args } {
  const ups = m.servers.filter((s) => s.up).map((s) => s.id);
  const downs = m.servers.filter((s) => !s.up).map((s) => s.id);
  const ls = leaders(m).map((s) => s.id);
  const calls: { op: string; args: Args }[] = [
    { op: 'run', args: { until: Object.values(UNTIL)[pick % 4] } },
    { op: 'step', args: {} },
    { op: 'step', args: {} },
  ];
  if (ls.length) calls.push({ op: 'write', args: { value: 'v' + (pick % 10), to: ls[pick % ls.length] } }, { op: 'write', args: { value: 'w', to: ls[0] } });
  if (ups.length > 1) calls.push({ op: 'crash', args: { server: ups[pick % ups.length] } });
  if (downs.length) calls.push({ op: 'restart', args: { server: downs[pick % downs.length] } });
  if (m.groups) calls.push({ op: 'heal', args: {} });
  else calls.push({ op: 'partition', args: { split: splits(m)[pick % splits(m).length] } });
  const usable = calls.filter((c) => blockedReason(ds, m, c) === null);
  return usable[pick % usable.length] ?? { op: 'restart', args: { server: downs[0] } };
}

describe('raft structure', () => {
  it('starts from well-formed clusters, reproducibly', () => {
    for (const s of ds.initial) {
      const m = s.make(4);
      expect(s.make(4)).toEqual(m);
      expect(stateProblems(ds.snapshot(m))).toEqual([]);
    }
    expect(leaderOf(start('fresh-5'))).toBeNull();
    expect(leaderOf(start('steady'))).not.toBeNull();
    expect(leaders(start('split'))).toHaveLength(2);
    expect(leaderOf(start('lagging'))).toBeNull();
  });

  it('runs random operations with well-formed frames, never changing the model it is given', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ds.initial.map((s) => s.id)), fc.integer({ min: 1, max: 500 }), fc.array(fc.nat(1000), { minLength: 1, maxLength: 10 }), (id, seed, picks) => {
        let m = ds.initial.find((s) => s.id === id)!.make(seed);
        for (const pick of picks) {
          const call = someCall(m, pick);
          if (blockedReason(ds, m, call)) continue;
          const { frames, result } = run(call.op, m, call.args);
          checkFrames(call.op, frames);
          // The last frame draws the model the operation returns.
          const last = frames[frames.length - 1].state;
          expect(table(last, 'servers').cells[result.servers[0].id][1]).toBe(String(result.servers[0].term));
          expect(list(last, 'messages').items.map((it) => it.id).sort()).toEqual(result.messages.map((x) => `m${x.id}`).sort());
          m = result;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('agrees with the model for faults and single steps', () => {
    const m = start('steady');
    const l = leaderOf(m)!.id;
    expect(run('crash', m, { server: l }).result).toEqual(crash(m, l));
    expect(run('restart', crash(m, l), { server: l }).result).toEqual(restart(crash(m, l), l));
    expect(run('partition', m, { split: 'S1 S2 | S3 S4 S5' }).result).toEqual(partition(m, [['S1', 'S2'], ['S3', 'S4', 'S5']]));
    expect(run('heal', start('split')).result).toEqual(heal(start('split')));
    expect(run('step', m).result).toEqual(step(m).state);
    const w = run('write', m, { value: 'x', to: l }).result;
    expect(w.servers.find((s) => s.id === l)!.log.at(-1)).toEqual({ term: serverById(m, l).term, value: 'x' });
    expect(clientWrite(m, 'x').state.messages.length).toBeGreaterThan(0);
  });

  it('elects a leader from a fresh cluster and asks honestly who it will be', () => {
    for (const id of ['fresh-5', 'fresh-3', 'lagging']) {
      const { frames, result } = run('run', start(id), { until: UNTIL.leader });
      const q = frames[0].checkpoint!;
      const l = leaderOf(result);
      expect(l).not.toBeNull();
      expect(q.choices[q.answer]).toBe(l!.id);
    }
  });

  it('refuses votes to the server whose log is behind', () => {
    let m = start('lagging');
    const notes: string[] = [];
    for (let i = 0; i < 25; i++) {
      const { frames, result } = run('step', m);
      notes.push(frames.at(-1)!.note);
      m = result;
    }
    // Whoever wins, the lagging server never gets a vote for itself.
    expect(notes.some((n) => /refuses .*behind/.test(n)) || leaderOf(m) !== null).toBe(true);
    expect(leaderOf(advance(m, 1000))!.log.map((e) => e.value)).toEqual(['a', 'b', 'c']);
  });

  it('commits a write on a healthy cluster but not on a minority leader', () => {
    const m = start('steady');
    const l = leaderOf(m)!.id;
    const ok = run('write', m, { value: 'x', to: l });
    expect(ok.frames.find((f) => f.checkpoint)!.checkpoint!.answer).toBe(0);
    expect(ok.frames.at(-1)!.note).toMatch(/is committed/);

    const s = start('split');
    const old = leaders(s).sort((a, b) => a.term - b.term)[0].id;
    const lost = run('write', s, { value: 'y', to: old });
    expect(lost.frames.find((f) => f.checkpoint)!.checkpoint!.answer).toBe(1);
    expect(lost.frames.at(-1)!.note).toMatch(/isn't committed/);

    // Healing makes the stale leader step down; its uncommitted entries go once the new leader writes.
    const caught = run('run', run('heal', lost.result).result, { until: UNTIL.caughtUp });
    expect(caughtUp(caught.result)).toBe(true);
    expect(caught.frames.at(-1)!.note).toMatch(/uncommitted entries past the end/);
    expect(leaders(caught.result)).toHaveLength(1);
    const healed = advance(run('write', caught.result, { value: 'z', to: leaderOf(caught.result)!.id }).result, 300);
    for (const sv of healed.servers) expect(sv.log.map((e) => e.value)).not.toContain('y');
  });

  it('marks leaders, candidates, crashed servers and committed entries, as the legend says', () => {
    const used = new Set<MarkKey>();
    let m = start('fresh-5');
    const calls: { op: string; args: Args }[] = [
      { op: 'step', args: {} },
      { op: 'run', args: { until: UNTIL.leader } },
      { op: 'write', args: { value: 'x' } },
      { op: 'crash', args: {} },
      { op: 'step', args: {} },
      { op: 'run', args: { until: UNTIL.caughtUp } },
    ];
    for (const c of calls) {
      const args: Args = { ...c.args };
      if (c.op === 'write') args.to = leaderOf(m)!.id;
      if (c.op === 'crash') args.server = leaderOf(m)!.id;
      const r = run(c.op, m, args);
      for (const f of r.frames) marksIn(f.state).forEach((x) => used.add(x));
      m = r.result;
    }
    const listed = ds.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
    expect([...used].sort()).toEqual([...listed].sort());
  });

  it('replays operations from the URL and explains what it blocks', () => {
    const m = start('steady');
    const l = leaderOf(m)!.id;
    const calls: { op: string; args: Args }[] = [
      { op: 'write', args: { value: 'x', to: l } },
      { op: 'crash', args: { server: l } },
      { op: 'run', args: { until: UNTIL.leader } },
    ];
    const text = serializeOps(calls, ds);
    const parsed = parseOps(text, ds);
    expect(parsed).toEqual(calls);
    const { model, applied } = replay(ds, m, parsed);
    expect(applied).toHaveLength(3);
    const now = leaderOf(model as Model)!;
    expect(now.id).not.toBe(l);
    expect(now.log.map((e) => e.value)).toEqual(['a', 'b', 'c', 'x']);
    expect(blockedReason(ds, start('fresh-5'), { op: 'write', args: { value: 'x', to: 'S1' } })).toBeTruthy();
    expect(blockedReason(ds, m, { op: 'heal', args: {} })).toMatch(/whole/);
    expect(blockedReason(ds, m, { op: 'restart', args: { server: 'S1' } })).toBeTruthy();
    const allDown = m.servers.reduce((c, s) => crash(c, s.id), m);
    expect(blockedReason(ds, { ...allDown, messages: [] }, { op: 'step', args: {} })).toMatch(/restart/);
  });

  it('keeps pseudo-code short and names real starting states in its experiments', () => {
    for (const o of ds.operations) for (const line of o.pseudocode) expect([...line].length).toBeLessThanOrEqual(40);
    const ids = new Set(ds.initial.map((s) => s.id));
    for (const x of ds.content.experiments) expect(ids.has(x.example)).toBe(true);
    expect(ds.legend[0]).toHaveProperty('neutral');
  });
});

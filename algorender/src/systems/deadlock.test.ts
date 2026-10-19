import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allocationGraph,
  coffman,
  deadlockCycle,
  findCycle,
  findDeadlockSchedule,
  initialState,
  lockSystem,
  nested,
  philosophers,
  randomSchedule,
  runSchedule,
  step,
  validate,
  waitForGraph,
  type LockSystem,
  type Proc,
} from './deadlock';

const NODES = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Brute force: a cycle exists when some node reaches itself (transitive closure). */
function hasCycle(nodes: readonly string[], edges: readonly { from: string; to: string }[]) {
  const reach = new Map(nodes.map((n) => [n, new Set<string>()]));
  for (const e of edges) reach.get(e.from)!.add(e.to);
  for (const k of nodes) for (const i of nodes) if (reach.get(i)!.has(k)) for (const j of reach.get(k)!) reach.get(i)!.add(j);
  return nodes.some((n) => reach.get(n)!.has(n));
}

const twoLocks = (sameOrder: boolean): LockSystem =>
  lockSystem([
    { id: 'P1', script: nested(['R1', 'R2']) },
    { id: 'P2', script: nested(sameOrder ? ['R1', 'R2'] : ['R2', 'R1']) },
  ]);

/** Every schedule of up to `depth` turns, by brute force: does any deadlock? */
function anyScheduleDeadlocks(sys: LockSystem, depth: number): boolean {
  const ids = sys.processes.map((p) => p.id);
  const go = (s: ReturnType<typeof initialState>, d: number): boolean => {
    if (deadlockCycle(sys, s)) return true;
    if (d === 0) return false;
    return ids.some((pid) => go(step(sys, s, pid).state, d - 1));
  };
  return go(initialState(sys), depth);
}

describe('cycle detection', () => {
  it('agrees with a transitive-closure brute force, and returns a real cycle', () => {
    const edge = fc.record({ from: fc.constantFrom(...NODES), to: fc.constantFrom(...NODES) });
    fc.assert(
      fc.property(fc.array(edge, { maxLength: 12 }), (edges) => {
        const cycle = findCycle(NODES, edges);
        expect(cycle != null).toBe(hasCycle(NODES, edges));
        if (cycle) {
          expect(new Set(cycle).size).toBe(cycle.length);
          cycle.forEach((u, i) => {
            const v = cycle[(i + 1) % cycle.length];
            expect(edges.some((e) => e.from === u && e.to === v)).toBe(true);
          });
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe('locks and scripts', () => {
  it('rejects malformed scripts', () => {
    expect(validate(twoLocks(false))).toBeNull();
    expect(validate(lockSystem([{ id: 'P1', script: [{ op: 'acquire', lock: 'R1' }] }]))).toMatch(/still holding R1/);
    expect(validate(lockSystem([{ id: 'P1', script: [{ op: 'release', lock: 'R1' }] }]))).toMatch(/without holding/);
    expect(
      validate(lockSystem([{ id: 'P1', script: [{ op: 'acquire', lock: 'R1' }, { op: 'acquire', lock: 'R1' }, { op: 'release', lock: 'R1' }] }])),
    ).toMatch(/already holding/);
    expect(validate(lockSystem([{ id: 'R1', script: nested(['R1']) }]))).toMatch(/twice/);
  });

  it('blocks on a held lock, never changing the state it is given', () => {
    const sys = twoLocks(true);
    const s0 = Object.freeze(initialState(sys));
    const a = step(sys, s0, 'P1');
    expect(a.outcome).toBe('acquired');
    expect(s0.holder.R1).toBeNull();
    const b = step(sys, a.state, 'P2');
    expect(b.outcome).toBe('blocked');
    expect(b.state.waiting.P2).toBe('R1');
    expect(b.state.pc.P2).toBe(0);
    expect(allocationGraph(sys, b.state).edges).toEqual([
      { from: 'R1', to: 'P1', kind: 'held' },
      { from: 'P2', to: 'R1', kind: 'waiting' },
    ]);
    expect(waitForGraph(sys, b.state)).toEqual([{ from: 'P2', to: 'P1', lock: 'R1' }]);
    expect(coffman(sys, b.state)).toMatchObject({ holdAndWait: false, circularWait: false });
  });

  it('a lock is held by at most one process, and a finished process holds nothing, on random schedules', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), fc.nat(10_000), fc.boolean(), (n, seed, ordered) => {
        const sys = lockSystem(philosophers(n, ordered));
        const run = runSchedule(sys, randomSchedule(sys, seed, 30));
        for (const t of run.turns) {
          for (const p of sys.processes) {
            const held = sys.locks.filter((l) => t.state.holder[l] === p.id);
            if (t.state.pc[p.id] >= p.script.length) expect(held).toEqual([]);
          }
        }
        expect(run.finished || run.deadlock != null).toBe(true);
        if (ordered) expect(run.deadlock).toBeNull();
      }),
      { numRuns: 150 },
    );
  });
});

describe('deadlock', () => {
  it('two locks in opposite orders can deadlock; in the same order they never do', () => {
    const opposite = twoLocks(false);
    expect(findDeadlockSchedule(opposite)).toEqual(['P1', 'P2', 'P1', 'P2']);
    expect(anyScheduleDeadlocks(opposite, 6)).toBe(true);
    const run = runSchedule(opposite, ['P1', 'P2', 'P1', 'P2']);
    expect(run.deadlock).toEqual(['P1', 'R2', 'P2', 'R1']);
    expect(coffman(opposite, run.state)).toEqual({ mutualExclusion: true, holdAndWait: true, noPreemption: true, circularWait: true });

    const same = twoLocks(true);
    expect(findDeadlockSchedule(same)).toBeNull();
    expect(anyScheduleDeadlocks(same, 10)).toBe(false);
  });

  it('five dining philosophers can deadlock; one taking the lower-numbered fork first never does', () => {
    const table = lockSystem(philosophers(5, false));
    const schedule = findDeadlockSchedule(table)!;
    expect(schedule).toHaveLength(10);
    const run = runSchedule(table, schedule);
    expect(run.deadlock).toHaveLength(10);
    expect(runSchedule(table, ['P1', 'P2', 'P3', 'P4', 'P5', 'P1', 'P2', 'P3', 'P4', 'P5']).deadlock).not.toBeNull();

    expect(findDeadlockSchedule(lockSystem(philosophers(5, true)))).toBeNull();
    for (let n = 2; n <= 4; n++) {
      expect(findDeadlockSchedule(lockSystem(philosophers(n, false)))).not.toBeNull();
      expect(findDeadlockSchedule(lockSystem(philosophers(n, true)))).toBeNull();
    }
  });

  it('a deadlock is exactly a cycle: every process on it waits for a lock the next one holds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), fc.nat(10_000), (n, seed) => {
        const rng = (k: number) => (seed * 31 + k * 17) % 3;
        const procs: Proc[] = Array.from({ length: n }, (_, i) => {
          const a = `R${rng(i) + 1}`;
          const b = `R${((rng(i) + 1 + (i % 2)) % 3) + 1}`;
          return { id: `P${i + 1}`, script: nested(a === b ? [a] : [a, b]) };
        });
        const sys = lockSystem(procs);
        const run = runSchedule(sys, randomSchedule(sys, seed, 20));
        if (!run.deadlock) return;
        const wf = waitForGraph(sys, run.state);
        const onCycle = run.deadlock.filter((id) => id.startsWith('P'));
        for (const p of onCycle) expect(wf.some((e) => e.from === p && onCycle.includes(e.to))).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});

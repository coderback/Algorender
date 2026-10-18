import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit, choose, idleStretches, metrics, simulate, start, tick, waitingStretches, type Policy, type Process } from './scheduling';

const P = (id: string, arrival: number, burst: number, priority = 1): Process => ({ id, arrival, burst, priority });

// ─────────────── reference schedulers, written independently ───────────────

const order = (ps: readonly Process[]) => ps.map((p, i) => ({ ...p, i }));

/** FCFS: in arrival order (ties by input order), each starts when the CPU and the process are both ready. */
function refFcfs(ps: readonly Process[]): Record<string, number> {
  let t = 0;
  const out: Record<string, number> = {};
  for (const p of order(ps).sort((a, b) => a.arrival - b.arrival || a.i - b.i)) {
    t = Math.max(t, p.arrival) + p.burst;
    out[p.id] = t;
  }
  return out;
}

/** Non-preemptive SJF: whenever the CPU frees up, the shortest burst among the arrived (ties: arrival, input order). */
function refSjf(ps: readonly Process[]): Record<string, number> {
  const left = order(ps);
  const out: Record<string, number> = {};
  let t = 0;
  while (left.length) {
    const arrived = left.filter((p) => p.arrival <= t);
    if (!arrived.length) {
      t = Math.min(...left.map((p) => p.arrival));
      continue;
    }
    arrived.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || a.i - b.i);
    const p = arrived[0];
    t += p.burst;
    out[p.id] = t;
    left.splice(left.indexOf(p), 1);
  }
  return out;
}

/** Preemptive by a key (remaining time or priority), one unit at a time; the running process keeps the CPU on a tie. */
function refPreemptive(ps: readonly Process[], key: (p: { burst: number; priority: number; rem: number }) => number): Record<string, number> {
  const all = order(ps).map((p) => ({ ...p, rem: p.burst }));
  const out: Record<string, number> = {};
  let running: (typeof all)[number] | null = null;
  for (let t = 0; Object.keys(out).length < all.length; t++) {
    const ready = all.filter((p) => p.arrival <= t && p.rem > 0);
    let best: (typeof all)[number] | null = null;
    for (const p of ready) {
      if (!best || key(p) < key(best) || (key(p) === key(best) && (p.arrival < best.arrival || (p.arrival === best.arrival && p.i < best.i)))) best = p;
    }
    if (running && running.rem > 0 && best && key(best) >= key(running)) best = running;
    running = best;
    if (!running) continue;
    running.rem--;
    if (running.rem === 0) out[running.id] = t + 1;
  }
  return out;
}

/** Round robin with a FIFO queue: arrivals at t join before a process whose quantum ended at t. */
function refRr(ps: readonly Process[], q: number): Record<string, number> {
  const all = order(ps)
    .sort((a, b) => a.arrival - b.arrival || a.i - b.i)
    .map((p) => ({ ...p, rem: p.burst }));
  const out: Record<string, number> = {};
  const queue: typeof all = [];
  let next = 0;
  let t = 0;
  const arrive = () => {
    while (next < all.length && all[next].arrival <= t) queue.push(all[next++]);
  };
  arrive();
  while (Object.keys(out).length < all.length) {
    if (!queue.length) {
      t++;
      arrive();
      continue;
    }
    const p = queue.shift()!;
    for (let used = 0; ; ) {
      p.rem--;
      used++;
      t++;
      arrive();
      if (p.rem === 0) {
        out[p.id] = t;
        break;
      }
      if (used === q) {
        if (queue.length) queue.push(p);
        else {
          used = 0;
          continue;
        }
        break;
      }
    }
  }
  return out;
}

const reference = (policy: Policy, ps: readonly Process[]) =>
  policy.kind === 'fcfs'
    ? refFcfs(ps)
    : policy.kind === 'sjf'
      ? refSjf(ps)
      : policy.kind === 'srtf'
        ? refPreemptive(ps, (p) => p.rem)
        : policy.kind === 'priority'
          ? refPreemptive(ps, (p) => p.priority)
          : refRr(ps, policy.quantum);

const workload = fc
  .array(fc.record({ arrival: fc.integer({ min: 0, max: 10 }), burst: fc.integer({ min: 1, max: 6 }), priority: fc.integer({ min: 1, max: 4 }) }), { minLength: 1, maxLength: 7 })
  .map((xs) => xs.map((x, i) => P(`P${i + 1}`, x.arrival, x.burst, x.priority)));
const policy: fc.Arbitrary<Policy> = fc.oneof(
  fc.constant<Policy>({ kind: 'fcfs' }),
  fc.constant<Policy>({ kind: 'sjf' }),
  fc.constant<Policy>({ kind: 'srtf' }),
  fc.constant<Policy>({ kind: 'priority' }),
  fc.integer({ min: 1, max: 5 }).map((quantum): Policy => ({ kind: 'rr', quantum })),
);

describe('the scheduling model', () => {
  it('finishes every process when an independent reference scheduler does', () => {
    fc.assert(
      fc.property(workload, policy, (ps, pol) => {
        expect(simulate(pol, ps).finish).toEqual(reference(pol, ps));
      }),
      { numRuns: 400 },
    );
  });

  it('runs each process for exactly its burst, never two at once, and never idles while something waits', () => {
    fc.assert(
      fc.property(workload, policy, (ps, pol) => {
        const end = simulate(pol, ps);
        const at = Array<string | null>(end.time).fill(null);
        for (const s of end.segments) {
          expect(s.from).toBeLessThan(s.to);
          for (let t = s.from; t < s.to; t++) {
            expect(at[t]).toBeNull();
            at[t] = s.process;
          }
        }
        for (const p of ps) {
          expect(at.filter((x) => x === p.id).length).toBe(p.burst);
          expect(end.firstRun[p.id]).toBeGreaterThanOrEqual(p.arrival);
        }
        // Work conserving: a free CPU only ever means nothing had arrived and was unfinished.
        for (let t = 0; t < end.time; t++) {
          if (at[t] !== null) continue;
          expect(ps.some((p) => p.arrival <= t && end.finish[p.id] > t)).toBe(false);
        }
        expect(end.idle).toBe(at.filter((x) => x === null).length);
        expect(idleStretches(end).reduce((s, x) => s + x.to - x.from, 0)).toBe(end.idle);
      }),
      { numRuns: 300 },
    );
  });

  it('reports waiting = turnaround − burst, and waiting stretches that add up to it', () => {
    fc.assert(
      fc.property(workload, policy, (ps, pol) => {
        const end = simulate(pol, ps);
        const m = metrics(end);
        for (const x of m.perProcess) {
          expect(x.turnaround).toBe(x.finish - x.arrival);
          expect(x.waiting).toBe(x.turnaround - x.burst);
          expect(x.response).toBeGreaterThanOrEqual(0);
          expect(x.response).toBeLessThanOrEqual(x.waiting);
          expect(waitingStretches(end, x.id).reduce((s, w) => s + w.to - w.from, 0)).toBe(x.waiting);
        }
        expect(m.utilisation).toBeGreaterThan(0);
        expect(m.utilisation).toBeLessThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
  });

  it('gives SRTF the lowest average turnaround of any policy, and SJF beats FCFS when everyone arrives at once', () => {
    fc.assert(
      fc.property(workload, (ps) => {
        const srtf = metrics(simulate({ kind: 'srtf' }, ps)).avgTurnaround;
        for (const other of [{ kind: 'fcfs' }, { kind: 'sjf' }, { kind: 'priority' }, { kind: 'rr', quantum: 2 }] as Policy[]) {
          expect(srtf).toBeLessThanOrEqual(metrics(simulate(other, ps)).avgTurnaround + 1e-9);
        }
        const together = ps.map((p) => ({ ...p, arrival: 0 }));
        expect(metrics(simulate({ kind: 'sjf' }, together)).avgWaiting).toBeLessThanOrEqual(metrics(simulate({ kind: 'fcfs' }, together)).avgWaiting + 1e-9);
      }),
      { numRuns: 200 },
    );
  });

  it('turns round robin with a quantum at least as long as any burst into FCFS', () => {
    fc.assert(
      fc.property(workload, (ps) => {
        expect(simulate({ kind: 'rr', quantum: 6 }, ps).finish).toEqual(simulate({ kind: 'fcfs' }, ps).finish);
      }),
    );
  });

  it('works through the convoy example by hand', () => {
    const w = [P('P1', 0, 8), P('P2', 1, 2), P('P3', 2, 1), P('P4', 3, 3)];
    expect(metrics(simulate({ kind: 'fcfs' }, w)).avgWaiting).toBe(5.75);
    expect(metrics(simulate({ kind: 'sjf' }, w)).avgWaiting).toBe(5.5);
    const srtf = simulate({ kind: 'srtf' }, w);
    expect(srtf.finish).toEqual({ P2: 3, P3: 4, P4: 7, P1: 14 });
    expect(metrics(srtf).avgWaiting).toBe(2);
    // P3 arrives at 2 with 1 unit, tying P2's 1 unit left: a tie never preempts.
    expect(srtf.segments.map((s) => `${s.process} ${s.from}-${s.to}`)).toEqual(['P1 0-1', 'P2 1-3', 'P3 3-4', 'P4 4-7', 'P1 7-14']);
  });

  it('counts a switch only when the CPU goes straight from one process to another', () => {
    const w = [P('P1', 0, 2), P('P2', 5, 2)];
    const end = simulate({ kind: 'fcfs' }, w);
    expect(end.switches).toBe(0);
    expect(end.idle).toBe(3);
    expect(simulate({ kind: 'rr', quantum: 1 }, [P('A', 0, 2), P('B', 0, 2)]).switches).toBe(3);
  });

  it('never changes the state it is given', () => {
    const s0 = admit(start([P('P1', 0, 3), P('P2', 0, 1)]));
    const copy = JSON.stringify(s0);
    choose({ kind: 'srtf' }, s0);
    tick({ kind: 'rr', quantum: 1 }, s0);
    expect(JSON.stringify(s0)).toBe(copy);
  });

  it('rejects malformed workloads', () => {
    expect(() => start([P('P1', 0, 0)])).toThrow();
    expect(() => start([P('P1', -1, 2)])).toThrow();
    expect(() => start([P('P1', 0, 2), P('P1', 1, 2)])).toThrow();
  });
});

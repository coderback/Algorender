// Processes that take and release locks, and the deadlocks they can fall into.
//
// Each process runs a script of steps: acquire a lock, release one, or do some
// work. A lock (a single-instance resource) has at most one holder. A process
// whose next step is to acquire a lock someone else holds is blocked: it waits,
// and tries again on its next turn. A scheduler decides whose turn it is.
//
// The state of the system is a resource-allocation graph: an edge R → P when
// process P holds lock R, and P → R when P is waiting for R. With
// single-instance resources, the processes are deadlocked exactly when this
// graph has a cycle: each one on it waits for a lock held by the next, so none
// of them can ever move. The wait-for graph collapses each P → R → Q into
// P → Q.
//
// The system-design canvas (phase 6d) reuses this as a component: `step` and
// `runSchedule` advance it, `deadlockCycle` and `coffman` say whether and why
// it is stuck, and `findDeadlockSchedule` searches every interleaving for one
// that deadlocks. Every function returns new state and never changes its input.

import { createRng } from '@/engine/random';

export type LockStep = { op: 'acquire'; lock: string } | { op: 'release'; lock: string } | { op: 'work' };
export type Proc = { id: string; script: readonly LockStep[] };
export type LockSystem = { processes: readonly Proc[]; locks: readonly string[] };

export type LockState = {
  /** Index of each process's next step; at the script's length it is finished. */
  pc: Readonly<Record<string, number>>;
  /** Each lock's holder, or null when it is free. */
  holder: Readonly<Record<string, string | null>>;
  /** The lock each process is blocked on (it tried and failed), or null. */
  waiting: Readonly<Record<string, string | null>>;
  /** Turns taken so far. */
  time: number;
};

export type Outcome = 'acquired' | 'blocked' | 'released' | 'worked' | 'done';
export type StepResult = { state: LockState; outcome: Outcome; step: LockStep | null };
export type AllocationEdge = { from: string; to: string; kind: 'held' | 'waiting' };

/** Natural order: R2 before R10. */
export const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** The system for some processes; its locks are every lock their scripts name, in natural order. */
export function lockSystem(processes: readonly Proc[]): LockSystem {
  const locks = new Set<string>();
  for (const p of processes) for (const s of p.script) if (s.op !== 'work') locks.add(s.lock);
  return { processes, locks: [...locks].sort(byName) };
}

/**
 * Why a system is malformed, or null: duplicate names, a process acquiring a
 * lock it already holds, releasing one it doesn't hold, or ending with a lock
 * still held. Well-formed scripts mean a finished process holds nothing.
 */
export function validate(sys: LockSystem): string | null {
  const names = new Set<string>();
  for (const id of [...sys.processes.map((p) => p.id), ...sys.locks]) {
    if (names.has(id)) return `The name ${id} is used twice`;
    names.add(id);
  }
  for (const p of sys.processes) {
    const held = new Set<string>();
    for (const s of p.script) {
      if (s.op === 'acquire') {
        if (!sys.locks.includes(s.lock)) return `${p.id} uses a lock ${s.lock} that doesn't exist`;
        if (held.has(s.lock)) return `${p.id} acquires ${s.lock} while already holding it`;
        held.add(s.lock);
      } else if (s.op === 'release') {
        if (!held.has(s.lock)) return `${p.id} releases ${s.lock} without holding it`;
        held.delete(s.lock);
      }
    }
    if (held.size > 0) return `${p.id} ends still holding ${[...held].sort(byName).join(' and ')}`;
  }
  return null;
}

export function initialState(sys: LockSystem): LockState {
  return {
    pc: Object.fromEntries(sys.processes.map((p) => [p.id, 0])),
    holder: Object.fromEntries(sys.locks.map((l) => [l, null])),
    waiting: Object.fromEntries(sys.processes.map((p) => [p.id, null])),
    time: 0,
  };
}

const proc = (sys: LockSystem, pid: string) => {
  const p = sys.processes.find((x) => x.id === pid);
  if (!p) throw new Error(`No process ${pid}`);
  return p;
};

/** The step a process takes next, or null when it has finished. */
export const nextStep = (sys: LockSystem, s: LockState, pid: string): LockStep | null => proc(sys, pid).script[s.pc[pid]] ?? null;
export const isDone = (sys: LockSystem, s: LockState, pid: string) => s.pc[pid] >= proc(sys, pid).script.length;
export const allDone = (sys: LockSystem, s: LockState) => sys.processes.every((p) => isDone(sys, s, p.id));
/** The locks a process holds, in natural order. */
export const holdings = (sys: LockSystem, s: LockState, pid: string) => sys.locks.filter((l) => s.holder[l] === pid);

/**
 * Process `pid` takes its turn: it runs its next step if it can. Acquiring a
 * held lock blocks it (it waits for that lock); a finished process does nothing.
 */
export function step(sys: LockSystem, s: LockState, pid: string): StepResult {
  const next = nextStep(sys, s, pid);
  if (!next) return { state: s, outcome: 'done', step: null };
  const advanced = { ...s, pc: { ...s.pc, [pid]: s.pc[pid] + 1 }, time: s.time + 1 };
  if (next.op === 'work') return { state: advanced, outcome: 'worked', step: next };
  if (next.op === 'release') {
    if (s.holder[next.lock] !== pid) throw new Error(`${pid} releases ${next.lock} without holding it`);
    return { state: { ...advanced, holder: { ...s.holder, [next.lock]: null } }, outcome: 'released', step: next };
  }
  const owner = s.holder[next.lock];
  if (owner == null) {
    return { state: { ...advanced, holder: { ...s.holder, [next.lock]: pid }, waiting: { ...s.waiting, [pid]: null } }, outcome: 'acquired', step: next };
  }
  if (owner === pid) throw new Error(`${pid} acquires ${next.lock} while already holding it`);
  return { state: { ...s, waiting: { ...s.waiting, [pid]: next.lock }, time: s.time + 1 }, outcome: 'blocked', step: next };
}

/** The resource-allocation graph: R → P when P holds R, P → R when P waits for R. */
export function allocationGraph(sys: LockSystem, s: LockState): { nodes: string[]; edges: AllocationEdge[] } {
  const edges: AllocationEdge[] = [];
  for (const l of sys.locks) {
    const h = s.holder[l];
    if (h != null) edges.push({ from: l, to: h, kind: 'held' });
  }
  for (const p of sys.processes) {
    const w = s.waiting[p.id];
    if (w != null) edges.push({ from: p.id, to: w, kind: 'waiting' });
  }
  return { nodes: [...sys.processes.map((p) => p.id), ...sys.locks], edges };
}

/** The wait-for graph: P → Q when P waits for a lock that Q holds. */
export function waitForGraph(sys: LockSystem, s: LockState): { from: string; to: string; lock: string }[] {
  const out: { from: string; to: string; lock: string }[] = [];
  for (const p of sys.processes) {
    const w = s.waiting[p.id];
    const h = w == null ? null : s.holder[w];
    if (w != null && h != null) out.push({ from: p.id, to: h, lock: w });
  }
  return out;
}

/**
 * A cycle in a directed graph, as its nodes in order (the last points back to
 * the first), or null when there is none. Depth-first search: a cycle exists
 * exactly when the search meets an edge back to a node still on its path.
 */
export function findCycle(nodes: readonly string[], edges: readonly { from: string; to: string }[]): string[] | null {
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) out.get(e.from)?.push(e.to);
  const state = new Map<string, 'open' | 'closed'>();
  const path: string[] = [];
  const visit = (u: string): string[] | null => {
    state.set(u, 'open');
    path.push(u);
    for (const v of out.get(u) ?? []) {
      if (state.get(v) === 'open') return path.slice(path.indexOf(v));
      if (!state.has(v)) {
        const found = visit(v);
        if (found) return found;
      }
    }
    path.pop();
    state.set(u, 'closed');
    return null;
  };
  for (const n of nodes) {
    if (state.has(n)) continue;
    const found = visit(n);
    if (found) return found;
  }
  return null;
}

/** The deadlock, as a cycle of the allocation graph alternating processes and locks (P1, R2, P2, R1), or null. */
export function deadlockCycle(sys: LockSystem, s: LockState): string[] | null {
  const g = allocationGraph(sys, s);
  const cycle = findCycle(g.nodes, g.edges);
  if (!cycle) return null;
  // Start the cycle at a process, so it reads "P waits for R, held by Q, …".
  const isProc = (id: string) => sys.processes.some((p) => p.id === id);
  const at = cycle.findIndex(isProc);
  return [...cycle.slice(at), ...cycle.slice(0, at)];
}

/**
 * The four Coffman conditions, all needed for a deadlock. Locks are always
 * exclusive and never taken away, so the first and third always hold here;
 * hold and wait and circular wait depend on the state.
 */
export function coffman(sys: LockSystem, s: LockState) {
  return {
    mutualExclusion: true,
    holdAndWait: sys.processes.some((p) => s.waiting[p.id] != null && holdings(sys, s, p.id).length > 0),
    noPreemption: true,
    circularWait: deadlockCycle(sys, s) != null,
  };
}

/** Every process that hasn't finished, in order. */
export const unfinished = (sys: LockSystem, s: LockState) => sys.processes.filter((p) => !isDone(sys, s, p.id)).map((p) => p.id);

export type Turn = { pid: string; outcome: Outcome; step: LockStep | null; state: LockState };

/**
 * Runs the schedule (process ids, one turn each; finished processes are
 * skipped), then lets the unfinished processes take turns in order until all
 * finish or they deadlock. Stops at the first deadlock.
 */
export function runSchedule(sys: LockSystem, schedule: readonly string[], maxTurns = 200) {
  const run = { s: initialState(sys), cycle: null as string[] | null };
  const turns: Turn[] = [];
  const take = (pid: string) => {
    if (isDone(sys, run.s, pid)) return;
    const r = step(sys, run.s, pid);
    run.s = r.state;
    turns.push({ pid, outcome: r.outcome, step: r.step, state: r.state });
    run.cycle = deadlockCycle(sys, r.state);
  };
  for (const pid of schedule) {
    if (run.cycle || allDone(sys, run.s)) break;
    take(pid);
  }
  const ids = sys.processes.map((p) => p.id);
  for (let i = 0; !run.cycle && !allDone(sys, run.s) && turns.length < maxTurns; i++) take(ids[i % ids.length]);
  return { state: run.s, turns, deadlock: run.cycle, finished: allDone(sys, run.s) };
}

const stateKey = (sys: LockSystem, s: LockState) =>
  sys.processes.map((p) => `${s.pc[p.id]}${s.waiting[p.id] ?? ''}`).join('|') + '#' + sys.locks.map((l) => s.holder[l] ?? '').join('|');

/**
 * The shortest schedule that leads to a deadlock, searching every
 * interleaving (breadth first over the reachable states), or null if no
 * interleaving deadlocks.
 */
export function findDeadlockSchedule(sys: LockSystem, maxStates = 500_000): string[] | null {
  const start = initialState(sys);
  const seen = new Set([stateKey(sys, start)]);
  let frontier: { s: LockState; path: string[] }[] = [{ s: start, path: [] }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { s, path } of frontier) {
      for (const pid of unfinished(sys, s)) {
        const r = step(sys, s, pid);
        const key = stateKey(sys, r.state);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > maxStates) throw new Error('Too many states to search');
        const p = [...path, pid];
        if (deadlockCycle(sys, r.state)) return p;
        next.push({ s: r.state, path: p });
      }
    }
    frontier = next;
  }
  return null;
}

/** A seeded random schedule of `length` turns. */
export function randomSchedule(sys: LockSystem, seed: number, length: number): string[] {
  const rng = createRng(seed);
  return Array.from({ length }, () => sys.processes[Math.floor(rng() * sys.processes.length)].id);
}

/** A script that takes the locks in this order, works, and releases them in reverse. */
export function nested(locks: readonly string[]): LockStep[] {
  return [
    ...locks.map((lock): LockStep => ({ op: 'acquire', lock })),
    { op: 'work' },
    ...[...locks].reverse().map((lock): LockStep => ({ op: 'release', lock })),
  ];
}

/**
 * Dining philosophers: P1…Pn round a table with a fork Ri between Pi and
 * P(i+1). Each takes fork Ri, then fork R(i+1) (Rn+1 is R1), unless `ordered`,
 * when the last philosopher takes the lower-numbered fork R1 first, so every
 * philosopher takes forks in increasing order.
 */
export function philosophers(n: number, ordered: boolean): Proc[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    const left = `R${i}`;
    const right = `R${i === n ? 1 : i + 1}`;
    const order = ordered && i === n ? [right, left] : [left, right];
    return { id: `P${i}`, script: nested(order) };
  });
}

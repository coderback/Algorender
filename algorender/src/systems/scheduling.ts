// CPU scheduling as a pure, steppable simulation: one CPU, processes that
// arrive over time with a known amount of work (their burst), and a policy
// that picks who runs at each tick.
//
// This is a component the system-design canvas (phase 6d) reuses: anything
// that hands one worker a queue of jobs (a single-threaded server, a worker
// pool's slot, a print queue) is this model. The API is small: `start` a
// workload, `tick` it under a policy (or `simulate` to the end), and read
// `metrics`. States are plain objects and every function returns a new one.
//
// Conventions, applied in this order at each tick t:
// 1. Arrivals at or before t join the back of the ready queue, earliest
//    arrival first, ties in input order.
// 2. Round robin: a process that has used its whole quantum goes to the back
//    of the queue, behind anything that arrived at this tick. With nobody
//    waiting it simply carries on.
// 3. The policy chooses who runs. FCFS, SJF and RR never take the CPU away
//    from a running process (RR only at the end of a quantum); SRTF and
//    priority do, but only for a strictly better candidate, so ties never
//    cause a switch. Ties between waiting processes go to the earliest
//    arrival, then input order.
// 4. The chosen process runs for one unit of time. A process that has no
//    work left finishes at the end of that unit.

export type Process = { id: string; arrival: number; burst: number; priority: number };

/** `priority` is preemptive, and a lower number means a more urgent process. */
export type Policy = { kind: 'fcfs' } | { kind: 'sjf' } | { kind: 'srtf' } | { kind: 'rr'; quantum: number } | { kind: 'priority' };

export type PolicyKind = Policy['kind'];

/** A stretch of time one process spent on the CPU, [from, to). */
export type Segment = { process: string; from: number; to: number };

export type SchedulerState = {
  time: number;
  processes: readonly Process[];
  /** Processes that have arrived, in the order they did. */
  admitted: readonly string[];
  /** Waiting to run, front first (the order matters for FCFS and RR). */
  ready: readonly string[];
  running: string | null;
  /** Ticks the running process has had since it was last put on the CPU (RR's quantum). */
  slice: number;
  remaining: Readonly<Record<string, number>>;
  /** When each process first got the CPU. */
  firstRun: Readonly<Record<string, number>>;
  finish: Readonly<Record<string, number>>;
  segments: readonly Segment[];
  /** Times the CPU went straight from one process to a different one. */
  switches: number;
  /** Units of time with nothing to run. */
  idle: number;
  /** Who ran in the previous unit of time (null after an idle unit). */
  last: string | null;
};

export const POLICY_NAMES: Record<PolicyKind, string> = {
  fcfs: 'First come, first served',
  sjf: 'Shortest job first',
  srtf: 'Shortest remaining time first',
  rr: 'Round robin',
  priority: 'Priority',
};

export const preemptive = (policy: Policy) => policy.kind === 'srtf' || policy.kind === 'priority';

/** A workload at time 0, before anything has arrived. Throws on a malformed workload. */
export function start(processes: readonly Process[]): SchedulerState {
  const ids = new Set(processes.map((p) => p.id));
  if (ids.size !== processes.length) throw new Error('Process ids must be unique');
  for (const p of processes) {
    if (!(Number.isInteger(p.arrival) && p.arrival >= 0)) throw new Error(`${p.id}: arrival must be a whole number ≥ 0`);
    if (!(Number.isInteger(p.burst) && p.burst >= 1)) throw new Error(`${p.id}: burst must be a whole number ≥ 1`);
  }
  return {
    time: 0,
    processes,
    admitted: [],
    ready: [],
    running: null,
    slice: 0,
    remaining: Object.fromEntries(processes.map((p) => [p.id, p.burst])),
    firstRun: {},
    finish: {},
    segments: [],
    switches: 0,
    idle: 0,
    last: null,
  };
}

const byId = (state: SchedulerState) => new Map(state.processes.map((p, i) => [p.id, { ...p, index: i }]));

/** Step 1: everything that has arrived by now joins the back of the ready queue. */
export function admit(state: SchedulerState): SchedulerState {
  const seen = new Set(state.admitted);
  const index = new Map(state.processes.map((p, i) => [p.id, i]));
  const arriving = state.processes
    .filter((p) => !seen.has(p.id) && p.arrival <= state.time)
    .sort((a, b) => a.arrival - b.arrival || index.get(a.id)! - index.get(b.id)!)
    .map((p) => p.id);
  if (arriving.length === 0) return state;
  return { ...state, admitted: [...state.admitted, ...arriving], ready: [...state.ready, ...arriving] };
}

/** Step 2 (round robin): a process that has used its quantum goes to the back of the queue, if anyone is waiting. */
export function expire(policy: Policy, state: SchedulerState): SchedulerState {
  if (policy.kind !== 'rr' || state.running === null || state.slice < policy.quantum) return state;
  if (state.ready.length === 0) return { ...state, slice: 0 };
  return { ...state, ready: [...state.ready, state.running], running: null, slice: 0 };
}

/** What a policy sorts waiting processes by (smaller first), or null when it takes them in queue order. */
export function keyOf(policy: Policy, state: SchedulerState, id: string): number | null {
  const p = byId(state).get(id)!;
  switch (policy.kind) {
    case 'sjf':
      return p.burst;
    case 'srtf':
      return state.remaining[id];
    case 'priority':
      return p.priority;
    default:
      return null;
  }
}

/** Step 3: who should have the CPU now (null when nothing is ready). Doesn't change the state. */
export function choose(policy: Policy, state: SchedulerState): string | null {
  const { running, ready } = state;
  if (ready.length === 0) return running;
  if (policy.kind === 'fcfs' || policy.kind === 'rr') return running ?? ready[0];
  if (policy.kind === 'sjf' && running !== null) return running;
  const info = byId(state);
  const better = (a: string, b: string) => {
    const ka = keyOf(policy, state, a)!;
    const kb = keyOf(policy, state, b)!;
    if (ka !== kb) return ka < kb;
    const pa = info.get(a)!;
    const pb = info.get(b)!;
    return pa.arrival !== pb.arrival ? pa.arrival < pb.arrival : pa.index < pb.index;
  };
  let best = ready[0];
  for (const id of ready.slice(1)) if (better(id, best)) best = id;
  // A running process keeps the CPU unless something is strictly better.
  if (running !== null && keyOf(policy, state, best)! >= keyOf(policy, state, running)!) return running;
  return best;
}

/** Puts `id` on the CPU; a process it replaces goes back to the ready queue. */
export function dispatch(state: SchedulerState, id: string | null): SchedulerState {
  if (id === state.running) return state;
  const ready = state.ready.filter((x) => x !== id);
  if (state.running !== null) ready.push(state.running);
  return { ...state, ready, running: id, slice: 0 };
}

/** Step 4: one unit of time passes, with the current process on the CPU (or none). */
export function runTick(state: SchedulerState): SchedulerState {
  const t = state.time;
  const id = state.running;
  if (id === null) return { ...state, time: t + 1, idle: state.idle + 1, last: null };
  const last = state.segments.at(-1);
  const segments = last && last.process === id && last.to === t ? [...state.segments.slice(0, -1), { ...last, to: t + 1 }] : [...state.segments, { process: id, from: t, to: t + 1 }];
  const left = state.remaining[id] - 1;
  const next: SchedulerState = {
    ...state,
    time: t + 1,
    segments,
    remaining: { ...state.remaining, [id]: left },
    firstRun: id in state.firstRun ? state.firstRun : { ...state.firstRun, [id]: t },
    switches: state.switches + (state.last !== null && state.last !== id ? 1 : 0),
    slice: state.slice + 1,
    last: id,
  };
  return left > 0 ? next : { ...next, running: null, slice: 0, finish: { ...next.finish, [id]: t + 1 } };
}

/** One whole tick: arrivals, the end of a quantum, the policy's choice, then a unit of work. */
export function tick(policy: Policy, state: SchedulerState): SchedulerState {
  const before = expire(policy, admit(state));
  return runTick(dispatch(before, choose(policy, before)));
}

export const done = (state: SchedulerState) => state.processes.every((p) => p.id in state.finish);

/** Runs a workload to the end under a policy. */
export function simulate(policy: Policy, processes: readonly Process[]): SchedulerState {
  let state = start(processes);
  const limit = processes.reduce((s, p) => Math.max(s, p.arrival), 0) + processes.reduce((s, p) => s + p.burst, 0) + 1;
  while (!done(state)) {
    if (state.time > limit) throw new Error('The simulation ran past every possible finish time');
    state = tick(policy, state);
  }
  return state;
}

export type ProcessMetrics = { id: string; arrival: number; burst: number; firstRun: number; finish: number; turnaround: number; waiting: number; response: number };

export type Metrics = {
  perProcess: ProcessMetrics[];
  avgTurnaround: number;
  avgWaiting: number;
  avgResponse: number;
  /** From the first arrival to the last finish. */
  makespan: number;
  /** Processes finished per unit of time over the makespan. */
  throughput: number;
  /** The share of the makespan the CPU was busy. */
  utilisation: number;
  switches: number;
};

/** Turnaround = finish − arrival; waiting = turnaround − burst; response = first run − arrival. Needs a finished run. */
export function metrics(state: SchedulerState): Metrics {
  if (!done(state)) throw new Error('metrics() needs every process finished');
  const perProcess = state.processes.map((p) => {
    const finish = state.finish[p.id];
    const turnaround = finish - p.arrival;
    return { id: p.id, arrival: p.arrival, burst: p.burst, firstRun: state.firstRun[p.id], finish, turnaround, waiting: turnaround - p.burst, response: state.firstRun[p.id] - p.arrival };
  });
  const n = Math.max(1, perProcess.length);
  const avg = (f: (m: ProcessMetrics) => number) => perProcess.reduce((s, m) => s + f(m), 0) / n;
  const first = Math.min(...state.processes.map((p) => p.arrival));
  const makespan = Math.max(0, ...perProcess.map((m) => m.finish)) - (perProcess.length ? first : 0);
  const busy = state.processes.reduce((s, p) => s + p.burst, 0);
  return {
    perProcess,
    avgTurnaround: avg((m) => m.turnaround),
    avgWaiting: avg((m) => m.waiting),
    avgResponse: avg((m) => m.response),
    makespan,
    throughput: makespan > 0 ? perProcess.length / makespan : 0,
    utilisation: makespan > 0 ? busy / makespan : 0,
    switches: state.switches,
  };
}

/** When a process was waiting in the ready queue, as [from, to) stretches, up to the state's time. */
export function waitingStretches(state: SchedulerState, id: string): { from: number; to: number }[] {
  const p = state.processes.find((x) => x.id === id);
  if (!p || !state.admitted.includes(id)) return [];
  const out: { from: number; to: number }[] = [];
  let since = p.arrival;
  for (const s of state.segments) {
    if (s.process !== id) continue;
    if (s.from > since) out.push({ from: since, to: s.from });
    since = s.to;
  }
  // Not finished: it has been waiting since its last turn (a process just put on the CPU waited up to now).
  if (!(id in state.finish) && state.time > since) out.push({ from: since, to: state.time });
  return out;
}

/** Stretches of time the CPU had nothing to run, up to the state's time. */
export function idleStretches(state: SchedulerState): { from: number; to: number }[] {
  const busy = Array<boolean>(state.time).fill(false);
  for (const s of state.segments) for (let t = s.from; t < s.to; t++) busy[t] = true;
  const out: { from: number; to: number }[] = [];
  for (let t = 0; t < state.time; t++) {
    if (busy[t]) continue;
    const last = out.at(-1);
    if (last && last.to === t) last.to = t + 1;
    else out.push({ from: t, to: t + 1 });
  }
  return out;
}

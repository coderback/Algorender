// Threads sharing memory, run one atomic instruction at a time in whatever
// order a scheduler picks: the model behind race conditions.
//
// A program is a few threads, each a short list of instructions over shared
// variables, private registers and locks. A schedule is the sequence of
// threads that take a step; every step runs exactly one instruction, which no
// other thread can interrupt. `runSchedule` plays one interleaving, and
// `outcomes` explores every interleaving (memoised on the machine state, so
// it stays fast) and counts how many end in each final state. Outcomes no
// one-thread-at-a-time order produces (`serialOutcomes`) are races.
//
// The system-design canvas (phase 6d) can reuse it for anything that updates
// shared state from several workers: a counter, a balance, a seat booking.
// Every function returns new values and never changes the ones it is given.

export type Instr =
  /** reg ← from: copy a shared variable into a private register. */
  | { op: 'load'; reg: string; from: string }
  /** reg ← reg + k. */
  | { op: 'add'; reg: string; k: number }
  /** to ← reg: write a register back to a shared variable. */
  | { op: 'store'; to: string; reg: string }
  /** target ← target + k as one indivisible step (an atomic fetch-and-add). */
  | { op: 'fetch-add'; target: string; k: number }
  /** Take a lock, or block while another thread holds it. Locks are not re-entrant. */
  | { op: 'lock'; lock: string }
  /** Release a lock this thread holds. */
  | { op: 'unlock'; lock: string }
  /** If reg < k, continue at line `to` (forward only; `to` = code length ends the thread). */
  | { op: 'jump-if-less'; reg: string; k: number; to: number };

export type Thread = { id: string; code: readonly Instr[] };
export type Program = { memory: Readonly<Record<string, number>>; threads: readonly Thread[] };

export type ThreadState = { pc: number; regs: Readonly<Record<string, number>> };
export type Machine = {
  memory: Readonly<Record<string, number>>;
  threads: readonly ThreadState[];
  /** Lock name → id of the thread holding it. Free locks are absent. */
  locks: Readonly<Record<string, string>>;
};

export type Status = 'ready' | 'blocked' | 'done';

/** What one scheduled step did. A blocked thread "waits": the step changes nothing. */
export type Step = {
  thread: string;
  /** The line it ran (or tried to run). */
  line: number;
  instr: Instr;
  kind: 'ran' | 'waited';
  read?: { name: string; value: number };
  wrote?: { name: string; value: number; was: number };
  reg?: { name: string; value: number };
  /** For a jump: whether the condition held, so the thread jumped. */
  jumped?: boolean;
};

export type Outcome = {
  memory: Readonly<Record<string, number>>;
  /** Every unfinished thread is blocked on a lock: nothing can ever run again. */
  deadlocked: boolean;
  /** How many interleavings end here. */
  count: number;
};

export function start(program: Program): Machine {
  return { memory: { ...program.memory }, threads: program.threads.map(() => ({ pc: 0, regs: {} })), locks: {} };
}

function indexOf(program: Program, id: string): number {
  const i = program.threads.findIndex((t) => t.id === id);
  if (i < 0) throw new Error(`No thread "${id}"`);
  return i;
}

export function status(program: Program, m: Machine, id: string): Status {
  const i = indexOf(program, id);
  const { pc } = m.threads[i];
  const instr = program.threads[i].code[pc];
  if (!instr) return 'done';
  if (instr.op === 'lock' && m.locks[instr.lock] != null && m.locks[instr.lock] !== id) return 'blocked';
  if (instr.op === 'lock' && m.locks[instr.lock] === id) return 'blocked'; // not re-entrant: it waits on itself
  return 'ready';
}

/** Threads that can run an instruction now. */
export const runnable = (program: Program, m: Machine) => program.threads.filter((t) => status(program, m, t.id) === 'ready').map((t) => t.id);
export const finished = (program: Program, m: Machine) => program.threads.every((t) => status(program, m, t.id) === 'done');
/** Some thread is unfinished, yet none can run. */
export const deadlocked = (program: Program, m: Machine) => !finished(program, m) && runnable(program, m).length === 0;

const val = (record: Readonly<Record<string, number>>, name: string) => record[name] ?? 0;

/** Gives thread `id` one step. A blocked thread waits (nothing changes); a finished thread can't be scheduled. */
export function step(program: Program, m: Machine, id: string): { machine: Machine; step: Step } {
  const i = indexOf(program, id);
  const s = status(program, m, id);
  const t = m.threads[i];
  if (s === 'done') throw new Error(`Thread ${id} has finished`);
  const instr = program.threads[i].code[t.pc];
  if (s === 'blocked') return { machine: m, step: { thread: id, line: t.pc, instr, kind: 'waited' } };

  const base: Step = { thread: id, line: t.pc, instr, kind: 'ran' };
  const setThread = (next: ThreadState, patch: Partial<Machine> = {}): Machine => ({
    ...m,
    ...patch,
    threads: m.threads.map((x, j) => (j === i ? next : x)),
  });
  const advance = (regs = t.regs, pc = t.pc + 1): ThreadState => ({ pc, regs });

  switch (instr.op) {
    case 'load': {
      const value = val(m.memory, instr.from);
      return {
        machine: setThread(advance({ ...t.regs, [instr.reg]: value })),
        step: { ...base, read: { name: instr.from, value }, reg: { name: instr.reg, value } },
      };
    }
    case 'add': {
      const value = val(t.regs, instr.reg) + instr.k;
      return { machine: setThread(advance({ ...t.regs, [instr.reg]: value })), step: { ...base, reg: { name: instr.reg, value } } };
    }
    case 'store': {
      const value = val(t.regs, instr.reg);
      return {
        machine: setThread(advance(), { memory: { ...m.memory, [instr.to]: value } }),
        step: { ...base, wrote: { name: instr.to, value, was: val(m.memory, instr.to) } },
      };
    }
    case 'fetch-add': {
      const was = val(m.memory, instr.target);
      const value = was + instr.k;
      return {
        machine: setThread(advance(), { memory: { ...m.memory, [instr.target]: value } }),
        step: { ...base, read: { name: instr.target, value: was }, wrote: { name: instr.target, value, was } },
      };
    }
    case 'lock':
      return { machine: setThread(advance(), { locks: { ...m.locks, [instr.lock]: id } }), step: base };
    case 'unlock': {
      if (m.locks[instr.lock] !== id) throw new Error(`Thread ${id} unlocks ${instr.lock}, which it doesn't hold`);
      const locks = { ...m.locks };
      delete locks[instr.lock];
      return { machine: setThread(advance(), { locks }), step: base };
    }
    case 'jump-if-less': {
      const jumped = val(t.regs, instr.reg) < instr.k;
      return { machine: setThread(advance(t.regs, jumped ? instr.to : t.pc + 1)), step: { ...base, jumped } };
    }
  }
}

/** Why a schedule can't run (an unknown thread, or one picked after it finished), or null. */
export function scheduleProblem(program: Program, schedule: readonly string[]): string | null {
  let m = start(program);
  for (const [n, id] of schedule.entries()) {
    if (!program.threads.some((t) => t.id === id)) return `Step ${n + 1} picks thread ${id}, but the threads are ${program.threads.map((t) => t.id).join(', ')}.`;
    if (status(program, m, id) === 'done') return `Step ${n + 1} picks thread ${id}, but it has already finished.`;
    m = step(program, m, id).machine;
  }
  return null;
}

/** Plays one interleaving. `machines[k]` is the state after k steps, so `machines[0]` is the start. */
export function runSchedule(program: Program, schedule: readonly string[]): { steps: Step[]; machines: Machine[]; final: Machine } {
  const problem = scheduleProblem(program, schedule);
  if (problem) throw new Error(problem);
  let m = start(program);
  const machines = [m];
  const steps: Step[] = [];
  for (const id of schedule) {
    const r = step(program, m, id);
    m = r.machine;
    steps.push(r.step);
    machines.push(m);
  }
  return { steps, machines, final: m };
}

/** Extends a schedule until every thread finishes (or deadlocks), always running the first ready thread. */
export function completeSchedule(program: Program, prefix: readonly string[]): string[] {
  const schedule = [...prefix];
  let m = runSchedule(program, prefix).final;
  for (;;) {
    const ready = runnable(program, m);
    if (ready.length === 0) return schedule;
    schedule.push(ready[0]);
    m = step(program, m, ready[0]).machine;
  }
}

/**
 * A random interleaving: at each step the scheduler picks any unfinished
 * thread, so a thread may be picked while blocked and wait. After `maxSteps`
 * it finishes the run with `completeSchedule`.
 */
export function randomSchedule(program: Program, rng: () => number, maxSteps = 40): string[] {
  const schedule: string[] = [];
  let m = start(program);
  while (schedule.length < maxSteps && !finished(program, m) && !deadlocked(program, m)) {
    const open = program.threads.filter((t) => status(program, m, t.id) !== 'done').map((t) => t.id);
    const id = open[Math.floor(rng() * open.length)];
    schedule.push(id);
    m = step(program, m, id).machine;
  }
  return completeSchedule(program, schedule);
}

const machineKey = (m: Machine) =>
  JSON.stringify([
    Object.entries(m.memory).sort(([a], [b]) => (a < b ? -1 : 1)),
    m.threads.map((t) => [t.pc, Object.entries(t.regs).sort(([a], [b]) => (a < b ? -1 : 1))]),
    Object.entries(m.locks).sort(([a], [b]) => (a < b ? -1 : 1)),
  ]);

/** A stable key for a final state, e.g. "count=1" or "x=1,y=2 (deadlock)". */
export function outcomeKey(memory: Readonly<Record<string, number>>, isDeadlocked = false): string {
  const vars = Object.keys(memory)
    .sort()
    .map((k) => `${k}=${memory[k]}`)
    .join(',');
  return isDeadlocked ? `${vars} (deadlock)` : vars;
}

/**
 * Every final state over every interleaving, with how many interleavings reach
 * it. Only ready threads are scheduled (a wait changes nothing, so it isn't a
 * different interleaving). Sorted by the watched variables' values.
 */
export function outcomes(program: Program): { outcomes: Outcome[]; total: number } {
  const memo = new Map<string, Map<string, { outcome: Omit<Outcome, 'count'>; count: number }>>();
  const explore = (m: Machine): Map<string, { outcome: Omit<Outcome, 'count'>; count: number }> => {
    const key = machineKey(m);
    const known = memo.get(key);
    if (known) return known;
    const result = new Map<string, { outcome: Omit<Outcome, 'count'>; count: number }>();
    const ready = runnable(program, m);
    if (ready.length === 0) {
      const dead = !finished(program, m);
      result.set(outcomeKey(m.memory, dead), { outcome: { memory: m.memory, deadlocked: dead }, count: 1 });
    }
    for (const id of ready) {
      for (const [k, v] of explore(step(program, m, id).machine)) {
        const prev = result.get(k);
        result.set(k, { outcome: v.outcome, count: (prev?.count ?? 0) + v.count });
      }
    }
    memo.set(key, result);
    return result;
  };
  const all = [...explore(start(program)).values()].map((v) => ({ ...v.outcome, count: v.count }));
  all.sort((a, b) => compareMemory(a.memory, b.memory) || Number(a.deadlocked) - Number(b.deadlocked));
  return { outcomes: all, total: all.reduce((s, o) => s + o.count, 0) };
}

function compareMemory(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): number {
  for (const k of Object.keys(a).sort()) if (a[k] !== b[k]) return (a[k] ?? 0) - (b[k] ?? 0);
  return 0;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Keys of the final states reached by running the threads one at a time, in every order: the results a correct program may give. */
export function serialOutcomes(program: Program): Set<string> {
  const keys = new Set<string>();
  for (const order of permutations(program.threads.map((t) => t.id))) {
    let m = start(program);
    for (const id of order) {
      while (status(program, m, id) === 'ready') m = step(program, m, id).machine;
    }
    keys.add(outcomeKey(m.memory, !finished(program, m)));
  }
  return keys;
}

/** A race: some interleaving ends in a state that no one-at-a-time order gives. */
export function isRace(program: Program): boolean {
  const serial = serialOutcomes(program);
  return outcomes(program).outcomes.some((o) => !serial.has(outcomeKey(o.memory, o.deadlocked)));
}

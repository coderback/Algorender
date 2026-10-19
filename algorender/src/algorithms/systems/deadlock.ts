import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import {
  coffman,
  deadlockCycle,
  holdings,
  isDone,
  lockSystem,
  nested,
  philosophers,
  randomSchedule,
  step,
  initialState,
  allDone,
  allocationGraph,
  validate,
  type LockState,
  type LockStep,
  type LockSystem,
  type Proc,
} from '@/systems/deadlock';
import { circleLayout } from '@/viz/graph/layout';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { Checkpoint } from '@/engine/types';
import type { Graph, GraphState, Mark, NodeId } from '@/viz/graph/types';

// Processes taking locks in turn, drawn as a resource-allocation graph: an
// arrow from a lock to the process holding it, and from a process to the lock
// it waits for. A cycle in that graph is a deadlock. The model is
// src/systems/deadlock.ts.

export type DeadlockInput = { processes: readonly Proc[]; schedule: readonly string[] };

export const MAX_PROCESSES = 6;
export const MAX_LOCKS = 6;
export const MAX_STEPS = 10;
export const MAX_TURNS = 40;
/** Turns allowed after the schedule runs out, while the processes take turns in order. */
const MAX_EXTRA_TURNS = 80;

const pseudocode = [
  'for each turn in the schedule:',
  '  P ← whose turn it is',
  '  s ← P’s next step',
  '  if s = acquire(R):',
  '    if R is free: R → P (P holds R)',
  '    else: P → R (P waits for R)',
  '  if s = release(R): R is free again',
  '  if s = work: P works (keeps its locks)',
  '  after a new wait, look for a cycle',
  '  cycle: deadlock, no one on it moves',
  'everyone finished: no deadlock',
];

const short = (s: LockStep) => (s.op === 'work' ? 'w' : `${s.op === 'acquire' ? '+' : '-'}${s.lock}`);
const words = (s: LockStep) => (s.op === 'work' ? 'work' : `${s.op} ${s.lock}`);
const andList = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Locks and processes round one circle, each process just after its first lock, so a dining table reads as a table. */
export function layout(sys: LockSystem): Graph {
  const order: NodeId[] = [];
  for (let i = 0; i < Math.max(sys.locks.length, sys.processes.length); i++) {
    if (sys.locks[i]) order.push(sys.locks[i]);
    if (sys.processes[i]) order.push(sys.processes[i].id);
  }
  const pos = circleLayout(order);
  return { directed: true, weighted: false, nodes: order.map((id) => ({ id, ...pos[id] })), edges: [] };
}

/** How a cycle reads in words: "P1 waits for R2, held by P2, which waits for R1, held by P1". */
function cycleWords(cycle: readonly string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < cycle.length; i += 2) {
    const p = cycle[i];
    const r = cycle[i + 1];
    const q = cycle[(i + 2) % cycle.length];
    parts.push(i === 0 ? `${p} waits for ${r}, held by ${q}` : `which waits for ${r}, held by ${q}`);
  }
  return parts.join(', ');
}

/** The chain of waiting from a process, as far as it goes: "P2 → R1 → P1". */
function chainFrom(sys: LockSystem, s: LockState, start: string): string[] {
  const chain = [start];
  let p = start;
  for (let k = 0; k < sys.processes.length; k++) {
    const r = s.waiting[p];
    const q = r == null ? null : s.holder[r];
    if (r == null || q == null) break;
    chain.push(r, q);
    if (chain.indexOf(q) < chain.length - 1) break;
    p = q;
  }
  return chain;
}

function* trace(input: DeadlockInput): Generator<GraphFrame> {
  const sys = lockSystem(input.processes);
  const graph = layout(sys);
  const t = new GraphTracer(graph, ['turns', 'acquired', 'blocked']);
  const ids = sys.processes.map((p) => p.id);
  let s = initialState(sys);
  let cycle: string[] | null = null;
  let current: string | null = null;
  let turnIndex = -1;
  let extra = false;
  const drawn = new Set<string>();

  const status = (pid: string) => {
    if (cycle?.includes(pid)) return 'deadlocked';
    if (isDone(sys, s, pid)) return 'finished';
    const w = s.waiting[pid];
    return w ? `waiting for ${w}` : 'ready';
  };

  const draw = () => {
    // Edges follow the allocation graph: add the new ones, drop the gone ones.
    const want = allocationGraph(sys, s).edges;
    const key = (e: { from: string; to: string }) => `${e.from}>${e.to}`;
    const wanted = new Set(want.map(key));
    for (const id of [...drawn]) {
      if (wanted.has(id)) continue;
      t.removeEdge(id);
      drawn.delete(id);
    }
    for (const e of want) {
      if (!drawn.has(key(e))) drawn.add(t.addEdge(e.from, e.to, 1));
      t.markEdge(key(e), cycle && onCycle(e) ? 'reject' : e.kind === 'held' ? 'visited' : 'frontier');
    }
    for (const pid of ids) {
      t.mark(pid, cycle?.includes(pid) ? 'reject' : isDone(sys, s, pid) ? 'sorted' : null);
      const next = sys.processes.find((p) => p.id === pid)!.script[s.pc[pid]];
      t.annotate(pid, next ? `next ${short(next)}` : 'done');
    }
    for (const l of sys.locks) t.mark(l, cycle?.includes(l) ? 'reject' : null);

    t.setPanel({
      kind: 'table',
      id: 'scripts',
      title: 'Processes (+R take R, -R release R, w work)',
      columns: ['Process', 'Steps, [next]', 'Holds', 'Status'],
      rows: sys.processes.map((p) => {
        const steps = p.script.map((st, i) => (i === s.pc[p.id] ? `[${short(st)}]` : short(st))).join(' ');
        const mark: Mark | undefined = cycle?.includes(p.id) ? 'reject' : p.id === current ? 'key' : isDone(sys, s, p.id) ? 'sorted' : undefined;
        return { id: p.id, cells: [p.id, steps, holdings(sys, s, p.id).join(', ') || '–', status(p.id)], ...(mark && { mark }) };
      }),
    });
    t.setPanel({
      kind: 'chips',
      id: 'schedule',
      title: extra ? 'Schedule (used up: now turns go in order)' : 'Schedule (whose turn)',
      chips: input.schedule.map((pid, i) => ({ id: `turn-${i}`, label: pid, ...(i === turnIndex && !extra && { mark: 'key' as Mark }) })),
      ends: ['first', 'last'],
      empty: 'none: turns go in order',
    });
    const c = coffman(sys, s);
    const yes = (b: boolean, why: string) => (b ? `yes: ${why}` : 'no');
    t.setPanel({
      kind: 'facts',
      id: 'coffman',
      title: 'Coffman conditions (all four: deadlock)',
      facts: [
        { label: 'Mutual exclusion', value: 'yes: one holder per lock' },
        { label: 'Hold and wait', value: yes(c.holdAndWait, 'someone waits while holding') },
        { label: 'No preemption', value: 'yes: locks are never taken away' },
        { label: 'Circular wait', value: yes(c.circularWait, 'a cycle of waits'), ...(c.circularWait && { mark: 'reject' as Mark }) },
        { label: 'Deadlocked', value: cycle ? 'yes' : 'no', ...(cycle && { mark: 'reject' as Mark }) },
      ],
    });
  };

  const onCycle = (e: { from: string; to: string }) => {
    if (!cycle) return false;
    const i = cycle.indexOf(e.from);
    return i >= 0 && cycle[(i + 1) % cycle.length] === e.to;
  };

  t.setAnnotationLabel('the process’s next step');
  draw();
  yield t.frame({
    line: 0,
    note: `${andList(ids)} share ${sys.locks.length === 1 ? 'the lock' : `${sys.locks.length} locks,`} ${andList(sys.locks)}. A lock has one holder at a time, and a process that asks for a held lock must wait. ${input.schedule.length ? 'The schedule says whose turn it is.' : 'They take turns in order.'}`,
    vars: { processes: ids.length, locks: sys.locks.length },
  });

  const turns = function* () {
    for (let i = 0; i < input.schedule.length; i++) yield { pid: input.schedule[i], i };
    for (let i = 0; i < MAX_EXTRA_TURNS * ids.length; i++) yield { pid: ids[i % ids.length], i: -1 };
  };

  let extraTurns = 0;
  for (const { pid, i } of turns()) {
    if (cycle || allDone(sys, s)) break;
    if (isDone(sys, s, pid)) continue;
    if (i < 0 && !extra) {
      extra = true;
      current = null;
      draw();
      yield t.frame({ line: 0, note: `The schedule is used up, and ${andList(ids.filter((p) => !isDone(sys, s, p)))} still ${ids.filter((p) => !isDone(sys, s, p)).length === 1 ? 'has' : 'have'} steps left. From here they take turns in order.` });
    }
    if (i < 0 && ++extraTurns > MAX_EXTRA_TURNS) break;
    turnIndex = i;
    current = pid;
    const before = s;
    const r = step(sys, s, pid);
    s = r.state;
    t.count('turns');
    const st = r.step!;
    const lock = st.op === 'work' ? null : st.lock;
    const vars = { turn: s.time, P: pid, step: words(st), holds: holdings(sys, s, pid).join(', ') || '–' };
    const focus = { nodes: { key: [pid], ...(lock != null ? { compare: [lock] } : {}) } };

    if (r.outcome === 'acquired' || r.outcome === 'blocked') {
      const retry = before.waiting[pid] === lock;
      const owner = before.holder[lock!];
      // Ask on a first attempt, and on a retry once the lock is free again.
      let ask: Checkpoint | undefined;
      if (!retry || owner == null) {
        ask = { question: `Can ${pid} take ${lock} now?`, choices: [`Yes, ${lock} is free`, `No, ${pid} must wait`], answer: r.outcome === 'acquired' ? 0 : 1 };
      }
      if (r.outcome === 'acquired') {
        t.count('acquired');
        draw();
        yield t.frame({
          line: 4,
          note: retry
            ? `${pid} tries ${lock} again, and this time it is free: ${pid} takes it, and the arrow turns round to ${lock} → ${pid}.`
            : `${pid} asks for ${lock}. Nobody holds it, so ${pid} takes it: draw ${lock} → ${pid}.${holdings(sys, s, pid).length > 1 ? ` ${pid} now holds ${andList(holdings(sys, s, pid))}.` : ''}`,
          ...focus,
          pulse: t.edgeId(lock!, pid),
          vars,
          ...(ask && { ask }),
        });
        continue;
      }
      t.count('blocked');
      draw();
      const held = holdings(sys, s, pid);
      yield t.frame({
        line: 5,
        note: retry
          ? `${pid} tries ${lock} again, but ${owner} still holds it, so ${pid} keeps waiting${held.length ? `, still holding ${andList(held)}` : ''}.`
          : `${pid} asks for ${lock}, but ${owner} holds it. ${pid} must wait: draw ${pid} → ${lock}.${held.length ? ` It keeps holding ${andList(held)} while it waits.` : ''}`,
        ...focus,
        vars,
        ...(ask && { ask }),
      });
      if (retry) continue;

      // A new wait: is there a cycle now?
      cycle = deadlockCycle(sys, s);
      current = null;
      draw();
      const deadAsk: Checkpoint = { question: 'Is this a deadlock now?', choices: ['Yes: a cycle of waits', 'No: no cycle yet'], answer: cycle ? 0 : 1 };
      if (cycle) {
        yield t.frame({
          line: 9,
          note: `Follow the arrows from ${pid}: they come back round. ${cycleWords(cycle)}. Every process on the cycle waits for the next, so none of them can ever move: a deadlock. All four Coffman conditions hold.`,
          vars: { cycle: cycle.join(' → ') },
          ask: deadAsk,
        });
        break;
      }
      const chain = chainFrom(sys, s, pid);
      const end = chain.at(-1)!;
      yield t.frame({
        line: 8,
        note: `Follow the arrows from ${pid}: ${chain.join(' → ')}. ${end} isn’t waiting for anything, so there is no cycle: ${end} can carry on and will release ${chain.at(-2)} in time.`,
        vars: { chain: chain.join(' → ') },
        ask: deadAsk,
      });
      continue;
    }

    draw();
    if (r.outcome === 'released') {
      const waiters = ids.filter((p) => s.waiting[p] === lock);
      yield t.frame({
        line: 6,
        note: `${pid} releases ${lock}, so the arrow ${lock} → ${pid} goes. ${waiters.length ? `${andList(waiters)} ${waiters.length === 1 ? 'is' : 'are'} waiting for it and can take it on ${waiters.length === 1 ? 'its' : 'their'} next turn.` : 'Nobody is waiting for it.'}${isDone(sys, s, pid) ? ` ${pid} has finished.` : ''}`,
        ...focus,
        vars,
      });
    } else {
      const held = holdings(sys, s, pid);
      const blocked = ids.filter((p) => s.waiting[p] != null && held.includes(s.waiting[p]!));
      yield t.frame({
        line: 7,
        note: `${pid} does its work while holding ${andList(held) || 'nothing'}.${blocked.length ? ` ${andList(blocked)} ${blocked.length === 1 ? 'keeps' : 'keep'} waiting meanwhile.` : ''}`,
        ...focus,
        vars,
      });
    }
  }

  current = null;
  draw();
  if (cycle) return;
  if (allDone(sys, s)) {
    yield t.frame({
      line: 10,
      note: `Everyone has finished and every lock is free. No cycle of waits ever formed, so there was no deadlock${t.stats.blocked ? `, though processes waited ${t.stats.blocked} time${t.stats.blocked === 1 ? '' : 's'}` : ''}.`,
    });
  } else {
    yield t.frame({ line: 0, note: 'The run stops here: it has taken as many turns as the visualiser allows.' });
  }
}

// ───────────────────────────── input ─────────────────────────────

const NAME = /^[A-Za-z][A-Za-z0-9]{0,2}$/;

export function formatInput(x: DeadlockInput): string {
  return [...x.processes.map((p) => `${p.id}: ${p.script.map(short).join(' ')}`), `turns: ${x.schedule.join(' ')}`].join('; ');
}

export function parseInput(text: string): { value: DeadlockInput } | { error: string } {
  const processes: Proc[] = [];
  let schedule: string[] = [];
  for (const raw of text.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^([^:]+):(.*)$/.exec(part);
    if (!m) return { error: `“${part}” needs a name and a colon, like P1: +R1 w -R1` };
    const name = m[1].trim();
    const tokens = m[2].trim().split(/[\s,]+/).filter(Boolean);
    if (name.toLowerCase() === 'turns') {
      schedule = tokens;
      continue;
    }
    if (!NAME.test(name)) return { error: `“${name}” isn’t a valid process name: use a letter and up to two more letters or digits` };
    if (processes.some((p) => p.id === name)) return { error: `${name} is listed twice` };
    const script: LockStep[] = [];
    for (const tok of tokens) {
      const acq = /^\+([A-Za-z][A-Za-z0-9]{0,2})$/.exec(tok);
      const rel = /^[-−]([A-Za-z][A-Za-z0-9]{0,2})$/.exec(tok);
      if (acq) script.push({ op: 'acquire', lock: acq[1] });
      else if (rel) script.push({ op: 'release', lock: rel[1] });
      else if (/^w(ork)?$/i.test(tok)) script.push({ op: 'work' });
      else return { error: `${name}: “${tok}” isn’t a step. Use +R to take lock R, -R to release it, w to work` };
    }
    if (script.length === 0) return { error: `${name} has no steps` };
    if (script.length > MAX_STEPS) return { error: `${name} has ${script.length} steps; at most ${MAX_STEPS}` };
    processes.push({ id: name, script });
  }
  if (processes.length === 0) return { error: 'Give at least one process, like P1: +R1 w -R1' };
  if (processes.length > MAX_PROCESSES) return { error: `At most ${MAX_PROCESSES} processes` };
  const sys = lockSystem(processes);
  if (sys.locks.length > MAX_LOCKS) return { error: `At most ${MAX_LOCKS} locks` };
  const bad = validate(sys);
  if (bad) return { error: bad };
  if (schedule.length > MAX_TURNS) return { error: `At most ${MAX_TURNS} turns in the schedule` };
  const unknown = schedule.find((pid) => !processes.some((p) => p.id === pid));
  if (unknown) return { error: `The schedule names ${unknown}, which isn’t a process` };
  return { value: { processes, schedule } };
}

// ───────────────────────────── examples ─────────────────────────────

const round = (n: number, times: number) => Array.from({ length: n * times }, (_, i) => `P${(i % n) + 1}`);

function randomInput(seed: number, size: number): DeadlockInput {
  const rng = createRng(seed);
  const n = Math.max(2, Math.min(5, size));
  const locks = ['R1', 'R2', 'R3'].slice(0, n === 2 ? 2 : 3);
  const processes: Proc[] = Array.from({ length: n }, (_, i) => {
    const a = locks[Math.floor(rng() * locks.length)];
    const rest = locks.filter((l) => l !== a);
    const b = rest[Math.floor(rng() * rest.length)];
    return { id: `P${i + 1}`, script: nested([a, b]) };
  });
  const sys = lockSystem(processes);
  return { processes, schedule: randomSchedule(sys, seed + 1, 2 * n + Math.floor(rng() * 4)) };
}

const input: InputSpec<DeadlockInput> = {
  examples: [
    {
      id: 'opposite',
      label: 'Two locks, opposite orders',
      sized: false,
      make: () => ({ processes: [{ id: 'P1', script: nested(['R1', 'R2']) }, { id: 'P2', script: nested(['R2', 'R1']) }], schedule: ['P1', 'P2', 'P1', 'P2'] }),
    },
    {
      id: 'same-order',
      label: 'Two locks, same order',
      sized: false,
      make: () => ({ processes: [{ id: 'P1', script: nested(['R1', 'R2']) }, { id: 'P2', script: nested(['R1', 'R2']) }], schedule: ['P1', 'P2', 'P1', 'P2'] }),
    },
    { id: 'philosophers', label: 'Dining philosophers', sized: false, make: () => ({ processes: philosophers(5, false), schedule: round(5, 2) }) },
    { id: 'philosophers-ordered', label: 'Philosophers, forks in order', sized: false, make: () => ({ processes: philosophers(5, true), schedule: round(5, 2) }) },
    { id: 'random', label: 'Random', make: ({ seed, size }) => randomInput(seed, size) },
  ],
  size: { label: 'Processes', min: 2, max: 5, default: 3 },
  custom: {
    label: 'Processes and turns',
    placeholder: 'e.g. P1: +R1 +R2 w -R2 -R1; P2: +R2 +R1 w -R1 -R2; turns: P1 P2 P1 P2',
    parse: parseInput,
    format: formatInput,
  },
};

export const deadlock = defineAlgorithm<DeadlockInput, GraphState>({
  kind: 'algorithm',
  slug: 'deadlock',
  view: 'graph',
  input,
  pseudocode,
  stats: [
    { key: 'turns', label: 'Turns' },
    { key: 'acquired', label: 'Locks taken' },
    { key: 'blocked', label: 'Times blocked' },
  ],
  legend: [
    { neutral: 'Process or lock' },
    { mark: 'key', label: 'Whose turn it is' },
    { mark: 'compare', label: 'Lock asked for or released' },
    { mark: 'visited', label: 'Held: lock → its holder' },
    { mark: 'frontier', label: 'Waiting: process → lock' },
    { mark: 'sorted', label: 'Finished' },
    { mark: 'reject', label: 'On the cycle: deadlocked' },
  ],
  run: (x) => askAhead(trace(x)),
  content: {
    idea: 'Processes take locks one at a time and hold them while they wait for more. If each waits for a lock the next one holds, round in a circle, none can ever move: a deadlock. Drawing who holds what and who waits for what as a graph turns spotting one into finding a cycle.',
    invariant: 'With one of each resource, the processes are deadlocked exactly when the resource-allocation graph (lock → holder, process → lock it waits for) has a cycle.',
    whenToUse: 'Whenever code takes more than one lock: databases locking rows, a transfer locking two accounts, threads sharing data structures. The usual cure is prevention: take locks in one global order, so a cycle can never close. Databases instead detect the cycle and abort one transaction.',
    traits: [
      { label: 'Needs all four Coffman conditions', good: null },
      { label: 'A global lock order prevents it', good: true },
      { label: 'Depends on timing, so tests may miss it', good: false },
      { label: 'Detection is a cycle search, O(V + E)', good: true },
    ],
    experiments: [
      { example: 'opposite', prompt: 'P1 takes R1, P2 takes R2, then each asks for the other’s lock. Which arrow closes the cycle?' },
      { example: 'same-order', prompt: 'Same schedule, but both take R1 first. P2 waits, yet no cycle can form: why?' },
      { example: 'philosophers', prompt: 'Every philosopher picks up the fork on one side. What happens when they all reach for the other?' },
      { example: 'philosophers-ordered', prompt: 'Only P5 changed: it takes R1 before R5. Which philosopher gets both forks first, and why can the circle never close?' },
    ],
  },
});

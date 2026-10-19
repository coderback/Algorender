// Logical clocks: ordering events in a distributed system without a shared
// clock. Processes do local work, send messages and receive them; an event
// happened before another (a → b) when a chain of process steps and messages
// leads from one to the other (Lamport 1978). Events with no such chain are
// concurrent.
//
// Two ways to stamp events:
//   - Lamport clocks: one number per process. Tick before every event; a
//     receive first jumps past the message's stamp: L ← max(L, stamp) + 1.
//     If a → b then L(a) < L(b), but not the other way round.
//   - Vector clocks: one counter per process. Tick your own entry; a receive
//     takes the entrywise maximum with the stamp first. Then a → b exactly when
//     V(a) ≤ V(b) entrywise and V(a) ≠ V(b), so concurrency becomes visible.
//
// The system-design canvas (phase 6d) uses the per-node rules (`lamportTick`,
// `lamportReceive`, `vectorTick`, `vectorReceive`, `compareVectors`) to stamp
// messages between components; the scenario functions (a fixed list of events
// per process) power the visualiser and the tests. Everything is pure.

export type ClockEvent = { kind: 'local' } | { kind: 'send'; msg: string } | { kind: 'recv'; msg: string };
export type ClockProcess = { id: string; events: readonly ClockEvent[] };
/** Each process's events in its own order. Which process a message goes to is where its `recv` sits. */
export type Scenario = { processes: readonly ClockProcess[] };
/** Event `i` (from 0) of process `p` (an index into `processes`). */
export type EventRef = { p: number; i: number };
export type Vector = readonly number[];
export type Relation = 'before' | 'after' | 'concurrent' | 'same';

// ───────────────────────────── per-node rules ─────────────────────────────

/** Lamport: the clock before an event, ticked. Sends stamp the message with the result. */
export const lamportTick = (clock: number) => clock + 1;
/** Lamport: on receiving a message stamped `stamp`, jump past it. */
export const lamportReceive = (clock: number, stamp: number) => Math.max(clock, stamp) + 1;

/** Vector: process `p` ticks its own entry. */
export const vectorTick = (v: Vector, p: number): Vector => v.map((x, i) => (i === p ? x + 1 : x));
/** Vector: entrywise maximum with the message's stamp, then tick your own entry. */
export const vectorReceive = (v: Vector, stamp: Vector, p: number): Vector => vectorTick(vectorMerge(v, stamp), p);
export const vectorMerge = (v: Vector, stamp: Vector): Vector => v.map((x, i) => Math.max(x, stamp[i] ?? 0));

/** How two vector timestamps compare: `before` means u ≤ v entrywise and u ≠ v (u → v). */
export function compareVectors(u: Vector, v: Vector): 'before' | 'after' | 'equal' | 'concurrent' {
  let less = false;
  let more = false;
  for (let i = 0; i < Math.max(u.length, v.length); i++) {
    const a = u[i] ?? 0;
    const b = v[i] ?? 0;
    if (a < b) less = true;
    if (a > b) more = true;
  }
  return less && more ? 'concurrent' : less ? 'before' : more ? 'after' : 'equal';
}

export const formatVector = (v: Vector) => `[${v.join(',')}]`;

// ───────────────────────────── scenarios ─────────────────────────────

/** "a2": the process's letter in lower case, then the event's number on it. */
export const eventName = (s: Scenario, e: EventRef) => `${s.processes[e.p].id.toLowerCase()}${e.i + 1}`;
export const same = (a: EventRef, b: EventRef) => a.p === b.p && a.i === b.i;

export type Message = { name: string; send: EventRef; recv: EventRef | null };

/** Every message in the order its send appears in `linearize`, with where it is received (null: never). */
export function messages(s: Scenario): Message[] {
  const out: Message[] = [];
  for (const e of linearize(s)) {
    const ev = s.processes[e.p].events[e.i];
    if (ev.kind === 'send') out.push({ name: ev.msg, send: e, recv: receiveOf(s, ev.msg) });
  }
  return out;
}

function receiveOf(s: Scenario, msg: string): EventRef | null {
  for (let p = 0; p < s.processes.length; p++) {
    const i = s.processes[p].events.findIndex((ev) => ev.kind === 'recv' && ev.msg === msg);
    if (i >= 0) return { p, i };
  }
  return null;
}

function sendOf(s: Scenario, msg: string): EventRef | null {
  for (let p = 0; p < s.processes.length; p++) {
    const i = s.processes[p].events.findIndex((ev) => ev.kind === 'send' && ev.msg === msg);
    if (i >= 0) return { p, i };
  }
  return null;
}

/**
 * Why the scenario can't happen, or null: process ids must be distinct, every
 * message sent once, received at most once, by another process, and only
 * after it was sent (no receive may wait, directly or through other messages,
 * on its own send).
 */
export function validateScenario(s: Scenario): string | null {
  if (s.processes.length === 0) return 'There are no processes';
  const ids = new Set(s.processes.map((p) => p.id));
  if (ids.size !== s.processes.length) return 'Two processes have the same name';
  const sent = new Map<string, number>();
  const got = new Map<string, number>();
  s.processes.forEach((proc, p) =>
    proc.events.forEach((ev) => {
      if (ev.kind === 'send') {
        if (sent.has(ev.msg)) return;
        sent.set(ev.msg, p);
      }
    }),
  );
  for (const [p, proc] of s.processes.entries()) {
    const sends = new Set<string>();
    for (const ev of proc.events) {
      if (ev.kind === 'local') continue;
      if (ev.kind === 'send') {
        if (sends.has(ev.msg) || sent.get(ev.msg) !== p) return `Message ${ev.msg} is sent twice`;
        sends.add(ev.msg);
        continue;
      }
      if (!sent.has(ev.msg)) return `Message ${ev.msg} is received but never sent`;
      if (sent.get(ev.msg) === p) return `${proc.id} receives its own message ${ev.msg}`;
      if (got.has(ev.msg)) return `Message ${ev.msg} is received twice`;
      got.set(ev.msg, p);
    }
  }
  if (order(s) === null) return 'A message is received before it could have been sent';
  return null;
}

/**
 * One way the events could have happened in real time: round by round, each
 * process takes its next event if it can (a receive must wait for its send).
 * Null when some receive can never happen.
 */
function order(s: Scenario): EventRef[] | null {
  const next = s.processes.map(() => 0);
  const done = new Set<string>();
  const out: EventRef[] = [];
  const total = s.processes.reduce((n, p) => n + p.events.length, 0);
  while (out.length < total) {
    let progressed = false;
    for (let p = 0; p < s.processes.length; p++) {
      const i = next[p];
      const ev = s.processes[p].events[i];
      if (!ev) continue;
      if (ev.kind === 'recv') {
        const from = sendOf(s, ev.msg);
        if (!from || !done.has(`${from.p}:${from.i}`)) continue;
      }
      out.push({ p, i });
      done.add(`${p}:${i}`);
      next[p]++;
      progressed = true;
    }
    if (!progressed) return null;
  }
  return out;
}

/** The events in a real-time order consistent with the messages. Throws on an impossible scenario. */
export function linearize(s: Scenario): EventRef[] {
  const o = order(s);
  if (!o) throw new Error('This scenario cannot happen: a receive waits on its own send');
  return o;
}

/** Each event's Lamport timestamp, by process then event. */
export function lamportTimes(s: Scenario): number[][] {
  const times = s.processes.map((p) => p.events.map(() => 0));
  const clock = s.processes.map(() => 0);
  const stamp = new Map<string, number>();
  for (const e of linearize(s)) {
    const ev = s.processes[e.p].events[e.i];
    clock[e.p] = ev.kind === 'recv' ? lamportReceive(clock[e.p], stamp.get(ev.msg)!) : lamportTick(clock[e.p]);
    if (ev.kind === 'send') stamp.set(ev.msg, clock[e.p]);
    times[e.p][e.i] = clock[e.p];
  }
  return times;
}

/** Each event's vector timestamp, by process then event. */
export function vectorTimes(s: Scenario): Vector[][] {
  const n = s.processes.length;
  const times: Vector[][] = s.processes.map((p) => p.events.map(() => []));
  const clock: Vector[] = s.processes.map(() => Array<number>(n).fill(0));
  const stamp = new Map<string, Vector>();
  for (const e of linearize(s)) {
    const ev = s.processes[e.p].events[e.i];
    clock[e.p] = ev.kind === 'recv' ? vectorReceive(clock[e.p], stamp.get(ev.msg)!, e.p) : vectorTick(clock[e.p], e.p);
    if (ev.kind === 'send') stamp.set(ev.msg, clock[e.p]);
    times[e.p][e.i] = clock[e.p];
  }
  return times;
}

/** The events that directly follow `e`: the next event on its process, and a send's receive. */
function successors(s: Scenario, e: EventRef): EventRef[] {
  const out: EventRef[] = [];
  if (e.i + 1 < s.processes[e.p].events.length) out.push({ p: e.p, i: e.i + 1 });
  const ev = s.processes[e.p].events[e.i];
  if (ev.kind === 'send') {
    const r = receiveOf(s, ev.msg);
    if (r) out.push(r);
  }
  return out;
}

/**
 * A shortest chain of steps from `a` to `b` (both included) along process
 * lines and messages, or null when there is none. The reference for → .
 */
export function causalPath(s: Scenario, a: EventRef, b: EventRef): EventRef[] | null {
  if (same(a, b)) return null;
  const key = (e: EventRef) => `${e.p}:${e.i}`;
  const prev = new Map<string, EventRef | null>([[key(a), null]]);
  const queue = [a];
  while (queue.length > 0) {
    const e = queue.shift()!;
    for (const n of successors(s, e)) {
      if (prev.has(key(n))) continue;
      prev.set(key(n), e);
      if (same(n, b)) {
        const path = [n];
        for (let at = prev.get(key(n)); at; at = prev.get(key(at))) path.unshift(at);
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** a → b: a chain of process steps and messages leads from a to b. Read from the event graph itself. */
export const happensBefore = (s: Scenario, a: EventRef, b: EventRef) => causalPath(s, a, b) !== null;
export const concurrent = (s: Scenario, a: EventRef, b: EventRef) => !same(a, b) && !happensBefore(s, a, b) && !happensBefore(s, b, a);

export function relation(s: Scenario, a: EventRef, b: EventRef): Relation {
  if (same(a, b)) return 'same';
  return happensBefore(s, a, b) ? 'before' : happensBefore(s, b, a) ? 'after' : 'concurrent';
}

/** Every event, process by process. */
export const allEvents = (s: Scenario): EventRef[] => s.processes.flatMap((proc, p) => proc.events.map((_, i) => ({ p, i })));

/**
 * Lamport's total order: by timestamp, ties broken by process (in the
 * scenario's order). Every process computes the same order, and it respects →.
 */
export function totalOrder(s: Scenario): EventRef[] {
  const t = lamportTimes(s);
  return allEvents(s).sort((a, b) => t[a.p][a.i] - t[b.p][b.i] || a.p - b.p);
}

// ───────────────────────────── random scenarios ─────────────────────────────

/**
 * A random scenario with `processes` processes and about `events` events in
 * all: each step a random process does local work, sends to another process,
 * or receives a message waiting for it. Messages still in flight at the end
 * are delivered. Deterministic for a given rng.
 */
export function randomScenario(rng: () => number, processes: number, events = 3 * processes): Scenario {
  const ids = Array.from({ length: processes }, (_, i) => String.fromCharCode(65 + i));
  const lists: ClockEvent[][] = ids.map(() => []);
  const inFlight: { msg: string; to: number }[] = [];
  let count = 0;
  const pick = (n: number) => Math.floor(rng() * n);
  for (let step = 0; step < events; step++) {
    const p = pick(processes);
    const waiting = inFlight.filter((m) => m.to === p);
    const r = rng();
    if (waiting.length > 0 && r < 0.55) {
      const m = waiting[pick(waiting.length)];
      inFlight.splice(inFlight.indexOf(m), 1);
      lists[p].push({ kind: 'recv', msg: m.msg });
    } else if (r < 0.75) {
      const msg = `m${++count}`;
      const to = (p + 1 + pick(processes - 1)) % processes;
      lists[p].push({ kind: 'send', msg });
      inFlight.push({ msg, to });
    } else {
      lists[p].push({ kind: 'local' });
    }
  }
  for (const m of inFlight) lists[m.to].push({ kind: 'recv', msg: m.msg });
  // A process that did nothing still does one local step, so every line has an event.
  return { processes: ids.map((id, p) => ({ id, events: lists[p].length > 0 ? lists[p] : [{ kind: 'local' }] })) };
}

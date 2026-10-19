import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import {
  allEvents,
  causalPath,
  concurrent,
  eventName,
  formatVector,
  lamportReceive,
  lamportTimes,
  linearize,
  messages,
  randomScenario,
  relation,
  same,
  totalOrder,
  validateScenario,
  vectorMerge,
  vectorReceive,
  vectorTick,
  vectorTimes,
  type ClockEvent,
  type EventRef,
  type Scenario,
  type Vector,
} from '@/systems/clocks';
import type { MarkKey } from '@/viz/marks';
import { ask, askInOrder, plotFrame } from '@/viz/plot/frame';
import { planeGeometry, round } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Readout, Shape, Token, Vec } from '@/viz/plot/types';

// Logical clocks on a space-time diagram (the model is src/systems/clocks.ts):
// one line per process, events as dots in real-time order, messages as
// arrows. The run stamps each event in turn, with Lamport clocks or vector
// clocks, then compares pairs of events: one linked by a chain of messages,
// one with no chain at all, where a smaller Lamport time misleads.

export type ClockMode = 'lamport' | 'vector';
export type ClocksInput = { mode: ClockMode; scenario: Scenario };

export const MAX_PROCESSES = 4;
export const MAX_EVENTS_PER_PROCESS = 12;
export const MAX_EVENTS = 24;

const code = [
  'local event at P:',
  '  tick(P)',
  'send m from P:',
  '  tick(P); stamp m with the clock',
  'receive m at P:',
  '  merge(P, stamp of m); tick(P)',
  '',
  'Lamport clock L:',
  '  tick:  L ← L + 1',
  '  merge: L ← max(L, stamp)',
  'Vector clock V (one entry each):',
  '  tick:  V[P] ← V[P] + 1',
  '  merge: V[i] ← max(V[i], stamp[i])',
  '',
  'e → f  ⇒  L(e) < L(f)',
  'e → f  ⇔  V(e) < V(f): ≤ in every entry',
  '          and < in at least one',
];

// ───────────────────────────── drawing ─────────────────────────────

type Stamp = number | Vector;
const stampText = (t: Stamp) => (typeof t === 'number' ? String(t) : formatVector(t));
/** On the diagram, vectors drop their brackets to stay narrow. */
const stampLabel = (t: Stamp) => (typeof t === 'number' ? String(t) : t.join(','));
const key = (e: EventRef) => `${e.p}:${e.i}`;

type Look = {
  /** Stamps given so far, by event key. */
  stamps: ReadonlyMap<string, Stamp>;
  /** Each process's clock now. */
  clocks: readonly Stamp[];
  marks?: ReadonlyMap<string, MarkKey>;
  /** Messages to mark, by name. */
  messageMarks?: ReadonlyMap<string, MarkKey>;
  /** A causal chain to draw. */
  chain?: readonly EventRef[];
  /** Order of the event list (real time unless it is the total order). */
  list?: { label: string; order: readonly EventRef[] };
};

type Layout = {
  s: Scenario;
  order: EventRef[];
  slot: Map<string, number>;
  at: (e: EventRef) => Vec;
  x: { min: number; max: number };
  y: { min: number; max: number };
};

function layout(s: Scenario): Layout {
  const order = linearize(s);
  const slot = new Map(order.map((e, k) => [key(e), k]));
  const top = s.processes.length - 1;
  return {
    s,
    order,
    slot,
    at: (e) => [slot.get(key(e))!, top - e.p],
    x: { min: -0.7, max: order.length - 0.3 },
    y: { min: -0.6, max: top + 0.6 },
  };
}

/** A message arrow ending just short of the receiving dot, so its head shows. */
function arrow(l: Layout, from: Vec, to: Vec): [Vec, Vec] {
  const g = planeGeometry({ x: l.x, y: l.y, equal: false });
  const [x1, y1] = g.px(from);
  const [x2, y2] = g.px(to);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const back = 7 / len;
  const [wx, wy] = g.world(x2 - (x2 - x1) * back, y2 - (y2 - y1) * back);
  return [from, [round(wx, 2), round(wy, 2)]];
}

function parts(l: Layout, look: Look): PlotPart[] {
  const { s } = l;
  const shapes: Shape[] = s.processes.map((_, p) => ({
    kind: 'path',
    id: `line-${p}`,
    points: [
      [-0.5, s.processes.length - 1 - p],
      [l.order.length - 0.5, s.processes.length - 1 - p],
    ],
    faint: true,
  }));
  const msgs = messages(s);
  for (const m of msgs) {
    if (!m.recv) continue;
    const [from, to] = arrow(l, l.at(m.send), l.at(m.recv));
    shapes.push({ kind: 'vector', id: `msg-${m.name}`, from, to, mark: look.messageMarks?.get(m.name) ?? null });
    shapes.push({ kind: 'label', id: `msg-label-${m.name}`, at: [round((from[0] + to[0]) / 2, 2), round((from[1] + to[1]) / 2, 2)], text: m.name });
  }
  if (look.chain && look.chain.length > 1) shapes.push({ kind: 'path', id: 'chain', points: look.chain.map(l.at), mark: 'path' });
  for (const e of l.order) {
    const stamp = look.stamps.get(key(e));
    const mark = look.marks?.get(key(e)) ?? (stamp != null ? 'visited' : null);
    shapes.push({ kind: 'point', id: `ev-${key(e)}`, at: l.at(e), size: 'md', mark, ...(stamp != null && { label: stampLabel(stamp) }) });
  }

  const list = look.list ?? { label: 'Events in real-time order, with their stamps', order: l.order };
  const tokens: Token[] = list.order.map((e) => {
    const stamp = look.stamps.get(key(e));
    const mark = look.marks?.get(key(e)) ?? (stamp != null ? 'visited' : null);
    return { id: `t-${key(e)}`, text: eventName(s, e), sub: stamp != null ? stampText(stamp) : '–', mark };
  });

  const items: Readout[] = [
    ...s.processes.map((proc, p) => ({ id: `clock-${proc.id}`, label: `${proc.id}’s clock`, value: stampText(look.clocks[p]) })),
    ...msgs.map((m) => {
      const sent = look.stamps.get(key(m.send));
      const got = m.recv && look.stamps.has(key(m.recv));
      const route = `${eventName(s, m.send)} → ${m.recv ? eventName(s, m.recv) : 'lost'}`;
      return {
        id: `stamp-${m.name}`,
        label: `${m.name} (${route})`,
        value: sent == null ? 'not sent yet' : `carries ${stampText(sent)}${got ? ', delivered' : ''}`,
        mark: look.messageMarks?.get(m.name) ?? null,
      };
    }),
  ];

  const plane: PlanePart = {
    kind: 'plane',
    id: 'plane',
    label: 'Space-time diagram: one line per process, time runs left to right, arrows are messages',
    x: { min: l.x.min, max: l.x.max, ticks: [], label: 'real time →' },
    y: { min: l.y.min, max: l.y.max, ticks: s.processes.map((proc, p) => ({ at: s.processes.length - 1 - p, label: proc.id })) },
    equal: false,
    shapes,
    handles: [],
  };
  return [{ kind: 'tokens', id: 'events', label: list.label, tokens }, plane, { kind: 'readouts', id: 'clocks', label: 'Clocks and messages', items }];
}

// ───────────────────────────── the run ─────────────────────────────

type Stats = { stamped: number; messages: number };

/** The pair to show happened-before with: a long chain of steps and messages across processes. */
function linkedPair(s: Scenario): [EventRef, EventRef] | null {
  let best: [EventRef, EventRef] | null = null;
  let bestLength = 0;
  for (const a of allEvents(s)) {
    for (const b of allEvents(s)) {
      if (a.p === b.p) continue;
      const path = causalPath(s, a, b);
      if (path && path.length > bestLength) {
        best = [a, b];
        bestLength = path.length;
      }
    }
  }
  return best;
}

/** A concurrent pair on two processes, the one whose Lamport times differ most (smaller first). */
function concurrentPair(s: Scenario): [EventRef, EventRef] | null {
  const L = lamportTimes(s);
  let best: [EventRef, EventRef] | null = null;
  let gap = -1;
  for (const a of allEvents(s)) {
    for (const b of allEvents(s)) {
      if (a.p === b.p || !concurrent(s, a, b)) continue;
      const d = L[b.p][b.i] - L[a.p][a.i];
      if (d > gap) {
        best = [a, b];
        gap = d;
      }
    }
  }
  return best;
}

function* run(input: ClocksInput): Generator<Frame<PlotState>> {
  const { mode, scenario: s } = input;
  const l = layout(s);
  const n = s.processes.length;
  const lamport = mode === 'lamport';
  const zero: Stamp = lamport ? 0 : Array<number>(n).fill(0);
  const clocks: Stamp[] = s.processes.map(() => zero);
  const stamps = new Map<string, Stamp>();
  const sent = new Map<string, Stamp>();
  const stats: Stats = { stamped: 0, messages: 0 };
  const name = (e: EventRef) => eventName(s, e);
  const pid = (e: EventRef) => s.processes[e.p].id;
  const frame = (
    look: Partial<Look>,
    o: { note: string; line?: number | null; vars?: Record<string, VarValue>; checkpoint?: Checkpoint },
  ): Frame<PlotState> => plotFrame(parts(l, { stamps: new Map(stamps), clocks: [...clocks], ...look }), { ...o, stats: { ...stats } });

  const count = `${n} processes and ${l.order.length} events`;
  yield frame(
    {},
    {
      line: lamport ? 7 : 10,
      note: lamport
        ? `${count}, and no shared clock. With Lamport clocks every process keeps one counter, starting at 0, and stamps each event so that a cause always gets a smaller number than its effect.`
        : `${count}, and no shared clock. With vector clocks every process keeps one counter per process, all starting at 0: entry B of A’s vector counts how many of B’s events A has heard of.`,
    },
  );

  for (const e of l.order) {
    const ev: ClockEvent = s.processes[e.p].events[e.i];
    const P = pid(e);
    const before = clocks[e.p];
    const current = new Map([[key(e), 'key' as MarkKey]]);
    if (ev.kind === 'recv') {
      const stamp = sent.get(ev.msg)!;
      const messageMarks = new Map([[ev.msg, 'compare' as MarkKey]]);
      const after: Stamp = lamport ? lamportReceive(before as number, stamp as number) : vectorReceive(before as Vector, stamp as Vector, e.p);
      let checkpoint: Checkpoint | undefined;
      if (lamport) {
        const L = before as number;
        const t = stamp as number;
        checkpoint = ask(`What timestamp does ${name(e)} get?`, String(after), [L + 1, Math.max(L, t), t, t + 2, L + t + 1].map(String));
      } else {
        const V = before as Vector;
        const T = stamp as Vector;
        const sender = messages(s).find((m) => m.name === ev.msg)!.send.p;
        checkpoint = ask(`What is ${P}’s vector after receiving ${ev.msg}?`, formatVector(after as Vector), [
          formatVector(vectorMerge(V, T)),
          formatVector(vectorTick(V, e.p)),
          formatVector(vectorTick(vectorMerge(V, T), sender)),
        ]);
      }
      yield frame(
        { marks: current, messageMarks },
        {
          line: 4,
          note: `${name(e)}: ${P} receives ${ev.msg}, which carries ${stampText(stamp)}, while ${P}’s clock reads ${stampText(before)}.`,
          vars: { event: name(e), clock: stampText(before), stamp: stampText(stamp) },
          checkpoint,
        },
      );
      clocks[e.p] = after;
      stamps.set(key(e), after);
      stats.stamped++;
      stats.messages++;
      yield frame(
        { marks: current, messageMarks },
        {
          line: 5,
          note: lamport
            ? `max(${before}, ${stamp}) + 1 = ${after}: ${name(e)} is stamped ${after}, later than the send it depends on${(before as number) >= (stamp as number) ? `; here ${P} was already ahead, so it just ticks` : `, so ${P}’s clock jumps forward`}.`
            : `Take the larger of each entry, ${formatVector(before as Vector)} and ${formatVector(stamp as Vector)} give ${formatVector(vectorMerge(before as Vector, stamp as Vector))}, then ${P} ticks its own entry: ${formatVector(after as Vector)}. ${P} now knows of everything the sender had seen.`,
          vars: { event: name(e), clock: stampText(after) },
        },
      );
      continue;
    }
    const after: Stamp = lamport ? (before as number) + 1 : vectorTick(before as Vector, e.p);
    clocks[e.p] = after;
    stamps.set(key(e), after);
    stats.stamped++;
    if (ev.kind === 'send') sent.set(ev.msg, after);
    yield frame(
      { marks: current, ...(ev.kind === 'send' && { messageMarks: new Map([[ev.msg, 'compare' as MarkKey]]) }) },
      {
        line: ev.kind === 'send' ? 3 : 1,
        note:
          ev.kind === 'send'
            ? lamport
              ? `${name(e)}: ${P} sends ${ev.msg}. It ticks from ${before} to ${after} and writes ${after} on the message, so the receiver can make sure to come later.`
              : `${name(e)}: ${P} sends ${ev.msg}. It ticks to ${formatVector(after as Vector)} and attaches the whole vector: everything ${P} has seen travels with the message.`
            : lamport
              ? `${name(e)} is a local event: ${P} ticks from ${before} to ${after}${stats.stamped === 1 ? ', so each event on a process gets a larger number than the one before' : ''}.`
              : `${name(e)} is a local event: ${P} adds 1 to its own entry, ${formatVector(before as Vector)} → ${formatVector(after as Vector)}.`,
        vars: { event: name(e), clock: stampText(after) },
      },
    );
  }

  const L = lamportTimes(s);
  const V = vectorTimes(s);
  const shown = (e: EventRef) => `${name(e)} (${stampText(lamport ? L[e.p][e.i] : V[e.p][e.i])})`;

  if (lamport) {
    yield frame(
      { list: { label: 'Lamport’s total order: by timestamp, ties broken by process', order: totalOrder(s) } },
      {
        line: 14,
        note: 'Every event is stamped. Sorting by timestamp and breaking ties by process name gives one total order that every process can work out for itself, and it never puts an effect before its cause.',
      },
    );
  }

  const asked = (x: EventRef, y: EventRef) =>
    askInOrder(`Did ${name(x)} happen before ${name(y)}, after it, or neither?`, [`${name(x)} happened before ${name(y)}`, `${name(y)} happened before ${name(x)}`, 'Concurrent'], {
      before: `${name(x)} happened before ${name(y)}`,
      after: `${name(y)} happened before ${name(x)}`,
      concurrent: 'Concurrent',
      same: 'Concurrent',
    }[relation(s, x, y)]);
  const compareLine = lamport ? 14 : 15;

  const linked = linkedPair(s);
  if (linked) {
    const [a, b] = linked;
    // Ask about the later event first on every other scenario, so the answer isn't always the first choice.
    const [x, y] = l.order.length % 2 === 0 ? [b, a] : [a, b];
    const pair = new Map([
      [key(a), 'compare' as MarkKey],
      [key(b), 'compare' as MarkKey],
    ]);
    yield frame({ marks: pair }, { line: compareLine, note: `Compare ${shown(x)} with ${shown(y)}.`, vars: { e: name(x), f: name(y) }, checkpoint: asked(x, y) });
    const chain = causalPath(s, a, b)!;
    const hops = chain.map(name).join(' → ');
    const via = new Set<string>();
    for (const m of messages(s)) if (m.recv && chain.some((c, k) => k > 0 && same(chain[k - 1], m.send) && same(c, m.recv!))) via.add(m.name);
    const marks = new Map(chain.map((c) => [key(c), 'path' as MarkKey]));
    yield frame(
      { marks, chain, messageMarks: new Map([...via].map((m) => [m, 'path' as MarkKey])) },
      {
        line: compareLine,
        note: lamport
          ? `${name(a)} happened before ${name(b)}: the chain ${hops} leads from one to the other along process lines and messages. As Lamport’s rule promises, ${L[a.p][a.i]} < ${L[b.p][b.i]}.`
          : `${name(a)} happened before ${name(b)}: ${formatVector(V[a.p][a.i])} is ≤ ${formatVector(V[b.p][b.i])} in every entry and smaller in at least one, and the chain ${hops} is why.`,
        vars: { e: name(a), f: name(b) },
      },
    );
  }

  const loose = concurrentPair(s);
  if (loose) {
    const [a, b] = loose;
    const pair = new Map([
      [key(a), 'compare' as MarkKey],
      [key(b), 'compare' as MarkKey],
    ]);
    yield frame({ marks: pair }, { line: compareLine, note: `Now compare ${shown(a)} with ${shown(b)}.`, vars: { e: name(a), f: name(b) }, checkpoint: asked(a, b) });
    const la = L[a.p][a.i];
    const lb = L[b.p][b.i];
    yield frame(
      { marks: pair },
      {
        line: compareLine,
        note: lamport
          ? `Neither: no chain of steps and messages joins ${name(a)} and ${name(b)}, so they are concurrent${la < lb ? `, although ${la} < ${lb}. A smaller Lamport time does not mean happened-before, and Lamport clocks can’t tell concurrent events from ordered ones` : `. Their equal timestamps say nothing either way`}.`
          : `Neither: ${formatVector(V[a.p][a.i])} is larger in one entry and ${formatVector(V[b.p][b.i])} in another, so neither is ≤ the other and the events are concurrent. Vector clocks catch this exactly; Lamport times alone (${la} and ${lb}) can’t.`,
        vars: { e: name(a), f: name(b) },
      },
    );
  }

  if (!linked && !loose) {
    yield frame({}, { line: compareLine, note: 'Every event is stamped.' });
  }
}

// ───────────────────────────── input ─────────────────────────────

const ev = {
  local: { kind: 'local' } as ClockEvent,
  send: (msg: string): ClockEvent => ({ kind: 'send', msg }),
  recv: (msg: string): ClockEvent => ({ kind: 'recv', msg }),
};

/** A sends to B, B to C: each receive has to jump past the stamp it gets. */
const CHAIN: Scenario = {
  processes: [
    { id: 'A', events: [ev.local, ev.send('m1')] },
    { id: 'B', events: [ev.local, ev.recv('m1'), ev.send('m2')] },
    { id: 'C', events: [ev.local, ev.recv('m2'), ev.local] },
  ],
};

/** A is busy on its own, so its numbers run ahead of events it never heard about. */
const MISLEADS: Scenario = {
  processes: [
    { id: 'A', events: [ev.local, ev.local, ev.local, ev.send('m2')] },
    { id: 'B', events: [ev.local, ev.send('m1'), ev.recv('m2')] },
    { id: 'C', events: [ev.recv('m1'), ev.local] },
  ],
};

const random = (mode: ClockMode) => ({ seed, size }: { seed: number; size: number }): ClocksInput => {
  const processes = Math.min(MAX_PROCESSES, Math.max(3, size || 3));
  return { mode, scenario: randomScenario(createRng(seed), processes, 2 * processes + 2) };
};

function formatEvent(e: ClockEvent): string {
  return e.kind === 'local' ? 'local' : `${e.kind} ${e.msg}`;
}

export function formatClocks(input: ClocksInput): string {
  return [input.mode, ...input.scenario.processes.map((p) => `${p.id}: ${p.events.map(formatEvent).join(', ')}`)].join('; ');
}

export function parseClocks(text: string): { value: ClocksInput } | { error: string } {
  const pieces = text
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
  const mode = pieces.shift()?.toLowerCase();
  if (mode !== 'lamport' && mode !== 'vector') return { error: 'Start with "lamport;" or "vector;"' };
  if (pieces.length < 2 || pieces.length > MAX_PROCESSES) return { error: `Give 2 to ${MAX_PROCESSES} processes, separated by semicolons` };
  const processes: { id: string; events: ClockEvent[] }[] = [];
  for (const piece of pieces) {
    const m = /^([A-Z])\s*:\s*(.*)$/.exec(piece);
    if (!m) return { error: `Write each process as a capital letter and its events, e.g. "A: local, send m1" (not "${piece}")` };
    const events: ClockEvent[] = [];
    for (const word of m[2].split(',').map((w) => w.trim().toLowerCase())) {
      if (word === 'local') events.push({ kind: 'local' });
      else {
        const e = /^(send|recv|receive)\s+([a-z][a-z0-9]{0,3})$/.exec(word);
        if (!e) return { error: `Unknown event "${word}": use local, send m1 or recv m1` };
        events.push(e[1] === 'send' ? { kind: 'send', msg: e[2] } : { kind: 'recv', msg: e[2] });
      }
    }
    if (events.length === 0 || events.length > MAX_EVENTS_PER_PROCESS) return { error: `Give each process 1 to ${MAX_EVENTS_PER_PROCESS} events` };
    processes.push({ id: m[1], events });
  }
  if (processes.reduce((k, p) => k + p.events.length, 0) > MAX_EVENTS) return { error: `Use at most ${MAX_EVENTS} events in all` };
  const scenario = { processes };
  const problem = validateScenario(scenario);
  return problem ? { error: problem } : { value: { mode, scenario } };
}

export const logicalClocks = defineAlgorithm<ClocksInput, PlotState>({
  kind: 'algorithm',
  slug: 'logical-clocks',
  view: 'plot',
  input: {
    examples: [
      { id: 'chain', label: 'Lamport: a message chain', sized: false, make: () => ({ mode: 'lamport', scenario: CHAIN }) },
      { id: 'misleads', label: 'Lamport: smaller isn’t earlier', sized: false, make: () => ({ mode: 'lamport', scenario: MISLEADS }) },
      { id: 'random', label: 'Lamport: random', make: random('lamport') },
      { id: 'chain-vector', label: 'Vector: a message chain', sized: false, make: () => ({ mode: 'vector', scenario: CHAIN }) },
      { id: 'misleads-vector', label: 'Vector: spotting concurrency', sized: false, make: () => ({ mode: 'vector', scenario: MISLEADS }) },
      { id: 'random-vector', label: 'Vector: random', make: random('vector') },
    ],
    size: { label: 'Processes', min: 3, max: MAX_PROCESSES, default: 3 },
    custom: {
      label: 'Clock and events per process',
      placeholder: 'lamport; A: local, send m1; B: recv m1',
      parse: parseClocks,
      format: formatClocks,
    },
  },
  pseudocode: code,
  stats: [
    { key: 'stamped', label: 'Events stamped' },
    { key: 'messages', label: 'Messages received' },
  ],
  legend: [
    { neutral: 'Not stamped yet' },
    { mark: 'key', label: 'Event being stamped' },
    { mark: 'visited', label: 'Stamped' },
    { mark: 'compare', label: 'Message in use, or a pair being compared' },
    { mark: 'path', label: 'Chain of cause and effect' },
  ],
  run,
  content: {
    idea: 'A distributed system has no shared clock, yet we still need to know what could have caused what. Logical clocks stamp events with counters instead of times: Lamport clocks keep one number per process, vector clocks one number per process for every process.',
    invariant:
      'If a happened before b (a chain of steps and messages leads from a to b), then L(a) < L(b). With vector clocks it works both ways: a happened before b exactly when V(a) ≤ V(b) in every entry and the two differ; otherwise they are concurrent.',
    whenToUse:
      'Lamport timestamps give every node the same total order of events (total-order broadcast, distributed mutual exclusion), and Raft’s terms are a logical clock too. Vector clocks and version vectors detect concurrent updates, as in Dynamo-style stores that keep both versions for the application to merge.',
    traits: [
      { label: 'No synchronised physical clocks needed', good: true },
      { label: 'Lamport: one number, but blind to concurrency', good: false },
      { label: 'Vector: exact causality, one entry per process', good: null },
      { label: 'Happened-before is a partial order', good: null },
    ],
    experiments: [
      { example: 'chain', prompt: 'At b2, B’s clock reads 1 but m1 carries 2, so b2 is stamped 3: after the send it depends on.' },
      { example: 'misleads', prompt: 'a1 is stamped 1 and c2 is stamped 4, yet nothing links them: a smaller Lamport time is no proof of happened-before.' },
      { example: 'misleads-vector', prompt: 'The same events with vector clocks: compare a1 and c2 entry by entry, and neither is ≤ the other.' },
    ],
  },
});

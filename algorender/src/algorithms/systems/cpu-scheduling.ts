import { joinWords } from '@/algorithms/dp/shared';
import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import {
  admit,
  choose,
  dispatch,
  done,
  expire,
  idleStretches,
  keyOf,
  metrics,
  POLICY_NAMES,
  runTick,
  simulate,
  start,
  waitingStretches,
  type Policy,
  type Process,
  type SchedulerState,
} from '@/systems/scheduling';

// CPU scheduling on a Gantt chart. The simulation is src/systems/scheduling.ts;
// this module walks it tick by tick exactly as its `tick` does (admit, expire,
// choose, dispatch, run) and yields a frame at every decision and run.

export type SchedulingInput = { policy: Policy; processes: Process[] };

export const MAX_PROCESSES = 8;
export const MAX_ARRIVAL = 20;
export const MAX_BURST = 10;
export const MAX_PRIORITY = 9;
export const MAX_QUANTUM = 8;
/** The Gantt chart is one column per unit of time. */
export const MAX_TIME = 40;

const GANTT = 'gantt';
const READY = 'ready';
const CPU = 'cpu';
const METRICS = 'metrics';
const IDLE = 'idle';
const AVG = 'avg';

const pseudocode = [
  't ← 0',
  'loop until every process finishes:',
  '  add arrivals at t to the ready queue',
  '  if the running slice is used up:',
  '    move it to the back of the queue',
  '  pick the next process by the rule',
  '  if a better one is ready: preempt',
  '  run it for one tick; t ← t + 1',
  '  if it has no work left: it finishes',
];

const RULES: Record<Policy['kind'], string> = {
  fcfs: 'run whoever arrived first, to completion',
  sjf: 'when the CPU is free, run the shortest job waiting, to completion',
  srtf: 'always run whoever has the least work left, preempting if a shorter one arrives',
  rr: 'take turns from the front of the queue, at most one quantum each',
  priority: 'always run the most urgent (lowest number) priority, preempting if a more urgent one arrives',
};

const policyLabel = (p: Policy) => (p.kind === 'rr' ? `${POLICY_NAMES.rr} (quantum ${p.quantum})` : POLICY_NAMES[p.kind]);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round1 = (x: number) => String(Math.round(x * 10) / 10);

function* run(input: SchedulingInput): Generator<Frame<GridState>> {
  const { policy, processes: ps } = input;
  const final = simulate(policy, ps);
  const cols = Array.from({ length: Math.max(1, final.time) }, () => ({ label: '' }));
  const prio = policy.kind === 'priority';
  const info = new Map(ps.map((p) => [p.id, p]));
  const t = new GridTracer(['time', 'switches', 'finished', 'idle']);

  t.addTable({
    id: GANTT,
    label: 'Gantt chart',
    look: 'timeline',
    rows: [
      ...ps.map((p) => ({ id: p.id, label: p.id, sub: `at ${p.arrival} · needs ${p.burst}${prio ? ` · priority ${p.priority}` : ''}` })),
      ...(final.idle > 0 ? [{ id: IDLE, label: 'Idle' }] : []),
    ],
    cols,
    group: 'time',
  });
  t.addList({ id: CPU, label: 'On the CPU', empty: 'Nothing: the CPU is idle' });
  t.addList({ id: READY, label: policy.kind === 'fcfs' || policy.kind === 'rr' ? 'Ready queue (front first)' : 'Ready queue (in arrival order)', empty: 'Empty' });
  const metricCols = ['Arrival', 'Burst', ...(prio ? ['Priority'] : []), 'First run', 'Finish', 'Turnaround', 'Waiting', 'Response'];
  const col = (name: string) => metricCols.indexOf(name);
  t.addTable({
    id: METRICS,
    label: 'Per process',
    corner: 'Process',
    rows: [...ps.map((p) => ({ id: p.id, label: p.id })), { id: AVG, label: 'Average' }],
    cols: metricCols.map((label) => ({ label })),
  });
  ps.forEach((p, r) => {
    t.set([METRICS, r, col('Arrival')], p.arrival);
    t.set([METRICS, r, col('Burst')], p.burst);
    if (prio) t.set([METRICS, r, col('Priority')], p.priority);
  });

  // ── keeping the picture in step with the model ──
  const seenBars = new Set<string>();
  const bar = (id: string, row: string, from: number, to: number, mark: 'visited' | 'frontier' | 'reject') => {
    t.setBar(id, row, from, to, GANTT);
    if (!seenBars.has(id)) {
      seenBars.add(id);
      t.mark({ bar: id, table: GANTT }, mark);
    }
  };
  const runBar = new Map<string, string>();
  let readyIds: string[] = [];
  let cpuItem: string | null = null;
  let shown = { time: 0, switches: 0, idle: 0 };
  const describe = (s: SchedulerState, id: string) => {
    const p = info.get(id)!;
    return prio ? `${id} · priority ${p.priority} · ${s.remaining[id]} left` : `${id} · ${s.remaining[id]} left`;
  };
  const show = (s: SchedulerState) => {
    const count = new Map<string, number>();
    for (const seg of s.segments) {
      const k = count.get(seg.process) ?? 0;
      count.set(seg.process, k + 1);
      const id = `${seg.process}-run${k}`;
      bar(id, seg.process, seg.from, seg.to, 'visited');
      runBar.set(seg.process, id);
    }
    for (const id of s.admitted) waitingStretches(s, id).forEach((w, k) => bar(`${id}-wait${k}`, id, w.from, w.to, 'frontier'));
    if (final.idle > 0) idleStretches(s).forEach((w, k) => bar(`${IDLE}-${k}`, IDLE, w.from, w.to, 'reject'));

    for (const id of readyIds) if (!s.ready.includes(id)) t.removeItem(READY, id);
    for (const id of s.ready) if (!readyIds.includes(id)) t.addItem(READY, { id, text: describe(s, id), mark: 'frontier' });
    readyIds = [...s.ready];
    for (const id of readyIds) t.setItemText(READY, id, describe(s, id));
    t.reorderItems(READY, readyIds);

    if (cpuItem !== null && cpuItem !== s.running) t.removeItem(CPU, cpuItem);
    if (s.running !== null && cpuItem !== s.running) t.addItem(CPU, { id: s.running, text: describe(s, s.running), mark: 'key' });
    if (s.running !== null) t.setItemText(CPU, s.running, describe(s, s.running));
    cpuItem = s.running;

    t.count('time', s.time - shown.time);
    t.count('switches', s.switches - shown.switches);
    t.count('idle', s.idle - shown.idle);
    shown = { time: s.time, switches: s.switches, idle: s.idle };
  };
  const now = (s: SchedulerState) => [{ at: s.time, label: `t = ${s.time}`, mark: 'compare' as const, table: GANTT }];
  const vars = (s: SchedulerState) => ({
    t: s.time,
    running: s.running ?? 'none',
    ready: s.ready.length,
    ...(policy.kind === 'rr' && { quantum: policy.quantum, slice: s.slice }),
  });
  const running = (s: SchedulerState) => (s.running ? [{ bar: runBar.get(s.running) ?? '', table: GANTT }].filter((r) => r.bar) : []);
  const amount = (s: SchedulerState, id: string) => (prio ? `priority ${info.get(id)!.priority}` : `${s.remaining[id]} left`);

  let s = start(ps);
  show(s);
  yield t.frame({
    line: 0,
    note: `${plural(ps.length, 'process', 'processes')} share one CPU under ${policyLabel(policy)}: ${RULES[policy.kind]}.`,
    guides: now(s),
    vars: vars(s),
  });

  let stretch: { from: number; who: string | null } | null = null;
  while (!done(s)) {
    const at = s.time;
    const admitted = admit(s);
    const arrivals = admitted.admitted.slice(s.admitted.length);
    const after = expire(policy, admitted);
    const quantumUp = admitted.running !== null && after.running === null;
    const next = choose(policy, after);
    const changes = next !== after.running;

    if (arrivals.length > 0 || quantumUp || changes) {
      const candidates = ps.map((p) => p.id).filter((id) => id === after.running || after.ready.includes(id));
      const parts = [
        ...(arrivals.length ? [`${joinWords(arrivals)} ${arrivals.length === 1 ? 'arrives' : 'arrive'}`] : []),
        ...(quantumUp ? [`${admitted.running}'s quantum of ${policy.kind === 'rr' ? policy.quantum : 0} is up, so it goes to the back of the queue`] : []),
        ...(after.running === null && !quantumUp ? ['the CPU is free'] : []),
      ];
      const situation = `t = ${at}: ${joinWords(parts)}.`;

      if (changes && candidates.length >= 2) {
        show(after);
        yield t.frame({
          line: quantumUp ? 4 : arrivals.length ? 2 : 5,
          // The choices read "P3 (1 left)"; the note words it differently so it never spells out an answer.
          note: `${situation} Ready: ${joinWords(after.ready.map((id) => `${id} with ${amount(after, id)}`))}${after.running ? `; ${after.running} is running with ${amount(after, after.running)}` : ''}.`,
          marks: { key: after.running ? [{ item: after.running, list: CPU }] : [] },
          guides: now(after),
          vars: vars(after),
          checkpoint: {
            question: `Which process gets the CPU at t = ${at}?`,
            choices: candidates.map((id) => `${id} (${amount(after, id)})`),
            answer: candidates.indexOf(next!),
          },
        });
      }

      const dispatched = dispatch(after, next);
      const preempted = changes && after.running !== null ? after.running : null;
      show(dispatched);
      let why: string;
      if (!changes) {
        // Arrivals (or the end of a quantum with nobody waiting) that leave the running process where it is.
        const best = after.ready.length ? choose(policy, { ...after, running: null }) : null;
        why =
          after.running === null
            ? 'Nothing is ready yet.'
            : policy.kind === 'fcfs' || policy.kind === 'sjf'
              ? `${policy.kind === 'fcfs' ? 'FCFS' : 'SJF'} never takes the CPU away from a running process, so ${after.running} carries on.`
              : policy.kind === 'rr'
                ? `${after.running} carries on until its quantum is up.`
                : `The ${policy.kind === 'srtf' ? 'shortest' : 'most urgent'} one waiting, ${best} with ${amount(after, best!)}, is no ${policy.kind === 'srtf' ? 'shorter' : 'more urgent'} than ${after.running} with ${amount(after, after.running)}, so ${after.running} keeps the CPU.`;
      } else if (next === null) {
        why = 'Nothing else is ready.';
      } else if (preempted) {
        why =
          policy.kind === 'srtf'
            ? `${next} has ${after.remaining[next]} left, less than ${preempted}'s ${after.remaining[preempted]}, so SRTF preempts ${preempted} and runs ${next}.`
            : `${next} has priority ${info.get(next)!.priority}, more urgent than ${preempted}'s ${info.get(preempted)!.priority}, so it preempts ${preempted}.`;
      } else {
        const others = after.ready.filter((id) => id !== next);
        const tie = others.some((id) => keyOf(policy, after, id) === keyOf(policy, after, next));
        why =
          policy.kind === 'fcfs'
            ? `FCFS runs the front of the queue: ${next}, which arrived ${others.length ? 'first' : 'and is the only one waiting'}.`
            : policy.kind === 'rr'
              ? `Round robin runs the front of the queue, ${next}, for up to ${policy.quantum} ${policy.quantum === 1 ? 'tick' : 'ticks'}.`
              : policy.kind === 'sjf'
                ? `SJF runs the shortest job waiting: ${next} needs ${info.get(next)!.burst}${tie ? ' (a tie, so the earlier arrival)' : ''}.`
                : policy.kind === 'srtf'
                  ? `SRTF runs the least work left: ${next}, with ${after.remaining[next]}${tie ? ' (a tie, so the earlier arrival)' : ''}.`
                  : `Priority runs the most urgent: ${next}, priority ${info.get(next)!.priority}${tie ? ' (a tie, so the earlier arrival)' : ''}.`;
      }
      yield t.frame({
        line: preempted ? 6 : changes ? 5 : 2,
        note: changes && candidates.length >= 2 ? why : `${situation} ${why}`,
        marks: { key: dispatched.running ? [{ item: dispatched.running, list: CPU }] : [] },
        guides: now(dispatched),
        vars: vars(dispatched),
      });
      s = dispatched;
    } else {
      s = after;
    }

    // One unit of time, then keep going while nothing happens that needs a decision.
    stretch ??= { from: s.time, who: s.running };
    s = runTick(s);
    const finished = stretch.who !== null && s.running === null && stretch.who in s.finish ? stretch.who : null;
    let quiet = !finished && !done(s);
    if (quiet) {
      const a2 = admit(s);
      const e2 = expire(policy, a2);
      quiet = a2 === s && !(a2.running !== null && e2.running === null) && choose(policy, e2) === e2.running;
    }
    if (quiet) continue;

    const { from, who } = stretch;
    stretch = null;
    show(s);
    if (who === null) {
      yield t.frame({
        line: 7,
        note: `Nothing has arrived yet, so the CPU sits idle from ${from} to ${s.time}.`,
        marks: { reject: [{ bar: `${IDLE}-${idleStretches(s).length - 1}`, table: GANTT }] },
        guides: now(s),
        vars: vars(s),
      });
      continue;
    }
    if (finished) {
      const p = info.get(finished)!;
      const end = s.finish[finished];
      const turnaround = end - p.arrival;
      const r = ps.indexOf(p);
      t.mark({ row: r, table: GANTT }, 'sorted');
      t.mark({ row: r, table: METRICS }, 'sorted');
      t.set([METRICS, r, col('First run')], s.firstRun[finished]);
      t.set([METRICS, r, col('Finish')], end);
      t.set([METRICS, r, col('Turnaround')], turnaround);
      t.set([METRICS, r, col('Waiting')], turnaround - p.burst);
      t.set([METRICS, r, col('Response')], s.firstRun[finished] - p.arrival);
      t.count('finished');
      yield t.frame({
        line: 8,
        note: `${finished} runs from ${from} to ${end} and finishes: turnaround ${end} − ${p.arrival} = ${turnaround}, of which ${turnaround - p.burst} waiting.`,
        marks: { sorted: [{ bar: runBar.get(finished)!, table: GANTT }] },
        guides: now(s),
        vars: vars(s),
      });
      continue;
    }
    yield t.frame({
      line: 7,
      note: `${who} runs from ${from} to ${s.time}${s.remaining[who] ? ` and has ${s.remaining[who]} left` : ''}.`,
      marks: { key: [...running(s), { item: who, list: CPU }] },
      guides: now(s),
      vars: vars(s),
    });
  }

  const m = metrics(s);
  const avgRow = ps.length;
  t.set([METRICS, avgRow, col('Turnaround')], round1(m.avgTurnaround));
  t.set([METRICS, avgRow, col('Waiting')], round1(m.avgWaiting));
  t.set([METRICS, avgRow, col('Response')], round1(m.avgResponse));
  yield t.frame({
    line: 1,
    note: `All done at t = ${s.time}: on average ${round1(m.avgWaiting)} waiting, ${round1(m.avgTurnaround)} turnaround and ${round1(m.avgResponse)} until first run, with ${plural(m.switches, 'context switch', 'context switches')} and the CPU busy ${Math.round(m.utilisation * 100)}% of the time.`,
    marks: { found: [{ row: avgRow, table: METRICS }] },
    guides: now(s),
    vars: vars(s),
  });
}

// ─────────────────────────────── input ───────────────────────────────

const procs = (rows: readonly (readonly [number, number, number?])[]): Process[] => rows.map(([arrival, burst, priority = 1], i) => ({ id: `P${i + 1}`, arrival, burst, priority }));

const CONVOY = [[0, 8], [1, 2], [2, 1], [3, 3]] as const;
const TURNS = [[0, 5], [0, 3], [1, 4]] as const;

function randomJobs(seed: number): SchedulingInput {
  const rng = createRng(seed);
  const n = 5;
  return {
    policy: { kind: 'rr', quantum: 2 },
    processes: procs(Array.from({ length: n }, () => [Math.floor(rng() * 9), 1 + Math.floor(rng() * 5)] as const)),
  };
}

const policyText = (p: Policy) => (p.kind === 'rr' ? `rr ${p.quantum}` : p.kind);

const custom: NonNullable<InputSpec<SchedulingInput>['custom']> = {
  label: `Policy, then each process as arrival-burst (priority policy: arrival-burst-priority); up to ${MAX_PROCESSES}`,
  placeholder: 'e.g. rr 2: 0-5, 0-3, 1-4   or   priority: 0-3-2, 1-2-1',
  parse: (text) => {
    const m = /^\s*(fcfs|sjf|srtf|priority|rr\s*(\d+))\s*:\s*(.*)$/i.exec(text);
    if (!m) return { error: 'Start with a policy and a colon: fcfs, sjf, srtf, priority, or rr with a quantum (e.g. "rr 2: 0-5, 1-3").' };
    const kind = m[1].toLowerCase().startsWith('rr') ? 'rr' : (m[1].toLowerCase() as Policy['kind']);
    let policy: Policy;
    if (kind === 'rr') {
      const quantum = Number(m[2]);
      if (!(quantum >= 1 && quantum <= MAX_QUANTUM)) return { error: `The quantum must be from 1 to ${MAX_QUANTUM}.` };
      policy = { kind: 'rr', quantum };
    } else policy = { kind } as Policy;
    const parts = m[3].split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length === 0) return { error: 'Add at least one process, e.g. 0-3.' };
    if (parts.length > MAX_PROCESSES) return { error: `Use at most ${MAX_PROCESSES} processes.` };
    const rows: [number, number, number][] = [];
    for (const part of parts) {
      const pm = kind === 'priority' ? /^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/.exec(part) : /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (!pm) return { error: kind === 'priority' ? `"${part}" is not arrival-burst-priority, e.g. 0-3-2.` : `"${part}" is not arrival-burst, e.g. 0-3.` };
      const [arrival, burst, priority = 1] = pm.slice(1).map(Number);
      if (arrival > MAX_ARRIVAL) return { error: `Arrival times must be from 0 to ${MAX_ARRIVAL}.` };
      if (burst < 1 || burst > MAX_BURST) return { error: `Bursts must be from 1 to ${MAX_BURST}.` };
      if (priority < 1 || priority > MAX_PRIORITY) return { error: `Priorities must be from 1 to ${MAX_PRIORITY} (1 is the most urgent).` };
      rows.push([arrival, burst, priority]);
    }
    const processes = procs(rows);
    if (simulate(policy, processes).time > MAX_TIME) return { error: `That runs past t = ${MAX_TIME}: use fewer or shorter processes.` };
    return { value: { policy, processes } };
  },
  format: ({ policy, processes }) =>
    `${policyText(policy)}: ${processes.map((p) => (policy.kind === 'priority' ? `${p.arrival}-${p.burst}-${p.priority}` : `${p.arrival}-${p.burst}`)).join(', ')}`,
};

export const cpuScheduling = defineAlgorithm<SchedulingInput, GridState>({
  kind: 'algorithm',
  slug: 'cpu-scheduling',
  view: 'grid',
  input: {
    examples: [
      { id: 'fcfs', label: 'FCFS: a long job first', make: () => ({ policy: { kind: 'fcfs' }, processes: procs(CONVOY) }) },
      { id: 'sjf', label: 'SJF on the same jobs', make: () => ({ policy: { kind: 'sjf' }, processes: procs(CONVOY) }) },
      { id: 'srtf', label: 'SRTF on the same jobs', make: () => ({ policy: { kind: 'srtf' }, processes: procs(CONVOY) }) },
      { id: 'rr-1', label: 'Round robin, quantum 1', make: () => ({ policy: { kind: 'rr', quantum: 1 }, processes: procs(TURNS) }) },
      { id: 'rr-4', label: 'Round robin, quantum 4', make: () => ({ policy: { kind: 'rr', quantum: 4 }, processes: procs(TURNS) }) },
      {
        id: 'priority',
        label: 'Priority, with a gap',
        make: () => ({ policy: { kind: 'priority' }, processes: procs([[0, 3, 2], [1, 2, 1], [2, 4, 3], [11, 2, 1]]) }),
      },
      { id: 'random', label: 'Random jobs, round robin', make: ({ seed }) => randomJobs(seed) },
    ],
    custom,
  },
  pseudocode,
  stats: [
    { key: 'time', label: 'Clock' },
    { key: 'switches', label: 'Context switches' },
    { key: 'finished', label: 'Finished' },
    { key: 'idle', label: 'Idle time' },
  ],
  legend: [
    { neutral: 'Not arrived yet' },
    { mark: 'frontier', label: 'Waiting in the ready queue' },
    { mark: 'key', label: 'Running now' },
    { mark: 'visited', label: 'Ran earlier' },
    { mark: 'sorted', label: 'Finished' },
    { mark: 'reject', label: 'CPU idle' },
    { mark: 'compare', label: 'Now' },
    { mark: 'found', label: 'Averages' },
  ],
  run,
  content: {
    idea: 'One CPU, several processes that each need some amount of work: a scheduling policy decides who runs at every moment. The Gantt chart shows the choices, and the waiting they cause.',
    invariant:
      'The CPU never idles while a process is ready, and each process runs for exactly its burst in total; so every policy finishes the same work by the same time, and differs only in who waits, how long, and how often the CPU switches.',
    whenToUse:
      'Any single worker with a queue of jobs: an operating system’s CPU, a single-threaded server, a print queue. Shortest-first policies minimise average waiting but need to know job lengths; round robin keeps every job responsive at the cost of context switches.',
    traits: [
      { label: 'SRTF: least average waiting', good: true },
      { label: 'FCFS: convoys behind long jobs', good: false },
      { label: 'Priority: can starve low priorities', good: false },
      { label: 'RR: quantum trades responsiveness for switches', good: null },
    ],
    experiments: [
      { example: 'fcfs', prompt: 'P1 needs 8 units and arrives first, so three short jobs queue behind it: the convoy effect. Note the average waiting time.' },
      { example: 'sjf', prompt: 'SJF can’t help while P1 runs (it never preempts), but once the CPU is free it takes the shortest job first.' },
      { example: 'srtf', prompt: 'SRTF preempts P1 the moment P2 arrives with less work left. Compare the average waiting with FCFS: 2 against 5.75.' },
      { example: 'rr-1', prompt: 'With a quantum of 1 every process gets the CPU quickly, but count the context switches.' },
      { example: 'rr-4', prompt: 'The same jobs with a quantum of 4: fewer switches, and P3 waits longer for its first turn.' },
      { example: 'priority', prompt: 'P3 has the lowest priority and keeps being passed over; nothing arrives between 9 and 11, so the CPU idles.' },
    ],
  },
});

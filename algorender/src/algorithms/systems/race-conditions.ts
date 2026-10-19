import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import {
  completeSchedule,
  outcomeKey,
  outcomes,
  randomSchedule,
  runSchedule,
  scheduleProblem,
  serialOutcomes,
  type Instr,
  type Machine,
  type Program,
} from '@/systems/interleaving';
import type { MarkKey } from '@/viz/marks';
import { GridTracer, type Ref } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

// Race conditions: threads that share memory, run one atomic instruction at a
// time in the order a scheduler picks. The simulation is
// src/systems/interleaving.ts; this module plays one schedule step by step,
// then explores every interleaving and counts where each one ends.

export type ProgramId = 'count' | 'locked-count' | 'atomic-count' | 'withdraw' | 'locked-withdraw';
export type RaceInput = { program: ProgramId; threads: number; schedule: string[] };

export const MAX_THREADS = 3;
export const MAX_STEPS = 60;

const CODE = 'code';
const MEMORY = 'memory';
const REGS = 'registers';
const LOCKS = 'locks';
const SCHEDULE = 'schedule';
const OUTCOMES = 'outcomes';
const IDS = ['A', 'B', 'C'];

type ProgramDef = {
  /** As typed in the custom input, e.g. "locked count++". */
  name: string;
  /** The shared variable the program is about. */
  watch: string;
  memory: Record<string, number>;
  code: readonly Instr[];
  /** Plausible wrong final values, for the "which results are possible?" question. */
  traps: (threads: number) => number[];
  /** The first frame's narration. */
  intro: (threads: number) => string;
};

const LOAD: Instr = { op: 'load', reg: 'r', from: 'count' };
const ADD: Instr = { op: 'add', reg: 'r', k: 1 };
const STORE: Instr = { op: 'store', to: 'count', reg: 'r' };
const CHECK: Instr = { op: 'load', reg: 'r', from: 'balance' };
const PAY: Instr = { op: 'fetch-add', target: 'balance', k: -80 };

const each = (n: number) => (n === 2 ? 'both threads' : `all ${n} threads`);
const names = (n: number) => joinAnd(IDS.slice(0, n));

const PROGRAMS: Record<ProgramId, ProgramDef> = {
  count: {
    name: 'count++',
    watch: 'count',
    memory: { count: 0 },
    code: [LOAD, ADD, STORE],
    traps: () => [0],
    intro: (n) =>
      `Threads ${names(n)} each run count++ once. The CPU does count++ in three steps: load count into a private register r, add 1, store r back. count starts at 0, so it should end at ${n}.`,
  },
  'locked-count': {
    name: 'locked count++',
    watch: 'count',
    memory: { count: 0 },
    code: [{ op: 'lock', lock: 'm' }, LOAD, ADD, STORE, { op: 'unlock', lock: 'm' }],
    traps: (n) => [n - 1],
    intro: (n) => `Threads ${names(n)} each run count++ again, but inside lock m: only the thread holding m may run the three steps, so no other thread can get between them.`,
  },
  'atomic-count': {
    name: 'atomic count++',
    watch: 'count',
    memory: { count: 0 },
    code: [{ op: 'fetch-add', target: 'count', k: 1 }],
    traps: (n) => [n - 1],
    intro: (n) => `Threads ${names(n)} each add 1 to count with one atomic instruction (fetch-and-add): the read, the add and the write happen as a single step that nothing can split.`,
  },
  withdraw: {
    name: 'withdraw',
    watch: 'balance',
    memory: { balance: 100 },
    code: [CHECK, { op: 'jump-if-less', reg: 'r', k: 80, to: 3 }, PAY],
    traps: () => [100],
    intro: (n) =>
      `The account holds 100, and ${each(n)} try to withdraw 80. Each checks the balance first (load it, and stop if it is under 80), then takes the money with one atomic subtraction. Only one withdrawal should succeed.`,
  },
  'locked-withdraw': {
    name: 'locked withdraw',
    watch: 'balance',
    memory: { balance: 100 },
    code: [{ op: 'lock', lock: 'm' }, CHECK, { op: 'jump-if-less', reg: 'r', k: 80, to: 4 }, PAY, { op: 'unlock', lock: 'm' }],
    traps: () => [-60],
    intro: (n) => `The same withdrawals of 80 from 100 by ${each(n)}, now with the check and the subtraction both inside lock m, so they act as one step.`,
  },
};

export function programOf(input: Pick<RaceInput, 'program' | 'threads'>): Program {
  const def = PROGRAMS[input.program];
  return { memory: def.memory, threads: IDS.slice(0, input.threads).map((id) => ({ id, code: def.code })) };
}

// ─────────────────────────────── text ───────────────────────────────

function joinAnd(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function joinOr(items: readonly (string | number)[]): string {
  return items.length <= 1 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/** An instruction as one short line (it labels a row, so at most 15 characters). */
export function instrText(instr: Instr, code: readonly Instr[]): string {
  switch (instr.op) {
    case 'load':
      return `${instr.reg} ← ${instr.from}`;
    case 'add':
      return `${instr.reg} ← ${instr.reg} ${instr.k < 0 ? '−' : '+'} ${Math.abs(instr.k)}`;
    case 'store':
      return `${instr.to} ← ${instr.reg}`;
    case 'fetch-add':
      return `${instr.target} ${instr.k < 0 ? '−' : '+'}= ${Math.abs(instr.k)}`;
    case 'lock':
      return `lock ${instr.lock}`;
    case 'unlock':
      return `unlock ${instr.lock}`;
    case 'jump-if-less': {
      const target = code[instr.to];
      return `if ${instr.reg}<${instr.k}: ${target ? instrText(target, code).split(' ')[0] : 'done'}`;
    }
  }
}

const valuesText = (values: readonly number[]) => (values.length === 1 ? `${values[0]} only` : joinOr(values));

// ─────────────────────────────── trace ───────────────────────────────

const pseudocode = [
  'until every thread has finished:',
  '  t ← the thread the scheduler picks',
  '  if t is blocked on a lock:',
  '    t waits; nothing changes',
  '  else run t’s next instruction,',
  '    as one step nothing can split',
  'then try every interleaving:',
  '  count where each one ends',
];

function* run(input: RaceInput): Generator<Frame<GridState>> {
  const def = PROGRAMS[input.program];
  const program = programOf(input);
  const code = def.code;
  const ids = program.threads.map((th) => th.id);
  const { steps, machines, final } = runSchedule(program, input.schedule);
  const watch = def.watch;
  const regNames = [...new Set(code.flatMap((i) => ('reg' in i ? [i.reg] : [])))];
  const lockNames = [...new Set(code.flatMap((i) => (i.op === 'lock' || i.op === 'unlock' ? [i.lock] : [])))];
  const done = code.length;
  const t = new GridTracer(['steps', 'waits', 'interleavings']);

  t.addTable({
    id: CODE,
    label: 'The code each thread runs, with what each step got',
    corner: 'Thread',
    rows: [...code.map((instr, i) => ({ id: `l${i}`, label: instrText(instr, code) })), { id: 'end', label: '(finished)' }],
    cols: ids.map((id) => ({ label: id })),
  });
  const vars = Object.keys(program.memory);
  t.addTable({ id: MEMORY, label: 'Shared memory', corner: 'Variable', rows: vars.map((v) => ({ id: `v-${v}`, label: v })), cols: [{ label: 'Value' }] });
  vars.forEach((v, row) => t.set([MEMORY, row, 0], program.memory[v]));
  if (regNames.length > 0) {
    t.addTable({ id: REGS, label: 'Each thread’s private registers', corner: 'Thread', rows: ids.map((id) => ({ id: `t-${id}`, label: id })), cols: regNames.map((r) => ({ label: r })) });
  }
  if (lockNames.length > 0) {
    t.addList({ id: LOCKS, label: 'Locks', empty: '' });
    for (const l of lockNames) t.addItem(LOCKS, { id: `lock-${l}`, text: `${l}: free` });
  }
  t.addList({ id: SCHEDULE, label: 'Schedule so far: who ran each step', empty: 'Nothing has run yet' });

  const col = (id: string) => ids.indexOf(id);
  const regText = (m: Machine, id: string, reg: string) => {
    const v = m.threads[col(id)].regs[reg];
    return v == null ? '–' : v;
  };
  const varsOf = (m: Machine, id?: string): Record<string, VarValue> => ({
    ...(id && { thread: id }),
    ...Object.fromEntries(vars.map((v) => [v, m.memory[v]])),
    ...Object.fromEntries(ids.flatMap((tid) => regNames.map((r) => [`${tid}.${r}`, regText(m, tid, r)]))),
  });
  /** Where every unfinished thread goes next, and which threads have finished. */
  const progress = (m: Machine): Partial<Record<MarkKey, Ref[]>> => {
    const next: Ref[] = [];
    const finished: Ref[] = [];
    m.threads.forEach((th, c) => (th.pc >= done ? finished : next).push([CODE, th.pc, c]));
    return { frontier: next, visited: finished };
  };

  const lastLoad = new Map<string, number>();
  const lastWriter = new Map<string, string>();
  const serial = serialOutcomes(program);
  const all = outcomes(program);

  /** A Predict question about step k, asked on the frame before it. */
  const askAbout = (k: number): Checkpoint | undefined => {
    const s = steps[k];
    if (!s) return undefined;
    const before = machines[k];
    const id = s.thread;
    const instr = s.instr;
    if (instr.op === 'lock') {
      const choices = [`${id} takes the lock`, `${id} waits`];
      return { question: `Next the scheduler picks ${id}, which is at “lock ${instr.lock}”. What happens?`, choices, answer: s.kind === 'waited' ? 1 : 0 };
    }
    if (s.kind === 'waited') return undefined;
    if (instr.op === 'store' || instr.op === 'fetch-add') {
      const name = s.wrote!.name;
      const now = before.memory[name];
      const k2 = instr.op === 'fetch-add' ? instr.k : 1;
      const loaded = lastLoad.get(`${id}:${name}`);
      const candidates = [s.wrote!.value, now, now + k2, ...(loaded != null ? [loaded + k2] : [])];
      const choices = [...new Set(candidates)].sort((a, b) => a - b).map(String);
      if (choices.length < 2) return undefined;
      return { question: `Next ${id} runs “${instrText(instr, code)}”. What is ${name} afterwards?`, choices, answer: choices.indexOf(String(s.wrote!.value)) };
    }
    if (instr.op === 'jump-if-less') {
      return {
        question: `Next ${id} tests ${instr.reg} < ${instr.k}, with its ${instr.reg} = ${regText(before, id, instr.reg)}. Does it jump?`,
        choices: ['Yes', 'No'],
        answer: s.jumped ? 0 : 1,
      };
    }
    return undefined;
  };

  yield t.frame({ line: 0, note: def.intro(input.threads), marks: progress(machines[0]), vars: varsOf(machines[0]), checkpoint: askAbout(0) });

  for (const [k, s] of steps.entries()) {
    const m = machines[k + 1];
    const before = machines[k];
    const id = s.thread;
    const c = col(id);
    const instr = s.instr;
    t.count('steps');
    t.addItem(SCHEDULE, { id: `s${k}`, text: id });
    const marks: Partial<Record<MarkKey, Ref[]>> = progress(m);
    const add = (mark: MarkKey, ref: Ref) => (marks[mark] ??= []).push(ref);
    let note: string;

    if (s.kind === 'waited') {
      t.count('waits');
      t.set([CODE, s.line, c], 'wait');
      t.mark({ item: `s${k}`, list: SCHEDULE }, 'reject');
      const lock = (instr as Extract<Instr, { op: 'lock' }>).lock;
      add('reject', [CODE, s.line, c]);
      add('reject', { item: `lock-${lock}`, list: LOCKS });
      const holder = before.locks[lock];
      note =
        holder === id
          ? `${id} reaches “lock ${lock}” while already holding it. Locks here are not re-entrant, so ${id} waits on itself.`
          : `${id} reaches “lock ${lock}”, but ${holder} holds it, so ${id} blocks: this step is wasted, and the scheduler has to run another thread.`;
      yield t.frame({ line: 3, note, marks, vars: varsOf(m, id), checkpoint: askAbout(k + 1) });
      continue;
    }

    add('key', [CODE, s.line, c]);
    add('key', { item: `s${k}`, list: SCHEDULE });
    if (s.reg) {
      t.set([REGS, c, regNames.indexOf(s.reg.name)], s.reg.value);
      add('write', [REGS, c, regNames.indexOf(s.reg.name)]);
    }
    if (s.wrote) {
      const row = vars.indexOf(s.wrote.name);
      t.set([MEMORY, row, 0], s.wrote.value);
      add('write', [MEMORY, row, 0]);
    } else if (s.read) add('compare', [MEMORY, vars.indexOf(s.read.name), 0]);

    switch (instr.op) {
      case 'load': {
        const v = s.read!.value;
        lastLoad.set(`${id}:${instr.from}`, v);
        t.set([CODE, s.line, c], v);
        note = `${id} reads ${instr.from} (${v}) into its own register ${instr.reg}. From now on it works on that private copy, which goes stale if another thread changes ${instr.from}.`;
        break;
      }
      case 'add':
        t.set([CODE, s.line, c], s.reg!.value);
        note = `${id} adds ${instr.k} to its register: ${instr.reg} = ${s.reg!.value}. Nothing in shared memory changes yet.`;
        break;
      case 'store': {
        const { value, was } = s.wrote!;
        const loaded = lastLoad.get(`${id}:${instr.to}`);
        const other = lastWriter.get(instr.to);
        t.set([CODE, s.line, c], value);
        note =
          loaded != null && loaded !== was && other && other !== id
            ? `${id} writes ${instr.reg} (${value}) back to ${instr.to}. But ${instr.to} was ${loaded} when ${id} read it, and ${other} has changed it to ${was} since: writing ${value} wipes ${other}’s work out. A lost update.`
            : `${id} writes ${instr.reg} (${value}) back to ${instr.to}: ${instr.to} = ${value}.`;
        lastWriter.set(instr.to, id);
        break;
      }
      case 'fetch-add': {
        const { value, was } = s.wrote!;
        const loaded = lastLoad.get(`${id}:${instr.target}`);
        t.set([CODE, s.line, c], value);
        const verb = instr.k < 0 ? `takes ${-instr.k} from` : `adds ${instr.k} to`;
        note = `${id} ${verb} ${instr.target} in one indivisible step (an atomic read-modify-write): ${instr.target} = ${value}.`;
        if (loaded != null && loaded !== was) {
          note += ` But ${id} checked ${instr.target} back when it was ${loaded}; it was only ${was} by now. The check was stale${value < 0 ? ', and the account is overdrawn' : ''}.`;
        }
        lastWriter.set(instr.target, id);
        break;
      }
      case 'lock':
        t.set([CODE, s.line, c], 'got');
        t.setItemText(LOCKS, `lock-${instr.lock}`, `${instr.lock}: held by ${id}`);
        note = `${id} takes lock ${instr.lock}. Until ${id} unlocks it, any other thread that reaches “lock ${instr.lock}” has to wait.`;
        break;
      case 'unlock':
        t.set([CODE, s.line, c], 'free');
        t.setItemText(LOCKS, `lock-${instr.lock}`, `${instr.lock}: free`);
        note = `${id} releases ${instr.lock}, so a thread waiting for it can go on.`;
        break;
      case 'jump-if-less': {
        const r = before.threads[c].regs[instr.reg] ?? 0;
        t.set([CODE, s.line, c], s.jumped ? 'yes' : 'no');
        for (let skipped = s.line + 1; s.jumped && skipped < instr.to; skipped++) t.set([CODE, skipped, c], '–');
        const target = code[instr.to];
        note = s.jumped
          ? `${id} tests ${instr.reg} < ${instr.k}: ${instr.reg} is ${r}, so yes, and it jumps ${target ? `to “${instrText(target, code)}”` : 'to the end'}, skipping the rest.`
          : `${id} tests ${instr.reg} < ${instr.k}: ${instr.reg} is ${r}, so no, and it carries on to the next line.`;
        break;
      }
    }
    if (m.threads[c].pc >= done) {
      t.set([CODE, done, c], '✓');
      note += ` ${id} has finished.`;
    }
    yield t.frame({ line: 4, note, marks, vars: varsOf(m, id), checkpoint: askAbout(k + 1) });
  }

  // ── The end of this run, then every interleaving ──
  const value = final.memory[watch];
  const thisKey = outcomeKey(final.memory);
  const racy = !serial.has(thisKey);
  const values = all.outcomes.map((o) => o.memory[watch]);
  const serialValues = all.outcomes.filter((o) => serial.has(outcomeKey(o.memory, o.deadlocked))).map((o) => o.memory[watch]);
  const options = new Map<string, number[]>();
  const offer = (vs: readonly number[]) => {
    const sorted = [...new Set(vs)].sort((a, b) => a - b);
    options.set(valuesText(sorted), sorted);
  };
  offer(values);
  offer(serialValues);
  for (const trap of def.traps(input.threads)) offer([...values, trap]);
  const choices = [...options.entries()].sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0])).map(([text]) => text);
  const truth = valuesText([...new Set(values)].sort((a, b) => a - b));

  yield t.frame({
    line: 0,
    note: racy
      ? `Every thread has finished, with ${watch} = ${value}. Running the threads one at a time never gives that: this result exists only because their steps interleaved.`
      : `Every thread has finished, with ${watch} = ${value}, the same as running the threads one at a time would give. Was that by design, or luck?`,
    marks: progress(final),
    vars: varsOf(final),
    ...(choices.length >= 2 && {
      checkpoint: { question: `Over every possible interleaving of these threads, which final values of ${watch} can happen?`, choices, answer: choices.indexOf(truth) },
    }),
  });

  t.count('interleavings', all.total);
  t.addTable({
    id: OUTCOMES,
    label: `Every interleaving (${all.total}), by where it ends`,
    corner: 'Result',
    rows: all.outcomes.map((o) => ({ id: `o-${outcomeKey(o.memory, o.deadlocked)}`, label: `${watch} = ${o.memory[watch]}${o.deadlocked ? ' ✕' : ''}`, scale: all.total })),
    cols: [{ label: 'Runs' }],
  });
  const outcomeMarks: Partial<Record<MarkKey, Ref[]>> = { ...progress(final) };
  all.outcomes.forEach((o, row) => {
    t.set([OUTCOMES, row, 0], o.count);
    const good = serial.has(outcomeKey(o.memory, o.deadlocked));
    t.mark([OUTCOMES, row, 0], good ? 'sorted' : 'swap');
  });
  (outcomeMarks.found ??= []).push({ row: all.outcomes.findIndex((o) => outcomeKey(o.memory, o.deadlocked) === thisKey), table: OUTCOMES });
  const bad = all.outcomes.filter((o) => !serial.has(outcomeKey(o.memory, o.deadlocked)));
  const badRuns = bad.reduce((s, o) => s + o.count, 0);
  const tried = all.total === 1 ? 'the only interleaving' : all.total === 2 ? 'both interleavings' : `all ${all.total} interleavings`;
  const tally = joinAnd(all.outcomes.map((o) => `${o.count} end with ${watch} = ${o.memory[watch]}`));
  yield t.frame({
    line: 7,
    note:
      bad.length > 0
        ? `Trying ${tried}: ${tally}. ${badRuns} of them give a result no one-at-a-time order gives: that is a race condition, and testing a few runs can easily miss it.`
        : `Trying ${tried}: ${all.outcomes.length === 1 ? `every one ends with ${watch} = ${values[0]}` : tally}, exactly as running the threads one at a time does. No race.`,
    marks: outcomeMarks,
    vars: { ...varsOf(final), interleavings: all.total },
  });
}

// ─────────────────────────────── input ───────────────────────────────

const ORDER: ProgramId[] = ['count', 'locked-count', 'atomic-count', 'withdraw', 'locked-withdraw'];

const make = (program: ProgramId, threads: number, schedule: string): RaceInput => {
  const p = programOf({ program, threads });
  return { program, threads, schedule: completeSchedule(p, schedule.split('')) };
};

function randomRun(program: ProgramId, threads: number, seed: number): RaceInput {
  return { program, threads, schedule: randomSchedule(programOf({ program, threads }), createRng(seed)) };
}

const custom: NonNullable<InputSpec<RaceInput>['custom']> = {
  label: `A program (${ORDER.map((id) => PROGRAMS[id].name).join(', ')}), threads (x2 or x3), and the schedule: who runs each step`,
  placeholder: 'e.g. count++ x2; schedule: A B A A B B',
  parse: (text) => {
    const m = /^\s*([a-z+ ]+?)\s*(?:x\s*(\d+))?\s*(?:;\s*schedule\s*:\s*(.*?))?\s*$/i.exec(text);
    const program = m && ORDER.find((id) => PROGRAMS[id].name === m[1].trim().toLowerCase().replace(/\s+/g, ' '));
    if (!m || !program) return { error: `Start with a program: ${ORDER.map((id) => PROGRAMS[id].name).join(', ')}.` };
    const threads = m[2] == null ? 2 : Number(m[2]);
    if (!(threads >= 1 && threads <= MAX_THREADS)) return { error: `Use 1 to ${MAX_THREADS} threads, e.g. x2.` };
    const picks = (m[3] ?? '').toUpperCase().replace(/[\s,]+/g, '').split('').filter(Boolean);
    const p = programOf({ program, threads });
    if (picks.length > MAX_STEPS) return { error: `Use at most ${MAX_STEPS} steps.` };
    const problem = scheduleProblem(p, picks);
    if (problem) return { error: problem };
    const schedule = completeSchedule(p, picks);
    if (schedule.length > MAX_STEPS) return { error: `That schedule runs past ${MAX_STEPS} steps.` };
    return { value: { program, threads, schedule } };
  },
  format: ({ program, threads, schedule }) => `${PROGRAMS[program].name} x${threads}; schedule: ${schedule.join(' ')}`,
};

export const raceConditions = defineAlgorithm<RaceInput, GridState>({
  kind: 'algorithm',
  slug: 'race-conditions',
  view: 'grid',
  input: {
    examples: [
      { id: 'lost-update', label: 'count++ twice: a lost update', make: () => make('count', 2, 'ABAABB') },
      { id: 'one-at-a-time', label: 'count++ twice, one at a time', make: () => make('count', 2, 'AAABBB') },
      { id: 'random', label: 'count++ twice, random order', make: ({ seed }) => randomRun('count', 2, seed) },
      { id: 'three', label: 'count++ in three threads, random', make: ({ seed }) => randomRun('count', 3, seed) },
      { id: 'mutex', label: 'count++ with a lock', make: () => make('locked-count', 2, 'AABAAABBBBB') },
      { id: 'atomic', label: 'count++ as one atomic add', make: () => make('atomic-count', 2, 'AB') },
      { id: 'withdraw', label: 'Check, then withdraw: overdrawn', make: () => make('withdraw', 2, 'ABABAB') },
      { id: 'locked-withdraw', label: 'Check and withdraw under a lock', make: () => make('locked-withdraw', 2, 'AABAAABBBB') },
    ],
    custom,
  },
  pseudocode,
  stats: [
    { key: 'steps', label: 'Steps' },
    { key: 'waits', label: 'Waits on a lock' },
    { key: 'interleavings', label: 'Interleavings tried' },
  ],
  legend: [
    { neutral: 'Not run yet' },
    { mark: 'key', label: 'Running now' },
    { mark: 'frontier', label: 'A thread’s next line' },
    { mark: 'visited', label: 'Thread finished' },
    { mark: 'compare', label: 'Read from shared memory' },
    { mark: 'write', label: 'Just written' },
    { mark: 'reject', label: 'Blocked on a lock' },
    { mark: 'sorted', label: 'A result one-at-a-time runs give' },
    { mark: 'swap', label: 'A result only interleaving gives' },
    { mark: 'found', label: 'This run’s result' },
  ],
  run,
  content: {
    idea: 'Threads share memory, and the scheduler can switch between them after any single instruction. count++ is three instructions (load, add, store), so two threads can both read the old value and one increment vanishes. Step through one interleaving, then see where every interleaving ends.',
    invariant:
      'Each step runs exactly one instruction of one thread, and nothing can interrupt it; everything else is up to the scheduler. A program is correct only if every interleaving ends the way some one-thread-at-a-time order would.',
    whenToUse:
      'Whenever two threads (or processes, or servers) read and then write the same data: counters, balances, seat bookings, “check, then act” code. The fixes make the read-modify-write one step: a lock (mutex) around it, an atomic instruction, or a database transaction.',
    traits: [
      { label: 'Locks and atomics remove the race', good: true },
      { label: 'Rare interleavings hide bugs from tests', good: false },
      { label: 'A lock makes others wait', good: false },
      { label: 'Interleavings grow factorially', good: null },
    ],
    experiments: [
      { example: 'lost-update', prompt: 'A and B both load 0 before either stores, so both store 1: one increment is lost. Then see that 18 of the 20 interleavings lose one.' },
      { example: 'one-at-a-time', prompt: 'B starts after A has finished, so count ends at 2. The same code: only the order differs.' },
      { example: 'mutex', prompt: 'B reaches the lock while A holds it and has to wait. Every interleaving now ends at 2.' },
      { example: 'atomic', prompt: 'One fetch-and-add instruction does the read, add and write at once: no lock needed, and no lost updates.' },
      { example: 'withdraw', prompt: 'Both threads see 100 and pass the check before either withdraws: the balance ends at −60, though each subtraction was atomic.' },
      { example: 'three', prompt: 'With three threads, count can end at 1, 2 or 3, and there are 1680 interleavings. Try a few seeds.' },
    ],
  },
});

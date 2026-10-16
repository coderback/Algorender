// Turns a run of the learner's code into the same Trace the built-in
// visualisers play, so their code drives ArrayView (or, once it makes a grid,
// GridView) with the usual player, narration, stats and code highlighting. A
// 'lines' run plays on the memory view instead, one frame per step.

import type { StatSpec } from '@/engine/module';
import type { Frame, Trace, VarValue } from '@/engine/types';
import { ArrayTracer, MAIN, type FrameOptions, type SlotRef } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import type { MemoryState } from '@/viz/memory/types';
import type { GridCell, HeapObject, Json, MemValue, Operand, RunEvent, RunResult, StackFrame } from './protocol';

export const RUN_STATS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'writes', label: 'Writes' },
] as const;

/** Stats of a grid run: swaps don't apply to tables. */
export const GRID_STATS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'writes', label: 'Writes' },
] as const;

/** Stats of a line-by-line run: steps so far, and calls made so far. */
export const LINE_STATS = [
  { key: 'steps', label: 'Steps' },
  { key: 'calls', label: 'Calls' },
] as const;

/** A run as the stage plays it: which view, its trace, and the stats it counts. */
export type RunTrace =
  | { view: 'array'; trace: Trace<ArrayState>; stats: readonly StatSpec[] }
  | { view: 'grid'; trace: Trace<GridState>; stats: readonly StatSpec[] }
  | { view: 'memory'; trace: Trace<MemoryState>; stats: readonly StatSpec[] };

/**
 * The learner's run for the stage, or null when nothing ran. A 'lines' run
 * (one with steps) plays on the memory view as traceLines gives it. Otherwise
 * a run that made no grid plays on ArrayView exactly as traceRun gives it; one
 * that made a grid plays on GridView, with every collection (arrays as
 * one-row tables).
 */
export function traceFor(result: RunResult, options: TraceOptions = {}): RunTrace | null {
  if (result.events.some((e) => e.kind === 'step')) {
    const trace = traceLines(result, options);
    return trace && { view: 'memory', trace, stats: LINE_STATS };
  }
  if (!result.events.some((e) => e.kind === 'grid')) {
    const trace = traceRun(result, options);
    return trace && { view: 'array', trace, stats: RUN_STATS };
  }
  return { view: 'grid', trace: traceGrid(result, options), stats: GRID_STATS };
}

export type TraceOptions = {
  /** Frames kept before the trace is cut short (the run itself may have gone further). */
  maxFrames?: number;
  /** Mark the main array as sorted at the end when it is in order (sorting exercises). */
  markSortedAtEnd?: boolean;
  /**
   * The learner's index variables to draw as pointers under the main array
   * (e.g. lo, mid, hi), whenever they hold a valid index.
   */
  pointers?: readonly string[];
  /** The code that ran: 'lines' narration quotes the condition an if or while line tested. */
  code?: string;
};

type Write = Extract<RunEvent, { kind: 'write' }>;

/**
 * The learner's run as a Trace, or null when nothing ran (a syntax error, or
 * no entry function), in which case there is nothing to show but the error.
 */
export function traceRun(
  result: RunResult,
  { maxFrames = 3_000, markSortedAtEnd = false, pointers = [] }: TraceOptions = {},
): Trace<ArrayState> | null {
  const events = result.events;
  const first = events.find((e) => e.kind === 'array');
  if (!first || first.kind !== 'array') return null;

  const t = new ArrayTracer(first.values, RUN_STATS.map((s) => s.key));
  t.setLaneLabel(MAIN, first.name);
  const lanes = new Map<string, string>([[first.array, MAIN]]);
  const names = new Map<string, string>([[first.array, first.name]]);
  const ref = (array: string, index: number): SlotRef => {
    const lane = lanes.get(array) ?? MAIN;
    return lane === MAIN ? index : [lane, index];
  };
  const cellText = (array: string, index: number) => `${names.get(array) ?? array}[${index}]`;
  const listText = (array: string) => {
    const lane = lanes.get(array) ?? MAIN;
    const n = t.laneLength(lane);
    const items = Array.from({ length: n }, (_, i) => (t.isEmpty(lane === MAIN ? i : [lane, i]) ? '_' : String(t.value(lane === MAIN ? i : [lane, i]))));
    return `[${items.join(', ')}]`;
  };

  const frames: Frame<ArrayState>[] = [];
  let truncated = false;
  const push = (frame: Frame<ArrayState>) => {
    if (frames.length >= maxFrames) {
      truncated = true;
      return false;
    }
    frames.push(frame);
    return true;
  };
  const lineOf = (line: number | null) => (line == null ? null : line - 1);
  // A frame of the run, with the learner's index variables drawn as pointers.
  const frame = (opts: FrameOptions) => {
    const at: Record<string, SlotRef> = {};
    for (const name of pointers) {
      const v = opts.vars?.[name];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < t.length) at[name] = v;
    }
    return t.frame({ ...opts, pointers: at });
  };
  const said = (line: number | null, text: string) => (line == null ? capitalise(text) : `Line ${line} ${text}`);

  // An array argument is there from the start; an array the code made with array() came from its line.
  const start = first.line == null ? `Your function receives ${first.name} = ${listText(first.array)}.` : said(first.line, `makes a new array ${first.name} = ${listText(first.array)}.`);
  push(t.frame({ note: start, line: lineOf(first.line), vars: first.vars }));

  for (let k = 0; k < events.length; k++) {
    const e = events[k];
    let ok = true;
    switch (e.kind) {
      case 'array': {
        if (e === first) continue;
        const lane = `lane-${e.array}`;
        lanes.set(e.array, lane);
        names.set(e.array, e.name);
        t.addLane(lane, e.name, e.values.length);
        e.values.forEach((v, i) => t.write([lane, i], v, { count: false }));
        ok = push(frame({ note: said(e.line, `makes a new array ${e.name} = ${listText(e.array)}.`), line: lineOf(e.line), vars: e.vars }));
        break;
      }
      case 'compare': {
        t.count('comparisons');
        const cells = [e.a, e.b].filter(isCell).map((c) => ref(c.array, c.index));
        const question = `is ${operandText(e.a, cellText)} ${e.op} ${operandText(e.b, cellText)}? ${e.result ? 'Yes' : 'No'}.`;
        ok = push(frame({ note: said(e.line, question), line: lineOf(e.line), vars: e.vars, marks: { compare: cells } }));
        break;
      }
      case 'write': {
        const next = events[k + 1];
        if (next?.kind === 'write' && isSwap(t, e, next, ref)) {
          const a = t.value(ref(e.array, e.index));
          const b = t.value(ref(next.array, next.index));
          t.swap(ref(e.array, e.index), ref(next.array, next.index));
          const note = said(e.line, `swaps ${cellText(e.array, e.index)} and ${cellText(next.array, next.index)} (${a} ⇄ ${b}).`);
          ok = push(frame({ note, line: lineOf(next.line), vars: next.vars, marks: { swap: [ref(e.array, e.index), ref(next.array, next.index)] } }));
          k++;
          break;
        }
        const target = ref(e.array, e.index);
        const was = t.isEmpty(target) ? null : t.value(target);
        t.write(target, e.value);
        const note = said(e.line, `writes ${e.value} into ${cellText(e.array, e.index)}${was == null || was === e.value ? '' : ` (it held ${was})`}.`);
        ok = push(frame({ note, line: lineOf(e.line), vars: e.vars, marks: { write: [target] } }));
        break;
      }
      case 'append': {
        const lane = lanes.get(e.array) ?? MAIN;
        t.append(lane, e.value);
        const at = t.laneLength(lane) - 1;
        ok = push(frame({ note: said(e.line, `appends ${e.value} to ${names.get(e.array) ?? e.array}.`), line: lineOf(e.line), vars: e.vars, marks: { write: [ref(e.array, at)] } }));
        break;
      }
      case 'pop': {
        const target = ref(e.array, e.index);
        const value = t.isEmpty(target) ? null : t.value(target);
        t.removeAt(target);
        const what = value == null ? '' : `${value} `;
        ok = push(frame({ note: said(e.line, `removes ${what}from ${cellText(e.array, e.index)}.`), line: lineOf(e.line), vars: e.vars }));
        break;
      }
      case 'print': {
        ok = push(frame({ note: said(e.line, `prints “${e.text}”.`), line: lineOf(e.line), vars: e.vars }));
        break;
      }
    }
    if (!ok) break;
  }

  const last = frames.at(-1)!;
  if (result.error) {
    const where = result.error.line == null ? '' : `Line ${result.error.line}: `;
    frames.push({ ...last, line: lineOf(result.error.line), note: `${where}${result.error.message}`, checkpoint: undefined });
  } else {
    const main = first.array;
    const inOrder = isAscending(result.arrays[main] ?? []);
    if (markSortedAtEnd && inOrder) t.markAllSorted();
    const returned = result.returned == null ? '' : ` and returned ${jsonText(result.returned)}`;
    frames.push(t.frame({ note: `Your function finished${returned}. ${first.name} is now ${listText(main)}.`, line: null, vars: last.vars }));
  }
  return { frames, truncated: truncated || result.error?.kind === 'limit' };
}

/** Everything the learner printed, one entry per print call. */
export function printed(result: RunResult): string[] {
  return result.events.flatMap((e) => (e.kind === 'print' ? [e.text] : []));
}

type Step = Extract<RunEvent, { kind: 'step' }>;

/**
 * A 'lines' run for the memory view, or null when nothing ran: a frame per
 * step, showing memory just before the highlighted line runs, narrated by
 * what changed since the step before (what the line that ran did, a call, a
 * return, an exception). Names and objects that changed are flagged; prints
 * accumulate in `output`. The last frame says how the run ended.
 */
export function traceLines(result: RunResult, { maxFrames = 3_000, code = '' }: TraceOptions = {}): Trace<MemoryState> | null {
  const last = result.events.findLast((e): e is Step => e.kind === 'step');
  if (!last) return null;

  const frames: Frame<MemoryState>[] = [];
  let truncated = false;
  const output: string[] = [];
  let printedSince: string[] = [];
  let prev: Step | null = null;
  // Every object seen so far, in order of first appearance: the heap keeps that order, so boxes stay put.
  const seen = new Map<string, number>();
  const calls = new Set<string>();
  let steps = 0;
  const source = code.split('\n');

  for (const e of result.events) {
    if (e.kind === 'print') {
      output.push(e.text);
      printedSince.push(e.text);
      continue;
    }
    if (e.kind !== 'step') continue;
    if (frames.length >= maxFrames) {
      truncated = true;
      break;
    }
    steps += 1;
    for (const f of e.stack.slice(1)) calls.add(f.id);
    const note = narrate(prev, e, printedSince, seen, source);
    for (const o of e.heap) if (!seen.has(o.id)) seen.set(o.id, seen.size);
    const shown = printedSince.length > 0 || frames.length === 0 ? [...output] : frames.at(-1)!.state.output;
    frames.push({ state: memoryState(e, prev, shown, seen), line: e.line - 1, note, vars: {}, stats: { steps, calls: calls.size } });
    prev = e;
    printedSince = [];
  }

  // Prints after the last step shown (a run cut short mid-line) still belong in the output.
  const end = frames.at(-1)!;
  const state = settled(end.state, printedSince.length > 0 ? [...output] : end.state.output);
  if (result.error) {
    const where = result.error.line == null ? '' : `Line ${result.error.line}: `;
    frames.push({ ...end, state, line: result.error.line == null ? null : result.error.line - 1, note: `${where}${result.error.message}`, checkpoint: undefined });
  } else {
    // The run ended inside the entry function (its return), or at the end of the top level.
    const returned = result.returned == null ? '' : ` and returned ${jsonText(result.returned)}`;
    const note = last.stack.length > 1 ? `Your function finished${returned}.` : 'The program finished.';
    frames.push({ ...end, state, line: null, note, checkpoint: undefined });
  }
  return { frames, truncated: truncated || result.error?.kind === 'limit' };
}

const sameValue = (a: MemValue, b: MemValue): boolean =>
  'prim' in a ? 'prim' in b && a.prim === b.prim && a.type === b.type : 'ref' in b && a.ref === b.ref;

/** Memory at a step, with what changed since the step before flagged. */
function memoryState(e: Step, prev: Step | null, output: string[], seen: ReadonlyMap<string, number>): MemoryState {
  const framesBefore = new Map((prev?.stack ?? []).map((f) => [f.id, f]));
  const objectsBefore = new Map((prev?.heap ?? []).map((o) => [o.id, o]));
  const frames = e.stack.map((f, k): MemoryState['frames'][number] => {
    const was = framesBefore.get(f.id);
    const locals = f.locals.map(([name, value]) => {
      const old = was?.locals.find(([n]) => n === name)?.[1];
      return { name, value, changed: prev != null && !(old && sameValue(old, value)) };
    });
    const frame: MemoryState['frames'][number] = { id: f.id, fn: f.fn, locals, active: k === e.stack.length - 1 };
    if (f.returning) frame.returning = f.returning;
    return frame;
  });
  const heap = [...e.heap]
    .sort((a, b) => seen.get(a.id)! - seen.get(b.id)!)
    .map((object) => {
      const old = objectsBefore.get(object.id);
      return { object, changed: old != null && JSON.stringify(old) !== JSON.stringify(object), fresh: prev != null && old == null };
    });
  return { frames, heap, output };
}

/** The same memory with nothing flagged as just changed, for the closing frame. */
function settled(state: MemoryState, output: string[]): MemoryState {
  return {
    frames: state.frames.map((f) => ({ ...f, locals: f.locals.map((l) => ({ ...l, changed: false })) })),
    heap: state.heap.map((h) => ({ ...h, changed: false, fresh: false })),
    output,
  };
}

/** At most this many changes are named in one note; the rest are counted. */
const NAMED_CHANGES = 3;

/** One sentence on what happened between the step before and this one. */
function narrate(prev: Step | null, e: Step, prints: readonly string[], seen: ReadonlyMap<string, number>, source: readonly string[]): string {
  const top = e.stack.at(-1)!;
  if (!prev) return `The program starts at line ${e.line}.`;
  const heap = new Map(e.heap.map((o) => [o.id, o]));
  const was = prev.stack.find((f) => f.id === top.id);

  if (e.event === 'exception') {
    const passedUp = prev.event === 'exception' && !e.stack.some((f) => f.id === prev.stack.at(-1)!.id);
    if (!passedUp) return `Line ${e.line} raises ${e.message ?? 'an error'}.`;
    const where = e.stack.length === 1 ? 'the top-level code' : top.fn;
    return `The ${errorName(prev.message)} isn't caught in ${prev.stack.at(-1)!.fn}, so it passes up to line ${e.line} in ${where}.`;
  }
  if (e.event === 'return' && top.returning) {
    const returns = `${top.fn} returns ${memText(top.returning, heap, e.stack.at(-2))}`;
    // A function that falls off its end after changing something: say both.
    const did = was && prev.event === 'line' ? changes(prev, e, was, top, heap, seen) : [];
    return did.length === 0 ? `${returns}.` : `Line ${was!.line} ${listWords(did.slice(0, NAMED_CHANGES - 1))}, and ${returns}.`;
  }
  if (!was) {
    // A frame that wasn't there: a call, from the frame under it (or, after the top level ended, the entry call).
    const caller = e.stack.at(-2)!;
    const call = `${top.fn}(${top.locals.map(([, v]) => memText(v, heap, caller)).join(', ')})`;
    if (prev.event === 'return' && prev.stack.length === 1) return `Your function is called: ${call}.`;
    return `Line ${caller.line} calls ${call}.`;
  }
  if (prev.event === 'exception') return `The ${errorName(prev.message)} is caught, so line ${e.line} runs next.`;

  // The line that ran is the one this frame was on at the step before.
  const ran = was.line;
  const clauses = [...changes(prev, e, was, top, heap, seen), ...prints.map((text) => `prints “${text}”`)];
  if (clauses.length === 0) {
    if (e.event === 'return') return `Line ${ran} runs.`;
    const tested = e.line !== ran ? testedCondition(source[ran - 1]) : null;
    // The body starts on the next line, so going there means the test passed.
    if (tested) return e.line === ran + 1 ? `Line ${ran}: ${tested}? Yes, so line ${e.line} runs next.` : `Line ${ran}: ${tested}? No, so line ${e.line} is next.`;
    return `Line ${ran} runs, and line ${e.line} is next.`;
  }
  const named =
    clauses.length > NAMED_CHANGES ? [...clauses.slice(0, NAMED_CHANGES - 1), `makes ${clauses.length - NAMED_CHANGES + 1} more changes`] : clauses;
  return `Line ${ran} ${listWords(named)}.`;
}

/**
 * The condition an if, elif or while line tests, when its body starts on the
 * next line: `n <= 1` from `if n <= 1:` or `} else if (n <= 1) {`.
 */
export function testedCondition(line: string | undefined): string | null {
  const m = line && /^\s*(?:\}\s*)?(?:else\s+if|elif|if|while)\b\s*(.*?)\s*[:{]\s*$/.exec(line);
  if (!m) return null;
  let condition = m[1].trim();
  if (condition.startsWith('(') && condition.endsWith(')') && balanced(condition.slice(1, -1))) condition = condition.slice(1, -1).trim();
  return condition || null;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    depth += c === '(' ? 1 : c === ')' ? -1 : 0;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** "ValueError" from "ValueError: negative". */
function errorName(message: string | undefined): string {
  const name = message?.split(':')[0].trim();
  return name && /^[\w.]+$/.test(name) ? name : 'error';
}

/** What a line did to its frame's names and to the objects in memory, as clauses: "sets total to 5". */
function changes(
  prev: Step,
  e: Step,
  was: StackFrame,
  now: StackFrame,
  heap: ReadonlyMap<string, HeapObject>,
  seen: ReadonlyMap<string, number>,
): string[] {
  const out: string[] = [];
  const before = new Map(prev.heap.map((o) => [o.id, o]));
  // Objects a name's clause already describes, so their contents aren't described again.
  const covered = new Set<string>();
  for (const [name, value] of now.locals) {
    const old = was.locals.find(([n]) => n === name)?.[1];
    if (old && sameValue(old, value)) continue;
    if ('prim' in value) {
      out.push(`sets ${name} to ${value.prim}`);
      continue;
    }
    covered.add(value.ref);
    const obj = heap.get(value.ref);
    if (!obj) out.push(`sets ${name}`);
    else if (!seen.has(value.ref)) out.push(obj.kind === 'function' && obj.name === name ? `defines ${name}` : `sets ${name} to a new ${objectText(obj, heap)}`);
    else {
      const other = otherName(e, now, name, value.ref);
      out.push(other ? `makes ${other} and ${name} name the same ${kindWord(obj)}` : `sets ${name} to the ${objectText(obj, heap)}`);
    }
  }
  for (const obj of e.heap) {
    const old = before.get(obj.id);
    if (!old || covered.has(obj.id) || JSON.stringify(old) === JSON.stringify(obj)) continue;
    out.push(mutation(old, obj, nameOf(obj.id, e, now, heap), heap));
  }
  return out;
}

/** Another name for the object, in this frame first, then in the frames below it. */
function otherName(e: Step, now: StackFrame, name: string, ref: string): string | null {
  for (const f of [now, ...e.stack.toReversed()]) {
    for (const [n, v] of f.locals) if ((f !== now || n !== name) && 'ref' in v && v.ref === ref) return n;
  }
  return null;
}

/** How to refer to an object: a name for it, a name's item or field ("grid[0]", "p.next"), or its kind. */
function nameOf(id: string, e: Step, now: StackFrame, heap: ReadonlyMap<string, HeapObject>): string {
  const frames = [now, ...e.stack.toReversed()];
  for (const f of frames) for (const [n, v] of f.locals) if ('ref' in v && v.ref === id) return n;
  for (const f of frames) {
    for (const [n, v] of f.locals) {
      const o = 'ref' in v ? heap.get(v.ref) : undefined;
      if (!o) continue;
      const isIt = (x: MemValue) => 'ref' in x && x.ref === id;
      if (o.kind === 'list' || o.kind === 'tuple') {
        const i = o.items.findIndex(isIt);
        if (i >= 0) return `${n}[${i}]`;
      } else if (o.kind === 'dict') {
        const entry = o.entries.find(([, x]) => isIt(x));
        if (entry) return `${n}[${memText(entry[0], heap)}]`;
      } else if (o.kind === 'object') {
        const field = o.fields.find(([, x]) => isIt(x));
        if (field) return `${n}.${field[0]}`;
      }
    }
  }
  const obj = heap.get(id);
  return `a ${obj ? kindWord(obj) : 'value'}`;
}

/** What changed inside an object, as a clause: "appends 4 to nums", "sets p.x to 3". */
function mutation(old: HeapObject, now: HeapObject, name: string, heap: ReadonlyMap<string, HeapObject>): string {
  const text = (v: MemValue) => memText(v, heap);
  if ((now.kind === 'list' || now.kind === 'tuple') && old.kind === now.kind && old.more === 0 && now.more === 0) {
    const [a, b] = [old.items, now.items];
    if (b.length === a.length + 1 && a.every((x, i) => sameValue(x, b[i]))) return `appends ${text(b.at(-1)!)} to ${name}`;
    if (b.length === a.length - 1 && b.every((x, i) => sameValue(x, a[i]))) return `removes ${text(a.at(-1)!)} from the end of ${name}`;
    if (a.length === b.length) {
      const diff = a.flatMap((x, i) => (sameValue(x, b[i]) ? [] : [i]));
      if (diff.length === 1) return `sets ${name}[${diff[0]}] to ${text(b[diff[0]])}`;
      const [i, j] = diff;
      if (diff.length === 2 && sameValue(a[i], b[j]) && sameValue(a[j], b[i])) return `swaps ${name}[${i}] and ${name}[${j}]`;
    }
  } else if (now.kind === 'set' && old.kind === 'set') {
    const added = now.items.filter((x) => !old.items.some((y) => sameValue(x, y)));
    const removed = old.items.filter((x) => !now.items.some((y) => sameValue(x, y)));
    if (added.length === 1 && removed.length === 0) return `adds ${text(added[0])} to ${name}`;
    if (removed.length === 1 && added.length === 0) return `removes ${text(removed[0])} from ${name}`;
  } else if (now.kind === 'dict' && old.kind === 'dict') {
    const set = now.entries.filter(([k, v]) => !old.entries.some(([k2, v2]) => sameValue(k, k2) && sameValue(v, v2)));
    const removed = old.entries.filter(([k]) => !now.entries.some(([k2]) => sameValue(k, k2)));
    if (set.length === 1 && removed.length === 0) return `sets ${name}[${text(set[0][0])}] to ${text(set[0][1])}`;
    if (removed.length === 1 && set.length === 0) return `removes ${text(removed[0][0])} from ${name}`;
  } else if (now.kind === 'object' && old.kind === 'object') {
    const set = now.fields.filter(([k, v]) => !old.fields.some(([k2, v2]) => k === k2 && sameValue(v, v2)));
    const removed = old.fields.filter(([k]) => !now.fields.some(([k2]) => k === k2));
    if (set.length === 1 && removed.length === 0) return `sets ${name}.${set[0][0]} to ${text(set[0][1])}`;
    if (removed.length === 1 && set.length === 0) return `deletes ${name}.${removed[0][0]}`;
  }
  return `changes ${name}`;
}

/** A value in a sentence: a primitive as written, a function by name, another object by a name for it or its contents. */
function memText(v: MemValue, heap: ReadonlyMap<string, HeapObject>, frame?: StackFrame): string {
  if ('prim' in v) return v.prim;
  const named = frame?.locals.find(([, x]) => 'ref' in x && x.ref === v.ref);
  if (named) return named[0];
  const obj = heap.get(v.ref);
  if (!obj) return '…';
  return obj.kind === 'function' ? obj.name : contents(obj, heap);
}

/** The words for an object's kind: list, array, dict, map, set, tuple, object, function, class, or its type. */
function kindWord(obj: HeapObject): string {
  if (obj.kind === 'function') return obj.type === 'class' ? 'class' : 'function';
  const builtIn: Record<string, string> = { Array: 'array', Map: 'map', Set: 'set', Object: 'object' };
  return builtIn[obj.type] ?? obj.type;
}

/** "list [1, 2, 3]", "Point (x: 1)", "function add". */
function objectText(obj: HeapObject, heap: ReadonlyMap<string, HeapObject>): string {
  return obj.kind === 'function' ? `${kindWord(obj)} ${obj.name}` : `${kindWord(obj)} ${contents(obj, heap)}`;
}

/** Characters of contents a note shows before it cuts them short. */
const CONTENTS_SHOWN = 30;

/** An object's contents, short: "[1, 2, 3]", "{'a': 1}", "(x: 1, y: 2)"; nested objects as "[…]". */
function contents(obj: HeapObject, heap: ReadonlyMap<string, HeapObject>): string {
  const inner = (v: MemValue): string => {
    if ('prim' in v) return v.prim;
    const o = heap.get(v.ref);
    if (!o) return '…';
    if (o.kind === 'function') return o.name;
    return o.kind === 'list' ? '[…]' : o.kind === 'tuple' ? '(…)' : '{…}';
  };
  let parts: string[];
  let [open, close] = ['[', ']'];
  if (obj.kind === 'function') return obj.name;
  if (obj.kind === 'dict') {
    parts = obj.entries.map(([k, v]) => `${inner(k)}: ${inner(v)}`);
    [open, close] = ['{', '}'];
  } else if (obj.kind === 'object') {
    parts = obj.fields.map(([k, v]) => `${k}: ${inner(v)}`);
    [open, close] = obj.type === 'Object' ? ['{', '}'] : ['(', ')'];
  } else {
    parts = obj.items.map(inner);
    if (obj.kind === 'tuple') [open, close] = ['(', ')'];
    if (obj.kind === 'set') [open, close] = ['{', '}'];
  }
  const shown: string[] = [];
  let length = 0;
  for (const part of parts) {
    if (shown.length > 0 && length + part.length > CONTENTS_SHOWN) break;
    shown.push(part);
    length += part.length + 2;
  }
  const cut = shown.length < parts.length || obj.more > 0;
  return `${open}${shown.join(', ')}${cut ? ', …' : ''}${close}`;
}

type GridEvent = Extract<RunEvent, { kind: 'grid' }>;
type ArrayEvent = Extract<RunEvent, { kind: 'array' }>;

/** At most this many cells are named in a write's narration; the rest are counted. */
const NAMED_SOURCES = 4;

/**
 * A run with grids, for GridView: every visual collection is a table, in the
 * order the run made it (grids with row and column numbers, arrays as one row
 * under column numbers). Cell writes mark the cell and draw arrows from the
 * cells the statement read, like the built-in DP tables.
 */
function traceGrid(result: RunResult, { maxFrames = 3_000 }: TraceOptions): Trace<GridState> {
  const events = result.events;
  const t = new GridTracer(GRID_STATS.map((s) => s.key));
  const grids = new Map<string, { table: string; name: string }>();
  const arrays = new Map<string, { table: string; name: string; length: number }>();
  // A table's columns are fixed, so an array's table is as wide as the array ever gets.
  const widest = new Map<string, number>();
  {
    const length = new Map<string, number>();
    for (const e of events) {
      if (e.kind === 'array') length.set(e.array, e.values.length);
      else if (e.kind === 'append') length.set(e.array, (length.get(e.array) ?? 0) + 1);
      else if (e.kind === 'pop') length.set(e.array, (length.get(e.array) ?? 1) - 1);
      else continue;
      const id = e.array;
      widest.set(id, Math.max(widest.get(id) ?? 0, length.get(id)!));
    }
  }
  // Cells the code has written, so an overwrite can say what it replaced (the starting fill isn't news).
  const written = new Set<string>();

  const headers = (n: number) => Array.from({ length: n }, (_, i) => ({ label: String(i) }));
  const addGrid = (e: GridEvent) => {
    const table = `grid:${e.grid}`;
    t.addTable({ id: table, label: e.name, rows: headers(e.rows), cols: headers(e.cols) });
    e.values.forEach((row, r) => row.forEach((v, c) => v != null && t.set([table, r, c], numText(v))));
    grids.set(e.grid, { table, name: e.name });
  };
  const addArray = (e: ArrayEvent) => {
    const table = `array:${e.array}`;
    t.addTable({ id: table, label: e.name, rows: [{ label: '' }], cols: headers(widest.get(e.array) ?? e.values.length) });
    e.values.forEach((v, i) => t.set([table, 0, i], numText(v)));
    arrays.set(e.array, { table, name: e.name, length: e.values.length });
  };

  const gridRef = (c: GridCell): CellRef | null => {
    const g = grids.get(c.grid);
    return g ? [g.table, c.row, c.col] : null;
  };
  const arrayRef = (array: string, index: number): CellRef | null => {
    const a = arrays.get(array);
    return a ? [a.table, 0, index] : null;
  };
  const gridName = (c: GridCell) => `${grids.get(c.grid)?.name ?? c.grid}[${c.row}][${c.col}]`;
  const arrayName = (array: string, index: number) => `${arrays.get(array)?.name ?? array}[${index}]`;
  const shownValue = (ref: CellRef | null) => {
    const text = ref ? t.get(ref) : '';
    return text === '' ? 'blank' : text;
  };
  const arrayText = (array: string) => {
    const a = arrays.get(array);
    if (!a) return '[]';
    return `[${Array.from({ length: a.length }, (_, i) => t.get([a.table, 0, i])).join(', ')}]`;
  };

  const frames: Frame<GridState>[] = [];
  let truncated = false;
  const push = (frame: Frame<GridState>) => {
    if (frames.length >= maxFrames) {
      truncated = true;
      return false;
    }
    frames.push(frame);
    return true;
  };
  const lineOf = (line: number | null) => (line == null ? null : line - 1);
  const said = (line: number | null, text: string) => (line == null ? capitalise(text) : `Line ${line} ${text}`);

  // Arguments exist from the call, before anything else is shown.
  const given: string[] = [];
  for (const e of events) {
    if (e.kind === 'grid' && e.line == null) {
      addGrid(e);
      given.push(`${e.name}, a table of ${sizeText(e.rows, e.cols)}`);
    } else if (e.kind === 'array' && e.line == null) {
      addArray(e);
      given.push(`${e.name} = ${arrayText(e.array)}`);
    }
  }
  push(t.frame({ note: given.length > 0 ? `Your function receives ${listWords(given)}.` : 'Your function starts.', line: null }));

  for (const e of events) {
    if (e.kind === 'step') continue;
    let ok = true;
    const at = { line: lineOf(e.line), vars: e.vars };
    switch (e.kind) {
      case 'grid': {
        if (e.line == null) continue;
        addGrid(e);
        const fill = e.values[0]?.[0];
        const cells = e.rows * e.cols === 0 ? '' : fill == null ? ', every cell blank' : `, every cell ${numText(fill)}`;
        ok = push(t.frame({ note: said(e.line, `makes ${e.name}, a table of ${sizeText(e.rows, e.cols)}${cells}.`), ...at }));
        break;
      }
      case 'array': {
        if (e.line == null) continue;
        addArray(e);
        ok = push(t.frame({ note: said(e.line, `makes a new array ${e.name} = ${arrayText(e.array)}.`), ...at }));
        break;
      }
      case 'compare': {
        t.count('comparisons');
        const refs = [e.a, e.b].map((o) => ('grid' in o ? gridRef(o) : 'array' in o ? arrayRef(o.array, o.index) : null));
        const text = (o: Operand) =>
          'grid' in o ? `${gridName(o)} (${o.value == null ? 'blank' : numText(o.value)})` : 'array' in o ? `${arrayName(o.array, o.index)} (${o.value})` : valueText(o.value);
        const question = `is ${text(e.a)} ${e.op} ${text(e.b)}? ${e.result ? 'Yes' : 'No'}.`;
        ok = push(t.frame({ note: said(e.line, question), ...at, marks: { compare: refs.filter((r): r is CellRef => r != null) } }));
        break;
      }
      case 'cellWrite': {
        const target = gridRef(e);
        if (!target) continue;
        const sources = e.from.filter((c) => gridRef(c) != null && !(c.grid === e.grid && c.row === e.row && c.col === e.col));
        const selfRead = sources.length < e.from.filter((c) => gridRef(c) != null).length;
        const named = e.from.filter((c) => gridRef(c) != null).map((c) => `${gridName(c)} (${shownValue(gridRef(c))})`);
        const shown = named.length > NAMED_SOURCES ? [...named.slice(0, NAMED_SOURCES - 1), `${named.length - NAMED_SOURCES + 1} more cells`] : named;
        const key = `${e.grid}:${e.row}:${e.col}`;
        const was = t.get(target);
        const value = numText(e.value);
        const replaced = written.has(key) && !selfRead && was !== '' && was !== value ? ` (it held ${was})` : '';
        t.set(target, value);
        t.count('writes');
        written.add(key);
        const using = shown.length > 0 ? `, using ${listWords(shown)}` : '';
        const refs = sources.map((c) => gridRef(c)!);
        const arrows = refs.filter((r) => r[0] === target[0]).map((from) => ({ from, to: target, mark: 'compare' as const }));
        ok = push(
          t.frame({
            note: said(e.line, `writes ${value} into ${gridName(e)}${replaced}${using}.`),
            ...at,
            marks: { write: [target], compare: refs },
            arrows,
          }),
        );
        break;
      }
      case 'write': {
        const target = arrayRef(e.array, e.index);
        if (!target) continue;
        const was = t.get(target);
        const value = numText(e.value);
        t.set(target, value);
        t.count('writes');
        const note = said(e.line, `writes ${value} into ${arrayName(e.array, e.index)}${was === '' || was === value ? '' : ` (it held ${was})`}.`);
        ok = push(t.frame({ note, ...at, marks: { write: [target] } }));
        break;
      }
      case 'append': {
        const a = arrays.get(e.array);
        if (!a) continue;
        const target: CellRef = [a.table, 0, a.length];
        t.set(target, numText(e.value));
        a.length += 1;
        t.count('writes');
        ok = push(t.frame({ note: said(e.line, `appends ${numText(e.value)} to ${a.name}.`), ...at, marks: { write: [target] } }));
        break;
      }
      case 'pop': {
        const a = arrays.get(e.array);
        if (!a) continue;
        const value = t.get([a.table, 0, e.index]);
        // Later cells shift left, as in the list itself.
        for (let i = e.index; i < a.length - 1; i++) t.set([a.table, 0, i], t.get([a.table, 0, i + 1]));
        t.set([a.table, 0, a.length - 1], '');
        a.length -= 1;
        const what = value === '' ? '' : `${value} `;
        ok = push(t.frame({ note: said(e.line, `removes ${what}from ${arrayName(e.array, e.index)}.`), ...at }));
        break;
      }
      case 'print': {
        ok = push(t.frame({ note: said(e.line, `prints “${e.text}”.`), ...at }));
        break;
      }
    }
    if (!ok) break;
  }

  const last = frames.at(-1)!;
  if (result.error) {
    const where = result.error.line == null ? '' : `Line ${result.error.line}: `;
    frames.push({ ...last, line: lineOf(result.error.line), note: `${where}${result.error.message}`, checkpoint: undefined });
  } else {
    const returned = result.returned == null ? '' : ` and returned ${jsonText(result.returned)}`;
    frames.push(t.frame({ note: `Your function finished${returned}.`, line: null, vars: last.vars }));
  }
  return { frames, truncated: truncated || result.error?.kind === 'limit' };
}

/** "3 rows and 4 columns". */
function sizeText(rows: number, cols: number): string {
  return `${rows} row${rows === 1 ? '' : 's'} and ${cols} column${cols === 1 ? '' : 's'}`;
}

/** A cell's number as the table shows it: whole numbers exactly, others to two decimals. */
function numText(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
}

/** "a", "a and b", "a, b and c". */
function listWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const isCell = (o: Operand): o is Extract<Operand, { array: string }> => 'array' in o;

function operandText(o: Operand, cellText: (array: string, index: number) => string): string {
  if ('grid' in o) return `${o.grid}[${o.row}][${o.col}] (${o.value})`;
  return isCell(o) ? `${cellText(o.array, o.index)} (${o.value})` : valueText(o.value);
}

function valueText(v: VarValue): string {
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

function jsonText(v: Json): string {
  return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v).replace(/,/g, ', ');
}

/**
 * Two writes form a swap when they exchange the values of two cells and come
 * from the same line or adjacent lines: a tuple or destructuring swap is one
 * line, a temp-variable swap two. Insertion sort's shift-then-insert spans
 * more lines and stays two writes.
 */
function isSwap(t: ArrayTracer, a: Write, b: Write, ref: (array: string, index: number) => SlotRef): boolean {
  if (a.array !== b.array || a.index === b.index) return false;
  if (a.line != null && b.line != null && b.line - a.line > 1) return false;
  const ra = ref(a.array, a.index);
  const rb = ref(b.array, b.index);
  if (t.isEmpty(ra) || t.isEmpty(rb)) return false;
  return a.value === t.value(rb) && b.value === t.value(ra);
}


function isAscending(values: readonly number[]): boolean {
  return values.every((v, i) => i === 0 || values[i - 1] <= v);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

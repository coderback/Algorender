// Turns a run of the learner's code into the same Trace the built-in
// visualisers play, so their code drives ArrayView with the usual player,
// narration, stats and code highlighting.

import type { Frame, Trace, VarValue } from '@/engine/types';
import { ArrayTracer, MAIN, type FrameOptions, type SlotRef } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import type { Json, Operand, RunEvent, RunResult } from './protocol';

export const RUN_STATS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'writes', label: 'Writes' },
] as const;

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

  push(t.frame({ note: `Your function receives ${first.name} = ${listText(first.array)}.`, line: null }));

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

const isCell = (o: Operand): o is Extract<Operand, { array: string }> => 'array' in o;

function operandText(o: Operand, cellText: (array: string, index: number) => string): string {
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

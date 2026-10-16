// An array run line by line (a 'lines' run on an array argument) on the array
// view: a frame per executed line, like the memory view, with the array as
// the code has it at that line. The learner's index variables (i, left, mid…)
// are drawn as pointers under it at every line, which a run recorded only at
// comparisons and writes can't do: code that reads cells inside arithmetic
// (`nums[i] + nums[j] == target`) makes no comparison of a cell at all.
//
// Between two steps, the run's array events say what the line did to the
// array: comparisons and writes are marked, and named in the narration.

import type { StatSpec } from '@/engine/module';
import type { Trace, VarValue } from '@/engine/types';
import { ArrayTracer, MAIN, type SlotRef } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { traceSteps, type StepOptions } from './lines';
import type { Operand, RunEvent, RunResult } from './protocol';
import { varOf } from './traceGraph';

export const ARRAY_LINES_STATS: readonly StatSpec[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'writes', label: 'Writes' },
];

type Write = Extract<RunEvent, { kind: 'write' }>;

export type ArrayLinesOptions = StepOptions & {
  /** Index variables drawn as pointers under the first array when they hold one of its indices. */
  pointers?: readonly string[];
};

/** An array run, line by line, on the array view; null when nothing ran or no array was made. */
export function traceArrayLines(result: RunResult, { pointers = [], ...options }: ArrayLinesOptions = {}): Trace<ArrayState> | null {
  const first = result.events.find((e): e is Extract<RunEvent, { kind: 'array' }> => e.kind === 'array');
  if (!first) return null;

  const t = new ArrayTracer(first.values, ['comparisons', 'writes']);
  t.setLaneLabel(MAIN, first.name);
  const lanes = new Map<string, string>([[first.array, MAIN]]);
  const names = new Map<string, string>([[first.array, first.name]]);
  const ref = (array: string, index: number): SlotRef => {
    const lane = lanes.get(array) ?? MAIN;
    return lane === MAIN ? index : [lane, index];
  };
  const cellText = (array: string, index: number) => `${names.get(array) ?? array}[${index}]`;
  const operand = (o: Operand) => ('array' in o ? `${cellText(o.array, o.index)} (${o.value})` : 'grid' in o ? `${o.grid}[${o.row}][${o.col}]` : text(o.value));

  return traceSteps(
    result,
    {
      picture: (e, { between }) => {
        const marks: { compare: SlotRef[]; write: SlotRef[]; swap: SlotRef[] } = { compare: [], write: [], swap: [] };
        const clauses: string[] = [];
        for (let k = 0; k < between.length; k++) {
          const ev = between[k];
          if (ev.kind === 'array') {
            if (ev === first) continue;
            const lane = `lane-${ev.array}`;
            lanes.set(ev.array, lane);
            names.set(ev.array, ev.name);
            t.addLane(lane, ev.name, ev.values.length);
            ev.values.forEach((v, i) => t.write([lane, i], v, { count: false }));
          } else if (ev.kind === 'compare') {
            t.count('comparisons');
            for (const o of [ev.a, ev.b]) if ('array' in o) marks.compare.push(ref(o.array, o.index));
            clauses.push(`checks ${operand(ev.a)} ${ev.op} ${operand(ev.b)}: ${ev.result ? 'yes' : 'no'}`);
          } else if (ev.kind === 'write') {
            const next = between[k + 1];
            if (next?.kind === 'write' && isSwap(t, ev, next, ref)) {
              t.swap(ref(ev.array, ev.index), ref(next.array, next.index));
              t.count('writes', 2);
              marks.swap.push(ref(ev.array, ev.index), ref(next.array, next.index));
              clauses.push(`swaps ${cellText(ev.array, ev.index)} and ${cellText(next.array, next.index)}`);
              k++;
              continue;
            }
            t.write(ref(ev.array, ev.index), ev.value);
            marks.write.push(ref(ev.array, ev.index));
            clauses.push(`writes ${ev.value} into ${cellText(ev.array, ev.index)}`);
          } else if (ev.kind === 'append') {
            const lane = lanes.get(ev.array) ?? MAIN;
            t.append(lane, ev.value);
            t.count('writes');
            marks.write.push(ref(ev.array, t.laneLength(lane) - 1));
            clauses.push(`appends ${ev.value} to ${names.get(ev.array) ?? ev.array}`);
          } else if (ev.kind === 'pop') {
            t.removeAt(ref(ev.array, ev.index));
            clauses.push(`removes ${cellText(ev.array, ev.index)}`);
          }
        }
        // The innermost call's index variables, as pointers into the first array.
        const top = e.stack.at(-1)!;
        const at: Record<string, SlotRef> = {};
        const vars: Record<string, VarValue> = {};
        for (const [name, v] of top.locals) {
          const shown = varOf(v);
          if (shown !== undefined) vars[name] = shown;
          if (pointers.includes(name) && typeof shown === 'number' && Number.isInteger(shown) && shown >= 0 && shown < t.length) at[name] = shown;
        }
        // Marks first, so a marked cell isn't hidden by the line's other marks: a swap wins over a write.
        const frame = t.frame({ note: '', marks: { compare: marks.compare, write: marks.write, swap: marks.swap }, pointers: at });
        return { state: frame.state, clauses, stats: { comparisons: t.stats.comparisons, writes: t.stats.writes }, vars };
      },
      settle: (state) => ({ ...state, marks: {} }),
    },
    options,
  );
}

function text(v: VarValue): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

/** Two writes that exchange two cells' values (one tuple or destructuring assignment): a swap. */
function isSwap(t: ArrayTracer, a: Write, b: Write, ref: (array: string, index: number) => SlotRef): boolean {
  if (a.array !== b.array || a.index === b.index) return false;
  const ra = ref(a.array, a.index);
  const rb = ref(b.array, b.index);
  if (t.isEmpty(ra) || t.isEmpty(rb)) return false;
  return a.value === t.value(rb) && b.value === t.value(ra);
}

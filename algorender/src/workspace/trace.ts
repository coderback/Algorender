// Turns a run of the learner's code into the same Trace the built-in
// visualisers play, so their code drives ArrayView (or, once it makes a grid,
// GridView) with the usual player, narration, stats and code highlighting.

import type { StatSpec } from '@/engine/module';
import type { Frame, Trace, VarValue } from '@/engine/types';
import { ArrayTracer, MAIN, type FrameOptions, type SlotRef } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import type { GridCell, Json, Operand, RunEvent, RunResult } from './protocol';

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

/** A run as the stage plays it: which view, its trace, and the stats it counts. */
export type RunTrace =
  | { view: 'array'; trace: Trace<ArrayState>; stats: readonly StatSpec[] }
  | { view: 'grid'; trace: Trace<GridState>; stats: readonly StatSpec[] };

/**
 * The learner's run for the stage, or null when nothing ran. A run that made
 * no grid plays on ArrayView exactly as traceRun gives it; one that made a
 * grid plays on GridView, with every collection (arrays as one-row tables).
 */
export function traceFor(result: RunResult, options: TraceOptions = {}): RunTrace | null {
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

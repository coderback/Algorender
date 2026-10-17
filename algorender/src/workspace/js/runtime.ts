// Runs a learner's JavaScript or TypeScript against visual arrays and reports
// what it did as RunEvents (protocol.ts). Pure and synchronous, so the worker
// and the tests run exactly the same code.
//
// instrument.ts rewrites the code to call the `__viz` helpers below: line()
// before every statement, cmp()/cell() for comparisons, enter()/leave() around
// function bodies, rethrow() in catch clauses, named() for `x = table(…)`.
// Array arguments (and array()) arrive as Proxies over plain arrays that
// record writes, pushes and pops, and refuse the mutators the view can't show
// step by step. Grids (arguments and table()) are a Proxy over an array of row
// Proxies: rows record cell reads (for a cell write's `from`, cleared by
// line()) and writes, and neither can be replaced or resized. Every event is
// recorded before its change is applied, so the final collections always
// match the events, even when that event is the one that stops the run.
//
// In 'lines' mode the runtime also keeps a stack of frames (the Global frame,
// then one per call from enter() to exit()), each with the line it is on and
// its latest capture, and records a `step` with every frame's variables and
// the objects they reach at each step(), return and exception. Objects get
// ids from a WeakMap, in the order first seen, so ids are stable for the run
// and never reused.
//
// 'judge' mode runs the code as written (TypeScript stripped, nothing added),
// so a big test runs at full speed; the worker's timeout is the only limit.
// Arguments are plain values, printing is capped, an error's line comes from
// the stack trace, and the result carries every argument's final value.

import type { VarValue } from '@/engine/types';
import {
  MAX_CELLS,
  MAX_DEPTH,
  MAX_FROM,
  MAX_ITEMS,
  MAX_OBJECTS,
  MAX_PRINT_CHARS,
  MAX_PRINTS,
  type Arg,
  type CompareOp,
  type GridCell,
  type HeapObject,
  type Json,
  type Limits,
  type MemValue,
  type MethodCall,
  type Operand,
  type RunError,
  type RunEvent,
  type RunMode,
  type RunRequest,
  type RunResult,
  type StackFrame,
} from '../protocol';
import { instrument, LearnerSyntaxError, prepare } from './instrument';

/** Lists longer than this show their first items, then the length (as the Python runtime does). */
const LIST_SHOWN = 12;
/** Strings longer than this are cut, ellipsis included. */
const STR_SHOWN = 40;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** The longest linked list returned as JSON; past it the answer is reported as not a list. */
const MAX_LIST = 1_000_000;

const REPORTED_OP: Record<string, CompareOp> = {
  '<': '<', '<=': '<=', '>': '>', '>=': '>=', '==': '==', '!=': '!=', '===': '==', '!==': '!=',
};

/** Ends a run at a limit. Not an Error: the learner never sees it, and it needs no stack. */
class StopSignal {}
const STOP = new StopSignal();

/** A visual-array cell read by a comparison: which cell, and what it held. */
class Cell {
  readonly array: string;
  readonly index: number;
  readonly value: number;
  constructor(array: string, index: number, value: number) {
    this.array = array;
    this.index = index;
    this.value = value;
  }
}

/** A visual-grid cell read by a comparison. */
class GridCellValue {
  readonly grid: string;
  readonly row: number;
  readonly col: number;
  readonly value: number | null;
  constructor(grid: string, row: number, col: number, value: number | null) {
    this.grid = grid;
    this.row = row;
    this.col = col;
    this.value = value;
  }
}

const isCell = (x: unknown): x is Cell | GridCellValue => x instanceof Cell || x instanceof GridCellValue;

/** Reads the variables in scope where it was created (built by instrument.ts). */
type Capture = (() => Record<string, unknown>) | null;
/** What a visual Proxy stands for. `id` is unique in the run; `name` is the learner's variable, for messages. */
type ArrayInfo = { kind: 'array'; id: string; name: string; data: number[] };
/** `rows` are the row Proxies the learner's code sees, so a row kept in a variable is the same object in memory. */
type GridInfo = { kind: 'grid'; id: string; name: string; data: (number | null)[][]; rows: unknown[] };
type RowInfo = { kind: 'row'; grid: GridInfo; r: number; data: (number | null)[] };
/** A graph argument. `lists` holds the neighbour-list Proxies the learner's code sees, by node. */
type GraphInfo = { kind: 'graph'; id: string; name: string; lists: Map<string, unknown>; raw: Map<string, unknown[]> };
/** One node's neighbours: bare nodes, or frozen [node, weight] pairs when weighted. */
type NeighboursInfo = { kind: 'neighbours'; graph: GraphInfo; node: string; weighted: boolean; data: unknown[] };
type Visual = ArrayInfo | GridInfo | RowInfo | GraphInfo | NeighboursInfo;
type At = { line: number | null; vars: Record<string, VarValue> };

/** 'lines' mode: a call as the memory diagram draws it. */
type MemFrame = {
  id: string;
  fn: string;
  /** enter()'s handle for the call (0 for the Global frame). */
  depth: number;
  line: number;
  /** Reads the frame's variables as its latest step left them. */
  capture: Capture;
  /** Names in the order first bound. */
  order: string[];
  seen: Set<string>;
  returned?: { value: unknown };
  threw?: { error: unknown };
};

/** The objects one step reaches, breadth first: each listed once, at the slot it was first reached in. */
type Heap = { objects: HeapObject[]; slot: Map<string, number>; queue: [string, object][] };

/** A value drawn inline, written as JS prints it, or null for an object. */
function primitive(v: unknown): MemValue | null {
  switch (typeof v) {
    case 'number':
      return { prim: Object.is(v, -0) ? '-0' : String(v), type: 'number' };
    case 'bigint':
      return { prim: `${v}n`, type: 'number' };
    case 'string':
      return { prim: v.length <= STR_SHOWN ? JSON.stringify(v) : `${JSON.stringify(v.slice(0, STR_SHOWN - 1)).slice(0, -1)}…"`, type: 'string' };
    case 'boolean':
      return { prim: String(v), type: 'boolean' };
    case 'undefined':
      return { prim: 'undefined', type: 'none' };
    case 'symbol':
      return { prim: v.toString(), type: 'string' };
    default:
      return v === null ? { prim: 'null', type: 'none' } : null;
  }
}

/** Past MAX_OBJECTS in one step, a reference shows as this. */
const NOT_SHOWN: MemValue = { prim: '…', type: 'none' };

/** An object's constructor name, read without running getters. */
function typeName(x: object, fallback: string): string {
  const proto: unknown = Object.getPrototypeOf(x);
  if (proto === null || typeof proto !== 'object') return fallback;
  const ctor: unknown = Object.getOwnPropertyDescriptor(proto, 'constructor')?.value;
  return typeof ctor === 'function' && ctor.name ? ctor.name : fallback;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Values as the learner reads them in a message: `[1, null]`. */
const cellsText = (data: readonly (number | null)[]) => `[${data.map(String).join(', ')}]`;

const SKIP = Symbol('skip');
/** A key that looks like an index but isn't a whole number (1.5, NaN, undefined). */
const BAD_INDEX = Symbol('bad index');

const withCommas = (n: number) => n.toLocaleString('en-US');
const short = (text: string) => (text.length <= STR_SHOWN ? text : `${text.slice(0, STR_SHOWN - 1)}…`);
const zero = (n: number) => (n === 0 ? 0 : n); // -0 → 0, as JSON would

/** A property key as an array index: the index, BAD_INDEX, or null for an ordinary property (length, push…). */
function asIndex(key: string): number | typeof BAD_INDEX | null {
  if (key === 'undefined' || key === 'null') return BAD_INDEX;
  const n = Number(key);
  if (String(n) !== key) return null;
  return Number.isInteger(n) ? n : BAD_INDEX;
}

function evaluate(op: string, a: unknown, b: unknown): boolean {
  // The operator's own semantics, coercions included; the casts only satisfy TypeScript.
  const x = a as number;
  const y = b as number;
  switch (op) {
    case '<': return x < y;
    case '<=': return x <= y;
    case '>': return x > y;
    case '>=': return x >= y;
    case '==': return x == y;
    case '!=': return x != y;
    case '===': return x === y;
    case '!==': return x !== y;
    default: throw new Error(`Unknown comparison ${op}`);
  }
}

// A grid's rows and a row's cells are fixed in number, like the table on screen.
const GRID_REFUSED: Record<string, (name: string) => string> = {
  ...Object.fromEntries(
    ['push', 'pop', 'shift', 'unshift', 'splice'].map((m) => [
      m,
      (g: string) => `${g}.${m}() would change the size of ${g}, but a table keeps its size; make it as big as you need with table(rows, cols).`,
    ]),
  ),
  sort: (g) => `${g}.sort() would reorder the rows without showing the steps.`,
  reverse: (g) => `${g}.reverse() would reorder the rows without showing the steps.`,
  fill: (g) => `${g}.fill() would replace whole rows of ${g}; set its cells one at a time with ${g}[i][j] = ….`,
  copyWithin: (g) => `${g}.copyWithin() would replace whole rows of ${g}; set its cells one at a time with ${g}[i][j] = ….`,
};

const ROW_REFUSED: Record<string, (row: string, grid: string) => string> = {
  ...Object.fromEntries(
    ['push', 'pop', 'shift', 'unshift', 'splice'].map((m) => [
      m,
      (row: string, g: string) => `${row}.${m}() would change the length of a row of ${g}, but a table keeps its size; set cells with ${row}[j] = ….`,
    ]),
  ),
  sort: (row) => `${row}.sort() would sort without showing the steps; set the cells yourself.`,
  reverse: (row) => `${row}.reverse() would reverse without showing the steps; set the cells yourself.`,
  fill: (row) => `${row}.fill() would change many cells at once; set one cell at a time with ${row}[j] = ….`,
  copyWithin: (row) => `${row}.copyWithin() would change many cells at once; set one cell at a time with ${row}[j] = ….`,
};

const REFUSED: Record<string, (name: string) => string> = {
  sort: (a) => `${a}.sort() would sort without showing the steps; write the comparisons and swaps yourself.`,
  reverse: (a) => `${a}.reverse() would reverse without showing the steps; swap the cells yourself.`,
  splice: (a) => `${a}.splice() would shift cells without showing the steps; move values with ${a}[i] = … and use ${a}.push() or ${a}.pop().`,
  shift: (a) => `${a}.shift() would move every cell without showing the steps; move values with ${a}[i] = … and use ${a}.pop().`,
  unshift: (a) => `${a}.unshift() would move every cell without showing the steps; use ${a}.push() and move values with ${a}[i] = ….`,
  fill: (a) => `${a}.fill() would change many cells at once; assign one cell at a time with ${a}[i] = ….`,
  copyWithin: (a) => `${a}.copyWithin() would change many cells at once; assign one cell at a time with ${a}[i] = ….`,
};

class Run {
  readonly events: RunEvent[] = [];
  /** Each visual array's values, by id. */
  readonly arrays = new Map<string, number[]>();
  /** Each visual grid's rows, by id. */
  readonly grids = new Map<string, (number | null)[][]>();
  /**
   * Grid cells the current function's statement has read, in order, each once,
   * by `grid:row:col`. A call starts its own; when it returns, what its last
   * statement read joins the caller's, so `dp[i][j] = at(i - 1, j) + …` and
   * memoised recursion list the cells their calls returned.
   */
  private reads = new Map<string, GridCell>();
  /** The callers' read logs, one per tracked frame, like `frames`. */
  private readonly callerReads: Map<string, GridCell>[] = [];
  private readonly ids = new Set<string>();
  private readonly unnamed = { table: 0, array: 0 };
  /** Set when a limit stopped the run, even if the learner's code caught the signal. */
  stopped: RunError | null = null;
  /** Set once the run has returned: callbacks that outlive it (timers, promises) stop at their next line. */
  done = false;
  /** The latest statement in the current frame, for events. */
  private line: number | null = null;
  private capture: Capture = null;
  /** The latest statement or comparison, for errors. */
  errorLine: number | null = null;
  private steps = 0;
  /** Saved (line, capture) pairs of the callers, two slots per frame. */
  private readonly frames: unknown[] = [];
  private readonly visual = new WeakMap<object, Visual>();
  private readonly limits: Limits;
  /** 'lines' mode: memory at every step. */
  private readonly lines: boolean;
  /** 'judge' mode: plain arguments and helpers, capped printing, no events but prints. */
  readonly judging: boolean;
  /** 'judge' mode: lines printed so far. */
  private printed = 0;
  /** 'lines' mode: the Global frame, then the calls in progress. */
  private readonly stack: MemFrame[] = [];
  private calls = 0;
  private readonly objectIds = new WeakMap<object, string>();
  private objectCount = 0;
  /** Set while memory is read, so a getter or Proxy trap of the learner's records no steps of its own. */
  private reading = false;

  constructor(limits: Limits, mode: RunMode = 'visual') {
    this.limits = limits;
    this.lines = mode === 'lines';
    this.judging = mode === 'judge';
  }

  /** The `__viz` object the instrumented code calls. */
  readonly viz = {
    line: (n: number, capture: Capture) => {
      if (this.stopped || this.done) throw STOP;
      if (++this.steps > this.limits.maxSteps) {
        this.stop(`Stopped after ${withCommas(this.limits.maxSteps)} steps: is there a loop that never ends?`, n);
      }
      this.line = n;
      this.capture = capture;
      this.errorLine = n;
      // A new statement: a cell write's `from` is only what its own statement read.
      if (this.reads.size > 0) this.reads.clear();
    },
    cell: (obj: unknown, key: unknown, line: number): unknown => {
      this.errorLine = line;
      const info = typeof obj === 'object' && obj !== null ? this.visual.get(obj) : undefined;
      // A grid gives its row as usual (dp[i] in dp[i][j]); the row then gives the cell. A graph reads as usual.
      if (info && (info.kind === 'array' || info.kind === 'row') && typeof key !== 'symbol') {
        const k = String(key);
        const i = asIndex(k);
        if (i === null) return (obj as Record<string, unknown>)[k];
        if (info.kind === 'array') {
          const index = this.readable(info, k, i);
          return new Cell(info.id, index, info.data[index]);
        }
        const col = this.column(info, k, i);
        this.read(info, col);
        return new GridCellValue(info.grid.id, info.r, col, info.data[col]);
      }
      return (obj as Record<PropertyKey, unknown>)[key as PropertyKey];
    },
    cmp: (op: string, a: unknown, b: unknown, line: number, capture: Capture): boolean => {
      this.errorLine = line;
      const result = evaluate(op, isCell(a) ? a.value : a, isCell(b) ? b.value : b);
      if (isCell(a) || isCell(b)) {
        this.emit({ kind: 'compare', op: REPORTED_OP[op], a: this.operand(a), b: this.operand(b), result, line, vars: this.vars(capture) });
      }
      return result;
    },
    /** `name = table(…)`: the helper, told the variable's name; a learner's own function of that name as it is. */
    named: (name: string, fn: unknown): unknown => {
      if (fn === this.helpers.table) return (rows: unknown, cols: unknown, fill: unknown = 0) => this.makeTable(name, rows, cols, fill);
      if (fn === this.helpers.array) return (values: unknown, fill: unknown = 0) => this.makeArray(name, values, fill);
      return fn;
    },
    enter: (name?: string): number => {
      if (this.lines && this.stack.length > MAX_DEPTH) {
        this.stop(`Stopped at ${MAX_DEPTH} nested calls: is there a recursion that never ends?`, this.line);
      }
      this.frames.push(this.line, this.capture);
      this.callerReads.push(this.reads);
      this.reads = new Map();
      const depth = this.frames.length;
      if (this.lines) {
        this.stack.push({ id: `f${++this.calls}`, fn: name ?? '(anonymous)', depth, line: this.line ?? 0, capture: null, order: [], seen: new Set() });
      }
      return depth;
    },
    leave: (depth: number, value?: unknown): unknown => {
      const frame = this.stack.at(-1);
      if (frame?.depth === depth) frame.returned = { value };
      // Frames that threw never left, so restore by depth, dropping theirs too.
      if (depth >= 2 && depth <= this.frames.length) {
        this.line = this.frames[depth - 2] as number | null;
        this.capture = this.frames[depth - 1] as Capture;
        this.frames.length = depth - 2;
        const caller = this.callerReads[depth / 2 - 1];
        for (const [key, cell] of this.reads) {
          if (caller.size >= MAX_FROM) break;
          if (!caller.has(key)) caller.set(key, cell);
        }
        this.callerReads.length = depth / 2 - 1;
        this.reads = caller;
      }
      this.errorLine = this.line;
      return value;
    },
    rethrow: (e: unknown) => {
      if (e instanceof StopSignal || this.stopped || this.done) throw STOP;
    },

    // 'lines' mode ----------------------------------------------------------------

    /**
     * line(), and a step of the innermost frame. Statements sharing a line are
     * one step, as in Python: a step just like the one before isn't repeated.
     */
    step: (n: number, capture: Capture) => {
      const last = this.events.at(-1);
      const top = this.stack.at(-1);
      const same = last?.kind === 'step' && last.event === 'line' && last.line === n && last.stack.at(-1)?.id === top?.id;
      this.stepAt(n, capture, !same);
    },
    /** A loop back at its line: always a step, even on the line it just ran. */
    loop: (n: number, capture: Capture) => this.stepAt(n, capture, true),
    /** The top level's names as it ends, for its 'return' step. */
    ended: (capture: Capture) => {
      if (this.stack.length === 1) this.stack[0].capture = capture;
    },
    /** for…of's iterable where lines are steps: before each fetch after the first, the loop's line is a step again. */
    each: (n: number, iterable: unknown): unknown => this.iterate(n, iterable, () => this.again(n)),
    /**
     * for…of's iterable elsewhere: before each fetch after the first, the loop
     * is back on its own line, with the variables as the last pass left them,
     * as Python's for is, so an edge the fetch takes is reported there.
     */
    iter: (n: number, iterable: unknown): unknown => this.iterate(n, iterable, () => this.viz.line(n, this.capture)),
    /** An exception is leaving the frame entered at `depth`. */
    unwind: (depth: number, error: unknown) => {
      const frame = this.stack.at(-1);
      if (frame?.depth === depth) frame.threw = { error };
    },
    /** The frame entered at `depth` ends: a 'return' step, or an 'exception' step if one is leaving it. */
    exit: (depth: number) => {
      const k = this.stack.findLastIndex((f) => f.depth === depth);
      if (k < 1) return;
      const frame = this.stack[k];
      try {
        if (k === this.stack.length - 1 && !this.stopped && !this.done && !this.reading) {
          const thrown = frame.threw?.error;
          if (!frame.threw) this.record('return', { returning: frame.returned?.value });
          else if (!(thrown instanceof StopSignal)) this.record('exception', { message: errorMessage(thrown, this) });
        }
      } finally {
        this.stack.length = k;
      }
    },
  };

  private stepAt(n: number, capture: Capture, recorded: boolean) {
    this.viz.line(n, capture);
    const frame = this.stack.at(-1);
    if (!frame) return;
    frame.line = n;
    frame.capture = capture;
    if (recorded) this.record('line');
  }

  /** A for…of loop's line again, with memory as the last pass left it (the frame's latest capture). */
  private again(n: number) {
    this.stepAt(n, this.stack.at(-1)?.capture ?? null, true);
  }

  /** Wraps a for…of iterable so `back()` runs before each fetch after the first. */
  private iterate(n: number, iterable: unknown, back: () => void): unknown {
    const make = iterable == null ? undefined : (iterable as { [Symbol.iterator]?: unknown })[Symbol.iterator];
    if (typeof make !== 'function') return iterable; // for…of throws its own error
    const it = make.call(iterable) as Iterator<unknown>;
    let started = false;
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: (...args: [] | [unknown]) => {
        if (started) back();
        started = true;
        return it.next(...args);
      },
      return: (value?: unknown) => (typeof it.return === 'function' ? it.return(value) : { done: true, value }),
    };
  }

  /**
   * Runs the learner's top level; in 'lines' mode as the Global frame, which
   * records a 'return' step when it finishes, or an 'exception' step when an
   * error leaves it.
   */
  topLevel(program: () => unknown): unknown {
    if (!this.lines) return program();
    this.stack.push({ id: 'global', fn: 'Global frame', depth: 0, line: 1, capture: null, order: [], seen: new Set() });
    let entry: unknown;
    try {
      entry = program();
    } catch (e) {
      if (!(e instanceof StopSignal) && !this.stopped) {
        this.stack.length = 1;
        this.record('exception', { message: errorMessage(e, this) });
      }
      throw e;
    }
    this.stack.length = 1;
    this.record('return');
    return entry;
  }

  /** A step: the stack as it stands, the objects it reaches, and (for a return) the value going back. */
  private record(event: 'line' | 'return' | 'exception', extra: { returning?: unknown; message?: string } = {}) {
    if (this.reading) return;
    if (this.stopped || this.done) throw STOP;
    const top = this.stack.at(-1)!;
    if (this.events.length >= this.limits.maxEvents) this.stop(this.limitMessage(), top.line);
    this.reading = true;
    try {
      const heap: Heap = { objects: [], slot: new Map(), queue: [] };
      const stack = this.stack.map((f) => this.stackFrame(f, heap));
      if ('returning' in extra) stack.at(-1)!.returning = this.memValue(extra.returning, heap);
      const step: Extract<RunEvent, { kind: 'step' }> = { kind: 'step', event, line: top.line, stack, heap: this.fillHeap(heap) };
      if (extra.message !== undefined) step.message = extra.message;
      this.events.push(step);
    } finally {
      this.reading = false;
    }
  }

  private stackFrame(f: MemFrame, heap: Heap): StackFrame {
    let raw: Record<string, unknown> = {};
    try {
      raw = f.capture?.() ?? {};
    } catch {
      // A learner's own getter that throws: show the frame without its names.
    }
    for (const name of Object.keys(raw)) {
      if (f.seen.has(name)) continue;
      f.seen.add(name);
      f.order.push(name);
    }
    const locals: [string, MemValue][] = [];
    for (const name of f.order) {
      if (Object.hasOwn(raw, name)) locals.push([name, this.memValue(raw[name], heap)]);
    }
    return { id: f.id, fn: f.fn, line: f.line, locals };
  }

  /** A value in memory: a primitive, or a reference to an object, which joins this step's heap. */
  private memValue(v: unknown, heap: Heap): MemValue {
    const prim = primitive(v);
    if (prim) return prim;
    const obj = v as object;
    let oid = this.objectIds.get(obj);
    if (oid === undefined) {
      oid = `o${++this.objectCount}`;
      this.objectIds.set(obj, oid);
    }
    if (!heap.slot.has(oid)) {
      if (heap.slot.size >= MAX_OBJECTS) return NOT_SHOWN;
      heap.slot.set(oid, heap.objects.length);
      heap.objects.push(null as unknown as HeapObject); // described by fillHeap
      heap.queue.push([oid, obj]);
    }
    return { ref: oid };
  }

  /** Describes every object reached so far, and whatever those reach. */
  private fillHeap(heap: Heap): HeapObject[] {
    for (let k = 0; k < heap.queue.length; k++) {
      const [oid, obj] = heap.queue[k];
      heap.objects[heap.slot.get(oid)!] = this.describe(oid, obj, heap);
    }
    return heap.objects;
  }

  /** An object as the diagram draws it, read through property descriptors so no getter runs. */
  private describe(id: string, x: object, heap: Heap): HeapObject {
    const value = (v: unknown) => this.memValue(v, heap);
    const listed = (items: readonly unknown[], n: number) => ({ items: items.slice(0, MAX_ITEMS).map(value), more: Math.max(0, n - MAX_ITEMS) });
    // A visual collection is a plain Array to the learner; its cells are read directly, so drawing it records no reads.
    const visual = this.visual.get(x);
    if (visual?.kind === 'graph') {
      // A plain object of neighbour lists, each the same Proxy the learner's code holds.
      const fields: [string, MemValue][] = [];
      for (const node of visual.lists.keys()) if (fields.length < MAX_ITEMS) fields.push([node, value(visual.lists.get(node))]);
      return { id, kind: 'object', type: 'Object', fields, more: Math.max(0, visual.lists.size - MAX_ITEMS) };
    }
    if (visual) {
      const items = visual.kind === 'grid' ? visual.rows : visual.data;
      return { id, kind: 'list', type: 'Array', ...listed(items, items.length) };
    }
    if (Array.isArray(x)) {
      const items: unknown[] = [];
      for (let i = 0; i < Math.min(x.length, MAX_ITEMS); i++) items.push(Object.getOwnPropertyDescriptor(x, i)?.value);
      return { id, kind: 'list', type: typeName(x, 'Array'), ...listed(items, x.length) };
    }
    // Maps and Sets through the built-in methods, so a subclass's overrides don't run.
    if (x instanceof Map) {
      const entries: [MemValue, MemValue][] = [];
      let n = 0;
      Map.prototype.forEach.call(x, (v: unknown, k: unknown) => {
        if (n++ < MAX_ITEMS) entries.push([value(k), value(v)]);
      });
      return { id, kind: 'dict', type: typeName(x, 'Map'), entries, more: Math.max(0, n - MAX_ITEMS) };
    }
    if (x instanceof Set) {
      const items: unknown[] = [];
      let n = 0;
      Set.prototype.forEach.call(x, (v: unknown) => {
        if (n++ < MAX_ITEMS) items.push(v);
      });
      return { id, kind: 'set', type: typeName(x, 'Set'), ...listed(items, n) };
    }
    if (typeof x === 'function') {
      const isClass = /^class\b/.test(Function.prototype.toString.call(x));
      return { id, kind: 'function', type: isClass ? 'class' : 'function', name: x.name || '(anonymous)' };
    }
    const fields: [string, MemValue][] = [];
    const keys = Object.keys(x);
    // An error's message isn't enumerable, but it is what the error says.
    if (x instanceof Error && !keys.includes('message')) keys.unshift('message');
    let n = 0;
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(x, key);
      if (!d || !('value' in d)) continue; // a getter: reading it would run the learner's code
      if (n++ < MAX_ITEMS) fields.push([key, value(d.value)]);
    }
    return { id, kind: 'object', type: typeName(x, 'Object'), fields, more: Math.max(0, n - MAX_ITEMS) };
  }

  private limitMessage(): string {
    const n = withCommas(this.limits.maxEvents);
    return this.lines
      ? `Stopped after ${n} steps: is there a loop that never ends?`
      : `Stopped after ${n} events: the code changed the array more times than the visual can show.`;
  }

  private print = (...args: unknown[]) => {
    const text = args.map((a) => this.show(a)).join(' ');
    if (!this.judging) {
      this.emit({ kind: 'print', text, ...this.at() });
      return;
    }
    // A judged run can print a lot (a loop over a big test): keep the start.
    if (this.printed > MAX_PRINTS) return;
    const kept = ++this.printed > MAX_PRINTS ? '… (the rest of the output is cut)' : text.length > MAX_PRINT_CHARS ? `${text.slice(0, MAX_PRINT_CHARS)}…` : text;
    this.events.push({ kind: 'print', text: kept, line: null, vars: {} });
  };

  private ignore = () => {};

  /** Stands in for `console` in the learner's code: anything printed becomes a print event. */
  readonly console = Object.freeze({
    log: this.print, info: this.print, warn: this.print, error: this.print, debug: this.print,
    trace: this.print, dir: this.print, table: this.print,
    assert: (ok: unknown, ...args: unknown[]) => {
      if (!ok) this.print('Assertion failed:', ...args);
    },
    group: this.ignore, groupCollapsed: this.ignore, groupEnd: this.ignore, time: this.ignore, timeEnd: this.ignore,
    timeLog: this.ignore, count: this.ignore, countReset: this.ignore, clear: this.ignore,
  });

  private stop(message: string, line: number | null): never {
    this.stopped = { kind: 'limit', message, line };
    throw STOP;
  }

  private emit(event: RunEvent) {
    if (this.stopped || this.done) throw STOP;
    if (this.events.length >= this.limits.maxEvents) this.stop(this.limitMessage(), event.line ?? this.errorLine);
    this.events.push(event);
  }

  private at(): At {
    return { line: this.line, vars: this.vars(this.capture) };
  }

  // Arguments and the helpers --------------------------------------------------

  arg(a: Arg): unknown {
    if (a.kind === 'value') return structuredClone(a.value);
    if (a.kind === 'list') return this.buildList(a.values);
    if (a.kind === 'tree') {
      if (!this.judging) this.emit({ kind: 'tree', name: a.name, values: [...a.values], line: null, vars: {} });
      return this.buildTree(a.values);
    }
    if (this.judging) {
      if (a.kind === 'graph') {
        return Object.fromEntries(a.adjacency.map(({ node, neighbours }) => [node, neighbours.map(({ to, weight }) => (a.weighted ? [to, weight] : to))]));
      }
      return structuredClone(a.values);
    }
    this.ids.add(a.name);
    if (a.kind === 'graph') {
      const { directed, weighted, adjacency, layout } = a;
      const spec = { directed, weighted, adjacency: structuredClone(adjacency), ...(layout && { layout: structuredClone(layout) }) };
      this.emit({ kind: 'graph', graph: a.name, name: a.name, ...spec, line: null, vars: {} });
      return this.visualGraph(a.name, a.weighted, a.adjacency);
    }
    if (a.kind === 'grid') {
      const values = a.values.map((row) => [...row]);
      this.emit({ kind: 'grid', grid: a.name, name: a.name, rows: values.length, cols: values[0]?.length ?? 0, values: values.map((row) => [...row]), line: null, vars: {} });
      return this.visualGrid(a.name, a.name, values);
    }
    this.emit({ kind: 'array', array: a.name, name: a.name, values: [...a.values], line: null, vars: {} });
    return this.visualArray(a.name, a.values);
  }

  /** table(), array(), TreeNode and ListNode as the learner's code sees them (globals it may shadow). */
  readonly helpers = {
    table: (rows: unknown, cols: unknown, fill: unknown = 0) => this.makeTable(null, rows, cols, fill),
    array: (values: unknown, fill: unknown = 0) => this.makeArray(null, values, fill),
    ListNode: class ListNode {
      val: unknown;
      next: unknown;
      constructor(val: unknown = 0, next: unknown = null) {
        this.val = val;
        this.next = next;
      }
    },
    // A class of this run's own, so a learner's change to it can't outlive the run.
    TreeNode: class TreeNode {
      val: unknown;
      left: unknown;
      right: unknown;
      constructor(val: unknown = 0, left: unknown = null, right: unknown = null) {
        this.val = val;
        this.left = left;
        this.right = right;
      }
    },
  };

  /** [name, id] for a new collection: the variable's name, or table1, array2…; the id gets a number on the end when taken. */
  private newId(name: string | null, kind: 'table' | 'array'): [string, string] {
    const label = name ?? `${kind}${++this.unnamed[kind]}`;
    let id = label;
    for (let k = 2; this.ids.has(id); k++) id = `${label}${k}`;
    this.ids.add(id);
    return [label, id];
  }

  private fillValue(fill: unknown, blankOk: boolean): number | null {
    if (fill === null && blankOk) return null;
    if (typeof fill !== 'number' || !Number.isFinite(fill)) {
      throw new TypeError(`fill must be ${blankOk ? 'a number or null' : 'a number'}, not ${short(this.show(fill, true))}.`);
    }
    return zero(fill);
  }

  private makeTable(name: string | null, rows: unknown, cols: unknown, fill: unknown): unknown {
    for (const n of [rows, cols]) {
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new TypeError(`table(rows, cols) needs whole numbers, not ${short(this.show(n, true))}.`);
    }
    const [r, c] = [rows as number, cols as number];
    if (r < 0 || c < 0) throw new RangeError(`table() can't make ${r < 0 ? `${r} rows` : `${c} columns`}.`);
    if (r * c > MAX_CELLS) {
      throw new RangeError(`table(${r}, ${c}) would make ${withCommas(r * c)} cells; a visual table holds at most ${withCommas(MAX_CELLS)}.`);
    }
    const value = this.fillValue(fill, true);
    if (this.judging) return Array.from({ length: r }, () => Array<number | null>(c).fill(value));
    const [label, id] = this.newId(name, 'table');
    const values = Array.from({ length: r }, () => Array<number | null>(c).fill(value));
    this.emit({ kind: 'grid', grid: id, name: label, rows: r, cols: c, values: values.map((row) => [...row]), ...this.at() });
    return this.visualGrid(id, label, values);
  }

  private makeArray(name: string | null, values: unknown, fill: unknown): unknown {
    let items: number[];
    if (typeof values === 'number') {
      if (!Number.isInteger(values)) throw new TypeError(`array() needs a whole number of cells, not ${values}.`);
      if (values < 0) throw new RangeError(`array() can't make ${values} cells.`);
      if (values > MAX_CELLS) {
        throw new RangeError(`array(${values}) would make ${withCommas(values)} cells; a visual array holds at most ${withCommas(MAX_CELLS)}.`);
      }
      items = Array<number>(values).fill(this.fillValue(fill, false)!);
    } else {
      const iterable = values != null && typeof (values as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
      if (!iterable) throw new TypeError(`array() takes a length or a list of numbers, not ${short(this.show(values, true))}.`);
      const list: unknown[] = Array.from(values as Iterable<unknown>);
      if (list.length > MAX_CELLS) {
        throw new RangeError(`array() would make ${withCommas(list.length)} cells; a visual array holds at most ${withCommas(MAX_CELLS)}.`);
      }
      for (const x of list) {
        if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError(`array() takes numbers, not ${short(this.show(x, true))}.`);
      }
      items = (list as number[]).map(zero);
    }
    if (this.judging) return items;
    const [label, id] = this.newId(name, 'array');
    this.emit({ kind: 'array', array: id, name: label, values: [...items], ...this.at() });
    return this.visualArray(id, items, label);
  }

  // Visual arrays ----------------------------------------------------------------

  private visualArray(id: string, values: number[], name = id): number[] {
    const data = [...values];
    const info: ArrayInfo = { kind: 'array', id, name, data };
    const methods: Record<string, unknown> = {
      push: (...items: unknown[]) => {
        for (const item of items) {
          const value = this.storable(name, item, `${name}.push()`);
          this.emit({ kind: 'append', array: id, value, ...this.at() });
          data.push(value);
        }
        return data.length;
      },
      pop: () => {
        if (data.length === 0) return undefined;
        this.emit({ kind: 'pop', array: id, index: data.length - 1, ...this.at() });
        return data.pop();
      },
    };
    for (const [method, why] of Object.entries(REFUSED)) {
      methods[method] = () => {
        throw new TypeError(why(name));
      };
    }
    const unchangeable = () => {
      throw new TypeError(`${name} is a visual array: change it with ${name}[i] = value, ${name}.push() or ${name}.pop().`);
    };
    // A Proxy over the real array, so Array.isArray, length, iteration and the
    // non-mutating methods all behave as usual (they read through `get`).
    const proxy = new Proxy(data, {
      get: (target, key, receiver) => {
        if (typeof key === 'string') {
          const i = asIndex(key);
          if (i !== null) return target[this.readable(info, key, i)];
          if (Object.hasOwn(methods, key)) return methods[key];
        }
        return Reflect.get(target, key, receiver);
      },
      set: (_target, key, value) => {
        if (typeof key === 'string') {
          const i = asIndex(key);
          if (i !== null) {
            this.write(info, key, i, value);
            return true;
          }
          if (key === 'length') throw new TypeError(`${name}.length can't be set directly; use ${name}.push() and ${name}.pop().`);
        }
        return unchangeable();
      },
      deleteProperty: () => {
        throw new TypeError(`delete ${name}[…] isn't shown on the array; use ${name}.pop() instead.`);
      },
      defineProperty: unchangeable,
      setPrototypeOf: unchangeable,
      preventExtensions: unchangeable,
    });
    this.visual.set(proxy, info);
    this.arrays.set(id, data);
    return proxy;
  }

  private readable({ name, data }: ArrayInfo, key: string, i: number | typeof BAD_INDEX): number {
    if (i === BAD_INDEX) throw new TypeError(`Index ${key} isn't a whole number, so it can't pick a cell of ${name}.`);
    if (i < 0 || i >= data.length) throw new RangeError(`Index ${i} is out of range for ${name} (length ${data.length})`);
    return i;
  }

  private write({ id, name, data }: ArrayInfo, key: string, i: number | typeof BAD_INDEX, value: unknown) {
    if (i === BAD_INDEX) throw new TypeError(`Index ${key} isn't a whole number, so it can't pick a cell of ${name}.`);
    if (i < 0 || i >= data.length) {
      const grow = i >= data.length ? `; use ${name}.push(value) to add to the end` : '';
      throw new RangeError(`Index ${i} is out of range for ${name} (length ${data.length})${grow}.`);
    }
    const stored = this.storable(name, value, `${name}[${i}]`);
    this.emit({ kind: 'write', array: id, index: i, value: stored, ...this.at() });
    data[i] = stored;
  }

  // Visual grids -------------------------------------------------------------------

  /** A Proxy over an array of row Proxies, so dp.length, iteration and dp.map(…) work as usual. */
  private visualGrid(id: string, name: string, values: (number | null)[][]): unknown {
    const data = values;
    const grid: GridInfo = { kind: 'grid', id, name, data, rows: [] };
    const rows = data.map((row, r) => this.visualRow(grid, r, row));
    grid.rows = rows;
    const methods: Record<string, unknown> = {};
    for (const [method, why] of Object.entries(GRID_REFUSED)) {
      methods[method] = () => {
        throw new TypeError(why(name));
      };
    }
    const fixed = (what: string) => {
      throw new TypeError(`${what} would change the size of ${name}, but a table keeps its size; make it as big as you need with table(rows, cols).`);
    };
    const unchangeable = () => {
      throw new TypeError(`${name} is a visual table: change it with ${name}[i][j] = value.`);
    };
    const proxy = new Proxy(rows, {
      get: (target, key, receiver) => {
        if (typeof key === 'string') {
          const i = asIndex(key);
          if (i !== null) return target[this.rowIndex(grid, key, i)];
          if (Object.hasOwn(methods, key)) return methods[key];
        }
        return Reflect.get(target, key, receiver);
      },
      set: (_target, key) => {
        if (typeof key === 'string') {
          if (asIndex(key) !== null) {
            throw new TypeError(`${name}[…] = … would replace a whole row of ${name}; set its cells one at a time with ${name}[i][j] = ….`);
          }
          if (key === 'length') return fixed(`Setting ${name}.length`);
        }
        return unchangeable();
      },
      deleteProperty: () => fixed(`delete ${name}[…]`),
      defineProperty: unchangeable,
      setPrototypeOf: unchangeable,
      preventExtensions: unchangeable,
    });
    this.visual.set(proxy, grid);
    this.grids.set(id, data);
    return proxy;
  }

  /** One row: reading a cell is remembered for the next cell write's `from`; writing one is an event. */
  private visualRow(grid: GridInfo, r: number, data: (number | null)[]): (number | null)[] {
    const info: RowInfo = { kind: 'row', grid, r, data };
    const label = `${grid.name}[${r}]`;
    const methods: Record<string, unknown> = {};
    for (const [method, why] of Object.entries(ROW_REFUSED)) {
      methods[method] = () => {
        throw new TypeError(why(label, grid.name));
      };
    }
    const fixed = (what: string) => {
      throw new TypeError(`${what} would change the length of a row of ${grid.name}, but a table keeps its size; set cells with ${label}[j] = ….`);
    };
    const unchangeable = () => {
      throw new TypeError(`${label} is a row of a visual table: change it with ${label}[j] = value.`);
    };
    const proxy = new Proxy(data, {
      get: (target, key, receiver) => {
        if (typeof key === 'string') {
          const i = asIndex(key);
          if (i !== null) {
            const col = this.column(info, key, i);
            this.read(info, col);
            return target[col];
          }
          if (Object.hasOwn(methods, key)) return methods[key];
        }
        return Reflect.get(target, key, receiver);
      },
      set: (_target, key, value) => {
        if (typeof key === 'string') {
          const i = asIndex(key);
          if (i !== null) {
            this.cellWrite(info, key, i, value);
            return true;
          }
          if (key === 'length') return fixed(`Setting ${label}.length`);
        }
        return unchangeable();
      },
      deleteProperty: () => fixed(`delete ${label}[…]`),
      defineProperty: unchangeable,
      setPrototypeOf: unchangeable,
      preventExtensions: unchangeable,
    });
    this.visual.set(proxy, info);
    return proxy;
  }

  // Graphs and trees ------------------------------------------------------------------

  /**
   * A graph argument: a Proxy over a plain object of neighbour-list Proxies, so
   * Object.keys, `in` and for…in work as usual. Getting a node's list is a
   * `neighbours` event (Object.entries and Object.values get every list, as
   * Python's items() and values() do); nothing can be changed.
   */
  private visualGraph(id: string, weighted: boolean, adjacency: Extract<Arg, { kind: 'graph' }>['adjacency']): unknown {
    const name = id;
    const graph: GraphInfo = { kind: 'graph', id, name, lists: new Map(), raw: new Map() };
    const target: Record<string, unknown> = {};
    for (const { node, neighbours } of adjacency) {
      const data = neighbours.map(({ to, weight }) => (weighted ? Object.freeze([to, weight]) : to));
      const list = this.neighbourList({ kind: 'neighbours', graph, node, weighted, data });
      graph.lists.set(node, list);
      graph.raw.set(node, data);
      target[node] = list;
    }
    const proxy = new Proxy(target, {
      get: (t, key, receiver) => {
        if (typeof key === 'string' && Object.hasOwn(t, key)) {
          this.emit({ kind: 'neighbours', graph: id, node: key, ...this.at() });
          return t[key];
        }
        return Reflect.get(t, key, receiver);
      },
      set: () => readOnly(name),
      deleteProperty: () => readOnly(name),
      defineProperty: () => readOnly(name),
      setPrototypeOf: () => readOnly(name),
      preventExtensions: () => readOnly(name),
    });
    this.visual.set(proxy, graph);
    return proxy;
  }

  /** One node's neighbours: taking an entry (by index, so iteration too) is an `edge` event; includes and indexOf take none. */
  private neighbourList(info: NeighboursInfo): unknown {
    const { graph, node, weighted, data } = info;
    const label = `${graph.name}[${JSON.stringify(node)}]`;
    const searches: Record<string, unknown> = Object.fromEntries(
      (['includes', 'indexOf', 'lastIndexOf'] as const).map((m) => [m, (...args: unknown[]) => (Array.prototype[m] as (...a: unknown[]) => unknown).apply(data, args)]),
    );
    const proxy = new Proxy(data, {
      get: (target, key, receiver) => {
        if (typeof key === 'string') {
          const i = asIndex(key);
          if (typeof i === 'number' && i >= 0 && i < target.length) {
            const item = target[i];
            const [to, weight] = weighted ? (item as [string, number]) : [item as string, 1];
            this.emit({ kind: 'edge', graph: graph.id, from: node, to, weight, ...this.at() });
            return item;
          }
          if (Object.hasOwn(searches, key)) return searches[key];
        }
        return Reflect.get(target, key, receiver);
      },
      set: () => readOnly(label),
      deleteProperty: () => readOnly(label),
      defineProperty: () => readOnly(label),
      setPrototypeOf: () => readOnly(label),
      preventExtensions: () => readOnly(label),
    });
    this.visual.set(proxy, info);
    return proxy;
  }

  /** The root of a tree given in level order (null: no node there), or null. */
  private buildTree(values: readonly (number | null)[]): unknown {
    const Node = this.helpers.TreeNode;
    if (values.length === 0 || values[0] === null) return null;
    const root = new Node(values[0]);
    const waiting = [root];
    let i = 1;
    for (let k = 0; i < values.length && k < waiting.length; k++) {
      const node = waiting[k];
      for (const side of ['left', 'right'] as const) {
        const v = values[i++];
        if (v !== null && v !== undefined) {
          const child = new Node(v);
          node[side] = child;
          waiting.push(child);
        }
      }
    }
    return root;
  }

  /** The head of a linked list holding these values, or null. */
  private buildList(values: readonly number[]): unknown {
    const Node = this.helpers.ListNode;
    let head: unknown = null;
    for (let i = values.length - 1; i >= 0; i--) head = new Node(values[i], head);
    return head;
  }

  /** A linked list as the JSON list of its values: [1, 2, 3]. */
  private listJson(head: object, path: object[]): Json {
    const out: Json[] = [];
    const seen = new Set<object>();
    for (let node: unknown = head; node != null; ) {
      if (!(node instanceof this.helpers.ListNode)) {
        out.push(this.json(node, path));
        break;
      }
      if (seen.has(node)) return 'not a list: it loops back to a node it already passed';
      if (seen.size >= MAX_LIST) return `not a list: longer than ${withCommas(MAX_LIST)} nodes`;
      seen.add(node);
      out.push(this.json(node.val, path));
      node = node.next;
    }
    return out;
  }

  /** A tree in level order, trailing gaps dropped, as JSON: [4, 2, 7, null, 3]. */
  private treeJson(root: object, path: object[]): Json {
    const out: Json[] = [];
    const seen = new Set<object>();
    const waiting: unknown[] = [root];
    for (let k = 0; k < waiting.length; k++) {
      const node = waiting[k];
      if (!(node instanceof this.helpers.TreeNode)) {
        out.push(node == null ? null : this.json(node, path));
        continue;
      }
      if (seen.has(node) || seen.size >= MAX_CELLS) return 'not a tree: a node can be reached twice';
      seen.add(node);
      out.push(this.json(node.val, path));
      waiting.push(node.left, node.right);
    }
    while (out.length > 0 && out.at(-1) === null) out.pop();
    return out;
  }

  private rowIndex({ name, data }: GridInfo, key: string, i: number | typeof BAD_INDEX): number {
    if (i === BAD_INDEX) throw new TypeError(`Index ${key} isn't a whole number, so it can't pick a row of ${name}.`);
    if (i < 0 || i >= data.length) throw new RangeError(`Row ${i} is out of range for ${name} (${plural(data.length, 'row')})`);
    return i;
  }

  private column({ grid, r, data }: RowInfo, key: string, i: number | typeof BAD_INDEX): number {
    if (i === BAD_INDEX) throw new TypeError(`Index ${key} isn't a whole number, so it can't pick a cell of ${grid.name}[${r}].`);
    if (i < 0 || i >= data.length) throw new RangeError(`Column ${i} is out of range for ${grid.name} (${plural(data.length, 'column')})`);
    return i;
  }

  private read({ grid, r }: RowInfo, col: number) {
    if (this.reads.size >= MAX_FROM) return;
    const key = `${grid.id}\u0000${r}\u0000${col}`;
    if (!this.reads.has(key)) this.reads.set(key, { grid: grid.id, row: r, col });
  }

  private cellWrite(info: RowInfo, key: string, i: number | typeof BAD_INDEX, value: unknown) {
    const col = this.column(info, key, i);
    const { grid, r, data } = info;
    const stored = this.storable(grid.name, value, `${grid.name}[${r}][${col}]`);
    const from = Array.from(this.reads.values(), (c) => ({ ...c }));
    this.emit({ kind: 'cellWrite', grid: grid.id, row: r, col, value: stored, from, ...this.at() });
    data[col] = stored;
  }

  private storable(name: string, value: unknown, what: string): number {
    if (typeof value !== 'number') throw new TypeError(`${name} holds numbers, so ${what} can't store ${short(this.show(value, true))}.`);
    if (!Number.isFinite(value)) throw new RangeError(`${name} holds finite numbers, so ${what} can't store ${value}.`);
    return zero(value);
  }

  // Rendering values --------------------------------------------------------------

  /** The variables a capture reads, as the variables panel shows them. */
  private vars(capture: Capture): Record<string, VarValue> {
    if (!capture) return {};
    let raw: Record<string, unknown>;
    try {
      raw = capture();
    } catch {
      return {};
    }
    const out: Record<string, VarValue> = {};
    for (const name of Object.keys(raw)) {
      if (name.startsWith('_')) continue;
      const shown = this.varValue(raw[name]);
      if (shown !== SKIP) out[name] = shown;
    }
    return out;
  }

  /** Numbers, booleans, null, short strings and lists of numbers; everything else is left out. */
  private varValue(v: unknown): VarValue | typeof SKIP {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? zero(v) : SKIP;
    if (typeof v === 'string') return short(v);
    try {
      if (Array.isArray(v) && !this.visual.has(v)) {
        const items: number[] = [];
        for (let i = 0; i < v.length; i++) {
          const x: unknown = v[i];
          if (typeof x !== 'number') return SKIP;
          items.push(x);
        }
        return listText(items);
      }
    } catch {
      // A learner's own Proxy that throws: leave it out.
    }
    return SKIP;
  }

  private operand(x: unknown): Operand {
    if (x instanceof Cell) return { array: x.array, index: x.index, value: x.value };
    if (x instanceof GridCellValue) return { grid: x.grid, row: x.row, col: x.col, value: x.value };
    const shown = this.varValue(x);
    if (shown !== SKIP) return { value: shown };
    return { value: x === undefined ? null : short(this.show(x, true)) };
  }

  /** A value as console.log shows it: strings raw at the top level, quoted inside lists. */
  show(v: unknown, nested = false, seen: Set<object> = new Set()): string {
    if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
    if (typeof v === 'bigint') return `${v}n`;
    if (typeof v === 'symbol') return v.toString();
    if (typeof v === 'function') return `[Function: ${v.name || '(anonymous)'}]`;
    if (v === null || typeof v !== 'object') return String(v);
    if (seen.has(v)) return '[Circular]';
    seen.add(v);
    try {
      const visual = this.visual.get(v);
      // A graph's parts are read directly, so printing them takes no edges.
      if (visual?.kind === 'graph' || visual?.kind === 'neighbours') return this.show(plainData(visual), nested, seen);
      if (visual) return visual.kind === 'grid' ? `[${visual.data.map(cellsText).join(', ')}]` : cellsText(visual.data);
      if (v instanceof this.helpers.TreeNode) return `TreeNode(${this.show(v.val, true, seen)})`;
      if (v instanceof this.helpers.ListNode) return `ListNode(${this.show(v.val, true, seen)})`;
      if (Array.isArray(v)) return `[${Array.from(v, (x) => this.show(x, true, seen)).join(', ')}]`;
      if (v instanceof Error) return `${v.name}: ${v.message}`;
      if (v instanceof Set) return `Set(${v.size}) {${Array.from(v, (x) => this.show(x, true, seen)).join(', ')}}`;
      if (v instanceof Map) {
        const entries = Array.from(v, ([k, x]) => `${this.show(k, true, seen)} => ${this.show(x, true, seen)}`);
        return `Map(${v.size}) {${entries.join(', ')}}`;
      }
      const json = JSON.stringify(v, (_k, x: unknown) => {
        const visual = typeof x === 'object' && x !== null ? this.visual.get(x) : undefined;
        return visual ? plainData(visual) : x;
      });
      if (json !== undefined) return json;
    } catch {
      // Cycles in JSON, throwing getters: fall back to the plainest text.
    } finally {
      seen.delete(v);
    }
    try {
      return String(v);
    } catch {
      return '[object]';
    }
  }

  /** The entry function's return value as JSON; anything JSON can't hold becomes text. */
  json(v: unknown, path: object[] = []): Json {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? zero(v) : String(v);
    if (typeof v === 'bigint') return String(v);
    if (typeof v !== 'object') return this.show(v); // functions, symbols
    if (path.includes(v)) return '…'; // contains itself
    const inner = [...path, v];
    const visual = this.visual.get(v);
    if (visual?.kind === 'graph' || visual?.kind === 'neighbours') return this.json(plainData(visual), inner);
    if (visual) return plainData(visual) as Json;
    if (v instanceof this.helpers.TreeNode) return this.treeJson(v, inner);
    if (v instanceof this.helpers.ListNode) return this.listJson(v, inner);
    if (Array.isArray(v)) return Array.from(v, (x) => this.json(x, inner));
    if (v instanceof Set) return Array.from(v, (x) => this.json(x, inner));
    if (v instanceof Map) return Array.from(v, ([k, x]) => [this.json(k, inner), this.json(x, inner)]);
    if (v instanceof Error) return this.show(v);
    const toJSON = (v as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') return this.json(toJSON.call(v), inner);
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x !== undefined) out[k] = this.json(x, inner);
    }
    return out;
  }
}

/** A copy of what a visual Proxy holds, as plain arrays. */
function plainData(visual: Visual): unknown {
  switch (visual.kind) {
    case 'grid':
      return visual.data.map((row) => [...row]);
    case 'graph':
      return Object.fromEntries(Array.from(visual.raw, ([node, data]) => [node, [...data]]));
    default:
      return [...visual.data];
  }
}

function readOnly(what: string): never {
  throw new TypeError(`${what} is part of the graph you were given, so it can't be changed here; keep what you find in an object, Set or array of your own.`);
}

function listText(items: number[]): string {
  const shown = items.slice(0, LIST_SHOWN).map(String).join(', ');
  return items.length > LIST_SHOWN ? `[${shown}, …] (${items.length} items)` : `[${shown}]`;
}

function errorMessage(e: unknown, run: Run): string {
  if (typeof e === 'object' && e !== null && 'name' in e && 'message' in e) {
    const name = String(e.name);
    const message = String(e.message);
    return message ? `${name}: ${message}` : name;
  }
  return `Uncaught ${short(run.show(e, true))}`;
}

function failed(kind: RunError['kind'], message: string, line: number | null = null): RunResult {
  return { events: [], arrays: {}, grids: {}, returned: null, error: { kind, message, line }, ms: 0 };
}

/** Runs one request to completion; never throws. */
export function runJs(request: RunRequest): RunResult {
  try {
    return execute(request);
  } catch (e) {
    return failed('internal', `The JavaScript runner failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  }
}

function execute(request: RunRequest): RunResult {
  const { language, entry } = request;
  if (language !== 'javascript' && language !== 'typescript') {
    return failed('internal', `The JavaScript runner can't run ${language}.`);
  }
  const mode = request.mode ?? 'visual';
  let code: string;
  try {
    code = mode === 'judge' ? prepare(request.code, language) : instrument(request.code, language, { lines: mode === 'lines' }).code;
  } catch (e) {
    if (e instanceof LearnerSyntaxError) return failed('syntax', e.message, e.line);
    throw e;
  }
  // The entry name is pasted into the code below, so it must be a plain name;
  // none at all runs only the top level.
  if (entry !== '' && !IDENTIFIER.test(entry)) return failed('internal', `“${entry}” isn't a valid function name.`);
  const lookup = entry === '' ? 'return undefined;' : `return typeof ${entry} === "function" ? ${entry} : undefined;`;

  const run = new Run(request.limits, mode);
  // The learner's top level runs inside a function: its declarations stay
  // local to this run, and `entry` is looked up once it has finished. The
  // helpers are parameters, so the learner's own `table` or `array` shadows them.
  const factory = new Function(...FACTORY_PARAMS, wrap(code, lookup));
  const { table, array, TreeNode, ListNode } = run.helpers;
  const program = factory(run.viz, run.console, table, array, TreeNode, ListNode) as () => unknown;

  let returned: unknown = undefined;
  let args: unknown[] = [];
  let calls: Json[] | null = null;
  let error: RunError | null = null;
  const started = performance.now();
  try {
    const fn = run.topLevel(program);
    if (entry === '') {
      // The top level was the whole program.
    } else if (typeof fn !== 'function') {
      error = { kind: 'runtime', message: `Define ${request.calls ? 'a class' : 'a function'} called ${entry}.`, line: null };
    } else if (request.calls) {
      calls = [];
      callMethods(run, fn as new (...args: unknown[]) => Record<string, unknown>, entry, request.calls, calls);
    } else {
      args = request.args.map((a) => run.arg(a));
      returned = (fn as (...args: unknown[]) => unknown)(...args);
    }
  } catch (e) {
    error =
      e instanceof StopSignal
        ? (run.stopped ?? { kind: 'internal', message: 'The run stopped without a reason.', line: null })
        : { kind: 'runtime', message: errorMessage(e, run), line: run.judging ? stackLine(e) : run.errorLine };
  }
  const ms = performance.now() - started;
  run.done = true;

  if (run.stopped) {
    error = run.stopped;
    returned = undefined;
  } else if (!error && returned instanceof Promise) {
    returned.catch(() => {}); // it will stop at its next line; don't leave an unhandled rejection
    error = { kind: 'runtime', message: `${entry} returned a Promise: async functions can't be shown step by step, so remove async.`, line: null };
    returned = undefined;
  }

  const toJson = (value: unknown): Json => {
    try {
      return run.json(value);
    } catch {
      return run.show(value); // a throwing toJSON or getter
    }
  };
  // A design problem's answer is what its calls returned, even the ones before an error.
  const json: Json = calls ?? (error ? null : toJson(returned));
  const arrays: Record<string, number[]> = {};
  for (const [id, data] of run.arrays) arrays[id] = [...data];
  const grids: Record<string, (number | null)[][]> = {};
  for (const [id, data] of run.grids) grids[id] = data.map((row) => [...row]);
  return { events: run.events, arrays, grids, returned: json, error, ms, ...(run.judging && { args: error ? [] : args.map(toJson) }) };
}

/**
 * A design problem: constructs the class with the first call's arguments, then
 * calls each method in turn, pushing what each returned (as JSON, at once, so a
 * later call can't change it) onto `out`.
 */
function callMethods(run: Run, cls: new (...args: unknown[]) => Record<string, unknown>, name: string, calls: MethodCall[], out: Json[]) {
  const [first, ...rest] = calls;
  const instance = new cls(...structuredClone(first?.args ?? []));
  out.push(null);
  for (const { method, args } of rest) {
    const fn = instance[method];
    if (typeof fn !== 'function') throw new TypeError(`${name} has no method called ${method}.`);
    const value = (fn as (...args: unknown[]) => unknown).apply(instance, structuredClone(args));
    out.push(run.json(value));
  }
}

/** The helpers, in the order the program factory takes them. */
const FACTORY_PARAMS = ['__viz', 'console', 'table', 'array', 'TreeNode', 'ListNode'];
/** The program factory's body: the learner's code starts on its second line. */
const wrap = (code: string, lookup: string) => `return function () {\n${code}\n${lookup}\n};`;

/**
 * Where the learner's line 1 sits in a factory's stack traces, found once by
 * throwing from it: engines number the lines of a `new Function` body
 * differently (V8 adds two for its header).
 */
let lineOffset: number | null | undefined;

/**
 * 'judge' mode: the learner's line an error came from, read from its stack
 * trace (the innermost frame in code made by `new Function`), or null.
 */
function stackLine(e: unknown): number | null {
  if (lineOffset === undefined) lineOffset = probeLine();
  const line = lineIn(e);
  return line == null || lineOffset == null || line - lineOffset < 1 ? null : line - lineOffset;
}

function lineIn(e: unknown): number | null {
  const stack = typeof e === 'object' && e !== null && 'stack' in e ? String(e.stack) : '';
  // V8: "at f (eval at …, <anonymous>:4:11)"; Firefox: "f@… > Function:4:11".
  const match = /(?:<anonymous>|> Function):(\d+):\d+/.exec(stack);
  return match ? Number(match[1]) : null;
}

function probeLine(): number | null {
  try {
    (new Function(...FACTORY_PARAMS, wrap('throw new Error("probe");', '')) as () => () => void)()();
  } catch (e) {
    const line = lineIn(e);
    return line == null ? null : line - 1;
  }
  return null;
}

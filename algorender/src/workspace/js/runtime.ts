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

import type { VarValue } from '@/engine/types';
import {
  MAX_CELLS,
  MAX_FROM,
  type Arg,
  type CompareOp,
  type GridCell,
  type Json,
  type Limits,
  type Operand,
  type RunError,
  type RunEvent,
  type RunRequest,
  type RunResult,
} from '../protocol';
import { instrument, LearnerSyntaxError } from './instrument';

/** Lists longer than this show their first items, then the length (as the Python runtime does). */
const LIST_SHOWN = 12;
/** Strings longer than this are cut, ellipsis included. */
const STR_SHOWN = 40;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

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
type GridInfo = { kind: 'grid'; id: string; name: string; data: (number | null)[][] };
type RowInfo = { kind: 'row'; grid: GridInfo; r: number; data: (number | null)[] };
type Visual = ArrayInfo | GridInfo | RowInfo;
type At = { line: number | null; vars: Record<string, VarValue> };

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

  constructor(limits: Limits) {
    this.limits = limits;
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
      // A grid gives its row as usual (dp[i] in dp[i][j]); the row then gives the cell.
      if (info && info.kind !== 'grid' && typeof key !== 'symbol') {
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
    enter: (): number => {
      this.frames.push(this.line, this.capture);
      this.callerReads.push(this.reads);
      this.reads = new Map();
      return this.frames.length;
    },
    leave: (depth: number, value?: unknown): unknown => {
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
  };

  private print = (...args: unknown[]) => {
    this.emit({ kind: 'print', text: args.map((a) => this.show(a)).join(' '), ...this.at() });
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
    if (this.events.length >= this.limits.maxEvents) {
      this.stop(
        `Stopped after ${withCommas(this.limits.maxEvents)} events: the code changed the array more times than the visual can show.`,
        event.line ?? this.errorLine,
      );
    }
    this.events.push(event);
  }

  private at(): At {
    return { line: this.line, vars: this.vars(this.capture) };
  }

  // Arguments and the helpers --------------------------------------------------

  arg(a: Arg): unknown {
    if (a.kind === 'value') return structuredClone(a.value);
    this.ids.add(a.name);
    if (a.kind === 'grid') {
      const values = a.values.map((row) => [...row]);
      this.emit({ kind: 'grid', grid: a.name, name: a.name, rows: values.length, cols: values[0]?.length ?? 0, values: values.map((row) => [...row]), line: null, vars: {} });
      return this.visualGrid(a.name, a.name, values);
    }
    this.emit({ kind: 'array', array: a.name, name: a.name, values: [...a.values], line: null, vars: {} });
    return this.visualArray(a.name, a.values);
  }

  /** table() and array() as the learner's code sees them (globals it may shadow). */
  readonly helpers = {
    table: (rows: unknown, cols: unknown, fill: unknown = 0) => this.makeTable(null, rows, cols, fill),
    array: (values: unknown, fill: unknown = 0) => this.makeArray(null, values, fill),
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
    const grid: GridInfo = { kind: 'grid', id, name, data };
    const rows = data.map((row, r) => this.visualRow(grid, r, row));
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
      if (visual) return visual.kind === 'grid' ? `[${visual.data.map(cellsText).join(', ')}]` : cellsText(visual.data);
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
    if (visual) return plainData(visual);
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
function plainData(visual: Visual): (number | null)[] | (number | null)[][] {
  return visual.kind === 'grid' ? visual.data.map((row) => [...row]) : [...visual.data];
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
  let code: string;
  try {
    code = instrument(request.code, language).code;
  } catch (e) {
    if (e instanceof LearnerSyntaxError) return failed('syntax', e.message, e.line);
    throw e;
  }
  // The entry name is pasted into the code below, so it must be a plain name.
  if (!IDENTIFIER.test(entry)) return failed('internal', `“${entry}” isn't a valid function name.`);

  const run = new Run(request.limits);
  // The learner's top level runs inside a function: its declarations stay
  // local to this run, and `entry` is looked up once it has finished. The
  // helpers are parameters, so the learner's own `table` or `array` shadows them.
  const factory = new Function('__viz', 'console', 'table', 'array', `return function () {\n${code}\nreturn typeof ${entry} === "function" ? ${entry} : undefined;\n};`);
  const program = factory(run.viz, run.console, run.helpers.table, run.helpers.array) as () => unknown;

  let returned: unknown = undefined;
  let error: RunError | null = null;
  const started = performance.now();
  try {
    const fn = program();
    if (typeof fn !== 'function') {
      error = { kind: 'runtime', message: `Define a function called ${entry}.`, line: null };
    } else {
      const args = request.args.map((a) => run.arg(a));
      returned = (fn as (...args: unknown[]) => unknown)(...args);
    }
  } catch (e) {
    error =
      e instanceof StopSignal
        ? (run.stopped ?? { kind: 'internal', message: 'The run stopped without a reason.', line: null })
        : { kind: 'runtime', message: errorMessage(e, run), line: run.errorLine };
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

  let json: Json = null;
  if (!error) {
    try {
      json = run.json(returned);
    } catch {
      json = run.show(returned); // a throwing toJSON or getter
    }
  }
  const arrays: Record<string, number[]> = {};
  for (const [id, data] of run.arrays) arrays[id] = [...data];
  const grids: Record<string, (number | null)[][]> = {};
  for (const [id, data] of run.grids) grids[id] = data.map((row) => [...row]);
  return { events: run.events, arrays, grids, returned: json, error, ms };
}

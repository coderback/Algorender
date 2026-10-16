import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { cell, stateProblems, table } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import type { MemoryState } from '@/viz/memory/types';
import { CONTRACT, entryFor } from './contract';
import { runJs } from './js/runtime';
import { type Arg, DEFAULT_LIMITS, type Limits, type RunEvent, type RunResult } from './protocol';
import { GRID_STATS, LINE_STATS, printed, RUN_STATS, testedCondition, traceFor, traceLines, traceRun, type RunTrace } from './trace';

const contract = (name: string) => CONTRACT.find((c) => c.name.startsWith(name))!;

function result(events: RunEvent[], extra: Partial<RunResult> = {}): RunResult {
  return { events, arrays: {}, returned: null, error: null, ms: 1, ...extra };
}

const mainValues = (frame: { state: { lanes: readonly { id: string; slots: readonly (string | null)[] }[]; values: Readonly<Record<string, number>> } }) =>
  frame.state.lanes.find((l) => l.id === 'main')!.slots.map((id) => (id == null ? null : frame.state.values[id]));

describe('traceRun', () => {
  it('replays bubble sort: compares, and write pairs on one line become swaps that keep element identity', () => {
    const c = contract('bubble sort');
    const trace = traceRun(result(c.expect.events!, { arrays: c.expect.arrays! }), { markSortedAtEnd: true })!;
    // Start, 3 compares, 2 swaps, end.
    expect(trace.frames).toHaveLength(7);
    expect(trace.frames.map((f) => f.line)).toEqual([null, 4, 5, 4, 5, 4, null]);
    const end = trace.frames.at(-1)!;
    expect(mainValues(end)).toEqual([1, 2, 3]);
    expect(end.stats).toEqual({ comparisons: 3, swaps: 2, writes: 0 });
    // A swap moves the elements themselves, so the bars slide rather than being redrawn.
    expect(trace.frames[0].state.lanes[0].slots).toEqual(['e0', 'e1', 'e2']);
    expect(trace.frames[2].state.lanes[0].slots).toEqual(['e1', 'e0', 'e2']);
    expect(trace.frames[2].note).toBe('Line 6 swaps arr[0] and arr[1] (3 ⇄ 1).');
    expect(trace.frames[1].note).toBe('Line 5 is arr[0] (3) > arr[1] (1)? Yes.');
    expect(trace.frames[1].vars).toEqual({ n: 3, i: 0, j: 0 });
    expect(Object.values(end.state.marks).every((m) => m === 'sorted')).toBe(true);
  });

  it('keeps insertion sort’s shift-then-insert as two writes, and compares a cell with a variable', () => {
    const c = contract('insertion sort');
    const trace = traceRun(result(c.expect.events!, { arrays: c.expect.arrays! }))!;
    expect(trace.frames.map((f) => f.note)).toEqual([
      'Your function receives arr = [2, 1].',
      'Line 5 is arr[0] (2) > 1? Yes.',
      'Line 6 writes 2 into arr[1] (it held 1).',
      'Line 9 writes 1 into arr[0] (it held 2).',
      'Your function finished. arr is now [1, 2].',
    ]);
    expect(trace.frames.at(-1)!.stats).toEqual({ comparisons: 1, swaps: 0, writes: 2 });
    // Unmarked at the end: sorting marks are opt-in.
    expect(trace.frames.at(-1)!.state.marks).toEqual({});
  });

  it('treats a temp-variable swap on adjacent lines as a swap', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [5, 4], line: null, vars: {} },
      { kind: 'write', array: 'arr', index: 0, value: 4, line: 3, vars: {} },
      { kind: 'write', array: 'arr', index: 1, value: 5, line: 4, vars: {} },
    ];
    const trace = traceRun(result(events))!;
    expect(trace.frames).toHaveLength(3);
    expect(trace.frames[1].stats.swaps).toBe(1);
  });

  it('shows appends, pops, prints and the returned value', () => {
    const c = contract('append, pop');
    const r = result(c.expect.events!, { arrays: c.expect.arrays!, returned: c.expect.returned! });
    const trace = traceRun(r)!;
    expect(trace.frames.map((f) => mainValues(f))).toEqual([[4], [4, 9], [4], [4], [4]]);
    expect(trace.frames[3].note).toBe('Line 4 prints “popped 9”.');
    expect(trace.frames.at(-1)!.note).toBe('Your function finished and returned [9, 1]. arr is now [4].');
    expect(printed(r)).toEqual(['popped 9']);
  });

  it('ends on the error, at its line, and flags limit stops as truncated', () => {
    const events: RunEvent[] = [{ kind: 'array', array: 'arr', name: 'arr', values: [1, 2], line: null, vars: {} }];
    const crashed = traceRun(result(events, { error: { kind: 'runtime', message: 'IndexError: list index out of range', line: 3 } }))!;
    expect(crashed.frames.at(-1)).toMatchObject({ line: 2, note: 'Line 3: IndexError: list index out of range' });
    expect(crashed.truncated).toBe(false);
    const stopped = traceRun(result(events, { error: { kind: 'limit', message: 'Stopped after 50 events.', line: 3 } }))!;
    expect(stopped.truncated).toBe(true);
  });

  it('draws the named index variables as pointers while they hold a valid index', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [1, 3, 5], line: null, vars: {} },
      { kind: 'compare', op: '==', a: { array: 'arr', index: 1, value: 3 }, b: { value: 5 }, result: false, line: 6, vars: { lo: 0, mid: 1, hi: 2, target: 5 } },
      { kind: 'compare', op: '==', a: { array: 'arr', index: 2, value: 5 }, b: { value: 5 }, result: true, line: 6, vars: { lo: 2, mid: 2, hi: 3, target: 5 } },
    ];
    const trace = traceRun(result(events), { pointers: ['lo', 'mid', 'hi'] })!;
    const labels = (i: number) => trace.frames[i].state.pointers.map((p) => `${p.label}@${p.index}`);
    expect(labels(1)).toEqual(['lo@0', 'mid@1', 'hi@2']);
    // hi = 3 is past the end, so it isn't drawn; the start and end frames have none.
    expect(labels(2)).toEqual(['lo@2', 'mid@2']);
    expect(labels(0)).toEqual([]);
    expect(labels(3)).toEqual([]);
  });

  it('returns null when nothing ran', () => {
    expect(traceRun(result([], { error: { kind: 'syntax', message: 'SyntaxError', line: 2 } }))).toBeNull();
  });

  it('cuts long runs at maxFrames but always shows the ending', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [0], line: null, vars: {} },
      ...Array.from({ length: 50 }, (_, i): RunEvent => ({ kind: 'write', array: 'arr', index: 0, value: i + 1, line: 3, vars: {} })),
    ];
    const trace = traceRun(result(events), { maxFrames: 10 })!;
    expect(trace.truncated).toBe(true);
    expect(trace.frames).toHaveLength(11);
    expect(trace.frames.at(-1)!.note).toMatch(/^Your function finished/);
  });

  it('starts on the line that made the array when the code made it with array()', () => {
    const trace = traceRun(result([{ kind: 'array', array: 'sums', name: 'sums', values: [0, 0], line: 2, vars: { n: 2 } }]))!;
    expect(trace.frames[0]).toMatchObject({ note: 'Line 2 makes a new array sums = [0, 0].', line: 1, vars: { n: 2 } });
  });
});

describe('traceFor', () => {
  const contractRun = (name: string) => {
    const c = contract(name);
    return result(c.expect.events!, { arrays: c.expect.arrays ?? {}, grids: c.expect.grids, returned: c.expect.returned ?? null });
  };
  const gridTrace = (r: RunResult, options = {}) => {
    const run = traceFor(r, options)!;
    expect(run.view).toBe('grid');
    return run as Extract<RunTrace, { view: 'grid' }>;
  };
  const tableOf = (frame: Frame<GridState>, id: string) => table(frame.state, id);

  it('plays a run without grids on the array view, exactly as traceRun does', () => {
    const c = contract('bubble sort');
    const r = result(c.expect.events!, { arrays: c.expect.arrays! });
    const run = traceFor(r, { markSortedAtEnd: true })!;
    expect(run.view).toBe('array');
    expect(run.stats).toBe(RUN_STATS);
    expect(run.trace).toEqual(traceRun(r, { markSortedAtEnd: true }));
    expect(traceFor(result([], { error: { kind: 'syntax', message: 'SyntaxError', line: 2 } }))).toBeNull();
  });

  it('fills a DP table: each write marks its cell and draws arrows from the cells its statement read', () => {
    const { trace, stats } = gridTrace(contractRun('grids: table() makes a named grid'));
    expect(stats).toBe(GRID_STATS);
    expect(trace.frames.map((f) => f.note)).toEqual([
      'Your function starts.',
      'Line 2 makes dp, a table of 2 rows and 3 columns, every cell 0.',
      'Line 6 writes 1 into dp[0][0].',
      'Line 6 writes 1 into dp[0][1].',
      'Line 6 writes 1 into dp[0][2].',
      'Line 6 writes 1 into dp[1][0].',
      'Line 8 writes 2 into dp[1][1], using dp[0][1] (1) and dp[1][0] (1).',
      'Line 8 writes 3 into dp[1][2], using dp[0][2] (1) and dp[1][1] (2).',
      'Your function finished and returned 3.',
    ]);
    expect(trace.frames.map((f) => f.line)).toEqual([null, 1, 5, 5, 5, 5, 7, 7, null]);
    // Nothing is shown until the code makes the table.
    expect(trace.frames[0].state.parts).toEqual([]);
    const dp = tableOf(trace.frames[6], 'grid:dp');
    expect(dp.label).toBe('dp');
    expect(dp.rows.map((r) => r.label)).toEqual(['0', '1']);
    expect(dp.cols.map((c) => c.label)).toEqual(['0', '1', '2']);
    expect(dp.marks).toEqual({ 'r1:1': 'write', 'r0:1': 'compare', 'r1:0': 'compare' });
    expect(dp.arrows.map((a) => [a.from, a.to, a.mark])).toEqual([
      [{ row: 'r0', col: 1 }, { row: 'r1', col: 1 }, 'compare'],
      [{ row: 'r1', col: 0 }, { row: 'r1', col: 1 }, 'compare'],
    ]);
    expect(trace.frames[6].vars).toEqual({ rows: 2, cols: 3, i: 1, j: 1 });
    const end = trace.frames.at(-1)!;
    expect(cell(end.state, 1, 2, 'grid:dp')).toBe('3');
    expect(tableOf(end, 'grid:dp').arrows).toEqual([]);
    expect(end.stats).toEqual({ comparisons: 0, writes: 6 });
    expect(trace.frames.flatMap((f) => stateProblems(f.state))).toEqual([]);
  });

  it('shows blank cells as empty, a read of the written cell without a self-arrow, and compares on grid cells', () => {
    const { trace } = gridTrace(contractRun('grids: from lists each cell once'));
    expect(trace.frames.map((f) => f.note)).toEqual([
      'Your function starts.',
      'Line 2 makes dp, a table of 2 rows and 2 columns, every cell blank.',
      'Line 3 writes 2 into dp[0][0].',
      'Line 4 writes 4 into dp[0][1], using dp[0][0] (2).',
      'Line 5 writes 5 into dp[0][1], using dp[0][1] (4).',
      'Line 6 is dp[1][0] (blank) == null? Yes.',
      'Line 7 writes 5 into dp[1][1], using dp[0][1] (5).',
      'Your function finished.',
    ]);
    expect(cell(trace.frames[1].state, 0, 0, 'grid:dp')).toBe('');
    expect(tableOf(trace.frames[4], 'grid:dp').arrows).toEqual([]);
    expect(tableOf(trace.frames[4], 'grid:dp').marks).toEqual({ 'r0:1': 'write' });
    expect(tableOf(trace.frames[5], 'grid:dp').marks).toEqual({ 'r1:0': 'compare' });
    expect(trace.frames.at(-1)!.stats).toEqual({ comparisons: 1, writes: 4 });
  });

  it('starts from grid arguments and narrates comparisons between cells', () => {
    const { trace } = gridTrace(contractRun('grids: a grid argument'));
    expect(trace.frames[0].note).toBe('Your function receives grid, a table of 3 rows and 2 columns.');
    expect(cell(trace.frames[0].state, 2, 1, 'grid:grid')).toBe('4');
    expect(trace.frames[1].note).toBe('Line 5 is grid[1][0] (3) > grid[0][0] (1)? Yes.');
    expect(tableOf(trace.frames[1], 'grid:grid').marks).toEqual({ 'r1:0': 'compare', 'r0:0': 'compare' });
    expect(trace.frames.at(-1)).toMatchObject({ note: 'Your function finished and returned 3.', stats: { comparisons: 4, writes: 0 } });
  });

  it('shows arrays as one-row tables as wide as they ever get, beside the grids', () => {
    const events: RunEvent[] = [
      { kind: 'array', array: 'arr', name: 'arr', values: [4, 7], line: null, vars: {} },
      { kind: 'grid', grid: 'dp', name: 'dp', rows: 1, cols: 2, values: [[0, 0]], line: 2, vars: {} },
      { kind: 'append', array: 'arr', value: 9, line: 3, vars: {} },
      { kind: 'pop', array: 'arr', index: 0, line: 4, vars: {} },
      { kind: 'write', array: 'arr', index: 1, value: 1, line: 5, vars: {} },
      { kind: 'cellWrite', grid: 'dp', row: 0, col: 1, value: 2.5, from: [], line: 6, vars: {} },
      { kind: 'cellWrite', grid: 'dp', row: 0, col: 1, value: 1 / 3, from: [], line: 7, vars: {} },
      { kind: 'print', text: 'done', line: 8, vars: {} },
    ];
    const { trace } = gridTrace(result(events));
    const row = (f: Frame<GridState>) => tableOf(f, 'array:arr').cells.r0;
    expect(trace.frames[0].note).toBe('Your function receives arr = [4, 7].');
    expect(trace.frames[1].state.parts.map((p) => p.id)).toEqual(['array:arr', 'grid:dp']);
    expect(trace.frames.map(row)).toEqual([
      ['4', '7', ''],
      ['4', '7', ''],
      ['4', '7', '9'],
      ['7', '9', ''],
      ['7', '1', ''],
      ['7', '1', ''],
      ['7', '1', ''],
      ['7', '1', ''],
      ['7', '1', ''],
    ]);
    expect(tableOf(trace.frames[0], 'array:arr').rows).toEqual([{ id: 'r0', label: '' }]);
    expect(trace.frames.slice(2).map((f) => f.note)).toEqual([
      'Line 3 appends 9 to arr.',
      'Line 4 removes 4 from arr[0].',
      'Line 5 writes 1 into arr[1] (it held 9).',
      'Line 6 writes 2.5 into dp[0][1].',
      // Overwriting the code's own earlier write says what it replaced; numbers show two decimals at most.
      'Line 7 writes 0.33 into dp[0][1] (it held 2.5).',
      'Line 8 prints “done”.',
      'Your function finished.',
    ]);
    expect(trace.frames.at(-1)!.stats).toEqual({ comparisons: 0, writes: 4 });
  });

  it('names a few of the cells read and counts the rest', () => {
    const from = Array.from({ length: 6 }, (_, col) => ({ grid: 'dp', row: 0, col }));
    const events: RunEvent[] = [
      { kind: 'grid', grid: 'dp', name: 'dp', rows: 2, cols: 6, values: [[1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]], line: null, vars: {} },
      { kind: 'cellWrite', grid: 'dp', row: 1, col: 5, value: 6, from, line: 3, vars: {} },
    ];
    const { trace } = gridTrace(result(events));
    expect(trace.frames[1].note).toBe('Line 3 writes 6 into dp[1][5], using dp[0][0] (1), dp[0][1] (1), dp[0][2] (1) and 3 more cells.');
    expect(tableOf(trace.frames[1], 'grid:dp').arrows).toHaveLength(6);
  });

  it('ends on the error, and cuts long runs at maxFrames', () => {
    const made: RunEvent = { kind: 'grid', grid: 'dp', name: 'dp', rows: 2, cols: 2, values: [[0, 0], [0, 0]], line: 2, vars: {} };
    const crashed = gridTrace(result([made], { error: { kind: 'runtime', message: 'IndexError: row 2 is out of range for dp (2 rows)', line: 3 } })).trace;
    expect(crashed.frames.at(-1)).toMatchObject({ line: 2, note: 'Line 3: IndexError: row 2 is out of range for dp (2 rows)' });
    expect(crashed.truncated).toBe(false);
    const events: RunEvent[] = [
      made,
      ...Array.from({ length: 50 }, (_, i): RunEvent => ({ kind: 'cellWrite', grid: 'dp', row: 0, col: 0, value: i, from: [], line: 3, vars: {} })),
    ];
    const long = gridTrace(result(events), { maxFrames: 10 }).trace;
    expect(long.truncated).toBe(true);
    expect(long.frames).toHaveLength(11);
    expect(long.frames.at(-1)!.note).toBe('Your function finished.');
  });
});

describe('traceLines', () => {
  /** A JS program run line by line: real steps, as the memory view gets them. */
  const lines = (code: string, entry = '', args: Arg[] = [], limits: Partial<Limits> = {}) =>
    runJs({ language: 'javascript', code, entry, args, limits: { ...DEFAULT_LIMITS, ...limits }, mode: 'lines' });
  const traced = (r: RunResult) => traceLines(r)!;
  const notes = (r: RunResult) => traced(r).frames.map((f) => f.note);
  const local = (state: MemoryState, name: string) => state.frames.find((f) => f.active)!.locals.find((l) => l.name === name);

  it('says what a condition tested, given the code', () => {
    const code = `function sign(n) {
  if (n < 0) {
    return -1;
  } else if (n > 0) {
    return 1;
  }
  return 0;
}
sign(5);
`;
    expect(traceLines(lines(code), { code })!.frames.map((f) => f.note)).toEqual([
      'The program starts at line 1.',
      'Line 1 defines sign.',
      'Line 9 calls sign(5).',
      'Line 2: n < 0? No, so line 4 is next.',
      'Line 4: n > 0? Yes, so line 5 runs next.',
      'sign returns 1.',
      'Line 9 runs.',
      'The program finished.',
    ]);
    // Without the code, the same step is still narrated.
    expect(notes(lines(code))[3]).toBe('Line 2 runs, and line 4 is next.');
  });

  it('finds the condition on if, elif and while lines whose body follows', () => {
    expect(testedCondition('    if arr[j] > arr[j + 1]:')).toBe('arr[j] > arr[j + 1]');
    expect(testedCondition('  } else if ((a + b) * 2 > c) {')).toBe('(a + b) * 2 > c');
    expect(testedCondition('while (lo <= hi) {')).toBe('lo <= hi');
    expect(testedCondition('    elif x == 1:')).toBe('x == 1');
    expect(testedCondition('if (f(a) && g(b)) {')).toBe('f(a) && g(b)');
    expect(testedCondition('if (n <= 1) return 1;')).toBeNull();
    expect(testedCondition('for (let i = 0; i < n; i++) {')).toBeNull();
    expect(testedCondition(undefined)).toBeNull();
  });

  it('narrates what each line did: assignments, new objects, calls, returns and prints', () => {
    const r = lines(`function add(a, b) {
  const total = a + b;
  return total;
}
const nums = [1, 2];
const result = add(2, 3);
console.log("done");
`);
    const trace = traced(r);
    expect(trace.frames.map((f) => f.note)).toEqual([
      'The program starts at line 1.',
      'Line 1 defines add.',
      'Line 5 sets nums to a new array [1, 2].',
      'Line 6 calls add(2, 3).',
      'Line 2 sets total to 5.',
      'add returns 5.',
      'Line 6 sets result to 5.',
      'Line 7 prints “done”.',
      'The program finished.',
    ]);
    // Each frame highlights the line about to run (0-based for the code panel); the ending highlights none.
    expect(trace.frames.map((f) => f.line)).toEqual([0, 4, 5, 1, 2, 2, 6, 6, null]);
    expect(trace.frames.map((f) => f.stats)).toEqual([
      { steps: 1, calls: 0 },
      { steps: 2, calls: 0 },
      { steps: 3, calls: 0 },
      { steps: 4, calls: 1 },
      { steps: 5, calls: 1 },
      { steps: 6, calls: 1 },
      { steps: 7, calls: 1 },
      { steps: 8, calls: 1 },
      { steps: 8, calls: 1 },
    ]);
    expect(trace.truncated).toBe(false);
  });

  it('flags the names a step changed, and objects that are new or changed since the step before', () => {
    const trace = traced(
      lines(`const nums = [1, 2];
const other = nums;
other.push(3);
const n = 1;
`),
    );
    const [, made, aliased, pushed, end] = trace.frames;
    expect(made.state.heap).toMatchObject([{ fresh: true, changed: false, object: { kind: 'list', type: 'Array' } }]);
    expect(local(made.state, 'nums')).toMatchObject({ changed: true });
    // The new name is flagged; the old one, and the object they share, are not.
    expect(aliased.note).toBe('Line 2 makes nums and other name the same array.');
    expect([local(aliased.state, 'nums')!.changed, local(aliased.state, 'other')!.changed]).toEqual([false, true]);
    expect(aliased.state.heap).toMatchObject([{ fresh: false, changed: false }]);
    expect(local(aliased.state, 'nums')!.value).toEqual(local(aliased.state, 'other')!.value);
    expect(pushed.note).toBe('Line 3 appends 3 to nums.');
    expect(pushed.state.heap).toMatchObject([{ fresh: false, changed: true }]);
    expect(pushed.state.frames[0].locals.map((l) => l.changed)).toEqual([false, false]);
    expect(end.note).toBe('Line 4 sets n to 1.');
    // The closing frame settles: nothing is flagged as just changed.
    const closing = trace.frames.at(-1)!.state;
    expect(closing.frames[0].locals.some((l) => l.changed)).toBe(false);
    expect(closing.heap.some((h) => h.changed || h.fresh)).toBe(false);
  });

  it('describes changes inside objects: items, swaps, pops, fields, nested lists', () => {
    const said = notes(
      lines(`const nums = [5, 6, 7];
nums[1] = 9;
[nums[0], nums[2]] = [nums[2], nums[0]];
nums.pop();
const point = { x: 1 };
point.y = 2;
const grid = [[1, 2], [3, 4]];
grid[0][1] = 8;
`),
    );
    expect(said.slice(2, -1)).toEqual([
      'Line 2 sets nums[1] to 9.',
      'Line 3 swaps nums[0] and nums[2].',
      'Line 4 removes 5 from the end of nums.',
      'Line 5 sets point to a new object {x: 1}.',
      'Line 6 sets point.y to 2.',
      'Line 7 sets grid to a new array [[…], […]].',
      'Line 8 sets grid[0][1] to 8.',
    ]);
  });

  it('stacks a frame per recursive call, marks the innermost active, and unwinds with returns', () => {
    const trace = traced(
      lines(`function fact(n) {
  if (n <= 1) {
    return 1;
  }
  return n * fact(n - 1);
}
const answer = fact(3);
`),
    );
    const fns = (f: Frame<MemoryState>) =>
      f.state.frames.map((x) => `${x.fn}${x.active ? '*' : ''}${x.returning && 'prim' in x.returning ? ` → ${x.returning.prim}` : ''}`);
    expect(trace.frames.map(fns)).toEqual([
      ['Global frame*'],
      ['Global frame*'],
      ['Global frame', 'fact*'],
      ['Global frame', 'fact*'],
      ['Global frame', 'fact', 'fact*'],
      ['Global frame', 'fact', 'fact*'],
      ['Global frame', 'fact', 'fact', 'fact*'],
      ['Global frame', 'fact', 'fact', 'fact*'],
      ['Global frame', 'fact', 'fact', 'fact* → 1'],
      ['Global frame', 'fact', 'fact* → 2'],
      ['Global frame', 'fact* → 6'],
      ['Global frame*'],
      ['Global frame*'],
    ]);
    expect(trace.frames.map((f) => f.note).slice(2, 12)).toEqual([
      'Line 7 calls fact(3).',
      'Line 2 runs, and line 5 is next.',
      'Line 5 calls fact(2).',
      'Line 2 runs, and line 5 is next.',
      'Line 5 calls fact(1).',
      'Line 2 runs, and line 3 is next.',
      'fact returns 1.',
      'fact returns 2.',
      'fact returns 6.',
      'Line 7 sets answer to 6.',
    ]);
    // Three calls, each its own frame for as long as it lives.
    expect(trace.frames.at(-1)!.stats.calls).toBe(3);
    expect(new Set(trace.frames.flatMap((f) => f.state.frames.map((x) => x.id))).size).toBe(4);
  });

  it('names a reference argument by the caller’s name for it, and an entry call by its arguments', () => {
    const grow = lines(`function grow(items) {
  items.push(4);
}
const nums = [1, 2, 3];
grow(nums);
`);
    expect(notes(grow)).toContain('Line 5 calls grow(nums).');
    // Falling off the end after a change says both.
    expect(notes(grow)).toContain('Line 2 appends 4 to items, and grow returns undefined.');
    const first = lines(
      `function first(arr, n) {
  return arr[n];
}
`,
      'first',
      [
        { kind: 'array', name: 'arr', values: [4, 5] },
        { kind: 'value', name: 'n', value: 1 },
      ],
    );
    expect(notes(first)).toEqual([
      'The program starts at line 1.',
      'Line 1 defines first.',
      'Your function is called: first([4, 5], 1).',
      'first returns 5.',
      'Your function finished and returned 5.',
    ]);
  });

  it('follows an exception out of each frame, says when it is caught, and ends on the error', () => {
    const trace = traced(
      lines(`function check(n) {
  if (n < 0) {
    throw new RangeError("negative");
  }
  return n;
}
function outer(n) {
  return check(n);
}
try {
  outer(-1);
} catch (e) {
  console.log("caught");
}
outer(-2);
`),
    );
    const said = trace.frames.map((f) => f.note);
    expect(said.slice(6, 12)).toEqual([
      'Line 2 runs, and line 3 is next.',
      'Line 3 raises RangeError: negative.',
      "The RangeError isn't caught in check, so it passes up to line 8 in outer.",
      'The RangeError is caught, so line 13 runs next.',
      'Line 13 prints “caught”.',
      'Line 15 calls outer(-2).',
    ]);
    expect(said.slice(-3)).toEqual([
      "The RangeError isn't caught in check, so it passes up to line 8 in outer.",
      "The RangeError isn't caught in outer, so it passes up to line 15 in the top-level code.",
      'Line 3: RangeError: negative',
    ]);
    // The ending points at the error's line and keeps the memory as the error left it.
    expect(trace.frames.at(-1)!.line).toBe(2);
    expect(trace.frames.at(-1)!.state.output).toEqual(['caught']);
    expect(trace.truncated).toBe(false);
  });

  it('keeps everything printed so far, one entry per print', () => {
    const trace = traced(
      lines(`for (let i = 0; i < 3; i++) {
  console.log("tick", i);
}
`),
    );
    expect(trace.frames.map((f) => f.state.output.length)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 3]);
    expect(trace.frames.at(-1)!.state.output).toEqual(['tick 0', 'tick 1', 'tick 2']);
  });

  it('ends a limit stop cleanly, on the stop, marked as truncated', () => {
    const r = lines(
      `let n = 0;
while (n >= 0) {
  n += 1;
}
`,
      '',
      [],
      { maxEvents: 12 },
    );
    const trace = traced(r);
    expect(trace.truncated).toBe(true);
    expect(trace.frames).toHaveLength(13);
    const end = trace.frames.at(-1)!;
    expect(end.note).toMatch(/^Line [23]: Stopped after 12 steps: is there a loop that never ends\?$/);
    expect(end.state.frames).toHaveLength(1);
    expect(trace.frames.slice(1, 5).map((f) => f.note)).toEqual([
      'Line 1 sets n to 0.',
      'Line 2 runs, and line 3 is next.',
      'Line 3 sets n to 1.',
      'Line 2 runs, and line 3 is next.',
    ]);
  });

  it('cuts long runs at maxFrames but always shows the ending', () => {
    const r = lines(`let n = 0;
for (let i = 0; i < 50; i++) {
  n += i;
}
`);
    const trace = traceLines(r, { maxFrames: 10 })!;
    expect(trace.truncated).toBe(true);
    expect(trace.frames).toHaveLength(11);
    expect(trace.frames.at(-1)!.note).toBe('The program finished.');
  });

  it('narrates every step of every lines contract case in one sentence, with steady stats', () => {
    for (const c of CONTRACT.filter((c) => c.mode === 'lines')) {
      const r = runJs({
        language: 'javascript',
        code: c.code.javascript!,
        entry: entryFor(c, 'javascript'),
        args: c.args,
        limits: { ...DEFAULT_LIMITS, ...c.limits },
        mode: 'lines',
      });
      const trace = traceLines(r)!;
      expect(trace.frames.length, c.name).toBe(r.events.filter((e) => e.kind === 'step').length + 1);
      for (const [k, f] of trace.frames.entries()) {
        // One sentence; an error ending reads like the other views' ("Line 3: ValueError: negative").
        const error = r.error && k === trace.frames.length - 1;
        expect(f.note, `${c.name}, frame ${k}`).toMatch(error ? /^Line \d+: \S[^\n]*$/ : /^\S[^\n]*[.?]$/);
        expect(f.state.frames.filter((x) => x.active), `${c.name}, frame ${k}`).toHaveLength(1);
        if (k > 0) {
          const before = trace.frames[k - 1].stats;
          expect(f.stats.steps >= before.steps && f.stats.calls >= before.calls, `${c.name}, frame ${k}`).toBe(true);
        }
      }
    }
  });

  it('plays on the memory view through traceFor, and not at all when nothing ran', () => {
    const r = lines('const x = 1;\n');
    const run = traceFor(r)!;
    expect(run.view).toBe('memory');
    expect(run.stats).toBe(LINE_STATS);
    expect(run.trace).toEqual(traceLines(r));
    const broken = lines('const x = ;\n');
    expect(traceLines(broken)).toBeNull();
    expect(traceFor(broken)).toBeNull();
  });
});

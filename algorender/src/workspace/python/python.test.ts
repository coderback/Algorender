// The Python runtime: the harness in real Pyodide (the npm build, which runs in
// Node), called exactly as public/workers/python.js calls it.

import { loadPyodide, type PyodideInterface } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT, drawnSteps, entryFor, expectedSteps, stepProblems } from '../contract';
import {
  type Arg,
  DEFAULT_LIMITS,
  type Limits,
  MAX_DEPTH,
  MAX_FROM,
  MAX_ITEMS,
  MAX_OBJECTS,
  type MemValue,
  type RunEvent,
  type RunMode,
  type RunResult,
} from '../protocol';
import { HARNESS } from './harness';

let pyodide: PyodideInterface;
let runRequest: (json: string) => string;

beforeAll(async () => {
  // Loaded once for the whole file: Pyodide takes a few seconds and a few hundred MB.
  pyodide = await loadPyodide();
  pyodide.runPython(HARNESS);
  runRequest = pyodide.globals.get('run_request');
}, 120_000);

function run(code: string, entry: string, args: Arg[] = [], limits: Partial<Limits> = {}, mode?: RunMode): RunResult {
  const request = { language: 'python' as const, code, entry, args, limits: { ...DEFAULT_LIMITS, ...limits }, mode };
  return JSON.parse(runRequest(JSON.stringify(request)));
}

const arr = (values: number[], name = 'arr'): Arg => ({ kind: 'array', name, values });
const kinds = (r: RunResult) => r.events.map((e) => e.kind);
const only = <K extends RunEvent['kind']>(r: RunResult, kind: K) =>
  r.events.filter((e): e is Extract<RunEvent, { kind: K }> => e.kind === kind);

describe('contract', () => {
  for (const c of CONTRACT.filter((c) => c.code.python)) {
    it(c.name, () => {
      const r = run(c.code.python!, entryFor(c, 'python'), c.args, c.limits, c.mode);
      const want = c.expect;
      if (want.events) expect(r.events).toEqual(want.events);
      else if (want.kinds) expect(kinds(r)).toEqual(want.kinds);
      if (want.count !== undefined) expect(r.events).toHaveLength(want.count);
      if (want.steps) {
        const steps = drawnSteps(r.events);
        expect(want.firstSteps ? steps.slice(0, want.steps.length) : steps).toEqual(expectedSteps(want.steps, 'python'));
      }
      if (c.mode === 'lines') expect(stepProblems(r.events)).toEqual([]);
      if (want.prints) expect(only(r, 'print').map((e) => e.text)).toEqual(want.prints);
      if (want.arrays) expect(r.arrays).toEqual(want.arrays);
      if (want.grids) expect(r.grids).toEqual(want.grids);
      if ('returned' in want) expect(r.returned).toEqual(want.returned);
      if (want.error) {
        expect(r.error?.kind).toBe(want.error.kind);
        if (want.error.line !== undefined) expect(r.error?.line).toBe(want.error.line);
        if (want.error.message) expect(r.error?.message).toContain(want.error.message);
        if (want.error.hasLine) expect(r.error?.line).toEqual(expect.any(Number));
      } else {
        expect(r.error).toBeNull();
      }
      expect(r.ms).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('comparisons', () => {
  it('reports either side as a cell or a value, and evaluates the index once', () => {
    const r = run(
      `calls = []
def next_index():
    calls.append(1)
    return len(calls) - 1

def f(arr):
    key = 2
    a = key < arr[1]
    b = arr[0] != arr[-1]
    c = arr[next_index()] >= arr[1] + 1
    return [a, b, c, len(calls)]
`,
      'f',
      [arr([1, 5, 3])],
    );
    expect(only(r, 'compare')).toEqual([
      { kind: 'compare', op: '<', a: { value: 2 }, b: { array: 'arr', index: 1, value: 5 }, result: true, line: 8, vars: { key: 2 } },
      {
        kind: 'compare', op: '!=', a: { array: 'arr', index: 0, value: 1 }, b: { array: 'arr', index: 2, value: 3 },
        result: true, line: 9, vars: { key: 2, a: true },
      },
      {
        kind: 'compare', op: '>=', a: { array: 'arr', index: 0, value: 1 }, b: { value: 6 },
        result: false, line: 10, vars: { key: 2, a: true, b: true },
      },
    ]);
    expect(r.returned).toEqual([true, true, false, 1]);
  });

  it('leaves out comparisons without a cell, chained comparisons, in, is, and slices', () => {
    const r = run(
      `def f(arr):
    x = 1 < 2
    y = 0 < arr[0] < 9
    z = 3 in arr
    w = arr[0] is None
    v = arr[0:2] == [4, 5]
    return [x, y, z, w, v]
`,
      'f',
      [arr([4, 5])],
    );
    expect(kinds(r)).toEqual(['array']);
    expect(r.returned).toEqual([true, true, false, false, true]);
  });

  it('works on plain lists and dicts as normal Python', () => {
    const r = run(
      `def f(arr):
    plain = [3, 1]
    d = {"k": 2}
    return [plain[0] > plain[1], d["k"] == 2, arr[0] > plain[1]]
`,
      'f',
      [arr([7])],
    );
    expect(r.returned).toEqual([true, true, true]);
    expect(only(r, 'compare')).toHaveLength(1);
  });

  it('records nothing when the comparison itself fails', () => {
    const r = run(`def f(arr):\n    return arr[0] < "a"\n`, 'f', [arr([1])]);
    expect(kinds(r)).toEqual(['array']);
    expect(r.error).toEqual({ kind: 'runtime', line: 2, message: expect.stringContaining('TypeError') });
  });
});

describe('lines and variables', () => {
  it('takes them from the innermost learner frame, so a helper reports its own', () => {
    const r = run(
      `def swap(a, i, j):
    a[i], a[j] = a[j], a[i]

def f(arr):
    total = 0
    swap(arr, 0, 1)
    return total
`,
      'f',
      [arr([1, 2])],
    );
    expect(only(r, 'write')).toEqual([
      { kind: 'write', array: 'arr', index: 0, value: 2, line: 2, vars: { i: 0, j: 1 } },
      { kind: 'write', array: 'arr', index: 1, value: 1, line: 2, vars: { i: 0, j: 1 } },
    ]);
    expect(r.arrays).toEqual({ arr: [2, 1] });
  });

  it('shows numbers, booleans, None, short strings and short number lists, and skips the rest', () => {
    const r = run(
      `def f(arr):
    n = 3
    x = 2.5
    ok = False
    nothing = None
    word = "hi"
    long = "x" * 50
    small = [3, 1, 2]
    pair = (1, 2)
    one = (7,)
    big = list(range(20))
    mixed = [1, "a"]
    table = {"a": 1}
    nan = float("nan")
    _hidden = 1
    alias = arr
    print("here")
`,
      'f',
      [arr([1])],
    );
    expect(only(r, 'print')[0].vars).toEqual({
      n: 3,
      x: 2.5,
      ok: false,
      nothing: null,
      word: 'hi',
      long: `${'x'.repeat(39)}…`,
      small: '[3, 1, 2]',
      pair: '(1, 2)',
      one: '(7,)',
      big: '[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, …] (20 items)',
    });
  });

  it('reports a while condition re-check on the while line', () => {
    const r = run(
      `def f(arr):
    i = 0
    while arr[i] < 3:
        i += 1
    return i
`,
      'f',
      [arr([1, 2, 3])],
    );
    expect(only(r, 'compare').map((e) => [e.line, e.vars.i, e.result])).toEqual([
      [3, 0, true],
      [3, 1, true],
      [3, 2, false],
    ]);
  });
});

describe('VisualList', () => {
  it('normalises negative indices in reads, writes and pops', () => {
    const r = run(
      `def f(arr):
    arr[-1] = arr[-3]
    return arr.pop(-2)
`,
      'f',
      [arr([1, 2, 3])],
    );
    expect(r.events.slice(1).map((e) => ({ ...e, vars: undefined }))).toEqual([
      { kind: 'write', array: 'arr', index: 2, value: 1, line: 2, vars: undefined },
      { kind: 'pop', array: 'arr', index: 1, line: 3, vars: undefined },
    ]);
    expect(r.arrays).toEqual({ arr: [1, 1] });
    expect(r.returned).toBe(2);
  });

  it('behaves like a list for reading', () => {
    const r = run(
      `def f(arr):
    copy = arr[1:]
    copy[0] = 99
    return [len(arr), list(arr), 5 in arr, arr.index(5), arr.count(4), arr == [4, 5, 6],
            arr.copy(), sorted(arr, reverse=True), sum(arr), str(arr), copy, arr + [7]]
`,
      'f',
      [arr([4, 5, 6])],
    );
    expect(r.error).toBeNull();
    expect(r.returned).toEqual([3, [4, 5, 6], true, 1, 1, true, [4, 5, 6], [6, 5, 4], 15, '[4, 5, 6]', [99, 6], [4, 5, 6, 7]]);
    expect(kinds(r)).toEqual(['array']);
  });

  it.each([
    ['arr.sort()', 'arr.sort() would sort without showing the steps'],
    ['arr.reverse()', 'arr.reverse()'],
    ['arr.insert(0, 1)', 'arr.insert()'],
    ['arr.extend([1])', 'arr.extend()'],
    ['arr.remove(1)', 'arr.remove()'],
    ['arr.clear()', 'arr.clear()'],
    ['del arr[0]', 'arr.pop(i)'],
    ['arr += [1]', 'arr.append()'],
    ['arr[0:1] = [5]', 'one cell at a time'],
  ])('refuses %s with a reason', (statement, reason) => {
    const r = run(`def f(arr):\n    ${statement}\n`, 'f', [arr([1, 2])]);
    expect(r.error).toEqual({ kind: 'runtime', line: 2, message: expect.stringContaining(reason) });
    expect(r.error!.message).toMatch(/^TypeError: /);
    expect(r.arrays).toEqual({ arr: [1, 2] });
  });

  it.each([
    ['arr[0] = "x"', "TypeError: arr holds numbers, so arr[0] can't store 'x' (a str)."],
    ['arr[0] = True', 'TypeError: arr holds numbers'],
    ['arr.append(None)', 'TypeError: arr holds numbers'],
    ['arr[0] = float("inf")', 'ValueError: arr holds finite numbers'],
    ['arr[5] = 1', 'IndexError: list assignment index out of range'],
    ['arr.pop(9)', 'IndexError: pop index out of range'],
    ['arr["a"]', 'TypeError: list indices must be integers or slices, not str'],
  ])('rejects %s', (statement, message) => {
    const r = run(`def f(arr):\n    ${statement}\n`, 'f', [arr([1, 2])]);
    expect(r.error).toEqual({ kind: 'runtime', line: 2, message: expect.stringContaining(message) });
    expect(kinds(r)).toEqual(['array']);
  });

  it('pops from an empty array with the list error', () => {
    const r = run(`def f(arr):\n    arr.pop()\n    arr.pop()\n`, 'f', [arr([1])]);
    expect(kinds(r)).toEqual(['array', 'pop']);
    expect(r.error).toEqual({ kind: 'runtime', line: 3, message: 'IndexError: pop from empty list' });
  });

  it('accepts floats and tracks several arrays by name', () => {
    const r = run(
      `def merge(left, right):
    left.append(right.pop() / 2)
`,
      'merge',
      [arr([1], 'left'), arr([2, 3], 'right')],
    );
    expect(r.events.map((e) => e.kind)).toEqual(['array', 'array', 'pop', 'append']);
    expect(r.arrays).toEqual({ left: [1, 1.5], right: [2] });
  });
});

describe('print', () => {
  it('honours sep, ignores end, and prints arrays like lists', () => {
    const r = run(
      `def f(arr, label):
    print(label, arr, sep=" | ", end="")
    print()
    print(1, None, [1.5], sep="")
`,
      'f',
      [arr([1, 2]), { kind: 'value', name: 'label', value: 'arr' }],
    );
    expect(only(r, 'print').map((e) => e.text)).toEqual(['arr | [1, 2]', '', '1None[1.5]']);
    expect(only(r, 'print')[0]).toMatchObject({ line: 2, vars: { label: 'arr' } });
  });

  it('records prints at module level, before the entry function runs', () => {
    const r = run(`print("loading")\ndef f(arr):\n    return 1\n`, 'f', [arr([1])]);
    expect(r.events[0]).toEqual({ kind: 'print', text: 'loading', line: 1, vars: {} });
    expect(kinds(r)).toEqual(['print', 'array']);
  });
});

describe('returned values', () => {
  it.each([
    ['return arr', [3, 4]],
    ['return (1, (2, 3))', [1, [2, 3]]],
    ['return {"a": [1], "b": None}', { a: [1], b: null }],
    ['return {1: 2}', '{1: 2}'],
    ['return {1, 2}', '{1, 2}'],
    // Exact as text: as a JS number it would round.
    ['return 2 ** 60', '1152921504606846976'],
    ['return float("nan")', 'nan'],
    ['return "text"', 'text'],
    ['x = []\n    x.append(x)\n    return x', ['…']],
  ])('%s', (body, expected) => {
    const r = run(`def f(arr):\n    ${body}\n`, 'f', [arr([3, 4])]);
    expect(r.error).toBeNull();
    expect(r.returned).toEqual(expected);
  });

  it('passes value arguments through as plain Python values', () => {
    const r = run(
      `def f(n, opts, items):\n    return [n + 1, opts["deep"], items[::-1]]\n`,
      'f',
      [
        { kind: 'value', name: 'n', value: 1 },
        { kind: 'value', name: 'opts', value: { deep: true } },
        { kind: 'value', name: 'items', value: [1, 'a'] },
      ],
    );
    expect(kinds(r)).toEqual([]);
    expect(r.returned).toEqual([2, true, ['a', 1]]);
  });
});

describe('errors', () => {
  it('reports a runtime error inside a helper on the helper’s line', () => {
    const r = run(`def helper(x):\n    return 1 / x\n\ndef f(arr):\n    return helper(arr[0])\n`, 'f', [arr([0])]);
    expect(r.error).toEqual({ kind: 'runtime', line: 2, message: 'ZeroDivisionError: division by zero' });
  });

  it('reports errors raised at module level', () => {
    const r = run(`x = undefined_name\n`, 'f', [arr([1])]);
    expect(r.error).toEqual({ kind: 'runtime', line: 1, message: expect.stringContaining('NameError') });
    expect(r.events).toEqual([]);
  });

  it('asks for the entry function when the name is not callable', () => {
    const r = run(`f = 5\n`, 'f', [arr([1])]);
    expect(r).toMatchObject({ events: [], error: { kind: 'runtime', line: null, message: 'Define a function called f.' } });
  });

  it('names indentation errors', () => {
    const r = run(`def f(arr):\nreturn 1\n`, 'f', [arr([1])]);
    expect(r.error).toEqual({ kind: 'syntax', line: 2, message: expect.stringMatching(/^IndentationError: /) });
  });

  it('treats compile-time errors as syntax errors', () => {
    const r = run(`def f(arr):\n    pass\nreturn 1\n`, 'f', [arr([1])]);
    expect(r.error).toEqual({ kind: 'syntax', line: 3, message: "SyntaxError: 'return' outside function" });
  });

  it('reports a malformed request as an internal error', () => {
    const out = JSON.parse(runRequest('{"code": "x = 1"}'));
    expect(out.error).toMatchObject({ kind: 'internal', line: null });
  });
});

describe('limits', () => {
  it('stops at exactly maxEvents events, with the array matching them', () => {
    const r = run(`def f(arr):\n    while True:\n        arr[0] = arr[0] + 1\n`, 'f', [arr([0])], { maxEvents: 10 });
    expect(r.events).toHaveLength(10);
    expect(r.arrays).toEqual({ arr: [9] });
    expect(r.error).toEqual({
      kind: 'limit',
      line: 3,
      message: 'Stopped after 10 events: the code changed the array more times than the visual can show.',
    });
  });

  it('trips the default step limit well inside the default time budget', () => {
    const r = run(`def f(arr):\n    i = 0\n    while i < len(arr):\n        i = i * 1\n`, 'f', [arr([0])]);
    expect(r.error).toMatchObject({ kind: 'limit', message: expect.stringContaining('200,000 steps'), line: expect.any(Number) });
    expect(r.ms).toBeLessThan(DEFAULT_LIMITS.timeoutMs / 4);
  });

  it('formats the step limit with separators', () => {
    const r = run(`def f(arr):\n    while True:\n        pass\n`, 'f', [arr([0])], { maxSteps: 12_345 });
    expect(r.error).toMatchObject({ kind: 'limit', message: 'Stopped after 12,345 steps: is there a loop that never ends?' });
  });

  it('can’t be swallowed by except Exception', () => {
    const r = run(
      `def f(arr):\n    while True:\n        try:\n            arr[0] = 1\n        except Exception:\n            pass\n`,
      'f',
      [arr([0])],
      { maxEvents: 5 },
    );
    expect(r.error?.kind).toBe('limit');
  });

  it('still reports the limit when a bare except swallows it', () => {
    const r = run(
      `def f(arr):\n    try:\n        while True:\n            pass\n    except:\n        return "escaped"\n`,
      'f',
      [arr([0])],
      { maxSteps: 1_000 },
    );
    expect(r.error?.kind).toBe('limit');
    expect(r.returned).toBeNull();
  });

  it('stops an endless loop at module level', () => {
    const r = run(`while True:\n    pass\n`, 'f', [], { maxSteps: 1_000 });
    expect(r.error).toMatchObject({ kind: 'limit', line: expect.any(Number) });
  });

  it('counts steps inside helpers and recursion', () => {
    const r = run(`def f(arr):\n    return f(arr) if arr else 0\n`, 'f', [arr([1])], { maxSteps: 50 });
    expect(r.error?.kind).toBe('limit');
  });
});

describe('isolation between runs', () => {
  it('starts each run in a fresh namespace and puts print and the tracer back', () => {
    run(`leaked = 1\ndef f():\n    print("x")\n`, 'f');
    run(`def f():\n    while True:\n        pass\n`, 'f', [], { maxSteps: 100 });
    const r = run(`def f():\n    return leaked\n`, 'f');
    expect(r.error?.message).toContain("NameError: name 'leaked' is not defined");
    const state = pyodide.runPython('import builtins, sys\n[type(builtins.print).__name__, sys.gettrace() is None]');
    expect(state.toJs()).toEqual(['builtin_function_or_method', true]);
  });
});

describe('grids', () => {
  const size = (rows: number, cols: number): Arg[] => [
    { kind: 'value', name: 'rows', value: rows },
    { kind: 'value', name: 'cols', value: cols },
  ];
  const grid = (values: number[][]): Arg => ({ kind: 'grid', name: 'grid', values });

  it('reads like a list of lists: negative indices, len, iteration, slices, printing and returning', () => {
    const r = run(
      `def f(grid):
    row = grid[-1]
    total = 0
    for r in grid:
        total += sum(r)
    print(grid, grid[0])
    return [len(grid), len(row), row[-1], total, grid[0][1:], grid, row, grid == [[1, 2], [3, 4]], 3 in row]
`,
      'f',
      [grid([[1, 2], [3, 4]])],
    );
    expect(r.error).toBeNull();
    expect(r.returned).toEqual([2, 2, 4, 10, [2], [[1, 2], [3, 4]], [3, 4], true, true]);
    // The grid and its rows are left out of the variables, like visual arrays.
    expect(only(r, 'print')[0]).toMatchObject({ text: '[[1, 2], [3, 4]] [1, 2]', vars: { total: 10 } });
  });

  it('normalises negative indices in writes and reports them as positions', () => {
    const r = run(`def f(rows, cols):\n    dp = table(rows, cols)\n    dp[-1][-1] = 5\n`, 'f', size(2, 3));
    expect(only(r, 'cellWrite')).toMatchObject([{ row: 1, col: 2, value: 5 }]);
  });

  it.each([
    ['dp[0] = [1, 2]', 'would replace a whole row of dp'],
    ['dp.append([1, 2])', 'dp.append() would change the size of dp'],
    ['dp.pop()', 'a table keeps its size'],
    ['del dp[0]', 'a table keeps its size'],
    ['dp[0].append(1)', 'dp[0].append() would change the length of a row of dp'],
    ['dp[0].pop()', 'set cells with dp[0][j] = …'],
    ['del dp[0][0]', 'a table keeps its size'],
    ['dp[0] += [1]', 'a table keeps its size'],
    ['dp[0][0:1] = [5]', 'one cell at a time'],
    ['dp[0].sort()', 'dp[0].sort() would sort without showing the steps'],
    ['dp.reverse()', 'reorder the rows'],
  ])('refuses %s with a reason', (statement, reason) => {
    const r = run(`def f(rows, cols):\n    dp = table(rows, cols)\n    ${statement}\n`, 'f', size(2, 2));
    expect(r.error).toEqual({ kind: 'runtime', line: 3, message: expect.stringContaining(reason) });
    expect(r.error!.message).toMatch(/^TypeError: /);
    expect(r.grids).toEqual({ dp: [[0, 0], [0, 0]] });
  });

  it.each([
    ['table(2.5, 1)', 'TypeError: table(rows, cols) needs whole numbers, not 2.5.'],
    ['table(True, 1)', 'TypeError: table(rows, cols) needs whole numbers, not True.'],
    ['table(-1, 2)', "ValueError: table() can't make -1 rows."],
    ['table(2, -3)', "ValueError: table() can't make -3 columns."],
    ['table(200, 200)', 'ValueError: table(200, 200) would make 40,000 cells; a visual table holds at most 10,000.'],
    ['table(1, 1, "x")', "TypeError: fill must be a number or None, not 'x'."],
    ['array(-1)', "ValueError: array() can't make -1 cells."],
    ['array(2.5)', 'TypeError: array() needs a whole number of cells, not 2.5.'],
    ['array(3, None)', 'TypeError: fill must be a number, not None.'],
    ['array([1, "a"])', "TypeError: array() takes numbers, not 'a'."],
    ['array(None)', 'TypeError: array() takes a length or a list of numbers, not None.'],
    ['table(2, 2)[0][2]', 'IndexError: column 2 is out of range for table1 (2 columns)'],
    ['table(2, 2)[0]["a"]', 'TypeError: list indices must be integers or slices, not str'],
  ])('rejects %s', (expression, message) => {
    const r = run(`def f():\n    x = 1\n    return ${expression}\n`, 'f');
    expect(r.error).toEqual({ kind: 'runtime', line: 3, message });
  });

  it.each([
    ['dp[0][0] = float("inf")', 'ValueError: dp holds finite numbers'],
    ['dp[0][0] = None', "TypeError: dp holds numbers, so dp[0][0] can't store None (a NoneType)."],
    ['dp[0][0] = 2 ** 60', 'ValueError: dp holds numbers up to'],
  ])('rejects the cell write %s and leaves the grid as it was', (statement, message) => {
    const r = run(`def f(rows, cols):\n    dp = table(rows, cols)\n    ${statement}\n`, 'f', size(1, 1));
    expect(r.error).toEqual({ kind: 'runtime', line: 3, message: expect.stringContaining(message) });
    expect(kinds(r)).toEqual(['grid']);
    expect(r.grids).toEqual({ dp: [[0]] });
  });

  it('makes arrays from values or a length, named after their variable', () => {
    const r = run(`def f(grid):\n    copy = array(grid[1])\n    zeros = array(2, 7)\n    return [copy, zeros]\n`, 'f', [grid([[1], [5]])]);
    expect(r.events.slice(1)).toEqual([
      { kind: 'array', array: 'copy', name: 'copy', values: [5], line: 2, vars: {} },
      { kind: 'array', array: 'zeros', name: 'zeros', values: [7, 7], line: 3, vars: {} },
    ]);
    expect(r.arrays).toEqual({ copy: [5], zeros: [7, 7] });
  });

  it('names an annotated assignment, but not a nested call or a tuple target', () => {
    const r = run(`def f():\n    dp: list = table(1, 1)\n    a, b = table(1, 1), array(1)\n    pair = [table(1, 1)]\n`, 'f');
    expect(r.events.map((e) => ('grid' in e ? e.grid : 'array' in e ? e.array : e.kind))).toEqual(['dp', 'table1', 'array1', 'table2']);
  });

  it('leaves a learner’s own table function alone', () => {
    const r = run(`def table(rows, cols):\n    return [[9] * cols for _ in range(rows)]\n\ndef f():\n    dp = table(1, 2)\n    dp[0][0] = 1\n    return dp\n`, 'f');
    expect(r.events).toEqual([]);
    expect(r.returned).toEqual([[1, 9]]);
  });

  it('lists at most MAX_FROM cells read, the first ones', () => {
    const r = run(`def f(rows, cols):\n    dp = table(rows, cols, 1)\n    dp[1][0] = sum(dp[0])\n`, 'f', size(2, 40));
    const [write] = only(r, 'cellWrite');
    expect(write.from).toHaveLength(MAX_FROM);
    expect(write.from[MAX_FROM - 1]).toEqual({ grid: 'dp', row: 0, col: MAX_FROM - 1 });
  });

  it('counts cell writes toward the event limit, and a stopped write is not applied', () => {
    const r = run(`def f(rows, cols):\n    dp = table(rows, cols)\n    while True:\n        dp[0][0] = dp[0][0] + 1\n`, 'f', size(1, 1), { maxEvents: 10 });
    expect(r.events).toHaveLength(10);
    expect(r.error).toMatchObject({ kind: 'limit', line: 4 });
    expect(r.grids).toEqual({ dp: [[9]] });
  });
});

describe('lines mode', () => {
  type Step = Extract<RunEvent, { kind: 'step' }>;
  const lines = (code: string, entry = '', args: Arg[] = [], limits: Partial<Limits> = {}) => run(code, entry, args, limits, 'lines');
  const steps = (r: RunResult) => only(r, 'step');
  /** The innermost frame's names at a step, as name → value. */
  const names = (s: Step) => Object.fromEntries(s.stack.at(-1)!.locals);
  const object = (s: Step, value: MemValue) => s.heap.find((o) => 'ref' in value && o.id === value.ref)!;
  const end = (r: RunResult) => steps(r).at(-1)!;

  it('writes primitives as Python prints them', () => {
    const r = lines(`word = "it's"
flag = False
nothing = None
half = 0.1 + 0.2
big = 1e20
huge = 2 ** 200
long = "x" * 50
`);
    expect(r.error).toBeNull();
    expect(names(end(r))).toEqual({
      word: { prim: `"it's"`, type: 'string' },
      flag: { prim: 'False', type: 'boolean' },
      nothing: { prim: 'None', type: 'none' },
      half: { prim: '0.30000000000000004', type: 'number' },
      big: { prim: '1e+20', type: 'number' },
      huge: { prim: '16069380442589902755… (61 digits)', type: 'number' },
      long: { prim: `'${'x'.repeat(39)}…'`, type: 'string' },
    });
  });

  it('draws lists, tuples, sets, dicts, functions, classes and instances as heap objects', () => {
    const r = lines(`class Point:
    def __init__(self, x):
        self.x = x
def double(n):
    return n * 2
pair = (1, [2])
seen = {3}
ages = {1: "one"}
p = Point(4)
square = lambda v: v * v
`);
    const last = end(r);
    const kinds = Object.fromEntries(Object.entries(names(last)).map(([name, v]) => [name, object(last, v)]));
    expect(kinds.Point).toMatchObject({ kind: 'function', type: 'class', name: 'Point' });
    expect(kinds.double).toMatchObject({ kind: 'function', type: 'function', name: 'double' });
    expect(kinds.square).toMatchObject({ kind: 'function', name: '<lambda>' });
    expect(kinds.pair).toMatchObject({ kind: 'tuple', type: 'tuple', items: [{ prim: '1', type: 'number' }, { ref: expect.any(String) }], more: 0 });
    expect(kinds.seen).toMatchObject({ kind: 'set', type: 'set', items: [{ prim: '3' }] });
    expect(kinds.ages).toMatchObject({ kind: 'dict', entries: [[{ prim: '1' }, { prim: "'one'" }]] });
    expect(kinds.p).toMatchObject({ kind: 'object', type: 'Point', fields: [['x', { prim: '4', type: 'number' }]] });
    // The list inside the tuple is reachable, so it's in the heap too.
    expect(last.heap.filter((o) => o.kind === 'list')).toHaveLength(1);
  });

  it('runs a class body as one step of its frame, and a method call as a frame named after it', () => {
    const r = lines(`class Box:
    size = 1
    def grow(self):
        self.size += 1
b = Box()
b.grow()
`);
    expect(steps(r).map((s) => [s.event, s.line, s.stack.map((f) => f.fn).join(' > ')])).toEqual([
      ['line', 1, 'Global frame'],
      ['line', 5, 'Global frame'],
      ['line', 6, 'Global frame'],
      ['line', 4, 'Global frame > grow'],
      ['return', 4, 'Global frame > grow'],
      ['return', 6, 'Global frame'],
    ]);
  });

  it('leaves out the harness, dunders, modules and the table() and array() helpers', () => {
    const r = lines(`import math
_private = 1
x = math.floor(2.5)
`);
    expect(Object.keys(names(end(r)))).toEqual(['_private', 'x']);
  });

  it('lists the first MAX_ITEMS items and counts the rest', () => {
    const r = lines(`nums = list(range(25))
`);
    const nums = object(end(r), names(end(r)).nums);
    expect(nums).toMatchObject({ kind: 'list', more: 25 - MAX_ITEMS });
    expect(nums.kind === 'list' && nums.items).toHaveLength(MAX_ITEMS);
  });

  it('lists at most MAX_OBJECTS objects in a step, the rest as …', () => {
    // 1 + 20 + 400 objects in reach, MAX_ITEMS of each list shown.
    const r = lines(`cube = [[[j] for j in range(20)] for i in range(20)]
`);
    const last = end(r);
    expect(last.heap).toHaveLength(MAX_OBJECTS);
    const cut = last.heap.flatMap((o) => (o.kind === 'list' ? o.items : [])).filter((v) => 'prim' in v && v.prim === '…');
    expect(cut).toHaveLength(1 + 20 + 400 - MAX_OBJECTS);
    expect(stepProblems(r.events)).toEqual([]);
  });

  it('keeps ids stable for the run and never reuses one, even after an object is gone', () => {
    const r = lines(`for i in range(3):
    x = [i]
y = x
`);
    const ids = steps(r).flatMap((s) => names(s).x ?? []).flatMap((x) => ('ref' in x ? [x.ref] : []));
    expect(new Set(ids).size).toBe(3);
    const last = end(r);
    expect(names(last).y).toEqual(names(last).x);
  });

  it('shows array and grid arguments as plain lists, a row kept in a name as the grid’s own row', () => {
    const r = lines(`def f(arr, grid):
    row = grid[1]
    row[0] = arr[0]
    return row
`, 'f', [arr([7]), { kind: 'grid', name: 'grid', values: [[1, 2], [3, 4]] }]);
    expect(r.error).toBeNull();
    const last = end(r);
    const { arr: a, grid, row } = names(last);
    expect(object(last, a)).toMatchObject({ kind: 'list', type: 'list', items: [{ prim: '7' }] });
    const rows = object(last, grid);
    expect(rows.kind === 'list' && rows.items[1]).toEqual(row);
    expect(object(last, row)).toMatchObject({ kind: 'list', type: 'list', items: [{ prim: '7' }, { prim: '4' }] });
    // The visual events still come, and drawing memory recorded no reads.
    expect(only(r, 'cellWrite')).toMatchObject([{ grid: 'grid', row: 1, col: 0, value: 7, from: [] }]);
    expect(last.stack.at(-1)!.returning).toEqual(row);
  });

  it('records a generator’s yields as returns, and lambdas as frames of their own', () => {
    const r = lines(`def count(n):
    for i in range(n):
        yield i
total = sum(count(2))
key = sorted([2, 1], key=lambda v: -v)
`);
    expect(r.error).toBeNull();
    const fns = steps(r).map((s) => s.stack.at(-1)!.fn);
    expect(fns).toContain('count');
    expect(fns).toContain('<lambda>');
    expect(stepProblems(r.events)).toEqual([]);
  });

  it('stops a runaway recursion at MAX_DEPTH calls, on the line that made the call', () => {
    const r = lines(`def down(n):
    return down(n + 1)
down(0)
`);
    expect(r.error).toEqual({ kind: 'limit', line: 2, message: `Stopped at ${MAX_DEPTH} nested calls: is there a recursion that never ends?` });
    expect(Math.max(...steps(r).map((s) => s.stack.length))).toBe(MAX_DEPTH + 1);
    expect(stepProblems(r.events)).toEqual([]);
  });

  it('records no steps in visual mode, and a def is one step', () => {
    expect(steps(run(`def f():\n    return 1\n`, 'f'))).toEqual([]);
    // The statement marker before a def spans only its first line, so the def's last line isn't a step.
    expect(steps(lines(`def f():\n    x = 1\n    return x\ny = 2\n`)).map((s) => s.line)).toEqual([1, 4, 4]);
  });
});

describe('input()', () => {
  it('explains that values arrive as arguments', () => {
    const r = run(`def f(arr):\n    x = input("n? ")\n`, 'f', [arr([1])]);
    expect(r.error).toMatchObject({ kind: 'runtime', line: 2 });
    expect(r.error?.message).toContain('arguments');
  });
});

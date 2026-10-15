// The JS/TS runtime, run directly (the worker only forwards to runJs).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONTRACT, entryFor } from '../contract';
import { type Arg, DEFAULT_LIMITS, type Language, type Limits, type RunEvent, type RunResult } from '../protocol';
import { instrument } from './instrument';
import { runJs } from './runtime';

function run(code: string, entry: string, args: Arg[] = [], limits: Partial<Limits> = {}, language: Language = 'javascript'): RunResult {
  return runJs({ language, code, entry, args, limits: { ...DEFAULT_LIMITS, ...limits } });
}

const arr = (values: number[], name = 'arr'): Arg => ({ kind: 'array', name, values });
const kinds = (r: RunResult) => r.events.map((e) => e.kind);
const only = <K extends RunEvent['kind']>(r: RunResult, kind: K) =>
  r.events.filter((e): e is Extract<RunEvent, { kind: K }> => e.kind === kind);
const texts = (r: RunResult) => only(r, 'print').map((e) => e.text);

for (const language of ['javascript', 'typescript'] as const) {
  describe(`contract (${language})`, () => {
    // TypeScript runs every JavaScript case too (JS is valid TS), plus its own variants.
    for (const c of CONTRACT.filter((c) => c.code[language] ?? c.code.javascript)) {
      it(c.name, () => {
        const code = c.code[language] ?? c.code.javascript!;
        const r = run(code, entryFor(c, language), c.args, c.limits, language);
        const want = c.expect;
        if (want.events) expect(r.events).toEqual(want.events);
        else if (want.kinds) expect(kinds(r)).toEqual(want.kinds);
        if (want.count !== undefined) expect(r.events).toHaveLength(want.count);
        if (want.arrays) expect(r.arrays).toEqual(want.arrays);
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
}

describe('comparisons', () => {
  it('reports either side as a cell or a value, and evaluates the index once', () => {
    const r = run(
      `const calls = [];
function nextIndex() {
  calls.push(1);
  return calls.length - 1;
}
function f(arr) {
  const key = 2;
  const a = key < arr[1];
  const b = arr[0] !== arr[2];
  const c = arr[nextIndex()] >= arr[1] + 1;
  return [a, b, c, calls.length];
}
`,
      'f',
      [arr([1, 5, 3])],
    );
    expect(r.error).toBeNull();
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

  it('keeps each operator’s own semantics, loose equality included', () => {
    const r = run(
      `function f(arr) {
  return [arr[0] == "1", arr[0] === "1", arr[0] != "1", arr[0] !== "1", arr[0] <= 1, arr[1] > null];
}
`,
      'f',
      [arr([1, 2])],
    );
    expect(r.returned).toEqual([true, false, false, true, true, true]);
    expect(only(r, 'compare').map((e) => [e.op, e.result])).toEqual([
      ['==', true], ['==', false], ['!=', false], ['!=', true], ['<=', true], ['>', true],
    ]);
    expect(only(r, 'compare')[0].b).toEqual({ value: '1' });
    expect(only(r, 'compare')[5].b).toEqual({ value: null });
  });

  it('ignores comparisons without a visual cell, and leaves in/instanceof alone', () => {
    const r = run(
      `function f(arr) {
  const copy = arr.slice();
  const n = arr.length;
  return [copy[0] < copy[1], n > 1, 0 in arr, arr instanceof Array, 1 < 2];
}
`,
      'f',
      [arr([2, 1])],
    );
    expect(r.error).toBeNull();
    expect(kinds(r)).toEqual(['array']);
    expect(r.returned).toEqual([false, true, true, true, true]);
  });

  it('a for-loop test shows the current iteration’s variable', () => {
    const r = run(
      `function f(arr) {
  let steps = 0;
  for (let i = 0; arr[i] < 5; i++) {
    steps += 1;
  }
  return steps;
}
`,
      'f',
      [arr([1, 2, 9])],
    );
    expect(only(r, 'compare').map((e) => [e.line, e.vars])).toEqual([
      [3, { steps: 0, i: 0 }],
      [3, { steps: 1, i: 1 }],
      [3, { steps: 2, i: 2 }],
    ]);
    expect(r.returned).toBe(2);
  });

  it('reports a comparison in an expression-bodied arrow on the arrow’s line, with its own variables', () => {
    const r = run(
      `function f(arr) {
  const total = 3;
  const less = (a, b) =>
    arr[a] < arr[b];
  return less(0, 1);
}
`,
      'f',
      [arr([1, 2])],
    );
    expect(only(r, 'compare')).toEqual([
      { kind: 'compare', op: '<', a: { array: 'arr', index: 0, value: 1 }, b: { array: 'arr', index: 1, value: 2 }, result: true, line: 4, vars: { a: 0, b: 1 } },
    ]);
  });
});

describe('lines and variables', () => {
  it('a helper’s events carry its own lines and variables; the caller’s line comes back after it returns', () => {
    const r = run(
      `function swap(a, i, j) {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}
function next(i) {
  const k = i + 1;
  return k;
}
function f(arr) {
  swap(arr, 0, 1);
  arr[0] = next(4);
}
`,
      'f',
      [arr([1, 2])],
    );
    expect(r.error).toBeNull();
    expect(only(r, 'write').map((e) => [e.index, e.value, e.line, e.vars])).toEqual([
      [0, 2, 3, { i: 0, j: 1, t: 1 }],
      [1, 1, 4, { i: 0, j: 1, t: 1 }],
      [0, 5, 12, {}],
    ]);
    expect(r.arrays).toEqual({ arr: [5, 1] });
  });

  it('skips variables still in their temporal dead zone, _names, functions, objects and the visual arrays', () => {
    const r = run(
      `function f(arr, target) {
  const _hidden = 1;
  const helper = () => 1;
  const obj = { a: 1 };
  const nested = [[1], [2]];
  const pair = [3, 4];
  let best = Infinity;
  let unset;
  console.log("here");
  const later = 5;
  return later;
}
`,
      'f',
      [arr([1]), { kind: 'value', name: 'target', value: 7 }],
    );
    expect(only(r, 'print')).toEqual([{ kind: 'print', text: 'here', line: 9, vars: { target: 7, pair: '[3, 4]' } }]);
  });

  it('top-level code runs first, and its events have its lines', () => {
    const r = run(`console.log("loaded");\nfunction f(arr) {\n  return arr.length;\n}\n`, 'f', [arr([1, 2])]);
    expect(r.events).toEqual([
      { kind: 'print', text: 'loaded', line: 1, vars: {} },
      { kind: 'array', array: 'arr', name: 'arr', values: [1, 2], line: null, vars: {} },
    ]);
    expect(r.returned).toBe(2);
  });

  it('shows block, catch and loop variables in scope', () => {
    const r = run(
      `function f(arr) {
  for (const [k, v] of [[1, 2]]) {
    try {
      throw new Error("x");
    } catch ({ message }) {
      arr.push(k + v);
    }
  }
}
`,
      'f',
      [arr([])],
    );
    expect(only(r, 'append')).toEqual([{ kind: 'append', array: 'arr', value: 3, line: 6, vars: { k: 1, v: 2, message: 'x' } }]);
  });
});

describe('visual arrays', () => {
  it('reads, iterates and uses non-mutating methods without events', () => {
    const r = run(
      `function f(arr) {
  let sum = 0;
  for (const x of arr) sum += x;
  const out = [Array.isArray(arr), arr.length, sum, arr.indexOf(3), arr.includes(2), arr.slice(1), arr.map((x) => x * 2), arr.join("-"), [...arr], arr.at(-1), Math.max(...arr), JSON.stringify(arr)];
  arr.forEach(() => {});
  return out;
}
`,
      'f',
      [arr([1, 2, 3])],
    );
    expect(r.error).toBeNull();
    expect(kinds(r)).toEqual(['array']);
    expect(r.returned).toEqual([true, 3, 6, 2, true, [2, 3], [2, 4, 6], '1-2-3', [1, 2, 3], 3, 3, '[1,2,3]']);
  });

  it('push, pop and writes are events; pop on an empty array returns undefined', () => {
    const r = run(
      `function f(arr) {
  arr.push(1, 2);
  arr[0] = 5;
  arr.pop();
  arr.pop();
  return arr.pop();
}
`,
      'f',
      [arr([])],
    );
    expect(r.error).toBeNull();
    expect(r.events.slice(1).map((e) => [e.kind, e.line])).toEqual([['append', 2], ['append', 2], ['write', 3], ['pop', 4], ['pop', 5]]);
    expect(only(r, 'pop').map((e) => e.index)).toEqual([1, 0]);
    expect(r.arrays).toEqual({ arr: [] });
    expect(r.returned).toBeNull();
  });

  const failure = (body: string, values = [1, 2, 3]) => {
    const r = run(`function f(arr) {\n  ${body};\n}\n`, 'f', [arr(values)]);
    return { message: r.error?.message, kind: r.error?.kind, line: r.error?.line, arrays: r.arrays };
  };

  it('out-of-range and negative reads are RangeErrors', () => {
    expect(failure('return arr[3]')).toMatchObject({ kind: 'runtime', line: 2, message: 'RangeError: Index 3 is out of range for arr (length 3)' });
    expect(failure('return arr[-1]').message).toBe('RangeError: Index -1 is out of range for arr (length 3)');
    expect(failure('return arr[1.5]').message).toBe("TypeError: Index 1.5 isn't a whole number, so it can't pick a cell of arr.");
    expect(failure('let i; return arr[i]').message).toContain('Index undefined');
  });

  it('writes must be in range and numbers', () => {
    expect(failure('arr[3] = 1').message).toBe('RangeError: Index 3 is out of range for arr (length 3); use arr.push(value) to add to the end.');
    expect(failure('arr[0] = "x"').message).toBe('TypeError: arr holds numbers, so arr[0] can\'t store "x".');
    expect(failure('arr[0] = NaN').message).toBe("RangeError: arr holds finite numbers, so arr[0] can't store NaN.");
    expect(failure('arr.push(undefined)').message).toBe("TypeError: arr holds numbers, so arr.push() can't store undefined.");
    expect(failure('arr.length = 0').message).toContain("arr.length can't be set directly");
    expect(failure('delete arr[0]').message).toContain('use arr.pop() instead');
    expect(failure('arr.extra = 1').message).toContain('arr is a visual array');
    expect(failure('arr[0] = "x"').arrays).toEqual({ arr: [1, 2, 3] });
  });

  it('refuses the mutators that would skip the visual, with a reason', () => {
    expect(failure('arr.sort()').message).toBe(
      'TypeError: arr.sort() would sort without showing the steps; write the comparisons and swaps yourself.',
    );
    for (const method of ['reverse', 'splice', 'shift', 'unshift', 'fill', 'copyWithin']) {
      const { message, kind } = failure(`arr.${method}(0)`);
      expect(kind).toBe('runtime');
      expect(message).toMatch(new RegExp(`^TypeError: arr\\.${method}\\(\\) would`));
    }
    // Merely looking at a refused method is fine.
    expect(run(`function f(arr) { return typeof arr.sort; }`, 'f', [arr([1])]).returned).toBe('function');
  });

  it('a stopped write is not applied, so the arrays match the events', () => {
    const r = run(`function f(arr) {\n  arr[0] = 9;\n  arr[1] = 8;\n}\n`, 'f', [arr([1, 2])], { maxEvents: 2 });
    expect(r.error).toMatchObject({ kind: 'limit', line: 3 });
    expect(r.events).toHaveLength(2);
    expect(r.arrays).toEqual({ arr: [9, 2] });
  });
});

describe('printing', () => {
  it('formats values like the console, one event per call', () => {
    const r = run(
      `function f(arr) {
  console.log("a", 1, -0, true, null, undefined, [1, "b", [2]], arr, { x: [1, 2] });
  console.log();
  console.info(new Map([["k", 1]]), new Set([1]), new Error("boom"), () => 1, 10n);
}
`,
      'f',
      [arr([4, 5])],
    );
    expect(texts(r)).toEqual([
      'a 1 0 true null undefined [1, "b", [2]] [4, 5] {"x":[1,2]}',
      '',
      'Map(1) {"k" => 1} Set(1) {1} Error: boom [Function: (anonymous)] 10n',
    ]);
  });

  it('prints count toward the event limit', () => {
    const r = run(`function f(arr) {\n  while (true) console.log(1);\n}\n`, 'f', [arr([1])], { maxEvents: 10 });
    expect(r.events).toHaveLength(10);
    expect(r.error).toMatchObject({ kind: 'limit', line: 2 });
    expect(r.error?.message).toBe('Stopped after 10 events: the code changed the array more times than the visual can show.');
  });
});

describe('limits', () => {
  it('a learner’s try/catch can’t swallow the stop', () => {
    const variants = [
      'try { arr[0] = 1; } catch (e) {}',
      'try { arr[0] = 1; } catch {}',
      'try { arr[0] = 1; } catch ({ message }) { console.log(message); }',
      'try { arr[0] = 1; } finally { continue; }',
    ];
    for (const body of variants) {
      const r = run(`function f(arr) {\n  while (true) {\n    ${body}\n  }\n}\n`, 'f', [arr([0])], { maxEvents: 20 });
      expect(r.error?.kind, body).toBe('limit');
      expect(r.events, body).toHaveLength(20);
    }
  });

  it('counts steps in empty loop bodies of every kind', () => {
    for (const loop of ['for (;;);', 'for (;;) {}', 'while (true);', 'do {} while (true);', 'for (const x of (function* () { while (true) yield 1; })()) {}']) {
      const r = run(`function f(arr) {\n  ${loop}\n}\n`, 'f', [arr([1])], { maxSteps: 1_000 });
      expect(r.error, loop).toEqual({ kind: 'limit', message: 'Stopped after 1,000 steps: is there a loop that never ends?', line: 2 });
    }
  });

  it('the default step limit stops a tight loop quickly', () => {
    const r = run(`function f(arr) {\n  let i = 0;\n  while (true) i++;\n}\n`, 'f', [arr([1])]);
    expect(r.error?.message).toBe('Stopped after 200,000 steps: is there a loop that never ends?');
    expect(r.ms).toBeLessThan(5_000);
  });

  it('a learner catching its own errors still works', () => {
    const r = run(
      `function f(arr) {
  try {
    return arr[5];
  } catch (e) {
    return e instanceof RangeError ? "caught" : "other";
  }
}
`,
      'f',
      [arr([1])],
    );
    expect(r.error).toBeNull();
    expect(r.returned).toBe('caught');
  });
});

describe('errors', () => {
  it('runtime errors carry the name, message and innermost line', () => {
    const helper = run(`function check(a) {\n  throw new Error("boom");\n}\nfunction f(arr) {\n  check(arr);\n}\n`, 'f', [arr([1])]);
    expect(helper.error).toEqual({ kind: 'runtime', message: 'Error: boom', line: 2 });
    const thrown = run(`function f(arr) {\n  throw "oops";\n}\n`, 'f', [arr([1])]);
    expect(thrown.error).toEqual({ kind: 'runtime', message: 'Uncaught "oops"', line: 2 });
    // Strict mode: no accidental globals.
    const global = run(`function f(arr) {\n  count = 1;\n}\n`, 'f', [arr([1])]);
    expect(global.error).toEqual({ kind: 'runtime', message: 'ReferenceError: count is not defined', line: 2 });
  });

  it('syntax errors give the line and run nothing', () => {
    const ts = run(`function f(arr: number[]) {\n  return arr.length;\n}\n`, 'f', [arr([1])], {}, 'javascript');
    expect(ts.error).toMatchObject({ kind: 'syntax', line: 1 });
    expect(ts.error?.message).toMatch(/^SyntaxError: /);
    expect(ts.events).toEqual([]);
    const badTs = run(`function f(arr: number[]) {\n  const x: = 1;\n}\n`, 'f', [arr([1])], {}, 'typescript');
    expect(badTs.error).toMatchObject({ kind: 'syntax', line: 2 });
    expect(badTs.error?.message).not.toMatch(/\(\d+:\d+\)/);
    const strict = run(`function f(arr) {\n  with (arr) {}\n}\n`, 'f', [arr([1])]);
    expect(strict.error).toMatchObject({ kind: 'syntax', line: 2 });
    const reserved = run(`function f(arr) {\n  const __vizX = 1;\n}\n`, 'f', [arr([1])]);
    expect(reserved.error).toMatchObject({ kind: 'syntax', line: 2 });
    expect(reserved.error?.message).toContain('reserved');
  });

  it('looks up the entry after the top level runs, whatever kind of function it is', () => {
    expect(run(`const f = (arr) => arr.length;`, 'f', [arr([1, 2])]).returned).toBe(2);
    expect(run(`let f;\nf = function (arr) { return 1; };`, 'f', [arr([1])]).returned).toBe(1);
    const notFn = run(`const f = 5;`, 'f', [arr([1])]);
    expect(notFn.error).toEqual({ kind: 'runtime', message: 'Define a function called f.', line: null });
    expect(notFn.events).toEqual([]);
    expect(run(`function f() {}`, 'f; alert(1)', []).error?.kind).toBe('internal');
  });

  it('an async entry is an error, not a silent half-run', () => {
    const r = run(`async function f(arr) {\n  arr.push(1);\n}\n`, 'f', [arr([])]);
    expect(r.error).toMatchObject({ kind: 'runtime', line: null });
    expect(r.error?.message).toContain('async');
  });
});

describe('returned values', () => {
  it('converts the return value to JSON', () => {
    const cases: [string, unknown][] = [
      ['return arr;', [1, 2]],
      ['return undefined;', null],
      ['', null],
      ['return { a: 1, b: [arr, "x"], c: undefined };', { a: 1, b: [[1, 2], 'x'] }],
      ['return Infinity;', 'Infinity'],
      ['return -0;', 0],
      ['return function g() {};', '[Function: g]'],
      ['return new Map([[1, 2]]);', [[1, 2]]],
      ['const a = [1]; a.push(a); return a;', [1, '…']],
    ];
    for (const [body, want] of cases) {
      const r = run(`function f(arr) {\n  ${body}\n}\n`, 'f', [arr([1, 2])]);
      expect(r.error, body).toBeNull();
      expect(r.returned, body).toEqual(want);
    }
  });

  it('value arguments are copies', () => {
    const value = { kind: 'value' as const, name: 'opts', value: { n: 1 } };
    run(`function f(opts) {\n  opts.n = 2;\n}\n`, 'f', [value]);
    expect(value.value).toEqual({ n: 1 });
  });
});

describe('language coverage', () => {
  it('TypeScript keeps every line where it was', () => {
    const r = run(
      `interface Pair {
  a: number;
  b: number;
}
type Arr = number[];
enum Dir { Up, Down }
function f(arr: Arr, p: Pair = { a: 1, b: 2 }): number {
  const n = <number>arr.length;
  const d: Dir = Dir.Down;
  if (arr[0] > (n as number)) {
    arr[1] = d;
  }
  return arr.length!;
}
`,
      'f',
      [arr([5, 0])],
      {},
      'typescript',
    );
    expect(r.error).toBeNull();
    expect(r.events.slice(1).map((e) => [e.kind, e.line])).toEqual([['compare', 10], ['write', 11]]);
    expect(r.arrays).toEqual({ arr: [5, 1] });
  });

  it('runs a mix of syntax unchanged', () => {
    const r = run(
      `class Stack {
  #items = [];
  static made = 0;
  static { Stack.made = 0; }
  push(x) { this.#items.push(x); return this; }
  get size() { return this.#items.length; }
}
function* range(n) { for (let i = 0; i < n; i++) yield i; }
function f(arr) {
  const s = new Stack().push(1).push(2);
  let total = 0;
  outer: for (const i of range(3)) {
    for (const j in [0, 1]) {
      if (j === "1") continue outer;
      total += i;
    }
  }
  switch (s.size) {
    case 2: { const two = 2; total += two; break; }
    default: total = -1;
  }
  let k = 0;
  do { k++; } while (k < 3);
  const { a = arr[0] > 0 ? 1 : 2, ...rest } = { b: 2 };
  const tag = (s, ...v) => s.raw.join("|") + v.join(",");
  const label = tag\`x\${k}y\`;
  const maybe = null;
  const obj = { [\`k\${k}\`]: k, m() { return k > 1; } };
  return [total, k, a, rest, label, maybe?.x ?? "none", obj.k3, obj.m(), 2 ** 3, typeof arr];
}
`,
      'f',
      [arr([1])],
    );
    expect(r.error).toBeNull();
    expect(r.returned).toEqual([5, 3, 1, { b: 2 }, 'x|y3', 'none', 3, true, 8, 'object']);
    expect(only(r, 'compare')).toHaveLength(1);
  });

  it('handles derived constructors, hoisted vars and deep recursion', () => {
    const r = run(
      `class Base { constructor(n) { this.n = n; } }
class Child extends Base {
  constructor(n) {
    super(n);
    this.twice = n * 2;
  }
}
function depth(k) { return k === 0 ? 0 : 1 + depth(k - 1); }
function f(arr) {
  for (var i = 0; i < 2; i++) {}
  arr.push(new Child(3).twice);
  return depth(2000);
}
`,
      'f',
      [arr([])],
    );
    expect(r.error).toBeNull();
    expect(only(r, 'append')).toEqual([{ kind: 'append', array: 'arr', value: 6, line: 11, vars: { i: 2 } }]);
    expect(r.returned).toBe(2000);
  });

  it('runs are independent', () => {
    const code = `let calls = 0;\nfunction f(arr) {\n  calls += 1;\n  arr[0] = calls;\n  return calls;\n}\n`;
    expect(run(code, 'f', [arr([0])]).returned).toBe(1);
    expect(run(code, 'f', [arr([0])]).returned).toBe(1);
  });

  it('instrumenting leaves no stray directives or comparisons behind', () => {
    const { code } = instrument(`function f(a) {\n  "use strict";\n  return a[0] < 1;\n}\n`, 'javascript');
    expect(code.startsWith('"use strict";')).toBe(true);
    expect(code).toMatch(/function f\(a\) \{\s*"use strict";/);
    expect(code).toContain('__viz.cmp("<", __viz.cell(a, 0, 3), 1, 3');
  });
});

// Replaying the events from the starting values must reproduce every
// comparison's values and the final arrays, whatever the input.
const SORTS: Record<string, string> = {
  bubble: `function sort(arr) {
  for (let i = 0; i < arr.length; i++)
    for (let j = 0; j + 1 < arr.length - i; j++)
      if (arr[j] > arr[j + 1]) [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
}`,
  selection: `function swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }
function sort(arr) {
  for (let i = 0; i < arr.length; i++) {
    let min = i;
    for (let j = i + 1; j < arr.length; j++) if (arr[j] < arr[min]) min = j;
    if (min !== i) swap(arr, i, min);
  }
}`,
  quick: `function partition(arr, lo, hi) {
  const pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j] <= pivot) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      i++;
    }
  }
  [arr[i], arr[hi]] = [arr[hi], arr[i]];
  return i;
}
function sort(arr, lo = 0, hi = arr.length - 1) {
  if (lo >= hi) return;
  const p = partition(arr, lo, hi);
  sort(arr, lo, p - 1);
  sort(arr, p + 1, hi);
}`,
  merge: `function sort(arr) {
  const copy = arr.slice();
  const merged = mergeSort(copy);
  for (let k = 0; k < merged.length; k++) arr[k] = merged[k];
}
function mergeSort(a) {
  if (a.length < 2) return a;
  const mid = Math.floor(a.length / 2);
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));
  const out = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) out.push(left[i] <= right[j] ? left[i++] : right[j++]);
  return out.concat(left.slice(i), right.slice(j));
}`,
};

describe('property: events replay to the final arrays', () => {
  for (const [name, code] of Object.entries(SORTS)) {
    it(`${name} sort`, () => {
      fc.assert(
        fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 12 }), (values) => {
          const r = run(code, 'sort', [arr(values)]);
          expect(r.error).toBeNull();
          const state = [...values];
          for (const e of r.events) {
            if (e.kind === 'write') state[e.index] = e.value;
            else if (e.kind === 'append') state.push(e.value);
            else if (e.kind === 'pop') state.splice(e.index, 1);
            else if (e.kind === 'compare') {
              for (const side of [e.a, e.b]) if ('array' in side) expect(state[side.index]).toBe(side.value);
            }
            if (e.kind !== 'array') {
              expect(e.line).toEqual(expect.any(Number));
            }
          }
          expect(state).toEqual(r.arrays.arr);
          expect(r.arrays.arr).toEqual([...values].sort((a, b) => a - b));
        }),
        { numRuns: 40 },
      );
    });
  }
});

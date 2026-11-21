// B5's Pascal exercise names the usual mistakes: each wrong answer below is a
// slip a learner really makes, and its verdict must say what it was. Most run
// in JavaScript; the table that is one row short and the missing k > n check
// also run in Python, whose index errors are worded differently.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { choose } from '@/algorithms/probability/counting';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { chooseValue, pascalRows } from './counting';

const SLUG = 'pascal-choose';
let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(code: string, test: number, language: Language = 'javascript') {
  const exercise = getExercise(SLUG)!;
  const input = exercise.tests[test].input;
  const request = testRequest(exercise, language, code, input);
  const result: RunResult = language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
  return { exercise, input, result };
}
function verdict(code: string, test = 0, language: Language = 'javascript') {
  const { exercise, input, result } = run(code, test, language);
  return exercise.check(input, result);
}

const swap = (from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(SLUG)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

/** Index of the test with these arguments. */
const testOf = (n: number, k: number) => getExercise(SLUG)!.tests.findIndex((t) => t.input.n === n && t.input.k === k);

describe('the reference maths', () => {
  it('is Pascal’s triangle, the same as the visualiser’s C(n, k)', () => {
    expect(pascalRows(4)).toEqual([[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]);
    for (let n = 0; n <= 12; n++) for (let k = 0; k <= n + 2; k++) expect(chooseValue({ n, k })).toBe(choose(n, k));
    expect(getExercise(SLUG)!.tests.map((t) => chooseValue(t.input))).toEqual([10, 20, 1, 1, 0, 56, 1, 792]);
  });
});

describe('pascal-choose explains the usual mistakes', () => {
  it('the solution passes every test, in both languages, and draws an arrow from both cells each step reads', () => {
    const exercise = getExercise(SLUG)!;
    for (const language of ['javascript', 'python'] as const)
      exercise.tests.forEach((_, i) => expect(verdict(exercise.solution[language], i, language), `${language} ${i}`).toMatchObject({ pass: true }));
    const { result } = run(exercise.solution.javascript, 0);
    const writes = result.events.filter((e) => e.kind === 'cellWrite');
    const inside = writes.filter((e) => e.kind === 'cellWrite' && e.col > 0 && e.col < e.row);
    expect(inside.length).toBe(1 + 2 + 3 + 4);
    for (const w of inside) {
      if (w.kind !== 'cellWrite') continue;
      expect(w.from.map((c) => [c.row, c.col]).sort()).toEqual([
        [w.row - 1, w.col - 1],
        [w.row - 1, w.col],
      ]);
    }
  });

  it('the starter, and a right answer without the table', () => {
    const exercise = getExercise(SLUG)!;
    expect(verdict(exercise.starter.javascript).message).toMatch(/Build Pascal’s triangle in a table/);
    const formula = 'function choose(n, k) {\n  if (k > n) return 0;\n  let r = 1;\n  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);\n  return r;\n}\n';
    expect(verdict(formula).message).toMatch(/Your answer is right, but/);
  });

  it('an edge not set to 1', () => {
    expect(verdict(swap('    C[i][i] = 1;\n', '')).message).toMatch(/C\[1\]\[1\] should be 1: it is on the edge/);
    expect(verdict(swap('    C[i][0] = 1;\n', '')).message).toMatch(/C\[1\]\[0\] should be 1: .*choose none/);
    expect(verdict(swap('    C[i][0] = 1;\n    C[i][i] = 1;\n', '')).message).toMatch(/Every cell is still 0/);
  });

  it('adding the wrong neighbours: above and above right, left and above, or multiplying', () => {
    const rule = 'C[i - 1][j - 1] + C[i - 1][j]';
    expect(verdict(swap(rule, 'C[i - 1][j] + C[i - 1][j + 1]'), testOf(6, 3)).message).toMatch(/the wrong two cells/);
    expect(verdict(swap(rule, 'C[i][j - 1] + C[i - 1][j]')).message).toMatch(/grid of paths/);
    expect(verdict(swap(rule, 'C[i - 1][j - 1] * C[i - 1][j]')).message).toMatch(/never gets past 1/);
    expect(verdict(swap(rule, 'C[i - 1][j]')).message).toMatch(/should be C\[2\]\[0\] \+ C\[2\]\[1\]|never gets past 1/);
  });

  it('a table one row short, and no check for k > n', () => {
    expect(verdict(swap('table(n + 1, n + 1, 0)', 'table(n, n, 0)')).message).toMatch(/Your table is 5×5: .* there is no row 5/);
    const unchecked = swap('  if (k > n) {\n    return 0;\n  }\n', '');
    expect(verdict(unchecked, testOf(3, 5)).message).toMatch(/reads past the end of the table: there is no way to choose 5 things from 3/);
    expect(verdict(swap('  if (k > n) {\n    return 0;\n  }\n', '  if (k > n) {\n    return 1;\n  }\n'), testOf(3, 5)).message).toMatch(/should be 0/);
  });

  it('returning the wrong cell', () => {
    expect(verdict(swap('return C[n][k];', 'return C[n][k - 1];')).message).toMatch(/you returned C\[5\]\[1\] = 5/);
    expect(verdict(swap('return C[n][k];', 'return C[n - 1][k];')).message).toMatch(/a cell of row 4/);
  });

  it('in Python too: a table one row short, and no check for k > n', () => {
    expect(verdict(swap('table(n + 1, n + 1, 0)', 'table(n, n, 0)', 'python'), 0, 'python').message).toMatch(/there is no row 5/);
    const unchecked = swap('    if k > n:\n        return 0\n', '', 'python');
    expect(verdict(unchecked, testOf(3, 5), 'python').message).toMatch(/reads past the end of the table/);
    expect(verdict(swap('C[i - 1][j - 1] + C[i - 1][j]', 'C[i - 1][j] + C[i - 1][j + 1]', 'python'), testOf(6, 3), 'python').message).toMatch(/the wrong two cells/);
  });
});

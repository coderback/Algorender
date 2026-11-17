// Exercises whose judged tests run in 'judge' mode: as written, at full speed,
// within a time budget (the math and ML path's heavy parts: training loops and
// forward passes). No exercise uses it yet, so a fixture stands in.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import { DEFAULT_LIMITS, LANGUAGES, type Language, type RunRequest, type RunResult } from '@/workspace/protocol';
import { JUDGE_BUDGET_MS, testRequest, type Exercise } from '.';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

const exec = (request: RunRequest): RunResult => (request.language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request));

const LANGS = Object.keys(LANGUAGES) as Language[];

/** Sum of squares up to n, the slow way: a quarter of 250,000 loop steps is past the instrumented step limit. */
const heavy: Exercise<{ n: number }> = {
  slug: 'judge-fixture',
  title: 'Judge fixture',
  kind: 'write',
  visualiser: 'array',
  summary: '',
  task: [],
  entry: { python: 'sum_squares', js: 'sumSquares' },
  args: ({ n }) => [{ kind: 'value', name: 'n', value: n }],
  starter: { python: 'def sum_squares(n):\n    return 0\n', javascript: 'function sumSquares(n) {\n  return 0;\n}\n', typescript: 'function sumSquares(n: number): number {\n  return 0;\n}\n' },
  solution: {
    python: 'def sum_squares(n):\n    total = 0\n    for i in range(1, n + 1):\n        total += i * i\n    return total\n',
    javascript: 'function sumSquares(n) {\n  let total = 0;\n  for (let i = 1; i <= n; i++) total += i * i;\n  return total;\n}\n',
    typescript: 'function sumSquares(n: number): number {\n  let total = 0;\n  for (let i = 1; i <= n; i++) total += i * i;\n  return total;\n}\n',
  },
  examples: [{ id: 'small', label: 'n = 3', input: { n: 3 } }],
  tests: [
    { name: 'small', input: { n: 3 } },
    { name: 'a quarter of a million', input: { n: 250_000 } },
  ],
  check: ({ n }, r) => {
    const want = (n * (n + 1) * (2 * n + 1)) / 6;
    return r.error ? { pass: false, message: r.error.message } : { pass: r.returned === want, message: `want ${want}, got ${JSON.stringify(r.returned)}` };
  },
  markSortedAtEnd: false,
  pointers: [],
  hints: ['Add i * i for every i.'],
  legend: [{ neutral: 'Values' }],
  judge: { budget: 'project' },
};

describe('judge-mode exercise tests', () => {
  it('run in judge mode within the budget, and the rest as before', () => {
    const r = testRequest(heavy, 'python', 'code', { n: 3 });
    expect(r).toMatchObject({ mode: 'judge', entry: 'sum_squares', limits: { timeoutMs: JUDGE_BUDGET_MS.project.python } });
    expect(testRequest(heavy, 'typescript', 'code', { n: 3 }).limits.timeoutMs).toBe(JUDGE_BUDGET_MS.project.typescript);
    expect(testRequest({ ...heavy, judge: { budget: 'exercise' } }, 'javascript', 'code', { n: 3 }).limits.timeoutMs).toBe(JUDGE_BUDGET_MS.exercise.javascript);
    const plain = { ...heavy, judge: undefined };
    expect(testRequest(plain, 'javascript', 'code', { n: 3 })).toMatchObject({ mode: 'visual', limits: DEFAULT_LIMITS });
  });

  it('give projects longer than ordinary tests, and Python the most', () => {
    for (const language of LANGS) expect(JUDGE_BUDGET_MS.project[language]).toBeGreaterThan(JUDGE_BUDGET_MS.exercise[language]);
    expect(JUDGE_BUDGET_MS.project.python).toBeGreaterThanOrEqual(30_000);
    expect(JUDGE_BUDGET_MS.project.python).toBeLessThanOrEqual(60_000);
  });

  for (const language of LANGS) {
    it(`${language}: a heavy test passes judged, where an instrumented run stops at the step limit`, () => {
      const code = heavy.solution[language];
      for (const test of heavy.tests) expect(heavy.check(test.input, exec(testRequest(heavy, language, code, test.input))), test.name).toMatchObject({ pass: true });
      const plain = { ...heavy, judge: undefined };
      const instrumented = exec(testRequest(plain, language, code, { n: 250_000 }));
      expect(instrumented.error?.kind).toBe('limit');
      // The starter runs cleanly and fails.
      expect(heavy.check({ n: 3 }, exec(testRequest(heavy, language, heavy.starter[language], { n: 3 }))).pass).toBe(false);
    });
  }
});

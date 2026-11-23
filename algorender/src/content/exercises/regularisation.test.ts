// B7's ridge exercise names the usual mistakes: each wrong answer below is a
// slip a learner really makes, and its verdict must say what it was. The
// solutions run in both runtimes and must agree to the last bit; the slips
// run in JavaScript, and the ones that matter most in Python too.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEAST_SQUARES, ridgeWeights } from '@/algorithms/ml/regularisation';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { lstsqOf } from './least-squares';
import { ridgeMatrix, ridgeOf, RIDGE_TESTS, TWINS, type RidgeSlip } from './regularisation';

const SLUG = 'ridge-regression';
let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(code: string, test = 0, language: Language = 'javascript'): RunResult {
  const exercise = getExercise(SLUG)!;
  const request = testRequest(exercise, language, code, exercise.tests[test].input);
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

function verdict(code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(SLUG)!;
  return exercise.check(exercise.tests[test].input, run(code, test, language));
}

const swap = (from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(SLUG)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('is the visualiser’s ridge, least squares at λ = 0, and every slip differs', () => {
    for (const lam of [0, 1, 16, 1000]) {
      const w = ridgeOf({ ...RIDGE_TESTS[0].input, lam });
      const v = ridgeWeights(lam);
      expect(w[0]).toBeCloseTo(v[0], 12);
      expect(w[1]).toBeCloseTo(v[1], 12);
    }
    const ls = ridgeOf(RIDGE_TESTS[1].input);
    expect(ls[0]).toBeCloseTo(LEAST_SQUARES[0], 12);
    expect(ridgeOf(RIDGE_TESTS[3].input, 'forgot')).toEqual(lstsqOf(RIDGE_TESTS[3].input.X, RIDGE_TESTS[3].input.y));
    expect(ridgeMatrix(RIDGE_TESTS[0].input)).toEqual([[48, 21], [21, 42]]);
    const slips: RidgeSlip[] = ['forgot', 'every', 'minus', 'to-b', 'times-n', 'over-n', 'twice', 'half'];
    for (const test of [0, 2, 3, 5]) {
      const all = [ridgeOf(RIDGE_TESTS[test].input), ...slips.map((s) => ridgeOf(RIDGE_TESTS[test].input, s))].map((w) => w.map((v) => v.toFixed(8)).join());
      expect(new Set(all).size, `test ${test}`).toBe(all.length);
    }
    // Twin columns: no single least-squares answer, and λ shares the weight equally: 13/21 each.
    const twins = ridgeOf(TWINS);
    expect(twins[0]).toBeCloseTo(13 / 21, 12);
    expect(twins[1]).toBeCloseTo(13 / 21, 12);
    expect(ridgeOf(TWINS, 'forgot').every(Number.isFinite)).toBe(false);
  });
});

describe('B7’s ridge exercise explains the usual mistakes', () => {
  it('the solution passes every test, in JavaScript and TypeScript', () => {
    const exercise = getExercise(SLUG)!;
    expect(exercise.visualiser).toBe('regularisation');
    exercise.tests.forEach((_, i) => expect(verdict(exercise.solution.javascript, i), `test ${i}`).toMatchObject({ pass: true }));
    exercise.tests.forEach((_, i) => expect(verdict(exercise.solution.typescript, i, 'typescript'), `test ${i} ts`).toMatchObject({ pass: true }));
    expect(verdict(exercise.starter.javascript).pass).toBe(false);
  });

  it('names each slip', () => {
    const add = '    A[i][i] = A[i][i] + lam;';
    expect(verdict(swap(add, '    A[i][i] = A[i][i];')).message).toMatch(/plain least-squares/);
    expect(verdict(swap(add, '    for (let j = 0; j < A.length; j++) A[i][j] = A[i][j] + lam;')).message).toMatch(/every entry/);
    expect(verdict(swap(add, '    A[i][i] = A[i][i] - lam;')).message).toMatch(/minus sign/);
    expect(verdict(swap(add, '    A[i][i] = A[i][i];').replace('return solve(A, matvec(Xt, y));', 'const c = matvec(Xt, y);\n  for (let i = 0; i < c.length; i++) c[i] = c[i] + lam;\n  return solve(A, c);')).message).toMatch(/right-hand side/);
    expect(verdict(swap(add, '    A[i][i] = A[i][i] + X.length * lam;')).message).toMatch(/mean of the squared errors/);
    expect(verdict(swap(add, '    A[i][i] = A[i][i] + lam / X.length;')).message).toMatch(/λ\/8/);
    expect(verdict(swap(add, '    A[i][i] = A[i][i] + 2 * lam;')).message).toMatch(/2λ/);
    expect(verdict(swap(add, '    A[i][i] = A[i][i] + lam / 2;')).message).toMatch(/λ\/2/);
    expect(verdict(swap('const A = matmul(Xt, X);', 'const A = matmul(X, Xt);').replace('return solve(A, matvec(Xt, y));', 'return solve(A, y);')).message).toMatch(/one per row of X/);
    // Twin columns: without λ the elimination meets a zero pivot.
    expect(verdict(swap(add, '    A[i][i] = A[i][i];'), 4).message).toMatch(/zero pivot/);
  });

  it('in Python: the same numbers to the last bit, and the same slips named', () => {
    const exercise = getExercise(SLUG)!;
    exercise.tests.forEach((_, i) => {
      const py = run(exercise.solution.python, i, 'python');
      expect(exercise.check(exercise.tests[i].input, py), `test ${i}`).toMatchObject({ pass: true });
      expect(py.returned).toEqual(run(exercise.solution.javascript, i).returned);
    });
    const add = '        A[i][i] = A[i][i] + lam';
    expect(verdict(swap(add, '        A[i][i] = A[i][i] + len(X) * lam', 'python'), 0, 'python').message).toMatch(/mean of the squared errors/);
    expect(verdict(swap(add, '        A[i][i] = A[i][i] - lam', 'python'), 0, 'python').message).toMatch(/minus sign/);
    expect(verdict(swap(add, '        A[i][i] = A[i][i]', 'python'), 4, 'python').message).toMatch(/zero pivot/);
    expect(verdict(exercise.starter.python, 0, 'python').pass).toBe(false);
  });
});

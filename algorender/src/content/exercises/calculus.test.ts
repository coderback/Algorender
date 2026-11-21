// B4's exercises name the usual mistakes: each wrong answer below is a slip a
// learner really makes, and its verdict must say what it was. Most run in
// JavaScript; Newton's method also runs in Python, which stops on a division
// by zero where JavaScript makes an ∞ the visual array refuses.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { centralDifference, heightGrid, newtonGuesses, numericJacobian, PLANE_MAPS, SLOPE_FUNCTIONS } from './calculus';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function verdict(slug: string, code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(slug)!;
  const input = exercise.tests[test].input;
  const request = testRequest(exercise, language, code, input);
  const result: RunResult = language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
  return exercise.check(input, result);
}

const swap = (slug: string, from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(slug)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('reads a map, measures slopes and Jacobians, and finds square roots', () => {
    // The top is at (1, 2), height 9; the x·y term slants the hill.
    expect(heightGrid({ xs: [0, 1, 2], ys: [3, 2] })).toEqual([[5, 7, 7], [8, 9, 8]]);
    const { f, df } = SLOPE_FUNCTIONS.cube;
    expect(Math.abs(centralDifference(f, 2, 1e-3) - df(2))).toBeLessThan(2e-6);
    // The maps are at most quadratic, so stepping both ways is exact up to rounding.
    const J = numericJacobian({ name: 'squaring', x: 1, y: 2, h: 1e-3 });
    PLANE_MAPS.squaring.J(1, 2).forEach((row, i) => row.forEach((v, j) => expect(J[i][j]).toBeCloseTo(v, 9)));
    const guesses = newtonGuesses(2);
    expect(Math.abs(guesses[guesses.length - 1] - Math.SQRT2)).toBeLessThan(1e-15);
    expect(guesses.length).toBeLessThan(10);
  });
});

describe('B4’s exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['height-table', 'numeric-derivative', 'newton-sqrt', 'jacobian-numeric']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
    }
  });

  it('height-table: one row per x, f(y, x), upside down, rows for columns', () => {
    const exercise = getExercise('height-table')!;
    expect(verdict('height-table', exercise.starter.javascript).message).toMatch(/Return the table/);
    expect(verdict('height-table', swap('height-table', 'grid[i][j] = f(xs[j], ys[i]);', '')).message).toMatch(/still 0/);
    const byX = swap('height-table', 'table(ys.length, xs.length, 0)', 'table(xs.length, ys.length, 0)').replace('grid[i][j] = f(xs[j], ys[i]);', 'grid[j][i] = f(xs[j], ys[i]);');
    expect(verdict('height-table', byX, 1).message).toMatch(/one row for each x/);
    expect(verdict('height-table', swap('height-table', 'f(xs[j], ys[i])', 'f(ys[i], xs[j])')).message).toMatch(/f\(y, x\)/);
    expect(verdict('height-table', swap('height-table', 'f(xs[j], ys[i])', 'f(xs[j], ys[ys.length - 1 - i])')).message).toMatch(/upside down/);
    expect(verdict('height-table', swap('height-table', 'f(xs[j], ys[i])', 'f(xs[i], ys[j])')).message).toMatch(/Rows and columns are swapped/);
  });

  it('numeric-derivative: one-sided chords, h for 2h, / 2 * h, and the sign', () => {
    const exercise = getExercise('numeric-derivative')!;
    const body = 'return (f(x + h) - f(x - h)) / (2 * h);';
    expect(verdict('numeric-derivative', exercise.starter.javascript).message).toMatch(/still 0/);
    expect(verdict('numeric-derivative', swap('numeric-derivative', body, 'return (f(x + h) - f(x)) / h;')).message).toMatch(/forward difference/);
    expect(verdict('numeric-derivative', swap('numeric-derivative', body, 'return (f(x) - f(x - h)) / h;'), 1).message).toMatch(/backward difference/);
    expect(verdict('numeric-derivative', swap('numeric-derivative', body, 'return (f(x + h) - f(x - h)) / h;'), 1).message).toMatch(/twice too big/);
    expect(verdict('numeric-derivative', swap('numeric-derivative', body, 'return (f(x + h) - f(x - h)) / 2 * h;'), 2).message).toMatch(/brackets/);
    expect(verdict('numeric-derivative', swap('numeric-derivative', body, 'return (f(x - h) - f(x + h)) / (2 * h);'), 3).message).toMatch(/wrong sign/);
  });

  it('newton-sqrt: no 2, averaging x and a, stopping early, starting at 0, no steps', () => {
    const exercise = getExercise('newton-sqrt')!;
    expect(verdict('newton-sqrt', exercise.starter.javascript).message).toMatch(/first guess/);
    expect(verdict('newton-sqrt', swap('newton-sqrt', '/ (2 * x)', '/ x')).message).toMatch(/back and forth/);
    expect(verdict('newton-sqrt', swap('newton-sqrt', 'const step = (x * x - a) / (2 * x);', 'const step = x - (x + a) / 2;'), 4).message).toMatch(/averaged x and a/);
    const once = swap('newton-sqrt', 'if (Math.abs(step) <= 1e-12 * x) {', 'if (true) {');
    expect(verdict('newton-sqrt', once, 3).message).toMatch(/stopped after 1 step/);
    expect(verdict('newton-sqrt', swap('newton-sqrt', 'let x = a;', 'let x = 0;')).message).toMatch(/guess of 0/);
    expect(verdict('newton-sqrt', swap('newton-sqrt', 'steps.push(x);', '')).message).toMatch(/steps should hold every guess/);
  });

  it('newton-sqrt in Python: a ZeroDivisionError and an endless swap are named too', () => {
    expect(verdict('newton-sqrt', swap('newton-sqrt', '    x = a\n', '    x = 0\n', 'python'), 0, 'python').message).toMatch(/guess of 0/);
    expect(verdict('newton-sqrt', swap('newton-sqrt', '/ (2 * x)', '/ x', 'python'), 0, 'python').message).toMatch(/back and forth/);
  });

  it('jacobian-numeric: rows for columns, a forward difference, h for 2h, / 2 * h', () => {
    const exercise = getExercise('jacobian-numeric')!;
    expect(verdict('jacobian-numeric', exercise.starter.javascript).message).toMatch(/all zeros/);
    const transposed = swap('jacobian-numeric', 'J[i][0] =', 'J[0][i] =').replace('J[i][1] =', 'J[1][i] =');
    expect(verdict('jacobian-numeric', transposed).message).toMatch(/Rows and columns are swapped/);
    const forward = swap('jacobian-numeric', 'F(x - h, y)', 'F(x, y)').replace('F(x, y - h)', 'F(x, y)').split('/ (2 * h)').join('/ h');
    expect(verdict('jacobian-numeric', forward, 1).message).toMatch(/forward difference/);
    expect(verdict('jacobian-numeric', swap('jacobian-numeric', '/ (2 * h)', '/ h'), 2).message).toMatch(/twice too big/);
    expect(verdict('jacobian-numeric', swap('jacobian-numeric', '/ (2 * h)', '/ 2 * h'), 4).message).toMatch(/brackets/);
  });
});

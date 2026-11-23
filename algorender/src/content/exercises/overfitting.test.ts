// B7's overfitting exercises name the usual mistakes: each wrong answer below
// is a slip a learner really makes, and its verdict must say what it was. Most
// run in JavaScript; Python runs the solutions (which must agree with
// JavaScript to the last bit) and some of the slips.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { fitPoly, kFold, polyFeatures } from '@/algorithms/ml/overfitting';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { FEATURE_TESTS, featureRows, FOLD_TESTS, foldsOf, K_FOLD_CODE, type FeatureSlip, type FoldSlip } from './overfitting';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(slug: string, code: string, test = 0, language: Language = 'javascript'): RunResult {
  const exercise = getExercise(slug)!;
  const request = testRequest(exercise, language, code, exercise.tests[test].input);
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

function verdict(slug: string, code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(slug)!;
  return exercise.check(exercise.tests[test].input, run(slug, code, test, language));
}

const swap = (slug: string, from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(slug)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('the features are the visualiser’s, and every slip makes a different table', () => {
    for (const { input } of FEATURE_TESTS) expect(featureRows(input)).toEqual(polyFeatures(input.xs, input.degree));
    const input = FEATURE_TESTS[0].input;
    const slips: FeatureSlip[] = ['short', 'no-ones', 'from-one', 'times', 'unfilled', 'transposed'];
    const all = [featureRows(input), ...slips.map((s) => featureRows(input, s))].map((t) => JSON.stringify(t));
    expect(new Set(all).size).toBe(all.length);
    // The features fit a curve: degree 3 through four points is exact.
    const w = fitPoly(input.xs, [1, 2, 0, 5], 3);
    expect(featureRows(input).map((row) => row.reduce((s, x, j) => s + x * w[j], 0))).toEqual([1, 2, 0, 5].map((y) => expect.closeTo(y, 9)));
  });

  it('the folds are the visualiser’s, and every slip makes different folds', () => {
    for (const { input } of FOLD_TESTS) expect(foldsOf(input)).toEqual(kFold(input.n, input.k));
    expect(foldsOf({ n: 10, k: 4 })).toEqual([[0, 1, 2], [3, 4, 5], [6, 7], [8, 9]]);
    const slips: FoldSlip[] = ['drop-remainder', 'last-gets-rest', 'ceil', 'remainder-last', 'inclusive', 'no-advance', 'strided', 'training'];
    const all = [foldsOf({ n: 10, k: 4 }), ...slips.map((s) => foldsOf({ n: 10, k: 4 }, s))].map((f) => JSON.stringify(f));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('B7’s overfitting exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['poly-features', 'k-fold']) {
      const exercise = getExercise(slug)!;
      expect(exercise.visualiser).toBe('overfitting');
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.typescript, i, 'typescript'), `${slug} ${i} ts`).toMatchObject({ pass: true }));
    }
    expect(getExercise('k-fold')!.solution).toBe(K_FOLD_CODE);
  });

  it('poly-features: the column of 1s, the number of columns, the power, the shape', () => {
    const slug = 'poly-features';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/X is 1×1/);
    const noOnes = swap(slug, 'table(xs.length, degree + 1)', 'table(xs.length, degree)').replace('xs[i] ** j', 'xs[i] ** (j + 1)').replace('j <= degree', 'j < degree');
    expect(verdict(slug, noOnes).message).toMatch(/column of 1s/);
    expect(verdict(slug, swap(slug, 'table(xs.length, degree + 1)', 'table(xs.length, degree)').replace('j <= degree', 'j < degree')).message).toMatch(/one short/);
    expect(verdict(slug, swap(slug, 'xs[i] ** j', 'xs[i] ** (j + 1)')).message).toMatch(/one too high/);
    expect(verdict(slug, swap(slug, 'xs[i] ** j', 'xs[i] * j')).message).toMatch(/x × j/);
    expect(verdict(slug, swap(slug, 'j <= degree', 'j < degree')).message).toMatch(/last column, x\^3, is still 0/);
    const sideways = swap(slug, 'table(xs.length, degree + 1)', 'table(degree + 1, xs.length)').replace('X[i][j] = ', 'X[j][i] = ');
    expect(verdict(slug, sideways).message).toMatch(/on its side/);
    expect(verdict(slug, swap(slug, 'return X;', 'return null;')).message).toMatch(/now return X/);
    // Any way of making the powers passes: x multiplied in, column by column.
    const multiplied = swap(slug, 'X[i][j] = xs[i] ** j;', 'X[i][j] = j === 0 ? 1 : X[i][j - 1] * xs[i];');
    FEATURE_TESTS.forEach((_, i) => expect(verdict(slug, multiplied, i)).toMatchObject({ pass: true }));
  });

  it('k-fold: the remainder, the fold sizes, the boundaries, the order, training sets, the marks', () => {
    const slug = 'k-fold';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/folds is empty/);
    expect(verdict(slug, swap(slug, '    if (f < n % k) {\n      size = size + 1;\n    }\n', '')).message).toMatch(/leaves 2 over, and your folds leave out the last 2 indices/);
    expect(verdict(slug, swap(slug, '    if (f < n % k) {\n      size = size + 1;\n    }\n', '    if (f === k - 1) {\n      size = n - start;\n    }\n')).message).toMatch(/the last one took all 2 extras/);
    expect(verdict(slug, swap(slug, 'let size = Math.floor(n / k);\n    if (f < n % k) {\n      size = size + 1;\n    }', 'let size = Math.min(Math.ceil(n / k), n - start);')).message).toMatch(/each took ⌈10\/4⌉ = 3/);
    expect(verdict(slug, swap(slug, 'if (f < n % k)', 'if (f >= k - n % k)')).message).toMatch(/extras went to the last folds/);
    expect(verdict(slug, swap(slug, 'i < start + size;', 'i <= start + size;')).message).toMatch(/out of range[\s\S]*not including it/);
    expect(verdict(slug, swap(slug, 'i < start + size;', 'i <= start + size && i < n;')).message).toMatch(/share an index/);
    expect(verdict(slug, swap(slug, '    start = start + size;\n', '')).message).toMatch(/starts at index 0/);
    const strided = swap(slug, '    for (let i = start; i < start + size; i++) {', '    for (let i = f; i < n; i += k) {');
    expect(verdict(slug, strided).message).toMatch(/not consecutive/);
    const training = swap(slug, '    for (let i = start; i < start + size; i++) {\n      fold.push(i);\n      scored[f][i] = 1;\n    }', '    for (let i = 0; i < n; i++) {\n      if (i < start || i >= start + size) fold.push(i);\n      else scored[f][i] = 1;\n    }');
    expect(verdict(slug, training).message).toMatch(/training indices/);
    expect(verdict(slug, swap(slug, '      scored[f][i] = 1;\n', '')).message).toMatch(/scored is still all 0/);
    expect(verdict(slug, swap(slug, 'scored[f][i] = 1;', 'scored[0][i] = 1;')).message).toMatch(/row 0 of scored should have a 1 exactly at fold 0’s indices/);
    expect(verdict(slug, swap(slug, 'folds.push(fold);', 'folds.push(...fold);')).message).toMatch(/a list of k lists/);
  });

  it('in Python: the same numbers to the last bit, and the same slips named', () => {
    for (const slug of ['poly-features', 'k-fold']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => {
        const py = run(slug, exercise.solution.python, i, 'python');
        expect(exercise.check(exercise.tests[i].input, py), `${slug} ${i}`).toMatchObject({ pass: true });
        const js = run(slug, exercise.solution.javascript, i);
        expect(py.returned).toEqual(js.returned);
        expect(Object.values(py.grids ?? {})).toEqual(Object.values(js.grids ?? {}));
      });
    }
    const py = (slug: string, from: string, to: string, test = 0) => verdict(slug, swap(slug, from, to, 'python'), test, 'python').message;
    expect(py('poly-features', 'xs[i] ** j', 'xs[i] * j')).toMatch(/x × j/);
    expect(py('poly-features', 'range(degree + 1)', 'range(degree)')).toMatch(/last column, x\^3, is still 0/);
    expect(py('k-fold', '        if f < n % k:\n            size = size + 1\n', '')).toMatch(/leave out the last 2 indices/);
    expect(py('k-fold', 'range(start, start + size)', 'range(start, start + size + 1)')).toMatch(/out of range/);
    expect(py('k-fold', '        start = start + size\n', '')).toMatch(/starts at index 0/);
  });
});

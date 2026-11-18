// B3's exercises name the usual mistakes: each wrong answer below is a slip a
// learner really makes, and its verdict must say what it was. The project's
// parts run judged, so these run the way the workspace judges them.

import { describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { getExercise, testRequest } from '.';
import { gauss, lstsqOf, rankOf } from './least-squares';

function verdict(slug: string, code: string, test = 0) {
  const exercise = getExercise(slug)!;
  const input = exercise.tests[test].input;
  return exercise.check(input, runJs(testRequest(exercise, 'javascript', code, input)));
}

const swap = (slug: string, from: string, to: string) => {
  const code = getExercise(slug)!.solution.javascript;
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('solves, ranks and fits', () => {
    expect(gauss([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([2, 3, -1]);
    expect(rankOf([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(2);
    // Rounding leaves a crumb where a 0 belongs, so an exact test counts a third pivot.
    expect(rankOf([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 0)).toBe(3);
    expect(lstsqOf([[1, 0], [1, 1], [1, 2], [1, 3]], [1, 2, 2, 4]).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0.9, 0.9]);
  });
});

describe('B3’s exercises explain the usual mistakes', () => {
  it('normal-equations: XXᵀ for XᵀX, and replacing instead of adding', () => {
    expect(verdict('normal-equations', swap('normal-equations', 'return [matmul(Xt, X), matvec(Xt, y)];', 'return [matmul(X, Xt), matvec(Xt, y)];')).message).toMatch(/XXᵀ/);
    expect(verdict('normal-equations', swap('normal-equations', 'C[i][j] = C[i][j] + A[i][k] * B[k][j];', 'C[i][j] = A[i][k] * B[k][j];'), 1).message).toMatch(/last product/);
    expect(verdict('normal-equations', getExercise('normal-equations')!.starter.javascript).message).toMatch(/all zeros/);
  });

  it('solve-system: a zero pivot, and b’s column left alone', () => {
    const noSwap = getExercise('zero-pivot')!.starter.javascript;
    expect(verdict('solve-system', noSwap, 2).message).toMatch(/pivot/);
    expect(verdict('solve-system', swap('solve-system', 'for (let c = k; c <= n; c++) {', 'for (let c = k; c < n; c++) {'), 1).message).toMatch(/right-hand side/);
    expect(verdict('solve-system', swap('solve-system', 'x[i] = s / M[i][i];', 'x[i] = s;'), 1).message).toMatch(/Back substitution/);
  });

  it('zero-pivot: the starter divides by zero, in Python as in JavaScript', () => {
    expect(verdict('zero-pivot', getExercise('zero-pivot')!.starter.javascript, 1).message).toMatch(/pivot/);
    expect(verdict('zero-pivot', getExercise('zero-pivot')!.solution.javascript, 1).pass).toBe(true);
  });

  it('matrix-rank: an exact test for 0, and no elimination', () => {
    expect(verdict('matrix-rank', swap('matrix-rank', 'if (Math.abs(M[p][c]) < 1e-9) {', 'if (M[p][c] === 0) {'), 2).message).toMatch(/rounding/);
    const noElimination = swap('matrix-rank', 'M[i][j] = M[i][j] - f * M[r][j];', 'M[i][j] = M[i][j];');
    expect(verdict('matrix-rank', noElimination, 1).message).toMatch(/mix of the others|as big as a rank/);
  });

  it('basis-coords: P·v for P⁻¹v, swapped coordinates, and no division', () => {
    const forward = swap('basis-coords', 'c[0] = (v[0] * b2[1] - b2[0] * v[1]) / det;', 'c[0] = v[0] * b1[0] + v[1] * b2[0];').replace('c[1] = (b1[0] * v[1] - v[0] * b1[1]) / det;', 'c[1] = v[0] * b1[1] + v[1] * b2[1];');
    expect(verdict('basis-coords', forward, 2).message).toMatch(/P·v/);
    const swapped = swap('basis-coords', 'c[0] = (v[0]', 'c[9] = (v[0]').replace('c[1] = (b1', 'c[0] = (b1').replace('c[9] = (v[0]', 'c[1] = (v[0]');
    expect(verdict('basis-coords', swapped, 3).message).toMatch(/swapped/);
    expect(verdict('basis-coords', swap('basis-coords', ') / det;', ');'), 2).message).toMatch(/divide both by det/);
  });

  it('mean-squared-error: unsquared errors cancel, no mean, a square root', () => {
    expect(verdict('mean-squared-error', swap('mean-squared-error', 'sq[i] = e * e;', 'sq[i] = e;'), 1).message).toMatch(/cancelled/);
    expect(verdict('mean-squared-error', swap('mean-squared-error', 'return total / n;', 'return total;'), 2).message).toMatch(/divide by the number of points/);
    expect(verdict('mean-squared-error', swap('mean-squared-error', 'return total / n;', 'return Math.sqrt(total / n);'), 2).message).toMatch(/RMSE/);
  });

  it('least-squares-fit: the starter’s zeros fail with the residual test', () => {
    expect(verdict('least-squares-fit', getExercise('least-squares-fit')!.starter.javascript, 1).message).toMatch(/right angles/);
  });

  it('fit-curves: no column of 1s', () => {
    const noOnes = swap('fit-curves', 'const X = table(xs.length, degree + 1);', 'const X = table(xs.length, degree);').replace('for (let j = 0; j <= degree; j++) {\n      X[i][j] = xs[i] ** j;', 'for (let j = 0; j < degree; j++) {\n      X[i][j] = xs[i] ** (j + 1);');
    expect(verdict('fit-curves', noOnes, 2).message).toMatch(/column is all 1s/);
  });
});

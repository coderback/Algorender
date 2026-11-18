// The linear algebra exercises name the usual mistakes: each wrong answer
// below is a slip a learner really makes, and its verdict must say what it was.

import { describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { getExercise, testRequest } from '.';

function verdict(slug: string, code: string, test = 0) {
  const exercise = getExercise(slug)!;
  const input = exercise.tests[test].input;
  return exercise.check(input, runJs(testRequest(exercise, 'javascript', code, input)));
}

const swap = (slug: string, from: string, to: string) => {
  const code = getExercise(slug)!.solution.javascript;
  expect(code).toContain(from);
  return code.replace(from, to);
};

describe('the linear algebra exercises explain the usual mistakes', () => {
  it('vector-walk: the starter, a length without its square root, and a scale that ignores k', () => {
    expect(verdict('vector-walk', getExercise('vector-walk')!.starter.javascript).message).toMatch(/placeholder/);
    expect(verdict('vector-walk', swap('vector-walk', 'return Math.sqrt(v[0] * v[0] + v[1] * v[1]);', 'return v[0] * v[0] + v[1] * v[1];')).message).toMatch(/square root/);
    expect(verdict('vector-walk', swap('vector-walk', 'return [k * v[0], k * v[1]];', 'return [v[0], v[1]];')).message).toMatch(/at speed 1/);
  });

  it('nearest-vector: dot products for scores, and the longest vector picked', () => {
    expect(verdict('nearest-vector', swap('nearest-vector', 'return dot(u, v) / (Math.sqrt(dot(u, u)) * Math.sqrt(dot(v, v)));', 'return dot(u, v);'), 1).message).toMatch(/dot products/);
    const longest = swap('nearest-vector', 'return best;', 'return 1;');
    expect(verdict('nearest-vector', longest, 1).message).toMatch(/biggest dot product/);
  });

  it('three-distances: signed gaps cancel, a missing square root, and the smallest gap for L∞', () => {
    expect(verdict('three-distances', swap('three-distances', 'Math.abs(a[i] - b[i])', '(a[i] - b[i])'), 2).message).toMatch(/cancelled/);
    expect(verdict('three-distances', swap('three-distances', 'out[1] = Math.sqrt(l2);', 'out[1] = l2;')).message).toMatch(/square root/);
    const smallest = swap('three-distances', 'let linf = 0;', 'let linf = Infinity;').replace('Math.max(linf, d)', 'Math.min(linf, d)');
    expect(verdict('three-distances', smallest).message).toMatch(/smallest gap/);
  });

  it('matrix-multiply: replacing instead of adding, BA for AB, and the wrong shape', () => {
    expect(verdict('matrix-multiply', swap('matrix-multiply', 'C[i][j] = C[i][j] + A[i][k] * B[k][j];', 'C[i][j] = A[i][k] * B[k][j];')).message).toMatch(/last product/);
    expect(verdict('matrix-multiply', swap('matrix-multiply', 'C[i][j] + A[i][k] * B[k][j]', 'C[i][j] + B[i][k] * A[k][j]'), 1).message).toMatch(/BA, not AB/);
    expect(verdict('matrix-multiply', swap('matrix-multiply', 'const C = table(m, p);', 'const C = table(n, n);')).message).toMatch(/gives 2×2/);
  });
});

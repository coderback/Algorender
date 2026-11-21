// B5's integral exercises name the usual mistakes: each wrong answer below is a
// slip a learner really makes, and its verdict must say what it was. Most run
// in JavaScript; Python is checked for the slips whose errors read differently
// there (a loop past the end of the heights).

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { riemannSum, trapezoidSum as moduleTrapezoid, speed } from '@/algorithms/calculus/integral';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { edgeHeights, exactArea, midpointSum, trapezoidSum, type StripInput } from './integrals';

let runPython: ((json: string) => string) | null = null;

function verdict(slug: string, code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(slug)!;
  const input = exercise.tests[test].input;
  const request = testRequest(exercise, language, code, input);
  const result: RunResult = language === 'python' ? JSON.parse(runPython!(JSON.stringify(request))) : runJs(request);
  return exercise.check(input, result);
}

const swap = (slug: string, from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(slug)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('matches the visualiser’s sums, and closes in on the exact area', () => {
    const inputs: StripInput[] = [
      { a: 0, b: 3, n: 2 },
      { a: 1, b: 3, n: 4 },
      { a: -2, b: 2, n: 8 },
      { a: 2, b: 5, n: 16 },
    ];
    for (const input of inputs) {
      const { a, b, n } = input;
      expect(midpointSum(input)).toBe(riemannSum(speed, a, b, n, 'mid'));
      expect(trapezoidSum(input)).toBe(moduleTrapezoid(speed, a, b, n));
      expect(edgeHeights(input)).toHaveLength(n + 1);
      // A parabola's middle sum falls short by (b − a)³/(12n²); the trapezoids overshoot by twice that.
      expect(exactArea(a, b) - midpointSum(input)).toBeCloseTo((b - a) ** 3 / (12 * n * n), 12);
      expect(trapezoidSum(input) - exactArea(a, b)).toBeCloseTo((b - a) ** 3 / (6 * n * n), 12);
    }
    // The car: 9 m in 3 s; 2 middle strips give 8.4375, 2 trapezoids 10.125.
    expect([exactArea(0, 3), midpointSum({ a: 0, b: 3, n: 2 }), trapezoidSum({ a: 0, b: 3, n: 2 })]).toEqual([9, 8.4375, 10.125]);
  });
});

describe('B5’s integral exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['riemann-sum', 'trapezoid-rule']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
    }
  });

  it('riemann-sum: left ends, right ends, the whole width, no / n, no × width, n + 1 strips, no a, half a unit', () => {
    const exercise = getExercise('riemann-sum')!;
    expect(verdict('riemann-sum', exercise.starter.javascript).message).toMatch(/still 0/);
    const mid = 'const x = a + (i + 0.5) * width;';
    expect(verdict('riemann-sum', swap('riemann-sum', mid, 'const x = a + i * width;')).message).toMatch(/left-end sum/);
    expect(verdict('riemann-sum', swap('riemann-sum', mid, 'const x = a + (i + 1) * width;')).message).toMatch(/right-end sum/);
    expect(verdict('riemann-sum', swap('riemann-sum', 'const width = (b - a) / n;', 'const width = b - a;')).message).toMatch(/whole interval/);
    expect(verdict('riemann-sum', swap('riemann-sum', 'return total * width;', 'return total * (b - a);'), 1).message).toMatch(/8 times too big/);
    expect(verdict('riemann-sum', swap('riemann-sum', 'return total * width;', 'return total;')).message).toMatch(/total of the heights/);
    expect(verdict('riemann-sum', swap('riemann-sum', 'i < n;', 'i <= n;')).message).toMatch(/one step too far/);
    expect(verdict('riemann-sum', swap('riemann-sum', mid, 'const x = (i + 0.5) * width;'), 2).message).toMatch(/start at 0, not at a/);
    expect(verdict('riemann-sum', swap('riemann-sum', mid, 'const x = a + i * width + 0.5;')).message).toMatch(/half a unit/);
    // The right area with the heights left out of the array.
    const noHeights = swap('riemann-sum', 'heights[i] = f(x);\n    total = total + heights[i];', 'total = total + f(x);');
    expect(verdict('riemann-sum', noHeights).message).toMatch(/heights should hold/);
  });

  it('trapezoid-rule: ends in full, every height halved, the last edge missing, left ends, the whole width, no × width', () => {
    const exercise = getExercise('trapezoid-rule')!;
    expect(verdict('trapezoid-rule', exercise.starter.javascript).message).toMatch(/still 0/);
    const halves = 'let total = (heights[0] + heights[n]) / 2;';
    expect(verdict('trapezoid-rule', swap('trapezoid-rule', halves, 'let total = heights[0] + heights[n];')).message).toMatch(/end edges.*count only half/);
    const allHalved = swap('trapezoid-rule', 'total = total + heights[i];', 'total = total + heights[i] / 2;');
    expect(verdict('trapezoid-rule', allHalved).message).toMatch(/halved every height/);
    expect(verdict('trapezoid-rule', swap('trapezoid-rule', 'i <= n;', 'i < n;')).message).toMatch(/heights\[2\] is still 0/);
    expect(verdict('trapezoid-rule', swap('trapezoid-rule', 'i <= n;', 'i <= n + 1;')).message).toMatch(/past the last edge/);
    const leftSum = swap('trapezoid-rule', halves, 'let total = heights[0];');
    expect(verdict('trapezoid-rule', leftSum, 2).message).toMatch(/left-end sum/);
    expect(verdict('trapezoid-rule', swap('trapezoid-rule', 'const width = (b - a) / n;', 'const width = b - a;')).message).toMatch(/whole interval/);
    expect(verdict('trapezoid-rule', swap('trapezoid-rule', 'return total * width;', 'return total;')).message).toMatch(/before multiplying by the width/);
  });

  describe('in Python', () => {
    beforeAll(async () => {
      const py = await loadPyodide();
      py.runPython(HARNESS);
      runPython = py.globals.get('run_request');
    }, 120_000);

    it('passes, and names a loop past the end and the ends counted in full', () => {
      for (const slug of ['riemann-sum', 'trapezoid-rule']) expect(verdict(slug, getExercise(slug)!.solution.python, 3, 'python'), slug).toMatchObject({ pass: true });
      expect(verdict('riemann-sum', swap('riemann-sum', 'for i in range(n):', 'for i in range(n + 1):', 'python'), 0, 'python').message).toMatch(/one step too far/);
      expect(verdict('riemann-sum', swap('riemann-sum', 'x = a + (i + 0.5) * width', 'x = a + i * width', 'python'), 0, 'python').message).toMatch(/left-end sum/);
      expect(verdict('trapezoid-rule', swap('trapezoid-rule', 'for i in range(n + 1):', 'for i in range(n + 2):', 'python'), 0, 'python').message).toMatch(/past the last edge/);
      expect(verdict('trapezoid-rule', swap('trapezoid-rule', 'total = (heights[0] + heights[n]) / 2', 'total = heights[0] + heights[n]', 'python'), 0, 'python').message).toMatch(/count only half/);
    });
  });
});

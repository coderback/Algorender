// B5's dice exercises name the usual mistakes: each wrong answer below is a
// slip a learner really makes when counting outcomes, and its verdict must say
// what it was. Most run in JavaScript; the loop slips also run in Python,
// where range() is where they happen.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { count, sumAtLeast, sumIs } from '@/algorithms/probability/two-dice';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { countSums, SUM_BOARD, sumChance } from './chance';

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
  it('counts like the two-dice board', () => {
    for (let t = 0; t <= 14; t++) {
      expect(countSums(t, 'exactly'), `sum ${t}`).toBe(count(sumIs(t).test));
      expect(countSums(t, 'at least'), `at least ${t}`).toBe(count(sumAtLeast(t).test));
      expect(countSums(t, 'more than')).toBe(count(sumAtLeast(t + 1).test));
    }
    expect([sumChance(7), sumChance(10, 'at least'), sumChance(13), sumChance(2, 'at least')]).toEqual([6 / 36, 6 / 36, 0, 1]);
    expect(SUM_BOARD[1][4]).toBe(7);
    expect(countSums(7, 'exactly', { ordered: false })).toBe(3);
  });
});

describe('B5’s dice exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['dice-sum-chance', 'dice-at-least']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
    }
  });

  it('dice-sum-chance: an empty board, one order per pair, faces 0 to 5 or 1 to 5, and the wrong division', () => {
    const slug = 'dice-sum-chance';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/still 0/);
    expect(verdict(slug, swap(slug, 'for (let b = 1; b <= 6; b++)', 'for (let b = a; b <= 6; b++)')).message).toMatch(/never \(5, 2\)/);
    const zeroToFive = swap(slug, 'for (let a = 1; a <= 6; a++)', 'for (let a = 0; a < 6; a++)')
      .replace('for (let b = 1; b <= 6; b++)', 'for (let b = 0; b < 6; b++)')
      .replace('board[a - 1][b - 1]', 'board[a][b]');
    expect(verdict(slug, zeroToFive).message).toMatch(/dice show 0 to 5/);
    const oneToFive = swap(slug, 'a <= 6', 'a < 6').replace('b <= 6', 'b < 6');
    expect(verdict(slug, oneToFive).message).toMatch(/stop at 5/);
    expect(verdict(slug, swap(slug, 'return count / 36;', 'return count / 12;')).message).toMatch(/divided by 12/);
    expect(verdict(slug, swap(slug, 'return count / 36;', 'return count / 11;')).message).toMatch(/divided by 11/);
    expect(verdict(slug, swap(slug, 'return count / 36;', 'return count;')).message).toMatch(/returned the count/);
    expect(verdict(slug, swap(slug, 'a + b === target', 'a + b >= target'), 2).message).toMatch(/at least 10/);
    // Counting only a ≤ b, with the whole board filled, is named too.
    const halfCount = swap(slug, 'if (a + b === target) {', 'if (a + b === target && a <= b) {');
    expect(verdict(slug, halfCount).message).toMatch(/\(a, b\) and \(b, a\) as one/);
    // Any other wrong cell is named, with what it should hold.
    expect(verdict(slug, swap(slug, 'board[a - 1][b - 1] = a + b;', 'board[a - 1][b - 1] = a * b;')).message).toMatch(/board\[0\]\[0\] is the outcome a = 1, b = 1, so it should hold 2/);
  });

  it('dice-sum-chance in Python: range(6), range(1, 6) and range(a, 7)', () => {
    const slug = 'dice-sum-chance';
    const zeroToFive = swap(slug, 'range(1, 7)', 'range(6)', 'python').replace('board[a - 1][b - 1]', 'board[a][b]');
    expect(verdict(slug, zeroToFive, 0, 'python').message).toMatch(/dice show 0 to 5/);
    expect(verdict(slug, swap(slug, 'range(1, 7)', 'range(1, 6)', 'python'), 0, 'python').message).toMatch(/stop at 5/);
    expect(verdict(slug, swap(slug, 'for b in range(1, 7)', 'for b in range(a, 7)', 'python'), 0, 'python').message).toMatch(/never \(5, 2\)/);
    expect(verdict(slug, swap(slug, 'count / 36', 'count / 12', 'python'), 0, 'python').message).toMatch(/divided by 12/);
  });

  it('dice-at-least: unchanged, “more than”, and both when they coincide', () => {
    const slug = 'dice-at-least';
    expect(verdict(slug, getExercise(slug)!.starter.javascript, 1).message).toMatch(/still the chance of exactly 7/);
    expect(verdict(slug, swap(slug, 'a + b >= target', 'a + b > target'), 1).message).toMatch(/more than 7, 15 cells/);
    // At 10, exactly 10 and more than 10 are both 3 cells.
    expect(verdict(slug, swap(slug, 'a + b >= target', 'a + b > target'), 0).message).toMatch(/happen to be the same 3 cells/);
    expect(verdict(slug, swap(slug, 'a + b >= target', 'a + b > target', 'python'), 1, 'python').message).toMatch(/more than 7/);
  });
});

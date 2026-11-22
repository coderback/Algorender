// B6's permutation-test exercise names the usual mistakes: each wrong answer
// below is a slip a learner really makes, and its verdict must say what it
// was. Most run in JavaScript; Python runs the solution (which must agree with
// JavaScript to the last bit) and the slips that are written differently there.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { exactTest, shuffleTest } from '@/algorithms/probability/permutation-test';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { FLASHCARD_SCORES, permutationReference, type PermInput, type Slip } from './permutation-test';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

const SLUG = 'permutation-test';
const exercise = getExercise(SLUG)!;

function run(code: string, test = 0, language: Language = 'javascript'): RunResult {
  const request = testRequest(exercise, language, code, exercise.tests[test].input);
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}
const verdict = (code: string, test = 0, language: Language = 'javascript') => exercise.check(exercise.tests[test].input, run(code, test, language));
const swap = (from: string, to: string, language: Language = 'javascript') => {
  const code = exercise.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};
const input = (test: number) => exercise.tests[test].input as PermInput;

describe('the reference maths', () => {
  it('is the visualiser’s test, shuffle for shuffle', () => {
    const want = permutationReference(input(0));
    const shown = shuffleTest(FLASHCARD_SCORES.a, FLASHCARD_SCORES.b, 1000, 7);
    expect(want.diffs).toEqual(shown.diffs);
    expect([want.observed, want.extreme, want.p]).toEqual([10, 42, 0.042]);
    // 1,000 shuffles land near the exact p over all 12,870 splits.
    expect(Math.abs(want.p - exactTest(FLASHCARD_SCORES.a, FLASHCARD_SCORES.b).p)).toBeLessThan(0.01);
    // Pooling afresh each time is another, equally good stream of shuffles.
    expect(permutationReference(input(0), 'fresh').p).not.toBe(want.p);
    // No gap: every shuffle is at least as extreme as 0.
    expect(permutationReference(input(3)).p).toBe(1);
    // Two against two: only the split {1, 2} | {3, 4} and its mirror reach |d| = 2, 2 of 6 splits.
    expect(Math.abs(permutationReference(input(4)).p - 1 / 3)).toBeLessThan(0.15);
  });

  it('every slip gives a different p on the test that names it', () => {
    const where: [Slip, number][] = [
      ['one-sided', 0],
      ['right-tail', 0],
      ['strict', 0],
      ['sattolo', 0],
      ['frozen', 0],
      ['before', 0],
      ['sums', 1],
      ['one-sided', 2],
      ['no-abs-observed', 2],
    ];
    for (const [slip, test] of where) expect(permutationReference(input(test), slip).p, `${slip} on test ${test}`).not.toBe(permutationReference(input(test)).p);
    // Ties with the real difference happen: > and ≥ differ.
    const ties = permutationReference(input(0)).diffs.filter((d) => Math.abs(d) === 10).length;
    expect(ties).toBeGreaterThan(0);
    // Totals give the same p as means when the groups are the same size.
    expect(permutationReference(input(0), 'sums').p).toBe(permutationReference(input(0)).p);
  });
});

describe('the permutation test explains the usual mistakes', () => {
  it('every solution passes every test', () => {
    expect(exercise.visualiser).toBe('permutation-test');
    exercise.tests.forEach((_, i) => expect(verdict(exercise.solution.javascript, i), `test ${i}`).toMatchObject({ pass: true }));
    exercise.tests.forEach((_, i) => expect(verdict(exercise.solution.typescript, i, 'typescript'), `test ${i} ts`).toMatchObject({ pass: true }));
    expect(verdict(exercise.solution.javascript, 0).message).toContain('42 of 1,000 shuffles from seed 7');
  });

  it('accepts a fresh pool before every shuffle', () => {
    const fresh = swap('  const pool = a.concat(b);\n', '').replace('  for (let s = 0; s < shuffles; s++) {\n', '  for (let s = 0; s < shuffles; s++) {\n    const pool = a.concat(b);\n');
    const v = verdict(fresh, 0);
    expect(v.pass).toBe(true);
    expect(v.message).toMatch(/afresh/);
  });

  it('names one side, >, and a sign kept', () => {
    const cmp = 'Math.abs(d) >= Math.abs(observed)';
    expect(verdict(swap(cmp, 'd >= observed'), 0).message).toMatch(/one side only/);
    expect(verdict(swap(cmp, 'd >= Math.abs(observed)'), 0).message).toMatch(/one side only/);
    expect(verdict(swap(cmp, 'd >= observed'), 2).message).toMatch(/one side only/);
    expect(verdict(swap(cmp, 'Math.abs(d) >= observed'), 2).message).toMatch(/below 0.*abs\(d\) >= abs\(observed\)/);
    expect(verdict(swap(cmp, 'Math.abs(d) > Math.abs(observed)'), 0).message).toMatch(/with >.*use >=/);
  });

  it('names j = ⌊u·i⌋, a frozen generator, and u read before the step', () => {
    expect(verdict(swap('Math.floor(u * (i + 1))', 'Math.floor(u * i)'), 0).message).toMatch(/never picks i itself/);
    const frozen = swap('state = nextState(state);\n      const u = state / 2147483647;', 'const u = nextState(state) / 2147483647;');
    expect(verdict(frozen, 0).message).toMatch(/never moved on/);
    const before = swap('state = nextState(state);\n      const u = state / 2147483647;', 'const u = state / 2147483647;\n      state = nextState(state);');
    expect(verdict(before, 0).message).toMatch(/before stepping/);
  });

  it('names totals for means, and means from a and b', () => {
    const totals = swap('return total / xs.length;', 'return total;');
    expect(verdict(totals, 1).message).toMatch(/totals, not means/);
    // Equal groups: totals are 8 times the means, so p is right but the differences are not.
    expect(verdict(totals, 0).message).toMatch(/p is right.*differences of totals/);
    const unpooled = swap('mean(pool.slice(0, a.length)) - mean(pool.slice(a.length))', 'mean(a) - mean(b)');
    expect(verdict(unpooled, 0).message).toMatch(/not from the shuffled pool/);
  });

  it('names a count for a share, 1 − p, and an empty or short diffs', () => {
    expect(verdict(swap('return extreme / shuffles;', 'return extreme;'), 0).message).toMatch(/number of extreme shuffles/);
    expect(verdict(swap('return extreme / shuffles;', 'return 1 - extreme / shuffles;'), 0).message).toMatch(/1 − p/);
    expect(verdict(swap('    diffs.push(d);\n', ''), 0).message).toMatch(/diffs is empty/);
    expect(verdict(swap('    diffs.push(d);\n', '    if (s > 0) diffs.push(d);\n'), 0).message).toMatch(/holds 999 differences/);
    expect(verdict(exercise.starter.javascript, 0).message).toMatch(/You returned 0 and diffs is still empty/);
  });

  it('in Python: the same numbers to the last bit, and the same slips named', () => {
    exercise.tests.forEach((_, i) => {
      const py = run(exercise.solution.python, i, 'python');
      expect(exercise.check(exercise.tests[i].input, py), `test ${i}`).toMatchObject({ pass: true });
      const js = run(exercise.solution.javascript, i);
      expect(py.returned).toBe(js.returned);
      const values = (r: RunResult) => r.events.filter((e) => e.kind === 'append').map((e) => (e.kind === 'append' ? e.value : 0));
      expect(values(py)).toEqual(values(js));
    });
    const py = (from: string, to: string, test = 0) => verdict(swap(from, to, 'python'), test, 'python').message;
    expect(py('int(u * (i + 1))', 'int(u * i)')).toMatch(/never picks i itself/);
    expect(py('abs(d) >= abs(observed)', 'd >= observed')).toMatch(/one side only/);
    expect(py('abs(d) >= abs(observed)', 'abs(d) > abs(observed)')).toMatch(/use >=/);
    expect(py('    return total / len(xs)\n', '    return total\n', 1)).toMatch(/totals, not means/);
    expect(py('state = next_state(state)\n            u = state / 2147483647', 'u = next_state(state) / 2147483647')).toMatch(/never moved on/);
  });
});

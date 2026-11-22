// B6's bootstrap and standard-error exercises name the usual mistakes: each
// wrong answer below is a slip a learner really makes, and its verdict must say
// what it was. Most run in JavaScript; Python runs the solutions (which must
// agree with JavaScript to the last bit) and some of the slips.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRun, firstSample, interval, middle } from '@/algorithms/probability/confidence-intervals';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { bootstrapCi, bootstrapMeans, dropOf, LESSON_ROLLS, middle95, ROLLS_SEED_7, standardErrorOf, WAITS, type BootInput } from './bootstrap';

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
  it('matches the visualiser: its rolls, its standard error and its middle 95%', () => {
    expect(ROLLS_SEED_7).toEqual(firstSample(7).sample);
    expect(LESSON_ROLLS).toEqual(firstSample(4).sample);
    expect(bootstrapCi({ data: LESSON_ROLLS, resamples: 400, seed: 7 })).toEqual([3.64, 4.92]);
    const se = standardErrorOf(ROLLS_SEED_7);
    const iv = interval(ROLLS_SEED_7);
    expect(se.mean).toBeCloseTo(iv.xbar, 12);
    expect(se.se).toBeCloseTo(iv.se, 12);
    const { means } = bootstrapRun(7);
    expect(middle95(means)).toEqual([middle(means).lo, middle(means).hi]);
    expect(dropOf(1000)).toBe(25);
    expect(dropOf(40)).toBe(1);
  });

  it('draws with replacement, every value can be picked, and the slips really differ', () => {
    const input: BootInput = { data: [3, 7, 8, 12, 5, 9, 15, 6], resamples: 40, seed: 1 };
    const kinds = ['right', 'n-minus-1', 'frozen', 'restart', 'before', 'no-reset'] as const;
    const all = kinds.map((how) => JSON.stringify(bootstrapMeans(input, how)));
    expect(new Set(all).size).toBe(kinds.length);
    // Over many picks every index comes up, the last one included.
    const big = bootstrapMeans({ data: [0, 0, 0, 0, 1], resamples: 400, seed: 5 });
    expect(Math.max(...big)).toBeGreaterThan(0);
    expect(bootstrapMeans({ data: [0, 0, 0, 0, 1], resamples: 400, seed: 5 }, 'n-minus-1').every((m) => m === 0)).toBe(true);
    // Frozen picks are all one value; restarted resamples all one average.
    expect(new Set(bootstrapMeans(input, 'frozen')).size).toBe(1);
    expect(new Set(bootstrapMeans(input, 'restart')).size).toBe(1);
    // The waits' averages straddle 10, so sorting them as text goes wrong.
    const waits = bootstrapMeans({ data: WAITS, resamples: 200, seed: 2026 });
    expect(Math.min(...waits)).toBeLessThan(10);
    expect(Math.max(...waits)).toBeGreaterThan(10);
    const k = dropOf(200);
    const text = [...waits].sort();
    expect([text[k], text[199 - k]]).not.toEqual(bootstrapCi({ data: WAITS, resamples: 200, seed: 2026 }));
    // Two values: averages are multiples of 1/2, and the interval sits inside [0, 1].
    const [lo, hi] = bootstrapCi({ data: [0, 1], resamples: 80, seed: 42 });
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(standardErrorOf([2, 4, 4, 4, 5, 5, 7, 9]).s).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });
});

describe('B6’s bootstrap exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['bootstrap-ci', 'standard-error']) {
      const exercise = getExercise(slug)!;
      expect(exercise.visualiser).toBe('confidence-intervals');
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.typescript, i, 'typescript'), `${slug} ${i} ts`).toMatchObject({ pass: true }));
    }
  });

  it('bootstrap-ci: without replacement, n − 1, the state, the total', () => {
    const slug = 'bootstrap-ci';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/means is empty/);
    const pick = 'total = total + data[Math.floor(u * n)];';
    expect(verdict(slug, swap(slug, pick, 'total = total + data[i];')).message).toMatch(/without replacement/);
    expect(verdict(slug, swap(slug, pick, 'total = total + data[Math.floor(u * (n - 1))];')).message).toMatch(/never picked/);
    expect(verdict(slug, swap(slug, 'state = (16807 * state) % 2147483647;\n      const u = state / 2147483647;', 'const u = ((16807 * state) % 2147483647) / 2147483647;')).message).toMatch(/never kept/);
    expect(verdict(slug, swap(slug, '    let total = 0;\n', '    let total = 0;\n    state = seed;\n')).message).toMatch(/back to the seed/);
    expect(verdict(slug, swap(slug, 'state = (16807 * state) % 2147483647;\n      const u = state / 2147483647;', 'const u = state / 2147483647;\n      state = (16807 * state) % 2147483647;')).message).toMatch(/before stepping/);
    const noReset = swap(slug, '  for (let r = 0; r < resamples; r++) {\n    let total = 0;', '  let total = 0;\n  for (let r = 0; r < resamples; r++) {');
    expect(verdict(slug, noReset).message).toMatch(/keep growing/);
    expect(verdict(slug, swap(slug, 'means.push(total / n);', 'means.push(total);')).message).toMatch(/totals/);
    expect(verdict(slug, swap(slug, 'means.push(total / n);', '')).message).toMatch(/means is empty/);
  });

  it('bootstrap-ci: not sorting, sorting as text, the positions, 90% for 95%', () => {
    const slug = 'bootstrap-ci';
    const sort = 'const ordered = [...means].sort((a, b) => a - b);';
    expect(verdict(slug, swap(slug, sort, 'const ordered = means;'), 1).message).toMatch(/Sort a copy first/);
    expect(verdict(slug, swap(slug, sort, 'const ordered = [...means].sort();'), 2).message).toMatch(/as text/);
    const ret = 'return [ordered[k], ordered[resamples - 1 - k]];';
    expect(verdict(slug, swap(slug, ret, 'return [ordered[k - 1], ordered[resamples - k]];'), 1).message).toMatch(/positions count from 0/);
    expect(verdict(slug, swap(slug, ret, 'return [ordered[k], ordered[resamples - k]];'), 1).message).toMatch(/not 400/);
    expect(verdict(slug, swap(slug, 'Math.floor(resamples / 40)', 'Math.floor(resamples / 20)'), 1).message).toMatch(/middle 90%/);
    expect(verdict(slug, swap(slug, ret, 'return [ordered[0], ordered[resamples - 1]];'), 1).message).toMatch(/whole 100%/);
    expect(verdict(slug, swap(slug, ret, 'return [ordered[resamples - 1 - k], ordered[k]];'), 1).message).toMatch(/wrong way round/);
    expect(verdict(slug, swap(slug, ret, 'return ordered[k];'), 1).message).toMatch(/list of two numbers/);
    // All the same: every average is 5, and the interval is [5, 5].
    expect(verdict(slug, getExercise(slug)!.solution.javascript, 4).message).toMatch(/from 5 to 5/);
    // The lesson quotes this test's result.
    expect(getExercise(slug)!.tests[6].name).toContain('lesson’s 25 rolls');
    expect(verdict(slug, getExercise(slug)!.solution.javascript, 6).message).toMatch(/from 3.64 to 4.92/);
  });

  it('standard-error: ÷ n, s alone, s/n, no square root, the variance, unsquared gaps', () => {
    const slug = 'standard-error';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/your code returns 0|You got 0/);
    expect(verdict(slug, swap(slug, 'squares / (n - 1)', 'squares / n')).message).toMatch(/n − 1 = 7/);
    expect(verdict(slug, swap(slug, 'return s / Math.sqrt(n);', 'return s;')).message).toMatch(/spread of single values/);
    expect(verdict(slug, swap(slug, 'return s / Math.sqrt(n);', 'return s / n;')).message).toMatch(/not n/);
    expect(verdict(slug, swap(slug, 'const s = Math.sqrt(squares / (n - 1));', 'const s = squares / (n - 1);')).message).toMatch(/forgot the square root/);
    expect(verdict(slug, swap(slug, 'return s / Math.sqrt(n);', 'return s * s / n;')).message).toMatch(/variance of the average/);
    expect(verdict(slug, swap(slug, 'gaps[i] = (data[i] - mean) * (data[i] - mean);', 'gaps[i] = data[i] - mean;')).message).toMatch(/always add up to 0/);
    expect(verdict(slug, swap(slug, 'gaps[i] = (data[i] - mean) * (data[i] - mean);', 'gaps[i] = Math.abs(data[i] - mean);')).message).toMatch(/sizes of the gaps/);
  });

  it('in Python: the same numbers to the last bit, and the same slips named', () => {
    for (const slug of ['bootstrap-ci', 'standard-error']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => {
        const py = run(slug, exercise.solution.python, i, 'python');
        expect(exercise.check(exercise.tests[i].input, py), `${slug} ${i}`).toMatchObject({ pass: true });
        expect(py.returned).toEqual(run(slug, exercise.solution.javascript, i).returned);
      });
    }
    const py = (slug: string, from: string, to: string, test = 0) => verdict(slug, swap(slug, from, to, 'python'), test, 'python').message;
    expect(py('bootstrap-ci', 'data[int(u * n)]', 'data[i]')).toMatch(/without replacement/);
    expect(py('bootstrap-ci', 'data[int(u * n)]', 'data[int(u * (n - 1))]')).toMatch(/never picked/);
    expect(py('bootstrap-ci', 'ordered = sorted(means)', 'ordered = means', 1)).toMatch(/Sort a copy first/);
    expect(py('bootstrap-ci', 'ordered[resamples - 1 - k]', 'ordered[resamples - k]', 1)).toMatch(/not 400/);
    expect(py('bootstrap-ci', '[ordered[k], ordered[resamples - 1 - k]]', '[ordered[k], ordered[resamples]]', 1)).toMatch(/positions 0 to 399/);
    expect(py('standard-error', 'squares / (n - 1)', 'squares / n')).toMatch(/n − 1 = 7/);
    expect(py('standard-error', 'return s / math.sqrt(n)', 'return s / n')).toMatch(/not n/);
  });
});

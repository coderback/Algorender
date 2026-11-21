// B5's random-variable exercises name the usual mistakes: each wrong answer
// below is a slip a learner really makes (a plain average for the mean, a gap
// left unsquared or unweighted, E[X²] or E[X]² for the variance, a division by
// n; a generator stepped wrongly, a head counted as u > p), and its verdict
// must say what it was. Most run in JavaScript; Python runs the slips whose
// message comes from the runtime itself.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectation, variance } from '@/algorithms/probability/random-variables';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { moments, PM_A, PM_M, simulateFlips, type SimInput } from './random-variables';

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
  it('agrees with the visualiser’s E[X] and Var(X) on every test', () => {
    for (const { input } of getExercise('expectation-variance')!.tests) {
      const { mean, terms, variance: v } = moments(input);
      expect(mean).toBeCloseTo(expectation(input.values, input.probs), 12);
      expect(v).toBeCloseTo(variance(input.values, input.probs), 12);
      expect(terms.reduce((s: number, t: number) => s + t, 0)).toBe(v);
      // The chances add up to 1, exactly: every one is a sum of powers of two.
      expect(input.probs.reduce((s: number, p: number) => s + p, 0)).toBe(1);
    }
    expect(moments({ values: [1, 2, 3, 4, 5, 6], probs: [0.25, 0.125, 0.125, 0.125, 0.125, 0.25] })).toMatchObject({ mean: 3.5, variance: 3.75 });
  });

  it('steps Park–Miller exactly, and its averages land near n·p', () => {
    // Its products stay below 2^53, so every state is a whole number in both runtimes.
    let state = 1;
    for (let i = 0; i < 10_000; i++) {
      expect(PM_A * state).toBeLessThan(2 ** 53);
      state = (PM_A * state) % PM_M;
      expect(Number.isInteger(state) && state > 0 && state < PM_M).toBe(true);
    }
    // The 10,000th state from seed 1 is the generator's published check value.
    expect(state).toBe(1043618065);
    for (const { input } of getExercise('binomial-simulation')!.tests) {
      const { n, p, runs } = input as SimInput;
      const { counts, mean } = simulateFlips(input);
      expect(counts.reduce((s, c) => s + c, 0)).toBe(runs);
      expect(Math.abs(mean - n * p)).toBeLessThan(4 * Math.sqrt((n * p * (1 - p)) / runs));
      // Every slip the check names makes different counts from the right ones (with one coin, reading u before
      // the step only swaps the first number for the last, which can land on the same side of p).
      for (const slip of ['greater', 'restart', 'before', 'frozen'] as const) if (slip !== 'before' || n > 1) expect(simulateFlips(input, slip).counts).not.toEqual(counts);
    }
  });
});

describe('B5’s random-variable exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['expectation-variance', 'binomial-simulation']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
    }
  });

  it('expectation-variance: a plain average, no weights, no square, |gap|, E[X²], E[X]², and ÷ n', () => {
    const slug = 'expectation-variance';
    const exercise = getExercise(slug)!;
    expect(verdict(slug, exercise.starter.javascript, 1).message).toMatch(/terms is still all 0s/);
    expect(verdict(slug, swap(slug, 'mean = mean + values[i] * probs[i];', 'mean = mean + values[i] / values.length;'), 5).message).toMatch(/plain average/);
    expect(verdict(slug, swap(slug, 'terms[i] = probs[i] * gap * gap;', 'terms[i] = gap * gap;'), 1).message).toMatch(/needs weighting by its chance/);
    expect(verdict(slug, swap(slug, 'terms[i] = probs[i] * gap * gap;', 'terms[i] = probs[i] * gap;'), 1).message).toMatch(/always cancel/);
    expect(verdict(slug, swap(slug, 'terms[i] = probs[i] * gap * gap;', 'terms[i] = probs[i] * Math.abs(gap);'), 1).message).toMatch(/sizes of the gaps/);
    expect(verdict(slug, swap(slug, 'const gap = values[i] - mean;', 'const gap = values[i];'), 1).message).toMatch(/E\[X²\]/);
    const squaredMean = swap(slug, 'return total;\n}\n', 'return mean * mean;\n}\n');
    expect(verdict(slug, squaredMean, 1).message).toMatch(/E\[X\]², the balance point squared/);
    expect(verdict(slug, swap(slug, 'return total;\n}\n', 'return total / values.length;\n}\n'), 1).message).toMatch(/divided by n/);
    // The right variance with terms left out is still caught.
    expect(verdict(slug, swap(slug, '    terms[i] = probs[i] * gap * gap;\n    total = total + terms[i];', '    total = total + probs[i] * gap * gap;'), 1).message).toMatch(/terms should hold/);
  });

  it('binomial-simulation: u > p, a frozen or restarted generator, u before the step, heads not reset, and the wrong average', () => {
    const slug = 'binomial-simulation';
    const exercise = getExercise(slug)!;
    expect(verdict(slug, exercise.starter.javascript).message).toMatch(/adds up to 0/);
    expect(verdict(slug, swap(slug, 'if (u < p) {', 'if (u > p) {'), 1).message).toMatch(/u > p/);
    expect(verdict(slug, swap(slug, '      state = (16807 * state) % 2147483647;\n', '')).message).toMatch(/state never changes/);
    expect(verdict(slug, swap(slug, '    let heads = 0;', '    let heads = 0;\n    state = seed;')).message).toMatch(/replays the first/);
    const before = swap(slug, '      state = (16807 * state) % 2147483647;\n      const u = state / 2147483647;', '      const u = state / 2147483647;\n      state = (16807 * state) % 2147483647;');
    expect(verdict(slug, before).message).toMatch(/read u before stepping/);
    const notReset = swap(slug, '  let total = 0;\n', '  let total = 0;\n  let heads = 0;\n').replace('    let heads = 0;\n', '');
    expect(verdict(slug, notReset).message).toMatch(/Start each run's count of heads at 0/);
    expect(verdict(slug, swap(slug, 'return total / runs;', 'return total;')).message).toMatch(/total number of heads/);
    expect(verdict(slug, swap(slug, 'return total / runs;', 'return total / (runs * n);')).message).toMatch(/share of all the flips/);
    expect(verdict(slug, swap(slug, 'counts[heads] = counts[heads] + 1;', 'counts[heads] = 1;')).message).toMatch(/each run adds exactly 1/);
  });

  it('in Python too: the slips are named, and heads not reset is an IndexError', () => {
    expect(verdict('expectation-variance', swap('expectation-variance', 'terms[i] = probs[i] * gap * gap', 'terms[i] = gap * gap', 'python'), 1, 'python').message).toMatch(/needs weighting by its chance/);
    expect(verdict('binomial-simulation', swap('binomial-simulation', 'if u < p:', 'if u > p:', 'python'), 1, 'python').message).toMatch(/u > p/);
    const notReset = swap('binomial-simulation', '    total = 0\n', '    total = 0\n    heads = 0\n', 'python').replace('        heads = 0\n', '');
    expect(verdict('binomial-simulation', notReset, 0, 'python').message).toMatch(/Start each run's count of heads at 0/);
  });
});

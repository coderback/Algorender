// B5's Monte Carlo exercises name the usual mistakes: each wrong answer below
// is a slip a learner really makes, and its verdict must say what it was. Most
// run in JavaScript; Python runs the solutions (which must agree with
// JavaScript to the last bit) and the slips that fail differently there.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { estimatePi, nextState, parkMillerRolls, pinDarts, PM_MODULUS, runningAverage } from './monte-carlo';

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
  it('steps the Park-Miller generator and throws darts from it', () => {
    // The generator's first steps from 1 are the published ones.
    expect([nextState(1), nextState(16807), nextState(282475249)]).toEqual([16807, 282475249, 1622650073]);
    // A state never reaches 0 or 2147483647, so u is strictly between 0 and 1.
    expect(nextState(PM_MODULUS - 1)).toBeGreaterThan(0);
    const darts = pinDarts({ n: 3, seed: 1 });
    expect(darts[0]).toEqual([16807 / PM_MODULUS, 282475249 / PM_MODULUS]);
    expect(darts[1][0]).toBe(1622650073 / PM_MODULUS);
    // A first dart near (0, 0.13) is inside: one dart from seed 1 estimates 4.
    expect(estimatePi({ n: 1, seed: 1 }).estimate).toBe(4);
    // Many darts settle near π.
    expect(Math.abs(estimatePi({ n: 20000, seed: 5 }).estimate - Math.PI)).toBeLessThan(0.05);
    // The slips really are different.
    const input = { n: 2000, seed: 100000 };
    const answers = (['right', 'one-number', 'frozen', 'y-not-kept', 'divide-first'] as const).map((how) => estimatePi(input, how).estimate);
    expect(new Set(answers).size).toBe(answers.length);
    // Frozen darts all sit at (u, u) with u past 1/√2, so they all miss.
    expect(estimatePi(input, 'frozen').estimate).toBe(0);
    expect(runningAverage([3, 6, 1, 4])).toEqual([3, 4.5, 10 / 3, 3.5]);
    const rolls = parkMillerRolls(600, 3);
    expect(rolls.every((r) => Number.isInteger(r) && r >= 1 && r <= 6)).toBe(true);
    expect(new Set(rolls).size).toBe(6);
  });
});

describe('B5’s Monte Carlo exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['estimate-pi', 'running-average']) {
      const exercise = getExercise(slug)!;
      expect(exercise.visualiser).toBe('monte-carlo');
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.typescript, i, 'typescript'), `${slug} ${i} ts`).toMatchObject({ pass: true }));
    }
  });

  it('estimate-pi: the 4, the count, the state, one number for both, dividing first', () => {
    const slug = 'estimate-pi';
    const exercise = getExercise(slug)!;
    const ret = 'return 4 * inside / n;';
    expect(verdict(slug, exercise.starter.javascript).message).toMatch(/estimates is empty|Return the estimate|you returned 0/);
    expect(verdict(slug, swap(slug, ret, 'return inside / n;'), 2).message).toMatch(/π\/4.*Multiply by 4/);
    expect(verdict(slug, swap(slug, ret, 'return 2 * inside / n;'), 2).message).toMatch(/half the estimate/);
    expect(verdict(slug, swap(slug, ret, 'return 4 * inside / (2 * n);'), 2).message).toMatch(/half the estimate/);
    expect(verdict(slug, swap(slug, ret, 'return 4 * inside / (n - 1);'), 2).message).toMatch(/n − 1/);
    expect(verdict(slug, swap(slug, ret, 'return 4 * inside / (n - inside);'), 2).message).toMatch(/darts outside/);
    const middle = swap(slug, 'x * x + y * y <= 1', '(x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5) <= 1');
    expect(verdict(slug, middle, 2).message).toMatch(/covers the whole square/);
    const oneNumber = swap(slug, 'state = nextState(state);\n    const y = state / 2147483647;', 'const y = x;');
    expect(verdict(slug, oneNumber, 2).message).toMatch(/one random number for both/);
    const frozen = swap(slug, 'state = nextState(state);\n    const x = state / 2147483647;', 'const x = nextState(state) / 2147483647;').replace(
      'state = nextState(state);\n    const y = state / 2147483647;',
      'const y = nextState(state) / 2147483647;',
    );
    expect(verdict(slug, frozen, 3).message).toMatch(/same spot.*never kept/);
    const yLost = swap(slug, 'state = nextState(state);\n    const y = state / 2147483647;', 'const y = nextState(state) / 2147483647;');
    expect(verdict(slug, yLost, 2).message).toMatch(/next dart’s x repeats/);
    const first = swap(
      slug,
      'state = nextState(state);\n    const x = state / 2147483647;\n    state = nextState(state);\n    const y = state / 2147483647;',
      'const x = state / 2147483647;\n    state = nextState(state);\n    const y = state / 2147483647;\n    state = nextState(state);',
    );
    expect(verdict(slug, first, 2).message).toMatch(/divided before stepping/);
    // Strictly inside counts the same darts: a dart never lands exactly on the arc.
    const strict = verdict(slug, swap(slug, 'x * x + y * y <= 1', 'x * x + y * y < 1'), 2);
    expect(strict.pass).toBe(true);
    expect(strict.message).toMatch(/no difference/);
  });

  it('estimate-pi: the running estimates, dividing by i, by n, or never appended', () => {
    const slug = 'estimate-pi';
    expect(verdict(slug, swap(slug, '4 * inside / (i + 1)', '4 * inside / i'), 1).message).toMatch(/divides by zero/);
    expect(verdict(slug, swap(slug, '4 * inside / (i + 1)', '4 * inside / n'), 1).message).toMatch(/divides by n = 10/);
    expect(verdict(slug, swap(slug, 'estimates.push(4 * inside / (i + 1));', ''), 1).message).toMatch(/estimates is empty/);
  });

  it('running-average: one roll, the totals, all n, appending first, dividing by i', () => {
    const slug = 'running-average';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/Return the 4 running averages/);
    expect(verdict(slug, swap(slug, 'means.push(total / (i + 1));', 'means.push(rolls[i]);')).message).toMatch(/just that one roll/);
    expect(verdict(slug, swap(slug, 'means.push(total / (i + 1));', 'means.push(total);')).message).toMatch(/running totals/);
    expect(verdict(slug, swap(slug, 'total / (i + 1)', 'total / rolls.length')).message).toMatch(/all the rolls/);
    const early = swap(slug, '    total = total + rolls[i];\n    means.push(total / (i + 1));', '    means.push(total / (i + 1));\n    total = total + rolls[i];');
    expect(verdict(slug, early).message).toMatch(/misses its own roll/);
    expect(verdict(slug, swap(slug, 'total / (i + 1)', 'total / i')).message).toMatch(/divides by zero/);
  });

  it('in Python: the same numbers to the last bit, and the same slips named', () => {
    for (const slug of ['estimate-pi', 'running-average']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => {
        const py = run(slug, exercise.solution.python, i, 'python');
        expect(exercise.check(exercise.tests[i].input, py), `${slug} ${i}`).toMatchObject({ pass: true });
        expect(py.returned).toEqual(run(slug, exercise.solution.javascript, i).returned);
      });
    }
    const py = (from: string, to: string, slug = 'estimate-pi', test = 1) => verdict(slug, swap(slug, from, to, 'python'), test, 'python').message;
    expect(py('4 * inside / (i + 1)', '4 * inside / i')).toMatch(/divides by zero/);
    expect(py('    return 4 * inside / n\n', '    return inside / n\n', 'estimate-pi', 2)).toMatch(/Multiply by 4/);
    expect(py('state = next_state(state)\n        y = state / 2147483647', 'y = x', 'estimate-pi', 2)).toMatch(/one random number for both/);
    expect(py('total / (i + 1)', 'total / i', 'running-average', 0)).toMatch(/divides by zero/);
  });
});

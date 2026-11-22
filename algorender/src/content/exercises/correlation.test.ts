// B6's correlation exercise names the usual mistakes: each wrong answer below
// is a slip a learner really makes (raw values never centred, only one list
// centred, the covariance or the dot product returned, variances where the
// spreads go, n in one place and n − 1 in another, the sizes of the products,
// one spread only), and its verdict must say what it was. Most run in
// JavaScript; a few run in Python too.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { correlationOf, covariance, products, spread } from '@/algorithms/probability/correlation';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { correlate, slips } from './correlation';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

const SLUG = 'correlation';

function verdict(code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(SLUG)!;
  const input = exercise.tests[test].input;
  const request = testRequest(exercise, language, code, input);
  const result: RunResult = language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
  return exercise.check(input, result);
}

const swap = (from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(SLUG)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('agrees with the visualiser on every test, and the slips all differ from r', () => {
    const exercise = getExercise(SLUG)!;
    expect(exercise.visualiser).toBe('correlation');
    for (const { name, input } of exercise.tests) {
      const { products: p, cov, sx, sy, r } = correlate(input);
      expect(r, name).toBeCloseTo(correlationOf(input.xs, input.ys), 12);
      expect(cov).toBeCloseTo(covariance(input.xs, input.ys), 12);
      expect([sx, sy].map((v) => v.toFixed(12))).toEqual([spread(input.xs), spread(input.ys)].map((v) => v.toFixed(12)));
      p.forEach((v, i) => expect(v).toBeCloseTo(products(input.xs, input.ys)[i], 12));
      expect(Math.abs(r)).toBeLessThanOrEqual(1 + 1e-12);
    }
    const [revision, ring, rising, falling] = exercise.tests.map((t) => correlate(t.input).r);
    expect(revision.toFixed(3)).toBe('0.797');
    expect(ring).toBe(0);
    expect(rising).toBeCloseTo(1, 12);
    expect(falling).toBeCloseTo(-1, 12);
    // On the revision data every slip gives its own wrong answer.
    const s = slips(exercise.tests[0].input);
    const wrong = [s.raw, s.onlyX, s.onlyY, s.spreadsByNMinus1, s.covByNMinus1, s.noRoot, s.cov, s.dot, s.absolute, ...s.oneSpread];
    for (const w of wrong) expect(Math.abs(w - revision)).toBeGreaterThan(1e-6);
  });
});

describe('B6’s correlation exercise explains the usual mistakes', () => {
  it('the solution passes every test, in all three languages', () => {
    const exercise = getExercise(SLUG)!;
    exercise.tests.forEach((_, i) => {
      expect(verdict(exercise.solution.javascript, i), `javascript ${i}`).toMatchObject({ pass: true });
      expect(verdict(exercise.solution.typescript, i, 'typescript'), `typescript ${i}`).toMatchObject({ pass: true });
      expect(verdict(exercise.solution.python, i, 'python'), `python ${i}`).toMatchObject({ pass: true });
    });
  });

  it('names each slip in JavaScript', () => {
    const exercise = getExercise(SLUG)!;
    expect(verdict(exercise.starter.javascript).message).toMatch(/products is still all 0s/);
    // Never centred: x times y.
    const raw = swap('const a = xs[i] - mx;\n    const b = ys[i] - my;', 'const a = xs[i];\n    const b = ys[i];');
    expect(verdict(raw).message).toMatch(/raw values/);
    // Only x centred, everywhere: the products differ, and so does r.
    expect(verdict(swap('const b = ys[i] - my;', 'const b = ys[i];')).message).toMatch(/centred only one/);
    // Only x centred in the products: r comes out right, but each product is wrong.
    expect(verdict(swap('products[i] = a * b;', 'products[i] = a * ys[i];')).message).toMatch(/r is right, but products should hold .*both centred/);
    expect(verdict(swap('return cov / (sx * sy);', 'return cov;')).message).toMatch(/is the covariance/);
    expect(verdict(swap('return cov / (sx * sy);', 'return sxy;')).message).toMatch(/total of the products/);
    expect(verdict(swap('const sx = Math.sqrt(sxx / n);\n  const sy = Math.sqrt(syy / n);', 'const sx = sxx / n;\n  const sy = syy / n;')).message).toMatch(/variances/);
    expect(verdict(swap('const sx = Math.sqrt(sxx / n);\n  const sy = Math.sqrt(syy / n);', 'const sx = Math.sqrt(sxx / (n - 1));\n  const sy = Math.sqrt(syy / (n - 1));')).message).toMatch(/different counts/);
    expect(verdict(swap('const cov = sxy / n;', 'const cov = sxy / (n - 1);')).message).toMatch(/different counts/);
    expect(verdict(swap('sxy = sxy + products[i];', 'sxy = sxy + Math.abs(products[i]);')).message).toMatch(/sizes of the products/);
    expect(verdict(swap('return cov / (sx * sy);', 'return cov / sx;')).message).toMatch(/both spreads/);
    // The right r with the products left unwritten is still caught.
    expect(verdict(swap('products[i] = a * b;\n    sxy = sxy + products[i];', 'sxy = sxy + a * b;')).message).toMatch(/r is right, but products should hold/);
  });

  it('names slips in Python too', () => {
    expect(verdict(getExercise(SLUG)!.starter.python, 0, 'python').message).toMatch(/products is still all 0s/);
    expect(verdict(swap('return cov / (sx * sy)', 'return cov', 'python'), 0, 'python').message).toMatch(/is the covariance/);
    expect(verdict(swap('sx = math.sqrt(sxx / n)\n    sy = math.sqrt(syy / n)', 'sx = sxx / n\n    sy = syy / n', 'python'), 0, 'python').message).toMatch(/variances/);
    expect(verdict(swap('        b = ys[i] - my', '        b = ys[i]', 'python'), 0, 'python').message).toMatch(/centred only one/);
  });
});

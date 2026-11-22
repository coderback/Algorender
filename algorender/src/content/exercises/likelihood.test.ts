// B6's maximum-likelihood exercises name the usual mistakes: each wrong answer
// below is a slip a learner really makes (multiplying densities that
// underflow, a dropped ln σ or constant, a lost 2 or square, base-10 logs;
// ÷ (n − 1) for σ, a forgotten square root, the median for μ, the average
// size of the gaps), and its verdict must say what it was. Most run in
// JavaScript; Python runs the slips whose message comes from the runtime.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { fitGaussian, gaussianLogLikelihood, logDensity } from '@/algorithms/probability/maximum-likelihood';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { logLikelihood, type FitInput, type LogLikelihoodInput } from './likelihood';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(slug: string, code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(slug)!;
  const input = exercise.tests[test].input;
  const request = testRequest(exercise, language, code, input);
  const result: RunResult = language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
  return { result, verdict: exercise.check(input, result) };
}
const verdict = (slug: string, code: string, test = 0, language: Language = 'javascript') => run(slug, code, test, language).verdict;

const swap = (slug: string, from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(slug)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

const LL = 'log-likelihood';
const FIT = 'fit-gaussian';
/** The test whose guess is far from the data, so every density is tiny and their product underflows. */
const FAR = 4;

describe('the reference maths', () => {
  it('agrees with the visualiser on every test', () => {
    getExercise(LL)!.tests.forEach(({ input }, i) => {
      const { xs, mu, sigma } = input as LogLikelihoodInput;
      const { logs, total } = logLikelihood(input);
      expect(total).toBeCloseTo(gaussianLogLikelihood(xs, mu, sigma), 9);
      logs.forEach((l, k) => expect(l).toBe(logDensity(xs[k], mu, sigma)));
      // The far test's densities multiply out to 0; the others' don't.
      const product = xs.reduce((s, x) => s * Math.exp(logDensity(x, mu, sigma)), 1);
      expect(product === 0, `test ${i}`).toBe(i === FAR);
    });
    // The narrow bell is denser than 1 at its centre, so a log density can be positive.
    expect(logDensity(10, 10, 0.25)).toBeGreaterThan(0);
    for (const { input } of getExercise(FIT)!.tests) {
      const { xs } = input as FitInput;
      const { mu, sigma } = fitGaussian(xs);
      expect(mu).toBeCloseTo(xs.reduce((s, x) => s + x, 0) / xs.length, 12);
      expect(sigma).toBeCloseTo(Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / xs.length), 12);
    }
  });
});

describe('B6’s maximum-likelihood exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of [LL, FIT]) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
    }
  });

  it('log-likelihood: products that underflow, the constant dropped or flipped, a lost 2 or square, base 10, an average', () => {
    const exercise = getExercise(LL)!;
    expect(verdict(LL, exercise.starter.javascript, 1).message).toMatch(/logs is still all 0s/);
    // Multiplying the densities, then one log at the end: −∞ once the product underflows.
    const product = swap(
      LL,
      '  let total = 0;\n  for (let i = 0; i < xs.length; i++) {\n    const d = logDensity(xs[i], mu, sigma);\n    logs[i] = Math.round(d * 1e6) / 1e6;\n    total = total + d;\n  }\n  return total;',
      '  let product = 1;\n  for (let i = 0; i < xs.length; i++) {\n    product = product * Math.exp(logDensity(xs[i], mu, sigma));\n  }\n  return Math.log(product);',
    );
    expect(verdict(LL, product, FAR).message).toMatch(/underflow/);
    // Returning the product itself.
    const noLog = product.replace('return Math.log(product);', 'return product;');
    expect(verdict(LL, noLog, 1).message).toMatch(/is L itself/);
    expect(verdict(LL, noLog, FAR).message).toMatch(/underflows/);
    const formula = '-Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma * sigma)';
    expect(verdict(LL, swap(LL, formula, '-Math.log(Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma * sigma)')).message).toMatch(/dropped the ln σ/);
    expect(verdict(LL, swap(LL, formula, '-gap * gap / (2 * sigma * sigma)')).message).toMatch(/left out −ln\(σ√\(2π\)\)/);
    expect(verdict(LL, swap(LL, formula, 'Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma * sigma)')).message).toMatch(/wrong sign/);
    expect(verdict(LL, swap(LL, formula, '-Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (sigma * sigma)')).message).toMatch(/missing its 2/);
    expect(verdict(LL, swap(LL, formula, '-Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma)')).message).toMatch(/divided by 2σ/);
    expect(verdict(LL, swap(LL, formula, '-Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / 2 * sigma * sigma')).message).toMatch(/brackets/);
    expect(verdict(LL, swap(LL, formula, '-Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap / (2 * sigma * sigma)')).message).toMatch(/Square the gap/);
    expect(verdict(LL, swap(LL, formula, '-Math.log(sigma * Math.sqrt(2 * Math.PI)) + gap * gap / (2 * sigma * sigma)')).message).toMatch(/lost its minus/);
    expect(verdict(LL, swap(LL, formula, '(-Math.log(sigma * Math.sqrt(2 * Math.PI)) - gap * gap / (2 * sigma * sigma)) / Math.LN10')).message).toMatch(/base 10/);
    expect(verdict(LL, swap(LL, '  return total;', '  return total / xs.length;')).message).toMatch(/average log density/);
    // The right total with logs left out is still caught.
    expect(verdict(LL, swap(LL, '    logs[i] = Math.round(d * 1e6) / 1e6;\n', '')).message).toMatch(/logs should hold/);
  });

  it('fit-gaussian: ÷ (n − 1), no square root, the median, |gaps|, x² for gaps, swapped', () => {
    const exercise = getExercise(FIT)!;
    expect(verdict(FIT, exercise.starter.javascript).message).toMatch(/\[0, 0\]/);
    expect(verdict(FIT, swap(FIT, 'Math.sqrt(spread / n)', 'Math.sqrt(spread / (n - 1))')).message).toMatch(/sample standard deviation/);
    expect(verdict(FIT, swap(FIT, 'Math.sqrt(spread / n)', 'spread / n')).message).toMatch(/is σ², the mean squared gap/);
    expect(verdict(FIT, swap(FIT, 'Math.sqrt(spread / n)', 'spread / (n - 1)')).message).toMatch(/skips the square root/);
    expect(verdict(FIT, swap(FIT, 'Math.sqrt(spread / n)', 'Math.sqrt(spread) / n')).message).toMatch(/square root before dividing/);
    expect(verdict(FIT, swap(FIT, 'Math.sqrt(spread / n)', 'Math.sqrt(spread)')).message).toMatch(/root of the mean squared gap/);
    expect(verdict(FIT, swap(FIT, 'gaps[i] = (xs[i] - mu) * (xs[i] - mu);', 'gaps[i] = Math.abs(xs[i] - mu);').replace('Math.sqrt(spread / n)', 'spread / n')).message).toMatch(/average size of the gaps/);
    expect(verdict(FIT, swap(FIT, 'gaps[i] = (xs[i] - mu) * (xs[i] - mu);', 'gaps[i] = xs[i] * xs[i];')).message).toMatch(/squared measurements/);
    expect(verdict(FIT, swap(FIT, 'return [mu, sigma];', 'return [sigma, mu];')).message).toMatch(/swapped/);
    const median = swap(FIT, 'const mu = total / n;', 'const sorted = [...xs].sort((a, b) => a - b);\n  const mu = (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2;');
    expect(verdict(FIT, median).message).toMatch(/is the median/);
    expect(verdict(FIT, swap(FIT, 'const mu = total / n;', 'const mu = total;')).message).toMatch(/total of the measurements/);
    expect(verdict(FIT, swap(FIT, 'const mu = total / n;', 'const mu = total / (n - 1);')).message).toMatch(/divided by n − 1/);
    // The right bell with gaps left unwritten.
    const unwritten = swap(FIT, '    gaps[i] = (xs[i] - mu) * (xs[i] - mu);\n    spread = spread + gaps[i];', '    spread = spread + (xs[i] - mu) * (xs[i] - mu);');
    expect(verdict(FIT, unwritten).message).toMatch(/gaps should hold/);
  });

  it('in Python too: the underflow is a ValueError from math.log(0), and ÷ (n − 1) is named', () => {
    const product = swap(
      LL,
      '    total = 0\n    for i in range(len(xs)):\n        d = log_density(xs[i], mu, sigma)\n        logs[i] = round(d, 6)\n        total = total + d\n    return total',
      '    product = 1\n    for i in range(len(xs)):\n        product = product * math.exp(log_density(xs[i], mu, sigma))\n    return math.log(product)',
      'python',
    );
    const { result, verdict: v } = run(LL, product, FAR, 'python');
    // Python 3.14 words it “expected a positive input”; older versions said “math domain error”.
    expect(result.error?.message).toMatch(/math domain error|expected a positive input/);
    expect(v.message).toMatch(/underflow.*ValueError/s);
    expect(verdict(LL, product, 0, 'python')).toMatchObject({ pass: false });
    expect(verdict(LL, swap(LL, '-math.log(sigma * math.sqrt(2 * math.pi)) - ', '-math.log(math.sqrt(2 * math.pi)) - ', 'python'), 0, 'python').message).toMatch(/dropped the ln σ/);
    expect(verdict(FIT, swap(FIT, 'math.sqrt(spread / n)', 'math.sqrt(spread / (n - 1))', 'python'), 0, 'python').message).toMatch(/sample standard deviation/);
    expect(verdict(FIT, getExercise(FIT)!.solution.python, 2, 'python')).toMatchObject({ pass: true });
  });
});

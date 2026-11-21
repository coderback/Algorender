// B5's normal-cdf exercise names the usual mistakes: each wrong answer below
// is a slip a learner really makes, fed in as edited solution code, and its
// verdict must say what it was. Most run in JavaScript; a few run in Python
// too, whose exp may differ from JavaScript's in the last bit, which the
// check's tolerance absorbs.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalCdf, normalPdf } from '@/algorithms/probability/distributions';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { numericCdf, type CurveInput } from './distributions';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

const SLUG = 'normal-cdf';
const exercise = () => getExercise(SLUG)!;

function result(code: string, test = 0, language: Language = 'javascript'): RunResult {
  const input = exercise().tests[test].input;
  const request = testRequest(exercise(), language, code, input);
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}
const verdict = (code: string, test = 0, language: Language = 'javascript') => exercise().check(exercise().tests[test].input, result(code, test, language));

const swap = (from: string, to: string, language: Language = 'javascript') => {
  const code = exercise().solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

const PDF_LINE = 'const power = -(x - mu) * (x - mu) / (2 * sigma * sigma);';
const PDF_RETURN = 'return Math.exp(power) / (sigma * Math.sqrt(2 * Math.PI));';

describe('the reference maths', () => {
  it('a midpoint sum from μ − 8σ is the CDF, and left or right edges are not', () => {
    for (const { input } of exercise().tests) {
      const { xs, mu, sigma, n } = input as CurveInput;
      for (const x of xs) {
        const tol = 0.03 * ((x - (mu - 8 * sigma)) / n / sigma) ** 2 + 1e-9;
        expect(Math.abs(numericCdf(x, mu, sigma, n) - normalCdf(x, mu, sigma))).toBeLessThan(tol);
      }
      // At the centre a left-edge sum misses by about half a rectangle times the peak: far outside the tolerance.
      const tol = 0.03 * (8 / n) ** 2 + 1e-9;
      expect(Math.abs(numericCdf(mu, mu, sigma, n, 'left') - 0.5)).toBeGreaterThan(10 * tol);
    }
    // The narrow test's curve is taller than 1.
    expect(normalPdf(10, 10, 0.25)).toBeGreaterThan(1.5);
  });

  it('writes the same rounded values in both languages, and returns the full ones', () => {
    for (const [i, { input }] of exercise().tests.entries()) {
      const { xs, mu, sigma } = input as CurveInput;
      const js = result(exercise().solution.javascript, i);
      const python = result(exercise().solution.python, i, 'python');
      const writes = (r: RunResult) => r.events.filter((e) => e.kind === 'write').map((e) => (e as { value: number }).value);
      expect(writes(python)).toEqual(writes(js));
      const [heights] = js.returned as number[][];
      xs.forEach((x, k) => expect(heights[k]).toBe(normalPdf(x, mu, sigma)));
    }
  });
});

describe('normal-cdf explains the usual mistakes', () => {
  it('the solution passes every test in JavaScript and Python, the starter none', () => {
    exercise().tests.forEach((_, i) => {
      expect(verdict(exercise().solution.javascript, i), `test ${i}`).toMatchObject({ pass: true });
      expect(verdict(exercise().solution.python, i, 'python'), `python test ${i}`).toMatchObject({ pass: true });
    });
    expect(verdict(exercise().starter.javascript).message).toMatch(/normal_pdf still returns 0/);
    // A trapezoid rule is as good as the middles.
    const trapezoid = swap('const middle = start + (k + 0.5) * width;\n    total = total + normalPdf(middle, mu, sigma) * width;', 'total = total + (normalPdf(start + k * width, mu, sigma) + normalPdf(start + (k + 1) * width, mu, sigma)) / 2 * width;');
    exercise().tests.forEach((_, i) => expect(verdict(trapezoid, i), `trapezoid ${i}`).toMatchObject({ pass: true }));
  });

  it('the density: σ² for σ, σ for σ², no 1/(σ√(2π)), no σ, no minus, 2π, √π, no 2, / 2 * σ², no μ', () => {
    // Test 1 has σ = 1.5 and μ = 1, so σ, σ² and 2σ, and x and x − μ, all differ.
    const t = 1;
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power) / (sigma * sigma * Math.sqrt(2 * Math.PI));'), t).message).toMatch(/σ²√\(2π\)/);
    expect(verdict(swap(PDF_LINE, 'const power = -(x - mu) * (x - mu) / (2 * sigma);'), t).message).toMatch(/divided by 2σ: it is 2σ²/);
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power);'), t).message).toMatch(/left out 1\/\(σ√\(2π\)\)/);
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power) / Math.sqrt(2 * Math.PI);'), t).message).toMatch(/not by σ/);
    expect(verdict(swap(PDF_LINE, 'const power = (x - mu) * (x - mu) / (2 * sigma * sigma);'), t).message).toMatch(/lost its minus/);
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power) / (sigma * 2 * Math.PI);'), t).message).toMatch(/σ·2π/);
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power) / (sigma * Math.sqrt(Math.PI));'), t).message).toMatch(/σ√π/);
    expect(verdict(swap(PDF_LINE, 'const power = -(x - mu) * (x - mu) / (sigma * sigma);'), t).message).toMatch(/missing its 2/);
    expect(verdict(swap(PDF_LINE, 'const power = -(x - mu) * (x - mu) / 2 * sigma * sigma;'), t).message).toMatch(/brackets/);
    expect(verdict(swap(PDF_LINE, 'const power = -x * x / (2 * sigma * sigma);'), t).message).toMatch(/sits at 0 instead of at μ/);
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power) * (sigma * Math.sqrt(2 * Math.PI));'), t).message).toMatch(/multiplied by σ√\(2π\)/);
    // With σ = 1, σ and σ² agree: the standard normal can't tell those two apart, so it isn't asked to.
    expect(verdict(swap(PDF_RETURN, 'return Math.exp(power) / (sigma * sigma * Math.sqrt(2 * Math.PI));'), 0)).toMatchObject({ pass: true });
  });

  it('the CDF: no width, left or right edges, starting at 0 or at μ, the area to the right', () => {
    const SUM = 'total = total + normalPdf(middle, mu, sigma) * width;';
    expect(verdict(swap(SUM, 'total = total + normalPdf(middle, mu, sigma);')).message).toMatch(/without their width/);
    expect(verdict(swap('const middle = start + (k + 0.5) * width;', 'const middle = start + k * width;')).message).toMatch(/left edge/);
    expect(verdict(swap('const middle = start + (k + 0.5) * width;', 'const middle = start + (k + 1) * width;')).message).toMatch(/right edge/);
    // μ = 1 in test 1: starting at 0 and at μ differ.
    expect(verdict(swap('const start = mu - 8 * sigma;', 'const start = 0;'), 1).message).toMatch(/starts at x = 0/);
    expect(verdict(swap('const start = mu - 8 * sigma;', 'const start = mu;'), 1).message).toMatch(/starts at μ/);
    expect(verdict(swap('const start = mu - 8 * sigma;', 'const start = 0;'), 0).message).toMatch(/starts at 0, which is μ here/);
    const right = swap('const start = mu - 8 * sigma;\n  const width = (x - start) / n;', 'const start = x;\n  const width = (mu + 8 * sigma - start) / n;');
    expect(verdict(right, 1).message).toMatch(/area to the right of x/);
  });

  it('in Python too: a lost minus and a sum without its width', () => {
    expect(verdict(swap('power = -(x - mu) * (x - mu)', 'power = (x - mu) * (x - mu)', 'python'), 1, 'python').message).toMatch(/lost its minus/);
    expect(verdict(swap('total = total + normal_pdf(middle, mu, sigma) * width', 'total = total + normal_pdf(middle, mu, sigma)', 'python'), 1, 'python').message).toMatch(/without their width/);
    expect(verdict(swap('start = mu - 8 * sigma', 'start = 0', 'python'), 1, 'python').message).toMatch(/starts at x = 0/);
  });
});

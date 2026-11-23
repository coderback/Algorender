// B7's softmax exercises name the usual mistakes: each wrong answer below is
// a slip a learner really makes, and its verdict must say what it was. Crashes
// differ by language (Python raises, JavaScript makes NaN or Infinity, which a
// visual array refuses), so those run in both.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { lossOf, sigmoid, softmaxOf } from '@/algorithms/ml/softmax';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { CE_TESTS, crossEntropyOf, softmaxSlip, SOFTMAX_TESTS, type CrossSlip, type SoftmaxSlip } from './softmax';

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

const swap = (slug: string, from: string, to: string, language: Language = 'javascript', code = getExercise(slug)!.solution[language]) => {
  expect(code).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('softmax matches the visualiser’s, and every slip gives something else', () => {
    for (const { input } of SOFTMAX_TESTS) {
      const p = softmaxSlip(input.logits);
      p.forEach((v, i) => expect(v).toBeCloseTo(softmaxOf(input.logits)[i], 12));
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
    const z = [2, 1.5, 1, -0.5];
    const slips: SoftmaxSlip[] = ['divide', 'unnormalised', 'over-total', 'min'];
    const all = [softmaxSlip(z), ...slips.map((s) => softmaxSlip(z, s))].map((r) => r.map((v) => v.toFixed(9)).join());
    // Subtracting the smallest score is as good as the largest on small scores: it only fails by overflowing.
    expect(all[4]).toBe(all[0]);
    expect(new Set(all.slice(0, 4)).size).toBe(4);
    expect(softmaxSlip([1000, 999, 998], 'naive').every(Number.isNaN)).toBe(true);
    expect(softmaxSlip([710, 0, -710], 'min').some(Number.isNaN)).toBe(true);
  });

  it('the cross-entropy is the mean of log-sum-exp minus the true score, and every slip differs', () => {
    for (const { input } of CE_TESTS) {
      const { mean, losses } = crossEntropyOf(input);
      input.logits.forEach((row, i) => expect(losses[i]).toBeCloseTo(lossOf(row, input.labels[i]), 12));
      expect(mean).toBeCloseTo(losses.reduce((a, b) => a + b, 0) / losses.length, 12);
      expect(losses.every((l) => l >= 0 && Number.isFinite(l))).toBe(true);
    }
    // Two classes: −ln σ(z) for the first, −ln(1 − σ(z)) for the second, as in logistic regression.
    const two = crossEntropyOf(CE_TESTS[5].input).losses;
    expect(two[0]).toBeCloseTo(-Math.log(sigmoid(3)), 12);
    expect(two[1]).toBeCloseTo(-Math.log(1 - sigmoid(-1)), 12);
    // The confident mistake: 800 and a bit.
    expect(crossEntropyOf(CE_TESTS[4].input).losses[0]).toBeCloseTo(800, 9);
    expect(crossEntropyOf(CE_TESTS[4].input, 'naive').losses[0]).toBe(Infinity);
    const input = CE_TESTS[1].input;
    const slips: CrossSlip[] = ['sum', 'sign', 'log2', 'drop-m', 'top', 'first'];
    const all = [crossEntropyOf(input), ...slips.map((s) => crossEntropyOf(input, s))].map((r) => r.mean.toFixed(9));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('B7’s softmax exercises explain the usual mistakes', () => {
  it('every solution passes every test, and the bug hunt’s starter fails on big scores', () => {
    for (const slug of ['stable-softmax', 'cross-entropy']) {
      const exercise = getExercise(slug)!;
      expect(exercise.visualiser).toBe('softmax');
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.typescript, i, 'typescript'), `${slug} ${i} ts`).toMatchObject({ pass: true }));
    }
    const starter = getExercise('stable-softmax')!.starter.javascript;
    expect(verdict('stable-softmax', starter, 0)).toMatchObject({ pass: true });
    expect(verdict('stable-softmax', starter, 1).message).toMatch(/NaN.*Infinity \/ Infinity is NaN/);
    expect(verdict('stable-softmax', starter, 2).message).toMatch(/underflowed to 0, and 0 \/ 0 is NaN/);
  });

  it('stable-softmax: overflow, the smallest score, dividing, normalising', () => {
    const slug = 'stable-softmax';
    expect(verdict(slug, swap(slug, 'Math.max(...logits)', 'Math.min(...logits)'), 1)).toMatchObject({ pass: true });
    expect(verdict(slug, swap(slug, 'Math.max(...logits)', 'Math.min(...logits)'), 5).message).toMatch(/Infinity \/ Infinity is NaN/);
    expect(verdict(slug, swap(slug, 'Math.exp(z - m)', 'Math.exp(z / m)')).message).toMatch(/temperature, T = m/);
    expect(verdict(slug, swap(slug, 'const p = exps[k] / total;', 'const p = exps[k];')).message).toMatch(/add up to .*not 1/);
    const overTotal = swap(slug, 'for (const z of logits) exps.push(Math.exp(z - m));', 'for (const z of logits) exps.push(z);');
    expect(verdict(slug, overTotal).message).toMatch(/scores themselves by their total/);
    expect(verdict(slug, swap(slug, '    probs[k] = Math.round(p * 1e6) / 1e6;\n', '')).message).toMatch(/probs should hold/);
  });

  it('cross-entropy: the mean, the sign, the base, m, the true class, and ln 0', () => {
    const slug = 'cross-entropy';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).pass).toBe(false);
    expect(verdict(slug, swap(slug, 'return total / logits.length;', 'return total;'), 1).message).toMatch(/total over the 3 rows/);
    expect(verdict(slug, swap(slug, 'const loss = m + Math.log(s) - row[labels[i]];', 'const loss = row[labels[i]] - m - Math.log(s);'), 1).message).toMatch(/negative/);
    expect(verdict(slug, swap(slug, 'const loss = m + Math.log(s) - row[labels[i]];', 'const loss = (m + Math.log(s) - row[labels[i]]) / Math.LN2;'), 1).message).toMatch(/in bits/);
    expect(verdict(slug, swap(slug, 'const loss = m + Math.log(s) - row[labels[i]];', 'const loss = Math.log(s) - row[labels[i]];'), 1).message).toMatch(/never added it back/);
    expect(verdict(slug, swap(slug, 'row[labels[i]]', 'm'), 1).message).toMatch(/top-scoring class/);
    expect(verdict(slug, swap(slug, 'row[labels[i]]', 'row[0]'), 1).message).toMatch(/class 0 on every row/);
    expect(verdict(slug, swap(slug, '    losses[i] = Math.round(loss * 1e6) / 1e6;\n', ''), 1).message).toMatch(/losses is still all 0/);
    // The naive way: ln of a probability that underflowed to 0, or e of a big score.
    const naive = swap(slug, '    const loss = m + Math.log(s) - row[labels[i]];', '    let t = 0;\n    for (const z of row) t = t + Math.exp(z);\n    const loss = -Math.log(Math.exp(row[labels[i]]) / t);');
    expect(verdict(slug, naive, 1)).toMatchObject({ pass: true });
    expect(verdict(slug, naive, 4).message).toMatch(/−ln 0 is Infinity/);
    expect(verdict(slug, naive, 3).message).toMatch(/NaN/);
  });

  it('in Python: the same numbers, and the crashes named', () => {
    for (const slug of ['stable-softmax', 'cross-entropy']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => {
        const py = run(slug, exercise.solution.python, i, 'python');
        expect(exercise.check(exercise.tests[i].input, py), `${slug} ${i}`).toMatchObject({ pass: true });
        const js = run(slug, exercise.solution.javascript, i).returned;
        if (Array.isArray(js)) (py.returned as number[]).forEach((v, k) => expect(v).toBeCloseTo((js as number[])[k], 12));
        else expect(py.returned as number).toBeCloseTo(js as number, 9);
      });
    }
    const starter = getExercise('stable-softmax')!.starter.python;
    expect(verdict('stable-softmax', starter, 1, 'python').message).toMatch(/OverflowError: e to the power 1000/);
    expect(verdict('stable-softmax', starter, 2, 'python').message).toMatch(/ZeroDivisionError: every e\^z underflowed/);
    const slug = 'cross-entropy';
    const naive = swap(slug, '        loss = m + math.log(s) - row[labels[i]]', '        t = 0\n        for z in row:\n            t = t + math.exp(z)\n        loss = -math.log(math.exp(row[labels[i]]) / t)', 'python');
    expect(verdict(slug, naive, 4, 'python').message).toMatch(/ValueError: ln of 0/);
    expect(verdict(slug, naive, 3, 'python').message).toMatch(/OverflowError/);
    expect(verdict(slug, swap(slug, 'return total / len(logits)', 'return total', 'python'), 1, 'python').message).toMatch(/total over the 3 rows/);
    expect(verdict(slug, swap(slug, 'math.log(s)', 'math.log2(s)', 'python').replace('m + math.log2(s) - row[labels[i]]', '(m + math.log(s) - row[labels[i]]) / math.log(2)'), 1, 'python').message).toMatch(/in bits/);
  });
});

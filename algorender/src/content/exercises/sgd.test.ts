// B6's SGD exercises name the usual mistakes: each wrong answer below is a
// slip a learner really makes, and its verdict must say what it was. Most run
// in JavaScript; Python runs the solutions (which must agree with JavaScript
// to the last bit) and some of the slips.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { gradOn, lossOn } from '@/algorithms/ml/sgd';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { minibatches, sgdStep, STEP_TESTS, type BatchSlip, type StepSlip } from './sgd';

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
  it('cuts shuffled orders into batches, and every slip makes different batches', () => {
    const input = { n: 10, batch: 4, epochs: 2, seed: 7 };
    const right = minibatches(input);
    expect(right.map((b) => b.length)).toEqual([4, 4, 2, 4, 4, 2]);
    for (const e of [0, 1]) expect(right.slice(3 * e, 3 * e + 3).flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(right.slice(0, 3)).not.toEqual(right.slice(3));
    const slips: BatchSlip[] = ['once', 'restart', 'frozen', 'sattolo', 'naive', 'divide-first', 'drop-short', 'last-epoch'];
    const all = [right, minibatches(input, 'right', true), ...slips.map((s) => minibatches(input, s))].map((b) => JSON.stringify(b));
    expect(new Set(all).size).toBe(all.length);
    // Sattolo's shuffle never leaves a point where it was.
    for (const seed of [1, 2, 3, 4, 5]) minibatches({ n: 9, batch: 9, epochs: 1, seed }, 'sattolo')[0].forEach((v, i) => expect(v).not.toBe(i));
  });

  it('one SGD step is gradient descent on the batch’s loss, and every slip differs', () => {
    for (const { input } of STEP_TESTS) {
      const s = sgdStep(input);
      const xs = input.xs;
      const idx = input.batch;
      // The visualiser's loss and gradient, on the same points, give the same step.
      if (xs.length === 32) {
        const [gw, gb] = gradOn(input.w, input.b, idx);
        expect(s.w).toBeCloseTo(input.w - input.lr * gw, 12);
        expect(s.b).toBeCloseTo(input.b - input.lr * gb, 12);
        if (idx.length === 32) expect(lossOn(s.w, s.b)).toBeLessThan(lossOn(input.w, input.b));
      }
    }
    const input = STEP_TESTS[1].input;
    const slips: StepSlip[] = ['sum', 'climb', 'w-first', 'per-point', 'no-two', 'all', 'divide-n', 'no-x'];
    const all = [sgdStep(input), ...slips.map((s) => sgdStep(input, s))].map((r) => `${r.w},${r.b}`);
    expect(new Set(all).size).toBe(all.length);
    // The made-up example by hand: errors −2 and −7, gradients (2·(−2)·1 + 2·(−7)·3)/2 = −23 and (−4 − 14)/2 = −9.
    const hand = sgdStep(STEP_TESTS[0].input);
    expect(hand.errors).toEqual([-2, -7]);
    expect([hand.w, hand.b]).toEqual([0 + 0.05 * 23, 0 + 0.05 * 9]);
  });
});

describe('B6’s SGD exercises explain the usual mistakes', () => {
  it('every solution passes every test', () => {
    for (const slug of ['minibatches', 'sgd-step']) {
      const exercise = getExercise(slug)!;
      expect(exercise.visualiser).toBe('sgd');
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.typescript, i, 'typescript'), `${slug} ${i} ts`).toMatchObject({ pass: true }));
    }
  });

  it('minibatches: the short batch, reshuffling, the generator, the range of j', () => {
    const slug = 'minibatches';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).message).toMatch(/batches is empty/);
    const cut = 'for (let start = 0; start < n; start += batch) {';
    expect(verdict(slug, swap(slug, cut, 'for (let start = 0; start + batch <= n; start += batch) {')).message).toMatch(/short batch|last batch of each epoch has 2/);
    expect(verdict(slug, swap(slug, '  for (let epoch = 0; epoch < epochs; epoch++) {\n    for (let i', '  for (let epoch = 0; epoch < epochs; epoch++) {\n    if (epoch === 0) for (let i')).message).toMatch(/same order/);
    expect(verdict(slug, swap(slug, '  for (let epoch = 0; epoch < epochs; epoch++) {\n', '  for (let epoch = 0; epoch < epochs; epoch++) {\n    state = seed;\n')).message).toMatch(/state = seed again/);
    expect(verdict(slug, swap(slug, 'state = nextState(state);\n      const j = Math.floor(state /', 'const j = Math.floor(nextState(state) /')).message).toMatch(/never kept it/);
    expect(verdict(slug, swap(slug, '* (i + 1))', '* i)')).message).toMatch(/0 to i − 1/);
    expect(verdict(slug, swap(slug, '* (i + 1))', '* n)')).message).toMatch(/whole list/);
    expect(verdict(slug, swap(slug, '      state = nextState(state);\n      const j = Math.floor(state / 2147483647 * (i + 1));', '      const j = Math.floor(state / 2147483647 * (i + 1));\n      state = nextState(state);')).message).toMatch(/divided before stepping/);
    expect(verdict(slug, swap(slug, '    for (let start', '    batches.length = 0;\n    for (let start')).message).toMatch(/Only the last epoch/);
    expect(verdict(slug, swap(slug, 'batches.push(order.slice(start, start + batch));', 'batches.push(...order.slice(start, start + batch));')).message).toMatch(/flat list/);
    // Starting each epoch from 0, 1, … n − 1 is a fair shuffle too.
    const fresh = swap(slug, '  for (let epoch = 0; epoch < epochs; epoch++) {\n', '  for (let epoch = 0; epoch < epochs; epoch++) {\n    for (let k = 0; k < n; k++) order[k] = k;\n');
    expect(verdict(slug, fresh)).toMatchObject({ pass: true });
  });

  it('sgd-step: averaging, the sign, the order of updates, the 2, the batch, the x', () => {
    const slug = 'sgd-step';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).pass).toBe(false);
    expect(verdict(slug, swap(slug, 'gradW = gradW / batch.length;\n  gradB = gradB / batch.length;\n', ''), 1).message).toMatch(/never divided by 4/);
    expect(verdict(slug, swap(slug, 'return [w - lr * gradW, b - lr * gradB];', 'return [w + lr * gradW, b + lr * gradB];'), 1).message).toMatch(/went uphill/);
    expect(verdict(slug, swap(slug, 'const e = w * xs[i] + b - ys[i];', 'const e = ys[i] - (w * xs[i] + b);'), 1).message).toMatch(/went uphill/);
    expect(verdict(slug, swap(slug, '2 * e * xs[i]', 'e * xs[i]').replace('gradB + 2 * e', 'gradB + e'), 1).message).toMatch(/half as long/);
    expect(verdict(slug, swap(slug, 'k < batch.length; k++) {\n    const i = batch[k];', 'k < xs.length; k++) {\n    const i = k;').replace('gradW = gradW / batch.length;\n  gradB = gradB / batch.length;', 'gradW = gradW / xs.length;\n  gradB = gradB / xs.length;').replace('errors[k] = e;', 'if (k < batch.length) errors[k] = e;'), 1).message).toMatch(/full-batch step/);
    expect(verdict(slug, swap(slug, 'gradW = gradW / batch.length;\n  gradB = gradB / batch.length;', 'gradW = gradW / xs.length;\n  gradB = gradB / xs.length;'), 1).message).toMatch(/divided by 32/);
    expect(verdict(slug, swap(slug, 'gradW = gradW + 2 * e * xs[i];', 'gradW = gradW + 2 * e;'), 1).message).toMatch(/b is right but w is not/);
    const perPoint = swap(slug, '    gradB = gradB + 2 * e;\n  }\n  gradW = gradW / batch.length;\n  gradB = gradB / batch.length;\n  return [w - lr * gradW, b - lr * gradB];', '    gradB = gradB + 2 * e;\n    w = w - lr * 2 * e * xs[i];\n    b = b - lr * 2 * e;\n  }\n  return [w, b];');
    expect(verdict(slug, perPoint, 1).message).toMatch(/after every point/);
    const wFirst = swap(
      slug,
      '  gradW = gradW / batch.length;\n  gradB = gradB / batch.length;\n  return [w - lr * gradW, b - lr * gradB];',
      '  gradW = gradW / batch.length;\n  w = w - lr * gradW;\n  gradB = 0;\n  for (const i of batch) gradB = gradB + 2 * (w * xs[i] + b - ys[i]);\n  gradB = gradB / batch.length;\n  return [w, b - lr * gradB];',
    );
    expect(verdict(slug, wFirst, 1).message).toMatch(/updated w before/);
    expect(verdict(slug, swap(slug, '    errors[k] = e;\n', ''), 1).message).toMatch(/errors is still all 0/);
    expect(verdict(slug, swap(slug, 'errors[k] = e;', 'errors[k] = -e;'), 1).message).toMatch(/y − \(w·x \+ b\)/);
  });

  it('in Python: the same numbers to the last bit, and the same slips named', () => {
    for (const slug of ['minibatches', 'sgd-step']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => {
        const py = run(slug, exercise.solution.python, i, 'python');
        expect(exercise.check(exercise.tests[i].input, py), `${slug} ${i}`).toMatchObject({ pass: true });
        expect(py.returned).toEqual(run(slug, exercise.solution.javascript, i).returned);
      });
    }
    const py = (slug: string, from: string, to: string, test = 0) => verdict(slug, swap(slug, from, to, 'python'), test, 'python').message;
    expect(py('minibatches', 'for start in range(0, n, batch):', 'for start in range(0, n - batch + 1, batch):')).toMatch(/last batch of each epoch has 2/);
    expect(py('minibatches', '* (i + 1))', '* i)')).toMatch(/0 to i − 1/);
    expect(py('sgd-step', '    grad_w = grad_w / len(batch)\n    grad_b = grad_b / len(batch)\n', '', 1)).toMatch(/never divided by 4/);
    expect(py('sgd-step', 'return [w - lr * grad_w, b - lr * grad_b]', 'return [w + lr * grad_w, b + lr * grad_b]', 1)).toMatch(/went uphill/);
  });
});

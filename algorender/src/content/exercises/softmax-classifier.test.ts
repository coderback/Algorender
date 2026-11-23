// Milestone project M3 ("A classifier, judged honestly") names the usual
// mistakes: each wrong answer below is a slip a learner really makes, and its
// verdict must say what it was. Most run in JavaScript; Python runs the
// solutions, which must agree with JavaScript within the tolerance the checks
// allow (exp may part in the last bit), and some slips.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { LONG_MS } from '@/testing/timing';
import { getExercise, testRequest } from '.';
import {
  accuracyOf,
  confusionOf,
  CONFUSION_TESTS,
  crossValidateOf,
  CV_TESTS,
  DATA,
  kFoldOf,
  logitsOf,
  meanLossOf,
  predictOf,
  softmaxOf,
  softmaxStep,
  trainSoftmax,
  TRAIN_TESTS,
  type CvSlip,
  type StepSlip,
} from './softmax-classifier';

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
  expect(code, from).toContain(from);
  return code.split(from).join(to);
};

describe('the reference maths', () => {
  it('the data: 90 points, 30 of each class, overlapping', () => {
    expect(DATA.X.length).toBe(90);
    expect([0, 1, 2].map((c) => DATA.y.filter((v) => v === c).length)).toEqual([30, 30, 30]);
    expect(DATA.X.flat().every((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-9)).toBe(true);
  });

  it('softmax sums to 1, survives big logits, and the step’s gradient matches measured slopes', () => {
    const p = softmaxOf([1000, 999, 998]);
    expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    expect(p[0]).toBeCloseTo(1 / (1 + Math.exp(-1) + Math.exp(-2)), 12);
    // A step of size lr moves each weight by −lr × the gradient of the batch's mean loss.
    const input = { ...TRAIN_TESTS[0].input, W: [[0.4, 1.1], [-0.9, -0.5], [0.6, -0.7]], b: [0.1, -0.2, 0.05], batch: [5, 17, 33, 2], lr: 1 };
    const sub = { X: input.batch.map((i) => DATA.X[i]), y: input.batch.map((i) => DATA.y[i]) };
    const after = softmaxStep(input);
    const h = 1e-6;
    for (let c = 0; c < 3; c++) {
      for (let j = 0; j < 2; j++) {
        const up = input.W.map((r) => [...r]);
        const down = input.W.map((r) => [...r]);
        up[c][j] += h;
        down[c][j] -= h;
        const slope = (meanLossOf(up, input.b, sub.X, sub.y) - meanLossOf(down, input.b, sub.X, sub.y)) / (2 * h);
        expect(input.W[c][j] - after.W[c][j]).toBeCloseTo(slope, 6);
      }
    }
  });

  it('every step slip makes a different step', () => {
    const slips: StepSlip[] = ['right', 'no-onehot', 'climb', 'sum', 'divide-all', 'per-point', 'no-softmax'];
    const input = getExercise('softmax-step')!.tests[3].input;
    const all = slips.map((s) => JSON.stringify(softmaxStep(input, s)));
    expect(new Set(all).size).toBe(slips.length);
  });

  it('training lowers the loss, and the model beats guessing but not perfectly', () => {
    const m = trainSoftmax(TRAIN_TESTS[0].input);
    expect(m.losses[0]).toBeLessThan(Math.log(3));
    expect(m.losses.at(-1)!).toBeLessThan(m.losses[0]);
    const acc = accuracyOf(m.W, m.b, DATA.X, DATA.y);
    expect(acc).toBeGreaterThan(0.6);
    expect(acc).toBeLessThan(1);
  });

  it('predict is the biggest logit, the first on a tie; the confusion matrix counts every point once', () => {
    expect(predictOf([[0, 0], [0, 0]], [0, 0], [1, 1])).toBe(0);
    expect(predictOf([[0, 0], [1, 0]], [0, 0], [1, 1])).toBe(1);
    for (const { input } of CONFUSION_TESTS) {
      const { C, accuracy } = confusionOf(input);
      expect(C.flat().reduce((s, v) => s + v, 0)).toBe(input.X.length);
      expect(accuracy).toBe(input.X.filter((x, i) => predictOf(input.W, input.b, x) === input.y[i]).length / input.X.length);
      // The tests' points are argmax-safe: no two logits within a hair of each other, so exp's last bit can't flip a prediction.
      for (const x of input.X) {
        const z = [...logitsOf(input.W, input.b, x)].sort((a, b) => b - a);
        if (z[0] !== z[1]) expect(z[0] - z[1]).toBeGreaterThan(1e-6);
      }
    }
  });

  it('k_fold: contiguous, every index once, sizes within one of each other', () => {
    for (const [n, k] of [[11, 3], [90, 5], [6, 6], [7, 2]]) {
      const folds = kFoldOf(n, k);
      expect(folds.flat()).toEqual(Array.from({ length: n }, (_, i) => i));
      const sizes = folds.map((f) => f.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
    expect(kFoldOf(11, 3).map((f) => f.length)).toEqual([4, 4, 3]);
  });

  it('cross-validation scores lower than the training score, and every slip gives different scores', { timeout: LONG_MS }, () => {
    const input = CV_TESTS[0].input;
    const scores = crossValidateOf(input);
    const all = trainSoftmax({ ...input });
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    expect(mean).toBeLessThan(accuracyOf(all.W, all.b, input.X, input.y));
    const slips: CvSlip[] = ['right', 'no-shuffle', 'leak', 'swapped'];
    for (const { input: t } of CV_TESTS) {
      const each = slips.map((s) => JSON.stringify(crossValidateOf(t, s)));
      expect(new Set(each).size, JSON.stringify(t).slice(0, 40)).toBe(slips.length);
    }
  });
});

describe('every slip is named', () => {
  it('one SGD step', () => {
    const slug = 'softmax-step';
    for (const test of [0, 2, 3]) expect(verdict(slug, getExercise(slug)!.solution.javascript, test).pass).toBe(true);
    const expectSays = (code: string, words: RegExp, test = 3) => {
      const v = verdict(slug, code, test);
      expect(v.pass, v.message).toBe(false);
      expect(v.message).toMatch(words);
    };
    expectSays(swap(slug, 'p[c] - (c === y[i] ? 1 : 0)', 'p[c]'), /true class/);
    expectSays(swap(slug, 'w - (lr * gradW[c][j]) / n', 'w + (lr * gradW[c][j]) / n').split('v - (lr * gradB[c]) / n').join('v + (lr * gradB[c]) / n'), /uphill/);
    expectSays(swap(slug, 'const n = batch.length;', 'const n = 1;'), /never divided/);
    expectSays(swap(slug, 'const n = batch.length;', 'const n = X.length;'), /divide by len\(batch\)/);
    expectSays(swap(slug, 'const g = p[c] - (c === y[i] ? 1 : 0);', 'const g = z[c] - (c === y[i] ? 1 : 0);'), /logits/);
    expectSays(swap(slug, 'losses[k] = Math.round(-Math.log(p[y[i]]) * 1e6) / 1e6;', ''), /losses is still all 0/);
    // Python: the solution passes, and a slip is named the same way.
    expect(verdict(slug, getExercise(slug)!.solution.python, 3, 'python').pass).toBe(true);
    const py = swap(slug, 'g = p[c] - (1 if c == y[i] else 0)', 'g = p[c]', 'python');
    expect(verdict(slug, py, 3, 'python').message).toMatch(/true class/);
  });

  it('training', () => {
    const slug = 'train-softmax';
    const v0 = verdict(slug, getExercise(slug)!.solution.javascript);
    expect(v0.pass, v0.message).toBe(true);
    expect(v0.message).toMatch(/classifies \d+(\.\d)?% of the points it was trained on/);
    expect(verdict(slug, swap(slug, '[W, b] = softmaxStep(W, b, X, y, batches[t], lr);', 'softmaxStep(W, b, X, y, batches[t], lr);')).message).toMatch(/still all zeros/);
    expect(verdict(slug, swap(slug, 'for (let t = 0; t < batches.length; t++) {', 'for (let t = 0; t < perEpoch; t++) {')).message).toMatch(/Only the first epoch/);
    const before = swap(slug, `    [W, b] = softmaxStep(W, b, X, y, batches[t], lr);
    if ((t + 1) % perEpoch === 0) {
      losses[(t + 1) / perEpoch - 1] = Math.round(meanLoss(W, b, X, y) * 1e6) / 1e6;
    }`, `    if (t % perEpoch === 0) {
      losses[t / perEpoch] = Math.round(meanLoss(W, b, X, y) * 1e6) / 1e6;
    }
    [W, b] = softmaxStep(W, b, X, y, batches[t], lr);`);
    expect(verdict(slug, before).message).toMatch(/before its epoch’s steps/);
    expect(verdict(slug, swap(slug, 'total += -Math.log(p[y[i]]);', 'total += -Math.log(p[0]);')).message).toMatch(/losses\[0\] should be/);
    // Python trains to the same weights, within the tolerance.
    for (const test of [0, 1]) {
      const v = verdict(slug, getExercise(slug)!.solution.python, test, 'python');
      expect(v.pass, v.message).toBe(true);
    }
  });

  it('the confusion matrix', () => {
    const slug = 'confusion-matrix';
    for (const test of [0, 2, 3]) expect(verdict(slug, getExercise(slug)!.solution.javascript, test).pass).toBe(true);
    expect(verdict(slug, swap(slug, 'C[y[i]][guess] = C[y[i]][guess] + 1;', 'C[guess][y[i]] = C[guess][y[i]] + 1;')).message).toMatch(/on its side/);
    expect(verdict(slug, swap(slug, 'if (z > bestZ) {', 'if (z >= bestZ) {'), 2).message).toMatch(/On a tie/);
    expect(verdict(slug, swap(slug, 'let bestZ = -Infinity;', 'let bestZ = Infinity;').split('if (z > bestZ) {').join('if (z < bestZ) {')).message).toMatch(/smallest logit/);
    expect(verdict(slug, swap(slug, 'const accuracy = correct / X.length;', 'const accuracy = correct / classes;')).message).toMatch(/not the number of classes/);
    expect(verdict(slug, swap(slug, 'precision.push(predicted > 0 ? C[k][k] / predicted : 0);', 'precision.push(actual > 0 ? C[k][k] / actual : 0);').split('recall.push(actual > 0 ? C[k][k] / actual : 0);').join('recall.push(predicted > 0 ? C[k][k] / predicted : 0);'), 3).message).toMatch(/swapped/);
    // The model that never says class 2: its precision for class 2 has nothing to divide by.
    expect(verdict(slug, swap(slug, 'precision.push(predicted > 0 ? C[k][k] / predicted : 0);', 'precision.push(C[k][k] / predicted);'), 3).pass).toBe(false);
    expect(verdict(slug, getExercise(slug)!.solution.python, 0, 'python').pass).toBe(true);
  });

  it('cross-validation', { timeout: LONG_MS }, () => {
    const slug = 'cross-validate';
    const v0 = verdict(slug, getExercise(slug)!.solution.javascript);
    expect(v0.pass, v0.message).toBe(true);
    expect(v0.message).toMatch(/never saw it/);
    expect(verdict(slug, swap(slug, 'const [W, b] = train(rest.map((i) => X[i]), rest.map((i) => y[i]), classes, epochs, batchSize, lr, seed);', 'const [W, b] = train(X, y, classes, epochs, batchSize, lr, seed);')).message).toMatch(/its own fold included/);
    expect(
      verdict(slug, swap(slug, 'const [W, b] = train(rest.map((i) => X[i]), rest.map((i) => y[i]), classes, epochs, batchSize, lr, seed);', 'const [W, b] = train(held.map((i) => X[i]), held.map((i) => y[i]), classes, epochs, batchSize, lr, seed);').split('for (const i of held) {').join('for (const i of rest) {').split('scores[f] = correct / held.length;').join('scores[f] = correct / rest.length;')).message,
    ).toMatch(/other way/);
    expect(verdict(slug, swap(slug, 'const order = minibatches(n, n, 1, seed)[0];', 'const order = Array.from({ length: n }, (_, i) => i);')).message).toMatch(/Shuffle first/);
    expect(verdict(slug, getExercise(slug)!.solution.python, 2, 'python').pass).toBe(true);
  });
});

// M2, micrograd from scratch: the parts' checks pass the reference and name
// the usual mistakes, each made here in real code and run the way the
// workspace judges it; each part's starter carries the earlier parts.

import { describe, expect, it } from 'vitest';
import { Value } from '@/ml/autograd';
import { runJs } from '@/workspace/js/runtime';
import { getExercise, testRequest } from '.';
import { ENGINE_PY, engineJs, numericGrads, opsGrads, slipGrads, trainReference, type OpsInput, type TrainInput } from './autograd';
import { backwardJs, backwardPy, valueJs, valuePy } from './ml';

const PARTS = ['value-backward', 'topological-backward', 'value-ops', 'gradient-check', 'train-neuron'];

function verdict(slug: string, code: string, test = 0) {
  const exercise = getExercise(slug)!;
  const input = exercise.tests[test].input;
  return exercise.check(input, runJs(testRequest(exercise, 'javascript', code, input)));
}

const swap = (slug: string, from: string, to: string) => {
  const code = getExercise(slug)!.solution.javascript;
  expect(code).toContain(from);
  return code.split(from).join(to);
};

/** A training loop on the reference engine: the plain-number reference must agree with it. */
function trainOnEngine({ xs, ys, w, b, lr, steps }: TrainInput): number[] {
  const losses: number[] = [];
  for (let s = 0; s < steps; s++) {
    const wv = new Value(w);
    const bv = new Value(b);
    let loss = new Value(0);
    xs.forEach((x, i) => {
      loss = loss.add(wv.mul(x).add(bv).tanh().sub(ys[i]).pow(2));
    });
    loss = loss.div(xs.length);
    losses.push(loss.data);
    loss.backward();
    w -= lr * wv.grad;
    b -= lr * bv.grad;
  }
  return losses;
}

describe('the reference maths', () => {
  it('the learner’s engine without slips matches src/ml/autograd.ts', () => {
    for (const { input } of getExercise('value-ops')!.tests as { input: OpsInput }[]) {
      const want = opsGrads(input);
      slipGrads(input, {}).forEach((g, i) => expect(g).toBeCloseTo(want[i], 12));
    }
  });

  it('central differences agree with backward() to about 1e-6 at h = 1e-5', () => {
    for (const { input } of getExercise('gradient-check')!.tests) {
      const engine = opsGrads(input);
      const tolerance = input.h <= 1e-5 ? 1e-6 : input.h <= 1e-4 ? 1e-5 : 1e-4;
      numericGrads(input).forEach((g, i) => expect(Math.abs(g - engine[i])).toBeLessThan(tolerance));
    }
  });

  it('the training reference matches training on src/ml/autograd.ts, and the loss falls', () => {
    for (const { input } of getExercise('train-neuron')!.tests as { input: TrainInput }[]) {
      const { losses } = trainReference(input);
      const engine = trainOnEngine(input);
      losses.forEach((l, i) => expect(l).toBeCloseTo(engine[i], 12));
      if (input.steps > 1) expect(losses[losses.length - 1]).toBeLessThan(losses[0]);
    }
  });
});

describe('M2’s parts run judged on the project budget', () => {
  it('every part, the first two from ml.ts included', () => {
    for (const slug of PARTS) expect(getExercise(slug)?.judge, slug).toEqual({ budget: 'project' });
  });

  it('every part’s starter carries the earlier parts', () => {
    const ops = getExercise('value-ops')!;
    expect(ops.starter.python).toContain(valuePy(true));
    expect(ops.starter.python).toContain(backwardPy(true));
    expect(ops.starter.javascript).toContain(backwardJs(true, false));
    expect(ops.starter.javascript).toContain(valueJs(true, false).replace(/\}\n$/, ''));
    expect(ops.starter.typescript).toContain(valueJs(true, true).replace(/\}\n$/, ''));
    for (const slug of ['gradient-check', 'train-neuron']) {
      const part = getExercise(slug)!;
      expect(part.starter.python, slug).toContain(ENGINE_PY);
      expect(part.starter.javascript, slug).toContain(engineJs(false));
      expect(part.starter.typescript, slug).toContain(engineJs(true));
      // Part 3's solution is the engine they carry.
      expect(ENGINE_PY).toContain(ops.solution.python.slice(ops.solution.python.indexOf('    def __pow__'), ops.solution.python.indexOf('def backward')));
    }
  });
});

describe('M2’s checks pass the reference', () => {
  for (const slug of PARTS.slice(2)) {
    it(slug, () => {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), exercise.tests[i].name).toMatchObject({ pass: true }));
    });
  }
});

describe('M2’s checks explain the usual mistakes', () => {
  it('value-ops: pow one power too high, relu leaking, exp’s input, = for +=', () => {
    expect(verdict('value-ops', swap('value-ops', 'this.grad += k * this.data ** (k - 1) * out.grad;', 'this.grad += k * this.data ** k * out.grad;'), 0).message).toMatch(/k·x\^\(k−1\)/);
    const leak = swap('value-ops', 'this.grad += (this.data > 0 ? 1 : 0) * out.grad;', 'this.grad += out.grad;');
    expect(verdict('value-ops', leak, 2).message).toMatch(/relu.*negative/);
    expect(verdict('value-ops', leak, 3).message).toMatch(/relu.*negative/);
    expect(verdict('value-ops', swap('value-ops', 'this.grad += e * out.grad;', 'this.grad += this.data * out.grad;'), 4).message).toMatch(/own derivative/);
    const assign = (from: string, op: string, test: number) => expect(verdict('value-ops', swap('value-ops', from, from.replace('+=', '=')), test).message).toMatch(new RegExp(`In ${op}’s _backward.*\\+=`));
    assign('this.grad += (this.data > 0 ? 1 : 0) * out.grad;', 'relu', 2);
    assign('this.grad += e * out.grad;', 'exp', 4);
    assign('this.grad += k * this.data ** (k - 1) * out.grad;', 'pow', 8);
    // The starter's stubs run, and fail with the general advice.
    expect(verdict('value-ops', getExercise('value-ops')!.starter.javascript, 0).message).toMatch(/should be/);
  });

  it('gradient-check: dividing by h, one-sided, not putting vals[i] back, every leaf at once', () => {
    expect(verdict('gradient-check', swap('gradient-check', 'grads.push((up - down) / (2 * h));', 'grads.push((up - down) / h);')).message).toMatch(/twice too big/);
    const forward = swap('gradient-check', 'grads.push((up - down) / (2 * h));', 'grads.push((up - build(expr, vals)[1].data) / h);');
    expect(verdict('gradient-check', forward).message).toMatch(/one-sided/);
    expect(verdict('gradient-check', forward, 6).message).toMatch(/one-sided/);
    const notRestored = swap('gradient-check', 'vals[i] = old; // put it back before nudging the next leaf', '');
    expect(verdict('gradient-check', notRestored).message).toMatch(/put vals\[i\] back.*−h/);
    const allAtOnce = getExercise('gradient-check')!.solution.javascript.replace(
      /function numericGrads[\s\S]*?\n\}\n/,
      `function numericGrads(expr, vals, h) {
  const up = build(expr, vals.map((v) => v + h))[1];
  const down = build(expr, vals.map((v) => v - h))[1];
  return vals.map(() => (up.data - down.data) / (2 * h));
}
`,
    );
    expect(allAtOnce).toContain('vals.map((v) => v + h)');
    expect(verdict('gradient-check', allAtOnce).message).toMatch(/nudged at once/);
    expect(verdict('gradient-check', getExercise('gradient-check')!.starter.javascript).message).toMatch(/still 0/);
  });

  it('train-neuron: piled-up gradients, uphill, the sum, no bias, updating before backward', () => {
    const pileUp = swap('train-neuron', 'const wv = new Value(w); // fresh leaves, so their gradients start at 0\n    const bv = new Value(b);\n', '')
      .replace('const losses = [];\n', 'const losses = [];\n  const wv = new Value(w);\n  const bv = new Value(b);\n')
      .replace('w = w - lr * wv.grad; // downhill\n    b = b - lr * bv.grad;', 'wv.data = wv.data - lr * wv.grad;\n    bv.data = bv.data - lr * bv.grad;');
    expect(pileUp).toContain('wv.data = wv.data - lr * wv.grad;');
    expect(verdict('train-neuron', pileUp).message).toMatch(/pile up/);
    const uphill = swap('train-neuron', 'w = w - lr * wv.grad;', 'w = w + lr * wv.grad;').replace('b = b - lr * bv.grad;', 'b = b + lr * bv.grad;');
    expect(verdict('train-neuron', uphill).message).toMatch(/uphill/);
    expect(verdict('train-neuron', swap('train-neuron', 'loss = loss.div(new Value(xs.length)); // the mean squared error', '')).message).toMatch(/sum/);
    expect(verdict('train-neuron', swap('train-neuron', 'b = b - lr * bv.grad;', ''), 1).message).toMatch(/b never moves/);
    const early = swap('train-neuron', 'backward(loss);\n    w = w - lr * wv.grad; // downhill\n    b = b - lr * bv.grad;', 'w = w - lr * wv.grad;\n    b = b - lr * bv.grad;\n    backward(loss);');
    expect(verdict('train-neuron', early).message).toMatch(/never changes/);
    expect(verdict('train-neuron', getExercise('train-neuron')!.starter.javascript).message).toMatch(/one loss per step/);
  });
});

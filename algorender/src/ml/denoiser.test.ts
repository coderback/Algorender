import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/random';
import { Value } from './autograd';
import { alphaBars, betas, features, forward, initNet, INPUTS, lossAndGradients, makeExample, noised, predictClean, reverseStep, SHAPES, T, trainNet, type Example, type Net } from './denoiser';

/** The same loss built from autograd Values, to check the hand-written backprop. */
function autogradLoss(net: Net, batch: readonly Example[]) {
  const W = net.W.map((layer) => layer.map((row) => row.map((w) => new Value(w))));
  const b = net.b.map((row) => row.map((v) => new Value(v)));
  let loss = new Value(0);
  for (const ex of batch) {
    let acts: Value[] = ex.input.map((x) => new Value(x));
    W.forEach((layer, l) => {
      const last = l === W.length - 1;
      acts = layer.map((row, j) => {
        const z = row.reduce((sum, w, i) => sum.add(w.mul(acts[i])), b[l][j]);
        return last ? z : z.relu();
      });
    });
    loss = loss.add(acts[0].sub(ex.noise[0]).pow(2).add(acts[1].sub(ex.noise[1]).pow(2)).mul(0.5));
  }
  loss = loss.mul(1 / batch.length);
  loss.backward();
  return { loss: loss.data, gW: W.map((layer) => layer.map((row) => row.map((w) => w.grad))), gb: b.map((row) => row.map((v) => v.grad)) };
}

describe('denoiser', () => {
  it('has a schedule whose ᾱ falls from 1 to nearly 0', () => {
    expect(alphaBars[0]).toBe(1);
    for (let t = 1; t <= T; t++) {
      expect(betas[t]).toBeGreaterThan(betas[t - 1]);
      expect(alphaBars[t]).toBeLessThan(alphaBars[t - 1]);
      expect(alphaBars[t]).toBeCloseTo(alphaBars[t - 1] * (1 - betas[t]), 12);
    }
    expect(alphaBars[T]).toBeLessThan(0.01);
  });

  it('computes the same loss and gradients as the autograd engine', () => {
    const net = initNet([5, 4], 3);
    // Shift the biases so a mix of units is on and off.
    net.b = net.b.map((row) => row.map((_, j) => (j % 2 ? 0.3 : -0.1)));
    const rng = createRng(9);
    const batch = Array.from({ length: 6 }, () => makeExample(rng));
    const fast = lossAndGradients(net, batch);
    const slow = autogradLoss(net, batch);
    expect(fast.loss).toBeCloseTo(slow.loss, 12);
    fast.gW.forEach((layer, l) => layer.forEach((row, j) => row.forEach((g, i) => expect(g).toBeCloseTo(slow.gW[l][j][i], 12))));
    fast.gb.forEach((row, l) => row.forEach((g, j) => expect(g).toBeCloseTo(slow.gb[l][j], 12)));
  });

  it('builds inputs of the right size with one-hot shapes and time tents that sum to 1', () => {
    for (const shape of SHAPES) {
      for (const t of [1, 7, 20, T]) {
        const f = features([0.5, -1], t, shape);
        expect(f).toHaveLength(INPUTS);
        const time = f.slice(2, INPUTS - SHAPES.length);
        expect(time.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(f.slice(INPUTS - SHAPES.length)).toEqual(SHAPES.map((s) => (s === shape ? 1 : 0)));
      }
    }
  });

  it('inverts a step exactly when the predicted noise is the true one and no fresh noise is added', () => {
    const x0 = [1.2, -0.7] as const;
    const eps = [0.4, 1.1] as const;
    for (const t of [1, 10, T]) {
      const xt = noised(x0, eps, t);
      const clean = predictClean(xt, eps, t);
      expect(clean[0]).toBeCloseTo(x0[0], 10);
      expect(clean[1]).toBeCloseTo(x0[1], 10);
    }
    // At t = 1 the reverse step has no fresh noise: it lands on x₀ exactly when ε̂ = ε.
    const back = reverseStep(noised(x0, eps, 1), eps, 1, [5, 5]);
    expect(back[0]).toBeCloseTo(x0[0], 10);
    expect(back[1]).toBeCloseTo(x0[1], 10);
  });

  it('trains deterministically, and lowers the loss', () => {
    const config = { hidden: [8], steps: 200, batch: 16, lr: 0.01, finalLr: 0.001, seed: 4 };
    const a = trainNet(config);
    const b = trainNet(config);
    expect(a.net).toEqual(b.net);
    const rng = createRng(77);
    const test = Array.from({ length: 400 }, () => makeExample(rng));
    expect(lossAndGradients(a.net, test).loss).toBeLessThan(lossAndGradients(initNet([8], 4), test).loss);
    expect(forward(a.net, test[0].input).at(-1)).toHaveLength(2);
  });
});

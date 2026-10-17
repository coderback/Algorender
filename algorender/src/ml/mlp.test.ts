import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Value } from './autograd';
import { dataset } from './datasets';
import { accuracy, bce, forward, initMlp, lossAndGradients, meanLoss, train, type Mlp, type Sample } from './mlp';

/** The same network and loss built from autograd Values: returns every parameter as a Value, in W then b order. */
function valueLoss(m: Mlp, data: readonly Sample[]): { loss: Value; W: Value[][][]; b: Value[][] } {
  const W = m.W.map((layer) => layer.map((row) => row.map((w) => new Value(w))));
  const b = m.b.map((row) => row.map((v) => new Value(v)));
  let total: Value = new Value(0);
  for (const s of data) {
    let acts: Value[] = [new Value(s.x), new Value(s.y)];
    for (let l = 0; l < W.length; l++) {
      const last = l === W.length - 1;
      acts = W[l].map((row, j) => {
        const z = row.reduce((sum: Value, w, i) => sum.add(w.mul(acts[i])), b[l][j]);
        return last ? z : z.tanh();
      });
    }
    const p = acts[0].sigmoid();
    const term = s.label ? p.log().neg() : p.neg().add(1).log().neg();
    total = total.add(term);
  }
  return { loss: total.mul(1 / data.length), W, b };
}

const shapes = fc.constantFrom<number[]>([], [2], [3], [4], [3, 2]);
const samples = fc.array(
  fc.record({ x: fc.double({ min: -2, max: 2, noNaN: true }), y: fc.double({ min: -2, max: 2, noNaN: true }), label: fc.constantFrom(0, 1) }),
  { minLength: 1, maxLength: 8 },
);

describe('mlp', () => {
  it('backprops exactly what the autograd engine computes', () => {
    fc.assert(
      fc.property(shapes, fc.integer({ min: 0, max: 1000 }), samples, (hidden, seed, data) => {
        const m = initMlp(hidden, seed);
        // Non-zero biases, so their gradients are tested away from the starting point too.
        m.b = m.b.map((row, l) => row.map((_, j) => 0.1 * (l + 1) - 0.05 * j));
        const mine = lossAndGradients(m, data);
        const ref = valueLoss(m, data);
        ref.loss.backward();
        expect(mine.loss).toBeCloseTo(ref.loss.data, 9);
        ref.W.forEach((layer, l) => layer.forEach((row, j) => row.forEach((w, i) => expect(mine.gW[l][j][i]).toBeCloseTo(w.grad, 9))));
        ref.b.forEach((row, l) => row.forEach((v, j) => expect(mine.gb[l][j]).toBeCloseTo(v.grad, 9)));
      }),
      { numRuns: 60 },
    );
  });

  it('matches finite differences', () => {
    const m = initMlp([3, 2], 4);
    const data = dataset('moons', 20, 3);
    const { gW, gb } = lossAndGradients(m, data);
    const h = 1e-6;
    for (let l = 0; l < m.W.length; l++) {
      for (let j = 0; j < m.W[l].length; j++) {
        for (let i = 0; i < m.W[l][j].length; i++) {
          const w = m.W[l][j][i];
          m.W[l][j][i] = w + h;
          const up = meanLoss(m, data);
          m.W[l][j][i] = w - h;
          const down = meanLoss(m, data);
          m.W[l][j][i] = w;
          expect(gW[l][j][i]).toBeCloseTo((up - down) / (2 * h), 6);
        }
        const v = m.b[l][j];
        m.b[l][j] = v + h;
        const up = meanLoss(m, data);
        m.b[l][j] = v - h;
        const down = meanLoss(m, data);
        m.b[l][j] = v;
        expect(gb[l][j]).toBeCloseTo((up - down) / (2 * h), 6);
      }
    }
  });

  it('computes cross-entropy stably for large scores', () => {
    expect(bce(800, 1)).toBeCloseTo(0, 12);
    expect(bce(-800, 1)).toBeCloseTo(800, 9);
    expect(bce(0, 0)).toBeCloseTo(Math.log(2), 12);
  });

  it('is deterministic for a seed', () => {
    expect(initMlp([4], 9)).toEqual(initMlp([4], 9));
    expect(initMlp([4], 9)).not.toEqual(initMlp([4], 10));
    const data = dataset('xor', 40, 1);
    expect(train(initMlp([4], 2), data, { lr: 0.5, epochs: 30 }).losses).toEqual(train(initMlp([4], 2), data, { lr: 0.5, epochs: 30 }).losses);
  });

  it('learns XOR and circles', () => {
    for (const id of ['xor', 'circles'] as const) {
      const data = dataset(id, 80, 1);
      const m = initMlp([6], 1);
      const run = train(m, data, { lr: 0.5, momentum: 0.9, epochs: 400, keep: (e) => e === 400 });
      expect(run.losses[400]).toBeLessThan(run.losses[0] * 0.5);
      expect(accuracy(run.snapshots.get(400)!, data)).toBeGreaterThan(0.9);
    }
  });

  it('keeps forward activations within tanh range', () => {
    const m = initMlp([5, 3], 2);
    const acts = forward(m, [2, -2]);
    for (const layer of acts.slice(1, -1)) for (const a of layer) expect(Math.abs(a)).toBeLessThanOrEqual(1);
  });
});

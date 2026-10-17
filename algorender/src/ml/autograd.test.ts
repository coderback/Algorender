import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numericGradient, topological, Value } from './autograd';

const small = fc.double({ min: -2, max: 2, noNaN: true });

/** A fixed expression exercising every operation: tanh(a·b + c²) · exp(−d) + relu(a − d) / (1 + σ(b)) + log(c² + 1). */
function expr([a, b, c, d]: number[]): { out: Value; leaves: Value[] } {
  const leaves = [new Value(a, 'a'), new Value(b, 'b'), new Value(c, 'c'), new Value(d, 'd')];
  const [A, B, C, D] = leaves;
  const out = A.mul(B)
    .add(C.pow(2))
    .tanh()
    .mul(D.neg().exp())
    .add(A.sub(D).relu().div(B.sigmoid().add(1)))
    .add(C.pow(2).add(1).log());
  return { out, leaves };
}

describe('autograd', () => {
  it('matches finite differences on an expression using every operation', () => {
    fc.assert(
      fc.property(fc.tuple(small, small, small, small), (xs) => {
        // Keep away from relu's kink, where the derivative jumps.
        fc.pre(Math.abs(xs[0] - xs[3]) > 1e-3);
        const { out, leaves } = expr(xs);
        out.backward();
        leaves.forEach((leaf, i) => expect(leaf.grad).toBeCloseTo(numericGradient((v) => expr(v).out.data, xs, i), 5));
      }),
      { numRuns: 200 },
    );
  });

  it('accumulates gradients when a value is used more than once', () => {
    const a = new Value(3, 'a');
    const out = a.mul(a).add(a); // a² + a
    out.backward();
    expect(a.grad).toBe(7);
  });

  it('orders the graph so every value comes after its inputs', () => {
    fc.assert(
      fc.property(fc.tuple(small, small, small, small), (xs) => {
        const order = topological(expr(xs).out);
        const at = new Map(order.map((v, i) => [v, i]));
        for (const v of order) for (const input of v.inputs) expect(at.get(input)!).toBeLessThan(at.get(v)!);
      }),
    );
  });

  it('resets gradients before each backward pass', () => {
    const a = new Value(2, 'a');
    const out = a.mul(3);
    out.backward();
    out.backward();
    expect(a.grad).toBe(3);
  });
});

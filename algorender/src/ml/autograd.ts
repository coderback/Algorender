// A tiny scalar autograd engine in the spirit of micrograd. Every Value
// remembers the values it was computed from and, at forward time, the local
// derivative of itself with respect to each of them. backward() then walks the
// graph from the output in reverse topological order and applies the chain
// rule: input.grad += local × output.grad.
//
// It is deliberately small and readable: the chain-rule visualiser narrates
// these exact steps, the "build micrograd" exercises ask learners to write the
// same thing, and faster numeric code elsewhere is tested against it.

export type Op = '' | '+' | '×' | '^' | 'tanh' | 'relu' | 'exp' | 'neg' | 'log' | 'σ';

export class Value {
  data: number;
  grad = 0;
  readonly inputs: readonly Value[];
  /** ∂this/∂input for each input, fixed when the value is computed. */
  readonly locals: readonly number[];
  readonly op: Op;
  label: string;

  constructor(data: number, label = '', inputs: readonly Value[] = [], locals: readonly number[] = [], op: Op = '') {
    this.data = data;
    this.label = label;
    this.inputs = inputs;
    this.locals = locals;
    this.op = op;
  }

  static of(x: Value | number): Value {
    return x instanceof Value ? x : new Value(x, String(x));
  }

  add(other: Value | number): Value {
    const o = Value.of(other);
    return new Value(this.data + o.data, '', [this, o], [1, 1], '+');
  }

  mul(other: Value | number): Value {
    const o = Value.of(other);
    return new Value(this.data * o.data, '', [this, o], [o.data, this.data], '×');
  }

  /** this^k for a constant k. */
  pow(k: number): Value {
    return new Value(this.data ** k, '', [this], [k * this.data ** (k - 1)], '^');
  }

  neg(): Value {
    return new Value(-this.data, '', [this], [-1], 'neg');
  }

  sub(other: Value | number): Value {
    return this.add(Value.of(other).neg());
  }

  div(other: Value | number): Value {
    return this.mul(Value.of(other).pow(-1));
  }

  tanh(): Value {
    const t = Math.tanh(this.data);
    return new Value(t, '', [this], [1 - t * t], 'tanh');
  }

  sigmoid(): Value {
    const s = 1 / (1 + Math.exp(-this.data));
    return new Value(s, '', [this], [s * (1 - s)], 'σ');
  }

  relu(): Value {
    return new Value(Math.max(0, this.data), '', [this], [this.data > 0 ? 1 : 0], 'relu');
  }

  exp(): Value {
    const e = Math.exp(this.data);
    return new Value(e, '', [this], [e], 'exp');
  }

  log(): Value {
    return new Value(Math.log(this.data), '', [this], [1 / this.data], 'log');
  }

  named(label: string): this {
    this.label = label;
    return this;
  }

  /** Sets every gradient in the graph from this value: ∂this/∂v for each v. */
  backward(): Value[] {
    const order = topological(this);
    for (const v of order) v.grad = 0;
    this.grad = 1;
    for (let i = order.length - 1; i >= 0; i--) {
      const v = order[i];
      v.inputs.forEach((input, k) => {
        input.grad += v.locals[k] * v.grad;
      });
    }
    return order;
  }
}

/** Every value the output depends on, each after all of its inputs (depth-first, inputs in order). */
export function topological(output: Value): Value[] {
  const seen = new Set<Value>();
  const order: Value[] = [];
  const visit = (v: Value) => {
    if (seen.has(v)) return;
    seen.add(v);
    for (const input of v.inputs) visit(input);
    order.push(v);
  };
  visit(output);
  return order;
}

/** ∂f/∂x by central differences, to check gradients. */
export function numericGradient(f: (xs: number[]) => number, xs: readonly number[], i: number, h = 1e-6): number {
  const up = [...xs];
  const down = [...xs];
  up[i] += h;
  down[i] -= h;
  return (f(up) - f(down)) / (2 * h);
}

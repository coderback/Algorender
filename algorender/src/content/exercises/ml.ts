// "Build micrograd": the learner writes the pieces of a tiny autograd engine,
// the same one the chain-rule visualiser narrates (src/ml/autograd.ts). Each
// exercise writes its gradients into a visual array `grad`, so the run shows
// them landing one by one, and the check compares them with the reference
// engine to 1e-6.

import { Value } from '@/ml/autograd';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const TOLERANCE = 1e-6;

const fmt = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};

/** The learner's `grad` array at the end of the run, else what they returned. */
function gradsOf(result: RunResult): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === 'grad');
  const final = made && made.kind === 'array' ? result.arrays[made.array] : undefined;
  if (final) return final;
  return Array.isArray(result.returned) && result.returned.every((v) => typeof v === 'number') ? (result.returned as number[]) : null;
}

const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
const matches = (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));

const GRAD_LEGEND: Exercise['legend'] = [
  { neutral: 'A gradient not written yet (0)' },
  { mark: 'write', label: 'A gradient your code just wrote' },
];

// ───────────────────────────── 1. a neuron by hand ─────────────────────────────

export type NeuronInput = { x: [number, number]; w: [number, number]; b: number };

/** The neuron's output, handed to the learner: Python's and JavaScript's tanh can differ in the last bit. */
const neuronOut = ({ x, w, b }: NeuronInput) => Math.tanh(w[0] * x[0] + w[1] * x[1] + b);

const neuronArgs = (input: NeuronInput): Arg[] => [
  { kind: 'value', name: 'x', value: input.x },
  { kind: 'value', name: 'w', value: input.w },
  { kind: 'value', name: 'b', value: input.b },
  { kind: 'value', name: 'out', value: neuronOut(input) },
  { kind: 'array', name: 'grad', values: [0, 0, 0] },
];

/** [dw1, dw2, db] of tanh(w1·x1 + w2·x2 + b). */
export function neuronGradients(input: NeuronInput): number[] {
  const { x } = input;
  const out = neuronOut(input);
  const dz = 1 - out * out;
  return [dz * x[0], dz * x[1], dz];
}

function checkNeuron(input: NeuronInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = gradsOf(result);
  if (!got || got.length !== 3) return { pass: false, message: 'Write the three gradients into grad: grad[0] for w1, grad[1] for w2, grad[2] for b.' };
  const want = neuronGradients(input);
  if (matches(got, want)) return { pass: true, message: `dw1 = ${fmt(want[0])}, dw2 = ${fmt(want[1])}, db = ${fmt(want[2])}: the chain rule, done by hand.` };
  const { x, w, b } = input;
  const z = w[0] * x[0] + w[1] * x[1] + b;
  if (got.every((v) => v === 0)) return { pass: false, message: 'Every gradient is still 0: write your answers into grad[0], grad[1] and grad[2].' };
  if (matches(got, [x[0], x[1], 1])) return { pass: false, message: 'Those are the gradients of z = w1·x1 + w2·x2 + b, but the output is tanh(z): multiply each by tanh’s local gradient, 1 − tanh(z)².' };
  const dzFromZ = 1 - z * z;
  if (matches(got, [dzFromZ * x[0], dzFromZ * x[1], dzFromZ])) return { pass: false, message: 'Use the output of tanh in its derivative: 1 − out², where out = tanh(z), not 1 − z².' };
  const dz = 1 - Math.tanh(z) ** 2;
  if (matches(got, [dz * w[0], dz * w[1], dz])) return { pass: false, message: 'z changes by x1 for each unit of w1, so dz/dw1 is x1, not w1.' };
  const names = ['dw1', 'dw2', 'db'];
  const i = want.findIndex((v, k) => !close(got[k], v));
  return { pass: false, message: `${names[i]} should be ${fmt(want[i])}, but your code gives ${fmt(got[i])}. Chain it: (local gradient of tanh) × (how z changes with that input).` };
}

const NEURON_PY = `def neuron_grads(x, w, b, out, grad):
    # out = tanh(w[0] * x[0] + w[1] * x[1] + b), already worked out
    dz = 1 - out * out  # how out changes with z
    grad[0] = dz * x[0]  # z changes by x1 per unit of w1
    grad[1] = dz * x[1]
    grad[2] = dz  # z changes by 1 per unit of b
    return grad
`;

const NEURON_JS = `function neuronGrads(x, w, b, out, grad) {
  // out = tanh(w[0] * x[0] + w[1] * x[1] + b), already worked out
  const dz = 1 - out * out; // how out changes with z
  grad[0] = dz * x[0]; // z changes by x1 per unit of w1
  grad[1] = dz * x[1];
  grad[2] = dz; // z changes by 1 per unit of b
  return grad;
}
`;

const NEURON_SIG_TS = 'function neuronGrads(x: number[], w: number[], b: number, out: number, grad: number[]): number[] {';
const NEURON_TS = NEURON_JS.replace('function neuronGrads(x, w, b, out, grad) {', NEURON_SIG_TS);

// ───────────────────────────── shared: the Value engine ─────────────────────────────

/** Which expression the entry function builds from `vals`. */
export type ExprId = 'neuron' | 'reuse' | 'chain';
export type GraphInput = { expr: ExprId; vals: number[] };

const LEAVES: Record<ExprId, string[]> = { neuron: ['x1', 'w1', 'x2', 'w2', 'b'], reuse: ['a', 'b'], chain: ['x', 'w'] };
const CHAIN_DEPTH = 10;

const graphArgs = ({ expr, vals }: GraphInput): Arg[] => [
  { kind: 'value', name: 'expr', value: expr },
  { kind: 'value', name: 'vals', value: vals },
  { kind: 'array', name: 'grad', values: vals.map(() => 0) },
];

/** The leaves' gradients, from the reference engine. */
export function expectedGrads({ expr, vals }: GraphInput): number[] {
  const leaves = vals.map((v, i) => new Value(v, LEAVES[expr][i]));
  let out: Value;
  if (expr === 'neuron') {
    const [x1, w1, x2, w2, b] = leaves;
    out = x1.mul(w1).add(x2.mul(w2)).add(b).tanh();
  } else if (expr === 'reuse') {
    const [a, b] = leaves;
    out = a.mul(b).add(a.mul(a));
  } else {
    const [x, w] = leaves;
    out = x;
    for (let k = 0; k < CHAIN_DEPTH; k++) out = out.mul(w).tanh();
  }
  out.backward();
  return leaves.map((l) => l.grad);
}

const EXPRESSIONS = 'For `neuron` it is tanh(x1·w1 + x2·w2 + b); for `reuse` it is a·b + a·a (a is used three times); for `chain` it is tanh applied to `out × w` ten times over, starting from x.';

/** The Value class with the local gradients filled in (or, for the starter, left empty). */
function valuePy(filled: boolean): string {
  const body = (lines: string[]) => (filled ? lines.map((l) => `            ${l}`).join('\n') : '            pass  # TODO');
  return `import math


class Value:
    def __init__(self, data, children=()):
        self.data = data
        self.grad = 0.0
        self._prev = children
        self._backward = lambda: None

    def __add__(self, other):
        out = Value(self.data + other.data, (self, other))

        def _backward():
${body(['self.grad += out.grad', 'other.grad += out.grad'])}

        out._backward = _backward
        return out

    def __mul__(self, other):
        out = Value(self.data * other.data, (self, other))

        def _backward():
${body(['self.grad += other.data * out.grad', 'other.grad += self.data * out.grad'])}

        out._backward = _backward
        return out

    def tanh(self):
        t = math.tanh(self.data)
        out = Value(t, (self,))

        def _backward():
${body(['self.grad += (1 - t * t) * out.grad'])}

        out._backward = _backward
        return out
`;
}

function valueJs(filled: boolean, typed: boolean): string {
  const body = (lines: string[]) => (filled ? lines.map((l) => `      ${l}`).join('\n') : '      // TODO');
  const field = typed ? '  data: number;\n  grad: number;\n  _prev: Value[];\n  _backward: () => void;\n\n' : '';
  const ctor = typed ? 'constructor(data: number, children: Value[] = []) {' : 'constructor(data, children = []) {';
  const param = typed ? 'other: Value' : 'other';
  const ret = typed ? ': Value' : '';
  return `class Value {
${field}  ${ctor}
    this.data = data;
    this.grad = 0;
    this._prev = children;
    this._backward = () => {};
  }

  add(${param})${ret} {
    const out = new Value(this.data + other.data, [this, other]);
    out._backward = () => {
${body(['this.grad += out.grad;', 'other.grad += out.grad;'])}
    };
    return out;
  }

  mul(${param})${ret} {
    const out = new Value(this.data * other.data, [this, other]);
    out._backward = () => {
${body(['this.grad += other.data * out.grad;', 'other.grad += this.data * out.grad;'])}
    };
    return out;
  }

  tanh()${ret} {
    const t = Math.tanh(this.data);
    const out = new Value(t, [this]);
    out._backward = () => {
${body(['this.grad += (1 - t * t) * out.grad;'])}
    };
    return out;
  }
}
`;
}

/** backward(out): reverse topological order, from the output back to the leaves. */
function backwardPy(filled: boolean): string {
  if (!filled) {
    return `def backward(out):
    # Set out.grad to 1, then call _backward() on every value,
    # starting from out and working back towards the leaves.
    pass
`;
  }
  return `def backward(out):
    order = []
    seen = set()

    def visit(v):
        if v not in seen:
            seen.add(v)
            for child in v._prev:
                visit(child)
            order.append(v)  # after everything it was made from

    visit(out)
    out.grad = 1.0
    for v in reversed(order):
        v._backward()
`;
}

function backwardJs(filled: boolean, typed: boolean): string {
  const sig = typed ? 'function backward(out: Value): void {' : 'function backward(out) {';
  if (!filled) {
    return `${sig}
  // Set out.grad to 1, then call _backward() on every value,
  // starting from out and working back towards the leaves.
}
`;
  }
  return `${sig}
  const order${typed ? ': Value[]' : ''} = [];
  const seen = new Set${typed ? '<Value>' : ''}();
  function visit(v${typed ? ': Value' : ''})${typed ? ': void' : ''} {
    if (!seen.has(v)) {
      seen.add(v);
      for (const child of v._prev) {
        visit(child);
      }
      order.push(v); // after everything it was made from
    }
  }
  visit(out);
  out.grad = 1;
  for (let i = order.length - 1; i >= 0; i--) {
    order[i]._backward();
  }
}
`;
}

/** Builds the expression and copies the leaves' gradients into grad. `call` runs backward. */
function entryPy(call: string): string {
  return `def build(expr, vals):
    leaves = [Value(v) for v in vals]
    if expr == 'neuron':
        x1, w1, x2, w2, b = leaves
        out = (x1 * w1 + x2 * w2 + b).tanh()
    elif expr == 'reuse':
        a, b = leaves
        out = a * b + a * a
    else:
        x, w = leaves
        out = x
        for _ in range(${CHAIN_DEPTH}):
            out = (out * w).tanh()
    return leaves, out


def grads_of(expr, vals, grad):
    leaves, out = build(expr, vals)
    ${call}
    for i in range(len(leaves)):
        grad[i] = round(leaves[i].grad, 9)  # same digits in every language
    return grad
`;
}

function entryJs(call: string, typed: boolean): string {
  const t = (s: string) => (typed ? s : '');
  return `function build(expr${t(': string')}, vals${t(': number[]')})${t(': [Value[], Value]')} {
  const leaves = vals.map((v) => new Value(v));
  let out${t(': Value')};
  if (expr === 'neuron') {
    const [x1, w1, x2, w2, b] = leaves;
    out = x1.mul(w1).add(x2.mul(w2)).add(b).tanh();
  } else if (expr === 'reuse') {
    const [a, b] = leaves;
    out = a.mul(b).add(a.mul(a));
  } else {
    const [x, w] = leaves;
    out = x;
    for (let k = 0; k < ${CHAIN_DEPTH}; k++) {
      out = out.mul(w).tanh();
    }
  }
  return [leaves, out];
}

function gradsOf(expr${t(': string')}, vals${t(': number[]')}, grad${t(': number[]')})${t(': number[]')} {
  const [leaves, out] = build(expr, vals);
  ${call}
  for (let i = 0; i < leaves.length; i++) {
    grad[i] = Math.round(leaves[i].grad * 1e9) / 1e9; // same digits in every language
  }
  return grad;
}
`;
}

/** Messages for a wrong set of leaf gradients from the Value engine. */
function checkGraph(input: GraphInput, result: RunResult, focus: 'locals' | 'order'): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = gradsOf(result);
  const want = expectedGrads(input);
  const names = LEAVES[input.expr];
  if (!got || got.length !== want.length) return { pass: false, message: `Expected ${want.length} gradients in grad, one per leaf (${names.join(', ')}).` };
  if (matches(got, want)) return { pass: true, message: `${names.map((n, i) => `d${n} = ${fmt(want[i])}`).join(', ')}.` };
  if (got.every((v) => v === 0)) {
    return {
      pass: false,
      message:
        focus === 'locals'
          ? 'Every gradient is still 0: each _backward has to add its local gradient × out.grad to its inputs’ grad.'
          : 'Every gradient is still 0: set out.grad to 1, then call _backward() on every value from the output back to the leaves.',
    };
  }
  // In a·b + a·a only a's gradient sums several paths: b right and a wrong points at = instead of +=.
  if (input.expr === 'reuse' && focus === 'locals' && close(got[1], want[1]) && !close(got[0], want[0])) {
    return { pass: false, message: `a is used three times, so its gradient is the sum of all three paths (${fmt(want[0])}), but your code gives ${fmt(got[0])}. Add to grad with +=; don’t overwrite it.` };
  }
  if (input.expr === 'reuse' || input.expr === 'chain') {
    const used = input.expr === 'reuse' ? 'a is used three times' : 'w is used ten times';
    if (focus === 'order') return { pass: false, message: `${used}: visit each value once, and call its _backward only after every value made from it has run, so all of its gradient has arrived.` };
  }
  const i = want.findIndex((v, k) => !close(got[k], v));
  const tip =
    focus === 'locals'
      ? 'Check each op’s local gradient: + passes out.grad straight through, × sends each input the other input’s data × out.grad, and tanh sends (1 − t²) × out.grad.'
      : 'Run the _backward calls in reverse order of how the values were made: a value must have its whole gradient before it passes it on.';
  return { pass: false, message: `d${names[i]} should be ${fmt(want[i])}, but your code gives ${fmt(got[i])}. ${tip}` };
}

const NEURON_VALS = [2, -3, 0, 1, 6.8814];

// ───────────────────────────── the exercises ─────────────────────────────

const neuronExercise: Exercise<NeuronInput> = {
  slug: 'neuron-gradients',
  title: 'Backpropagate through a neuron by hand',
  kind: 'write',
  visualiser: 'chain-rule',
  summary: 'Work out how a neuron’s output changes with each weight and its bias, with nothing but the chain rule.',
  task: [
    'A neuron computes `z = w1·x1 + w2·x2 + b` and outputs `out = tanh(z)`. Write `neuron_grads(x, w, b, out, grad)` (`neuronGrads` in JavaScript and TypeScript), where `x` and `w` are lists of two numbers and `out` is the output, already worked out for you.',
    'Fill `grad` with how `out` changes with each parameter: `grad[0]` = d out/d w1, `grad[1]` = d out/d w2, `grad[2]` = d out/d b. Return `grad`.',
    'Chain two local gradients: tanh’s, which is `1 − out²`, and z’s with respect to each parameter, which is the input it multiplies (or 1 for the bias).',
  ],
  entry: { python: 'neuron_grads', js: 'neuronGrads' },
  args: neuronArgs,
  starter: {
    python: `def neuron_grads(x, w, b, out, grad):
    # out = tanh(w[0] * x[0] + w[1] * x[1] + b), already worked out
    # Fill grad with d out/d w1, d out/d w2 and d out/d b.
    return grad
`,
    javascript: `function neuronGrads(x, w, b, out, grad) {
  // out = tanh(w[0] * x[0] + w[1] * x[1] + b), already worked out
  // Fill grad with d out/d w1, d out/d w2 and d out/d b.
  return grad;
}
`,
    typescript: `${NEURON_SIG_TS}
  // out = tanh(w[0] * x[0] + w[1] * x[1] + b), already worked out
  // Fill grad with d out/d w1, d out/d w2 and d out/d b.
  return grad;
}
`,
  },
  solution: { python: NEURON_PY, javascript: NEURON_JS, typescript: NEURON_TS },
  examples: [
    { id: 'micrograd', label: 'Karpathy’s neuron', input: { x: [2, 0], w: [-3, 1], b: 6.8814 } },
    { id: 'saturated', label: 'A nearly saturated neuron', input: { x: [1.5, -1], w: [1, -0.5], b: 1 } },
  ],
  tests: [
    { name: 'the micrograd neuron', input: { x: [2, 0], w: [-3, 1], b: 6.8814 } },
    { name: 'z = 0, the steepest point', input: { x: [1, 1], w: [0.5, -0.5], b: 0 } },
    { name: 'negative inputs', input: { x: [-1.5, 0.5], w: [0.8, 2], b: -0.3 } },
    { name: 'nearly saturated: z = 3, out near 1', input: { x: [1.5, -1], w: [1, -0.5], b: 1 } },
    { name: 'small values', input: { x: [0.1, 0.2], w: [0.3, -0.4], b: 0.05 } },
  ],
  check: checkNeuron,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Start from the end: how much does `out` change when `z` changes a little? That is tanh’s derivative, `1 − out²`.',
    'Then how does `z` change with `w1`? Only the term `w1·x1` involves w1, so by `x1` per unit of w1.',
    'Multiply the two: `grad[0] = (1 − out²) · x1`. The bias enters `z` with a factor of 1, so `grad[2] = 1 − out²`.',
  ],
  legend: GRAD_LEGEND,
};

const valueBackwardExercise: Exercise<GraphInput> = {
  slug: 'value-backward',
  title: 'Give each operation its local gradient',
  kind: 'write',
  visualiser: 'chain-rule',
  summary: 'Fill in the backward step of +, × and tanh in a tiny autograd engine, and let it differentiate whole expressions.',
  task: [
    'Below is the core of an autograd engine like micrograd. A `Value` remembers the values it was made from, and `out._backward` must pass `out.grad` back to them, each scaled by its local gradient.',
    'Fill in the three `_backward` bodies: `+` (both inputs get `out.grad`), `×` (each input gets the other input’s `data` × `out.grad`) and `tanh` (its input gets `(1 − t²) × out.grad`). Always add to `grad` with `+=`: a value used twice collects a gradient from both uses.',
    `\`grads_of(expr, vals, grad)\` (\`gradsOf\` in JavaScript and TypeScript) is written for you: it builds an expression from \`vals\`, runs \`backward\`, and copies each leaf’s gradient into \`grad\`. ${EXPRESSIONS}`,
  ],
  entry: { python: 'grads_of', js: 'gradsOf' },
  args: graphArgs,
  starter: {
    python: `${valuePy(false)}

${backwardPy(true)}

${entryPy('backward(out)')}`,
    javascript: `${valueJs(false, false)}
${backwardJs(true, false)}
${entryJs('backward(out);', false)}`,
    typescript: `${valueJs(false, true)}
${backwardJs(true, true)}
${entryJs('backward(out);', true)}`,
  },
  solution: {
    python: `${valuePy(true)}

${backwardPy(true)}

${entryPy('backward(out)')}`,
    javascript: `${valueJs(true, false)}
${backwardJs(true, false)}
${entryJs('backward(out);', false)}`,
    typescript: `${valueJs(true, true)}
${backwardJs(true, true)}
${entryJs('backward(out);', true)}`,
  },
  examples: [
    { id: 'neuron', label: 'A neuron', input: { expr: 'neuron', vals: NEURON_VALS } },
    { id: 'reuse', label: 'a used three times', input: { expr: 'reuse', vals: [3, -2] } },
  ],
  tests: [
    { name: 'the micrograd neuron', input: { expr: 'neuron', vals: NEURON_VALS } },
    { name: 'another neuron', input: { expr: 'neuron', vals: [0.5, -1, 1.5, 0.25, 0.1] } },
    { name: 'a·b + a·a', input: { expr: 'reuse', vals: [3, -2] } },
    { name: 'a·b + a·a with a negative', input: { expr: 'reuse', vals: [-1.5, 4] } },
    { name: 'ten tanh layers', input: { expr: 'chain', vals: [0.8, 1.2] } },
  ],
  check: (input, result) => checkGraph(input, result, 'locals'),
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Addition passes its gradient straight through: `self.grad += out.grad` and `other.grad += out.grad`.',
    'For `out = self × other`, nudging `self` changes `out` by `other.data` per unit, so `self.grad += other.data * out.grad`, and the other way round.',
    'For tanh, use the output `t` you already computed: `self.grad += (1 - t * t) * out.grad`.',
  ],
  legend: GRAD_LEGEND,
};

const topologicalExercise: Exercise<GraphInput> = {
  slug: 'topological-backward',
  title: 'Run backpropagation in the right order',
  kind: 'write',
  visualiser: 'chain-rule',
  summary: 'Write backward(): sort the graph so every value comes after its inputs, then pass gradients back from the output.',
  task: [
    'Every `Value` below already knows its local gradients: calling `v._backward()` passes `v.grad` on to the values `v` was made from (in `v._prev`). What is missing is `backward(out)`, which runs them all.',
    'Set `out.grad` to 1 (out changes by 1 per unit of itself). Then call `_backward()` on every value in the graph, starting at `out` and working back to the leaves, so a value has received all of its gradient before it passes it on.',
    `A topological order does it: visit a value’s inputs before the value itself (a depth-first search over \`_prev\`, remembering what you’ve seen), then go through that list backwards. ${EXPRESSIONS}`,
  ],
  entry: { python: 'grads_of', js: 'gradsOf' },
  args: graphArgs,
  starter: {
    python: `${valuePy(true)}

${backwardPy(false)}

${entryPy('backward(out)')}`,
    javascript: `${valueJs(true, false)}
${backwardJs(false, false)}
${entryJs('backward(out);', false)}`,
    typescript: `${valueJs(true, true)}
${backwardJs(false, true)}
${entryJs('backward(out);', true)}`,
  },
  solution: {
    python: `${valuePy(true)}

${backwardPy(true)}

${entryPy('backward(out)')}`,
    javascript: `${valueJs(true, false)}
${backwardJs(true, false)}
${entryJs('backward(out);', false)}`,
    typescript: `${valueJs(true, true)}
${backwardJs(true, true)}
${entryJs('backward(out);', true)}`,
  },
  examples: [
    { id: 'neuron', label: 'A neuron', input: { expr: 'neuron', vals: NEURON_VALS } },
    { id: 'reuse', label: 'a used three times', input: { expr: 'reuse', vals: [3, -2] } },
    { id: 'chain', label: 'Ten layers deep', input: { expr: 'chain', vals: [0.8, 1.2] } },
  ],
  tests: [
    { name: 'the micrograd neuron', input: { expr: 'neuron', vals: NEURON_VALS } },
    { name: 'a·b + a·a', input: { expr: 'reuse', vals: [3, -2] } },
    { name: 'a·b + a·a with a negative', input: { expr: 'reuse', vals: [-1.5, 4] } },
    { name: 'ten tanh layers', input: { expr: 'chain', vals: [0.8, 1.2] } },
    { name: 'ten layers, small weight', input: { expr: 'chain', vals: [-2, 0.5] } },
  ],
  check: (input, result) => checkGraph(input, result, 'order'),
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Build the order with a recursive `visit(v)`: if `v` is new, mark it seen, visit each value in `v._prev`, then append `v`.',
    'After `visit(out)`, every value appears after everything it was made from, and `out` is last.',
    'Set `out.grad = 1`, then go through the order from the end to the start, calling `_backward()` on each value.',
  ],
  legend: GRAD_LEGEND,
};

export const mlExercises: Exercise[] = [neuronExercise, valueBackwardExercise, topologicalExercise];

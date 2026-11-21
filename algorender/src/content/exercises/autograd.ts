// Micrograd from scratch (B4 of the math and ML path, milestone project M2).
// Parts 1 and 2 are ml.ts's `value-backward` and `topological-backward`; this
// file writes the rest, each starter carrying the earlier parts written out:
//
// 3. value-ops: the engine learns pow, exp and relu (and, from them, − and ÷).
// 4. gradient-check: numeric gradients by central differences, to check backward().
// 5. train-neuron: gradient descent on a tanh neuron with the learner's engine.
//
// Every part runs its judged tests in judge mode on the project budget; the
// examples are still watched, as the visual arrays the entry functions fill.
// The checks compare with src/ml/autograd.ts (or a plain training loop) and
// name the usual slips, simulated by a copy of the learner's engine that can
// make each one (SlipValue below).

import { Value } from '@/ml/autograd';
import type { Arg, RunResult } from '@/workspace/protocol';
import { backwardJs, backwardPy, valueJs, valuePy } from './ml';
import { crashed, type Exercise, type Verdict } from './shared';

const TOLERANCE = 1e-6;

const fmt = (v: number) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;
const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const closeTo = (tolerance: number) => (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
const matchesTo = (tolerance: number) => {
  const close = closeTo(tolerance);
  return (got: readonly number[], want: readonly number[]) => got.length === want.length && want.every((w, i) => close(got[i], w));
};
const close = closeTo(TOLERANCE);
const matches = matchesTo(TOLERANCE);

// ───────────────────────────── the expressions ─────────────────────────────

/** Which expression the entry function builds from `vals`. */
export type OpsExpr = 'square' | 'swish' | 'relu' | 'exp' | 'power';
export type OpsInput = { expr: OpsExpr; vals: number[] };

export const OPS_LEAVES: Record<OpsExpr, string[]> = { square: ['w', 'x', 'y'], swish: ['w', 'x'], relu: ['a', 'b'], exp: ['a', 'b', 'c'], power: ['a', 'b'] };

/** What every value in an expression can do: the reference engine and SlipValue both. */
interface Node<T> {
  data: number;
  add(other: T): T;
  mul(other: T): T;
  pow(k: number): T;
  exp(): T;
  relu(): T;
  sub(other: T): T;
  div(other: T): T;
  neg(): T;
}

/** The output of an expression, built exactly as the learner's `build` builds it. */
function buildExpr<T extends Node<T>>(expr: OpsExpr, leaves: T[], constant: (x: number) => T): T {
  if (expr === 'square') {
    const [w, x, y] = leaves;
    return w.mul(x).sub(y).pow(2);
  }
  if (expr === 'swish') {
    const [w, x] = leaves;
    const z = w.mul(x);
    return z.div(constant(1).add(z.neg().exp()));
  }
  if (expr === 'relu') {
    const [a, b] = leaves;
    return a.relu().mul(b).add(a.add(b).relu());
  }
  if (expr === 'exp') {
    const [a, b, c] = leaves;
    return a.exp().add(a.mul(b).exp().mul(c));
  }
  const [a, b] = leaves;
  return a.pow(3).div(b).add(b.pow(2));
}

/** The expression's value at `vals`, from the reference engine. */
export const exprValue = (expr: OpsExpr, vals: readonly number[]) =>
  buildExpr(
    expr,
    vals.map((v) => new Value(v)),
    (x) => new Value(x),
  ).data;

/** The leaves' gradients, from the reference engine (src/ml/autograd.ts). */
export function opsGrads({ expr, vals }: OpsInput): number[] {
  const leaves = vals.map((v, i) => new Value(v, OPS_LEAVES[expr][i]));
  buildExpr(expr, leaves, (x) => new Value(x)).backward();
  return leaves.map((l) => l.grad);
}

const EXPRESSIONS =
  '`square` is (w·x − y)², a squared error; `swish` is z / (1 + exp(−z)) with z = w·x; `relu` is relu(a)·b + relu(a + b); `exp` is exp(a) + exp(a·b)·c; `power` is a³ / b + b².';

// ───────────────────────────── the learner's engine, with its slips ─────────────────────────────

type NewOp = 'pow' | 'exp' | 'relu';

/** The usual mistakes in part 3's operations. */
export type OpsSlip = {
  /** pow's local gradient k·x^k instead of k·x^(k−1). */
  powLocal?: boolean;
  /** relu passes the gradient through even when its input was negative. */
  reluLeak?: boolean;
  /** exp's local gradient uses the input x instead of the output exp(x). */
  expInput?: boolean;
  /** `=` instead of `+=` in this operation's _backward. */
  assign?: NewOp;
};

/** The learner's Value class as the project writes it (− and ÷ included), able to make each slip. */
class SlipValue implements Node<SlipValue> {
  grad = 0;
  back: () => void = () => {};
  constructor(
    public data: number,
    readonly prev: SlipValue[] = [],
    readonly slip: OpsSlip = {},
  ) {}

  private make(data: number, prev: SlipValue[]) {
    return new SlipValue(data, prev, this.slip);
  }

  private give(op: NewOp, local: number, out: SlipValue) {
    if (this.slip.assign === op) this.grad = local * out.grad;
    else this.grad += local * out.grad;
  }

  add(other: SlipValue) {
    const out = this.make(this.data + other.data, [this, other]);
    out.back = () => {
      this.grad += out.grad;
      other.grad += out.grad;
    };
    return out;
  }

  mul(other: SlipValue) {
    const out = this.make(this.data * other.data, [this, other]);
    out.back = () => {
      this.grad += other.data * out.grad;
      other.grad += this.data * out.grad;
    };
    return out;
  }

  pow(k: number) {
    const out = this.make(this.data ** k, [this]);
    out.back = () => this.give('pow', this.slip.powLocal ? k * this.data ** k : k * this.data ** (k - 1), out);
    return out;
  }

  exp() {
    const e = Math.exp(this.data);
    const out = this.make(e, [this]);
    out.back = () => this.give('exp', this.slip.expInput ? this.data : e, out);
    return out;
  }

  relu() {
    const out = this.make(Math.max(0, this.data), [this]);
    out.back = () => this.give('relu', this.slip.reluLeak || this.data > 0 ? 1 : 0, out);
    return out;
  }

  neg() {
    return this.mul(this.make(-1, []));
  }

  sub(other: SlipValue) {
    return this.add(other.neg());
  }

  div(other: SlipValue) {
    return this.mul(other.pow(-1));
  }
}

/** The leaves' gradients when the learner's engine makes `slip` (backward as parts 1 and 2 write it). */
export function slipGrads({ expr, vals }: OpsInput, slip: OpsSlip): number[] {
  const leaves = vals.map((v) => new SlipValue(v, [], slip));
  const out = buildExpr(expr, leaves, (x) => new SlipValue(x, [], slip));
  const order: SlipValue[] = [];
  const seen = new Set<SlipValue>();
  const visit = (v: SlipValue) => {
    if (seen.has(v)) return;
    seen.add(v);
    for (const child of v.prev) visit(child);
    order.push(v);
  };
  visit(out);
  out.grad = 1;
  for (let i = order.length - 1; i >= 0; i--) order[i].back();
  return leaves.map((l) => l.grad);
}

/** Which operations an expression uses directly, so a slip there can show. */
const USES: Record<OpsExpr, NewOp[]> = { square: ['pow'], swish: ['pow', 'exp'], relu: ['relu'], exp: ['exp'], power: ['pow'] };

function checkOps(input: OpsInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = gradsOf(result, 'grad');
  const want = opsGrads(input);
  const names = OPS_LEAVES[input.expr];
  if (!got || got.length !== want.length) return { pass: false, message: `Expected ${want.length} gradients, one per leaf (${names.join(', ')}).` };
  if (matches(got, want)) return { pass: true, message: `${names.map((n, i) => `d${n} = ${fmt(want[i])}`).join(', ')}.` };
  const uses = USES[input.expr];
  const slips: [OpsSlip, string][] = [
    [{ powLocal: true }, 'pow’s local gradient is k·x^(k−1), one power lower than the forward value: the derivative of x² is 2x, not 2x².'],
    [{ reluLeak: true }, 'relu’s output stays 0 whatever a negative input does, so its local gradient is 0 there (and 1 when the input is positive): pass no gradient back from a relu whose input was negative.'],
    [{ expInput: true }, 'exp is its own derivative: its local gradient is the output e = exp(x), not the input x.'],
  ];
  for (const op of uses) slips.push([{ assign: op }, `In ${op}’s _backward, add to grad with +=: its input is used somewhere else too, and = throws away the gradient that use already sent back.`]);
  for (const [slip, message] of slips) {
    if (matches(got, slipGrads(input, slip))) return { pass: false, message };
  }
  const i = want.findIndex((v, k) => !close(got[k], v));
  return {
    pass: false,
    message: `d${names[i]} should be ${fmt(want[i])}, but your code gives ${fmt(got[i])}. Check pow, exp and relu: each forward value, then a _backward that adds local gradient × out.grad to its input’s grad (pow’s local gradient is k·x^(k−1), exp’s is exp(x), relu’s is 1 or 0).`,
  };
}

// ───────────────────────────── shared code: the engine, as the project writes it ─────────────────────────────

/** The learner's grad array at the end of the run, else what they returned. */
function gradsOf(result: RunResult, name: string): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  const final = made && made.kind === 'array' ? result.arrays[made.array] : undefined;
  if (final) return final;
  return isNumbers(result.returned) ? result.returned : null;
}

const indent = (text: string, spaces: number) =>
  text
    .split('\n')
    .map((l) => (l ? ' '.repeat(spaces) + l : l))
    .join('\n');

/** Part 3's methods of the Python class: pow, exp and relu (filled, or stubs), then −, ÷ written for the learner. */
function opsPy(filled: boolean): string {
  const ops = filled
    ? `def __pow__(self, k):  # self ** k, for a plain number k
    out = Value(self.data ** k, (self,))

    def _backward():
        self.grad += k * self.data ** (k - 1) * out.grad

    out._backward = _backward
    return out

def exp(self):
    e = math.exp(self.data)
    out = Value(e, (self,))

    def _backward():
        self.grad += e * out.grad

    out._backward = _backward
    return out

def relu(self):
    out = Value(self.data if self.data > 0 else 0.0, (self,))

    def _backward():
        self.grad += (1.0 if self.data > 0 else 0.0) * out.grad

    out._backward = _backward
    return out
`
    : `def __pow__(self, k):  # self ** k, for a plain number k
    # TODO: out = Value(self.data ** k, (self,)), then out._backward
    return self  # replace this

def exp(self):
    # TODO: out = Value(math.exp(self.data), (self,)), then out._backward
    return self  # replace this

def relu(self):
    # TODO: out holds self.data when it is positive, else 0; then out._backward
    return self  # replace this
`;
  return indent(
    `# Part 3: three more operations.
${ops}
# Written for you, from the operations above: a - b = a + (-1)·b, a / b = a · b^-1.
def __neg__(self):
    return self * Value(-1.0)

def __sub__(self, other):
    return self + (-other)

def __truediv__(self, other):
    return self * other ** -1
`,
    4,
  );
}

function opsJs(filled: boolean, typed: boolean): string {
  const t = (s: string) => (typed ? s : '');
  const ops = filled
    ? `pow(k${t(': number')})${t(': Value')} { // this ** k, for a plain number k
  const out = new Value(this.data ** k, [this]);
  out._backward = () => {
    this.grad += k * this.data ** (k - 1) * out.grad;
  };
  return out;
}

exp()${t(': Value')} {
  const e = Math.exp(this.data);
  const out = new Value(e, [this]);
  out._backward = () => {
    this.grad += e * out.grad;
  };
  return out;
}

relu()${t(': Value')} {
  const out = new Value(Math.max(0, this.data), [this]);
  out._backward = () => {
    this.grad += (this.data > 0 ? 1 : 0) * out.grad;
  };
  return out;
}
`
    : `pow(k${t(': number')})${t(': Value')} { // this ** k, for a plain number k
  // TODO: const out = new Value(this.data ** k, [this]), then out._backward
  return this; // replace this
}

exp()${t(': Value')} {
  // TODO: const out = new Value(Math.exp(this.data), [this]), then out._backward
  return this; // replace this
}

relu()${t(': Value')} {
  // TODO: out holds this.data when it is positive, else 0; then out._backward
  return this; // replace this
}
`;
  return indent(
    `// Part 3: three more operations.
${ops}
// Written for you, from the operations above: a - b = a + (-1)·b, a / b = a · b^-1.
neg()${t(': Value')} {
  return this.mul(new Value(-1));
}

sub(other${t(': Value')})${t(': Value')} {
  return this.add(other.neg());
}

div(other${t(': Value')})${t(': Value')} {
  return this.mul(other.pow(-1));
}
`,
    2,
  );
}

/** The Value class of parts 1 and 2 with part 3's operations added. */
const classPy = (filled: boolean) => `${valuePy(true)}\n${opsPy(filled)}`;
const classJs = (filled: boolean, typed: boolean) => `${valueJs(true, typed).replace(/\}\n$/, '')}\n${opsJs(filled, typed)}}\n`;

const ENGINE_NOTE_PY = '# Parts 1 and 2 of the project, written out for you: the Value class with +, × and tanh, and backward().\n';
const ENGINE_NOTE_JS = '// Parts 1 and 2 of the project, written out for you: the Value class with +, × and tanh, and backward().\n';
const FULL_NOTE_PY = '# Parts 1 to 3 of the project, written out for you: the Value class with +, ×, tanh, pow, exp and relu (and − and ÷), and backward().\n';
const FULL_NOTE_JS = '// Parts 1 to 3 of the project, written out for you: the Value class with +, ×, tanh, pow, exp and relu (and − and ÷), and backward().\n';

/** Parts 1–3, the whole engine: the Value class and backward(). */
export const ENGINE_PY = `${classPy(true)}

${backwardPy(true)}`;
export const engineJs = (typed: boolean) => `${classJs(true, typed)}
${backwardJs(true, typed)}`;

const BUILD_PY = `def build(expr, vals):
    leaves = [Value(v) for v in vals]
    if expr == 'square':
        w, x, y = leaves
        out = (w * x - y) ** 2
    elif expr == 'swish':
        w, x = leaves
        z = w * x
        out = z / (Value(1.0) + (-z).exp())
    elif expr == 'relu':
        a, b = leaves
        out = a.relu() * b + (a + b).relu()
    elif expr == 'exp':
        a, b, c = leaves
        out = a.exp() + (a * b).exp() * c
    else:
        a, b = leaves
        out = a ** 3 / b + b ** 2
    return leaves, out
`;

const buildJs = (typed: boolean) => {
  const t = (s: string) => (typed ? s : '');
  return `function build(expr${t(': string')}, vals${t(': number[]')})${t(': [Value[], Value]')} {
  const leaves = vals.map((v) => new Value(v));
  let out${t(': Value')};
  if (expr === 'square') {
    const [w, x, y] = leaves;
    out = w.mul(x).sub(y).pow(2);
  } else if (expr === 'swish') {
    const [w, x] = leaves;
    const z = w.mul(x);
    out = z.div(new Value(1).add(z.neg().exp()));
  } else if (expr === 'relu') {
    const [a, b] = leaves;
    out = a.relu().mul(b).add(a.add(b).relu());
  } else if (expr === 'exp') {
    const [a, b, c] = leaves;
    out = a.exp().add(a.mul(b).exp().mul(c));
  } else {
    const [a, b] = leaves;
    out = a.pow(3).div(b).add(b.pow(2));
  }
  return [leaves, out];
}
`;
};

// ───────────────────────────── 3. value-ops (M2, part 3) ─────────────────────────────

const opsArgs = ({ expr, vals }: OpsInput): Arg[] => [
  { kind: 'value', name: 'expr', value: expr },
  { kind: 'value', name: 'vals', value: vals },
  { kind: 'array', name: 'grad', values: vals.map(() => 0) },
];

const GRADS_OF_PY = `def grads_of(expr, vals, grad):
    leaves, out = build(expr, vals)
    backward(out)
    for i in range(len(leaves)):
        grad[i] = round(leaves[i].grad, 9)  # same digits in every language
    return grad
`;
const gradsOfJs = (typed: boolean) => {
  const t = (s: string) => (typed ? s : '');
  return `function gradsOf(expr${t(': string')}, vals${t(': number[]')}, grad${t(': number[]')})${t(': number[]')} {
  const [leaves, out] = build(expr, vals);
  backward(out);
  for (let i = 0; i < leaves.length; i++) {
    grad[i] = Math.round(leaves[i].grad * 1e9) / 1e9; // same digits in every language
  }
  return grad;
}
`;
};

const opsPyCode = (filled: boolean) => `${ENGINE_NOTE_PY}${classPy(filled)}

${backwardPy(true)}

${BUILD_PY}

${GRADS_OF_PY}`;
const opsJsCode = (filled: boolean, typed: boolean) => `${ENGINE_NOTE_JS}${classJs(filled, typed)}
${backwardJs(true, typed)}
${buildJs(typed)}
${gradsOfJs(typed)}`;

const GRAD_LEGEND: Exercise['legend'] = [
  { neutral: 'A gradient not written yet (0)' },
  { mark: 'write', label: 'A gradient your code just wrote' },
];

const opsExercise: Exercise<OpsInput> = {
  slug: 'value-ops',
  title: 'Micrograd, part 3: teach your engine more operations',
  kind: 'write',
  visualiser: 'autograd',
  summary: 'Add powers, exp and relu to your autograd engine, each with its forward value and its local gradient, and differentiate squared errors and activations.',
  task: [
    'Part 3 of the project “Micrograd from scratch”. Your engine from parts 1 and 2 is written out for you: a `Value` class with +, × and tanh, and `backward()`. Now it learns three more operations.',
    'Fill in `pow` (a power with a plain-number exponent k: `v ** k` in Python, `v.pow(k)` in JavaScript and TypeScript), `exp` and `relu` (x when x is positive, else 0). Each makes `out` from its forward value, then gives it a `_backward` that adds local gradient × `out.grad` to its input’s `grad`, with `+=` as before.',
    `Subtraction and division are written for you from these: a − b = a + (−1)·b and a / b = a · b⁻¹. \`grads_of(expr, vals, grad)\` (\`gradsOf\` in JavaScript and TypeScript) builds an expression from \`vals\`, runs \`backward\` and writes each leaf’s gradient into \`grad\`. ${EXPRESSIONS}`,
  ],
  entry: { python: 'grads_of', js: 'gradsOf' },
  args: opsArgs,
  starter: { python: opsPyCode(false), javascript: opsJsCode(false, false), typescript: opsJsCode(false, true) },
  solution: { python: opsPyCode(true), javascript: opsJsCode(true, false), typescript: opsJsCode(true, true) },
  examples: [
    { id: 'square', label: 'A squared error, (w·x − y)²', input: { expr: 'square', vals: [0.5, 2, 3] } },
    { id: 'relu', label: 'relu, off and on', input: { expr: 'relu', vals: [-1.5, 3] } },
    { id: 'swish', label: 'z / (1 + exp(−z))', input: { expr: 'swish', vals: [1.5, 0.8] } },
  ],
  tests: [
    { name: 'a squared error', input: { expr: 'square', vals: [0.5, 2, 3] } },
    { name: 'a squared error with negatives', input: { expr: 'square', vals: [-1.5, 0.8, 0.4] } },
    { name: 'relu of a negative, then of a positive sum', input: { expr: 'relu', vals: [-1.5, 3] } },
    { name: 'relu of a positive, then of a negative sum', input: { expr: 'relu', vals: [2, -3] } },
    { name: 'exp of a product', input: { expr: 'exp', vals: [0.5, -1, 2] } },
    { name: 'exp of a product, all positive', input: { expr: 'exp', vals: [1, 0.5, -0.5] } },
    { name: 'z / (1 + exp(−z))', input: { expr: 'swish', vals: [1.5, 0.8] } },
    { name: 'z / (1 + exp(−z)) with z negative', input: { expr: 'swish', vals: [-2, 0.6] } },
    { name: 'a cube over b, plus b squared', input: { expr: 'power', vals: [1.5, 2] } },
    { name: 'a cube over b, with a negative', input: { expr: 'power', vals: [-1, 0.5] } },
  ],
  check: checkOps,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'pow: the forward value is `self.data ** k` (`this.data ** k` in JavaScript and TypeScript). Nudging x changes xᵏ by k·x^(k−1) per unit, so `self.grad += k * self.data ** (k - 1) * out.grad`.',
    'exp: keep `e = math.exp(self.data)` (`Math.exp(this.data)`) for the forward value; exp is its own derivative, so `self.grad += e * out.grad`.',
    'relu: the forward value is x when x > 0, else 0. Its local gradient is 1 when x > 0 and 0 otherwise: a relu that output 0 sends nothing back.',
  ],
  legend: GRAD_LEGEND,
  judge: { budget: 'project' },
};

// ───────────────────────────── 4. gradient-check (M2, part 4) ─────────────────────────────

export type CheckInput = OpsInput & { h: number };

const checkArgs = ({ expr, vals, h }: CheckInput): Arg[] => [
  { kind: 'value', name: 'expr', value: expr },
  { kind: 'value', name: 'vals', value: vals },
  { kind: 'value', name: 'h', value: h },
  { kind: 'array', name: 'numeric', values: vals.map(() => 0) },
  { kind: 'array', name: 'analytic', values: vals.map(() => 0) },
];

/** The usual mistakes in a numeric gradient. */
export type NumericSlip = 'forward' | 'backward-difference' | 'over-h' | 'not-restored-down' | 'not-restored-up' | 'all-at-once';

/** Each leaf's numeric gradient: central differences, or what a slip computes instead. */
export function numericGrads({ expr, vals, h }: CheckInput, slip?: NumericSlip): number[] {
  const f = (vs: readonly number[]) => exprValue(expr, vs);
  const at = [...vals];
  return vals.map((_, i) => {
    if (slip === 'all-at-once') return (f(vals.map((v) => v + h)) - f(vals.map((v) => v - h))) / (2 * h);
    const old = at[i];
    at[i] = old + h;
    const up = f(at);
    at[i] = old - h;
    const down = f(at);
    if (slip === 'not-restored-up') at[i] = old + h;
    else if (slip !== 'not-restored-down') at[i] = old;
    if (slip === 'forward') return (up - f(vals)) / h;
    if (slip === 'backward-difference') return (f(vals) - down) / h;
    if (slip === 'over-h') return (up - down) / h;
    return (up - down) / (2 * h);
  });
}

/** Numeric gradients are rounded to 8 digits; the same algorithm agrees far closer than this. */
const NUMERIC_TOLERANCE = 1e-7;
const matchesNumeric = matchesTo(NUMERIC_TOLERANCE);

function checkNumeric(input: CheckInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  const names = OPS_LEAVES[input.expr];
  if (!isNumbers(got)) return { pass: false, message: 'numeric_grads should return a list of numbers: one numeric gradient per leaf.' };
  if (got.length !== names.length) return { pass: false, message: `Expected ${names.length} numeric gradients, one per leaf (${names.join(', ')}), but numeric_grads returned ${got.length}.` };
  const want = numericGrads(input);
  if (matchesNumeric(got, want)) {
    const engine = opsGrads(input);
    const gap = Math.max(...engine.map((g, i) => Math.abs(g - want[i])));
    return { pass: true, message: `Numeric ${list(want)} against backward()’s ${list(engine)}: they agree to within ${gap.toExponential(1)}, so the engine’s gradients are right (h = ${input.h}).` };
  }
  if (got.every((v) => v === 0)) return { pass: false, message: 'Every numeric gradient is still 0: for each leaf, work out the expression with that leaf nudged up by h and down by h, and divide the difference by 2h.' };
  const slips: [NumericSlip, string][] = [
    ['over-h', 'The two nudged points are 2h apart, so divide their difference by 2h, not h: yours are twice too big.'],
    ['forward', 'That is a one-sided difference, (f(x + h) − f(x)) / h, which is off by about h/2 × the curvature. Nudge both ways and use (f(x + h) − f(x − h)) / 2h: the errors on the two sides cancel.'],
    ['backward-difference', 'That is a one-sided difference, (f(x) − f(x − h)) / h, which is off by about h/2 × the curvature. Nudge both ways and use (f(x + h) − f(x − h)) / 2h: the errors on the two sides cancel.'],
    ['all-at-once', 'Every leaf was nudged at once, so each number is how the output changes when all of them move together. Nudge one leaf at a time and keep the others where they are.'],
    ['not-restored-down', 'The first leaf is right but later ones are off: put vals[i] back to its old value after nudging it, or the next leaf is measured with this one still moved by −h.'],
    ['not-restored-up', 'The first leaf is right but later ones are off: put vals[i] back to its old value after nudging it, or the next leaf is measured with this one still moved by +h.'],
  ];
  for (const [slip, message] of slips) {
    if (matchesNumeric(got, numericGrads(input, slip))) return { pass: false, message };
  }
  const i = want.findIndex((v, k) => !closeTo(NUMERIC_TOLERANCE)(got[k], v));
  return { pass: false, message: `The numeric gradient for ${names[i]} should be ${fmt(want[i])}, but your code gives ${fmt(got[i])}. For leaf i: f(vals with vals[i] + h) − f(vals with vals[i] − h), divided by 2h, with every other leaf left alone.` };
}

const NUMERIC_PY = `def numeric_grads(expr, vals, h):
    grads = []
    for i in range(len(vals)):
        old = vals[i]
        vals[i] = old + h
        up = build(expr, vals)[1].data  # the output, nudged up
        vals[i] = old - h
        down = build(expr, vals)[1].data
        vals[i] = old  # put it back before nudging the next leaf
        grads.append((up - down) / (2 * h))
    return grads
`;
const NUMERIC_STARTER_PY = `def numeric_grads(expr, vals, h):
    grads = [0.0] * len(vals)
    # For each leaf i: build(expr, vals) with vals[i] nudged up by h,
    # then down by h, and set grads[i] to the central difference.
    return grads
`;
const numericJs = (typed: boolean) => `function numericGrads(expr${typed ? ': string' : ''}, vals${typed ? ': number[]' : ''}, h${typed ? ': number' : ''})${typed ? ': number[]' : ''} {
  const grads${typed ? ': number[]' : ''} = [];
  for (let i = 0; i < vals.length; i++) {
    const old = vals[i];
    vals[i] = old + h;
    const up = build(expr, vals)[1].data; // the output, nudged up
    vals[i] = old - h;
    const down = build(expr, vals)[1].data;
    vals[i] = old; // put it back before nudging the next leaf
    grads.push((up - down) / (2 * h));
  }
  return grads;
}
`;
const numericStarterJs = (typed: boolean) => `function numericGrads(expr${typed ? ': string' : ''}, vals${typed ? ': number[]' : ''}, h${typed ? ': number' : ''})${typed ? ': number[]' : ''} {
  const grads = vals.map(() => 0);
  // For each leaf i: build(expr, vals) with vals[i] nudged up by h,
  // then down by h, and set grads[i] to the central difference.
  return grads;
}
`;

const CHECK_GRADS_PY = `def engine_grads(expr, vals):
    leaves, out = build(expr, vals)
    backward(out)
    return [leaf.grad for leaf in leaves]


def check_grads(expr, vals, h, numeric, analytic):
    found = engine_grads(expr, vals)
    for i in range(len(found)):
        analytic[i] = round(found[i], 8)  # backward()'s gradients
    found = numeric_grads(expr, vals, h)
    for i in range(min(len(found), len(numeric))):
        numeric[i] = round(found[i], 8)  # yours, to compare
    return [round(g, 8) for g in found]
`;
const checkGradsJs = (typed: boolean) => {
  const t = (s: string) => (typed ? s : '');
  return `function engineGrads(expr${t(': string')}, vals${t(': number[]')})${t(': number[]')} {
  const [leaves, out] = build(expr, vals);
  backward(out);
  return leaves.map((leaf) => leaf.grad);
}

function checkGrads(expr${t(': string')}, vals${t(': number[]')}, h${t(': number')}, numeric${t(': number[]')}, analytic${t(': number[]')})${t(': number[]')} {
  const grads = engineGrads(expr, vals);
  for (let i = 0; i < grads.length; i++) {
    analytic[i] = Math.round(grads[i] * 1e8) / 1e8; // backward()'s gradients
  }
  const found = numericGrads(expr, vals, h);
  for (let i = 0; i < Math.min(found.length, numeric.length); i++) {
    numeric[i] = Math.round(found[i] * 1e8) / 1e8; // yours, to compare
  }
  return found.map((g) => Math.round(g * 1e8) / 1e8);
}
`;
};

const checkPyCode = (numeric: string) => `${FULL_NOTE_PY}${ENGINE_PY}

${BUILD_PY}

${numeric}

${CHECK_GRADS_PY}`;
const checkJsCode = (numeric: string, typed: boolean) => `${FULL_NOTE_JS}${engineJs(typed)}
${buildJs(typed)}
${numeric}
${checkGradsJs(typed)}`;

const gradientCheckExercise: Exercise<CheckInput> = {
  slug: 'gradient-check',
  title: 'Micrograd, part 4: check your gradients numerically',
  kind: 'write',
  visualiser: 'autograd',
  summary: 'Nudge each input a little both ways and watch the output: central differences check every gradient your engine works out.',
  task: [
    'Part 4 of the project “Micrograd from scratch”. Your whole engine from parts 1 to 3 is written out for you. Is it right? A derivative is how much the output changes per unit nudge of an input, so you can measure it without any calculus.',
    'Write `numeric_grads(expr, vals, h)` (`numericGrads` in JavaScript and TypeScript). For each leaf i, rebuild the expression with `vals[i]` nudged up by h, then down by h (`build(expr, vals)` returns the leaves and the output), and work out the central difference (f(+h) − f(−h)) / 2h of the output’s `data`. Put `vals[i]` back before the next leaf. Return the list.',
    `\`check_grads\` (\`checkGrads\`) is written for you: it writes \`backward()\`’s gradients into \`analytic\` and yours into \`numeric\`, side by side. With h around 1e-5 they agree to about six decimal places. ${EXPRESSIONS}`,
  ],
  entry: { python: 'check_grads', js: 'checkGrads' },
  args: checkArgs,
  starter: { python: checkPyCode(NUMERIC_STARTER_PY), javascript: checkJsCode(numericStarterJs(false), false), typescript: checkJsCode(numericStarterJs(true), true) },
  solution: { python: checkPyCode(NUMERIC_PY), javascript: checkJsCode(numericJs(false), false), typescript: checkJsCode(numericJs(true), true) },
  examples: [
    { id: 'relu', label: 'relu, off and on, h = 0.00001', input: { expr: 'relu', vals: [-1.5, 3], h: 1e-5 } },
    { id: 'power', label: 'a³ / b + b², h = 0.001', input: { expr: 'power', vals: [1.5, 2], h: 1e-3 } },
  ],
  tests: [
    { name: 'a squared error', input: { expr: 'square', vals: [0.5, 2, 3], h: 1e-5 } },
    { name: 'z / (1 + exp(−z))', input: { expr: 'swish', vals: [1.5, 0.8], h: 1e-5 } },
    { name: 'relu, off and on', input: { expr: 'relu', vals: [-1.5, 3], h: 1e-5 } },
    { name: 'exp of a product', input: { expr: 'exp', vals: [0.5, -1, 2], h: 1e-5 } },
    { name: 'a cube over b, plus b squared', input: { expr: 'power', vals: [1.5, 2], h: 1e-5 } },
    { name: 'a coarser nudge, h = 0.0001', input: { expr: 'square', vals: [-1.5, 0.8, 0.4], h: 1e-4 } },
    { name: 'a coarse nudge, h = 0.001', input: { expr: 'exp', vals: [1, 0.5, -0.5], h: 1e-3 } },
  ],
  check: checkNumeric,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'For each i: remember `old = vals[i]`, set `vals[i] = old + h` and take the output’s value, `up = build(expr, vals)[1].data` (`build` returns the leaves and the output, in every language), then `vals[i] = old - h` for `down` the same way, then `vals[i] = old` again.',
    'The numeric gradient is `(up - down) / (2 * h)`: the two nudged points are 2h apart.',
    'Nudge one leaf at a time: every other leaf keeps its own value, so the number measures that leaf alone.',
  ],
  legend: [
    { neutral: 'A gradient not worked out yet (0)' },
    { mark: 'write', label: 'A gradient just written: backward()’s first, then your numeric one' },
  ],
  judge: { budget: 'project' },
};

// ───────────────────────────── 5. train-neuron (M2, part 5) ─────────────────────────────

export type TrainInput = { xs: number[]; ys: number[]; w: number; b: number; lr: number; steps: number };

const trainArgs = ({ xs, ys, w, b, lr, steps }: TrainInput): Arg[] => [
  { kind: 'value', name: 'xs', value: xs },
  { kind: 'value', name: 'ys', value: ys },
  { kind: 'value', name: 'w', value: w },
  { kind: 'value', name: 'b', value: b },
  { kind: 'value', name: 'lr', value: lr },
  { kind: 'value', name: 'steps', value: steps },
  { kind: 'array', name: 'losses', values: Array.from({ length: steps }, () => 0) },
];

/** The usual mistakes in a training loop. */
export type TrainSlip = 'pile-up' | 'uphill' | 'sum' | 'no-bias' | 'before-backward';

/**
 * Gradient descent on ŷ = tanh(w·x + b) with the mean squared error, as plain
 * numbers: the loss before each step's update, and the final w and b. A slip
 * makes the mistake instead.
 */
export function trainReference({ xs, ys, w, b, lr, steps }: TrainInput, slip?: TrainSlip): { losses: number[]; w: number; b: number } {
  const n = xs.length;
  const losses: number[] = [];
  let gwTotal = 0;
  let gbTotal = 0;
  const lossAt = (w: number, b: number) => xs.reduce((s, x, i) => s + (Math.tanh(w * x + b) - ys[i]) ** 2, 0) / (slip === 'sum' ? 1 : n);
  for (let step = 0; step < steps; step++) {
    let gw = 0;
    let gb = 0;
    xs.forEach((x, i) => {
      const t = Math.tanh(w * x + b);
      const dz = ((2 * (t - ys[i])) / (slip === 'sum' ? 1 : n)) * (1 - t * t);
      gw += dz * x;
      gb += dz;
    });
    losses.push(lossAt(w, b));
    if (slip === 'before-backward') continue;
    gwTotal += gw;
    gbTotal += gb;
    const [dw, db] = slip === 'pile-up' ? [gwTotal, gbTotal] : [gw, gb];
    const sign = slip === 'uphill' ? 1 : -1;
    w += sign * lr * dw;
    if (slip !== 'no-bias') b += sign * lr * db;
  }
  return { losses, w, b };
}

function checkTrain(input: TrainInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  const { steps } = input;
  if (!isNumbers(got)) return { pass: false, message: 'train should return a list of numbers: the loss as a plain number (loss.data), once per step.' };
  if (got.length !== steps) return { pass: false, message: `Record one loss per step: ${steps} steps should give ${steps} losses, but train returned ${got.length}.` };
  const { losses: want, w, b } = trainReference(input);
  if (matches(got, want)) {
    return { pass: true, message: `The loss falls from ${fmt(want[0])} to ${fmt(want[steps - 1])} in ${steps} step${steps === 1 ? '' : 's'}, leaving w = ${fmt(w)} and b = ${fmt(b)}: your engine trained a neuron.` };
  }
  if (steps > 1 && got.every((v) => close(v, got[0]))) {
    return { pass: false, message: 'The loss never changes, so w and b never move. Run backward(loss) before the update (fresh leaves start with grad 0), and carry the new numbers into the next step: w = w − lr·w.grad, where w is the plain number the next step’s leaf is made from.' };
  }
  const slips: [TrainSlip, string][] = [
    ['sum', 'Your losses are the sum of the squared errors: divide by the number of points to get the mean, as the task asks (it keeps the step size the same however many points there are).'],
    ['uphill', 'The loss goes up: the gradient points uphill, so step against it, w ← w − lr·w.grad, not +.'],
    ['pile-up', 'The gradients pile up from step to step: make fresh leaf Values for w and b at the start of every step (or set their grad back to 0), since backward adds to grad.'],
    ['no-bias', 'w learns but b never moves: update b too, b ← b − lr·b.grad.'],
  ];
  for (const [slip, message] of slips) {
    if (matches(got, trainReference(input, slip).losses)) return { pass: false, message };
  }
  const i = want.findIndex((v, k) => !close(got[k], v));
  return {
    pass: false,
    message: `The loss at step ${i + 1} should be ${fmt(want[i])}, but yours is ${fmt(got[i])}. Each step: fresh leaves for w and b, the mean of (tanh(w·x + b) − y)² over the points, record loss.data, backward(loss), then w ← w − lr·w.grad and b ← b − lr·b.grad.`,
  };
}

const TRAIN_PY = `def train(xs, ys, w, b, lr, steps):
    losses = []
    for step in range(steps):
        wv = Value(w)  # fresh leaves, so their gradients start at 0
        bv = Value(b)
        loss = Value(0.0)
        for i in range(len(xs)):
            pred = (wv * Value(xs[i]) + bv).tanh()
            loss = loss + (pred - Value(ys[i])) ** 2
        loss = loss / Value(len(xs))  # the mean squared error
        losses.append(loss.data)  # before the update
        backward(loss)
        w = w - lr * wv.grad  # downhill
        b = b - lr * bv.grad
    return losses
`;
const TRAIN_STARTER_PY = `def train(xs, ys, w, b, lr, steps):
    losses = []
    for step in range(steps):
        # 1. Fresh leaves for this step: Value(w) and Value(b).
        # 2. The loss: the mean of (tanh(w·x + b) - y) ** 2 over the points.
        # 3. Record loss.data, run backward(loss), then move w and b downhill.
        pass
    return losses
`;
const trainJs = (typed: boolean) => {
  const t = (s: string) => (typed ? s : '');
  return `function train(xs${t(': number[]')}, ys${t(': number[]')}, w${t(': number')}, b${t(': number')}, lr${t(': number')}, steps${t(': number')})${t(': number[]')} {
  const losses${t(': number[]')} = [];
  for (let step = 0; step < steps; step++) {
    const wv = new Value(w); // fresh leaves, so their gradients start at 0
    const bv = new Value(b);
    let loss = new Value(0);
    for (let i = 0; i < xs.length; i++) {
      const pred = wv.mul(new Value(xs[i])).add(bv).tanh();
      loss = loss.add(pred.sub(new Value(ys[i])).pow(2));
    }
    loss = loss.div(new Value(xs.length)); // the mean squared error
    losses.push(loss.data); // before the update
    backward(loss);
    w = w - lr * wv.grad; // downhill
    b = b - lr * bv.grad;
  }
  return losses;
}
`;
};
const trainStarterJs = (typed: boolean) => {
  const t = (s: string) => (typed ? s : '');
  return `function train(xs${t(': number[]')}, ys${t(': number[]')}, w${t(': number')}, b${t(': number')}, lr${t(': number')}, steps${t(': number')})${t(': number[]')} {
  const losses${t(': number[]')} = [];
  for (let step = 0; step < steps; step++) {
    // 1. Fresh leaves for this step: new Value(w) and new Value(b).
    // 2. The loss: the mean of (tanh(w·x + b) - y) ** 2 over the points.
    // 3. Record loss.data, run backward(loss), then move w and b downhill.
  }
  return losses;
}
`;
};

const RUN_TRAINING_PY = `def run_training(xs, ys, w, b, lr, steps, losses):
    found = train(xs, ys, w, b, lr, steps)
    for i in range(min(len(found), len(losses))):
        losses[i] = round(found[i], 9)  # same digits in every language
    return [round(v, 9) for v in found]
`;
const runTrainingJs = (typed: boolean) => {
  const t = (s: string) => (typed ? s : '');
  return `function runTraining(xs${t(': number[]')}, ys${t(': number[]')}, w${t(': number')}, b${t(': number')}, lr${t(': number')}, steps${t(': number')}, losses${t(': number[]')})${t(': number[]')} {
  const found = train(xs, ys, w, b, lr, steps);
  for (let i = 0; i < Math.min(found.length, losses.length); i++) {
    losses[i] = Math.round(found[i] * 1e9) / 1e9; // same digits in every language
  }
  return found.map((v) => Math.round(v * 1e9) / 1e9);
}
`;
};

const trainPyCode = (train: string) => `${FULL_NOTE_PY}${ENGINE_PY}

${train}

${RUN_TRAINING_PY}`;
const trainJsCode = (train: string, typed: boolean) => `${FULL_NOTE_JS}${engineJs(typed)}
${train}
${runTrainingJs(typed)}`;

const trainExercise: Exercise<TrainInput> = {
  slug: 'train-neuron',
  title: 'Micrograd, part 5: train a neuron with your engine',
  kind: 'write',
  visualiser: 'autograd',
  summary: 'Gradient descent with your own autograd: build the loss, run backward, step downhill, and watch the loss fall.',
  task: [
    'Part 5, the last, of the project “Micrograd from scratch”. Your whole engine from parts 1 to 3 is written out for you. Now use it to train a neuron, ŷ = tanh(w·x + b), to fit the points (xs[i], ys[i]).',
    'Write `train(xs, ys, w, b, lr, steps)`. Each step: make fresh leaves `Value(w)` and `Value(b)` (so their gradients start at 0), build the loss as the mean of (ŷ − y)² over every point, record `loss.data`, run `backward(loss)`, then move downhill: w ← w − lr·(w’s grad) and b ← b − lr·(b’s grad), as plain numbers for the next step.',
    'Return the list of losses, one per step, each recorded before that step’s update. `run_training` (`runTraining` in JavaScript and TypeScript) is written for you: it writes your losses into `losses` so you can watch them fall.',
  ],
  entry: { python: 'run_training', js: 'runTraining' },
  args: trainArgs,
  starter: { python: trainPyCode(TRAIN_STARTER_PY), javascript: trainJsCode(trainStarterJs(false), false), typescript: trainJsCode(trainStarterJs(true), true) },
  solution: { python: trainPyCode(TRAIN_PY), javascript: trainJsCode(trainJs(false), false), typescript: trainJsCode(trainJs(true), true) },
  examples: [
    { id: 'one-point', label: 'One point, two steps', input: { xs: [1], ys: [0.8], w: 0, b: 0, lr: 0.5, steps: 2 } },
    { id: 'from-a-guess', label: 'One step from a guess', input: { xs: [-1], ys: [-0.6], w: 0.5, b: 0.2, lr: 0.5, steps: 1 } },
  ],
  tests: [
    { name: 'five points through the middle, 60 steps', input: { xs: [-2, -1, 0, 1, 2], ys: [-0.9, -0.6, 0, 0.6, 0.9], w: 0.1, b: 0.2, lr: 0.5, steps: 60 } },
    { name: 'four points that need a bias, from w = b = 0', input: { xs: [0, 1, 2, 3], ys: [-0.5, 0, 0.5, 0.8], w: 0, b: 0, lr: 0.3, steps: 80 } },
    { name: 'six falling points, from the wrong slope', input: { xs: [-1.5, -0.5, 0.5, 1.5, 2.5, 3], ys: [0.9, 0.7, 0.2, -0.3, -0.7, -0.9], w: 0.5, b: 0, lr: 0.2, steps: 100 } },
    { name: 'a big learning rate', input: { xs: [0.5, 1, 1.5, 2], ys: [0.3, 0.5, 0.7, 0.8], w: -0.2, b: 0.1, lr: 1, steps: 50 } },
    { name: 'one step: the loss before any update', input: { xs: [1, 2, 3], ys: [0.5, -0.5, 0.2], w: 0.3, b: -0.2, lr: 0.5, steps: 1 } },
  ],
  check: checkTrain,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Inside the loop, start with `wv = Value(w)` and `bv = Value(b)`, and `loss = Value(0.0)`; add `(pred - Value(ys[i])) ** 2` for each point, then divide by `Value(len(xs))`. In JavaScript and TypeScript: `new Value(w)`, `loss.add(pred.sub(new Value(ys[i])).pow(2))` and `loss.div(new Value(xs.length))`.',
    '`pred` is `(wv * Value(xs[i]) + bv).tanh()` (`wv.mul(new Value(xs[i])).add(bv).tanh()`). Append `loss.data` to the losses before you change anything.',
    'After `backward(loss)`, `wv.grad` is how the loss changes with w. Step against it: `w = w - lr * wv.grad`, and the same for b.',
  ],
  legend: [
    { neutral: 'A step not trained yet (0)' },
    { mark: 'write', label: 'The loss your code just recorded' },
  ],
  judge: { budget: 'project' },
};

export const autogradExercises: Exercise[] = [opsExercise, gradientCheckExercise, trainExercise];

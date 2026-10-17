import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { topological, Value } from '@/ml/autograd';
import { ask, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { depthColumns, layered } from '@/viz/plot/network';
import type { NetEdge, NetNode, NetworkPart, PlotPart, PlotState } from '@/viz/plot/types';

export type ExprId = 'simple' | 'neuron' | 'reuse' | 'loss';
export type ChainInput = { expr: ExprId; values: number[] };

type Expr = {
  label: string;
  /** The formula, for narration. */
  formula: string;
  leaves: readonly string[];
  defaults: readonly number[];
  /** Builds the graph from the leaf values; every value is named, and the output is last. */
  build: (xs: readonly number[]) => Value;
};

// Each computed value is named "name = how", so the box says what it is.
const name = (v: Value, label: string) => v.named(label);

export const EXPRESSIONS: Record<ExprId, Expr> = {
  simple: {
    label: 'L = (a·b + c)·f',
    formula: 'L = (a·b + c)·f',
    leaves: ['a', 'b', 'c', 'f'],
    defaults: [2, -3, 10, -2],
    build: ([a, b, c, f]) => {
      const [A, B, C, F] = [new Value(a, 'a'), new Value(b, 'b'), new Value(c, 'c'), new Value(f, 'f')];
      const e = name(A.mul(B), 'e = a×b');
      const d = name(e.add(C), 'd = e+c');
      return name(d.mul(F), 'L = d×f');
    },
  },
  neuron: {
    label: 'A neuron: tanh(x1·w1 + x2·w2 + b)',
    formula: 'o = tanh(x1·w1 + x2·w2 + b)',
    leaves: ['x1', 'w1', 'x2', 'w2', 'b'],
    defaults: [2, -3, 0, 1, 6.88],
    build: ([x1, w1, x2, w2, b]) => {
      const p1 = name(new Value(x1, 'x1').mul(new Value(w1, 'w1')), 'p1 = x1×w1');
      const p2 = name(new Value(x2, 'x2').mul(new Value(w2, 'w2')), 'p2 = x2×w2');
      const s = name(p1.add(p2), 's = p1+p2');
      const n = name(s.add(new Value(b, 'b')), 'n = s+b');
      return name(n.tanh(), 'o = tanh(n)');
    },
  },
  reuse: {
    label: 'f = a·b + a (a used twice)',
    formula: 'f = a·b + a',
    leaves: ['a', 'b'],
    defaults: [3, -2],
    build: ([a, b]) => {
      const A = new Value(a, 'a');
      const p = name(A.mul(new Value(b, 'b')), 'p = a×b');
      return name(p.add(A), 'f = p+a');
    },
  },
  loss: {
    label: 'A squared error: (w·x − y)²',
    formula: 'L = (w·x − y)²',
    leaves: ['w', 'x', 'y'],
    defaults: [0.5, 2, 3],
    build: ([w, x, y]) => {
      const p = name(new Value(w, 'w').mul(new Value(x, 'x')), 'p = w×x');
      const r = name(p.sub(new Value(y, 'y')), 'r = p−y');
      return name(r.pow(2), 'L = r²');
    },
  },
};
const EXPR_IDS = Object.keys(EXPRESSIONS) as ExprId[];

const pseudocode = [
  'forward: each node from its inputs',
  'out.grad ← 1',
  'for v in reverse topological order:',
  '  for each input u of v:',
  '    u.grad += (∂v/∂u) · v.grad',
];

/** The values in the order the forward pass computes them, with `sub` and `neg` folded into their parent. */
function graphOf(input: ChainInput) {
  const out = EXPRESSIONS[input.expr].build(input.values);
  const order = topological(out);
  // Unnamed helpers (the −y inside a subtraction, constants) are folded into the node that uses them.
  const shown = order.filter((v) => v.label !== '');
  const shownSet = new Set(shown);
  /** The shown values a value is computed from, looking through hidden helpers. */
  const inputsOf = (v: Value): Value[] => v.inputs.flatMap((u) => (shownSet.has(u) ? [u] : inputsOf(u)));
  return { out, order, shown, inputsOf };
}

const id = (v: Value) => v.label.split(' ')[0];
const g = (x: number) => fmt(x, 4);

function network(
  shown: readonly Value[],
  inputsOf: (v: Value) => Value[],
  state: { computed: ReadonlySet<Value>; graded: ReadonlySet<Value>; focus: Value | null; flowing: ReadonlySet<Value>; backward: boolean },
): NetworkPart {
  const inputs = new Map(shown.map((v) => [id(v), inputsOf(v).map(id)]));
  const at = layered(depthColumns(inputs, shown.map(id)), { dx: 118, dy: 60 });
  const nodes: NetNode[] = shown.map((v) => ({
    id: id(v),
    ...at.get(id(v))!,
    kind: 'value',
    label: v.label,
    value: state.computed.has(v) ? `data ${g(v.data)}` : 'data ?',
    grad: state.backward ? (state.graded.has(v) ? `grad ${g(v.grad)}` : 'grad ?') : undefined,
    mark: v === state.focus ? 'key' : state.backward && state.flowing.has(v) ? 'found' : null,
  }));
  const edges: NetEdge[] = shown.flatMap((v) =>
    inputsOf(v).map((u) => ({
      id: `${id(u)}>${id(v)}`,
      from: id(u),
      to: id(v),
      mark: v === state.focus ? (state.backward ? 'found' : 'compare') : null,
    })),
  );
  return { kind: 'network', id: 'graph', label: state.backward ? 'Backward: gradients flow right to left' : 'Forward: values flow left to right', nodes, edges };
}

/** How v's value came from its shown inputs, e.g. "2 × −3 = −6". */
function arithmetic(v: Value, inputsOf: (v: Value) => Value[]): string {
  const ins = inputsOf(v).map((u) => g(u.data));
  switch (v.op) {
    case '+':
      return v.inputs.length === 2 && v.inputs[1].op === 'neg' ? `${ins[0]} − ${ins[1]} = ${g(v.data)}` : `${ins.join(' + ')} = ${g(v.data)}`;
    case '×':
      return `${ins.join(' × ')} = ${g(v.data)}`;
    case 'tanh':
      return `tanh(${ins[0]}) = ${g(v.data)}`;
    case '^':
      return `${ins[0]}² = ${g(v.data)}`;
    default:
      return g(v.data);
  }
}

/**
 * The local derivative of v with respect to each shown input, as the
 * forward pass recorded it (folding a hidden negation into a −1).
 */
function locals(v: Value, inputsOf: (v: Value) => Value[]): { u: Value; local: number; why: string }[] {
  const ins = inputsOf(v);
  return ins.map((u, k) => {
    const direct = v.inputs.indexOf(u);
    if (direct === -1) {
      // u reaches v through a hidden neg: d(−u)/du = −1.
      const helper = v.inputs.find((h) => h.inputs.includes(u))!;
      const local = v.locals[v.inputs.indexOf(helper)] * helper.locals[helper.inputs.indexOf(u)];
      return { u, local, why: 'subtracting it flips the sign' };
    }
    const local = v.locals[direct];
    const other = ins[1 - k];
    const why =
      v.op === '+'
        ? 'an addition passes the gradient straight through'
        : v.op === '×'
          ? `a product’s local derivative is the other factor, ${other ? g(other.data) : '?'}`
          : v.op === 'tanh'
            ? `tanh’s local derivative is 1 − tanh² = 1 − ${g(v.data)}²`
            : v.op === '^'
              ? `a square’s local derivative is 2 × ${g(u.data)}`
              : 'its local derivative';
    return { u, local, why };
  });
}

function* run(input: ChainInput): Generator<Frame<PlotState>> {
  const ex = EXPRESSIONS[input.expr];
  const { out, shown, inputsOf } = graphOf(input);
  const leaves = shown.filter((v) => inputsOf(v).length === 0);
  const inner = shown.filter((v) => inputsOf(v).length > 0);
  const computed = new Set<Value>(leaves);
  const parts = (n: NetworkPart, more: PlotPart[] = []): PlotPart[] => [n, ...more];
  const leafVars = Object.fromEntries(leaves.map((v) => [id(v), v.data]));

  // Run backward once up front so every gradient is known; frames reveal them in order.
  out.backward();
  const finalGrad = new Map(shown.map((v) => [v, v.grad]));

  yield plotFrame(parts(network(shown, inputsOf, { computed, graded: new Set(), focus: null, flowing: new Set(), backward: false })), {
    line: null,
    note: `${ex.formula}, built as a graph: each box is one simple step. To train anything we need how much the output changes when each input is nudged: its gradient. First, compute forward.`,
    vars: leafVars,
    checkpoint: ask(`What will ${inner[0].label.split(' = ')[0]} be?`, g(inner[0].data), wrongNumbers(inner[0].data)),
  });

  for (let k = 0; k < inner.length; k++) {
    const v = inner[k];
    computed.add(v);
    const next = inner[k + 1];
    yield plotFrame(parts(network(shown, inputsOf, { computed, graded: new Set(), focus: v, flowing: new Set(), backward: false })), {
      line: 0,
      note: `${v.label.split(' = ')[0]} = ${v.label.split(' = ')[1]} = ${arithmetic(v, inputsOf)}.`,
      vars: { ...leafVars, [id(v)]: Number(v.data.toFixed(4)) },
      checkpoint: next ? ask(`What will ${next.label.split(' = ')[0]} be?`, g(next.data), wrongNumbers(next.data)) : undefined,
    });
  }

  // Backward: gradients are revealed as they are pushed from each node to its inputs.
  const graded = new Set<Value>([out]);
  const running = new Map<Value, number>(shown.map((v) => [v, 0]));
  running.set(out, 1);
  const reverse = [...inner].reverse();
  const firstLocal = locals(reverse[0], inputsOf)[0];
  yield plotFrame(parts(network(shown, inputsOf, { computed, graded, focus: out, flowing: new Set(), backward: true })), {
    line: 1,
    note: `Now backward. Nudging ${id(out)} changes ${id(out)} by exactly as much, so its own gradient is 1. Every other gradient comes from the chain rule, working back from here.`,
    vars: { [`d${id(out)}/d${id(out)}`]: 1 },
    checkpoint: ask(`What will the gradient of ${id(firstLocal.u)} be?`, g(finalGradAfter(firstLocal, reverse[0], running)), wrongNumbers(firstLocal.local)),
  });

  for (let k = 0; k < reverse.length; k++) {
    const v = reverse[k];
    const flows = locals(v, inputsOf);
    const lines = flows.map(({ u, local, why }) => {
      const before = running.get(u)!;
      const add = local * running.get(v)!;
      running.set(u, before + add);
      graded.add(u);
      return `${id(u)}: ${why}, so ∂${id(v)}/∂${id(u)} = ${g(local)}, × upstream ${g(running.get(v)!)} = ${g(add)}${before !== 0 ? `, added to the ${g(before)} it already had (it is used twice), giving ${g(before + add)}` : ''}`;
    });
    const nextV = reverse[k + 1];
    const nextFlow = nextV ? locals(nextV, inputsOf)[0] : undefined;
    yield plotFrame(parts(network(shown, inputsOf, { computed, graded, focus: v, flowing: new Set(flows.map((f) => f.u)), backward: true })), {
      line: 4,
      note: `From ${id(v)} (gradient ${g(running.get(v)!)}): ${lines.join('. ')}.`,
      vars: Object.fromEntries(flows.map(({ u }) => [`grad ${id(u)}`, Number(running.get(u)!.toFixed(4))])),
      checkpoint: nextFlow && nextV ? ask(`What will the gradient of ${id(nextFlow.u)} be?`, g(finalGradAfter(nextFlow, nextV, running)), wrongNumbers(nextFlow.local)) : undefined,
    });
  }

  // Check one leaf against a nudge, so the gradient means something concrete.
  const leaf = leaves.reduce((best, v) => (Math.abs(finalGrad.get(v)!) > Math.abs(finalGrad.get(best)!) ? v : best), leaves[0]);
  const nudged = EXPRESSIONS[input.expr].build(input.values.map((x, i) => (EXPRESSIONS[input.expr].leaves[i] === id(leaf) ? x + 0.001 : x))).data;
  yield plotFrame(
    parts(network(shown, inputsOf, { computed, graded, focus: null, flowing: new Set(), backward: true }), [
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Gradients',
        items: leaves.map((v) => ({ id: id(v), label: `∂${id(out)}/∂${id(v)}`, value: g(finalGrad.get(v)!), mark: v === leaf ? ('found' as const) : null })),
      },
    ]),
    {
      line: null,
      note: `Every gradient is in. Check one: nudging ${id(leaf)} by 0.001 moves ${id(out)} from ${g(out.data)} to ${g(nudged)}, a change of ${g(nudged - out.data)}, which is ${g(finalGrad.get(leaf)!)} × 0.001 as its gradient predicts. Gradient descent uses exactly these numbers.`,
      vars: Object.fromEntries(leaves.map((v) => [`grad ${id(v)}`, Number(finalGrad.get(v)!.toFixed(4))])),
    },
  );
}

/** The gradient u will have right after v pushes to it (without mutating the running totals). */
function finalGradAfter(flow: { u: Value; local: number }, v: Value, running: ReadonlyMap<Value, number>): number {
  return running.get(flow.u)! + flow.local * running.get(v)!;
}

/** Plausible wrong numbers near a value: sign flips and off-by-one-step mistakes. */
function wrongNumbers(x: number): string[] {
  return [g(-x), g(x + 1), g(x === 0 ? 1 : x * 2), g(x - 1)];
}

const example = (id: string, expr: ExprId) => ({ id, label: EXPRESSIONS[expr].label, make: () => ({ expr, values: [...EXPRESSIONS[expr].defaults] }), sized: false });

export const chainRule = defineAlgorithm<ChainInput, PlotState>({
  kind: 'algorithm',
  slug: 'chain-rule',
  view: 'plot',
  input: {
    examples: [example('simple', 'simple'), example('neuron', 'neuron'), example('reuse', 'reuse'), example('loss', 'loss')],
    custom: {
      label: 'Expression (simple, neuron, reuse, loss) and its inputs in order',
      placeholder: 'e.g. neuron: 2, -3, 0, 1, 6.88',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
        const expr = EXPR_IDS.find((e) => e === word);
        if (!expr) return { error: 'Start with an expression: simple, neuron, reuse or loss.' };
        const xs = numbersIn(text.slice(text.indexOf(word) + word.length));
        const { leaves } = EXPRESSIONS[expr];
        if (xs.length !== leaves.length) return { error: `${expr} takes ${leaves.length} numbers: ${leaves.join(', ')}.` };
        if (xs.some((x) => Math.abs(x) > 100)) return { error: 'Keep the inputs between −100 and 100.' };
        return { value: { expr, values: xs.map((x) => Number(x.toFixed(2))) } };
      },
      format: ({ expr, values }) => `${expr}: ${values.map((x) => plain(x)).join(', ')}`,
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'A value: what it is, its data and its gradient' },
    { mark: 'key', label: 'The node being computed' },
    { mark: 'compare', label: 'Inputs flowing forward' },
    { mark: 'found', label: 'Gradients flowing back' },
  ],
  run,
  content: {
    idea: 'Break a formula into small steps and draw them as a graph. Compute forward to get the output, then walk backward: each node knows its local derivative, and multiplying it by the gradient arriving from above gives the gradient for its inputs. That is the chain rule, and it is all backpropagation is.',
    invariant: 'After the backward pass, every value’s gradient is ∂out/∂value: the sum, over every path from it to the output, of the product of the local derivatives along the path. A value used twice adds up the gradients from both uses.',
    whenToUse: 'Whenever you need the gradient of a computation with many inputs: training any neural network (PyTorch and JAX build exactly this graph), sensitivity analysis, and checking gradients you derived by hand. One backward pass costs about as much as the forward pass, however many inputs there are.',
    traits: [
      { label: 'Local derivative × upstream gradient', good: null },
      { label: 'One backward pass for all inputs', good: true },
      { label: 'Gradients add up when a value is reused', good: null },
    ],
    experiments: [
      { example: 'simple', prompt: 'The micrograd classic: watch the gradient of f come out as d = 4, and a’s as b × the gradient of e.' },
      { example: 'neuron', prompt: 'x2 = 0, so however much w2 is nudged the neuron can’t change: its gradient comes out 0.' },
      { example: 'reuse', prompt: 'a feeds two places, so its gradient is the sum of both: b from the product and 1 from the addition.' },
      { example: 'loss', prompt: 'The gradient of a squared error is 2 × the error × the input: exactly what linear regression follows.' },
    ],
  },
});

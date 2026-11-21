// Automatic differentiation (B4 of the math and ML path): a computation is
// recorded as a graph of Values (src/ml/autograd.ts) and the chain rule runs
// backwards through all of it at once. Three stories: why backward needs a
// topological order (built by depth-first search) when values are reused;
// forward mode (tangents, one pass per input) against reverse mode (one
// backward pass for every input); and training one neuron with the engine.
// The pure helpers are exported so the lesson's numbers and the M2
// ("micrograd from scratch") exercises can agree with what is drawn.

import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { topological, Value } from '@/ml/autograd';
import type { MarkKey } from '@/viz/marks';
import { contours, logLevels } from '@/viz/plot/contours';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import { depthColumns, layered } from '@/viz/plot/network';
import type { ContourShape, NetEdge, NetNode, NetworkPart, PlanePart, PlotPart, PlotState, Readout, Shape, TokensPart, Vec } from '@/viz/plot/types';

// ───────────────────────────── the graphs ─────────────────────────────

export type Story = 'order' | 'modes' | 'train';
export type AutogradInput =
  | { story: 'order'; values: readonly number[] }
  | { story: 'modes'; values: readonly number[] }
  | { story: 'train'; start: Vec; data: readonly Vec[] };

/** A recorded computation: its output, its leaves in input order, and every value in topological order. */
export type Graph = { out: Value; leaves: Value[]; nodes: Value[] };

export const ORDER_LEAVES = ['a', 'b', 'c'] as const;
export const ORDER_DEFAULTS = [2, 3, -4] as const;
export const ORDER_FORMULA = 'L = r + q, with p = a·b, q = p + c and r = q·p';

/** L = r + q where p = a·b, q = p + c, r = q·p: p feeds q and r, and q feeds r and L. */
export function orderGraph(values: readonly number[]): Graph {
  const [A, B, C] = ORDER_LEAVES.map((n, i) => new Value(values[i], n));
  const p = A.mul(B).named('p = a×b');
  const q = p.add(C).named('q = p+c');
  const r = q.mul(p).named('r = q×p');
  const L = r.add(q).named('L = r+q');
  return { out: L, leaves: [A, B, C], nodes: topological(L) };
}

export const MODES_LEAVES = ['x1', 'x2', 'x3'] as const;
export const MODES_DEFAULTS = [2, 3, -1] as const;
export const MODES_FORMULA = 'f = (x1·x2 + x3)·x1';

/** f = (x1·x2 + x3)·x1, three inputs and one output (x1 used twice). */
export function modesGraph(values: readonly number[]): Graph {
  const [x1, x2, x3] = MODES_LEAVES.map((n, i) => new Value(values[i], n));
  const p = x1.mul(x2).named('p = x1×x2');
  const s = p.add(x3).named('s = p+x3');
  const f = s.mul(x1).named('f = s×x1');
  return { out: f, leaves: [x1, x2, x3], nodes: topological(f) };
}

/** A node's short name: "p" for "p = a×b". */
export const nameOf = (v: Value) => v.label.split(' ')[0];

/**
 * One step of the depth-first search: `node` joins the order while `waiting`
 * (outermost first) wait for their inputs; `already` are the inputs that were
 * in the order before the search reached them from `node`.
 */
export type TopoStep = { node: Value; waiting: Value[]; order: Value[]; already: Value[] };

/** The depth-first search that builds a topological order, one step per node added (the same order as `topological`). */
export function topoSteps(out: Value): TopoStep[] {
  const seen = new Set<Value>();
  const order: Value[] = [];
  const stack: Value[] = [];
  const steps: TopoStep[] = [];
  const visit = (v: Value) => {
    if (seen.has(v)) return;
    seen.add(v);
    stack.push(v);
    const already: Value[] = [];
    for (const u of v.inputs) {
      if (seen.has(u)) already.push(u);
      visit(u);
    }
    stack.pop();
    order.push(v);
    steps.push({ node: v, waiting: [...stack], order: [...order], already });
  };
  visit(out);
  return steps;
}

/** One node's backward step: what each input had, what it gets, and what it ends with after this step. */
export type BackStep = { node: Value; upstream: number; flows: { input: Value; local: number; before: number; add: number; after: number }[] };

/**
 * Backward along the reversed topological order, step by step, with the
 * running totals (gradients start at 0, the output's at 1). Returns the steps
 * of nodes that have inputs, and the final gradient of every value.
 */
export function backwardSteps(out: Value): { steps: BackStep[]; grads: Map<Value, number> } {
  const order = topological(out);
  const grads = new Map<Value, number>(order.map((v) => [v, 0]));
  grads.set(out, 1);
  const steps: BackStep[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i];
    if (v.inputs.length === 0) continue;
    const upstream = grads.get(v)!;
    const flows = v.inputs.map((input, k) => {
      const before = grads.get(input)!;
      const add = v.locals[k] * upstream;
      grads.set(input, before + add);
      return { input, local: v.locals[k], before, add, after: before + add };
    });
    steps.push({ node: v, upstream, flows });
  }
  return { steps, grads };
}

/**
 * Forward mode: every value's tangent (how fast it changes per unit of the
 * `seed` leaf), from its inputs' tangents and its recorded local derivatives.
 * The output's tangent is ∂out/∂seed.
 */
export function forwardTangents(out: Value, seed: Value): Map<Value, number> {
  const t = new Map<Value, number>();
  for (const v of topological(out)) t.set(v, v.inputs.length === 0 ? (v === seed ? 1 : 0) : v.inputs.reduce((s, u, k) => s + v.locals[k] * t.get(u)!, 0));
  return t;
}

/**
 * Passes needed for every derivative of `outputs` outputs with respect to
 * `inputs` inputs: forward mode runs one pass per input; reverse mode one
 * forward pass and one backward pass per output.
 */
export function passesNeeded(inputs: number, outputs: number) {
  return { forwardMode: { forward: inputs, backward: 0 }, reverseMode: { forward: 1, backward: outputs } };
}

/** The contrast the modes story ends on: a model with a million weights and one loss. */
export const MILLION = 1_000_000;

// ───────────────────────────── training a neuron ─────────────────────────────

/** Five points an S-shaped neuron can fit (x, y). */
export const TRAIN_DATA: readonly Vec[] = [
  [-2, -0.9],
  [-1, -0.7],
  [0, 0.2],
  [1, 0.8],
  [2, 0.9],
];
/** The starting (w, b): a fit sloping the wrong way. */
export const TRAIN_START: Vec = [-1, 1];
/** The step size η. */
export const LR = 0.25;
export const TRAIN_STEPS = 80;
/** The steps drawn one by one, then the jumps to convergence. */
export const ONE_BY_ONE = 3;
export const JUMPS = [5, 10, 20, 40, 80] as const;
/** Bounds of the starting weights (and the weights plane). */
export const WEIGHT_BOX = { min: -3, max: 3, step: 0.1 } as const;

/** The mean squared error of ŷ = tanh(w·x + b) on the data, built as a graph of Values. */
export function neuronLoss(data: readonly Vec[], w: number, b: number): { loss: Value; w: Value; b: Value } {
  const W = new Value(w, 'w');
  const B = new Value(b, 'b');
  const terms = data.map(([x, y]) => W.mul(x).add(B).tanh().sub(y).pow(2));
  const sum = terms.slice(1).reduce((s, t) => s.add(t), terms[0]);
  return { loss: sum.mul(1 / data.length), w: W, b: B };
}

/** The same loss on plain numbers (for contours and checks). */
export function mse(data: readonly Vec[], w: number, b: number): number {
  return data.reduce((s, [x, y]) => s + (Math.tanh(w * x + b) - y) ** 2, 0) / data.length;
}

/** The fit's prediction. */
export const neuron = (w: number, b: number, x: number) => Math.tanh(w * x + b);

export type TrainRun = {
  /** Weights, loss and gradients at each step 0..steps (the gradient at step k is what step k + 1 uses). */
  w: number[];
  b: number[];
  loss: number[];
  gw: number[];
  gb: number[];
  /** Values in one step's graph. */
  nodes: number;
};

/** Gradient descent with the engine: each step builds a fresh graph of the loss, runs backward and steps against the gradient. */
export function trainNeuron(data: readonly Vec[], start: Vec, lr = LR, steps = TRAIN_STEPS): TrainRun {
  const run: TrainRun = { w: [], b: [], loss: [], gw: [], gb: [], nodes: 0 };
  let [w, b] = start;
  for (let k = 0; k <= steps; k++) {
    const g = neuronLoss(data, w, b);
    const order = g.loss.backward();
    run.nodes = order.length;
    run.w.push(w);
    run.b.push(b);
    run.loss.push(g.loss.data);
    run.gw.push(g.w.grad);
    run.gb.push(g.b.grad);
    w -= lr * g.w.grad;
    b -= lr * g.b.grad;
  }
  return run;
}

// ───────────────────────────── drawing helpers ─────────────────────────────

const g4 = (x: number) => fmt(x, 4);
/** Pass counts: forward-mode passes (tangents), forward passes (values) and backward passes (gradients). */
const STATS = (forward: number, backward: number, forwardMode = 0) => ({ forwardMode, forward, backward });

/** A number written after an operator: negatives in brackets, "× (−0.94)". */
const after4 = (x: number) => (x < 0 ? `(${g4(x)})` : g4(x));
const after3 = (x: number) => (x < 0 ? `(${fmt(x, 3)})` : fmt(x, 3));

/** Plausible wrong numbers near a value: a sign flip and off-by-one-step mistakes. */
function wrongNumbers(x: number, f: (x: number) => string): string[] {
  return [f(-x), f(x + 1), f(x === 0 ? 1 : x * 2), f(x - 1)];
}

/** Real slips first; the generic ones fill in when slips coincide with the answer or each other. */
const slips = (answer: number, real: readonly number[]) => [...real.map(g4), ...wrongNumbers(answer, g4)];

type Look = { value: string; second?: string; mark?: MarkKey | null };

function network(graph: Graph, label: string, look: (v: Value) => Look, edgeMark: (from: Value, to: Value) => MarkKey | null = () => null): NetworkPart {
  const ids = graph.nodes.map(nameOf);
  const inputs = new Map(graph.nodes.map((v) => [nameOf(v), v.inputs.map(nameOf)]));
  const at = layered(depthColumns(inputs, ids), { dx: 118, dy: 60 });
  const nodes: NetNode[] = graph.nodes.map((v) => {
    const l = look(v);
    return { id: nameOf(v), ...at.get(nameOf(v))!, kind: 'value', label: v.label, value: l.value, grad: l.second, mark: l.mark ?? null };
  });
  const edges: NetEdge[] = graph.nodes.flatMap((v) => v.inputs.map((u) => ({ id: `${nameOf(u)}>${nameOf(v)}`, from: nameOf(u), to: nameOf(v), mark: edgeMark(u, v) })));
  return { kind: 'network', id: 'graph', label, nodes, edges };
}

/** "p = a×b" as arithmetic: "2 × 3 = 6". */
function arithmetic(v: Value): string {
  const ins = v.inputs.map((u, k) => (k === 0 ? g4(u.data) : after4(u.data)));
  return `${ins.join(v.op === '×' ? ' × ' : ' + ')} = ${g4(v.data)}`;
}

/** Why an input of v gets the local derivative it does. */
function why(v: Value, k: number): string {
  if (v.op === '+') return 'an addition passes it straight through';
  const other = v.inputs[1 - k];
  return `a product’s local derivative is the other factor, ${nameOf(other)} = ${g4(other.data)}`;
}

const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// ───────────────────────────── story 1: order ─────────────────────────────

function orderTokens(order: readonly Value[], mark: (v: Value, i: number) => MarkKey | null): TokensPart {
  return {
    kind: 'tokens',
    id: 'order',
    label: 'Topological order: every node after its inputs',
    tokens: order.map((v, i) => ({ id: nameOf(v), text: nameOf(v), sub: String(i + 1), mark: mark(v, i) })),
  };
}

function* orderStory(values: readonly number[]): Generator<Frame<PlotState>> {
  const graph = orderGraph(values);
  const { out, nodes, leaves } = graph;
  const inner = nodes.filter((v) => v.inputs.length > 0);
  const leafVars = Object.fromEntries(leaves.map((v) => [nameOf(v), v.data]));
  const data = (v: Value) => `data ${g4(v.data)}`;
  const named = (k: string) => nodes.find((v) => nameOf(v) === k)!;

  // Forward.
  yield plotFrame([network(graph, 'Forward: values flow left to right', (v) => ({ value: v.inputs.length ? 'data ?' : data(v) }))], {
    line: null,
    note: `${ORDER_FORMULA}. Two values are used twice: p feeds q and r, q feeds r and L. Building it computes each value and records the local derivatives.`,
    vars: leafVars,
    stats: STATS(0, 0),
    checkpoint: ask('What will L be?', g4(out.data), wrongNumbers(out.data, g4)),
  });
  yield plotFrame([network(graph, 'Forward: values flow left to right', (v) => ({ value: data(v) }), () => 'compare')], {
    line: 0,
    note: `Forward: ${inner.map((v) => `${nameOf(v)} = ${arithmetic(v)}`).join(', ')}. Now backward. Done in the wrong order, a value could pass its gradient on before all of its gradient has arrived.`,
    vars: { ...leafVars, ...Object.fromEntries(inner.map((v) => [nameOf(v), round(v.data, 4)])) },
    stats: STATS(1, 0),
  });

  // The order, by depth-first search.
  const steps = topoSteps(out);
  const order = steps.at(-1)!.order;
  const nextAsk = (i: number) => {
    const next = steps[i + 1].node;
    const left = order.filter((v) => !steps[i].order.includes(v) && v !== next).map(nameOf);
    return ask('Which node joins the order next?', nameOf(next), left);
  };
  yield plotFrame([network(graph, 'Searching from L, inputs first', (v) => ({ value: data(v), mark: v === out ? 'key' : null }))], {
    line: 1,
    note: `Backward needs each value after everything made from it. Reverse a topological order, where every node comes after its inputs, and that holds. Build one by depth-first search from ${nameOf(out)}: add a node only after its inputs.`,
    stats: STATS(1, 0),
    checkpoint: ask('Which node joins the order first?', nameOf(steps[0].node), order.slice(1).map(nameOf)),
  });
  const ASK_AFTER = new Set(['b', 'p', 'q']);
  for (let i = 0; i < steps.length; i++) {
    const { node, waiting, order: sofar, already } = steps[i];
    const ins = node.inputs.map(nameOf);
    const how =
      node.inputs.length === 0
        ? `${nameOf(node)} has no inputs, so it joins the order at once`
        : `${list(ins)} ${ins.length > 1 ? 'are' : 'is'} in the order${already.length ? ` (${list(already.map(nameOf))} already was, reached through another path)` : ''}, so ${nameOf(node)} joins`;
    const wait = waiting.length ? ` Still waiting for their inputs: ${list(waiting.map(nameOf))}.` : ' Every node is in: the search is done.';
    yield plotFrame(
      [
        orderTokens(sofar, (v) => (v === node ? 'key' : 'write')),
        network(graph, 'Searching from L, inputs first', (v) => ({ value: data(v), mark: v === node ? 'key' : waiting.includes(v) ? 'frontier' : sofar.includes(v) ? 'write' : null }), (u, v) => (v === node ? 'compare' : null)),
      ],
      {
        line: 4,
        note: `${how}: position ${i + 1}.${wait}`,
        vars: { order: sofar.map(nameOf).join(' ') },
        stats: STATS(1, 0),
        checkpoint: ASK_AFTER.has(nameOf(node)) && i + 1 < steps.length ? nextAsk(i) : undefined,
      },
    );
  }

  // Backward, along the order read from the right.
  const back = backwardSteps(out);
  const running = new Map<Value, number>(nodes.map((v) => [v, 0]));
  running.set(out, 1);
  const pos = (v: Value) => order.indexOf(v);
  const tokensAt = (current: Value | null) =>
    orderTokens(order, (v) => (v === current ? 'key' : current && pos(v) > pos(current) ? 'visited' : !current ? 'visited' : null));
  const backNet = (focus: Value | null, receivers: readonly Value[]) =>
    network(
      graph,
      'Backward: gradients flow right to left',
      (v) => ({ value: data(v), second: `grad ${g4(running.get(v)!)}`, mark: v === focus ? 'key' : receivers.includes(v) ? 'found' : null }),
      (u, v) => (v === focus ? 'found' : null),
    );
  const [stepL, stepR, stepQ] = back.steps;
  const q = named('q');
  const p = named('p');
  yield plotFrame([tokensAt(out), backNet(out, [])], {
    line: 5,
    note: `Read the order from the right: ${[...order].reverse().map(nameOf).join(', ')}. Every gradient starts at 0, and ${nameOf(out)}’s at 1: nudging ${nameOf(out)} moves ${nameOf(out)} by as much.`,
    vars: { [`${nameOf(out)}.grad`]: 1 },
    stats: STATS(1, 0),
    checkpoint: ask(`What will ${nameOf(stepL.flows[0].input)}’s gradient be?`, g4(stepL.flows[0].after), wrongNumbers(stepL.flows[0].after, g4)),
  });
  for (let k = 0; k < back.steps.length; k++) {
    const step = back.steps[k];
    const v = step.node;
    const said = step.flows.map(({ input, local, before, add, after }, j) => {
      running.set(input, after);
      const leaf = input.inputs.length === 0 ? ` (${nameOf(input)} is a leaf: it has nothing to pass on)` : '';
      return `${nameOf(input)}: ${why(v, j)}, so ${g4(local)} × ${after4(step.upstream)} = ${g4(add)}${before !== 0 ? `, added to the ${g4(before)} it already had: ${g4(after)}` : ''}${leaf}`;
    });
    const last = k === back.steps.length - 1;
    const checkpoint =
      step === stepL
        ? askInOrder(`${nameOf(q)} holds ${g4(running.get(q)!)} so far. Can ${nameOf(q)} pass its gradient on yet?`, ['Yes', 'No'], 'No')
        : step === stepR
          ? (() => {
              const flow = stepQ.flows.find((f) => f.input === p)!;
              return ask(`What will ${nameOf(p)}’s gradient be after ${nameOf(q)}’s step?`, g4(flow.after), [g4(flow.before), g4(flow.add), g4(-flow.after), g4(flow.after + 1)]);
            })()
          : step === stepQ
            ? askInOrder(`Can ${nameOf(p)} pass its gradient on now?`, ['Yes', 'No'], 'Yes')
            : undefined;
    yield plotFrame([tokensAt(v), backNet(v, step.flows.map((f) => f.input))], {
      line: 8,
      note: `From ${nameOf(v)} (gradient ${g4(step.upstream)}, complete: everything made from it has sent its share). ${said.join('. ')}.`,
      vars: Object.fromEntries(step.flows.map(({ input }) => [`${nameOf(input)}.grad`, round(running.get(input)!, 4)])),
      stats: STATS(1, last ? 1 : 0),
      checkpoint,
    });
  }

  // Check against nudges.
  const f = (xs: number[]) => orderGraph(xs).out.data;
  const best = leaves.reduce((m, v) => (Math.abs(back.grads.get(v)!) > Math.abs(back.grads.get(m)!) ? v : m), leaves[0]);
  const i = leaves.indexOf(best);
  const nudged = f(values.map((x, j) => (j === i ? x + 0.001 : x)));
  yield plotFrame(
    [
      tokensAt(null),
      backNet(null, []),
      {
        kind: 'readouts',
        id: 'readouts',
        label: 'Gradients after one backward pass',
        items: leaves.map((v): Readout => ({ id: nameOf(v), label: `∂${nameOf(out)}/∂${nameOf(v)}`, value: g4(back.grads.get(v)!), mark: v === best ? 'found' : null })),
      },
    ],
    {
      line: null,
      note: `One backward pass gave every gradient, each node handled once, after its whole gradient had arrived. Check one: nudging ${nameOf(best)} by 0.001 moves ${nameOf(out)} from ${g4(out.data)} to ${g4(nudged)}, about ${g4(back.grads.get(best)!)} × 0.001.`,
      vars: Object.fromEntries(leaves.map((v) => [`${nameOf(v)}.grad`, round(back.grads.get(v)!, 4)])),
      stats: STATS(1, 1),
    },
  );
}

// ───────────────────────────── story 2: forward mode against reverse mode ─────────────────────────────

function* modesStory(values: readonly number[]): Generator<Frame<PlotState>> {
  const graph = modesGraph(values);
  const { out, nodes, leaves } = graph;
  const inner = nodes.filter((v) => v.inputs.length > 0);
  const tangents = leaves.map((x) => forwardTangents(out, x));
  const back = backwardSteps(out);
  const fwd: (number | null)[] = leaves.map(() => null);
  const rev: (number | null)[] = leaves.map(() => null);
  const derivs = (): PlotPart => ({
    kind: 'readouts',
    id: 'derivs',
    label: `∂f/∂x for each input`,
    items: leaves.flatMap((x, i): Readout[] => [
      { id: `fwd-${nameOf(x)}`, label: `∂f/∂${nameOf(x)}, forward mode`, value: fwd[i] === null ? '?' : g4(fwd[i]!), tone: 1 },
      { id: `rev-${nameOf(x)}`, label: `∂f/∂${nameOf(x)}, reverse mode`, value: rev[i] === null ? '?' : g4(rev[i]!), tone: 2 },
    ]),
  });
  const forwardNet = (i: number, done: ReadonlySet<Value>, focus: Value | null) =>
    network(
      graph,
      `Forward mode, pass ${i + 1}: tangents per unit of ${nameOf(leaves[i])}`,
      (v) => ({
        value: done.has(v) ? `data ${g4(v.data)}` : 'data ?',
        second: done.has(v) ? `tangent ${g4(tangents[i].get(v)!)}` : 'tangent ?',
        mark: v === focus ? 'key' : v === leaves[i] ? 'compare' : null,
      }),
      (u, v) => (v === focus ? 'compare' : null),
    );
  const tangentText = (i: number, v: Value) =>
    `${v.inputs.map((u, k) => `${g4(v.locals[k])} × ${after4(tangents[i].get(u)!)}`).join(' + ')} = ${g4(tangents[i].get(v)!)}`;
  const leafVars = Object.fromEntries(leaves.map((v) => [nameOf(v), v.data]));
  const [x1] = leaves;
  const [p, s, f] = inner;
  const t1 = tangents[0];

  // Real slips for each tangent question in pass 1 (x1 is used twice, by p and by f).
  const tangentAsk = (v: Value) => {
    const answer = t1.get(v)!;
    const wrong =
      v === p
        ? [x1.data, p.data, 0] // the wrong factor (x1 instead of x2), p's value, nothing
        : v === s
          ? [s.data, answer + 1, 1] // s's value, counting x3's tangent as 1, only x3's
          : [t1.get(s)! * x1.data, s.data, f.data]; // only the path through s, only x1's direct use, f's value
    return ask(`What will ${nameOf(v)}’s tangent be?`, g4(answer), slips(answer, wrong));
  };

  // Pass 1, node by node.
  const done = new Set<Value>(leaves);
  yield plotFrame([forwardNet(0, done, null), derivs()], {
    line: 9,
    note: `${MODES_FORMULA}: three inputs, one output, and we want all three derivatives. Forward mode carries a second number with every value, its tangent: how fast it changes as ${nameOf(x1)} moves. So ${nameOf(x1)}’s tangent is 1 and the others’ are 0.`,
    vars: leafVars,
    stats: STATS(0, 0),
    checkpoint: tangentAsk(p),
  });
  for (let k = 0; k < inner.length; k++) {
    const v = inner[k];
    done.add(v);
    const next = inner[k + 1];
    const lastNode = !next;
    if (lastNode) fwd[0] = t1.get(out)!;
    yield plotFrame([forwardNet(0, done, v), derivs()], {
      line: 10,
      note: `${nameOf(v)} = ${arithmetic(v)}. Its tangent: each input’s tangent times ${nameOf(v)}’s local derivative for it, added up: ${tangentText(0, v)}.${lastNode ? ` That is ∂f/∂${nameOf(x1)}.` : ''}`,
      vars: { [nameOf(v)]: round(v.data, 4), [`${nameOf(v)} tangent`]: round(t1.get(v)!, 4) },
      stats: STATS(0, 0, lastNode ? 1 : 0),
      checkpoint: next ? tangentAsk(next) : ask('How many forward passes does forward mode need for all three derivatives?', '3', ['1', '2', '6']),
    });
  }
  for (let i = 1; i < leaves.length; i++) {
    fwd[i] = tangents[i].get(out)!;
    const all = new Set(nodes);
    yield plotFrame([forwardNet(i, all, out), derivs()], {
      line: 9,
      note: `Pass ${i + 1} of ${leaves.length}: start again with ${nameOf(leaves[i])}’s tangent 1 and the others 0. The tangents come out ${inner.map((v) => `${nameOf(v)} ${g4(tangents[i].get(v)!)}`).join(', ')}: ∂f/∂${nameOf(leaves[i])} = ${g4(fwd[i]!)}.`,
      vars: { [`∂f/∂${nameOf(leaves[i])}`]: round(fwd[i]!, 4) },
      stats: STATS(0, 0, i + 1),
    });
  }

  // Reverse mode: one forward pass, one backward pass.
  const running = new Map<Value, number>(nodes.map((v) => [v, 0]));
  running.set(out, 1);
  const reverseNet = (focus: Value | null, receivers: readonly Value[]) =>
    network(
      graph,
      'Reverse mode: gradients flow right to left',
      (v) => ({ value: `data ${g4(v.data)}`, second: `grad ${g4(running.get(v)!)}`, mark: v === focus ? 'key' : receivers.includes(v) ? 'found' : null }),
      (u, v) => (v === focus ? 'found' : null),
    );
  const F = leaves.length;
  const sFlow = back.steps[0].flows.find((fl) => fl.input === s)!;
  yield plotFrame([reverseNet(out, []), derivs()], {
    line: 5,
    note: `Reverse mode: one forward pass computes the values and records each local derivative, then f’s gradient is set to 1. Backward will push it to every input at once.`,
    vars: { 'f.grad': 1 },
    stats: STATS(1, 0, F),
    // Slips: s's own value (the wrong factor), and 1 (passed straight through, as if f were a sum).
    checkpoint: ask(`What will ${nameOf(s)}’s gradient be?`, g4(sFlow.after), slips(sFlow.after, [s.data, 1])),
  });
  const finalX1 = back.grads.get(x1)!;
  const throughP = back.steps.find((st) => st.node === p)!.flows.find((fl) => fl.input === x1)!.add;
  for (let k = 0; k < back.steps.length; k++) {
    const step = back.steps[k];
    const last = k === back.steps.length - 1;
    const said = step.flows.map(({ input, local, before, add, after }, j) => {
      running.set(input, after);
      return `${nameOf(input)} gets ${g4(local)} × ${after4(step.upstream)} = ${g4(add)} (${why(step.node, j)})${before !== 0 ? `, added to the ${g4(before)} it had: ${g4(after)}` : ''}`;
    });
    if (last) leaves.forEach((x, i) => (rev[i] = back.grads.get(x)!));
    yield plotFrame([reverseNet(step.node, step.flows.map((fl) => fl.input)), derivs()], {
      line: 8,
      note: `From ${nameOf(step.node)} (gradient ${g4(step.upstream)}): ${said.join('; ')}.${last ? ' One backward pass, and all three gradients match forward mode’s three passes.' : ''}`,
      vars: Object.fromEntries(step.flows.map(({ input }) => [`${nameOf(input)}.grad`, round(running.get(input)!, 4)])),
      stats: STATS(1, last ? 1 : 0, F),
      // Slips: only the share from f so far, only the share through p, f's value.
      checkpoint: k === back.steps.length - 2 ? ask(`What will ${nameOf(x1)}’s gradient end up as?`, g4(finalX1), slips(finalX1, [running.get(x1)!, throughP, f.data])) : undefined,
    });
  }

  const big = passesNeeded(MILLION, 1);
  yield plotFrame(
    [
      reverseNet(null, []),
      derivs(),
      {
        kind: 'readouts',
        id: 'scale',
        label: 'A model with a million weights and one loss',
        items: [
          { id: 'forward-mode', label: 'Forward mode', value: `${big.forwardMode.forward.toLocaleString('en-US')} passes`, tone: 1 },
          { id: 'reverse-mode', label: 'Reverse mode', value: `${big.reverseMode.forward} forward + ${big.reverseMode.backward} backward`, tone: 2 },
        ],
      },
    ],
    {
      line: null,
      note: `Forward mode costs one pass per input; reverse mode one backward pass per output. A network has millions of weights and one loss: forward mode would need a million passes, reverse mode needs two. That is why every deep-learning library runs reverse mode.`,
      vars: { 'forward-mode passes': F, 'reverse-mode passes': 2 },
      stats: STATS(1, 1, F),
    },
  );
}

// ───────────────────────────── story 3: training a neuron ─────────────────────────────

/** The weights plane reaches past the handle's box: runs that start in a corner can walk out of it (rare beyond ±4: those are drawn at the edge). */
export const WEIGHT_AXIS = { min: -4, max: 4 } as const;
const inPlane = (v: number) => round(Math.min(WEIGHT_AXIS.max, Math.max(WEIGHT_AXIS.min, v)));
const contourCache = new Map<string, ContourShape>();

/** Contours of the loss over (w, b), computed once per dataset and rounded to hundredths (they come from tanh). */
export function lossContours(data: readonly Vec[]): ContourShape {
  const key = data.map((p) => p.join(' ')).join(',');
  let shape = contourCache.get(key);
  if (!shape) {
    const f = (w: number, b: number) => mse(data, w, b);
    const samples: number[] = [];
    const span = WEIGHT_AXIS.max - WEIGHT_AXIS.min;
    for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) samples.push(f(WEIGHT_AXIS.min + (span * i) / 30, WEIGHT_AXIS.min + (span * j) / 30));
    samples.sort((a, b) => a - b);
    const lo = samples[0];
    const hi = Math.max(lo + 1e-6, samples[Math.floor(samples.length * 0.85)]);
    const levels = contours(f, { x: WEIGHT_AXIS, y: WEIGHT_AXIS }, logLevels(lo, hi, 9), 40).map((level) => ({
      value: level.value,
      segments: level.segments.map(([a, b]) => [[round(a[0]), round(a[1])], [round(b[0]), round(b[1])]] as const),
    }));
    shape = { kind: 'contours', id: 'contours', levels };
    contourCache.set(key, shape);
  }
  return shape;
}

const curve = (w: number, b: number): Vec[] => Array.from({ length: 41 }, (_, i) => -3 + (6 * i) / 40).map((x): Vec => [round(x), round(neuron(w, b, x))]);

function* trainStory(start: Vec, data: readonly Vec[]): Generator<Frame<PlotState>> {
  const run = trainNeuron(data, start);
  const top = Math.max(0.25, Math.ceil(Math.max(...run.loss) * 1.1 * 4) / 4);
  const startFit: Shape = { kind: 'path', id: 'start-fit', points: curve(start[0], start[1]), dashed: true, faint: true, label: 'start' };
  const dataPlane = (k: number): PlanePart => ({
    kind: 'plane',
    id: 'data',
    label: `The data and the fit ŷ = tanh(w·x + b) after ${k} ${k === 1 ? 'step' : 'steps'}`,
    x: { min: -3, max: 3, label: 'x' },
    y: { min: -1.25, max: 1.25, label: 'y' },
    equal: false,
    shapes: [
      ...(k > 0 ? [startFit] : []),
      { kind: 'path', id: 'fit', points: curve(run.w[k], run.b[k]), mark: 'key', label: 'ŷ' },
      ...data.map((pt, i): Shape => ({ kind: 'point', id: `d${i}`, at: pt })),
    ],
    handles: [],
  });
  const lossPlane = (k: number): PlanePart => ({
    kind: 'plane',
    id: 'loss',
    label: 'The loss after each step',
    x: { min: 0, max: TRAIN_STEPS, label: 'step' },
    y: { min: 0, max: top, label: 'loss' },
    equal: false,
    shapes: [
      { kind: 'path', id: 'loss', points: run.loss.slice(0, k + 1).map((l, i): Vec => [i, round(l)]), mark: 'key' },
      { kind: 'point', id: 'now', at: [k, round(run.loss[k])], mark: 'key', size: 'sm' },
    ],
    handles: [],
  });
  const weightsPlane = (k: number): PlanePart => ({
    kind: 'plane',
    id: 'weights',
    label: 'The weights (w, b) on the loss’s contours',
    x: { ...WEIGHT_AXIS, label: 'w' },
    y: { ...WEIGHT_AXIS, label: 'b' },
    equal: true,
    shapes: [
      lossContours(data),
      { kind: 'path', id: 'trail', points: run.w.slice(0, k + 1).map((w, i): Vec => [inPlane(w), inPlane(run.b[i])]) },
      { kind: 'point', id: 'wb', at: [inPlane(run.w[k]), inPlane(run.b[k])], mark: 'key', size: 'lg', label: '(w, b)' },
    ],
    handles: [{ id: 'start', at: start, label: 'Start', step: WEIGHT_BOX.step, min: [WEIGHT_BOX.min, WEIGHT_BOX.min], max: [WEIGHT_BOX.max, WEIGHT_BOX.max] }],
  });
  const readouts = (k: number, extra: Readout[]): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: `Step ${k}`,
    items: [
      { id: 'loss', label: 'loss L', value: g4(run.loss[k]), mark: 'key' },
      { id: 'w', label: 'w', value: fmt(run.w[k], 3) },
      { id: 'b', label: 'b', value: fmt(run.b[k], 3) },
      ...extra,
    ],
  });
  const parts = (k: number, extra: Readout[]): PlotPart[] => [dataPlane(k), lossPlane(k), weightsPlane(k), readouts(k, extra)];
  const unknownGrads: Readout[] = [
    { id: 'gw', label: '∂L/∂w', value: '?' },
    { id: 'gb', label: '∂L/∂b', value: '?' },
  ];
  const grads = (k: number): Readout[] => [
    { id: 'gw', label: '∂L/∂w', value: fmt(run.gw[k], 3), mark: 'found' },
    { id: 'gb', label: '∂L/∂b', value: fmt(run.gb[k], 3), mark: 'found' },
  ];
  const moves = (k: number): Readout[] => [
    { id: 'dw', label: 'w changed by −η·∂L/∂w', value: fmt(-LR * run.gw[k], 3), mark: 'write' },
    { id: 'db', label: 'b changed by −η·∂L/∂b', value: fmt(-LR * run.gb[k], 3), mark: 'write' },
  ];
  const UDS = ['Up', 'Down', 'It stays'];
  const way = (d: number) => (d > 0 ? 'Up' : d < 0 ? 'Down' : 'It stays');
  const lower = (from: number, to: number) => (run.loss[to] < run.loss[from] ? 'Yes' : 'No');
  const vars = (k: number) => ({ step: k, w: round(run.w[k], 4), b: round(run.b[k], 4), L: round(run.loss[k], 4) });
  // How the starting curve and the data run, left to right, so the first question can be reasoned out.
  const slope = (v: number) => (v > 1e-9 ? 'rises' : v < -1e-9 ? 'falls' : 'is flat');
  const mx = data.reduce((t, [x]) => t + x, 0) / data.length;
  const my = data.reduce((t, [, y]) => t + y, 0) / data.length;
  const trend = data.reduce((t, [x, y]) => t + (x - mx) * (y - my), 0);
  const points = trend > 1e-9 ? 'the points rise' : trend < -1e-9 ? 'the points fall' : 'the points have no trend';
  const wrongWay = start[0] * trend < -1e-9;
  /** How much bigger or smaller w's step is than the one before. */
  const stepSize = (k: number) => {
    const [now, before] = [Math.abs(run.gw[k]), Math.abs(run.gw[k - 1])];
    return now > before + 1e-9 ? 'Bigger' : now < before - 1e-9 ? 'Smaller' : 'The same';
  };

  yield plotFrame(parts(0, unknownGrads), {
    line: 11,
    note: `Fit one neuron, ŷ = tanh(w·x + b), to ${data.length} points with the engine. It starts at w = ${fmt(start[0])}, b = ${fmt(start[1])} (drag the start): the curve ${slope(start[0])} from left to right while ${points}. Its loss, the mean squared error, is ${g4(run.loss[0])}.`,
    vars: vars(0),
    stats: STATS(1, 0),
    checkpoint: askInOrder(`${wrongWay ? 'The fit slopes the wrong way. ' : ''}Which way must w move to lower the loss?`, UDS, way(-run.gw[0])),
  });
  for (let k = 0; k < ONE_BY_ONE; k++) {
    yield plotFrame(parts(k, grads(k)), {
      line: 12,
      note: `Step ${k + 1}: build a fresh graph of L for these weights (${run.nodes} values), then backward from L. ∂L/∂w = ${fmt(run.gw[k], 3)} and ∂L/∂b = ${fmt(run.gb[k], 3)}: the loss climbs fastest that way, so step the other way, η = ${fmt(LR)} times it.`,
      vars: { ...vars(k), 'w.grad': round(run.gw[k], 4), 'b.grad': round(run.gb[k], 4) },
      stats: STATS(k + 1, k + 1),
      checkpoint:
        k === 0
          ? askInOrder('Which way will b move?', UDS, way(-run.gb[0]))
          : k === 1
            ? askInOrder('Will the loss go down after this update?', ['Yes', 'No'], lower(1, 2))
            : askInOrder('Will w’s step be bigger or smaller than the last one?', ['Bigger', 'Smaller', 'The same'], stepSize(k)),
    });
    const after = k + 1;
    const fell = run.loss[after] < run.loss[k];
    yield plotFrame(parts(after, moves(k)), {
      line: 13,
      note: `w ← ${fmt(run.w[k], 3)} − ${fmt(LR)} × ${after3(run.gw[k])} = ${fmt(run.w[after], 3)}, and b ← ${fmt(run.b[after], 3)}. The loss ${fell ? 'fell' : 'rose'} from ${g4(run.loss[k])} to ${g4(run.loss[after])}. The old graph is thrown away: the next step builds a new one, with its gradients from 0.`,
      vars: vars(after),
      stats: STATS(after + 1, after),
      checkpoint: after === ONE_BY_ONE ? askInOrder(`Will the loss be lower after step ${JUMPS[0]} than now?`, ['Yes', 'No'], lower(after, JUMPS[0])) : undefined,
    });
  }
  let prev: number = ONE_BY_ONE;
  for (const s of JUMPS) {
    const last = s === JUMPS.at(-1);
    yield plotFrame(parts(s, moves(s - 1)), {
      line: last ? null : 13,
      note: last
        ? `After ${s} steps the loss is ${g4(run.loss[s])}, from ${g4(run.loss[0])} at the start, with w = ${fmt(run.w[s], 3)} and b = ${fmt(run.b[s], 3)}. The last step moved w by only ${fmt(-LR * run.gw[s - 1], 4)}: the gradients are nearly 0. Every step was one forward and one backward pass through a fresh graph.`
        : `Steps ${prev + 1} to ${s}, each the same: build the graph, backward, step. The loss is now ${g4(run.loss[s])}${run.loss[s] < run.loss[prev] ? ', still falling' : ''}, and (w, b) has walked to (${fmt(run.w[s], 2)}, ${fmt(run.b[s], 2)}) across the contours.`,
      vars: vars(s),
      stats: STATS(s + 1, s),
    });
    prev = s;
  }
}

// ───────────────────────────── the module ─────────────────────────────

function* run(input: AutogradInput): Generator<Frame<PlotState>> {
  if (input.story === 'order') yield* orderStory(input.values);
  else if (input.story === 'modes') yield* modesStory(input.values);
  else yield* trainStory(input.start, input.data);
}

const LIMIT = 10;
const DATA_X = 2;
const POINTS = [4, 6] as const;

export function parseAutograd(text: string): { value: AutogradInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const rest = text.slice(text.toLowerCase().indexOf(word) + word.length);
  if (word === 'order' || word === 'modes') {
    const xs = numbersIn(rest);
    const names = word === 'order' ? ORDER_LEAVES : MODES_LEAVES;
    if (xs.length !== names.length) return { error: `${word} takes ${names.length} numbers: ${names.join(', ')}.` };
    if (xs.some((x) => Math.abs(x) > LIMIT)) return { error: `Keep the inputs between −${LIMIT} and ${LIMIT}.` };
    return { value: { story: word, values: xs.map((x) => round(x, 2)) } };
  }
  if (word !== 'train') return { error: 'Start with order, modes or train, e.g. order: 2, 3, -4.' };
  const [head, tail] = rest.split(';');
  if (tail === undefined) return { error: 'Give the start, then the points: train: -1, 1; -2 -0.9, -1 -0.7, 0 0.2, 1 0.8.' };
  const s = numbersIn(head);
  const xs = numbersIn(tail);
  if (s.length !== 2) return { error: 'Give the starting w and b before the semicolon.' };
  if (s.some((v) => Math.abs(v) > WEIGHT_BOX.max)) return { error: `Start w and b between −${WEIGHT_BOX.max} and ${WEIGHT_BOX.max}.` };
  if (xs.length % 2 !== 0 || xs.length / 2 < POINTS[0] || xs.length / 2 > POINTS[1]) return { error: `Give ${POINTS[0]} to ${POINTS[1]} points as x y pairs.` };
  const data: Vec[] = [];
  for (let i = 0; i < xs.length; i += 2) data.push([round(xs[i], 2), round(xs[i + 1], 2)]);
  if (data.some(([x, y]) => Math.abs(x) > DATA_X || Math.abs(y) > 1)) return { error: `Keep x between −${DATA_X} and ${DATA_X}, and y between −1 and 1.` };
  return { value: { story: 'train', start: [round(s[0], 1), round(s[1], 1)], data } };
}

export function formatAutograd(input: AutogradInput): string {
  if (input.story !== 'train') return `${input.story}: ${input.values.map((x) => plain(x)).join(', ')}`;
  return `train: ${plain(input.start[0])}, ${plain(input.start[1])}; ${input.data.map(([x, y]) => `${plain(x)} ${plain(y)}`).join(', ')}`;
}

export function dragAutograd(input: AutogradInput, handle: string, to: readonly [number, number]): AutogradInput {
  if (input.story !== 'train' || handle !== 'start') return input;
  const at = (v: number) => snap(v, WEIGHT_BOX.step, WEIGHT_BOX.min, WEIGHT_BOX.max);
  return { ...input, start: [at(to[0]), at(to[1])] };
}

const example = (id: string, label: string, make: () => AutogradInput) => ({ id, label, make, sized: false });

export const autograd = defineAlgorithm<AutogradInput, PlotState>({
  kind: 'algorithm',
  slug: 'autograd',
  view: 'plot',
  input: {
    examples: [
      example('order', 'Backward needs an order', () => ({ story: 'order', values: [...ORDER_DEFAULTS] })),
      example('modes', 'Forward mode against reverse mode', () => ({ story: 'modes', values: [...MODES_DEFAULTS] })),
      example('train', 'Train a neuron with the engine', () => ({ story: 'train', start: TRAIN_START, data: TRAIN_DATA })),
    ],
    custom: {
      label: 'order: a, b, c; modes: x1, x2, x3; or train: w, b; then 4 to 6 points as x y pairs',
      placeholder: 'e.g. train: -1, 1; -2 -0.9, -1 -0.7, 0 0.2, 1 0.8, 2 0.9',
      parse: parseAutograd,
      format: formatAutograd,
    },
    drag: dragAutograd,
  },
  pseudocode: [
    'forward: each value from its inputs',
    'topo(v): add v after all its inputs',
    '  if v not seen: mark v seen',
    '    for u in v.inputs: topo(u)',
    '    order.append(v)',
    'backward: out.grad ← 1',
    '  for v in reversed(order):',
    '    for each input u of v:',
    '      u.grad += local · v.grad',
    'forward mode on input i: i.tan ← 1',
    '  for v in order: v.tan ← Σ local·u.tan',
    'train: L ← mean((tanh(w·x + b) − y)²)',
    '  fresh graph, so grads start at 0',
    '  w ← w − η·∂L/∂w;  b ← b − η·∂L/∂b',
  ],
  stats: [
    { key: 'forwardMode', label: 'Forward-mode passes (tangents)' },
    { key: 'forward', label: 'Forward passes (values)' },
    { key: 'backward', label: 'Backward passes (gradients)' },
  ],
  legend: [
    { neutral: 'A value (data, gradient or tangent), a data point' },
    { mark: 'key', label: 'The node being worked on, or the current fit' },
    { mark: 'frontier', label: 'Waiting: its inputs come first' },
    { mark: 'write', label: 'In the order, or the step just taken' },
    { mark: 'compare', label: 'Flowing forward: values, tangents, inputs read' },
    { mark: 'found', label: 'Gradients flowing back' },
    { mark: 'visited', label: 'Already handled by backward' },
    { tone: 1, label: 'Forward mode’s answers' },
    { tone: 2, label: 'Reverse mode’s answers' },
  ],
  run,
  content: {
    idea: 'Record a computation as a graph as it runs, then apply the chain rule backwards through all of it at once. A depth-first search lists the nodes in topological order; walking that list in reverse, each node passes its gradient on only after everything made from it has added its share. One backward pass gives the gradient for every input, and that is what trains every neural network.',
    invariant: 'In a topological order every node comes after its inputs, so in reverse every node comes before them: by the time a node passes its gradient on, every node made from it has already sent its share, so its gradient is complete. Forward mode’s tangent of the output, seeded on one input, equals that input’s gradient from reverse mode.',
    whenToUse: 'Any time you need the gradient of a program: PyTorch, JAX and TensorFlow record the graph as your code runs and run reverse mode, because a model has millions of inputs (weights) and one output (the loss). Forward mode wins the other way round, few inputs and many outputs, and is how some libraries compute Jacobian columns.',
    traits: [
      { label: 'Reverse mode: one backward pass for every input', good: true },
      { label: 'Forward mode: one pass per input', good: null },
      { label: 'Needs a topological order when values are reused', good: null },
      { label: 'Stores the whole graph until backward', good: false },
    ],
    experiments: [
      { example: 'order', prompt: 'q already holds a gradient after L’s step. Why must it wait for r before passing it on?' },
      { example: 'modes', prompt: 'Count the passes: three forward passes for forward mode, one forward and one backward for reverse mode, and the same three derivatives.' },
      { example: 'train', prompt: 'Drag the start to the far corner of the weights plane, where tanh is flat: the gradients shrink and training crawls.' },
    ],
  },
});

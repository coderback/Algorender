// B4 of the math and ML path, "Autograd: the chain rule, automated": every
// number the lesson quotes is measured here from the code that draws it, and
// must appear in the lesson exactly as written. The embeds are checked too:
// each preset exists, the prediction challenge asks at least its goal, the
// lesson embeds its one exercise and names the second milestone project's
// parts in order. Until the lesson is listed in index.ts, the assessment rules
// (assessment.test.ts) are checked here on its source.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  autograd,
  backwardSteps,
  forwardTangents,
  JUMPS,
  LR,
  MILLION,
  MODES_DEFAULTS,
  modesGraph,
  nameOf,
  ORDER_DEFAULTS,
  orderGraph,
  passesNeeded,
  topoSteps,
  TRAIN_DATA,
  TRAIN_START,
  TRAIN_STEPS,
  trainNeuron,
} from '@/algorithms/calculus/autograd';
import { getExercise } from '@/content/exercises';
import { getProject } from '@/content/projects';
import { topological, Value } from '@/ml/autograd';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';
import { STEP_LABEL } from '@/components/lesson/steps';
import { misconceptionsIn, promptsIn } from './assessment';
import { quizzesIn } from './quizzes';
import { lessonSections } from './sections';

const source = readFileSync(fileURLToPath(new URL('./autograd.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = autograd.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`autograd has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 });
};
const framesOf = (preset: string) => traceOf(autograd, inputOf(preset)).frames as { state: PlotState; note: string; checkpoint?: unknown }[];
const names = (vs: readonly Value[]) => vs.map(nameOf).join(', ');
const byName = (vs: readonly Value[], n: string) => vs.find((v) => nameOf(v) === n)!;

/** Backward along any order, each value handled once with whatever it holds then (what the engine does). */
function backwardAlong(order: readonly Value[], out: Value): Map<Value, number> {
  const grads = new Map<Value, number>(order.map((v) => [v, 0]));
  grads.set(out, 1);
  for (const v of order) v.inputs.forEach((u, k) => grads.set(u, grads.get(u)! + v.locals[k] * grads.get(v)!));
  return grads;
}
const isTopological = (order: readonly Value[]) => order.every((v, i) => v.inputs.every((u) => order.indexOf(u) >= 0 && order.indexOf(u) < i));

describe('autograd embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}(?:[^>]*?goal=\{(\d+)\})?[^>]*\/>/g)].map((m) => ({
      tag: m[1],
      slug: m[2],
      preset: m[3],
      step: m[4] === undefined ? null : Number(m[4]),
      goal: m[5] === undefined ? null : Number(m[5]),
    }));
    expect(found.map((e) => `${e.tag}:${e.preset}`)).toEqual(['Explore:order', 'PredictChallenge:modes', 'Explore:train']);
    for (const e of found) {
      expect(e.slug).toBe('autograd');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, gradient-check, which practises the autograd visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['gradient-check']);
    expect(getExercise('gradient-check')?.visualiser).toBe('autograd');
  });

  it('names the second milestone project’s five parts, in order, as /code links', () => {
    const project = getProject('micrograd')!;
    expect(project.parts).toEqual(['value-backward', 'topological-backward', 'value-ops', 'gradient-check', 'train-neuron']);
    expect(body).toContain('**Micrograd from scratch**, five exercises in order');
    const at = project.parts.map((p) => body.indexOf(`(/code/${p})`));
    expect(at.every((i) => i >= 0), project.parts.join(', ')).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(body).toContain('[part 4](/code/gradient-check), below');
    expect(project.showcase.href).toContain('preset=train');
  });
});

describe('autograd quotes', () => {
  it('records p = a·b with its local derivatives', () => {
    const g = orderGraph(ORDER_DEFAULTS);
    const p = byName(g.nodes, 'p');
    expect([...ORDER_DEFAULTS]).toEqual([2, 3, -4]);
    expect(p.data).toBe(6);
    expect(p.locals).toEqual([3, 2]);
    expect(body).toContain('When your code runs `p = a * b` with $a = 2$ and $b = 3$, the engine doesn\'t just compute 6');
    expect(body).toContain('so $b = 3$ for $a$ and $a = 2$ for $b$');
  });

  it('works the order story forward, with its values used twice', () => {
    const g = orderGraph(ORDER_DEFAULTS);
    const at = (n: string) => byName(g.nodes, n).data;
    expect(body).toContain('With $a = 2$, $b = 3$ and $c = -4$:');
    expect([at('p'), at('q'), at('r'), at('L')]).toEqual([6, 2, 12, 14]);
    expect(body).toContain(String.raw`p &= a \cdot b = 6 \\ q &= p + c = 2 \\ r &= q \cdot p = 12 \\ L &= r + q = 14`);
    // p feeds q and r; q feeds r and L.
    const users = (n: string) => g.nodes.filter((v) => v.inputs.some((u) => nameOf(u) === n)).map(nameOf);
    expect(users('p')).toEqual(['q', 'r']);
    expect(users('q')).toEqual(['r', 'L']);
    expect(body).toContain('$p$ feeds both $q$ and $r$, and $q$ feeds both $r$ and $L$');
  });

  it('adds up each value’s shares, step by step', () => {
    const g = orderGraph(ORDER_DEFAULTS);
    const { steps, grads } = backwardSteps(g.out);
    const flow = (from: string, to: string) => steps.find((s) => nameOf(s.node) === from)!.flows.find((f) => nameOf(f.input) === to)!;
    expect([flow('L', 'q').add, flow('r', 'q').add, flow('r', 'q').local, flow('r', 'q').after]).toEqual([1, 6, 6, 7]);
    expect(body).toContain('$q$ gets 1 from $L$ (an addition passes the gradient straight through) and 6 from $r$ (a product\'s local derivative is the other factor, $p = 6$): 7 in all.');
    expect([flow('r', 'p').add, flow('q', 'p').add, flow('q', 'p').after]).toEqual([2, 7, 9]);
    expect(body).toContain('$p$ gets 2 from $r$ and 7 from $q$: 9 in all.');
    expect([flow('p', 'a').local, grads.get(g.leaves[0]), flow('p', 'b').local, grads.get(g.leaves[1]), grads.get(g.leaves[2])]).toEqual([3, 27, 2, 18, 7]);
    expect(body).toContain(String.raw`Then $a$ gets $3 \times 9 = 27$, $b$ gets $2 \times 9 = 18$, and $c$ gets 7.`);
    // The correction quotes q's first share against its whole gradient.
    expect(body).toContain('$q$ held 1 after $L$\'s step, but its gradient was 7.');
    expect(framesOf('order').some((f) => f.note.includes('added to the 1 it already had: 7'))).toBe(true);
  });

  it('goes wrong when q passes its gradient on before r', () => {
    const g = orderGraph(ORDER_DEFAULTS);
    const right = [...topological(g.out)].reverse();
    expect(names(right)).toBe('L, r, q, c, p, b, a');
    const wrong = right.map((v) => (nameOf(v) === 'r' ? byName(g.nodes, 'q') : nameOf(v) === 'q' ? byName(g.nodes, 'r') : v));
    const bad = backwardAlong(wrong, g.out);
    const good = backwardAlong(right, g.out);
    const [a] = g.leaves;
    // q passes on 1 (not 7), r's 6 for q arrives too late; p ends with 2 + 1.
    expect(bad.get(byName(g.nodes, 'p'))).toBe(3);
    expect(good.get(byName(g.nodes, 'p'))).toBe(9);
    expect([bad.get(a), good.get(a)]).toEqual([9, 27]);
    expect(body).toContain('It would pass on 1 when its whole gradient is 7, and $r$\'s share of 6 would arrive too late. $p$ would end with $2 + 1 = 3$ instead of 9, and $a$ with 9 instead of 27.');
  });

  it('lists the order by depth-first search and reads it backwards', () => {
    const g = orderGraph(ORDER_DEFAULTS);
    const steps = topoSteps(g.out);
    const order = steps.at(-1)!.order;
    expect(names(order)).toBe('a, b, p, c, q, r, L');
    expect(order).toEqual(topological(g.out));
    expect(isTopological(order)).toBe(true);
    // The snippet uses the names of the learner's engine from part 2.
    expect(getExercise('topological-backward')!.solution.python).toContain('v._prev');
    expect(body).toContain('for u in v._prev: visit(u) # its inputs first order.append(v) # then v itself visit(L)');
    expect(body).toContain('From $L$ it gives $a, b, p, c, q, r, L$, and backward reads it from the right: $L, r, q, c, p, b, a$.');
  });

  it('checks ∂L/∂a = 27 with a nudge of 0.001, as the last frame does', () => {
    const g = orderGraph(ORDER_DEFAULTS);
    const nudged = orderGraph([ORDER_DEFAULTS[0] + 0.001, ORDER_DEFAULTS[1], ORDER_DEFAULTS[2]]).out.data;
    expect(fmt(nudged, 4)).toBe('14.027');
    expect(backwardSteps(g.out).grads.get(g.leaves[0])).toBe(27);
    const last = framesOf('order').at(-1)!;
    expect(last.note).toContain('nudging a by 0.001 moves L from 14 to 14.027, about 27 × 0.001');
    expect(body).toContain(String.raw`nudging $a$ by 0.001 moves $L$ from 14 to 14.027, about $27 \times 0.001$ more`);
  });

  it('compares forward mode with reverse mode on f = (x1·x2 + x3)·x1', () => {
    const g = modesGraph(MODES_DEFAULTS);
    expect([...MODES_DEFAULTS]).toEqual([2, 3, -1]);
    expect(body).toContain('with $x_1 = 2$, $x_2 = 3$ and $x_3 = -1$');
    expect(body).toContain(String.raw`f = (x_1 \cdot x_2 + x_3) \cdot x_1`);
    // x1 is used twice.
    expect(g.nodes.filter((v) => v.inputs.includes(g.leaves[0]))).toHaveLength(2);
    expect(g.out.data).toBe(10);
    const tangents = g.leaves.map((x) => forwardTangents(g.out, x).get(g.out));
    const back = backwardSteps(g.out).grads;
    const reverse = g.leaves.map((x) => back.get(x));
    expect(tangents).toEqual([11, 4, 2]);
    expect(reverse).toEqual([11, 4, 2]);
    expect(body).toContain(String.raw`$f = 10$, and $\frac{\partial f}{\partial x_1} = 11$, $\frac{\partial f}{\partial x_2} = 4$, $\frac{\partial f}{\partial x_3} = 2$`);
    const three = passesNeeded(g.leaves.length, 1);
    expect(three.forwardMode.forward).toBe(3);
    expect(three.reverseMode).toEqual({ forward: 1, backward: 1 });
    expect(body).toContain('forward mode needed 3 passes, one per input');
    // The challenge's own count of forward passes.
    const lastFrame = framesOf('modes').at(-1)!;
    expect(lastFrame.note).toContain('forward mode would need a million passes, reverse mode needs two');
  });

  it('scales up to a million weights and one loss', () => {
    const big = passesNeeded(MILLION, 1);
    const million = MILLION.toLocaleString('en-US');
    expect(million).toBe('1,000,000');
    expect(body).toContain(`A model with ${million} weights has a million inputs and one output`);
    expect(body).toContain(`**forward mode** needs ${big.forwardMode.forward.toLocaleString('en-US')} passes;`);
    expect(body).toContain(`**reverse mode** needs ${big.reverseMode.forward} forward pass and ${big.reverseMode.backward} backward pass.`);
    // Central differences: two runs per weight.
    expect(body).toContain(`For the million weights that is ${(2 * MILLION).toLocaleString('en-US')} runs of the model`);
  });

  it('trains the neuron: 5 points, 48 values a step, η = 0.25, 80 steps', () => {
    const run = trainNeuron(TRAIN_DATA, TRAIN_START);
    expect(TRAIN_DATA).toHaveLength(5);
    expect(body).toContain(String.raw`$\hat{y} = \tanh(w \cdot x + b)$, to 5 points by gradient descent`);
    expect(run.nodes).toBe(48);
    expect(body).toContain('for the current $w$ and $b$: 48 values.');
    expect(body).toContain(String.raw`the mean squared error over the 5 points, $L = \frac{1}{${TRAIN_DATA.length}} \sum (\hat{y} - y)^2$`);
    expect(LR).toBe(0.25);
    expect(body).toContain(String.raw`the step size $\eta$ (eta) $= 0.25$`);
    expect([...TRAIN_START]).toEqual([-1, 1]);
    // The fit starts sloping down while the data rises.
    expect(TRAIN_START[0]).toBeLessThan(0);
    expect(TRAIN_DATA.at(-1)![1]).toBeGreaterThan(TRAIN_DATA[0][1]);
    expect(fmt(run.loss[0], 4)).toBe('2.0153');
    expect(body).toContain('From $w = -1$ and $b = 1$, where the fit slopes the wrong way, the loss starts at 2.0153.');
    expect([TRAIN_STEPS, JUMPS.at(-1)]).toEqual([80, 80]);
    expect([fmt(run.loss[TRAIN_STEPS], 4), fmt(run.w[TRAIN_STEPS], 3), fmt(run.b[TRAIN_STEPS], 3)]).toEqual(['0.0019', '0.964', '0.173']);
    expect(body).toContain('After 80 steps it is 0.0019, with $w = 0.964$ and $b = 0.173$.');
    expect(framesOf('train').at(-1)!.note).toContain('After 80 steps the loss is 0.0019, from 2.0153 at the start, with w = 0.964 and b = 0.173');
  });

  it('checks the probes’ and the quiz’s numbers', () => {
    // Probe: L = m + k, m = 3 × k, k = 2 × t.
    const t = new Value(1, 't');
    const k = t.mul(2);
    const m = k.mul(3);
    const L = m.add(k);
    L.backward();
    expect([k.grad, t.grad]).toEqual([4, 8]);
    // k passing on L's share alone, before m's arrives: k handled before m.
    const reversed = [...topological(L)].reverse();
    const early = reversed.filter((v) => v !== m);
    early.splice(early.indexOf(k) + 1, 0, m);
    expect(backwardAlong(early, L).get(t)).toBe(2);
    expect(body).toContain('so its gradient is 4, and t gets 2 × 4 = 8. If k passed on its first share before m’s arrived, t would get only 2 × 1 = 2.');
    // Probe: y = u + v, u = 2·v, v = 3·x; only y, u, v, x is right.
    const px = new Value(1, 'x');
    const pv = px.mul(3).named('v');
    const pu = pv.mul(2).named('u');
    const py = pu.add(pv).named('y');
    py.backward();
    expect(px.grad).toBe(9);
    const along = (labels: string) => backwardAlong(labels.split(', ').map((l) => [py, pu, pv, px].find((v) => v.label === l)!), py).get(px);
    expect(along('y, u, v, x')).toBe(9);
    expect(along('y, v, u, x')).not.toBe(9);
    expect(topological(py).filter((v) => 'xvuy'.includes(v.label)).map((v) => v.label).reverse().join(', ')).toBe('y, u, v, x');
    expect(body).toContain('y = u + v, where u = 2·v and v = 3·x. Backward handles each value once.');
    // Probe: 0.5 left in w.grad, ∂L/∂w = −0.2, η = 0.1.
    const piled = 0.5 + -0.2;
    expect(fmt(piled, 4)).toBe('0.3');
    expect(fmt(-0.1 * piled, 4)).toBe('−0.03');
    expect(fmt(-0.1 * -0.2, 4)).toBe('0.02');
    expect(fmt(-0.1 * 0.5, 4)).toBe('−0.05');
    expect(body).toContain('so w.grad holds 0.3 and w ← w − 0.1 × 0.3 moves w down by 0.03');
    // Probe: 50,000 weights, two runs each.
    expect((2 * 50_000).toLocaleString('en-US')).toBe('100,000');
    // Probe: x³ at 1 by central differences with h = 0.01.
    const h = 0.01;
    const cube = (x: number) => x ** 3;
    const central = (cube(1 + h) - cube(1 - h)) / (2 * h);
    expect(fmt(central, 4)).toBe('3.0001');
    const x = new Value(1, 'x');
    const y = x.pow(3);
    y.backward();
    expect(x.grad).toBe(3);
    expect(fmt(central - 3, 4)).toBe('0.0001');
    expect(body).toContain('A central difference with h = 0.01 gives 3.0001');
    // Probe: 0.4 then 0.3 piled up.
    expect(0.4 + 0.3).toBeCloseTo(0.7, 12);
    // Quiz: g = e + f, h = g × e.
    const e = new Value(1, 'e');
    const f = new Value(2, 'f');
    const gg = e.add(f).named('g');
    const hh = gg.mul(e).named('h');
    const nodes = topological(hh);
    expect(nodes.map((v) => v.label).join(', ')).toBe('e, f, g, h');
    const order = (labels: string) => labels.split(', ').map((l) => nodes.find((v) => v.label === l)!);
    expect(['e, f, g, h', 'h, g, f, e', 'g, e, f, h', 'e, g, f, h'].map((o) => isTopological(order(o)))).toEqual([true, false, false, false]);
    expect(body).toContain('g = e + f and h = g × e. Which list is a topological order?');
    // Quiz: 10 inputs and one output.
    expect(passesNeeded(10, 1)).toEqual({ forwardMode: { forward: 10, backward: 0 }, reverseMode: { forward: 1, backward: 1 } });
    // Quiz: forward mode wins with few inputs and many outputs, and only then.
    const cost = (inputs: number, outputs: number) => {
      const p = passesNeeded(inputs, outputs);
      return { forward: p.forwardMode.forward, reverse: p.reverseMode.forward + p.reverseMode.backward };
    };
    expect(cost(2, 1000)).toEqual({ forward: 2, reverse: 1001 });
    expect(cost(1000, 2).forward).toBeGreaterThan(cost(1000, 2).reverse);
    expect(cost(MILLION, 1).forward).toBeGreaterThan(cost(MILLION, 1).reverse);
  });
});

describe('autograd assessment (the rules assessment.test.ts applies once the lesson is listed)', () => {
  const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
  const words = (s: string) => s.trim().split(/\s+/).length;
  const mistakes = misconceptionsIn('autograd', source);
  const quizzes = quizzesIn('autograd', source);

  it('names its mistakes, each with two probes and a quiz question that traps it', () => {
    expect(mistakes.map((m) => m.id)).toEqual(['pass-gradient-early', 'autograd-nudges', 'gradients-carry-over']);
    for (const m of mistakes) {
      expect(m.id).toMatch(SLUG);
      expect(m.correction.length).toBeGreaterThan(20);
      expect(m.probes.length).toBeGreaterThanOrEqual(2);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).toBeLessThan(p.choices.length);
      }
    }
    expect(quizzes).toHaveLength(1);
    const questions = quizzes[0].questions;
    expect(questions).toHaveLength(6);
    for (const q of questions) {
      expect(new Set(q.choices).size).toBe(q.choices.length);
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(mistakes.map((m) => m.id)).toContain(id);
        expect(Number(choice)).not.toBe(q.answer);
      }
    }
    for (const m of mistakes) expect(questions.some((q) => Object.values(q.traps ?? {}).includes(m.id)), m.id).toBe(true);
    // Choices show in the order written, so the right answers sit in different places.
    const positions = [...questions.map((q) => q.answer), ...mistakes.flatMap((m) => m.probes.map((p) => p.answer))];
    expect(new Set(positions).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...[0, 1, 2, 3].map((i) => positions.filter((p) => p === i).length))).toBeLessThanOrEqual(positions.length / 2);
  });

  it('asks to be explained back, and its sections are known steps', () => {
    const prompts = promptsIn('autograd', source);
    expect(prompts).toHaveLength(1);
    const [p] = prompts;
    expect(p.rubric.length).toBeGreaterThanOrEqual(3);
    expect(p.rubric.length).toBeLessThanOrEqual(5);
    for (const r of p.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(p.example)).toBeGreaterThanOrEqual(30);
    expect(words(p.example)).toBeLessThanOrEqual(150);
    const sections = lessonSections('autograd');
    expect(sections.map((s) => s.step)).toEqual(['hook', 'parts', 'see', 'predict', 'do', 'check', 'explain', 'recap']);
    for (const s of sections) expect(Object.keys(STEP_LABEL)).toContain(s.step);
  });
});

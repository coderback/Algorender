// Property tests for automatic differentiation (B4 of the math and ML path):
// the depth-first search lists every node once and after its inputs, backward
// along its reverse matches finite differences, forward-mode tangents match
// reverse-mode gradients, the pass counts, and training a neuron with the
// engine matches a plain loop and lowers the loss.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numericGradient, topological, Value } from '@/ml/autograd';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { NetworkPart, PlotState, TokensPart, Vec } from '@/viz/plot/types';
import {
  autograd,
  backwardSteps,
  forwardTangents,
  JUMPS,
  LR,
  MILLION,
  modesGraph,
  mse,
  nameOf,
  neuronLoss,
  orderGraph,
  parseAutograd,
  passesNeeded,
  topoSteps,
  TRAIN_DATA,
  TRAIN_START,
  TRAIN_STEPS,
  trainNeuron,
  type AutogradInput,
  type Graph,
} from './autograd';

const num = (s: string | undefined) => Number((s ?? 'NaN').replace(/−/g, '-'));
const graphPart = (s: PlotState) => s.parts.find((p): p is NetworkPart => p.kind === 'network')!;
const tokensPart = (s: PlotState) => s.parts.find((p): p is TokensPart => p.kind === 'tokens');
const nodeText = (s: PlotState) => graphPart(s).nodes.map((n) => `${n.label} | ${n.value} | ${n.grad ?? ''}`).join(' ; ');
const answerOf = (f: { checkpoint?: { choices: readonly string[]; answer: number } }) => f.checkpoint!.choices[f.checkpoint!.answer];

function roundTrips(input: AutogradInput) {
  const custom = autograd.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

// ───── random computation graphs: leaves, then +, ×, tanh, exp-free ops over earlier values ─────

type OpSpec = { op: '+' | '×' | 'tanh' | '−'; a: number; b: number };
type Spec = { leaves: number[]; ops: OpSpec[] };

function build(spec: Spec, xs: readonly number[]): Graph {
  const vals: Value[] = xs.map((x, i) => new Value(x, `x${i}`));
  const leaves = [...vals];
  spec.ops.forEach(({ op, a, b }, k) => {
    const u = vals[a % vals.length];
    const w = vals[b % vals.length];
    const v = op === '+' ? u.add(w) : op === '×' ? u.mul(w) : op === '−' ? u.sub(w) : u.tanh();
    vals.push(v.named(`v${k} = op`));
  });
  const out = vals.at(-1)!;
  return { out, leaves, nodes: topological(out) };
}

const small = fc.integer({ min: -30, max: 30 }).map((k) => k / 10);
const spec: fc.Arbitrary<Spec> = fc.integer({ min: 2, max: 4 }).chain((n) =>
  fc.record({
    leaves: fc.array(small, { minLength: n, maxLength: n }),
    ops: fc.array(fc.record({ op: fc.constantFrom('+' as const, '×' as const, 'tanh' as const, '−' as const), a: fc.nat(40), b: fc.nat(40) }), { minLength: 1, maxLength: 8 }),
  }),
);

describe('autograd', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of autograd.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as AutogradInput;
      const frames = traceOf(autograd, input).frames;
      expectGoodPlotTrace(autograd, frames);
      roundTrips(input);
      // Each story a lesson can use for a PredictChallenge asks at least three questions.
      expect(frames.filter((f) => f.checkpoint).length, ex.id).toBeGreaterThanOrEqual(3);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [
              [h.at[0] + h.step, h.at[1] - h.step],
              [h.min[0], h.max[1]],
              [h.max[0], h.min[1]],
              [0, 0],
            ] as Vec[]) {
              const moved = autograd.input.drag!(input as never, h.id, to) as AutogradInput;
              const again = traceOf(autograd, moved).frames;
              expectGoodPlotTrace(autograd, again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id}`).toBe(frames.length);
            }
          }
        }
    }
  });

  it('lists every node once, after all of its inputs, in the same order as the engine', () => {
    fc.assert(
      fc.property(spec, (s) => {
        const { out } = build(s, s.leaves);
        const steps = topoSteps(out);
        const order = steps.at(-1)!.order;
        expect(order).toEqual(topological(out));
        expect(new Set(order).size).toBe(order.length);
        order.forEach((v, i) =>
          v.inputs.forEach((u) => {
            expect(order.indexOf(u)).toBeGreaterThanOrEqual(0);
            expect(order.indexOf(u)).toBeLessThan(i);
          }),
        );
        // One step per node, each adding exactly that node, and the output last.
        expect(steps.map((st) => st.node)).toEqual(order);
        expect(order.at(-1)).toBe(out);
        // Everything still waiting is an ancestor of the node being added.
        steps.forEach((st) => st.waiting.forEach((w) => expect(topological(w)).toContain(st.node)));
      }),
      { numRuns: 150 },
    );
  });

  it('backward along the reversed order matches finite differences, and never sends before a node’s gradient is complete', () => {
    fc.assert(
      fc.property(spec, (s) => {
        const g = build(s, s.leaves);
        const { steps, grads } = backwardSteps(g.out);
        const f = (xs: number[]) => build(s, xs).out.data;
        g.leaves.forEach((leaf, i) => expect(grads.get(leaf) ?? 0).toBeCloseTo(numericGradient(f, s.leaves, i), 4));
        // The engine's own backward agrees.
        g.out.backward();
        for (const v of g.nodes) expect(v.grad).toBeCloseTo(grads.get(v)!, 10);
        // Once a node sends, nothing sends to it again: its gradient was complete.
        steps.forEach((st, k) => steps.slice(k + 1).forEach((later) => expect(later.flows.some((fl) => fl.input === st.node)).toBe(false)));
      }),
      { numRuns: 150 },
    );
  });

  it('forward-mode tangents equal reverse-mode gradients, one input at a time', () => {
    fc.assert(
      fc.property(spec, (s) => {
        const g = build(s, s.leaves);
        const { grads } = backwardSteps(g.out);
        g.leaves.forEach((leaf) => expect(forwardTangents(g.out, leaf).get(g.out)!).toBeCloseTo(grads.get(leaf) ?? 0, 10));
      }),
      { numRuns: 150 },
    );
    fc.assert(
      fc.property(fc.array(small, { minLength: 3, maxLength: 3 }), (xs) => {
        const g = modesGraph(xs);
        const [x1, x2, x3] = xs;
        // f = (x1·x2 + x3)·x1: ∂f/∂x1 = 2·x1·x2 + x3, ∂f/∂x2 = x1², ∂f/∂x3 = x1.
        const exact = [2 * x1 * x2 + x3, x1 * x1, x1];
        g.leaves.forEach((leaf, i) => expect(forwardTangents(g.out, leaf).get(g.out)!).toBeCloseTo(exact[i], 10));
      }),
      { numRuns: 100 },
    );
  });

  it('counts passes: forward mode one per input, reverse mode one forward and one backward', () => {
    expect(passesNeeded(3, 1)).toEqual({ forwardMode: { forward: 3, backward: 0 }, reverseMode: { forward: 1, backward: 1 } });
    expect(passesNeeded(MILLION, 1).forwardMode.forward).toBe(1_000_000);
    const frames = traceOf(autograd, { story: 'modes', values: [2, 3, -1] }).frames;
    // Forward mode's passes are counted apart from reverse mode's, so each reads plainly.
    const endOfForwardMode = frames.findLast((f) => f.stats.forward === 0)!;
    expect(endOfForwardMode.stats).toEqual({ forwardMode: 3, forward: 0, backward: 0 });
    expect(frames.find((f) => f.stats.forward === 1)!.stats).toEqual({ forwardMode: 3, forward: 1, backward: 0 });
    expect(frames.at(-1)!.stats).toEqual({ forwardMode: 3, forward: 1, backward: 1 });
    expect(traceOf(autograd, { story: 'order', values: [2, 3, -4] }).frames.at(-1)!.stats).toEqual({ forwardMode: 0, forward: 1, backward: 1 });
    expect(traceOf(autograd, { story: 'train', start: TRAIN_START, data: TRAIN_DATA }).frames.at(-1)!.stats).toEqual({ forwardMode: 0, forward: TRAIN_STEPS + 1, backward: TRAIN_STEPS });
  });

  it('tells the order story from its own numbers', () => {
    // L = r + q, p = a·b, q = p + c, r = q·p at a = 2, b = 3, c = −4.
    const g = orderGraph([2, 3, -4]);
    expect(g.out.data).toBe(14);
    expect(topoSteps(g.out).at(-1)!.order.map(nameOf)).toEqual(['a', 'b', 'p', 'c', 'q', 'r', 'L']);
    const { grads } = backwardSteps(g.out);
    expect(g.leaves.map((v) => grads.get(v))).toEqual([27, 18, 7]);
    const frames = traceOf(autograd, { story: 'order', values: [2, 3, -4] }).frames;
    expect(frames.length).toBe(16);
    expect(readout(frames.at(-1)!.state, 'a')).toBe('27');
    expect(tokensPart(frames.at(-1)!.state)!.tokens.map((t) => t.text)).toEqual(['a', 'b', 'p', 'c', 'q', 'r', 'L']);
    const questions = frames.flatMap((f) => (f.checkpoint ? [`${f.checkpoint.question} ${answerOf(f)}`] : []));
    expect(questions).toEqual([
      'What will L be? 14',
      'Which node joins the order first? a',
      'Which node joins the order next? p',
      'Which node joins the order next? c',
      'Which node joins the order next? r',
      'What will r’s gradient be? 1',
      'q holds 1 so far. Can q pass its gradient on yet? No',
      'What will p’s gradient be after q’s step? 9',
      'Can p pass its gradient on now? Yes',
    ]);
  });

  it('answers each order question on the next frame, for any leaf values', () => {
    fc.assert(
      fc.property(fc.array(small, { minLength: 3, maxLength: 3 }), (values) => {
        const input: AutogradInput = { story: 'order', values };
        const frames = traceOf(autograd, input).frames;
        expectGoodPlotTrace(autograd, frames);
        roundTrips(input);
        expect(frames.length).toBe(16);
        frames.forEach((frame, i) => {
          if (!frame.checkpoint) return;
          const answer = answerOf(frame);
          const next = frames[i + 1].state;
          if (frame.checkpoint.question.startsWith('Which node')) expect(tokensPart(next)!.tokens.at(-1)!.text).toBe(answer);
          else if (!['Yes', 'No'].includes(answer)) expect(nodeText(next), frame.checkpoint.question).toContain(answer);
        });
        // The leaves' gradients equal finite differences.
        const f = (xs: number[]) => orderGraph(xs).out.data;
        const end = frames.at(-1)!.state;
        ['a', 'b', 'c'].forEach((leaf, i) => expect(num(readout(end, leaf))).toBeCloseTo(numericGradient(f, values, i), 3));
      }),
      { numRuns: 60 },
    );
  });

  it('tells the modes story from its own numbers, tangents shown on the next frame', () => {
    const frames = traceOf(autograd, { story: 'modes', values: [2, 3, -1] }).frames;
    expect(frames.length).toBe(11);
    const end = frames.at(-1)!.state;
    expect(['x1', 'x2', 'x3'].map((x) => readout(end, `fwd-${x}`))).toEqual(['11', '4', '2']);
    expect(['x1', 'x2', 'x3'].map((x) => readout(end, `rev-${x}`))).toEqual(['11', '4', '2']);
    expect(readout(end, 'forward-mode')).toBe('1,000,000 passes');
    // Distractors are real slips (x1 is used twice), not sign flips.
    const asked = frames.flatMap((f) => (f.checkpoint ? [`${f.checkpoint.question} [${f.checkpoint.choices.join(' | ')}] ${answerOf(f)}`] : []));
    expect(asked).toEqual([
      'What will p’s tangent be? [0 | 2 | 3 | 6] 3',
      'What will s’s tangent be? [1 | 3 | 4 | 5] 3',
      'What will f’s tangent be? [5 | 6 | 10 | 11] 11',
      'How many forward passes does forward mode need for all three derivatives? [1 | 2 | 3 | 6] 3',
      'What will s’s gradient be? [−2 | 1 | 2 | 5] 2',
      'What will x1’s gradient end up as? [5 | 6 | 10 | 11] 11',
    ]);
    expect(frames[1].note).toBe('p = 2 × 3 = 6. Its tangent: each input’s tangent times p’s local derivative for it, added up: 3 × 1 + 2 × 0 = 3.');
    expect(graphPart(frames[1].state).nodes.find((n) => n.id === 'p')!.grad).toBe('tangent 3');
    fc.assert(
      fc.property(fc.array(small, { minLength: 3, maxLength: 3 }), (values) => {
        const input: AutogradInput = { story: 'modes', values };
        const fs = traceOf(autograd, input).frames;
        expectGoodPlotTrace(autograd, fs);
        roundTrips(input);
        expect(fs.length).toBe(11);
        fs.forEach((frame, i) => {
          if (!frame.checkpoint || frame.checkpoint.question.startsWith('How many')) return;
          expect(nodeText(fs[i + 1].state), frame.checkpoint.question).toContain(answerOf(frame));
        });
        const last = fs.at(-1)!.state;
        ['x1', 'x2', 'x3'].forEach((x) => expect(readout(last, `fwd-${x}`)).toBe(readout(last, `rev-${x}`)));
      }),
      { numRuns: 60 },
    );
  });

  it('trains with the engine exactly as a plain loop does, and the loss ends lower', () => {
    const reference = (data: readonly Vec[], [w0, b0]: Vec, steps: number) => {
      let [w, b] = [w0, b0];
      const losses: number[] = [];
      const ws: number[] = [];
      for (let k = 0; k <= steps; k++) {
        let L = 0;
        let gw = 0;
        let gb = 0;
        for (const [x, y] of data) {
          const t = Math.tanh(w * x + b);
          L += (t - y) ** 2;
          gw += 2 * (t - y) * (1 - t * t) * x;
          gb += 2 * (t - y) * (1 - t * t);
        }
        const n = data.length;
        losses.push(L / n);
        ws.push(w);
        w -= (LR * gw) / n;
        b -= (LR * gb) / n;
      }
      return { losses, ws };
    };
    const point = fc.tuple(fc.integer({ min: -4, max: 4 }).map((k) => k / 2), fc.integer({ min: -100, max: 100 }).map((k) => k / 100)) as fc.Arbitrary<Vec>;
    const start = fc.tuple(fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 })).map(([w, b]) => [w / 10, b / 10] as Vec);
    fc.assert(
      fc.property(fc.array(point, { minLength: 4, maxLength: 6 }), start, (data, s) => {
        const run = trainNeuron(data, s, LR, TRAIN_STEPS);
        const ref = reference(data, s, TRAIN_STEPS);
        run.loss.forEach((l, k) => expect(l).toBeCloseTo(ref.losses[k], 9));
        run.w.forEach((w, k) => expect(w).toBeCloseTo(ref.ws[k], 9));
        run.loss.forEach((l, k) => expect(l).toBeCloseTo(mse(data, run.w[k], run.b[k]), 12));
        // Stepping against the gradient lowers the loss (or leaves it where the gradient is 0).
        expect(run.loss[TRAIN_STEPS]).toBeLessThanOrEqual(run.loss[0] + 1e-12);
        if (Math.hypot(run.gw[0], run.gb[0]) > 1e-3) expect(run.loss[TRAIN_STEPS]).toBeLessThan(run.loss[0]);
      }),
      { numRuns: 60 },
    );
  });

  it('builds a fresh loss graph whose gradients match finite differences', () => {
    const { loss, w, b } = neuronLoss(TRAIN_DATA, 0.3, -0.2);
    loss.backward();
    const f = ([ww, bb]: number[]) => mse(TRAIN_DATA, ww, bb);
    expect(w.grad).toBeCloseTo(numericGradient(f, [0.3, -0.2], 0), 6);
    expect(b.grad).toBeCloseTo(numericGradient(f, [0.3, -0.2], 1), 6);
  });

  it('tells the training story from its own numbers, drawn to hundredths', () => {
    const run = trainNeuron(TRAIN_DATA, TRAIN_START);
    expect(run.loss[0]).toBeCloseTo(2.0153, 4);
    expect(run.loss[TRAIN_STEPS]).toBeLessThan(0.002);
    const frames = traceOf(autograd, { story: 'train', start: TRAIN_START, data: TRAIN_DATA }).frames;
    expect(frames.length).toBe(1 + 2 * 3 + JUMPS.length);
    // Questions that can be reasoned out: the direction w must go, b's direction, the loss, w's step shrinking.
    expect(frames.flatMap((f) => (f.checkpoint ? [`${f.checkpoint.question} ${answerOf(f)}`] : []))).toEqual([
      'The fit slopes the wrong way. Which way must w move to lower the loss? Up',
      'Which way will b move? Up',
      'Will the loss go down after this update? Yes',
      'Will w’s step be bigger or smaller than the last one? Smaller',
      'Will the loss be lower after step 5 than now? Yes',
    ]);
    expect(frames[2].note).toContain('w ← −1 − 0.25 × (−0.94) = −0.765');
    const hundredths = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
    for (const f of frames)
      for (const id of ['data', 'loss', 'weights']) {
        const plane = planeOf(f.state, id);
        for (const s of plane.shapes) {
          const pts = s.kind === 'path' ? s.points : s.kind === 'point' ? [s.at] : s.kind === 'contours' ? s.levels.flatMap((l) => l.segments.flat()) : [];
          for (const p of pts) expect(hundredths(p[0]) && hundredths(p[1]), `${id}/${s.id}`).toBe(true);
        }
      }
    // The loss readout is the loss at the step drawn.
    expect(num(readout(frames.at(-1)!.state, 'loss'))).toBeCloseTo(run.loss[TRAIN_STEPS], 4);
  });

  it('keeps the training story good from any start and dataset', () => {
    const point = fc.tuple(fc.integer({ min: -4, max: 4 }).map((k) => k / 2), fc.integer({ min: -100, max: 100 }).map((k) => k / 100)) as fc.Arbitrary<Vec>;
    fc.assert(
      fc.property(fc.array(point, { minLength: 4, maxLength: 6 }), fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 }), (data, w, b) => {
        const input: AutogradInput = { story: 'train', start: [w / 10, b / 10], data };
        const frames = traceOf(autograd, input).frames;
        expectGoodPlotTrace(autograd, frames);
        roundTrips(input);
        expect(frames.length).toBe(12);
        // The trail never leaves the weights plane, even from a corner start.
        const plane = planeOf(frames.at(-1)!.state, 'weights');
        for (const s of plane.shapes)
          if (s.kind === 'path' || s.kind === 'point')
            for (const p of s.kind === 'path' ? s.points : [s.at]) expect(p.every((v) => v >= plane.x.min && v <= plane.x.max)).toBe(true);
      }),
      { numRuns: 25 },
    );
    // A corner start walks past ±3 (the handle's box) but stays on the plane.
    const corner = traceOf(autograd, { story: 'train', start: [3, 3], data: TRAIN_DATA }).frames;
    expectGoodPlotTrace(autograd, corner);
    expect(planeOf(corner[0].state, 'weights').x).toMatchObject({ min: -4, max: 4 });
  });

  it('rejects nonsense custom text', () => {
    expect(parseAutograd('order: 1, 2')).toHaveProperty('error');
    expect(parseAutograd('modes: 1, 2, 300')).toHaveProperty('error');
    expect(parseAutograd('train: 1, 1, 0 0, 1 1, 2 2, 3 3')).toHaveProperty('error');
    expect(parseAutograd('train: 1, 1; 0 0, 1 1')).toHaveProperty('error');
    expect(parseAutograd('train: 9, 1; 0 0, 1 1, 2 0.5, -1 0')).toHaveProperty('error');
    expect(parseAutograd('train: 1, 1; 0 0, 1 1, 2 2, -1 0')).toHaveProperty('error');
    expect(parseAutograd('spline 1 2 3')).toHaveProperty('error');
    expect(parseAutograd('order: 2, 3, -4')).toEqual({ value: { story: 'order', values: [2, 3, -4] } });
    // A drag on another story, or another handle, changes nothing.
    const order: AutogradInput = { story: 'order', values: [2, 3, -4] };
    expect(autograd.input.drag!(order as never, 'start', [1, 1])).toBe(order);
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numericGradient } from '@/ml/autograd';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, readout, traceOf } from '@/viz/plot/testing';
import type { NetworkPart, PlotState } from '@/viz/plot/types';
import { chainRule, EXPRESSIONS, type ChainInput, type ExprId } from './chain-rule';

const graph = (s: PlotState) => s.parts.find((p): p is NetworkPart => p.kind === 'network')!;
const nodeText = (s: PlotState) => graph(s).nodes.map((n) => `${n.value} ${n.grad ?? ''}`).join(' | ');

const input: fc.Arbitrary<ChainInput> = fc.constantFrom(...(Object.keys(EXPRESSIONS) as ExprId[])).chain((expr) =>
  fc.record({
    expr: fc.constant(expr),
    values: fc.array(fc.integer({ min: -40, max: 40 }).map((k) => k / 10 + 0), { minLength: EXPRESSIONS[expr].leaves.length, maxLength: EXPRESSIONS[expr].leaves.length }),
  }),
);

describe('chain-rule', () => {
  it('plays every example as a good trace', () => {
    for (const ex of chainRule.input.examples) expectGoodPlotTrace(chainRule, traceOf(chainRule, ex.make({ seed: 0, size: 0 })).frames);
  });

  it('ends with every leaf’s gradient equal to a finite-difference estimate', () => {
    fc.assert(
      fc.property(input, ({ expr, values }) => {
        const frames = traceOf(chainRule, { expr, values }).frames;
        expectGoodPlotTrace(chainRule, frames);
        const end = frames.at(-1)!.state;
        const f = (xs: number[]) => EXPRESSIONS[expr].build(xs).data;
        EXPRESSIONS[expr].leaves.forEach((leaf, i) => {
          const shown = Number(readout(end, leaf)!.replace('−', '-'));
          expect(shown, leaf).toBeCloseTo(numericGradient(f, values, i), 3);
        });
      }),
      { numRuns: 100 },
    );
  });

  it('asks questions the next frame answers on the graph', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(chainRule, inp).frames;
        frames.forEach((frame, i) => {
          if (!frame.checkpoint) return;
          const answer = frame.checkpoint.choices[frame.checkpoint.answer];
          expect(nodeText(frames[i + 1].state), `frame ${i}: ${frame.checkpoint.question}`).toContain(answer);
        });
      }),
      { numRuns: 60 },
    );
  });

  it('adds up the gradient of a value used twice', () => {
    const end = traceOf(chainRule, { expr: 'reuse', values: [3, -2] }).frames.at(-1)!.state;
    expect(readout(end, 'a')).toBe(fmt(-2 + 1, 4));
    expect(readout(end, 'b')).toBe(fmt(3, 4));
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = chainRule.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    for (const text of ['neuron: 1, 2', 'tensor: 1', 'simple: 1, 2, 3, 400']) expect(custom!.parse(text)).toHaveProperty('error');
  });
});

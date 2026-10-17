import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DATA_BOX } from '@/ml/datasets';
import { accuracy, predict } from '@/ml/mlp';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { HeatmapShape, NetworkPart, PlotState } from '@/viz/plot/types';
import { CHECKPOINTS, EPOCHS, HEAT, mlpPlayground, playgroundRun, type PlaygroundInput } from './mlp';

const network = (state: PlotState) => state.parts.find((p): p is NetworkPart => p.kind === 'network')!;
const heatmap = (state: PlotState) => planeOf(state).shapes.find((s): s is HeatmapShape => s.kind === 'heatmap')!;

const input: fc.Arbitrary<PlaygroundInput> = fc.record({
  data: fc.constantFrom('linear', 'xor', 'circles', 'moons' as const),
  hidden: fc.constantFrom<number[]>([], [1], [3], [5, 2]),
  lr: fc.constantFrom(0.05, 0.1, 0.5),
  seed: fc.integer({ min: 0, max: 50 }),
});

describe('mlp playground', () => {
  it('plays every example as a good trace', () => {
    for (const ex of mlpPlayground.input.examples) {
      for (const size of [0, 2, 4]) expectGoodPlotTrace(mlpPlayground, traceOf(mlpPlayground, ex.make({ seed: 7, size })).frames);
    }
  });

  it('draws each checkpoint’s network: heatmap, weights and readouts all come from the trained snapshot', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = traceOf(mlpPlayground, inp).frames;
        expectGoodPlotTrace(mlpPlayground, frames);
        const run = playgroundRun(inp);
        expect(frames).toHaveLength(CHECKPOINTS.length + 1);
        CHECKPOINTS.forEach((epoch, k) => {
          const state = frames[k].state;
          const m = run.snapshots.get(epoch)!;
          expect(readout(state, 'epoch')).toBe(String(epoch));
          expect(readout(state, 'accuracy')).toBe(`${Math.round(accuracy(m, run.data) * 100)}%`);
          // Edge weights are the parameters.
          const weights = new Map(network(state).edges.map((e) => [e.id, e.weight]));
          m.W.forEach((layer, l) => layer.forEach((row, j) => row.forEach((w, i) => expect(weights.get(`w${l}_${j}_${i}`)).toBe(w))));
          // Heatmap cells are the network's output at their centres.
          const heat = heatmap(state);
          const { cols, rows } = HEAT;
          for (const [r, c] of [[0, 0], [rows - 1, cols - 1], [7, 21], [15, 15]]) {
            const x = DATA_BOX.x.min + ((c + 0.5) * (DATA_BOX.x.max - DATA_BOX.x.min)) / cols;
            const y = DATA_BOX.y.max - ((r + 0.5) * (DATA_BOX.y.max - DATA_BOX.y.min)) / rows;
            expect(heat.values[r * cols + c]).toBeCloseTo(predict(m, x, y), 12);
          }
        });
      }),
      { numRuns: 12 },
    );
  });

  it('is deterministic', () => {
    const inp: PlaygroundInput = { data: 'moons', hidden: [4], lr: 0.1, seed: 3 };
    expect(traceOf(mlpPlayground, inp).frames.map((f) => f.state)).toEqual(traceOf(mlpPlayground, inp).frames.map((f) => f.state));
  });

  it('learns XOR with a hidden layer and can’t without one', () => {
    const run = (hidden: number[]) => {
      const r = playgroundRun({ data: 'xor', hidden, lr: 0.1, seed: 7 });
      return accuracy(r.snapshots.get(EPOCHS)!, r.data);
    };
    expect(run([4])).toBeGreaterThanOrEqual(0.95);
    expect(run([])).toBeLessThan(0.8);
  });

  it('asks honestly whether accuracy will rise, and whether a straight line can split XOR', () => {
    const frames = traceOf(mlpPlayground, { data: 'xor', hidden: [], lr: 0.1, seed: 7 }).frames;
    const first = frames[0].checkpoint!;
    expect(first.choices[first.answer]).toBe('No');
    const inp: PlaygroundInput = { data: 'circles', hidden: [4], lr: 0.1, seed: 7 };
    const r = playgroundRun(inp);
    traceOf(mlpPlayground, inp).frames.forEach((f, k) => {
      if (!f.checkpoint) return;
      const rises = accuracy(r.snapshots.get(CHECKPOINTS[k + 1])!, r.data) > accuracy(r.snapshots.get(CHECKPOINTS[k])!, r.data);
      expect(f.checkpoint.choices[f.checkpoint.answer]).toBe(rises ? 'Yes' : 'No');
    });
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = mlpPlayground.input;
    fc.assert(
      fc.property(input, (inp) => {
        expect(custom!.parse(custom!.format(inp))).toEqual({ value: inp });
      }),
    );
    expect(custom!.parse('circles, hidden = 6 6, lr = 0.3, seed = 2')).toEqual({ value: { data: 'circles', hidden: [6, 6], lr: 0.3, seed: 2 } });
    for (const text of ['spiral, hidden = 4', 'xor, hidden = 4 4 4', 'xor, hidden = 9', 'xor, hidden = 4, lr = 0', 'xor, hidden = 4, lr = 50']) {
      expect(custom!.parse(text)).toHaveProperty('error');
    }
  });
});

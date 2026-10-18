import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { metrics, simulate, type Policy, type Process } from '@/systems/scheduling';
import type { GridState } from '@/viz/grid/types';
import { answerPositions, expectGoodTrace, expectLegendMatchesMarks, expectShortPseudocode, list, table, traceOf } from '@/viz/grid/testing';
import { cpuScheduling, MAX_TIME, type SchedulingInput } from './cpu-scheduling';

const algo = cpuScheduling;
const examples = algo.input.examples;
const frames = (input: SchedulingInput) => traceOf(algo, input).frames as { state: GridState; note: string; checkpoint?: { choices: readonly string[]; answer: number } }[];

const policy: fc.Arbitrary<Policy> = fc.oneof(
  fc.constant<Policy>({ kind: 'fcfs' }),
  fc.constant<Policy>({ kind: 'sjf' }),
  fc.constant<Policy>({ kind: 'srtf' }),
  fc.constant<Policy>({ kind: 'priority' }),
  fc.integer({ min: 1, max: 4 }).map((quantum): Policy => ({ kind: 'rr', quantum })),
);
const input: fc.Arbitrary<SchedulingInput> = fc
  .record({
    policy,
    jobs: fc.array(fc.record({ arrival: fc.integer({ min: 0, max: 12 }), burst: fc.integer({ min: 1, max: 5 }), priority: fc.integer({ min: 1, max: 4 }) }), { minLength: 1, maxLength: 7 }),
  })
  .map(({ policy, jobs }) => ({
    policy,
    processes: jobs.map((j, i): Process => ({ id: `P${i + 1}`, arrival: j.arrival, burst: j.burst, priority: policy.kind === 'priority' ? j.priority : 1 })),
  }))
  .filter((x) => simulate(x.policy, x.processes).time <= MAX_TIME);

describe('cpu-scheduling', () => {
  it('builds every example and replays it with good frames', () => {
    for (const example of examples) {
      for (const seed of [1, 7, 99, 1234]) {
        const { frames: fs, truncated } = traceOf(algo, example.make({ seed, size: 0 }));
        expect(truncated).toBe(false);
        expectGoodTrace(algo, fs);
      }
    }
  });

  it('keeps pseudo-code short, lists exactly the marks it uses, and names real examples in its experiments', () => {
    expectShortPseudocode(algo);
    expectLegendMatchesMarks(algo);
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('varies where the right answer sits', () => {
    const positions = new Set<number>();
    for (const example of examples) for (const p of answerPositions(traceOf(algo, example.make({ seed: 3, size: 0 })).frames)) positions.add(p);
    expect(positions.size).toBeGreaterThan(1);
  });

  it('accepts its own formatted custom input, and explains bad input', () => {
    const custom = algo.input.custom!;
    for (const example of examples) {
      const x = example.make({ seed: 11, size: 0 });
      expect(custom.parse(custom.format(x))).toEqual({ value: x });
    }
    expect(custom.parse('rr 2: 0-5, 1-3')).toEqual({
      value: { policy: { kind: 'rr', quantum: 2 }, processes: [{ id: 'P1', arrival: 0, burst: 5, priority: 1 }, { id: 'P2', arrival: 1, burst: 3, priority: 1 }] },
    });
    for (const bad of ['0-5, 1-3', 'rr 0: 0-5', 'rr 9: 0-5', 'fcfs:', 'fcfs: 0-0', 'fcfs: 0-11', 'fcfs: 21-1', 'priority: 0-3', 'priority: 0-3-0', 'sjf: 0-3-2', 'fcfs: 0-10, 0-10, 0-10, 0-10, 0-10']) {
      expect(custom.parse(bad), bad).toHaveProperty('error');
    }
  });

  it('draws the model’s schedule: run bars, finishes and averages match the simulation', () => {
    fc.assert(
      fc.property(input, (x) => {
        const fs = frames(x);
        expectGoodTrace(algo, fs as never);
        const last = fs.at(-1)!.state;
        const end = simulate(x.policy, x.processes);
        const gantt = table(last, 'gantt');
        const runs = gantt.bars.filter((b) => b.id.includes('-run'));
        const covered = (id: string) => runs.filter((b) => b.row === id).reduce((s, b) => s + b.to - b.from, 0);
        for (const p of x.processes) expect(covered(p.id)).toBe(p.burst);
        expect(runs.length).toBe(end.segments.length);
        const m = metrics(end);
        const t = table(last, 'metrics');
        const col = (name: string) => t.cols.findIndex((c) => c.label === name);
        m.perProcess.forEach((pm) => {
          expect(t.cells[pm.id][col('Finish')]).toBe(String(pm.finish));
          expect(t.cells[pm.id][col('Waiting')]).toBe(String(pm.waiting));
          expect(t.cells[pm.id][col('Response')]).toBe(String(pm.response));
        });
        expect(t.cells.avg[col('Waiting')]).toBe(String(Math.round(m.avgWaiting * 10) / 10));
        expect(list(last, 'ready').items).toEqual([]);
      }),
      { numRuns: 120 },
    );
  });

  it('answers each "who runs next?" question with the process the next frame puts on the CPU', () => {
    fc.assert(
      fc.property(input, (x) => {
        const fs = frames(x);
        fs.forEach((f, i) => {
          if (!f.checkpoint) return;
          const picked = f.checkpoint.choices[f.checkpoint.answer].split(' ')[0];
          expect(list(fs[i + 1].state, 'cpu').items.map((it) => it.id)).toEqual([picked]);
        });
      }),
      { numRuns: 120 },
    );
  });

  it('tells the convoy story: FCFS waits 5.75 on average, SRTF 2', () => {
    const avg = (id: string) => {
      const last = traceOf(algo, examples.find((e) => e.id === id)!.make({ seed: 1, size: 0 })).frames.at(-1)!.state as GridState;
      const t = table(last, 'metrics');
      return t.cells.avg[t.cols.findIndex((c) => c.label === 'Waiting')];
    };
    expect(avg('fcfs')).toBe('5.8');
    expect(avg('sjf')).toBe('5.5');
    expect(avg('srtf')).toBe('2');
  });
});

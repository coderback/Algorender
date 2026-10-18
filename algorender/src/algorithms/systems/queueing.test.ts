import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { latencyQuantile, poissonJobs, runQueue } from '@/systems/queueing';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { BarsShape } from '@/viz/plot/types';
import { formatQueueing, MAX_LOAD, MAX_REQUESTS, MIN_REQUESTS, parseQueueing, queueing, target, type QueueingInput } from './queueing';

const input: fc.Arbitrary<QueueingInput> = fc
  .record({
    servers: fc.integer({ min: 1, max: 4 }),
    serviceRate: fc.constantFrom(2, 5, 10, 20),
    load: fc.integer({ min: 10, max: Math.round(MAX_LOAD * 100) }),
    requests: fc.integer({ min: MIN_REQUESTS, max: MAX_REQUESTS }),
    seed: fc.integer({ min: 0, max: 100_000 }),
  })
  // Custom text keeps two decimals, so the rates do too.
  .map(({ servers, serviceRate, load, requests, seed }) => ({ arrivalRate: Math.round(load * servers * serviceRate) / 100, serviceRate, servers, requests, seed }));

const framesOf = (inp: QueueingInput) => traceOf(queueing, inp).frames;
const timesValue = (choice: string) => Number(choice.replace('×', ''));

describe('queueing', () => {
  it('plays every example at several sizes as a good trace', () => {
    for (const ex of queueing.input.examples) {
      for (const size of [MIN_REQUESTS, 16, MAX_REQUESTS]) {
        const frames = framesOf(ex.make({ seed: 5, size }));
        expectGoodPlotTrace(queueing, frames);
        expect(frames.length).toBeLessThan(2 * MAX_REQUESTS + 5);
      }
    }
  });

  it('narrates every arrival and finish of the watched requests, as the model serves them', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = framesOf(inp);
        expectGoodPlotTrace(queueing, frames);
        const served = runQueue(inp.servers, poissonJobs(inp, inp.requests, inp.seed));
        const last = frames.at(-1)!;
        expect(last.stats.served).toBe(inp.requests);
        expect(last.stats.waited).toBe(served.filter((s) => s.wait > 0).length);
        // Every request's bars: its wait (if any) under its service, topping out at its latency.
        const bars = (planeOf(last.state, 'latency').shapes.find((s) => s.id === 'latency') as BarsShape).bars;
        for (const s of served) {
          const top = bars.find((b) => b.id === `s${s.id}`)!;
          expect(top.y).toBeCloseTo(s.latency * 1000, -1);
          expect(Boolean(bars.find((b) => b.id === `w${s.id}`))).toBe(s.wait > 0);
        }
      }),
      { numRuns: 25 },
    );
  });

  it('asks whether an arriving request waits, and answers honestly', () => {
    fc.assert(
      fc.property(input, (inp) => {
        const frames = framesOf(inp);
        frames.forEach((f, i) => {
          const c = f.checkpoint;
          if (!c?.question.includes('have to wait')) return;
          const next = frames[i + 1];
          const waited = next.stats.waited > f.stats.waited;
          expect(c.choices[c.answer]).toBe(waited ? 'Yes, every server is busy' : 'No, a server is free');
        });
      }),
      { numRuns: 25 },
    );
  });

  it('asks how much p99 grows with more load, with the ratio from the formulas and choices in order', () => {
    for (const ex of queueing.input.examples) {
      const inp = ex.make({ seed: 2, size: 12 });
      const frames = framesOf(inp);
      const asked = frames.find((f) => f.checkpoint?.question.includes('how many times longer'))!;
      expect(asked).toBeDefined();
      const rho = inp.arrivalRate / (inp.servers * inp.serviceRate);
      const at = (r: number) => latencyQuantile({ ...inp, arrivalRate: r * inp.servers * inp.serviceRate }, 0.99);
      const ratio = at(target(rho)) / at(rho);
      const { choices, answer } = asked.checkpoint!;
      expect(Math.abs(timesValue(choices[answer]) - ratio)).toBeLessThan(ratio >= 10 ? 0.51 : 0.051);
      const values = choices.map(timesValue);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
    // 80% to 95% on one server: p99 is proportional to 1/(μ − λ), so four times.
    const busy = framesOf(queueing.input.examples[0].make({ seed: 1, size: 10 }));
    const c = busy.find((f) => f.checkpoint?.question.includes('how many times longer'))!.checkpoint!;
    expect(c.choices[c.answer]).toBe('4×');
  });

  it('reports long-run percentiles close to the closed forms', () => {
    const frames = framesOf({ arrivalRate: 8, serviceRate: 10, servers: 1, requests: 10, seed: 3 });
    const summary = frames.at(-2)!;
    const msOf = (v: string) => (v.endsWith(' s') ? Number(v.replace(' s', '')) * 1000 : Number(v.replace(' ms', '')));
    // One server at 80%: mean 500 ms, p99 = ln 100 / 2 ≈ 2303 ms.
    expect(Math.abs(msOf(readout(summary.state, 'mean')!) - 500)).toBeLessThan(50);
    expect(Math.abs(msOf(readout(summary.state, 'p99')!) - 2303)).toBeLessThan(250);
    expect(readout(summary.state, 'formula')).toBe('500 ms');
  });

  it('is reproducible, and round-trips custom input while rejecting unstable or nonsense queues', () => {
    fc.assert(
      fc.property(input, (inp) => {
        expect(parseQueueing(formatQueueing(inp))).toEqual({ value: inp });
      }),
    );
    const inp = queueing.input.examples[3].make({ seed: 9, size: 12 });
    expect(framesOf(inp)).toEqual(framesOf(inp));
    expect(parseQueueing('λ = 8, μ = 10, c = 1')).toEqual({ value: { arrivalRate: 8, serviceRate: 10, servers: 1, requests: 16, seed: 1 } });
    for (const text of [
      '',
      'λ = 8',
      'λ = 10, μ = 10, c = 1',
      'λ = 25, μ = 10, c = 2',
      'λ = 8, μ = 10, c = 1.5',
      'λ = 8, μ = 10, c = 9',
      'λ = 0, μ = 10, c = 1',
      'λ = 8, μ = 10, c = 1, requests = 3',
      'λ = 8, μ = 10, c = 1, requests = 10, seed = 1, 2',
    ]) {
      expect(parseQueueing(text), text).toHaveProperty('error');
    }
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createQueue,
  inSystemOverTime,
  latencyQuantile,
  latencyTail,
  meanLatency,
  mm1MeanLatency,
  percentile,
  poissonJobs,
  runQueue,
  step,
  summarise,
  utilisation,
  waitProbability,
  type Job,
  type QueueState,
  type Served,
} from './queueing';

/** Every event, by stepping. */
function stepAll(servers: number, jobs: readonly Job[]): { served: Served[]; states: QueueState[] } {
  let state = createQueue(servers, jobs);
  const states = [state];
  for (let r = step(state); r; r = step(state)) {
    state = r.state;
    states.push(state);
  }
  return { served: [...state.finished], states };
}

const jobsArb = fc
  .array(fc.record({ gap: fc.double({ min: 0.001, max: 3, noNaN: true }), work: fc.double({ min: 0.001, max: 4, noNaN: true }) }), { minLength: 0, maxLength: 40 })
  .map((xs) => {
    let t = 0;
    return xs.map(({ gap, work }, id): Job => ({ id, arrival: (t += gap), work }));
  });

describe('the queue model', () => {
  it('stepping event by event serves every request as first come, first served on the first free server', () => {
    fc.assert(
      fc.property(jobsArb, fc.integer({ min: 1, max: 4 }), (jobs, servers) => {
        const byStep = stepAll(servers, jobs).served;
        const direct = runQueue(servers, jobs);
        expect(byStep.length).toBe(jobs.length);
        const key = (s: Served) => [s.id, s.start, s.done, s.server];
        expect(byStep.map(key).sort((a, b) => a[0] - b[0])).toEqual(direct.map(key).sort((a, b) => a[0] - b[0]));
        for (const s of byStep) {
          expect(s.start).toBeGreaterThanOrEqual(s.arrival);
          expect(s.done).toBeCloseTo(s.start + s.work, 9);
          expect(s.latency).toBeCloseTo(s.wait + s.work, 9);
        }
        // Nobody is overtaken in the line: requests start in arrival order.
        const starts = [...byStep].sort((a, b) => a.arrival - b.arrival).map((s) => s.start);
        for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1] - 1e-12);
      }),
      { numRuns: 150 },
    );
  });

  it('never keeps a server idle while someone waits, and never changes the state it was given', () => {
    fc.assert(
      fc.property(jobsArb, fc.integer({ min: 1, max: 3 }), (jobs, servers) => {
        let state = createQueue(servers, jobs);
        for (let r = step(state); r; r = step(state)) {
          const before = JSON.stringify(state);
          const next = r.state;
          expect(JSON.stringify(state)).toBe(before);
          if (next.waiting.length > 0) expect(next.busy.every((s) => s !== null)).toBe(true);
          expect(next.time).toBeGreaterThanOrEqual(state.time);
          state = next;
        }
        expect(state.pending).toEqual([]);
        expect(state.waiting).toEqual([]);
        expect(state.busy.every((s) => s === null)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('obeys Little’s law exactly: the area under “requests in the system” is the sum of the latencies', () => {
    fc.assert(
      fc.property(jobsArb, fc.integer({ min: 1, max: 3 }), (jobs, servers) => {
        const served = runQueue(servers, jobs);
        const curve = inSystemOverTime(served);
        let area = 0;
        for (let i = 1; i < curve.length; i++) area += curve[i - 1].count * (curve[i].time - curve[i - 1].time);
        expect(area).toBeCloseTo(served.reduce((a, s) => a + s.latency, 0), 6);
        expect(curve.at(-1)!.count).toBe(0);
        expect(curve.every((p) => p.count >= 0 && p.count <= jobs.length)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('makes reproducible random workloads at the requested rates', () => {
    expect(poissonJobs({ arrivalRate: 5, serviceRate: 10 }, 50, 3)).toEqual(poissonJobs({ arrivalRate: 5, serviceRate: 10 }, 50, 3));
    const jobs = poissonJobs({ arrivalRate: 5, serviceRate: 10 }, 20_000, 9);
    expect(jobs.at(-1)!.arrival / jobs.length).toBeCloseTo(1 / 5, 2);
    expect(jobs.reduce((a, j) => a + j.work, 0) / jobs.length).toBeCloseTo(1 / 10, 2);
  });

  it('matches the closed forms: M/M/1’s 1/(μ − λ), Erlang C, and the latency tail', () => {
    expect(mm1MeanLatency(8, 10)).toBeCloseTo(0.5, 12);
    expect(mm1MeanLatency(10, 10)).toBe(Infinity);
    for (const [λ, μ] of [
      [5, 10],
      [8, 10],
      [9.5, 10],
    ]) {
      const one = { arrivalRate: λ, serviceRate: μ, servers: 1 };
      expect(waitProbability(one)).toBeCloseTo(λ / μ, 12);
      expect(meanLatency(one)).toBeCloseTo(1 / (μ - λ), 12);
      // One server: latency is exponential with rate μ − λ.
      for (const q of [0.5, 0.95, 0.99]) expect(latencyQuantile(one, q)).toBeCloseTo(Math.log(1 / (1 - q)) / (μ - λ), 6);
    }
    // Two servers at 80%: Erlang C = 6.4 / 9, mean wait C / (cμ − λ).
    const two = { arrivalRate: 16, serviceRate: 10, servers: 2 };
    expect(utilisation(two)).toBeCloseTo(0.8, 12);
    expect(waitProbability(two)).toBeCloseTo(6.4 / 9, 12);
    expect(meanLatency(two)).toBeCloseTo(6.4 / 9 / 4 + 0.1, 12);
    expect(latencyTail(two, 0)).toBeCloseTo(1, 12);
    expect(meanLatency({ ...two, arrivalRate: 20 })).toBe(Infinity);
  });

  it('converges on the closed forms over a long run', () => {
    for (const config of [
      { arrivalRate: 5, serviceRate: 10, servers: 1 },
      { arrivalRate: 7, serviceRate: 10, servers: 1 },
      { arrivalRate: 14, serviceRate: 10, servers: 2 },
      { arrivalRate: 21, serviceRate: 10, servers: 3 },
    ]) {
      const s = summarise(runQueue(config.servers, poissonJobs(config, 60_000, 17)));
      expect(Math.abs(s.mean - meanLatency(config)) / meanLatency(config), JSON.stringify(config)).toBeLessThan(0.06);
      expect(Math.abs(s.p50 - latencyQuantile(config, 0.5)) / latencyQuantile(config, 0.5)).toBeLessThan(0.08);
      expect(Math.abs(s.p99 - latencyQuantile(config, 0.99)) / latencyQuantile(config, 0.99)).toBeLessThan(0.12);
      expect(Math.abs(s.waited / s.count - waitProbability(config))).toBeLessThan(0.03);
    }
  });

  it('takes nearest-rank percentiles', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.99)).toBe(4);
    expect(percentile([7], 0.01)).toBe(7);
    expect(percentile([], 0.5)).toBeNaN();
  });
});

// A queue in front of servers: the component the system-design canvas
// (phase 6d) reuses for anything that serves requests, an app server, a
// database, a worker pool. Requests arrive, wait in one first-come-first-
// served line if every server is busy, and leave when served; the queue
// reports latency percentiles and utilisation.
//
// The model is plain data stepped one event at a time (an arrival, a start, a
// finish), so a canvas can feed it any arrivals, and a visualiser can narrate
// each event. `poissonJobs` makes the classic M/M/c workload (random arrivals
// at rate λ, random service at rate μ per server, c servers) from a seed, and
// the closed forms (Erlang C) give the exact long-run answers to check against.
//
// Times are in seconds, rates per second.

import { createRng } from '@/engine/random';

export type QueueConfig = {
  /** λ: requests arriving per second, on average. */
  arrivalRate: number;
  /** μ: requests one server finishes per second, on average (its mean service time is 1/μ). */
  serviceRate: number;
  /** c: servers sharing the one line. */
  servers: number;
};

/** A request: when it arrives and how long it keeps a server busy. */
export type Job = { id: number; arrival: number; work: number };

/** A request a server is working on. */
export type InService = { job: Job; start: number; done: number };

/** A request that has left: its wait in line and its latency (wait + service). */
export type Served = Job & { start: number; done: number; server: number; wait: number; latency: number };

export type QueueState = {
  time: number;
  /** Requests that haven't arrived yet, in arrival order. */
  pending: readonly Job[];
  /** The line, first in first out. */
  waiting: readonly Job[];
  /** Each server's current request, or null when it is idle. */
  busy: readonly (InService | null)[];
  finished: readonly Served[];
};

export type QueueEvent =
  | { kind: 'arrive'; time: number; job: Job; server: number | null }
  | { kind: 'finish'; time: number; served: Served; next: Job | null };

/** ρ = λ / (cμ): the share of the servers' capacity the arrivals use. At 1 or more the line grows forever. */
export const utilisation = ({ arrivalRate, serviceRate, servers }: QueueConfig) => arrivalRate / (servers * serviceRate);

/** An exponential draw with the given rate, from a uniform u in [0, 1). */
const exponential = (u: number, rate: number) => -Math.log(1 - u) / rate;

/** `count` requests with random (Poisson) arrivals and random (exponential) service times, from the seed alone. */
export function poissonJobs({ arrivalRate, serviceRate }: Pick<QueueConfig, 'arrivalRate' | 'serviceRate'>, count: number, seed: number): Job[] {
  const u = createRng(seed);
  const jobs: Job[] = [];
  let t = 0;
  for (let id = 0; id < count; id++) {
    t += exponential(u(), arrivalRate);
    jobs.push({ id, arrival: t, work: exponential(u(), serviceRate) });
  }
  return jobs;
}

export function createQueue(servers: number, jobs: readonly Job[]): QueueState {
  return { time: 0, pending: [...jobs].sort((a, b) => a.arrival - b.arrival || a.id - b.id), waiting: [], busy: Array(servers).fill(null), finished: [] };
}

/** The server that finishes first (lowest index on a tie), or -1 when all are idle. */
function nextFinish(busy: readonly (InService | null)[]): number {
  let best = -1;
  busy.forEach((s, i) => {
    if (s && (best < 0 || s.done < busy[best]!.done)) best = i;
  });
  return best;
}

/**
 * The next event: a finish if one comes no later than the next arrival (so a
 * server freed at the moment a request arrives can take it), otherwise an
 * arrival. Null when everything has been served.
 */
export function step(state: QueueState): { state: QueueState; event: QueueEvent } | null {
  const f = nextFinish(state.busy);
  const arrival = state.pending[0];
  if (f >= 0 && (!arrival || state.busy[f]!.done <= arrival.arrival)) {
    const { job, start, done } = state.busy[f]!;
    const served: Served = { ...job, start, done, server: f, wait: start - job.arrival, latency: done - job.arrival };
    const [next, ...waiting] = state.waiting;
    const busy = state.busy.map((s, i) => (i === f ? (next ? { job: next, start: done, done: done + next.work } : null) : s));
    return { state: { time: done, pending: state.pending, waiting: next ? waiting : state.waiting, busy, finished: [...state.finished, served] }, event: { kind: 'finish', time: done, served, next: next ?? null } };
  }
  if (!arrival) return null;
  const free = state.busy.findIndex((s) => s === null);
  const busy = free < 0 ? state.busy : state.busy.map((s, i) => (i === free ? { job: arrival, start: arrival.arrival, done: arrival.arrival + arrival.work } : s));
  return {
    state: { time: arrival.arrival, pending: state.pending.slice(1), waiting: free < 0 ? [...state.waiting, arrival] : state.waiting, busy, finished: state.finished },
    event: { kind: 'arrive', time: arrival.arrival, job: arrival, server: free < 0 ? null : free },
  };
}

/** Serves every job; the results in the order they finished. Loops rather than recursing, so it handles long runs. */
export function runQueue(servers: number, jobs: readonly Job[]): Served[] {
  // The same rules as `step`, without copying state for every event.
  const pending = [...jobs].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
  const freeAt = Array<number>(servers).fill(0);
  const out: Served[] = [];
  // First come, first served: in arrival order, each request takes the server that frees up first.
  for (const job of pending) {
    let s = 0;
    for (let i = 1; i < servers; i++) if (freeAt[i] < freeAt[s]) s = i;
    // An idle server at arrival: the lowest-numbered one, as `step` picks.
    const idle = freeAt.findIndex((t) => t <= job.arrival);
    if (idle >= 0) s = idle;
    const start = Math.max(job.arrival, freeAt[s]);
    const done = start + job.work;
    freeAt[s] = done;
    out.push({ ...job, start, done, server: s, wait: start - job.arrival, latency: done - job.arrival });
  }
  return out.sort((a, b) => a.done - b.done || a.id - b.id);
}

/** The q-th quantile (0..1) of the values, by the nearest-rank method. */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

export type QueueSummary = { count: number; mean: number; p50: number; p95: number; p99: number; meanWait: number; waited: number };

/** Latency statistics of served requests. */
export function summarise(served: readonly Served[]): QueueSummary {
  const latencies = served.map((s) => s.latency);
  const n = served.length;
  return {
    count: n,
    mean: n ? latencies.reduce((a, b) => a + b, 0) / n : NaN,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    meanWait: n ? served.reduce((a, s) => a + s.wait, 0) / n : NaN,
    waited: served.filter((s) => s.wait > 1e-12).length,
  };
}

/** How many requests were in the system (waiting or being served) over time: a step function, starting at 0. */
export function inSystemOverTime(served: readonly Served[]): { time: number; count: number }[] {
  const changes = served.flatMap((s) => [
    { time: s.arrival, d: 1 },
    { time: s.done, d: -1 },
  ]);
  // A departure at the same moment as an arrival goes first, as in `step`.
  changes.sort((a, b) => a.time - b.time || a.d - b.d);
  const out = [{ time: 0, count: 0 }];
  let count = 0;
  for (const c of changes) {
    count += c.d;
    out.push({ time: c.time, count });
  }
  return out;
}

// ── Closed forms for M/M/c (random arrivals and service, one shared line) ──

/** Erlang C: the chance an arriving request has to wait, for a stable queue (ρ < 1). */
export function waitProbability({ arrivalRate, serviceRate, servers: c }: QueueConfig): number {
  const a = arrivalRate / serviceRate;
  const rho = a / c;
  if (rho >= 1) return 1;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < c; k++) {
    term *= a / k;
    sum += term;
  }
  const last = (term * a) / c / (1 - rho);
  return last / (sum + last);
}

/** The long-run mean latency (wait + service). For one server it is 1/(μ − λ). Infinite when ρ ≥ 1. */
export function meanLatency(config: QueueConfig): number {
  const { arrivalRate, serviceRate, servers } = config;
  if (utilisation(config) >= 1) return Infinity;
  return waitProbability(config) / (servers * serviceRate - arrivalRate) + 1 / serviceRate;
}

/** The M/M/1 formula: mean latency 1/(μ − λ). */
export const mm1MeanLatency = (arrivalRate: number, serviceRate: number) => (arrivalRate >= serviceRate ? Infinity : 1 / (serviceRate - arrivalRate));

/** The chance a request's latency is longer than t, in the long run. */
export function latencyTail(config: QueueConfig, t: number): number {
  const { arrivalRate, serviceRate: mu, servers } = config;
  const C = waitProbability(config);
  const theta = servers * mu - arrivalRate;
  // A request that waits waits Exp(θ), then is served for Exp(μ); the sum's tail has a closed form.
  const waitedThenServed = Math.abs(theta - mu) < 1e-9 ? (1 + mu * t) * Math.exp(-mu * t) : (theta * Math.exp(-mu * t) - mu * Math.exp(-theta * t)) / (theta - mu);
  return (1 - C) * Math.exp(-mu * t) + C * waitedThenServed;
}

/** The long-run q-th quantile of latency (q = 0.99 is p99). Infinite when ρ ≥ 1. */
export function latencyQuantile(config: QueueConfig, q: number): number {
  if (utilisation(config) >= 1) return Infinity;
  let lo = 0;
  let hi = 1 / config.serviceRate;
  while (latencyTail(config, hi) > 1 - q) hi *= 2;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (latencyTail(config, mid) > 1 - q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

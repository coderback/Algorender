import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import {
  createQueue,
  latencyQuantile,
  meanLatency,
  poissonJobs,
  runQueue,
  step,
  summarise,
  utilisation,
  type QueueConfig,
  type QueueEvent,
  type QueueState,
  type Served,
} from '@/systems/queueing';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, PlanePart, PlotPart, PlotState, Shape, Token, Vec } from '@/viz/plot/types';

export type QueueingInput = QueueConfig & { requests: number; seed: number };

export const MIN_REQUESTS = 8;
export const MAX_REQUESTS = 30;
export const MAX_SERVERS = 4;
/** Loads above this are too close to the cliff to simulate meaningfully. */
export const MAX_LOAD = 0.97;
/** Requests in the long run that the summary frames report on. */
export const LONG_RUN = 20_000;
/** The load the "what if it got busier?" question asks about. */
export const target = (rho: number) => (rho < 0.949 ? 0.95 : 0.98);

/** Latency for display: milliseconds, or seconds once it's long. */
export const ms = (seconds: number) => (seconds >= 10 ? `${fmt(seconds, 1)} s` : `${fmt(seconds * 1000, 0)} ms`);
const pct = (x: number) => `${fmt(x * 100, 0)}%`;
const at = (seconds: number) => `${fmt(seconds, 2)} s`;
const no = (id: number) => `#${id + 1}`;

const pseudocode = [
  'on arrival of request r:',
  '  if some server is free: start r',
  '  else: join the back of the line',
  'on finish of request r at server s:',
  '  latency ← done − arrival',
  '  if the line is not empty:',
  '    start the first in line on s',
  'after many requests: p50, p99, mean',
];

/** The p99 the queue would have at another load, with the same servers. */
const p99At = (config: QueueConfig, rho: number) => latencyQuantile({ ...config, arrivalRate: rho * config.servers * config.serviceRate }, 0.99);

/** "4×" or "1.2×". */
const times = (r: number) => `${r >= 10 ? fmt(r, 0) : fmt(r, 1)}×`;

function* run(input: QueueingInput): Generator<Frame<PlotState>> {
  const { requests, seed, ...config } = input;
  const rho = utilisation(config);
  const jobs = poissonJobs(config, requests, seed);
  const window = runQueue(config.servers, jobs);
  const end = Math.max(...window.map((s) => s.done)) * 1.03;
  const longRun = summarise(runQueue(config.servers, poissonJobs(config, LONG_RUN, seed + 1)));
  const formula = { mean: meanLatency(config), p50: latencyQuantile(config, 0.5), p99: latencyQuantile(config, 0.99) };
  const one = config.servers === 1;
  const vars = { λ: config.arrivalRate, μ: config.serviceRate, c: config.servers, ρ: round(rho, 3) };
  const yMaxLatency = Math.max(...window.map((s) => s.latency), formula.p99) * 1000 * 1.12;

  // Requests in the system over time, as a step path built up event by event.
  const counts: Vec[] = [[0, 0]];
  let inSystem = 0;
  let peak = 1;
  const record = (time: number, d: number) => {
    counts.push([round(time, 2), inSystem]);
    inSystem += d;
    peak = Math.max(peak, inSystem);
    counts.push([round(time, 2), inSystem]);
  };
  {
    // A dry run to find the most ever in the system, so the axis doesn't jump as it fills.
    let n = 0;
    const changes = window.flatMap((s) => [
      { t: s.arrival, d: 1 },
      { t: s.done, d: -1 },
    ]);
    changes.sort((a, b) => a.t - b.t || a.d - b.d);
    for (const c of changes) peak = Math.max(peak, (n += c.d));
  }

  const linePart = (state: QueueState): PlotPart => {
    const tokens: Token[] = state.busy.map((s, i) =>
      s ? { id: `server${i}`, text: `server ${i + 1}: ${no(s.job.id)}`, sub: `done at ${at(s.done)}`, mark: 'key' } : { id: `server${i}`, text: `server ${i + 1}: idle`, sub: 'free' },
    );
    for (const j of state.waiting) tokens.push({ id: `job${j.id}`, text: no(j.id), sub: `since ${at(j.arrival)}`, mark: 'frontier' });
    return { kind: 'tokens', id: 'line', label: state.waiting.length ? `Servers, then the line (${state.waiting.length} waiting)` : 'Servers, then the line (empty)', tokens };
  };

  const timeline = (now: number): PlanePart => ({
    kind: 'plane',
    id: 'timeline',
    label: 'Requests in the system over time',
    x: { min: 0, max: round(end, 2), label: 'time (s)' },
    y: { min: 0, max: peak + 1, label: 'in the system' },
    equal: false,
    shapes: [
      { kind: 'path', id: 'count', points: [...counts, [round(now, 2), inSystem]], tone: 1, label: 'waiting + being served' },
      { kind: 'line', id: 'now', through: [round(now, 2), 0], dir: [0, 1], mark: 'found', dashed: true, label: 'now' },
    ],
    handles: [],
  });

  const latencyPlane = (done: readonly Served[], lines: boolean): PlanePart => {
    const bars: Bar[] = [];
    for (const s of done) {
      const x = s.id + 1;
      if (s.wait > 0) bars.push({ id: `w${s.id}`, x0: x - 0.35, x1: x + 0.35, y: round(s.wait * 1000, 0), mark: 'frontier' });
      bars.push({ id: `s${s.id}`, x0: x - 0.35, x1: x + 0.35, y0: round(s.wait * 1000, 0), y: round(s.latency * 1000, 0), mark: 'key' });
    }
    const shapes: Shape[] = [{ kind: 'bars', id: 'latency', bars }];
    if (lines) {
      shapes.push(
        { kind: 'line', id: 'p50', through: [0, round(formula.p50 * 1000, 0)], dir: [1, 0], tone: 1, dashed: true, label: 'p50' },
        { kind: 'line', id: 'p99', through: [0, round(formula.p99 * 1000, 0)], dir: [1, 0], tone: 2, dashed: true, label: 'p99' },
      );
    }
    return {
      kind: 'plane',
      id: 'latency',
      label: 'Each request’s latency: wait, then service (ms)',
      x: { min: 0.3, max: requests + 0.7, label: 'request' },
      y: { min: 0, max: round(yMaxLatency, 0), label: 'ms' },
      equal: false,
      shapes,
      handles: [],
    };
  };

  const readouts = (done: readonly Served[], long: boolean): PlotPart => {
    const s = summarise(done);
    const items = long
      ? [
          { id: 'rho', label: 'load ρ = λ / cμ', value: pct(rho) },
          { id: 'served', label: 'requests', value: LONG_RUN.toLocaleString('en-GB') },
          { id: 'mean', label: 'mean latency', value: ms(longRun.mean) },
          { id: 'p50', label: 'p50', value: ms(longRun.p50), tone: 1 as const },
          { id: 'p99', label: 'p99', value: ms(longRun.p99), tone: 2 as const },
          { id: 'formula', label: one ? 'formula 1/(μ − λ)' : 'formula (Erlang C)', value: ms(formula.mean) },
        ]
      : [
          { id: 'rho', label: 'load ρ = λ / cμ', value: pct(rho) },
          { id: 'served', label: 'served', value: `${done.length} of ${requests}` },
          { id: 'waited', label: 'had to wait', value: String(s.waited) },
          { id: 'mean', label: 'mean latency so far', value: done.length ? ms(s.mean) : '–' },
          { id: 'formula', label: one ? 'long-run mean 1/(μ − λ)' : 'long-run mean (Erlang C)', value: ms(formula.mean) },
        ];
    return { kind: 'readouts', id: 'readouts', label: long ? `After ${LONG_RUN.toLocaleString('en-GB')} requests` : 'So far', items };
  };

  const curvePlane = (): PlanePart => {
    const top = Math.max(0.95, Math.min(MAX_LOAD, target(rho)));
    const yMax = p99At(config, top) * 1000 * 1.1;
    const grid = Array.from({ length: 48 }, (_, k) => 0.02 + ((top - 0.02) * k) / 47);
    const curve = (q: number): Vec[] => grid.map((r) => [round(r, 3), round(latencyQuantile({ ...config, arrivalRate: r * config.servers * config.serviceRate }, q) * 1000, 0)]);
    return {
      kind: 'plane',
      id: 'curve',
      label: 'Latency as the load rises (same servers)',
      x: { min: 0, max: 1, label: 'load ρ' },
      y: { min: 0, max: round(yMax, 0), label: 'latency (ms)' },
      equal: false,
      shapes: [
        { kind: 'path', id: 'p50curve', points: curve(0.5), tone: 1, label: 'p50' },
        { kind: 'path', id: 'p99curve', points: curve(0.99), tone: 2, label: 'p99' },
        { kind: 'line', id: 'here', through: [round(rho, 3), 0], dir: [0, 1], mark: 'found', dashed: true, label: `ρ = ${pct(rho)}` },
        { kind: 'point', id: 'herep50', at: [round(rho, 3), round(formula.p50 * 1000, 0)], tone: 1, size: 'md' },
        { kind: 'point', id: 'herep99', at: [round(rho, 3), round(formula.p99 * 1000, 0)], tone: 2, size: 'md' },
      ],
      handles: [],
    };
  };

  let state = createQueue(config.servers, jobs);
  let served = 0;
  let waited = 0;
  const finished: Served[] = [];

  /** "Does the next request wait?", asked before some arrivals: every server busy means yes. */
  const waitQuestion = (s: QueueState): Checkpoint | undefined => {
    const next = step(s);
    if (!next || next.event.kind !== 'arrive' || next.event.job.id % 3 !== 2) return undefined;
    return askInOrder(`Request ${no(next.event.job.id)} arrives next. Does it have to wait in line?`, ['Yes, every server is busy', 'No, a server is free'], next.event.server === null ? 'Yes, every server is busy' : 'No, a server is free');
  };

  yield plotFrame([linePart(state), timeline(0), latencyPlane([], false), readouts([], false)], {
    line: null,
    note: `Requests arrive at random, λ = ${config.arrivalRate} a second; ${one ? 'one server' : `each of ${config.servers} servers`} finishes μ = ${config.serviceRate} a second (${ms(1 / config.serviceRate)} each on average), so the servers are busy ρ = ${pct(rho)} of the time. Watch ${requests} requests.`,
    vars,
    stats: { served: 0, waited: 0 },
    checkpoint: waitQuestion(state),
  });

  for (let r = step(state); r; r = step(state)) {
    const event: QueueEvent = r.event;
    state = r.state;
    let note: string;
    let line: number;
    if (event.kind === 'arrive') {
      record(event.time, 1);
      if (event.server === null) {
        waited++;
        line = 2;
        note = `Request ${no(event.job.id)} arrives at ${at(event.time)} but every server is busy, so it joins the line: ${state.waiting.length} waiting now.`;
      } else {
        line = 1;
        note = `Request ${no(event.job.id)} arrives at ${at(event.time)} and server ${event.server + 1} is free, so it starts straight away: no wait.`;
      }
    } else {
      served++;
      finished.push(event.served);
      record(event.time, -1);
      const s = event.served;
      const after = event.next
        ? ` Request ${no(event.next.id)} leaves the line for server ${s.server + 1}.`
        : state.pending.length
          ? ` Server ${s.server + 1} is idle until someone arrives.`
          : '';
      line = event.next ? 6 : 4;
      note = `Request ${no(s.id)} finishes at ${at(event.time)}: it waited ${ms(s.wait)} and was served for ${ms(s.work)}, so its latency is ${ms(s.latency)}.${after}`;
    }
    yield plotFrame([linePart(state), timeline(event.time), latencyPlane(finished, false), readouts(finished, false)], {
      line,
      note,
      vars: { ...vars, 'in line': state.waiting.length, 'time (s)': round(event.time, 2) },
      stats: { served, waited },
      checkpoint: waitQuestion(state),
    });
  }

  const goal = target(rho);
  const ratio = p99At(config, goal) / formula.p99;
  const naive = goal / rho;
  // Choices in numeric order, so "10×" doesn't sort before "4×".
  const options = [...new Set([ratio, naive, ratio / 2.5, ratio * 2.5].sort((a, b) => a - b).map(times))];
  const loadQuestion = askInOrder(`At ${pct(rho)} load, p99 is about ${ms(formula.p99)}. If more traffic pushed the load to ${pct(goal)} (same servers), p99 would be about how many times longer?`, options, times(ratio));
  const windowSummary = summarise(finished);
  yield plotFrame([linePart(state), timeline(end / 1.03), latencyPlane(finished, true), readouts(finished, true)], {
    line: 7,
    note: `${requests} requests are too few to judge by, so here are ${LONG_RUN.toLocaleString('en-GB')}: the median request takes ${ms(longRun.p50)} but 1 in 100 takes ${ms(longRun.p99)} or more, ${fmt(longRun.p99 / longRun.mean, 1)} times the mean of ${ms(longRun.mean)}${one ? `, which matches 1/(μ − λ) = ${ms(formula.mean)}` : `, which matches the Erlang C formula's ${ms(formula.mean)}`}. (The ${requests} you watched averaged ${ms(windowSummary.mean)}.)`,
    vars: { ...vars, p50: round(longRun.p50, 3), p99: round(longRun.p99, 3), mean: round(longRun.mean, 3) },
    stats: { served, waited },
    checkpoint: loadQuestion,
  });

  yield plotFrame([curvePlane(), latencyPlane(finished, true), readouts(finished, true)], {
    line: 7,
    note: `Latency against load, for these servers: flat at first, then a cliff. Going from ${pct(rho)} to ${pct(goal)} multiplies p99 by about ${times(ratio)}, not by ${times(naive)} as the extra traffic alone suggests, because waiting grows like 1/(1 − ρ)${one ? '' : ' (more servers push the cliff further right, but it is still there)'}.`,
    vars: { ...vars, 'p99 now': round(formula.p99, 3), [`p99 at ${pct(goal)}`]: round(p99At(config, goal), 3) },
    stats: { served, waited },
  });
}

const EXAMPLES = {
  busy: { label: 'Busy server (80%)', config: { arrivalRate: 8, serviceRate: 10, servers: 1 } },
  light: { label: 'Light load (50%)', config: { arrivalRate: 5, serviceRate: 10, servers: 1 } },
  full: { label: 'Nearly full (95%)', config: { arrivalRate: 9.5, serviceRate: 10, servers: 1 } },
  pair: { label: 'Two servers, one line (80%)', config: { arrivalRate: 16, serviceRate: 10, servers: 2 } },
} as const;

const clampRequests = (n: number) => Math.min(MAX_REQUESTS, Math.max(MIN_REQUESTS, Math.round(n)));
const example = (id: keyof typeof EXAMPLES) => ({
  id,
  label: EXAMPLES[id].label,
  make: ({ seed, size }: { seed: number; size: number }): QueueingInput => ({ ...EXAMPLES[id].config, requests: clampRequests(size), seed }),
});

export function parseQueueing(text: string): { value: QueueingInput } | { error: string } {
  const xs = numbersIn(text);
  if (xs.length < 3 || xs.length > 5) return { error: 'Give λ, μ and the number of servers c, then optionally how many requests to watch and a seed, e.g. λ = 8, μ = 10, c = 1.' };
  const [arrivalRate, serviceRate, servers, requests = 16, seed = 1] = xs;
  if (!(arrivalRate > 0 && arrivalRate <= 100)) return { error: 'λ (arrivals a second) must be above 0 and at most 100.' };
  if (!(serviceRate > 0 && serviceRate <= 100)) return { error: 'μ (requests a server finishes a second) must be above 0 and at most 100.' };
  if (!Number.isInteger(servers) || servers < 1 || servers > MAX_SERVERS) return { error: `c (servers) must be a whole number from 1 to ${MAX_SERVERS}.` };
  const rho = arrivalRate / (servers * serviceRate);
  if (rho > MAX_LOAD + 1e-9) {
    return { error: `That is a load of ${pct(rho)}. At 100% or more the line grows forever; keep λ under ${fmt(MAX_LOAD * servers * serviceRate, 2)} for ${servers} server${servers === 1 ? '' : 's'}.` };
  }
  if (!Number.isInteger(requests) || requests < MIN_REQUESTS || requests > MAX_REQUESTS) return { error: `Watch between ${MIN_REQUESTS} and ${MAX_REQUESTS} requests.` };
  if (!Number.isInteger(seed) || seed < 0) return { error: 'The seed must be a whole number, 0 or more.' };
  return { value: { arrivalRate, serviceRate, servers, requests, seed } };
}

export const formatQueueing = ({ arrivalRate, serviceRate, servers, requests, seed }: QueueingInput) =>
  `λ = ${plain(arrivalRate)}, μ = ${plain(serviceRate)}, c = ${servers}, requests = ${requests}, seed = ${seed}`;

export const queueing = defineAlgorithm<QueueingInput, PlotState>({
  kind: 'algorithm',
  slug: 'queueing',
  view: 'plot',
  input: {
    examples: [example('busy'), example('light'), example('full'), example('pair')],
    size: { label: 'Requests to watch', min: MIN_REQUESTS, max: MAX_REQUESTS, default: 16 },
    custom: {
      label: `Arrival rate λ and service rate μ (per second), servers c (1–${MAX_SERVERS}), then optionally requests to watch and a seed`,
      placeholder: 'e.g. λ = 8, μ = 10, c = 1',
      parse: parseQueueing,
      format: formatQueueing,
    },
  },
  pseudocode,
  stats: [
    { key: 'served', label: 'Requests served' },
    { key: 'waited', label: 'Had to wait' },
  ],
  legend: [
    { neutral: 'Requests in the system, and idle servers' },
    { mark: 'key', label: 'Being served (service time)' },
    { mark: 'frontier', label: 'Waiting in line (wait time)' },
    { tone: 1, label: 'p50: half the requests are faster' },
    { tone: 2, label: 'p99: 1 in 100 is slower' },
    { mark: 'found', label: 'Now, and the current load' },
  ],
  run,
  content: {
    idea: 'Requests arrive at random and wait in line whenever every server is busy. Because arrivals bunch up, a line forms long before the servers are full, and the wait grows like 1/(1 − ρ): a server 90% busy keeps requests waiting nine times as long as it serves them. The slowest requests, the tail, suffer most.',
    invariant: 'First come, first served: a request starts as soon as a server is free and everyone before it has started, and no server sits idle while someone waits. Over any run, Little’s law holds: the average number in the system equals the arrival rate times the average latency (L = λW).',
    whenToUse: 'Sizing anything that serves requests: how many app servers or database connections you need, why a service at 90% CPU feels slow, why one shared line beats a line per server, and why latency targets are set on p99, not the average. It is the first tool of capacity planning, and of system design.',
    traits: [
      { label: 'Latency explodes as ρ → 1', good: false },
      { label: 'Tails grow faster than averages', good: false },
      { label: 'One shared line beats separate lines', good: true },
      { label: 'Exact formulas for random (Poisson) traffic', good: null },
    ],
    experiments: [
      { example: 'light', prompt: 'At 50% load most requests never wait. Count how many had to.' },
      { example: 'busy', prompt: 'At 80% the line comes and goes in bursts. Predict which arrivals will wait before you step.' },
      { example: 'full', prompt: 'At 95% the mean is 2 s although each request needs only 100 ms of work. Compare p99 with the mean.' },
      { example: 'pair', prompt: 'Two servers sharing a line at the same 80% load: compare p99 with the single busy server.' },
    ],
  },
});

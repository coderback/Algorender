import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame } from '@/engine/types';
import { maxAccepted, runBucket, type BucketConfig, type Decision } from '@/systems/token-bucket';
import { askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export const PATTERNS = ['steady', 'bursty', 'spike', 'overload'] as const;
export type Pattern = (typeof PATTERNS)[number];

export type TokenBucketInput = BucketConfig & { pattern: Pattern; seed: number };

export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 10;
export const MIN_RATE = 0.5;
export const MAX_RATE = 4;
/** Seconds of traffic each pattern covers. */
export const WINDOW = 8;
export const MAX_REQUESTS = 30;
/** The most "accepted or rejected?" questions one run asks. */
const MAX_QUESTIONS = 8;

const PATTERN_LABEL: Record<Pattern, string> = {
  bursty: 'Bursts',
  steady: 'Steady, under the rate',
  spike: 'A sudden spike',
  overload: 'Steady, over the rate',
};

/** When each request arrives, in seconds: a pattern scaled to the refill rate, jittered by the seed. */
export function requestTimes({ capacity, refillRate: r, pattern, seed }: TokenBucketInput): number[] {
  const u = createRng(seed);
  const jitter = (interval: number) => (u() - 0.5) * 0.2 * interval;
  const every = (from: number, to: number, interval: number) => {
    const out: number[] = [];
    for (let t = from; t < to - 1e-9; t += interval) out.push(t + jitter(interval));
    return out;
  };
  let times: number[];
  switch (pattern) {
    case 'steady':
      times = every(0.3, WINDOW, 1 / (0.8 * r));
      break;
    case 'overload':
      times = every(0.3, WINDOW, 1 / (1.5 * r));
      break;
    case 'bursty': {
      // Three bursts, each a few requests more than the bucket holds, 50 ms apart.
      const size = Math.min(capacity + 3, 10);
      times = [0.5, 3.5, 6.5].flatMap((start) => Array.from({ length: size }, (_, k) => start + k * 0.05));
      break;
    }
    case 'spike':
      // Half the rate, then three times the rate for two seconds, then half again.
      times = [...every(0.2, 3, 1 / (0.5 * r)), ...every(3, 5, 1 / (3 * r)), ...every(5.2, WINDOW, 1 / (0.5 * r))];
      break;
  }
  return [...new Set(times.map((t) => round(Math.max(0, t), 2)))].sort((a, b) => a - b).slice(0, MAX_REQUESTS);
}

const pseudocode = [
  'on a request at time t:',
  '  tokens ← min(capacity,',
  '    tokens + rate × (t − last))',
  '  last ← t',
  '  if tokens ≥ 1:',
  '    tokens ← tokens − 1; accept',
  '  else: reject',
];

const at = (t: number) => `${fmt(t, 2)} s`;
const tokensText = (x: number) => `${fmt(x, 2)} token${Math.abs(x - 1) < 0.005 ? '' : 's'}`;

function* run(input: TokenBucketInput): Generator<Frame<PlotState>> {
  const { capacity, refillRate: rate } = input;
  const times = requestTimes(input);
  const { decisions } = runBucket(input, times);
  const end = Math.max(WINDOW, (times.at(-1) ?? 0) + 0.5);
  const vars = { capacity, rate };

  // Which requests to ask about: close calls (less than two tokens to hand), spread out.
  const close = decisions.map((d, i) => (d.before < 2 ? i : -1)).filter((i) => i >= 0);
  const stride = Math.max(1, Math.ceil(close.length / MAX_QUESTIONS));
  const asked = new Set(close.filter((_, k) => k % stride === 0));

  /** The tokens over time, up to and including request `upTo` (or to the end of the window). */
  const tokenPath = (upTo: number, toEnd: boolean): Vec[] => {
    const points: Vec[] = [[0, capacity]];
    let t = 0;
    let level = capacity;
    const refillTo = (time: number) => {
      const full = t + (capacity - level) / rate;
      if (level < capacity && full < time) points.push([round(full, 2), capacity]);
      level = Math.min(capacity, level + (time - t) * rate);
      t = time;
      points.push([round(time, 2), round(level, 2)]);
    };
    for (let i = 0; i <= upTo && i < decisions.length; i++) {
      const d = decisions[i];
      refillTo(d.time);
      level = d.after;
      points.push([round(d.time, 2), round(level, 2)]);
    }
    if (toEnd) refillTo(end);
    return points;
  };

  const bucketPlane = (upTo: number, toEnd: boolean): PlanePart => ({
    kind: 'plane',
    id: 'bucket',
    label: 'Tokens in the bucket',
    x: { min: 0, max: round(end, 2), label: 'time (s)' },
    y: { min: 0, max: capacity + 0.6, label: 'tokens' },
    equal: false,
    shapes: [
      { kind: 'line', id: 'one', through: [0, 1], dir: [1, 0], dashed: true, label: '1 token' },
      { kind: 'path', id: 'tokens', points: tokenPath(upTo, toEnd), label: 'tokens' },
      ...decisions.slice(0, upTo + 1).map(
        (d, i): Shape => ({ kind: 'point', id: `r${i}`, at: [round(d.time, 2), round(d.before, 2)], mark: d.accepted ? 'found' : 'reject', size: 'sm', label: d.accepted ? '✓' : '✗' }),
      ),
    ],
    handles: [],
  });

  const countPlane = (upTo: number): PlanePart => {
    const offered: Vec[] = [[0, 0]];
    const through: Vec[] = [[0, 0]];
    let n = 0;
    let ok = 0;
    for (const d of decisions.slice(0, upTo + 1)) {
      offered.push([round(d.time, 2), n], [round(d.time, 2), ++n]);
      if (d.accepted) through.push([round(d.time, 2), ok], [round(d.time, 2), ++ok]);
    }
    return {
      kind: 'plane',
      id: 'count',
      label: 'Requests so far: sent and let through',
      x: { min: 0, max: round(end, 2), label: 'time (s)' },
      y: { min: 0, max: Math.max(decisions.length, maxAccepted(input, end)) + 1, label: 'requests' },
      equal: false,
      shapes: [
        { kind: 'path', id: 'offered', points: offered, dashed: true, label: 'sent' },
        { kind: 'path', id: 'through', points: through, tone: 1, label: 'let through' },
        { kind: 'line', id: 'bound', through: [0, capacity], dir: [1, rate], mark: 'key', dashed: true, label: 'capacity + rate × t' },
      ],
      handles: [],
    };
  };

  const readouts = (done: readonly Decision[]): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'The limiter',
    items: [
      { id: 'tokens', label: 'tokens now', value: fmt(done.at(-1)?.after ?? capacity, 2) },
      { id: 'accepted', label: 'accepted', value: String(done.filter((d) => d.accepted).length), mark: 'found' },
      { id: 'rejected', label: 'rejected', value: String(done.filter((d) => !d.accepted).length), mark: 'reject' },
      { id: 'burst', label: 'burst (capacity)', value: String(capacity) },
      { id: 'rate', label: 'sustained rate', value: `${fmt(rate, 2)} a second` },
    ],
  });

  const question = (i: number): Checkpoint | undefined =>
    asked.has(i) ? askInOrder(`The next request comes at ${at(decisions[i].time)}. Accepted or rejected?`, ['Accepted', 'Rejected'], decisions[i].accepted ? 'Accepted' : 'Rejected') : undefined;

  yield plotFrame([bucketPlane(-1, false), countPlane(-1), readouts([])], {
    line: null,
    note: `The bucket starts full with ${capacity} token${capacity === 1 ? '' : 's'} and refills at ${fmt(rate, 2)} a second, never past ${capacity}. Each request needs a token: ${times.length} requests are about to arrive, ${PATTERN_LABEL[input.pattern].toLowerCase()}.`,
    vars,
    stats: { accepted: 0, rejected: 0 },
    checkpoint: question(0),
  });

  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (d.accepted) accepted++;
    else rejected++;
    const gap = i === 0 ? d.time : d.time - decisions[i - 1].time;
    const refilled = d.before - (i === 0 ? capacity : decisions[i - 1].after);
    const how = refilled > 0.005 ? `after ${fmt(gap, 2)} s of refill the bucket holds ${tokensText(d.before)}` : `the bucket holds ${tokensText(d.before)}`;
    yield plotFrame([bucketPlane(i, false), countPlane(i), readouts(decisions.slice(0, i + 1))], {
      line: d.accepted ? 5 : 6,
      note: d.accepted
        ? `At ${at(d.time)} ${how}, so the request takes one and gets through, leaving ${tokensText(d.after)}.`
        : `At ${at(d.time)} ${how}, less than one, so the request is turned away; the bucket keeps refilling.`,
      vars: { ...vars, tokens: round(d.after, 2), 't (s)': d.time },
      stats: { accepted, rejected },
      checkpoint: question(i + 1),
    });
  }

  const bound = maxAccepted(input, end);
  yield plotFrame([bucketPlane(decisions.length - 1, true), countPlane(decisions.length - 1), readouts(decisions)], {
    line: null,
    note: `${accepted} of ${decisions.length} requests got through and ${rejected} were turned away. Bursts of up to ${capacity} pass at once, but over time no more than ${fmt(rate, 2)} a second do: in ${fmt(end, 1)} s the bucket could never let through more than ${capacity} + ${fmt(rate, 2)} × ${fmt(end, 1)} = ${bound}, the dashed line.`,
    vars: { ...vars, accepted, rejected },
    stats: { accepted, rejected },
  });
}

export function parseTokenBucket(text: string): { value: TokenBucketInput } | { error: string } {
  const pattern = PATTERNS.find((p) => new RegExp(`\\b${p}\\b`, 'i').test(text));
  if (!pattern) return { error: `Name a traffic pattern: ${PATTERNS.join(', ')}.` };
  const xs = numbersIn(text);
  if (xs.length < 2 || xs.length > 3) return { error: 'Give the capacity and the refill rate, then optionally a seed, e.g. capacity = 4, rate = 2, pattern = bursty.' };
  const [capacity, refillRate, seed = 1] = xs;
  if (!Number.isInteger(capacity) || capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) return { error: `The capacity must be a whole number of tokens from ${MIN_CAPACITY} to ${MAX_CAPACITY}.` };
  if (!(refillRate >= MIN_RATE && refillRate <= MAX_RATE)) return { error: `The refill rate must be from ${MIN_RATE} to ${MAX_RATE} tokens a second.` };
  if (!Number.isInteger(seed) || seed < 0) return { error: 'The seed must be a whole number, 0 or more.' };
  return { value: { capacity, refillRate, pattern, seed } };
}

export const formatTokenBucket = ({ capacity, refillRate, pattern, seed }: TokenBucketInput) => `capacity = ${capacity}, rate = ${plain(refillRate)}, pattern = ${pattern}, seed = ${seed}`;

const clampCapacity = (n: number) => Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, Math.round(n)));
const example = (pattern: Pattern) => ({
  id: pattern,
  label: PATTERN_LABEL[pattern],
  make: ({ seed, size }: { seed: number; size: number }): TokenBucketInput => ({ capacity: clampCapacity(size), refillRate: 2, pattern, seed }),
});

export const tokenBucket = defineAlgorithm<TokenBucketInput, PlotState>({
  kind: 'algorithm',
  slug: 'token-bucket',
  view: 'plot',
  input: {
    examples: [example('bursty'), example('steady'), example('spike'), example('overload')],
    size: { label: 'Bucket capacity (tokens)', min: MIN_CAPACITY, max: MAX_CAPACITY, default: 4 },
    custom: {
      label: `Capacity (${MIN_CAPACITY}–${MAX_CAPACITY} tokens), refill rate (${MIN_RATE}–${MAX_RATE} a second), a pattern (${PATTERNS.join(', ')}) and an optional seed`,
      placeholder: 'e.g. capacity = 4, rate = 2, pattern = bursty',
      parse: parseTokenBucket,
      format: formatTokenBucket,
    },
  },
  pseudocode,
  stats: [
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Rejected' },
  ],
  legend: [
    { neutral: 'Tokens in the bucket, and requests sent' },
    { mark: 'found', label: 'Accepted request (✓)' },
    { mark: 'reject', label: 'Rejected request (✗)' },
    { tone: 1, label: 'Requests let through' },
    { mark: 'key', label: 'The most it can ever let through' },
  ],
  run,
  content: {
    idea: 'A token bucket protects a service from more traffic than it can take. It holds up to a fixed number of tokens and refills at a steady rate; each request spends a token, and a request that finds the bucket empty is turned away. Short bursts get through at once, but the long-run rate is capped.',
    invariant: 'The bucket never holds fewer than 0 or more than its capacity in tokens, so in any stretch of t seconds it lets through at most capacity + rate × t requests, whatever the traffic looks like.',
    whenToUse: 'Rate limiting an API per user or per key, protecting a database or a queue from overload, smoothing traffic into a service whose capacity you know from queueing (keep its load well under 100%), and network traffic shaping. Pick the rate for the sustained load you can serve and the capacity for the bursts you are willing to absorb.',
    traits: [
      { label: 'Allows bursts up to capacity', good: true },
      { label: 'Caps the long-run rate', good: true },
      { label: 'Constant memory: two numbers', good: true },
      { label: 'Rejects rather than queues', good: null },
    ],
    experiments: [
      { example: 'bursty', prompt: 'Each burst is a few requests bigger than the bucket. Predict how many of each burst get through.' },
      { example: 'steady', prompt: 'Traffic below the refill rate never empties the bucket: nothing is rejected.' },
      { example: 'spike', prompt: 'The bucket absorbs the start of the spike, then lets through only the refill rate.' },
      { example: 'overload', prompt: 'Above the rate, the let-through line runs parallel to the dashed bound: the limiter holds the service at exactly its rate.' },
    ],
  },
});

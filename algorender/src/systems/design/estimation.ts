// Back-of-the-envelope estimation drills (phase 6d): seeded questions such as
// "50 million daily users view 20 photos each: how many requests a second?",
// each with its facts, the answer, and the worked steps. Answers are judged on
// a log scale, because the skill is getting the power of ten right, not the
// third digit. Pure and deterministic per seed, like the other models here.

import { createRng } from '@/engine/random';

export type DrillKind = 'qps' | 'peak' | 'storage' | 'bandwidth' | 'servers' | 'cache' | 'latency';

/** What an answer measures: plain counts (requests a second, servers), bytes, or bytes a second. */
export type UnitKind = 'count' | 'bytes' | 'bytes/s';

export type Fact = { id: string; label: string; value: number; unit: UnitKind; text: string };

/** One line of working: what is computed, the arithmetic in words, and its result. */
export type Step = { label: string; working: string; value: number };

export type Drill = {
  /** Stable for a kind and seed, e.g. "qps-3". */
  id: string;
  kind: DrillKind;
  title: string;
  question: string;
  facts: readonly Fact[];
  answer: number;
  unit: UnitKind;
  /** What the number counts, e.g. "requests a second". */
  unitLabel: string;
  steps: readonly Step[];
  /** The rule of thumb this drill practises. */
  tip: string;
};

export const DRILL_KINDS: readonly DrillKind[] = ['qps', 'peak', 'storage', 'bandwidth', 'servers', 'cache', 'latency'];

export const KIND_TITLES: Record<DrillKind, string> = {
  qps: 'Requests a second',
  peak: 'Peak traffic',
  storage: 'Storage a year',
  bandwidth: 'Bandwidth',
  servers: 'How many servers',
  cache: 'Cache memory',
  latency: 'Latency budget',
};

/** Seconds in a day: 86,400, which estimates round to 10^5. */
export const SECONDS_PER_DAY = 86_400;

// ── Formatting ──────────────────────────────────────────────────────────────

const PREFIXES: readonly [number, string][] = [
  [1e15, 'P'],
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
];

/** At most three significant figures, without trailing zeros: 1234 → "1,230", 2.5 → "2.5". */
function sig(n: number): string {
  if (n === 0) return '0';
  const rounded = Number(n.toPrecision(3));
  const [int, frac] = (Math.abs(rounded) >= 1e-6 ? String(rounded) : rounded.toFixed(9).replace(/0+$/, '')).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

/** A count with a word for big numbers: 1,200 → "1,200", 3,500,000 → "3.5 million". */
export function formatCount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${sig(n / 1e12)} trillion`;
  if (a >= 1e9) return `${sig(n / 1e9)} billion`;
  if (a >= 1e6) return `${sig(n / 1e6)} million`;
  return sig(n);
}

/** Bytes with a decimal prefix: 40e9 → "40 GB". */
export function formatBytes(n: number, perSecond = false): string {
  const suffix = perSecond ? 'B/s' : 'B';
  for (const [size, p] of PREFIXES) if (Math.abs(n) >= size) return `${sig(n / size)} ${p}${suffix}`;
  return `${sig(n)} ${suffix}`;
}

export function formatQuantity(n: number, unit: UnitKind): string {
  return unit === 'count' ? formatCount(n) : formatBytes(n, unit === 'bytes/s');
}

/** The power of ten nearest a number, as "10^5". */
export function powerOfTen(n: number): string {
  return `10^${Math.round(Math.log10(n))}`;
}

// ── Parsing what the learner types ──────────────────────────────────────────

const WORDS: readonly [RegExp, number][] = [
  [/^(thousand)\b/i, 1e3],
  [/^(million|mn)\b/i, 1e6],
  [/^(billion|bn)\b/i, 1e9],
  [/^(trillion)\b/i, 1e12],
];
const LETTERS: Record<string, number> = { k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15 };

/**
 * Reads an estimate: "300k", "3e5", "3 × 10^5", "10^5", "2.5M", "1.2 billion",
 * "40 GB", "40GB/s", "8 Gbps" (bits, divided by 8 for byte answers). Unit words
 * after the number ("requests/s", "servers", "QPS") are ignored. For a count,
 * a bare "B" means billion; for bytes it means bytes.
 */
export function parseEstimate(text: string, unit: UnitKind = 'count'): { value: number } | { error: string } {
  const error = { error: 'Type a number, such as 300k, 3e5, 2.5 million or 40 GB.' };
  let s = text
    .trim()
    .replace(/^(?:~|≈|about\s+|around\s+|roughly\s+)\s*/i, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/_/g, '');
  let value: number;
  const power = /^10\s*(?:\^|\*\*)\s*([+-]?\d+)/.exec(s);
  if (power) {
    value = 10 ** Number(power[1]);
    s = s.slice(power[0].length);
  } else {
    const num = /^(\d+(?:\.\d*)?|\.\d+)/.exec(s);
    if (!num) return error;
    value = Number(num[1]);
    s = s.slice(num[0].length);
    const exp = /^\s*(?:e\s*([+-]?\d+)|(?:x|×|\*)\s*10\s*(?:\^|\*\*)\s*([+-]?\d+))/i.exec(s);
    if (exp) {
      value *= 10 ** Number(exp[1] ?? exp[2]);
      s = s.slice(exp[0].length);
    }
  }
  s = s.trim();
  const word = WORDS.find(([re]) => re.test(s));
  if (word) {
    value *= word[1];
    s = s.replace(word[0], '').trim();
  } else if (unit === 'count' && /^B\b/.test(s)) {
    value *= 1e9;
    s = s.slice(1).trim();
  } else if (/^[kKmMgGtTpP](?![a-hj-zA-HJ-Z])/.test(s) || /^[kKmMgGtTpP]i?[bB]/.test(s)) {
    const binary = /^[kKmMgGtTpP]i/.test(s);
    const exponent = Math.round(Math.log10(LETTERS[s[0].toLowerCase()]) / 3);
    value *= binary ? 1024 ** exponent : LETTERS[s[0].toLowerCase()];
    s = s.slice(binary ? 2 : 1).trim();
  }
  // A lower-case b (bits) on a byte answer: 8 bits to a byte.
  if (unit !== 'count' && /^(b\b|bits?\b|bps\b|b\/s)/.test(s)) value /= 8;
  if (!Number.isFinite(value) || value <= 0) return error;
  return { value };
}

// ── Judging ─────────────────────────────────────────────────────────────────

/** Within ×2 of the truth: spot on. Within ×10: the right order of magnitude. Further: off. */
export const SPOT_ON = 2;
export const CLOSE = 10;

export type Verdict = 'spot-on' | 'close' | 'off';

/**
 * Judges an estimate on a log scale. `factor` is how many times too high or
 * too low it is (1 when exact); `direction` says which.
 */
export function judge(answer: number, truth: number): { verdict: Verdict; factor: number; direction: 'high' | 'low' | 'exact' } {
  if (!(answer > 0) || !Number.isFinite(answer) || !(truth > 0)) return { verdict: 'off', factor: Infinity, direction: 'low' };
  const factor = Math.max(answer / truth, truth / answer);
  const direction = answer === truth ? 'exact' : answer > truth ? 'high' : 'low';
  // A hair of tolerance so that exactly ×2 or ×10 counts, despite floating point.
  const verdict: Verdict = factor <= SPOT_ON * (1 + 1e-9) ? 'spot-on' : factor <= CLOSE * (1 + 1e-9) ? 'close' : 'off';
  return { verdict, factor, direction };
}

// ── The numbers every engineer should know ──────────────────────────────────

export type LatencyNumber = { operation: string; ns: number; time: string; note?: string };

/**
 * Approximate latencies, after Jeff Dean's "Numbers everyone should know"
 * (talks from 2009–2012) and Peter Norvig's "Teach Yourself Programming in Ten
 * Years". Hardware has moved since (SSDs and networks are faster, disks are
 * not), but the gaps between the rows, powers of ten apart, still hold.
 */
export const LATENCY_NUMBERS: readonly LatencyNumber[] = [
  { operation: 'L1 cache reference', ns: 0.5, time: '0.5 ns' },
  { operation: 'Branch mispredict', ns: 5, time: '5 ns' },
  { operation: 'L2 cache reference', ns: 7, time: '7 ns' },
  { operation: 'Mutex lock and unlock', ns: 25, time: '25 ns' },
  { operation: 'Main memory (RAM) reference', ns: 100, time: '100 ns' },
  { operation: 'Compress 1 KB (Snappy)', ns: 3_000, time: '3 µs' },
  { operation: 'Send 1 KB over a 1 Gbps network', ns: 10_000, time: '10 µs' },
  { operation: 'Random 4 KB read from an SSD', ns: 100_000, time: '~100 µs', note: '150 µs in the original list; current NVMe drives take tens of µs' },
  { operation: 'Read 1 MB sequentially from memory', ns: 250_000, time: '250 µs' },
  { operation: 'Round trip within a data centre', ns: 500_000, time: '0.5 ms' },
  { operation: 'Read 1 MB sequentially from an SSD', ns: 1_000_000, time: '1 ms' },
  { operation: 'Disk seek', ns: 10_000_000, time: '10 ms' },
  { operation: 'Read 1 MB sequentially from disk', ns: 20_000_000, time: '20 ms' },
  { operation: 'Round trip California → Netherlands → California', ns: 150_000_000, time: '150 ms' },
];

export const LATENCY_SOURCE =
  'Approximate figures after Jeff Dean’s “Numbers everyone should know” (2009–2012) and Peter Norvig’s “Teach Yourself Programming in Ten Years”. Exact values depend on the hardware and have changed since; the powers of ten between the rows are what to remember.';

// ── The generators ──────────────────────────────────────────────────────────

type Rng = () => number;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

const fact = (id: string, label: string, value: number, unit: UnitKind, text?: string): Fact => ({ id, label, value, unit, text: text ?? formatQuantity(value, unit) });
const step = (label: string, working: string, value: number): Step => ({ label, working, value });

const APPS = [
  { name: 'A photo-sharing app', verb: 'view', thing: 'photos' },
  { name: 'A chat app', verb: 'send', thing: 'messages' },
  { name: 'A news site', verb: 'read', thing: 'articles' },
  { name: 'A music service', verb: 'play', thing: 'songs' },
  { name: 'A maps app', verb: 'request', thing: 'map tiles' },
] as const;

const DAU = [1e6, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6, 200e6, 500e6];
const PER_DAY = [2, 5, 10, 20, 50];
const PEAKS = [2, 3, 5, 10];
const KB = 1e3;
const MB = 1e6;

function qps(rng: Rng, seed: number): Drill {
  const app = pick(rng, APPS);
  const users = pick(rng, DAU);
  const per = pick(rng, PER_DAY);
  const perDay = users * per;
  const answer = perDay / SECONDS_PER_DAY;
  return {
    id: `qps-${seed}`,
    kind: 'qps',
    title: KIND_TITLES.qps,
    question: `${app.name} has ${formatCount(users)} daily users, who each ${app.verb} ${per} ${app.thing} a day. About how many requests a second does it serve, on average?`,
    facts: [fact('users', 'Daily users', users, 'count'), fact('per', `${app.thing[0].toUpperCase()}${app.thing.slice(1)} per user a day`, per, 'count')],
    answer,
    unit: 'count',
    unitLabel: 'requests a second',
    steps: [
      step('Requests a day', `${formatCount(users)} users × ${per} = ${formatCount(perDay)}`, perDay),
      step('Requests a second', `${formatCount(perDay)} ÷ 86,400 seconds (about 10^5) ≈ ${formatCount(answer)}`, answer),
    ],
    tip: 'A day has 86,400 seconds: call it 10^5. So 10^8 requests a day is about 1,000 a second.',
  };
}

function peak(rng: Rng, seed: number): Drill {
  const base = qps(rng, seed);
  const factor = pick(rng, PEAKS);
  const avg = base.answer;
  const answer = avg * factor;
  return {
    ...base,
    id: `peak-${seed}`,
    kind: 'peak',
    title: KIND_TITLES.peak,
    question: `${base.question.replace(/ About how many requests a second does it serve, on average\?$/, '')} Its busiest hour runs at ${factor} times the daily average. About how many requests a second must it handle at the peak?`,
    facts: [...base.facts, fact('factor', 'Peak ÷ average', factor, 'count', `${factor}×`)],
    answer,
    steps: [...base.steps, step('At the peak', `${formatCount(avg)} × ${factor} ≈ ${formatCount(answer)}`, answer)],
    tip: 'Provision for the peak, not the average: traffic follows the clock, and evenings or launches can run several times the daily mean.',
  };
}

const ITEM_SIZES = [
  { thing: 'photos', verb: 'upload', size: 200 * KB, label: '200 KB' },
  { thing: 'messages', verb: 'send', size: 1 * KB, label: '1 KB' },
  { thing: 'short videos', verb: 'upload', size: 5 * MB, label: '5 MB' },
  { thing: 'posts', verb: 'write', size: 10 * KB, label: '10 KB' },
] as const;

function storage(rng: Rng, seed: number): Drill {
  const item = pick(rng, ITEM_SIZES);
  const users = pick(rng, [1e6, 5e6, 10e6, 50e6, 100e6]);
  const per = pick(rng, [2, 5, 10]);
  const replicas = 3;
  const perDay = users * per * item.size;
  const perYear = perDay * 365;
  const answer = perYear * replicas;
  return {
    id: `storage-${seed}`,
    kind: 'storage',
    title: KIND_TITLES.storage,
    question: `${formatCount(users)} users each ${item.verb} ${per} ${item.thing} a day, ${item.label} each. Everything is kept, and stored ${replicas} times for safety. About how much storage does a year of them need?`,
    facts: [
      fact('users', 'Active users a day', users, 'count'),
      fact('per', `${item.thing[0].toUpperCase()}${item.thing.slice(1)} per user a day`, per, 'count'),
      fact('size', 'Size of each', item.size, 'bytes', item.label),
      fact('replicas', 'Copies kept', replicas, 'count'),
    ],
    answer,
    unit: 'bytes',
    unitLabel: 'of storage',
    steps: [
      step('A day of new data', `${formatCount(users)} × ${per} × ${item.label} = ${formatBytes(perDay)}`, perDay),
      step('A year', `${formatBytes(perDay)} × 365 ≈ ${formatBytes(perYear)}`, perYear),
      step(`${replicas} copies`, `${formatBytes(perYear)} × ${replicas} ≈ ${formatBytes(answer)}`, answer),
    ],
    tip: 'Round a year to 400 days if it helps (365 is close enough), and remember replication: three copies triple the bill.',
  };
}

function bandwidth(rng: Rng, seed: number): Drill {
  const rate = pick(rng, [500, 1_000, 2_000, 5_000, 10_000, 50_000]);
  const payload = pick(rng, [
    { size: 2 * KB, label: '2 KB', what: 'API responses' },
    { size: 50 * KB, label: '50 KB', what: 'web pages' },
    { size: 200 * KB, label: '200 KB', what: 'images' },
    { size: 1 * MB, label: '1 MB', what: 'audio chunks' },
  ]);
  const answer = rate * payload.size;
  return {
    id: `bandwidth-${seed}`,
    kind: 'bandwidth',
    title: KIND_TITLES.bandwidth,
    question: `A service sends ${formatCount(rate)} ${payload.what} a second, ${payload.label} each. About how much outgoing bandwidth does it need?`,
    facts: [fact('rate', 'Responses a second', rate, 'count'), fact('size', 'Size of each', payload.size, 'bytes', payload.label)],
    answer,
    unit: 'bytes/s',
    unitLabel: 'outgoing',
    steps: [step('Bytes a second', `${formatCount(rate)} × ${payload.label} = ${formatBytes(answer, true)} (× 8 ≈ ${formatCount(answer * 8)} bits a second)`, answer)],
    tip: 'Bandwidth is requests a second times bytes per request. Network links are sold in bits: multiply bytes by 8.',
  };
}

function servers(rng: Rng, seed: number): Drill {
  const peakRate = pick(rng, [5_000, 10_000, 20_000, 40_000, 100_000]);
  const capacity = pick(rng, [200, 500, 1_000, 2_000]);
  const target = pick(rng, [0.5, 0.6, 0.7]);
  const usable = capacity * target;
  const raw = peakRate / usable;
  const answer = Math.ceil(raw - 1e-9);
  return {
    id: `servers-${seed}`,
    kind: 'servers',
    title: KIND_TITLES.servers,
    question: `At its peak a service gets ${formatCount(peakRate)} requests a second. One server can handle ${formatCount(capacity)} a second flat out, but you want each to run at no more than ${Math.round(target * 100)}% of that so latency stays low. About how many servers do you need?`,
    facts: [
      fact('peak', 'Peak requests a second', peakRate, 'count'),
      fact('capacity', 'One server, flat out', capacity, 'count'),
      fact('target', 'Target load per server', target, 'count', `${Math.round(target * 100)}%`),
    ],
    answer,
    unit: 'count',
    unitLabel: 'servers',
    steps: [
      step('Usable capacity per server', `${formatCount(capacity)} × ${Math.round(target * 100)}% = ${formatCount(usable)} a second`, usable),
      step('Servers', `${formatCount(peakRate)} ÷ ${formatCount(usable)} ≈ ${formatCount(raw)}, so ${formatCount(answer)}`, answer),
    ],
    tip: 'Never plan a server at 100%: queueing makes latency explode near full load. Leave headroom (often 30–50%), then add one more for failures.',
  };
}

function cache(rng: Rng, seed: number): Drill {
  const items = pick(rng, [10e6, 50e6, 100e6, 500e6, 1e9]);
  const item = pick(rng, [
    { size: 500, label: '500 bytes', what: 'user profiles' },
    { size: 1 * KB, label: '1 KB', what: 'product records' },
    { size: 10 * KB, label: '10 KB', what: 'rendered pages' },
  ]);
  const hot = 0.2;
  const hotItems = items * hot;
  const answer = hotItems * item.size;
  return {
    id: `cache-${seed}`,
    kind: 'cache',
    title: KIND_TITLES.cache,
    question: `A database holds ${formatCount(items)} ${item.what}, ${item.label} each. As often happens, about 80% of reads go to the most popular 20%. How much memory does a cache need to hold that hot 20%?`,
    facts: [fact('items', 'Items stored', items, 'count'), fact('size', 'Size of each', item.size, 'bytes', item.label), fact('hot', 'Hot share', hot, 'count', '20%')],
    answer,
    unit: 'bytes',
    unitLabel: 'of memory',
    steps: [
      step('Hot items', `${formatCount(items)} × 20% = ${formatCount(hotItems)}`, hotItems),
      step('Memory', `${formatCount(hotItems)} × ${item.label} = ${formatBytes(answer)}`, answer),
    ],
    tip: 'Traffic is skewed: caching the hottest fifth often serves most reads. Size the cache for the hot set, not the whole dataset.',
  };
}

const OPS = [
  { what: 'disk seeks', ms: 10, row: 'Disk seek' },
  { what: 'round trips within the data centre', ms: 0.5, row: 'Round trip within a data centre' },
  { what: 'random SSD reads', ms: 0.1, row: 'Random 4 KB read from an SSD' },
  { what: 'round trips between California and the Netherlands', ms: 150, row: 'Round trip California → Netherlands → California' },
  { what: 'main-memory references', ms: 0.0001, row: 'Main memory (RAM) reference' },
] as const;

function latency(rng: Rng, seed: number): Drill {
  const op = pick(rng, OPS);
  const budget = op.ms >= 100 ? pick(rng, [500, 1000]) : pick(rng, [100, 200, 500]);
  const answer = budget / op.ms;
  const each = op.ms >= 1 ? `${op.ms} ms` : op.ms >= 0.001 ? `${sig(op.ms * 1000)} µs` : `${sig(op.ms * 1e6)} ns`;
  return {
    id: `latency-${seed}`,
    kind: 'latency',
    title: KIND_TITLES.latency,
    question: `A request must be answered within ${budget} ms. About how many ${op.what} could it make one after another in that time, if it did nothing else?`,
    facts: [fact('budget', 'Time budget', budget, 'count', `${budget} ms`), fact('each', `One of them (${op.row.toLowerCase()})`, op.ms, 'count', each)],
    answer,
    unit: 'count',
    unitLabel: op.what,
    steps: [step('How many fit', `${budget} ms ÷ ${each} = ${formatCount(answer)}`, answer)],
    tip: 'Memory, SSD, network and disk are each powers of ten apart. A design that needs many disk seeks or cross-ocean round trips per request can’t be fast.',
  };
}

const MAKERS: Record<DrillKind, (rng: Rng, seed: number) => Drill> = { qps, peak, storage, bandwidth, servers, cache, latency };

/** One drill of a kind, the same for the same seed. */
export function makeDrill(kind: DrillKind, seed: number): Drill {
  // Mix the kind into the seed so drills of different kinds don't share their random choices.
  const salt = DRILL_KINDS.indexOf(kind) * 7919;
  return MAKERS[kind](createRng(seed * 31 + salt + 1), seed);
}

/** A round of drills of mixed kinds, in a seeded order; every kind before any repeats. */
export function drillRound(seed: number, count = DRILL_KINDS.length): Drill[] {
  const rng = createRng(seed + 101);
  const kinds = [...DRILL_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return Array.from({ length: count }, (_, i) => makeDrill(kinds[i % kinds.length], seed * 13 + i));
}

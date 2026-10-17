import { createRng } from '@/engine/random';
import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, ImagePart, PlanePart, PlotPart, PlotState, Token } from '@/viz/plot/types';
import { attend, project, type Attended, type Vector } from './vectors';

// Generating text token by token with and without a KV cache. The tokens are
// fixed (no real model picks them): the point is the work each step needs.
// Each token's embedding is seeded from its text and position, and one
// attention head with 4 numbers per vector turns it into q, k and v.

export type KvText = 'robot' | 'recipe';
const TEXTS: Record<KvText, { prompt: readonly string[]; continuation: readonly string[] }> = {
  robot: { prompt: ['the', 'robot', 'opened', 'the', 'door'], continuation: ['and', 'rolled', 'slowly', 'into', 'the', 'quiet', 'garden', 'to', 'rest'] },
  recipe: { prompt: ['mix', 'the', 'flour'], continuation: ['with', 'two', 'eggs', ',', 'then', 'a', 'cup', 'of', 'milk'] },
};
const TEXT_IDS = Object.keys(TEXTS) as KvText[];

export type KvInput = { text: KvText; generate: number };

export const MIN_GENERATE = 2;
export const MAX_GENERATE = 9;
export const D = 4;

const W_Q: Vector[] = [
  [0.6, -0.2, 0.3, 0.1],
  [0.1, 0.7, -0.3, 0.2],
  [-0.4, 0.2, 0.5, -0.1],
  [0.2, 0.1, 0.2, 0.6],
];
const W_K: Vector[] = [
  [0.5, 0.3, -0.2, 0.1],
  [-0.2, 0.6, 0.2, -0.3],
  [0.3, -0.1, 0.6, 0.2],
  [0.1, 0.2, -0.1, 0.7],
];
const W_V: Vector[] = [
  [0.7, 0.1, 0.0, -0.2],
  [0.2, -0.5, 0.3, 0.1],
  [-0.1, 0.3, 0.6, 0.2],
  [0.3, 0.2, -0.2, 0.5],
];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** A token's embedding: seeded from its text and position, so a repeated word differs by where it sits. */
export function embed(text: string, position: number): number[] {
  const rng = createRng(hash(text) ^ Math.imul(position + 1, 2654435761));
  return Array.from({ length: D }, () => round(rng() * 2 - 1, 2));
}

export const sequenceOf = ({ text, generate }: KvInput) => {
  const t = TEXTS[text];
  return { prompt: t.prompt, generated: t.continuation.slice(0, generate), all: [...t.prompt, ...t.continuation.slice(0, generate)] };
};

export const projections = (x: Vector) => ({ q: project(x, W_Q), k: project(x, W_K), v: project(x, W_V) });

/**
 * The model's work at each step: step s processes a context of `length`
 * tokens and attends from the newest one. With a cache, step 1 computes K and
 * V for the whole prompt (the prefill) and every later step one row; without
 * a cache, every step recomputes all of them.
 */
export function steps(input: KvInput): { length: number; withCache: number; withoutCache: number; next: string }[] {
  const { prompt, generated } = sequenceOf(input);
  return generated.map((next, s) => {
    const length = prompt.length + s;
    return { length, withCache: s === 0 ? prompt.length : 1, withoutCache: length, next };
  });
}

/** Attention of the token at `last` (0-based) over tokens 0..last, recomputing every K and V from scratch. */
export function attendFromScratch(all: readonly string[], last: number): Attended {
  const xs = all.slice(0, last + 1).map((t, i) => projections(embed(t, i)));
  return attend(xs[last].q, xs.map((p) => p.k), xs.map((p) => p.v));
}

const pseudocode = [
  'cache K, V ← empty',
  'for each new token x:',
  '  k, v ← x·W_K, x·W_V   (one row each)',
  '  append k to K and v to V',
  '  q ← x·W_Q',
  '  w ← softmax(q·Kᵀ / √d)',
  '  out ← w·V  → the next token',
  'no cache: redo k, v for every token',
];

const quote = (s: string) => `“${s}”`;
const pct = (w: number) => `${Math.round(100 * w)}%`;

function* run(input: KvInput): Generator<Frame<PlotState>> {
  const { prompt, all } = sequenceOf(input);
  const p = prompt.length;
  const plan = steps(input);
  const G = plan.length;
  // Cache rows are computed once, when their token is first processed, and kept.
  const rowsAll = all.map((t, i) => projections(embed(t, i)));
  const scale = Math.max(...rowsAll.flatMap((r) => [...r.k, ...r.v].map(Math.abs)));
  let withCache = 0;
  let withoutCache = 0;
  const perStep: { withCache: number; withoutCache: number }[] = [];
  const stats = () => ({ withCache, withoutCache });

  type View = { rows: number; generated: number; newest?: number; boxes?: 'new' | 'all' | 'prefill'; weights?: readonly number[]; costs: number };
  const image = (id: 'K' | 'V', v: View): ImagePart => {
    const rows = rowsAll.slice(0, v.rows).map((r) => (id === 'K' ? r.k : r.v));
    const pixels = rows.flat().map((x) => round(x / scale, 3));
    const boxes =
      v.boxes === 'all'
        ? [{ id: 'box', x: 0, y: 0, w: D, h: v.rows, mark: 'reject' as const }]
        : v.boxes === 'prefill'
          ? [{ id: 'box', x: 0, y: 0, w: D, h: v.rows, mark: 'write' as const }]
          : v.boxes === 'new'
            ? [{ id: 'box', x: 0, y: v.rows - 1, w: D, h: 1, mark: 'write' as const }]
            : [];
    return {
      kind: 'image',
      id,
      label: `${id} cache: ${v.rows} × ${D}`,
      width: D,
      height: v.rows,
      pixels,
      scale: 'signed',
      values: rows.flat().map((x) => fmt(x, 1)),
      boxes,
      size: 104,
    };
  };
  const text = (v: View): PlotPart => ({
    kind: 'tokens',
    id: 'text',
    label: 'The text so far (prompt, then generated tokens)',
    tokens: all.slice(0, p + v.generated).map(
      (t, i): Token => ({
        id: `t${i}`,
        text: t,
        mark: i === v.newest ? 'key' : null,
        tone: i >= p ? 2 : undefined,
        sub: v.weights && i < v.weights.length ? pct(v.weights[i]) : undefined,
      }),
    ),
  });
  const costPlane = (shown: number): PlanePart => {
    const bars: Bar[] = [];
    perStep.slice(0, shown).forEach((c, s) => {
      bars.push({ id: `n${s}`, x0: s + 0.6, x1: s + 1, y: c.withoutCache, tone: 2 });
      bars.push({ id: `c${s}`, x0: s + 1, x1: s + 1.4, y: c.withCache, tone: 1 });
    });
    return {
      kind: 'plane',
      id: 'costs',
      label: 'K/V rows computed at each step',
      x: { min: 0.3, max: G + 0.7, label: 'step', ticks: plan.map((_, s) => ({ at: s + 1, label: String(s + 1) })) },
      y: { min: 0, max: p + G, label: 'rows' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'costs', bars }],
      handles: [],
    };
  };
  const readouts = (v: View): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'Work and memory',
    items: [
      { id: 'without', label: 'without a cache', value: `${withoutCache} rows`, tone: 2 },
      { id: 'with', label: 'with a cache', value: `${withCache} rows`, tone: 1 },
      { id: 'memory', label: 'cache holds', value: `2 × ${v.rows} × ${D} = ${2 * v.rows * D} numbers` },
    ],
  });
  const parts = (v: View): PlotPart[] => [text(v), ...(v.rows > 0 ? [image('K', v), image('V', v)] : []), costPlane(v.costs), readouts(v)];

  yield plotFrame(parts({ rows: 0, generated: 0, costs: 0 }), {
    line: 0,
    note: `A language model writes one token at a time, and each new token attends to every token before it. The ${G} tokens it adds here are fixed in advance (no real model is choosing them): watch the work each step takes. The prompt has ${p} tokens.`,
    vars: { prompt: p, generate: G },
    stats: stats(),
    checkpoint: ask('How many rows will the K cache hold after the first step?', String(p), ['1', String(p + 1), String(2 * p)]),
  });

  for (let s = 0; s < G; s++) {
    const { length: L, next } = plan[s];
    const newest = L - 1;
    const r = rowsAll[newest];
    withoutCache += L;
    withCache += plan[s].withCache;
    perStep.push({ withCache: plan[s].withCache, withoutCache: L });

    if (s === 0) {
      yield plotFrame(parts({ rows: L, generated: 0, newest, boxes: 'prefill', costs: 1 }), {
        line: 3,
        note: `Step 1, the prefill: compute k and v for all ${p} prompt tokens and keep them. K and V each get a row per token. Both ways cost ${p} rows so far; the difference starts at the next step.`,
        vars: { step: 1, rows: L },
        stats: stats(),
      });
    } else {
      yield plotFrame(parts({ rows: L - 1, generated: s, newest, boxes: 'all', costs: s }), {
        line: 7,
        note: `Step ${s + 1}: the newest token, ${quote(all[newest])}, joins the context of ${L} tokens. Without a cache, the model would run all ${L} tokens through W_K and W_V again, though the ${L - 1} boxed rows are exactly what it computed before.`,
        vars: { step: s + 1, context: L },
        stats: { withCache: withCache - 1, withoutCache: withoutCache - L },
        checkpoint: s % 2 === 1 ? ask('With the cache, how many rows will K hold after this step?', String(L), [String(L - 1), String(L + 1), String(2 * L)]) : undefined,
      });
      // Both counters move in this frame: the redo is drawn, the cache gains one row.
      yield plotFrame(parts({ rows: L, generated: s, newest, boxes: 'new', costs: s + 1 }), {
        line: 3,
        note: `With the cache, only ${quote(all[newest])} is new: one row of K and one of V, appended. Without it, this step would cost ${L} rows. Running totals: ${withoutCache} rows without the cache, ${withCache} with it.`,
        vars: { step: s + 1, 'k.0': round(r.k[0], 3), 'v.0': round(r.v[0], 3) },
        stats: stats(),
      });
    }

    const a = attend(r.q, rowsAll.slice(0, L).map((x) => x.k), rowsAll.slice(0, L).map((x) => x.v));
    const top = a.weights.reduce((b, w, i) => (w > a.weights[b] ? i : b), 0);
    const following = plan[s + 1];
    yield plotFrame(parts({ rows: L, generated: s, newest, weights: a.weights, costs: s + 1 }), {
      line: 6,
      note: `q of ${quote(all[newest])} meets all ${L} cached keys: the most weight, ${pct(a.weights[top])}, goes to ${quote(all[top])}. The weighted values give the output, and the model's next token is ${quote(next)}.${
        s === 1 ? ' The cached rows are exactly what a full recompute would produce, so the output is identical: the cache saves work without changing a thing.' : ''
      }`,
      vars: { step: s + 1, next, 'top weight': round(a.weights[top], 3) },
      stats: stats(),
      checkpoint:
        following && s % 2 === 0 && s > 0
          ? ask('Without a cache, how many K/V rows would the next step compute?', String(following.length), [String(following.length - 1), '1', String(following.length + 1)])
          : undefined,
    });
  }

  const total = all.length;
  const nextLen = total;
  yield plotFrame(parts({ rows: total - 1, generated: G, costs: G }), {
    line: 1,
    note: `${G} tokens generated. Without a cache: ${plan.map((x) => x.length).join(' + ')} = ${withoutCache} rows of K and V, growing with every step (quadratic overall). With it: ${withCache}, one per token (linear). The newest token, ${quote(all[total - 1])}, gets its row only when it is processed next, as token ${nextLen}.`,
    vars: { without: withoutCache, with: withCache },
    stats: stats(),
  });
  yield plotFrame(parts({ rows: total - 1, generated: G, costs: G }), {
    line: 0,
    note: `The price is memory. This toy keeps ${2 * (total - 1) * D} numbers. For a sense of scale (an illustrative calculation): a model with 32 layers and a model width of 4,096, storing 16-bit numbers, keeps 2 × 32 × 4,096 × 2 bytes = 512 KiB of keys and values per token, so a 4,096-token conversation needs 2 GiB of cache. That is why long contexts are expensive to serve.`,
    vars: { numbers: 2 * (total - 1) * D },
    stats: stats(),
  });
}

export const kvCache = defineAlgorithm<KvInput, PlotState>({
  kind: 'algorithm',
  slug: 'kv-cache',
  view: 'plot',
  input: {
    examples: [
      { id: 'robot', label: 'A five-token prompt', make: ({ size }) => ({ text: 'robot', generate: size }) },
      { id: 'recipe', label: 'A three-token prompt', make: ({ size }) => ({ text: 'recipe', generate: size }) },
    ],
    size: { label: 'Tokens to generate', min: MIN_GENERATE, max: MAX_GENERATE, default: 6 },
    custom: {
      label: `Text (${TEXT_IDS.join(', ')}) and how many tokens to generate (${MIN_GENERATE}–${MAX_GENERATE})`,
      placeholder: 'e.g. robot, generate = 6',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as KvText;
        if (!TEXT_IDS.includes(word)) return { error: `Start with the text: ${TEXT_IDS.join(' or ')}.` };
        const generate = Number(text.match(/\bgenerate\s*=\s*(\d+)/i)?.[1]);
        if (!Number.isInteger(generate) || generate < MIN_GENERATE || generate > MAX_GENERATE) return { error: `Give generate = ${MIN_GENERATE} to ${MAX_GENERATE}.` };
        return { value: { text: word, generate } };
      },
      format: ({ text, generate }) => `${text}, generate = ${generate}`,
    },
  },
  pseudocode,
  stats: [
    { key: 'withoutCache', label: 'K/V rows without a cache' },
    { key: 'withCache', label: 'K/V rows with a cache' },
  ],
  legend: [
    { neutral: 'Prompt tokens' },
    { tone: 2, label: 'Generated tokens; work without a cache' },
    { tone: 1, label: 'Work with a cache' },
    { mark: 'key', label: 'The newest token' },
    { mark: 'write', label: 'Rows computed this step' },
    { mark: 'reject', label: 'Rows a cache-less model would redo' },
  ],
  run,
  content: {
    idea: 'A language model generates one token at a time, and every new token attends to all earlier ones. Their keys and values never change once computed, so the model keeps them in a cache and computes just one new row of K and V per step instead of all of them again.',
    invariant: 'Row i of K and V depends only on token i (and its position), so a cached row equals a recomputed one. Attention from the newest token over the cache gives exactly the output a full recompute would.',
    whenToUse: 'Every transformer decoder uses it when generating. It turns the per-step work from growing with the context to constant, at the price of memory that grows with the context, which is what limits long conversations and batch sizes when serving.',
    traits: [
      { label: 'Same output as recomputing', good: true },
      { label: 'One K/V row per new token', good: true },
      { label: 'Memory grows with the context', good: false },
    ],
    experiments: [
      { example: 'robot', prompt: 'Raise the number of tokens to generate and compare the two totals: the gap widens with every step.' },
      { example: 'recipe', prompt: 'A short prompt makes a cheap prefill. Which step costs the most without a cache?' },
    ],
  },
});

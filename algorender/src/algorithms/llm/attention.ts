import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Bar, Handle, PlanePart, PlotPart, PlotState, Shape, Token, Vec } from '@/viz/plot/types';
import { argmax, attend, type Attended } from './vectors';

// Scaled dot-product attention on hand-set 2D vectors. Real models use 64 or
// 128 dimensions per head and learn the vectors; here every query, key and
// value is two numbers, chosen so the dot products tell a readable story.

type Word = { text: string; q: Vec; k: Vec; v: Vec };

export type SentenceId = 'pronoun' | 'adjective';

export const SENTENCES: Record<SentenceId, readonly Word[]> = {
  // Nouns' keys point east, verbs' and adjectives' north; "it" asks for a noun.
  pronoun: [
    { text: 'the', q: [0.3, 0.2], k: [0.2, -0.6], v: [-0.3, -0.2] },
    { text: 'cat', q: [0.4, 1.4], k: [2.0, 0.4], v: [1.8, 1.2] },
    { text: 'ate', q: [1.5, -0.1], k: [0.3, 1.6], v: [-1.2, 1.6] },
    { text: 'because', q: [0.2, 0.3], k: [-0.6, 0.4], v: [0.2, -0.5] },
    { text: 'it', q: [1.6, 0.2], k: [0.8, -0.4], v: [0.6, 0.3] },
    { text: 'was', q: [0.9, -0.5], k: [-0.2, 0.9], v: [-0.4, -0.3] },
    { text: 'hungry', q: [1.2, 0.3], k: [-0.4, 1.2], v: [-1.4, -1.0] },
  ],
  // Adjectives' keys point north; "ball" asks for a description.
  adjective: [
    { text: 'a', q: [0.2, 0.1], k: [0.1, -0.5], v: [0, -0.3] },
    { text: 'small', q: [1.4, 0.1], k: [0.3, 1.5], v: [-1.2, -0.6] },
    { text: 'dog', q: [-0.5, 0.8], k: [1.8, 0.2], v: [1.5, -1.2] },
    { text: 'chased', q: [1.4, -0.2], k: [-0.8, 0.6], v: [-0.6, 1.0] },
    { text: 'the', q: [0.1, 0.2], k: [0.2, -0.6], v: [0.2, -0.2] },
    { text: 'red', q: [1.0, 0.8], k: [0.2, 2.0], v: [1.6, 1.4] },
    { text: 'ball', q: [0.1, 1.7], k: [1.6, 0.9], v: [0.4, 0.8] },
  ],
};
const SENTENCE_IDS = Object.keys(SENTENCES) as SentenceId[];

/** `q` replaces the focus token's own query (dragged); `mask` hides later tokens (a decoder, as in GPT). */
export type AttentionInput = { sentence: SentenceId; focus: number; q: Vec | null; mask: boolean };

export const Q_MAX = 2.5;
const Q_STEP = 0.1;
const D = 2;

const pseudocode = [
  'each token i has vectors q, k and v',
  'score[j] ← q·k[j]       for every key j',
  'score[j] ← score[j] / √d',
  'if j comes after i: score[j] ← −∞',
  'w ← softmax(score)      (adds up to 1)',
  'out ← Σ w[j]·v[j]',
  'repeat for every query i: matrix W',
];

export const wordsOf = (input: AttentionInput) => SENTENCES[input.sentence];

/** The query used for token i: the focus token's may be dragged. */
export const queryOf = (input: AttentionInput, i: number): Vec => (i === input.focus && input.q ? input.q : wordsOf(input)[i].q);

export const allowedFor = (input: AttentionInput, i: number) => wordsOf(input).map((_, j) => !input.mask || j <= i);

/** The attention of query i over every key. */
export function attentionRow(input: AttentionInput, i: number): Attended {
  const words = wordsOf(input);
  return attend(
    queryOf(input, i),
    words.map((w) => w.k),
    words.map((w) => w.v),
    allowedFor(input, i),
  );
}

const quote = (s: string) => `“${s}”`;
const term = (x: number) => (x < 0 ? `(${fmt(x)})` : fmt(x));
const pct = (w: number) => `${Math.round(100 * w)}%`;
const share = (w: number) => (w < 0.25 ? 'under 25%' : w < 0.5 ? '25% to 50%' : w < 0.75 ? '50% to 75%' : 'over 75%');
const SHARES = ['under 25%', '25% to 50%', '50% to 75%', 'over 75%'];
const v2 = (xs: readonly number[]): Vec => [round(xs[0], 2), round(xs[1], 2)];

/** Drops a question whose answer the frame's own note names (a token in quotes). */
const unless = (note: string, c: Checkpoint | undefined) => (c && note.includes(quote(c.choices[c.answer])) ? undefined : c);

function* run(input: AttentionInput): Generator<Frame<PlotState>> {
  const words = wordsOf(input);
  const n = words.length;
  const f = input.focus;
  const me = words[f];
  const q = queryOf(input, f);
  const allowed = allowedFor(input, f);
  const row = attentionRow(input, f);
  const best = argmax(row.weights);
  const tied = row.weights.filter((w) => Math.abs(w - row.weights[best]) < 1e-9).length > 1;
  const hidden = words.map((_, j) => j).filter((j) => !allowed[j]);
  let dots = 0;
  let rows = 0;
  const stats = () => ({ dots, rows });

  // ── parts ──
  type Stage = { scored: number; weights: boolean; key?: number; pieces?: number; values?: boolean };
  const tokenRow = (s: Stage): PlotPart => ({
    kind: 'tokens',
    id: 'sentence',
    label: input.mask ? 'The sentence (later tokens masked)' : 'The sentence',
    tokens: words.map(
      (w, j): Token => ({
        id: `t${j}`,
        text: w.text,
        mark: j === f ? 'key' : !allowed[j] ? 'reject' : s.weights && j === best && !tied ? 'found' : j === s.key ? 'compare' : null,
        sub: !allowed[j] ? 'masked' : s.weights ? pct(row.weights[j]) : j < s.scored ? fmt(row.scores[j], 2) : undefined,
      }),
    ),
  });
  const handle: Handle = { id: 'q', at: q, label: `Query of ${quote(me.text)}`, mark: 'key', step: Q_STEP, min: [-Q_MAX, -Q_MAX], max: [Q_MAX, Q_MAX] };
  const keyPlane = (s: Stage): PlanePart => {
    const shapes: Shape[] = words.map((w, j) => ({
      kind: 'vector',
      id: `k${j}`,
      from: [0, 0],
      to: w.k,
      label: allowed[j] ? w.text : `${w.text} (masked)`,
      dashed: !allowed[j],
      mark: !allowed[j] ? 'reject' : j === s.key ? 'compare' : s.weights && j === best && !tied ? 'found' : null,
    }));
    shapes.push({ kind: 'vector', id: 'q', from: [0, 0], to: q, mark: 'key', label: `q (${me.text})` });
    return {
      kind: 'plane',
      id: 'keys',
      label: `Keys, and the query of ${quote(me.text)}`,
      x: { min: -Q_MAX, max: Q_MAX },
      y: { min: -Q_MAX, max: Q_MAX },
      equal: true,
      shapes,
      handles: [handle],
    };
  };
  const ticks = words.map((w, j) => ({ at: j + 1, label: w.text }));
  const lo = Math.min(-1, ...row.scaled.filter((_, j) => allowed[j]).map((x) => Math.floor(x)));
  const hi = Math.max(1, ...row.scores.filter((_, j) => allowed[j]).map((x) => Math.ceil(x)));
  const scorePlane = (s: Stage, scaled: boolean): PlanePart => {
    const bars: Bar[] = [];
    for (let j = 0; j < Math.min(s.scored, n); j++) {
      const y = scaled ? row.scaled[j] : row.scores[j];
      bars.push(
        allowed[j]
          ? { id: `s${j}`, x0: j + 0.65, x1: j + 1.35, y: round(y, 2), label: fmt(y, 2), mark: j === s.key ? 'compare' : null }
          : { id: `s${j}`, x0: j + 0.65, x1: j + 1.35, y: 0, label: '−∞', mark: 'reject' },
      );
    }
    return {
      kind: 'plane',
      id: 'scores',
      label: scaled ? 'Scores q·k / √d' : 'Scores q·k',
      x: { min: 0.3, max: n + 0.7, ticks },
      y: { min: lo, max: hi + 0.5, label: 'score' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'scores', bars }],
      handles: [],
    };
  };
  const weightPlane = (): PlanePart => ({
    kind: 'plane',
    id: 'weights',
    label: 'Weights w = softmax(scores)',
    x: { min: 0.3, max: n + 0.7, ticks },
    y: { min: 0, max: 1.1, label: 'weight' },
    equal: false,
    shapes: [
      {
        kind: 'bars',
        id: 'weights',
        bars: row.weights.map((w, j) => ({
          id: `w${j}`,
          x0: j + 0.65,
          x1: j + 1.35,
          y: round(w, 3),
          label: allowed[j] ? pct(w) : '0',
          mark: !allowed[j] ? 'reject' : j === best && !tied ? 'found' : null,
        })),
      },
    ],
    handles: [],
  });
  // Value pieces w·v laid tip to tail, biggest first, so the output is visibly their sum.
  const order = words.map((_, j) => j).filter((j) => allowed[j]).sort((a, b) => row.weights[b] - row.weights[a]);
  const valuePlane = (pieces: number): PlanePart => {
    const shapes: Shape[] = words.map((w, j) => ({ kind: 'vector', id: `v${j}`, from: [0, 0], to: w.v, dashed: true, label: w.text, mark: !allowed[j] ? 'reject' : null }));
    let at: Vec = [0, 0];
    order.forEach((j, r) => {
      const to: Vec = [at[0] + row.weights[j] * words[j].v[0], at[1] + row.weights[j] * words[j].v[1]];
      // Pieces not yet added sit as zero-length arrows at the running tip, so they grow from there.
      shapes.push({ kind: 'vector', id: `p${j}`, from: v2(at), to: v2(r < pieces ? to : at), tone: 1 });
      if (r < pieces) at = to;
    });
    if (pieces >= order.length) shapes.push({ kind: 'vector', id: 'out', from: [0, 0], to: v2(row.output), mark: 'found', label: 'output' });
    return { kind: 'plane', id: 'values', label: 'Values, and the weighted sum', x: { min: -2.5, max: 2.5 }, y: { min: -2.5, max: 2.5 }, equal: true, shapes, handles: [] };
  };
  const readouts = (extra: { id: string; label: string; value: string }[] = []): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'Attention',
    items: [{ id: 'q', label: `q (${me.text})`, value: fmtVec(q) }, { id: 'd', label: 'd', value: String(D) }, ...extra],
  });

  // ── one query, step by step ──
  const allowedIdx = words.map((_, j) => j).filter((j) => allowed[j]);
  const scoreBest = allowedIdx.reduce((b, j) => (row.scores[j] > row.scores[b] ? j : b), allowedIdx[0]);
  const scoreTied = allowedIdx.filter((j) => Math.abs(row.scores[j] - row.scores[scoreBest]) < 1e-9).length > 1;
  const others = allowedIdx.filter((j) => j !== scoreBest).map((j) => words[j].text);
  yield plotFrame([tokenRow({ scored: 0, weights: false }), keyPlane({ scored: 0, weights: false }), readouts()], {
    line: 0,
    note: `Every token carries three vectors: a query (what it is looking for), a key (what it offers) and a value (what it passes on). Here they have 2 numbers each; real models use 64 or more per head. Focus on ${quote(me.text)}: its query is the arrow q. ${
      input.mask ? `This is a decoder, like GPT: a token may only look at itself and earlier tokens, so ${hidden.length} later ${hidden.length === 1 ? 'token is' : 'tokens are'} masked.` : 'It will look at every token, itself included.'
    } Drag q to steer it.`,
    vars: { query: me.text, 'q.x': q[0], 'q.y': q[1] },
    stats: stats(),
    // Not asked when the winner is the focus token itself: the note has to name it.
    checkpoint: scoreTied || scoreBest === f || new Set(others).has(words[scoreBest].text) ? undefined : ask(`Which key will score highest against the query of ${quote(me.text)}?`, words[scoreBest].text, others),
  });

  // The first key whose score is below zero gets a sign question one frame ahead.
  const signKey = allowedIdx.find((j) => j > allowedIdx[0] && row.scores[j] < -0.05);
  for (const j of allowedIdx) {
    dots++;
    const w = words[j];
    const s: Stage = { scored: j + 1, weights: false, key: j };
    const next = allowedIdx[allowedIdx.indexOf(j) + 1];
    const why =
      row.scores[j] > 0.05
        ? 'q and k point roughly the same way, so the score is positive, and bigger the longer they are.'
        : row.scores[j] < -0.05
          ? 'q and k point more than a right angle apart, so the score is negative.'
          : 'q and k are nearly perpendicular, so the score is close to 0.';
    yield plotFrame([tokenRow(s), keyPlane(s), scorePlane(s, false), readouts()], {
      line: 1,
      note: `${quote(w.text)}${j === f ? ' (a token scores its own key too)' : ''}: q·k = ${term(q[0])}·${term(w.k[0])} + ${term(q[1])}·${term(w.k[1])} = ${fmt(row.scores[j], 2)}. ${why}`,
      vars: { key: w.text, 'k.x': w.k[0], 'k.y': w.k[1], score: round(row.scores[j], 3) },
      stats: stats(),
      checkpoint:
        next !== undefined && next === signKey
          ? askInOrder(`Will the score of ${quote(words[next].text)} be above or below zero?`, ['Above zero', 'Below zero'], row.scores[next] > 0 ? 'Above zero' : 'Below zero')
          : undefined,
    });
  }

  const sAll: Stage = { scored: n, weights: false };
  if (hidden.length) {
    yield plotFrame([tokenRow(sAll), keyPlane(sAll), scorePlane(sAll, false), readouts()], {
      line: 3,
      note: `${hidden.map((j) => quote(words[j].text)).join(', ')} ${hidden.length === 1 ? 'comes' : 'come'} after ${quote(me.text)}. A decoder writes text left to right, so when it is at ${quote(me.text)} those tokens don't exist yet: their scores are set to −∞, which softmax turns into a weight of exactly 0.`,
      vars: { masked: hidden.length },
      stats: stats(),
    });
  }

  yield plotFrame([tokenRow(sAll), keyPlane(sAll), scorePlane(sAll, true), readouts()], {
    line: 2,
    note: `Divide every score by √d = √${D} ≈ ${fmt(Math.sqrt(D), 2)}. With d = 128 dot products grow large, and softmax would put almost all weight on one key; scaling keeps the weights soft enough to learn from. Next, softmax: e^score for each key, divided by their total.`,
    vars: { d: D, 'max score': round(row.scaled[scoreBest], 3) },
    stats: stats(),
    checkpoint: tied ? undefined : askInOrder(`Roughly what share of the weight will ${quote(words[best].text)} get?`, SHARES, share(row.weights[best])),
  });

  const sW: Stage = { scored: n, weights: true };
  // The value the output points most nearly along (by angle), asked only when it is clear.
  const off = (j: number) => angleBetween(row.output, words[j].v);
  const closest = allowedIdx.reduce((b, j) => (off(j) < off(b) ? j : b), allowedIdx[0]);
  const closeTie = Math.hypot(row.output[0], row.output[1]) < 0.1 || allowedIdx.some((j) => j !== closest && off(j) - off(closest) < 0.06);
  yield plotFrame([tokenRow(sW), keyPlane(sW), scorePlane(sW, true), weightPlane(), readouts([{ id: 'sum', label: 'Σ w', value: '1' }])], {
    line: 4,
    note: tied
      ? `Softmax: every allowed key scored the same, so each gets an equal share, ${pct(row.weights[best])}. A query of (0, 0) asks for nothing in particular and gets the plain average.`
      : `Softmax turns scores into weights between 0 and 1 that add up to 1. ${quote(words[best].text)} gets ${pct(row.weights[best])}; the exponential rewards the leader, but every allowed key keeps some weight.`,
    vars: Object.fromEntries(allowedIdx.map((j) => [`w(${words[j].text})`, round(row.weights[j], 3)])),
    stats: stats(),
  });

  // ── the output: value pieces added tip to tail ──
  const big = order.filter((j) => row.weights[j] >= 0.05);
  const shown = Math.max(1, big.length);
  const valueNames = new Set(allowedIdx.map((j) => words[j].text));
  yield plotFrame([tokenRow(sW), weightPlane(), valuePlane(0), readouts()], {
    line: 5,
    note: `Each token's value is a dashed arrow. The output is a blend of them: scale each value by its weight, then add the pieces tip to tail, biggest first.`,
    vars: { pieces: 0 },
    stats: stats(),
    checkpoint:
      closeTie || valueNames.size < allowedIdx.length
        ? undefined
        : ask('The output is Σ w·v. Which token’s value will it point most nearly along?', words[closest].text, allowedIdx.filter((j) => j !== closest).map((j) => words[j].text)),
  });
  for (let r = 0; r < shown; r++) {
    const j = order[r];
    const last = r === shown - 1;
    const rest = order.length - shown;
    yield plotFrame([tokenRow(sW), weightPlane(), valuePlane(last ? order.length : r + 1), readouts(last ? [{ id: 'out', label: 'output', value: fmtVec(v2(row.output)) }] : [])], {
      line: 5,
      note: last
        ? `${rest > 0 ? `Add ${pct(row.weights[j])} of the value of ${quote(words[j].text)}, then the ${rest} small ${rest === 1 ? 'piece' : 'pieces'} left. ` : `Add ${pct(row.weights[j])} of the value of ${quote(words[j].text)}. `}The output for ${quote(me.text)} is ${fmtVec(v2(row.output))}${
          tied
            ? ': the plain average of the values.'
            : `, pointing most nearly along the value of ${quote(words[closest].text)}. It is a weighted average, so it is never longer than the longest value it blends. This is how ${quote(me.text)} picks up information from the tokens it attends to.`
        }`
        : `Add ${pct(row.weights[j])} of the value of ${quote(words[j].text)}, ${fmtVec(words[j].v)}: a piece ${fmtVec([row.weights[j] * words[j].v[0], row.weights[j] * words[j].v[1]])}.`,
      vars: { token: words[j].text, w: round(row.weights[j], 3) },
      stats: stats(),
    });
  }

  // ── every query at once: the attention matrix ──
  const rowsOf = words.map((_, i) => attentionRow(input, i));
  const matrix = (upTo: number): PlotPart[] => {
    const shapes: Shape[] = [];
    if (upTo >= 0) {
      const values: number[] = [];
      for (let i = 0; i <= upTo; i++) values.push(...rowsOf[i].weights.map((w) => round(w, 3)));
      shapes.push({ kind: 'heatmap', id: 'matrix', x0: 0, x1: n, y0: n - upTo - 1, y1: n, cols: n, rows: upTo + 1, values, scale: { kind: 'intensity', tone: 2 } });
      for (let i = 0; i <= upTo; i++) {
        const al = allowedFor(input, i);
        rowsOf[i].weights.forEach((w, j) => shapes.push({ kind: 'label', id: `c${i}-${j}`, at: [j + 0.5, n - i - 0.5], text: al[j] ? fmt(w, 2) : '—' }));
      }
      shapes.push({
        kind: 'path',
        id: 'row',
        points: [
          [0, n - upTo],
          [n, n - upTo],
          [n, n - upTo - 1],
          [0, n - upTo - 1],
        ],
        closed: true,
        mark: 'key',
      });
    }
    return [
      {
        kind: 'tokens',
        id: 'sentence',
        label: input.mask ? 'The sentence (later tokens masked)' : 'The sentence',
        tokens: words.map((w, j): Token => ({ id: `t${j}`, text: w.text, mark: j === upTo ? 'key' : null })),
      },
      {
        kind: 'plane',
        id: 'matrix',
        label: 'Attention weights: a row per query, a column per key',
        x: { min: 0, max: n, label: 'key', ticks: words.map((w, j) => ({ at: j + 0.5, label: w.text })) },
        y: { min: 0, max: n, label: 'query', ticks: words.map((w, i) => ({ at: n - i - 0.5, label: w.text })) },
        equal: true,
        shapes,
        handles: [],
      },
      { kind: 'readouts', id: 'readouts', label: 'Attention', items: [{ id: 'rows', label: 'rows done', value: `${upTo + 1} of ${n}` }] },
    ];
  };

  // A question for one row: the decoder's visible keys, else the strongest key of a clear row.
  const askRow = input.mask ? 3 : 2;
  const rowQuestion = (i: number): Checkpoint | undefined => {
    if (input.mask) {
      const seen = i + 1;
      return ask(`How many keys can ${quote(words[i].text)} (token ${i + 1}) attend to?`, String(seen), [String(n), String(i), String(seen + 1)]);
    }
    const r = rowsOf[i];
    const top = argmax(r.weights);
    const sorted = [...r.weights].sort((a, b) => b - a);
    if (sorted[0] - sorted[1] < 0.08) return undefined;
    return ask(`In the row for ${quote(words[i].text)}, which key will get the most weight?`, words[top].text, words.filter((_, j) => j !== top).map((w) => w.text));
  };

  yield plotFrame(matrix(-1), {
    line: 6,
    note: `That was one query. A transformer does the same for every token at once: one row of weights per query, computed as softmax(QKᵀ/√d), then multiplied by V. Fill it in row by row.`,
    vars: { tokens: n },
    stats: stats(),
    checkpoint: askInOrder('What will every row of weights add up to?', ['0', '1', `${n}, one per token`, 'It depends on the scores'], '1'),
  });
  const rowNotes = rowsOf.map((r, i) => {
    const al = allowedFor(input, i);
    const top = argmax(r.weights);
    const flat = Math.max(...r.weights) - Math.min(...r.weights.filter((_, j) => al[j])) < 0.12;
    const masked = al.filter((a) => !a).length;
    return `Row ${i + 1}, the query of ${quote(words[i].text)}: ${
      flat ? 'its weights are spread almost evenly, the mark of a query that is not looking for anything in particular' : `most weight goes to ${quote(words[top].text)} (${pct(r.weights[top])})`
    }${masked ? `; ${masked} later ${masked === 1 ? 'key is' : 'keys are'} masked` : ''}. The row adds up to 1.`;
  });
  // One question about the coming row, on the first row (from the second on) where it gives nothing away.
  let asked = false;
  for (let i = 0; i < n; i++) {
    const r = rowsOf[i];
    dots += allowedFor(input, i).filter(Boolean).length;
    rows++;
    const top = argmax(r.weights);
    const question = !asked && i + 1 >= askRow && i + 1 < n ? unless(rowNotes[i], rowQuestion(i + 1)) : undefined;
    if (question) asked = true;
    yield plotFrame(matrix(i), {
      line: 6,
      note: rowNotes[i],
      vars: { query: words[i].text, top: words[top].text, w: round(r.weights[top], 3) },
      stats: stats(),
      checkpoint: question,
    });
  }
  yield plotFrame(matrix(n - 1), {
    line: 6,
    note: input.mask
      ? `The finished matrix is lower-triangular: everything above the diagonal is masked, so no token can peek at the future. That is what lets a decoder be trained on every position of a text at once.`
      : `The finished matrix. Each row is one token deciding what to read from the others; stacking ${n} such rows is one attention head. A layer runs several heads with different vectors, each free to look for something different.`,
    vars: { rows: n, dots },
    stats: stats(),
  });
}

/** The angle between two vectors, in radians (π when either is zero). */
function angleBetween(a: readonly number[], b: readonly number[]): number {
  const la = Math.hypot(a[0], a[1]);
  const lb = Math.hypot(b[0], b[1]);
  if (la === 0 || lb === 0) return Math.PI;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb))));
}

const parse = (text: string): { value: AttentionInput } | { error: string } => {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as SentenceId;
  if (!SENTENCE_IDS.includes(word)) return { error: `Start with the sentence: ${SENTENCE_IDS.join(' or ')}.` };
  const n = SENTENCES[word].length;
  const focus = Number(text.match(/\bquery\s*=\s*(\d+)/i)?.[1]);
  if (!Number.isInteger(focus) || focus < 1 || focus > n) return { error: `Give the query token's position, query = 1 to ${n}.` };
  const qm = text.match(/\bq\s*=\s*\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/i);
  let q: Vec | null = null;
  if (qm) {
    q = [Number(qm[1]), Number(qm[2])];
    if (q.some((x) => !Number.isFinite(x) || Math.abs(x) > Q_MAX)) return { error: `Each number of q must be between −${Q_MAX} and ${Q_MAX}.` };
  } else if (/\bq\s*=/i.test(text)) return { error: 'Write q as two numbers, e.g. q = (1.5, 0.5).' };
  return { value: { sentence: word, focus: focus - 1, q, mask: /\bmask/i.test(text) } };
};

const format = ({ sentence, focus, q, mask }: AttentionInput) => `${sentence}, query = ${focus + 1}${q ? `, q = (${plain(q[0])}, ${plain(q[1])})` : ''}${mask ? ', mask' : ''}`;

export const attention = defineAlgorithm<AttentionInput, PlotState>({
  kind: 'algorithm',
  slug: 'attention',
  view: 'plot',
  input: {
    examples: [
      { id: 'pronoun', label: '“it” finds its noun', sized: false, make: () => ({ sentence: 'pronoun', focus: 4, q: null, mask: false }) },
      { id: 'adjective', label: '“ball” finds its colour', sized: false, make: () => ({ sentence: 'adjective', focus: 6, q: null, mask: false }) },
      { id: 'causal', label: 'Masked, as in GPT', sized: false, make: () => ({ sentence: 'pronoun', focus: 1, q: null, mask: true }) },
    ],
    custom: {
      label: `Sentence (${SENTENCE_IDS.join(', ')}), the query token's position, optionally q = (x, y), and "mask"`,
      placeholder: 'e.g. pronoun, query = 5, q = (1.5, 0.5), mask',
      parse,
      format,
    },
    drag: (input, handle, to) => (handle === 'q' ? { ...input, q: [round(to[0], 2), round(to[1], 2)] } : input),
  },
  pseudocode,
  stats: [
    { key: 'dots', label: 'Dot products' },
    { key: 'rows', label: 'Rows of the matrix' },
  ],
  legend: [
    { neutral: 'Keys, values and scores of other tokens' },
    { mark: 'key', label: 'The query token and its q' },
    { mark: 'compare', label: 'The key being scored' },
    { mark: 'found', label: 'The most weight, and the output' },
    { mark: 'reject', label: 'Masked: a later token' },
    { tone: 1, label: 'Weighted value pieces w·v' },
  ],
  run,
  content: {
    idea: 'Attention lets every token decide which other tokens to read from. A token’s query is compared with every key by a dot product; softmax turns the scores into weights that add up to 1; the output is the weighted average of the values. Pronouns find their nouns this way, and words find their descriptions.',
    invariant: 'The weights of a query are softmax(q·k / √d) over the keys it may see: all positive, adding up to 1, so the output always lies inside the spread of the values. Masked keys get exactly 0.',
    whenToUse: 'It is the core of the transformer, in every large language model and many image models. Self-attention compares every pair of tokens, so its cost grows with the square of the sequence length; decoders mask later tokens and cache keys and values while generating.',
    traits: [
      { label: 'Weights add up to 1', good: true },
      { label: 'Every pair of tokens: n² work', good: false },
      { label: 'Order-blind without position information', good: null },
    ],
    experiments: [
      { example: 'pronoun', prompt: 'Drag q around the circle and watch which key takes the weight. Can you make “it” attend to “ate” instead of “cat”?' },
      { example: 'adjective', prompt: '“ball” looks for adjectives, so “small” (which describes the dog) gets weight too. A dot product sees what a key offers, not which word it belongs to.' },
      { example: 'causal', prompt: 'With the mask, “cat” can’t look ahead to its verb. Compare the finished matrix with the unmasked one.' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, plain, plotFrame } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import type { Bar, PlanePart, PlotPart, PlotState, Shape, Token } from '@/viz/plot/types';
import { logitsAfter, MODEL, SMOOTHING } from './corpus';

export type SamplingInput = { temperature: number; topK: number; topP: number; seed: number; prompt: string; length: number };

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 12;
export const MAX_TEMPERATURE = 3;
/** Words drawn as bars; the rest of the vocabulary is summed into one "others" bar. */
const SHOWN = 7;
/** Tokens narrated in full detail; later ones take fewer frames. */
const DETAILED = 2;

const pseudocode = [
  'logits ← model(text so far)',
  'p ← softmax(logits / T)',
  'keep the k most likely words',
  'keep the fewest words whose p ≥ top-p',
  'renormalise what is kept',
  'u ← random in [0, 1)',
  'word ← where u falls in the cumulative p',
  'append word; repeat',
];

// ───────────────────────────── the maths ─────────────────────────────

/** softmax(logits / T); T = 0 is the limit, all the probability on the first largest logit. */
export function softmax(logits: readonly number[], temperature: number): number[] {
  if (temperature <= 0) {
    const best = argmax(logits);
    return logits.map((_, i) => (i === best ? 1 : 0));
  }
  const max = Math.max(...logits);
  const e = logits.map((l) => Math.exp((l - max) / temperature));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export function argmax(xs: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[best]) best = i;
  return best;
}

/** Indices by probability, largest first; ties keep vocabulary order. */
export const ranked = (p: readonly number[]) => p.map((_, i) => i).sort((a, b) => p[b] - p[a] || a - b);

/** Of `order` (most likely first), the first k; k = 0 keeps everything. */
export const topK = (order: readonly number[], k: number) => (k > 0 ? order.slice(0, k) : [...order]);

/** The shortest prefix of `order` whose probabilities (under `p`, renormalised over `order`) reach `topP`. */
export function topP(order: readonly number[], p: readonly number[], top: number): number[] {
  if (top >= 1) return [...order];
  const total = order.reduce((s, i) => s + p[i], 0);
  const kept: number[] = [];
  let cum = 0;
  for (const i of order) {
    kept.push(i);
    cum += p[i] / total;
    if (cum >= top - 1e-12) break;
  }
  return kept;
}

/** The kept words' probabilities scaled to sum to 1, in the order given. */
export function renormalise(kept: readonly number[], p: readonly number[]): number[] {
  const total = kept.reduce((s, i) => s + p[i], 0);
  return kept.map((i) => p[i] / total);
}

/** The position in `q` whose cumulative interval [q0 + … + q(j−1), q0 + … + qj) holds u. */
export function pick(q: readonly number[], u: number): number {
  let cum = 0;
  for (let j = 0; j < q.length; j++) {
    cum += q[j];
    if (u < cum) return j;
  }
  return q.length - 1;
}

export type Step = {
  context: string;
  logits: number[];
  /** softmax at T = 1, for comparison. */
  base: number[];
  probs: number[];
  order: number[];
  afterK: number[];
  kept: number[];
  q: number[];
  u: number;
  /** Index into `kept`. */
  choice: number;
  word: number;
};

/** Generates `length` words after the prompt, one sampling step each. */
export function generate(input: SamplingInput): Step[] {
  const rng = createRng(input.seed);
  const words = promptWords(input.prompt);
  const steps: Step[] = [];
  for (let t = 0; t < input.length; t++) {
    const context = words[words.length - 1];
    const logits = logitsAfter(MODEL, context);
    const probs = softmax(logits, input.temperature);
    const order = ranked(probs);
    const afterK = topK(order, input.topK);
    const kept = topP(afterK, probs, input.topP);
    const q = renormalise(kept, probs);
    const u = rng();
    const choice = pick(q, u);
    steps.push({ context, logits, base: softmax(logits, 1), probs, order, afterK, kept, q, u, choice, word: kept[choice] });
    words.push(MODEL.vocab[kept[choice]]);
  }
  return steps;
}

export const promptWords = (prompt: string) => prompt.trim().split(/\s+/).filter(Boolean);

// ───────────────────────────── the trace ─────────────────────────────

const quote = (w: string) => `“${w}”`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (p: number) => `${fmt(100 * p, p < 0.1 ? 1 : 0)}%`;

function guard(note: string, c: Checkpoint | undefined): Checkpoint | undefined {
  if (!c) return undefined;
  const answer = c.choices[c.answer] ?? '';
  return /[a-z]{4,}/i.test(answer) && answer !== 'Yes' && answer !== 'No' && note.includes(answer) ? undefined : c;
}

function* run(input: SamplingInput): Generator<Frame<PlotState>> {
  const { temperature: T, topK: k, topP: p } = input;
  const steps = generate(input);
  const prompt = promptWords(input.prompt);
  const vocab = MODEL.vocab;
  const V = vocab.length;
  const greedy = T <= 0;
  const cutting = !greedy && (k > 0 || p < 1);

  let sampled = 0;
  let considered = 0;
  const stats = () => ({ words: sampled, considered });

  const text = (n: number, o: { newest?: boolean } = {}): PlotPart => ({
    kind: 'tokens',
    id: 'text',
    label: n === 0 ? 'The prompt' : `The prompt and ${plural(n, 'generated word')}`,
    tokens: [
      ...prompt.map((w, i): Token => ({ id: `p${i}`, text: w })),
      ...steps.slice(0, n).map((s, i): Token => ({ id: `g${i}`, text: vocab[s.word], sub: pct(s.probs[s.word]), tone: 1, mark: o.newest && i === n - 1 ? 'key' : null })),
    ],
  });

  // The words drawn as bars for a step: the most likely SHOWN under T = 1, plus the kept ones, in rank order.
  const shownOf = (s: Step) => {
    const top = ranked(s.base).slice(0, SHOWN);
    return top.sort((a, b) => s.base[b] - s.base[a] || a - b);
  };
  const ticks = (shown: readonly number[]) => [...shown.map((w, i) => ({ at: i, label: vocab[w] })), { at: shown.length, label: `${V - shown.length} others` }];

  const logitPlane = (s: Step): PlanePart => {
    const shown = shownOf(s);
    const rest = s.logits.filter((_, i) => !shown.includes(i));
    const restLogit = rest.length ? Math.max(...rest) : Math.log(SMOOTHING);
    const lo = Math.min(Math.log(SMOOTHING), ...s.logits) - 0.5;
    const hi = Math.max(1, ...s.logits) + 0.6;
    const bars: Bar[] = shown.map((w, i) => ({ id: `w${w}`, x0: i - 0.35, x1: i + 0.35, y: s.logits[w], label: fmt(s.logits[w], 1) }));
    bars.push({ id: 'rest', x0: shown.length - 0.35, x1: shown.length + 0.35, y: restLogit, label: `${fmt(restLogit, 1)} each`, mark: null });
    return { kind: 'plane', id: 'logits', label: `Logits for the word after ${quote(s.context)}`, x: { min: -0.6, max: shown.length + 0.6, ticks: ticks(shown) }, y: { min: lo, max: hi, label: 'logit' }, equal: false, shapes: [{ kind: 'bars', id: 'logit-bars', bars }], handles: [] };
  };

  type Show = 'base' | 'probs' | 'cut' | 'kept';
  const probPlane = (s: Step, what: Show): PlanePart => {
    const shown = shownOf(s);
    const kept = new Set(s.kept);
    const restIdx = vocab.map((_, i) => i).filter((i) => !shown.includes(i));
    const value = (i: number) => (what === 'base' ? s.base[i] : what === 'kept' ? (kept.has(i) ? s.q[s.kept.indexOf(i)] : 0) : s.probs[i]);
    const markOf = (i: number) => (what === 'cut' || what === 'kept' ? (kept.has(i) ? null : 'reject') : null);
    const bars: Bar[] = shown.map((w, i) => ({ id: `w${w}`, x0: i - 0.35, x1: i + 0.35, y: value(w), label: pct(value(w)), mark: markOf(w) }));
    const restMass = restIdx.reduce((sum, i) => sum + value(i), 0);
    const restKept = restIdx.filter((i) => kept.has(i)).length;
    bars.push({
      id: 'rest',
      x0: shown.length - 0.35,
      x1: shown.length + 0.35,
      y: restMass,
      label: (what === 'cut' || what === 'kept') && restKept > 0 && restKept < restIdx.length ? `${pct(restMass)} (${restKept} kept)` : pct(restMass),
      mark: (what === 'cut' || what === 'kept') && restKept === 0 ? 'reject' : null,
    });
    const label =
      what === 'base' ? 'Probabilities at T = 1: softmax(logits)' : what === 'probs' ? `Probabilities at T = ${fmt(T)}` : what === 'cut' ? 'After the cuts (✕ removed)' : 'Kept words, renormalised to sum to 1';
    return { kind: 'plane', id: 'probs', label, x: { min: -0.6, max: shown.length + 0.6, ticks: ticks(shown) }, y: { min: 0, max: 1.15, label: 'p' }, equal: false, shapes: [{ kind: 'bars', id: 'prob-bars', bars }], handles: [] };
  };

  const drawPlane = (s: Step, withU: boolean): PlanePart => {
    let cum = 0;
    const shapes: Shape[] = [];
    const bars: Bar[] = s.kept.map((w, j) => {
      const x0 = cum;
      cum += s.q[j];
      return { id: `w${w}`, x0, x1: cum, y: 1, label: s.q[j] >= 0.08 ? vocab[w] : undefined, tone: (j % 2 === 0 ? 1 : 3) as 1 | 3, mark: withU && j === s.choice ? 'key' : null };
    });
    shapes.push({ kind: 'bars', id: 'intervals', bars });
    if (withU) shapes.push({ kind: 'line', id: 'u', through: [s.u, 0], dir: [0, 1], mark: 'compare', label: `u = ${fmt(s.u)}` });
    return { kind: 'plane', id: 'draw', label: 'Each kept word owns a slice of [0, 1) as wide as its probability', x: { min: 0, max: 1 }, y: { min: 0, max: 1.5 }, equal: false, shapes, handles: [] };
  };

  const readouts = (extra: { u?: number; kept?: number } = {}): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'Sampling',
    items: [
      { id: 'T', label: 'temperature T', value: fmt(T) },
      { id: 'k', label: 'top-k', value: k > 0 ? String(k) : 'off' },
      { id: 'p', label: 'top-p', value: p < 1 ? fmt(p) : 'off' },
      ...(extra.kept !== undefined ? [{ id: 'kept', label: 'words kept', value: `${extra.kept} of ${V}` }] : []),
      ...(extra.u !== undefined ? [{ id: 'u', label: 'u', value: fmt(extra.u), mark: 'compare' as const }] : []),
    ],
  });

  const introNote = `A language model's last layer gives every word in its vocabulary a score, a logit; softmax turns the scores into probabilities and one word is drawn. This toy model's logits are ln(count + ${SMOOTHING}) from word pairs in a short story (${V} different words), standing in for a real network. The prompt is ${quote(prompt.join(' '))}; the model only looks at its last word.`;
  yield plotFrame([text(0), readouts()], { line: 0, note: introNote, vars: { T, 'top-k': k, 'top-p': p }, stats: stats() });

  for (let t = 0; t < steps.length; t++) {
    const s = steps[t];
    const word = vocab[s.word];
    const detailed = t < DETAILED;
    considered += V;

    if (greedy) {
      const note = `${t === 0 ? 'The' : 'Again the'} model scores every word as the next one after ${quote(s.context)}. At T = 0 there is no randomness: the word with the largest logit is always taken.`;
      const top = ranked(s.base).slice(0, 4).map((i) => vocab[i]);
      yield plotFrame([text(t), logitPlane(s), probPlane(s, 'probs'), readouts()], {
        line: 0,
        note,
        vars: { context: s.context, step: t + 1 },
        stats: stats(),
        checkpoint: guard(note, ask(`At T = 0, which word comes after ${quote(s.context)}?`, word, top.filter((w) => w !== word))),
      });
      sampled++;
      const repeats = t > 0 && steps.slice(0, t).some((x) => x.context === s.context);
      yield plotFrame([text(t + 1, { newest: true }), logitPlane(s), probPlane(s, 'probs'), readouts()], {
        line: 7,
        note: `${quote(word)} has the largest logit (${fmt(s.logits[s.word], 2)}), so it is appended.${repeats ? ` ${quote(s.context)} came up before, so the same word follows again: greedy decoding always answers a context the same way, which is why it loops.` : ''}`,
        vars: { word, logit: Math.round(s.logits[s.word] * 100) / 100 },
        stats: stats(),
      });
      continue;
    }

    // 1. Logits, and softmax at T = 1.
    const topWord = s.order[0];
    const up = s.probs[topWord] > s.base[topWord] + 1e-9;
    const down = s.probs[topWord] < s.base[topWord] - 1e-9;
    const logitNote = `Word ${t + 1}: the model scores every word as the next one after ${quote(s.context)}. Softmax at T = 1 turns the logits into probabilities: e^logit, divided by the total.`;
    const tQuestion =
      T !== 1 && (t === 0 || (detailed && t % 2 === 1)) && (up || down)
        ? askInOrder(`With T = ${fmt(T)} instead of 1, will the most likely word's probability go up or down?`, ['Up', 'Down'], up ? 'Up' : 'Down')
        : undefined;
    // 2. Temperature (at T = 1 there is nothing to change, so a detailed step skips it).
    const tNote =
      T === 1
        ? `${t === 0 || !detailed ? `Word ${t + 1}, after ${quote(s.context)}: ` : ''}at T = 1 the probabilities are the plain softmax of the logits.`
        : `Divide the logits by T = ${fmt(T)} before the softmax. ${T < 1 ? 'Dividing by less than 1 stretches the gaps between logits, so the likely words grow likelier and the distribution sharpens' : 'Dividing by more than 1 shrinks the gaps between logits, so the distribution flattens and unlikely words get a bigger share'}: ${quote(vocab[topWord])} now has ${pct(s.probs[topWord])} (it had ${pct(s.base[topWord])}).`;
    const surviving = s.kept.length;
    const cutQuestion =
      cutting && p < 1 && (detailed || t % 2 === 0)
        ? ask(`How many words survive ${k > 0 ? `top-k = ${k} and ` : ''}top-p = ${fmt(p)}?`, String(surviving), [
            String(surviving + 1),
            String(Math.max(1, surviving - 1)),
            String(surviving + 2),
            String(s.afterK.length),
          ])
        : undefined;
    const skipTemperature = T === 1 && detailed;
    if (detailed || T !== 1) {
      yield plotFrame([text(t), logitPlane(s), probPlane(s, 'base'), readouts()], {
        line: 0,
        note: logitNote,
        vars: { context: s.context, step: t + 1 },
        stats: stats(),
        checkpoint: guard(logitNote, tQuestion ?? (skipTemperature ? cutQuestion : undefined)),
      });
    }
    if (!skipTemperature) {
      yield plotFrame([text(t), logitPlane(s), probPlane(s, 'probs'), readouts()], {
        line: 1,
        note: tNote,
        vars: { T, top: vocab[topWord], p: Math.round(s.probs[topWord] * 1000) / 1000 },
        stats: stats(),
        checkpoint: guard(tNote, cutQuestion),
      });
    }

    // 3. The cuts.
    if (cutting) {
      const parts: string[] = [];
      if (k > 0) parts.push(`top-k = ${k} keeps the ${plural(Math.min(k, V), 'most likely word')}`);
      if (p < 1) parts.push(`top-p = ${fmt(p)} then keeps the fewest words, most likely first, whose probabilities add up to at least ${fmt(p)}: ${plural(s.kept.length, 'word')}`);
      const cutNote = `${parts.join('; ')}. The other ${V - s.kept.length} can't be drawn this time, which removes the long tail of unlikely words.`;
      yield plotFrame([text(t), logitPlane(s), probPlane(s, 'cut'), readouts({ kept: s.kept.length })], {
        line: p < 1 ? 3 : 2,
        note: cutNote,
        vars: { kept: s.kept.length, removed: V - s.kept.length },
        stats: stats(),
      });
    }

    // 4. Renormalise and state u.
    const choices = s.kept
      .map((w, j) => ({ w, q: s.q[j] }))
      .sort((a, b) => b.q - a.q)
      .slice(0, 4)
      .map((c) => vocab[c.w]);
    const drawNote = `${cutting ? 'Renormalise the kept words so they sum to 1, and lay them' : 'Lay the words'} end to end: each owns a slice of [0, 1) as wide as its probability. A random number comes up: u = ${fmt(s.u)}.`;
    const uQuestion = s.kept.length > 1 && (detailed || t % 2 === 1) ? ask(`u = ${fmt(s.u)}. Which word's slice does it land in?`, word, choices.filter((w) => w !== word)) : undefined;
    yield plotFrame([text(t), probPlane(s, cutting ? 'kept' : 'probs'), drawPlane(s, false), readouts({ kept: s.kept.length, u: s.u })], {
      line: 5,
      note: drawNote,
      vars: { u: Math.round(s.u * 1000) / 1000 },
      stats: stats(),
      checkpoint: guard(drawNote, uQuestion),
    });

    // 5. Pick and append.
    sampled++;
    const before = s.q.slice(0, s.choice).reduce((a, b) => a + b, 0);
    const rank = s.order.indexOf(s.word) + 1;
    yield plotFrame([text(t + 1, { newest: true }), probPlane(s, cutting ? 'kept' : 'probs'), drawPlane(s, true), readouts({ kept: s.kept.length, u: s.u })], {
      line: 6,
      note: `u = ${fmt(s.u)} falls in ${quote(word)}'s slice, from ${fmt(before)} to ${fmt(before + s.q[s.choice])}, so ${quote(word)} is appended${rank === 1 ? ', the most likely word.' : `: only the ${ordinal(rank)} most likely word, which is what makes sampled text varied.`}`,
      vars: { word, q: Math.round(s.q[s.choice] * 1000) / 1000 },
      stats: stats(),
    });
  }

  const out = steps.map((s) => vocab[s.word]).join(' ');
  const summary = greedy
    ? 'Greedy decoding is deterministic and safe but repetitive: a model that always takes its top word can circle the same phrase forever.'
    : T > 1.2
      ? 'A high temperature gives rare words a real chance, so the text gets surprising, and soon incoherent.'
      : cutting
        ? 'The cuts keep the variety of sampling while ruling out the long tail of nonsense, which is why chat models usually sample with top-p or top-k.'
        : 'Sampling makes the text varied: run it with another seed and the story changes.';
  yield plotFrame([text(steps.length), readouts()], {
    line: 7,
    note: `Generated: ${quote(out)}. ${summary} Real LLMs work the same way, one token at a time, with logits from a transformer over about 100,000 tokens.`,
    vars: { words: steps.length },
    stats: stats(),
  });
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

// ───────────────────────────── input ─────────────────────────────

const base = { topK: 0, topP: 1, prompt: 'the' };

function parse(text: string): { value: SamplingInput } | { error: string } {
  const num = (name: string) => {
    const m = text.match(new RegExp(`\\b${name}\\s*=\\s*(-?[\\d.]+)`, 'i'));
    return m ? Number(m[1]) : undefined;
  };
  const temperature = num('temperature') ?? num('T') ?? 1;
  const topK = num('top-k') ?? 0;
  const topP = num('top-p') ?? 1;
  const seed = num('seed') ?? 1;
  const length = num('length') ?? 6;
  const prompt = (text.match(/\bprompt\s*=\s*(.*)$/i)?.[1] ?? 'the').trim().toLowerCase();
  if (!(temperature >= 0 && temperature <= MAX_TEMPERATURE)) return { error: `temperature must be between 0 and ${MAX_TEMPERATURE}.` };
  if (!Number.isInteger(topK) || topK < 0 || topK > MODEL.vocab.length) return { error: `top-k must be a whole number from 0 (off) to ${MODEL.vocab.length}.` };
  if (!(topP > 0 && topP <= 1)) return { error: 'top-p must be above 0 and at most 1 (1 is off).' };
  if (!Number.isInteger(seed) || seed < 0) return { error: 'seed must be a whole number.' };
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) return { error: `length must be from ${MIN_LENGTH} to ${MAX_LENGTH} words.` };
  const words = promptWords(prompt);
  if (words.length === 0 || words.length > 8) return { error: 'Give a prompt of one to eight words.' };
  const last = words[words.length - 1];
  if (!MODEL.vocab.includes(last)) return { error: `The toy model only knows the story's words; end the prompt with one of: ${MODEL.vocab.join(', ')}.` };
  return { value: { temperature, topK, topP, seed, length, prompt: words.join(' ') } };
}

export const sampling = defineAlgorithm<SamplingInput, PlotState>({
  kind: 'algorithm',
  slug: 'sampling',
  view: 'plot',
  input: {
    examples: [
      { id: 'top-p', label: 'Top-p 0.9', make: ({ seed, size }) => ({ ...base, temperature: 1, topP: 0.9, seed, length: size }) },
      { id: 'greedy', label: 'Greedy (T = 0)', make: ({ seed, size }) => ({ ...base, temperature: 0, seed, length: size }) },
      { id: 'cool', label: 'T = 0.7', make: ({ seed, size }) => ({ ...base, temperature: 0.7, seed, length: size }) },
      { id: 'hot', label: 'T = 1.5', make: ({ seed, size }) => ({ ...base, temperature: 1.5, seed, length: size }) },
      { id: 'top-k', label: 'Top-k 3', make: ({ seed, size }) => ({ ...base, temperature: 1, topK: 3, seed, length: size }) },
    ],
    size: { label: 'Words to generate', min: MIN_LENGTH, max: MAX_LENGTH, default: 6 },
    custom: {
      label: 'Temperature (0–3), top-k (0 = off), top-p (1 = off), seed, length and a prompt',
      placeholder: 'e.g. temperature = 0.8, top-k = 0, top-p = 0.9, seed = 3, length = 6, prompt = the dog',
      parse,
      format: (i) => `temperature = ${plain(i.temperature)}, top-k = ${i.topK}, top-p = ${plain(i.topP)}, seed = ${i.seed}, length = ${i.length}, prompt = ${i.prompt}`,
    },
  },
  pseudocode,
  stats: [
    { key: 'words', label: 'Words generated' },
    { key: 'considered', label: 'Words scored' },
  ],
  legend: [
    { neutral: 'A word and its probability' },
    { tone: 1, label: 'Generated text' },
    { mark: 'reject', label: 'Cut by top-k or top-p' },
    { mark: 'compare', label: 'The random number u' },
    { mark: 'key', label: 'The word drawn' },
  ],
  run,
  content: {
    idea: 'A language model doesn’t write a word; it gives every word a probability, and something has to pick one. Temperature reshapes the probabilities, top-k and top-p cut off the unlikely tail, and a random number makes the choice. Repeat, one token at a time.',
    invariant: 'Whatever the settings, the kept probabilities sum to 1 and keep their order: temperature never makes a less likely word overtake a likelier one, it only changes the gaps. The word drawn is the one whose slice of [0, 1) holds u.',
    whenToUse: 'Every time an LLM generates text. Greedy or low temperature suits answers that must be exact (code, facts, extraction); a higher temperature with top-p suits brainstorming and stories. Top-p adapts to how sure the model is; top-k keeps a fixed number of options.',
    traits: [
      { label: 'Greedy decoding repeats itself', good: false },
      { label: 'Top-p adapts to the model’s confidence', good: true },
      { label: 'Same seed, same text', good: null },
    ],
    experiments: [
      { example: 'greedy', prompt: 'With T = 0 the text soon loops: the same word always follows the same context.' },
      { example: 'hot', prompt: 'T = 1.5 flattens the probabilities: watch rare words get drawn.' },
      { example: 'top-p', prompt: 'See how many words top-p keeps after a word the model is sure about, and after one it isn’t.' },
      { example: 'top-k', prompt: 'Top-k always keeps three words, however lopsided the probabilities are.' },
    ],
  },
});

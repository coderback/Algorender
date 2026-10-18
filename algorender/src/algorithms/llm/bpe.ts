import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, plotFrame } from '@/viz/plot/frame';
import type { Bar, PlanePart, PlotPart, PlotState, Token } from '@/viz/plot/types';
import { BPE_CORPORA, type BpeCorpusId } from './corpus';

export type BpeInput = { text: string; merges: number; unseen: string };

export const MIN_MERGES = 1;
export const MAX_MERGES = 16;
export const MAX_TEXT = 160;
export const MAX_WORD = 20;
/** Pairs drawn in the count chart. */
const SHOWN_PAIRS = 6;

const pseudocode = [
  'split every word into characters',
  'repeat for each merge:',
  '  count adjacent pairs inside words',
  '  (a, b) ← the most frequent pair',
  '  replace each a b with one token ab',
  '  add ab to the vocabulary',
  'new text: apply the merges in order',
];

// ───────────────────────────── the algorithm ─────────────────────────────

/** A token of the training text: `word` says which word it is part of, since merges never cross words. */
export type Tok = { id: string; text: string; word: number };
export type Pair = { a: string; b: string; count: number; first: number };

/** Words GPT style: the first bare, every later one carrying its leading space. */
export function wordsOf(text: string): string[] {
  return normalise(text)
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w : ` ${w}`));
}

export const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text as single characters, ids t0, t1, … by position. */
export function initialTokens(text: string): Tok[] {
  const out: Tok[] = [];
  wordsOf(text).forEach((w, word) => {
    for (const ch of Array.from(w)) out.push({ id: `t${out.length}`, text: ch, word });
  });
  return out;
}

const keyOf = (a: string, b: string) => `${a}\u0000${b}`;

/**
 * Every adjacent pair inside a word with how often it occurs (overlaps
 * counted, as BPE does), most frequent first; ties go to the pair that
 * appears earliest in the text.
 */
export function countPairs(tokens: readonly Tok[]): Pair[] {
  const pairs = new Map<string, Pair>();
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].word !== tokens[i + 1].word) continue;
    const k = keyOf(tokens[i].text, tokens[i + 1].text);
    const p = pairs.get(k);
    if (p) p.count++;
    else pairs.set(k, { a: tokens[i].text, b: tokens[i + 1].text, count: 1, first: i });
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count || x.first - y.first);
}

/**
 * Replaces each occurrence of a then b inside a word, left to right without
 * overlaps, by one token ab that keeps a's id (so it glides into place).
 */
export function applyMerge(tokens: readonly Tok[], a: string, b: string): { tokens: Tok[]; replaced: number; merged: string[] } {
  const out: Tok[] = [];
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (next && t.word === next.word && t.text === a && next.text === b) {
      out.push({ id: t.id, text: a + b, word: t.word });
      merged.push(t.id);
      i++;
    } else out.push(t);
  }
  return { tokens: out, replaced: merged.length, merged };
}

export type MergeStep = { pair: Pair; pairs: Pair[]; before: Tok[]; after: Tok[]; replaced: number; merged: string[] };

/** Learns up to `merges` merges; stops early when every word is a single token. */
export function train(text: string, merges: number): { steps: MergeStep[]; final: Tok[] } {
  let tokens = initialTokens(text);
  const steps: MergeStep[] = [];
  for (let m = 0; m < merges; m++) {
    const pairs = countPairs(tokens);
    if (pairs.length === 0) break;
    const pair = pairs[0];
    const { tokens: after, replaced, merged } = applyMerge(tokens, pair.a, pair.b);
    steps.push({ pair, pairs, before: tokens, after, replaced, merged });
    tokens = after;
  }
  return { steps, final: tokens };
}

/** Encodes one word (with its leading space) by applying the learned merges in the order they were learned. */
export function encode(word: string, merges: readonly (readonly [string, string])[]): { pieces: Tok[]; applied: { index: number; tokens: Tok[]; merged: string[] }[] } {
  let tokens: Tok[] = Array.from(word).map((ch, i) => ({ id: `u${i}`, text: ch, word: 0 }));
  const applied: { index: number; tokens: Tok[]; merged: string[] }[] = [];
  merges.forEach(([a, b], index) => {
    const r = applyMerge(tokens, a, b);
    if (r.replaced > 0) {
      tokens = r.tokens;
      applied.push({ index, tokens, merged: r.merged });
    }
  });
  return { pieces: tokens, applied };
}

// ───────────────────────────── the trace ─────────────────────────────

const show = (s: string) => s.replace(/ /g, '·');
const pairLabel = (p: { a: string; b: string }) => `${show(p.a)} + ${show(p.b)}`;
const quote = (s: string) => `“${show(s)}”`;
const split = (toks: readonly Tok[]) => toks.map((t) => show(t.text)).join(' | ');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Drops a question whose worded answer the note already says (the trace checks forbid it). */
function guard(note: string, c: Checkpoint | undefined): Checkpoint | undefined {
  if (!c) return undefined;
  const answer = c.choices[c.answer] ?? '';
  return /[a-z]{4,}/i.test(answer) && note.includes(answer) ? undefined : c;
}

function* run(input: BpeInput): Generator<Frame<PlotState>> {
  const text = normalise(input.text);
  const start = initialTokens(text);
  const { steps, final } = train(text, input.merges);
  const merges = steps.map((s) => [s.pair.a, s.pair.b] as const);
  const unseenWord = ` ${input.unseen}`;
  const alphabet = new Set(start.map((t) => t.text)).size;

  let mergesDone = 0;
  let saved = 0;
  const stats = () => ({ merges: mergesDone, saved });

  const corpus = (toks: readonly Tok[], marks: { merged?: readonly string[]; pending?: readonly string[] } = {}): PlotPart => {
    const merged = new Set(marks.merged ?? []);
    const pending = new Set(marks.pending ?? []);
    const tokens: Token[] = toks.map((t) => ({ id: t.id, text: t.text, mark: merged.has(t.id) ? 'found' : pending.has(t.id) ? 'compare' : null }));
    return { kind: 'tokens', id: 'corpus', label: `Training text: ${plural(toks.length, 'token')}`, tokens };
  };
  const vocab = (n: number, newest = false): PlotPart => ({
    kind: 'tokens',
    id: 'vocab',
    label: n === 0 ? 'Learned merges: none yet' : `Learned merges, in order (vocabulary: ${alphabet} characters + ${n})`,
    tokens: steps.slice(0, n).map((s, i) => ({ id: `v${i}`, text: s.pair.a + s.pair.b, sub: `#${i + 1}`, mark: newest && i === n - 1 ? 'key' : null })),
  });
  const chart = (pairs: readonly Pair[] | null, winner?: Pair): PlanePart => {
    const top = (pairs ?? []).slice(0, SHOWN_PAIRS);
    const bars: Bar[] = top.map((p, i) => ({
      id: keyOf(p.a, p.b),
      x0: i - 0.35,
      x1: i + 0.35,
      y: p.count,
      label: String(p.count),
      mark: winner && p === winner ? 'key' : null,
    }));
    return {
      kind: 'plane',
      id: 'pairs',
      label: pairs ? 'How often each adjacent pair occurs (top pairs)' : 'Pair counts (counted again next step)',
      x: { min: -0.6, max: SHOWN_PAIRS - 0.4, ticks: top.map((p, i) => ({ at: i, label: pairLabel(p) })) },
      y: { min: 0, max: Math.max(3, (top[0]?.count ?? 0) + 1), label: 'times' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'counts', bars }],
      handles: [],
    };
  };
  const readouts = (toks: number, n: number): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'BPE',
    items: [
      { id: 'tokens', label: 'tokens in the text', value: String(toks) },
      { id: 'vocab', label: 'vocabulary', value: String(alphabet + n) },
      { id: 'merges', label: 'merges', value: String(n) },
    ],
  });

  // Which pair merges next, asked on the frame before its counts appear.
  const askNext = (i: number, note: string) => {
    const s = steps[i];
    if (!s || i % 2 !== 0) return undefined;
    return guard(
      note,
      ask(
        'Which pair will be merged next?',
        pairLabel(s.pair),
        s.pairs.slice(1, 4).map((p) => pairLabel(p)),
      ),
    );
  };

  const introNote = `The text split into ${plural(start.length, 'character')} (${alphabet} different). As in GPT's tokenizer, a word's leading space belongs to the word (shown as ·), and pairs are only counted inside a word, never across two. When pairs tie, the one that appears first in the text wins.`;
  yield plotFrame([corpus(start), chart(null), vocab(0), readouts(start.length, 0)], {
    line: 0,
    note: introNote,
    vars: { tokens: start.length, alphabet },
    stats: stats(),
    checkpoint: askNext(0, introNote),
  });

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const tied = s.pairs.filter((p) => p.count === s.pair.count);
    const countNote =
      `Merge ${i + 1}: count every adjacent pair inside a word. There are ${plural(s.pairs.length, 'different pair')}; the most frequent, ${pairLabel(s.pair)}, occurs ${plural(s.pair.count, 'time')}` +
      (tied.length > 1 ? `, tied with ${tied.slice(1).map((p) => pairLabel(p)).join(', ')}, and wins because it appears first in the text.` : '.') +
      (s.replaced < s.pair.count ? ` Some of those overlap (as in ${quote(s.pair.a + s.pair.b + s.pair.b)}), and an overlapping pair can only be merged once.` : '');
    const after = s.before.length - s.replaced;
    const tokenQuestion =
      i % 2 === 1 || s.replaced < s.pair.count
        ? ask(`How many tokens will the text have after merging ${pairLabel(s.pair)}?`, String(after), [
            String(s.before.length - s.pair.count),
            String(after - 1),
            String(after + 1),
            String(s.before.length - 2 * s.replaced),
          ])
        : undefined;
    const pending = s.merged.flatMap((id) => {
      const k = s.before.findIndex((t) => t.id === id);
      return [id, s.before[k + 1].id];
    });
    yield plotFrame([corpus(s.before, { pending }), chart(s.pairs, s.pair), vocab(i), readouts(s.before.length, i)], {
      line: 3,
      note: countNote,
      vars: { a: show(s.pair.a), b: show(s.pair.b), count: s.pair.count, tokens: s.before.length },
      stats: stats(),
      checkpoint: guard(countNote, tokenQuestion),
    });

    mergesDone++;
    saved += s.replaced;
    const mergedNote = `Replace each ${pairLabel(s.pair)} with the single token ${quote(s.pair.a + s.pair.b)}: ${plural(s.replaced, 'replacement')}, so the text shrinks from ${s.before.length} to ${s.after.length} tokens. ${quote(s.pair.a + s.pair.b)} joins the vocabulary as merge #${i + 1}.`;
    yield plotFrame([corpus(s.after, { merged: s.merged }), chart(null), vocab(i + 1, true), readouts(s.after.length, i + 1)], {
      line: 5,
      note: mergedNote,
      vars: { merged: show(s.pair.a + s.pair.b), tokens: s.after.length, vocabulary: alphabet + i + 1 },
      stats: stats(),
      checkpoint: askNext(i + 1, mergedNote),
    });
  }

  const n = steps.length;
  const stoppedEarly = n < input.merges;

  // Encoding a word the tokenizer never saw.
  const { pieces, applied } = encode(unseenWord, merges);
  const chars = Array.from(unseenWord).map((ch, k) => ({ id: `u${k}`, text: ch, word: 0 }));
  const unseen = (toks: readonly Tok[], merged: readonly string[] = []): PlotPart => ({
    kind: 'tokens',
    id: 'unseen',
    label: `A new word: ${plural(toks.length, 'token')}`,
    tokens: toks.map((t) => ({ id: t.id, text: t.text, mark: merged.includes(t.id) ? 'found' : null })),
  });
  const halfway = encode(unseenWord, merges.slice(0, Math.floor(n / 2))).pieces;
  const greedyLongest = longestMatch(unseenWord, steps.map((s) => s.pair.a + s.pair.b));
  const encodeNote = `${stoppedEarly ? `Every word is now a single token, so training stops after ${plural(n, 'merge')}. ` : ''}Now tokenize ${quote(unseenWord)}, a word the training text never contained: start from its characters and apply the ${plural(n, 'learned merge')} in the order they were learned.`;
  yield plotFrame([unseen(chars), corpus(final), vocab(n), readouts(final.length, n)], {
    line: 6,
    note: encodeNote,
    vars: { word: show(unseenWord), characters: chars.length },
    stats: stats(),
    checkpoint: guard(
      encodeNote,
      ask(`How will ${quote(unseenWord)} be split?`, split(pieces), [split(chars), split(halfway), split(greedyLongest)]),
    ),
  });

  let prevIndex = -1;
  for (const a of applied) {
    const skipped = a.index - prevIndex - 1;
    const s = steps[a.index];
    yield plotFrame([unseen(a.tokens, a.merged), corpus(final), vocab(n), readouts(final.length, n)], {
      line: 6,
      note: `${skipped > 0 ? `${skipped === 1 ? `Merge #${a.index}` : `Merges #${prevIndex + 2} to #${a.index}`} ${skipped === 1 ? 'does' : 'do'} not occur in it. ` : ''}Merge #${a.index + 1}, ${pairLabel(s.pair)}, does: ${split(a.tokens)}.`,
      vars: { merge: a.index + 1, tokens: a.tokens.length },
      stats: stats(),
    });
    prevIndex = a.index;
  }

  const known = pieces.filter((p) => p.text.length > 1).length;
  yield plotFrame([unseen(pieces), corpus(final), vocab(n), readouts(final.length, n)], {
    line: 6,
    note:
      `${quote(unseenWord)} becomes ${plural(pieces.length, 'token')}: ${split(pieces)}. ${known > 0 ? `${known === 1 ? 'One piece is' : `${known} pieces are`} learned from the training text, so a new word is built from familiar parts` : 'None of the merges apply, so it stays as single characters'}, and no word is ever "unknown": at worst it falls back to characters (GPT-2 falls back to bytes). ` +
      `Training took the text from ${start.length} to ${final.length} tokens with ${alphabet + n} vocabulary entries; real tokenizers learn about 50,000 to 200,000 merges from billions of words.`,
    vars: { tokens: pieces.length, vocabulary: alphabet + n },
    stats: stats(),
  });
}

/** The split a greedy longest-match tokenizer would choose (a common wrong guess about how BPE encodes). */
function longestMatch(word: string, vocab: readonly string[]): Tok[] {
  const out: Tok[] = [];
  const chars = Array.from(word);
  let i = 0;
  while (i < chars.length) {
    let len = 1;
    for (const v of vocab) {
      const n = Array.from(v).length;
      if (n > len && chars.slice(i, i + n).join('') === v) len = n;
    }
    out.push({ id: `g${i}`, text: chars.slice(i, i + len).join(''), word: 0 });
    i += len;
  }
  return out;
}

// ───────────────────────────── input ─────────────────────────────

const presetInput = (id: BpeCorpusId, merges: number): BpeInput => ({ text: BPE_CORPORA[id].text, merges, unseen: BPE_CORPORA[id].unseen });

function parse(text: string): { value: BpeInput } | { error: string } {
  const [body, ...rest] = text.split('|');
  const corpusText = normalise(body ?? '');
  if (corpusText.length < 3) return { error: 'Write a short text to train on, then | merges = 8 | new word = cats.' };
  if (corpusText.length > MAX_TEXT) return { error: `Keep the text to ${MAX_TEXT} characters.` };
  const option = (name: RegExp) => rest.map((r) => r.match(name)?.[1]?.trim()).find((v) => v !== undefined);
  const mergesText = option(/^\s*merges\s*=\s*(.*)$/i);
  const merges = mergesText === undefined ? 8 : Number(mergesText);
  if (!Number.isInteger(merges) || merges < MIN_MERGES || merges > MAX_MERGES) return { error: `merges must be a whole number from ${MIN_MERGES} to ${MAX_MERGES}.` };
  const words = corpusText.split(' ');
  const unseen = option(/^\s*new word\s*=\s*(.*)$/i) ?? `${words[0]}${words[words.length - 1]}`;
  if (unseen === '' || /\s/.test(unseen) || unseen.length > MAX_WORD) return { error: `The new word must be one word of at most ${MAX_WORD} characters.` };
  return { value: { text: corpusText, merges, unseen } };
}

export const bpe = defineAlgorithm<BpeInput, PlotState>({
  kind: 'algorithm',
  slug: 'bpe',
  view: 'plot',
  input: {
    examples: [
      { id: 'suffixes', label: BPE_CORPORA.suffixes.label, make: ({ size }) => presetInput('suffixes', size) },
      { id: 'sentence', label: BPE_CORPORA.sentence.label, make: ({ size }) => presetInput('sentence', size) },
      { id: 'banana', label: BPE_CORPORA.banana.label, make: ({ size }) => presetInput('banana', size) },
    ],
    size: { label: 'Merges', min: MIN_MERGES, max: MAX_MERGES, default: 8 },
    custom: {
      label: `Your own text (up to ${MAX_TEXT} characters), the number of merges and a new word to encode`,
      placeholder: 'e.g. the cat sat on the mat | merges = 8 | new word = cats',
      parse,
      format: ({ text, merges, unseen }) => `${text} | merges = ${merges} | new word = ${unseen}`,
    },
  },
  pseudocode,
  stats: [
    { key: 'merges', label: 'Merges learned' },
    { key: 'saved', label: 'Tokens saved' },
  ],
  legend: [
    { neutral: 'A token' },
    { mark: 'compare', label: 'The pair about to merge' },
    { mark: 'found', label: 'Just merged' },
    { mark: 'key', label: 'The most frequent pair, the newest merge' },
  ],
  run,
  content: {
    idea: 'Byte-pair encoding builds a tokenizer from data. Start with single characters, count which two neighbours occur together most often, glue them into one new token, and repeat. Frequent words end up as one token, rare ones as a few familiar pieces.',
    invariant: 'Joining the tokens always gives back the original text: a merge only changes where the cuts are. Each merge removes exactly as many tokens as it replaces, and new text is encoded by replaying the merges in the order they were learned.',
    whenToUse: 'Nearly every large language model reads and writes BPE tokens (or a close cousin such as WordPiece or a unigram model), because a fixed vocabulary of subwords covers any text without an "unknown word" and keeps common words short.',
    traits: [
      { label: 'Never meets an unknown word', good: true },
      { label: 'Common words become one token', good: true },
      { label: 'Splits rare words and numbers oddly', good: false },
      { label: 'Greedy: merges are never undone', good: null },
    ],
    experiments: [
      { example: 'suffixes', prompt: 'Watch "er" and "est" become tokens: endings shared by many words win early.' },
      { example: 'sentence', prompt: 'Frequent short words such as "the" turn into single tokens within a few merges.' },
      { example: 'banana', prompt: 'In "ana" the pairs overlap: count the pairs, then count how many tokens one merge actually removes.' },
    ],
  },
});

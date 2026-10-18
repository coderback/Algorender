// Small texts of our own for the language-model visualisers: corpora to train
// a BPE tokenizer on, and a short story whose word-pair counts stand in for a
// language model's output layer when sampling.

/** Texts to train BPE on, each with a word it never saw for the encoding step at the end. */
export const BPE_CORPORA = {
  suffixes: { label: 'Shared endings', text: 'low lower lowest slow slower slowest new newer newest wide wider widest', unseen: 'slowly' },
  sentence: { label: 'A sentence', text: 'the cat sat on the mat and the cat ate the rat that sat on the hat', unseen: 'cats' },
  banana: { label: 'Repeated letters', text: 'banana bandana cabana ban bandanas', unseen: 'panama' },
} as const;

export type BpeCorpusId = keyof typeof BPE_CORPORA;

/**
 * The story the toy model is counted from. A full stop is a word of its own,
 * so the model can end a sentence.
 */
export const STORY =
  'the cat sat on the mat . the cat sat on the rug . the dog sat by the door . the cat ate the fish . ' +
  'the dog ate a bone . a bird sat on the fence . the dog saw the cat and the cat ran up a tree . ' +
  'the bird sang in the tree . a dog ran to the park and sat in the sun .';

/**
 * Add-α smoothing: a word never seen after the context still gets a small
 * count, so like a real model's it is unlikely but never impossible.
 */
export const SMOOTHING = 0.001;

export type BigramModel = {
  /** Every word of the story, in order of first appearance. */
  vocab: readonly string[];
  /** counts[prev][next]: how often `next` followed `prev`. */
  counts: ReadonlyMap<string, ReadonlyMap<string, number>>;
};

export function bigramModel(text: string = STORY): BigramModel {
  const words = text.split(/\s+/).filter(Boolean);
  const vocab: string[] = [];
  for (const w of words) if (!vocab.includes(w)) vocab.push(w);
  const counts = new Map<string, Map<string, number>>();
  for (let i = 0; i + 1 < words.length; i++) {
    const row = counts.get(words[i]) ?? new Map<string, number>();
    row.set(words[i + 1], (row.get(words[i + 1]) ?? 0) + 1);
    counts.set(words[i], row);
  }
  return { vocab, counts };
}

export const MODEL = bigramModel();

/** How often each vocabulary word followed `prev` (0 for never). */
export function countsAfter(model: BigramModel, prev: string): number[] {
  const row = model.counts.get(prev);
  return model.vocab.map((w) => row?.get(w) ?? 0);
}

/**
 * The toy model's scores for the next word: ln(count + α). A real LLM's last
 * layer produces one such logit per token in its vocabulary; here they are
 * counted instead of learned.
 */
export function logitsAfter(model: BigramModel, prev: string): number[] {
  return countsAfter(model, prev).map((c) => Math.log(c + SMOOTHING));
}

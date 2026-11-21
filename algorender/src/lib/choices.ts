// The order a question's choices are shown in. Authors write the right
// answer wherever is natural, often first, and nothing shuffled them, so a
// learner could learn "the first one is usually right". Every place that
// shows authored choices (lesson quizzes, review cards, the placement check,
// stage checkpoints, PredictCode, choice tasks) shows them in this order
// instead: a shuffle seeded by the question itself, so it is the same on the
// server and in the browser (no hydration mismatch), the same every time a
// question is asked, and no position is favoured across questions.
// Answers and traps stay indices into the authored `choices`; only the
// display order changes, so nothing recorded depends on it.

/** FNV-1a: a small, stable 32-bit hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a seeded generator of numbers in [0, 1). */
function generator(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The authored indices of `n` choices in the order to show them, seeded by `key` (the question's text). */
export function choiceOrder(key: string, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const next = generator(hash(`${key}\u0000${n}`));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

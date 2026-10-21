import { defineAlgorithm } from '@/engine/module';
import { TextTracer, type CellRef } from '@/viz/text/tracer';
import type { TextState } from '@/viz/text/types';
import { COMPARISONS, HASH_BASE, HASH_MOD, hashOf, letterValue, matchInput, type MatchInput, naiveComparisons, quote } from './shared';

const pseudocode = [
  'rabinKarp(T, P):',
  '  hp ← hash(P);  h ← hash(T[0..m−1])',
  '  for s from 0 to n − m:',
  '    if h = hp:',
  '      if T[s..s+m−1] = P: report s',
  '    if s < n − m:',
  '      h ← roll(h, T[s], T[s + m])',
];

const TEXT = 'text';
const PAT = 'pattern';

function* run({ text, pattern }: MatchInput) {
  const n = text.length;
  const m = pattern.length;
  const t = new TextTracer({
    columns: n,
    stats: ['hashComparisons', 'comparisons', 'spurious'],
    results: { label: 'Matches at', empty: 'none yet' },
  });
  t.addRow(TEXT, 'Text T', text, { rangeLabels: true });
  t.addRow(PAT, 'Pattern P', pattern);
  if (m === 0 || m > n) {
    t.setResults([], 'none');
    yield t.frame({ note: m === 0 ? 'The pattern is empty.' : 'The pattern is longer than the text, so it cannot occur.' });
    return;
  }

  const windowAt = (s: number) => [{ row: TEXT, from: s, to: s + m - 1, tone: 'active' as const, label: 'window' }];
  const pairs = (s: number, count: number): CellRef[] =>
    Array.from({ length: count }, (_, j) => [[TEXT, s + j] as const, [PAT, j] as const]).flat();

  yield t.frame({
    note: `Rabin–Karp compares one number per window, a hash, instead of ${m} characters. Sliding to the next window updates the hash in a single step, and characters are only compared when the hashes agree.`,
    ranges: windowAt(0),
  });

  const hp = hashOf(pattern);
  let h = hashOf(text.slice(0, m));
  let top = 1; // HASH_BASE^(m−1) mod HASH_MOD: the weight of the letter that leaves the window
  for (let k = 1; k < m; k++) top = (top * HASH_BASE) % HASH_MOD;
  t.setReadout('hp', 'Pattern hash', hp);
  t.setReadout('h', 'Window hash', h);
  t.setReadout('naive', 'Naive search, same text', `${naiveComparisons(text, pattern)} comparisons`);
  // Each window joins the history once its fate is known, never while a question about it is open.
  const seen = (s: number, h: number, detail: string, mark?: 'found' | 'reject') =>
    t.addHistory('Windows', { id: `w${s}`, text: text.slice(s, s + m), detail: `hash ${h} · ${detail}`, ...(mark && { mark }) });
  yield t.frame({
    line: 1,
    note: `Hash the pattern and the first window the same way: each letter is a digit (a = 1 … z = 26), the word is read as a base-${HASH_BASE} number, and only the remainder mod ${HASH_MOD} is kept. hash(${quote(pattern)}) = ${hp}; hash(${quote(text.slice(0, m))}) = ${h}.`,
    ranges: windowAt(0),
    vars: { n, m, hp, h },
  });

  let explainedSkip = false;
  let explainedRoll = false;
  const found: number[] = [];
  for (let s = 0; s <= n - m; s++) {
    const win = text.slice(s, s + m);
    const vars = { s, hp, h };
    t.count('hashComparisons');

    if (h !== hp) {
      if (!explainedSkip) {
        explainedSkip = true;
        yield t.frame({
          line: 3,
          note: `Compare the window's hash, ${h}, with the pattern's, ${hp}.`,
          ranges: windowAt(s),
          readoutMarks: { h: 'compare', hp: 'compare' },
          vars,
          checkpoint: {
            question: `The hashes differ. Could the window ${quote(win)} still match the pattern?`,
            choices: ['Yes, so check its characters', 'No, so skip it'],
            answer: 1,
          },
        });
        seen(s, h, 'skip');
        yield t.frame({
          line: 3,
          note: `${h} ≠ ${hp}. Equal words always get equal hashes, so different hashes prove this window is not a match: skip it without reading a single character.`,
          ranges: windowAt(s),
          readoutMarks: { h: 'reject' },
          vars,
        });
      } else {
        seen(s, h, 'skip');
        yield t.frame({
          line: 3,
          note: `Window ${s} (${quote(win)}): hash ${h} ≠ ${hp}, so it can't match. Skip it.`,
          ranges: windowAt(s),
          readoutMarks: { h: 'reject' },
          vars,
        });
      }
    } else {
      const real = win === pattern;
      yield t.frame({
        line: 3,
        note: `Window ${s} (${quote(win)}): its hash, ${h}, equals the pattern's.`,
        ranges: windowAt(s),
        readoutMarks: { h: 'compare', hp: 'compare' },
        vars,
        checkpoint: {
          question: 'The hashes are equal. Is this a real match?',
          choices: ['Yes: the letters match too', 'No: a spurious hit'],
          answer: real ? 0 : 1,
        },
      });
      let j = 0;
      for (; j < m; j++) {
        t.count('comparisons');
        if (text[s + j] !== pattern[j]) break;
      }
      if (j === m) {
        t.mark('found', ...Array.from({ length: m }, (_, k): CellRef => [TEXT, s + k]));
        t.addResult(String(s));
        found.push(s);
        seen(s, h, 'letters match', 'found');
        yield t.frame({
          line: 4,
          note: `Check the letters one by one: all ${m} agree, so P occurs at position ${s}.`,
          ranges: windowAt(s),
          marks: { found: Array.from({ length: m }, (_, k): CellRef => [PAT, k]) },
          readoutMarks: { h: 'found', hp: 'found' },
          vars,
        });
      } else {
        t.count('spurious');
        seen(s, h, 'same hash, letters differ', 'reject');
        yield t.frame({
          line: 4,
          note: `Check the letters one by one: T[${s + j}] = '${text[s + j]}' but P[${j}] = '${pattern[j]}'. A spurious hit: different words can share a hash, so equal hashes only mean "maybe", and this check is what keeps Rabin–Karp correct.`,
          ranges: windowAt(s),
          marks: { visited: pairs(s, j), reject: [[TEXT, s + j], [PAT, j]] },
          readoutMarks: { h: 'reject' },
          vars,
        });
      }
    }

    if (s < n - m) {
      const out = text[s];
      const inc = text[s + m];
      const before = h;
      const dropped = (((before - letterValue(out) * top) % HASH_MOD) + HASH_MOD) % HASH_MOD;
      h = (dropped * HASH_BASE + letterValue(inc)) % HASH_MOD;
      t.setReadout('h', 'Window hash', h);
      t.setOffset(PAT, s + 1);
      yield t.frame({
        line: 6,
        note: explainedRoll
          ? `Slide: '${out}' leaves, '${inc}' enters. New hash = (${HASH_BASE} × (${before} − ${letterValue(out)} × ${top}) + ${letterValue(inc)}) mod ${HASH_MOD} = ${h}.`
          : `Slide one place: '${out}' leaves and '${inc}' enters. Instead of rehashing, take out the leaving letter's share (${letterValue(out)} × ${HASH_BASE}^${m - 1}, which is ${top} mod ${HASH_MOD}), shift the rest up a place, and add the new letter: (${HASH_BASE} × (${before} − ${letterValue(out)} × ${top}) + ${letterValue(inc)}) mod ${HASH_MOD} = ${h}. The same few steps whatever the pattern's length.`,
        ranges: windowAt(s + 1),
        marks: { write: [[TEXT, s + m]] },
        vars: { s: s + 1, hp, h },
      });
      explainedRoll = true;
    }
  }

  t.setResults(found.map(String), 'none');
  const { hashComparisons, comparisons, spurious } = t.stats;
  yield t.frame({
    note: `Done: ${found.length === 0 ? 'no match' : found.length === 1 ? `one match, at ${found[0]}` : `${found.length} matches, at ${found.join(', ')}`}. That took ${hashComparisons} hash comparisons but only ${comparisons} letter comparisons${spurious ? `, some of them spent rejecting ${spurious === 1 ? 'a spurious hit' : `${spurious} spurious hits`}` : ''}; checking every window letter by letter could take up to ${(n - m + 1) * m}.`,
    vars: { hashComparisons, comparisons, spurious },
  });
}

export const rabinKarp = defineAlgorithm<MatchInput, TextState>({
  kind: 'algorithm',
  slug: 'rabin-karp',
  view: 'text',
  input: matchInput({ examples: ['repeated', 'collision', 'overlapping', 'none', 'naive'], textMax: 24, defaultSize: 16 }),
  pseudocode,
  stats: [{ key: 'hashComparisons', label: 'Hash comparisons' }, COMPARISONS, { key: 'spurious', label: 'Spurious hits' }],
  legend: [
    { neutral: 'Not compared' },
    { mark: 'compare', label: 'Hashes being compared' },
    { mark: 'write', label: 'Letter rolled into the hash' },
    { mark: 'visited', label: 'Letters agree' },
    { mark: 'reject', label: 'Mismatch or spurious hit' },
    { mark: 'found', label: 'Part of a match' },
  ],
  run,
  content: {
    idea: 'Turn each window of the text into a number, a hash, and compare numbers instead of strings. Sliding the window one place updates the hash with a subtraction, a multiplication and an addition, so most windows are dismissed in one step. Letters are checked only when the hashes agree.',
    invariant: 'h is always the hash of the current window T[s..s+m−1]. Equal words have equal hashes, so a window whose hash differs from the pattern’s can never match.',
    whenToUse: 'Searching for many patterns of the same length at once (keep their hashes in a set), finding duplicated or plagiarised passages, and rolling checksums such as rsync’s. For a single pattern with a guaranteed bound, KMP or the Z-algorithm are safer.',
    traits: [
      { label: 'Expected O(n + m)', good: true },
      { label: 'O(nm) if many hashes collide', good: false },
      { label: 'Handles many patterns at once', good: true },
    ],
    experiments: [
      { example: 'collision', prompt: 'A different word with the same hash is planted in the text. Watch the letter check catch the spurious hit.' },
      { example: 'naive', prompt: 'Every window differs from the pattern by just one letter, yet the hashes dismiss each one without a single letter comparison.' },
      { example: 'overlapping', prompt: 'Matches overlap here. Each window is judged on its own, so none is missed.' },
    ],
  },
});

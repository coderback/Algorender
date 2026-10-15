import { defineAlgorithm } from '@/engine/module';
import { TextTracer, type CellRef } from '@/viz/text/tracer';
import type { TextState } from '@/viz/text/types';
import { matchInput, quote, type MatchInput } from './shared';

const pseudocode = [
  'buildLps(P):',
  '  lps[0] ← 0;  len ← 0;  i ← 1',
  '  while i < m:',
  '    if P[i] = P[len]:',
  '      len ← len + 1;  lps[i] ← len',
  '      i ← i + 1',
  '    elif len > 0: len ← lps[len − 1]',
  '    else: lps[i] ← 0;  i ← i + 1',
  '',
  'kmpSearch(T, P):',
  '  j ← 0   (pattern letters matched)',
  '  for i from 0 to n − 1:',
  '    while j > 0 and T[i] ≠ P[j]:',
  '      j ← lps[j − 1]',
  '    if T[i] = P[j]: j ← j + 1',
  '    if j = m:',
  '      report match at i − m + 1',
  '      j ← lps[m − 1]',
];

const L = {
  init: 1,
  loop: 2,
  test: 3,
  extend: 4,
  fallback: 6,
  zero: 7,
  start: 10,
  forI: 11,
  whileJ: 12,
  slide: 13,
  match: 14,
  report: 16,
  keepBorder: 17,
} as const;

const TEXT = 'text';
const PAT = 'pattern';
const PREFIX = 'prefix';
const LPS = 'lps';

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);
const cells = (row: string, from: number, to: number): CellRef[] => range(from, to).map((k) => [row, k] as const);
const letters = (count: number) => `${count} letter${count === 1 ? '' : 's'}`;
const places = (count: number) => `${count} place${count === 1 ? '' : 's'}`;
/** "1 letter matches", "3 letters match". */
const lettersMatch = (count: number) => `${letters(count)} match${count === 1 ? 'es' : ''}`;

/** Rightmost column the pattern reaches during the search, so the grid never has to grow mid-run. */
function searchSpan(text: string, pattern: string, lps: readonly number[]): number {
  const n = text.length;
  const m = pattern.length;
  let end = n;
  let j = 0;
  for (let i = 0; i < n; i++) {
    for (;;) {
      end = Math.max(end, i - j + m);
      if (text[i] === pattern[j]) {
        j++;
        if (j === m) j = lps[m - 1];
        break;
      }
      if (j === 0) break;
      j = lps[j - 1];
    }
  }
  return end;
}

function* run({ text, pattern }: MatchInput) {
  const n = text.length;
  const m = pattern.length;
  const t = new TextTracer({
    columns: m,
    stats: ['tableComparisons', 'comparisons', 'shifts'],
    results: { label: 'Matches at', empty: 'none yet' },
  });

  // ───────────── phase 1: the lps table, which is KMP run on the pattern against itself ─────────────
  const lps = Array<number>(m).fill(0);
  t.addRow(PAT, 'Pattern P', pattern, { pointers: true });
  t.addRow(PREFIX, 'P again, slid under itself', pattern, { offset: 1, pointers: true });
  t.addRow(LPS, 'lps table', Array<string>(m).fill(''), { kind: 'numbers' });

  yield t.frame({
    note: 'KMP never re-reads text it has already matched. To know how far it can slide after a mismatch, it first studies the pattern alone: lps[i] is the length of the longest proper prefix of P[0..i] that is also a suffix of it (its longest "border").',
  });

  t.setText(LPS, 0, '0');
  let len = 0;
  let i = 1;
  yield t.frame({
    line: L.init,
    note: `lps[0] = 0: a single letter has no proper prefix. len is the length of the border being extended, and P is slid under itself so that its prefix lines up with the letters just before i.`,
    marks: { write: [[LPS, 0]] },
    pointers: m > 1 ? { i: [PAT, i], len: [PREFIX, len] } : {},
    vars: { m, i, len },
  });

  while (i < m) {
    const a = pattern[i];
    const b = pattern[len];
    t.count('tableComparisons');
    const matched = { visited: [...cells(PAT, i - len, i - 1), ...cells(PREFIX, 0, len - 1)] };
    const extend = `lps[${i}] = ${len + 1}`;
    const zero = `lps[${i}] = 0`;
    const fall = len > 0 ? `Fall back to len = lps[${len - 1}] = ${lps[len - 1]}` : '';
    yield t.frame({
      line: L.test,
      note:
        len > 0
          ? `${quote(pattern.slice(i - len, i))}, just before position ${i}, is also P's start: a border of length ${len}. Can it grow? Compare the next pair: P[${i}] = '${a}' with P[${len}] = '${b}'.`
          : `Compare P[${i}] = '${a}' with P[0] = '${b}'.`,
      marks: { ...matched, compare: [[PAT, i], [PREFIX, len]] },
      pointers: { i: [PAT, i], len: [PREFIX, len] },
      vars: { i, len, 'P[i]': a, 'P[len]': b },
      checkpoint: {
        question: 'What happens next?',
        choices: len > 0 ? [extend, zero, fall] : [extend, zero],
        answer: a === b ? 0 : len > 0 ? 2 : 1,
      },
    });

    if (a === b) {
      len++;
      lps[i] = len;
      t.setText(LPS, i, String(len));
      yield t.frame({
        line: L.extend,
        note: `Match: ${quote(pattern.slice(i - len + 1, i + 1))} is both a prefix of P and a suffix of P[0..${i}], so lps[${i}] = ${len}.`,
        marks: { visited: [...cells(PAT, i - len + 1, i), ...cells(PREFIX, 0, len - 1)], write: [[LPS, i]] },
        pointers: { i: [PAT, i], len: [PREFIX, len - 1] },
        vars: { i, len },
      });
      i++;
    } else if (len > 0) {
      const old = len;
      len = lps[len - 1];
      t.setOffset(PREFIX, i - len);
      yield t.frame({
        line: L.fallback,
        note: `Mismatch, so no border of length ${old + 1} ends at ${i}. The next candidate is the longest border of what already matched, lps[${old - 1}] = ${len}: fall back to len = ${len}, sliding the prefix right, and compare P[${i}] again.`,
        marks: { visited: [...cells(PAT, i - len, i - 1), ...cells(PREFIX, 0, len - 1)], key: [[LPS, old - 1]], reject: [[PAT, i]] },
        pointers: { i: [PAT, i], len: [PREFIX, len] },
        vars: { i, len },
      });
    } else {
      lps[i] = 0;
      t.setText(LPS, i, '0');
      i++;
      t.setOffset(PREFIX, i);
      yield t.frame({
        line: L.zero,
        note: `Mismatch with P[0]: no border ends at position ${i - 1}, so lps[${i - 1}] = 0.${i < m ? ` Move on to i = ${i}.` : ''}`,
        marks: { write: [[LPS, i - 1]], reject: [[PAT, i - 1]] },
        pointers: i < m ? { i: [PAT, i], len: [PREFIX, 0] } : {},
        vars: { i, len },
      });
    }
  }

  yield t.frame({
    line: L.loop,
    note: `The table is complete: lps = [${lps.join(', ')}], found with ${t.stats.tableComparisons} comparisons. lps[j − 1] says how many pattern letters still match after a mismatch at P[j].`,
    vars: { m },
  });

  // ───────────── phase 2: one left-to-right pass over the text ─────────────
  t.removeRow(PAT);
  t.removeRow(PREFIX);
  t.removeRow(LPS);
  t.setColumns(searchSpan(text, pattern, lps));
  t.addRow(TEXT, 'Text T', text, { pointers: true });
  t.addRow(PAT, 'Pattern P (shift i − j)', pattern, { pointers: true });
  t.addRow(LPS, 'lps (moves with P)', lps.map(String), { kind: 'numbers' });

  let j = 0;
  yield t.frame({
    line: L.start,
    note: 'Now scan the text once, left to right. j counts the pattern letters matched so far, so the pattern sits under the text at shift i − j. The text pointer i never moves backwards.',
    pointers: { i: [TEXT, 0], j: [PAT, 0] },
    vars: { n, m, j },
  });

  const found: number[] = [];
  for (i = 0; i < n; i++) {
    for (;;) {
      const tc = text[i];
      const pc = pattern[j];
      t.count('comparisons');
      const progress = { visited: [...cells(TEXT, i - j, i - 1), ...cells(PAT, 0, j - 1)] };
      const matchChoice = j + 1 === m ? 'Match: the whole pattern matches' : `Match: j becomes ${j + 1}`;
      yield t.frame({
        line: j > 0 ? L.whileJ : L.match,
        note: j > 0 ? `${lettersMatch(j)} so far. Compare T[${i}] = '${tc}' with P[${j}] = '${pc}'.` : `Compare T[${i}] = '${tc}' with P[0] = '${pc}'.`,
        marks: { ...progress, compare: [[TEXT, i], [PAT, j]] },
        pointers: { i: [TEXT, i], j: [PAT, j] },
        vars: { i, j, shift: i - j, 'T[i]': tc, 'P[j]': pc },
        checkpoint:
          j > 0
            ? {
                question: 'What happens next?',
                // The naive move (back up and restart one place right) is a distractor only once it differs from KMP's.
                choices: [
                  `Mismatch: slide so j = lps[${j - 1}] = ${lps[j - 1]}`,
                  matchChoice,
                  ...(j > 1 ? [`Mismatch: back up to T[${i - j + 1}] and restart`] : []),
                ],
                answer: tc === pc ? 1 : 0,
              }
            : { question: 'What happens next?', choices: [matchChoice, 'Mismatch: move on to the next letter'], answer: tc === pc ? 0 : 1 },
      });

      if (tc === pc) {
        j++;
        if (j < m) {
          yield t.frame({
            line: L.match,
            note: `T[${i}] = P[${j - 1}] = '${tc}': now ${lettersMatch(j)}.`,
            marks: { visited: [...cells(TEXT, i - j + 1, i), ...cells(PAT, 0, j - 1)] },
            pointers: { i: [TEXT, i], j: [PAT, j - 1] },
            vars: { i, j, shift: i - j + 1 },
          });
          break;
        }
        const at = i - m + 1;
        found.push(at);
        t.mark('found', ...cells(TEXT, at, i));
        t.addResult(String(at));
        yield t.frame({
          line: L.report,
          note: `T[${i}] = P[${m - 1}] = '${tc}': all ${letters(m)} agree, so P occurs at position ${at}.`,
          marks: { found: cells(PAT, 0, m - 1) },
          pointers: { i: [TEXT, i], j: [PAT, m - 1] },
          vars: { i, j, shift: at },
        });
        j = lps[m - 1];
        if (i < n - 1) {
          t.count('shifts');
          t.setOffset(PAT, i + 1 - j);
          yield t.frame({
            line: L.keepBorder,
            note:
              j > 0
                ? `To catch overlapping matches, keep P's longest border: j = lps[${m - 1}] = ${j}. The pattern slides ${places(m - j)} right, its first ${letters(j)} already lined up, and the search goes on at T[${i + 1}].`
                : `P has no border (lps[${m - 1}] = 0), so no other match can overlap this one: j = 0, and the pattern slides past it to T[${i + 1}].`,
            marks: { key: [[LPS, m - 1]], visited: [...cells(TEXT, i + 1 - j, i), ...cells(PAT, 0, j - 1)] },
            pointers: { i: [TEXT, i + 1], j: [PAT, j] },
            vars: { i: i + 1, j, shift: i + 1 - j },
          });
        }
        break;
      }

      if (j > 0) {
        const old = j;
        j = lps[j - 1];
        t.count('shifts');
        t.setOffset(PAT, i - j);
        yield t.frame({
          line: L.slide,
          note:
            j > 0
              ? `Mismatch. The ${letters(old)} just matched are P[0..${old - 1}], whose longest border is lps[${old - 1}] = ${j}, so the last ${letters(j)} read already match P's start. Slide the pattern ${places(old - j)} right and compare T[${i}] again: no earlier text letter is re-read.`
              : `Mismatch. The ${letters(old)} just matched have no border (lps[${old - 1}] = 0), so no match can start inside them. Slide the pattern ${places(old)} right, to start at T[${i}], and compare it again.`,
          marks: { key: [[LPS, old - 1]], reject: [[TEXT, i]], visited: [...cells(TEXT, i - j, i - 1), ...cells(PAT, 0, j - 1)] },
          pointers: { i: [TEXT, i], j: [PAT, j] },
          vars: { i, j, shift: i - j },
        });
        continue;
      }

      if (i < n - 1) {
        t.count('shifts');
        t.setOffset(PAT, i + 1);
      }
      yield t.frame({
        line: L.forI,
        note: `Mismatch with P[0]: no match can start at ${i}.${i < n - 1 ? ' Move on to the next letter; the pattern slides one place.' : ' That was the last letter.'}`,
        marks: { reject: [[TEXT, i]] },
        pointers: i < n - 1 ? { i: [TEXT, i + 1], j: [PAT, 0] } : { i: [TEXT, i] },
        vars: { i, j },
      });
      break;
    }
  }

  t.setResults(found.map(String), 'none');
  const { tableComparisons, comparisons } = t.stats;
  yield t.frame({
    note: `Done: ${found.length === 0 ? 'no match' : found.length === 1 ? `one match, at ${found[0]}` : `${found.length} matches, at ${found.join(', ')}`}. The search made ${comparisons} comparisons on a text of ${n} letters (never more than 2n: each one either advances i or slides the pattern), plus ${tableComparisons} to build the table.`,
    vars: { tableComparisons, comparisons },
  });
}

export const kmp = defineAlgorithm<MatchInput, TextState>({
  kind: 'algorithm',
  slug: 'kmp',
  view: 'text',
  input: matchInput({ examples: ['overlapping', 'repeated', 'naive', 'none'], textMax: 24, defaultSize: 14 }),
  pseudocode,
  stats: [
    { key: 'tableComparisons', label: 'Comparisons building lps' },
    { key: 'comparisons', label: 'Comparisons searching' },
    { key: 'shifts', label: 'Pattern shifts' },
  ],
  legend: [
    { neutral: 'Not compared yet' },
    { mark: 'compare', label: 'Being compared' },
    { mark: 'visited', label: 'Matched so far' },
    { mark: 'reject', label: 'Mismatch' },
    { mark: 'write', label: 'lps entry written' },
    { mark: 'key', label: 'lps entry used to slide' },
    { mark: 'found', label: 'Part of a match' },
  ],
  run,
  content: {
    idea: 'After j letters match and the next one does not, those j text letters are already known: they equal the pattern’s first j. KMP precomputes, for each prefix of the pattern, how much of it can still be matched after a slide (its longest border), so it never moves backwards in the text.',
    invariant: 'During the search, the last j letters read from the text equal the first j letters of the pattern, and no match starting before i − j has been missed.',
    whenToUse: 'Single-pattern search with a guaranteed O(n + m) bound, including streams where the text can’t be re-read. The lps table is the “failure function” that Aho–Corasick generalises to many patterns at once.',
    traits: [
      { label: 'Never moves back in the text', good: true },
      { label: 'O(n + m) worst case', good: true },
      { label: 'O(m) extra space for the table', good: null },
    ],
    experiments: [
      { example: 'naive', prompt: 'A naive matcher re-reads almost the whole pattern at every shift here. Count KMP’s comparisons instead: never more than 2n.' },
      { example: 'overlapping', prompt: 'After each match j falls back to lps[m − 1], not 0, so overlapping matches are caught. Which lps entries get used?' },
      { example: 'repeated', prompt: 'Watch the table being built first: it is the same matching idea, run on the pattern against itself.' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { CELLS, numberChoices, randomWord, stringPairCustom, type StringPair } from './shared';

const pseudocode = [
  'L[i,0] ← 0;  L[0,j] ← 0',
  'for i from 1 to m:',
  '  for j from 1 to n:',
  '    if A[i] = B[j]:',
  '      L[i,j] ← L[i−1,j−1] + 1',
  '    else:',
  '      L[i,j] ← max(L[i−1,j], L[i,j−1])',
  '',
  'trace back from L[m,n]:',
  '  if A[i] = B[j]: keep it, go ↖',
  '  else: go to the larger of ↑, ←',
];

const LIST = 'lcs';
const RULE = 'rule';
const STEP_CHOICES = ['↖ Diagonally: the letter is shared', '↑ Up', '← Left'] as const;

/** The traceback's next move from (i, j): diagonal on a match, else towards the larger neighbour (ties go up). */
function stepFrom(a: string, b: string, L: (r: number, c: number) => number, i: number, j: number): 0 | 1 | 2 {
  if (a[i - 1] === b[j - 1]) return 0;
  return L(i - 1, j) >= L(i, j - 1) ? 1 : 2;
}

function* run({ a, b }: StringPair): Generator<Frame<GridState>> {
  const m = a.length;
  const n = b.length;
  const t = new GridTracer(['cells', 'matches']);
  t.addTable({
    label: 'L[i,j]: LCS length of A[1..i] and B[1..j]',
    corner: 'A╲B',
    rows: [{ label: 'ε', sub: '0' }, ...[...a].map((ch, i) => ({ label: ch, sub: String(i + 1) }))],
    cols: [{ label: 'ε', sub: '0' }, ...[...b].map((ch, j) => ({ label: ch, sub: String(j + 1) }))],
  });
  // The recurrence's cases as a "Rule used" chip row (V6); a cell's decision frame marks the one it used.
  t.addList({ id: RULE, label: 'Rule used', empty: '' });
  t.addItem(RULE, { id: 'match', text: 'letters match → diagonal + 1' });
  t.addItem(RULE, { id: 'differ', text: 'else max(↑, ←)' });
  t.addList({ id: LIST, label: 'Common subsequence', empty: 'Read off during the traceback' });
  const L = (r: number, c: number) => t.num([r, c]);

  yield t.frame({
    note: `L[i,j] will hold the length of the longest common subsequence of the first i letters of A ("${a}") and the first j letters of B ("${b}"). Each cell needs only its neighbours above and to the left.`,
  });

  for (let i = 0; i <= m; i++) t.set([i, 0], 0);
  for (let j = 1; j <= n; j++) t.set([0, j], 0);
  yield t.frame({
    line: 0,
    note: 'Row 0 and column 0 stand for an empty prefix (ε). An empty string shares nothing with anything, so they are all 0.',
  });

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const x = a[i - 1];
      const y = b[j - 1];
      const match = x === y;
      const diag = L(i - 1, j - 1);
      const up = L(i - 1, j);
      const left = L(i, j - 1);
      const value = match ? diag + 1 : Math.max(up, left);
      const here: CellRef = [i, j];
      const deps: CellRef[] = match ? [[i - 1, j - 1]] : [[i - 1, j], [i, j - 1]];
      const vars = { i, j, 'A[i]': x, 'B[j]': y };
      const headers = [{ row: i }, { col: j }];

      yield t.frame({
        line: 3,
        note: match
          ? `A[${i}] = '${x}' and B[${j}] = '${y}' are the same letter.`
          : `A[${i}] = '${x}' and B[${j}] = '${y}' differ, so at most one of them can end the common subsequence here.`,
        marks: { key: [here], compare: [...deps, ...headers] },
        arrows: deps.map((d) => ({ from: d, to: here, mark: 'compare' as const })),
        vars,
        checkpoint:
          !match && up !== left
            ? { question: `Which neighbour does L[${i},${j}] copy from?`, choices: ['The cell above (↑)', 'The cell to the left (←)'], answer: up > left ? 0 : 1 }
            : {
                question: `What value goes in L[${i},${j}]?`,
                ...numberChoices(value, match ? [diag, Math.max(up, left) + 1] : [value + 1, diag + 1]),
              },
      });

      t.set(here, value);
      t.count('cells');
      if (match) t.count('matches');
      const from: CellRef = match ? [i - 1, j - 1] : up >= left ? [i - 1, j] : [i, j - 1];
      yield t.frame({
        line: match ? 4 : 6,
        note: match
          ? `'${x}' = '${y}': extend the best common subsequence of the shorter prefixes by this letter, so L[${i},${j}] = L[${i - 1},${j - 1}] + 1 = ${value}.`
          : `'${x}' ≠ '${y}': drop one of them and keep the better result, max(↑ ${up}, ← ${left}) = ${value}.`,
        marks: { key: [here, { list: RULE, item: match ? 'match' : 'differ' }], compare: [from, ...headers] },
        arrows: [{ from, to: here, mark: 'compare' }],
        vars: { ...vars, [`L[${i},${j}]`]: value },
      });
    }
  }

  // Traceback: walk from the corner to row or column 0, collecting matched letters.
  let i = m;
  let j = n;
  let lcs = '';
  const ask = (r: number, c: number) =>
    r > 0 && c > 0
      ? {
          question: `From L[${r},${c}], where does the traceback go next? (On a tie it goes up.)`,
          choices: [...STEP_CHOICES],
          answer: stepFrom(a, b, L, r, c),
        }
      : undefined;
  t.mark([i, j], 'path');
  yield t.frame({
    line: 8,
    note: `L[${m},${n}] = ${L(m, n)} is the length of the longest common subsequence. Walk back from this corner to find its letters.`,
    vars: { i, j },
    checkpoint: ask(i, j),
  });

  while (i > 0 && j > 0) {
    const step = stepFrom(a, b, L, i, j);
    const [ni, nj] = step === 0 ? [i - 1, j - 1] : step === 1 ? [i - 1, j] : [i, j - 1];
    t.addArrow({ from: [i, j], to: [ni, nj], mark: 'path' });
    t.mark([ni, nj], 'path');
    let note: string;
    if (step === 0) {
      const ch = a[i - 1];
      lcs = ch + lcs;
      t.addItem(LIST, { id: `c${i}`, text: ch, mark: 'path' }, 'start');
      t.mark({ row: i }, 'path');
      t.mark({ col: j }, 'path');
      note = `A[${i}] = B[${j}] = '${ch}': this letter is in the subsequence. Step diagonally to L[${ni},${nj}].`;
    } else if (step === 1) {
      note = `'${a[i - 1]}' ≠ '${b[j - 1]}' and L[${i - 1},${j}] = ${L(i - 1, j)} ≥ L[${i},${j - 1}] = ${L(i, j - 1)}: an equally long answer skips A[${i}], so step up.`;
    } else {
      note = `'${a[i - 1]}' ≠ '${b[j - 1]}' and L[${i},${j - 1}] = ${L(i, j - 1)} > L[${i - 1},${j}] = ${L(i - 1, j)}: the longer answer skips B[${j}], so step left.`;
    }
    i = ni;
    j = nj;
    yield t.frame({ line: step === 0 ? 9 : 10, note, vars: { i, j, lcs: lcs || '—' }, checkpoint: ask(i, j) });
  }

  yield t.frame({
    note:
      lcs.length > 0
        ? `Reached the edge of the table. The longest common subsequence is "${lcs}", ${lcs.length} letter${lcs.length === 1 ? '' : 's'} long, matching L[${m},${n}].`
        : `Reached the edge without a single match: "${a}" and "${b}" have no letter in common, so the longest common subsequence is empty.`,
    vars: { lcs: lcs || '—', length: lcs.length },
  });
}

export const longestCommonSubsequence = defineAlgorithm<StringPair, GridState>({
  kind: 'algorithm',
  slug: 'longest-common-subsequence',
  view: 'grid',
  input: {
    examples: [
      { id: 'similar', label: 'Similar words', make: () => ({ a: 'DYNAMIC', b: 'PANORAMIC' }) },
      { id: 'textbook', label: 'Textbook (ABCBDAB)', make: () => ({ a: 'ABCBDAB', b: 'BDCABA' }) },
      { id: 'nothing', label: 'Nothing in common', make: () => ({ a: 'CAT', b: 'DOG' }) },
      { id: 'identical', label: 'Identical words', make: () => ({ a: 'LEVEL', b: 'LEVEL' }) },
      { id: 'random', label: 'Random letters', make: ({ seed }) => ({ a: randomWord(seed, 6, 'ABC'), b: randomWord(seed + 1, 7, 'ABC') }) },
    ],
    custom: stringPairCustom(10),
  },
  pseudocode,
  stats: [CELLS, { key: 'matches', label: 'Letter matches' }],
  legend: [
    { neutral: 'Computed' },
    { mark: 'key', label: 'Cell being filled' },
    { mark: 'compare', label: 'Cells and letters it uses' },
    { mark: 'path', label: 'Traceback (letters in the LCS)' },
  ],
  run,
  content: {
    idea: 'A subsequence keeps letters in order but may skip some. Fill a table where L[i,j] is the LCS length of the first i letters of A and the first j letters of B: each cell is one comparison plus a look at its neighbours, and a walk back from the corner recovers the letters.',
    invariant: 'L[i,j] = L[i−1,j−1] + 1 if A[i] = B[j], otherwise max(L[i−1,j], L[i,j−1]); row 0 and column 0 are 0. Cells are filled row by row, so all three neighbours are final before L[i,j] is computed.',
    whenToUse: 'Comparing sequences: diff tools (LCS of lines), DNA and protein alignment, plagiarism checks. O(mn) time and space; two rows of memory are enough if you only need the length.',
    traits: [
      { label: 'Optimal substructure', good: true },
      { label: 'Overlapping subproblems', good: null },
      { label: 'O(mn) table to recover the letters', good: false },
    ],
    experiments: [
      { example: 'similar', prompt: 'N, A, M, I, C line up in both words. Watch the traceback take a diagonal step for each one.' },
      { example: 'nothing', prompt: 'No letter matches, so every cell copies a neighbour and the whole table stays 0.' },
      { example: 'identical', prompt: 'When A = B every diagonal cell is a match: the answer runs straight down the diagonal.' },
      { example: 'textbook', prompt: 'Several different subsequences have length 4. The tie rule (go up) decides which one the traceback reports.' },
    ],
  },
});

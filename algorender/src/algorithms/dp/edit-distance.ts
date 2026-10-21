import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { CELLS, numberChoices, randomWord, stringPairCustom, type StringPair } from './shared';

const pseudocode = [
  'D[i,0] ← i;  D[0,j] ← j',
  'for i from 1 to m:',
  '  for j from 1 to n:',
  '    if A[i] = B[j]:',
  '      D[i,j] ← D[i−1,j−1]   (no edit)',
  '    else: D[i,j] ← 1 + min of',
  '      D[i−1,j]     delete A[i]',
  '      D[i,j−1]     insert B[j]',
  '      D[i−1,j−1]   replace A[i] by B[j]',
  '',
  'trace back from D[m,n]:',
  '  ↖ same value, A[i] = B[j]: keep',
  '  ↖ one more: replace A[i] by B[j]',
  '  ↑ one more: delete A[i]',
  '  ← one more: insert B[j]',
];

type Op = 'keep' | 'replace' | 'delete' | 'insert';
const LIST = 'edits';
const RULE = 'rule';
const OP_CHOICES = ['Keep (the letters match)', 'Replace', 'Delete', 'Insert'] as const;
const OP_INDEX: Record<Op, number> = { keep: 0, replace: 1, delete: 2, insert: 3 };

/** The traceback's next move from (i, j), preferring ↖ then ↑ then ←. */
function stepFrom(a: string, b: string, D: (r: number, c: number) => number, i: number, j: number): Op {
  if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && D(i, j) === D(i - 1, j - 1)) return 'keep';
  if (i > 0 && j > 0 && D(i, j) === D(i - 1, j - 1) + 1) return 'replace';
  if (i > 0 && D(i, j) === D(i - 1, j) + 1) return 'delete';
  return 'insert';
}

function* run({ a, b }: StringPair): Generator<Frame<GridState>> {
  const m = a.length;
  const n = b.length;
  const t = new GridTracer(['cells', 'matches']);
  t.addTable({
    label: 'D[i,j]: edits to turn A[1..i] into B[1..j]',
    corner: 'A╲B',
    rows: [{ label: 'ε', sub: '0' }, ...[...a].map((ch, i) => ({ label: ch, sub: String(i + 1) }))],
    cols: [{ label: 'ε', sub: '0' }, ...[...b].map((ch, j) => ({ label: ch, sub: String(j + 1) }))],
  });
  // The recurrence's cases as a "Rule used" chip row (V6); a cell's decision frame marks the one it used.
  t.addList({ id: RULE, label: 'Rule used', empty: '' });
  t.addItem(RULE, { id: 'same', text: 'same letter → diagonal' });
  t.addItem(RULE, { id: 'edit', text: 'else 1 + min(↑ delete, ← insert, ↖ replace)' });
  t.addList({ id: LIST, label: `Edits turning "${a}" into "${b}"`, empty: 'Read off during the traceback' });
  const D = (r: number, c: number) => t.num([r, c]);

  yield t.frame({
    note: `D[i,j] will hold the fewest single-letter edits (insert, delete or replace) that turn the first i letters of "${a}" into the first j letters of "${b}".`,
  });

  for (let i = 0; i <= m; i++) t.set([i, 0], i);
  for (let j = 1; j <= n; j++) t.set([0, j], j);
  yield t.frame({
    line: 0,
    note: 'Turning i letters into nothing takes i deletions, and building j letters from nothing takes j insertions: that fills row 0 and column 0.',
  });

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const x = a[i - 1];
      const y = b[j - 1];
      const match = x === y;
      const up = D(i - 1, j);
      const left = D(i, j - 1);
      const diag = D(i - 1, j - 1);
      const best = Math.min(up, left, diag);
      const value = match ? diag : 1 + best;
      // Ties prefer replace, then delete, then insert, like the traceback.
      const op: Exclude<Op, 'keep'> = diag === best ? 'replace' : up === best ? 'delete' : 'insert';
      const here: CellRef = [i, j];
      const deps: CellRef[] = match ? [[i - 1, j - 1]] : [[i - 1, j], [i, j - 1], [i - 1, j - 1]];
      const headers = [{ row: i }, { col: j }];
      const vars = { i, j, 'A[i]': x, 'B[j]': y };
      const unique = [up, left, diag].filter((v) => v === best).length === 1;
      const opLabels = [`Delete '${x}'`, `Insert '${y}'`, `Replace '${x}' with '${y}'`];

      yield t.frame({
        line: 3,
        note: match
          ? `A[${i}] = '${x}' and B[${j}] = '${y}' are the same letter.`
          : `A[${i}] = '${x}' and B[${j}] = '${y}' differ, so this cell costs one edit on top of the cheapest neighbour.`,
        marks: { key: [here], compare: [...deps, ...headers] },
        arrows: deps.map((d) => ({ from: d, to: here, mark: 'compare' as const })),
        vars,
        checkpoint:
          !match && unique
            ? { question: `Which edit is cheapest at D[${i},${j}]?`, choices: opLabels, answer: up === best ? 0 : left === best ? 1 : 2 }
            : {
                question: `What value goes in D[${i},${j}]?`,
                ...numberChoices(value, match ? [diag + 1, best + 1] : [best, value + 1]),
              },
      });

      t.set(here, value);
      t.count('cells');
      if (match) t.count('matches');
      const from: CellRef = match || op === 'replace' ? [i - 1, j - 1] : op === 'delete' ? [i - 1, j] : [i, j - 1];
      const why = {
        replace: `replacing '${x}' with '${y}' (1 more than D[${i - 1},${j - 1}])`,
        delete: `deleting '${x}' (1 more than D[${i - 1},${j}])`,
        insert: `inserting '${y}' (1 more than D[${i},${j - 1}])`,
      }[op];
      yield t.frame({
        line: match ? 4 : { delete: 6, insert: 7, replace: 8 }[op],
        note: match
          ? `'${x}' = '${y}': no edit needed, so D[${i},${j}] copies D[${i - 1},${j - 1}] = ${diag}.`
          : `'${x}' ≠ '${y}': D[${i},${j}] = 1 + min(↑ ${up}, ← ${left}, ↖ ${diag}) = ${value}, by ${why}.`,
        marks: { key: [here, { list: RULE, item: match ? 'same' : 'edit' }], compare: [from, ...headers] },
        arrows: [{ from, to: here, mark: 'compare' }],
        vars: { ...vars, [`D[${i},${j}]`]: value },
      });
    }
  }

  // Traceback: walk from the corner to D[0,0], reading the edit script backwards.
  let i = m;
  let j = n;
  let edits = 0;
  const ask = (r: number, c: number) =>
    r > 0 && c > 0
      ? {
          question: `Which edit does the next step back from D[${r},${c}] stand for? (When several fit, the walk prefers ↖, then ↑, then ←.)`,
          choices: [...OP_CHOICES],
          answer: OP_INDEX[stepFrom(a, b, D, r, c)],
        }
      : undefined;
  t.mark([i, j], 'path');
  yield t.frame({
    line: 10,
    note: `D[${m},${n}] = ${D(m, n)}: "${a}" becomes "${b}" in ${D(m, n)} edit${D(m, n) === 1 ? '' : 's'}. Walk back to D[0,0] to see which ones.`,
    vars: { i, j },
    checkpoint: ask(i, j),
  });

  while (i > 0 || j > 0) {
    const op = stepFrom(a, b, D, i, j);
    const [ni, nj] = op === 'keep' || op === 'replace' ? [i - 1, j - 1] : op === 'delete' ? [i - 1, j] : [i, j - 1];
    const x = a[i - 1];
    const y = b[j - 1];
    t.addArrow({ from: [i, j], to: [ni, nj], mark: 'path' });
    t.mark([ni, nj], 'path');
    if (op !== 'keep') edits++;
    const chip = { keep: x, replace: `${x}→${y}`, delete: `−${x}`, insert: `+${y}` }[op];
    t.addItem(LIST, { id: `e${i}-${j}`, text: chip, mark: op === 'keep' ? null : 'write' }, 'start');
    const note = {
      keep: `A[${i}] = B[${j}] = '${x}' and D[${i},${j}] = D[${ni},${nj}]: keep '${x}' unchanged and step diagonally.`,
      replace: `D[${i},${j}] is one more than D[${ni},${nj}]: replace '${x}' with '${y}' and step diagonally.`,
      delete: `D[${i},${j}] is one more than D[${ni},${nj}] above: delete '${x}' and step up.`,
      insert: `D[${i},${j}] is one more than D[${ni},${nj}] to the left: insert '${y}' and step left.`,
    }[op];
    i = ni;
    j = nj;
    yield t.frame({ line: 11 + OP_INDEX[op], note, vars: { i, j, edits }, checkpoint: ask(i, j) });
  }

  yield t.frame({
    note:
      edits === 0
        ? `Reached D[0,0]: the words are identical, so no edits are needed.`
        : `Reached D[0,0]. Read left to right, the ${edits} marked edit${edits === 1 ? '' : 's'} turn "${a}" into "${b}"; no shorter script exists.`,
    vars: { distance: edits },
  });
}

export const editDistance = defineAlgorithm<StringPair, GridState>({
  kind: 'algorithm',
  slug: 'edit-distance',
  view: 'grid',
  input: {
    examples: [
      { id: 'kitten', label: 'kitten → sitting', make: () => ({ a: 'kitten', b: 'sitting' }) },
      { id: 'sunday', label: 'sunday → saturday', make: () => ({ a: 'sunday', b: 'saturday' }) },
      { id: 'insertions', label: 'Only insertions', make: () => ({ a: 'art', b: 'party' }) },
      { id: 'identical', label: 'Identical words', make: () => ({ a: 'level', b: 'level' }) },
      { id: 'random', label: 'Random letters', make: ({ seed }) => ({ a: randomWord(seed, 6, 'abc'), b: randomWord(seed + 1, 6, 'abc') }) },
    ],
    custom: stringPairCustom(10),
  },
  pseudocode,
  stats: [CELLS, { key: 'matches', label: 'Letter matches' }],
  legend: [
    { neutral: 'Computed' },
    { mark: 'key', label: 'Cell being filled' },
    { mark: 'compare', label: 'Cells and letters it uses' },
    { mark: 'path', label: 'Traceback' },
    { mark: 'write', label: 'An edit in the script' },
  ],
  run,
  content: {
    idea: 'The edit (Levenshtein) distance counts the fewest single-letter inserts, deletes and replacements that turn one word into another. Each cell of the table builds on three smaller problems: drop A’s last letter, add B’s last letter, or match the last letters up.',
    invariant: 'D[i,j] = D[i−1,j−1] if A[i] = B[j], else 1 + min(D[i−1,j], D[i,j−1], D[i−1,j−1]); D[i,0] = i and D[0,j] = j. Every cheapest script ends with one of those three moves, so the minimum covers all of them.',
    whenToUse: 'Spell checking and "did you mean…", fuzzy search, comparing DNA reads (with weighted costs), diffing short texts. O(mn) time; two rows of memory if you only need the distance, not the script.',
    traits: [
      { label: 'Optimal substructure', good: true },
      { label: 'Every edit costs 1 here', good: null },
      { label: 'O(mn) time and space', good: null },
    ],
    experiments: [
      { example: 'kitten', prompt: 'Three edits: two replacements and an insertion. Watch the traceback pick them out of the table.' },
      { example: 'insertions', prompt: '"art" sits inside "party", so every edit is an insertion: the walk back moves left or diagonally, never up.' },
      { example: 'identical', prompt: 'The diagonal stays 0 because every letter matches: zero edits.' },
      { example: 'sunday', prompt: '"sun…day" and "sat…urday" share a prefix and a suffix. Where do the three edits land?' },
    ],
  },
});

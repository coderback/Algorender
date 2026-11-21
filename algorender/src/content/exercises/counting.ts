// Counting as code (B5 of the math and ML path): choose(n, k) worked out by
// filling Pascal's triangle in a table() row by row, each cell the sum of the
// two cells above it, so the grid trace draws every cell's arrows from the two
// cells it read. Whole numbers only, so Python and JavaScript agree exactly.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

export type ChooseInput = { n: number; k: number };

/** Pascal's triangle, rows 0 to n (row i holds C(i, 0) … C(i, i)). */
export function pascalRows(n: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i <= n; i++) rows.push(Array.from({ length: i + 1 }, (_, j) => (j === 0 || j === i ? 1 : rows[i - 1][j - 1] + rows[i - 1][j])));
  return rows;
}

/** C(n, k), and 0 when k is more than n. */
export const chooseValue = ({ n, k }: ChooseInput) => (k > n || k < 0 ? 0 : pascalRows(n)[n][k]);

const chooseArgs = ({ n, k }: ChooseInput): Arg[] => [
  { kind: 'value', name: 'n', value: n },
  { kind: 'value', name: 'k', value: k },
];

type Table = (number | null)[][];

/** The learner's table: the one called C, else the first one made, with its size. */
function learnerTable(result: RunResult): { values: Table; rows: number; cols: number } | null {
  const made = result.events.filter((e) => e.kind === 'grid');
  const event = made.find((e) => e.kind === 'grid' && e.name === 'C') ?? made[0];
  if (!event || event.kind !== 'grid') return null;
  return { values: result.grids?.[event.grid] ?? event.values, rows: event.rows, cols: event.cols };
}

/**
 * A table filled from the given edges by a rule for the cells in between, as
 * far as the cells a choose(n, k) needs: rows 0 to n, columns 0 to min(i, k).
 */
function filledBy(n: number, k: number, rule: (T: number[][], i: number, j: number) => number): number[][] {
  const T = Array.from({ length: n + 1 }, () => Array<number>(n + 2).fill(0));
  for (let i = 0; i <= n; i++) {
    T[i][0] = 1;
    T[i][i] = 1;
    for (let j = 1; j < i; j++) T[i][j] = rule(T, i, j);
  }
  return T;
}

/** The usual wrong ways to fill the inside of the triangle, each named as the learner would hear it. */
const SLIPS: { rule: (T: number[][], i: number, j: number) => number; message: string }[] = [
  {
    rule: (T, i, j) => T[i - 1][j] + T[i - 1][j + 1],
    message:
      'You added the wrong two cells: the one straight above, C[i − 1][j], and the one above on the right, C[i − 1][j + 1]. A cell adds the one above on the left, C[i − 1][j − 1] (the choices that take the last thing), and the one straight above, C[i − 1][j] (the choices that leave it).',
  },
  {
    rule: (T, i, j) => T[i][j - 1] + T[i - 1][j],
    message:
      'You added the cell to the left, C[i][j − 1], and the one above, as in the grid of paths. In Pascal’s triangle both cells come from the row above: C[i − 1][j − 1] + C[i − 1][j].',
  },
  {
    rule: (T, i, j) => T[i - 1][j - 1] * T[i - 1][j],
    message: 'Every cell is 1: multiplying the two cells above (or copying one of them) never gets past 1. Add them: C[i][j] = C[i − 1][j − 1] + C[i − 1][j].',
  },
];

function checkChoose(input: ChooseInput, result: RunResult): Verdict {
  const { n, k } = input;
  const want = chooseValue(input);
  const T = learnerTable(result);
  const error = result.error;
  if (error) {
    const outside = /out of range/i.test(error.message);
    if (outside && k > n) {
      return { pass: false, message: `choose(${n}, ${k}) reads past the end of the table: there is no way to choose ${k} things from ${n}, so the answer is 0. Return 0 when k > n, before reading C[n][k].` };
    }
    if (outside && T && (T.rows === n || T.cols === n)) {
      return { pass: false, message: `Your table is ${T.rows}×${T.cols}: its rows are numbered 0 to ${T.rows - 1}, so there is no row ${n}. Pascal’s triangle down to row n needs n + 1 rows and n + 1 columns: table(n + 1, n + 1, 0).` };
    }
    return crashed(result)!;
  }
  const got = result.returned;
  if (k > n) {
    if (got === 0) return { pass: true, message: `choose(${n}, ${k}) = 0: there is no way to choose ${k} things from only ${n}.` };
    return { pass: false, message: `choose(${n}, ${k}) should be 0: there is no way to choose ${k} things from only ${n}, but yours returned ${JSON.stringify(got)}. Return 0 when k > n.` };
  }
  if (!T) {
    return { pass: false, message: `Build Pascal’s triangle in a table: C = table(n + 1, n + 1, 0), then fill it row by row and return C[n][k]. ${got === want ? 'Your answer is right, but the point is to see each cell made from the two above it.' : ''}`.trim() };
  }
  if (T.rows < n + 1) {
    return { pass: false, message: `Your table has ${T.rows} rows, numbered 0 to ${T.rows - 1}, so there is no row ${n} to read C(${n}, ${k}) from. Make it table(n + 1, n + 1, 0).` };
  }
  // The cells choose(n, k) needs: rows 0 to n, columns 0 to min(i, k).
  const P = pascalRows(n);
  const cols = Math.min(T.cols, n + 1);
  const cells: [number, number][] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= Math.min(i, k, cols - 1); j++) cells.push([i, j]);
  const at = (i: number, j: number) => T.values[i]?.[j] ?? null;
  const wrong = cells.find(([i, j]) => at(i, j) !== P[i][j]);
  if (wrong) {
    if (cells.every(([i, j]) => at(i, j) === 0)) return { pass: false, message: 'Every cell is still 0. Start each row with the edges, C[i][0] = 1 and C[i][i] = 1, then fill the cells between them.' };
    const [i, j] = wrong;
    if (j === 0 || j === i) {
      return { pass: false, message: `C[${i}][${j}] should be 1: it is on the edge of the triangle, and there is exactly one way to choose ${j === 0 ? 'none' : 'all'} of ${i} things. Yours is ${at(i, j)}. Set C[i][0] = 1 and C[i][i] = 1 in every row.` };
    }
    for (const slip of SLIPS) {
      const S = filledBy(n, k, slip.rule);
      if (cells.every(([a, b]) => at(a, b) === S[a][b])) return { pass: false, message: slip.message };
    }
    const [x, y] = [P[i - 1][j - 1], P[i - 1][j]];
    return { pass: false, message: `C[${i}][${j}] should be C[${i - 1}][${j - 1}] + C[${i - 1}][${j}] = ${x} + ${y} = ${P[i][j]}, the cell above on the left plus the cell straight above, but yours is ${at(i, j)}.` };
  }
  if (got === want) return { pass: true, message: `choose(${n}, ${k}) = ${want}. Row ${n} of the triangle is ${P[n].join(', ')}, and it adds up to ${2 ** n}.` };
  if (typeof got === 'number' && n >= 1) {
    if (k + 1 <= n && got === P[n][k + 1] && got !== want) return { pass: false, message: `Your table is right, but you returned C[${n}][${k + 1}] = ${got}: the answer is C[n][k] = C[${n}][${k}] = ${want}.` };
    if (k >= 1 && got === P[n][k - 1]) return { pass: false, message: `Your table is right, but you returned C[${n}][${k - 1}] = ${got}: the answer is C[n][k] = C[${n}][${k}] = ${want}.` };
    if (got === P[n - 1][Math.min(k, n - 1)]) return { pass: false, message: `Your table is right, but you returned a cell of row ${n - 1}: the answer is in row n, C[${n}][${k}] = ${want}.` };
  }
  return { pass: false, message: `Your table is right, so return its cell C[n][k] = C[${n}][${k}] = ${want}; yours returned ${JSON.stringify(got)}.` };
}

const BLANKS_PY = `def choose(n, k):
    if «1:k > n»:
        return 0
    C = table(«2:n + 1, n + 1», 0)
    for i in range(n + 1):
        C[i][0] = 1
        «3:C[i][i] = 1»
        for j in range(«4:1, i»):
            C[i][j] = «5:C[i - 1][j - 1] + C[i - 1][j]»
    return C[n][k]
`;
const BLANKS_JS = `function choose(n, k) {
  if («1:k > n») {
    return 0;
  }
  const C = table(«2:n + 1, n + 1», 0);
  for (let i = 0; i <= n; i++) {
    C[i][0] = 1;
    «3:C[i][i] = 1»;
    for (let j = 1; «4:j < i»; j++) {
      C[i][j] = «5:C[i - 1][j - 1] + C[i - 1][j]»;
    }
  }
  return C[n][k];
}
`;
const chooseTs = (js: string) => js.replace('function choose(n, k) {', 'function choose(n: number, k: number): number {').replace('const C = table(', 'const C: number[][] = table(');

const STARTER_PY = `def choose(n, k):
    # The ways to choose k things from n. Build Pascal's triangle in
    # C = table(n + 1, n + 1, 0), row i for i = 0 to n:
    #   the edges C[i][0] and C[i][i] are 1, and every cell between
    #   them adds the two cells above it: C[i - 1][j - 1] + C[i - 1][j].
    # Then return C[n][k] (and 0 if k is more than n).
    return 0
`;
const STARTER_JS = `function choose(n, k) {
  // The ways to choose k things from n. Build Pascal's triangle in
  // C = table(n + 1, n + 1, 0), row i for i = 0 to n:
  //   the edges C[i][0] and C[i][i] are 1, and every cell between
  //   them adds the two cells above it: C[i - 1][j - 1] + C[i - 1][j].
  // Then return C[n][k] (and 0 if k is more than n).
  return 0;
}
`;

const FIVE_TWO: ChooseInput = { n: 5, k: 2 };
const SIX_THREE: ChooseInput = { n: 6, k: 3 };

const chooseExercise: Exercise<ChooseInput> = {
  slug: 'pascal-choose',
  title: 'Choose k of n with Pascal’s triangle',
  kind: 'write',
  visualiser: 'counting',
  summary: 'Fill Pascal’s triangle in a table, each cell the sum of the two above it, and read choose(n, k) from row n.',
  task: [
    '`choose(n, k)` is the number of ways to choose k things from n when the order doesn’t matter: choose(5, 2) = 10 teams of two from five people. Work it out without any formula, by building Pascal’s triangle.',
    'Make the table with `C = table(n + 1, n + 1, 0)` (rows and columns 0 to n). In each row i, the edges are 1: `C[i][0] = 1` and `C[i][i] = 1`. Every cell between them adds the two cells above it, `C[i][j] = C[i - 1][j - 1] + C[i - 1][j]`, and the picture draws an arrow from each cell your code reads. Return `C[n][k]`, or 0 when k is more than n.',
  ],
  entry: { python: 'choose', js: 'choose' },
  args: chooseArgs,
  starter: { python: STARTER_PY, javascript: STARTER_JS, typescript: chooseTs(STARTER_JS) },
  solution: { python: stripBlanks(BLANKS_PY), javascript: stripBlanks(BLANKS_JS), typescript: chooseTs(stripBlanks(BLANKS_JS)) },
  blanks: { python: BLANKS_PY, javascript: BLANKS_JS, typescript: chooseTs(BLANKS_JS) },
  fades: [[5], [3, 4, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['            C[i][j] = C[i - 1][j] + C[i - 1][j + 1]', '    C = table(n, n, 0)'],
    javascript: ['      C[i][j] = C[i - 1][j] + C[i - 1][j + 1];', '  const C = table(n, n, 0);'],
    typescript: ['      C[i][j] = C[i - 1][j] + C[i - 1][j + 1];', '  const C: number[][] = table(n, n, 0);'],
  },
  examples: [
    { id: 'five-two', label: 'choose(5, 2): teams of two from five', input: FIVE_TWO },
    { id: 'six-three', label: 'choose(6, 3): the middle of row 6', input: SIX_THREE },
  ],
  tests: [
    { name: 'teams of two from five', input: FIVE_TWO },
    { name: 'the middle of row 6', input: SIX_THREE },
    { name: 'choose none: one way', input: { n: 4, k: 0 } },
    { name: 'choose all: one way', input: { n: 4, k: 4 } },
    { name: 'more than you have: no way', input: { n: 3, k: 5 } },
    { name: 'a bigger row', input: { n: 8, k: 3 } },
    { name: 'nothing from nothing', input: { n: 0, k: 0 } },
    { name: 'row 12', input: { n: 12, k: 7 } },
  ],
  check: checkChoose,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Make the table one bigger than n each way, table(n + 1, n + 1, 0), so that row n and column n are there: they are numbered from 0.',
    'Each row starts and ends with 1: C[i][0] = 1 and C[i][i] = 1. Then j runs over the cells between, from 1 up to i − 1.',
    'A cell adds the two cells in the row above it: the one above on the left, C[i − 1][j − 1], and the one straight above, C[i − 1][j].',
    'There is no way to choose more than you have: if k > n, return 0 before reading the table.',
  ],
  legend: [
    { neutral: 'A cell not filled yet' },
    { mark: 'compare', label: 'A cell the step reads' },
    { mark: 'write', label: 'The cell your code just wrote' },
  ],
};

export const countingExercises: Exercise[] = [chooseExercise];

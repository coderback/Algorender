// Chance as code (B5 of the math and ML path): the two-dice board as two
// nested loops. The code visits all 36 outcomes, writes each one's sum into a
// 6×6 table (so the run draws the board filling in), counts the outcomes in
// the event and divides by 36. A second exercise modifies it from "the sum is
// exactly t" to "the sum is at least t".
//
// Python and JavaScript must write the same numbers (exercises.test.ts): the
// sums are whole numbers and the answer is one division, count / 36, which
// both runtimes round the same way.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

export type ChanceInput = { target: number };
export type Rule = 'exactly' | 'at least';

const FACES = [1, 2, 3, 4, 5, 6];

/** How many of the 36 ordered outcomes (a, b) pass, for faces from `lo` to `hi`. */
export function countSums(target: number, rule: Rule | 'more than', { lo = 1, hi = 6, ordered = true } = {}): number {
  let n = 0;
  for (let a = lo; a <= hi; a++)
    for (let b = ordered ? lo : a; b <= hi; b++) {
      const s = a + b;
      if (rule === 'exactly' ? s === target : rule === 'at least' ? s >= target : s > target) n++;
    }
  return n;
}

/** The chance itself: the count over 36, the one division the code does. */
export const sumChance = (target: number, rule: Rule = 'exactly') => countSums(target, rule) / 36;

/** The board the code fills: board[a − 1][b − 1] = a + b. */
export const SUM_BOARD = FACES.map((a) => FACES.map((b) => a + b));

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-12;
const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

/** The learner's 6×6 table: the one called board, else the first one made. */
function learnerBoard(result: RunResult): (number | null)[][] | null {
  const made = result.events.filter((e) => e.kind === 'grid');
  const board = made.find((e) => e.kind === 'grid' && e.name === 'board') ?? made[0];
  return board && board.kind === 'grid' ? (result.grids?.[board.grid] ?? null) : null;
}

const is6x6 = (g: readonly (readonly (number | null)[])[]) => g.length === 6 && g.every((r) => r.length === 6);
/** Whether every cell (i, j) holds want(i, j). */
const boardIs = (g: readonly (readonly (number | null)[])[], want: (i: number, j: number) => number) => g.every((row, i) => row.every((v, j) => v === want(i, j)));

const LOOPS = 'In Python, range(1, 7) gives 1 to 6 (it stops before 7); in JavaScript and TypeScript, let a = 1; a <= 6; a++.';

/** What is wrong with the board, or null when it holds every sum. */
function boardProblem(board: (number | null)[][] | null): string | null {
  if (!board || !is6x6(board)) return 'Make the board with board = table(6, 6, 0), one row for each face of the first die and one column for each face of the second, and write each outcome’s sum into it.';
  if (boardIs(board, (i, j) => SUM_BOARD[i][j])) return null;
  if (boardIs(board, () => 0)) return 'Every cell of the board is still 0: for each a and b from 1 to 6, write a + b into board[a − 1][b − 1].';
  if (boardIs(board, (i, j) => i + j)) return `Your dice show 0 to 5: the loops start at 0, but a die’s faces are 1 to 6, so the sums on your board run from 0 to 10. ${LOOPS} Then write into board[a − 1][b − 1].`;
  if (boardIs(board, (i, j) => (i < 5 && j < 5 ? i + j + 2 : 0))) return `Your loops stop at 5, so the last row and column are still 0: a die has six faces. ${LOOPS}`;
  if (boardIs(board, (i, j) => (j >= i ? i + j + 2 : 0))) {
    return 'The cells below the diagonal are still 0: your second loop starts at a, so it counts (2, 5) but never (5, 2). Those are different outcomes, first die 2 and second die 5 or the other way round, so the second loop must run over all six faces every time.';
  }
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++)
      if (board[i][j] !== SUM_BOARD[i][j]) return `board[${i}][${j}] is the outcome a = ${i + 1}, b = ${j + 1}, so it should hold ${i + j + 2}, but it holds ${board[i][j] ?? 'nothing'}.`;
  return 'Compare your board with the sums a + b cell by cell.';
}

function checkChance(rule: Rule) {
  return ({ target }: ChanceInput, result: RunResult): Verdict => {
    const failed = crashed(result);
    if (failed) return failed;
    const problem = boardProblem(learnerBoard(result));
    if (problem) return { pass: false, message: problem };
    const got = result.returned;
    const k = countSums(target, rule);
    const event = rule === 'exactly' ? `sum to ${target}` : `sum to at least ${target}`;
    if (typeof got !== 'number') return { pass: false, message: 'The board is right. Now return the chance: the count of outcomes in the event, divided by 36.' };
    if (close(got, k / 36)) {
      const why = k === 0 ? 'none can happen, so the chance is 0' : k === 36 ? 'every outcome does, so the chance is 1' : `P = ${k}/36 ≈ ${fmt(k / 36)}`;
      return { pass: true, message: `${k} of the 36 outcomes ${event}: ${why}.` };
    }
    const slips: [number, string][] = [];
    if (rule === 'at least') {
      const eq = countSums(target, 'exactly');
      const gt = countSums(target, 'more than');
      if (close(got, gt / 36) && close(got, eq / 36)) {
        slips.push([got, `That counts the sums of exactly ${target}, or more than ${target}, which here happen to be the same ${eq} cells. “At least ${target}” means ${target} or more, so it takes in both: use >= target.`]);
      }
      slips.push([gt / 36, `That counts the sums more than ${target}, ${gt} cells. “At least ${target}” includes ${target} itself: use >= target, not > target.`]);
      slips.push([eq / 36, `That is still the chance of exactly ${target}. “At least ${target}” means ${target} or more: use >= target, not ==.`]);
    } else {
      slips.push([countSums(target, 'at least') / 36, `That counts the sums of at least ${target}. This asks for a sum of exactly ${target}: use ==.`]);
    }
    slips.push([k, `You returned the count, ${k}. A chance is the count over the number of equally likely outcomes, so divide by 36.`]);
    slips.push([k / 12, 'You divided by 12, but 6 + 6 is not the number of outcomes: each of the 6 faces of the first die goes with each of the 6 faces of the second, 6 × 6 = 36.']);
    slips.push([k / 11, 'You divided by 11, the number of possible sums. The sums are not equally likely (7 has six outcomes, 2 only one), so divide by 36, the number of equally likely outcomes.']);
    const unordered = countSums(target, rule, { ordered: false });
    if (unordered !== k) slips.push([unordered / 36, `That counts (a, b) and (b, a) as one: ${unordered} cells instead of ${k}. (2, 5) and (5, 2) are different outcomes, so count every cell of the board.`]);
    for (const [value, message] of slips) if (close(got, value)) return { pass: false, message };
    return { pass: false, message: `${k} of the 36 outcomes ${event}, so the chance is ${k}/36 ≈ ${fmt(k / 36)}, but your code returns ${fmt(got)}.` };
  };
}

const args = ({ target }: ChanceInput): Arg[] => [{ kind: 'value', name: 'target', value: target }];

// ───────────────────────────── 1. dice-sum-chance ─────────────────────────────

const SUM_BLANKS_PY = `def sum_chance(target):
    board = table(6, 6, 0)
    count = 0
    for a in range(«1:1, 7»):
        for b in range(«2:1, 7»):
            board[a - 1][b - 1] = «3:a + b»
            if «4:a + b == target»:
                count = count + 1
    return «5:count / 36»
`;
const SUM_BLANKS_JS = `function sumChance(target) {
  const board = table(6, 6, 0);
  let count = 0;
  for (let a = «1:1»; a <= 6; a++) {
    for (let b = «2:1»; b <= 6; b++) {
      board[a - 1][b - 1] = «3:a + b»;
      if («4:a + b === target») {
        count = count + 1;
      }
    }
  }
  return «5:count / 36»;
}
`;
const sumTs = (js: string) =>
  js.replace('function sumChance(target) {', 'function sumChance(target: number): number {').replace('const board = table(', 'const board: number[][] = table(');

const SUM_STARTER_PY = `def sum_chance(target):
    board = table(6, 6, 0)
    count = 0
    # For every outcome (a, b), a and b each from 1 to 6:
    #   write the sum a + b into board[a - 1][b - 1],
    #   and add 1 to count when the sum is target.
    return count / 36
`;
const SUM_STARTER_JS = `function sumChance(target) {
  const board = table(6, 6, 0);
  let count = 0;
  // For every outcome (a, b), a and b each from 1 to 6:
  //   write the sum a + b into board[a - 1][b - 1],
  //   and add 1 to count when the sum is target.
  return count / 36;
}
`;

const SUM_TESTS: Exercise<ChanceInput>['tests'] = [
  { name: 'a sum of 7, the commonest', input: { target: 7 } },
  { name: 'a sum of 2: only the double 1', input: { target: 2 } },
  { name: 'a sum of 10', input: { target: 10 } },
  { name: 'a sum of 12: only the double 6', input: { target: 12 } },
  { name: 'a sum of 5', input: { target: 5 } },
  { name: 'a sum of 13 never happens', input: { target: 13 } },
];

const sumExercise: Exercise<ChanceInput> = {
  slug: 'dice-sum-chance',
  title: 'The chance two dice sum to a target',
  kind: 'write',
  visualiser: 'two-dice',
  summary: 'Visit all 36 outcomes of two dice with two loops, write each sum on a 6×6 board, and return the share that hit the target: count / 36.',
  task: [
    'Two dice give 36 equally likely outcomes (a, b): the first die shows a, the second b, each from 1 to 6. The chance of an event is how many outcomes are in it, divided by 36. Write `sum_chance(target)` (`sumChance` in JavaScript and TypeScript), the chance that the two dice sum to `target`.',
    'Visit every outcome with two loops, one inside the other. For each one, write its sum `a + b` into `board[a - 1][b - 1]` (the board starts as `table(6, 6, 0)`, and its rows and columns count from 0), and add 1 to `count` when the sum is `target`. Return `count / 36`.',
  ],
  entry: { python: 'sum_chance', js: 'sumChance' },
  args,
  starter: { python: SUM_STARTER_PY, javascript: SUM_STARTER_JS, typescript: sumTs(SUM_STARTER_JS) },
  solution: { python: stripBlanks(SUM_BLANKS_PY), javascript: stripBlanks(SUM_BLANKS_JS), typescript: sumTs(stripBlanks(SUM_BLANKS_JS)) },
  blanks: { python: SUM_BLANKS_PY, javascript: SUM_BLANKS_JS, typescript: sumTs(SUM_BLANKS_JS) },
  fades: [[5], [3, 4, 5], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['        for b in range(a, 7):', '    return count / 12'],
    javascript: ['    for (let b = a; b <= 6; b++) {', '  return count / 12;'],
    typescript: ['    for (let b = a; b <= 6; b++) {', '  return count / 12;'],
  },
  examples: [
    { id: 'seven', label: 'Sum is 7', input: { target: 7 } },
    { id: 'ten', label: 'Sum is 10', input: { target: 10 } },
  ],
  tests: SUM_TESTS,
  check: checkChance('exactly'),
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Two loops, one inside the other: a over the first die’s faces, 1 to 6, and inside it b over the second die’s, 1 to 6. That visits all 36 cells, (2, 5) and (5, 2) separately.',
    LOOPS,
    'The chance is the count over the number of equally likely outcomes: count / 36, not 12 and not 11.',
  ],
  legend: [
    { neutral: 'A cell of the board not written yet' },
    { mark: 'write', label: 'The sum your code just wrote' },
  ],
};

// ───────────────────────────── 2. dice-at-least ─────────────────────────────

const rename = (code: string) => code.replace('def sum_chance(', 'def at_least_chance(').replace('function sumChance(', 'function atLeastChance(');
const atLeast = (code: string) => rename(code).replace('a + b == target', 'a + b >= target').replace('a + b === target', 'a + b >= target');

const atLeastExercise: Exercise<ChanceInput> = {
  slug: 'dice-at-least',
  title: 'The chance two dice sum to at least a target',
  kind: 'modify',
  visualiser: 'two-dice',
  summary: 'Change working code from “the sum is exactly t” to “the sum is at least t”: a bigger event, more cells, the same division by 36.',
  task: [
    'This code works: `at_least_chance(target)` (`atLeastChance` in JavaScript and TypeScript) fills the board of sums and returns the chance that two dice sum to **exactly** `target`.',
    'Change it so it returns the chance that the sum is **at least** `target`: `target` or more. Before you edit, predict: how many outcomes sum to at least 10? Then run it and count the cells on the board.',
  ],
  entry: { python: 'at_least_chance', js: 'atLeastChance' },
  args,
  starter: { python: rename(sumExercise.solution.python), javascript: rename(sumExercise.solution.javascript), typescript: rename(sumExercise.solution.typescript) },
  solution: { python: atLeast(sumExercise.solution.python), javascript: atLeast(sumExercise.solution.javascript), typescript: atLeast(sumExercise.solution.typescript) },
  examples: [
    { id: 'ten', label: 'At least 10', input: { target: 10 } },
    { id: 'seven', label: 'At least 7', input: { target: 7 } },
  ],
  tests: [
    { name: 'at least 10: 10, 11 or 12', input: { target: 10 } },
    { name: 'at least 7', input: { target: 7 } },
    { name: 'at least 12: only the double 6', input: { target: 12 } },
    { name: 'at least 2: every outcome', input: { target: 2 } },
    { name: 'at least 4', input: { target: 4 } },
    { name: 'at least 13 never happens', input: { target: 13 } },
  ],
  check: checkChance('at least'),
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Only one line decides which outcomes count: the if.',
    '“At least 10” means 10, 11 or 12: the target itself counts too.',
    'Use >= target. The board and the division by 36 stay as they are.',
  ],
  legend: sumExercise.legend,
};

export const chanceExercises: Exercise[] = [sumExercise, atLeastExercise];

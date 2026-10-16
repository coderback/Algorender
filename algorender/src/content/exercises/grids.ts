// Exercises on a visual grid (2D tables for dynamic programming). The learner
// makes the table with the workspace's table() helper, so every cell their
// code fills shows up on GridView, with arrows from the cells it was built from.

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

export type GridSizeInput = { rows: number; cols: number };

/** The grid size as the entry function's two value arguments. */
export const gridSizeArgs = ({ rows, cols }: GridSizeInput): Arg[] => [
  { kind: 'value', name: 'rows', value: rows },
  { kind: 'value', name: 'cols', value: cols },
];

/** C(rows + cols − 2, rows − 1): every path is rows − 1 steps down and cols − 1 steps right, in some order. */
export function pathCount(rows: number, cols: number): number {
  const n = rows + cols - 2;
  const k = Math.min(rows, cols) - 1;
  let paths = 1;
  for (let i = 1; i <= k; i++) paths = (paths * (n - k + i)) / i;
  return Math.round(paths);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The table the learner filled: the one called dp, else the first one made. */
function learnerTable(result: RunResult): (number | null)[][] | null {
  const made = result.events.filter((e) => e.kind === 'grid');
  const table = made.find((e) => e.name === 'dp') ?? made[0];
  return table ? (result.grids?.[table.grid] ?? null) : null;
}

/** The right count, from code that filled a table to get it. */
function checkPaths({ rows, cols }: GridSizeInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const expected = pathCount(rows, cols);
  const size = `${rows} × ${cols}`;
  const dp = learnerTable(result);
  if (!dp) {
    return { pass: false, message: 'Make the table with dp = table(rows, cols) and fill it in: the counts you store there are what the picture shows.' };
  }
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: `Return the number of paths (a whole number), not ${JSON.stringify(got)}.` };
  if (got !== expected) {
    const shaped = dp.length === rows && dp.every((row) => row.length === cols);
    if (shaped && dp[rows - 1][cols - 1] === expected) {
      return {
        pass: false,
        message: `dp[${rows - 1}][${cols - 1}] holds ${expected}, the right count, but your function returned ${got}: return the bottom-right corner.`,
      };
    }
    let where = '';
    if (shaped) {
      // The first cell, in filling order, that doesn't hold the number of paths into it.
      outer: for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const want = pathCount(i + 1, j + 1);
          if (dp[i][j] !== want) {
            where = ` The first cell that is off is dp[${i}][${j}]: it holds ${dp[i][j] ?? 'nothing'}, but ${plural(want, 'path')} reach${want === 1 ? 'es' : ''} cell (${i}, ${j}).`;
            break outer;
          }
        }
      }
    }
    return { pass: false, message: `A ${size} grid has ${plural(expected, 'path')} from corner to corner, but your function returned ${got}.${where}` };
  }
  const writes = result.events.filter((e) => e.kind === 'cellWrite').length;
  if (rows > 1 && cols > 1 && writes === 0) {
    return {
      pass: false,
      message: `${expected} is right, but your code never wrote into the table: store each cell’s count in dp[i][j], built from its neighbours.`,
    };
  }
  return { pass: true, message: `A ${size} grid has ${plural(expected, 'path')}; your table found it in ${plural(writes, 'cell write')}.` };
}

const UNIQUE_PATHS_PY = `def unique_paths(rows, cols):
    dp = table(rows, cols)
    for i in range(rows):
        for j in range(cols):
            if «1:i == 0 or j == 0»:
                dp[i][j] = «2:1»
            else:
                dp[i][j] = «3:dp[i - 1][j] + dp[i][j - 1]»
    return «4:dp[rows - 1][cols - 1]»
`;

const UNIQUE_PATHS_JS = `function uniquePaths(rows, cols) {
  const dp = table(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if («1:i === 0 || j === 0») {
        dp[i][j] = «2:1»;
      } else {
        dp[i][j] = «3:dp[i - 1][j] + dp[i][j - 1]»;
      }
    }
  }
  return «4:dp[rows - 1][cols - 1]»;
}
`;

/** The TypeScript version: typed parameters, and a type on dp. */
const typed = (js: string) =>
  js
    .replace('function uniquePaths(rows, cols) {', 'function uniquePaths(rows: number, cols: number): number {')
    .replace('const dp = table(rows, cols);', 'const dp: number[][] = table(rows, cols);');

const UNIQUE_PATHS_BLANKS = { python: UNIQUE_PATHS_PY, javascript: UNIQUE_PATHS_JS, typescript: typed(UNIQUE_PATHS_JS) };

const STARTER_COMMENT = [
  'dp[i][j]: how many paths reach cell (i, j), stepping only right or down.',
  'Fill every cell, then return the count in the bottom-right corner.',
];

export const gridExercises: Exercise<GridSizeInput>[] = [
  {
    slug: 'unique-paths',
    title: 'Count the paths through a grid',
    kind: 'write',
    visualiser: 'unique-paths',
    summary: 'Count the paths across a grid by filling a table, and watch each cell add up the two cells it is reached from.',
    task: [
      'Write `unique_paths(rows, cols)` (Python) or `uniquePaths(rows, cols)` (JavaScript/TypeScript). A robot starts in the top-left cell of a grid with `rows` rows and `cols` columns and may only step right or down. Return how many different paths take it to the bottom-right cell.',
      'The starter makes the table for you: `dp = table(rows, cols)` is a list of lists (an array of arrays in JavaScript) that the picture shows, every cell starting at 0. Store in `dp[i][j]` how many paths reach cell (i, j), filling the table from the top-left, and return the count in the bottom-right corner.',
    ],
    entry: { python: 'unique_paths', js: 'uniquePaths' },
    args: gridSizeArgs,
    starter: {
      python: `def unique_paths(rows, cols):\n    dp = table(rows, cols)\n${STARTER_COMMENT.map((c) => `    # ${c}`).join('\n')}\n    return 0\n`,
      javascript: `function uniquePaths(rows, cols) {\n  const dp = table(rows, cols);\n${STARTER_COMMENT.map((c) => `  // ${c}`).join('\n')}\n  return 0;\n}\n`,
      typescript: `function uniquePaths(rows: number, cols: number): number {\n  const dp: number[][] = table(rows, cols);\n${STARTER_COMMENT.map((c) => `  // ${c}`).join('\n')}\n  return 0;\n}\n`,
    },
    solution: {
      python: stripBlanks(UNIQUE_PATHS_BLANKS.python),
      javascript: stripBlanks(UNIQUE_PATHS_BLANKS.javascript),
      typescript: stripBlanks(UNIQUE_PATHS_BLANKS.typescript),
    },
    blanks: UNIQUE_PATHS_BLANKS,
    // The recurrence alone, then the edges too, then the answer as well.
    fades: [[3], [1, 2, 3], [1, 2, 3, 4]],
    distractors: {
      python: ['dp[i][j] = dp[i - 1][j - 1] + 1', 'return dp[rows][cols]'],
      javascript: ['dp[i][j] = dp[i - 1][j - 1] + 1;', 'return dp[rows][cols];'],
      typescript: ['dp[i][j] = dp[i - 1][j - 1] + 1;', 'return dp[rows][cols];'],
    },
    examples: [
      { id: 'square', label: '3 × 3 grid', input: { rows: 3, cols: 3 } },
      { id: 'wide', label: '3 × 7 grid', input: { rows: 3, cols: 7 } },
      { id: 'line', label: 'One row (1 × 5)', input: { rows: 1, cols: 5 } },
    ],
    tests: [
      { name: 'a single cell', input: { rows: 1, cols: 1 } },
      { name: 'one row', input: { rows: 1, cols: 5 } },
      { name: 'one column', input: { rows: 5, cols: 1 } },
      { name: '2 × 2', input: { rows: 2, cols: 2 } },
      { name: '3 × 3', input: { rows: 3, cols: 3 } },
      { name: '3 × 7', input: { rows: 3, cols: 7 } },
      { name: '7 × 3 (rows and columns swapped)', input: { rows: 7, cols: 3 } },
      { name: 'a larger grid, 10 × 10', input: { rows: 10, cols: 10 } },
    ],
    check: checkPaths,
    markSortedAtEnd: false,
    pointers: [],
    hints: [
      'There is exactly one way to reach a cell in the top row (keep stepping right) or in the left column (keep stepping down), so those cells hold 1.',
      'Every other cell is entered either from above or from the left, and those are different paths, so its count is `dp[i - 1][j] + dp[i][j - 1]`.',
      'Fill the table row by row, left to right: then both neighbours are ready when you need them. The answer is `dp[rows - 1][cols - 1]`.',
    ],
    legend: [
      { neutral: 'Paths into the cell' },
      { mark: 'write', label: 'Cell your code writes' },
      { mark: 'compare', label: 'Cells it read (arrows) or compared' },
    ],
  },
];

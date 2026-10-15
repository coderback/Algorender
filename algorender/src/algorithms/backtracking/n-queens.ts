import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

export type QueensInput = { n: number };

const pseudocode = [
  'place(row):',
  '  if row > n: solved, stop',
  '  for col from 1 to n:',
  '    if no queen attacks (row, col):',
  '      put a queen at (row, col)',
  '      if place(row + 1) succeeds: stop',
  '      lift the queen   (backtrack)',
  '  return failure',
];

const QUEEN = '♛';
const qid = (row: number) => `q${row}`;
type Queen = { row: number; col: number };

const attacks = (q: Queen, row: number, col: number) => q.col === col || Math.abs(q.col - col) === Math.abs(q.row - row);

function* run({ n }: QueensInput): Generator<Frame<GridState>> {
  const t = new GridTracer(['checks', 'placements', 'backtracks']);
  t.addTable({
    label: `${n} × ${n} board`,
    look: 'board',
    checkered: true,
    rows: Array.from({ length: n }, (_, r) => ({ label: String(r + 1) })),
    cols: Array.from({ length: n }, (_, c) => ({ label: String(c + 1) })),
  });
  const queens: Queen[] = [];

  /** Shade every square attacked by a placed queen (other than the queen's own square). */
  const shade = () => {
    const attacked: CellRef[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (queens.some((q) => (q.row === r ? q.col !== c : attacks(q, r, c)))) attacked.push([r, c]);
      }
    }
    t.restyle('shade', attacked);
  };

  function* place(row: number): Generator<Frame<GridState>, boolean> {
    if (row === n) return true;
    let after: 'start' | 'unsafe' | 'lifted' = 'start';
    for (let col = 0; col < n; col++) {
      const at: CellRef = [row, col];
      const piece = { piece: qid(row) };
      const where = `row ${row + 1}, column ${col + 1}`;
      t.placePiece(qid(row), at, QUEEN, `Queen of row ${row + 1}`);
      t.count('checks');
      const attacker = [...queens].reverse().find((q) => attacks(q, row, col));
      yield t.frame({
        line: 3,
        note:
          after === 'start'
            ? `Row ${row + 1}: start with column 1. A shaded square is attacked by a queen already on the board.`
            : after === 'unsafe'
              ? `Slide the queen one square right, to column ${col + 1}.`
              : `Slide the lifted queen one square right, to column ${col + 1}.`,
        marks: { key: [at, piece] },
        vars: { row: row + 1, col: col + 1, queens: queens.length },
        checkpoint: { question: `Is ${where} safe?`, choices: ['Yes', 'No'], answer: attacker ? 1 : 0 },
      });

      if (attacker) {
        const how = attacker.col === col ? `down column ${col + 1}` : 'along a diagonal';
        yield t.frame({
          line: 3,
          note: `Not safe: the queen at row ${attacker.row + 1}, column ${attacker.col + 1} attacks it ${how}.`,
          marks: { reject: [at, piece, { piece: qid(attacker.row) }] },
          arrows: [{ from: [attacker.row, attacker.col], to: at, mark: 'reject' }],
          vars: { row: row + 1, col: col + 1, queens: queens.length },
        });
        after = 'unsafe';
        continue;
      }

      queens.push({ row, col });
      t.count('placements');
      shade();
      yield t.frame({
        line: 4,
        note:
          row + 1 < n
            ? `Safe: no queen above shares column ${col + 1} or a diagonal. Place it and move on to row ${row + 2}.`
            : `Safe: no queen above shares column ${col + 1} or a diagonal. Place it: that was the last row.`,
        vars: { row: row + 1, col: col + 1, queens: queens.length },
      });

      if (yield* place(row + 1)) return true;

      queens.pop();
      t.count('backtracks');
      shade();
      yield t.frame({
        line: 6,
        note: `Row ${row + 2} has no safe square with the queens above as they are, so the row ${row + 1} queen has to move: lift it off column ${col + 1}.`,
        marks: { reject: [piece] },
        vars: { row: row + 1, col: col + 1, queens: queens.length },
      });
      after = 'lifted';
    }

    t.removePiece(qid(row));
    yield t.frame({
      line: 7,
      note:
        row === 0
          ? `Every column of row 1 has led to a dead end, so there is no way to place ${n} queens on a ${n} × ${n} board.`
          : `Every square in row ${row + 1} is attacked or leads to a dead end, so take this queen off and go back to row ${row}.`,
      vars: { row: row + 1, queens: queens.length },
    });
    return false;
  }

  yield t.frame({
    note: `Place ${n} queens so that no two share a row, a column or a diagonal. Go row by row, trying columns left to right; when a row has no safe square, back up and move the queen above.`,
    vars: { n },
  });
  const solved = yield* place(0);
  if (solved) {
    for (let r = 0; r < n; r++) t.mark({ piece: qid(r) }, 'found');
    const { placements, backtracks } = t.stats;
    yield t.frame({
      line: 1,
      note: `All ${n} queens are on the board and none attacks another: the first solution, found after ${placements} placements and ${backtracks} backtracks.`,
      vars: { n, queens: n },
    });
  } else {
    yield t.frame({
      note: `Backtracking tried every possibility and proved that ${n} queens cannot share a ${n} × ${n} board.`,
      vars: { n },
    });
  }
}

export const nQueens = defineAlgorithm<QueensInput, GridState>({
  kind: 'algorithm',
  slug: 'n-queens',
  view: 'grid',
  input: {
    examples: [
      { id: 'four', label: '4 × 4', make: () => ({ n: 4 }) },
      { id: 'five', label: '5 × 5', make: () => ({ n: 5 }) },
      { id: 'six', label: '6 × 6', make: () => ({ n: 6 }) },
      { id: 'eight', label: '8 × 8 (classic)', make: () => ({ n: 8 }) },
      { id: 'three', label: '3 × 3 (impossible)', make: () => ({ n: 3 }) },
    ],
  },
  pseudocode,
  stats: [
    { key: 'checks', label: 'Squares checked' },
    { key: 'placements', label: 'Queens placed' },
    { key: 'backtracks', label: 'Backtracks' },
  ],
  legend: [
    { neutral: 'Square under attack' },
    { mark: 'key', label: 'Square being tried' },
    { mark: 'reject', label: 'Attacked, or lifted to backtrack' },
    { mark: 'found', label: 'Solution' },
  ],
  run,
  content: {
    idea: 'Place queens one row at a time. In each row, try the columns from left to right and take the first square no queen attacks. If a row has no safe square, the choice above was wrong: lift that queen and slide it further along. This stops at the first solution.',
    invariant: 'The queens on the board never attack each other: a queen is only placed on a square that shares no column or diagonal with the queens above it (one per row means rows never clash).',
    whenToUse: 'Backtracking suits constraint problems (N-Queens, Sudoku, crosswords, scheduling) where partial solutions can be checked early, so whole branches are discarded without being explored. The worst case is still exponential.',
    traits: [
      { label: 'Prunes a branch as soon as it breaks a rule', good: true },
      { label: 'Exponential in the worst case', good: false },
      { label: 'Finds the first solution, not all of them', good: null },
    ],
    experiments: [
      { example: 'five', prompt: 'Every queen lands on its first safe square: a solution without a single backtrack.' },
      { example: 'six', prompt: 'Six is surprisingly hard: it has only 4 solutions, so watch how often the solver backs up.' },
      { example: 'three', prompt: 'No arrangement exists. Backtracking proves it by running out of options in row 1.' },
      { example: 'eight', prompt: 'The classic puzzle: over a hundred placements before the first solution. Count the backtracks.' },
    ],
  },
});

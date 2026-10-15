import type { InputSpec } from '@/engine/module';
import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer, type ArrowSpec, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

/** A square puzzle in reading order; 0 is a blank. */
export type SudokuInput = { size: 4 | 9; cells: number[] };

/** Cell visits (one digit search each) before the solver gives up, so traces stay replayable. */
export const VISIT_BUDGET = 2500;

const pseudocode = [
  'solve():',
  '  find the first empty cell',
  '  if there is none: solved',
  '  for d from 1 to N:',
  '    if d is not in its row, column, box:',
  '      write d',
  '      if solve() succeeds: done',
  '      erase d   (backtrack)',
  '  return failure (dead end)',
];

const NONE = 'None fits';

type Unit = 'row' | 'column' | 'box';
type Clash = { digit: number; at: number; unit: Unit };
type Result = 'solved' | 'failed' | 'budget';

/** Every other cell in the same row, column or box as cell k. */
export function peers(size: number, k: number): number[] {
  const box = Math.sqrt(size);
  const r = Math.floor(k / size);
  const c = k % size;
  const br = r - (r % box);
  const bc = c - (c % box);
  const out = new Set<number>();
  for (let i = 0; i < size; i++) {
    out.add(r * size + i);
    out.add(i * size + c);
  }
  for (let i = 0; i < box; i++) for (let j = 0; j < box; j++) out.add((br + i) * size + bc + j);
  out.delete(k);
  return [...out];
}

/** Where digit d already appears among cell k's peers (row first, then column, then box), or null. */
function clashOf(grid: readonly number[], size: number, k: number, d: number): Clash | null {
  const r = Math.floor(k / size);
  const c = k % size;
  const rank: Record<Unit, number> = { row: 0, column: 1, box: 2 };
  let best: Clash | null = null;
  for (const p of peers(size, k)) {
    if (grid[p] !== d) continue;
    const unit: Unit = Math.floor(p / size) === r ? 'row' : p % size === c ? 'column' : 'box';
    if (!best || rank[unit] < rank[best.unit]) best = { digit: d, at: p, unit };
  }
  return best;
}

function listDigits(ds: number[]): string {
  return ds.length === 1 ? String(ds[0]) : `${ds.slice(0, -1).join(', ')} and ${ds.at(-1)}`;
}

/** "1 and 3 are in its row, 2 is in its box" */
function describeClashes(clashes: readonly Clash[]): string {
  return (['row', 'column', 'box'] as const)
    .map((unit) => clashes.filter((c) => c.unit === unit).map((c) => c.digit))
    .map((ds, u) => (ds.length ? `${listDigits(ds)} ${ds.length === 1 ? 'is' : 'are'} in its ${['row', 'column', 'box'][u]}` : ''))
    .filter(Boolean)
    .join(', ');
}

function* run({ size, cells }: SudokuInput): Generator<Frame<GridState>> {
  const N = size;
  const box = Math.sqrt(N);
  const grid = [...cells];
  const t = new GridTracer(['tries', 'placements', 'backtracks']);
  t.addTable({
    label: `${N} × ${N} puzzle`,
    look: 'board',
    box,
    rows: Array.from({ length: N }, (_, r) => ({ label: String(r + 1) })),
    cols: Array.from({ length: N }, (_, c) => ({ label: String(c + 1) })),
  });
  const ref = (k: number): CellRef => [Math.floor(k / N), k % N];
  const name = (k: number) => `row ${Math.floor(k / N) + 1}, column ${(k % N) + 1}`;
  grid.forEach((d, k) => {
    if (d === 0) return;
    t.set(ref(k), d);
    t.setStyle(ref(k), 'given');
  });
  let visits = 0;

  /** Smallest digit ≥ from that fits cell k, and one clash for every digit skipped on the way. */
  const search = (k: number, from: number) => {
    const clashes: Clash[] = [];
    for (let d = from; d <= N; d++) {
      const clash = clashOf(grid, N, k, d);
      if (!clash) return { digit: d, clashes };
      clashes.push(clash);
    }
    return { digit: null, clashes };
  };
  const arrowsFor = (k: number, clashes: readonly Clash[]): ArrowSpec[] =>
    clashes.map((c) => ({ from: ref(c.at), to: ref(k), mark: 'reject', bend: c.unit === 'box' ? 0 : 0.4 }));

  function* solve(): Generator<Frame<GridState>, Result> {
    const k = grid.indexOf(0);
    if (k < 0) return 'solved';
    const here = ref(k);
    const region = { cells: peers(N, k).map(ref), mark: 'compare' as const };
    let from = 1;
    let erased: number | null = null;

    for (;;) {
      if (visits >= VISIT_BUDGET) return 'budget';
      visits++;
      const { digit, clashes } = search(k, from);
      t.count('tries', clashes.length + (digit == null ? 0 : 1));

      // Choices: the answer, the digits most easily mistaken for it (a skipped
      // clash, the next digit that also fits, the digit just erased), and "None fits".
      const answer = digit == null ? NONE : String(digit);
      const fitsLater = Array.from({ length: N }, (_, i) => i + 1).filter((d) => d > (digit ?? N) && !clashOf(grid, N, k, d));
      const wrong = [...new Set([...clashes.map((c) => c.digit), ...fitsLater, ...Array.from({ length: from - 1 }, (_, i) => from - 1 - i)])];
      const digits = [...wrong.slice(0, digit == null ? 3 : 2), ...(digit == null ? [] : [digit])].sort((x, y) => x - y).map(String);
      const options = [...digits, NONE];

      yield t.frame({
        line: erased == null ? 1 : 7,
        note:
          erased == null
            ? `Next empty cell in reading order: ${name(k)}. A digit may not repeat anywhere in the shaded row, column and box.`
            : `Back at ${name(k)}: erase its ${erased} and look for a larger digit that still fits.`,
        marks: { key: [here] },
        tints: [region],
        vars: { row: Math.floor(k / N) + 1, col: (k % N) + 1, from },
        checkpoint: {
          question: erased == null ? `Which digit goes in ${name(k)} first?` : `Which digit does ${name(k)} get next?`,
          choices: options,
          answer: options.indexOf(answer),
        },
      });

      if (digit == null) {
        const range = from === 1 ? `every digit 1–${N}` : from === N ? `${N}, the only digit left,` : `every digit from ${from} to ${N}`;
        yield t.frame({
          line: 8,
          note:
            from > N
              ? `Dead end: there is no digit above ${N} to try, so an earlier choice must change.`
              : `Dead end: ${range} already appears in this cell's row, column or box (${describeClashes(clashes)}), so an earlier choice must change.`,
          marks: { reject: [here, ...clashes.map((c) => ref(c.at))] },
          tints: [region],
          arrows: arrowsFor(k, clashes),
          vars: { row: Math.floor(k / N) + 1, col: (k % N) + 1 },
        });
        return 'failed';
      }

      grid[k] = digit;
      t.set(here, digit);
      t.setStyle(here, 'plain');
      t.count('placements');
      yield t.frame({
        line: 5,
        note: clashes.length
          ? `Write ${digit}: ${describeClashes(clashes)}, but ${digit} appears nowhere in its row, column or box.`
          : `Write ${digit}: it appears nowhere in this cell's row, column or box.`,
        marks: { write: [here], reject: clashes.map((c) => ref(c.at)) },
        tints: [region],
        arrows: arrowsFor(k, clashes),
        vars: { row: Math.floor(k / N) + 1, col: (k % N) + 1, digit },
      });

      const result = yield* solve();
      if (result !== 'failed') return result;

      grid[k] = 0;
      t.set(here, '');
      t.setStyle(here, null);
      t.count('backtracks');
      erased = digit;
      from = digit + 1;
    }
  }

  const blanks = grid.filter((d) => d === 0).length;
  yield t.frame({
    note: `Fill the ${blanks} empty cells so that every row, column and ${box} × ${box} box holds 1–${N} once. Take the empty cells in reading order and give each the smallest digit that fits; on a dead end, go back and change the previous choice.`,
    vars: { blanks },
  });
  const result = yield* solve();
  const { placements, backtracks } = t.stats;
  yield t.frame({
    line: result === 'solved' ? 2 : null,
    note:
      result === 'solved'
        ? `Solved: every cell is filled and no digit repeats in a row, column or box, after ${placements} placements and ${backtracks} backtracks.`
        : result === 'failed'
          ? `Every digit for the first empty cell has led to a dead end, so this puzzle has no solution.`
          : `Stopped after ${VISIT_BUDGET} cell visits: this puzzle needs more backtracking than a step-by-step replay can show. Real solvers fill the most constrained cell first to cut the search down.`,
    vars: { placements, backtracks },
  });
}

// ───────────────────────────── inputs ─────────────────────────────

const puzzle = (size: 4 | 9, text: string): SudokuInput => ({ size, cells: [...text].map(Number) });

/** The clashing pair if two givens share a row, column or box, else null. */
function firstClash({ size, cells }: SudokuInput): [number, number] | null {
  for (let k = 0; k < cells.length; k++) {
    if (cells[k] === 0) continue;
    for (const p of peers(size, k)) if (p > k && cells[p] === cells[k]) return [k, p];
  }
  return null;
}

const custom: NonNullable<InputSpec<SudokuInput>['custom']> = {
  label: 'A 4 × 4 or 9 × 9 puzzle, row by row (digits, . or 0 for blanks)',
  placeholder: 'e.g. 1.3. .4.. ..1. 3..2',
  parse: (text) => {
    const chars = [...text.replace(/[\s/|,]/g, '')];
    if (chars.length !== 16 && chars.length !== 81) {
      return { error: `A puzzle has 16 cells (4 × 4) or 81 cells (9 × 9); this has ${chars.length}.` };
    }
    const size = chars.length === 16 ? 4 : 9;
    const cells: number[] = [];
    for (const ch of chars) {
      const d = ch === '.' ? 0 : Number(ch);
      if (!Number.isInteger(d) || d < 0 || d > size) return { error: `"${ch}" is not a digit from 1 to ${size}, "." or 0.` };
      cells.push(d);
    }
    const value: SudokuInput = { size, cells };
    const clash = firstClash(value);
    if (clash) {
      const [a, b] = clash;
      return { error: `The clues already clash: two ${cells[a]}s at row ${Math.floor(a / size) + 1}, column ${(a % size) + 1} and row ${Math.floor(b / size) + 1}, column ${(b % size) + 1}.` };
    }
    return { value };
  },
  format: ({ size, cells }) =>
    Array.from({ length: size }, (_, r) =>
      cells
        .slice(r * size, (r + 1) * size)
        .map((d) => (d === 0 ? '.' : String(d)))
        .join(''),
    ).join(' '),
};

export const sudokuSolver = defineAlgorithm<SudokuInput, GridState>({
  kind: 'algorithm',
  slug: 'sudoku-solver',
  view: 'grid',
  input: {
    examples: [
      { id: 'mini', label: 'Mini 4 × 4', make: () => puzzle(4, '0234340000404300') },
      { id: 'mini-backtrack', label: 'Mini 4 × 4 with dead ends', make: () => puzzle(4, '3104000000000040') },
      { id: 'easy', label: 'Easy 9 × 9', make: () => puzzle(9, '534678902072195048198342560809701423406853700713924806061530084200409635300286179') },
      { id: 'medium', label: 'Medium 9 × 9', make: () => puzzle(9, '034608010672095348008302007800700423020853001000024050961507084080409600300280179') },
      { id: 'hard', label: 'Hard 9 × 9', make: () => puzzle(9, '030600010000090308190042007850060020400000001713004800960537080080010035000000070') },
      { id: 'no-solution', label: 'Mini 4 × 4, no solution', make: () => puzzle(4, '2000010000230340') },
      { id: 'too-hard', label: 'Classic puzzle (too long to replay)', make: () => puzzle(9, '530070000600195000098000060800060003400803001700020006060000280000419005000080079') },
    ],
    custom,
  },
  pseudocode,
  stats: [
    { key: 'tries', label: 'Digits checked' },
    { key: 'placements', label: 'Digits written' },
    { key: 'backtracks', label: 'Backtracks' },
  ],
  legend: [
    { neutral: 'Given clue' },
    { mark: 'key', label: 'Cell being filled' },
    { mark: 'compare', label: 'Its row, column and box' },
    { mark: 'write', label: 'Digit just written' },
    { mark: 'reject', label: 'Clash (digit already used)' },
  ],
  run,
  content: {
    idea: 'Fill the empty cells one at a time with the smallest digit that does not clash with its row, column or box. When a cell has no digit left, an earlier guess was wrong: go back to the previous cell, erase it and try its next digit.',
    invariant: 'The filled cells never break a rule: a digit is only written when it appears nowhere else in its row, column and box, and backtracking only ever erases. So the first time no cell is empty, the grid is solved.',
    whenToUse: 'Small constraint puzzles and as the core of real solvers, which add smarter cell ordering (most constrained cell first) and constraint propagation to prune far more. Plain reading-order backtracking can take millions of steps on hard 9 × 9 puzzles.',
    traits: [
      { label: 'Never writes a clashing digit', good: true },
      { label: 'Exponential in the worst case', good: false },
      { label: `Stops after ${VISIT_BUDGET} cell visits here`, good: null },
    ],
    experiments: [
      { example: 'mini-backtrack', prompt: 'With few clues, an early guess blocks a later cell. Watch the solver erase and try the next digit.' },
      { example: 'easy', prompt: 'Every empty cell has exactly one digit left, so the solver never backtracks.' },
      { example: 'no-solution', prompt: 'The clues force a 2 into a column that already has one. Backtracking proves there is no way out.' },
      { example: 'too-hard', prompt: 'A famous puzzle that is easy for people but needs thousands of backtracks in reading order: the solver hits its budget.' },
    ],
  },
});

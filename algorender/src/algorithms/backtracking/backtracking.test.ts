import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_FRAMES } from '@/engine/trace';
import { answerPositions, expectLegendMatchesMarks, expectGoodTrace, expectShortPseudocode, table, traceOf } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import { backtracking } from '.';
import { nQueens } from './n-queens';
import { peers, sudokuSolver, VISIT_BUDGET, type SudokuInput } from './sudoku-solver';

// ───────────────────────────── references ─────────────────────────────

/** First N-Queens solution in row-by-row, left-to-right order, with the same counters. */
function queensReference(n: number) {
  const cols: number[] = [];
  const stats = { checks: 0, placements: 0, backtracks: 0 };
  const safe = (r: number, c: number) => cols.every((cc, rr) => cc !== c && Math.abs(cc - c) !== r - rr);
  const place = (r: number): boolean => {
    if (r === n) return true;
    for (let c = 0; c < n; c++) {
      stats.checks++;
      if (!safe(r, c)) continue;
      cols.push(c);
      stats.placements++;
      if (place(r + 1)) return true;
      cols.pop();
      stats.backtracks++;
    }
    return false;
  };
  return { solved: place(0), cols, stats };
}

/** Does any completion of the puzzle exist? Plain backtracking without a budget (small puzzles only). */
function solvable({ size, cells }: SudokuInput): boolean {
  const g = [...cells];
  const fill = (): boolean => {
    const k = g.indexOf(0);
    if (k < 0) return true;
    for (let d = 1; d <= size; d++) {
      if (peers(size, k).some((p) => g[p] === d)) continue;
      g[k] = d;
      if (fill()) return true;
      g[k] = 0;
    }
    return false;
  };
  return fill();
}

function gridOf(state: GridState): number[] {
  const t = table(state);
  return t.rows.flatMap((r) => t.cells[r.id].map((x) => (x === '' ? 0 : Number(x))));
}

function expectValidSolution(input: SudokuInput, grid: number[]) {
  expect(grid).not.toContain(0);
  grid.forEach((d, k) => {
    if (input.cells[k] !== 0) expect(d).toBe(input.cells[k]);
    for (const p of peers(input.size, k)) expect(grid[p]).not.toBe(d);
  });
}

const SOLVED4 = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const SOLVED9 = [...'534678912672195348198342567859761423426853791713924856961537284287419635345286179'].map(Number);

/** A puzzle cut from a solved grid: relabel the digits, then blank some cells. */
const puzzleFrom = (solved: number[], size: 4 | 9) =>
  fc
    .tuple(fc.shuffledSubarray(Array.from({ length: size }, (_, i) => i + 1), { minLength: size, maxLength: size }), fc.array(fc.boolean(), { minLength: size * size, maxLength: size * size }))
    .map(([perm, blank]): SudokuInput => ({ size, cells: solved.map((d, k) => (blank[k] ? 0 : perm[d - 1])) }));

// ───────────────────────────── every module ─────────────────────────────

describe.each(backtracking)('$slug', (algo) => {
  it('builds every example and replays it with good frames, under the frame cap', () => {
    for (const example of algo.input.examples) {
      const { frames, truncated } = traceOf(algo, example.make({ seed: 1, size: 0 }));
      expect(truncated).toBe(false);
      expectGoodTrace(algo, frames);
    }
  });

  it('keeps pseudo-code short enough for the side panel', () => expectShortPseudocode(algo));

  it('lists exactly the marks it uses in its legend', () => expectLegendMatchesMarks(algo));

  it('has a legend that starts with the neutral state, and experiments that name real examples', () => {
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(algo.input.examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('varies where the right answer sits among the choices', () => {
    const positions = new Set<number>();
    for (const example of algo.input.examples) for (const p of answerPositions(traceOf(algo, example.make({ seed: 3, size: 0 })).frames)) positions.add(p);
    expect(positions.size).toBeGreaterThan(1);
  });
});

// ───────────────────────────── N-Queens ─────────────────────────────

describe('n-queens', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('n = %i: finds the first solution (or proves there is none) like the reference', (n) => {
    const { frames, truncated } = traceOf(nQueens, { n });
    expect(truncated).toBe(false);
    expectGoodTrace(nQueens, frames);
    const ref = queensReference(n);
    const last = table(frames.at(-1)!.state);
    const index = new Map(last.rows.map((r, i) => [r.id, i]));
    const placed = last.pieces.map((p) => ({ row: index.get(p.at.row)!, col: p.at.col })).sort((a, b) => a.row - b.row);
    if (ref.solved) {
      expect(placed.map((q) => q.col)).toEqual(ref.cols);
      for (const a of placed) for (const b of placed) if (a !== b) expect(a.col !== b.col && Math.abs(a.col - b.col) !== Math.abs(a.row - b.row)).toBe(true);
      expect(last.pieces.every((p) => p.mark === 'found')).toBe(true);
    } else {
      expect(placed).toHaveLength(0);
    }
    expect(frames.at(-1)!.stats).toEqual(ref.stats);
  });

  it('gives every removal of a queen its own frame, and slides queens instead of re-creating them', () => {
    for (const n of [4, 6, 8]) {
      const { frames } = traceOf(nQueens, { n });
      for (let i = 1; i < frames.length; i++) {
        const before = new Set(table(frames[i - 1].state).pieces.map((p) => p.id));
        const after = new Set(table(frames[i].state).pieces.map((p) => p.id));
        const removed = [...before].filter((id) => !after.has(id));
        if (removed.length > 0) {
          expect(removed).toHaveLength(1);
          expect(frames[i].line).toBe(7);
        }
      }
    }
  });

  it('shades exactly the squares attacked by the queens that are placed (not the one being tried or lifted)', () => {
    const n = 6;
    const wrong = traceOf(nQueens, { n }).frames.filter((frame) => {
      const t = table(frame.state);
      const index = new Map(t.rows.map((r, i) => [r.id, i]));
      // While a square is tried (line 4 of the pseudo-code) or a queen is lifted (line 7), that row's queen is not placed.
      const active = frame.line === 3 || frame.line === 6 ? `q${Number(frame.vars.row) - 1}` : null;
      const placed = t.pieces.filter((p) => p.id !== active).map((p) => ({ row: index.get(p.at.row)!, col: p.at.col }));
      const expected = new Set<string>();
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (placed.some((q) => (q.row === r ? q.col !== c : q.col === c || Math.abs(q.col - c) === Math.abs(q.row - r)))) expected.add(`${t.rows[r].id}:${c}`);
      const shaded = new Set(Object.entries(t.styles).flatMap(([key, s]) => (s === 'shade' ? [key] : [])));
      return shaded.size !== expected.size || [...expected].some((key) => !shaded.has(key));
    });
    expect(wrong).toHaveLength(0);
  });
});

// ───────────────────────────── Sudoku ─────────────────────────────

describe('sudoku-solver', () => {
  it('solves every solvable example, keeping the clues', () => {
    for (const example of sudokuSolver.input.examples) {
      const input = example.make({ seed: 1, size: 0 });
      const { frames } = traceOf(sudokuSolver, input);
      const last = frames.at(-1)!;
      if (example.id === 'no-solution') {
        expect(solvable(input)).toBe(false);
        expect(last.note).toContain('no solution');
      } else if (example.id === 'too-hard') {
        expect(last.note).toContain(`Stopped after ${VISIT_BUDGET}`);
      } else {
        expectValidSolution(input, gridOf(last.state));
      }
    }
  });

  it('solves random 4 × 4 puzzles exactly when a solution exists', () => {
    const consistentRandom = fc
      .array(fc.integer({ min: 0, max: 4 }), { minLength: 16, maxLength: 16 })
      .map((cells): SudokuInput => ({ size: 4, cells }))
      .filter(({ cells }) => cells.every((d, k) => d === 0 || peers(4, k).every((p) => cells[p] !== d)));
    fc.assert(
      fc.property(fc.oneof(puzzleFrom(SOLVED4, 4), consistentRandom), (input) => {
        const { frames, truncated } = traceOf(sudokuSolver, input);
        expect(truncated).toBe(false);
        if (solvable(input)) expectValidSolution(input, gridOf(frames.at(-1)!.state));
        else expect(frames.at(-1)!.note).toContain('no solution');
      }),
      { numRuns: 120 },
    );
  });

  it('solves random 9 × 9 puzzles or stops at its budget, always under the frame cap', () => {
    fc.assert(
      fc.property(puzzleFrom(SOLVED9, 9), (input) => {
        const { frames, truncated } = traceOf(sudokuSolver, input);
        expect(truncated).toBe(false);
        expect(frames.length).toBeLessThan(MAX_FRAMES);
        if (!frames.at(-1)!.note.startsWith('Stopped')) expectValidSolution(input, gridOf(frames.at(-1)!.state));
      }),
      { numRuns: 25 },
    );
  });

  it('narrates random runs properly', () => {
    fc.assert(
      fc.property(puzzleFrom(SOLVED4, 4), (input) => expectGoodTrace(sudokuSolver, traceOf(sudokuSolver, input).frames)),
      { numRuns: 40 },
    );
  });

  it('never writes a digit that clashes', () => {
    for (const id of ['mini-backtrack', 'medium']) {
      const input = sudokuSolver.input.examples.find((e) => e.id === id)!.make({ seed: 1, size: 0 });
      const clashing = traceOf(sudokuSolver, input).frames.filter(({ state }) => {
        const g = gridOf(state);
        return g.some((d, k) => d !== 0 && peers(input.size, k).some((p) => g[p] === d));
      });
      expect(clashing).toHaveLength(0);
    }
  });

  it('accepts its own formatted custom input and rejects bad puzzles', () => {
    const { parse, format } = sudokuSolver.input.custom!;
    for (const example of sudokuSolver.input.examples) {
      const input = example.make({ seed: 1, size: 0 });
      expect(parse(format(input))).toEqual({ value: input });
    }
    expect(parse('1.3. .4.. ..1. 3..2')).toEqual({ value: { size: 4, cells: [1, 0, 3, 0, 0, 4, 0, 0, 0, 0, 1, 0, 3, 0, 0, 2] } });
    expect(parse('123')).toHaveProperty('error');
    expect(parse('1.3. .4.. ..1. 3..5')).toHaveProperty('error');
    expect(parse('11.. .... .... ....')).toHaveProperty('error');
    expect(parse('1.3. .4.. ..x. 3..2')).toHaveProperty('error');
  });
});

import type { AnyAlgorithm } from '@/engine/module';
import { nQueens } from './n-queens';
import { sudokuSolver } from './sudoku-solver';

export const backtracking: AnyAlgorithm[] = [nQueens, sudokuSolver];

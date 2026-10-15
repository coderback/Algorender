import type { AnyAlgorithm } from '@/engine/module';
import { nQueens } from './n-queens';
import { permutations } from './permutations';
import { subsets } from './subsets';
import { sudokuSolver } from './sudoku-solver';

export const backtracking: AnyAlgorithm[] = [nQueens, sudokuSolver];

/**
 * Backtracking shown as a growing search tree (tree view). Kept apart from
 * `backtracking` because backtracking.test.ts runs grid-view checks over every
 * module in that array; src/registry.ts must spread this list too.
 */
export const decisionTrees: AnyAlgorithm[] = [subsets, permutations];

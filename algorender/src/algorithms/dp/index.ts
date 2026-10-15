import type { AnyAlgorithm } from '@/engine/module';
import { editDistance } from './edit-distance';
import { fibonacciMemoization } from './fibonacci-memoization';
import { knapsack01 } from './knapsack-01';
import { longestCommonSubsequence } from './longest-common-subsequence';

export const dynamicProgramming: AnyAlgorithm[] = [fibonacciMemoization, knapsack01, longestCommonSubsequence, editDistance];

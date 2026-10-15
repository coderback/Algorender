import type { AnyAlgorithm } from '@/engine/module';
import { coinChange } from './coin-change';
import { editDistance } from './edit-distance';
import { fibonacciMemoization } from './fibonacci-memoization';
import { houseRobber } from './house-robber';
import { knapsack01 } from './knapsack-01';
import { longestCommonSubsequence } from './longest-common-subsequence';
import { longestIncreasingSubsequence } from './longest-increasing-subsequence';
import { uniquePaths } from './unique-paths';

export const dynamicProgramming: AnyAlgorithm[] = [
  fibonacciMemoization,
  knapsack01,
  longestCommonSubsequence,
  editDistance,
  coinChange,
  longestIncreasingSubsequence,
  uniquePaths,
  houseRobber,
];

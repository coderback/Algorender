import type { AnyAlgorithm } from '@/engine/module';
import { activitySelection } from './activity-selection';
import { knapsackGreedy } from './knapsack-greedy';

export const greedy: AnyAlgorithm[] = [knapsackGreedy, activitySelection];

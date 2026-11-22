import type { AnyAlgorithm } from '@/engine/module';
import { decisionTree } from './decision-tree';
import { gradientBoosting } from './gradient-boosting';
import { linearRegression } from './linear-regression';
import { logisticRegression } from './logistic-regression';
import { kMeans } from './k-means';
import { mlpPlayground } from './mlp';
import { perceptron } from './perceptron';
import { sgd } from './sgd';
import { supervisedLearning } from './supervised-learning';

export const machineLearning: AnyAlgorithm[] = [
  supervisedLearning,
  linearRegression,
  logisticRegression,
  sgd,
  kMeans,
  decisionTree,
  gradientBoosting,
  perceptron,
  mlpPlayground,
];

import type { AnyAlgorithm } from '@/engine/module';
import { decisionTree } from './decision-tree';
import { gradientBoosting } from './gradient-boosting';
import { linearRegression } from './linear-regression';
import { logisticRegression } from './logistic-regression';
import { kMeans } from './k-means';
import { kNearestNeighbours } from './k-nearest-neighbours';
import { mlpPlayground } from './mlp';
import { overfitting } from './overfitting';
import { perceptron } from './perceptron';
import { regularisation } from './regularisation';
import { rocCurve } from './roc-curve';
import { sgd } from './sgd';
import { softmax } from './softmax';
import { supervisedLearning } from './supervised-learning';

export const machineLearning: AnyAlgorithm[] = [
  supervisedLearning,
  linearRegression,
  overfitting,
  regularisation,
  logisticRegression,
  softmax,
  sgd,
  rocCurve,
  kNearestNeighbours,
  kMeans,
  decisionTree,
  gradientBoosting,
  perceptron,
  mlpPlayground,
];

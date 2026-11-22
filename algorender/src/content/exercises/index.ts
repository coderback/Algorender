// Code exercises: the learner writes (or fixes) an algorithm in Python,
// JavaScript or TypeScript, and their own code drives the views (src/workspace).
// The model lives in shared.ts; each file below adds one family.

import { arrayExercises, bugHunts, modifyExercises } from './arrays';
import { autogradExercises } from './autograd';
import { bootstrapExercises } from './bootstrap';
import { calculusExercises } from './calculus';
import { chanceExercises } from './chance';
import { correlationExercises } from './correlation';
import { countingExercises } from './counting';
import { distributionExercises } from './distributions';
import { graphExercises } from './graphs';
import { gridExercises } from './grids';
import { integralExercises } from './integrals';
import { leastSquaresExercises } from './least-squares';
import { likelihoodExercises } from './likelihood';
import { linearAlgebraExercises } from './linear-algebra';
import { mlExercises } from './ml';
import { monteCarloExercises } from './monte-carlo';
import { permutationExercises } from './permutation-test';
import { randomVariableExercises } from './random-variables';
import { sgdExercises } from './sgd';
import { toolkitExercises } from './toolkit';
import type { Exercise } from './shared';
import { treeExercises } from './trees';

export * from './shared';
export { arrayArgs, type ArrayInput } from './arrays';

export const exercises: Exercise[] = [
  ...arrayExercises,
  ...gridExercises,
  ...graphExercises,
  ...treeExercises,
  ...toolkitExercises,
  ...linearAlgebraExercises,
  ...leastSquaresExercises,
  ...mlExercises,
  ...calculusExercises,
  ...autogradExercises,
  ...countingExercises,
  ...chanceExercises,
  ...randomVariableExercises,
  ...monteCarloExercises,
  ...integralExercises,
  ...distributionExercises,
  ...correlationExercises,
  ...likelihoodExercises,
  ...bootstrapExercises,
  ...permutationExercises,
  ...sgdExercises,
  ...modifyExercises,
  ...bugHunts,
];

export function getExercise(slug: string): Exercise | undefined {
  return exercises.find((e) => e.slug === slug);
}

/** The write-it-yourself exercise for a visualiser, if there is one. */
export function exerciseForVisualiser(slug: string): Exercise | undefined {
  return exercises.find((e) => e.visualiser === slug && e.kind === 'write');
}

import type { AnyAlgorithm } from '@/engine/module';
import { bayes } from './bayes';
import { centralLimitTheorem } from './central-limit-theorem';
import { correlation } from './correlation';
import { confidenceIntervals } from './confidence-intervals';
import { counting } from './counting';
import { distributions } from './distributions';
import { maximumLikelihood } from './maximum-likelihood';
import { monteCarlo } from './monte-carlo';
import { permutationTest } from './permutation-test';
import { randomVariables } from './random-variables';
import { twoDice } from './two-dice';

/** Probability, in the order the math and ML path teaches it. */
export const probability: AnyAlgorithm[] = [counting, twoDice, bayes, randomVariables, monteCarlo, distributions, centralLimitTheorem, correlation, maximumLikelihood, confidenceIntervals, permutationTest];

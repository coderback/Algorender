import type { AnyAlgorithm } from '@/engine/module';
import { autograd } from './autograd';
import { chainRule } from './chain-rule';
import { contourMaps } from './contour-maps';
import { derivative } from './derivative';
import { derivativeRules } from './derivative-rules';
import { gradientDescent } from './gradient-descent';
import { jacobian } from './jacobian';
import { optimizers } from './optimizers';
import { taylor } from './taylor';

/** Calculus, in the order the math and ML path teaches it. */
export const calculus: AnyAlgorithm[] = [contourMaps, derivative, derivativeRules, chainRule, taylor, jacobian, autograd, gradientDescent, optimizers];

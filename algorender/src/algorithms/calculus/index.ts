import type { AnyAlgorithm } from '@/engine/module';
import { chainRule } from './chain-rule';
import { derivative } from './derivative';
import { gradientDescent } from './gradient-descent';
import { optimizers } from './optimizers';

export const calculus: AnyAlgorithm[] = [derivative, chainRule, gradientDescent, optimizers];

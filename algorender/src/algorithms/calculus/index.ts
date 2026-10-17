import type { AnyAlgorithm } from '@/engine/module';
import { derivative } from './derivative';
import { gradientDescent } from './gradient-descent';
import { optimizers } from './optimizers';

export const calculus: AnyAlgorithm[] = [derivative, gradientDescent, optimizers];

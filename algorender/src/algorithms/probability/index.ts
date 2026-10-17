import type { AnyAlgorithm } from '@/engine/module';
import { bayes } from './bayes';
import { centralLimitTheorem } from './central-limit-theorem';

export const probability: AnyAlgorithm[] = [bayes, centralLimitTheorem];

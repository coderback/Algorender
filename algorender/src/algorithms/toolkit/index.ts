import type { AnyAlgorithm } from '@/engine/module';
import { functionsModule } from './functions';
import { logarithms } from './logarithms';
import { sigmaNotation } from './sigma-notation';
import { unitCircle } from './unit-circle';

/** The math toolkit: the school math the rest of the math and ML path reads. */
export const toolkit: AnyAlgorithm[] = [functionsModule, logarithms, sigmaNotation, unitCircle];

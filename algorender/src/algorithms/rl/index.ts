import type { AnyAlgorithm } from '@/engine/module';
import { qLearning } from './q-learning';

export const reinforcementLearning: AnyAlgorithm[] = [qLearning];

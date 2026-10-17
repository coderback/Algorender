import type { AnyAlgorithm } from '@/engine/module';
import { eigenvectors } from './eigenvectors';
import { linearTransformations } from './linear-transformations';

export const linearAlgebra: AnyAlgorithm[] = [linearTransformations, eigenvectors];

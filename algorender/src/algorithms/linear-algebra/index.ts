import type { AnyAlgorithm } from '@/engine/module';
import { eigenvectors } from './eigenvectors';
import { linearTransformations } from './linear-transformations';
import { svd } from './svd';

export const linearAlgebra: AnyAlgorithm[] = [linearTransformations, eigenvectors, svd];

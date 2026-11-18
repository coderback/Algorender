import type { AnyAlgorithm } from '@/engine/module';
import { dotProduct } from './dot-product';
import { eigenvectors } from './eigenvectors';
import { linearTransformations } from './linear-transformations';
import { matrixMultiplication } from './matrix-multiplication';
import { norms } from './norms';
import { svd } from './svd';
import { vectors } from './vectors';

/** Linear algebra, in the order the math and ML path teaches it. */
export const linearAlgebra: AnyAlgorithm[] = [vectors, dotProduct, norms, linearTransformations, matrixMultiplication, eigenvectors, svd];

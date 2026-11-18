import type { AnyAlgorithm } from '@/engine/module';
import { dotProduct } from './dot-product';
import { eigenvectors } from './eigenvectors';
import { linearTransformations } from './linear-transformations';
import { changeOfBasis } from './change-of-basis';
import { inverseMatrix } from './inverse-matrix';
import { leastSquares } from './least-squares';
import { matrixMultiplication } from './matrix-multiplication';
import { norms } from './norms';
import { span } from './span';
import { svd } from './svd';
import { vectors } from './vectors';

/** Linear algebra, in the order the math and ML path teaches it. */
export const linearAlgebra: AnyAlgorithm[] = [vectors, dotProduct, norms, linearTransformations, matrixMultiplication, inverseMatrix, span, changeOfBasis, leastSquares, eigenvectors, svd];

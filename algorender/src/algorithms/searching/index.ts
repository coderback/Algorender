import type { AnyAlgorithm } from '@/engine/module';
import { binarySearch } from './binary-search';
import { exponentialSearch } from './exponential-search';
import { fibonacciSearch } from './fibonacci-search';
import { interpolationSearch } from './interpolation-search';
import { jumpSearch } from './jump-search';
import { linearSearch } from './linear-search';

export const searching: AnyAlgorithm[] = [linearSearch, binarySearch, jumpSearch, interpolationSearch, exponentialSearch, fibonacciSearch];

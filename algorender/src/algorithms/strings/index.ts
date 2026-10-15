import type { AnyAlgorithm } from '@/engine/module';
import { kmp } from './kmp';
import { manacher } from './manacher';
import { rabinKarp } from './rabin-karp';
import { zAlgorithm } from './z-algorithm';

export const stringAlgorithms: AnyAlgorithm[] = [rabinKarp, kmp, zAlgorithm, manacher];

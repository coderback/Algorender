import type { AnyAlgorithm } from '@/engine/module';
import { diffusion } from './diffusion';

export const generative: AnyAlgorithm[] = [diffusion];

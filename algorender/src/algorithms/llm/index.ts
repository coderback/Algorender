import type { AnyAlgorithm } from '@/engine/module';
import { attention } from './attention';
import { bpe } from './bpe';
import { kvCache } from './kv-cache';
import { sampling } from './sampling';

export const languageModels: AnyAlgorithm[] = [bpe, attention, sampling, kvCache];

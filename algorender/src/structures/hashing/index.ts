import type { AnyStructure } from '@/engine/module';
import { bloomFilterStructure } from './bloom-filter';
import { hashSetStructure } from './hash-set';
import { hashTableStructure } from './hash-table';

export const hashStructures: AnyStructure[] = [hashTableStructure, hashSetStructure, bloomFilterStructure];

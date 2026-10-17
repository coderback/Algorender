import type { AnyStructure } from '@/engine/module';
import { arrayStructure } from './array';
import { dequeStructure } from './deque';
import { linkedListStructure } from './linked-list';
import { queueStructure } from './queue';
import { stackStructure } from './stack';

export const linearStructures: AnyStructure[] = [arrayStructure, stackStructure, queueStructure, dequeStructure, linkedListStructure];

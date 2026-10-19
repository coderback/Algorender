import type { AnyStructure } from '@/engine/module';
import { bPlusTree } from './b-plus-tree';
import { consistentHashingStructure } from './consistent-hashing';
import { lruCacheStructure } from './lru-cache';
import { lsmTreeStructure } from './lsm-tree';
import { raftStructure } from './raft';

// Systems components driven by operations (a cache, a hash ring, a storage
// engine). Their models live in src/systems/ too, for the system-design canvas
// (phase 6d).
export const systemStructures: AnyStructure[] = [lruCacheStructure, consistentHashingStructure, bPlusTree, lsmTreeStructure, raftStructure];

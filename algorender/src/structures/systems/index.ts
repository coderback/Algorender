import type { AnyStructure } from '@/engine/module';
import { consistentHashingStructure } from './consistent-hashing';
import { lruCacheStructure } from './lru-cache';

// Systems components driven by operations (a cache, a hash ring). Their
// models live in src/systems/ too, for the system-design canvas (phase 6d).
export const systemStructures: AnyStructure[] = [lruCacheStructure, consistentHashingStructure];

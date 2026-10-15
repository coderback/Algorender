import type { ArgSpec, StatSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

export const COMPARISONS: StatSpec = { key: 'comparisons', label: 'Comparisons' };
export const ROTATIONS: StatSpec = { key: 'rotations', label: 'Rotations' };
export const SWAPS: StatSpec = { key: 'swaps', label: 'Swaps' };
export const SPLITS: StatSpec = { key: 'splits', label: 'Node splits' };
export const MERGES: StatSpec = { key: 'merges', label: 'Merges and borrows' };

export const KEY_MIN = 1;
export const KEY_MAX = 99;

export const keyArg = (label = 'Key', fallback = 42): ArgSpec => ({
  name: 'key',
  label,
  type: 'int',
  min: KEY_MIN,
  max: KEY_MAX,
  default: fallback,
});

/** `count` distinct keys from 1–99 in a seeded random order. */
export function seededKeys(seed: number, count: number): number[] {
  const rng = createRng(seed);
  const pool = Array.from({ length: KEY_MAX - KEY_MIN + 1 }, (_, i) => i + KEY_MIN);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Order to insert sorted keys so a plain BST comes out balanced: middle first, then each half. */
export function balancedOrder(sorted: readonly number[]): number[] {
  if (sorted.length === 0) return [];
  const mid = Math.floor(sorted.length / 2);
  return [sorted[mid], ...balancedOrder(sorted.slice(0, mid)), ...balancedOrder(sorted.slice(mid + 1))];
}

/** "+2", "0", "−1": a balance factor as narration and badges show it. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

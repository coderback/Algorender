// Seeded randomness so every run is reproducible from its seed: the same seed
// gives the same input, the same trace, and therefore shareable step links.

/** mulberry32: small, fast, good-enough PRNG for generating inputs. Returns [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export const ARRAY_PRESETS = ['random', 'nearly-sorted', 'reversed', 'few-unique', 'sorted'] as const;
export type ArrayPreset = (typeof ARRAY_PRESETS)[number];

export const PRESET_LABELS: Record<ArrayPreset, string> = {
  random: 'Random',
  'nearly-sorted': 'Nearly sorted',
  reversed: 'Reversed',
  'few-unique': 'Few unique',
  sorted: 'Sorted',
};

export type ArrayInputSpec = {
  min: number;
  max: number;
  defaultSize: number;
  maxSize: number;
};

/** Builds a reproducible integer array of the given shape. */
export function generateArray(
  preset: ArrayPreset,
  size: number,
  seed: number,
  { min, max }: Pick<ArrayInputSpec, 'min' | 'max'>,
): number[] {
  const rng = createRng(seed);
  const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const sortedRandom = () => Array.from({ length: size }, () => randInt(min, max)).sort((a, b) => a - b);

  switch (preset) {
    case 'random':
      return Array.from({ length: size }, () => randInt(min, max));
    case 'sorted':
      return sortedRandom();
    case 'reversed':
      return sortedRandom().reverse();
    case 'nearly-sorted': {
      const values = sortedRandom();
      const swaps = Math.max(1, Math.floor(size / 6));
      for (let s = 0; s < swaps && size > 1; s++) {
        const i = randInt(0, size - 2);
        [values[i], values[i + 1]] = [values[i + 1], values[i]];
      }
      return values;
    }
    case 'few-unique': {
      const pool = Array.from({ length: Math.min(3, max - min + 1) }, () => randInt(min, max));
      return Array.from({ length: size }, () => pool[randInt(0, pool.length - 1)]);
    }
  }
}

/** Parses "5, 3, 8" style input. Returns null with a reason when invalid. */
export function parseArrayInput(
  text: string,
  { min, max, maxSize }: Pick<ArrayInputSpec, 'min' | 'max' | 'maxSize'>,
): { values: number[] } | { error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return { error: 'Enter at least one number.' };
  if (parts.length > maxSize) return { error: `Use at most ${maxSize} numbers.` };
  const values: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n)) return { error: `"${part}" is not a whole number.` };
    if (n < min || n > max) return { error: `Numbers must be between ${min} and ${max}.` };
    values.push(n);
  }
  return { values };
}

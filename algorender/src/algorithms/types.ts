import type { ArrayInputSpec, ArrayPreset } from '@/engine/random';
import type { Frame } from '@/engine/types';
import type { ArrayState, Mark } from '@/viz/array/types';

/**
 * An algorithm ported to the trace engine. Names, descriptions and complexities
 * stay in src/data/visualisers.js (the single registry); this holds what the
 * explorer needs to run and teach it.
 */
export type ArrayAlgorithm = {
  slug: string;
  view: 'array';
  input: ArrayInputSpec;
  /** Shown beside the visual; frames point at lines by index. */
  pseudocode: readonly string[];
  stats: readonly { key: string; label: string }[];
  legend: readonly Mark[];
  run: (input: readonly number[]) => Generator<Frame<ArrayState>>;
  content: {
    /** The hook: what the algorithm does, in plain words. */
    idea: string;
    /** What stays true throughout. Spotting it is the key to understanding (and proving) the algorithm. */
    invariant: string;
    whenToUse: string;
    properties: { stable: boolean; inPlace: boolean; comparisonBased: boolean };
    /** Inputs worth trying, each with what to look for. */
    experiments: readonly { preset: ArrayPreset; prompt: string }[];
  };
};

export const COMPARISONS = { key: 'comparisons', label: 'Comparisons' } as const;
export const SWAPS = { key: 'swaps', label: 'Swaps' } as const;
export const WRITES = { key: 'writes', label: 'Writes' } as const;

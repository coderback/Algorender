import type { StatSpec } from '@/engine/module';

export const COMPARISONS: StatSpec = { key: 'comparisons', label: 'Comparisons' };
export const SWAPS: StatSpec = { key: 'swaps', label: 'Swaps' };
export const WRITES: StatSpec = { key: 'writes', label: 'Writes' };

/** The yes/no facts every sort is judged on. */
export function sortTraits({ stable, inPlace, comparisonBased }: { stable: boolean; inPlace: boolean; comparisonBased: boolean }) {
  return [
    { label: stable ? 'Stable' : 'Not stable', good: stable },
    { label: inPlace ? 'In place' : 'Needs extra memory', good: inPlace },
    { label: comparisonBased ? 'Comparison-based' : 'No comparisons', good: null },
  ];
}

export const YES_NO = ['Yes', 'No'] as const;

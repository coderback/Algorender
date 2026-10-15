import type { ArrayAlgorithm } from './types';
import { bubbleSort } from './sorting/bubble-sort';
import { countingSort } from './sorting/counting-sort';
import { heapSort } from './sorting/heap-sort';
import { insertionSort } from './sorting/insertion-sort';
import { mergeSort } from './sorting/merge-sort';
import { quickSort } from './sorting/quick-sort';
import { radixSort } from './sorting/radix-sort';
import { selectionSort } from './sorting/selection-sort';

/** Visualisers ported to the trace engine, by slug. Their routes are served by app/visualisers/[slug]. */
export const algorithms: Record<string, ArrayAlgorithm> = Object.fromEntries(
  [bubbleSort, selectionSort, insertionSort, mergeSort, quickSort, heapSort, countingSort, radixSort].map((a) => [
    a.slug,
    a,
  ]),
);

export function getAlgorithm(slug: string): ArrayAlgorithm | undefined {
  return algorithms[slug];
}

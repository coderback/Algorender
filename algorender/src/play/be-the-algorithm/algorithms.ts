import { bubbleSort } from '@/algorithms/sorting/bubble-sort';
import { heapSort } from '@/algorithms/sorting/heap-sort';
import { quickSort } from '@/algorithms/sorting/quick-sort';
import { selectionSort } from '@/algorithms/sorting/selection-sort';
import type { AnyAlgorithm } from '@/engine/module';
import type { SupportedSlug } from './moves';

/** The playable modules, and the rule each round asks the learner to follow. */
export const ALGORITHMS: Record<SupportedSlug, { module: AnyAlgorithm; rule: string }> = {
  'bubble-sort': {
    module: bubbleSort,
    rule: 'Walk left to right comparing neighbours, and swap a pair that is out of order. After each pass the largest unsorted value has reached its place; a pass with no swaps ends the sort.',
  },
  'selection-sort': {
    module: selectionSort,
    rule: 'Find the smallest value in the unsorted part and swap it to the front of that part. If it is already at the front, there is no swap.',
  },
  'quick-sort': {
    module: quickSort,
    rule: 'Partition around the last value, the pivot: scan left to right and swap each value smaller than the pivot to the end of the left side (no swap when it is already there), then swap the pivot in after the left side. Sort the left part, then the right.',
  },
  'heap-sort': {
    module: heapSort,
    rule: 'First build a max-heap: sift down from the last parent back to the root, swapping a parent with its larger child while the child is bigger. Then repeatedly swap the root to the end of the heap and sift the new root down.',
  },
};

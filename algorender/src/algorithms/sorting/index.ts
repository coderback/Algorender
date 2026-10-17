import { bubbleSort } from './bubble-sort';
import { countingSort } from './counting-sort';
import { heapSort } from './heap-sort';
import { insertionSort } from './insertion-sort';
import { mergeSort } from './merge-sort';
import { quickSort } from './quick-sort';
import { radixSort } from './radix-sort';
import { selectionSort } from './selection-sort';

export const sorting = [bubbleSort, selectionSort, insertionSort, mergeSort, quickSort, heapSort, countingSort, radixSort];

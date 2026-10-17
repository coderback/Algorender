'use client';

import { ListView } from './ListView';
import { SlotsView } from './SlotsView';
import type { LinearState } from './types';

/**
 * Linear structures: array-backed layouts (dynamic array, stack, ring-buffer
 * queue and deque) as rows of memory cells, and linked lists as nodes joined
 * by pointer arrows.
 */
export function LinearView({ state }: { state: LinearState }) {
  return state.layout === 'list' ? <ListView state={state} /> : <SlotsView state={state} />;
}

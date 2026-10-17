'use client';

import { BloomView } from './BloomView';
import { TableView } from './TableView';
import type { HashState } from './types';

/** Hash structures: chained hash tables (maps and sets) and Bloom filters. */
export function HashView({ state }: { state: HashState }) {
  return state.type === 'bloom' ? <BloomView state={state} /> : <TableView state={state} />;
}

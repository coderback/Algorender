'use client';

import { createContext, useContext } from 'react';
import type { ItemId } from './types';

/**
 * Picking bars: a game (src/play/be-the-algorithm/) lets the learner select
 * items to act on. With this context, ArrayView draws each bar as a button;
 * `selected` bars get a solid outline and `hint` bars (what the algorithm
 * would have picked) a dashed one. Absent everywhere else, so bars stay
 * plain pictures.
 */
export type ArraySelect = {
  selected: ReadonlySet<ItemId>;
  toggle: (id: ItemId) => void;
  hint: ReadonlySet<ItemId>;
  /** Bars can't be picked right now (e.g. while a move is being revealed). */
  disabled?: boolean;
};

export const ArraySelectContext = createContext<ArraySelect | null>(null);

export const useArraySelect = () => useContext(ArraySelectContext);

'use client';

import { createContext, useContext } from 'react';

/**
 * Direct manipulation: a view with draggable handles reports where the learner
 * moved one (`done` once the drag ends or after a key press), and the explorer
 * turns that into a new input (see `InputSpec.drag`). Absent when the module
 * takes no dragged input, so handles render as plain points.
 */
export type ViewEdit = { drag: (handle: string, to: readonly [number, number], done: boolean) => void };

export const ViewEditContext = createContext<ViewEdit | null>(null);

export const useViewEdit = () => useContext(ViewEditContext);

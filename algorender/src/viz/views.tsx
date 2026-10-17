'use client';

import type { ComponentType } from 'react';
import type { ViewKind } from '@/engine/module';
import { ArrayView } from './array/ArrayView';
import { GraphView } from './graph/GraphView';
import { GridView } from './grid/GridView';
import { HashView } from './hash/HashView';
import { LinearView } from './linear/LinearView';
import { MemoryView } from './memory/MemoryView';
import { PlotView } from './plot/PlotView';
import { TextView } from './text/TextView';
import { TreeView } from './tree/TreeView';

/**
 * Renderer for each view kind. A module's `view` picks one, and its frames'
 * state must be that view's state type (checked where the module is defined).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each view takes its own state type
export const VIEWS: Record<ViewKind, ComponentType<{ state: any }>> = {
  array: ArrayView,
  grid: GridView,
  graph: GraphView,
  tree: TreeView,
  linear: LinearView,
  hash: HashView,
  text: TextView,
  memory: MemoryView,
  plot: PlotView,
};

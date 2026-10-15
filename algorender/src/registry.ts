import { backtracking } from '@/algorithms/backtracking';
import { dynamicProgramming } from '@/algorithms/dp';
import { graphAlgorithms } from '@/algorithms/graph';
import { greedy } from '@/algorithms/greedy';
import { searching } from '@/algorithms/searching';
import { sorting } from '@/algorithms/sorting';
import { stringAlgorithms } from '@/algorithms/strings';
import type { AnyVisualiser } from '@/engine/module';
import { graphStructures } from '@/structures/graphs';
import { hashStructures } from '@/structures/hashing';
import { linearStructures } from '@/structures/linear';
import { treeStructures } from '@/structures/trees';

/**
 * Every visualiser running on the trace engine, by slug. Each family registers
 * its modules in its own index.ts; app/visualisers/[slug] serves all of them.
 * Names and complexities stay in src/data/visualisers.js.
 */
export const modules: Record<string, AnyVisualiser> = {};

for (const m of [
  ...sorting,
  ...searching,
  ...graphAlgorithms,
  ...greedy,
  ...dynamicProgramming,
  ...backtracking,
  ...stringAlgorithms,
  ...linearStructures,
  ...treeStructures,
  ...graphStructures,
  ...hashStructures,
]) {
  if (modules[m.slug]) throw new Error(`Duplicate visualiser slug "${m.slug}"`);
  modules[m.slug] = m;
}

export function getModule(slug: string): AnyVisualiser | undefined {
  return modules[slug];
}

import { backtracking, decisionTrees } from '@/algorithms/backtracking';
import { calculus } from '@/algorithms/calculus';
import { deepLearning } from '@/algorithms/deep-learning';
import { dynamicProgramming } from '@/algorithms/dp';
import { generative } from '@/algorithms/generative';
import { graphAlgorithms } from '@/algorithms/graph';
import { greedy } from '@/algorithms/greedy';
import { information } from '@/algorithms/information';
import { intervals } from '@/algorithms/intervals';
import { linearAlgebra } from '@/algorithms/linear-algebra';
import { languageModels } from '@/algorithms/llm';
import { machineLearning } from '@/algorithms/ml';
import { numerics } from '@/algorithms/numerics';
import { patterns } from '@/algorithms/patterns';
import { probability } from '@/algorithms/probability';
import { reinforcementLearning } from '@/algorithms/rl';
import { searching } from '@/algorithms/searching';
import { sorting } from '@/algorithms/sorting';
import { stringAlgorithms } from '@/algorithms/strings';
import { systems } from '@/algorithms/systems';
import type { AnyVisualiser } from '@/engine/module';
import { graphStructures } from '@/structures/graphs';
import { hashStructures } from '@/structures/hashing';
import { linearStructures } from '@/structures/linear';
import { setStructures } from '@/structures/sets';
import { systemStructures } from '@/structures/systems';
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
  ...decisionTrees,
  ...stringAlgorithms,
  ...patterns,
  ...intervals,
  ...linearAlgebra,
  ...calculus,
  ...probability,
  ...information,
  ...numerics,
  ...machineLearning,
  ...deepLearning,
  ...languageModels,
  ...reinforcementLearning,
  ...systems,
  ...systemStructures,
  ...generative,
  ...linearStructures,
  ...treeStructures,
  ...graphStructures,
  ...hashStructures,
  ...setStructures,
]) {
  if (modules[m.slug]) throw new Error(`Duplicate visualiser slug "${m.slug}"`);
  modules[m.slug] = m;
}

export function getModule(slug: string): AnyVisualiser | undefined {
  return modules[slug];
}

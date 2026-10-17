import type { AnyAlgorithm } from '@/engine/module';
import { bellmanFord } from './bellman-ford';
import { breadthFirstSearch } from './breadth-first-search';
import { depthFirstSearch } from './depth-first-search';
import { dijkstra } from './dijkstra';
import { floydWarshall } from './floyd-warshall';
import { kosaraju } from './kosaraju';
import { kruskals } from './kruskals';
import { prims } from './prims';
import { tarjan } from './tarjan';
import { topologicalSort } from './topological-sort';

export const graphAlgorithms: AnyAlgorithm[] = [
  breadthFirstSearch,
  depthFirstSearch,
  dijkstra,
  bellmanFord,
  floydWarshall,
  prims,
  kruskals,
  topologicalSort,
  kosaraju,
  tarjan,
];

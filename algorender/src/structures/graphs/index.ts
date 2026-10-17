import type { AnyStructure } from '@/engine/module';
import { adjacencyList } from './adjacency-list';
import { adjacencyMatrix } from './adjacency-matrix';
import { graph } from './graph';

export const graphStructures: AnyStructure[] = [graph, adjacencyList, adjacencyMatrix];

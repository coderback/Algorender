import type { AnyStructure } from '@/engine/module';
import { avlTree } from './avl-tree';
import { bTree } from './b-tree';
import { binaryTree } from './binary-tree';
import { heap } from './heap';
import { trie } from './trie';

export const treeStructures: AnyStructure[] = [binaryTree, avlTree, bTree, heap, trie];

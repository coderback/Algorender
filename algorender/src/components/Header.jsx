'use client';

import Link from 'next/link';
import SearchBar from './SearchBar';
import { usePathname } from 'next/navigation';

// Get data from CategoryGrid
const categories = {
  data: [
    {
      title: 'Linear Structures',
      modules: ['Array', 'Linked List', 'Stack', 'Queue', 'Deque'],
    },
    {
      title: 'Hierarchical Structures',
      modules: ['Binary Tree', 'AVL Tree', 'B-Tree', 'Heap'],
    },
    {
      title: 'Hash-Based Structures',
      modules: ['Hash Table', 'Hash Set'],
    },
  ],
  algo: [
    {
      title: 'Searching & Sorting',
      modules: ['Linear Search', 'Binary Search', 'Bubble Sort', 'Insertion Sort', 'Selection Sort', 'Merge Sort', 'Quick Sort', 'Heap Sort'],
    },
    {
      title: 'Greedy Algorithms',
      modules: ['Knapsack (Greedy)', 'Dijkstra\'s Algorithm', 'Prim\'s Algorithm', 'Activity Selection'],
    },
    {
      title: 'Dynamic Programming',
      modules: ['Fibonacci (Memoization)', '0/1 Knapsack', 'Longest Common Subsequence', 'Edit Distance'],
    },
    {
      title: 'Backtracking & Branch-and-Bound',
      modules: ['N-Queens Problem', 'Sudoku Solver'],
    },
    {
      title: 'Graph Algorithms',
      modules: ['Depth-First Search (DFS)', 'Breadth-First Search (BFS)', 'Dijkstra\'s Algorithm', 'Prim\'s Algorithm'],
    },
    {
      title: 'String & Pattern-Matching',
      modules: ['Rabin-Karp Algorithm', 'KMP Algorithm', 'Z-Algorithm', 'Manacher\'s Algorithm'],
    },
  ],
};

export default function Header() {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  // Transform categories into searchable items
  const dataStructures = categories.data.flatMap(category =>
    category.modules.map(name => ({ name }))
  );
  
  const algorithms = categories.algo.flatMap(category =>
    category.modules.map(name => ({ name }))
  );

  return (
    <header className="w-full bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <img src="/logo.svg" alt="Algorender Logo" className="h-8 w-8 object-contain" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight cursor-pointer">
              Algorender
            </h1>
          </Link>
          
          <div className="flex-grow max-w-md">
            <SearchBar dataStructures={dataStructures} algorithms={algorithms} />
          </div>
        </div>
      </div>
    </header>
  );
}
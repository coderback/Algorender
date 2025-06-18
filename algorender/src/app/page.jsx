"use client";
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import StatsBar from '@/components/StatsBar';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Move the data arrays to a separate file
const dataStructures = [
  {
    name: 'Array',
    description: 'A collection of elements stored at contiguous memory locations.',
    path: '/visualisers/array',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Stack',
    description: 'A linear data structure that follows LIFO (Last In First Out) principle.',
    path: '/visualisers/stack',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Queue',
    description: 'A linear data structure that follows FIFO (First In First Out) principle.',
    path: '/visualisers/queue',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Linked List',
    description: 'A linear data structure where elements are stored in nodes.',
    path: '/visualisers/linked-list',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Deque',
    description: 'A double-ended queue that allows insertion and deletion at both ends.',
    path: '/visualisers/deque',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Binary Tree',
    description: 'A hierarchical data structure with at most two children per node.',
    path: '/visualisers/binary-tree',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'AVL Tree',
    description: 'A self-balancing binary search tree that maintains height balance.',
    path: '/visualisers/avl-tree',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'B-Tree',
    description: 'A self-balancing tree data structure that maintains sorted data.',
    path: '/visualisers/b-tree',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Heap',
    description: 'A specialized tree-based data structure that satisfies the heap property.',
    path: '/visualisers/heap',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Graph',
    description: 'A non-linear data structure consisting of vertices and edges.',
    path: '/visualisers/graph',
    category: 'Graph-Based',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Adjacency List',
    description: 'A collection of lists used to represent a graph.',
    path: '/visualisers/adjacency-list',
    category: 'Graph-Based',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Adjacency Matrix',
    description: 'A 2D matrix used to represent a graph.',
    path: '/visualisers/adjacency-matrix',
    category: 'Graph-Based',
    timeComplexity: { best: 'O(1)', average: 'O(V²)', worst: 'O(V²)' },
    spaceComplexity: 'O(V²)'
  },
  {
    name: 'Hash Set',
    description: 'A data structure that stores unique elements using a hash function.',
    path: '/visualisers/hash-set',
    category: 'Hash-Based',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  }
];

const algorithms = [
  {
    name: 'Bubble Sort',
    description: 'A simple sorting algorithm that repeatedly steps through the list.',
    path: '/visualisers/bubble-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Selection Sort',
    description: 'A sorting algorithm that divides the input into sorted and unsorted regions.',
    path: '/visualisers/selection-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Insertion Sort',
    description: 'A sorting algorithm that builds the final sorted array one item at a time.',
    path: '/visualisers/insertion-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Merge Sort',
    description: 'A divide-and-conquer algorithm that recursively breaks down the problem.',
    path: '/visualisers/merge-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Quick Sort',
    description: 'A divide-and-conquer algorithm that picks an element as a pivot.',
    path: '/visualisers/quick-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)' },
    spaceComplexity: 'O(log n)'
  },
  {
    name: 'Heap Sort',
    description: 'A comparison-based sorting algorithm that uses a binary heap.',
    path: '/visualisers/heap-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Counting Sort',
    description: 'A sorting algorithm that counts the occurrences of each element.',
    path: '/visualisers/counting-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n + k)', average: 'O(n + k)', worst: 'O(n + k)' },
    spaceComplexity: 'O(k)'
  },
  {
    name: 'Radix Sort',
    description: 'A non-comparative sorting algorithm that sorts data with integer keys.',
    path: '/visualisers/radix-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(nk)', average: 'O(nk)', worst: 'O(nk)' },
    spaceComplexity: 'O(n + k)'
  },
  {
    name: 'Linear Search',
    description: 'A simple search algorithm that checks each element in sequence.',
    path: '/visualisers/linear-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Binary Search',
    description: 'A search algorithm that finds the position of a target value in a sorted array.',
    path: '/visualisers/binary-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Jump Search',
    description: 'A search algorithm for sorted arrays that jumps ahead by fixed steps.',
    path: '/visualisers/jump-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(√n)', worst: 'O(√n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Interpolation Search',
    description: 'A search algorithm that uses position formula for better performance.',
    path: '/visualisers/interpolation-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log log n)', worst: 'O(n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Exponential Search',
    description: 'A search algorithm that finds the range where element is present.',
    path: '/visualisers/exponential-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Fibonacci Search',
    description: 'A search algorithm that uses Fibonacci numbers to search in sorted arrays.',
    path: '/visualisers/fibonacci-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Breadth-First Search',
    description: 'A graph traversal algorithm that explores all vertices at the present depth.',
    path: '/visualisers/breadth-first-search',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Depth-First Search',
    description: 'A graph traversal algorithm that explores as far as possible along each branch.',
    path: '/visualisers/depth-first-search',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Dijkstra\'s Algorithm',
    description: 'An algorithm for finding the shortest paths between nodes in a graph.',
    path: '/visualisers/dijkstra',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O((V + E) log V)', worst: 'O((V + E) log V)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Bellman-Ford Algorithm',
    description: 'An algorithm that computes shortest paths from a source vertex to all other vertices.',
    path: '/visualisers/bellman-ford',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(VE)', worst: 'O(VE)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Floyd-Warshall Algorithm',
    description: 'An algorithm for finding shortest paths in a weighted graph with positive or negative edge weights.',
    path: '/visualisers/floyd-warshall',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(V³)', worst: 'O(V³)' },
    spaceComplexity: 'O(V²)'
  },
  {
    name: 'Prim\'s Algorithm',
    description: 'A greedy algorithm that finds a minimum spanning tree for a weighted undirected graph.',
    path: '/visualisers/prims',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(E log V)', worst: 'O(E log V)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Kruskal\'s Algorithm',
    description: 'A minimum-spanning-tree algorithm that finds an edge of the least possible weight.',
    path: '/visualisers/kruskals',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(E log E)', worst: 'O(E log E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Topological Sort',
    description: 'A linear ordering of vertices such that for every directed edge uv, vertex u comes before v.',
    path: '/visualisers/topological-sort',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Kosaraju\'s Algorithm',
    description: 'An algorithm for finding strongly connected components of a directed graph.',
    path: '/visualisers/kosaraju',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Tarjan\'s Algorithm',
    description: 'An algorithm for finding strongly connected components of a directed graph.',
    path: '/visualisers/tarjan',
    category: 'Graph',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Knapsack (Greedy)',
    description: 'A greedy approach to solve the fractional knapsack problem.',
    path: '/visualisers/knapsack-greedy',
    category: 'Greedy',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Activity Selection',
    description: 'A greedy algorithm to select the maximum number of activities that can be performed.',
    path: '/visualisers/activity-selection',
    category: 'Greedy',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Fibonacci (Memoization)',
    description: 'An optimized approach to calculate Fibonacci numbers using memoization.',
    path: '/visualisers/fibonacci-memoization',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: '0/1 Knapsack',
    description: 'A dynamic programming solution to the 0/1 knapsack problem.',
    path: '/visualisers/knapsack-01',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(1)', average: 'O(nW)', worst: 'O(nW)' },
    spaceComplexity: 'O(nW)'
  },
  {
    name: 'Longest Common Subsequence',
    description: 'Finds the longest subsequence present in both strings.',
    path: '/visualisers/longest-common-subsequence',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(1)', average: 'O(mn)', worst: 'O(mn)' },
    spaceComplexity: 'O(mn)'
  },
  {
    name: 'Edit Distance',
    description: 'Calculates the minimum number of operations to convert one string to another.',
    path: '/visualisers/edit-distance',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(1)', average: 'O(mn)', worst: 'O(mn)' },
    spaceComplexity: 'O(mn)'
  },
  {
    name: 'N-Queens Problem',
    description: 'A backtracking algorithm to place N queens on an N×N chessboard.',
    path: '/visualisers/n-queens',
    category: 'Backtracking',
    timeComplexity: { best: 'O(1)', average: 'O(N!)', worst: 'O(N!)' },
    spaceComplexity: 'O(N²)'
  },
  {
    name: 'Sudoku Solver',
    description: 'A backtracking algorithm to solve a Sudoku puzzle.',
    path: '/visualisers/sudoku-solver',
    category: 'Backtracking',
    timeComplexity: { best: 'O(1)', average: 'O(9^(n²))', worst: 'O(9^(n²))' },
    spaceComplexity: 'O(n²)'
  },
  {
    name: 'Rabin-Karp Algorithm',
    description: 'A string searching algorithm that uses hashing to find patterns.',
    path: '/visualisers/rabin-karp',
    category: 'String Matching',
    timeComplexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(nm)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'KMP Algorithm',
    description: 'The Knuth-Morris-Pratt algorithm for efficient string matching.',
    path: '/visualisers/kmp',
    category: 'String Matching',
    timeComplexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' },
    spaceComplexity: 'O(m)'
  },
  {
    name: 'Z-Algorithm',
    description: 'An algorithm for finding all occurrences of a pattern in a string.',
    path: '/visualisers/z-algorithm',
    category: 'String Matching',
    timeComplexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' },
    spaceComplexity: 'O(n + m)'
  },
  {
    name: 'Trie (Prefix Matching)',
    description: 'A tree data structure used for efficient prefix matching.',
    path: '/visualisers/trie',
    category: 'String Matching',
    timeComplexity: { best: 'O(1)', average: 'O(m)', worst: 'O(m)' },
    spaceComplexity: 'O(ALPHABET_SIZE * N * M)'
  },
  {
    name: 'Manacher\'s Algorithm',
    description: 'An algorithm to find the longest palindromic substring in linear time.',
    path: '/visualisers/manacher',
    category: 'String Matching',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  }
];

function Home() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'algorithms' ? 'algorithms' : 'data-structures';
  const [activeTab, setActiveTab] = useState(initialTab);

  const items = activeTab === 'data-structures' ? dataStructures : algorithms;
  const categories = [...new Set(items.map(item => item.category))];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 text-gray-800">
      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Data Structure & Algorithm Visualizer
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Interactive visualizations of algorithms and data structures to help you understand how they work.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-2xl">
            <TabsList className="grid w-full grid-cols-2 h-14">
              <TabsTrigger 
                value="data-structures"
                className="text-base font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v4" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14h6" />
                  </svg>
                  Data Structures
                </span>
              </TabsTrigger>
              <TabsTrigger 
                value="algorithms"
                className="text-base font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Algorithms
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-8">
          {categories.map(category => (
            <div key={category} className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items
                  .filter(item => item.category === category)
                  .map(item => (
                    <Link
                      key={item.name}
                      href={item.path}
                      className="group block"
                    >
                      <div className="h-full bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
                        <div className="flex items-start justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {item.name}
                          </h3>
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                          {item.description}
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="w-24">Time:</span>
                            <span className="font-medium text-gray-700">
                              {item.timeComplexity.average}
                            </span>
                          </div>
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="w-24">Space:</span>
                            <span className="font-medium text-gray-700">
                              {item.spaceComplexity}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// Wrapper component to ensure useSearchParams is rendered inside Suspense
export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header dataStructures={dataStructures} algorithms={algorithms} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <Home />
        </Suspense>
      </main>
    </div>
  );
}

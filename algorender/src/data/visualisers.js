// Single source of truth for every visualiser route. The home page, the header
// search and the Layout back link all read from here, so adding a visualiser
// means adding one entry below (plus its page under app/visualisers/<slug>).
//
// `hidden: true` keeps a route out of the home page and search while still
// letting Layout know which tab it belongs to.

const dataStructureEntries = [
  {
    name: 'Array',
    description: 'A collection of elements stored at contiguous memory locations.',
    slug: 'array',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Stack',
    description: 'A linear data structure that follows LIFO (Last In First Out) principle.',
    slug: 'stack',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Queue',
    description: 'A linear data structure that follows FIFO (First In First Out) principle.',
    slug: 'queue',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Linked List',
    description: 'A linear data structure where elements are stored in nodes.',
    slug: 'linked-list',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Deque',
    description: 'A double-ended queue that allows insertion and deletion at both ends.',
    slug: 'deque',
    category: 'Linear',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Binary Search Tree',
    description: 'A binary tree where every left subtree holds smaller keys and every right subtree larger ones.',
    slug: 'binary-tree',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'AVL Tree',
    description: 'A self-balancing binary search tree that maintains height balance.',
    slug: 'avl-tree',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'B-Tree',
    description: 'A self-balancing tree data structure that maintains sorted data.',
    slug: 'b-tree',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Heap',
    description: 'A specialized tree-based data structure that satisfies the heap property.',
    slug: 'heap',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Union-Find',
    description: 'Disjoint sets as a forest: union joins two trees, find walks to the root, and path compression flattens the way.',
    slug: 'union-find',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(α(n))', worst: 'O(log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Trie (Prefix Matching)',
    description: 'A tree data structure used for efficient prefix matching.',
    slug: 'trie',
    category: 'Hierarchical',
    timeComplexity: { best: 'O(1)', average: 'O(m)', worst: 'O(m)' },
    spaceComplexity: 'O(total letters stored)'
  },
  {
    name: 'Graph',
    description: 'A non-linear data structure consisting of vertices and edges.',
    slug: 'graph',
    category: 'Graph-Based',
    timeComplexity: { best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Adjacency List',
    description: 'A collection of lists used to represent a graph.',
    slug: 'adjacency-list',
    category: 'Graph-Based',
    timeComplexity: { best: 'O(1)', average: 'O(deg(v))', worst: 'O(V + E)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Adjacency Matrix',
    description: 'A 2D matrix used to represent a graph.',
    slug: 'adjacency-matrix',
    category: 'Graph-Based',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(V²)' },
    spaceComplexity: 'O(V²)'
  },
  {
    name: 'Hash Table',
    description: 'A data structure that maps keys to values using a hash function.',
    slug: 'hash-table',
    category: 'Hash-Based',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Bloom Filter',
    description: 'A compact bit array that answers "definitely not in the set" or "probably in the set".',
    slug: 'bloom-filter',
    category: 'Hash-Based',
    timeComplexity: { best: 'O(k)', average: 'O(k)', worst: 'O(k)' },
    spaceComplexity: 'O(m)'
  },
  {
    name: 'Hash Set',
    description: 'A data structure that stores unique elements using a hash function.',
    slug: 'hash-set',
    category: 'Hash-Based',
    timeComplexity: { best: 'O(1)', average: 'O(1)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  }
];

const algorithmEntries = [
  {
    name: 'Bubble Sort',
    description: 'A simple sorting algorithm that repeatedly steps through the list.',
    slug: 'bubble-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Selection Sort',
    description: 'A sorting algorithm that divides the input into sorted and unsorted regions.',
    slug: 'selection-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Insertion Sort',
    description: 'A sorting algorithm that builds the final sorted array one item at a time.',
    slug: 'insertion-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Merge Sort',
    description: 'A divide-and-conquer algorithm that recursively breaks down the problem.',
    slug: 'merge-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Quick Sort',
    description: 'A divide-and-conquer algorithm that picks an element as a pivot.',
    slug: 'quick-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)' },
    spaceComplexity: 'O(log n)'
  },
  {
    name: 'Heap Sort',
    description: 'A comparison-based sorting algorithm that uses a binary heap.',
    slug: 'heap-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Counting Sort',
    description: 'A sorting algorithm that counts the occurrences of each element.',
    slug: 'counting-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(n + k)', average: 'O(n + k)', worst: 'O(n + k)' },
    spaceComplexity: 'O(n + k)'
  },
  {
    name: 'Radix Sort',
    description: 'A non-comparative sorting algorithm that sorts data with integer keys.',
    slug: 'radix-sort',
    category: 'Sorting',
    timeComplexity: { best: 'O(d·(n + b))', average: 'O(d·(n + b))', worst: 'O(d·(n + b))' },
    spaceComplexity: 'O(n + b)'
  },
  {
    name: 'Linear Search',
    description: 'A simple search algorithm that checks each element in sequence.',
    slug: 'linear-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Binary Search',
    description: 'A search algorithm that finds the position of a target value in a sorted array.',
    slug: 'binary-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Jump Search',
    description: 'A search algorithm for sorted arrays that jumps ahead by fixed steps.',
    slug: 'jump-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(√n)', worst: 'O(√n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Interpolation Search',
    description: 'A search for sorted arrays that estimates where the target should be from its value.',
    slug: 'interpolation-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log log n)', worst: 'O(n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Exponential Search',
    description: 'A search algorithm that finds the range where element is present.',
    slug: 'exponential-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Fibonacci Search',
    description: 'A search algorithm that uses Fibonacci numbers to search in sorted arrays.',
    slug: 'fibonacci-search',
    category: 'Searching',
    timeComplexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Breadth-First Search',
    description: 'A graph traversal algorithm that explores all vertices at the present depth.',
    slug: 'breadth-first-search',
    category: 'Graph',
    timeComplexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Depth-First Search',
    description: 'A graph traversal algorithm that explores as far as possible along each branch.',
    slug: 'depth-first-search',
    category: 'Graph',
    timeComplexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Dijkstra\'s Algorithm',
    description: 'An algorithm for finding the shortest paths between nodes in a graph.',
    slug: 'dijkstra',
    category: 'Graph',
    timeComplexity: { best: 'O((V + E) log V)', average: 'O((V + E) log V)', worst: 'O((V + E) log V)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Bellman-Ford Algorithm',
    description: 'An algorithm that computes shortest paths from a source vertex to all other vertices.',
    slug: 'bellman-ford',
    category: 'Graph',
    timeComplexity: { best: 'O(E)', average: 'O(VE)', worst: 'O(VE)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Floyd-Warshall Algorithm',
    description: 'An algorithm for finding shortest paths in a weighted graph with positive or negative edge weights.',
    slug: 'floyd-warshall',
    category: 'Graph',
    timeComplexity: { best: 'O(V³)', average: 'O(V³)', worst: 'O(V³)' },
    spaceComplexity: 'O(V²)'
  },
  {
    name: 'Prim\'s Algorithm',
    description: 'A greedy algorithm that finds a minimum spanning tree for a weighted undirected graph.',
    slug: 'prims',
    category: 'Graph',
    timeComplexity: { best: 'O(E log V)', average: 'O(E log V)', worst: 'O(E log V)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Kruskal\'s Algorithm',
    description: 'A minimum-spanning-tree algorithm that finds an edge of the least possible weight.',
    slug: 'kruskals',
    category: 'Graph',
    timeComplexity: { best: 'O(E log E)', average: 'O(E log E)', worst: 'O(E log E)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Topological Sort',
    description: 'A linear ordering of vertices such that for every directed edge uv, vertex u comes before v.',
    slug: 'topological-sort',
    category: 'Graph',
    timeComplexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Kosaraju\'s Algorithm',
    description: 'An algorithm for finding strongly connected components of a directed graph.',
    slug: 'kosaraju',
    category: 'Graph',
    timeComplexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V + E)'
  },
  {
    name: 'Tarjan\'s Algorithm',
    description: 'An algorithm for finding strongly connected components of a directed graph.',
    slug: 'tarjan',
    category: 'Graph',
    timeComplexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
    spaceComplexity: 'O(V)'
  },
  {
    name: 'Knapsack (Greedy)',
    description: 'A greedy approach to solve the fractional knapsack problem.',
    slug: 'knapsack-greedy',
    category: 'Greedy',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Activity Selection',
    description: 'A greedy algorithm to select the maximum number of activities that can be performed.',
    slug: 'activity-selection',
    category: 'Greedy',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Fibonacci (Memoization)',
    description: 'An optimized approach to calculate Fibonacci numbers using memoization.',
    slug: 'fibonacci-memoization',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: '0/1 Knapsack',
    description: 'A dynamic programming solution to the 0/1 knapsack problem.',
    slug: 'knapsack-01',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(nW)', average: 'O(nW)', worst: 'O(nW)' },
    spaceComplexity: 'O(nW)'
  },
  {
    name: 'Longest Common Subsequence',
    description: 'Finds the longest subsequence present in both strings.',
    slug: 'longest-common-subsequence',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(mn)', average: 'O(mn)', worst: 'O(mn)' },
    spaceComplexity: 'O(mn)'
  },
  {
    name: 'Edit Distance',
    description: 'Calculates the minimum number of operations to convert one string to another.',
    slug: 'edit-distance',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(mn)', average: 'O(mn)', worst: 'O(mn)' },
    spaceComplexity: 'O(mn)'
  },
  {
    name: 'Coin Change',
    description: 'The fewest coins that add up to an amount, built up from every smaller amount.',
    slug: 'coin-change',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(nA)', average: 'O(nA)', worst: 'O(nA)' },
    spaceComplexity: 'O(A)'
  },
  {
    name: 'Longest Increasing Subsequence',
    description: 'The longest run of values that rises from left to right, not necessarily adjacent.',
    slug: 'longest-increasing-subsequence',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Grid Paths',
    description: 'Count the paths across a grid moving only right or down, around obstacles.',
    slug: 'unique-paths',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(mn)', average: 'O(mn)', worst: 'O(mn)' },
    spaceComplexity: 'O(mn)'
  },
  {
    name: 'House Robber',
    description: 'The largest total from values where no two chosen ones are neighbours.',
    slug: 'house-robber',
    category: 'Dynamic Programming',
    timeComplexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'N-Queens Problem',
    description: 'A backtracking algorithm to place N queens on an N×N chessboard.',
    slug: 'n-queens',
    category: 'Backtracking',
    timeComplexity: { best: 'O(1)', average: 'O(N!)', worst: 'O(N!)' },
    spaceComplexity: 'O(N²)'
  },
  {
    name: 'Sudoku Solver',
    description: 'A backtracking algorithm to solve a Sudoku puzzle.',
    slug: 'sudoku-solver',
    category: 'Backtracking',
    timeComplexity: { best: 'O(1)', average: 'O(9^m)', worst: 'O(9^m)' },
    spaceComplexity: 'O(n²)'
  },
  {
    name: 'Subsets',
    description: 'List every subset by deciding, for each item in turn, to include it or leave it out.',
    slug: 'subsets',
    category: 'Backtracking',
    timeComplexity: { best: 'O(n·2ⁿ)', average: 'O(n·2ⁿ)', worst: 'O(n·2ⁿ)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Permutations',
    description: 'List every ordering by choosing an unused item for each position, then undoing the choice.',
    slug: 'permutations',
    category: 'Backtracking',
    timeComplexity: { best: 'O(n·n!)', average: 'O(n·n!)', worst: 'O(n·n!)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Rabin-Karp Algorithm',
    description: 'A string searching algorithm that uses hashing to find patterns.',
    slug: 'rabin-karp',
    category: 'String Matching',
    timeComplexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(nm)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'KMP Algorithm',
    description: 'The Knuth-Morris-Pratt algorithm for efficient string matching.',
    slug: 'kmp',
    category: 'String Matching',
    timeComplexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' },
    spaceComplexity: 'O(m)'
  },
  {
    name: 'Z-Algorithm',
    description: 'An algorithm for finding all occurrences of a pattern in a string.',
    slug: 'z-algorithm',
    category: 'String Matching',
    timeComplexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' },
    spaceComplexity: 'O(n + m)'
  },

  {
    name: 'Manacher\'s Algorithm',
    description: 'An algorithm to find the longest palindromic substring in linear time.',
    slug: 'manacher',
    category: 'String Matching',
    timeComplexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Two Pointers',
    description: 'Find a pair with a given sum in a sorted array by moving one pointer from each end.',
    slug: 'two-pointers',
    category: 'Patterns',
    timeComplexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Sliding Window',
    description: 'Find the best run of k consecutive values by sliding a window and updating one running sum.',
    slug: 'sliding-window',
    category: 'Patterns',
    timeComplexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(1)'
  },
  {
    name: 'Monotonic Stack',
    description: 'Find the next greater value for every element with a stack that stays in decreasing order.',
    slug: 'monotonic-stack',
    category: 'Patterns',
    timeComplexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Merge Intervals',
    description: 'Sort intervals by start, then sweep once, merging each one that overlaps the last.',
    slug: 'merge-intervals',
    category: 'Patterns',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(n)'
  },
  {
    name: 'Meeting Rooms',
    description: 'The fewest rooms that fit every meeting: sweep by start time and reuse rooms as they free up.',
    slug: 'meeting-rooms',
    category: 'Patterns',
    timeComplexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
    spaceComplexity: 'O(n)'
  }
];

const withMeta = (entries, type) =>
  entries.map(entry => ({ ...entry, type, path: `/visualisers/${entry.slug}` }));

export const visualisers = [
  ...withMeta(dataStructureEntries, 'data-structure'),
  ...withMeta(algorithmEntries, 'algorithm')
];

export const dataStructures = visualisers.filter(v => v.type === 'data-structure' && !v.hidden);
export const algorithms = visualisers.filter(v => v.type === 'algorithm' && !v.hidden);

export function getVisualiserByPath(pathname) {
  const path = (pathname || '').replace(/\/+$/, '');
  return visualisers.find(v => v.path === path);
}

export function getVisualiserBySlug(slug) {
  return visualisers.find(v => v.slug === slug);
}

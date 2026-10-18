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

// Math and ML visualisers have no running time to quote: their facts live in
// the module's teaching content instead.
const mathEntries = [
  {
    name: 'Linear Transformations',
    description: 'See a 2×2 matrix move the whole plane: its columns are where î and ĵ land, and its determinant scales area.',
    slug: 'linear-transformations',
    category: 'Linear Algebra'
  },
  {
    name: 'Eigenvectors',
    description: 'Sweep a vector around the circle to find the directions a matrix only stretches: A·v = λ·v.',
    slug: 'eigenvectors',
    category: 'Linear Algebra'
  },
  {
    name: 'SVD Image Compression',
    description: 'Rebuild a picture from its singular value decomposition one rank-1 piece at a time, and see how few pieces most images need.',
    slug: 'svd',
    category: 'Linear Algebra'
  },
  {
    name: 'Derivatives',
    description: 'Shrink a secant line until it becomes the tangent, then trace the slope at every point to draw f′.',
    slug: 'derivative',
    category: 'Calculus'
  },
  {
    name: 'The Chain Rule (Backpropagation)',
    description: 'Run a computation graph forward, then push gradients back node by node: local derivative times upstream gradient.',
    slug: 'chain-rule',
    category: 'Calculus'
  },
  {
    name: 'Gradient Descent',
    description: 'Walk downhill on a contour map by stepping against the gradient, and see what the step size does.',
    slug: 'gradient-descent',
    category: 'Optimization'
  },
  {
    name: 'Momentum and Adam',
    description: 'Race gradient descent, momentum, RMSProp and Adam on the same surface, from the same start.',
    slug: 'optimizers',
    category: 'Optimization'
  },
  {
    name: "Bayes' Rule",
    description: 'Update a belief with evidence by drawing everyone as a square: the answer is the share of the evidence strip where the hypothesis holds.',
    slug: 'bayes',
    category: 'Probability'
  },
  {
    name: 'Central Limit Theorem',
    description: 'Average samples from any population, flat, skewed or split in two, and watch the averages pile up into a bell curve whose spread shrinks like σ/√n.',
    slug: 'central-limit-theorem',
    category: 'Probability'
  },
  {
    name: 'Entropy and KL Divergence',
    description: 'Measure information as surprise in bits, then see what believing the wrong distribution costs: cross-entropy and KL divergence.',
    slug: 'entropy',
    category: 'Information Theory'
  },
  {
    name: 'Floating-Point Numbers',
    description: 'See how a float32 packs a sign, an exponent and 23 fraction bits, why 0.1 is not stored exactly, and how far apart neighbouring floats are.',
    slug: 'floating-point',
    category: 'Numerical Methods'
  },
  {
    name: 'Linear Regression',
    description: 'Fit a line by gradient descent on the mean squared error, with every residual drawn as a real square, then compare with the exact least-squares line. Drag the points to change the data.',
    slug: 'linear-regression',
    category: 'Machine Learning'
  },
  {
    name: 'Logistic Regression',
    description: "Train a single sigmoid neuron on the cross-entropy: watch the probability regions sharpen and the boundary swing into place, and see why it can't separate XOR or circles.",
    slug: 'logistic-regression',
    category: 'Machine Learning'
  },
  {
    name: 'K-Means Clustering',
    description: 'Group points by alternating two steps, joining the nearest centroid and moving centroids to their means, and see where k-means finds the right clusters and where it gets stuck.',
    slug: 'k-means',
    category: 'Machine Learning'
  },
  {
    name: 'Perceptron',
    description: 'Watch a single neuron learn a line by nudging it towards every point it gets wrong, and see why it stops on separable data but never on XOR.',
    slug: 'perceptron',
    category: 'Machine Learning'
  },
  {
    name: 'Decision Trees',
    description: 'Grow a decision tree one question at a time, choosing each split to make the regions as pure as possible, and see where deep trees start to overfit.',
    slug: 'decision-tree',
    category: 'Machine Learning'
  },
  {
    name: 'Gradient Boosting',
    description: 'Build a strong model from tiny trees: each round fits a one-split stump to what the model still gets wrong and adds a shrunk copy of it.',
    slug: 'gradient-boosting',
    category: 'Machine Learning'
  },
  {
    name: 'Neural Network Playground',
    description: 'Train a small neural network on XOR, circles or moons and watch hidden layers bend a straight decision boundary into a curve, with every weight drawn as it changes.',
    slug: 'mlp',
    category: 'Machine Learning'
  },
  {
    name: 'Convolution',
    description: 'Slide a 3×3 kernel over a picture to build a feature map, then apply ReLU and max-pooling: how a CNN finds edges.',
    slug: 'convolution',
    category: 'Deep Learning'
  },
  {
    name: 'Byte-Pair Encoding',
    description: 'Learn a tokenizer from text: glue the most frequent pair of neighbours into a new token, merge after merge, then split a word it never saw.',
    slug: 'bpe',
    category: 'Language Models'
  },
  {
    name: 'Attention',
    description: 'Watch a query score every key, softmax turn the scores into weights, and the output blend the values; drag the query to steer it.',
    slug: 'attention',
    category: 'Language Models'
  },
  {
    name: 'Sampling and Temperature',
    description: 'Turn a language model’s logits into one next word: softmax with temperature, top-k and top-p cuts, and a random draw.',
    slug: 'sampling',
    category: 'Language Models'
  },
  {
    name: 'KV Cache',
    description: 'Generate text token by token and see why caching keys and values turns each step from recomputing everything into one new row.',
    slug: 'kv-cache',
    category: 'Language Models'
  },
  {
    name: 'Q-Learning',
    description: 'An agent learns a gridworld from rewards alone: watch Q-values spread back from the goal, the greedy arrows settle, and the discount decide between a near and a far reward.',
    slug: 'q-learning',
    category: 'Reinforcement Learning'
  },
  {
    name: 'Diffusion Models',
    description: 'Noise a cloud of points into a blob, then watch a trained denoiser turn fresh noise back into the shape, one small step at a time.',
    slug: 'diffusion',
    category: 'Generative Models'
  }
];

// Systems simulators (scheduling, caching, distributed systems) have no single
// running time either; their models live in src/systems/.
const systemsEntries = [
  {
    name: 'CPU Scheduling',
    description: 'Watch FCFS, SJF, SRTF, round robin and priority share one CPU on a Gantt chart: who waits, for how long, and what each switch costs.',
    slug: 'cpu-scheduling',
    category: 'Operating Systems'
  },
  {
    name: 'LRU and LFU Caches',
    description: 'Get and put keys in a fixed-size cache and watch the hash map and the recency (or use-count) list stay in step, evicting in O(1) when it is full.',
    slug: 'lru-cache',
    category: 'Caching'
  },
  {
    name: 'Page Replacement',
    description: 'Run a string of page references through a few frames of memory under FIFO, LRU, Clock and the optimal OPT, and count the faults, including Bélády’s anomaly.',
    slug: 'page-replacement',
    category: 'Operating Systems'
  },
  {
    name: 'Consistent Hashing',
    description: 'Spread keys over servers on a hash ring: each key belongs to the first server clockwise, so adding or removing a server moves only about 1/N of the keys, and virtual nodes even out the load.',
    slug: 'consistent-hashing',
    category: 'Distributed Systems'
  },
  {
    name: 'Queueing and Tail Latency',
    description: 'Watch random requests queue in front of servers, see why latency explodes as load nears 100%, and why p99 matters more than the average.',
    slug: 'queueing',
    category: 'Performance'
  },
  {
    name: 'Token Bucket Rate Limiter',
    description: 'A bucket of tokens that refills at a steady rate: bursts up to its capacity get through, but the long-run rate is capped.',
    slug: 'token-bucket',
    category: 'Performance'
  }
];

const withMeta = (entries, type) =>
  entries.map(entry => ({ ...entry, type, path: `/visualisers/${entry.slug}` }));

export const visualisers = [
  ...withMeta(dataStructureEntries, 'data-structure'),
  ...withMeta(algorithmEntries, 'algorithm'),
  ...withMeta(mathEntries, 'math'),
  ...withMeta(systemsEntries, 'systems')
];

export const dataStructures = visualisers.filter(v => v.type === 'data-structure' && !v.hidden);
export const algorithms = visualisers.filter(v => v.type === 'algorithm' && !v.hidden);
export const mathTopics = visualisers.filter(v => v.type === 'math' && !v.hidden);
export const systemsTopics = visualisers.filter(v => v.type === 'systems' && !v.hidden);

export function getVisualiserByPath(pathname) {
  const path = (pathname || '').replace(/\/+$/, '');
  return visualisers.find(v => v.path === path);
}

export function getVisualiserBySlug(slug) {
  return visualisers.find(v => v.slug === slug);
}

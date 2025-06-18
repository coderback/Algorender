import Link from 'next/link';

// Temporary mock data (replace with dynamic import later)
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

export default function CategoryGrid({ activeTab }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
      {categories[activeTab].map((category) => (
        <div
          key={category.title}
          className="bg-white shadow rounded-lg p-6 hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold mb-3 text-green-700">
            {category.title}
          </h2>
          <div className="flex flex-wrap gap-2">
            {category.modules.map((module) => (
              <Link
                key={module}
                href={`/visualisers/${module.toLowerCase().replace(/ /g, '-')}`}
              >
                <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full hover:bg-green-200 cursor-pointer">
                  {module}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

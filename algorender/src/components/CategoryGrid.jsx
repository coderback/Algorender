import Link from 'next/link';

// Temporary mock data (replace with dynamic import later)
const categories = {
  data: [
    {
      title: 'Linear Structures',
      modules: ['Array', 'Stack', 'Queue'],
    },
    {
      title: 'Linked Structures',
      modules: ['Singly Linked List', 'Doubly Linked List'],
    },
    {
      title: 'Hierarchical Structures',
      modules: ['Binary Tree', 'Heap'],
    },
    {
      title: 'Graph-Based Structures',
      modules: ['Graph', 'Hash Table'],
    },
  ],
  algo: [
    {
      title: 'Sorting Algorithms',
      modules: ['Bubble Sort', 'Merge Sort', 'Quick Sort'],
    },
    {
      title: 'Searching Algorithms',
      modules: ['Linear Search', 'Binary Search'],
    },
    {
      title: 'Graph Algorithms',
      modules: ['BFS', 'DFS', 'Dijkstra'],
    },
    {
      title: 'Recursion & Dynamic Programming',
      modules: ['Fibonacci', 'Knapsack'],
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

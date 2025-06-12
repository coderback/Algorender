# Algorender

Algorender is an interactive web application for visualizing algorithms and data structures. It provides a hands-on learning experience to help users understand how various algorithms and data structures work through visual representations and interactive operations.

## Features

### Data Structure Visualizations
- **Linear Data Structures**: Array, Stack, Queue, Linked List, Deque
- **Hierarchical Data Structures**: Binary Tree, AVL Tree, B-Tree, Heap, Trie
- **Graph-Based Data Structures**: Graph, Directed Graph, Weighted Graph, Adjacency List, Adjacency Matrix
- **Hash-Based Data Structures**: Hash Set

### Algorithm Visualizations
- **Sorting Algorithms**: Bubble Sort, Selection Sort, Insertion Sort, Merge Sort, Quick Sort, Heap Sort, Counting Sort, Radix Sort
- **Searching Algorithms**: Linear Search, Binary Search, Jump Search, Interpolation Search, Exponential Search, Fibonacci Search
- **Graph Algorithms**: Breadth-First Search, Depth-First Search, Dijkstra's Algorithm, Bellman-Ford Algorithm, Floyd-Warshall Algorithm, Prim's Algorithm, Kruskal's Algorithm, Topological Sort, Kosaraju's Algorithm, Tarjan's Algorithm
- **Greedy Algorithms**: Knapsack (Greedy), Activity Selection
- **Dynamic Programming**: Fibonacci (Memoization), 0/1 Knapsack, Longest Common Subsequence, Edit Distance
- **Backtracking**: N-Queens Problem, Sudoku Solver
- **String Matching**: Rabin-Karp Algorithm, KMP Algorithm, Z-Algorithm, Trie (Prefix Matching), Manacher's Algorithm

### Interactive Operations
- Perform operations on data structures (insert, delete, update, search)
- Step through algorithm execution
- View time and space complexity information
- Reset visualizations to initial state

## Technologies Used

- **Frontend Framework**: Next.js 15.3.3
- **UI Library**: React 19.0.0
- **Styling**: TailwindCSS 4.1.8
- **Animations**: Motion 12.17.0
- **Analytics**: Vercel Analytics and Speed Insights

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn package manager

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/coderback/algorender.git
   cd algorender
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

1. **Browse Categories**: On the home page, choose between Data Structures and Algorithms tabs.
2. **Select a Visualization**: Click on any card to open the specific visualization.
3. **Interact with the Visualization**: Use the provided controls to perform operations and see how they affect the visualization.
4. **Learn from Information**: Each visualization includes information about time and space complexity, as well as explanations of how the data structure or algorithm works.

## Building for Production

To create an optimized production build:

```bash
npm run build
# or
yarn build
```

Then, you can start the production server:

```bash
npm run start
# or
yarn start
```

## Deployment

The easiest way to deploy Algorender is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

## Contributing

Contributions are welcome! If you'd like to contribute to Algorender:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -m 'feat(feature): new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Open a Pull Request
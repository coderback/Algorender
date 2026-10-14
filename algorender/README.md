# Algorender

Algorender is an interactive web application for visualizing algorithms and data structures. It provides a hands-on learning experience to help users understand how various algorithms and data structures work through visual representations and interactive operations.

## Features

### Data Structure Visualizations
- **Linear**: Array, Stack, Queue, Linked List, Deque
- **Hierarchical**: Binary Tree, AVL Tree, B-Tree, Heap
- **Graph-Based**: Graph, Adjacency List, Adjacency Matrix
- **Hash-Based**: Hash Table, Hash Set

### Algorithm Visualizations
- **Sorting**: Bubble Sort, Selection Sort, Insertion Sort, Merge Sort, Quick Sort, Heap Sort, Counting Sort, Radix Sort
- **Searching**: Linear Search, Binary Search, Jump Search, Interpolation Search, Exponential Search, Fibonacci Search
- **Graph**: Breadth-First Search, Depth-First Search, Dijkstra's Algorithm, Bellman-Ford Algorithm, Floyd-Warshall Algorithm, Prim's Algorithm, Kruskal's Algorithm, Topological Sort, Kosaraju's Algorithm, Tarjan's Algorithm
- **Greedy**: Knapsack (Greedy), Activity Selection
- **Dynamic Programming**: Fibonacci (Memoization), 0/1 Knapsack, Longest Common Subsequence, Edit Distance
- **Backtracking**: N-Queens Problem, Sudoku Solver
- **String Matching**: Rabin-Karp Algorithm, KMP Algorithm, Z-Algorithm, Trie (Prefix Matching), Manacher's Algorithm

### Interactive Operations
- Perform operations on data structures (insert, remove, search, push/pop, enqueue/dequeue, depending on the structure)
- Watch most algorithms run step by step with an adjustable speed control; sorting and searching visualizations can also be paused and resumed
- Follow live statistics such as comparisons, swaps, sizes and distances
- See time and space complexity and a short "How it Works" summary on every page
- Find any visualization from the search bar in the header

## Technologies Used

- **Frontend Framework**: Next.js 15.3.3 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 3.4
- **Components**: Radix UI tabs, shadcn/ui-style card and tabs, react-icons
- **Analytics**: Vercel Analytics

## Getting Started

### Prerequisites
- Node.js 18.18 or later
- npm

### Installation

The Next.js app lives in the `algorender/` folder of the repository; run all npm commands from there.

1. Clone the repository:
   ```bash
   git clone https://github.com/coderback/Algorender.git
   cd Algorender/algorender
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

1. **Browse Categories**: On the home page, choose between the Data Structures and Algorithms tabs.
2. **Select a Visualization**: Click on any card, or search for it from the header.
3. **Interact with the Visualization**: Use the provided controls to perform operations or run the algorithm, and adjust the speed to follow along.
4. **Learn from Information**: Each visualization shows its time and space complexity and explains how the data structure or algorithm works.

## Project Structure

```
algorender/                     Next.js app
├── src/app/page.jsx            Home page
├── src/app/visualisers/        One folder per visualization (page.jsx)
├── src/components/             Layout, controls, SortingChart and shared UI
├── src/data/visualisers.js     Registry of every visualization (home page, search, navigation)
└── src/hooks/                  Shared hooks, e.g. useCancellableWait for animation timing
VISUALIZER_GUIDE.md             How to add a new visualization
```

## Adding a Visualization

1. Create `algorender/src/app/visualisers/<slug>/page.jsx` and wrap it in the `Layout` component.
2. Add an entry for it to `algorender/src/data/visualisers.js`; the home page, search and back link pick it up from there.
3. Time animation steps with `wait(ms)` from `useCancellableWait` so they stop when the user navigates away.

See the [Visualizer Development Guide](https://github.com/coderback/Algorender/blob/master/VISUALIZER_GUIDE.md) for patterns and templates.

## Building for Production

To create an optimized production build (from `algorender/`):

```bash
npm run build
```

Then, you can start the production server:

```bash
npm run start
```

## Deployment

The easiest way to deploy Algorender is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

## Contributing

Contributions are welcome! If you'd like to contribute to Algorender:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Run `npm run lint` and `npm run build` in `algorender/` to check your changes
4. Commit your changes (`git commit -m 'feat(feature): new feature'`)
5. Push to the branch (`git push origin feature/new-feature`)
6. Open a Pull Request

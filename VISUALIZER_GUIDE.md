# Algorender Visualizer Development Guide

## Overview

This guide provides comprehensive instructions for adding new algorithm and data structure visualizers to the Algorender platform. Follow these patterns to ensure consistency with the existing codebase and maintain the high-quality user experience.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Visualizer Types](#visualizer-types)
3. [Implementation Patterns](#implementation-patterns)
4. [Step-by-Step Guide](#step-by-step-guide)
5. [Templates](#templates)
6. [Integration Guide](#integration-guide)
7. [Testing and Validation](#testing-and-validation)

---

## Architecture Overview

### Core Components

```
src/
├── app/visualisers/[algorithm-name]/
│   └── page.jsx                    # Main visualizer component
├── components/
│   ├── Layout.jsx                  # Page wrapper with complexity info
│   ├── SortingChart.jsx           # Reusable chart for array visualizations
│   ├── VisualizerControls.jsx     # Standardized control buttons
│   └── ui/                        # shadcn/ui components
└── data/
    └── [algorithm-data].js         # Static configuration (if needed)
```

### Key Patterns

1. **Consistent State Management**: All visualizers use standardized state patterns
2. **Async Control Flow**: Pause/resume functionality with cancellation support
3. **Visual Feedback**: Color-coded states for educational clarity
4. **Responsive Design**: Mobile-first approach with consistent breakpoints
5. **Accessibility**: Proper ARIA labels and keyboard navigation

---

## Visualizer Types

### 1. Sorting Algorithms
- **Components**: `SortingChart` for array visualization
- **State**: `array`, `selectedIndices`, `sortedIndices`, `statistics`
- **Examples**: Bubble Sort, Quick Sort, Merge Sort

### 2. Search Algorithms
- **Components**: `SortingChart` with search highlighting
- **State**: `array`, `targetValue`, `searchPath`, `found`
- **Examples**: Binary Search, Linear Search

### 3. Graph Algorithms
- **Components**: Custom graph rendering with nodes and edges
- **State**: `graph`, `visited`, `distances`, `path`
- **Examples**: Dijkstra, BFS, DFS

### 4. Data Structures
- **Components**: Custom rendering for structure visualization
- **State**: Structure-specific state management
- **Examples**: Binary Tree, Hash Table, Stack

### 5. Dynamic Programming
- **Components**: Table/matrix visualization
- **State**: `dp`, `currentCell`, `computedCells`
- **Examples**: Knapsack, LCS, Edit Distance

---

## Implementation Patterns

### Standard State Management

```javascript
// Essential state variables for all visualizers
const [isRunning, setIsRunning] = useState(false);
const [isPaused, setIsPaused] = useState(false);
const [speed, setSpeed] = useState(500);
const [statistics, setStatistics] = useState({ operations: 0 });

// Control refs for async operations
const operationRef = useRef(false);
const pauseRef = useRef(false);
```

### Async Control Flow

```javascript
// Standard sleep function with pause support
const sleep = async (ms) => {
  while (pauseRef.current) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Cancellation pattern in loops
for (let i = 0; i < n && operationRef.current; i++) {
  // Algorithm logic here
  await sleep(speed);
}
```

### Visual State Management

```javascript
// Color-coded state system
const getElementColor = (index) => {
  if (selectedIndices.includes(index)) return 'bg-blue-500'; // Active
  if (completedIndices.includes(index)) return 'bg-green-500'; // Completed
  if (errorIndices.includes(index)) return 'bg-red-500'; // Error
  return 'bg-orange-500'; // Default
};
```

---

## Step-by-Step Guide

### Step 1: Create the Visualizer Directory

```bash
mkdir -p src/app/visualisers/[algorithm-name]
```

### Step 2: Choose the Appropriate Template

Based on your algorithm type, select from:
- [Sorting Algorithm Template](#sorting-algorithm-template)
- [Graph Algorithm Template](#graph-algorithm-template)
- [Data Structure Template](#data-structure-template)
- [Dynamic Programming Template](#dynamic-programming-template)

### Step 3: Implement the Core Algorithm

```javascript
// Example: Bubble Sort implementation
const bubbleSort = async () => {
  setIsRunning(true);
  operationRef.current = true;
  
  const arr = [...array];
  let comparisons = 0;
  let swaps = 0;
  
  for (let i = 0; i < arr.length - 1 && operationRef.current; i++) {
    for (let j = 0; j < arr.length - i - 1 && operationRef.current; j++) {
      setSelectedIndices([j, j + 1]);
      comparisons++;
      setStatistics(prev => ({ ...prev, comparisons }));
      
      await sleep(speed);
      
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swaps++;
        setArray([...arr]);
        setStatistics(prev => ({ ...prev, swaps }));
        await sleep(speed);
      }
    }
    setSortedIndices(prev => [...prev, arr.length - i - 1]);
  }
  
  setSelectedIndices([]);
  setIsRunning(false);
  operationRef.current = false;
};
```

### Step 4: Add to Homepage

Update `src/app/page.jsx` to include your new visualizer:

```javascript
// Add to appropriate array (algorithms or dataStructures)
const algorithms = [
  // ... existing algorithms
  {
    name: 'Your Algorithm',
    description: 'Brief description of what this algorithm does.',
    path: '/visualisers/your-algorithm',
    category: 'Sorting', // or appropriate category
    timeComplexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)' },
    spaceComplexity: 'O(1)'
  }
];
```

### Step 5: Test and Validate

- [ ] Algorithm executes correctly
- [ ] Pause/resume functionality works
- [ ] Visual feedback is clear
- [ ] Mobile responsive
- [ ] Accessibility features work
- [ ] Error handling is robust

---

## Templates

### Sorting Algorithm Template

```javascript
'use client';

import { useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import SortingChart from '@/components/SortingChart';
import VisualizerControls from '@/components/VisualizerControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Algorithm metadata
const ALGORITHM_INFO = {
  name: 'Your Sorting Algorithm',
  description: 'Description of how your algorithm works and its key characteristics.',
  timeComplexity: {
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)'
  },
  spaceComplexity: 'O(1)'
};

// Generate random array for testing
const generateRandomArray = (size = 10, min = 1, max = 100) => {
  return Array.from({ length: size }, () => 
    Math.floor(Math.random() * (max - min + 1)) + min
  );
};

export default function YourAlgorithmVisualizer() {
  // Core state
  const [array, setArray] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [sortedIndices, setSortedIndices] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(500);
  
  // Statistics
  const [statistics, setStatistics] = useState({
    comparisons: 0,
    swaps: 0,
    arrayAccesses: 0
  });
  
  // Control refs
  const sortingRef = useRef(false);
  const pauseRef = useRef(false);
  
  // Initialize array on component mount
  const initializeArray = useCallback(() => {
    const newArray = generateRandomArray(10, 1, 100);
    setArray(newArray);
    setSelectedIndices([]);
    setSortedIndices([]);
    setStatistics({ comparisons: 0, swaps: 0, arrayAccesses: 0 });
  }, []);
  
  // Sleep function with pause support
  const sleep = async (ms) => {
    while (pauseRef.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };
  
  // Main algorithm implementation
  const runAlgorithm = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setIsPaused(false);
    sortingRef.current = true;
    pauseRef.current = false;
    
    const arr = [...array];
    let comparisons = 0;
    let swaps = 0;
    let arrayAccesses = 0;
    
    try {
      // TODO: Implement your algorithm here
      // Example: Bubble Sort
      for (let i = 0; i < arr.length - 1 && sortingRef.current; i++) {
        for (let j = 0; j < arr.length - i - 1 && sortingRef.current; j++) {
          // Highlight comparison
          setSelectedIndices([j, j + 1]);
          comparisons++;
          arrayAccesses += 2;
          setStatistics(prev => ({ 
            ...prev, 
            comparisons, 
            arrayAccesses 
          }));
          
          await sleep(speed);
          
          if (arr[j] > arr[j + 1]) {
            // Swap elements
            [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
            swaps++;
            setArray([...arr]);
            setStatistics(prev => ({ ...prev, swaps }));
            await sleep(speed);
          }
        }
        
        // Mark as sorted
        setSortedIndices(prev => [...prev, arr.length - i - 1]);
      }
      
      // Mark all as sorted
      setSortedIndices(Array.from({ length: arr.length }, (_, i) => i));
      setSelectedIndices([]);
      
    } catch (error) {
      console.error('Algorithm execution error:', error);
    } finally {
      setIsRunning(false);
      sortingRef.current = false;
      pauseRef.current = false;
    }
  };
  
  // Pause/Resume functionality
  const togglePause = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  };
  
  // Stop execution
  const stopAlgorithm = () => {
    sortingRef.current = false;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setSelectedIndices([]);
  };
  
  // Reset to initial state
  const resetVisualization = () => {
    stopAlgorithm();
    initializeArray();
  };
  
  return (
    <Layout
      title={ALGORITHM_INFO.name}
      description={ALGORITHM_INFO.description}
      timeComplexity={ALGORITHM_INFO.timeComplexity}
      spaceComplexity={ALGORITHM_INFO.spaceComplexity}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Visualization Area */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Array Visualization</CardTitle>
            </CardHeader>
            <CardContent>
              <SortingChart
                array={array}
                selectedIndices={selectedIndices}
                sortedIndices={sortedIndices}
                className="h-80"
              />
            </CardContent>
          </Card>
          
          {/* Algorithm Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Algorithm Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>Currently comparing elements</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>Sorted elements</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-500 rounded"></div>
                  <span>Unsorted elements</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Controls Area */}
        <div className="space-y-6">
          {/* Main Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <VisualizerControls
                onStart={runAlgorithm}
                onPause={togglePause}
                onStop={stopAlgorithm}
                onReset={resetVisualization}
                isRunning={isRunning}
                isPaused={isPaused}
                disabled={array.length === 0}
              />
              
              <Separator />
              
              {/* Speed Control */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Speed: {speed}ms
                </label>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                  disabled={isRunning}
                />
              </div>
              
              {/* Array Controls */}
              <div className="space-y-2">
                <Button
                  onClick={initializeArray}
                  disabled={isRunning}
                  variant="outline"
                  className="w-full"
                >
                  Generate New Array
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {statistics.comparisons}
                  </div>
                  <div className="text-sm text-gray-600">Comparisons</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {statistics.swaps}
                  </div>
                  <div className="text-sm text-gray-600">Swaps</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {statistics.arrayAccesses}
                  </div>
                  <div className="text-sm text-gray-600">Array Accesses</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {array.length}
                  </div>
                  <div className="text-sm text-gray-600">Array Size</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Algorithm Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Algorithm Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div>
                  <strong>Best Case:</strong> {ALGORITHM_INFO.timeComplexity.best}
                </div>
                <div>
                  <strong>Average Case:</strong> {ALGORITHM_INFO.timeComplexity.average}
                </div>
                <div>
                  <strong>Worst Case:</strong> {ALGORITHM_INFO.timeComplexity.worst}
                </div>
                <div>
                  <strong>Space Complexity:</strong> {ALGORITHM_INFO.spaceComplexity}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
```

### Graph Algorithm Template

```javascript
'use client';

import { useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import VisualizerControls from '@/components/VisualizerControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Algorithm metadata
const ALGORITHM_INFO = {
  name: 'Your Graph Algorithm',
  description: 'Description of how your graph algorithm works.',
  timeComplexity: {
    best: 'O(V + E)',
    average: 'O(V + E)',
    worst: 'O(V + E)'
  },
  spaceComplexity: 'O(V)'
};

// Sample graph data
const SAMPLE_GRAPH = {
  nodes: [
    { id: 'A', x: 100, y: 100 },
    { id: 'B', x: 200, y: 50 },
    { id: 'C', x: 200, y: 150 },
    { id: 'D', x: 300, y: 100 }
  ],
  edges: [
    { from: 'A', to: 'B', weight: 4 },
    { from: 'A', to: 'C', weight: 2 },
    { from: 'B', to: 'D', weight: 3 },
    { from: 'C', to: 'D', weight: 1 }
  ]
};

export default function YourGraphAlgorithmVisualizer() {
  // Core state
  const [graph, setGraph] = useState(SAMPLE_GRAPH);
  const [visitedNodes, setVisitedNodes] = useState(new Set());
  const [currentNode, setCurrentNode] = useState(null);
  const [distances, setDistances] = useState({});
  const [path, setPath] = useState([]);
  const [startNode, setStartNode] = useState('A');
  const [endNode, setEndNode] = useState('D');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(500);
  
  // Statistics
  const [statistics, setStatistics] = useState({
    nodesVisited: 0,
    edgesExplored: 0,
    pathLength: 0
  });
  
  // Control refs
  const algorithmRef = useRef(false);
  const pauseRef = useRef(false);
  
  // Sleep function with pause support
  const sleep = async (ms) => {
    while (pauseRef.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };
  
  // Graph visualization component
  const GraphVisualization = ({ graph, visitedNodes, currentNode, path }) => {
    const getNodeColor = (nodeId) => {
      if (currentNode === nodeId) return '#3b82f6'; // Blue - current
      if (visitedNodes.has(nodeId)) return '#10b981'; // Green - visited
      if (path.includes(nodeId)) return '#f59e0b'; // Yellow - path
      return '#6b7280'; // Gray - default
    };
    
    const getEdgeColor = (from, to) => {
      const isInPath = path.includes(from) && path.includes(to);
      return isInPath ? '#f59e0b' : '#d1d5db';
    };
    
    return (
      <div className="relative w-full h-96 bg-gray-50 rounded-lg border">
        <svg className="w-full h-full">
          {/* Render edges */}
          {graph.edges.map((edge, index) => {
            const fromNode = graph.nodes.find(n => n.id === edge.from);
            const toNode = graph.nodes.find(n => n.id === edge.to);
            
            return (
              <g key={index}>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={getEdgeColor(edge.from, edge.to)}
                  strokeWidth="2"
                />
                {/* Edge weight */}
                <text
                  x={(fromNode.x + toNode.x) / 2}
                  y={(fromNode.y + toNode.y) / 2}
                  textAnchor="middle"
                  className="text-xs fill-gray-600"
                >
                  {edge.weight}
                </text>
              </g>
            );
          })}
          
          {/* Render nodes */}
          {graph.nodes.map((node) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r="20"
                fill={getNodeColor(node.id)}
                stroke="white"
                strokeWidth="2"
              />
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-sm font-medium fill-white"
              >
                {node.id}
              </text>
              {/* Distance label */}
              {distances[node.id] !== undefined && (
                <text
                  x={node.x}
                  y={node.y + 35}
                  textAnchor="middle"
                  className="text-xs fill-gray-600"
                >
                  d: {distances[node.id]}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    );
  };
  
  // Main algorithm implementation
  const runAlgorithm = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setIsPaused(false);
    algorithmRef.current = true;
    pauseRef.current = false;
    
    // Reset state
    setVisitedNodes(new Set());
    setCurrentNode(null);
    setDistances({});
    setPath([]);
    setStatistics({ nodesVisited: 0, edgesExplored: 0, pathLength: 0 });
    
    try {
      // TODO: Implement your graph algorithm here
      // Example: Simple BFS
      const queue = [startNode];
      const visited = new Set();
      const distances = { [startNode]: 0 };
      let nodesVisited = 0;
      let edgesExplored = 0;
      
      while (queue.length > 0 && algorithmRef.current) {
        const currentNodeId = queue.shift();
        
        if (visited.has(currentNodeId)) continue;
        
        visited.add(currentNodeId);
        nodesVisited++;
        
        setCurrentNode(currentNodeId);
        setVisitedNodes(new Set(visited));
        setDistances({...distances});
        setStatistics(prev => ({ ...prev, nodesVisited }));
        
        await sleep(speed);
        
        // Explore neighbors
        const neighbors = graph.edges
          .filter(edge => edge.from === currentNodeId)
          .map(edge => edge.to);
        
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor) && algorithmRef.current) {
            edgesExplored++;
            queue.push(neighbor);
            
            if (distances[neighbor] === undefined) {
              distances[neighbor] = distances[currentNodeId] + 1;
            }
          }
        }
        
        setStatistics(prev => ({ ...prev, edgesExplored }));
        
        if (currentNodeId === endNode) {
          // Build path (simplified)
          const finalPath = [endNode, startNode]; // Simplified path
          setPath(finalPath);
          setStatistics(prev => ({ ...prev, pathLength: finalPath.length }));
          break;
        }
      }
      
      setCurrentNode(null);
      
    } catch (error) {
      console.error('Algorithm execution error:', error);
    } finally {
      setIsRunning(false);
      algorithmRef.current = false;
      pauseRef.current = false;
    }
  };
  
  // Control functions
  const togglePause = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  };
  
  const stopAlgorithm = () => {
    algorithmRef.current = false;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentNode(null);
  };
  
  const resetVisualization = () => {
    stopAlgorithm();
    setVisitedNodes(new Set());
    setDistances({});
    setPath([]);
    setStatistics({ nodesVisited: 0, edgesExplored: 0, pathLength: 0 });
  };
  
  return (
    <Layout
      title={ALGORITHM_INFO.name}
      description={ALGORITHM_INFO.description}
      timeComplexity={ALGORITHM_INFO.timeComplexity}
      spaceComplexity={ALGORITHM_INFO.spaceComplexity}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Visualization Area */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Graph Visualization</CardTitle>
            </CardHeader>
            <CardContent>
              <GraphVisualization
                graph={graph}
                visitedNodes={visitedNodes}
                currentNode={currentNode}
                path={path}
              />
            </CardContent>
          </Card>
          
          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                  <span>Current Node</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                  <span>Visited</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                  <span>Path</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
                  <span>Unvisited</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Controls Area */}
        <div className="space-y-6">
          {/* Main Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <VisualizerControls
                onStart={runAlgorithm}
                onPause={togglePause}
                onStop={stopAlgorithm}
                onReset={resetVisualization}
                isRunning={isRunning}
                isPaused={isPaused}
              />
              
              {/* Node Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-node">Start Node</Label>
                  <select
                    id="start-node"
                    value={startNode}
                    onChange={(e) => setStartNode(e.target.value)}
                    disabled={isRunning}
                    className="w-full p-2 border rounded-md"
                  >
                    {graph.nodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="end-node">End Node</Label>
                  <select
                    id="end-node"
                    value={endNode}
                    onChange={(e) => setEndNode(e.target.value)}
                    disabled={isRunning}
                    className="w-full p-2 border rounded-md"
                  >
                    {graph.nodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Speed Control */}
              <div className="space-y-2">
                <Label>Speed: {speed}ms</Label>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                  disabled={isRunning}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {statistics.nodesVisited}
                  </div>
                  <div className="text-sm text-gray-600">Nodes Visited</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {statistics.edgesExplored}
                  </div>
                  <div className="text-sm text-gray-600">Edges Explored</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {statistics.pathLength}
                  </div>
                  <div className="text-sm text-gray-600">Path Length</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {distances[endNode] || 0}
                  </div>
                  <div className="text-sm text-gray-600">Distance</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
```

### Data Structure Template

```javascript
'use client';

import { useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import VisualizerControls from '@/components/VisualizerControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Data structure metadata
const DATA_STRUCTURE_INFO = {
  name: 'Your Data Structure',
  description: 'Description of your data structure and its operations.',
  timeComplexity: {
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(n)'
  },
  spaceComplexity: 'O(n)'
};

// Initial data structure state
const INITIAL_STRUCTURE = {
  // Define your initial structure here
  // Example for binary tree:
  root: null,
  size: 0
};

export default function YourDataStructureVisualizer() {
  // Core state
  const [structure, setStructure] = useState(INITIAL_STRUCTURE);
  const [highlightedElements, setHighlightedElements] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isOperating, setIsOperating] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [lastOperation, setLastOperation] = useState('');
  const [operationResult, setOperationResult] = useState('');
  
  // Statistics
  const [statistics, setStatistics] = useState({
    operations: 0,
    size: 0,
    height: 0,
    comparisons: 0
  });
  
  // Control refs
  const operationRef = useRef(false);
  const pauseRef = useRef(false);
  
  // Sleep function with pause support
  const sleep = async (ms) => {
    while (pauseRef.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };
  
  // Data structure visualization component
  const StructureVisualization = ({ structure, highlightedElements }) => {
    // TODO: Implement your data structure visualization
    // Example for binary tree:
    const renderNode = (node, x = 250, y = 50, level = 0) => {
      if (!node) return null;
      
      const isHighlighted = highlightedElements.includes(node.id);
      const nodeColor = isHighlighted ? '#3b82f6' : '#6b7280';
      
      return (
        <g key={node.id}>
          <circle
            cx={x}
            cy={y}
            r="20"
            fill={nodeColor}
            stroke="white"
            strokeWidth="2"
          />
          <text
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-sm font-medium fill-white"
          >
            {node.value}
          </text>
          
          {/* Recursive rendering for children */}
          {node.left && renderNode(node.left, x - 80, y + 80, level + 1)}
          {node.right && renderNode(node.right, x + 80, y + 80, level + 1)}
        </g>
      );
    };
    
    return (
      <div className="w-full h-96 bg-gray-50 rounded-lg border">
        <svg className="w-full h-full">
          {structure.root && renderNode(structure.root)}
          {!structure.root && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-lg fill-gray-400"
            >
              Empty Structure
            </text>
          )}
        </svg>
      </div>
    );
  };
  
  // Insert operation
  const insertElement = async () => {
    if (!inputValue.trim() || isOperating) return;
    
    setIsOperating(true);
    operationRef.current = true;
    setLastOperation(`Insert ${inputValue}`);
    
    try {
      // TODO: Implement your insert logic
      // Example: Insert into binary search tree
      const value = parseInt(inputValue);
      let comparisons = 0;
      
      // Simulate insertion with visualization
      const newStructure = { ...structure };
      
      // Your insertion logic here
      // Update structure, highlight path, etc.
      
      setStructure(newStructure);
      setStatistics(prev => ({
        ...prev,
        operations: prev.operations + 1,
        size: prev.size + 1,
        comparisons: prev.comparisons + comparisons
      }));
      
      setOperationResult(`Successfully inserted ${value}`);
      setInputValue('');
      
    } catch (error) {
      setOperationResult(`Error: ${error.message}`);
    } finally {
      setIsOperating(false);
      operationRef.current = false;
      setHighlightedElements([]);
    }
  };
  
  // Search operation
  const searchElement = async () => {
    if (!inputValue.trim() || isOperating) return;
    
    setIsOperating(true);
    operationRef.current = true;
    setLastOperation(`Search ${inputValue}`);
    
    try {
      // TODO: Implement your search logic
      const value = parseInt(inputValue);
      let comparisons = 0;
      let found = false;
      
      // Your search logic here with visualization
      // Highlight path, show comparisons, etc.
      
      setStatistics(prev => ({
        ...prev,
        operations: prev.operations + 1,
        comparisons: prev.comparisons + comparisons
      }));
      
      setOperationResult(found ? `Found ${value}` : `${value} not found`);
      
    } catch (error) {
      setOperationResult(`Error: ${error.message}`);
    } finally {
      setIsOperating(false);
      operationRef.current = false;
      setHighlightedElements([]);
    }
  };
  
  // Delete operation
  const deleteElement = async () => {
    if (!inputValue.trim() || isOperating) return;
    
    setIsOperating(true);
    operationRef.current = true;
    setLastOperation(`Delete ${inputValue}`);
    
    try {
      // TODO: Implement your delete logic
      const value = parseInt(inputValue);
      
      // Your deletion logic here
      
      setStatistics(prev => ({
        ...prev,
        operations: prev.operations + 1,
        size: Math.max(0, prev.size - 1)
      }));
      
      setOperationResult(`Successfully deleted ${value}`);
      setInputValue('');
      
    } catch (error) {
      setOperationResult(`Error: ${error.message}`);
    } finally {
      setIsOperating(false);
      operationRef.current = false;
      setHighlightedElements([]);
    }
  };
  
  // Clear structure
  const clearStructure = () => {
    setStructure(INITIAL_STRUCTURE);
    setHighlightedElements([]);
    setOperationResult('Structure cleared');
    setStatistics({
      operations: 0,
      size: 0,
      height: 0,
      comparisons: 0
    });
  };
  
  return (
    <Layout
      title={DATA_STRUCTURE_INFO.name}
      description={DATA_STRUCTURE_INFO.description}
      timeComplexity={DATA_STRUCTURE_INFO.timeComplexity}
      spaceComplexity={DATA_STRUCTURE_INFO.spaceComplexity}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Visualization Area */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Structure Visualization</CardTitle>
            </CardHeader>
            <CardContent>
              <StructureVisualization
                structure={structure}
                highlightedElements={highlightedElements}
              />
            </CardContent>
          </Card>
          
          {/* Operation Result */}
          {operationResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Last Operation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <strong>{lastOperation}</strong>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {operationResult}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Controls Area */}
        <div className="space-y-6">
          {/* Input Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="input-value">Value</Label>
                <Input
                  id="input-value"
                  type="number"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter a value"
                  disabled={isOperating}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={insertElement}
                  disabled={isOperating || !inputValue.trim()}
                  className="w-full"
                >
                  Insert
                </Button>
                <Button
                  onClick={searchElement}
                  disabled={isOperating || !inputValue.trim()}
                  variant="outline"
                  className="w-full"
                >
                  Search
                </Button>
                <Button
                  onClick={deleteElement}
                  disabled={isOperating || !inputValue.trim()}
                  variant="destructive"
                  className="w-full"
                >
                  Delete
                </Button>
              </div>
              
              <Button
                onClick={clearStructure}
                disabled={isOperating}
                variant="outline"
                className="w-full"
              >
                Clear All
              </Button>
              
              {/* Speed Control */}
              <div className="space-y-2">
                <Label>Animation Speed: {speed}ms</Label>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                  disabled={isOperating}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {statistics.operations}
                  </div>
                  <div className="text-sm text-gray-600">Operations</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {statistics.size}
                  </div>
                  <div className="text-sm text-gray-600">Size</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {statistics.height}
                  </div>
                  <div className="text-sm text-gray-600">Height</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {statistics.comparisons}
                  </div>
                  <div className="text-sm text-gray-600">Comparisons</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                  <span>Highlighted element</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
                  <span>Normal element</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
```

### Dynamic Programming Template

```javascript
'use client';

import { useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import VisualizerControls from '@/components/VisualizerControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Algorithm metadata
const ALGORITHM_INFO = {
  name: 'Your Dynamic Programming Algorithm',
  description: 'Description of your DP algorithm and problem it solves.',
  timeComplexity: {
    best: 'O(mn)',
    average: 'O(mn)',
    worst: 'O(mn)'
  },
  spaceComplexity: 'O(mn)'
};

export default function YourDPAlgorithmVisualizer() {
  // Core state
  const [input1, setInput1] = useState('ABCDGH');
  const [input2, setInput2] = useState('AEDFHR');
  const [dp, setDp] = useState([]);
  const [currentCell, setCurrentCell] = useState(null);
  const [computedCells, setComputedCells] = useState(new Set());
  const [result, setResult] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(500);
  
  // Statistics
  const [statistics, setStatistics] = useState({
    cellsComputed: 0,
    comparisons: 0,
    optimalValue: 0
  });
  
  // Control refs
  const algorithmRef = useRef(false);
  const pauseRef = useRef(false);
  
  // Sleep function with pause support
  const sleep = async (ms) => {
    while (pauseRef.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };
  
  // DP table visualization component
  const DPTableVisualization = ({ dp, currentCell, computedCells, input1, input2 }) => {
    const getCellColor = (i, j) => {
      if (currentCell && currentCell.i === i && currentCell.j === j) {
        return 'bg-blue-500 text-white'; // Current cell
      }
      if (computedCells.has(`${i},${j}`)) {
        return 'bg-green-100 text-green-800'; // Computed cell
      }
      return 'bg-gray-50 text-gray-600'; // Uncomputed cell
    };
    
    if (!dp.length) return (
      <div className="w-full h-96 bg-gray-50 rounded-lg border flex items-center justify-center">
        <span className="text-gray-400">Click "Run Algorithm" to visualize</span>
      </div>
    );
    
    return (
      <div className="w-full overflow-auto">
        <table className="border-collapse border border-gray-300 text-sm">
          <thead>
            <tr>
              <th className="border border-gray-300 p-2 bg-gray-100"></th>
              <th className="border border-gray-300 p-2 bg-gray-100"></th>
              {input2.split('').map((char, idx) => (
                <th key={idx} className="border border-gray-300 p-2 bg-gray-100">
                  {char}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dp.map((row, i) => (
              <tr key={i}>
                <td className="border border-gray-300 p-2 bg-gray-100 font-medium">
                  {i === 0 ? '' : input1[i - 1]}
                </td>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`border border-gray-300 p-2 text-center ${getCellColor(i, j)}`}
                  >
                    {cell !== undefined ? cell : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  // Initialize DP table
  const initializeDP = useCallback(() => {
    const m = input1.length + 1;
    const n = input2.length + 1;
    const table = Array(m).fill().map(() => Array(n).fill(undefined));
    
    // Initialize base cases
    for (let i = 0; i < m; i++) {
      table[i][0] = 0;
    }
    for (let j = 0; j < n; j++) {
      table[0][j] = 0;
    }
    
    setDp(table);
    setCurrentCell(null);
    setComputedCells(new Set());
    setResult('');
    setStatistics({ cellsComputed: 0, comparisons: 0, optimalValue: 0 });
  }, [input1, input2]);
  
  // Main algorithm implementation
  const runAlgorithm = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setIsPaused(false);
    algorithmRef.current = true;
    pauseRef.current = false;
    
    initializeDP();
    
    try {
      const m = input1.length + 1;
      const n = input2.length + 1;
      const table = Array(m).fill().map(() => Array(n).fill(0));
      
      // Initialize base cases
      for (let i = 0; i < m; i++) {
        table[i][0] = 0;
      }
      for (let j = 0; j < n; j++) {
        table[0][j] = 0;
      }
      
      let cellsComputed = 0;
      let comparisons = 0;
      
      // Fill the DP table
      for (let i = 1; i < m && algorithmRef.current; i++) {
        for (let j = 1; j < n && algorithmRef.current; j++) {
          setCurrentCell({ i, j });
          
          // TODO: Implement your DP recurrence relation
          // Example: Longest Common Subsequence
          if (input1[i - 1] === input2[j - 1]) {
            table[i][j] = table[i - 1][j - 1] + 1;
          } else {
            table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
          }
          
          cellsComputed++;
          comparisons++;
          
          setDp(table.map(row => [...row]));
          setComputedCells(prev => new Set([...prev, `${i},${j}`]));
          setStatistics(prev => ({ 
            ...prev, 
            cellsComputed, 
            comparisons,
            optimalValue: table[i][j]
          }));
          
          await sleep(speed);
        }
      }
      
      // Backtrack to find the solution (optional)
      const solution = buildSolution(table, input1, input2);
      setResult(solution);
      setCurrentCell(null);
      
    } catch (error) {
      console.error('Algorithm execution error:', error);
    } finally {
      setIsRunning(false);
      algorithmRef.current = false;
      pauseRef.current = false;
    }
  };
  
  // Build solution from DP table (example for LCS)
  const buildSolution = (table, str1, str2) => {
    // TODO: Implement solution reconstruction
    // This is problem-specific
    return `Optimal value: ${table[str1.length][str2.length]}`;
  };
  
  // Control functions
  const togglePause = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  };
  
  const stopAlgorithm = () => {
    algorithmRef.current = false;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentCell(null);
  };
  
  const resetVisualization = () => {
    stopAlgorithm();
    initializeDP();
  };
  
  return (
    <Layout
      title={ALGORITHM_INFO.name}
      description={ALGORITHM_INFO.description}
      timeComplexity={ALGORITHM_INFO.timeComplexity}
      spaceComplexity={ALGORITHM_INFO.spaceComplexity}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Visualization Area */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">DP Table Visualization</CardTitle>
            </CardHeader>
            <CardContent>
              <DPTableVisualization
                dp={dp}
                currentCell={currentCell}
                computedCells={computedCells}
                input1={input1}
                input2={input2}
              />
            </CardContent>
          </Card>
          
          {/* Result */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Result</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-medium text-green-600">
                  {result}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>Current cell being computed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
                  <span>Computed cells</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
                  <span>Uncomputed cells</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Controls Area */}
        <div className="space-y-6">
          {/* Input Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="input1">Input 1</Label>
                <Input
                  id="input1"
                  value={input1}
                  onChange={(e) => setInput1(e.target.value.toUpperCase())}
                  placeholder="Enter first input"
                  disabled={isRunning}
                />
              </div>
              <div>
                <Label htmlFor="input2">Input 2</Label>
                <Input
                  id="input2"
                  value={input2}
                  onChange={(e) => setInput2(e.target.value.toUpperCase())}
                  placeholder="Enter second input"
                  disabled={isRunning}
                />
              </div>
              
              <Button
                onClick={initializeDP}
                disabled={isRunning}
                variant="outline"
                className="w-full"
              >
                Initialize Table
              </Button>
            </CardContent>
          </Card>
          
          {/* Main Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <VisualizerControls
                onStart={runAlgorithm}
                onPause={togglePause}
                onStop={stopAlgorithm}
                onReset={resetVisualization}
                isRunning={isRunning}
                isPaused={isPaused}
                disabled={!input1 || !input2}
              />
              
              {/* Speed Control */}
              <div className="space-y-2">
                <Label>Speed: {speed}ms</Label>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                  disabled={isRunning}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {statistics.cellsComputed}
                  </div>
                  <div className="text-sm text-gray-600">Cells Computed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {statistics.comparisons}
                  </div>
                  <div className="text-sm text-gray-600">Comparisons</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {input1.length}
                  </div>
                  <div className="text-sm text-gray-600">Input 1 Length</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {input2.length}
                  </div>
                  <div className="text-sm text-gray-600">Input 2 Length</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
```

---

## Integration Guide

### 1. Adding to Homepage

Update `src/app/page.jsx` to include your new visualizer:

```javascript
// Add to the appropriate array
const algorithms = [
  // ... existing algorithms
  {
    name: 'Your Algorithm Name',
    description: 'Brief description of the algorithm or data structure.',
    path: '/visualisers/your-algorithm-name',
    category: 'Sorting', // Categories: Sorting, Searching, Graph, Greedy, Dynamic Programming, Backtracking, String Matching
    timeComplexity: {
      best: 'O(n)',
      average: 'O(n log n)',
      worst: 'O(n²)'
    },
    spaceComplexity: 'O(1)'
  }
];
```

### 2. Update Navigation Detection

If your visualizer is an algorithm, update the algorithm detection logic in `src/components/Layout.jsx`:

```javascript
const isAlgorithm = pathname.includes('-sort') ||
                   pathname.includes('-search') ||
                   pathname.includes('your-algorithm-name') || // Add your algorithm
                   // ... other patterns
```

### 3. Custom Components

If you need custom visualization components, create them in `src/components/`:

```javascript
// src/components/CustomVisualization.jsx
'use client';

import { memo } from 'react';

const CustomVisualization = memo(({ data, highlightedElements, className }) => {
  // Your custom visualization logic
  return (
    <div className={`custom-visualization ${className}`}>
      {/* Your visualization JSX */}
    </div>
  );
});

CustomVisualization.displayName = 'CustomVisualization';

export default CustomVisualization;
```

---

## Testing and Validation

### Development Checklist

Before submitting your visualizer, ensure:

#### Functionality
- [ ] Algorithm executes correctly with various inputs
- [ ] Visual feedback is clear and educational
- [ ] Statistics are accurate and informative
- [ ] Error handling is robust

#### User Experience
- [ ] Pause/resume functionality works smoothly
- [ ] Speed control affects animation timing
- [ ] Reset button restores initial state
- [ ] Input validation provides helpful feedback

#### Performance
- [ ] No memory leaks during long animations
- [ ] Smooth animations on various devices
- [ ] Responsive design works on mobile
- [ ] Loading states are handled gracefully

#### Code Quality
- [ ] Follows established patterns and conventions
- [ ] Properly documented with comments
- [ ] Uses TypeScript-style JSDoc if needed
- [ ] Consistent naming and structure

#### Accessibility
- [ ] Proper ARIA labels for interactive elements
- [ ] Keyboard navigation support
- [ ] Color contrast meets accessibility standards
- [ ] Screen reader compatibility

### Testing Commands

```bash
# Run the development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Test your visualizer
# Navigate to: http://localhost:3000/visualisers/your-algorithm-name
```

---

## Common Patterns and Best Practices

### 1. State Management Best Practices

```javascript
// Always use functional updates for arrays/objects
setArray(prev => [...prev, newItem]);
setVisited(prev => new Set([...prev, nodeId]));

// Use separate state for different concerns
const [data, setData] = useState([]); // Core data
const [ui, setUI] = useState({}); // UI state
const [stats, setStats] = useState({}); // Statistics
```

### 2. Error Handling

```javascript
const executeAlgorithm = async () => {
  try {
    // Algorithm logic
  } catch (error) {
    console.error('Algorithm error:', error);
    setError(error.message);
    setIsRunning(false);
  }
};
```

### 3. Performance Optimization

```javascript
// Use useCallback for expensive operations
const expensiveOperation = useCallback(() => {
  // Expensive computation
}, [dependency]);

// Memoize expensive components
const ExpensiveVisualization = memo(({ data }) => {
  // Expensive rendering
});
```

### 4. Accessibility

```javascript
// Proper ARIA labels
<button
  aria-label="Start algorithm execution"
  aria-describedby="algorithm-description"
  onClick={startAlgorithm}
>
  Start
</button>

// Keyboard support
<div
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleSelection();
    }
  }}
>
  Interactive element
</div>
```

### 5. Mobile Responsiveness

```javascript
// Use responsive classes
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <div className="w-full overflow-x-auto">
    {/* Scrollable content on mobile */}
  </div>
</div>
```

---

## Conclusion

This guide provides comprehensive templates and patterns for creating high-quality visualizers that integrate seamlessly with the Algorender platform. Follow these patterns to ensure consistency, maintainability, and excellent user experience.

Remember to:
- Start with the appropriate template
- Customize for your specific algorithm/data structure
- Follow established patterns and conventions
- Test thoroughly across different devices
- Consider accessibility and performance

Your visualizer will help students understand complex concepts through interactive, visual learning experiences!
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialGraph = {
  nodes: [0, 1, 2, 3, 4, 5],
  edges: [
    [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [3, 5], [4, 5]
  ]
};

function getAdjList(nodes, edges) {
  const adj = {};
  nodes.forEach(n => (adj[n] = []));
  edges.forEach(([u, v]) => {
    adj[u].push(v);
    adj[v].push(u);
  });
  return adj;
}

export default function BFSVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [startNode, setStartNode] = useState(0);
  const [visited, setVisited] = useState([]);
  const [queue, setQueue] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const adjList = getAdjList(graph.nodes, graph.edges);

  const reset = () => {
    setVisited([]);
    setQueue([]);
    setIsRunning(false);
  };

  const bfs = async () => {
    setIsRunning(true);
    const visitedOrder = [];
    const q = [parseInt(startNode)];
    const visitedSet = new Set();
    visitedSet.add(parseInt(startNode));
    setQueue([...q]);
    setVisited([...visitedOrder]);
    while (q.length > 0) {
      const node = q.shift();
      visitedOrder.push(node);
      setVisited([...visitedOrder]);
      setQueue([...q]);
      await new Promise(res => setTimeout(res, speed));
      for (const neighbor of adjList[node]) {
        if (!visitedSet.has(neighbor)) {
          visitedSet.add(neighbor);
          q.push(neighbor);
        }
      }
      setQueue([...q]);
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Breadth-First Search (BFS) Visualiser"
      description="Visualise the BFS traversal of a graph step by step."
      timeComplexity={{ best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' }}
      spaceComplexity="O(V)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Graph</h2>
            <div className="flex flex-wrap gap-4 justify-center mb-4">
              {graph.nodes.map((node) => (
                <div
                  key={node}
                  className={`w-12 h-12 flex items-center justify-center rounded-full border-2 text-lg font-bold transition-all duration-300 ${
                    visited.includes(node)
                      ? 'bg-green-400 border-green-600 text-white'
                      : queue.includes(node)
                      ? 'bg-blue-400 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  {node}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {graph.edges.map(([u, v], i) => (
                <span key={i} className="text-xs text-gray-500">({u}, {v})</span>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Visit all neighbors of a node before moving deeper</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses a queue to keep track of nodes to visit</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Ensures shortest path in unweighted graphs</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Node
                </label>
                <InputControl
                  type="number"
                  min={0}
                  max={graph.nodes.length - 1}
                  value={startNode}
                  onChange={e => setStartNode(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Speed
                </label>
                <InputControl
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isRunning}
                />
              </div>
              <div className="flex space-x-4">
                <Button
                  onClick={bfs}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? 'Running...' : 'Start BFS'}
                </Button>
                <Button
                  onClick={reset}
                  disabled={isRunning}
                  variant="secondary"
                  className="flex-1"
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Nodes Visited</p>
                <p className="text-2xl font-semibold text-blue-600">{visited.length}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Queue Size</p>
                <p className="text-2xl font-semibold text-gray-600">{queue.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">Traversal Order:</p>
              <div className="flex flex-wrap gap-2">
                {visited.map((node, i) => (
                  <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">{node}</span>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">Queue:</p>
              <div className="flex flex-wrap gap-2">
                {queue.map((node, i) => (
                  <span key={i} className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-semibold">{node}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
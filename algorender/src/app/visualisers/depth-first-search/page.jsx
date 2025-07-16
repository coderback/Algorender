'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaNetworkWired, FaTachometerAlt, FaPlay, FaUndo, FaNodeJs } from 'react-icons/fa';

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

export default function DFSVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [startNode, setStartNode] = useState(0);
  const [visited, setVisited] = useState([]);
  const [stack, setStack] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const adjList = getAdjList(graph.nodes, graph.edges);

  const reset = () => {
    setVisited([]);
    setStack([]);
    setIsRunning(false);
  };

  const dfs = async () => {
    setIsRunning(true);
    const visitedOrder = [];
    const stack = [parseInt(startNode)];
    const visitedSet = new Set();
    setStack([...stack]);
    setVisited([...visitedOrder]);
    while (stack.length > 0) {
      const node = stack.pop();
      if (!visitedSet.has(node)) {
        visitedOrder.push(node);
        visitedSet.add(node);
        setVisited([...visitedOrder]);
        setStack([...stack]);
        await new Promise(res => setTimeout(res, speed));
        for (const neighbor of [...adjList[node]].reverse()) {
          if (!visitedSet.has(neighbor)) {
            stack.push(neighbor);
          }
        }
        setStack([...stack]);
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Depth-First Search (DFS) Visualiser"
      description="Visualise the DFS traversal of a graph step by step."
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
                      : stack.includes(node)
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
                <span>Explore as far as possible along each branch before backtracking</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses a stack to keep track of nodes to visit</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Can be used to find connected components</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <FaNodeJs className="text-blue-400" />
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
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <FaTachometerAlt className="text-blue-400" />
                  Speed
                  <span className="ml-auto text-xs text-gray-500">{(1000 - speed)} ms</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isRunning}
                  className="w-full h-2 bg-gradient-to-r from-blue-200 to-blue-500 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all"
                  style={{ accentColor: '#2563eb' }}
                />
              </div>
              <div className="flex space-x-4">
                <Button
                  onClick={dfs}
                  disabled={isRunning}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <FaNetworkWired className="text-sm" />
                  {isRunning ? 'Running...' : 'Start DFS'}
                </Button>
                <Button
                  onClick={reset}
                  disabled={isRunning}
                  variant="secondary"
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <FaUndo className="text-sm" />
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
                <p className="text-sm text-gray-500">Stack Size</p>
                <p className="text-2xl font-semibold text-gray-600">{stack.length}</p>
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
              <p className="text-sm text-gray-500 mb-1">Stack:</p>
              <div className="flex flex-wrap gap-2">
                {stack.map((node, i) => (
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
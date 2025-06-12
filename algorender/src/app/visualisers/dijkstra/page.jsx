'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialGraph = {
  nodes: [0, 1, 2, 3, 4, 5],
  edges: [
    { from: 0, to: 1, weight: 7 },
    { from: 0, to: 2, weight: 9 },
    { from: 0, to: 5, weight: 14 },
    { from: 1, to: 2, weight: 10 },
    { from: 1, to: 3, weight: 15 },
    { from: 2, to: 3, weight: 11 },
    { from: 2, to: 5, weight: 2 },
    { from: 3, to: 4, weight: 6 },
    { from: 4, to: 5, weight: 9 }
  ]
};

function getAdjList(nodes, edges) {
  const adj = {};
  nodes.forEach(n => (adj[n] = []));
  edges.forEach(({ from, to, weight }) => {
    adj[from].push({ node: to, weight });
    adj[to].push({ node: from, weight });
  });
  return adj;
}

export default function DijkstraVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [startNode, setStartNode] = useState(0);
  const [distances, setDistances] = useState({});
  const [visited, setVisited] = useState([]);
  const [queue, setQueue] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const adjList = getAdjList(graph.nodes, graph.edges);

  const reset = () => {
    setDistances({});
    setVisited([]);
    setQueue([]);
    setIsRunning(false);
  };

  const dijkstra = async () => {
    setIsRunning(true);
    const dist = {};
    const prev = {};
    const visitedOrder = [];
    graph.nodes.forEach(n => (dist[n] = Infinity));
    dist[startNode] = 0;
    const q = [...graph.nodes];
    setDistances({ ...dist });
    setVisited([]);
    setQueue([...q]);
    while (q.length > 0) {
      q.sort((a, b) => dist[a] - dist[b]);
      const u = q.shift();
      if (dist[u] === Infinity) break;
      visitedOrder.push(u);
      setVisited([...visitedOrder]);
      setQueue([...q]);
      setDistances({ ...dist });
      await new Promise(res => setTimeout(res, speed));
      for (const { node: v, weight } of adjList[u]) {
        if (q.includes(v)) {
          if (dist[u] + weight < dist[v]) {
            dist[v] = dist[u] + weight;
            prev[v] = u;
            setDistances({ ...dist });
            await new Promise(res => setTimeout(res, speed / 2));
          }
        }
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Dijkstra's Algorithm Visualiser"
      description="Visualise Dijkstra's shortest path algorithm step by step."
      timeComplexity={{ best: 'O((V + E) log V)', average: 'O((V + E) log V)', worst: 'O((V + E) log V)' }}
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
              {graph.edges.map(({ from, to, weight }, i) => (
                <span key={i} className="text-xs text-gray-500">({from}, {to}, w={weight})</span>
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
                <span>Finds shortest path from start node to all others</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses a priority queue (min-heap) for efficiency</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Updates distances as shorter paths are found</span>
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
                  onClick={dijkstra}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? 'Running...' : 'Start Dijkstra'}
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
            <h3 className="text-lg font-medium text-gray-900 mb-4">Distance Table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-center">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-xs text-gray-500">Node</th>
                    {graph.nodes.map((node) => (
                      <th key={node} className="px-2 py-1 text-xs text-gray-500">{node}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1 text-xs text-gray-500 font-semibold">Distance</td>
                    {graph.nodes.map((node) => (
                      <td key={node} className="px-2 py-1 text-sm font-semibold text-blue-700">
                        {distances[node] === undefined || distances[node] === Infinity ? '∞' : distances[node]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
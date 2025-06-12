'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialGraph = {
  nodes: [0, 1, 2, 3, 4, 5],
  edges: [
    { from: 0, to: 1, weight: 6 },
    { from: 0, to: 2, weight: 7 },
    { from: 1, to: 2, weight: 8 },
    { from: 1, to: 3, weight: 5 },
    { from: 1, to: 4, weight: -4 },
    { from: 2, to: 3, weight: -3 },
    { from: 2, to: 4, weight: 9 },
    { from: 3, to: 1, weight: -2 },
    { from: 4, to: 3, weight: 7 },
    { from: 4, to: 5, weight: 2 },
    { from: 5, to: 3, weight: 7 }
  ]
};

export default function BellmanFordVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [startNode, setStartNode] = useState(0);
  const [distances, setDistances] = useState({});
  const [iteration, setIteration] = useState(0);
  const [updatedEdge, setUpdatedEdge] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const reset = () => {
    setDistances({});
    setIteration(0);
    setUpdatedEdge(null);
    setIsRunning(false);
  };

  const bellmanFord = async () => {
    setIsRunning(true);
    const dist = {};
    graph.nodes.forEach(n => (dist[n] = Infinity));
    dist[startNode] = 0;
    setDistances({ ...dist });
    for (let i = 1; i < graph.nodes.length; i++) {
      setIteration(i);
      let updated = false;
      for (const { from, to, weight } of graph.edges) {
        setUpdatedEdge([from, to]);
        await new Promise(res => setTimeout(res, speed));
        if (dist[from] !== Infinity && dist[from] + weight < dist[to]) {
          dist[to] = dist[from] + weight;
          setDistances({ ...dist });
          updated = true;
        }
      }
      if (!updated) break;
    }
    setUpdatedEdge(null);
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Bellman-Ford Algorithm Visualiser"
      description="Visualise the Bellman-Ford shortest path algorithm step by step."
      timeComplexity={{ best: 'O(VE)', average: 'O(VE)', worst: 'O(VE)' }}
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
                  className={`w-12 h-12 flex items-center justify-center rounded-full border-2 text-lg font-bold transition-all duration-300 bg-white border-gray-300 text-gray-700`}
                >
                  {node}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {graph.edges.map(({ from, to, weight }, i) => (
                <span key={i} className={`text-xs px-2 py-1 rounded ${updatedEdge && updatedEdge[0] === from && updatedEdge[1] === to ? 'bg-blue-200 text-blue-800' : 'text-gray-500'}`}>
                  ({from}, {to}, w={weight})
                </span>
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
                <span>Handles negative edge weights</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Relaxes all edges V-1 times</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Detects negative cycles (not shown here)</span>
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
                  onClick={bellmanFord}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? 'Running...' : 'Start Bellman-Ford'}
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
            <div className="mt-4 text-sm text-gray-500">Iteration: {iteration}</div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
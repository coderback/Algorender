'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialNodes = [0, 1, 2, 3];
const initialMatrix = [
  [0, 3, Infinity, 7],
  [8, 0, 2, Infinity],
  [5, Infinity, 0, 1],
  [2, Infinity, Infinity, 0]
];

export default function FloydWarshallVisualiser() {
  const [nodes, setNodes] = useState(initialNodes);
  const [matrix, setMatrix] = useState(initialMatrix.map(row => [...row]));
  const [k, setK] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const reset = () => {
    setMatrix(initialMatrix.map(row => [...row]));
    setK(0);
    setIsRunning(false);
  };

  const floydWarshall = async () => {
    setIsRunning(true);
    let dist = matrix.map(row => [...row]);
    for (let step = k; step < nodes.length; step++) {
      setK(step);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
          if (dist[i][step] + dist[step][j] < dist[i][j]) {
            dist[i][j] = dist[i][step] + dist[step][j];
            setMatrix(dist.map(row => [...row]));
            await new Promise(res => setTimeout(res, speed));
          }
        }
      }
      await new Promise(res => setTimeout(res, speed));
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Floyd-Warshall Algorithm Visualiser"
      description="Visualise the Floyd-Warshall all-pairs shortest path algorithm step by step."
      timeComplexity={{ best: 'O(V^3)', average: 'O(V^3)', worst: 'O(V^3)' }}
      spaceComplexity="O(V^2)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Distance Matrix</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-center">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-xs text-gray-500"> </th>
                    {nodes.map((node) => (
                      <th key={node} className="px-2 py-1 text-xs text-gray-500">{node}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-xs text-gray-500 font-semibold">{nodes[i]}</td>
                      {row.map((val, j) => (
                        <td key={j} className={`px-2 py-1 text-sm font-semibold ${i === k || j === k ? 'bg-blue-100 text-blue-700' : 'text-gray-700'}`}>
                          {val === Infinity ? '∞' : val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Finds shortest paths between all pairs of nodes</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Updates the distance matrix for each intermediate node</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Dynamic programming approach</span>
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
                  onClick={floydWarshall}
                  disabled={isRunning || k >= nodes.length}
                  className="flex-1"
                >
                  {isRunning ? 'Running...' : 'Start Floyd-Warshall'}
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
                <p className="text-sm text-gray-500">Nodes</p>
                <p className="text-2xl font-semibold text-blue-600">{nodes.length}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Current k</p>
                <p className="text-2xl font-semibold text-gray-600">{k}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
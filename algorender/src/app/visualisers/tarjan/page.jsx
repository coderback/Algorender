"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialGraph = {
  nodes: [0, 1, 2, 3, 4],
  edges: [
    [0, 1], [1, 2], [2, 0], [1, 3], [3, 4]
  ]
};

function getAdjList(nodes, edges) {
  const adj = {};
  nodes.forEach(n => (adj[n] = []));
  edges.forEach(([u, v]) => {
    adj[u].push(v);
  });
  return adj;
}

export default function TarjanVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [sccs, setSccs] = useState([]);
  const [visited, setVisited] = useState([]);
  const [indexMap, setIndexMap] = useState({});
  const [lowLinkMap, setLowLinkMap] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const adjList = getAdjList(graph.nodes, graph.edges);

  const reset = () => {
    setSccs([]);
    setVisited([]);
    setIndexMap({});
    setLowLinkMap({});
    setIsRunning(false);
  };

  const tarjan = async () => {
    setIsRunning(true);
    let index = 0;
    const indexMap = {};
    const lowLinkMap = {};
    const stack = [];
    const onStack = {};
    const sccs = [];
    async function strongConnect(v) {
      indexMap[v] = index;
      lowLinkMap[v] = index;
      index++;
      stack.push(v);
      onStack[v] = true;
      setIndexMap({ ...indexMap });
      setLowLinkMap({ ...lowLinkMap });
      setVisited([...stack]);
      await new Promise(res => setTimeout(res, speed));
      for (const w of adjList[v]) {
        if (indexMap[w] === undefined) {
          await strongConnect(w);
          lowLinkMap[v] = Math.min(lowLinkMap[v], lowLinkMap[w]);
          setLowLinkMap({ ...lowLinkMap });
        } else if (onStack[w]) {
          lowLinkMap[v] = Math.min(lowLinkMap[v], indexMap[w]);
          setLowLinkMap({ ...lowLinkMap });
        }
      }
      if (lowLinkMap[v] === indexMap[v]) {
        const scc = [];
        let w;
        do {
          w = stack.pop();
          onStack[w] = false;
          scc.push(w);
        } while (w !== v);
        sccs.push([...scc]);
        setSccs([...sccs]);
        await new Promise(res => setTimeout(res, speed / 2));
      }
    }
    for (const v of graph.nodes) {
      if (indexMap[v] === undefined) {
        await strongConnect(v);
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Tarjan's Algorithm Visualiser"
      description="Visualise Tarjan's algorithm for finding strongly connected components (SCCs) in a directed graph."
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
                      : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  {node}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {graph.edges.map(([u, v], i) => (
                <span key={i} className="text-xs text-gray-500">({u} → {v})</span>
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
                <span>Performs DFS and tracks discovery and low-link values</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Finds all strongly connected components (SCCs)</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Efficiently finds SCCs in a single DFS pass</span>
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
                  onClick={tarjan}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? "Running..." : "Start Tarjan's"}
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
                <p className="text-sm text-gray-500">SCC Count</p>
                <p className="text-2xl font-semibold text-blue-600">{sccs.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">SCCs:</p>
              <div className="flex flex-wrap gap-2">
                {sccs.map((scc, i) => (
                  <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                    [{scc.join(', ')}]
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
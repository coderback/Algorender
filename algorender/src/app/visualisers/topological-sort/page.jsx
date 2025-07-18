"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import {
  ControlsSection,
  SpeedControl,
  GraphVisualizerButtonGrid,
  StatisticsDisplay,
  ButtonPresets
} from '@/components/VisualizerControls';

const initialGraph = {
  nodes: [0, 1, 2, 3, 4, 5],
  edges: [
    [5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]
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

export default function TopologicalSortVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [order, setOrder] = useState([]);
  const [visited, setVisited] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const adjList = getAdjList(graph.nodes, graph.edges);

  const reset = () => {
    setOrder([]);
    setVisited([]);
    setIsRunning(false);
  };

  const topologicalSort = async () => {
    setIsRunning(true);
    const visitedSet = new Set();
    const stack = [];
    async function dfs(node) {
      visitedSet.add(node);
      setVisited([...visitedSet]);
      await new Promise(res => setTimeout(res, speed));
      for (const neighbor of adjList[node]) {
        if (!visitedSet.has(neighbor)) {
          await dfs(neighbor);
        }
      }
      stack.push(node);
      setOrder([...stack].reverse());
      await new Promise(res => setTimeout(res, speed / 2));
    }
    for (const node of graph.nodes) {
      if (!visitedSet.has(node)) {
        await dfs(node);
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Topological Sort Visualiser"
      description="Visualise Topological Sort for Directed Acyclic Graphs (DAGs) step by step."
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
                <span>Performs DFS and adds nodes to the order after visiting all descendants</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Works only for Directed Acyclic Graphs (DAGs)</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Useful for scheduling and dependency resolution</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ControlsSection>
            <SpeedControl
              speed={speed}
              onSpeedChange={handleSpeedChange}
              disabled={isRunning}
            />
            
            <GraphVisualizerButtonGrid
              primaryAction={ButtonPresets.graph.primary(topologicalSort, isRunning, 'Topological Sort')}
              resetAction={ButtonPresets.graph.reset(reset)}
              isRunning={isRunning}
              showStartNodeSelector={false}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Order Length', value: order.length, color: 'text-blue-600' },
              { label: 'Visited Nodes', value: visited.length, color: 'text-green-600' },
              { label: 'Progress', value: `${Math.round((order.length / graph.nodes.length) * 100)}%`, color: 'text-gray-900' }
            ]}
            columns={3}
          />
          
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Topological Order</h3>
            <div className="flex flex-wrap gap-2">
              {order.length > 0 ? (
                order.map((node, i) => (
                  <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                    {i + 1}: {node}
                  </span>
                ))
              ) : (
                <span className="text-gray-500 text-sm">No topological order yet</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
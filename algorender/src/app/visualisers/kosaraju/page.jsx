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
  nodes: [0, 1, 2, 3, 4],
  edges: [
    [0, 1], [1, 2], [2, 0], [1, 3], [3, 4]
  ]
};

function getAdjList(nodes, edges, reverse = false) {
  const adj = {};
  nodes.forEach(n => (adj[n] = []));
  edges.forEach(([u, v]) => {
    if (reverse) adj[v].push(u);
    else adj[u].push(v);
  });
  return adj;
}

export default function KosarajuVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [sccs, setSccs] = useState([]);
  const [visited, setVisited] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const adjList = getAdjList(graph.nodes, graph.edges);
  const revAdjList = getAdjList(graph.nodes, graph.edges, true);

  const reset = () => {
    setSccs([]);
    setVisited([]);
    setIsRunning(false);
  };

  const kosaraju = async () => {
    setIsRunning(true);
    const visitedSet = new Set();
    const stack = [];
    async function dfs1(node) {
      visitedSet.add(node);
      setVisited([...visitedSet]);
      await new Promise(res => setTimeout(res, speed));
      for (const neighbor of adjList[node]) {
        if (!visitedSet.has(neighbor)) {
          await dfs1(neighbor);
        }
      }
      stack.push(node);
    }
    for (const node of graph.nodes) {
      if (!visitedSet.has(node)) {
        await dfs1(node);
      }
    }
    const visitedSet2 = new Set();
    const sccs = [];
    async function dfs2(node, scc) {
      visitedSet2.add(node);
      scc.push(node);
      setVisited([...visitedSet2]);
      await new Promise(res => setTimeout(res, speed));
      for (const neighbor of revAdjList[node]) {
        if (!visitedSet2.has(neighbor)) {
          await dfs2(neighbor, scc);
        }
      }
    }
    while (stack.length > 0) {
      const node = stack.pop();
      if (!visitedSet2.has(node)) {
        const scc = [];
        await dfs2(node, scc);
        sccs.push([...scc]);
        setSccs([...sccs]);
        await new Promise(res => setTimeout(res, speed / 2));
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Kosaraju's Algorithm Visualiser"
      description="Visualise Kosaraju's algorithm for finding strongly connected components (SCCs) in a directed graph."
      timeComplexity={{ best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' }}
      spaceComplexity="O(V + E)"
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
                <span>Performs two DFS passes: one on the original graph, one on the reversed graph</span>
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
                <span>Useful for analyzing directed graphs</span>
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
              primaryAction={ButtonPresets.graph.primary(kosaraju, isRunning, "Kosaraju's")}
              resetAction={ButtonPresets.graph.reset(reset)}
              isRunning={isRunning}
              showStartNodeSelector={false}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'SCC Count', value: sccs.length, color: 'text-blue-600' },
              { label: 'Visited Nodes', value: visited.length, color: 'text-green-600' }
            ]}
          />
          
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Strongly Connected Components</h3>
            <div className="flex flex-wrap gap-2">
              {sccs.length > 0 ? (
                sccs.map((scc, i) => (
                  <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                    [{scc.join(', ')}]
                  </span>
                ))
              ) : (
                <span className="text-gray-500 text-sm">No SCCs found yet</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
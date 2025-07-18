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
          <ControlsSection>
            <SpeedControl
              speed={speed}
              onSpeedChange={handleSpeedChange}
              disabled={isRunning}
            />
            
            <GraphVisualizerButtonGrid
              primaryAction={ButtonPresets.graph.primary(tarjan, isRunning, "Tarjan's")}
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
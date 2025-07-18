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

function find(parent, i) {
  if (parent[i] !== i) parent[i] = find(parent, parent[i]);
  return parent[i];
}

function union(parent, rank, x, y) {
  const xroot = find(parent, x);
  const yroot = find(parent, y);
  if (rank[xroot] < rank[yroot]) parent[xroot] = yroot;
  else if (rank[xroot] > rank[yroot]) parent[yroot] = xroot;
  else {
    parent[yroot] = xroot;
    rank[xroot]++;
  }
}

export default function KruskalVisualiser() {
  const [graph, setGraph] = useState(initialGraph);
  const [mstEdges, setMstEdges] = useState([]);
  const [edgeIndex, setEdgeIndex] = useState(0);
  const [parent, setParent] = useState([]);
  const [rank, setRank] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);

  const reset = () => {
    setMstEdges([]);
    setEdgeIndex(0);
    setParent([]);
    setRank([]);
    setIsRunning(false);
  };

  const kruskal = async () => {
    setIsRunning(true);
    const edges = [...graph.edges].sort((a, b) => a.weight - b.weight);
    const parent = Array(graph.nodes.length).fill(0).map((_, i) => i);
    const rank = Array(graph.nodes.length).fill(0);
    const mst = [];
    let i = 0;
    let e = 0;
    setParent([...parent]);
    setRank([...rank]);
    while (e < graph.nodes.length - 1 && i < edges.length) {
      const { from, to, weight } = edges[i++];
      const x = find(parent, from);
      const y = find(parent, to);
      if (x !== y) {
        mst.push({ from, to, weight });
        union(parent, rank, x, y);
        e++;
        setMstEdges([...mst]);
        setParent([...parent]);
        setRank([...rank]);
        await new Promise(res => setTimeout(res, speed));
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Kruskal's Algorithm Visualiser"
      description="Visualise Kruskal's Minimum Spanning Tree algorithm step by step."
      timeComplexity={{ best: 'O(E log E)', average: 'O(E log E)', worst: 'O(E log E)' }}
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
                <span key={i} className={`text-xs px-2 py-1 rounded ${mstEdges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from)) ? 'bg-green-200 text-green-800' : 'text-gray-500'}`}>
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
                <span>Sorts all edges by weight and adds the smallest edge that doesn&apos;t form a cycle</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses Union-Find to detect cycles</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Builds the MST by connecting components</span>
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
              primaryAction={ButtonPresets.graph.primary(kruskal, isRunning, "Kruskal's")}
              resetAction={ButtonPresets.graph.reset(reset)}
              isRunning={isRunning}
              showStartNodeSelector={false}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'MST Edges', value: mstEdges.length, color: 'text-green-600' },
              { label: 'Total Edges', value: graph.edges.length, color: 'text-blue-600' },
              { label: 'Progress', value: `${Math.round((mstEdges.length / (graph.nodes.length - 1)) * 100)}%`, color: 'text-gray-900' }
            ]}
            columns={3}
          />

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">MST Edges</h3>
            <div className="flex flex-wrap gap-2">
              {mstEdges.length > 0 ? (
                mstEdges.map((edge, i) => (
                  <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                    ({edge.from}, {edge.to}, w={edge.weight})
                  </span>
                ))
              ) : (
                <span className="text-gray-500 text-sm">No edges in MST yet</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
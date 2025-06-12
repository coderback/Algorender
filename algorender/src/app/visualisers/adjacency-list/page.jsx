'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function AdjacencyListVisualiser() {
  const [graph, setGraph] = useState({
    nodes: [1, 2, 3, 4, 5],
    edges: [
      [2, 3],    // Node 1's neighbors
      [1, 4],    // Node 2's neighbors
      [1, 4, 5], // Node 3's neighbors
      [2, 3, 5], // Node 4's neighbors
      [3, 4]     // Node 5's neighbors
    ]
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [fromNode, setFromNode] = useState('');
  const [toNode, setToNode] = useState('');
  const [searchPath, setSearchPath] = useState([]);

  const addNode = () => {
    const newId = graph.nodes.length + 1;
    setGraph(prev => ({
      nodes: [...prev.nodes, newId],
      edges: [...prev.edges, []]
    }));
  };

  const addEdge = () => {
    if (!fromNode || !toNode) return;
    const from = parseInt(fromNode);
    const to = parseInt(toNode);

    if (from === to) return;
    if (from < 1 || from > graph.nodes.length || to < 1 || to > graph.nodes.length) return;
    if (graph.edges[from - 1].includes(to)) return;

    setGraph(prev => ({
      ...prev,
      edges: prev.edges.map((neighbors, index) => {
        if (index === from - 1) {
          return [...neighbors, to].sort((a, b) => a - b);
        }
        if (index === to - 1) {
          return [...neighbors, from].sort((a, b) => a - b);
        }
        return neighbors;
      })
    }));
    setFromNode('');
    setToNode('');
  };

  const removeNode = (nodeId) => {
    setGraph(prev => ({
      nodes: prev.nodes.filter(id => id !== nodeId),
      edges: prev.edges
        .filter((_, index) => index !== nodeId - 1)
        .map(neighbors => neighbors
          .filter(n => n !== nodeId)
          .map(n => n > nodeId ? n - 1 : n)
        )
    }));
    setSelectedNode(null);
  };

  const removeEdge = (from, to) => {
    setGraph(prev => ({
      ...prev,
      edges: prev.edges.map((neighbors, index) => {
        if (index === from - 1) {
          return neighbors.filter(n => n !== to);
        }
        if (index === to - 1) {
          return neighbors.filter(n => n !== from);
        }
        return neighbors;
      })
    }));
  };

  const bfs = (startId) => {
    const visited = new Set();
    const queue = [startId];
    const path = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = graph.edges[current - 1];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
          path.push(neighbor);
        }
      }
    }

    setSearchPath(path);
    setTimeout(() => setSearchPath([]), 3000);
  };

  const reset = () => {
    setGraph({
      nodes: [1, 2, 3, 4, 5],
      edges: [
        [2, 3],    // Node 1's neighbors
        [1, 4],    // Node 2's neighbors
        [1, 4, 5], // Node 3's neighbors
        [2, 3, 5], // Node 4's neighbors
        [3, 4]     // Node 5's neighbors
      ]
    });
    setSelectedNode(null);
    setFromNode('');
    setToNode('');
    setSearchPath([]);
  };

  return (
    <Layout
      title="Adjacency List Visualiser"
      description="Visualise graph representation using adjacency lists."
      timeComplexity={{ best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' }}
      spaceComplexity="O(V + E)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Adjacency List</h2>
            <div className="space-y-4">
              {graph.nodes.map((node, index) => (
                <div
                  key={node}
                  className={`p-4 rounded-lg border transition-all ${
                    searchPath.includes(node)
                      ? 'bg-blue-100 border-blue-500'
                      : selectedNode === node
                      ? 'bg-gray-100 border-gray-300'
                      : 'bg-white border-gray-200'
                  }`}
                  onClick={() => setSelectedNode(node)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                      {node}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">Neighbors:</div>
                      <div className="flex flex-wrap gap-2">
                        {graph.edges[index].map(neighbor => (
                          <div
                            key={neighbor}
                            className="px-2 py-1 bg-gray-100 rounded text-sm"
                          >
                            {neighbor}
                          </div>
                        ))}
                        {graph.edges[index].length === 0 && (
                          <span className="text-gray-400 text-sm">No neighbors</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
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
                <span>Add Node: O(1) - Create a new vertex</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Add Edge: O(1) - Connect two vertices</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>BFS: O(V + E) - Visit all connected vertices</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={addNode} variant="primary" fullWidth>
                  Add Node
                </Button>
                <Button onClick={reset} variant="secondary" fullWidth>
                  Reset
                </Button>
              </div>

              <div className="space-y-3">
                <InputControl
                  label="From Node"
                  type="number"
                  value={fromNode}
                  onChange={(e) => setFromNode(e.target.value)}
                  placeholder="Enter node ID"
                />
                <InputControl
                  label="To Node"
                  type="number"
                  value={toNode}
                  onChange={(e) => setToNode(e.target.value)}
                  placeholder="Enter node ID"
                />
                <Button onClick={addEdge} variant="primary" fullWidth>
                  Add Edge
                </Button>
              </div>

              {selectedNode && (
                <div className="space-y-3">
                  <Button
                    onClick={() => removeNode(selectedNode)}
                    variant="secondary"
                    fullWidth
                  >
                    Remove Node {selectedNode}
                  </Button>
                  <Button
                    onClick={() => bfs(selectedNode)}
                    variant="primary"
                    fullWidth
                  >
                    BFS from Node {selectedNode}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Nodes</h4>
                <p className="text-2xl font-semibold text-blue-600">{graph.nodes.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Edges</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {graph.edges.reduce((sum, neighbors) => sum + neighbors.length, 0) / 2}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Density</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {(
                    (graph.edges.reduce((sum, neighbors) => sum + neighbors.length, 0) / 2) /
                    (graph.nodes.length * (graph.nodes.length - 1))
                  ).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function AdjacencyMatrixVisualiser() {
  const [graph, setGraph] = useState({
    nodes: [1, 2, 3, 4, 5],
    matrix: [
      [0, 1, 1, 0, 0], // Node 1's connections
      [1, 0, 0, 1, 0], // Node 2's connections
      [1, 0, 0, 1, 1], // Node 3's connections
      [0, 1, 1, 0, 1], // Node 4's connections
      [0, 0, 1, 1, 0]  // Node 5's connections
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
      matrix: [
        ...prev.matrix.map(row => [...row, 0]),
        Array(prev.nodes.length + 1).fill(0)
      ]
    }));
  };

  const addEdge = () => {
    if (!fromNode || !toNode) return;
    const from = parseInt(fromNode);
    const to = parseInt(toNode);

    if (from === to) return;
    if (from < 1 || from > graph.nodes.length || to < 1 || to > graph.nodes.length) return;
    if (graph.matrix[from - 1][to - 1] === 1) return;

    setGraph(prev => ({
      ...prev,
      matrix: prev.matrix.map((row, i) =>
        row.map((cell, j) => {
          if ((i === from - 1 && j === to - 1) || (i === to - 1 && j === from - 1)) {
            return 1;
          }
          return cell;
        })
      )
    }));
    setFromNode('');
    setToNode('');
  };

  const removeNode = (nodeId) => {
    setGraph(prev => ({
      nodes: prev.nodes.filter(id => id !== nodeId),
      matrix: prev.matrix
        .filter((_, index) => index !== nodeId - 1)
        .map(row => row.filter((_, index) => index !== nodeId - 1))
    }));
    setSelectedNode(null);
  };

  const removeEdge = (from, to) => {
    setGraph(prev => ({
      ...prev,
      matrix: prev.matrix.map((row, i) =>
        row.map((cell, j) => {
          if ((i === from - 1 && j === to - 1) || (i === to - 1 && j === from - 1)) {
            return 0;
          }
          return cell;
        })
      )
    }));
  };

  const bfs = (startId) => {
    const visited = new Set();
    const queue = [startId];
    const path = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = graph.matrix[current - 1]
        .map((connected, index) => connected ? index + 1 : null)
        .filter(Boolean);

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
      matrix: [
        [0, 1, 1, 0, 0], // Node 1's connections
        [1, 0, 0, 1, 0], // Node 2's connections
        [1, 0, 0, 1, 1], // Node 3's connections
        [0, 1, 1, 0, 1], // Node 4's connections
        [0, 0, 1, 1, 0]  // Node 5's connections
      ]
    });
    setSelectedNode(null);
    setFromNode('');
    setToNode('');
    setSearchPath([]);
  };

  return (
    <Layout
      title="Adjacency Matrix Visualiser"
      description="Visualise graph representation using adjacency matrices."
      timeComplexity={{ best: 'O(1)', average: 'O(V²)', worst: 'O(V²)' }}
      spaceComplexity="O(V²)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Adjacency Matrix</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="w-12 h-12"></th>
                    {graph.nodes.map(node => (
                      <th
                        key={node}
                        className={`w-12 h-12 text-center font-semibold ${
                          searchPath.includes(node)
                            ? 'bg-blue-100 text-blue-700'
                            : selectedNode === node
                            ? 'bg-gray-100 text-gray-700'
                            : 'text-gray-600'
                        }`}
                        onClick={() => setSelectedNode(node)}
                      >
                        {node}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {graph.matrix.map((row, i) => (
                    <tr key={i}>
                      <td
                        className={`w-12 h-12 text-center font-semibold ${
                          searchPath.includes(i + 1)
                            ? 'bg-blue-100 text-blue-700'
                            : selectedNode === i + 1
                            ? 'bg-gray-100 text-gray-700'
                            : 'text-gray-600'
                        }`}
                        onClick={() => setSelectedNode(i + 1)}
                      >
                        {i + 1}
                      </td>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`w-12 h-12 text-center border ${
                            cell === 1
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-white text-gray-400'
                          } ${
                            (searchPath.includes(i + 1) && searchPath.includes(j + 1)) ||
                            (selectedNode === i + 1 && selectedNode === j + 1)
                              ? 'ring-2 ring-blue-500'
                              : ''
                          }`}
                          onClick={() => {
                            if (cell === 1) {
                              removeEdge(i + 1, j + 1);
                            } else if (i !== j) {
                              setFromNode(String(i + 1));
                              setToNode(String(j + 1));
                              addEdge();
                            }
                          }}
                        >
                          {cell}
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
                <span>Add Node: O(V) - Add new row and column</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Add Edge: O(1) - Update matrix cell</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>BFS: O(V²) - Check all possible edges</span>
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
                  {graph.matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0) / 2}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Density</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {(
                    (graph.matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0) / 2) /
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
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  EnhancedDataStructureButtonGrid, 
  StatisticsDisplay, 
  ErrorDisplay,
  SuccessDisplay,
  ButtonPresets 
} from '@/components/VisualizerControls';

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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const addNode = () => {
    if (graph.nodes.length >= 10) {
      setError('Maximum 10 nodes allowed');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const newId = graph.nodes.length + 1;
    setGraph(prev => ({
      nodes: [...prev.nodes, newId],
      edges: [...prev.edges, []]
    }));
    setSuccess(`Node ${newId} added successfully`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const addEdge = () => {
    if (!fromNode.trim() || !toNode.trim()) {
      setError('Please enter both node IDs');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const from = parseInt(fromNode);
    const to = parseInt(toNode);

    if (isNaN(from) || isNaN(to)) {
      setError('Please enter valid numbers');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (from === to) {
      setError('Cannot create edge to same node');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (from < 1 || from > graph.nodes.length || to < 1 || to > graph.nodes.length) {
      setError('Node IDs must be between 1 and ' + graph.nodes.length);
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (graph.edges[from - 1].includes(to)) {
      setError('Edge already exists between these nodes');
      setTimeout(() => setError(''), 3000);
      return;
    }

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
    setSuccess(`Edge added: ${from} ↔ ${to}`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const removeNode = (nodeId) => {
    if (graph.nodes.length <= 1) {
      setError('Cannot remove the last node');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const removedEdges = graph.edges[nodeId - 1].length;
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
    setSuccess(`Node ${nodeId} and ${removedEdges} connections removed`);
    setTimeout(() => setSuccess(''), 2000);
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
    setSuccess(`BFS from node ${startId}: visited ${path.length} nodes`);
    setTimeout(() => {
      setSearchPath([]);
      setSuccess('');
    }, 3000);
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
    setError('');
    setSuccess('');
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
                            className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-900 font-medium"
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
          <ErrorDisplay error={error} />
          <SuccessDisplay message={success} />
          
          <ControlsSection title="Adjacency List Operations">
            <EnhancedDataStructureButtonGrid
              operations={[
                ButtonPresets.dataStructure.insert(addNode, graph.nodes.length >= 10),
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Add Edge</h4>
              <div className="grid grid-cols-2 gap-3">
                <InputControl
                  label="From Node"
                  type="number"
                  value={fromNode}
                  onChange={(e) => setFromNode(e.target.value)}
                  placeholder="Node ID"
                />
                <InputControl
                  label="To Node"
                  type="number"
                  value={toNode}
                  onChange={(e) => setToNode(e.target.value)}
                  placeholder="Node ID"
                />
              </div>
              <EnhancedDataStructureButtonGrid
                operations={[
                  {
                    onClick: addEdge,
                    icon: ButtonPresets.dataStructure.insert().icon,
                    label: 'Add Edge',
                    disabled: !fromNode.trim() || !toNode.trim(),
                    variant: 'primary'
                  }
                ]}
              />
            </div>

            {selectedNode && (
              <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-sm font-medium text-blue-700">Selected Node {selectedNode}</h4>
                <div className="text-xs text-blue-600 mb-2">
                  Neighbors: {graph.edges[selectedNode - 1].length > 0 ? 
                    graph.edges[selectedNode - 1].join(', ') : 'None'}
                </div>
                <EnhancedDataStructureButtonGrid
                  operations={[
                    ButtonPresets.dataStructure.remove(() => removeNode(selectedNode), graph.nodes.length <= 1),
                    {
                      onClick: () => bfs(selectedNode),
                      icon: ButtonPresets.dataStructure.search().icon,
                      label: 'Run BFS',
                      variant: 'secondary'
                    }
                  ]}
                />
              </div>
            )}
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Nodes', value: graph.nodes.length, color: 'text-blue-600' },
              { label: 'Edges', value: Math.floor(graph.edges.reduce((sum, neighbors) => sum + neighbors.length, 0) / 2), color: 'text-green-600' },
              { 
                label: 'Avg Degree', 
                value: graph.nodes.length > 0 ? 
                  (graph.edges.reduce((sum, neighbors) => sum + neighbors.length, 0) / graph.nodes.length).toFixed(1) : 
                  '0.0', 
                color: 'text-gray-900' 
              },
              { 
                label: 'Connected', 
                value: searchPath.length > 0 ? `${searchPath.length} nodes` : 'Select & BFS', 
                color: 'text-purple-600' 
              }
            ]}
            columns={2}
          />
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function WeightedGraphVisualiser() {
  const [graph, setGraph] = useState({
    nodes: [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 300, y: 100 },
      { id: 3, x: 200, y: 200 },
      { id: 4, x: 400, y: 200 },
      { id: 5, x: 300, y: 300 }
    ],
    edges: [
      { from: 1, to: 2, weight: 5 },
      { from: 1, to: 3, weight: 3 },
      { from: 2, to: 4, weight: 2 },
      { from: 3, to: 4, weight: 4 },
      { from: 3, to: 5, weight: 6 },
      { from: 4, to: 5, weight: 1 }
    ]
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [fromNode, setFromNode] = useState('');
  const [toNode, setToNode] = useState('');
  const [weight, setWeight] = useState('');
  const [shortestPath, setShortestPath] = useState([]);
  const canvasRef = useRef(null);

  useEffect(() => {
    drawGraph();
  }, [graph, selectedNode, selectedEdge, shortestPath]);

  const drawGraph = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    graph.edges.forEach(edge => {
      const fromNode = graph.nodes.find(n => n.id === edge.from);
      const toNode = graph.nodes.find(n => n.id === edge.to);
      
      // Draw line
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.strokeStyle = selectedEdge === edge ? '#3B82F6' : '#E5E7EB';
      ctx.lineWidth = selectedEdge === edge ? 3 : 2;
      ctx.stroke();

      // Draw weight
      const midX = (fromNode.x + toNode.x) / 2;
      const midY = (fromNode.y + toNode.y) / 2;
      ctx.fillStyle = '#6B7280';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(edge.weight.toString(), midX, midY);
    });

    // Draw nodes
    graph.nodes.forEach(node => {
      const isInPath = shortestPath.includes(node.id);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = isInPath ? '#93C5FD' : selectedNode === node ? '#3B82F6' : '#E5E7EB';
      ctx.fill();
      ctx.strokeStyle = isInPath ? '#3B82F6' : '#9CA3AF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw node ID
      ctx.fillStyle = '#1F2937';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.id.toString(), node.x, node.y);
    });
  };

  const addNode = () => {
    const newId = Math.max(...graph.nodes.map(n => n.id)) + 1;
    const newNode = {
      id: newId,
      x: Math.random() * 400 + 50,
      y: Math.random() * 400 + 50
    };
    setGraph(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  const addEdge = () => {
    if (!fromNode || !toNode || !weight) return;
    const from = parseInt(fromNode);
    const to = parseInt(toNode);
    const weightValue = parseInt(weight);

    if (from === to) return;
    if (graph.edges.some(e => e.from === from && e.to === to)) return;

    setGraph(prev => ({
      ...prev,
      edges: [...prev.edges, { from, to, weight: weightValue }]
    }));
    setFromNode('');
    setToNode('');
    setWeight('');
  };

  const removeNode = (nodeId) => {
    setGraph(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
    }));
    setSelectedNode(null);
  };

  const removeEdge = (from, to) => {
    setGraph(prev => ({
      ...prev,
      edges: prev.edges.filter(e => !(e.from === from && e.to === to))
    }));
    setSelectedEdge(null);
  };

  const dijkstra = (startId, endId) => {
    const distances = {};
    const previous = {};
    const unvisited = new Set(graph.nodes.map(n => n.id));
    
    // Initialize distances
    graph.nodes.forEach(node => {
      distances[node.id] = node.id === startId ? 0 : Infinity;
    });

    while (unvisited.size > 0) {
      // Find unvisited node with smallest distance
      let current = null;
      let minDistance = Infinity;
      for (const nodeId of unvisited) {
        if (distances[nodeId] < minDistance) {
          minDistance = distances[nodeId];
          current = nodeId;
        }
      }

      if (current === null || current === endId) break;
      unvisited.delete(current);

      // Update distances to neighbors
      const neighbors = graph.edges
        .filter(e => e.from === current || e.to === current)
        .map(e => ({
          id: e.from === current ? e.to : e.from,
          weight: e.weight
        }));

      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.id)) continue;
        
        const distance = distances[current] + neighbor.weight;
        if (distance < distances[neighbor.id]) {
          distances[neighbor.id] = distance;
          previous[neighbor.id] = current;
        }
      }
    }

    // Reconstruct path
    const path = [];
    let current = endId;
    while (current !== undefined) {
      path.unshift(current);
      current = previous[current];
    }

    setShortestPath(path);
    setTimeout(() => setShortestPath([]), 3000);
  };

  const reset = () => {
    setGraph({
      nodes: [
        { id: 1, x: 100, y: 100 },
        { id: 2, x: 300, y: 100 },
        { id: 3, x: 200, y: 200 },
        { id: 4, x: 400, y: 200 },
        { id: 5, x: 300, y: 300 }
      ],
      edges: [
        { from: 1, to: 2, weight: 5 },
        { from: 1, to: 3, weight: 3 },
        { from: 2, to: 4, weight: 2 },
        { from: 3, to: 4, weight: 4 },
        { from: 3, to: 5, weight: 6 },
        { from: 4, to: 5, weight: 1 }
      ]
    });
    setSelectedNode(null);
    setSelectedEdge(null);
    setFromNode('');
    setToNode('');
    setWeight('');
    setShortestPath([]);
  };

  return (
    <Layout
      title="Weighted Graph Visualiser"
      description="Visualise weighted graph operations with nodes and weighted edges."
      timeComplexity={{ best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' }}
      spaceComplexity="O(V + E)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Weighted Graph</h2>
            <div className="relative w-full h-[500px] bg-white rounded-lg border border-gray-200">
              <canvas
                ref={canvasRef}
                width={600}
                height={500}
                className="absolute top-0 left-0"
                onClick={(e) => {
                  const rect = e.target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  
                  // Check if clicked on a node
                  const clickedNode = graph.nodes.find(node => {
                    const dx = node.x - x;
                    const dy = node.y - y;
                    return Math.sqrt(dx * dx + dy * dy) <= 20;
                  });

                  if (clickedNode) {
                    setSelectedNode(clickedNode);
                    setSelectedEdge(null);
                  } else {
                    setSelectedNode(null);
                    setSelectedEdge(null);
                  }
                }}
              />
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
                <span>Add Edge: O(1) - Connect two vertices with weight</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Dijkstra: O(V + E) - Find shortest path between vertices</span>
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
                <InputControl
                  label="Weight"
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Enter edge weight"
                />
                <Button onClick={addEdge} variant="primary" fullWidth>
                  Add Edge
                </Button>
              </div>

              {selectedNode && (
                <div className="space-y-3">
                  <Button
                    onClick={() => removeNode(selectedNode.id)}
                    variant="secondary"
                    fullWidth
                  >
                    Remove Node {selectedNode.id}
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <InputControl
                      label="End Node"
                      type="number"
                      value={toNode}
                      onChange={(e) => setToNode(e.target.value)}
                      placeholder="Enter node ID"
                    />
                    <Button
                      onClick={() => dijkstra(selectedNode.id, parseInt(toNode))}
                      variant="primary"
                      fullWidth
                    >
                      Find Shortest Path
                    </Button>
                  </div>
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
                <p className="text-2xl font-semibold text-gray-900">{graph.edges.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Density</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {(graph.edges.length / (graph.nodes.length * (graph.nodes.length - 1))).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
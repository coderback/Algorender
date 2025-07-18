'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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

export default function GraphVisualiser() {
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
  const [searchPath, setSearchPath] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canvasRef = useRef(null);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    graph.edges.forEach(edge => {
      const fromNode = graph.nodes.find(n => n.id === edge.from);
      const toNode = graph.nodes.find(n => n.id === edge.to);
      
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
      const isInPath = searchPath.includes(node.id);
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
  }, [graph, selectedNode, selectedEdge, searchPath]);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  const addNode = () => {
    if (graph.nodes.length >= 12) {
      setError('Maximum 12 nodes allowed');
      setTimeout(() => setError(''), 3000);
      return;
    }
    
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
    setSuccess(`Node ${newId} added successfully`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const addEdge = () => {
    if (!fromNode.trim() || !toNode.trim() || !weight.trim()) {
      setError('Please fill in all edge fields');
      setTimeout(() => setError(''), 3000);
      return;
    }
    
    const from = parseInt(fromNode);
    const to = parseInt(toNode);
    const weightValue = parseInt(weight);

    if (isNaN(from) || isNaN(to) || isNaN(weightValue)) {
      setError('Please enter valid numbers');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!graph.nodes.some(n => n.id === from)) {
      setError(`Node ${from} does not exist`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!graph.nodes.some(n => n.id === to)) {
      setError(`Node ${to} does not exist`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (from === to) {
      setError('Cannot create edge to same node');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (graph.edges.some(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))) {
      setError('Edge already exists between these nodes');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setGraph(prev => ({
      ...prev,
      edges: [...prev.edges, { from, to, weight: weightValue }]
    }));
    setFromNode('');
    setToNode('');
    setWeight('');
    setSuccess(`Edge added: ${from} → ${to} (weight: ${weightValue})`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const removeNode = (nodeId) => {
    const removedEdges = graph.edges.filter(e => e.from === nodeId || e.to === nodeId).length;
    setGraph(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
    }));
    setSelectedNode(null);
    setSuccess(`Node ${nodeId} and ${removedEdges} connected edges removed`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const removeEdge = (from, to) => {
    setGraph(prev => ({
      ...prev,
      edges: prev.edges.filter(e => !(e.from === from && e.to === to))
    }));
    setSelectedEdge(null);
    setSuccess(`Edge ${from} → ${to} removed`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const bfs = (startId) => {
    const visited = new Set();
    const queue = [startId];
    const path = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = graph.edges
        .filter(e => e.from === current || e.to === current)
        .map(e => e.from === current ? e.to : e.from);

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
          path.push(neighbor);
        }
      }
    }

    setSearchPath(path);
    setSuccess(`BFS traversal from node ${startId}: visited ${path.length} nodes`);
    setTimeout(() => {
      setSearchPath([]);
      setSuccess('');
    }, 3000);
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
    setSearchPath([]);
    setError('');
    setSuccess('');
  };

  return (
    <Layout
      title="Graph Visualiser"
      description="Visualise graph operations with nodes and weighted edges."
      timeComplexity={{ best: 'O(1)', average: 'O(V + E)', worst: 'O(V + E)' }}
      spaceComplexity="O(V + E)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Graph</h2>
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
          
          <ControlsSection title="Graph Operations">
            <EnhancedDataStructureButtonGrid
              operations={[
                ButtonPresets.dataStructure.insert(addNode, graph.nodes.length >= 12),
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Add Edge</h4>
              <div className="grid grid-cols-3 gap-3">
                <InputControl
                  label="From"
                  type="number"
                  value={fromNode}
                  onChange={(e) => setFromNode(e.target.value)}
                  placeholder="Node ID"
                />
                <InputControl
                  label="To"
                  type="number"
                  value={toNode}
                  onChange={(e) => setToNode(e.target.value)}
                  placeholder="Node ID"
                />
                <InputControl
                  label="Weight"
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Weight"
                />
              </div>
              <EnhancedDataStructureButtonGrid
                operations={[
                  {
                    onClick: addEdge,
                    icon: ButtonPresets.dataStructure.insert().icon,
                    label: 'Add Edge',
                    disabled: !fromNode.trim() || !toNode.trim() || !weight.trim(),
                    variant: 'primary'
                  }
                ]}
              />
            </div>

            {selectedNode && (
              <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-sm font-medium text-blue-700">Selected Node {selectedNode.id}</h4>
                <EnhancedDataStructureButtonGrid
                  operations={[
                    ButtonPresets.dataStructure.remove(() => removeNode(selectedNode.id)),
                    {
                      onClick: () => bfs(selectedNode.id),
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
              { label: 'Edges', value: graph.edges.length, color: 'text-green-600' },
              { 
                label: 'Density', 
                value: graph.nodes.length > 1 ? 
                  (graph.edges.length / (graph.nodes.length * (graph.nodes.length - 1))).toFixed(2) : 
                  '0.00', 
                color: 'text-gray-900' 
              },
              { 
                label: 'Connected', 
                value: searchPath.length > 0 ? `${searchPath.length} nodes` : 'Click BFS', 
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
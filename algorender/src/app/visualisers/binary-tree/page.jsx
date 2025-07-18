'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  EnhancedDataStructureButtonGrid, 
  StatisticsDisplay, 
  ErrorDisplay,
  ButtonPresets 
} from '@/components/VisualizerControls';

export default function BinaryTreeVisualiser() {
  const [tree, setTree] = useState(null);
  const [value, setValue] = useState('');
  const [traversalPath, setTraversalPath] = useState([]);
  const [error, setError] = useState('');

  const insert = (value) => {
    if (value === '') {
      setError('Please enter a value');
      return;
    }
    const newValue = parseInt(value);
    if (isNaN(newValue)) {
      setError('Please enter a valid number');
      return;
    }
    setError('');
    setTree(insertNode(tree, newValue));
    setValue('');
    // Highlight the path to the newly inserted node
    const path = [];
    findPath(tree, newValue, path);
    setTraversalPath(path);
    setTimeout(() => setTraversalPath([]), 1000);
  };

  const insertNode = (node, value) => {
    if (!node) return { value, left: null, right: null };
    if (value < node.value) {
      return { ...node, left: insertNode(node.left, value) };
    } else if (value > node.value) {
      return { ...node, right: insertNode(node.right, value) };
    }
    return node; // Value already exists
  };

  const findPath = (node, value, path) => {
    if (!node) return false;
    path.push(node.value);
    if (node.value === value) return true;
    if (value < node.value) return findPath(node.left, value, path);
    return findPath(node.right, value, path);
  };

  const search = (value) => {
    if (value === '') {
      setError('Please enter a value');
      return;
    }
    const searchValue = parseInt(value);
    if (isNaN(searchValue)) {
      setError('Please enter a valid number');
      return;
    }
    setError('');
    setTraversalPath([]);
    const path = [];
    findPath(tree, searchValue, path);
    setTraversalPath(path);
    setValue('');
      setTimeout(() => setTraversalPath([]), 2000);
  };

  const reset = () => {
    setTree(null);
    setValue('');
    setTraversalPath([]);
    setError('');
  };

  const getTreeHeight = (node) => {
    if (!node) return 0;
    return 1 + Math.max(getTreeHeight(node.left), getTreeHeight(node.right));
  };

  const countNodes = (node) => {
    if (!node) return 0;
    return 1 + countNodes(node.left) + countNodes(node.right);
  };

  const renderNode = (node, level = 0, isLeft = null) => {
    if (!node) return null;
    const isSelected = traversalPath.includes(node.value);
    
    return (
      <div className="flex flex-col items-center relative">
        {level > 0 && (
        <div
            className={`absolute w-24 h-12 -top-10 
              ${isLeft ? '-translate-x-12 border-t-2 border-l-2' : 'translate-x-12 border-t-2 border-r-2'} 
              border-gray-300/50 rounded-${isLeft ? 'tl' : 'tr'}`}
          />
        )}
        <div
          className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center transition-all duration-300
            relative group cursor-pointer backdrop-blur-sm
            ${isSelected
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 scale-110 ring-4 ring-blue-500/30'
              : 'bg-gradient-to-br from-white to-gray-50 shadow-lg shadow-gray-200/50 hover:shadow-xl hover:scale-105'
          }`}
        >
          <span className={`text-2xl font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
            {node.value}
          </span>
          <div className="absolute -top-6 left-0 text-xs font-medium text-gray-400">
            Level {level}
          </div>
          <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200
            bg-gray-800 text-white text-xs font-medium px-2 py-1 rounded-md -bottom-8 whitespace-nowrap">
            Value: {node.value}
          </div>
        </div>
        {(node.left || node.right) && (
          <div className="flex justify-center mt-16 space-x-24">
              <div className="flex flex-col items-center">
              {renderNode(node.left, level + 1, true)}
              </div>
              <div className="flex flex-col items-center">
              {renderNode(node.right, level + 1, false)}
              </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout
      title="Binary Tree Visualiser"
      description="Visualise binary search tree operations with interactive node manipulation."
      timeComplexity={{ best: 'O(log n)', average: 'O(log n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 overflow-x-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Binary Tree</h2>
            <div className="flex justify-center min-w-[800px] p-8">
              {tree ? renderNode(tree) : (
                <div className="text-gray-500 text-center">
                  <p>No nodes yet</p>
                  <p className="text-sm mt-2">Insert values to build the tree</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Insert: O(log n) - Add new node while maintaining BST properties</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(log n) - Find node by value</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Left child &lt; parent &lt; Right child</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ErrorDisplay error={error} />
          
          <ControlsSection title="Operations">
            <InputControl
              label="Value"
              type="number"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              placeholder="Enter value"
            />
            
            <EnhancedDataStructureButtonGrid
              operations={[
                ButtonPresets.dataStructure.insert(() => insert(value), !value.trim()),
                ButtonPresets.dataStructure.search(() => search(value), !value.trim())
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Tree Height', value: getTreeHeight(tree) - 1, color: 'text-blue-600' },
              { label: 'Total Nodes', value: countNodes(tree), color: 'text-gray-900' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
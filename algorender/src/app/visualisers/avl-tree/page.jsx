'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  StatisticsDisplay, 
  EnhancedDataStructureButtonGrid, 
  ButtonPresets, 
  ErrorDisplay 
} from '@/components/VisualizerControls';

export default function AVLTreeVisualiser() {
  const [tree, setTree] = useState(null);
  const [value, setValue] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [rotationType, setRotationType] = useState(null);
  const [error, setError] = useState('');

  const getHeight = (node) => {
    if (!node) return 0;
    return node.height;
  };

  const getBalance = (node) => {
    if (!node) return 0;
    return getHeight(node.left) - getHeight(node.right);
  };

  const updateHeight = (node) => {
    if (!node) return;
    node.height = Math.max(getHeight(node.left), getHeight(node.right)) + 1;
  };

  const rightRotate = (y) => {
    const x = y.left;
    const T2 = x.right;

    x.right = y;
    y.left = T2;

    updateHeight(y);
    updateHeight(x);

    setRotationType('right');
    setTimeout(() => setRotationType(null), 1000);

    return x;
  };

  const leftRotate = (x) => {
    const y = x.right;
    const T2 = y.left;

    y.left = x;
    x.right = T2;

    updateHeight(x);
    updateHeight(y);

    setRotationType('left');
    setTimeout(() => setRotationType(null), 1000);

    return y;
  };

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
    setSelectedNode(newValue);
    setTree(insertNode(tree, newValue));
    setValue('');
    setTimeout(() => setSelectedNode(null), 1000);
  };

  const insertNode = (node, value) => {
    if (!node) {
      return { value, left: null, right: null, height: 1 };
    }

    if (value < node.value) {
      node.left = insertNode(node.left, value);
    } else if (value > node.value) {
      node.right = insertNode(node.right, value);
    } else {
      return node; // Value already exists
    }

    updateHeight(node);

    const balance = getBalance(node);

    // Left Left Case
    if (balance > 1 && value < node.left.value) {
      return rightRotate(node);
    }

    // Right Right Case
    if (balance < -1 && value > node.right.value) {
      return leftRotate(node);
    }

    // Left Right Case
    if (balance > 1 && value > node.left.value) {
      node.left = leftRotate(node.left);
      return rightRotate(node);
    }

    // Right Left Case
    if (balance < -1 && value < node.right.value) {
      node.right = rightRotate(node.right);
      return leftRotate(node);
    }

    return node;
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
    setSelectedNode(null);
    const found = searchNode(tree, searchValue);
    setValue('');
    if (!found) {
      setTimeout(() => setSelectedNode(null), 2000);
    }
  };

  const searchNode = (node, value) => {
    if (!node) return false;
    if (node.value === value) {
      setSelectedNode(value);
      return true;
    }
    if (value < node.value) return searchNode(node.left, value);
    return searchNode(node.right, value);
  };

  const reset = () => {
    setTree(null);
    setValue('');
    setSelectedNode(null);
    setRotationType(null);
    setError('');
  };

  const renderNode = (node, level = 0, isLeft = null) => {
    if (!node) return null;
    const isSelected = node.value === selectedNode;
    const isRotating = rotationType && (
      (rotationType === 'right' && node.left?.value === selectedNode) ||
      (rotationType === 'left' && node.right?.value === selectedNode)
    );
    const balance = getBalance(node);
    const balanceColor = 
      Math.abs(balance) > 1 ? 'text-red-500' :
      Math.abs(balance) === 1 ? 'text-yellow-500' : 
      'text-green-500';
    const balanceGradient = 
      Math.abs(balance) > 1 ? 'from-red-500 to-red-600' :
      Math.abs(balance) === 1 ? 'from-yellow-500 to-yellow-600' :
      'from-green-500 to-green-600';

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
          className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center transition-all duration-300
            relative group cursor-pointer backdrop-blur-sm
            ${isSelected || isRotating
              ? `bg-gradient-to-br ${balanceGradient} text-white shadow-lg shadow-${balanceColor}/20 scale-110 ring-4 ring-${balanceColor}/30`
              : 'bg-gradient-to-br from-white to-gray-50 shadow-lg shadow-gray-200/50 hover:shadow-xl hover:scale-105'
            }`}
        >
          <span className={`text-2xl font-bold ${isSelected || isRotating ? 'text-white' : 'text-gray-700'}`}>
            {node.value}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium ${isSelected || isRotating ? 'text-white/80' : 'text-gray-500'}`}>
              h={node.height}
            </span>
            <span className={`text-xs font-medium ${isSelected || isRotating ? 'text-white' : balanceColor}`}>
              b={balance}
            </span>
          </div>
          <div className="absolute -top-6 left-0 text-xs font-medium text-gray-400">
            Level {level}
          </div>
          <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200
            bg-gray-800 text-white text-xs font-medium px-2 py-1 rounded-md -bottom-8 whitespace-nowrap">
            Value: {node.value} | Height: {node.height} | Balance: {balance}
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
      title="AVL Tree Visualiser"
      description="Visualise self-balancing binary search tree operations with rotations."
      timeComplexity={{ best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 overflow-x-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AVL Tree</h2>
            <div className="flex justify-center min-w-[800px] p-8">
              {tree ? renderNode(tree) : (
                <div className="text-gray-500 text-center">
                  <p>No nodes yet</p>
                  <p className="text-sm mt-2">Insert values to build a self-balancing tree</p>
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
                <span>Insert: O(log n) - Add node and rebalance if needed</span>
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
                <span>Balance Factor: |left height - right height| &lt;= 1</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ControlsSection title="Operations">
            <ErrorDisplay error={error} onDismiss={() => setError('')} />
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
                ButtonPresets.dataStructure.insert(() => insert(value)),
                ButtonPresets.dataStructure.search(() => search(value))
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              {
                label: 'Tree Height',
                value: tree ? tree.height - 1 : 0,
                color: 'text-blue-600'
              },
              {
                label: 'Root Balance Factor',
                value: tree ? getBalance(tree) : 0,
                color: tree && Math.abs(getBalance(tree)) > 1 ? 'text-red-500' : 'text-green-600'
              }
            ]}
            columns={2}
          />
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function AVLTreeVisualiser() {
  const [tree, setTree] = useState({
    value: 10,
    left: {
      value: 5,
      left: { value: 3, left: null, right: null, height: 1 },
      right: { value: 7, left: null, right: null, height: 1 },
      height: 2
    },
    right: {
      value: 15,
      left: { value: 12, left: null, right: null, height: 1 },
      right: { value: 18, left: null, right: null, height: 1 },
      height: 2
    },
    height: 3
  });
  const [value, setValue] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [rotationType, setRotationType] = useState(null);

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
    if (value === '') return;
    const newValue = parseInt(value);
    setTree(insertNode(tree, newValue));
    setValue('');
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
      return node;
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
    if (value === '') return;
    const searchValue = parseInt(value);
    setSelectedNode(null);
    const path = [];
    const found = searchNode(tree, searchValue, path);
    setValue('');
    if (!found) {
      setTimeout(() => setSelectedNode(null), 2000);
    }
  };

  const searchNode = (node, value, path) => {
    if (!node) return false;
    path.push(node.value);
    if (node.value === value) {
      setSelectedNode(node.value);
      return true;
    }
    if (value < node.value) return searchNode(node.left, value, path);
    return searchNode(node.right, value, path);
  };

  const reset = () => {
    setTree({
      value: 10,
      left: {
        value: 5,
        left: { value: 3, left: null, right: null, height: 1 },
        right: { value: 7, left: null, right: null, height: 1 },
        height: 2
      },
      right: {
        value: 15,
        left: { value: 12, left: null, right: null, height: 1 },
        right: { value: 18, left: null, right: null, height: 1 },
        height: 2
      },
      height: 3
    });
    setValue('');
    setSelectedNode(null);
    setRotationType(null);
  };

  const renderNode = (node, level = 0) => {
    if (!node) return null;
    const isSelected = node.value === selectedNode;
    const isRotating = rotationType && (
      (rotationType === 'right' && node.left?.value === selectedNode) ||
      (rotationType === 'left' && node.right?.value === selectedNode)
    );

    return (
      <div className="flex flex-col items-center">
        <div
          className={`w-16 h-16 rounded-lg flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-blue-100 border-2 border-blue-500 scale-110'
              : isRotating
              ? 'bg-yellow-100 border-2 border-yellow-500 scale-110'
              : 'bg-white border border-gray-200'
          }`}
        >
          <div className="text-center">
            <span className="text-lg font-semibold text-gray-900">{node.value}</span>
            <div className="text-xs text-gray-500">h={node.height}</div>
          </div>
        </div>
        {(node.left || node.right) && (
          <div className="flex justify-center mt-4 space-x-8">
            {node.left && (
              <div className="flex flex-col items-center">
                <div className="w-0.5 h-4 bg-gray-300"></div>
                {renderNode(node.left, level + 1)}
              </div>
            )}
            {node.right && (
              <div className="flex flex-col items-center">
                <div className="w-0.5 h-4 bg-gray-300"></div>
                {renderNode(node.right, level + 1)}
              </div>
            )}
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
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AVL Tree</h2>
            <div className="flex justify-center">
              {renderNode(tree)}
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
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
            <div className="space-y-4">
              <InputControl
                label="Value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter value"
              />
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => insert(value)} variant="primary" fullWidth>
                  Insert
                </Button>
                <Button onClick={() => search(value)} variant="secondary" fullWidth>
                  Search
                </Button>
              </div>
              <Button onClick={reset} variant="secondary" fullWidth>
                Reset
              </Button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Tree Height</h4>
                <p className="text-2xl font-semibold text-blue-600">
                  {tree.height}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Balance Factor</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {getBalance(tree)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Rotation Type</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {rotationType ? rotationType : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function BTreeVisualiser() {
  const [tree, setTree] = useState({
    keys: [10, 20],
    children: [
      {
        keys: [5, 7],
        children: [],
        isLeaf: true
      },
      {
        keys: [15],
        children: [],
        isLeaf: true
      },
      {
        keys: [25, 30],
        children: [],
        isLeaf: true
      }
    ],
    isLeaf: false
  });
  const [value, setValue] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchPath, setSearchPath] = useState([]);
  const [order] = useState(3); // B-tree of order 3 (2-3 tree)

  const insert = (value) => {
    if (value === '') return;
    const newValue = parseInt(value);
    const newTree = { ...tree };
    insertNode(newTree, newValue);
    setTree(newTree);
    setValue('');
  };

  const insertNode = (node, value) => {
    if (node.isLeaf) {
      // Insert into leaf node
      const index = node.keys.findIndex(k => k > value);
      if (index === -1) {
        node.keys.push(value);
      } else {
        node.keys.splice(index, 0, value);
      }

      // Split if necessary
      if (node.keys.length > order - 1) {
        splitNode(node);
      }
    } else {
      // Find child to insert into
      let childIndex = node.keys.findIndex(k => k > value);
      if (childIndex === -1) childIndex = node.keys.length;
      insertNode(node.children[childIndex], value);
    }
  };

  const splitNode = (node) => {
    const mid = Math.floor(node.keys.length / 2);
    const leftKeys = node.keys.slice(0, mid);
    const rightKeys = node.keys.slice(mid + 1);
    const midKey = node.keys[mid];

    if (node.isLeaf) {
      // Split leaf node
      const leftNode = { keys: leftKeys, children: [], isLeaf: true };
      const rightNode = { keys: rightKeys, children: [], isLeaf: true };
      node.keys = [midKey];
      node.children = [leftNode, rightNode];
      node.isLeaf = false;
    } else {
      // Split internal node
      const leftNode = { keys: leftKeys, children: node.children.slice(0, mid + 1), isLeaf: false };
      const rightNode = { keys: rightKeys, children: node.children.slice(mid + 1), isLeaf: false };
      node.keys = [midKey];
      node.children = [leftNode, rightNode];
    }
  };

  const search = (value) => {
    if (value === '') return;
    const searchValue = parseInt(value);
    setSearchPath([]);
    const path = [];
    const found = searchNode(tree, searchValue, path);
    setValue('');
    if (!found) {
      setTimeout(() => setSearchPath([]), 2000);
    }
  };

  const searchNode = (node, value, path) => {
    path.push(node);
    const index = node.keys.findIndex(k => k === value);
    if (index !== -1) {
      setSearchPath(path);
      return true;
    }
    if (node.isLeaf) return false;
    const childIndex = node.keys.findIndex(k => k > value);
    return searchNode(node.children[childIndex === -1 ? node.keys.length : childIndex], value, path);
  };

  const reset = () => {
    setTree({
      keys: [10, 20],
      children: [
        {
          keys: [5, 7],
          children: [],
          isLeaf: true
        },
        {
          keys: [15],
          children: [],
          isLeaf: true
        },
        {
          keys: [25, 30],
          children: [],
          isLeaf: true
        }
      ],
      isLeaf: false
    });
    setValue('');
    setSelectedNode(null);
    setSearchPath([]);
  };

  const renderNode = (node, level = 0) => {
    const isInPath = searchPath.includes(node);
    return (
      <div className="flex flex-col items-center">
        <div
          className={`min-w-[200px] rounded-lg p-4 transition-all ${
            isInPath
              ? 'bg-blue-100 border-2 border-blue-500 scale-105'
              : 'bg-white border border-gray-200'
          }`}
        >
          <div className="flex justify-center space-x-2">
            {node.keys.map((key, index) => (
              <div
                key={index}
                className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center"
              >
                <span className="text-lg font-semibold text-gray-900">{key}</span>
              </div>
            ))}
          </div>
          {!node.isLeaf && (
            <div className="flex justify-center mt-4 space-x-4">
              {node.children.map((child, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className="w-0.5 h-4 bg-gray-300"></div>
                  {renderNode(child, level + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout
      title="B-Tree Visualiser"
      description="Visualise B-tree operations with node splitting and merging."
      timeComplexity={{ best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">B-Tree</h2>
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
                <span>Insert: O(log n) - Add key and split nodes if needed</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(log n) - Find key by traversing tree</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Order {order}: Each node has at most {order - 1} keys</span>
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
                <h4 className="text-sm font-medium text-gray-700 mb-1">Tree Order</h4>
                <p className="text-2xl font-semibold text-blue-600">{order}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Total Keys</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {countKeys(tree)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Tree Height</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {getHeight(tree)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function countKeys(node) {
  let count = node.keys.length;
  if (!node.isLeaf) {
    for (let child of node.children) {
      count += countKeys(child);
    }
  }
  return count;
}

function getHeight(node) {
  if (node.isLeaf) return 1;
  return 1 + getHeight(node.children[0]);
} 
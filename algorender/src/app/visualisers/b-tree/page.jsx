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

export default function BTreeVisualiser() {
  const [tree, setTree] = useState(null);
  const [value, setValue] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchPath, setSearchPath] = useState([]);
  const [error, setError] = useState('');
  const [order] = useState(3); // B-tree of order 3 (2-3 tree)

  const deepCopyNode = (node) => {
    if (!node) return null;
    return {
      keys: [...node.keys],
      children: node.children.map(child => deepCopyNode(child)),
      isLeaf: node.isLeaf
    };
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

    // Check for duplicate keys
    if (tree && findPath(tree, newValue, [])) {
      setError('Value already exists in the tree');
      return;
    }

    if (!tree) {
      const newTree = {
        keys: [newValue],
        children: [],
        isLeaf: true
      };
      setTree(newTree);
    } else {
      let newTree;
      if (tree.keys.length === 2 * order - 1) {
        // Root is full, create new root
        newTree = {
          keys: [],
          children: [deepCopyNode(tree)],
          isLeaf: false
        };
        splitChild(newTree, 0);
        insertNonFull(newTree, newValue);
      } else {
        newTree = deepCopyNode(tree);
        insertNonFull(newTree, newValue);
      }
      setTree(newTree);
    }
    setValue('');

    // Use setTimeout to ensure tree state is updated before finding path
    setTimeout(() => {
      const path = [];
      if (tree) {
        findPath(tree, newValue, path);
        setSearchPath(path);setTimeout(() => setSearchPath([]), 1000);
      }
    }, 50);
  };

  const splitChild = (parentNode, index) => {
    const childNode = parentNode.children[index];
    const midIndex = Math.floor((2 * order - 1) / 2);
    const midKey = childNode.keys[midIndex];

    const newNode = {
      keys: childNode.keys.slice(midIndex + 1),
      children: childNode.isLeaf ? [] : childNode.children.slice(midIndex +
  1),
      isLeaf: childNode.isLeaf
    };

    childNode.keys = childNode.keys.slice(0, midIndex);
    if (!childNode.isLeaf) {
      childNode.children = childNode.children.slice(0, midIndex + 1);
    }

    parentNode.keys.splice(index, 0, midKey);
    parentNode.children.splice(index + 1, 0, newNode);
  };

  const insertNonFull = (node, key) => {
    let i = node.keys.length - 1;

    if (node.isLeaf) {
      // Insert into leaf node - shift keys to make room
      node.keys.push(0); // Make room for new key
      while (i >= 0 && key < node.keys[i]) {
        node.keys[i + 1] = node.keys[i];
        i--;
      }
      node.keys[i + 1] = key;
    } else {
      // Find child to insert into
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }
      i++;
      
      if (node.children[i].keys.length === 2 * order - 1) {
        splitChild(node, i);
        if (key > node.keys[i]) {
          i++;
        }
      }
      insertNonFull(node.children[i], key);
    }
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
    setSearchPath([]);
    const path = [];
    findPath(tree, searchValue, path);
    setSearchPath(path);
    setValue('');
      setTimeout(() => setSearchPath([]), 2000);
  };

  const findPath = (node, value, path) => {
    if (!node) return false;
    path.push(node);

    let i = 0;
    while (i < node.keys.length && value > node.keys[i]) {
      i++;
    }

    if (i < node.keys.length && value === node.keys[i]) {
      return true;
    }

    if (node.isLeaf) {
      return false;
    }

    return findPath(node.children[i], value, path);
  };

  const reset = () => {
    setTree(null);
    setValue('');
    setSelectedNode(null);
    setSearchPath([]);
    setError('');
  };

  const countKeys = (node) => {
    if (!node) return 0;
    let count = node.keys.length;
    for (const child of node.children) {
      count += countKeys(child);
    }
    return count;
  };

  const getHeight = (node) => {
    if (!node) return 0;
    if (node.isLeaf) return 1;
    return 1 + getHeight(node.children[0]);
  };

  const renderNode = (node, level = 0, isLeftmost = true, isRightmost = true) => {
    const isInPath = searchPath.includes(node);
    const nodeWidth = Math.max(node.keys.length * 80, 160);

    return (
      <div className="flex flex-col items-center relative">
        {level > 0 && (
        <div
            className={`absolute w-24 h-12 -top-10 
              ${isLeftmost ? '-translate-x-12 border-t-2 border-l-2' : 
                isRightmost ? 'translate-x-12 border-t-2 border-r-2' : 
                'border-t-2'} 
              border-gray-300/50 ${isLeftmost ? 'rounded-tl' : 
                isRightmost ? 'rounded-tr' : ''}`}
          />
        )}
        <div
          className={`min-w-[${nodeWidth}px] rounded-2xl p-4 transition-all duration-300
            relative group cursor-pointer backdrop-blur-sm
            ${isInPath
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20 scale-110 ring-4 ring-blue-500/30'
              : 'bg-gradient-to-br from-white to-gray-50 shadow-lg shadow-gray-200/50 hover:shadow-xl hover:scale-105'
            }`}
        >
          <div className="absolute -top-6 left-0 text-xs font-medium text-gray-400">
            Level {level} {node.isLeaf ? '(Leaf)' : '(Internal)'}
          </div>
          <div className="flex justify-center space-x-3">
            {node.keys.map((key, index) => (
              <div
                key={index}
                className={`w-16 h-16 rounded-xl flex items-center justify-center transition-all
                  ${isInPath
                    ? 'bg-white/10 text-white'
                    : 'bg-gray-50 text-gray-900 border border-gray-200'
                  } hover:bg-opacity-90`}
              >
                <span className="text-xl font-bold">{key}</span>
              </div>
            ))}
          </div>
          <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200
            bg-gray-800 text-white text-xs font-medium px-2 py-1 rounded-md -bottom-8 whitespace-nowrap">
            Keys: {node.keys.join(', ')} | {node.isLeaf ? 'Leaf Node' : 'Internal Node'}
          </div>
          </div>
          {!node.isLeaf && (
          <div
            className={`flex justify-center mt-16 space-x-8`}
            style={{ minWidth: `${nodeWidth + 100}px` }}
          >
              {node.children.map((child, index) => (
                <div key={index} className="flex flex-col items-center">
                {renderNode(
                  child,
                  level + 1,
                  index === 0,
                  index === node.children.length - 1
                )}
                </div>
              ))}
            </div>
          )}
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
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 overflow-x-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">B-Tree</h2>
            <div className="flex justify-center min-w-[800px] p-8">
              {tree ? renderNode(tree) : (
                <div className="text-gray-500 text-center">
                  <p>No nodes yet</p>
                  <p className="text-sm mt-2">Insert values to build a B-tree of order {order}</p>
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
                <span>Order {order}: Max {2 * order - 1} keys, min {order - 1} keys per node</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Nodes split when full, maintaining balanced tree structure</span>
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
              { label: 'Tree Height', value: tree ? getHeight(tree) : 0, color: 'text-blue-600' },
              { label: 'Total Keys', value: countKeys(tree), color: 'text-gray-900' },
              { label: 'Tree Order', value: order, color: 'text-green-600' }
            ]}
            columns={3}
          />
        </div>
      </div>
    </Layout>
  );
}
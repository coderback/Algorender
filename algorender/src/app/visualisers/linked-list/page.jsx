'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function LinkedListVisualiser() {
  const [list, setList] = useState([
    { value: 1, next: 1 },
    { value: 2, next: 2 },
    { value: 3, next: 3 },
    { value: 4, next: 4 },
    { value: 5, next: null }
  ]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const insertAtEnd = () => {
    if (value === '') return;
    const newNode = { 
      value: parseInt(value), 
      next: null 
    };
    
    const newList = [...list];
    if (newList.length > 0) {
      newList[newList.length - 1].next = newList.length;
    }
    newList.push(newNode);

    setList(newList);
    setValue('');
    setSelectedIndex(newList.length - 1);
    setTimeout(() => setSelectedIndex(null), 1000);
  };

  const removeFromEnd = () => {
    if (list.length === 0) return;
    
    const newList = [...list];
    newList.pop();
    
    if (newList.length > 0) {
      newList[newList.length - 1].next = null;
    }

    setList(newList);
    setSelectedIndex(null);
  };

  const search = () => {
    if (value === '') return;
    const searchValue = parseInt(value);
    const foundIndex = list.findIndex(node => node.value === searchValue);
    setSelectedIndex(foundIndex);
    setValue('');
  };

  const reset = () => {
    setList([
      { value: 1, next: 1 },
      { value: 2, next: 2 },
      { value: 3, next: 3 },
      { value: 4, next: 4 },
      { value: 5, next: null }
    ]);
    setValue('');
    setSelectedIndex(null);
  };

  return (
    <Layout
      title="Linked List Visualiser"
      description="Visualise linked list operations with node connections."
      timeComplexity={{ best: 'O(1)', average: 'O(n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Linked List</h2>
            <div className="flex items-center gap-4">
              {list.map((node, i) => (
                <div key={i} className="flex items-center">
                  <div
                    className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center transition-all ${
                      i === selectedIndex
                        ? 'bg-blue-100 border-2 border-blue-500 scale-110'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <span className="text-lg font-semibold text-gray-900">{node.value}</span>
                    <span className="text-xs text-gray-500">Node {i + 1}</span>
                  </div>
                  {node.next !== null && (
                    <div className="w-8 h-0.5 bg-gray-300 relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-300 rotate-45" />
                    </div>
                  )}
                </div>
              ))}
              {list.length === 0 && (
                <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400">
                  Empty
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
                <span>Insert: O(1) - Add node at the end</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Delete: O(1) - Remove node from the end</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(n) - Linear search through nodes</span>
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
                <Button onClick={insertAtEnd} variant="primary" fullWidth>
                  Insert
                </Button>
                <Button onClick={removeFromEnd} variant="danger" fullWidth>
                  Remove
                </Button>
                <Button onClick={search} variant="secondary" fullWidth>
                  Search
                </Button>
                <Button onClick={reset} variant="secondary" fullWidth>
                  Reset
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">List Length</h4>
                <p className="text-2xl font-semibold text-blue-600">{list.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Selected Node</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {selectedIndex !== null ? list[selectedIndex].value : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
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
  const [index, setIndex] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const insert = () => {
    if (value === '' || index === '') return;
    const newIndex = parseInt(index);
    if (newIndex < 0 || newIndex > list.length) return;

    const newList = [...list];
    const newNode = { value: parseInt(value), next: newIndex === list.length ? null : newIndex };
    
    if (newIndex > 0) {
      newList[newIndex - 1].next = newIndex;
    }
    
    newList.splice(newIndex, 0, newNode);
    
    // Update next pointers
    for (let i = newIndex + 1; i < newList.length; i++) {
      newList[i].next = i + 1 < newList.length ? i + 1 : null;
    }

    setList(newList);
    setValue('');
    setIndex('');
  };

  const remove = () => {
    if (index === '') return;
    const newIndex = parseInt(index);
    if (newIndex < 0 || newIndex >= list.length) return;

    const newList = [...list];
    newList.splice(newIndex, 1);

    // Update next pointers
    for (let i = 0; i < newList.length; i++) {
      newList[i].next = i + 1 < newList.length ? i + 1 : null;
    }

    setList(newList);
    setIndex('');
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
    setIndex('');
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
                    <span className="text-xs text-gray-500">Index {i}</span>
                  </div>
                  {node.next !== null && (
                    <div className="w-8 h-0.5 bg-gray-300 relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-300 rotate-45" />
                    </div>
                  )}
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
                <span>Insert: O(n) - Traverse to position and update pointers</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Delete: O(n) - Traverse to position and update pointers</span>
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
              <InputControl
                label="Index"
                type="number"
                value={index}
                onChange={(e) => setIndex(e.target.value)}
                placeholder="Enter index"
              />
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={insert} variant="primary" fullWidth>
                  Insert
                </Button>
                <Button onClick={remove} variant="danger" fullWidth>
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
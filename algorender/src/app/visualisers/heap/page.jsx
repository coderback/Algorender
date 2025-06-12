'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function HeapVisualiser() {
  const [heap, setHeap] = useState([10, 8, 7, 5, 3, 2, 1]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const insert = (value) => {
    if (value === '') return;
    const newValue = parseInt(value);
    const newHeap = [...heap, newValue];
    heapifyUp(newHeap, newHeap.length - 1);
    setHeap(newHeap);
    setValue('');
  };

  const heapifyUp = (arr, index) => {
    const parent = Math.floor((index - 1) / 2);
    if (parent >= 0 && arr[parent] < arr[index]) {
      [arr[parent], arr[index]] = [arr[index], arr[parent]];
      heapifyUp(arr, parent);
    }
  };

  const extractMax = () => {
    if (heap.length === 0) return;
    setSelectedIndex(0);
    setTimeout(() => {
      const newHeap = [...heap];
      newHeap[0] = newHeap[newHeap.length - 1];
      newHeap.pop();
      heapifyDown(newHeap, 0);
      setHeap(newHeap);
      setSelectedIndex(null);
    }, 500);
  };

  const heapifyDown = (arr, index) => {
    const left = 2 * index + 1;
    const right = 2 * index + 2;
    let largest = index;

    if (left < arr.length && arr[left] > arr[largest]) {
      largest = left;
    }
    if (right < arr.length && arr[right] > arr[largest]) {
      largest = right;
    }

    if (largest !== index) {
      [arr[index], arr[largest]] = [arr[largest], arr[index]];
      heapifyDown(arr, largest);
    }
  };

  const reset = () => {
    setHeap([10, 8, 7, 5, 3, 2, 1]);
    setValue('');
    setSelectedIndex(null);
  };

  const renderHeap = () => {
    const levels = Math.ceil(Math.log2(heap.length + 1));
    const elements = [];

    for (let level = 0; level < levels; level++) {
      const start = Math.pow(2, level) - 1;
      const count = Math.pow(2, level);
      const levelElements = [];

      for (let i = 0; i < count && start + i < heap.length; i++) {
        const index = start + i;
        levelElements.push(
          <div
            key={index}
            className={`w-16 h-16 rounded-lg flex items-center justify-center transition-all ${
              index === selectedIndex
                ? 'bg-blue-100 border-2 border-blue-500 scale-110'
                : 'bg-white border border-gray-200'
            }`}
          >
            <span className="text-lg font-semibold text-gray-900">{heap[index]}</span>
          </div>
        );
      }

      elements.push(
        <div key={level} className="flex justify-center space-x-4 mb-4">
          {levelElements}
        </div>
      );
    }

    return elements;
  };

  return (
    <Layout
      title="Heap Visualiser"
      description="Visualise max heap operations with interactive node manipulation."
      timeComplexity={{ best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Max Heap</h2>
            <div className="flex flex-col items-center">
              {renderHeap()}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Insert: O(log n) - Add element and maintain heap property</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Extract Max: O(log n) - Remove and return maximum element</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Parent &gt; Children - Maintains complete binary tree structure</span>
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
                <Button onClick={extractMax} variant="danger" fullWidth>
                  Extract Max
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
                <h4 className="text-sm font-medium text-gray-700 mb-1">Heap Size</h4>
                <p className="text-2xl font-semibold text-blue-600">{heap.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Max Value</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {heap.length > 0 ? heap[0] : '-'}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Heap Height</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {Math.floor(Math.log2(heap.length + 1))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function HeapSortVisualiser() {
  const [array, setArray] = useState([64, 34, 25, 12, 22, 11, 90]);
  const [sortedIndices, setSortedIndices] = useState([]);
  const [heapifyingIndices, setHeapifyingIndices] = useState([]);
  const [swappingIndices, setSwappingIndices] = useState([]);
  const [isSorting, setIsSorting] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [arraySize, setArraySize] = useState(7);

  const generateArray = (size) => {
    const newArray = Array.from({ length: size }, () => Math.floor(Math.random() * 100));
    setArray(newArray);
    setSortedIndices([]);
    setHeapifyingIndices([]);
    setSwappingIndices([]);
  };

  const heapify = async (arr, n, i) => {
    let largest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;

    setHeapifyingIndices([i, left, right]);
    await new Promise(resolve => setTimeout(resolve, speed));

    if (left < n && arr[left] > arr[largest]) {
      largest = left;
    }

    if (right < n && arr[right] > arr[largest]) {
      largest = right;
    }

    if (largest !== i) {
      setSwappingIndices([i, largest]);
      await new Promise(resolve => setTimeout(resolve, speed));
      [arr[i], arr[largest]] = [arr[largest], arr[i]];
      setArray([...arr]);
      await heapify(arr, n, largest);
    }

    setHeapifyingIndices([]);
    setSwappingIndices([]);
  };

  const heapSort = async () => {
    setIsSorting(true);
    const arr = [...array];
    const n = arr.length;

    // Build max heap
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      await heapify(arr, n, i);
    }

    // Extract elements from heap one by one
    for (let i = n - 1; i > 0; i--) {
      setSwappingIndices([0, i]);
      await new Promise(resolve => setTimeout(resolve, speed));
      [arr[0], arr[i]] = [arr[i], arr[0]];
      setArray([...arr]);
      setSortedIndices(prev => [...prev, i]);
      await heapify(arr, i, 0);
    }

    setSortedIndices(prev => [...prev, 0]);
    setIsSorting(false);
  };

  const reset = () => {
    generateArray(arraySize);
  };

  const handleArraySizeChange = (e) => {
    const size = parseInt(e.target.value);
    setArraySize(size);
    generateArray(size);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Heap Sort Visualiser"
      description="Visualise the heap sort algorithm step by step."
      timeComplexity={{ best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' }}
      spaceComplexity="O(1)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Array</h2>
            <div className="flex justify-center items-end space-x-2 h-64">
              {array.map((value, index) => (
                <div
                  key={index}
                  className={`w-12 flex flex-col items-center transition-all duration-300 ${
                    sortedIndices.includes(index)
                      ? 'bg-green-500'
                      : heapifyingIndices.includes(index)
                      ? 'bg-yellow-500'
                      : swappingIndices.includes(index)
                      ? 'bg-blue-500'
                      : 'bg-gray-200'
                  }`}
                  style={{
                    height: `${(value / 100) * 200}px`,
                    transition: 'height 0.3s ease-in-out'
                  }}
                >
                  <span className="text-sm font-medium text-gray-700 mt-2">{value}</span>
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
                <span>Build a max heap from the array</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Swap root with last element</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Heapify the reduced heap</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Array Size
                </label>
                <InputControl
                  type="range"
                  min="5"
                  max="20"
                  value={arraySize}
                  onChange={handleArraySizeChange}
                  disabled={isSorting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Speed
                </label>
                <InputControl
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isSorting}
                />
              </div>
              <div className="flex space-x-4">
                <Button
                  onClick={heapSort}
                  disabled={isSorting}
                  className="flex-1"
                >
                  {isSorting ? 'Sorting...' : 'Start Sorting'}
                </Button>
                <Button
                  onClick={reset}
                  disabled={isSorting}
                  variant="secondary"
                  className="flex-1"
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Array Size</p>
                <p className="text-2xl font-semibold text-blue-600">{array.length}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Sorted</p>
                <p className="text-2xl font-semibold text-gray-600">
                  {sortedIndices.length === array.length ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
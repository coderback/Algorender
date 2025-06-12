'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function MergeSortVisualiser() {
  const [array, setArray] = useState([64, 34, 25, 12, 22, 11, 90]);
  const [sortedIndices, setSortedIndices] = useState([]);
  const [comparingIndices, setComparingIndices] = useState([]);
  const [mergingIndices, setMergingIndices] = useState([]);
  const [isSorting, setIsSorting] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [arraySize, setArraySize] = useState(7);

  const generateArray = (size) => {
    const newArray = Array.from({ length: size }, () => Math.floor(Math.random() * 100));
    setArray(newArray);
    setSortedIndices([]);
    setComparingIndices([]);
    setMergingIndices([]);
  };

  const merge = async (arr, left, mid, right) => {
    const n1 = mid - left + 1;
    const n2 = right - mid;
    const L = arr.slice(left, mid + 1);
    const R = arr.slice(mid + 1, right + 1);

    let i = 0, j = 0, k = left;

    while (i < n1 && j < n2) {
      setComparingIndices([left + i, mid + 1 + j]);
      await new Promise(resolve => setTimeout(resolve, speed));

      if (L[i] <= R[j]) {
        arr[k] = L[i];
        i++;
      } else {
        arr[k] = R[j];
        j++;
      }
      k++;
      setArray([...arr]);
    }

    while (i < n1) {
      setMergingIndices([k]);
      await new Promise(resolve => setTimeout(resolve, speed));
      arr[k] = L[i];
      i++;
      k++;
      setArray([...arr]);
    }

    while (j < n2) {
      setMergingIndices([k]);
      await new Promise(resolve => setTimeout(resolve, speed));
      arr[k] = R[j];
      j++;
      k++;
      setArray([...arr]);
    }

    setComparingIndices([]);
    setMergingIndices([]);
  };

  const mergeSort = async (arr, left, right) => {
    if (left < right) {
      const mid = Math.floor((left + right) / 2);
      await mergeSort(arr, left, mid);
      await mergeSort(arr, mid + 1, right);
      await merge(arr, left, mid, right);
    }
  };

  const startSorting = async () => {
    setIsSorting(true);
    const arr = [...array];
    await mergeSort(arr, 0, arr.length - 1);
    setSortedIndices(Array.from({ length: arr.length }, (_, i) => i));
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
      title="Merge Sort Visualiser"
      description="Visualise the merge sort algorithm step by step."
      timeComplexity={{ best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' }}
      spaceComplexity="O(n)"
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
                      : comparingIndices.includes(index)
                      ? 'bg-yellow-500'
                      : mergingIndices.includes(index)
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
                <span>Divide array into two halves recursively</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Compare and merge sorted halves</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Combine results to form final sorted array</span>
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
                  onClick={startSorting}
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
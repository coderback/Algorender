'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function CountingSortVisualiser() {
  const [array, setArray] = useState([4, 2, 2, 8, 3, 3, 1]);
  const [countArray, setCountArray] = useState([]);
  const [outputArray, setOutputArray] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [countingIndex, setCountingIndex] = useState(null);
  const [isSorting, setIsSorting] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [arraySize, setArraySize] = useState(7);

  const generateArray = (size) => {
    const newArray = Array.from({ length: size }, () => Math.floor(Math.random() * 10));
    setArray(newArray);
    setCountArray([]);
    setOutputArray([]);
    setCurrentIndex(null);
    setCountingIndex(null);
  };

  const countingSort = async () => {
    setIsSorting(true);
    const arr = [...array];
    const max = Math.max(...arr);
    const count = new Array(max + 1).fill(0);
    const output = new Array(arr.length).fill(0);

    // Count occurrences
    for (let i = 0; i < arr.length; i++) {
      setCurrentIndex(i);
      setCountingIndex(arr[i]);
      await new Promise(resolve => setTimeout(resolve, speed));
      count[arr[i]]++;
      setCountArray([...count]);
    }

    // Calculate cumulative count
    for (let i = 1; i <= max; i++) {
      count[i] += count[i - 1];
      setCountArray([...count]);
      await new Promise(resolve => setTimeout(resolve, speed));
    }

    // Build output array
    for (let i = arr.length - 1; i >= 0; i--) {
      setCurrentIndex(i);
      setCountingIndex(arr[i]);
      await new Promise(resolve => setTimeout(resolve, speed));
      output[count[arr[i]] - 1] = arr[i];
      count[arr[i]]--;
      setCountArray([...count]);
      setOutputArray([...output]);
    }

    setArray([...output]);
    setCurrentIndex(null);
    setCountingIndex(null);
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
      title="Counting Sort Visualiser"
      description="Visualise the counting sort algorithm step by step."
      timeComplexity={{ best: 'O(n + k)', average: 'O(n + k)', worst: 'O(n + k)' }}
      spaceComplexity="O(k)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Array</h2>
            <div className="flex justify-center items-end space-x-2 h-64">
              {array.map((value, index) => (
                <div
                  key={index}
                  className={`w-12 flex flex-col items-center transition-all duration-300 ${
                    currentIndex === index
                      ? 'bg-yellow-500'
                      : 'bg-gray-200'
                  }`}
                  style={{
                    height: `${(value / 10) * 200}px`,
                    transition: 'height 0.3s ease-in-out'
                  }}
                >
                  <span className="text-sm font-medium text-gray-700 mt-2">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {countArray.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Count Array</h2>
              <div className="flex justify-center items-end space-x-2 h-64">
                {countArray.map((value, index) => (
                  <div
                    key={index}
                    className={`w-12 flex flex-col items-center transition-all duration-300 ${
                      countingIndex === index
                        ? 'bg-blue-500'
                        : 'bg-gray-200'
                    }`}
                    style={{
                      height: `${(value / Math.max(...countArray)) * 200}px`,
                      transition: 'height 0.3s ease-in-out'
                    }}
                  >
                    <span className="text-sm font-medium text-gray-700 mt-2">{value}</span>
                    <span className="text-xs text-gray-500">{index}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Count occurrences of each element</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Calculate cumulative count</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Build sorted array using counts</span>
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
                  onClick={countingSort}
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
                <p className="text-sm text-gray-500">Range</p>
                <p className="text-2xl font-semibold text-gray-600">
                  {Math.max(...array) - Math.min(...array) + 1}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
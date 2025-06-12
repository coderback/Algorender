'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function RadixSortVisualiser() {
  const [array, setArray] = useState([170, 45, 75, 90, 802, 24, 2, 66]);
  const [currentDigit, setCurrentDigit] = useState(null);
  const [buckets, setBuckets] = useState([]);
  const [isSorting, setIsSorting] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [arraySize, setArraySize] = useState(8);

  const generateArray = (size) => {
    const newArray = Array.from({ length: size }, () => Math.floor(Math.random() * 1000));
    setArray(newArray);
    setCurrentDigit(null);
    setBuckets([]);
  };

  const getDigit = (num, place) => {
    return Math.floor(Math.abs(num) / Math.pow(10, place)) % 10;
  };

  const getMaxDigits = (arr) => {
    return Math.max(...arr).toString().length;
  };

  const radixSort = async () => {
    setIsSorting(true);
    let arr = [...array];
    const maxDigits = getMaxDigits(arr);

    for (let i = 0; i < maxDigits; i++) {
      setCurrentDigit(i);
      const buckets = Array.from({ length: 10 }, () => []);
      setBuckets(buckets);

      // Distribute numbers into buckets
      for (let j = 0; j < arr.length; j++) {
        const digit = getDigit(arr[j], i);
        buckets[digit].push(arr[j]);
        setBuckets([...buckets]);
        await new Promise(resolve => setTimeout(resolve, speed));
      }

      // Collect numbers from buckets
      arr = buckets.flat();
      setArray([...arr]);
      await new Promise(resolve => setTimeout(resolve, speed));
    }

    setCurrentDigit(null);
    setBuckets([]);
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
      title="Radix Sort Visualiser"
      description="Visualise the radix sort algorithm step by step."
      timeComplexity={{ best: 'O(nk)', average: 'O(nk)', worst: 'O(nk)' }}
      spaceComplexity="O(n + k)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Array</h2>
            <div className="flex justify-center items-end space-x-2 h-64">
              {array.map((value, index) => (
                <div
                  key={index}
                  className="w-12 flex flex-col items-center transition-all duration-300 bg-gray-200"
                  style={{
                    height: `${(value / 1000) * 200}px`,
                    transition: 'height 0.3s ease-in-out'
                  }}
                >
                  <span className="text-sm font-medium text-gray-700 mt-2">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {buckets.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Buckets (Digit {currentDigit})
              </h2>
              <div className="grid grid-cols-5 gap-4">
                {buckets.map((bucket, index) => (
                  <div key={index} className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm font-medium text-gray-500 mb-2">Bucket {index}</p>
                    <div className="space-y-1">
                      {bucket.map((value, i) => (
                        <div
                          key={i}
                          className="text-sm text-gray-700 bg-gray-50 p-1 rounded"
                        >
                          {value}
                        </div>
                      ))}
                    </div>
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
                <span>Sort numbers by each digit position</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Use counting sort for each digit</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Start from least significant digit</span>
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
                  onClick={radixSort}
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
                <p className="text-sm text-gray-500">Max Digits</p>
                <p className="text-2xl font-semibold text-gray-600">
                  {Math.max(...array).toString().length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
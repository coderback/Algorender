'use client';

import { useState, useRef } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function BinarySearchVisualiser() {
  const [array, setArray] = useState(Array.from({ length: 8 }, () => Math.floor(Math.random() * 100)).sort((a, b) => a - b));
  const [target, setTarget] = useState('');
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [mid, setMid] = useState(null);
  const [foundIndex, setFoundIndex] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(500);
  const isSearchingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Keep refs in sync with state
  const setIsSearchingSafe = (val) => {
    isSearchingRef.current = val;
    setIsSearching(val);
  };
  const setIsPausedSafe = (val) => {
    isPausedRef.current = val;
    setIsPaused(val);
  };

  const generateArray = () => {
    const newArray = Array.from({ length: 8 }, () => Math.floor(Math.random() * 100))
      .sort((a, b) => a - b);
    setArray(newArray);
    setLeft(null);
    setRight(null);
    setMid(null);
    setFoundIndex(null);
  };

  const binarySearch = async () => {
    if (!target) return;
    
    setIsSearchingSafe(true);
    setLeft(0);
    setRight(array.length - 1);
    setMid(null);
    setFoundIndex(null);

    let l = 0;
    let r = array.length - 1;

    while (l <= r) {
      if (!isSearchingRef.current) break; // Stop if search is cancelled
      
      // Handle pause
      while (isPausedRef.current && isSearchingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const m = Math.floor((l + r) / 2);
      setMid(m);
      await new Promise(resolve => setTimeout(resolve, speed));

      if (array[m] === parseInt(target)) {
        setFoundIndex(m);
        break;
      }

      if (array[m] < parseInt(target)) {
        l = m + 1;
        setLeft(l);
      } else {
        r = m - 1;
        setRight(r);
      }
    }

    setIsSearchingSafe(false);
  };

  const reset = () => {
    setIsSearchingSafe(false);
    setIsPausedSafe(false);
    generateArray();
    setTarget('');
    setLeft(null);
    setRight(null);
    setMid(null);
    setFoundIndex(null);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  const togglePause = () => {
    setIsPausedSafe(!isPausedRef.current);
  };

  return (
    <Layout
      title="Binary Search Visualiser"
      description="Visualise the binary search algorithm step by step."
      timeComplexity={{ best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' }}
      spaceComplexity="O(1)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Array</h2>
            <div className="flex justify-center items-center space-x-2 py-8">
              {array.map((value, index) => (
                <div
                  key={index}
                  className={`w-14 h-14 flex items-center justify-center rounded-md border-2 text-lg font-semibold transition-all duration-300 ${
                    foundIndex === index
                      ? 'bg-green-500 text-white border-green-700'
                      : mid === index
                      ? 'bg-blue-500 text-white border-blue-700'
                      : left !== null && right !== null && index >= left && index <= right
                      ? 'bg-yellow-100 border-yellow-400 text-gray-900'
                      : 'bg-gray-100 border-gray-300 text-gray-800'
                  }`}
                >
                  {value}
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
                <span>Array must be sorted</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Compare target with middle element</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Eliminate half of the array in each step</span>
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
                  Target Value
                </label>
                <InputControl
                  type="number"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  disabled={isSearching}
                  placeholder="Enter value to search"
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
                  disabled={isSearching}
                />
              </div>
              <div className="flex space-x-4">
                <Button
                  onClick={binarySearch}
                  disabled={isSearching || !target}
                  className="flex-1"
                >
                  {isSearching ? 'Searching...' : 'Start Search'}
                </Button>
                {isSearching && (
                  <Button
                    onClick={togglePause}
                    variant="secondary"
                    className="flex-1"
                  >
                    {isPaused ? 'Resume' : 'Pause'}
                  </Button>
                )}
                <Button
                  onClick={reset}
                  disabled={isSearching && !isPaused}
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
                <p className="text-sm text-gray-500">Found Index</p>
                <p className="text-2xl font-semibold text-gray-600">
                  {foundIndex !== null ? foundIndex : 'Not Found'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
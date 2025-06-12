'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function InterpolationSearchVisualiser() {
  const [array, setArray] = useState([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  const [target, setTarget] = useState('');
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [pos, setPos] = useState(null);
  const [foundIndex, setFoundIndex] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [arraySize, setArraySize] = useState(10);

  const generateArray = (size) => {
    const newArray = Array.from({ length: size }, (_, i) => (i + 1) * 10);
    setArray(newArray);
    setLeft(null);
    setRight(null);
    setPos(null);
    setFoundIndex(null);
  };

  const interpolationSearch = async () => {
    if (!target) return;
    
    setIsSearching(true);
    setLeft(0);
    setRight(array.length - 1);
    setPos(null);
    setFoundIndex(null);

    let low = 0;
    let high = array.length - 1;
    const targetValue = parseInt(target);

    while (low <= high && targetValue >= array[low] && targetValue <= array[high]) {
      if (low === high) {
        if (array[low] === targetValue) {
          setFoundIndex(low);
        }
        break;
      }

      const pos = Math.floor(
        low + ((high - low) * (targetValue - array[low])) / (array[high] - array[low])
      );
      setPos(pos);
      await new Promise(resolve => setTimeout(resolve, speed));

      if (array[pos] === targetValue) {
        setFoundIndex(pos);
        break;
      }

      if (array[pos] < targetValue) {
        low = pos + 1;
        setLeft(low);
      } else {
        high = pos - 1;
        setRight(high);
      }
    }

    setIsSearching(false);
  };

  const reset = () => {
    generateArray(arraySize);
    setTarget('');
    setLeft(null);
    setRight(null);
    setPos(null);
    setFoundIndex(null);
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
      title="Interpolation Search Visualiser"
      description="Visualise the interpolation search algorithm step by step."
      timeComplexity={{ best: 'O(1)', average: 'O(log log n)', worst: 'O(n)' }}
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
                    foundIndex === index
                      ? 'bg-green-500'
                      : pos === index
                      ? 'bg-blue-500'
                      : left !== null && right !== null && index >= left && index <= right
                      ? 'bg-yellow-100'
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
                <span>Array must be sorted and uniformly distributed</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses position formula based on value distribution</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>More efficient than binary search for uniform data</span>
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
                  Array Size
                </label>
                <InputControl
                  type="range"
                  min="5"
                  max="20"
                  value={arraySize}
                  onChange={handleArraySizeChange}
                  disabled={isSearching}
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
                  onClick={interpolationSearch}
                  disabled={isSearching || !target}
                  className="flex-1"
                >
                  {isSearching ? 'Searching...' : 'Start Search'}
                </Button>
                <Button
                  onClick={reset}
                  disabled={isSearching}
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
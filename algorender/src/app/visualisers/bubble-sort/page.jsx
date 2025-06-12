'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function BubbleSort() {
  const [array, setArray] = useState([64, 34, 25, 12, 22, 11, 90]);
  const [isSorting, setIsSorting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [comparisons, setComparisons] = useState(0);
  const [swaps, setSwaps] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [sortedIndices, setSortedIndices] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [speed, setSpeed] = useState(500); // Delay in milliseconds

  const bubbleSort = async () => {
    setIsSorting(true);
    setComparisons(0);
    setSwaps(0);
    setSortedIndices([]);
    
    const arr = [...array];
    const n = arr.length;
    let newComparisons = 0;
    let newSwaps = 0;
    
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - i - 1; j++) {
        setSelectedIndices([j, j + 1]);
        newComparisons++;
        setComparisons(newComparisons);
        
        await new Promise(resolve => setTimeout(resolve, speed));
        
        if (arr[j] > arr[j + 1]) {
          // Swap elements
          [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
          setArray([...arr]);
          newSwaps++;
          setSwaps(newSwaps);
        }
      }
      setSortedIndices(prev => [...prev, n - i - 1]);
    }
    
    setSortedIndices(prev => [...prev, 0]);
    setSelectedIndices([]);
    setIsSorting(false);
  };

  const reset = () => {
    setArray([64, 34, 25, 12, 22, 11, 90]);
    setSelectedIndices([]);
    setSortedIndices([]);
    setComparisons(0);
    setSwaps(0);
    setIsSorting(false);
  };

  const addNumber = () => {
    const num = parseInt(inputValue);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setArray([...array, num]);
      setInputValue('');
    }
  };

  const removeNumber = (index) => {
    const newArray = array.filter((_, i) => i !== index);
    setArray(newArray);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Bubble Sort Visualiser"
      description="Visualise bubble sort algorithm with step-by-step comparisons and swaps."
      timeComplexity={{
        best: 'O(n)',
        average: 'O(n²)',
        worst: 'O(n²)'
      }}
      spaceComplexity="O(1)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Bubble Sort</h2>
            <div className="flex items-end justify-center space-x-2 h-64 bg-white rounded-lg p-4">
              {array.map((value, index) => (
                <div
                  key={index}
                  className={`relative flex flex-col items-center transition-all duration-300 ${
                    selectedIndices.includes(index)
                      ? 'bg-blue-500'
                      : sortedIndices.includes(index)
                      ? 'bg-green-500'
                      : 'bg-gray-200'
                  }`}
                  style={{
                    height: `${(value / 100) * 200}px`,
                    width: '40px',
                    minWidth: '40px',
                  }}
                >
                  <span className="absolute -top-6 text-sm font-mono">{value}</span>
                  <button
                    onClick={() => removeNumber(index)}
                    className="absolute -top-8 text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
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
                <span>Compare adjacent elements and swap if they are in wrong order</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>After each pass, the largest element bubbles up to its correct position</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
            <div className="space-y-4">
              <InputControl
                label="Add Number (0-100)"
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                min="0"
                max="100"
              />
              <div className="flex space-x-2">
                <Button
                  onClick={addNumber}
                  disabled={isSorting}
                  className="flex-1"
                >
                  Add Number
                </Button>
                <Button
                  onClick={bubbleSort}
                  disabled={isSorting || array.length < 2}
                  className="flex-1"
                >
                  {isSorting ? 'Sorting...' : 'Sort'}
                </Button>
                <Button
                  onClick={reset}
                  disabled={isSorting}
                  className="flex-1"
                >
                  Reset
                </Button>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Animation Speed
                </label>
                <input
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Array Size</h4>
                <p className="text-2xl font-semibold text-blue-600">{array.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Comparisons</h4>
                <p className="text-2xl font-semibold text-gray-900">{comparisons}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Swaps</h4>
                <p className="text-2xl font-semibold text-gray-900">{swaps}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Sorted</h4>
                <p className="text-2xl font-semibold text-gray-900">
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
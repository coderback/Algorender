'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import SortingChart from '@/components/SortingChart';

// Function to generate random array of 8 numbers between 10 and 99
const generateRandomArray = () => {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 90) + 10);
};

export default function RadixSort() {
  const [array, setArray] = useState([]);
  const [isSorting, setIsSorting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [operations, setOperations] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [sortedIndices, setSortedIndices] = useState([]);
  const [currentDigit, setCurrentDigit] = useState(null);
  const [speed, setSpeed] = useState(500); // Delay in milliseconds
  
  const pauseRef = useRef(false);
  const sortingRef = useRef(false);

  // Initialize array on client side to prevent hydration mismatch
  useEffect(() => {
    setArray(generateRandomArray());
  }, []);

  const sleep = async (ms) => {
    while (pauseRef.current) {
      await new Promise(r => setTimeout(r, 100)); // Check every 100ms
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Function to get digit at position exp
  const getDigit = (num, exp) => {
    return Math.floor(num / Math.pow(10, exp)) % 10;
  };

  // Function to perform counting sort for a specific digit
  const countingSortForDigit = async (arr, exp, newOperations) => {
    const n = arr.length;
    const output = new Array(n).fill(0);
    const count = new Array(10).fill(0);
    
    // Store count of occurrences
    for (let i = 0; i < n && sortingRef.current; i++) {
      const digit = getDigit(arr[i], exp);
      count[digit]++;
      setSelectedIndices([i]);
      newOperations.value++;
      setOperations(newOperations.value);
      await sleep(speed);
    }
    
    // Change count[i] so that count[i] contains actual
    // position of this digit in output[]
    for (let i = 1; i < 10 && sortingRef.current; i++) {
      count[i] += count[i - 1];
      newOperations.value++;
      setOperations(newOperations.value);
    }
    
    // Build the output array
    for (let i = n - 1; i >= 0 && sortingRef.current; i--) {
      const digit = getDigit(arr[i], exp);
      output[count[digit] - 1] = arr[i];
      count[digit]--;
      setSelectedIndices([i]);
      newOperations.value++;
      setOperations(newOperations.value);
      await sleep(speed);
    }
    
    // Copy the output array to arr[]
    for (let i = 0; i < n && sortingRef.current; i++) {
      arr[i] = output[i];
      setArray([...arr]);
      newOperations.value++;
      setOperations(newOperations.value);
      await sleep(speed);
    }
  };

  const radixSort = async () => {
    if (isSorting) return;
    
    setIsSorting(true);
    sortingRef.current = true;
    setOperations(0);
    setSortedIndices([]);
    setCurrentDigit(null);
    pauseRef.current = false;
    setIsPaused(false);
    
    const arr = [...array];
    const newOperations = { value: 0 };
    
    try {
      // Since we're working with numbers between 10-99, we only need 2 digits
      // Do counting sort for ones (exp = 0) and tens (exp = 1)
      for (let exp = 0; exp < 2 && sortingRef.current; exp++) {
        setCurrentDigit(exp);
        await countingSortForDigit(arr, exp, newOperations);
        
        // Mark all elements as sorted after processing tens digit
        if (exp === 1) {
          setSortedIndices(Array.from({ length: arr.length }, (_, i) => i));
        }
      }
    } finally {
      setSelectedIndices([]);
      setCurrentDigit(null);
      setIsSorting(false);
      setIsPaused(false);
      pauseRef.current = false;
      sortingRef.current = false;
    }
  };

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
    pauseRef.current = !pauseRef.current;
  };

  const reset = () => {
    sortingRef.current = false; // Stop any ongoing sorting
    setArray(generateRandomArray());
    setSelectedIndices([]);
    setSortedIndices([]);
    setOperations(0);
    setCurrentDigit(null);
    setIsSorting(false);
    setIsPaused(false);
    pauseRef.current = false;
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Radix Sort Visualiser"
      description="Visualise radix sort algorithm with step-by-step operations."
      timeComplexity={{
        best: 'O(nk)',
        average: 'O(nk)',
        worst: 'O(nk)'
      }}
      spaceComplexity="O(n + k)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Radix Sort {currentDigit !== null && `(Sorting ${currentDigit === 0 ? 'ones' : 'tens'} digit)`}
            </h2>
            <SortingChart
              array={array}
              selectedIndices={selectedIndices}
              sortedIndices={sortedIndices}
              showRemove={false}
            />
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Sort numbers digit by digit, starting from least significant</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Use counting sort for each digit position</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Blue bars show current element, green bars show sorted elements</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Controls</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={radixSort}
                  disabled={isSorting && !isPaused}
                  variant="primary"
                >
                  {isSorting && !isPaused ? 'Sorting...' : 'Sort'}
                </Button>
                {isSorting && (
                  <Button
                    onClick={handlePauseResume}
                    variant="secondary"
                  >
                    {isPaused ? 'Resume' : 'Pause'}
                  </Button>
                )}
                <Button
                  onClick={reset}
                  disabled={isSorting && !isPaused}
                  variant="secondary"
                >
                  New Array
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
                  disabled={isSorting && !isPaused}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50"
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
                <h4 className="text-sm font-medium text-gray-700 mb-1">Operations</h4>
                <p className="text-2xl font-semibold text-gray-900">{operations}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Current Digit</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {currentDigit === null ? '-' : currentDigit === 0 ? 'Ones' : 'Tens'}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Status</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {isSorting ? (isPaused ? 'Paused' : 'Sorting') : sortedIndices.length === array.length ? 'Sorted' : 'Unsorted'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
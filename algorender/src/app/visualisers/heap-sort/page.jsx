'use client';

import { useState, useRef } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import SortingChart from '@/components/SortingChart';

// Function to generate random array of 8 numbers between 10 and 99
const generateRandomArray = () => {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 90) + 10);
};

export default function HeapSort() {
  const [array, setArray] = useState(generateRandomArray());
  const [isSorting, setIsSorting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [comparisons, setComparisons] = useState(0);
  const [swaps, setSwaps] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [sortedIndices, setSortedIndices] = useState([]);
  const [speed, setSpeed] = useState(500); // Delay in milliseconds
  
  const pauseRef = useRef(false);
  const sortingRef = useRef(false);

  const sleep = async (ms) => {
    while (pauseRef.current) {
      await new Promise(r => setTimeout(r, 100)); // Check every 100ms
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  const heapify = async (arr, n, i, newComparisons, newSwaps) => {
    let largest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    
    // Compare with left child
    if (left < n) {
      setSelectedIndices([largest, left]);
      newComparisons.value++;
      setComparisons(newComparisons.value);
      await sleep(speed);
      
      if (arr[left] > arr[largest]) {
        largest = left;
      }
    }
    
    // Compare with right child
    if (right < n) {
      setSelectedIndices([largest, right]);
      newComparisons.value++;
      setComparisons(newComparisons.value);
      await sleep(speed);
      
      if (arr[right] > arr[largest]) {
        largest = right;
      }
    }
    
    // If largest is not root
    if (largest !== i && sortingRef.current) {
      [arr[i], arr[largest]] = [arr[largest], arr[i]];
      setArray([...arr]);
      newSwaps.value++;
      setSwaps(newSwaps.value);
      await sleep(speed);
      
      // Recursively heapify the affected sub-tree
      await heapify(arr, n, largest, newComparisons, newSwaps);
    }
  };

  const heapSort = async () => {
    if (isSorting) return;
    
    setIsSorting(true);
    sortingRef.current = true;
    setComparisons(0);
    setSwaps(0);
    setSortedIndices([]);
    pauseRef.current = false;
    setIsPaused(false);
    
    const arr = [...array];
    const n = arr.length;
    const newComparisons = { value: 0 };
    const newSwaps = { value: 0 };
    
    try {
      // Build max heap
      for (let i = Math.floor(n / 2) - 1; i >= 0 && sortingRef.current; i--) {
        await heapify(arr, n, i, newComparisons, newSwaps);
      }
      
      // Extract elements from heap one by one
      for (let i = n - 1; i > 0 && sortingRef.current; i--) {
        // Move current root to end
        [arr[0], arr[i]] = [arr[i], arr[0]];
        setArray([...arr]);
        newSwaps.value++;
        setSwaps(newSwaps.value);
        
        setSortedIndices(prev => [...prev, i]);
        await sleep(speed);
        
        // Call max heapify on the reduced heap
        await heapify(arr, i, 0, newComparisons, newSwaps);
      }
      
      // Mark the first element as sorted
      setSortedIndices(prev => [...prev, 0]);
      
    } finally {
      setSelectedIndices([]);
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
    setComparisons(0);
    setSwaps(0);
    setIsSorting(false);
    setIsPaused(false);
    pauseRef.current = false;
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Heap Sort Visualiser"
      description="Visualise heap sort algorithm with step-by-step comparisons and swaps."
      timeComplexity={{
        best: 'O(n log n)',
        average: 'O(n log n)',
        worst: 'O(n log n)'
      }}
      spaceComplexity="O(1)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Heap Sort</h2>
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
                <span>Build a max heap from the array</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Repeatedly extract max element and rebuild heap</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Blue bars show current comparison, green bars show sorted elements</span>
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
                  onClick={heapSort}
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
                <h4 className="text-sm font-medium text-gray-700 mb-1">Comparisons</h4>
                <p className="text-2xl font-semibold text-gray-900">{comparisons}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Swaps</h4>
                <p className="text-2xl font-semibold text-gray-900">{swaps}</p>
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
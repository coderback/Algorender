'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import SortingChart from '@/components/SortingChart';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaSort, FaTachometerAlt, FaPlay, FaPause, FaUndo, FaRandom } from 'react-icons/fa';

// Function to generate random array of 8 numbers between 10 and 99
const generateRandomArray = () => {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 90) + 10);
};

export default function QuickSort() {
  const [array, setArray] = useState([]);
  const [isSorting, setIsSorting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [comparisons, setComparisons] = useState(0);
  const [swaps, setSwaps] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [sortedIndices, setSortedIndices] = useState([]);
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

  const partition = async (arr, low, high, newComparisons, newSwaps) => {
    const pivot = arr[high];
    let i = low - 1;
    
    for (let j = low; j < high && sortingRef.current; j++) {
      setSelectedIndices([j, high]); // Compare with pivot
      newComparisons.value++;
      setComparisons(newComparisons.value);
      
      await sleep(speed);
      
      if (arr[j] < pivot) {
        i++;
        // Swap elements
        [arr[i], arr[j]] = [arr[j], arr[i]];
        setArray([...arr]);
        newSwaps.value++;
        setSwaps(newSwaps.value);
        await sleep(speed);
      }
    }
    
    // Place pivot in correct position
    if (i + 1 !== high) {
      [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
      setArray([...arr]);
      newSwaps.value++;
      setSwaps(newSwaps.value);
      await sleep(speed);
    }
    
    return i + 1;
  };

  const quickSortHelper = async (arr, low, high, newComparisons, newSwaps) => {
    if (low < high && sortingRef.current) {
      const pi = await partition(arr, low, high, newComparisons, newSwaps);
      
      // Mark the pivot as sorted
      setSortedIndices(prev => [...prev, pi]);
      
      // Recursively sort elements before and after partition
      await quickSortHelper(arr, low, pi - 1, newComparisons, newSwaps);
      await quickSortHelper(arr, pi + 1, high, newComparisons, newSwaps);
    } else if (low === high) {
      // Single element is always sorted
      setSortedIndices(prev => [...prev, low]);
    }
  };

  const quickSort = async () => {
    if (isSorting) return;
    
    setIsSorting(true);
    sortingRef.current = true;
    setComparisons(0);
    setSwaps(0);
    setSortedIndices([]);
    pauseRef.current = false;
    setIsPaused(false);
    
    const arr = [...array];
    const newComparisons = { value: 0 };
    const newSwaps = { value: 0 };
    
    try {
      await quickSortHelper(arr, 0, arr.length - 1, newComparisons, newSwaps);
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
      title="Quick Sort Visualiser"
      description="Visualise quick sort algorithm with step-by-step comparisons and swaps."
      timeComplexity={{
        best: 'O(n log n)',
        average: 'O(n log n)',
        worst: 'O(n²)'
      }}
      spaceComplexity="O(log n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Sort</h2>
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
                <span>Choose a pivot element and partition the array</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Move smaller elements to left and larger to right of pivot</span>
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
                  onClick={quickSort}
                  disabled={isSorting && !isPaused}
                  variant="primary"
                  className="flex items-center justify-center gap-2"
                >
                  <FaSort className="text-sm" />
                  {isSorting && !isPaused ? 'Sorting...' : 'Sort'}
                </Button>
                {isSorting && (
                  <Button
                    onClick={handlePauseResume}
                    variant="secondary"
                    className="flex items-center justify-center gap-2"
                  >
                    {isPaused ? <FaPlay className="text-sm" /> : <FaPause className="text-sm" />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </Button>
                )}
                <Button
                  onClick={reset}
                  disabled={isSorting && !isPaused}
                  variant="secondary"
                  className="flex items-center justify-center gap-2"
                >
                  <FaRandom className="text-sm" />
                  New Array
                </Button>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                  <FaTachometerAlt className="text-blue-400" />
                  Animation Speed
                  <span className="ml-auto text-xs text-gray-500">{(1000 - speed)} ms</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isSorting && !isPaused}
                  className="w-full h-2 bg-gradient-to-r from-blue-200 to-blue-500 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all"
                  style={{ accentColor: '#2563eb' }}
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
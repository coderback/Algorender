'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import SortingChart from '@/components/SortingChart';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaSort, FaTachometerAlt, FaPlay, FaPause, FaUndo, FaRandom } from 'react-icons/fa';
import { SpeedControl, VisualizerButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

// Function to generate random array of 8 numbers between 10 and 99
const generateRandomArray = () => {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 90) + 10);
};

export default function MergeSort() {
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

  const merge = async (arr, left, mid, right, newComparisons, newSwaps) => {
    const n1 = mid - left + 1;
    const n2 = right - mid;
    const L = arr.slice(left, mid + 1);
    const R = arr.slice(mid + 1, right + 1);
    
    let i = 0, j = 0, k = left;
    
    while (i < n1 && j < n2 && sortingRef.current) {
      setSelectedIndices([left + i, mid + 1 + j]);
      newComparisons.value++;
      setComparisons(newComparisons.value);
      
      await sleep(speed);
      
      if (L[i] <= R[j]) {
        arr[k] = L[i];
        i++;
      } else {
        arr[k] = R[j];
        j++;
      }
      setArray([...arr]);
      newSwaps.value++;
      setSwaps(newSwaps.value);
      k++;
    }
    
    while (i < n1 && sortingRef.current) {
      arr[k] = L[i];
      setArray([...arr]);
      i++;
      k++;
    }
    
    while (j < n2 && sortingRef.current) {
      arr[k] = R[j];
      setArray([...arr]);
      j++;
      k++;
    }
    
    // Mark the merged portion as sorted
    for (let idx = left; idx <= right; idx++) {
      setSortedIndices(prev => [...prev, idx]);
    }
  };

  const mergeSortHelper = async (arr, left, right, newComparisons, newSwaps) => {
    if (left < right && sortingRef.current) {
      const mid = Math.floor((left + right) / 2);
      
      await mergeSortHelper(arr, left, mid, newComparisons, newSwaps);
      await mergeSortHelper(arr, mid + 1, right, newComparisons, newSwaps);
      
      await merge(arr, left, mid, right, newComparisons, newSwaps);
    } else if (left === right) {
      setSortedIndices(prev => [...prev, left]);
    }
  };

  const mergeSort = async () => {
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
      await mergeSortHelper(arr, 0, arr.length - 1, newComparisons, newSwaps);
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
      title="Merge Sort Visualiser"
      description="Visualise merge sort algorithm with step-by-step comparisons and merges."
      timeComplexity={{
        best: 'O(n log n)',
        average: 'O(n log n)',
        worst: 'O(n log n)'
      }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Merge Sort</h2>
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
                <span>Divide array into two halves recursively</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Merge sorted halves by comparing elements</span>
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
          <ControlsSection>
            <VisualizerButtonGrid
              primaryAction={ButtonPresets.sort.primary(mergeSort, isSorting, isPaused)}
              pauseAction={isSorting ? { onClick: handlePauseResume } : null}
              resetAction={ButtonPresets.sort.reset(reset)}
              isRunning={isSorting}
              isPaused={isPaused}
            />
            <SpeedControl
              speed={speed}
              onSpeedChange={handleSpeedChange}
              disabled={isSorting && !isPaused}
              label="Animation Speed"
            />
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Array Size', value: array.length, color: 'text-blue-600' },
              { label: 'Comparisons', value: comparisons },
              { label: 'Merges', value: swaps },
              { label: 'Status', value: isSorting ? (isPaused ? 'Paused' : 'Sorting') : sortedIndices.length === array.length ? 'Sorted' : 'Unsorted' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import SortingChart from '@/components/SortingChart';
import { SpeedControl, VisualizerButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

// Function to generate random array of 8 numbers between 10 and 99
const generateRandomArray = () => {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 90) + 10);
};

export default function CountingSort() {
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

  const countingSort = async () => {
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
    let newComparisons = 0;
    let newSwaps = 0;
    
    try {
      // Find the maximum element
      let max = arr[0];
      for (let i = 1; i < n && sortingRef.current; i++) {
        setSelectedIndices([i]);
        newComparisons++;
        await sleep(speed);
        
        if (arr[i] > max) {
          max = arr[i];
        }
      }
      
      // Create count array
      const count = new Array(max + 1).fill(0);
      
      // Store count of each element
      for (let i = 0; i < n && sortingRef.current; i++) {
        setSelectedIndices([i]);
        count[arr[i]]++;
        newComparisons++;
        await sleep(speed);
      }
      
      // Modify count array to store actual positions
      for (let i = 1; i <= max && sortingRef.current; i++) {
        count[i] += count[i - 1];
        newComparisons++;
        await sleep(speed);
      }
      
      // Build the output array
      const output = new Array(n);
      for (let i = n - 1; i >= 0 && sortingRef.current; i--) {
        setSelectedIndices([i]);
        output[count[arr[i]] - 1] = arr[i];
        count[arr[i]]--;
        newSwaps++;
        newComparisons++;
        await sleep(speed);
      }
      
      // Copy the output array to original array
      for (let i = 0; i < n && sortingRef.current; i++) {
        arr[i] = output[i];
        setArray([...arr]);
        setSortedIndices(prev => [...prev, i]);
        newComparisons++;
        await sleep(speed);
      }
    } finally {
      setSelectedIndices([]);
      setIsSorting(false);
      setIsPaused(false);
      pauseRef.current = false;
      sortingRef.current = false;
      setComparisons(newComparisons);
      setSwaps(newSwaps);
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
      title="Counting Sort Visualiser"
      description="Visualise counting sort algorithm with step-by-step operations."
      timeComplexity={{
        best: 'O(n + k)',
        average: 'O(n + k)',
        worst: 'O(n + k)'
      }}
      spaceComplexity="O(k)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Counting Sort</h2>
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
                <span>Count occurrences of each element</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Calculate cumulative positions</span>
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
          <ControlsSection>
            <VisualizerButtonGrid
              primaryAction={ButtonPresets.sort.primary(countingSort, isSorting, isPaused)}
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
              { label: 'Swaps', value: swaps },
              { label: 'Status', value: isSorting ? (isPaused ? 'Paused' : 'Sorting') : sortedIndices.length === array.length ? 'Sorted' : 'Unsorted' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
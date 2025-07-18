'use client';

import { useState, useRef } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { SpeedControl, VisualizerButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

export default function InterpolationSearchVisualiser() {
  const [array, setArray] = useState(Array.from({ length: 8 }, (_, i) => (i + 1) * 10));
  const [target, setTarget] = useState('');
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [pos, setPos] = useState(null);
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
    const newArray = Array.from({ length: 8 }, (_, i) => (i + 1) * 10);
    setArray(newArray);
    setLeft(null);
    setRight(null);
    setPos(null);
    setFoundIndex(null);
  };

  const interpolationSearch = async () => {
    if (!target) return;
    
    setIsSearchingSafe(true);
    setLeft(0);
    setRight(array.length - 1);
    setPos(null);
    setFoundIndex(null);

    let low = 0;
    let high = array.length - 1;
    const targetValue = parseInt(target);

    while (low <= high && targetValue >= array[low] && targetValue <= array[high]) {
      if (!isSearchingRef.current) break; // Stop if search is cancelled
      
      // Handle pause
      while (isPausedRef.current && isSearchingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

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

    setIsSearchingSafe(false);
  };

  const reset = () => {
    setIsSearchingSafe(false);
    setIsPausedSafe(false);
    generateArray();
    setTarget('');
    setLeft(null);
    setRight(null);
    setPos(null);
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
      title="Interpolation Search Visualiser"
      description="Visualise the interpolation search algorithm step by step."
      timeComplexity={{ best: 'O(1)', average: 'O(log log n)', worst: 'O(n)' }}
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
                      : pos === index
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
          <ControlsSection>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
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
            <VisualizerButtonGrid
              primaryAction={{
                ...ButtonPresets.search.primary(interpolationSearch, isSearching, isPaused),
                disabled: isSearching || !target
              }}
              pauseAction={isSearching ? { onClick: togglePause } : null}
              resetAction={ButtonPresets.search.reset(reset)}
              isRunning={isSearching}
              isPaused={isPaused}
            />
            <SpeedControl
              speed={speed}
              onSpeedChange={handleSpeedChange}
              disabled={isSearching}
            />
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Array Size', value: array.length, color: 'text-blue-600' },
              { label: 'Found Index', value: foundIndex !== null ? foundIndex : 'Not Found' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
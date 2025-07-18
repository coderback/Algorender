'use client';

import { useState, useRef, useEffect } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SpeedControl, VisualizerButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

export default function FibonacciSearchVisualiser() {
  const [array, setArray] = useState([]);
  const [target, setTarget] = useState('');
  const [currentIndex, setCurrentIndex] = useState(null);
  const [foundIndex, setFoundIndex] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(500);
  const isSearchingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Initialize array on client side to prevent hydration mismatch
  useEffect(() => {
    const newArray = Array.from({ length: 8 }, () => Math.floor(Math.random() * 100)).sort((a, b) => a - b);
    setArray(newArray);
  }, []);

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
    const newArray = Array.from({ length: 8 }, () => Math.floor(Math.random() * 100)).sort((a, b) => a - b);
    setArray(newArray);
    setCurrentIndex(null);
    setFoundIndex(null);
  };

  const fibonacciSearch = async () => {
    if (!target) return;
    
    setIsSearchingSafe(true);
    setCurrentIndex(null);
    setFoundIndex(null);

    const targetValue = parseInt(target);
    let fib2 = 0;
    let fib1 = 1;
    let fib = fib1 + fib2;

    while (fib < array.length) {
      fib2 = fib1;
      fib1 = fib;
      fib = fib1 + fib2;
    }

    let offset = -1;

    while (fib > 1) {
      if (!isSearchingRef.current) break;
      
      const i = Math.min(offset + fib2, array.length - 1);
      setCurrentIndex(i);
      
      // Handle pause
      while (isPausedRef.current && isSearchingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await new Promise(resolve => setTimeout(resolve, speed));
      
      if (array[i] < targetValue) {
        fib = fib1;
        fib1 = fib2;
        fib2 = fib - fib1;
        offset = i;
      } else if (array[i] > targetValue) {
        fib = fib2;
        fib1 = fib1 - fib2;
        fib2 = fib - fib1;
      } else {
        setFoundIndex(i);
        break;
      }
    }

    if (fib1 && offset < array.length - 1 && array[offset + 1] === targetValue) {
      setFoundIndex(offset + 1);
    }

    setIsSearchingSafe(false);
  };

  const reset = () => {
    setIsSearchingSafe(false);
    setIsPausedSafe(false);
    generateArray();
    setTarget('');
    setCurrentIndex(null);
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
      title="Fibonacci Search Visualiser"
      description="Visualise the Fibonacci search algorithm step by step."
      timeComplexity={{ best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' }}
      spaceComplexity="O(1)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Sorted Array</h2>
            <div className="flex justify-center items-center space-x-2 py-8">
              {array.map((value, index) => (
                <div
                  key={index}
                  className={`w-14 h-14 flex items-center justify-center rounded-md border-2 text-lg font-semibold transition-all duration-300 ${
                    foundIndex === index
                      ? 'bg-green-500 text-white border-green-700'
                      : currentIndex === index
                      ? 'bg-blue-500 text-white border-blue-700'
                      : 'bg-gray-100 border-gray-300 text-gray-800'
                  }`}
                >
                  {value}
                </div>
              ))}
            </div>
            <div className="flex justify-center space-x-8 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-gray-700 font-medium">Current</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-gray-700 font-medium">Found</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses Fibonacci numbers for division</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Only uses addition and subtraction</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Efficient for large datasets</span>
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
                ...ButtonPresets.search.primary(fibonacciSearch, isSearching, isPaused),
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
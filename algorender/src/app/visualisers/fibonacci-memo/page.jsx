"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function FibonacciMemoVisualiser() {
  const [n, setN] = useState(8);
  const [calls, setCalls] = useState([]);
  const [memo, setMemo] = useState({});
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(400);

  const reset = () => {
    setCalls([]);
    setMemo({});
    setResult(null);
    setIsRunning(false);
  };

  const fib = async (k, memoObj) => {
    setCalls(calls => [...calls, k]);
    if (memoObj[k] !== undefined) return memoObj[k];
    if (k <= 1) return k;
    await new Promise(res => setTimeout(res, speed));
    const val = await fib(k - 1, memoObj) + await fib(k - 2, memoObj);
    memoObj[k] = val;
    setMemo({ ...memoObj });
    return val;
  };

  const runFib = async () => {
    setIsRunning(true);
    const memoObj = {};
    const res = await fib(Number(n), memoObj);
    setResult(res);
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => setSpeed(1000 - e.target.value);

  return (
    <Layout
      title="Fibonacci (Memoization) Visualiser"
      description="Visualise the recursive, memoized computation of Fibonacci numbers."
      timeComplexity={{ best: 'O(n)', average: 'O(n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recursive Calls</h2>
            <div className="flex flex-wrap gap-2 mb-2">
              {calls.map((k, i) => (
                <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">fib({k})</span>
              ))}
            </div>
            <div className="mt-4">
              <InputControl
                type="number"
                label="n"
                value={n}
                onChange={e => setN(e.target.value)}
                min={0}
                max={30}
                placeholder="n"
                disabled={isRunning}
              />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Uses recursion and memoization to avoid redundant calculations</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Each subproblem is solved only once and stored in a memo table</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Speed</label>
                <InputControl
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isRunning}
                />
              </div>
              <div className="flex space-x-4">
                <Button onClick={runFib} disabled={isRunning} className="flex-1">
                  {isRunning ? "Running..." : "Start Fibonacci"}
                </Button>
                <Button onClick={reset} disabled={isRunning} variant="secondary" className="flex-1">
                  Reset
                </Button>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Memo Table</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(memo).map(([k, v]) => (
                <span key={k} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">fib({k}) = {v}</span>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">Result:</p>
              <span className="bg-blue-200 text-blue-900 px-3 py-1 rounded text-lg font-bold">{result !== null ? result : '-'}</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
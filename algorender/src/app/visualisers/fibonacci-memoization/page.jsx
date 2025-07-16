"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaCalculator, FaDatabase, FaTachometerAlt, FaPlay, FaUndo } from 'react-icons/fa';

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
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaCalculator className="text-blue-500" />
              Recursive Calls
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
              {calls.map((k, i) => (
                <Card key={i} className="p-2 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow-sm hover:shadow-md transition-all">
                  <div className="text-center">
                    <div className="text-blue-700 font-bold text-sm">fib({k})</div>
                  </div>
                </Card>
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
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <FaTachometerAlt className="text-blue-400" />
                  Speed
                  <span className="ml-auto text-xs text-gray-500">{(1000 - speed)} ms</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isRunning}
                  className="w-full h-2 bg-gradient-to-r from-blue-200 to-blue-500 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all"
                  style={{ accentColor: '#2563eb' }}
                />
              </div>
              <div className="flex space-x-4">
                <Button onClick={runFib} disabled={isRunning} className="flex-1 flex items-center justify-center gap-2">
                  <FaPlay className="text-sm" />
                  {isRunning ? "Running..." : "Start Fibonacci"}
                </Button>
                <Button onClick={reset} disabled={isRunning} variant="secondary" className="flex-1 flex items-center justify-center gap-2">
                  <FaUndo className="text-sm" />
                  Reset
                </Button>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <FaDatabase className="text-green-500" />
              Memo Table
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
              {Object.entries(memo).map(([k, v]) => (
                <Card key={k} className="p-2 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white shadow-sm hover:shadow-md transition-all">
                  <div className="text-center">
                    <div className="text-green-700 font-bold text-sm">fib({k}) = {v}</div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                <FaCalculator className="text-blue-400" />
                Result:
              </p>
              <Card className="p-3 border-2 border-blue-200 bg-gradient-to-br from-blue-100 to-white">
                <span className="text-blue-900 text-xl font-bold">{result !== null ? result : '-'}</span>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
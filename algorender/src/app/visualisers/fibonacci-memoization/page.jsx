"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { Card, CardContent } from '@/components/ui/card';
import {
  ControlsSection,
  SpeedControl,
  EnhancedDataStructureButtonGrid,
  StatisticsDisplay,
  ButtonPresets
} from '@/components/VisualizerControls';
import { FaCalculator, FaDatabase } from 'react-icons/fa';

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
          <ControlsSection>
            <SpeedControl
              speed={speed}
              onSpeedChange={(e) => setSpeed(1000 - e.target.value)}
              disabled={isRunning}
            />
            
            <EnhancedDataStructureButtonGrid
              operations={[
                {
                  onClick: runFib,
                  icon: ButtonPresets.dataStructure.search.icon,
                  label: isRunning ? 'Running...' : 'Start Fibonacci',
                  disabled: isRunning,
                  variant: 'primary'
                }
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
              disabled={isRunning}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Target N', value: n, color: 'text-blue-600' },
              { label: 'Total Calls', value: calls.length, color: 'text-orange-600' },
              { label: 'Memoized Values', value: Object.keys(memo).length, color: 'text-green-600' }
            ]}
            columns={3}
          />
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              Memo Table
            </h3>
            {Object.keys(memo).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
                {Object.entries(memo).map(([k, v]) => (
                  <Card key={k} className="p-2 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white shadow-sm hover:shadow-md transition-all">
                    <div className="text-center">
                      <div className="text-green-700 font-bold text-sm">fib({k}) = {v}</div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <FaDatabase className="mx-auto text-4xl mb-2 opacity-50" />
                <p>Click &apos;Start Fibonacci&apos; to build the memo table</p>
              </div>
            )}
            
            {result !== null && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                  <FaCalculator className="text-blue-400" />
                  Final Result:
                </p>
                <Card className="p-3 border-2 border-blue-200 bg-gradient-to-br from-blue-100 to-white">
                  <span className="text-blue-900 text-xl font-bold">fib({n}) = {result}</span>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
} 
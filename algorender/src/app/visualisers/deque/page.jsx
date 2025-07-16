'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function DequeVisualiser() {
  const [deque, setDeque] = useState([1, 2, 3, 4, 5]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const pushFront = () => {
    if (value === '') return;
    setDeque([parseInt(value), ...deque]);
    setValue('');
    setSelectedIndex(0);
  };

  const pushBack = () => {
    if (value === '') return;
    setDeque([...deque, parseInt(value)]);
    setValue('');
    setSelectedIndex(deque.length);
  };

  const popFront = () => {
    if (deque.length === 0) return;
    setSelectedIndex(0);
    setTimeout(() => {
      setDeque(deque.slice(1));
      setSelectedIndex(null);
    }, 500);
  };

  const popBack = () => {
    if (deque.length === 0) return;
    setSelectedIndex(deque.length - 1);
    setTimeout(() => {
      setDeque(deque.slice(0, -1));
      setSelectedIndex(null);
    }, 500);
  };

  const peekFront = () => {
    if (deque.length === 0) return;
    setSelectedIndex(0);
    setTimeout(() => setSelectedIndex(null), 1000);
  };

  const peekBack = () => {
    if (deque.length === 0) return;
    setSelectedIndex(deque.length - 1);
    setTimeout(() => setSelectedIndex(null), 1000);
  };

  const reset = () => {
    setDeque([1, 2, 3, 4, 5]);
    setValue('');
    setSelectedIndex(null);
  };

  return (
    <Layout
      title="Deque Visualiser"
      description="Visualise double-ended queue operations with front and back access."
      timeComplexity={{ best: 'O(1)', average: 'O(1)', worst: 'O(1)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Deque</h2>
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-semibold">Front</span>
                <span className="text-blue-600">↔</span>
              </div>
            <div className="flex items-center gap-2">
              {deque.map((item, i) => (
                <div
                  key={i}
                  className={`w-16 h-16 rounded-lg flex items-center justify-center transition-all ${
                    i === selectedIndex
                      ? 'bg-blue-100 border-2 border-blue-500 scale-110'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <span className="text-lg font-semibold text-gray-900">{item}</span>
                </div>
              ))}
              {deque.length === 0 && (
                <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400">
                  Empty
                </div>
              )}
            </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">↔</span>
                <span className="text-gray-500 font-semibold">Rear</span>
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
                <span>Push Front/Back: O(1) - Add element to either end</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Pop Front/Back: O(1) - Remove element from either end</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Peek Front/Back: O(1) - View elements without removing</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
            <div className="space-y-4">
              <InputControl
                label="Value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter value"
              />
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={pushFront} variant="primary" fullWidth>
                  Push Front
                </Button>
                <Button onClick={pushBack} variant="primary" fullWidth>
                  Push Back
                </Button>
                <Button onClick={popFront} variant="danger" fullWidth>
                  Pop Front
                </Button>
                <Button onClick={popBack} variant="danger" fullWidth>
                  Pop Back
                </Button>
                <Button onClick={peekFront} variant="secondary" fullWidth>
                  Peek Front
                </Button>
                <Button onClick={peekBack} variant="secondary" fullWidth>
                  Peek Back
                </Button>
              </div>
              <Button onClick={reset} variant="secondary" fullWidth>
                Reset
              </Button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Deque Size</h4>
                <p className="text-2xl font-semibold text-blue-600">{deque.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Front Element</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {deque.length > 0 ? deque[0] : '-'}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Back Element</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {deque.length > 0 ? deque[deque.length - 1] : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
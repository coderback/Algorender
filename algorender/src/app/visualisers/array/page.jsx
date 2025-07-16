'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function ArrayVisualiser() {
  const [array, setArray] = useState([1, 2, 3, 4, 5]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const insert = () => {
    if (value === '') return;
    const newArray = [...array];
    newArray.push(parseInt(value));
    setArray(newArray);
    setValue('');
  };

  const remove = () => {
    if (array.length === 0) return;
    const newArray = [...array];
    newArray.pop();
    setArray(newArray);
  };

  const search = () => {
    if (value === '') return;
    const searchValue = parseInt(value);
    const foundIndex = array.indexOf(searchValue);
    setSelectedIndex(foundIndex);
    setValue('');
  };

  const reset = () => {
    setArray([1, 2, 3, 4, 5]);
    setValue('');
    setSelectedIndex(null);
  };

  return (
    <Layout
      title="Array Visualiser"
      description="Visualise array operations with interactive elements."
      timeComplexity={{ best: 'O(1)', average: 'O(n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Array</h2>
            <div className="flex flex-wrap gap-3">
              {array.map((item, i) => (
                <div
                  key={i}
                  className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center transition-all ${
                    i === selectedIndex
                      ? 'bg-blue-100 border-2 border-blue-500 scale-110'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <span className="text-sm text-gray-500">Index {i}</span>
                  <span className="text-lg font-semibold text-gray-900">{item}</span>
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
                <span>Access: O(1) - Direct access to any index</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Insert/Delete: O(n) - Requires shifting elements</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(n) - Linear search through elements</span>
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
                <Button onClick={insert} variant="primary" fullWidth>
                  Insert
                </Button>
                <Button onClick={remove} variant="danger" fullWidth>
                  Remove
                </Button>
                <Button onClick={search} variant="secondary" fullWidth>
                  Search
                </Button>
              <Button onClick={reset} variant="secondary" fullWidth>
                Reset
              </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Array Length</h4>
                <p className="text-2xl font-semibold text-blue-600">{array.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Selected Index</h4>
                <p className="text-2xl font-semibold text-gray-900">{selectedIndex !== null ? selectedIndex : '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

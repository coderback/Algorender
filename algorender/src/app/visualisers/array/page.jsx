'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { EnhancedDataStructureButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

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
          <ControlsSection title="Operations">
            <InputControl
              label="Value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value"
            />
            
            <EnhancedDataStructureButtonGrid
              operations={[
                ButtonPresets.dataStructure.insert(insert, !value.trim()),
                ButtonPresets.dataStructure.remove(remove),
                ButtonPresets.dataStructure.search(search, !value.trim())
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Array Length', value: array.length, color: 'text-blue-600' },
              { label: 'Selected Index', value: selectedIndex !== null ? selectedIndex : '-' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
}

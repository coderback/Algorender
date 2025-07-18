'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { DataStructureButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

export default function StackVisualiser() {
  const [stack, setStack] = useState([1, 2, 3, 4, 5]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const push = () => {
    if (value === '') return;
    setStack([...stack, parseInt(value)]);
    setValue('');
    setSelectedIndex(stack.length);
  };

  const pop = () => {
    if (stack.length === 0) return;
    setSelectedIndex(stack.length - 1);
    setTimeout(() => {
      setStack(stack.slice(0, -1));
      setSelectedIndex(null);
    }, 500);
  };

  const peek = () => {
    if (stack.length === 0) return;
    setSelectedIndex(stack.length - 1);
    setTimeout(() => setSelectedIndex(null), 1000);
  };

  const reset = () => {
    setStack([1, 2, 3, 4, 5]);
    setValue('');
    setSelectedIndex(null);
  };

  return (
    <Layout
      title="Stack Visualiser"
      description="Visualise LIFO (Last In, First Out) stack operations."
      timeComplexity={{ best: 'O(1)', average: 'O(1)', worst: 'O(1)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Stack</h2>
            <div className="flex flex-col items-center gap-2">
              {/* Top label */}
              {stack.length > 0 && (
                <div className="text-sm font-medium text-blue-600 mb-1">
                  Top
                </div>
              )}
              
              {/* Stack items in reverse order */}
              {[...stack].reverse().map((item, i) => (
                <div
                  key={stack.length - 1 - i}
                  className={`w-24 h-12 rounded-lg flex items-center justify-center transition-all ${
                    stack.length - 1 - i === selectedIndex
                      ? 'bg-blue-100 border-2 border-blue-500 scale-110'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <span className="text-lg font-semibold text-gray-900">{item}</span>
                </div>
              ))}
              
              {stack.length === 0 ? (
                <div className="w-24 h-12 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400">
                  Empty
                </div>
              ) : (
                <div className="text-sm font-medium text-gray-600 mt-1">
                  Base
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Push: O(1) - Add element to the top</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Pop: O(1) - Remove element from the top</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Peek: O(1) - View top element without removing</span>
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
              placeholder="Enter value to push"
            />
            <DataStructureButtonGrid
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            >
              <div className="grid grid-cols-3 gap-3">
                <Button onClick={push} variant="primary" className="w-full">
                  Push
                </Button>
                <Button onClick={pop} variant="danger" className="w-full">
                  Pop
                </Button>
                <Button onClick={peek} variant="secondary" className="w-full">
                  Peek
                </Button>
              </div>
            </DataStructureButtonGrid>
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Stack Size', value: stack.length, color: 'text-blue-600' },
              { label: 'Top Element', value: stack.length > 0 ? stack[stack.length - 1] : '-' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
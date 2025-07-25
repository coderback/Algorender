'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { EnhancedDataStructureButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

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
                { onClick: pushFront, label: 'Push Front', variant: 'primary' },
                { onClick: pushBack, label: 'Push Back', variant: 'primary' },
                { onClick: popFront, label: 'Pop Front', variant: 'danger' },
                { onClick: popBack, label: 'Pop Back', variant: 'danger' },
                { onClick: peekFront, label: 'Peek Front', variant: 'secondary' },
                { onClick: peekBack, label: 'Peek Back', variant: 'secondary' }
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Deque Size', value: deque.length, color: 'text-blue-600' },
              { label: 'Front Element', value: deque.length > 0 ? deque[0] : '-' },
              { label: 'Back Element', value: deque.length > 0 ? deque[deque.length - 1] : '-' }
            ]}
            columns={3}
          />
        </div>
      </div>
    </Layout>
  );
} 
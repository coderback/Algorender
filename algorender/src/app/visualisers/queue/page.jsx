'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { DataStructureButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

export default function QueueVisualiser() {
  const [queue, setQueue] = useState([1, 2, 3, 4, 5]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const enqueue = () => {
    if (value === '') return;
    setQueue([...queue, parseInt(value)]);
    setValue('');
    setSelectedIndex(queue.length);
  };

  const dequeue = () => {
    if (queue.length === 0) return;
    setSelectedIndex(0);
    setTimeout(() => {
      setQueue(queue.slice(1));
      setSelectedIndex(null);
    }, 500);
  };

  const peek = () => {
    if (queue.length === 0) return;
    setSelectedIndex(0);
    setTimeout(() => setSelectedIndex(null), 1000);
  };

  const reset = () => {
    setQueue([1, 2, 3, 4, 5]);
    setValue('');
    setSelectedIndex(null);
  };

  return (
    <Layout
      title="Queue Visualiser"
      description="Visualise FIFO (First In, First Out) queue operations."
      timeComplexity={{ best: 'O(1)', average: 'O(1)', worst: 'O(1)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Queue</h2>
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-semibold">Front</span>
                <span className="text-blue-600">→</span>
              </div>
            <div className="flex items-center gap-2">
              {queue.map((item, i) => (
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
              {queue.length === 0 && (
                <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400">
                  Empty
                </div>
              )}
            </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">←</span>
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
                <span>Enqueue: O(1) - Add element to the back</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Dequeue: O(1) - Remove element from the front</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Peek: O(1) - View front element without removing</span>
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
              placeholder="Enter value to enqueue"
            />
            <DataStructureButtonGrid
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            >
              <div className="grid grid-cols-3 gap-3">
                <Button onClick={enqueue} variant="primary" className="w-full">
                  Enqueue
                </Button>
                <Button onClick={dequeue} variant="danger" className="w-full">
                  Dequeue
                </Button>
                <Button onClick={peek} variant="secondary" className="w-full">
                  Peek
                </Button>
              </div>
            </DataStructureButtonGrid>
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Queue Size', value: queue.length, color: 'text-blue-600' },
              { label: 'Front Element', value: queue.length > 0 ? queue[0] : '-' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
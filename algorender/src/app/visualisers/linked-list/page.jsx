'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { EnhancedDataStructureButtonGrid, StatisticsDisplay, ControlsSection, ButtonPresets } from '@/components/VisualizerControls';

export default function LinkedListVisualiser() {
  const [list, setList] = useState([
    { value: 1, next: 1 },
    { value: 2, next: 2 },
    { value: 3, next: 3 },
    { value: 4, next: 4 },
    { value: 5, next: null }
  ]);
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const insertAtEnd = () => {
    if (value === '') return;
    const newNode = { 
      value: parseInt(value), 
      next: null 
    };

    const newList = [...list];
    if (newList.length > 0) {
      newList[newList.length - 1].next = newList.length;
    }
    newList.push(newNode);

    setList(newList);
    setValue('');
    setSelectedIndex(newList.length - 1);
    setTimeout(() => setSelectedIndex(null), 1000);
  };

  const removeFromEnd = () => {
    if (list.length === 0) return;

    const newList = [...list];
    newList.pop();

    if (newList.length > 0) {
      newList[newList.length - 1].next = null;
    }

    setList(newList);
    setSelectedIndex(null);
  };

  const search = () => {
    if (value === '') return;
    const searchValue = parseInt(value);
    const foundIndex = list.findIndex(node => node.value === searchValue);
    setSelectedIndex(foundIndex);
    setValue('');
  };

  const reset = () => {
    setList([
      { value: 1, next: 1 },
      { value: 2, next: 2 },
      { value: 3, next: 3 },
      { value: 4, next: 4 },
      { value: 5, next: null }
    ]);
    setValue('');
    setSelectedIndex(null);
  };

  return (
    <Layout
      title="Linked List Visualiser"
      description="Visualise linked list operations with node connections."
      timeComplexity={{ best: 'O(1)', average: 'O(n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Linked List</h2>
            <div className="flex items-center gap-4">
              {list.map((node, i) => (
                <div key={i} className="flex items-center">
                  <div
                    className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center transition-all ${
                      i === selectedIndex
                        ? 'bg-blue-100 border-2 border-blue-500 scale-110'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <span className="text-lg font-semibold text-gray-900">{node.value}</span>
                    <span className="text-xs text-gray-500">Node {i + 1}</span>
                  </div>
                  {node.next !== null && (
                    <div className="w-8 h-0.5 bg-gray-300 relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-300 rotate-45" />
                    </div>
                  )}
                </div>
              ))}
              {list.length === 0 && (
                <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400">
                  Empty
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
                <span>Insert: O(1) - Add node at the end</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Delete: O(1) - Remove node from the end</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(n) - Linear search through nodes</span>
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
                ButtonPresets.dataStructure.insert(insertAtEnd, !value.trim()),
                ButtonPresets.dataStructure.remove(removeFromEnd),
                ButtonPresets.dataStructure.search(search, !value.trim())
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'List Length', value: list.length, color: 'text-blue-600' },
              { label: 'Selected Node', value: selectedIndex !== null ? list[selectedIndex].value : '-' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
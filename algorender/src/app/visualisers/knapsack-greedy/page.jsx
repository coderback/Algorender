"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialItems = [
  { weight: 10, value: 60 },
  { weight: 20, value: 100 },
  { weight: 30, value: 120 }
];

export default function GreedyKnapsackVisualiser() {
  const [items, setItems] = useState(initialItems);
  const [capacity, setCapacity] = useState(50);
  const [selected, setSelected] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [newWeight, setNewWeight] = useState('');
  const [newValue, setNewValue] = useState('');

  const reset = () => {
    setSelected([]);
    setTotalValue(0);
    setIsRunning(false);
  };

  const addItem = () => {
    if (!newWeight || !newValue) return;
    setItems([...items, { weight: parseFloat(newWeight), value: parseFloat(newValue) }]);
    setNewWeight('');
    setNewValue('');
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const greedyKnapsack = async () => {
    setIsRunning(true);
    let remaining = parseFloat(capacity);
    let value = 0;
    const sorted = items
      .map((item, idx) => ({ ...item, idx, ratio: item.value / item.weight }))
      .sort((a, b) => b.ratio - a.ratio);
    const selected = [];
    for (const item of sorted) {
      if (remaining <= 0) break;
      if (item.weight <= remaining) {
        selected.push({ ...item, taken: 1 });
        value += item.value;
        remaining -= item.weight;
      } else {
        const fraction = remaining / item.weight;
        selected.push({ ...item, taken: fraction });
        value += item.value * fraction;
        remaining = 0;
      }
      setSelected([...selected]);
      setTotalValue(value);
      await new Promise(res => setTimeout(res, speed));
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Greedy Knapsack Visualiser"
      description="Visualise the Fractional Knapsack problem solved using a greedy approach."
      timeComplexity={{ best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Items</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1 text-sm">
                  <span>W: {item.weight}, V: {item.value}</span>
                  <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">&times;</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <InputControl
                type="number"
                label="Weight"
                value={newWeight}
                onChange={e => setNewWeight(e.target.value)}
                min={1}
                placeholder="Weight"
              />
              <InputControl
                type="number"
                label="Value"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                min={1}
                placeholder="Value"
              />
              <Button onClick={addItem} variant="success">Add</Button>
            </div>
            <div className="mt-4">
              <InputControl
                type="number"
                label="Knapsack Capacity"
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                min={1}
                placeholder="Capacity"
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
                <span>Sort items by value-to-weight ratio in descending order</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Take as much as possible of the highest ratio item, possibly a fraction</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Repeat until the knapsack is full</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Speed
                </label>
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
                <Button
                  onClick={greedyKnapsack}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? "Running..." : "Start Greedy Knapsack"}
                </Button>
                <Button
                  onClick={reset}
                  disabled={isRunning}
                  variant="secondary"
                  className="flex-1"
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-2xl font-semibold text-blue-600">{totalValue.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-500">Items Used</p>
                <p className="text-2xl font-semibold text-gray-600">{selected.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">Selected Items:</p>
              <div className="flex flex-wrap gap-2">
                {selected.map((item, i) => (
                  <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                    W: {item.weight}, V: {item.value}, Taken: {(item.taken * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
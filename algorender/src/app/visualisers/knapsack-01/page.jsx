"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

const initialItems = [
  { weight: 2, value: 12 },
  { weight: 1, value: 10 },
  { weight: 3, value: 20 },
  { weight: 2, value: 15 }
];

export default function Knapsack01Visualiser() {
  const [items, setItems] = useState(initialItems);
  const [capacity, setCapacity] = useState(5);
  const [dp, setDp] = useState([]);
  const [selected, setSelected] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [newWeight, setNewWeight] = useState('');
  const [newValue, setNewValue] = useState('');

  const reset = () => {
    setDp([]);
    setSelected([]);
    setIsRunning(false);
  };

  const addItem = () => {
    if (!newWeight || !newValue) return;
    setItems([...items, { weight: parseInt(newWeight), value: parseInt(newValue) }]);
    setNewWeight('');
    setNewValue('');
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const knapsack01 = async () => {
    setIsRunning(true);
    const n = items.length;
    const W = parseInt(capacity);
    const dp = Array.from({ length: n + 1 }, () => Array(W + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let w = 0; w <= W; w++) {
        if (items[i - 1].weight <= w) {
          dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - items[i - 1].weight] + items[i - 1].value);
        } else {
          dp[i][w] = dp[i - 1][w];
        }
        setDp(dp.map(row => [...row]));
        await new Promise(res => setTimeout(res, speed));
      }
    }
    // Backtrack to find selected items
    let w = W;
    const selected = [];
    for (let i = n; i > 0; i--) {
      if (dp[i][w] !== dp[i - 1][w]) {
        selected.push(i - 1);
        w -= items[i - 1].weight;
      }
    }
    setSelected(selected.reverse());
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => setSpeed(1000 - e.target.value);

  return (
    <Layout
      title="0/1 Knapsack Visualiser"
      description="Visualise the 0/1 Knapsack problem solved using dynamic programming."
      timeComplexity={{ best: 'O(nW)', average: 'O(nW)', worst: 'O(nW)' }}
      spaceComplexity="O(nW)"
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
                <span>Builds a DP table where dp[i][w] is the max value for first i items and capacity w</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Decides for each item to include or exclude it for each capacity</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Speed</label>
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
                <Button onClick={knapsack01} disabled={isRunning} className="flex-1">
                  {isRunning ? "Running..." : "Start 0/1 Knapsack"}
                </Button>
                <Button onClick={reset} disabled={isRunning} variant="secondary" className="flex-1">
                  Reset
                </Button>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">DP Table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-center">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-xs text-gray-500">i \ w</th>
                    {Array.from({ length: parseInt(capacity) + 1 }, (_, w) => (
                      <th key={w} className="px-2 py-1 text-xs text-gray-500">{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dp.map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-xs text-gray-500 font-semibold">{i}</td>
                      {row.map((cell, w) => (
                        <td key={w} className={`px-2 py-1 text-sm font-semibold ${selected.includes(i - 1) && w === parseInt(capacity) ? 'bg-green-100 text-green-700' : ''}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">Selected Items:</p>
              <div className="flex flex-wrap gap-2">
                {selected.map((idx, i) => (
                  <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                    W: {items[idx].weight}, V: {items[idx].value}
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
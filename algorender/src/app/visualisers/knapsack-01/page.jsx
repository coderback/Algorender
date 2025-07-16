"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaWeightHanging, FaCoins, FaTrashAlt, FaTachometerAlt } from 'react-icons/fa';

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
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((item, idx) => (
                <Card key={idx} className="flex items-center gap-4 p-4 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow hover:shadow-lg transition-all">
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-blue-700 font-bold text-lg">
                      <FaWeightHanging className="text-blue-400" /> W: {item.weight}
                    </div>
                    <div className="flex items-center gap-2 text-yellow-700 font-bold text-lg">
                      <FaCoins className="text-yellow-400" /> V: {item.value}
                    </div>
                  </div>
                  <button onClick={() => removeItem(idx)} className="ml-2 p-2 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors" title="Remove">
                    <FaTrashAlt />
                  </button>
                </Card>
              ))}
            </div>
            <div className="flex gap-2 mb-2 items-end">
              <InputControl
                type="number"
                label="Weight"
                value={newWeight}
                onChange={e => setNewWeight(e.target.value)}
                min={1}
                placeholder="Weight"
                className="flex-1"
              />
              <InputControl
                type="number"
                label="Value"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                min={1}
                placeholder="Value"
                className="flex-1"
              />
              <Button onClick={addItem} variant="primary" className="h-11 mt-1">Add</Button>
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
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <FaTachometerAlt className="text-blue-400" />
                  Speed
                  <span className="ml-auto text-xs text-gray-500">{(1000 - speed)} ms</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="900"
                  value={1000 - speed}
                  onChange={handleSpeedChange}
                  disabled={isRunning}
                  className="w-full h-2 bg-gradient-to-r from-blue-200 to-blue-500 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all"
                  style={{ accentColor: '#2563eb' }}
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
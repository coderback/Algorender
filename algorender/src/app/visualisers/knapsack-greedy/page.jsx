"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ControlsSection,
  SpeedControl,
  EnhancedDataStructureButtonGrid,
  StatisticsDisplay,
  ButtonPresets
} from '@/components/VisualizerControls';
import { FaWeightHanging, FaCoins, FaTrashAlt } from 'react-icons/fa';

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
          <ControlsSection>
            <SpeedControl
              speed={speed}
              onSpeedChange={handleSpeedChange}
              disabled={isRunning}
            />
            
            <EnhancedDataStructureButtonGrid
              operations={[
                {
                  onClick: greedyKnapsack,
                  icon: ButtonPresets.dataStructure.search.icon,
                  label: isRunning ? 'Running...' : 'Start Knapsack',
                  disabled: isRunning,
                  variant: 'primary'
                }
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
              disabled={isRunning}
            />
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Total Value', value: totalValue.toFixed(2), color: 'text-blue-600' },
              { label: 'Items Used', value: selected.length, color: 'text-green-600' },
              { label: 'Capacity Used', value: `${Math.round(((capacity - (capacity - selected.reduce((acc, item) => acc + (item.weight * item.taken), 0))) / capacity) * 100)}%`, color: 'text-gray-900' }
            ]}
            columns={3}
          />
          
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Selected Items</h3>
            <div className="flex flex-wrap gap-2">
              {selected.length > 0 ? (
                selected.map((item, i) => (
                  <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                    {i + 1}: W:{item.weight}, V:{item.value}, {(item.taken * 100).toFixed(0)}%
                  </span>
                ))
              ) : (
                <span className="text-gray-500 text-sm">No items selected yet</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
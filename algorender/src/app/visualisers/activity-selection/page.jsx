"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaRegClock, FaTrashAlt, FaTachometerAlt } from 'react-icons/fa';

const initialActivities = [
  { start: 1, end: 3 },
  { start: 2, end: 5 },
  { start: 4, end: 7 },
  { start: 6, end: 9 },
  { start: 8, end: 10 },
  { start: 9, end: 11 }
];

export default function ActivitySelectionVisualiser() {
  const [activities, setActivities] = useState(initialActivities);
  const [selected, setSelected] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const reset = () => {
    setSelected([]);
    setIsRunning(false);
  };

  const addActivity = () => {
    if (!newStart || !newEnd) return;
    setActivities([...activities, { start: parseInt(newStart), end: parseInt(newEnd) }]);
    setNewStart('');
    setNewEnd('');
  };

  const removeActivity = (idx) => {
    setActivities(activities.filter((_, i) => i !== idx));
  };

  const greedyActivitySelection = async () => {
    setIsRunning(true);
    const sorted = activities
      .map((a, idx) => ({ ...a, idx }))
      .sort((a, b) => a.end - b.end);
    const selected = [];
    let lastEnd = -Infinity;
    for (const act of sorted) {
      if (act.start >= lastEnd) {
        selected.push(act);
        lastEnd = act.end;
        setSelected([...selected]);
        await new Promise(res => setTimeout(res, speed));
      }
    }
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => {
    setSpeed(1000 - e.target.value);
  };

  return (
    <Layout
      title="Activity Selection Visualiser"
      description="Visualise the Activity Selection problem solved using a greedy approach."
      timeComplexity={{ best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Activities</h2>
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activities.map((act, idx) => (
                <Card key={idx} className="flex items-center gap-4 p-4 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow hover:shadow-lg transition-all">
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-blue-700 font-bold text-lg">
                      <FaRegClock className="text-blue-400" /> Start: {act.start}
                    </div>
                    <div className="flex items-center gap-2 text-yellow-700 font-bold text-lg">
                      <FaRegClock className="text-yellow-400" /> End: {act.end}
                    </div>
                  </div>
                  <button onClick={() => removeActivity(idx)} className="ml-2 p-2 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors" title="Remove">
                    <FaTrashAlt />
                  </button>
                </Card>
              ))}
            </div>
            <div className="flex gap-2 mb-2 items-end">
              <InputControl
                type="number"
                label="Start"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
                min={0}
                placeholder="Start"
                className="flex-1"
              />
              <InputControl
                type="number"
                label="End"
                value={newEnd}
                onChange={e => setNewEnd(e.target.value)}
                min={0}
                placeholder="End"
                className="flex-1"
              />
              <Button onClick={addActivity} variant="primary" className="h-11 mt-1">Add</Button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Sort activities by end time in ascending order</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Select the next activity that starts after the last selected one ends</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Repeat until all activities are considered</span>
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
                  <FaTachometerAlt className="text-purple-400" />
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
                  className="w-full h-2 bg-gradient-to-r from-purple-200 to-pink-400 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-purple-400/30 transition-all"
                  style={{ accentColor: '#a21caf' }}
                />
              </div>
              <div className="flex space-x-4">
                <Button
                  onClick={greedyActivitySelection}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? "Running..." : "Start Activity Selection"}
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
                <p className="text-sm text-gray-500">Activities Selected</p>
                <p className="text-2xl font-semibold text-blue-600">{selected.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">Selected Activities:</p>
              <div className="flex flex-wrap gap-2">
                {selected.map((act, i) => (
                  <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                    [{act.start}, {act.end}]
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
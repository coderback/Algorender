"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaFont, FaTachometerAlt, FaPlay, FaUndo, FaTable, FaCode, FaCalculator } from 'react-icons/fa';

export default function EditDistanceVisualiser() {
  const [str1, setStr1] = useState('kitten');
  const [str2, setStr2] = useState('sitting');
  const [dp, setDp] = useState([]);
  const [distance, setDistance] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(400);

  const reset = () => {
    setDp([]);
    setDistance(null);
    setIsRunning(false);
  };

  const editDistanceDP = async () => {
    setIsRunning(true);
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    setDp(dp.map(row => [...row]));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
        setDp(dp.map(row => [...row]));
        await new Promise(res => setTimeout(res, speed));
      }
    }
    setDistance(dp[m][n]);
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => setSpeed(1000 - e.target.value);

  return (
    <Layout
      title="Edit Distance Visualiser"
      description="Visualise the Edit Distance (Levenshtein Distance) problem solved using dynamic programming."
      timeComplexity={{ best: 'O(mn)', average: 'O(mn)', worst: 'O(mn)' }}
      spaceComplexity="O(mn)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaFont className="text-blue-500" />
              Input Strings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Card className="p-4 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
                <InputControl
                  type="text"
                  label="String 1"
                  value={str1}
                  onChange={e => setStr1(e.target.value)}
                  placeholder="First string"
                  disabled={isRunning}
                  className="mb-0"
                />
              </Card>
              <Card className="p-4 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white">
                <InputControl
                  type="text"
                  label="String 2"
                  value={str2}
                  onChange={e => setStr2(e.target.value)}
                  placeholder="Second string"
                  disabled={isRunning}
                  className="mb-0"
                />
              </Card>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Builds a DP table where dp[i][j] is the edit distance for str1[0..i-1] and str2[0..j-1]</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Considers insert, delete, and substitute operations</span>
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
                <Button onClick={editDistanceDP} disabled={isRunning} className="flex-1 flex items-center justify-center gap-2">
                  <FaPlay className="text-sm" />
                  {isRunning ? "Running..." : "Start Edit Distance"}
                </Button>
                <Button onClick={reset} disabled={isRunning} variant="secondary" className="flex-1 flex items-center justify-center gap-2">
                  <FaUndo className="text-sm" />
                  Reset
                </Button>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <FaTable className="text-purple-500" />
              DP Table
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-center">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-xs text-gray-500">i \ j</th>
                    {Array.from({ length: str2.length + 1 }, (_, j) => (
                      <th key={j} className="px-2 py-1 text-xs text-gray-500">{j}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dp.map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-xs text-gray-500 font-semibold">{i}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-2 py-1 text-sm font-semibold`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                <FaCalculator className="text-green-400" />
                Edit Distance:
              </p>
              <Card className="p-3 border-2 border-green-200 bg-gradient-to-br from-green-100 to-white">
                <span className="text-green-700 text-lg font-bold">{distance !== null ? distance : '-'}</span>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
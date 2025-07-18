"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { Card, CardContent } from '@/components/ui/card';
import {
  ControlsSection,
  SpeedControl,
  EnhancedDataStructureButtonGrid,
  StatisticsDisplay,
  ButtonPresets
} from '@/components/VisualizerControls';
import { FaFont, FaTable, FaCalculator } from 'react-icons/fa';

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
          <ControlsSection>
            <SpeedControl
              speed={speed}
              onSpeedChange={(e) => setSpeed(1000 - e.target.value)}
              disabled={isRunning}
            />
            
            <EnhancedDataStructureButtonGrid
              operations={[
                {
                  onClick: editDistanceDP,
                  icon: ButtonPresets.dataStructure.search.icon,
                  label: isRunning ? 'Running...' : 'Start Edit Distance',
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
              { label: 'String 1 Length', value: str1.length, color: 'text-blue-600' },
              { label: 'String 2 Length', value: str2.length, color: 'text-green-600' },
              { label: 'Edit Distance', value: distance !== null ? distance : '-', color: 'text-purple-600' }
            ]}
            columns={3}
          />
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              DP Table
            </h3>
            {dp.length > 0 ? (
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
                          <td key={j} className="px-2 py-1 text-sm font-semibold text-gray-700">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <FaTable className="mx-auto text-4xl mb-2 opacity-50" />
                <p>Click &apos;Start Edit Distance&apos; to build the DP table</p>
              </div>
            )}
            
            {distance !== null && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                  <FaCalculator className="text-green-400" />
                  Final Edit Distance:
                </p>
                <Card className="p-3 border-2 border-green-200 bg-gradient-to-br from-green-100 to-white">
                  <span className="text-green-700 text-lg font-bold">{distance}</span>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
} 
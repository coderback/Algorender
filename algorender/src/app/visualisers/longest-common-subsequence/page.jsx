"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  SpeedControl,
  EnhancedDataStructureButtonGrid, 
  StatisticsDisplay, 
  ButtonPresets 
} from '@/components/VisualizerControls';

export default function LCSVisualiser() {
  const [str1, setStr1] = useState('AGGTAB');
  const [str2, setStr2] = useState('GXTXAYB');
  const [dp, setDp] = useState([]);
  const [lcs, setLcs] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(400);

  const reset = () => {
    setDp([]);
    setLcs('');
    setIsRunning(false);
  };

  const lcsDP = async () => {
    setIsRunning(true);
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
        setDp(dp.map(row => [...row]));
        await new Promise(res => setTimeout(res, speed));
      }
    }
    // Backtrack to find LCS string
    let i = m, j = n;
    let lcsArr = [];
    while (i > 0 && j > 0) {
      if (str1[i - 1] === str2[j - 1]) {
        lcsArr.push(str1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    setLcs(lcsArr.reverse().join(''));
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => setSpeed(1000 - e.target.value);

  return (
    <Layout
      title="Longest Common Subsequence Visualiser"
      description="Visualise the LCS problem solved using dynamic programming."
      timeComplexity={{ best: 'O(mn)', average: 'O(mn)', worst: 'O(mn)' }}
      spaceComplexity="O(mn)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Strings</h2>
            <div className="mb-4 flex flex-col gap-2">
              <InputControl
                type="text"
                label="String 1"
                value={str1}
                onChange={e => setStr1(e.target.value)}
                placeholder="First string"
                disabled={isRunning}
              />
              <InputControl
                type="text"
                label="String 2"
                value={str2}
                onChange={e => setStr2(e.target.value)}
                placeholder="Second string"
                disabled={isRunning}
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
                <span>Builds a DP table where dp[i][j] is the LCS length for str1[0..i-1] and str2[0..j-1]</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Backtracks to reconstruct the LCS string</span>
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
                  onClick: lcsDP,
                  icon: ButtonPresets.dataStructure.search.icon,
                  label: isRunning ? 'Running...' : 'Start LCS',
                  disabled: isRunning,
                  variant: 'primary'
                }
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>
          
          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'String 1 Length', value: str1.length, color: 'text-blue-600' },
              { label: 'String 2 Length', value: str2.length, color: 'text-green-600' },
              { label: 'LCS Length', value: lcs.length, color: 'text-purple-600' },
              { label: 'LCS', value: lcs || 'Not calculated', color: 'text-gray-900' }
            ]}
            columns={2}
          />
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">DP Table</h3>
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
                        <td key={j} className={`px-2 py-1 text-sm font-semibold text-gray-900`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">LCS:</p>
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">{lcs}</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
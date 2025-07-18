"use client";

import React, { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  SpeedControl,
  VisualizerButtonGrid, 
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
  const [stats, setStats] = useState({
    comparisons: 0,
    matches: 0,
    time: 0
  });

  const timeComplexity = {
    best: 'O(mn)',
    average: 'O(mn)',
    worst: 'O(mn)',
    space: 'O(mn)'
  };

  const reset = () => {
    setDp([]);
    setLcs('');
    setIsRunning(false);
    setStats({ comparisons: 0, matches: 0, time: 0 });
  };

  const lcsDP = async () => {
    setIsRunning(true);
    const startTime = performance.now();
    let comparisons = 0;
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        comparisons++;
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
    const lcsString = lcsArr.reverse().join('');
    setLcs(lcsString);

    const endTime = performance.now();
    setStats({
      comparisons,
      matches: lcsString.length,
      time: (endTime - startTime).toFixed(2)
    });
    setIsRunning(false);
  };

  const handleSpeedChange = (e) => setSpeed(1000 - e.target.value);

  return (
    <Layout
      title="Longest Common Subsequence Visualiser"
      description="Visualise the LCS dynamic programming algorithm step by step."
      timeComplexity={timeComplexity}
      spaceComplexity="O(mn)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Strings</h2>
            <div className="space-y-4">
              <InputControl
                label="String 1"
                type="text"
                value={str1}
                onChange={(e) => setStr1(e.target.value)}
                disabled={isRunning}
                placeholder="Enter first string"
              />
              <InputControl
                label="String 2"
                type="text"
                value={str2}
                onChange={(e) => setStr2(e.target.value)}
                disabled={isRunning}
                placeholder="Enter second string"
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
                <span>Create a DP table of size (m+1) × (n+1)</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>If characters match, add 1 to diagonal value</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Otherwise, take max of left and top values</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ControlsSection>
            <VisualizerButtonGrid
              primaryAction={{
                ...ButtonPresets.search.primary(lcsDP, isRunning, false),
                label: isRunning ? 'Running...' : 'Find LCS',
                disabled: isRunning || !str1.trim() || !str2.trim()
              }}
              resetAction={ButtonPresets.search.reset(reset)}
              isRunning={isRunning}
            />
            <SpeedControl
              speed={speed}
              onSpeedChange={handleSpeedChange}
              disabled={isRunning}
            />
          </ControlsSection>

          <StatisticsDisplay
            stats={[
              { label: 'Comparisons', value: stats.comparisons, color: 'text-blue-600' },
              { label: 'LCS Length', value: stats.matches, color: 'text-green-600' },
              { label: 'Time (ms)', value: stats.time, color: 'text-gray-900' }
            ]}
            columns={3}
          />
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Dynamic Programming Table</h2>
        {dp.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div className="grid grid-cols-[auto_repeat(auto-fit,minmax(2rem,1fr))] gap-1">
                <div className="w-8 h-8"></div>
                {str2.split('').map((char, j) => (
                  <div key={j} className="w-8 h-8 flex items-center justify-center border border-gray-200 bg-gray-50">
                    {char}
                  </div>
                ))}
                {dp.map((row, i) => (
                  <React.Fragment key={i}>
                    <div className="w-8 h-8 flex items-center justify-center border border-gray-200 bg-gray-50">
                      {i > 0 ? str1[i - 1] : ''}
                    </div>
                    {row.map((cell, j) => (
                      <div
                        key={j}
                        className="w-8 h-8 flex items-center justify-center border border-gray-200 bg-white"
                      >
                        {cell}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Run the algorithm to see the DP table
          </div>
        )}
      </div>

      {lcs && (
        <div className="bg-green-50 rounded-xl p-6 border border-green-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Result</h2>
          <div className="p-4 bg-white rounded-lg">
            <p className="text-gray-700">
              Longest Common Subsequence: 
              <span className="font-mono text-green-700 font-bold ml-2">{lcs}</span>
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
} 
"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import StatsBar from '@/components/StatsBar';

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
    <Layout timeComplexity={timeComplexity}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Longest Common Subsequence</h1>
          <div className="flex items-center space-x-4">
            <InputControl
              label="String 1"
              type="text"
              value={str1}
              onChange={(e) => setStr1(e.target.value)}
              disabled={isRunning}
            />
            <InputControl
              label="String 2"
              type="text"
              value={str2}
              onChange={(e) => setStr2(e.target.value)}
              disabled={isRunning}
            />
            <Button
              onClick={lcsDP}
              disabled={isRunning || !str1 || !str2}
              variant="primary"
            >
              {isRunning ? 'Running...' : 'Find LCS'}
            </Button>
            <Button
              onClick={reset}
              variant="secondary"
            >
              Reset
            </Button>
          </div>
        </div>

        <StatsBar
          stats={[
            { label: 'Comparisons', value: stats.comparisons },
            { label: 'LCS Length', value: stats.matches },
            { label: 'Time (ms)', value: stats.time }
          ]}
          timeComplexity={timeComplexity}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Dynamic Programming Table</h2>
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
                          className="w-8 h-8 flex items-center justify-center border border-gray-200"
                        >
                          {cell}
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                The Longest Common Subsequence algorithm uses dynamic programming:
              </p>
              <ul className="list-disc list-inside text-gray-600">
                <li>Create a DP table of size (m+1) × (n+1)</li>
                <li>If characters match, add 1 to the diagonal value</li>
                <li>If characters don't match, take max of left and top values</li>
                <li>Backtrack to find the actual subsequence</li>
                <li>Time complexity is O(mn) where m and n are string lengths</li>
              </ul>
            </div>
          </div>
        </div>

        {lcs && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Result</h2>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700">Longest Common Subsequence: <span className="font-mono">{lcs}</span></p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 
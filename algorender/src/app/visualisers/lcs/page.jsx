"use client";

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import StatsBar from '@/components/StatsBar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaFont, FaTachometerAlt, FaPlay, FaUndo, FaTable, FaCode } from 'react-icons/fa';

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
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FaFont className="text-blue-500" />
            Input Strings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Card className="p-4 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
              <InputControl
                label="String 1"
                type="text"
                value={str1}
                onChange={(e) => setStr1(e.target.value)}
                disabled={isRunning}
                className="mb-0"
              />
            </Card>
            <Card className="p-4 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white">
              <InputControl
                label="String 2"
                type="text"
                value={str2}
                onChange={(e) => setStr2(e.target.value)}
                disabled={isRunning}
                className="mb-0"
              />
            </Card>
          </div>
          <div className="flex gap-4">
            <Button
              onClick={lcsDP}
              disabled={isRunning || !str1 || !str2}
              variant="primary"
              className="flex-1 flex items-center justify-center gap-2"
            >
              <FaPlay className="text-sm" />
              {isRunning ? 'Running...' : 'Find LCS'}
            </Button>
            <Button
              onClick={reset}
              variant="secondary"
              className="flex-1 flex items-center justify-center gap-2"
            >
              <FaUndo className="text-sm" />
              Reset
            </Button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <FaTachometerAlt className="text-blue-400" />
            Speed Control
          </h3>
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
          <Card className="p-6 border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-white shadow-lg">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FaTable className="text-purple-500" />
              Dynamic Programming Table
            </h2>
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
          </Card>

          <Card className="p-6 border-2 border-orange-100 bg-gradient-to-br from-orange-50 to-white shadow-lg">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FaCode className="text-orange-500" />
              How it Works
            </h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                The Longest Common Subsequence algorithm uses dynamic programming:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Create a DP table of size (m+1) × (n+1)</li>
                <li>If characters match, add 1 to the diagonal value</li>
                <li>If characters don't match, take max of left and top values</li>
                <li>Backtrack to find the actual subsequence</li>
                <li>Time complexity is O(mn) where m and n are string lengths</li>
              </ul>
            </div>
          </Card>
        </div>

        {lcs && (
          <Card className="p-6 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white shadow-lg">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FaFont className="text-green-500" />
              Result
            </h2>
            <div className="p-4 bg-white rounded-lg border-2 border-green-200">
              <p className="text-gray-700">Longest Common Subsequence: <span className="font-mono text-green-700 font-bold">{lcs}</span></p>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
} 
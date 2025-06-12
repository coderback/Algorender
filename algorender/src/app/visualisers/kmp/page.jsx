'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const KMPVisualizer = () => {
  const [text, setText] = useState('');
  const [pattern, setPattern] = useState('');
  const [matches, setMatches] = useState([]);
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    comparisons: 0,
    matches: 0,
    time: 0
  });

  const timeComplexity = {
    best: 'O(n + m)',
    average: 'O(n + m)',
    worst: 'O(n + m)',
    space: 'O(m)'
  };

  const computeLPSArray = (pattern) => {
    const lps = new Array(pattern.length).fill(0);
    let len = 0;
    let i = 1;
    while (i < pattern.length) {
      if (pattern[i] === pattern[len]) {
        len++;
        lps[i] = len;
        i++;
      } else {
        if (len !== 0) {
          len = lps[len - 1];
        } else {
          lps[i] = 0;
          i++;
        }
      }
    }
    return lps;
  };

  const kmp = () => {
    setIsSolving(true);
    const startTime = performance.now();
    let comparisons = 0;
    const newMatches = [];
    const lps = computeLPSArray(pattern);
    let i = 0; // index for text
    let j = 0; // index for pattern

    while (i < text.length) {
      comparisons++;
      if (pattern[j] === text[i]) {
        i++;
        j++;
      }
      if (j === pattern.length) {
        newMatches.push(i - j);
        j = lps[j - 1];
      } else if (i < text.length && pattern[j] !== text[i]) {
        if (j !== 0) {
          j = lps[j - 1];
        } else {
          i++;
        }
      }
    }

    const endTime = performance.now();
    setStats({
      comparisons,
      matches: newMatches.length,
      time: (endTime - startTime).toFixed(2)
    });
    setMatches(newMatches);
    setIsSolving(false);
  };

  return (
    <Layout timeComplexity={timeComplexity}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">KMP Algorithm</h1>
          <div className="flex items-center space-x-4">
            <InputControl
              label="Text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isSolving}
            />
            <InputControl
              label="Pattern"
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              disabled={isSolving}
            />
            <Button
              onClick={kmp}
              disabled={isSolving}
              variant="primary"
            >
              {isSolving ? 'Solving...' : 'Find Matches'}
            </Button>
          </div>
        </div>

        <StatsBar
          stats={[
            { label: 'Comparisons', value: stats.comparisons },
            { label: 'Matches', value: stats.matches },
            { label: 'Time (ms)', value: stats.time }
          ]}
          timeComplexity={timeComplexity}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Text</h2>
            <div className="p-4 border rounded-lg">
              {text.split('').map((char, index) => (
                <span
                  key={index}
                  className={`inline-block p-1 ${
                    matches.includes(index) ? 'bg-green-200' : ''
                  }`}
                >
                  {char}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                The KMP algorithm uses a prefix function to avoid unnecessary comparisons:
              </p>
              <ul className="list-disc list-inside text-gray-600">
                <li>Compute the longest proper prefix which is also a suffix (LPS)</li>
                <li>Use LPS to skip characters that are guaranteed to match</li>
                <li>If a mismatch occurs, use LPS to determine the next position</li>
                <li>Continue until the pattern is found or the text is exhausted</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default KMPVisualizer; 
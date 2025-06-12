'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const ZAlgorithmVisualizer = () => {
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
    space: 'O(n + m)'
  };

  const zAlgorithm = () => {
    setIsSolving(true);
    const startTime = performance.now();
    let comparisons = 0;
    const newMatches = [];
    const concat = pattern + '$' + text;
    const n = concat.length;
    const z = new Array(n).fill(0);
    let l = 0;
    let r = 0;

    for (let i = 1; i < n; i++) {
      comparisons++;
      if (i > r) {
        l = r = i;
        while (r < n && concat[r - l] === concat[r]) {
          comparisons++;
          r++;
        }
        z[i] = r - l;
        r--;
      } else {
        const k = i - l;
        if (z[k] < r - i + 1) {
          z[i] = z[k];
        } else {
          l = i;
          while (r < n && concat[r - l] === concat[r]) {
            comparisons++;
            r++;
          }
          z[i] = r - l;
          r--;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (z[i] === pattern.length) {
        newMatches.push(i - pattern.length - 1);
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
          <h1 className="text-2xl font-bold">Z-Algorithm</h1>
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
              onClick={zAlgorithm}
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
                The Z-Algorithm computes the Z-array for a string:
              </p>
              <ul className="list-disc list-inside text-gray-600">
                <li>Z[i] is the length of the longest substring starting at i that is also a prefix of the string</li>
                <li>Use the Z-array to find all occurrences of a pattern in a text</li>
                <li>Concatenate pattern and text with a special character</li>
                <li>Compute Z-array for the concatenated string</li>
                <li>Find positions where Z[i] equals the pattern length</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ZAlgorithmVisualizer; 
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
    <Layout
      title="Z-Algorithm"
      description="Visualize pattern matching using Z-function."
      timeComplexity={{ best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' }}
      spaceComplexity="O(n + m)"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Text</h2>
            <div className="p-4 border rounded-lg bg-white">
              {text.split('').map((char, index) => (
                <span
                  key={index}
                  className={`inline-block p-1 ${
                    matches.includes(index) ? 'bg-forest-100' : ''
                  }`}
                >
                  {char}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                The Z-Algorithm computes the Z-array for a string:
              </p>
              <div className="space-y-3 text-gray-600">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Z[i] is the length of the longest substring starting at i that is also a prefix of the string</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Use the Z-array to find all occurrences of a pattern in a text</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Concatenate pattern and text with a special character</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Compute Z-array for the concatenated string</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Find positions where Z[i] equals the pattern length</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ZAlgorithmVisualizer; 
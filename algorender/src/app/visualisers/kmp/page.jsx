'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaFont, FaPlay, FaUndo, FaSearch, FaCode } from 'react-icons/fa';

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
    <Layout
      title="KMP Algorithm"
      description="Visualize the Knuth-Morris-Pratt string matching algorithm in action."
      timeComplexity={{ best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' }}
      spaceComplexity="O(m)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card className="p-6 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaFont className="text-blue-500" />
              Input
            </h2>
            <div className="space-y-4">
              <InputControl
                type="text"
                label="Text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Enter text to search in"
                disabled={isSolving}
              />
              <InputControl
                type="text"
                label="Pattern"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                placeholder="Enter pattern to search for"
                disabled={isSolving}
              />
            </div>
          </Card>

          <Card className="p-6 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaSearch className="text-green-500" />
              Controls
            </h2>
            <div className="flex flex-wrap gap-4">
              <Button
                onClick={kmp}
                disabled={isSolving || !text || !pattern}
                variant="primary"
                className="flex items-center gap-2"
              >
                <FaPlay className="text-sm" />
                {isSolving ? 'Running...' : 'Run Algorithm'}
              </Button>
              <Button
                onClick={() => {
                  setText('');
                  setPattern('');
                  setMatches([]);
                  setStats({ comparisons: 0, matches: 0, time: 0 });
                }}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <FaUndo className="text-sm" />
                Reset
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Visualization</h2>
            <div className="relative">
              <div className="font-mono text-lg mb-4 break-all">
                {text.split('').map((char, i) => (
                  <span
                    key={i}
                    className={`inline-block w-8 h-8 text-center leading-8 border ${
                      matches.includes(i) ? 'bg-forest-100 border-forest-500' : 'border-gray-200'
                    }`}
                  >
                    {char}
                  </span>
                ))}
              </div>
              {pattern && (
                <div className="font-mono text-lg mb-4 break-all">
                  {pattern.split('').map((char, i) => (
                    <span
                      key={i}
                      className="inline-block w-8 h-8 text-center leading-8 border border-forest-200 bg-forest-50"
                    >
                      {char}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                The KMP algorithm uses a failure function to avoid unnecessary comparisons:
              </p>
              <div className="space-y-3 text-gray-600">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Preprocess pattern to create LPS (Longest Proper Prefix which is also Suffix) array</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Use LPS array to skip comparisons when a mismatch occurs</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>When a match is found, continue from the next position</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>When a mismatch occurs, use LPS to determine where to continue matching</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default KMPVisualizer; 
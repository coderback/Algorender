'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const RabinKarpVisualizer = () => {
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
    worst: 'O(nm)',
    space: 'O(1)'
  };

  const rabinKarp = () => {
    setIsSolving(true);
    const startTime = performance.now();
    let comparisons = 0;
    const newMatches = [];
    const n = text.length;
    const m = pattern.length;
    const d = 256; // number of characters in the input alphabet
    const q = 101; // a prime number
    let p = 0; // hash value for pattern
    let t = 0; // hash value for text
    let h = 1;

    // The value of h would be "pow(d, m-1)%q"
    for (let i = 0; i < m - 1; i++) {
      h = (h * d) % q;
    }

    // Calculate the hash value of pattern and first window of text
    for (let i = 0; i < m; i++) {
      p = (d * p + pattern.charCodeAt(i)) % q;
      t = (d * t + text.charCodeAt(i)) % q;
    }

    // Slide the pattern over text one by one
    for (let i = 0; i <= n - m; i++) {
      comparisons++;
      // Check the hash values of current window of text and pattern
      if (p === t) {
        // Check for characters one by one
        let j;
        for (j = 0; j < m; j++) {
          comparisons++;
          if (text[i + j] !== pattern[j]) {
            break;
          }
        }
        if (j === m) {
          newMatches.push(i);
        }
      }
      // Calculate hash value for next window of text
      if (i < n - m) {
        t = (d * (t - text.charCodeAt(i) * h) + text.charCodeAt(i + m)) % q;
        if (t < 0) {
          t = t + q;
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
      title="Rabin-Karp Algorithm"
      description="Visualize string pattern matching using rolling hash."
      timeComplexity={{ best: 'O(n + m)', average: 'O(n + m)', worst: 'O(nm)' }}
      spaceComplexity="O(1)"
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
              onClick={rabinKarp}
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
                The Rabin-Karp algorithm uses hashing to find a pattern in a text:
              </p>
              <div className="space-y-3 text-gray-600">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Calculate hash value of pattern and first window of text</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Slide the pattern over text one by one</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>If hash values match, check characters one by one</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>If all characters match, pattern is found</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Calculate hash value for next window of text</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default RabinKarpVisualizer; 
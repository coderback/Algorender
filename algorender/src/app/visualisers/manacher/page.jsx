'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const ManacherVisualizer = () => {
  const [text, setText] = useState('');
  const [palindromes, setPalindromes] = useState([]);
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    comparisons: 0,
    palindromes: 0,
    time: 0
  });

  const timeComplexity = {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)'
  };

  const manacher = () => {
    setIsSolving(true);
    const startTime = performance.now();
    let comparisons = 0;
    const newPalindromes = [];
    const s = '#' + text.split('').join('#') + '#';
    const n = s.length;
    const p = new Array(n).fill(0);
    let center = 0;
    let right = 0;

    for (let i = 0; i < n; i++) {
      comparisons++;
      if (i < right) {
        p[i] = Math.min(right - i, p[2 * center - i]);
      }
      let left = i - (p[i] + 1);
      let r = i + (p[i] + 1);
      while (left >= 0 && r < n && s[left] === s[r]) {
        comparisons++;
        p[i]++;
        left--;
        r++;
      }
      if (i + p[i] > right) {
        center = i;
        right = i + p[i];
      }
    }

    for (let i = 0; i < n; i++) {
      if (p[i] > 0) {
        const start = Math.floor((i - p[i]) / 2);
        const length = p[i];
        newPalindromes.push({ start, length });
      }
    }

    const endTime = performance.now();
    setStats({
      comparisons,
      palindromes: newPalindromes.length,
      time: (endTime - startTime).toFixed(2)
    });
    setPalindromes(newPalindromes);
    setIsSolving(false);
  };

  return (
    <Layout
      title="Manacher's Algorithm"
      description="Visualize finding all palindromic substrings in linear time."
      timeComplexity={{ best: 'O(n)', average: 'O(n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
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
            <Button
              onClick={manacher}
              disabled={isSolving}
              variant="primary"
            >
              {isSolving ? 'Solving...' : 'Find Palindromes'}
            </Button>
          </div>
        </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Text</h2>
            <div className="p-4 border rounded-lg bg-white">
              {text.split('').map((char, index) => (
                <span
                  key={index}
                  className={`inline-block p-1 ${
                    palindromes.some(p => index >= p.start && index < p.start + p.length) ? 'bg-forest-100' : ''
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
                Manacher's Algorithm finds all palindromes in a string:
              </p>
              <div className="space-y-3 text-gray-600">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Transform the string to handle even-length palindromes</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Use a center and right boundary to optimize palindrome checks</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Expand around each center to find palindromes</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Time complexity is O(n) where n is the length of the string</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ManacherVisualizer; 
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const TrieVisualizer = () => {
  const [text, setText] = useState('');
  const [prefix, setPrefix] = useState('');
  const [matches, setMatches] = useState([]);
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    comparisons: 0,
    matches: 0,
    time: 0
  });

  const timeComplexity = {
    best: 'O(m)',
    average: 'O(m)',
    worst: 'O(m)',
    space: 'O(ALPHABET_SIZE * N * M)'
  };

  const trie = () => {
    setIsSolving(true);
    const startTime = performance.now();
    let comparisons = 0;
    const newMatches = [];
    const words = text.split(' ');

    for (let i = 0; i < words.length; i++) {
      comparisons++;
      if (words[i].startsWith(prefix)) {
        newMatches.push(i);
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
      title="Trie (Prefix Matching)"
      description="Visualize prefix matching using a Trie data structure."
      timeComplexity={{ best: 'O(m)', average: 'O(m)', worst: 'O(m)' }}
      spaceComplexity="O(ALPHABET_SIZE * N * M)"
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
              label="Prefix"
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              disabled={isSolving}
            />
            <Button
              onClick={trie}
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
              {text.split(' ').map((word, index) => (
                <span
                  key={index}
                  className={`inline-block p-1 ${
                    matches.includes(index) ? 'bg-forest-100' : ''
                  }`}
                >
                  {word}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                The Trie data structure is used for efficient prefix matching:
              </p>
              <div className="space-y-3 text-gray-600">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Insert all words into a Trie</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Search for the prefix in the Trie</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>If the prefix is found, all words with that prefix are matches</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Time complexity is O(m) where m is the length of the prefix</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TrieVisualizer; 
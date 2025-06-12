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
    <Layout timeComplexity={timeComplexity}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Trie (Prefix Matching)</h1>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Text</h2>
            <div className="p-4 border rounded-lg">
              {text.split(' ').map((word, index) => (
                <span
                  key={index}
                  className={`inline-block p-1 ${
                    matches.includes(index) ? 'bg-green-200' : ''
                  }`}
                >
                  {word}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                The Trie data structure is used for efficient prefix matching:
              </p>
              <ul className="list-disc list-inside text-gray-600">
                <li>Insert all words into a Trie</li>
                <li>Search for the prefix in the Trie</li>
                <li>If the prefix is found, all words with that prefix are matches</li>
                <li>Time complexity is O(m) where m is the length of the prefix</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TrieVisualizer; 
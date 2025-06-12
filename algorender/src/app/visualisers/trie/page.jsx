'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function TrieVisualiser() {
  const [trie, setTrie] = useState({
    children: {},
    isEndOfWord: false
  });
  const [word, setWord] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [selectedPath, setSelectedPath] = useState([]);

  const insert = (word) => {
    if (word === '') return;
    const newTrie = { ...trie };
    let current = newTrie;
    const path = [];

    for (let char of word) {
      if (!current.children[char]) {
        current.children[char] = { children: {}, isEndOfWord: false };
      }
      current = current.children[char];
      path.push(char);
    }

    current.isEndOfWord = true;
    setTrie(newTrie);
    setWord('');
    setSelectedPath(path);
    setTimeout(() => setSelectedPath([]), 1000);
  };

  const search = (word) => {
    if (word === '') return;
    let current = trie;
    const path = [];
    let found = true;

    for (let char of word) {
      if (!current.children[char]) {
        found = false;
        break;
      }
      current = current.children[char];
      path.push(char);
    }

    setSearchResult(found && current.isEndOfWord);
    setWord('');
    setSelectedPath(path);
    setTimeout(() => setSelectedPath([]), 1000);
  };

  const reset = () => {
    setTrie({ children: {}, isEndOfWord: false });
    setWord('');
    setSearchResult(null);
    setSelectedPath([]);
  };

  const renderNode = (node, char = '', level = 0, path = []) => {
    const isSelected = path.join('') === selectedPath.join('');
    const hasChildren = Object.keys(node.children).length > 0;
    const isEnd = node.isEndOfWord;

    return (
      <div className="flex flex-col items-center">
        <div
          className={`w-16 h-16 rounded-lg flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-blue-100 border-2 border-blue-500 scale-110'
              : 'bg-white border border-gray-200'
          }`}
        >
          <div className="text-center">
            <span className="text-lg font-semibold text-gray-900">{char || 'root'}</span>
            {isEnd && (
              <div className="w-2 h-2 bg-green-500 rounded-full mx-auto mt-1"></div>
            )}
          </div>
        </div>
        {hasChildren && (
          <div className="flex justify-center mt-4 space-x-4">
            {Object.entries(node.children).map(([childChar, childNode]) => (
              <div key={childChar} className="flex flex-col items-center">
                <div className="w-0.5 h-4 bg-gray-300"></div>
                {renderNode(childNode, childChar, level + 1, [...path, childChar])}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout
      title="Trie Visualiser"
      description="Visualise trie operations for efficient string storage and retrieval."
      timeComplexity={{ best: 'O(1)', average: 'O(m)', worst: 'O(m)' }}
      spaceComplexity="O(ALPHABET_SIZE * N * M)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Trie</h2>
            <div className="flex justify-center">
              {renderNode(trie)}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Insert: O(m) - Add word character by character</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(m) - Find word by traversing path</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Green dot indicates end of word</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
            <div className="space-y-4">
              <InputControl
                label="Word"
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Enter word"
              />
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => insert(word)} variant="primary" fullWidth>
                  Insert
                </Button>
                <Button onClick={() => search(word)} variant="secondary" fullWidth>
                  Search
                </Button>
              </div>
              <Button onClick={reset} variant="secondary" fullWidth>
                Reset
              </Button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Total Nodes</h4>
                <p className="text-2xl font-semibold text-blue-600">
                  {countNodes(trie)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Search Result</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {searchResult === null ? '-' : searchResult ? 'Found' : 'Not Found'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function countNodes(node) {
  let count = 1;
  for (let child of Object.values(node.children)) {
    count += countNodes(child);
  }
  return count;
} 
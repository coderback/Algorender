"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import InputControl from "@/components/InputControl";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ControlsSection, 
  EnhancedDataStructureButtonGrid, 
  StatisticsDisplay, 
  SuccessDisplay,
  ErrorDisplay,
  ButtonPresets 
} from '@/components/VisualizerControls';

function TrieNode() {
  this.children = {};
  this.isEnd = false;
}

function insertWord(root, word) {
  let node = root;
  for (let char of word) {
    if (!node.children[char]) node.children[char] = new TrieNode();
    node = node.children[char];
  }
  node.isEnd = true;
}

function searchWord(root, word) {
  let node = root;
  for (let char of word) {
    if (!node.children[char]) return false;
    node = node.children[char];
  }
  return node.isEnd;
}

function startsWith(root, prefix) {
  let node = root;
  for (let char of prefix) {
    if (!node.children[char]) return false;
    node = node.children[char];
  }
  return true;
}

function renderTrie(node, prefix = "", highlight = "") {
  return (
    <ul className="ml-4">
      {Object.entries(node.children).map(([char, child]) => (
        <li key={prefix + char} className="mb-1">
          <span
            className={`inline-block px-2 py-1 rounded text-sm font-mono ${
              highlight.startsWith(prefix + char)
                ? "bg-blue-200 text-blue-800"
                : node.isEnd && Object.keys(child.children).length === 0
                ? "bg-green-200 text-green-800"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {char}
            {child.isEnd && <span className="ml-1 text-xs text-green-600">●</span>}
          </span>
          {renderTrie(child, prefix + char, highlight)}
        </li>
      ))}
    </ul>
  );
}

function countNodes(node) {
  if (!node) return 0;
  let count = 1;
  for (const child of Object.values(node.children)) {
    count += countNodes(child);
  }
  return count;
}

export default function TrieVisualiser() {
  const [root, setRoot] = useState(() => new TrieNode());
  const [word, setWord] = useState("");
  const [prefix, setPrefix] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [prefixResult, setPrefixResult] = useState(null);
  const [words, setWords] = useState([]);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const handleInsert = () => {
    if (!word.trim()) {
      setError('Please enter a word to insert');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    if (words.includes(word)) {
      setError(`Word "${word}" already exists in trie`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    insertWord(root, word);
    setWords((prev) => [...new Set([...prev, word])]);
    setSuccess(`Successfully inserted "${word}"`);
    setWord("");
    setSearchResult(null);
    setPrefixResult(null);
    setRoot(Object.assign(Object.create(Object.getPrototypeOf(root)), root)); // force update
    
    setTimeout(() => setSuccess(null), 2000);
  };

  const handleSearch = () => {
    if (!word.trim()) {
      setError('Please enter a word to search');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    const result = searchWord(root, word);
    setSearchResult(result);
    setPrefixResult(null);
    
    if (result) {
      setSuccess(`Found word "${word}" in trie`);
    } else {
      setError(`Word "${word}" not found in trie`);
    }
    
    setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 2000);
  };

  const handlePrefix = () => {
    if (!prefix.trim()) {
      setError('Please enter a prefix to check');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    const result = startsWith(root, prefix);
    setPrefixResult(result);
    setSearchResult(null);
    
    if (result) {
      setSuccess(`Prefix "${prefix}" exists in trie`);
    } else {
      setError(`Prefix "${prefix}" not found in trie`);
    }
    
    setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 2000);
  };

  const handleReset = () => {
    setRoot(new TrieNode());
    setWords([]);
    setWord("");
    setPrefix("");
    setSearchResult(null);
    setPrefixResult(null);
    setSuccess(null);
    setError(null);
  };

  return (
    <Layout
      title="Trie (Prefix Matching) Visualiser"
      description="Visualise how a Trie (Prefix Tree) works for word insertion, search, and prefix matching."
      timeComplexity={{ best: "O(1)", average: "O(L)", worst: "O(L)" }}
      spaceComplexity="O(N*L)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardContent className="py-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Trie Structure</h2>
              <div className="overflow-x-auto">
                {renderTrie(root, "", prefix || word)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Each node represents a character in a word.</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Insert: Traverse or create nodes for each character, mark end of word.</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Search: Traverse nodes for each character, check end marker.</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Prefix Match: Traverse nodes for prefix, check if path exists.</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Inserted Words</h3>
              <div className="flex flex-wrap gap-2">
                {words.length === 0 ? (
                  <span className="text-gray-400">No words inserted yet.</span>
                ) : (
                  words.map((w) => (
                    <span key={w} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-mono">
                      {w}
                    </span>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <ErrorDisplay error={error} />
          <SuccessDisplay message={success} />
          
          <ControlsSection title="Word Operations">
            <div className="space-y-4">
              <InputControl
                label="Insert/Search Word"
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Enter word"
              />
              
              <EnhancedDataStructureButtonGrid
                operations={[
                  ButtonPresets.dataStructure.insert(handleInsert, !word.trim()),
                  ButtonPresets.dataStructure.search(handleSearch, !word.trim())
                ]}
                resetAction={ButtonPresets.dataStructure.reset(handleReset)}
              />
              
              <InputControl
                label="Prefix Match"
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="Enter prefix"
              />
              
              <EnhancedDataStructureButtonGrid
                operations={[
                  {
                    onClick: handlePrefix,
                    icon: ButtonPresets.dataStructure.search.icon,
                    label: 'Check Prefix',
                    disabled: !prefix.trim(),
                    variant: 'secondary'
                  }
                ]}
              />
            </div>
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Words', value: words.length, color: 'text-blue-600' },
              { label: 'Nodes', value: countNodes(root), color: 'text-gray-900' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
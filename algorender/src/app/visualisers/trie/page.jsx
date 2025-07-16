"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import InputControl from "@/components/InputControl";
import Button from "@/components/Button";
import { Card, CardContent } from "@/components/ui/card";

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

  const handleInsert = () => {
    if (!word) return;
    insertWord(root, word);
    setWords((prev) => [...new Set([...prev, word])]);
    setWord("");
    setSearchResult(null);
    setPrefixResult(null);
    setRoot(Object.assign(Object.create(Object.getPrototypeOf(root)), root)); // force update
  };

  const handleSearch = () => {
    if (!word) return;
    setSearchResult(searchWord(root, word));
    setPrefixResult(null);
  };

  const handlePrefix = () => {
    if (!prefix) return;
    setPrefixResult(startsWith(root, prefix));
    setSearchResult(null);
  };

  const handleReset = () => {
    setRoot(new TrieNode());
    setWords([]);
    setWord("");
    setPrefix("");
    setSearchResult(null);
    setPrefixResult(null);
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
          <Card>
            <CardContent className="py-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Controls</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Insert/Search Word</label>
                  <InputControl
                    type="text"
                    value={word}
                    onChange={(e) => setWord(e.target.value)}
                    placeholder="Enter word"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button onClick={handleInsert} disabled={!word}>
                      Insert
                    </Button>
                    <Button onClick={handleSearch} disabled={!word} variant="secondary">
                      Search
                    </Button>
                  </div>
                  {searchResult !== null && (
                    <div className="mt-2 text-sm">
                      {searchResult ? (
                        <span className="text-green-600">Word found in trie!</span>
                      ) : (
                        <span className="text-red-500">Word not found.</span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Prefix Match</label>
                  <InputControl
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="Enter prefix"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button onClick={handlePrefix} disabled={!prefix}>
                      Check Prefix
                    </Button>
                  </div>
                  {prefixResult !== null && (
                    <div className="mt-2 text-sm">
                      {prefixResult ? (
                        <span className="text-green-600">Prefix exists in trie!</span>
                      ) : (
                        <span className="text-red-500">Prefix not found.</span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Button onClick={handleReset} variant="secondary">
                    Reset Trie
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Words</h4>
                    <p className="text-2xl font-semibold text-blue-600">{words.length}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Nodes</h4>
                    <p className="text-2xl font-semibold text-gray-900">{countNodes(root)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
} 
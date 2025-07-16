'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaFilter, FaPlus, FaSearch, FaUndo, FaHashtag } from 'react-icons/fa';

export default function BloomFilterVisualiser() {
  const [filter, setFilter] = useState(Array(20).fill(0));
  const [element, setElement] = useState('');
  const [hashFunctions, setHashFunctions] = useState(3);
  const [falsePositives, setFalsePositives] = useState(0);
  const [totalChecks, setTotalChecks] = useState(0);

  const hash1 = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % filter.length;
  };

  const hash2 = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash) % filter.length;
  };

  const hash3 = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 6) + (hash << 16) - hash);
    }
    return Math.abs(hash) % filter.length;
  };

  const getHashValues = (str) => {
    const hashes = [hash1(str), hash2(str), hash3(str)];
    return hashes.slice(0, hashFunctions);
  };

  const insert = () => {
    if (!element) return;

    const newFilter = [...filter];
    const hashValues = getHashValues(element);

    hashValues.forEach(index => {
      newFilter[index] = 1;
    });

    setFilter(newFilter);
    setElement('');
  };

  const check = () => {
    if (!element) return;

    const hashValues = getHashValues(element);
    const mightExist = hashValues.every(index => filter[index] === 1);
    
    setTotalChecks(prev => prev + 1);
    if (mightExist) {
      setFalsePositives(prev => prev + 1);
    }

    return mightExist;
  };

  const reset = () => {
    setFilter(Array(20).fill(0));
    setFalsePositives(0);
    setTotalChecks(0);
  };

  return (
    <Layout
      title="Bloom Filter Visualiser"
      description="Visualise probabilistic data structure operations with false positive rate tracking."
      timeComplexity={{ best: 'O(k)', average: 'O(k)', worst: 'O(k)' }}
      spaceComplexity="O(m)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Bloom Filter</h2>
          <div className="flex flex-wrap gap-2">
            {filter.map((bit, index) => (
              <div
                key={index}
                className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold transition-colors ${
                  bit ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 shadow-sm'
                }`}
              >
                {bit}
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-700 mb-2">False Positive Rate</h3>
              <p className="text-2xl font-semibold text-blue-600">
                {totalChecks > 0 ? ((falsePositives / totalChecks) * 100).toFixed(2) : 0}%
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Total Checks</h3>
                <p className="text-xl font-semibold text-gray-900">{totalChecks}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 mb-1">False Positives</h3>
                <p className="text-xl font-semibold text-gray-900">{falsePositives}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaFilter className="text-blue-500" />
              Operations
            </h2>
            <div className="space-y-4">
              <InputControl
                label="Number of Hash Functions"
                type="number"
                value={hashFunctions}
                onChange={(e) => setHashFunctions(Math.min(3, Math.max(1, parseInt(e.target.value) || 1)))}
                min={1}
                max={3}
              />
              <InputControl
                label="Element"
                value={element}
                onChange={(e) => setElement(e.target.value)}
                placeholder="Enter element"
              />
              <div className="grid grid-cols-3 gap-3">
                <Button onClick={insert} variant="primary" className="flex items-center justify-center gap-2">
                  <FaPlus className="text-sm" />
                  Insert
                </Button>
                <Button onClick={check} variant="success" className="flex items-center justify-center gap-2">
                  <FaSearch className="text-sm" />
                  Check
                </Button>
                <Button onClick={reset} variant="danger" className="flex items-center justify-center gap-2">
                  <FaUndo className="text-sm" />
                  Reset
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white">
            <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
              <FaHashtag className="text-green-500" />
              How it Works
            </h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <FaPlus className="w-5 h-5 text-blue-500 mt-0.5" />
                <span>Insert: Adds an element to the filter by setting multiple bits</span>
              </div>
              <div className="flex items-start space-x-2">
                <FaSearch className="w-5 h-5 text-blue-500 mt-0.5" />
                <span>Check: Tests if an element might be in the set</span>
              </div>
              <div className="flex items-start space-x-2">
                <FaFilter className="w-5 h-5 text-yellow-500 mt-0.5" />
                <span>False positives are possible, but false negatives are not</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
} 
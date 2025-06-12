'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function HashSetVisualiser() {
  const [hashSet, setHashSet] = useState({
    buckets: Array(7).fill(null).map(() => []),
    size: 0,
    capacity: 7,
    loadFactor: 0.75
  });
  const [value, setValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [collisionPath, setCollisionPath] = useState([]);

  const hash = (value) => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % hashSet.capacity;
  };

  const insert = () => {
    if (!value) return;
    if (hashSet.size / hashSet.capacity >= hashSet.loadFactor) {
      rehash();
    }

    const index = hash(value);
    const bucket = hashSet.buckets[index];
    
    // Check if value already exists
    if (bucket.includes(value)) {
      setSearchResult({ found: true, index, bucketIndex: bucket.indexOf(value) });
      setTimeout(() => setSearchResult(null), 2000);
      return;
    }

    // Track collision path
    const path = [];
    if (bucket.length > 0) {
      path.push({ index, bucketIndex: bucket.length });
    }

    setHashSet(prev => ({
      ...prev,
      buckets: prev.buckets.map((b, i) => 
        i === index ? [...b, value] : b
      ),
      size: prev.size + 1
    }));

    setCollisionPath(path);
    setTimeout(() => setCollisionPath([]), 2000);
    setValue('');
  };

  const remove = () => {
    if (!value) return;
    const index = hash(value);
    const bucket = hashSet.buckets[index];
    const bucketIndex = bucket.indexOf(value);

    if (bucketIndex === -1) {
      setSearchResult({ found: false, index });
      setTimeout(() => setSearchResult(null), 2000);
      return;
    }

    setHashSet(prev => ({
      ...prev,
      buckets: prev.buckets.map((b, i) => 
        i === index ? b.filter((_, bi) => bi !== bucketIndex) : b
      ),
      size: prev.size - 1
    }));

    setValue('');
  };

  const search = () => {
    if (!searchValue) return;
    const index = hash(searchValue);
    const bucket = hashSet.buckets[index];
    const bucketIndex = bucket.indexOf(searchValue);

    setSearchResult({
      found: bucketIndex !== -1,
      index,
      bucketIndex
    });
    setTimeout(() => setSearchResult(null), 2000);
  };

  const rehash = () => {
    const newCapacity = hashSet.capacity * 2;
    const newBuckets = Array(newCapacity).fill(null).map(() => []);
    
    // Rehash all existing values
    hashSet.buckets.forEach(bucket => {
      bucket.forEach(value => {
        const newIndex = hash(value);
        newBuckets[newIndex].push(value);
      });
    });

    setHashSet(prev => ({
      ...prev,
      buckets: newBuckets,
      capacity: newCapacity
    }));
  };

  const reset = () => {
    setHashSet({
      buckets: Array(7).fill(null).map(() => []),
      size: 0,
      capacity: 7,
      loadFactor: 0.75
    });
    setValue('');
    setSearchValue('');
    setSearchResult(null);
    setCollisionPath([]);
  };

  return (
    <Layout
      title="Hash Set Visualiser"
      description="Visualise how hash sets work with collision handling and rehashing."
      timeComplexity={{ best: 'O(1)', average: 'O(1)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Hash Set</h2>
            <div className="space-y-4">
              {hashSet.buckets.map((bucket, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border transition-all ${
                    searchResult?.index === index
                      ? 'bg-blue-100 border-blue-500'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                      {index}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">Bucket:</div>
                      <div className="flex flex-wrap gap-2">
                        {bucket.map((value, bucketIndex) => (
                          <div
                            key={bucketIndex}
                            className={`px-2 py-1 rounded text-sm ${
                              searchResult?.bucketIndex === bucketIndex
                                ? 'bg-blue-100 text-blue-700'
                                : collisionPath.some(p => p.index === index && p.bucketIndex === bucketIndex)
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {value}
                          </div>
                        ))}
                        {bucket.length === 0 && (
                          <span className="text-gray-400 text-sm">Empty</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Insert: O(1) average - Hash and store in bucket</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Search: O(1) average - Hash and check bucket</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Rehash: O(n) - Double capacity when load factor reached</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={reset} variant="secondary" fullWidth>
                  Reset
                </Button>
                <Button onClick={rehash} variant="primary" fullWidth>
                  Rehash
                </Button>
              </div>

              <div className="space-y-3">
                <InputControl
                  label="Value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value to insert/remove"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={insert} variant="primary" fullWidth>
                    Insert
                  </Button>
                  <Button onClick={remove} variant="secondary" fullWidth>
                    Remove
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <InputControl
                  label="Search Value"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Enter value to search"
                />
                <Button onClick={search} variant="primary" fullWidth>
                  Search
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Size</h4>
                <p className="text-2xl font-semibold text-blue-600">{hashSet.size}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Capacity</h4>
                <p className="text-2xl font-semibold text-gray-900">{hashSet.capacity}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Load Factor</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {(hashSet.size / hashSet.capacity).toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Collisions</h4>
                <p className="text-2xl font-semibold text-gray-900">
                  {hashSet.buckets.reduce((sum, bucket) => sum + Math.max(0, bucket.length - 1), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
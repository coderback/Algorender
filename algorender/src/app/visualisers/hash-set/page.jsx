'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  EnhancedDataStructureButtonGrid, 
  StatisticsDisplay, 
  ErrorDisplay,
  SuccessDisplay,
  ButtonPresets 
} from '@/components/VisualizerControls';

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
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const hash = (value) => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % hashSet.capacity;
  };

  const insert = () => {
    if (!value.trim()) {
      setError('Please enter a value to insert');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    if (hashSet.size / hashSet.capacity >= hashSet.loadFactor) {
      rehash();
    }

    const index = hash(value);
    const bucket = hashSet.buckets[index];
    
    // Check if value already exists
    if (bucket.includes(value)) {
      setError(`Value "${value}" already exists`);
      setSearchResult({ found: true, index, bucketIndex: bucket.indexOf(value) });
      setTimeout(() => {
        setError(null);
        setSearchResult(null);
      }, 2000);
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
    setSuccess(`Successfully inserted "${value}"`);
    setTimeout(() => {
      setCollisionPath([]);
      setSuccess(null);
    }, 2000);
    setValue('');
  };

  const remove = () => {
    if (!value.trim()) {
      setError('Please enter a value to remove');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    const index = hash(value);
    const bucket = hashSet.buckets[index];
    const bucketIndex = bucket.indexOf(value);

    if (bucketIndex === -1) {
      setError(`Value "${value}" not found`);
      setSearchResult({ found: false, index });
      setTimeout(() => {
        setError(null);
        setSearchResult(null);
      }, 2000);
      return;
    }

    setHashSet(prev => ({
      ...prev,
      buckets: prev.buckets.map((b, i) => 
        i === index ? b.filter((_, bi) => bi !== bucketIndex) : b
      ),
      size: prev.size - 1
    }));

    setSuccess(`Successfully removed "${value}"`);
    setTimeout(() => setSuccess(null), 2000);
    setValue('');
  };

  const search = () => {
    if (!searchValue.trim()) {
      setError('Please enter a value to search');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    const index = hash(searchValue);
    const bucket = hashSet.buckets[index];
    const bucketIndex = bucket.indexOf(searchValue);

    setSearchResult({
      found: bucketIndex !== -1,
      index,
      bucketIndex
    });
    
    if (bucketIndex !== -1) {
      setSuccess(`Found "${searchValue}" at bucket ${index}`);
    } else {
      setError(`"${searchValue}" not found`);
    }
    
    setTimeout(() => {
      setSearchResult(null);
      setSuccess(null);
      setError(null);
    }, 2000);
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
    setError(null);
    setSuccess(null);
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
          <ErrorDisplay error={error} />
          <SuccessDisplay message={success} />
          
          <ControlsSection title="Operations">
            <div className="space-y-4">
              <InputControl
                label="Value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter value to insert/remove"
              />
              
              <EnhancedDataStructureButtonGrid
                operations={[
                  ButtonPresets.dataStructure.insert(insert),
                  ButtonPresets.dataStructure.remove(remove, !value.trim()),
                  {
                    onClick: rehash,
                    icon: ButtonPresets.dataStructure.search().icon,
                    label: 'Rehash',
                    variant: 'secondary'
                  }
                ]}
                resetAction={ButtonPresets.dataStructure.reset(reset)}
              />
              
              <InputControl
                label="Search Value"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Enter value to search"
              />
              
              <EnhancedDataStructureButtonGrid
                operations={[
                  ButtonPresets.dataStructure.search(search, !searchValue.trim())
                ]}
              />
            </div>
          </ControlsSection>

          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Size', value: hashSet.size, color: 'text-blue-600' },
              { label: 'Capacity', value: hashSet.capacity, color: 'text-gray-900' },
              { label: 'Load Factor', value: (hashSet.size / hashSet.capacity).toFixed(2), color: 'text-gray-900' },
              { label: 'Collisions', value: hashSet.buckets.reduce((sum, bucket) => sum + Math.max(0, bucket.length - 1), 0), color: 'text-red-600' }
            ]}
          />
        </div>
      </div>
    </Layout>
  );
} 
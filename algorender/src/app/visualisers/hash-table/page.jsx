'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { 
  ControlsSection, 
  StatisticsDisplay, 
  EnhancedDataStructureButtonGrid,
  ButtonPresets,
  ErrorDisplay,
  SuccessDisplay 
} from '@/components/VisualizerControls';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaKey, FaSearch, FaPlus, FaTrashAlt, FaExclamationTriangle, FaUndo } from 'react-icons/fa';

export default function HashTableVisualiser() {
  const [table, setTable] = useState(Array(10).fill(null));
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [collisions, setCollisions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hashFunction = (key) => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % table.length;
  };

  const insert = () => {
    setError('');
    setSuccess('');
    
    if (!key || !value) {
      setError('Both key and value are required');
      return;
    }

    // Check if key already exists
    const index = hashFunction(key);
    let current = table[index];
    while (current) {
      if (current.key === key) {
        setError(`Key "${key}" already exists in the hash table`);
        return;
      }
      current = current.next;
    }

    const newTable = [...table];
    const newCollisions = [...collisions];

    if (newTable[index] === null) {
      newTable[index] = { key, value };
      setCollisions(newCollisions.filter(c => c.index !== index));
      setSuccess(`Successfully inserted "${key}" at index ${index}`);
    } else {
      if (!newTable[index].next) {
        newTable[index] = {
          ...newTable[index],
          next: { key, value }
        };
      } else {
        let current = newTable[index];
        while (current.next) {
          current = current.next;
        }
        current.next = { key, value };
      }
      newCollisions.push({ index, key });
      setSuccess(`Successfully inserted "${key}" at index ${index} (collision resolved by chaining)`);
    }

    setTable(newTable);
    setCollisions(newCollisions);
    setKey('');
    setValue('');
  };

  const remove = (index, chainIndex = 0) => {
    const newTable = [...table];
    const newCollisions = [...collisions];

    if (chainIndex === 0) {
      if (newTable[index].next) {
        newTable[index] = newTable[index].next;
      } else {
        newTable[index] = null;
      }
    } else {
      let current = newTable[index];
      for (let i = 0; i < chainIndex - 1; i++) {
        current = current.next;
      }
      current.next = current.next.next;
    }

    setTable(newTable);
    setCollisions(newCollisions.filter(c => c.index !== index));
  };

  const search = () => {
    setError('');
    setSuccess('');
    
    if (!key) {
      setError('Key is required for search');
      return;
    }

    const index = hashFunction(key);
    let current = table[index];
    let chainIndex = 0;

    while (current) {
      if (current.key === key) {
        setValue(current.value);
        setSuccess(`Found "${key}" with value "${current.value}" at index ${index}`);
        return;
      }
      current = current.next;
      chainIndex++;
    }

    setValue('');
    setError(`Key "${key}" not found in the hash table`);
  };

  const reset = () => {
    setTable(Array(10).fill(null));
    setKey('');
    setValue('');
    setCollisions([]);
    setError('');
    setSuccess('');
  };

  // Calculate statistics
  const totalEntries = table.reduce((count, slot) => {
    if (!slot) return count;
    let entries = 1;
    let current = slot.next;
    while (current) {
      entries++;
      current = current.next;
    }
    return count + entries;
  }, 0);

  const loadFactor = ((totalEntries / table.length) * 100).toFixed(1);
  const occupiedSlots = table.filter(slot => slot !== null).length;

  const stats = [
    { label: 'Total Entries', value: totalEntries, color: 'text-blue-600' },
    { label: 'Occupied Slots', value: occupiedSlots, color: 'text-green-600' },
    { label: 'Load Factor', value: `${loadFactor}%`, color: 'text-purple-600' },
    { label: 'Collisions', value: collisions.length, color: 'text-orange-600' }
  ];

  return (
    <Layout
      title="Hash Table Visualiser"
      description="Visualise hash table operations with collision handling using chaining."
      timeComplexity={{ best: 'O(1)', average: 'O(1)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Hash Table</h2>
          <div className="space-y-3">
            {table.map((slot, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center font-semibold text-gray-700">
                  {index}
                </div>
                <div className="flex-1">
                  {slot ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <div className="px-4 py-2 bg-white rounded-lg shadow-sm text-gray-800">
                          {slot.key} → {slot.value}
                        </div>
                        <button
                          onClick={() => remove(index)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {slot.next && (
                        <div className="ml-4 space-y-2">
                          {(() => {
                            const chain = [];
                            let current = slot.next;
                            let chainIndex = 1;
                            while (current) {
                              chain.push(
                                <div key={chainIndex} className="flex items-center space-x-2">
                                  <div className="px-4 py-2 bg-white rounded-lg shadow-sm text-gray-800">
                                    {current.key} → {current.value}
                                  </div>
                                  <button
                                    onClick={() => remove(index, chainIndex)}
                                    className="text-red-500 hover:text-red-700 transition-colors"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                              current = current.next;
                              chainIndex++;
                            }
                            return chain;
                          })()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-2 bg-white rounded-lg shadow-sm text-gray-500">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <ErrorDisplay error={error} onDismiss={() => setError('')} />
          <SuccessDisplay message={success} onDismiss={() => setSuccess('')} />
          
          <ControlsSection title="Operations">
            <InputControl
              label="Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter key"
            />
            <InputControl
              label="Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value"
            />
            
            <EnhancedDataStructureButtonGrid
              operations={[
                ButtonPresets.dataStructure.insert(insert, !key || !value),
                ButtonPresets.dataStructure.search(search, !key)
              ]}
              resetAction={ButtonPresets.dataStructure.reset(reset)}
            />
          </ControlsSection>

          <StatisticsDisplay 
            title="Statistics" 
            stats={stats}
            columns={2}
          />

          {collisions.length > 0 && (
            <Card className="p-6 border-2 border-yellow-100 bg-gradient-to-br from-yellow-50 to-white">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                <FaExclamationTriangle className="text-yellow-500" />
                Collisions
              </h3>
              <div className="space-y-2">
                {collisions.map((collision, i) => (
                  <div key={i} className="flex items-center space-x-2 text-gray-600">
                    <FaExclamationTriangle className="w-5 h-5 text-yellow-500" />
                    <span>Key &quot;{collision.key}&quot; collided at index {collision.index}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
} 
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaKey, FaSearch, FaPlus, FaTrashAlt, FaExclamationTriangle } from 'react-icons/fa';

export default function HashTableVisualiser() {
  const [table, setTable] = useState(Array(10).fill(null));
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [collisions, setCollisions] = useState([]);

  const hashFunction = (key) => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % table.length;
  };

  const insert = () => {
    if (!key || !value) return;

    const index = hashFunction(key);
    const newTable = [...table];
    const newCollisions = [...collisions];

    if (newTable[index] === null) {
      newTable[index] = { key, value };
      setCollisions(newCollisions.filter(c => c.index !== index));
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
    if (!key) return;

    const index = hashFunction(key);
    let current = table[index];
    let chainIndex = 0;

    while (current) {
      if (current.key === key) {
        setValue(current.value);
        return;
      }
      current = current.next;
      chainIndex++;
    }

    setValue('');
  };

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
          <Card className="p-6 border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaKey className="text-blue-500" />
              Operations
            </h2>
            <div className="space-y-4">
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
              <div className="flex space-x-3">
                <Button onClick={insert} variant="primary" className="flex-1 flex items-center justify-center gap-2">
                  <FaPlus className="text-sm" />
                  Insert
                </Button>
                <Button onClick={search} variant="success" className="flex-1 flex items-center justify-center gap-2">
                  <FaSearch className="text-sm" />
                  Search
                </Button>
              </div>
            </div>
          </Card>

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
                    <span>Key "{collision.key}" collided at index {collision.index}</span>
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
'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import Button from '@/components/Button';

export default function CuckooHashVisualiser() {
  const [table1, setTable1] = useState(Array(10).fill(null));
  const [table2, setTable2] = useState(Array(10).fill(null));
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [displacements, setDisplacements] = useState(0);
  const [maxDisplacements] = useState(10);

  const hash1 = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % table1.length;
  };

  const hash2 = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash) % table2.length;
  };

  const insert = () => {
    if (!key || !value) return;

    let currentKey = key;
    let currentValue = value;
    let currentDisplacements = 0;
    let tableIndex = 0;

    while (currentDisplacements < maxDisplacements) {
      const index = tableIndex === 0 ? hash1(currentKey) : hash2(currentKey);
      const currentTable = tableIndex === 0 ? table1 : table2;
      const setCurrentTable = tableIndex === 0 ? setTable1 : setTable2;

      if (!currentTable[index]) {
        const newTable = [...currentTable];
        newTable[index] = { key: currentKey, value: currentValue };
        setCurrentTable(newTable);
        setDisplacements(currentDisplacements);
        setKey('');
        setValue('');
        return;
      }

      const temp = currentTable[index];
      const newTable = [...currentTable];
      newTable[index] = { key: currentKey, value: currentValue };
      setCurrentTable(newTable);

      currentKey = temp.key;
      currentValue = temp.value;
      tableIndex = 1 - tableIndex;
      currentDisplacements++;
    }

    setDisplacements(currentDisplacements);
    alert('Maximum displacements reached. Consider resizing the tables.');
  };

  const remove = (tableIndex, index) => {
    if (tableIndex === 0) {
      const newTable = [...table1];
      newTable[index] = null;
      setTable1(newTable);
    } else {
      const newTable = [...table2];
      newTable[index] = null;
      setTable2(newTable);
    }
  };

  const search = () => {
    if (!key) return;

    const index1 = hash1(key);
    const index2 = hash2(key);

    if (table1[index1]?.key === key) {
      return table1[index1].value;
    }
    if (table2[index2]?.key === key) {
      return table2[index2].value;
    }

    return null;
  };

  const reset = () => {
    setTable1(Array(10).fill(null));
    setTable2(Array(10).fill(null));
    setDisplacements(0);
  };

  return (
    <Layout
      title="Cuckoo Hash Visualiser"
      description="Visualise cuckoo hashing operations with displacement tracking."
      timeComplexity={{ best: 'O(1)', average: 'O(1)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Table 1</h2>
            <div className="grid grid-cols-5 gap-3">
              {table1.map((entry, index) => (
                <div
                  key={index}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center p-2 text-sm ${
                    entry ? 'bg-blue-50 border-2 border-blue-200' : 'bg-white border border-gray-200'
                  }`}
                >
                  {entry ? (
                    <>
                      <span className="font-medium text-blue-900">{entry.key}</span>
                      <span className="text-blue-600">{entry.value}</span>
                      <button
                        onClick={() => remove(0, index)}
                        className="mt-1 text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-400">Empty</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Table 2</h2>
            <div className="grid grid-cols-5 gap-3">
              {table2.map((entry, index) => (
                <div
                  key={index}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center p-2 text-sm ${
                    entry ? 'bg-green-50 border-2 border-green-200' : 'bg-white border border-gray-200'
                  }`}
                >
                  {entry ? (
                    <>
                      <span className="font-medium text-green-900">{entry.key}</span>
                      <span className="text-green-600">{entry.value}</span>
                      <button
                        onClick={() => remove(1, index)}
                        className="mt-1 text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-400">Empty</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operations</h2>
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
              <div className="grid grid-cols-3 gap-3">
                <Button onClick={insert} variant="primary" fullWidth>
                  Insert
                </Button>
                <Button onClick={search} variant="success" fullWidth>
                  Search
                </Button>
                <Button onClick={reset} variant="danger" fullWidth>
                  Reset
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Current Displacements</h4>
                <p className="text-2xl font-semibold text-blue-600">{displacements}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Max Displacements</h4>
                <p className="text-2xl font-semibold text-gray-900">{maxDisplacements}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Each key has two possible positions (one in each table)</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>If a position is occupied, the existing entry is displaced</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>If maximum displacements are reached, the tables may need resizing</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 
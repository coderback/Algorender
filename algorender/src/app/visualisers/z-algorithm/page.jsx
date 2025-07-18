'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import {
  ControlsSection,
  SpeedControl,
  EnhancedDataStructureButtonGrid,
  StatisticsDisplay,
  ButtonPresets
} from '@/components/VisualizerControls';
import { FaSearch, FaTable, FaFont } from 'react-icons/fa';

const ZAlgorithmVisualizer = () => {
  const [text, setText] = useState('');
  const [pattern, setPattern] = useState('');
  const [matches, setMatches] = useState([]);
  const [zArray, setZArray] = useState([]);
  const [concatenatedString, setConcatenatedString] = useState('');
  const [currentPosition, setCurrentPosition] = useState(-1);
  const [isSolving, setIsSolving] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [stats, setStats] = useState({
    comparisons: 0,
    matches: 0,
    time: 0,
    zArrayLength: 0
  });

  const timeComplexity = {
    best: 'O(n + m)',
    average: 'O(n + m)',
    worst: 'O(n + m)',
    space: 'O(n + m)'
  };

  const zAlgorithm = async () => {
    if (!text.trim() || !pattern.trim()) return;
    
    setIsSolving(true);
    setMatches([]);
    setZArray([]);
    setCurrentPosition(-1);
    const startTime = performance.now();
    let comparisons = 0;
    const newMatches = [];
    const concat = pattern + '$' + text;
    setConcatenatedString(concat);
    const n = concat.length;
    const z = new Array(n).fill(0);
    let l = 0;
    let r = 0;

    // Z-algorithm computation with visualization
    for (let i = 1; i < n; i++) {
      setCurrentPosition(i);
      setZArray([...z]);
      await new Promise(resolve => setTimeout(resolve, speed));
      
      comparisons++;
      if (i > r) {
        l = r = i;
        while (r < n && concat[r - l] === concat[r]) {
          comparisons++;
          r++;
        }
        z[i] = r - l;
        r--;
      } else {
        const k = i - l;
        if (z[k] < r - i + 1) {
          z[i] = z[k];
        } else {
          l = i;
          while (r < n && concat[r - l] === concat[r]) {
            comparisons++;
            r++;
          }
          z[i] = r - l;
          r--;
        }
      }
      
      setStats({
        comparisons,
        matches: newMatches.length,
        time: ((performance.now() - startTime) / 1000).toFixed(2),
        zArrayLength: n
      });
    }

    // Find matches
    for (let i = 0; i < n; i++) {
      if (z[i] === pattern.length) {
        const matchPosition = i - pattern.length - 1;
        if (matchPosition >= 0) {
          newMatches.push(matchPosition);
        }
      }
    }

    setZArray(z);
    setMatches(newMatches);
    setCurrentPosition(-1);
    setStats(prev => ({ ...prev, matches: newMatches.length }));
    setIsSolving(false);
  };

  const reset = () => {
    setText('');
    setPattern('');
    setMatches([]);
    setZArray([]);
    setConcatenatedString('');
    setCurrentPosition(-1);
    setStats({ comparisons: 0, matches: 0, time: 0, zArrayLength: 0 });
  };

  return (
    <Layout
      title="Z-Algorithm"
      description="Visualize pattern matching using the Z-function for efficient string searching."
      timeComplexity={{ best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' }}
      spaceComplexity="O(n + m)"
    >
      <div className="space-y-6">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            String Inputs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputControl
              label="Text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isSolving}
              placeholder="Enter text to search in (e.g., 'ababcababa')"
            />
            <InputControl
              label="Pattern"
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              disabled={isSolving}
              placeholder="Enter pattern to search for (e.g., 'aba')"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <ControlsSection>
              <SpeedControl
                speed={speed}
                onSpeedChange={(e) => setSpeed(1000 - e.target.value)}
                disabled={isSolving}
                label="Animation Speed"
              />
              
              <EnhancedDataStructureButtonGrid
                operations={[
                  {
                    onClick: zAlgorithm,
                    icon: FaSearch,
                    label: isSolving ? 'Running...' : 'Start Z-Algorithm',
                    disabled: isSolving || !text.trim() || !pattern.trim(),
                    variant: 'primary'
                  }
                ]}
                resetAction={ButtonPresets.dataStructure.reset(reset)}
                disabled={isSolving}
              />
            </ControlsSection>

            <StatisticsDisplay
              title="Statistics"
              stats={[
                { label: 'Comparisons', value: stats.comparisons, color: 'text-blue-600' },
                { label: 'Z-Array Length', value: stats.zArrayLength, color: 'text-orange-600' },
                { label: 'Matches Found', value: stats.matches, color: 'text-green-600' },
                { label: 'Time (seconds)', value: stats.time, color: 'text-purple-600' }
              ]}
              columns={2}
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                Text Visualization
              </h2>
              {text ? (
                <div className="space-y-4">
                  <div className="font-mono text-lg">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Original Text:</h3>
                    <div className="flex flex-wrap gap-1 p-3 bg-white rounded border">
                      {text.split('').map((char, i) => {
                        const isMatch = matches.some(matchIndex => 
                          i >= matchIndex && i < matchIndex + pattern.length
                        );
                        
                        return (
                          <span
                            key={i}
                            className={`inline-block w-8 h-8 text-center leading-8 border-2 font-bold transition-all duration-300 ${
                              isMatch 
                                ? 'bg-green-200 border-green-400 text-green-800'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                            title={`Position ${i}: ${char}`}
                          >
                            {char}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  
                  {pattern && (
                    <div className="font-mono text-lg">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Pattern:</h3>
                      <div className="flex flex-wrap gap-1 p-3 bg-purple-50 rounded border">
                        {pattern.split('').map((char, i) => (
                          <span
                            key={i}
                            className="inline-block w-8 h-8 text-center leading-8 border-2 border-purple-300 bg-purple-100 text-purple-700 font-bold"
                            title={`Pattern position ${i}: ${char}`}
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {concatenatedString && (
                    <div className="font-mono text-lg">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Concatenated String (Pattern + $ + Text):</h3>
                      <div className="flex flex-wrap gap-1 p-3 bg-blue-50 rounded border">
                        {concatenatedString.split('').map((char, i) => {
                          const isCurrent = currentPosition === i;
                          const isPattern = i < pattern.length;
                          const isSeparator = i === pattern.length;
                          
                          return (
                            <span
                              key={i}
                              className={`inline-block w-8 h-8 text-center leading-8 border-2 font-bold transition-all duration-300 ${
                                isCurrent
                                  ? 'bg-yellow-200 border-yellow-400 text-yellow-800 scale-110'
                                  : isPattern
                                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                                    : isSeparator
                                      ? 'bg-red-100 border-red-300 text-red-700'
                                      : 'bg-blue-100 border-blue-300 text-blue-700'
                              }`}
                              title={`Position ${i}: ${char} ${isPattern ? '(pattern)' : isSeparator ? '(separator)' : '(text)'}`}
                            >
                              {char}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {matches.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Matches found at positions:</h3>
                      <div className="flex flex-wrap gap-2">
                        {matches.map((position, index) => (
                          <span key={index} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                            Position {position}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  <FaSearch className="mx-auto text-4xl mb-2 opacity-50" />
                  <p>Enter text and pattern to visualize the Z-Algorithm</p>
                </div>
              )}
            </div>

            {zArray.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaTable className="text-orange-500" />
                  Z-Array Visualization
                </h2>
                <div className="space-y-4">
                  <div className="font-mono text-lg">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">String Characters:</h3>
                    <div className="flex flex-wrap gap-1">
                      {concatenatedString.split('').map((char, i) => (
                        <span
                          key={i}
                          className={`inline-block w-10 h-8 text-center leading-8 border-2 font-bold ${
                            currentPosition === i
                              ? 'bg-yellow-200 border-yellow-400 text-yellow-800'
                              : 'bg-gray-100 border-gray-300 text-gray-700'
                          }`}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="font-mono text-lg">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Z-Array Values:</h3>
                    <div className="flex flex-wrap gap-1">
                      {zArray.map((value, i) => (
                        <span
                          key={i}
                          className={`inline-block w-10 h-8 text-center leading-8 border-2 font-bold ${
                            value === pattern.length
                              ? 'bg-green-200 border-green-400 text-green-800'
                              : value > 0
                                ? 'bg-orange-200 border-orange-400 text-orange-800'
                                : 'bg-white border-gray-300 text-gray-700'
                          }`}
                          title={`Z[${i}] = ${value}${value === pattern.length ? ' (Match!)' : ''}`}
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    <strong>Green values:</strong> Match found (Z[i] = pattern length) | 
                    <strong> Orange values:</strong> Partial prefix match | 
                    <strong> White values:</strong> No prefix match
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-medium text-gray-900 mb-4">How it Works</h2>
              <div className="space-y-4">
                <p className="text-gray-600 mb-4">
                  The Z-Algorithm efficiently computes the Z-array for string matching:
                </p>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Concatenate pattern + &apos;$&apos; + text (separator prevents false matches)</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Z[i] = length of longest substring starting at i that matches prefix</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Use [L,R] window to optimize computation and avoid redundant comparisons</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Find matches where Z[i] equals pattern length (green highlights)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ZAlgorithmVisualizer;
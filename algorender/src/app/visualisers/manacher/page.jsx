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
import { FaSearch, FaTable, FaFont, FaCircle } from 'react-icons/fa';

const ManacherVisualizer = () => {
  const [text, setText] = useState('');
  const [palindromes, setPalindromes] = useState([]);
  const [transformedString, setTransformedString] = useState('');
  const [pArray, setPArray] = useState([]);
  const [currentCenter, setCurrentCenter] = useState(-1);
  const [currentRight, setCurrentRight] = useState(-1);
  const [isSolving, setIsSolving] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [stats, setStats] = useState({
    comparisons: 0,
    palindromes: 0,
    time: 0,
    longestLength: 0
  });

  const timeComplexity = {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)'
  };

  const manacher = async () => {
    if (!text.trim()) return;
    
    setIsSolving(true);
    setPalindromes([]);
    setPArray([]);
    setCurrentCenter(-1);
    setCurrentRight(-1);
    const startTime = performance.now();
    let comparisons = 0;
    const newPalindromes = [];
    
    // Transform string to handle even-length palindromes
    const s = '#' + text.split('').join('#') + '#';
    setTransformedString(s);
    const n = s.length;
    const p = new Array(n).fill(0);
    let center = 0;
    let right = 0;
    let longestLength = 0;

    for (let i = 0; i < n; i++) {
      setCurrentCenter(center);
      setCurrentRight(right);
      setPArray([...p]);
      await new Promise(resolve => setTimeout(resolve, speed));
      
      comparisons++;
      if (i < right) {
        p[i] = Math.min(right - i, p[2 * center - i]);
      }
      
      let left = i - (p[i] + 1);
      let r = i + (p[i] + 1);
      while (left >= 0 && r < n && s[left] === s[r]) {
        comparisons++;
        p[i]++;
        left--;
        r++;
        
        // Update visualization during expansion
        setPArray([...p]);
        await new Promise(resolve => setTimeout(resolve, speed / 2));
      }
      
      if (i + p[i] > right) {
        center = i;
        right = i + p[i];
      }
      
      // Track longest palindrome
      if (p[i] > longestLength) {
        longestLength = p[i];
      }
      
      setStats({
        comparisons,
        palindromes: newPalindromes.length,
        time: ((performance.now() - startTime) / 1000).toFixed(2),
        longestLength
      });
    }

    // Extract palindromes from P array
    for (let i = 0; i < n; i++) {
      if (p[i] > 0) {
        const start = Math.floor((i - p[i]) / 2);
        const length = p[i];
        if (length > 0) {
          newPalindromes.push({ 
            start, 
            length, 
            center: i,
            radius: p[i],
            palindrome: text.substring(start, start + length)
          });
        }
      }
    }

    setPArray(p);
    setPalindromes(newPalindromes);
    setCurrentCenter(-1);
    setCurrentRight(-1);
    setStats(prev => ({ 
      ...prev, 
      palindromes: newPalindromes.length,
      longestLength
    }));
    setIsSolving(false);
  };

  const reset = () => {
    setText('');
    setPalindromes([]);
    setTransformedString('');
    setPArray([]);
    setCurrentCenter(-1);
    setCurrentRight(-1);
    setStats({ comparisons: 0, palindromes: 0, time: 0, longestLength: 0 });
  };

  const getLongestPalindrome = () => {
    if (palindromes.length === 0) return null;
    return palindromes.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );
  };

  const generateRandomColors = (count) => {
    const colors = [
      'bg-red-200 border-red-400 text-red-800',
      'bg-blue-200 border-blue-400 text-blue-800',
      'bg-green-200 border-green-400 text-green-800',
      'bg-yellow-200 border-yellow-400 text-yellow-800',
      'bg-purple-200 border-purple-400 text-purple-800',
      'bg-pink-200 border-pink-400 text-pink-800',
      'bg-indigo-200 border-indigo-400 text-indigo-800',
      'bg-teal-200 border-teal-400 text-teal-800'
    ];
    return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
  };

  const longestPalindrome = getLongestPalindrome();

  return (
    <Layout
      title="Manacher's Algorithm"
      description="Visualize finding all palindromic substrings in linear time using Manacher's algorithm."
      timeComplexity={{ best: 'O(n)', average: 'O(n)', worst: 'O(n)' }}
      spaceComplexity="O(n)"
    >
      <div className="space-y-6">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            String Input
          </h2>
          <InputControl
            label="Text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isSolving}
            placeholder="Enter text to find palindromes (e.g., 'racecar', 'abacabad')"
            className="max-w-md"
          />
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
                    onClick: manacher,
                    icon: FaCircle,
                    label: isSolving ? 'Running...' : 'Find Palindromes',
                    disabled: isSolving || !text.trim(),
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
                { label: 'Palindromes Found', value: stats.palindromes, color: 'text-green-600' },
                { label: 'Longest Length', value: stats.longestLength, color: 'text-purple-600' },
                { label: 'Time (seconds)', value: stats.time, color: 'text-orange-600' }
              ]}
              columns={2}
            />

            {longestPalindrome && (
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <FaCircle className="text-purple-500" />
                  <span className="text-purple-700 font-semibold">Longest Palindrome</span>
                </div>
                <p className="text-purple-800 font-mono text-lg">
                  &quot;{longestPalindrome.palindrome}&quot;
                </p>
                <p className="text-purple-600 text-sm">
                  Position {longestPalindrome.start}-{longestPalindrome.start + longestPalindrome.length - 1} 
                  (Length: {longestPalindrome.length})
                </p>
              </div>
            )}
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
                        // Find all palindromes that include this position
                        const overlappingPalindromes = palindromes.filter(p => 
                          i >= p.start && i < p.start + p.length
                        );
                        const isInLongest = longestPalindrome && 
                          i >= longestPalindrome.start && 
                          i < longestPalindrome.start + longestPalindrome.length;
                        
                        return (
                          <span
                            key={i}
                            className={`inline-block w-8 h-8 text-center leading-8 border-2 font-bold transition-all duration-300 ${
                              isInLongest
                                ? 'bg-purple-200 border-purple-400 text-purple-800 ring-2 ring-purple-300'
                                : overlappingPalindromes.length > 0
                                  ? 'bg-green-200 border-green-400 text-green-800'
                                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                            title={`Position ${i}: ${char}${overlappingPalindromes.length > 0 ? ` (in ${overlappingPalindromes.length} palindrome${overlappingPalindromes.length > 1 ? 's' : ''})` : ''}`}
                          >
                            {char}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  
                  {transformedString && (
                    <div className="font-mono text-lg">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Transformed String (with separators):</h3>
                      <div className="flex flex-wrap gap-1 p-3 bg-blue-50 rounded border">
                        {transformedString.split('').map((char, i) => {
                          const isCenterWindow = currentCenter !== -1 && 
                            i >= Math.max(0, currentCenter - 3) && 
                            i <= Math.min(transformedString.length - 1, currentCenter + 3);
                          const isCurrentCenter = currentCenter === i;
                          
                          return (
                            <span
                              key={i}
                              className={`inline-block w-8 h-8 text-center leading-8 border-2 font-bold transition-all duration-300 ${
                                isCurrentCenter
                                  ? 'bg-yellow-200 border-yellow-400 text-yellow-800 scale-110'
                                  : isCenterWindow
                                    ? 'bg-blue-200 border-blue-400 text-blue-800'
                                    : char === '#'
                                      ? 'bg-gray-200 border-gray-400 text-gray-600'
                                      : 'bg-white border-gray-300 text-gray-700'
                              }`}
                              title={`Position ${i}: ${char}${char === '#' ? ' (separator)' : ''}`}
                            >
                              {char}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {palindromes.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Found Palindromes (Length ≥ 2):
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {palindromes
                          .filter(p => p.length >= 2)
                          .sort((a, b) => b.length - a.length)
                          .map((palindrome, index) => (
                            <div 
                              key={index} 
                              className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                                palindrome === longestPalindrome
                                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              <span className="font-mono">&quot;{palindrome.palindrome}&quot;</span>
                              <span className="text-xs ml-2">
                                @{palindrome.start} (len: {palindrome.length})
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  <FaCircle className="mx-auto text-4xl mb-2 opacity-50" />
                  <p>Enter text to visualize Manacher&apos;s algorithm</p>
                </div>
              )}
            </div>

            {pArray.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaTable className="text-orange-500" />
                  P-Array Visualization
                </h2>
                <div className="space-y-4">
                  <div className="font-mono text-lg">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Characters:</h3>
                    <div className="flex flex-wrap gap-1">
                      {transformedString.split('').map((char, i) => (
                        <span
                          key={i}
                          className={`inline-block w-10 h-8 text-center leading-8 border-2 font-bold ${
                            currentCenter === i
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
                    <h3 className="text-sm font-medium text-gray-700 mb-2">P-Array Values (palindrome radius):</h3>
                    <div className="flex flex-wrap gap-1">
                      {pArray.map((value, i) => (
                        <span
                          key={i}
                          className={`inline-block w-10 h-8 text-center leading-8 border-2 font-bold ${
                            value > 2
                              ? 'bg-green-200 border-green-400 text-green-800'
                              : value > 0
                                ? 'bg-blue-200 border-blue-400 text-blue-800'
                                : 'bg-white border-gray-300 text-gray-700'
                          }`}
                          title={`P[${i}] = ${value} (radius of palindrome centered at position ${i})`}
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    <strong>Green:</strong> Large palindromes (radius &gt; 2) | 
                    <strong> Blue:</strong> Small palindromes (radius 1-2) | 
                    <strong> White:</strong> No palindrome
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-medium text-gray-900 mb-4">How it Works</h2>
              <div className="space-y-4">
                <p className="text-gray-600 mb-4">
                  Manacher&apos;s Algorithm finds all palindromes in linear time:
                </p>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Transform string with separators (#) to handle even-length palindromes uniformly</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Maintain center and rightmost boundary of previously found palindromes</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Use symmetry property to avoid redundant comparisons (yellow center highlighting)</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Build P-array storing palindrome radius for each position (green for large palindromes)</span>
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

export default ManacherVisualizer;
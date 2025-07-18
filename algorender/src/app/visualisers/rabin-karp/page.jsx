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
import { FaHashtag, FaSearch } from 'react-icons/fa';

const RabinKarpVisualizer = () => {
  const [text, setText] = useState('');
  const [pattern, setPattern] = useState('');
  const [matches, setMatches] = useState([]);
  const [currentWindow, setCurrentWindow] = useState(-1);
  const [isSolving, setIsSolving] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [stats, setStats] = useState({
    comparisons: 0,
    matches: 0,
    time: 0,
    hashComparisons: 0
  });

  const timeComplexity = {
    best: 'O(n + m)',
    average: 'O(n + m)',
    worst: 'O(nm)',
    space: 'O(1)'
  };

  const rabinKarp = async () => {
    if (!text.trim() || !pattern.trim()) return;
    
    setIsSolving(true);
    setMatches([]);
    setCurrentWindow(-1);
    const startTime = performance.now();
    let comparisons = 0;
    let hashComparisons = 0;
    const newMatches = [];
    const n = text.length;
    const m = pattern.length;
    const d = 256; // number of characters in the input alphabet
    const q = 101; // a prime number
    let p = 0; // hash value for pattern
    let t = 0; // hash value for text
    let h = 1;

    // The value of h would be "pow(d, m-1)%q"
    for (let i = 0; i < m - 1; i++) {
      h = (h * d) % q;
    }

    // Calculate the hash value of pattern and first window of text
    for (let i = 0; i < m; i++) {
      p = (d * p + pattern.charCodeAt(i)) % q;
      t = (d * t + text.charCodeAt(i)) % q;
    }

    // Slide the pattern over text one by one
    for (let i = 0; i <= n - m; i++) {
      setCurrentWindow(i);
      await new Promise(resolve => setTimeout(resolve, speed));
      
      hashComparisons++;
      // Check the hash values of current window of text and pattern
      if (p === t) {
        // Check for characters one by one
        let j;
        for (j = 0; j < m; j++) {
          comparisons++;
          if (text[i + j] !== pattern[j]) {
            break;
          }
        }
        if (j === m) {
          newMatches.push(i);
          setMatches([...newMatches]);
        }
      }
      // Calculate hash value for next window of text
      if (i < n - m) {
        t = (d * (t - text.charCodeAt(i) * h) + text.charCodeAt(i + m)) % q;
        if (t < 0) {
          t = t + q;
        }
      }
      
      setStats({
        comparisons,
        hashComparisons,
        matches: newMatches.length,
        time: ((performance.now() - startTime) / 1000).toFixed(2)
      });
    }

    setCurrentWindow(-1);
    setIsSolving(false);
  };

  const reset = () => {
    setText('');
    setPattern('');
    setMatches([]);
    setCurrentWindow(-1);
    setStats({ comparisons: 0, matches: 0, time: 0, hashComparisons: 0 });
  };

  return (
    <Layout 
      title="Rabin-Karp Algorithm"
      description="Visualize string pattern matching using rolling hash."
      timeComplexity={{ best: 'O(n + m)', average: 'O(n + m)', worst: 'O(nm)' }}
      spaceComplexity="O(1)"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                String Inputs
              </h2>
              <div className="space-y-4">
                <InputControl
                  label="Text"
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={isSolving}
                  placeholder="Enter text to search in (e.g., 'abcdefabcdef')"
                />
                <InputControl
                  label="Pattern"
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  disabled={isSolving}
                  placeholder="Enter pattern to search for (e.g., 'def')"
                />
              </div>
            </div>

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
                    onClick: rabinKarp,
                    icon: FaHashtag,
                    label: isSolving ? 'Running...' : 'Start Rabin-Karp',
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
                { label: 'Hash Comparisons', value: stats.hashComparisons, color: 'text-blue-600' },
                { label: 'Character Comparisons', value: stats.comparisons, color: 'text-orange-600' },
                { label: 'Matches Found', value: stats.matches, color: 'text-green-600' },
                { label: 'Time (seconds)', value: stats.time, color: 'text-purple-600' }
              ]}
              columns={2}
            />
          </div>
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                Text Visualization
              </h2>
              {text ? (
                <div className="p-4 border rounded-lg bg-white font-mono text-lg leading-relaxed">
                  {text.split('').map((char, index) => {
                    const isMatch = matches.some(matchIndex => 
                      index >= matchIndex && index < matchIndex + pattern.length
                    );
                    const isCurrentWindow = currentWindow !== -1 && 
                      index >= currentWindow && index < currentWindow + pattern.length;
                    
                    return (
                      <span
                        key={index}
                        className={`inline-block px-1 py-0.5 transition-all duration-300 ${
                          isMatch 
                            ? 'bg-green-200 text-green-800 font-bold border-2 border-green-400' 
                            : isCurrentWindow
                              ? 'bg-blue-200 text-blue-800 border-2 border-blue-400'
                              : 'hover:bg-gray-100'
                        }`}
                        title={isMatch ? `Match at position ${index}` : isCurrentWindow ? 'Current window' : ''}
                      >
                        {char}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  <FaSearch className="mx-auto text-4xl mb-2 opacity-50" />
                  <p>Enter text and pattern to visualize the Rabin-Karp algorithm</p>
                </div>
              )}
              
              {pattern && (
                <div className="mt-4">
                  <h3 className="text-md font-medium text-gray-700 mb-2">Pattern:</h3>
                  <div className="p-2 bg-blue-100 rounded font-mono text-lg text-blue-800 font-bold">
                    {pattern}
                  </div>
                </div>
              )}
              
              {matches.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-md font-medium text-gray-700 mb-2">Matches found at positions:</h3>
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

            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-medium text-gray-900 mb-4">How it Works</h2>
              <div className="space-y-4">
                <p className="text-gray-600 mb-4">
                  The Rabin-Karp algorithm uses hashing to find a pattern in a text:
                </p>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Calculate hash value of pattern and first window of text</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Slide the pattern over text one by one (blue highlight)</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>If hash values match, check characters one by one</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>If all characters match, pattern is found (green highlight)</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Use rolling hash to efficiently calculate next window</span>
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

export default RabinKarpVisualizer; 
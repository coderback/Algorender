'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import InputControl from '@/components/InputControl';
import { Card, CardContent } from '@/components/ui/card';
import { FaFont } from 'react-icons/fa';
import { 
  ControlsSection, 
  EnhancedDataStructureButtonGrid, 
  StatisticsDisplay, 
  ButtonPresets 
} from '@/components/VisualizerControls';

const KMPVisualizer = () => {
  const [text, setText] = useState('');
  const [pattern, setPattern] = useState('');
  const [matches, setMatches] = useState([]);
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    comparisons: 0,
    matches: 0,
    time: 0
  });

  const timeComplexity = {
    best: 'O(n + m)',
    average: 'O(n + m)',
    worst: 'O(n + m)',
    space: 'O(m)'
  };

  const computeLPSArray = (pattern) => {
    const lps = new Array(pattern.length).fill(0);
    let len = 0;
    let i = 1;
    while (i < pattern.length) {
      if (pattern[i] === pattern[len]) {
        len++;
        lps[i] = len;
        i++;
      } else {
        if (len !== 0) {
          len = lps[len - 1];
        } else {
          lps[i] = 0;
          i++;
        }
      }
    }
    return lps;
  };

  const kmp = () => {
    setIsSolving(true);
    const startTime = performance.now();
    let comparisons = 0;
    const newMatches = [];
    const lps = computeLPSArray(pattern);
    let i = 0; // index for text
    let j = 0; // index for pattern

    while (i < text.length) {
      comparisons++;
      if (pattern[j] === text[i]) {
        i++;
        j++;
      }
      if (j === pattern.length) {
        newMatches.push(i - j);
        j = lps[j - 1];
      } else if (i < text.length && pattern[j] !== text[i]) {
        if (j !== 0) {
          j = lps[j - 1];
        } else {
          i++;
        }
      }
    }

    const endTime = performance.now();
    setStats({
      comparisons,
      matches: newMatches.length,
      time: (endTime - startTime).toFixed(2)
    });
    setMatches(newMatches);
    setIsSolving(false);
  };

  return (
    <Layout
      title="KMP Algorithm"
      description="Visualize the Knuth-Morris-Pratt string matching algorithm in action."
      timeComplexity={{ best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' }}
      spaceComplexity="O(m)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              String Inputs
            </h2>
            <div className="space-y-4">
              <InputControl
                type="text"
                label="Text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Enter text to search in"
                disabled={isSolving}
              />
              <InputControl
                type="text"
                label="Pattern"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                placeholder="Enter pattern to search for"
                disabled={isSolving}
              />
            </div>
          </Card>

          <ControlsSection title="Controls">
            <EnhancedDataStructureButtonGrid
              operations={[
                {
                  onClick: kmp,
                  icon: ButtonPresets.dataStructure.search.icon,
                  label: isSolving ? 'Running...' : 'Run KMP',
                  disabled: isSolving || !text.trim() || !pattern.trim(),
                  variant: 'primary'
                }
              ]}
              resetAction={{
                onClick: () => {
                  setText('');
                  setPattern('');
                  setMatches([]);
                  setStats({ comparisons: 0, matches: 0, time: 0 });
                },
                icon: ButtonPresets.dataStructure.reset().icon,
                label: 'Reset',
                disabled: false
              }}
            />
          </ControlsSection>
          
          <StatisticsDisplay
            title="Statistics"
            stats={[
              { label: 'Comparisons', value: stats.comparisons, color: 'text-blue-600' },
              { label: 'Matches Found', value: stats.matches, color: 'text-green-600' },
              { label: 'Pattern Length', value: pattern.length, color: 'text-gray-900' },
              { label: 'Text Length', value: text.length, color: 'text-gray-900' }
            ]}
            columns={2}
          />
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Visualization</h2>
            <div className="relative">
              <div className="font-mono text-lg mb-4 break-all">
                {text.split('').map((char, i) => (
                  <span
                    key={i}
                    className={`inline-block w-8 h-8 text-center leading-8 border ${
                      matches.includes(i) ? 'bg-forest-100 border-forest-500' : 'border-gray-200'
                    }`}
                  >
                    {char}
                  </span>
                ))}
              </div>
              {pattern && (
                <div className="font-mono text-lg mb-4 break-all">
                  {pattern.split('').map((char, i) => (
                    <span
                      key={i}
                      className="inline-block w-8 h-8 text-center leading-8 border border-forest-200 bg-forest-50"
                    >
                      {char}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-medium text-gray-900 mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                The KMP algorithm uses a failure function to avoid unnecessary comparisons:
              </p>
              <div className="space-y-3 text-gray-600">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Preprocess pattern to create LPS array (orange visualization)</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Compare characters with animated highlighting (blue current position)</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>When match found, highlight in green and continue</span>
                </div>
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Use LPS array to skip unnecessary comparisons on mismatch</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default KMPVisualizer; 
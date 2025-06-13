'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const NQueensVisualizer = () => {
  const [n, setN] = useState(8);
  const [board, setBoard] = useState([]);
  const [solutions, setSolutions] = useState([]);
  const [currentSolution, setCurrentSolution] = useState(0);
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    solutions: 0,
    time: 0,
    steps: 0
  });

  const timeComplexity = {
    best: 'O(n!)',
    average: 'O(n!)',
    worst: 'O(n!)',
    space: 'O(n)'
  };

  useEffect(() => {
    initializeBoard();
  }, [n]);

  const initializeBoard = () => {
    const newBoard = Array(n).fill().map(() => Array(n).fill(0));
    setBoard(newBoard);
    setSolutions([]);
    setCurrentSolution(0);
    setStats({ solutions: 0, time: 0, steps: 0 });
  };

  const isValid = (board, row, col) => {
    // Check column
    for (let i = 0; i < row; i++) {
      if (board[i][col] === 1) return false;
    }

    // Check upper left diagonal
    for (let i = row - 1, j = col - 1; i >= 0 && j >= 0; i--, j--) {
      if (board[i][j] === 1) return false;
    }

    // Check upper right diagonal
    for (let i = row - 1, j = col + 1; i >= 0 && j < n; i--, j++) {
      if (board[i][j] === 1) return false;
    }

    return true;
  };

  const solveNQueens = async () => {
    setIsSolving(true);
    const startTime = performance.now();
    let steps = 0;
    const allSolutions = [];

    const solve = async (board, row = 0) => {
      if (row === n) {
        allSolutions.push(board.map(row => [...row]));
        setSolutions([...allSolutions]);
        setStats(prev => ({ ...prev, solutions: allSolutions.length }));
        return;
      }

      for (let col = 0; col < n; col++) {
        steps++;
        if (isValid(board, row, col)) {
          board[row][col] = 1;
          setBoard(board.map(row => [...row]));
          await new Promise(resolve => setTimeout(resolve, 100));
          
          await solve(board, row + 1);
          
          board[row][col] = 0;
          setBoard(board.map(row => [...row]));
        }
      }
    };

    await solve(board.map(row => [...row]));
    const endTime = performance.now();
    setStats(prev => ({
      ...prev,
      time: (endTime - startTime).toFixed(2),
      steps
    }));
    setIsSolving(false);
  };

  const showSolution = (index) => {
    if (solutions[index]) {
      setBoard(solutions[index]);
      setCurrentSolution(index);
    }
  };

  return (
    <Layout 
      title="N-Queens Problem"
      description="Visualize the N-Queens problem using backtracking."
      timeComplexity={{ best: 'O(n!)', average: 'O(n!)', worst: 'O(n!)' }}
      spaceComplexity="O(n)"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <InputControl
              label="Board Size"
              type="number"
              value={n}
              onChange={(e) => setN(Math.min(Math.max(4, parseInt(e.target.value) || 4), 12))}
              min={4}
              max={12}
              disabled={isSolving}
            />
            <Button
              onClick={solveNQueens}
              disabled={isSolving}
              variant="primary"
            >
              {isSolving ? 'Solving...' : 'Solve'}
            </Button>
          </div>
        </div>

        <StatsBar
          stats={[
            { label: 'Solutions', value: stats.solutions },
            { label: 'Time (ms)', value: stats.time },
            { label: 'Steps', value: stats.steps }
          ]}
          timeComplexity={timeComplexity}
        />

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Board</h2>
            <div className="grid gap-1" style={{ 
              gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
              aspectRatio: '1/1'
            }}>
              {board.map((row, i) => 
                row.map((cell, j) => (
                  <div
                    key={`${i}-${j}`}
                    className={`flex items-center justify-center border ${
                      (i + j) % 2 === 0 ? 'bg-gray-100' : 'bg-gray-200'
                    }`}
                    style={{ aspectRatio: '1/1' }}
                  >
                    {cell === 1 && (
                      <div className="w-3/4 h-3/4 rounded-full bg-forest-500" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Solutions</h2>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {solutions.map((_, index) => (
                  <Button
                    key={index}
                    onClick={() => showSolution(index)}
                    variant={currentSolution === index ? 'primary' : 'secondary'}
                    size="sm"
                  >
                    Solution {index + 1}
                  </Button>
                ))}
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Places queens row by row</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Checks if each position is safe (no conflicts)</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Backtracks when no valid position is found</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-forest-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Continues until all solutions are found</span>
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

export default NQueensVisualizer; 
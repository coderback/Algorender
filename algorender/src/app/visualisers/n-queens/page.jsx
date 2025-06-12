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
    <Layout timeComplexity={timeComplexity}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">N-Queens Problem</h1>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Board</h2>
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
                      <div className="w-3/4 h-3/4 rounded-full bg-blue-500" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Solutions</h2>
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
                <h3 className="font-semibold mb-2">How it Works</h3>
                <p className="text-gray-600">
                  The N-Queens problem is solved using backtracking. The algorithm:
                </p>
                <ul className="list-disc list-inside text-gray-600 mt-2">
                  <li>Places queens row by row</li>
                  <li>Checks if each position is safe (no conflicts)</li>
                  <li>Backtracks when no valid position is found</li>
                  <li>Continues until all solutions are found</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default NQueensVisualizer; 
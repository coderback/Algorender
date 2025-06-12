'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const SudokuVisualizer = () => {
  const [board, setBoard] = useState([]);
  const [originalBoard, setOriginalBoard] = useState([]);
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    time: 0,
    steps: 0,
    difficulty: 'medium'
  });

  const timeComplexity = {
    best: 'O(9^(n²))',
    average: 'O(9^(n²))',
    worst: 'O(9^(n²))',
    space: 'O(n²)'
  };

  useEffect(() => {
    generatePuzzle();
  }, []);

  const generatePuzzle = () => {
    // Generate a solved Sudoku puzzle
    const solved = Array(9).fill().map(() => Array(9).fill(0));
    solveSudoku(solved);
    
    // Create a copy for the puzzle
    const puzzle = solved.map(row => [...row]);
    
    // Remove numbers based on difficulty
    const cellsToRemove = {
      easy: 30,
      medium: 45,
      hard: 55
    }[stats.difficulty];

    for (let i = 0; i < cellsToRemove; i++) {
      const row = Math.floor(Math.random() * 9);
      const col = Math.floor(Math.random() * 9);
      puzzle[row][col] = 0;
    }

    setBoard(puzzle);
    setOriginalBoard(puzzle.map(row => [...row]));
  };

  const isValid = (board, row, col, num) => {
    // Check row
    for (let x = 0; x < 9; x++) {
      if (board[row][x] === num) return false;
    }

    // Check column
    for (let x = 0; x < 9; x++) {
      if (board[x][col] === num) return false;
    }

    // Check 3x3 box
    const startRow = row - row % 3;
    const startCol = col - col % 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[i + startRow][j + startCol] === num) return false;
      }
    }

    return true;
  };

  const solveSudoku = (board) => {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (isValid(board, row, col, num)) {
              board[row][col] = num;
              if (solveSudoku(board)) return true;
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  };

  const solvePuzzle = async () => {
    setIsSolving(true);
    const startTime = performance.now();
    let steps = 0;
    const boardCopy = board.map(row => [...row]);

    const solve = async (board, row = 0, col = 0) => {
      if (row === 9) return true;
      if (col === 9) return await solve(board, row + 1, 0);
      if (board[row][col] !== 0) return await solve(board, row, col + 1);

      for (let num = 1; num <= 9; num++) {
        steps++;
        if (isValid(board, row, col, num)) {
          board[row][col] = num;
          setBoard(board.map(row => [...row]));
          await new Promise(resolve => setTimeout(resolve, 50));

          if (await solve(board, row, col + 1)) return true;

          board[row][col] = 0;
          setBoard(board.map(row => [...row]));
        }
      }
      return false;
    };

    await solve(boardCopy);
    const endTime = performance.now();
    setStats(prev => ({
      ...prev,
      time: (endTime - startTime).toFixed(2),
      steps
    }));
    setIsSolving(false);
  };

  const handleCellChange = (row, col, value) => {
    if (originalBoard[row][col] !== 0) return; // Can't modify original numbers
    const newValue = value === '' ? 0 : parseInt(value);
    if (isNaN(newValue) || newValue < 0 || newValue > 9) return;

    const newBoard = board.map(row => [...row]);
    newBoard[row][col] = newValue;
    setBoard(newBoard);
  };

  const setDifficulty = (difficulty) => {
    setStats(prev => ({ ...prev, difficulty }));
    generatePuzzle();
  };

  return (
    <Layout timeComplexity={timeComplexity}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Sudoku Solver</h1>
          <div className="flex items-center space-x-4">
            <select
              value={stats.difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="px-3 py-2 border rounded-lg"
              disabled={isSolving}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <Button
              onClick={generatePuzzle}
              disabled={isSolving}
              variant="secondary"
            >
              New Puzzle
            </Button>
            <Button
              onClick={solvePuzzle}
              disabled={isSolving}
              variant="primary"
            >
              {isSolving ? 'Solving...' : 'Solve'}
            </Button>
          </div>
        </div>

        <StatsBar
          stats={[
            { label: 'Time (ms)', value: stats.time },
            { label: 'Steps', value: stats.steps },
            { label: 'Difficulty', value: stats.difficulty }
          ]}
          timeComplexity={timeComplexity}
          spaceComplexity={timeComplexity.space}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Sudoku Board</h2>
            <div className="grid grid-cols-9 gap-0.5 border-2 border-gray-800">
              {board.map((row, i) => 
                row.map((cell, j) => (
                  <div
                    key={`${i}-${j}`}
                    className={`relative ${
                      (i + 1) % 3 === 0 && i < 8 ? 'border-b-2 border-gray-800' : ''
                    } ${
                      (j + 1) % 3 === 0 && j < 8 ? 'border-r-2 border-gray-800' : ''
                    }`}
                  >
                    <input
                      type="number"
                      value={cell || ''}
                      onChange={(e) => handleCellChange(i, j, e.target.value)}
                      className={`w-full h-full text-center text-lg ${
                        originalBoard[i][j] !== 0
                          ? 'bg-gray-100 font-bold'
                          : 'bg-white'
                      }`}
                      min="1"
                      max="9"
                      disabled={isSolving || originalBoard[i][j] !== 0}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">How it Works</h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                The Sudoku solver uses backtracking to find a solution:
              </p>
              <ul className="list-disc list-inside text-gray-600">
                <li>Finds an empty cell</li>
                <li>Tries numbers 1-9 in that cell</li>
                <li>Checks if the number is valid in that position</li>
                <li>If valid, moves to the next cell</li>
                <li>If no valid number is found, backtracks</li>
                <li>Continues until the puzzle is solved</li>
              </ul>
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Rules</h3>
                <ul className="list-disc list-inside text-gray-600">
                  <li>Each row must contain numbers 1-9</li>
                  <li>Each column must contain numbers 1-9</li>
                  <li>Each 3x3 box must contain numbers 1-9</li>
                  <li>No number can be repeated in any row, column, or box</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SudokuVisualizer; 
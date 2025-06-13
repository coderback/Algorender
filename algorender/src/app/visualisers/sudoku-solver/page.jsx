'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import InputControl from '@/components/InputControl';
import StatsBar from '@/components/StatsBar';

const SudokuVisualizer = () => {
  const [board, setBoard] = useState(Array(9).fill().map(() => Array(9).fill(0)));
  const [originalBoard, setOriginalBoard] = useState(Array(9).fill().map(() => Array(9).fill(0)));
  const [isSolving, setIsSolving] = useState(false);
  const [stats, setStats] = useState({
    difficulty: 'medium',
    startTime: null,
    endTime: null,
    solved: false,
    timeTaken: null,
    steps: 0,
    status: 'Not Started',
    gridSize: '9x9'
  });

  const timeComplexity = {
    best: 'O(9^(n²))',
    average: 'O(9^(n²))',
    worst: 'O(9^(n²))',
    space: 'O(n²)'
  };

  // Fisher-Yates shuffle algorithm
  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  useEffect(() => {
    generatePuzzle();
  }, []);

  const generatePuzzle = () => {
    const newBoard = Array(9).fill().map(() => Array(9).fill(0));
    const newOriginalBoard = Array(9).fill().map(() => Array(9).fill(0));
    
    // Generate a solved board
    const solve = (board) => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (board[row][col] === 0) {
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            shuffle(nums);
            for (let num of nums) {
              if (isValid(board, row, col, num)) {
                board[row][col] = num;
                if (solve(board)) return true;
                board[row][col] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    };

    solve(newBoard);

    // Remove numbers based on difficulty
    const cellsToRemove = {
      easy: 30,
      medium: 40,
      hard: 50,
      expert: 60
    }[stats.difficulty];

    const positions = [];
    for (let i = 0; i < 81; i++) {
      positions.push(i);
    }
    shuffle(positions);

    for (let i = 0; i < cellsToRemove; i++) {
      const pos = positions[i];
      const row = Math.floor(pos / 9);
      const col = pos % 9;
      newOriginalBoard[row][col] = newBoard[row][col];
      newBoard[row][col] = 0;
    }

    setBoard(newBoard);
    setOriginalBoard(newOriginalBoard);
    setStats(prev => ({
      ...prev,
      startTime: null,
      endTime: null,
      solved: false,
      timeTaken: null,
      steps: 0,
      status: 'New Puzzle'
    }));
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

  const solveSudoku = async () => {
    if (isSolving) return;
    setIsSolving(true);
    setStats(prev => ({ 
      ...prev, 
      startTime: Date.now(),
      status: 'Solving',
      steps: 0
    }));

    // Create a deep copy of the board to work with
    const boardCopy = board.map(row => [...row]);
    let solved = false;
    let stepCount = 0;

    const solve = async (board) => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (board[row][col] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (isValid(board, row, col, num)) {
                board[row][col] = num;
                stepCount++;
                setStats(prev => ({ ...prev, steps: stepCount }));
                setBoard(board.map(row => [...row]));
                await new Promise(resolve => setTimeout(resolve, 50));

                if (await solve(board)) {
                  return true;
                }

                board[row][col] = 0;
                stepCount++;
                setStats(prev => ({ ...prev, steps: stepCount }));
                setBoard(board.map(row => [...row]));
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
            return false;
          }
        }
      }
      return true;
    };

    try {
      solved = await solve(boardCopy);
      if (solved) {
        setBoard(boardCopy);
        setStats(prev => ({
          ...prev,
          endTime: Date.now(),
          solved: true,
          timeTaken: Date.now() - prev.startTime,
          status: 'Solved'
        }));
      }
    } catch (error) {
      console.error('Error solving Sudoku:', error);
      setStats(prev => ({ ...prev, status: 'Error' }));
    } finally {
      setIsSolving(false);
    }
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
    <Layout 
      title="Sudoku Solver"
      description="Visualize how backtracking solves Sudoku puzzles."
      timeComplexity={{ best: 'O(9^(n²))', average: 'O(9^(n²))', worst: 'O(9^(n²))' }}
      spaceComplexity="O(n²)"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="difficulty" className="text-sm font-medium text-gray-700">
                Difficulty Level
              </label>
              <select
                id="difficulty"
                value={stats.difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="
                  h-10
                  px-4
                  bg-white border border-gray-200
                  rounded-xl shadow-sm
                  text-gray-900 text-base
                  focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                  hover:border-gray-300
                  transition-all duration-200
                  cursor-pointer
                  appearance-none
                  bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236B7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M10%203a1%201%200%2001.707.293l3%203a1%201%200%2001-1.414%201.414L10%205.414%207.707%207.707a1%201%200%2001-1.414-1.414l3-3A1%201%200%200110%203zm-3.707%209.293a1%201%200%20011.414%200L10%2014.586l2.293-2.293a1%201%200%20011.414%201.414l-3%203a1%201%200%2001-1.414%200l-3-3a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]
                  bg-[length:1.5em_1.5em]
                  bg-[right_0.75rem_center]
                  bg-no-repeat
                  pr-10
                "
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <Button
              onClick={generatePuzzle}
              disabled={isSolving}
              variant="secondary"
              className="h-10"
            >
              New Puzzle
            </Button>
            <Button
              onClick={solveSudoku}
              disabled={isSolving}
              variant="primary"
              className="h-10"
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Sudoku Board</h2>
            <div className="grid grid-cols-9 gap-2 bg-white p-4 rounded-2xl shadow-lg">
              {board.map((row, i) => 
                row.map((cell, j) => (
                  <div
                    key={`${i}-${j}`}
                    className={`relative ${
                      (i + 1) % 3 === 0 && i < 8 ? 'border-b border-slate-200' : ''
                    } ${
                      (j + 1) % 3 === 0 && j < 8 ? 'border-r border-slate-200' : ''
                    } ${
                      (i + 1) % 3 === 0 && (j + 1) % 3 === 0 && i < 8 && j < 8 ? 'border-b border-r border-slate-300' : ''
                    }`}
                  >
                    <input
                      type="number"
                      value={cell || ''}
                      onChange={(e) => handleCellChange(i, j, e.target.value)}
                      className={`
                        w-full h-full text-center text-lg font-medium
                        transition-all duration-200
                        focus:outline-none focus:ring-2 focus:ring-slate-400/20
                        ${originalBoard[i][j] !== 0
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : 'bg-white text-slate-900 hover:bg-slate-50'
                        }
                        ${isSolving ? 'cursor-not-allowed' : 'cursor-pointer'}
                        disabled:opacity-50
                        rounded-lg
                        border border-slate-200
                        hover:border-slate-300
                        focus:border-slate-400
                        shadow-sm
                        hover:shadow
                        active:shadow-inner
                      `}
                      min="1"
                      max="9"
                      disabled={isSolving || originalBoard[i][j] !== 0}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <div className="text-sm text-gray-500">Status</div>
                <div className="text-lg font-semibold text-gray-900">{stats.status}</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <div className="text-sm text-gray-500">Grid Size</div>
                <div className="text-lg font-semibold text-gray-900">{stats.gridSize}</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <div className="text-sm text-gray-500">Difficulty</div>
                <div className="text-lg font-semibold text-gray-900 capitalize">{stats.difficulty}</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <div className="text-sm text-gray-500">Steps</div>
                <div className="text-lg font-semibold text-gray-900">{stats.steps}</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">How it Works</h2>
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Algorithm Steps</h3>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Finds an empty cell</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Tries numbers 1-9 in that cell</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Checks if the number is valid in that position</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>If valid, moves to the next cell</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>If no valid number is found, backtracks</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Continues until the puzzle is solved</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Rules</h3>
                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Each row must contain numbers 1-9</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Each column must contain numbers 1-9</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Each 3x3 box must contain numbers 1-9</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>No number can be repeated in any row, column, or box</span>
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

export default SudokuVisualizer; 
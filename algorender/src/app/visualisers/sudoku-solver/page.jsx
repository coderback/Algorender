'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import {
  ControlsSection,
  SpeedControl,
  EnhancedDataStructureButtonGrid,
  StatisticsDisplay,
  ButtonPresets
} from '@/components/VisualizerControls';
import { FaPuzzlePiece, FaRandom, FaPlay, FaCog } from 'react-icons/fa';

export default function SudokuVisualizer() {
  const [board, setBoard] = useState(Array(9).fill().map(() => Array(9).fill(0)));
  const [originalBoard, setOriginalBoard] = useState(Array(9).fill().map(() => Array(9).fill(0)));
  const [isSolving, setIsSolving] = useState(false);
  const [speed, setSpeed] = useState(400);
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

  const generatePuzzle = useCallback(() => {
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
  }, [stats.difficulty]);

  useEffect(() => {
    generatePuzzle();
  }, [generatePuzzle]);

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
                await new Promise(resolve => setTimeout(resolve, speed));

                if (await solve(board)) {
                  return true;
                }

                board[row][col] = 0;
                stepCount++;
                setStats(prev => ({ ...prev, steps: stepCount }));
                setBoard(board.map(row => [...row]));
                await new Promise(resolve => setTimeout(resolve, speed));
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

  const reset = () => {
    generatePuzzle();
    setStats(prev => ({ ...prev, steps: 0, status: 'Reset' }));
  };

  return (
    <Layout 
      title="Sudoku Solver"
      description="Visualize how backtracking solves Sudoku puzzles."
      timeComplexity={{ best: 'O(9^(n²))', average: 'O(9^(n²))', worst: 'O(9^(n²))' }}
      spaceComplexity="O(n²)"
    >
      <div className="space-y-6">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Puzzle Settings
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="difficulty" className="text-sm font-medium text-gray-700">
                Difficulty Level
              </label>
              <select
                id="difficulty"
                value={stats.difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                disabled={isSolving}
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
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <option value="easy">Easy (30 clues)</option>
                <option value="medium">Medium (40 clues)</option>
                <option value="hard">Hard (50 clues)</option>
                <option value="expert">Expert (60 clues)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              Sudoku Board
            </h2>
            <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-gray-200">
              {/* Sudoku Grid Container */}
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }, (_, boxIndex) => {
                  const boxRow = Math.floor(boxIndex / 3);
                  const boxCol = boxIndex % 3;
                  return (
                    <div
                      key={boxIndex}
                      className="grid grid-cols-3 gap-1 p-2 bg-gray-100 rounded-lg border-2 border-gray-300"
                    >
                      {Array.from({ length: 9 }, (_, cellIndex) => {
                        const cellRow = Math.floor(cellIndex / 3);
                        const cellCol = cellIndex % 3;
                        const globalRow = boxRow * 3 + cellRow;
                        const globalCol = boxCol * 3 + cellCol;
                        const cell = board[globalRow][globalCol];
                        const isOriginal = originalBoard[globalRow][globalCol] !== 0;
                        
                        return (
                          <div
                            key={cellIndex}
                            className="relative aspect-square"
                          >
                            <input
                              type="text"
                              value={cell || ''}
                              onChange={(e) => handleCellChange(globalRow, globalCol, e.target.value)}
                              className={`
                                w-full h-full text-center text-xl font-bold
                                transition-all duration-300
                                focus:outline-none focus:ring-3 focus:ring-blue-400/50
                                rounded-md border-2
                                ${isOriginal
                                  ? 'bg-blue-50 text-blue-900 border-blue-200 font-black shadow-inner'
                                  : cell 
                                    ? 'bg-green-50 text-green-800 border-green-200 shadow-sm hover:shadow-md'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50/50'
                                }
                                ${isSolving ? 'cursor-not-allowed animate-pulse' : 'cursor-pointer'}
                                disabled:opacity-60
                                focus:scale-105
                                hover:scale-102
                                transform
                              `}
                              maxLength="1"
                              disabled={isSolving || isOriginal}
                              onKeyDown={(e) => {
                                // Only allow numbers 1-9 and navigation keys
                                if (!/[1-9]/.test(e.key) && 
                                    !['Backspace', 'Delete', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                  e.preventDefault();
                                }
                              }}
                            />
                            {/* Visual indicator for original numbers */}
                            {isOriginal && (
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full opacity-70"></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              
              {/* Board Legend */}
              <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-50 border-2 border-blue-200 rounded relative">
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  </div>
                  <span>Given numbers</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-50 border-2 border-green-200 rounded"></div>
                  <span>Your input</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border-2 border-gray-300 rounded"></div>
                  <span>Empty cells</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <ControlsSection>
              <SpeedControl
                speed={speed}
                onSpeedChange={(e) => setSpeed(1000 - e.target.value)}
                disabled={isSolving}
                label="Solving Speed"
              />
              
              <EnhancedDataStructureButtonGrid
                operations={[
                  {
                    onClick: solveSudoku,
                    icon: FaPlay,
                    label: isSolving ? 'Solving...' : 'Solve Puzzle',
                    disabled: isSolving,
                    variant: 'primary'
                  },
                  {
                    onClick: generatePuzzle,
                    icon: FaRandom,
                    label: 'New Puzzle',
                    disabled: isSolving,
                    variant: 'secondary'
                  }
                ]}
                resetAction={ButtonPresets.dataStructure.reset(reset)}
                disabled={isSolving}
              />
            </ControlsSection>

            <StatisticsDisplay
              title="Statistics"
              stats={[
                { label: 'Status', value: stats.status, color: stats.solved ? 'text-green-600' : stats.status === 'Solving' ? 'text-blue-600' : 'text-gray-600' },
                { label: 'Difficulty', value: stats.difficulty.charAt(0).toUpperCase() + stats.difficulty.slice(1), color: 'text-purple-600' },
                { label: 'Steps', value: stats.steps, color: 'text-orange-600' },
                { label: 'Grid Size', value: stats.gridSize, color: 'text-gray-600' }
              ]}
              columns={2}
            />

            {stats.timeTaken && (
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <FaPuzzlePiece className="text-green-500" />
                  <span className="text-green-700 font-semibold">Puzzle Solved!</span>
                </div>
                <p className="text-green-600 text-sm">
                  Completed in {Math.round(stats.timeTaken / 1000)} seconds with {stats.steps} steps
                </p>
              </div>
            )}
            
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">How it Works</h3>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-md font-medium text-gray-800">Algorithm Steps</h4>
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
                  <h4 className="text-md font-medium text-gray-800">Rules</h4>
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
      </div>
    </Layout>
  );
}
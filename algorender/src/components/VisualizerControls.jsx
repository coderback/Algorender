'use client';

import { FaTachometerAlt, FaSort, FaPlay, FaPause, FaRandom, FaSearch, FaUndo, FaRoute, FaProjectDiagram, FaPlus, FaMinus, FaEdit, FaCheckCircle, FaTimesCircle, FaTimes } from 'react-icons/fa';
import Button from './Button';

// Standardized Speed Control based on linear-search pattern
export function SpeedControl({ speed, onSpeedChange, disabled = false, label = "Speed" }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
        <FaTachometerAlt className="w-4 h-4 text-blue-400" />
        {label}
        <span className="ml-auto text-xs text-gray-500">{(1000 - speed)} ms</span>
      </label>
      <input
        type="range"
        min="0"
        max="900"
        value={1000 - speed}
        onChange={onSpeedChange}
        disabled={disabled}
        className="w-full h-2 bg-gradient-to-r from-blue-200 to-blue-500 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition-all"
        style={{ accentColor: '#2563eb' }}
      />
    </div>
  );
}

// Standardized Button Grid based on merge-sort pattern
export function VisualizerButtonGrid({ 
  children, 
  primaryAction, 
  pauseAction, 
  resetAction,
  isRunning = false,
  isPaused = false,
  disabled = false
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Primary Action Button */}
      <Button
        onClick={primaryAction.onClick}
        disabled={primaryAction.disabled || (isRunning && !isPaused)}
        variant="primary"
        className="flex items-center justify-center gap-2"
      >
        {primaryAction.icon && <primaryAction.icon className="text-sm" />}
        {primaryAction.label}
      </Button>

      {/* Pause/Resume Button - only show when running */}
      {isRunning && pauseAction && (
        <Button
          onClick={pauseAction.onClick}
          variant="secondary"
          className="flex items-center justify-center gap-2"
        >
          {isPaused ? <FaPlay className="text-sm" /> : <FaPause className="text-sm" />}
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
      )}

      {/* Reset/New Array Button */}
      <Button
        onClick={resetAction.onClick}
        disabled={resetAction.disabled || (isRunning && !isPaused)}
        variant="secondary"
        className="flex items-center justify-center gap-2"
      >
        {resetAction.icon && <resetAction.icon className="text-sm" />}
        {resetAction.label}
      </Button>

      {/* Additional custom buttons */}
      {children}
    </div>
  );
}

// Standardized Statistics Display based on merge-sort pattern
export function StatisticsDisplay({ title = "Statistics", stats = [], columns = 2 }) {
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2', 
    3: 'grid-cols-3',
    4: 'grid-cols-4'
  }[columns] || 'grid-cols-2';

  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-3">{title}</h3>
      <div className={`grid ${gridColsClass} gap-4`}>
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
            <h4 className="text-sm font-medium text-gray-700 mb-1">{stat.label}</h4>
            <p className={`text-2xl font-semibold ${stat.color || 'text-gray-900'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Standardized Controls Section Container
export function ControlsSection({ title = "Controls", children }) {
  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

// Specialized Button Grid for Data Structures (different layout)
export function DataStructureButtonGrid({ children, resetAction }) {
  return (
    <div className="space-y-3">
      {children}
      {resetAction && (
        <Button
          onClick={resetAction.onClick}
          disabled={resetAction.disabled}
          variant="secondary"
          className="w-full flex items-center justify-center gap-2"
        >
          {resetAction.icon && <resetAction.icon className="text-sm" />}
          {resetAction.label}
        </Button>
      )}
    </div>
  );
}

// Error Display Component for consistent error handling
export function ErrorDisplay({ error, onDismiss }) {
  if (!error) return null;
  
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FaTimesCircle className="text-red-500" />
          <span className="text-red-700 font-medium">Error</span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            <FaTimes className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-red-600 mt-2">{error}</p>
    </div>
  );
}

// Success Display Component for consistent success feedback
export function SuccessDisplay({ message, onDismiss }) {
  if (!message) return null;
  
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FaCheckCircle className="text-green-500" />
          <span className="text-green-700 font-medium">Success</span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-green-500 hover:text-green-700 transition-colors"
          >
            <FaTimes className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-green-600 mt-2">{message}</p>
    </div>
  );
}

// Enhanced Button Grid for Graph Algorithms
export function GraphVisualizerButtonGrid({ 
  primaryAction, 
  resetAction,
  isRunning = false,
  disabled = false,
  showStartNodeSelector = true,
  startNode,
  onStartNodeChange,
  nodeOptions = []
}) {
  return (
    <div className="space-y-4">
      {/* Start Node Selection */}
      {showStartNodeSelector && (
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Start Node:</label>
          <select
            value={startNode}
            onChange={(e) => onStartNodeChange(Number(e.target.value))}
            disabled={isRunning || disabled}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium bg-white"
          >
            {nodeOptions.map(node => (
              <option key={node} value={node}>{node}</option>
            ))}
          </select>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || isRunning}
          variant="primary"
          className="flex items-center justify-center gap-2"
        >
          {primaryAction.icon && <primaryAction.icon className="text-sm" />}
          {primaryAction.label}
        </Button>

        <Button
          onClick={resetAction.onClick}
          disabled={resetAction.disabled || isRunning}
          variant="secondary"
          className="flex items-center justify-center gap-2"
        >
          {resetAction.icon && <resetAction.icon className="text-sm" />}
          {resetAction.label}
        </Button>
      </div>
    </div>
  );
}

// Enhanced Data Structure Button Grid with operation-specific buttons
export function EnhancedDataStructureButtonGrid({ 
  operations = [], 
  resetAction,
  disabled = false 
}) {
  return (
    <div className="space-y-3">
      {/* Operation buttons */}
      <div className="grid grid-cols-2 gap-3">
        {operations.map((operation, index) => (
          <Button
            key={index}
            onClick={operation.onClick}
            disabled={operation.disabled || disabled}
            variant={operation.variant || 'primary'}
            className="flex items-center justify-center gap-2"
          >
            {operation.icon && <operation.icon className="text-sm" />}
            {operation.label}
          </Button>
        ))}
      </div>

      {/* Reset button */}
      {resetAction && (
        <Button
          onClick={resetAction.onClick}
          disabled={resetAction.disabled || disabled}
          variant="secondary"
          className="w-full flex items-center justify-center gap-2"
        >
          {resetAction.icon && <resetAction.icon className="text-sm" />}
          {resetAction.label}
        </Button>
      )}
    </div>
  );
}

// Enhanced Statistics Display with table support for graph algorithms
export function EnhancedStatisticsDisplay({ 
  title = "Statistics", 
  stats = [], 
  columns = 2,
  tableData = null,
  tableHeaders = []
}) {
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2', 
    3: 'grid-cols-3',
    4: 'grid-cols-4'
  }[columns] || 'grid-cols-2';

  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-3">{title}</h3>
      
      {/* Card-based statistics */}
      {stats.length > 0 && (
        <div className={`grid ${gridColsClass} gap-4 mb-4`}>
          {stats.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
              <h4 className="text-sm font-medium text-gray-700 mb-1">{stat.label}</h4>
              <p className={`text-2xl font-semibold ${stat.color || 'text-gray-900'}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Table-based statistics for graph algorithms */}
      {tableData && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {tableHeaders.map((header, index) => (
                    <th key={index} className="text-left py-2 px-3 font-medium text-gray-700">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-gray-100">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-2 px-3 text-gray-900">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Preset button configurations for common actions
export const ButtonPresets = {
  // For sorting algorithms
  sort: {
    primary: (onClick, isRunning, isPaused) => ({
      onClick,
      icon: FaSort,
      label: isRunning && !isPaused ? 'Sorting...' : 'Sort',
      disabled: false
    }),
    reset: (onClick) => ({
      onClick,
      icon: FaRandom,
      label: 'New Array',
      disabled: false
    })
  },

  // For search algorithms  
  search: {
    primary: (onClick, isRunning, isPaused) => ({
      onClick,
      icon: FaSearch,
      label: isRunning && !isPaused ? 'Searching...' : 'Start Search',
      disabled: false
    }),
    reset: (onClick) => ({
      onClick,
      icon: FaUndo,
      label: 'Reset',
      disabled: false
    })
  },

  // For graph algorithms
  graph: {
    primary: (onClick, isRunning, algorithm = 'Algorithm') => ({
      onClick,
      icon: FaRoute,
      label: isRunning ? `Running ${algorithm}...` : `Run ${algorithm}`,
      disabled: false
    }),
    reset: (onClick) => ({
      onClick,
      icon: FaUndo,
      label: 'Reset',
      disabled: false
    })
  },

  // For data structures
  dataStructure: {
    insert: (onClick, disabled = false) => ({
      onClick,
      icon: FaPlus,
      label: 'Insert',
      disabled,
      variant: 'primary'
    }),
    remove: (onClick, disabled = false) => ({
      onClick,
      icon: FaMinus,
      label: 'Remove',
      disabled,
      variant: 'danger'
    }),
    search: (onClick, disabled = false) => ({
      onClick,
      icon: FaSearch,
      label: 'Search',
      disabled,
      variant: 'secondary'
    }),
    reset: (onClick) => ({
      onClick,
      icon: FaUndo,
      label: 'Reset',
      disabled: false
    })
  }
};
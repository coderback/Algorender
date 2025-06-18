'use client';

import { useEffect, useRef } from 'react';

export default function SortingChart({
  array,
  selectedIndices = [],
  sortedIndices = [],
  onRemove,
  showRemove = true,
  className = '',
}) {
  const containerRef = useRef(null);
  const maxValue = Math.max(...array, 100);

  useEffect(() => {
    // Add smooth transitions when array changes
    const bars = containerRef.current?.querySelectorAll('.bar');
    if (bars) {
      bars.forEach((bar) => {
        bar.style.transition = 'all 0.3s ease-in-out';
      });
    }
  }, [array]);

  const getBarColor = (index, value) => {
    if (selectedIndices.includes(index)) {
      return {
        background: 'bg-gradient-to-t from-blue-600 to-blue-400',
        border: 'border-blue-700',
        shadow: 'shadow-blue-200',
      };
    }
    if (sortedIndices.includes(index)) {
      return {
        background: 'bg-gradient-to-t from-green-600 to-green-400',
        border: 'border-green-700',
        shadow: 'shadow-green-200',
      };
    }
    return {
      background: 'bg-gradient-to-t from-orange-600 to-orange-400',
      border: 'border-orange-700',
      shadow: 'shadow-orange-200',
    };
  };

  return (
    <div
      ref={containerRef}
      className={`flex items-end justify-center gap-1 h-72 bg-white rounded-lg p-4 ${className}`}
    >
      {array.map((value, index) => {
        const { background, border, shadow } = getBarColor(index, value);
        return (
          <div
            key={index}
            className="relative group flex flex-col items-center"
          >
            {/* Remove button */}
            {showRemove && (
              <button
                onClick={() => onRemove?.(index)}
                className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            )}
            
            {/* Bar */}
            <div
              className={`bar w-12 rounded-t-md border ${background} ${border} ${shadow} transition-all duration-300 hover:brightness-110`}
              style={{
                height: `${(value / maxValue) * 180}px`, // Reduced height to make room for label
              }}
            />
            
            {/* Value label */}
            <span className={`text-sm font-mono mt-2 text-gray-600 transition-colors duration-300 ${
              selectedIndices.includes(index) ? 'text-blue-600 font-bold' :
              sortedIndices.includes(index) ? 'text-green-600 font-bold' :
              'text-gray-600'
            }`}>
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
} 
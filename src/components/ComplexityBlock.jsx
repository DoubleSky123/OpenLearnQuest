import React from 'react';

/**
 * Complexity block component - displays time complexity (e.g., O(n), O(1))
 * @param {string} complexity - The complexity string (e.g., "O(n)")
 * @param {number} index - Position in the pool/assembly
 * @param {string} source - Source identifier for drag/drop
 * @param {Function} onDragStart - Drag start handler
 * @param {boolean} hasError - Whether this block has an error
 * @param {Object} errorInfo - Error details with expected complexity
 */
export default function ComplexityBlock({ 
  complexity, 
  index, 
  source, 
  onDragStart, 
  hasError = false, 
  errorInfo = null 
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index, source)}
      className={`px-4 py-2 rounded cursor-move border-2 hover:border-purple-400 transition-all font-mono text-xs font-bold ${
        hasError
          ? 'bg-red-800 border-red-500 text-white'
          : 'bg-purple-700 border-purple-600 text-white hover:bg-purple-600'
      }`}
    >
      {complexity}
      {errorInfo && (
        <div className="text-xs mt-1 text-red-200">
          Expected: {errorInfo.expected}
        </div>
      )}
    </div>
  );
}
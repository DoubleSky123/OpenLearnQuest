import React from 'react';

/**
 * Single code block component - draggable pseudocode line
 * @param {Object} item - Block item with {index, isDistractor}
 * @param {number} index - Position in the pool/assembly
 * @param {string} source - Source identifier for drag/drop
 * @param {Function} onDragStart - Drag start handler
 * @param {Object} currentLevel - Current level configuration
 * @param {boolean} hasError - Whether this block has an error
 */
export default function CodeBlock({ item, index, source, onDragStart, currentLevel, hasError = false }) {
  const text = item.isDistractor 
    ? currentLevel.distractors[item.index]
    : currentLevel.pseudocode[item.index];
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index, source)}
      className={`hover:bg-slate-500 text-white p-3 rounded cursor-move border-2 hover:border-blue-400 transition-all font-mono text-sm ${
        hasError
          ? 'bg-red-800 border-red-500'
          : 'bg-slate-600 border-slate-500'
      }`}
    >
      {text}
    </div>
  );
}
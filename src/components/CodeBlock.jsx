import React from 'react';

/**
 * Single code block — click to place/remove, no drag.
 * source='pool'     → click adds to assembly
 * source='assembly' → click returns to pool
 */
export default function CodeBlock({ item, index, source, onClick, currentLevel, isCorrect = false }) {
  const text = item.isDistractor
    ? currentLevel.distractors[item.index]
    : currentLevel.pseudocode[item.index];

  const base = 'w-full text-left p-3 rounded-lg border font-mono text-xl transition-all cursor-pointer';

  if (source === 'assembly') {
    return (
      <button
        onClick={() => onClick(index)}
        className={`${base} ${
          isCorrect
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-white border-gray-200 text-gray-800 hover:border-red-300 hover:bg-red-50'
        }`}
      >
        {text}
      </button>
    );
  }

  // pool block
  return (
    <button
      onClick={() => onClick(index)}
      className={`${base} bg-white border-gray-200 text-gray-800 hover:border-violet-400 hover:bg-violet-50`}
    >
      {text}
    </button>
  );
}

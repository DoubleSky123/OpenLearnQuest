import React from 'react';

/**
 * Hint box component - displays a helpful hint for the current level
 * @param {string} hint - The hint text to display
 */
export default function HintBox({ hint }) {
  return (
    <div className="bg-blue-900 border border-blue-500 rounded p-3 text-blue-100 text-sm">
      <p className="font-bold mb-1">💡 Hint:</p>
      <p>{hint}</p>
    </div>
  );
}
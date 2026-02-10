import React from 'react';
import { formatPatternValue } from '../utils/helpers';

/**
 * Goal pattern display - shows the target linked list pattern
 * @param {Array} goalPattern - Array of values representing the goal
 * @param {boolean} useNumbers - Whether to use number display format
 */
export default function GoalPattern({ goalPattern, useNumbers }) {
  return (
    <div className="bg-slate-700 rounded p-4 mb-4">
      <p className="text-slate-300 text-sm mb-3">🎯 Goal Pattern:</p>
      <div className="flex gap-3 flex-wrap">
        {goalPattern.map((value, idx) => (
          <div 
            key={idx} 
            className={`${useNumbers ? 'w-14 h-14 text-2xl' : 'w-16 h-16 text-4xl'} bg-yellow-600 rounded-lg flex items-center justify-center border-3 border-yellow-400 font-bold shadow-lg`}
          >
            {formatPatternValue(value)}
          </div>
        ))}
      </div>
    </div>
  );
}
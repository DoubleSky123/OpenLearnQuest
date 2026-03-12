import React from 'react';
import { formatPatternValue } from '../utils/helpers';

/**
 * Reusable linked-list visualiser — circular nodes connected by arrows.
 * Each node shows its value inside the circle and its index (0-based) below.
 *
 * @param {Array}   values      - Ordered array of node values to display
 * @param {string}  emptyLabel  - Text shown when list is empty
 * @param {string}  nodeColor   - Tailwind bg + border classes for the node circle
 * @param {boolean} highlight   - When true each matching node glows (used in Current Pattern)
 * @param {Array}   goalValues  - Used for per-node highlight comparison
 */
function LinkedListVisualiser({ values = [], emptyLabel = 'Empty', nodeColor = 'bg-slate-600 border-slate-400', highlight = false, goalValues = [] }) {
  if (values.length === 0) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm italic min-h-12">
        <span className="w-10 h-10 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center text-xs">∅</span>
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {values.map((val, idx) => {
        const isMatch = highlight && goalValues.length > 0 && val === goalValues[idx];
        const circleClass = highlight
          ? isMatch
            ? 'bg-green-600 border-green-400 shadow-lg shadow-green-700 scale-110'
            : 'bg-slate-600 border-slate-400'
          : nodeColor;
        return (
          <React.Fragment key={idx}>
            {/* Node: circle + index label below */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold text-white text-sm transition-all ${circleClass}`}>
                {formatPatternValue(val)}
              </div>
              <span className="text-slate-400 text-xs">{idx}</span>
            </div>
            {/* Arrow between nodes (vertically centered with circle, not label) */}
            {idx < values.length - 1 && (
              <span className="text-slate-400 text-lg select-none mb-4">→</span>
            )}
          </React.Fragment>
        );
      })}
      {/* NULL terminator */}
      <span className="text-slate-500 text-sm ml-1 select-none mb-4">→ NULL</span>
    </div>
  );
}

/**
 * Goal Pattern panel — shows the target linked list state.
 */
export default function GoalPattern({ goalPattern}) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-bold text-white mb-3">Goal Linked List</h2>
      <div className="bg-slate-700 rounded p-4">
      <LinkedListVisualiser
        values={goalPattern}
        emptyLabel="Empty list (no nodes)"
        nodeColor="bg-yellow-600 border-yellow-400"
      />
      </div>
    </div>
  );
}

export { LinkedListVisualiser };

import React from 'react';
import { formatPatternValue } from '../utils/helpers';

function LinkedListVisualiser({ values = [], emptyLabel = 'Empty', nodeColor = 'bg-gray-200 border-gray-300', highlight = false, goalValues = [] }) {
  if (values.length === 0) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm italic min-h-12">
        <span className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xs">∅</span>
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
            ? 'bg-emerald-100 border-emerald-400 text-emerald-800 scale-110 shadow-sm'
            : 'bg-gray-100 border-gray-300 text-gray-700'
          : nodeColor;
        return (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-semibold text-sm transition-all ${circleClass}`}>
                {formatPatternValue(val)}
              </div>
              <span className="text-gray-400 text-xs">{idx}</span>
            </div>
            {idx < values.length - 1 && (
              <span className="text-gray-400 text-base select-none mb-4">→</span>
            )}
          </React.Fragment>
        );
      })}
      <span className="text-gray-400 text-sm ml-1 select-none mb-4">→ NULL</span>
    </div>
  );
}

export default function GoalPattern({ goalPattern }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Goal state</h2>
      <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
        <LinkedListVisualiser
          values={goalPattern}
          emptyLabel="Empty list (no nodes)"
          nodeColor="bg-amber-50 border-amber-300 text-amber-800"
        />
      </div>
    </div>
  );
}

export { LinkedListVisualiser };

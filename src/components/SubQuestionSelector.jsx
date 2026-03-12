import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';

const LABELS_BY_LEVEL = {
  1: [
    'Insert at Head',
    'Insert at End',
    'Remove at Head',
    'Remove Last Node',
  ],
  2: [
    'Insert into Empty List',
    'Delete Entire List',
    'Insert at Position',
    'Remove at Position',
  ],
  3: [
    'Reverse Linked List',
    'Merge Two Sorted Lists',
    'Linked List Cycle',
    'Sort Linked List',
  ],
};

export default function SubQuestionSelector({ levelId, currentSubIdx, completedSubs = new Set(), onSubChange }) {
  const labels = LABELS_BY_LEVEL[levelId] ?? [];
  return (
    <div className="flex gap-2 flex-wrap mt-2">
      {labels.map((label, idx) => {
        const isActive    = idx === currentSubIdx;
        const isCompleted = completedSubs.has(idx);
        return (
          <button
            key={idx}
            onClick={() => onSubChange(idx)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
              isActive
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-900'
                : isCompleted
                ? 'bg-emerald-800 border-emerald-600 text-emerald-100 hover:bg-emerald-700'
                : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white'
            }`}
          >
            {isCompleted
              ? <CheckCircle size={12} className="shrink-0" />
              : <Circle      size={12} className="shrink-0" />}
            <span>{idx + 1}. {label}</span>
          </button>
        );
      })}
    </div>
  );
}

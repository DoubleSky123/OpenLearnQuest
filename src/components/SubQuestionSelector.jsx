import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';

const LABELS_BY_LEVEL = {
  1: ['Insert at Head', 'Insert at End', 'Remove at Head', 'Remove Last Node'],
  2: ['Insert into Empty List', 'Delete Entire List', 'Insert at Position', 'Remove at Position'],
  3: ['Reverse Linked List', 'Merge Two Sorted Lists', 'Linked List Cycle', 'Sort Linked List'],
};

export default function SubQuestionSelector({ levelId, currentSubIdx, completedSubs = new Set(), onSubChange }) {
  const labels = LABELS_BY_LEVEL[levelId] ?? [];
  return (
    <div className="flex gap-2 flex-wrap">
      {labels.map((label, idx) => {
        const isActive    = idx === currentSubIdx;
        const isCompleted = completedSubs.has(idx);
        return (
          <button
            key={idx}
            onClick={() => onSubChange(idx)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isActive
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : isCompleted
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
            }`}
          >
            {isCompleted
              ? <CheckCircle size={12} className="shrink-0" />
              : <Circle size={12} className="shrink-0" />}
            {idx + 1}. {label}
          </button>
        );
      })}
    </div>
  );
}

import React from 'react';
import { Star, Lock } from 'lucide-react';

export default function LevelSelector({ levels, currentLevelId, completedLevels, onLevelChange, children }) {
  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-gray-500 text-sm font-medium mb-3">Level</p>
      <div className="flex gap-2 flex-wrap">
        {levels.map((level) => {
          const isActive    = currentLevelId === level.id;
          const isCompleted = completedLevels.includes(level.id);
          return (
            <button
              key={level.id}
              onClick={() => onLevelChange(level.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                isActive
                  ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : isCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              {isCompleted && !isActive && <Star size={13} className="shrink-0" />}
              Level {level.id}
            </button>
          );
        })}
      </div>
      {children && <div className="mt-3 pt-3 border-t border-gray-100">{children}</div>}
    </div>
  );
}

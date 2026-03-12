import React from 'react';
import { Lock, Unlock, Star } from 'lucide-react';

/**
 * Level selector component - displays all levels with completion status.
 * Accepts optional `children` rendered below the level buttons (e.g. SubQuestionSelector).
 */
export default function LevelSelector({ levels, currentLevelId, completedLevels, onLevelChange, children }) {
  return (
    <div className="mb-8 p-4 bg-slate-800 rounded-lg border border-slate-700">
      <p className="text-slate-300 text-sm mb-3">Levels:</p>
      <div className="flex gap-2 flex-wrap">
        {levels.map((level) => {
          const isLocked = false;
          return (
            <button
              key={level.id}
              onClick={() => { if (!isLocked) onLevelChange(level.id); }}
              disabled={isLocked}
              className={`px-4 py-2 rounded font-bold text-sm transition-all ${
                currentLevelId === level.id
                  ? 'bg-blue-600 text-white border-2 border-blue-400'
                  : isLocked
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                  : completedLevels.includes(level.id)
                  ? 'bg-green-700 text-white hover:bg-green-600'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {isLocked
                ? <Lock   size={14} className="inline mr-1" />
                : completedLevels.includes(level.id)
                ? <Star   size={14} className="inline mr-1" />
                : <Unlock size={14} className="inline mr-1" />}
              L{level.id}
            </button>
          );
        })}
      </div>

      {/* Optional sub-content (e.g. SubQuestionSelector) */}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

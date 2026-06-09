import React, { useEffect } from 'react';
import { ChevronRight, Clock, AlertTriangle, Trophy, RotateCcw } from 'lucide-react';
import { formatTime } from './GameTimer';

export default function LevelCompleteModal({
  isOpen,
  levelId     = 1,
  totalLevels = 3,
  timeSeconds = 0,
  errorCount  = 0,
  xpGained    = 0,
  onNext,
  onNewQuestion,
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else        document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const isLast = levelId >= totalLevels;
  const stars  = errorCount === 0 ? 3 : errorCount <= 2 ? 2 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="h-1 w-full bg-violet-500" />

        <div className="p-7">
          <div className="flex flex-col items-center mb-5">
            <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mb-3">
              <Trophy size={32} className="text-violet-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-0.5">Quest complete!</h2>
            <p className="text-gray-400 text-sm">Level {levelId} of {totalLevels}</p>
          </div>

          {/* Stars */}
          <div className="flex justify-center gap-3 mb-5">
            {[1, 2, 3].map(s => (
              <span key={s} className={`text-3xl transition-all ${s <= stars ? 'opacity-100' : 'opacity-20 grayscale'}`}>
                ⭐
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center gap-1">
              <Clock size={18} className="text-violet-500" />
              <p className="text-lg font-bold text-gray-900 font-mono">{formatTime(timeSeconds)}</p>
              <p className="text-gray-400 text-xs">Time</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center gap-1">
              <AlertTriangle size={18} className={errorCount === 0 ? 'text-emerald-500' : 'text-amber-500'} />
              <p className={`text-lg font-bold font-mono ${errorCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {errorCount}
              </p>
              <p className="text-gray-400 text-xs">Errors</p>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 flex flex-col items-center gap-1">
              <span className="text-violet-500 font-bold text-sm">XP</span>
              <p className="text-lg font-bold text-violet-700">+{xpGained}</p>
              <p className="text-gray-400 text-xs">Earned</p>
            </div>
          </div>

          {errorCount === 0 && (
            <div className="mb-5 text-center">
              <span className="inline-block px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-semibold">
                Perfect run — no errors!
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={onNext}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-700 active:scale-95 transition-all text-sm"
            >
              {isLast ? <><RotateCcw size={16} /> Play Again</> : <>Next Level <ChevronRight size={16} /></>}
            </button>
            <button
              onClick={onNewQuestion}
              className="w-full py-2.5 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-sm"
            >
              Try another question
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

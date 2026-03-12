import React, { useEffect } from 'react';
import { ChevronRight, Clock, AlertTriangle, Trophy, RotateCcw } from 'lucide-react';
import { formatTime } from './GameTimer';

/**
 * LevelCompleteModal
 *
 * Props:
 *   isOpen        {boolean}  — whether to show
 *   levelId       {number}   — current level number (1-3)
 *   totalLevels   {number}   — total level count (default 3)
 *   timeSeconds   {number}   — elapsed time in seconds
 *   errorCount    {number}   — number of mistakes made
 *   onNext        {function} — called when player clicks Next Level / Play Again
 *   onNewQuestion {function} — called when player clicks Try New Question
 *   accentColor   {string}   — tailwind gradient classes e.g. 'from-green-500 to-emerald-500'
 */
export default function LevelCompleteModal({
  isOpen,
  levelId       = 1,
  totalLevels   = 3,
  timeSeconds   = 0,
  errorCount    = 0,
  onNext,
  onNewQuestion,
  accentColor   = 'from-green-500 to-emerald-500',
}) {
  // Prevent body scroll while open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else        document.body.style.overflow = '';
    return ()  => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const isLast = levelId >= totalLevels;

  // Star rating based on errors
  const stars = errorCount === 0 ? 3 : errorCount <= 2 ? 2 : 1;

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      {/* Card */}
      <div className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">

        {/* Coloured top bar */}
        <div className={`h-2 w-full bg-gradient-to-r ${accentColor}`} />

        <div className="p-8">
          {/* Trophy + title */}
          <div className="flex flex-col items-center mb-6">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${accentColor} flex items-center justify-center mb-4 shadow-lg`}>
              <Trophy size={40} className="text-white" />
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-1">Level Complete!</h2>
            <p className="text-slate-400 text-sm">Level {levelId} of {totalLevels}</p>
          </div>

          {/* Stars */}
          <div className="flex justify-center gap-3 mb-6">
            {[1, 2, 3].map(s => (
              <span
                key={s}
                className={`text-4xl transition-all ${s <= stars ? 'opacity-100 scale-110' : 'opacity-20 grayscale'}`}
              >
                ⭐
              </span>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {/* Time */}
            <div className="bg-slate-700 rounded-xl p-4 flex flex-col items-center gap-1">
              <Clock size={22} className="text-blue-400" />
              <p className="text-2xl font-bold text-white font-mono">{formatTime(timeSeconds)}</p>
              <p className="text-slate-400 text-xs">Time</p>
            </div>

            {/* Mistakes */}
            <div className="bg-slate-700 rounded-xl p-4 flex flex-col items-center gap-1">
              <AlertTriangle size={22} className={errorCount === 0 ? 'text-green-400' : 'text-yellow-400'} />
              <p className={`text-2xl font-bold font-mono ${errorCount === 0 ? 'text-green-400' : 'text-yellow-300'}`}>
                {errorCount}
              </p>
              <p className="text-slate-400 text-xs">{errorCount === 1 ? 'Mistake' : 'Mistakes'}</p>
            </div>
          </div>

          {/* Perfect run badge */}
          {errorCount === 0 && (
            <div className="mb-6 text-center">
              <span className="inline-block px-4 py-1.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full text-white text-sm font-bold shadow">
                🏆 Perfect Run!
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onNext}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r ${accentColor} hover:opacity-90 active:scale-95 transition-all shadow-lg`}
            >
              {isLast ? (
                <><RotateCcw size={18} /> Play Again</>
              ) : (
                <>Next Level <ChevronRight size={18} /></>
              )}
            </button>

            <button
              onClick={onNewQuestion}
              className="w-full py-2.5 rounded-xl font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-sm"
            >
              Try Another Question (Same Level)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

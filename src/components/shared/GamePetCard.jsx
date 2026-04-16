import React, { useState } from 'react';
import PetCanvas, { getStage } from '../PetCanvas';
import { XP_PER_LEVEL } from '../../utils/helpers';

/**
 * Shared pet card used by all game screens.
 *
 * Props:
 *   mood     — 'idle' | 'happy' | 'sad'
 *   xp       — current global XP
 *   theme    — 'violet' | 'pink' | 'emerald' | 'amber'
 *   hideable — show the hide/show toggle (default false)
 */

const THEMES = {
  violet:  { border: 'border-violet-200', hiddenBorder: 'border-violet-100', bar: 'bg-violet-400' },
  pink:    { border: 'border-pink-200',   hiddenBorder: 'border-pink-100',   bar: 'bg-pink-400'   },
  emerald: { border: 'border-emerald-200',hiddenBorder: 'border-emerald-100',bar: 'bg-emerald-400' },
  amber:   { border: 'border-amber-200',  hiddenBorder: 'border-amber-100',  bar: 'bg-amber-400'  },
};

export default function GamePetCard({ mood = 'idle', xp = 0, theme = 'violet', hideable = false, message = '' }) {
  const t         = THEMES[theme] ?? THEMES.violet;
  const stage     = getStage(xp);
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const petLevel  = Math.floor(xp / XP_PER_LEVEL) + 1;
  const [hidden, setHidden] = useState(false);

  const speechBubble = message ? (
    <div className="relative mx-3 mt-2 mb-1">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2 shadow-sm text-xs text-gray-700 text-center leading-snug">
        {message}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-[6px] w-0 h-0"
        style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #e5e7eb' }} />
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-0 h-0"
        style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid white' }} />
    </div>
  ) : null;

  return (
    <div className={`bg-white rounded-xl border-2 border-dashed ${t.border} overflow-hidden`}>

      {hideable ? (
        <>
          <div className="px-4 pt-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Algo</p>
            <button
              onClick={() => setHidden(h => !h)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-0.5 rounded border border-gray-200 hover:border-gray-300"
            >
              {hidden ? 'Show' : 'Hide'}
            </button>
          </div>
          {!hidden ? (
            <>
              {speechBubble}
              <div className="bg-[#c8dfa8] mx-3 mt-2 rounded-lg flex items-center justify-center py-16">
                <PetCanvas stage={stage} mood={mood} />
              </div>
            </>
          ) : (
            <div className={`mx-3 mt-2 rounded-lg border border-dashed ${t.hiddenBorder} flex items-center justify-center py-5 text-2xl text-gray-300`}>
              🐾
            </div>
          )}
          <div className="px-4 py-3 flex flex-col items-center gap-2">
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className={`h-full ${t.bar} rounded-full transition-all duration-500`} style={{ width: `${xpPct}%` }} />
            </div>
            <p className="text-xs text-gray-500">Level {petLevel} · {xpInLevel} / {XP_PER_LEVEL} XP</p>
          </div>
        </>
      ) : (
        <>
          {speechBubble}
          <div className="bg-[#c8dfa8] mx-3 mt-3 rounded-lg flex items-center justify-center py-16">
            <PetCanvas stage={stage} mood={mood} />
          </div>
          <div className="px-4 py-4 flex flex-col items-center gap-2">
            <p className="text-sm font-semibold text-gray-700">Algo</p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className={`h-full ${t.bar} rounded-full transition-all duration-500`} style={{ width: `${xpPct}%` }} />
            </div>
            <p className="text-xs text-gray-500">Level {petLevel} · {xpInLevel} / {XP_PER_LEVEL} XP</p>
          </div>
        </>
      )}

    </div>
  );
}

import React from 'react';
import GameTimer from '../GameTimer';
import HelpModal from '../HelpModal';
import { XP_PER_LEVEL, LEVEL_NAMES } from '../../utils/helpers';

export default function GameTopBar({
  onBack,
  xp,
  title,
  titleColor = 'text-violet-600',
  barColor   = 'bg-violet-500',
  showModal,
  assistCount,
  timerRef,
  showTimer = true,
}) {
  const level     = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const [showHelp, setShowHelp] = React.useState(false);
  const timerRunning = showModal !== undefined ? !showModal : true;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center">

        {/* Left */}
        <div className="flex-1 flex items-center gap-2">
          <button
            onClick={onBack}
            className="border border-gray-300 rounded-lg px-4 py-1.5 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="w-8 h-8 rounded-full border border-gray-300 text-gray-500 font-bold text-base hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Game Guide"
          >
            ?
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <span className={`${titleColor} text-2xl font-bold`}>{title}</span>
        </div>

        {/* Right */}
        <div className="flex-1 flex justify-end items-center gap-4">
          {assistCount > 0 && (
            <div className="bg-gray-50 border border-gray-200 text-gray-500 text-xs px-3 py-1.5 rounded-full shrink-0">
              {assistCount} assist{assistCount !== 1 ? 's' : ''}
            </div>
          )}
          <span className="text-gray-700 text-lg font-semibold whitespace-nowrap">
            Level {level} · {levelName}
          </span>
          <div className="w-36 shrink-0">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>XP</span><span>{xpInLevel}/{XP_PER_LEVEL}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${xpPct}%` }} />
            </div>
          </div>
          {showTimer && <GameTimer ref={timerRef} isRunning={timerRunning} />}
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

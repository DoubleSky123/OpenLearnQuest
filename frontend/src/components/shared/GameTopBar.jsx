import React from 'react';
import GameTimer from '../GameTimer';
import HelpModal from '../HelpModal';
import ConceptSlidesMenu from './ConceptSlidesMenu';

// xp prop kept for caller compatibility — the XP/level display was removed
// (gamification layer parked; DB columns retained for possible revival)
export default function GameTopBar({
  onBack,
  xp,             // eslint-disable-line no-unused-vars
  title,
  titleColor = 'text-violet-600',
  barColor   = 'bg-violet-500', // eslint-disable-line no-unused-vars
  showModal,
  assistCount,
  timerRef,
  showTimer = true,
}) {
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
          {/* Intro slides stay reachable for the whole session, not just on signup */}
          <ConceptSlidesMenu />
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
          {showTimer && <GameTimer ref={timerRef} isRunning={timerRunning} />}
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

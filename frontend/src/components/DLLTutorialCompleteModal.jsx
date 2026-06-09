import React, { useEffect, useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

export default function DLLTutorialCompleteModal({ isOpen, onTraining, onReplay, onBack }) {
  const [showStars, setShowStars] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setShowStars(true), 200);
      return () => clearTimeout(t);
    } else {
      setShowStars(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">

        <div className="h-2 w-full bg-gradient-to-r from-pink-400 to-rose-500" />

        <div className="px-8 py-10 flex flex-col items-center text-center">

          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center mb-6 shadow-xl">
            <span className="text-6xl">🎓</span>
          </div>

          <h2 className="text-4xl font-black text-gray-900 mb-1">DLL Tutorial Complete!</h2>
          <p className="text-gray-400 text-xl mb-8">You've mastered the prev pointer 🎉</p>

          <div className="flex items-center justify-center gap-3 mb-10">
            {[0, 1, 2].map(i => (
              <span key={i} className="text-5xl transition-all duration-500" style={{
                opacity: showStars ? 1 : 0,
                transform: showStars ? 'scale(1) rotate(0deg)' : 'scale(0.3) rotate(-30deg)',
                transitionDelay: `${i * 150}ms`,
              }}>⭐</span>
            ))}
          </div>

          <div className="flex gap-3 mb-10 flex-wrap justify-center">
            {['Insert at Head', 'Remove at Head'].map(label => (
              <div key={label} className="flex items-center gap-1.5 bg-pink-50 border border-pink-200 text-pink-700 text-base font-semibold px-4 py-2 rounded-full">
                ✅ {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={onTraining}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 active:scale-95 transition-all shadow-lg"
            >
              DLL Training <ChevronRight size={22} />
            </button>
            <button
              onClick={onReplay}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-lg border border-gray-200"
            >
              <RotateCcw size={17} /> Replay
            </button>
            <button
              onClick={onBack}
              className="w-full py-2 rounded-2xl font-medium text-gray-400 hover:text-gray-600 transition-colors text-base"
            >
              Back to Mode Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

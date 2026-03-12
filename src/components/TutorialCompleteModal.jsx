import React from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

/**
 * TutorialCompleteModal
 * Shown when the player finishes both tutorial exercises.
 *
 * Props:
 *   isOpen        {boolean}
 *   onRegular     {function} — go to Regular Mode
 *   onReplay      {function} — replay Tutorial
 *   onBack        {function} — back to Mode Select
 */
export default function TutorialCompleteModal({ isOpen, onRegular, onReplay, onBack }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">

        {/* Top accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />

        <div className="p-8 flex flex-col items-center text-center">

          {/* Trophy */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-5 shadow-lg">
            <span className="text-4xl">🎓</span>
          </div>

          <h2 className="text-3xl font-extrabold text-white mb-2">Tutorial Complete!</h2>
          <p className="text-slate-400 text-sm mb-6">
            Great work! You have mastered the basics of linked list operations.
          </p>

          {/* What you learned */}
          <div className="w-full bg-slate-700 rounded-xl p-4 mb-7 text-left">
            <p className="text-emerald-400 font-semibold text-sm mb-3">What you practised:</p>
            <ul className="space-y-2">
              {[
                { icon: '✅', text: 'Insert at Head — prepend a new node to the list' },
                { icon: '✅', text: 'Remove at Head — delete the first node safely' },
              ].map(({ icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-slate-300 text-sm">
                  <span>{icon}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggestion */}
          <div className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg px-4 py-3 mb-7 text-sm text-blue-200 text-left">
            <span className="font-semibold">Ready for more?</span> Head into
            <span className="font-semibold"> Regular Mode</span> to tackle all operations
            with randomised values, distractor blocks, and a timer!
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={onRegular}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90 active:scale-95 transition-all shadow-lg"
            >
              Go to Regular Mode <ChevronRight size={18} />
            </button>
            <button
              onClick={onReplay}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-sm"
            >
              <RotateCcw size={15} /> Replay Tutorial
            </button>
            <button
              onClick={onBack}
              className="w-full py-2 rounded-xl font-medium text-slate-500 hover:text-slate-300 transition-colors text-sm"
            >
              Back to Mode Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

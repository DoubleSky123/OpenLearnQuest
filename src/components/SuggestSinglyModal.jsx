import React from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';

/**
 * SuggestSinglyModal
 * Shown when the player accumulates 3+ Type-A errors (basic pointer errors)
 * in the DLL game, suggesting they review Singly Linked List first.
 *
 * Props:
 *   isOpen     {boolean}
 *   errorCount {number}   — number of Type-A errors so far
 *   onGoSingly {function} — player chooses to go back to Singly
 *   onStay     {function} — player chooses to stay in DLL
 */
export default function SuggestSinglyModal({ isOpen, errorCount, onGoSingly, onStay }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">

        {/* Top accent bar */}
        <div className="h-2 w-full bg-gradient-to-r from-yellow-500 to-orange-500" />

        <div className="p-8">
          {/* Icon + title */}
          <div className="flex flex-col items-center mb-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center mb-4 shadow-lg">
              <BookOpen size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-1 text-center">
              Struggling with the basics?
            </h2>
            <p className="text-slate-400 text-sm text-center">
              You've made <span className="text-yellow-400 font-bold">{errorCount} pointer errors</span> that also appear in singly linked lists.
            </p>
          </div>

          {/* Explanation */}
          <div className="bg-slate-700 rounded-xl p-4 mb-6 space-y-2">
            <p className="text-slate-300 text-sm leading-relaxed">
              Doubly linked lists build on singly linked list concepts. Errors like
              <span className="text-yellow-300 font-semibold"> lost references</span>,
              <span className="text-yellow-300 font-semibold"> off-by-one loops</span>,
              <span className="text-yellow-300 font-semibold"> null pointer mistakes</span>, and
              <span className="text-yellow-300 font-semibold"> memory leaks</span> suggest
              the singly linked list foundation may need more practice.
            </p>
            <p className="text-slate-400 text-xs">
              You can always come back to Doubly Linked List once you feel confident.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onGoSingly}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-yellow-500 to-orange-500 hover:opacity-90 active:scale-95 transition-all shadow-lg"
            >
              <ArrowLeft size={18} /> Go to Singly Linked List
            </button>
            <button
              onClick={onStay}
              className="w-full py-2.5 rounded-xl font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-sm"
            >
              Stay in Doubly Linked List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect, useCallback } from 'react';
import GameTimer from './GameTimer';
import ErrorCounter from './ErrorCounter';
import LevelCompleteModal from './LevelCompleteModal';

// ── Bubble sort pseudocode ────────────────────────────────────────────────────
const CODE_LINES = [
  { text: 'for i from 0 to n-1:',               indent: 0 },
  { text: 'node = head',                         indent: 1 },
  { text: 'while (node.next != NULL):',          indent: 1 },
  { text: 'if (node.val > node.next.val):',      indent: 2 },
  { text: 'swap(node.val, node.next.val)',        indent: 3 },
  { text: 'node = node.next',                    indent: 2 },
];

// Line index constants for readability
const LINE = { FOR: 0, INIT: 1, WHILE: 2, IF: 3, SWAP: 4, NEXT: 5 };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate n distinct random values, guaranteed unsorted */
const genValues = (n = 5) => {
  let vals;
  do {
    const pool = Array.from({ length: 20 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    vals = pool.slice(0, n);
  } while (isSorted(vals)); // re-roll if accidentally sorted
  return vals;
};

const isSorted = (arr) => arr.every((v, i) => i === 0 || arr[i - 1] <= v);

/**
 * Count how many nodes from the RIGHT end are already in their final sorted position.
 * Used to render settled (locked) nodes in green.
 */
const getSettledCount = (vals) => {
  const sorted = [...vals].sort((a, b) => a - b);
  let count = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i] === sorted[i]) count++;
    else break;
  }
  return count;
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function SortLinkedListGame({ onBack }) {
  const [values, setValues]           = useState(() => genValues());
  const [activeLines, setActiveLines] = useState([LINE.FOR, LINE.INIT]);
  const [feedback, setFeedback]       = useState(null); // { type, msg }
  const [dragSrcIdx, setDragSrcIdx]   = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [errorCount, setErrorCount]   = useState(0);
  const [swapCount, setSwapCount]     = useState(0);
  const [showModal, setShowModal]     = useState(false);
  const [finalTime, setFinalTime]     = useState(0);

  const timerRef = useRef(null);
  const doneRef  = useRef(false);

  // ── Completion check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (doneRef.current || swapCount === 0) return;
    if (isSorted(values)) {
      doneRef.current = true;
      setActiveLines([LINE.FOR, LINE.INIT, LINE.WHILE, LINE.IF, LINE.SWAP, LINE.NEXT]);
      setFeedback({ type: 'success', msg: '🎉 Sorted! Bubble sort complete!' });
      timerRef.current?.stop();
      setTimeout(() => {
        setFinalTime(timerRef.current?.getElapsed() ?? 0);
        setShowModal(true);
      }, 800);
    }
  }, [values, swapCount]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, idx) => {
    setDragSrcIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDragLeave = useCallback(() => setDragOverIdx(null), []);

  const handleDrop = useCallback((e, destIdx) => {
    e.preventDefault();
    setDragOverIdx(null);
    const src = dragSrcIdx;
    setDragSrcIdx(null);
    if (src === null || src === destIdx) return;

    // Rule 1: must be adjacent nodes
    if (Math.abs(src - destIdx) !== 1) {
      setActiveLines([]);
      setFeedback({ type: 'error', msg: '❌ Only adjacent nodes can be swapped in bubble sort!' });
      setErrorCount(c => c + 1);
      return;
    }

    const left  = Math.min(src, destIdx);
    const right = left + 1;

    if (values[left] > values[right]) {
      // Valid swap — left value is greater, so a swap is needed
      const next = [...values];
      [next[left], next[right]] = [next[right], next[left]];
      setValues(next);
      setSwapCount(c => c + 1);
      setActiveLines([LINE.WHILE, LINE.IF, LINE.SWAP]);
      setFeedback({
        type: 'success',
        msg: `✓ Swapped ${values[left]} and ${values[right]} — ${values[left]} > ${values[right]}, correct!`,
      });
    } else {
      // No swap needed — values already in order
      setActiveLines([LINE.WHILE, LINE.IF, LINE.NEXT]);
      setFeedback({
        type: 'info',
        msg: `💡 ${values[left]} ≤ ${values[right]} — no swap needed here. Move to the next pair!`,
      });
      setErrorCount(c => c + 1);
    }
  }, [dragSrcIdx, values]);

  const handleDragEnd = useCallback(() => {
    setDragSrcIdx(null);
    setDragOverIdx(null);
  }, []);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    const fresh = genValues();
    setValues(fresh);
    setActiveLines([LINE.FOR, LINE.INIT]);
    setFeedback(null);
    setDragSrcIdx(null);
    setDragOverIdx(null);
    setErrorCount(0);
    setSwapCount(0);
    setShowModal(false);
    doneRef.current = false;
    timerRef.current?.reset();
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const settled = getSettledCount(values);
  const done    = doneRef.current;
  const sortedGoal = [...values].sort((a, b) => a - b);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-1">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">Sort Linked List</h1>
        </div>
        <p className="text-slate-300 mb-6 ml-14">
          Drag adjacent nodes to swap them. Sort the list in ascending order using Bubble Sort!
        </p>

        {/* Controls bar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded font-semibold bg-red-800 text-red-100">
            Level 3 · Hard
          </span>
          <span className="text-xs px-2 py-0.5 rounded font-semibold bg-slate-700 text-slate-300">
            Bubble Sort Mode
          </span>
          <div className="ml-auto flex items-center gap-2">
            <GameTimer ref={timerRef} isRunning={!showModal && !done} />
            <ErrorCounter count={errorCount} />
          </div>
        </div>

        {/* Feedback bar */}
        {feedback && (
          <div className={`mb-5 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
            feedback.type === 'success' ? 'bg-green-900/40 border-green-700 text-green-200' :
            feedback.type === 'error'   ? 'bg-red-900/40 border-red-700 text-red-200' :
                                          'bg-blue-900/40 border-blue-700 text-blue-200'
          }`}>
            {feedback.msg}
          </div>
        )}

        {/* Main layout: list panel (left) + code panel (right) */}
        <div className="grid grid-cols-[1fr_300px] gap-6">

          {/* ── LEFT: Interactive linked list ──────────────────────────────── */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">

            <div className="flex items-center justify-between mb-1">
              <h2 className="text-white font-bold text-lg">Linked List</h2>
              {settled > 0 && !done && (
                <span className="text-emerald-400 text-xs font-semibold">
                  {settled} node{settled > 1 ? 's' : ''} settled ✓
                </span>
              )}
            </div>
            <p className="text-slate-400 text-sm mb-7">
              Drag a node onto an adjacent node to attempt a swap.
            </p>

            {/* Draggable node row */}
            <div className="flex items-center gap-1 flex-wrap mb-8 min-h-20">
              {values.map((val, idx) => {
                const isSettled  = idx >= values.length - settled;
                const isDragging = dragSrcIdx === idx;
                const isAdjacent = dragSrcIdx !== null && Math.abs(dragSrcIdx - idx) === 1;
                const isTarget   = dragOverIdx === idx && isAdjacent;

                let circleClass;
                if (done) {
                  circleClass = 'bg-emerald-600 border-emerald-400 cursor-default';
                } else if (isDragging) {
                  circleClass = 'bg-indigo-600 border-indigo-300 opacity-50 scale-90 cursor-grabbing';
                } else if (isTarget) {
                  circleClass = 'bg-yellow-600 border-yellow-300 scale-115 shadow-lg shadow-yellow-900';
                } else if (isSettled) {
                  circleClass = 'bg-emerald-700 border-emerald-500 cursor-grab hover:scale-105';
                } else {
                  circleClass = 'bg-slate-600 border-slate-400 cursor-grab hover:bg-slate-500 hover:border-slate-300 hover:scale-105';
                }

                return (
                  <React.Fragment key={idx}>
                    <div className="flex flex-col items-center gap-1">
                      <div
                        draggable={!done}
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e)  => handleDragOver(e, idx)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e)      => handleDrop(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`w-14 h-14 rounded-full border-2 flex items-center justify-center
                          font-bold text-white text-lg select-none transition-all duration-200 ${circleClass}`}
                      >
                        {val}
                      </div>
                      <span className="text-slate-500 text-xs">{idx}</span>
                    </div>
                    {idx < values.length - 1 && (
                      <span className="text-slate-500 text-xl mb-5 select-none">→</span>
                    )}
                  </React.Fragment>
                );
              })}
              <span className="text-slate-500 text-sm mb-5 ml-1 select-none">→ NULL</span>
            </div>

            {/* Goal: sorted order */}
            <div className="bg-slate-700/60 rounded-lg p-4 border border-slate-600">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-3 font-semibold">
                Goal
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                {sortedGoal.map((val, idx) => (
                  <React.Fragment key={idx}>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-11 h-11 rounded-full border-2 bg-yellow-700 border-yellow-500
                        flex items-center justify-center font-bold text-white text-sm">
                        {val}
                      </div>
                    </div>
                    {idx < sortedGoal.length - 1 && (
                      <span className="text-slate-500 text-base select-none">→</span>
                    )}
                  </React.Fragment>
                ))}
                <span className="text-slate-500 text-sm ml-1 select-none">→ NULL</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Pseudocode panel ─────────────────────────────────────── */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col">

            <h2 className="text-white font-bold text-lg mb-1">Pseudocode</h2>
            <p className="text-slate-400 text-xs mb-4">
              Lines highlight as you perform each step
            </p>

            {/* Code block */}
            <div className="font-mono text-sm space-y-1 flex-1">
              {CODE_LINES.map((line, i) => (
                <div
                  key={i}
                  style={{ paddingLeft: `${line.indent * 14}px` }}
                  className={`px-2 py-1.5 rounded-md transition-all duration-300 leading-snug ${
                    activeLines.includes(i)
                      ? 'bg-emerald-800/70 text-emerald-200 border-l-2 border-emerald-400 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {line.text}
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="bg-slate-700/60 rounded-lg p-3 border border-slate-600 text-center">
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Swaps</p>
                <p className="text-white text-2xl font-bold">{swapCount}</p>
              </div>
              <div className="bg-slate-700/60 rounded-lg p-3 border border-slate-600 text-center">
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Settled</p>
                <p className="text-emerald-400 text-2xl font-bold">{settled}</p>
              </div>
            </div>

            {/* New list button */}
            <button
              onClick={handleReset}
              className="mt-3 w-full py-2 rounded-lg text-slate-300 bg-slate-700
                hover:bg-slate-600 text-sm font-semibold transition-all"
            >
              ↺ New List
            </button>

            {/* Hint */}
            <div className="mt-3 bg-slate-700/40 rounded-lg p-3 border border-slate-600/50 text-xs text-slate-400">
              <span className="text-yellow-400 font-semibold">💡 Tip:</span>{' '}
              Find a pair where the <span className="text-white font-semibold">left value is greater</span> than
              the right value, then drag to swap.
            </div>
          </div>
        </div>
      </div>

      <LevelCompleteModal
        isOpen={showModal}
        levelId={3}
        totalLevels={3}
        timeSeconds={finalTime}
        errorCount={errorCount}
        onNext={onBack}
        onNewQuestion={() => { setShowModal(false); handleReset(); }}
        accentColor="from-red-500 to-orange-500"
      />
    </div>
  );
}

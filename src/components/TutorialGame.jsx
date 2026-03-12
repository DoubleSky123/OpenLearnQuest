import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Lightbulb, ChevronRight } from 'lucide-react';
import { LinkedListVisualiser } from './GoalPattern';
import { shuffleArray } from '../utils/helpers';
import TutorialWelcomeModal from './TutorialWelcomeModal';
import TutorialCompleteModal from './TutorialCompleteModal';

// ─────────────────────────────────────────────────────────────────────────────
// TUTORIAL QUESTION DEFINITIONS  (fixed values, no randomness)
// ─────────────────────────────────────────────────────────────────────────────

const TUTORIAL_QUESTIONS = [
  {
    id: 'tut-insert-head',
    title: 'Insert at Head',
    description: 'Insert the value 0 at the beginning of the list [1 → 2 → 3].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: null },
    ],
    goalPattern: [0, 1, 2, 3],
    pseudocode: [
      'create newNode',
      'newNode.next = head',
      'head = newNode',
    ],
    correctOrder: [0, 1, 2],
    // Per-step hints shown BEFORE the player places each block
    stepHints: [
      'Step 1 of 3 — Before you can insert anything, you need to create a new node to hold the value 0.',
      'Step 2 of 3 — The new node must link to the current head so the existing list is not lost.',
      'Step 3 of 3 — Now move the head pointer to the new node, making it the first node in the list.',
    ],
  },
  {
    id: 'tut-remove-head',
    title: 'Remove at Head',
    description: 'Remove the first node from the list [1 → 2 → 3].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: null },
    ],
    goalPattern: [2, 3],
    pseudocode: [
      'temp = head',
      'head = head.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2],
    stepHints: [
      'Step 1 of 3 — Save the current head in a temporary variable before you move anything, so you can free it later.',
      'Step 2 of 3 — Advance the head pointer to the second node, effectively skipping the first one.',
      'Step 3 of 3 — Release the memory of the old head node using the temporary reference you saved.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getValues = (nodes) => {
  // Traverse nodes in linked-list order and return values
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(Boolean));
  let cur = [...allIds].find(id => !pointedIds.has(id)) ?? nodes[0]?.id ?? null;
  const result = [];
  while (cur !== null) {
    const node = nodes.find(n => n.id === cur);
    if (!node) break;
    result.push(node.value);
    cur = node.next;
  }
  return result;
};

const applyInsertAtHead = (nodes, value) => {
  const newId = Math.max(...nodes.map(n => n.id), 0) + 1;
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(Boolean));
  const headId = [...allIds].find(id => !pointedIds.has(id)) ?? null;
  return [{ id: newId, value, next: headId }, ...nodes];
};

const applyRemoveAtHead = (nodes) => {
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(Boolean));
  const headId = [...allIds].find(id => !pointedIds.has(id)) ?? null;
  return nodes.filter(n => n.id !== headId);
};

// ─────────────────────────────────────────────────────────────────────────────
// ERROR FEEDBACK MODAL  (wrong block placed)
// ─────────────────────────────────────────────────────────────────────────────

function ErrorFeedbackModal({ isOpen, wrongBlock, expectedBlock, stepHint, onDismiss }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-slate-800 border border-red-500/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-rose-500" />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">❌</span>
            <h3 className="text-lg font-bold text-white">Not quite!</h3>
          </div>

          <div className="bg-slate-700 rounded-lg p-3 mb-3 text-sm">
            <p className="text-slate-400 text-xs mb-1">You placed:</p>
            <p className="font-mono text-red-300 font-semibold">"{wrongBlock}"</p>
          </div>

          <div className="bg-slate-700 rounded-lg p-3 mb-5 text-sm">
            <p className="text-slate-400 text-xs mb-1">Hint for this step:</p>
            <p className="text-emerald-300 text-sm">{stepHint}</p>
          </div>

          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-red-500 to-rose-500 hover:opacity-90 active:scale-95 transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TUTORIAL GAME
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorialGame({ onBack, onGoRegular }) {
  const [showWelcome, setShowWelcome]   = useState(true);
  const [showComplete, setShowComplete] = useState(false);

  // Which of the two tutorial questions we're on (0 or 1)
  const [qIndex, setQIndex] = useState(0);

  // Current question derived from qIndex
  const q = TUTORIAL_QUESTIONS[qIndex];

  // How many blocks has the player correctly placed so far
  const [placedCount, setPlacedCount] = useState(0);

  // The shuffled pool items (each is an index into q.pseudocode)
  const [codePool, setCodePool] = useState([]);

  // Assembled blocks (correctly placed, in order)
  const [assemblyArea, setAssemblyArea] = useState([]);

  // Node state (updates after all blocks placed)
  const [nodes, setNodes] = useState([]);
  const [executed, setExecuted] = useState(false);
  const [success, setSuccess] = useState(false);

  // Error modal
  const [errorModal, setErrorModal] = useState({ open: false, wrongBlock: '', stepHint: '' });

  // Drag state
  const [draggedIdx, setDraggedIdx] = useState(null);

  // Ref to track if we already animated to next question
  const advancingRef = useRef(false);

  // ── Init question ──────────────────────────────────────────────────────────
  const initQuestion = useCallback((index) => {
    const question = TUTORIAL_QUESTIONS[index];
    setNodes(JSON.parse(JSON.stringify(question.initialNodes)));
    setCodePool(shuffleArray(question.pseudocode.map((_, i) => i)));
    setAssemblyArea([]);
    setPlacedCount(0);
    setExecuted(false);
    setSuccess(false);
    advancingRef.current = false;
  }, []);

  useEffect(() => { initQuestion(qIndex); }, [qIndex, initQuestion]);

  // ── Current step hint ──────────────────────────────────────────────────────
  // Show the hint for the NEXT block the player needs to place
  const currentStepHint = placedCount < q.stepHints.length
    ? q.stepHints[placedCount]
    : null;

  // ── Handle a block being dropped from pool ─────────────────────────────────
  const handleBlockClick = (poolIdx) => {
    if (executed) return;
    const blockIndex = codePool[poolIdx]; // index into q.pseudocode
    const expected   = q.correctOrder[placedCount];

    if (blockIndex === expected) {
      // ✅ Correct
      setAssemblyArea(prev => [...prev, blockIndex]);
      setCodePool(prev => prev.filter((_, i) => i !== poolIdx));
      setPlacedCount(prev => prev + 1);
    } else {
      // ❌ Wrong — show error modal, block stays in pool
      setErrorModal({
        open: true,
        wrongBlock: q.pseudocode[blockIndex],
        stepHint: q.stepHints[placedCount],
      });
    }
  };

  // ── Drag handlers (pool → assembly, same logic as click) ──────────────────
  const handleDragStart = (e, poolIdx) => {
    setDraggedIdx(poolIdx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnAssembly = (e) => {
    e.preventDefault();
    if (draggedIdx === null) return;
    handleBlockClick(draggedIdx);
    setDraggedIdx(null);
  };

  const handleDragOver = (e) => e.preventDefault();

  // ── Check completion after each correct placement ──────────────────────────
  useEffect(() => {
    if (placedCount < q.correctOrder.length || executed || advancingRef.current) return;
    advancingRef.current = true;
    setExecuted(true);

    // Apply the operation to nodes
    setTimeout(() => {
      let newNodes;
      if (q.id === 'tut-insert-head') {
        newNodes = applyInsertAtHead(nodes, 0);
      } else {
        newNodes = applyRemoveAtHead(nodes);
      }
      setNodes(newNodes);
      setSuccess(true);

      // After showing success state, advance after a pause
      setTimeout(() => {
        if (qIndex < TUTORIAL_QUESTIONS.length - 1) {
          setQIndex(prev => prev + 1);
        } else {
          setShowComplete(true);
        }
      }, 1800);
    }, 600);
  }, [placedCount]); // eslint-disable-line

  // ── Current list values for visualiser ────────────────────────────────────
  const currentValues = getValues(nodes);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-1">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-white">Tutorial Mode</h1>
          {/* Progress pills */}
          <div className="flex gap-2 ml-auto">
            {TUTORIAL_QUESTIONS.map((tq, i) => (
              <span
                key={tq.id}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${
                  i < qIndex
                    ? 'bg-emerald-700 text-emerald-100'
                    : i === qIndex
                    ? 'bg-emerald-500 text-white shadow shadow-emerald-700'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i < qIndex ? '✓ ' : ''}{tq.title}
              </span>
            ))}
          </div>
        </div>
        <p className="text-slate-400 text-sm mb-8 ml-14">
          Follow the hints and place each code block in the correct order.
        </p>

        {/* Step hint bar */}
        {currentStepHint && !executed && (
          <div className="flex items-start gap-3 bg-emerald-900/50 border border-emerald-600/50 rounded-xl px-5 py-4 mb-6 shadow">
            <Lightbulb size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-emerald-200 text-sm font-medium">{currentStepHint}</p>
          </div>
        )}

        {/* Success bar */}
        {success && (
          <div className="flex items-center gap-3 bg-emerald-800/60 border border-emerald-500/50 rounded-xl px-5 py-4 mb-6 shadow">
            <span className="text-xl">🎉</span>
            <p className="text-emerald-200 text-sm font-bold">
              {qIndex < TUTORIAL_QUESTIONS.length - 1
                ? 'Great job! Loading next exercise…'
                : 'Excellent! Tutorial complete!'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8">

          {/* LEFT: Question info + current list */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">{q.title}</h2>
              <span className="text-xs px-2 py-0.5 rounded font-semibold bg-emerald-700 text-emerald-100">
                Tutorial
              </span>
            </div>
            <p className="text-slate-300 text-sm mb-4">{q.description}</p>

            {/* Current linked list */}
            <div className="bg-slate-700 rounded-lg p-4 mb-4">
              <p className="text-slate-400 text-xs mb-2 uppercase tracking-wide">Current List</p>
              <LinkedListVisualiser
                values={currentValues}
                emptyLabel="Empty list"
                highlight={success}
                goalValues={success ? currentValues : []}
              />
            </div>

            {/* Goal */}
            <div className="bg-slate-700 rounded-lg p-4">
              <p className="text-slate-400 text-xs mb-2 uppercase tracking-wide">Goal</p>
              <LinkedListVisualiser
                values={q.goalPattern}
                nodeColor="bg-yellow-600 border-yellow-400"
              />
            </div>
          </div>

          {/* RIGHT: Code pool + assembly area */}
          <div className="flex flex-col gap-6">

            {/* Code Pool */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <p className="text-slate-300 font-semibold text-sm mb-3 uppercase tracking-wide">
                Code Pool
              </p>
              {codePool.length === 0 ? (
                <p className="text-slate-500 text-sm italic">All blocks placed!</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {codePool.map((blockIndex, poolIdx) => (
                    <div
                      key={`${blockIndex}-${poolIdx}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, poolIdx)}
                      onClick={() => handleBlockClick(poolIdx)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 border border-slate-500 rounded-lg cursor-grab active:cursor-grabbing hover:bg-slate-600 hover:border-slate-400 transition-all group select-none"
                    >
                      <span className="text-slate-500 group-hover:text-slate-300 transition-colors text-sm">⠿</span>
                      <span className="font-mono text-sm text-white">{q.pseudocode[blockIndex]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assembly Area */}
            <div
              className="bg-slate-800 rounded-xl p-5 border-2 border-dashed border-slate-600 min-h-36 transition-colors"
              onDrop={handleDropOnAssembly}
              onDragOver={handleDragOver}
            >
              <p className="text-slate-300 font-semibold text-sm mb-3 uppercase tracking-wide">
                Assembly Area
              </p>
              {assemblyArea.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-slate-500 text-sm gap-2">
                  <span className="text-2xl">📥</span>
                  Drag or click a block to place it here
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {assemblyArea.map((blockIndex, pos) => (
                    <div
                      key={`placed-${pos}`}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-800/60 border border-emerald-600 rounded-lg select-none"
                    >
                      <span className="text-emerald-400 text-xs font-bold w-5">{pos + 1}.</span>
                      <span className="font-mono text-sm text-white">{q.pseudocode[blockIndex]}</span>
                      <span className="ml-auto text-emerald-400 text-sm">✓</span>
                    </div>
                  ))}
                  {/* Placeholder for next slot */}
                  {!executed && (
                    <div className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-emerald-700/50 rounded-lg text-emerald-700 text-sm italic">
                      <span className="text-xs font-bold w-5">{assemblyArea.length + 1}.</span>
                      drop next block here…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showWelcome && (
        <TutorialWelcomeModal
          onStart={() => setShowWelcome(false)}
          onClose={() => setShowWelcome(false)}
        />
      )}

      <ErrorFeedbackModal
        isOpen={errorModal.open}
        wrongBlock={errorModal.wrongBlock}
        stepHint={errorModal.stepHint}
        onDismiss={() => setErrorModal({ open: false, wrongBlock: '', stepHint: '' })}
      />

      <TutorialCompleteModal
        isOpen={showComplete}
        onRegular={onGoRegular}
        onReplay={() => { setShowComplete(false); setQIndex(0); }}
        onBack={onBack}
      />
    </div>
  );
}

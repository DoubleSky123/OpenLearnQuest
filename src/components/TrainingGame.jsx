import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, RotateCcw, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { LinkedListVisualiser } from './GoalPattern';
import { shuffleArray } from '../utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING QUESTION DEFINITIONS  (fixed values, no randomness, no distractors)
// ─────────────────────────────────────────────────────────────────────────────

const TRAINING_QUESTIONS = [
  // ── Level 1: insertAtTail ─────────────────────────────────────────────────
  {
    id: 'train-insert-tail',
    level: 1,
    title: 'Insert at Tail',
    description: 'Insert the value 4 at the end of the list [1 → 2 → 3].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: null },
    ],
    goalPattern: [1, 2, 3, 4],
    pseudocode: [
      'while (node.next != NULL): node = node.next',
      'create newNode',
      'node.next = newNode',
      'newNode.next = NULL',
    ],
    correctOrder: [0, 1, 2, 3],
    stepHints: [
      'Step 1 of 4 — Traverse to the end of the list by moving node forward until node.next is NULL.',
      'Step 2 of 4 — Create a new node to hold the value you want to append.',
      'Step 3 of 4 — Link the current last node to the new node (node.next = newNode).',
      'Step 4 of 4 — Terminate the list — the new tail must point to NULL.',
    ],
  },

  // ── Level 1: removeAtTail ─────────────────────────────────────────────────
  {
    id: 'train-remove-tail',
    level: 1,
    title: 'Remove at Tail',
    description: 'Remove the last node from the list [1 → 2 → 3].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: null },
    ],
    goalPattern: [1, 2],
    pseudocode: [
      'while (node.next.next != NULL): node = node.next',
      'temp = node.next',
      'node.next = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3],
    stepHints: [
      'Step 1 of 4 — Traverse to the second-to-last node by stopping when node.next.next is NULL.',
      'Step 2 of 4 — Save the last node in a temporary variable before disconnecting it.',
      'Step 3 of 4 — Disconnect the last node by setting the second-to-last node\'s next to NULL.',
      'Step 4 of 4 — Free the saved node to release its memory.',
    ],
  },

  // ── Level 2: insertAtPosition ─────────────────────────────────────────────
  {
    id: 'train-insert-position',
    level: 2,
    title: 'Insert at Position',
    description: 'Insert the value 99 at position 3 in the list [1 → 2 → 3 → 4 → 5].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: null },
    ],
    goalPattern: [1, 2, 99, 3, 4, 5],
    pseudocode: [
      'while (i < 2): node = node.next',
      'create newNode',
      'newNode.next = node.next',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3],
    stepHints: [
      'Step 1 of 4 — Traverse to the predecessor node — stop at position 2 (one before the target position 3).',
      'Step 2 of 4 — Create a new node to hold the value to insert.',
      'Step 3 of 4 — Link the new node to the current successor first (newNode.next = node.next). This must come before the next step or you lose the reference.',
      'Step 4 of 4 — Attach the predecessor to the new node (node.next = newNode), completing the insertion.',
    ],
  },

  // ── Level 2: removeAtPosition ─────────────────────────────────────────────
  {
    id: 'train-remove-position',
    level: 2,
    title: 'Remove at Position',
    description: 'Remove the node at position 3 from the list [1 → 2 → 3 → 4 → 5].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: null },
    ],
    goalPattern: [1, 2, 4, 5],
    pseudocode: [
      'while (i < 2): node = node.next',
      'temp = node.next',
      'node.next = temp.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3],
    stepHints: [
      'Step 1 of 4 — Traverse to the predecessor node — stop at position 2 (one before the target position 3).',
      'Step 2 of 4 — Save the target node in a temporary variable (temp = node.next).',
      'Step 3 of 4 — Bypass the target by linking the predecessor directly to the successor (node.next = temp.next).',
      'Step 4 of 4 — Free the saved target node to release its memory.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OPERATION EXECUTOR
// ─────────────────────────────────────────────────────────────────────────────

const executeOperation = (question, nodes) => {
  if (question.id === 'train-insert-tail') {
    const newId    = Math.max(...nodes.map(n => n.id)) + 1;
    const updated  = nodes.map(n => n.next === null ? { ...n, next: newId } : n);
    return [...updated, { id: newId, value: 4, next: null }];
  }
  if (question.id === 'train-remove-tail') {
    const last       = nodes.find(n => n.next === null);
    const secondLast = nodes.find(n => n.next === last?.id);
    return nodes
      .map(n => n.id === secondLast?.id ? { ...n, next: null } : n)
      .filter(n => n.id !== last?.id);
  }
  if (question.id === 'train-insert-position') {
    // Insert 99 after node at position 2 (id=2), before node id=3
    const newId   = Math.max(...nodes.map(n => n.id)) + 1;
    const pred    = nodes.find(n => n.id === 2);
    const updated = nodes.map(n => n.id === 2 ? { ...n, next: newId } : n);
    return [...updated, { id: newId, value: 99, next: pred.next }];
  }
  if (question.id === 'train-remove-position') {
    // Remove node at position 3 (id=3)
    const target = nodes.find(n => n.id === 3);
    return nodes
      .map(n => n.next === target?.id ? { ...n, next: target.next } : n)
      .filter(n => n.id !== target?.id);
  }
  return nodes;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getValues = (nodes) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// ERROR FEEDBACK MODAL
// ─────────────────────────────────────────────────────────────────────────────

function ErrorFeedbackModal({ isOpen, wrongBlock, stepHint, onDismiss }) {
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
            <p className="text-amber-300 text-sm">{stepHint}</p>
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
// TRAINING COMPLETE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function TrainingCompleteModal({ isOpen, hintCount, onRegular, onReplay, onBack }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 to-orange-500" />
        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-5 shadow-lg">
            <span className="text-4xl">💪</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-2">Training Complete!</h2>
          <p className="text-slate-400 text-sm mb-4">
            You have worked through all four training exercises. Time to go solo!
          </p>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-slate-400">Total assists:</span>
            <span className={`text-sm font-bold ${
              hintCount === 0 ? 'text-emerald-400' : hintCount <= 4 ? 'text-amber-400' : 'text-orange-400'
            }`}>
              {hintCount === 0 ? '0 — no assists, great work! 🏆' : `${hintCount}`}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-xl p-4 mb-7 text-left">
            <p className="text-amber-400 font-semibold text-sm mb-3">What you practised:</p>
            <ul className="space-y-2">
              {[
                '✅ Insert at Tail — append a node to the end of the list',
                '✅ Remove at Tail — safely delete the last node',
                '✅ Insert at Position — splice a node into the middle',
                '✅ Remove at Position — bypass and free a middle node',
              ].map(t => (
                <li key={t} className="text-slate-300 text-sm">{t}</li>
              ))}
            </ul>
          </div>
          <div className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg px-4 py-3 mb-7 text-sm text-blue-200 text-left">
            <span className="font-semibold">Ready for the challenge?</span> Head into{' '}
            <span className="font-semibold">Regular Mode</span> — randomised values, distractor blocks, and a timer!
          </div>
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
              <RotateCcw size={15} /> Replay Training
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TRAINING GAME
// ─────────────────────────────────────────────────────────────────────────────

export default function TrainingGame({ onBack, onGoRegular }) {
  const [showComplete, setShowComplete] = useState(false);
  const [qIndex, setQIndex]             = useState(0);

  const q = TRAINING_QUESTIONS[qIndex];

  const [placedCount, setPlacedCount] = useState(0);
  const [codePool, setCodePool]       = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [nodes, setNodes]             = useState([]);
  const [executed, setExecuted]       = useState(false);
  const [success, setSuccess]         = useState(false);
  const [errorModal, setErrorModal]   = useState({ open: false, wrongBlock: '', stepHint: '' });
  const [draggedIdx, setDraggedIdx]   = useState(null);
  const [showHint, setShowHint]       = useState(false);
  const [assistCount, setAssistCount] = useState(0);

  const advancingRef = useRef(false);

  // ── Init ───────────────────────────────────────────────────────────────────
  const initQuestion = useCallback((index) => {
    const question = TRAINING_QUESTIONS[index];
    setNodes(JSON.parse(JSON.stringify(question.initialNodes)));
    setCodePool(shuffleArray(question.pseudocode.map((_, i) => i)));
    setAssemblyArea([]);
    setPlacedCount(0);
    setExecuted(false);
    setSuccess(false);
    setShowHint(false);
    advancingRef.current = false;
    // Note: assistCount is NOT reset between questions — it accumulates across all 4 exercises
  }, []);

  useEffect(() => { initQuestion(qIndex); }, [qIndex, initQuestion]);

  // ── Current step hint ──────────────────────────────────────────────────────
  const currentStepHint = placedCount < q.stepHints.length
    ? q.stepHints[placedCount]
    : null;

  // ── Block placement ────────────────────────────────────────────────────────
  const handleBlockClick = (poolIdx) => {
    if (executed) return;
    const blockIndex = codePool[poolIdx];
    const expected   = q.correctOrder[placedCount];

    if (blockIndex === expected) {
      setAssemblyArea(prev => [...prev, blockIndex]);
      setCodePool(prev => prev.filter((_, i) => i !== poolIdx));
      setPlacedCount(prev => prev + 1);
    } else {
      setAssistCount(prev => prev + 1);
      setErrorModal({
        open: true,
        wrongBlock: q.pseudocode[blockIndex],
        stepHint: q.stepHints[placedCount],
      });
    }
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────
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

  // ── Completion check ───────────────────────────────────────────────────────
  useEffect(() => {
    if (placedCount < q.correctOrder.length || executed || advancingRef.current) return;
    advancingRef.current = true;
    setExecuted(true);

    setTimeout(() => {
      const newNodes = executeOperation(q, nodes);
      setNodes(newNodes);
      setSuccess(true);

      setTimeout(() => {
        if (qIndex < TRAINING_QUESTIONS.length - 1) {
          setQIndex(prev => prev + 1);
        } else {
          setShowComplete(true);
        }
      }, 1800);
    }, 600);
  }, [placedCount]); // eslint-disable-line

  // ── Reset current question ─────────────────────────────────────────────────
  const handleReset = () => initQuestion(qIndex);

  const currentValues = getValues(nodes);
  const levelLabel    = q.level === 1 ? 'Level 1' : 'Level 2';
  const levelColor    = q.level === 1 ? 'bg-green-700 text-green-100' : 'bg-yellow-700 text-yellow-100';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-1">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-white">Training Mode</h1>
          {/* Progress pills */}
          <div className="flex gap-2 ml-auto flex-wrap justify-end">
            {TRAINING_QUESTIONS.map((tq, i) => (
              <span
                key={tq.id}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${
                  i < qIndex
                    ? 'bg-amber-700 text-amber-100'
                    : i === qIndex
                    ? 'bg-amber-500 text-white shadow shadow-amber-700'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i < qIndex ? '✓ ' : ''}{tq.title}
              </span>
            ))}
          </div>
        </div>
        <p className="text-slate-400 text-sm mb-8 ml-14">
          Follow the step-by-step hints. Place each block in the correct order to execute the operation.
        </p>

        {/* Show Hint button + hint bar */}
        {currentStepHint && !executed && (
          <div className="mb-6">
            <button
              onClick={() => {
                if (!showHint) setAssistCount(prev => prev + 1);
                setShowHint(prev => !prev);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-all text-sm font-semibold"
            >
              {showHint ? <EyeOff size={15} /> : <Eye size={15} />}
              {showHint ? 'Hide Hint' : 'Show Hint'}
              {assistCount > 0 && (
                <span className="ml-1 text-xs text-amber-600">({assistCount} assists)</span>
              )}
            </button>
            {showHint && (
              <div className="flex items-start gap-3 bg-amber-900/40 border border-amber-600/50 rounded-xl px-5 py-4 mt-2 shadow">
                <Lightbulb size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-200 text-sm font-medium">{currentStepHint}</p>
              </div>
            )}
          </div>
        )}

        {/* Success bar */}
        {success && (
          <div className="flex items-center gap-3 bg-emerald-800/60 border border-emerald-500/50 rounded-xl px-5 py-4 mb-6 shadow">
            <span className="text-xl">🎉</span>
            <p className="text-emerald-200 text-sm font-bold">
              {qIndex < TRAINING_QUESTIONS.length - 1
                ? 'Well done! Loading next exercise…'
                : 'Excellent! Training complete!'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8">

          {/* LEFT: Question info + current list */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">{q.title}</h2>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${levelColor}`}>
                {levelLabel}
              </span>
            </div>
            <p className="text-slate-300 text-sm mb-4">{q.description}</p>

            {/* Current list */}
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-300 font-semibold text-sm uppercase tracking-wide">
                  Assembly Area
                </p>
                {!executed && assemblyArea.length > 0 && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
              </div>

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
                      className="flex items-center gap-2 px-4 py-2.5 bg-amber-800/50 border border-amber-600 rounded-lg select-none"
                    >
                      <span className="text-amber-400 text-xs font-bold w-5">{pos + 1}.</span>
                      <span className="font-mono text-sm text-white">{q.pseudocode[blockIndex]}</span>
                      <span className="ml-auto text-amber-400 text-sm">✓</span>
                    </div>
                  ))}
                  {!executed && (
                    <div className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-amber-700/40 rounded-lg text-amber-700/70 text-sm italic">
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
      <ErrorFeedbackModal
        isOpen={errorModal.open}
        wrongBlock={errorModal.wrongBlock}
        stepHint={errorModal.stepHint}
        onDismiss={() => setErrorModal({ open: false, wrongBlock: '', stepHint: '' })}
      />

      <TrainingCompleteModal
        isOpen={showComplete}
        hintCount={assistCount}
        onRegular={onGoRegular}
        onReplay={() => { setShowComplete(false); setQIndex(0); setAssistCount(0); }}
        onBack={onBack}
      />
    </div>
  );
}

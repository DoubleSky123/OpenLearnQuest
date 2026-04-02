import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, RotateCcw, ChevronRight, Eye, EyeOff } from 'lucide-react';
import HelpModal from './HelpModal';
import { LinkedListVisualiser } from './GoalPattern';
import { shuffleArray } from '../utils/helpers';
import GameTimer from './GameTimer';
import PetCanvas, { getStage } from './PetCanvas';

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING QUESTION DEFINITIONS  (fixed values, no randomness, no distractors)
// ─────────────────────────────────────────────────────────────────────────────

const TRAINING_QUESTIONS = [
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
    const newId   = Math.max(...nodes.map(n => n.id)) + 1;
    const updated = nodes.map(n => n.next === null ? { ...n, next: newId } : n);
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
    const newId   = Math.max(...nodes.map(n => n.id)) + 1;
    const pred    = nodes.find(n => n.id === 2);
    const updated = nodes.map(n => n.id === 2 ? { ...n, next: newId } : n);
    return [...updated, { id: newId, value: 99, next: pred.next }];
  }
  if (question.id === 'train-remove-position') {
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
// TOP BAR
// ─────────────────────────────────────────────────────────────────────────────

const XP_PER_LEVEL_T = 500;
const LEVEL_NAMES_T  = ['Novice','Explorer','Learner','Practitioner','Skilled','Advanced','Expert','Master'];

function TopBar({ onBack, timerRef, assistCount, xp }) {
  const level     = Math.floor(xp / XP_PER_LEVEL_T) + 1;
  const levelName = LEVEL_NAMES_T[Math.min(level - 1, LEVEL_NAMES_T.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL_T;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL_T) * 100);
  const [showHelp, setShowHelp] = React.useState(false);
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center">

        {/* Left */}
        <div className="flex-1 flex items-center gap-2">
          <button onClick={onBack} className="border border-gray-300 rounded-lg px-4 py-1.5 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors">
            ← Back
          </button>
          <button onClick={() => setShowHelp(true)} className="w-8 h-8 rounded-full border border-gray-300 text-gray-500 font-bold text-base hover:bg-gray-50 transition-colors flex items-center justify-center" title="Game Guide">
            ?
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <span className="text-amber-600 text-2xl font-bold">Training · Practice</span>
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
              <span>XP</span><span>{xpInLevel}/{XP_PER_LEVEL_T}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
          <GameTimer ref={timerRef} isRunning={true} />
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEST NAV
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_DIFFICULTY = { 1: 'Beginner', 2: 'Intermediate' };

function QuestNav({ questions, currentIndex, completedSet }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="border-b border-gray-100 px-4 py-2.5">
        <p className="text-lg font-semibold text-gray-500 uppercase tracking-wide">Exercises</p>
      </div>
      <div className="p-2 flex flex-col gap-1">
        {questions.map((q, i) => {
          const isDone   = completedSet.has(i);
          const isActive = i === currentIndex;
          return (
            <div
              key={q.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                isActive ? 'bg-amber-50 border-amber-200' :
                isDone   ? 'bg-emerald-50 border-emerald-100' :
                           'bg-transparent border-transparent'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                isDone   ? 'bg-emerald-100 border border-emerald-300' :
                isActive ? 'bg-amber-100 border border-amber-300' :
                           'bg-gray-100 border border-gray-200'
              }`}>
                <div className={`w-2 h-2 rounded-sm ${
                  isDone ? 'bg-emerald-500' : isActive ? 'bg-amber-500' : 'bg-gray-300'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-medium truncate ${
                  isActive ? 'text-amber-800' : isDone ? 'text-emerald-700' : 'text-gray-400'
                }`}>{q.title}</p>
                <p className="text-lg text-gray-400 mt-0.5">
                  {isDone ? 'Completed' : isActive ? 'In progress' : LEVEL_DIFFICULTY[q.level]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PET CARD
// ─────────────────────────────────────────────────────────────────────────────

function PetCard({ mood = 'idle', xp = 0 }) {
  const stage     = getStage(xp);
  const level     = Math.floor(xp / XP_PER_LEVEL_T) + 1;
  const xpInLevel = xp % XP_PER_LEVEL_T;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL_T) * 100);
  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-amber-200 overflow-hidden">
      <div className="bg-[#c8dfa8] mx-3 mt-3 rounded-lg flex items-center justify-center py-16">
        <PetCanvas stage={stage} mood={mood} />
      </div>
      <div className="px-4 py-4 flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-gray-700">Algo</p>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-violet-400 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
        </div>
        <p className="text-xs text-gray-400">Level {level} · {xpInLevel}/{XP_PER_LEVEL_T} XP</p>
      </div>
    </div>
  );
}

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
  const [showStars, setShowStars] = React.useState(false);
  React.useEffect(() => {
    if (isOpen) { const t = setTimeout(() => setShowStars(true), 200); return () => clearTimeout(t); }
    else setShowStars(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
        <div className="px-8 py-10 flex flex-col items-center text-center">

          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-xl">
            <span className="text-6xl">💪</span>
          </div>

          <h2 className="text-4xl font-black text-gray-900 mb-1">Training Complete!</h2>
          <p className="text-gray-400 text-xl mb-8">You're ready to go solo 🔥</p>

          {/* Stars */}
          <div className="flex items-center justify-center gap-3 mb-8">
            {[0, 1, 2].map(i => (
              <span key={i} className="text-5xl transition-all duration-500"
                style={{ opacity: showStars ? 1 : 0, transform: showStars ? 'scale(1) rotate(0deg)' : 'scale(0.3) rotate(-30deg)', transitionDelay: `${i * 150}ms` }}>
                ⭐
              </span>
            ))}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {['Insert Tail','Remove Tail','Insert Pos','Remove Pos'].map(label => (
              <div key={label} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-base font-semibold px-3 py-1.5 rounded-full">
                ✅ {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button onClick={onRegular}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90 active:scale-95 transition-all shadow-lg">
              Challenge Mode <ChevronRight size={22} />
            </button>
            <button onClick={onReplay}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-lg border border-gray-200">
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TRAINING GAME
// ─────────────────────────────────────────────────────────────────────────────

export default function TrainingGame({ onBack, onGoRegular, startAt = 0, xp = 0 }) {
  const [showComplete, setShowComplete] = useState(false);
  const [qIndex, setQIndex]             = useState(startAt);
  const [completedSet, setCompletedSet] = useState(new Set());

  const q = TRAINING_QUESTIONS[qIndex];

  const [placedCount, setPlacedCount]   = useState(0);
  const [codePool, setCodePool]         = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [nodes, setNodes]               = useState([]);
  const [executed, setExecuted]         = useState(false);
  const [success, setSuccess]           = useState(false);
  const [errorModal, setErrorModal]     = useState({ open: false, wrongBlock: '', stepHint: '' });
  const [draggedIdx, setDraggedIdx]     = useState(null);
  const [showHint, setShowHint]         = useState(false);
  const [assistCount, setAssistCount]   = useState(0);

  const timerRef     = useRef(null);
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
  }, []);

  useEffect(() => { initQuestion(qIndex); }, [qIndex, initQuestion]);

  const currentStepHint = placedCount < q.stepHints.length ? q.stepHints[placedCount] : null;

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
  const handleDragStart  = (e, poolIdx) => { setDraggedIdx(poolIdx); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver   = (e) => e.preventDefault();
  const handleDropOnArea = (e) => { e.preventDefault(); if (draggedIdx !== null) { handleBlockClick(draggedIdx); setDraggedIdx(null); } };

  // ── Completion ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (placedCount < q.correctOrder.length || executed || advancingRef.current) return;
    advancingRef.current = true;
    setExecuted(true);

    setTimeout(() => {
      const newNodes = executeOperation(q, nodes);
      setNodes(newNodes);
      setSuccess(true);
      setCompletedSet(prev => new Set([...prev, qIndex]));

      setTimeout(() => {
        if (qIndex < TRAINING_QUESTIONS.length - 1) {
          setQIndex(prev => prev + 1);
        } else {
          timerRef.current?.stop();
          setShowComplete(true);
        }
      }, 1800);
    }, 600);
  }, [placedCount]); // eslint-disable-line

  const handleReset   = () => initQuestion(qIndex);
  const currentValues = getValues(nodes);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar onBack={onBack} timerRef={timerRef} assistCount={assistCount} xp={xp} />

      <div className="max-w-7xl mx-auto p-5">

        {/* Success banner */}
        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg">🎉</span>
            <p className="text-emerald-700 font-semibold text-xl">
              {qIndex < TRAINING_QUESTIONS.length - 1
                ? 'Well done! Loading next exercise…'
                : 'Excellent! Training complete!'}
            </p>
          </div>
        )}

        {/* 3-column layout */}
        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

          {/* ── Col 1: Nav + Quest info ── */}
          <div className="flex flex-col gap-4">

            <QuestNav
              questions={TRAINING_QUESTIONS}
              currentIndex={qIndex}
              completedSet={completedSet}
            />

            {/* Quest info card */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl font-semibold text-gray-900">{q.title}</h2>
                <span className={`text-lg px-3 py-1 rounded-full font-medium border ${
                  q.level === 1
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {q.level === 1 ? 'Beginner' : 'Intermediate'}
                </span>
              </div>
              <p className="text-gray-500 text-lg mb-3">{q.description}</p>

              {/* Current state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Current state</p>
                <LinkedListVisualiser
                  values={currentValues}
                  emptyLabel="Empty list"
                  highlight={success}
                  goalValues={success ? currentValues : []}
                />
              </div>

              {/* Goal state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Goal state</p>
                <LinkedListVisualiser
                  values={q.goalPattern}
                  nodeColor="bg-amber-50 border-amber-300 text-amber-800"
                />
              </div>

              {/* Show Hint toggle */}
              {currentStepHint && !executed && (
                <div>
                  <button
                    onClick={() => {
                      if (!showHint) setAssistCount(prev => prev + 1);
                      setShowHint(prev => !prev);
                    }}
                    className="flex items-center gap-2 text-lg font-semibold text-amber-600 hover:text-amber-800 transition-colors mb-2"
                  >
                    {showHint ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showHint ? 'Hide Hint' : 'Show Hint'}
                  </button>
                  {showHint && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
                      <Lightbulb size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-amber-700 text-lg leading-relaxed">{currentStepHint}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 2: Code pool + assembly area ── */}
          <div className="flex flex-col gap-4">

            {/* Code Pool */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-gray-400 text-lg font-semibold mb-3 uppercase tracking-wide">
                Code Pool
              </p>
              {codePool.length === 0 ? (
                <p className="text-gray-400 text-xl italic">All blocks placed!</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {codePool.map((blockIndex, poolIdx) => (
                    <div
                      key={`${blockIndex}-${poolIdx}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, poolIdx)}
                      onClick={() => handleBlockClick(poolIdx)}
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:bg-violet-50 hover:border-violet-200 transition-all group select-none"
                    >
                      <span className="text-gray-300 group-hover:text-violet-400 transition-colors text-xl">⠿</span>
                      <span className="font-mono text-xl text-gray-700">{q.pseudocode[blockIndex]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assembly Area */}
            <div
              className={`bg-white rounded-xl border-2 border-dashed min-h-36 p-4 transition-colors ${
                draggedIdx !== null ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
              }`}
              onDrop={handleDropOnArea}
              onDragOver={handleDragOver}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-lg font-semibold uppercase tracking-wide">
                  Assembly Area
                </p>
                {!executed && assemblyArea.length > 0 && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-lg text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
              </div>

              {assemblyArea.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-gray-300 text-xl gap-2">
                  <span className="text-2xl">📥</span>
                  Drag or click a block to place it here
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {assemblyArea.map((blockIndex, pos) => (
                    <div
                      key={`placed-${pos}`}
                      className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg select-none"
                    >
                      <span className="text-amber-500 text-lg font-bold w-7">{pos + 1}.</span>
                      <span className="font-mono text-xl text-gray-700">{q.pseudocode[blockIndex]}</span>
                      <span className="ml-auto text-amber-500 text-xl">✓</span>
                    </div>
                  ))}
                  {!executed && (
                    <div className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-amber-200 rounded-lg text-amber-400 text-sm italic">
                      <span className="text-lg font-bold w-7">{assemblyArea.length + 1}.</span>
                      drop next block here…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 3: Pet ── */}
          <PetCard mood={success ? 'happy' : errorModal.open ? 'sad' : 'idle'} xp={xp} />

        </div>
      </div>

      {/* ── Modals ── */}
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
        onReplay={() => { setShowComplete(false); setQIndex(0); setAssistCount(0); setCompletedSet(new Set()); }}
        onBack={onBack}
      />
    </div>
  );
}

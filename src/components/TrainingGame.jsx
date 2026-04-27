import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, RotateCcw, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { LinkedListVisualiser } from './GoalPattern';
import { shuffleArray, getCurrentPattern } from '../utils/helpers';
import { addMistake } from '../utils/storage';
import GameTopBar from './shared/GameTopBar';
import GamePetCard from './shared/GamePetCard';

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
    prediction: {
      options: [[4, 1, 2, 3], [1, 2, 3, 4], [1, 2, 4, 3], [1, 2, 3]],
      correct: 1,  // B
    },
    pseudocode: [
      'node = head',
      'while (node.next != NULL): node = node.next',
      'create newNode',
      'node.next = newNode',
      'newNode.next = NULL',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    validOrders: [
      [0, 1, 2, 3, 4],
      [0, 2, 1, 3, 4],
      [2, 0, 1, 3, 4],
    ],
    stepHints: [
      'Set node = head to start the traversal pointer. Creating newNode first is also fine — those two steps are independent.',
      'Traverse to the last node: advance while node.next != NULL. If you already created newNode, do this now.',
      'Create the new node. (Run the while loop first if you have not yet.)',
      'Link the old tail forward: node.next = newNode.',
      'Close the list: newNode.next = NULL marks the new tail.',
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
    prediction: {
      options: [[2, 3], [1, 2, 3], [1, 2], [1, 3]],
      correct: 2,  // C
    },
    pseudocode: [
      'node = head',
      'while (node.next.next != NULL): node = node.next',
      'temp = node.next',
      'node.next = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    stepHints: [
      'Set node = head to initialize the traversal pointer.',
      'Traverse to the second-to-last node: stop when node.next.next is NULL.',
      'Save the last node: temp = node.next (you will free it after unlinking).',
      'Unlink the last node: node.next = NULL.',
      'Release memory: free(temp).',
    ],
  },
  {
    id: 'train-insert-position',
    level: 2,
    title: 'Insert at Position',
    description: 'Insert the value 99 at index 2 in the list [1 → 2 → 3 → 4 → 5].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: null },
    ],
    goalPattern: [1, 2, 99, 3, 4, 5],
    prediction: {
      options: [[1, 2, 99, 3, 4, 5], [99, 1, 2, 3, 4, 5], [1, 99, 2, 3, 4, 5], [1, 2, 3, 99, 4, 5]],
      correct: 0,  // A
    },
    pseudocode: [
      'node = head',
      'i = 0',
      'while (i < 2): node = node.next',
      'create newNode',
      'newNode.next = node.next',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5],
    validOrders: [
      [0, 1, 2, 3, 4, 5],
      [1, 0, 2, 3, 4, 5],
      [0, 1, 3, 2, 4, 5],
      [1, 0, 3, 2, 4, 5],
      [3, 0, 1, 2, 4, 5],
      [3, 1, 0, 2, 4, 5],
    ],
    stepHints: [
      'Set node = head and i = 0 to initialize — these two can go in either order, or create newNode first.',
      'Set i = 0 and node = head — order between these two does not matter.',
      'Traverse to index 1 (the predecessor): advance while i < 2. (Create newNode beforehand is also fine.)',
      'Create the new node. (Run the while loop first if not done yet.)',
      'Save the successor link first: newNode.next = node.next prevents losing the rest of the list.',
      'Attach the predecessor: node.next = newNode completes the insertion.',
    ],
  },
  {
    id: 'train-remove-position',
    level: 2,
    title: 'Remove at Position',
    description: 'Remove the node at index 2 from the list [1 → 2 → 3 → 4 → 5].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: null },
    ],
    goalPattern: [1, 2, 4, 5],
    prediction: {
      options: [[2, 3, 4, 5], [1, 3, 4, 5], [1, 2, 3, 5], [1, 2, 4, 5]],
      correct: 3,  // D
    },
    pseudocode: [
      'node = head',
      'i = 0',
      'while (i < 2): node = node.next',
      'temp = node.next',
      'node.next = temp.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5],
    validOrders: [
      [0, 1, 2, 3, 4, 5],
      [1, 0, 2, 3, 4, 5],
    ],
    stepHints: [
      'Set node = head to initialize the traversal pointer. (i = 0 can come first too.)',
      'Set i = 0. (node = head can come first too — these two are interchangeable.)',
      'Traverse to index 1 (the predecessor): advance while i < 2.',
      'Save the target node: temp = node.next.',
      'Bypass the target: node.next = temp.next links the predecessor to the successor.',
      'Release memory: free(temp).',
    ],
  },
  {
    id: 'train-insert-empty',
    level: 1,
    title: 'Insert into Empty List',
    description: 'Insert the value 99 into an empty linked list.',
    initialNodes: [],
    goalPattern: [99],
    prediction: {
      options: [[], [99], [99, 99], [0]],
      correct: 1,
    },
    pseudocode: [
      'create newNode with value 99',
      'newNode.next = NULL',
      'head = newNode',
    ],
    correctOrder: [0, 1, 2],
    validOrders: [[0, 1, 2], [0, 2, 1]],
    stepHints: [
      'The list is empty — no traversal needed. Start by creating the new node.',
      'Set newNode.next = NULL to mark it as the only node in the list.',
      'Set head = newNode so the list is no longer empty.',
    ],
  },
  {
    id: 'train-remove-only',
    level: 1,
    title: 'Remove Only Node',
    description: 'Remove the only node from the list [42], leaving an empty list.',
    initialNodes: [
      { id: 1, value: 42, next: null },
    ],
    goalPattern: [],
    prediction: {
      options: [[42], [], [0], [1]],
      correct: 1,
    },
    pseudocode: [
      'temp = head',
      'head = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2],
    validOrders: [[0, 1, 2]],
    stepHints: [
      'Save a reference to the current head before changing the pointer.',
      'Set head = NULL — the list is now logically empty.',
      'Free the saved node to release its memory.',
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
  if (question.id === 'train-insert-empty') {
    return [{ id: 1, value: 99, next: null }];
  }
  if (question.id === 'train-remove-only') {
    return [];
  }
  return nodes;
};

// ─────────────────────────────────────────────────────────────────────────────
// PREDICT PHASE — shown before assembly; user picks the expected outcome
// ─────────────────────────────────────────────────────────────────────────────

function MiniList({ values, showIndices = false }) {
  if (values.length === 0) {
    return <span className="text-gray-400 text-sm italic">Empty list</span>;
  }
  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        {values.map((v, i) => (
          <React.Fragment key={i}>
            <span className="w-8 h-8 rounded-full border-2 border-gray-300 bg-gray-50 flex items-center justify-center text-sm font-semibold text-gray-700">
              {v}
            </span>
            {i < values.length - 1 && (
              <span className="w-5 text-center text-gray-400 text-sm">→</span>
            )}
          </React.Fragment>
        ))}
        <span className="text-gray-400 text-xs ml-1">→ NULL</span>
      </div>
      {showIndices && (
        <div className="flex items-center gap-1">
          {values.map((_, i) => (
            <React.Fragment key={i}>
              <span className="w-8 flex items-center justify-center text-xs text-sky-500 font-bold font-mono">
                {i}
              </span>
              {i < values.length - 1 && <span className="w-5 invisible text-sm">→</span>}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function PredictPhase({ question, onContinue }) {
  const [selected, setSelected] = useState(null);
  const isCorrect = selected !== null && selected === question.prediction.correct;
  const initialValues = question.initialNodes.map(n => n.value);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center text-xl font-black">
          ?
        </div>
        <div>
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Predict First</p>
          <h2 className="text-2xl font-black text-gray-900">{question.title}</h2>
        </div>
      </div>

      {/* Task card */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
        <p className="text-gray-600 text-lg mb-4">{question.description}</p>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Starting list</p>
          <MiniList values={initialValues} showIndices />
        </div>
      </div>

      {/* Prediction question */}
      <p className="text-xl font-bold text-gray-800 mb-4">
        After the operation, what will the list look like?
      </p>

      <div className="flex flex-col gap-3 mb-6">
        {question.prediction.options.map((opt, i) => {
          const label = String.fromCharCode(65 + i);
          const isSelected = selected === i;
          const isThisCorrect = i === question.prediction.correct;

          let style = 'bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50 cursor-pointer';
          if (selected !== null) {
            if (isThisCorrect) style = 'bg-emerald-50 border-emerald-400';
            else if (isSelected) style = 'bg-red-50 border-red-300';
            else style = 'bg-white border-gray-200 opacity-50';
          }

          return (
            <button
              key={i}
              onClick={() => { if (selected === null) setSelected(i); }}
              disabled={selected !== null}
              className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-all ${style}`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                  selected !== null && isThisCorrect ? 'border-emerald-500 text-emerald-700' :
                  isSelected && !isThisCorrect      ? 'border-red-400 text-red-600' :
                                                      'border-gray-300 text-gray-500'
                }`}>
                  {selected !== null && isThisCorrect ? '✓' : isSelected && !isThisCorrect ? '✗' : label}
                </span>
                <MiniList values={opt} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Feedback + continue */}
      {selected !== null && (
        <div className={`rounded-2xl px-5 py-4 mb-5 border-2 ${
          isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-200'
        }`}>
          {isCorrect ? (
            <p className="text-lg font-bold text-emerald-700">
              ✅ Correct! Great mental model — now assemble the code that makes it happen.
            </p>
          ) : (
            <p className="text-lg font-bold text-red-700">
              ❌ Not quite. The correct answer is <span className="font-black">{String.fromCharCode(65 + question.prediction.correct)}</span>. Study it, then assemble the code to see why.
            </p>
          )}
        </div>
      )}

      {selected !== null && (
        <button
          onClick={onContinue}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 active:scale-95 transition-all shadow-md"
        >
          Assemble the Code <ChevronRight size={22} />
        </button>
      )}
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

// (ErrorFeedbackModal removed — errors shown inline below assembly area)

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
            {['Insert Tail','Remove Tail','Insert Pos','Remove Pos','Insert Empty','Remove Only'].map(label => (
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
  const [phase, setPhase]               = useState('predict'); // 'predict' | 'assemble'

  const q = TRAINING_QUESTIONS[qIndex];

  const [placedCount, setPlacedCount]   = useState(0);
  const [codePool, setCodePool]         = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [nodes, setNodes]               = useState([]);
  const [executed, setExecuted]         = useState(false);
  const [success, setSuccess]           = useState(false);
  const [inlineError, setInlineError]   = useState(null); // { wrongBlock, stepHint }
  const [draggedIdx, setDraggedIdx]     = useState(null);
  const [showHint, setShowHint]         = useState(false);
  const [assistCount, setAssistCount]   = useState(0);
  const [petMessage, setPetMessage]     = useState('');

  const timerRef      = useRef(null);
  const advancingRef  = useRef(false);
  const petMsgTimer   = useRef(null);

  const PET_WRONG_MSGS = [
    'Almost! Think about what comes next...',
    'Not this one — check the hint below!',
    'Keep trying, you\'re getting there!',
    'Peek at the hint and try again 👇',
  ];
  const PET_SUCCESS_MSGS = [
    'Amazing work! 🎉',
    'You nailed it! 🌟',
    'Perfect! Keep it up!',
    'Excellent execution! 🔥',
  ];

  const showPetMsg = useCallback((msg) => {
    if (petMsgTimer.current) clearTimeout(petMsgTimer.current);
    setPetMessage(msg);
    petMsgTimer.current = setTimeout(() => setPetMessage(''), 3000);
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────────
  const initQuestion = useCallback((index) => {
    const question = TRAINING_QUESTIONS[index];
    setNodes(JSON.parse(JSON.stringify(question.initialNodes)));
    setCodePool(shuffleArray(question.pseudocode.map((_, i) => i)));
    setAssemblyArea([]);
    setPlacedCount(0);
    setExecuted(false);
    setSuccess(false);
    setInlineError(null);
    setShowHint(false);
    setPetMessage('');
    setPhase('predict');
    advancingRef.current = false;
  }, []);

  useEffect(() => { initQuestion(qIndex); }, [qIndex, initQuestion]);

  const currentStepHint = placedCount < q.stepHints.length ? q.stepHints[placedCount] : null;

  // ── Block placement ────────────────────────────────────────────────────────
  const handleBlockClick = (poolIdx) => {
    if (executed) return;
    const blockIndex  = codePool[poolIdx];
    const validOrders = q.validOrders || [q.correctOrder];

    // A block is acceptable if it matches the next slot in at least one order
    // that is still consistent with what has already been placed.
    const isAcceptable = validOrders.some(order => {
      const prefixOk = assemblyArea.every((idx, pos) => order[pos] === idx);
      return prefixOk && order[placedCount] === blockIndex;
    });

    if (isAcceptable) {
      setAssemblyArea(prev => [...prev, blockIndex]);
      setCodePool(prev => prev.filter((_, i) => i !== poolIdx));
      setPlacedCount(prev => prev + 1);
      setInlineError(null);
    } else {
      setAssistCount(prev => prev + 1);
      setInlineError({
        wrongBlock: q.pseudocode[blockIndex],
        stepHint: q.stepHints[placedCount],
      });
      showPetMsg(PET_WRONG_MSGS[Math.floor(Math.random() * PET_WRONG_MSGS.length)]);
      addMistake({
        source:        'training',
        title:         q.title,
        yourAnswer:    q.pseudocode[blockIndex],
        correctAnswer: q.pseudocode[q.correctOrder[placedCount]],
        explanation:   q.stepHints[placedCount],
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
      showPetMsg(PET_SUCCESS_MSGS[Math.floor(Math.random() * PET_SUCCESS_MSGS.length)]);

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
  const currentValues = getCurrentPattern(nodes);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} timerRef={timerRef} assistCount={assistCount} xp={xp}
        title="Training · Practice" titleColor="text-amber-600" barColor="bg-violet-500"
      />

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

        {/* Predict phase */}
        {phase === 'predict' && (
          <PredictPhase question={q} onContinue={() => setPhase('assemble')} />
        )}

        {/* 3-column layout — assembly phase */}
        {phase === 'assemble' && <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

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
                  emptyLabel="Empty list"
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

            {/* Inline error — shown below assembly area */}
            {inlineError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span>❌</span>
                  <p className="font-bold text-red-700 text-lg">Not quite!</p>
                </div>
                <div className="bg-white border border-red-100 rounded-lg p-2.5 mb-2">
                  <p className="text-gray-400 text-xs mb-1">You placed:</p>
                  <p className="font-mono text-red-600 font-semibold text-lg">"{inlineError.wrongBlock}"</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                  <p className="text-gray-400 text-xs mb-1">Hint for this step:</p>
                  <p className="text-amber-800 text-lg">{inlineError.stepHint}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Col 3: Pet ── */}
          <GamePetCard mood={success ? 'happy' : inlineError ? 'sad' : 'idle'} xp={xp} theme="amber" hideable message={petMessage} />

        </div>}
      </div>

      {/* ── Modals ── */}
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

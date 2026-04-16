import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, RotateCcw, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { shuffleArray, getCurrentPattern } from '../utils/helpers';
import GameTopBar from './shared/GameTopBar';
import GamePetCard from './shared/GamePetCard';

// ─────────────────────────────────────────────────────────────────────────────
// DLL TRAINING QUESTION DEFINITIONS
// DLL node: { id, value, next, prev }
// Every pseudocode step must maintain BOTH next AND prev.
// ─────────────────────────────────────────────────────────────────────────────

const TRAINING_QUESTIONS = [
  {
    id:    'dll-train-insert-tail',
    level: 1,
    title: 'DLL Insert at Tail',
    description: 'Insert the value 4 at the end of [1 ⇄ 2 ⇄ 3]. Wire both newNode.prev and node.next.',
    initialNodes: [
      { id: 1, value: 1, next: 2,    prev: null },
      { id: 2, value: 2, next: 3,    prev: 1    },
      { id: 3, value: 3, next: null, prev: 2    },
    ],
    goalPattern: [1, 2, 3, 4],
    pseudocode: [
      'node = head',
      'while (node.next != NULL): node = node.next',
      'create newNode',
      'newNode.prev = node',
      'newNode.next = NULL',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5],
    validOrders: [
      [0, 1, 2, 3, 4, 5],   // node=head, while, create, ...
      [0, 2, 1, 3, 4, 5],   // node=head, create, while, ...
      [2, 0, 1, 3, 4, 5],   // create, node=head, while, ...
    ],
    stepHints: [
      'Set node = head to initialize the traversal pointer. Creating newNode first is also valid — those two are independent.',
      'Traverse to the tail: advance while node.next != NULL. Create newNode first if you prefer.',
      'Create the new node. (Run the while loop first if not done yet.)',
      'Wire newNode\'s backward link — its predecessor is the current tail (node).',
      'The new tail has no successor — set newNode.next to NULL.',
      'Connect the old tail forward to newNode, completing the insertion.',
    ],
  },
  {
    id:    'dll-train-remove-tail',
    level: 1,
    title: 'DLL Remove at Tail',
    description: 'Remove the last node from [1 ⇄ 2 ⇄ 3]. Use node.prev.next to disconnect cleanly.',
    initialNodes: [
      { id: 1, value: 1, next: 2,    prev: null },
      { id: 2, value: 2, next: 3,    prev: 1    },
      { id: 3, value: 3, next: null, prev: 2    },
    ],
    goalPattern: [1, 2],
    pseudocode: [
      'node = head',
      'while (node.next != NULL): node = node.next',
      'temp = node',
      'node.prev.next = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    stepHints: [
      'Set node = head to initialize the traversal pointer.',
      'Traverse to the tail — stop when node.next is NULL.',
      'Save the tail in temp so you can free it after unlinking.',
      'Reach back through node.prev to the predecessor and cut its forward link (set next = NULL).',
      'Free the saved tail node to release its memory.',
    ],
  },
  {
    id:    'dll-train-insert-position',
    level: 2,
    title: 'DLL Insert at Position',
    description: 'Insert 99 at position 3 in [1 ⇄ 2 ⇄ 3 ⇄ 4 ⇄ 5]. Update four pointer fields.',
    initialNodes: [
      { id: 1, value: 1, next: 2,    prev: null },
      { id: 2, value: 2, next: 3,    prev: 1    },
      { id: 3, value: 3, next: 4,    prev: 2    },
      { id: 4, value: 4, next: 5,    prev: 3    },
      { id: 5, value: 5, next: null, prev: 4    },
    ],
    goalPattern: [1, 2, 99, 3, 4, 5],
    pseudocode: [
      'node = head',
      'i = 0',
      'while (i < 2): node = node.next',
      'create newNode',
      'newNode.next = node.next',
      'newNode.prev = node',
      'node.next.prev = newNode',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6, 7],
    validOrders: [
      [0, 1, 2, 3, 4, 5, 6, 7],   // node=head, i=0, while, create, ...
      [1, 0, 2, 3, 4, 5, 6, 7],   // i=0, node=head, while, create, ...
      [0, 1, 3, 2, 4, 5, 6, 7],   // node=head, i=0, create, while, ...
      [1, 0, 3, 2, 4, 5, 6, 7],   // i=0, node=head, create, while, ...
      [3, 0, 1, 2, 4, 5, 6, 7],   // create, node=head, i=0, while, ...
      [3, 1, 0, 2, 4, 5, 6, 7],   // create, i=0, node=head, while, ...
    ],
    stepHints: [
      'Set node = head and i = 0 to initialize — these two can go in either order, or create newNode first.',
      'Set i = 0 and node = head — order between these two does not matter.',
      'Traverse to position 2: advance while i < 2. Creating newNode beforehand is also fine.',
      'Create the new node. (Run the while loop first if not done yet.)',
      'Link newNode forward to the successor (node.next) first — do this before relinking node.next.',
      'Link newNode backward to its predecessor (node).',
      'Update the successor\'s prev to point back to newNode.',
      'Connect the predecessor\'s next to newNode, completing the insertion.',
    ],
  },
  {
    id:    'dll-train-remove-position',
    level: 2,
    title: 'DLL Remove at Position',
    description: 'Remove the node at position 3 from [1 ⇄ 2 ⇄ 3 ⇄ 4 ⇄ 5]. Bypass in both directions.',
    initialNodes: [
      { id: 1, value: 1, next: 2,    prev: null },
      { id: 2, value: 2, next: 3,    prev: 1    },
      { id: 3, value: 3, next: 4,    prev: 2    },
      { id: 4, value: 4, next: 5,    prev: 3    },
      { id: 5, value: 5, next: null, prev: 4    },
    ],
    goalPattern: [1, 2, 4, 5],
    pseudocode: [
      'node = head',
      'i = 0',
      'while (i < 2): node = node.next',
      'temp = node.next',
      'node.next = temp.next',
      'temp.next.prev = node',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6],
    validOrders: [
      [0, 1, 2, 3, 4, 5, 6],   // node=head, i=0, while, ...
      [1, 0, 2, 3, 4, 5, 6],   // i=0, node=head, while, ...
    ],
    stepHints: [
      'Set node = head to initialize the traversal pointer. (i = 0 can come first too.)',
      'Set i = 0. (node = head can come first too — these two are interchangeable.)',
      'Traverse to position 2: advance while i < 2.',
      'Save the target (node.next) in temp before relinking.',
      'Bypass the target forward — node.next now points to temp\'s successor.',
      'Bypass the target backward — the successor\'s prev now points back to node.',
      'Free the saved target node to release its memory.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OPERATION EXECUTORS
// ─────────────────────────────────────────────────────────────────────────────

const executeOperation = (q, nodes) => {
  let ns = nodes.map(n => ({ ...n }));

  if (q.id === 'dll-train-insert-tail') {
    const newId = Math.max(...ns.map(n => n.id)) + 1;
    const tail  = ns.find(n => n.next === null);
    ns = ns.map(n => n.id === tail?.id ? { ...n, next: newId } : n);
    ns = [...ns, { id: newId, value: 4, next: null, prev: tail?.id ?? null }];
  }

  else if (q.id === 'dll-train-remove-tail') {
    const tail = ns.find(n => n.next === null);
    const pred = ns.find(n => n.id === tail?.prev);
    ns = ns.filter(n => n.id !== tail?.id);
    ns = ns.map(n => n.id === pred?.id ? { ...n, next: null } : n);
  }

  else if (q.id === 'dll-train-insert-position') {
    // Insert 99 between id=2 (value=2) and id=3 (value=3)
    const newId = Math.max(...ns.map(n => n.id)) + 1;
    const pred  = ns.find(n => n.id === 2); // position 2
    const succ  = ns.find(n => n.id === pred?.next);
    ns = ns.map(n => {
      if (n.id === pred?.id) return { ...n, next: newId };
      if (n.id === succ?.id) return { ...n, prev: newId };
      return n;
    });
    ns = [...ns, { id: newId, value: 99, next: succ?.id ?? null, prev: pred?.id ?? null }];
  }

  else if (q.id === 'dll-train-remove-position') {
    // Remove node at position 3 (id=3, value=3)
    const target = ns.find(n => n.id === 3);
    const pred   = ns.find(n => n.id === target?.prev);
    const succ   = ns.find(n => n.id === target?.next);
    ns = ns.filter(n => n.id !== target?.id);
    ns = ns.map(n => {
      if (n.id === pred?.id) return { ...n, next: succ?.id ?? null };
      if (n.id === succ?.id) return { ...n, prev: pred?.id ?? null };
      return n;
    });
  }

  return ns;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_DIFFICULTY = { 1: 'Beginner', 2: 'Intermediate' };

// ─────────────────────────────────────────────────────────────────────────────
// DLL VISUALISER
// ─────────────────────────────────────────────────────────────────────────────

function DLLVisualiser({ nodes, highlight = false, goalColor = false }) {
  const values = getCurrentPattern(nodes);
  if (values.length === 0) return <span className="text-gray-400 text-lg italic">Empty list</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
      <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
      {values.map((v, i) => (
        <React.Fragment key={i}>
          <span className="text-pink-400 text-base font-bold shrink-0">⇄</span>
          <div className={`shrink-0 rounded-lg border-2 px-3 py-2 text-center transition-all ${
            highlight    ? 'bg-emerald-50 border-emerald-400 text-emerald-800' :
            goalColor    ? 'bg-amber-50 border-amber-300 text-amber-800' :
                           'bg-pink-50 border-pink-300 text-pink-800'
          }`}>
            <div className="font-bold text-lg leading-none">{v}</div>
          </div>
          {i === values.length - 1 && <span className="text-pink-400 text-base font-bold shrink-0">⇄</span>}
        </React.Fragment>
      ))}
      <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEST NAV
// ─────────────────────────────────────────────────────────────────────────────

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
            <div key={q.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
              isActive ? 'bg-pink-50 border-pink-200' :
              isDone   ? 'bg-emerald-50 border-emerald-100' :
                         'bg-transparent border-transparent'
            }`}>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                isDone   ? 'bg-emerald-100 border border-emerald-300' :
                isActive ? 'bg-pink-100 border border-pink-300' :
                           'bg-gray-100 border border-gray-200'
              }`}>
                <div className={`w-2 h-2 rounded-sm ${
                  isDone ? 'bg-emerald-500' : isActive ? 'bg-pink-500' : 'bg-gray-300'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-medium truncate ${
                  isActive ? 'text-pink-800' : isDone ? 'text-emerald-700' : 'text-gray-400'
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
// ERROR MODAL
// ─────────────────────────────────────────────────────────────────────────────

function ErrorFeedbackModal({ isOpen, wrongBlock, stepHint, onDismiss }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-white border border-red-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-rose-500" />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">❌</span>
            <h3 className="text-lg font-bold text-gray-900">Not quite!</h3>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-3">
            <p className="text-gray-400 text-xs mb-1">You placed:</p>
            <p className="font-mono text-red-600 font-semibold text-sm">"{wrongBlock}"</p>
          </div>
          <div className="bg-pink-50 border border-pink-100 rounded-lg p-3 mb-5">
            <p className="text-gray-400 text-xs mb-1">Hint for this step:</p>
            <p className="text-pink-800 text-sm">{stepHint}</p>
          </div>
          <button onClick={onDismiss} className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-red-500 to-rose-500 hover:opacity-90 active:scale-95 transition-all">
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function DLLTrainingCompleteModal({ isOpen, onChallenge, onReplay, onBack }) {
  const [showStars, setShowStars] = React.useState(false);
  React.useEffect(() => {
    if (isOpen) { const t = setTimeout(() => setShowStars(true), 200); return () => clearTimeout(t); }
    else setShowStars(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-pink-400 to-rose-500" />
        <div className="px-8 py-10 flex flex-col items-center text-center">

          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center mb-6 shadow-xl">
            <span className="text-6xl">💪</span>
          </div>

          <h2 className="text-4xl font-black text-gray-900 mb-1">DLL Training Complete!</h2>
          <p className="text-gray-400 text-xl mb-8">You've mastered prev pointers — go solo! 🔥</p>

          <div className="flex items-center justify-center gap-3 mb-8">
            {[0, 1, 2].map(i => (
              <span key={i} className="text-5xl transition-all duration-500" style={{
                opacity: showStars ? 1 : 0,
                transform: showStars ? 'scale(1) rotate(0deg)' : 'scale(0.3) rotate(-30deg)',
                transitionDelay: `${i * 150}ms`,
              }}>⭐</span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {['Insert Tail','Remove Tail','Insert Pos','Remove Pos'].map(label => (
              <div key={label} className="flex items-center gap-1.5 bg-pink-50 border border-pink-200 text-pink-700 text-base font-semibold px-3 py-1.5 rounded-full">
                ✅ {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button onClick={onChallenge} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-90 active:scale-95 transition-all shadow-lg">
              DLL Challenge <ChevronRight size={22} />
            </button>
            <button onClick={onReplay} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-lg border border-gray-200">
              <RotateCcw size={17} /> Replay
            </button>
            <button onClick={onBack} className="w-full py-2 rounded-2xl font-medium text-gray-400 hover:text-gray-600 transition-colors text-base">
              Back to Mode Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

export default function DLLTrainingGame({ onBack, onGoChallenge, xp = 0 }) {
  const [showComplete, setShowComplete] = useState(false);
  const [qIndex, setQIndex]             = useState(0);
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

  // ── Block placement (click or drag) ────────────────────────────────────────
  const handleBlockClick = (poolIdx) => {
    if (executed) return;
    const blockIndex  = codePool[poolIdx];
    const validOrders = q.validOrders || [q.correctOrder];

    const isAcceptable = validOrders.some(order => {
      const prefixOk = assemblyArea.every((idx, pos) => order[pos] === idx);
      return prefixOk && order[placedCount] === blockIndex;
    });

    if (isAcceptable) {
      setAssemblyArea(prev => [...prev, blockIndex]);
      setCodePool(prev => prev.filter((_, i) => i !== poolIdx));
      setPlacedCount(prev => prev + 1);
    } else {
      setAssistCount(prev => prev + 1);
      setErrorModal({ open: true, wrongBlock: q.pseudocode[blockIndex], stepHint: q.stepHints[placedCount] });
    }
  };

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

  const handleReset = () => initQuestion(qIndex);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} timerRef={timerRef} assistCount={assistCount} xp={xp}
        title="DLL Training · Practice" titleColor="text-pink-600" barColor="bg-pink-500"
      />

      <div className="max-w-7xl mx-auto p-5">

        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg">🎉</span>
            <p className="text-emerald-700 font-semibold text-xl">
              {qIndex < TRAINING_QUESTIONS.length - 1
                ? 'Well done! Loading next exercise…'
                : 'Excellent! DLL Training complete!'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

          {/* ── Col 1: Nav + Quest info ── */}
          <div className="flex flex-col gap-4">
            <QuestNav questions={TRAINING_QUESTIONS} currentIndex={qIndex} completedSet={completedSet} />

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl font-semibold text-gray-900">{q.title}</h2>
                <span className={`text-lg px-3 py-1 rounded-full font-medium border ${
                  q.level === 1
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {LEVEL_DIFFICULTY[q.level]}
                </span>
              </div>
              <p className="text-gray-500 text-lg mb-3">{q.description}</p>

              {/* Current state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Current state</p>
                <DLLVisualiser nodes={nodes} highlight={success} />
              </div>

              {/* Goal state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Goal state</p>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
                  {q.goalPattern.map((v, i) => (
                    <React.Fragment key={i}>
                      <span className="text-pink-300 text-base font-bold shrink-0">⇄</span>
                      <div className="shrink-0 rounded-lg border-2 px-3 py-2 text-center bg-amber-50 border-amber-300 text-amber-800">
                        <div className="font-bold text-lg leading-none">{v}</div>
                      </div>
                      {i === q.goalPattern.length - 1 && <span className="text-pink-300 text-base font-bold shrink-0">⇄</span>}
                    </React.Fragment>
                  ))}
                  <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
                </div>
              </div>

              {/* Show Hint toggle */}
              {currentStepHint && !executed && (
                <div>
                  <button
                    onClick={() => {
                      if (!showHint) setAssistCount(prev => prev + 1);
                      setShowHint(prev => !prev);
                    }}
                    className="flex items-center gap-2 text-lg font-semibold text-pink-600 hover:text-pink-800 transition-colors mb-2"
                  >
                    {showHint ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showHint ? 'Hide Hint' : 'Show Hint'}
                  </button>
                  {showHint && (
                    <div className="bg-pink-50 border border-pink-200 rounded-lg p-2.5 flex items-start gap-2">
                      <Lightbulb size={14} className="text-pink-600 shrink-0 mt-0.5" />
                      <p className="text-pink-700 text-lg leading-relaxed">{currentStepHint}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 2: Code Pool + Assembly ── */}
          <div className="flex flex-col gap-4">

            {/* Code Pool */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-gray-400 text-lg font-semibold mb-3 uppercase tracking-wide">Code Pool</p>
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
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:bg-pink-50 hover:border-pink-200 transition-all group select-none"
                    >
                      <span className="text-gray-300 group-hover:text-pink-400 transition-colors text-xl">⠿</span>
                      <span className="font-mono text-xl text-gray-700">{q.pseudocode[blockIndex]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assembly Area */}
            <div
              className={`bg-white rounded-xl border-2 border-dashed min-h-36 p-4 transition-colors ${
                draggedIdx !== null ? 'border-pink-300 bg-pink-50/30' : 'border-gray-200'
              }`}
              onDrop={handleDropOnArea}
              onDragOver={handleDragOver}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-lg font-semibold uppercase tracking-wide">Assembly Area</p>
                {!executed && assemblyArea.length > 0 && (
                  <button onClick={handleReset} className="flex items-center gap-1 text-lg text-gray-400 hover:text-gray-700 transition-colors">
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
                    <div key={`placed-${pos}`} className="flex items-center gap-2 px-4 py-2.5 bg-pink-50 border border-pink-200 rounded-lg select-none">
                      <span className="text-pink-500 text-lg font-bold w-7">{pos + 1}.</span>
                      <span className="font-mono text-xl text-gray-700">{q.pseudocode[blockIndex]}</span>
                      <span className="ml-auto text-pink-500 text-xl">✓</span>
                    </div>
                  ))}
                  {!executed && (
                    <div className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-pink-200 rounded-lg text-pink-400 text-sm italic">
                      <span className="text-lg font-bold w-7">{assemblyArea.length + 1}.</span>
                      drop next block here…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 3: Pet ── */}
          <GamePetCard mood={success ? 'happy' : errorModal.open ? 'sad' : 'idle'} xp={xp} theme="pink" />

        </div>
      </div>

      <ErrorFeedbackModal
        isOpen={errorModal.open}
        wrongBlock={errorModal.wrongBlock}
        stepHint={errorModal.stepHint}
        onDismiss={() => setErrorModal({ open: false, wrongBlock: '', stepHint: '' })}
      />

      <DLLTrainingCompleteModal
        isOpen={showComplete}
        onChallenge={onGoChallenge}
        onReplay={() => { setShowComplete(false); setQIndex(0); setAssistCount(0); setCompletedSet(new Set()); }}
        onBack={onBack}
      />
    </div>
  );
}

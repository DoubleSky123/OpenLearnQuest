import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, ChevronRight } from 'lucide-react';
import { getCurrentPattern } from '../utils/helpers';
import DLLTutorialCompleteModal from './DLLTutorialCompleteModal';
import GameTopBar from './shared/GameTopBar';
import GamePetCard from './shared/GamePetCard';

// ─────────────────────────────────────────────────────────────────────────────
// DLL TUTORIAL QUESTIONS  — fill-in-the-blank
//
// DLL node shape: { id, value, next, prev }
// ─────────────────────────────────────────────────────────────────────────────

const TUTORIAL_QUESTIONS = [
  {
    id:          'dll-tut-insert-head',
    title:       'DLL Insert at Head',
    description: 'Insert the value 0 at the beginning of [1 ⇄ 2 ⇄ 3]. Remember: you must wire BOTH next and prev.',
    initialNodes: [
      { id: 1, value: 1, next: 2,    prev: null },
      { id: 2, value: 2, next: 3,    prev: 1    },
      { id: 3, value: 3, next: null, prev: 2    },
    ],
    goalPattern: [0, 1, 2, 3],
    lines: [
      {
        template: 'create ___',
        answer:   'newNode',
        options:  ['newNode', 'temp', 'head'],
        hint:     'Allocate a new node to hold the value 0.',
      },
      {
        template: 'newNode.next = ___',
        answer:   'head',
        options:  ['head', 'NULL', 'newNode'],
        hint:     'Link newNode forward to the current head — this preserves the rest of the list.',
      },
      {
        template: 'newNode.prev = ___',
        answer:   'NULL',
        options:  ['NULL', 'head', 'newNode'],
        hint:     'newNode becomes the new head, so it has no predecessor — prev must be NULL.',
      },
      {
        template: 'head.prev = ___',
        answer:   'newNode',
        options:  ['newNode', 'NULL', 'head'],
        hint:     'The old head now has a predecessor. Point its prev back to newNode to complete the backward link.',
      },
      {
        template: 'head = ___',
        answer:   'newNode',
        options:  ['newNode', 'NULL', 'head'],
        hint:     'Finally, move the head pointer to newNode — it is now the first node.',
      },
    ],
  },
  {
    id:          'dll-tut-remove-head',
    title:       'DLL Remove at Head',
    description: 'Remove the first node from [1 ⇄ 2 ⇄ 3]. After removal the new head must have prev = NULL.',
    initialNodes: [
      { id: 1, value: 1, next: 2,    prev: null },
      { id: 2, value: 2, next: 3,    prev: 1    },
      { id: 3, value: 3, next: null, prev: 2    },
    ],
    goalPattern: [2, 3],
    lines: [
      {
        template: '___ = head',
        answer:   'temp',
        options:  ['temp', 'newNode', 'head'],
        hint:     'Save the current head in a temporary variable so you can free it later.',
      },
      {
        template: 'head = head.___',
        answer:   'next',
        options:  ['next', 'prev', 'value'],
        hint:     'Advance head to the second node by following its next pointer.',
      },
      {
        template: 'head.___ = NULL',
        answer:   'prev',
        options:  ['prev', 'next', 'value'],
        hint:     'The new head has no predecessor — set its prev to NULL to fix the backward chain.',
      },
      {
        template: 'free(___)',
        answer:   'temp',
        options:  ['temp', 'head', 'newNode'],
        hint:     'Release the old head node you saved in temp to free its memory.',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const applyDLLInsertAtHead = (nodes, value) => {
  const newId  = Math.max(...nodes.map(n => n.id), 0) + 1;
  const allIds = new Set(nodes.map(n => n.id));
  const ptdIds = new Set(nodes.map(n => n.next).filter(Boolean));
  const headId = [...allIds].find(id => !ptdIds.has(id)) ?? null;
  const updated = nodes.map(n => n.id === headId ? { ...n, prev: newId } : n);
  return [{ id: newId, value, next: headId, prev: null }, ...updated];
};

const applyDLLRemoveAtHead = (nodes) => {
  const allIds = new Set(nodes.map(n => n.id));
  const ptdIds = new Set(nodes.map(n => n.next).filter(Boolean));
  const headId = [...allIds].find(id => !ptdIds.has(id)) ?? null;
  const head   = nodes.find(n => n.id === headId);
  const rest   = nodes.filter(n => n.id !== headId);
  return rest.map(n => n.id === head?.next ? { ...n, prev: null } : n);
};

const applyOperation = (q, nodes) => {
  if (q.id === 'dll-tut-insert-head') return applyDLLInsertAtHead(nodes, 0);
  if (q.id === 'dll-tut-remove-head') return applyDLLRemoveAtHead(nodes);
  return nodes;
};

// ─────────────────────────────────────────────────────────────────────────────
// DLL VISUALISER
// ─────────────────────────────────────────────────────────────────────────────

function DLLVisualiser({ nodes, highlight = false, emptyLabel = 'Empty list' }) {
  const values = getCurrentPattern(nodes);
  if (values.length === 0) return <span className="text-gray-400 text-lg italic">{emptyLabel}</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
      <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
      {values.map((v, i) => (
        <React.Fragment key={i}>
          <span className="text-pink-400 text-base font-bold shrink-0">⇄</span>
          <div className={`shrink-0 rounded-lg border-2 px-3 py-2 text-center transition-all ${
            highlight
              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
              : 'bg-pink-50 border-pink-300 text-pink-800'
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
                  {isDone ? 'Completed' : isActive ? 'In progress' : 'Not started'}
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

function ErrorModal({ isOpen, wrongWord, hint, onDismiss }) {
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
            <p className="text-gray-400 text-xs mb-1">You chose:</p>
            <p className="font-mono text-red-600 font-semibold text-sm">"{wrongWord}"</p>
          </div>
          <div className="bg-pink-50 border border-pink-100 rounded-lg p-3 mb-5">
            <p className="text-gray-400 text-xs mb-1">Hint:</p>
            <p className="text-pink-800 text-sm">{hint}</p>
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
// CODE LINE
// ─────────────────────────────────────────────────────────────────────────────

function CodeLine({ line, filledWord, isActive, isComplete }) {
  const parts = line.template.split('___');
  const containerClass = [
    'flex-1 flex items-center px-3 py-2 rounded-lg border font-mono text-xl transition-all',
    isComplete  ? 'bg-emerald-50 border-emerald-200' :
    isActive    ? 'bg-pink-50 border-pink-300 ring-1 ring-pink-200' :
    filledWord  ? 'bg-emerald-50 border-emerald-200' :
                  'bg-gray-50 border-gray-200 opacity-50',
  ].join(' ');

  return (
    <div className={containerClass}>
      <span className={isComplete || filledWord ? 'text-gray-700' : isActive ? 'text-gray-700' : 'text-gray-400'}>
        {parts[0]}
      </span>
      {filledWord ? (
        <span className="mx-0.5 px-1.5 py-0 rounded bg-pink-200 text-pink-900 font-bold">
          {filledWord}
        </span>
      ) : (
        <span className={[
          'mx-0.5 px-2 py-0.5 rounded border-b-2 font-bold tracking-widest text-xs',
          isActive ? 'border-pink-400 text-pink-400 animate-pulse bg-pink-50' : 'border-gray-300 text-gray-300 bg-transparent',
        ].join(' ')}>___</span>
      )}
      <span className={isComplete || filledWord ? 'text-gray-700' : isActive ? 'text-gray-700' : 'text-gray-400'}>
        {parts[1]}
      </span>
      {filledWord && <span className="ml-auto text-emerald-500 text-xs">✓</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

export default function DLLTutorialGame({ onBack, onGoTraining, startAt = 0, xp = 0 }) {
  const [showComplete, setShowComplete] = useState(false);
  const [qIndex, setQIndex]             = useState(startAt);
  const [completedSet, setCompletedSet] = useState(new Set());

  const q = TUTORIAL_QUESTIONS[qIndex];

  const [filledAnswers, setFilledAnswers] = useState(() => q.lines.map(() => null));
  const [nodes, setNodes]                 = useState(() => JSON.parse(JSON.stringify(q.initialNodes)));
  const [executed, setExecuted]           = useState(false);
  const [success, setSuccess]             = useState(false);
  const [errorModal, setErrorModal]       = useState({ open: false, wrongWord: '', hint: '' });

  const timerRef     = useRef(null);
  const advancingRef = useRef(false);

  const activeBlankIdx = filledAnswers.findIndex(a => a === null);
  const allFilled      = activeBlankIdx === -1;

  const initQuestion = useCallback((index) => {
    const question = TUTORIAL_QUESTIONS[index];
    setNodes(JSON.parse(JSON.stringify(question.initialNodes)));
    setFilledAnswers(question.lines.map(() => null));
    setExecuted(false);
    setSuccess(false);
    advancingRef.current = false;
  }, []);

  useEffect(() => { initQuestion(qIndex); }, [qIndex, initQuestion]);

  // Execute when all blanks filled
  useEffect(() => {
    if (!allFilled || executed || advancingRef.current) return;
    advancingRef.current = true;
    setExecuted(true);

    setTimeout(() => {
      const newNodes = applyOperation(q, nodes);
      setNodes(newNodes);
      setSuccess(true);
      setCompletedSet(prev => new Set([...prev, qIndex]));

      setTimeout(() => {
        if (qIndex < TUTORIAL_QUESTIONS.length - 1) {
          setQIndex(prev => prev + 1);
        } else {
          timerRef.current?.stop();
          setShowComplete(true);
        }
      }, 1800);
    }, 600);
  }, [allFilled]); // eslint-disable-line

  const handleOptionClick = (word) => {
    if (executed || activeBlankIdx < 0) return;
    const line = q.lines[activeBlankIdx];
    if (word === line.answer) {
      setFilledAnswers(prev => {
        const next = [...prev];
        next[activeBlankIdx] = word;
        return next;
      });
    } else {
      setErrorModal({ open: true, wrongWord: word, hint: line.hint });
    }
  };

  const currentValues = getCurrentPattern(nodes);
  const activeHint    = activeBlankIdx >= 0 ? q.lines[activeBlankIdx].hint : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} timerRef={timerRef} xp={xp}
        title="DLL Tutorial · Guided" titleColor="text-pink-600" barColor="bg-pink-500"
      />

      <div className="max-w-7xl mx-auto p-5">

        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg">🎉</span>
            <p className="text-emerald-700 font-semibold text-xl">
              {qIndex < TUTORIAL_QUESTIONS.length - 1
                ? 'Great job! Loading next exercise…'
                : 'Excellent! DLL Tutorial complete!'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

          {/* Col 1 */}
          <div className="flex flex-col gap-4">
            <QuestNav questions={TUTORIAL_QUESTIONS} currentIndex={qIndex} completedSet={completedSet} />

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl font-semibold text-gray-900">{q.title}</h2>
                <span className="text-lg px-3 py-1 rounded-full font-medium border bg-pink-50 text-pink-700 border-pink-200">
                  Guided
                </span>
              </div>
              <p className="text-gray-500 text-lg mb-3">{q.description}</p>

              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Current state</p>
                <DLLVisualiser nodes={nodes} highlight={success} />
              </div>

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

              {activeHint && !executed && (
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-2.5 flex items-start gap-2">
                  <Lightbulb size={14} className="text-pink-600 shrink-0 mt-0.5" />
                  <p className="text-pink-700 text-lg leading-relaxed">{activeHint}</p>
                </div>
              )}
            </div>
          </div>

          {/* Col 2 */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-gray-400 text-lg font-mono">pseudocode — fill in the blanks</span>
              </div>
              <div className="p-4 flex flex-col gap-2">
                {q.lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-gray-300 font-mono text-lg w-6 shrink-0 text-right">{idx + 1}</span>
                    <CodeLine
                      line={line}
                      filledWord={filledAnswers[idx]}
                      isActive={!executed && idx === activeBlankIdx}
                      isComplete={success}
                    />
                  </div>
                ))}
              </div>
            </div>

            {!executed && activeBlankIdx >= 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-gray-400 text-lg font-semibold mb-3 uppercase tracking-wide">
                  Fill in blank {activeBlankIdx + 1} — choose the correct word:
                </p>
                <div className="flex flex-wrap gap-2">
                  {q.lines[activeBlankIdx].options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleOptionClick(opt)}
                      className="px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xl text-gray-700 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-800 active:scale-95 transition-all font-semibold"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {executed && !success && (
              <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 text-center">
                <p className="text-pink-700 text-xl font-medium">Executing operation…</p>
              </div>
            )}
          </div>

          {/* Col 3 */}
          <GamePetCard mood={success ? 'happy' : errorModal.open ? 'sad' : 'idle'} xp={xp} theme="pink" />

        </div>
      </div>

      <ErrorModal
        isOpen={errorModal.open}
        wrongWord={errorModal.wrongWord}
        hint={errorModal.hint}
        onDismiss={() => setErrorModal({ open: false, wrongWord: '', hint: '' })}
      />

      <DLLTutorialCompleteModal
        isOpen={showComplete}
        onTraining={onGoTraining}
        onReplay={() => { setShowComplete(false); setQIndex(0); setCompletedSet(new Set()); }}
        onBack={onBack}
      />
    </div>
  );
}
